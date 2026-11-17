import crypto from "node:crypto";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { scrips } from "@/db/schema";
import { applyOverride, getInstrument, INSTRUMENTS, type Instrument, type ScripOverride } from "./instruments";
import { audit, setSetting } from "./settings";

export const ANGEL_MASTER_URL = "https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json";

let cache: { at: number; map: Map<string, ScripOverride> } | null = null;

export async function loadOverrides(force = false): Promise<Map<string, ScripOverride>> {
  if (!force && cache && Date.now() - cache.at < 60_000) return cache.map;
  const rows = await db.select().from(scrips);
  const map = new Map<string, ScripOverride>();
  for (const r of rows) {
    if (r.exchange === "NSE") continue; // NSE cash tokens are static & verified, not overridden
    map.set(r.symbol, { tradingSymbol: r.tradingSymbol, token: r.token, lotSize: r.lotSize, expiry: r.expiry });
  }
  cache = { at: Date.now(), map };
  return map;
}

export async function resolveInstrument(symbol: string): Promise<Instrument | undefined> {
  const inst = getInstrument(symbol);
  if (!inst) return undefined;
  const o = await loadOverrides();
  return applyOverride(inst, o.get(inst.symbol));
}

export async function resolveAll(): Promise<Instrument[]> {
  const o = await loadOverrides();
  return INSTRUMENTS.map((i) => applyOverride(i, o.get(i.symbol)));
}

const MONTHS: Record<string, number> = {
  JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
};

function parseExpiry(s: string): number {
  const m = /^(\d{1,2})([A-Z]{3})(\d{4})$/.exec(s.toUpperCase());
  if (!m) return Number.POSITIVE_INFINITY;
  return Date.UTC(Number(m[3]), MONTHS[m[2]] ?? 0, Number(m[1]));
}

type AngelRow = {
  token: string;
  symbol: string;
  name: string;
  expiry: string;
  lotsize: string;
  instrumenttype: string;
  exch_seg: string;
};

const FUT_TARGETS: Record<string, { seg: string; type: string }> = {
  NIFTY: { seg: "NFO", type: "FUTIDX" },
  BANKNIFTY: { seg: "NFO", type: "FUTIDX" },
  GOLD: { seg: "MCX", type: "FUTCOM" },
  SILVER: { seg: "MCX", type: "FUTCOM" },
  CRUDEOIL: { seg: "MCX", type: "FUTCOM" },
  GOLDM: { seg: "MCX", type: "FUTCOM" },
  SILVERM: { seg: "MCX", type: "FUTCOM" },
};

/**
 * Daily scrip ingestion (08:45 IST via scheduler or on demand): downloads Angel One's
 * OpenAPIScripMaster.json, keeps the tracked NSE cash tokens plus nearest-expiry NFO / MCX
 * futures, and caches them for cross-broker symbol normalisation.
 */
export async function ingestScripMaster(): Promise<{ ok: boolean; rows: number; source: string; error?: string }> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 90_000);
  try {
    const res = await fetch(ANGEL_MASTER_URL, { signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) throw new Error(`Master download failed: HTTP ${res.status}`);
    const all = (await res.json()) as AngelRow[];
    const out: (typeof scrips.$inferInsert)[] = [];
    const eqNames = new Set(INSTRUMENTS.filter((i) => i.kind === "EQ").map((i) => i.symbol));
    const now = Date.now() - 86_400_000;

    for (const r of all) {
      if (r.exch_seg === "NSE" && r.symbol.endsWith("-EQ") && eqNames.has(r.name)) {
        out.push({ exchange: "NSE", symbol: r.name, tradingSymbol: r.symbol, token: r.token, lotSize: 1, instrumentType: "EQ" });
      }
    }
    for (const [name, t] of Object.entries(FUT_TARGETS)) {
      const cands = all
        .filter((r) => r.exch_seg === t.seg && r.instrumenttype === t.type && r.name === name && parseExpiry(r.expiry) >= now)
        .sort((a, b) => parseExpiry(a.expiry) - parseExpiry(b.expiry));
      const pick = cands[0];
      if (pick) {
        out.push({
          exchange: t.seg,
          symbol: name,
          tradingSymbol: pick.symbol,
          token: pick.token,
          expiry: pick.expiry,
          lotSize: Number(pick.lotsize) || 1,
          instrumentType: t.type,
        });
      }
    }
    if (out.length === 0) throw new Error("Master parsed but no tracked scrips matched");
    await db.execute(sql`delete from scrips`);
    await db.insert(scrips).values(out);
    cache = null;
    await setSetting("tokenMaster", { at: new Date().toISOString(), rows: out.length, source: "AngelOne OpenAPIScripMaster.json" });
    await audit("INFO", "TOKEN_MASTER", `Scrip master ingested: ${out.length} tracked contracts`, { rows: out.length });
    return { ok: true, rows: out.length, source: "AngelOne OpenAPIScripMaster.json" };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await audit("WARN", "TOKEN_MASTER", `Scrip master ingestion failed - using static fallback tokens: ${error}`);
    return { ok: false, rows: 0, source: "static-fallback", error };
  } finally {
    clearTimeout(timer);
  }
}

export function fingerprint(s: string) {
  return crypto.createHash("sha256").update(s).digest("hex");
}
