/** Offline, long-only research prototype. NOT live execution or an evidenced tariff. */
import { createHash } from "crypto";

export type Bar = { t: number; o: number; h: number; l: number; c: number; v: number };
export type DeliveryRates = {
  sttBuy: number; sttSell: number; exchange: number; sebi: number; stampBuy: number;
  gst: number; dpPerScripSellDay: number; brokeragePerOrder: number;
  /** Dated tariff identifier supplied by researcher; not independently verified. */
  evidence: string;
};
export type Charges = { stt: number; exchange: number; sebi: number; stamp: number; dp: number; brokerage: number; gst: number; total: number };
function nonnegative(n: number): boolean { return Number.isFinite(n) && n >= 0; }
export function validateDeliveryRates(r: DeliveryRates): void {
  if (!r || typeof r.evidence !== "string" || !r.evidence.trim()) throw new Error("Delivery tariff evidence required; rates remain unverified");
  for (const k of ["sttBuy", "sttSell", "exchange", "sebi", "stampBuy", "gst", "dpPerScripSellDay", "brokeragePerOrder"] as const) {
    if (!nonnegative(r[k])) throw new Error(`Invalid delivery rate: ${k}`);
  }
  for (const k of ["sttBuy", "sttSell", "exchange", "sebi", "stampBuy", "gst"] as const) if (r[k] > 1) throw new Error(`Invalid rate fraction: ${k}`);
}
/** Model only: one order, no statutory rounding rules assumed. DP applied once per scrip/sell day by caller. */
export function deliveryLegCharges(side: "BUY" | "SELL", qty: number, price: number, r: DeliveryRates, chargeDp: boolean): Charges {
  validateDeliveryRates(r);
  if ((side !== "BUY" && side !== "SELL") || !Number.isInteger(qty) || qty <= 0 || !Number.isFinite(price) || price <= 0 || typeof chargeDp !== "boolean" || (side === "BUY" && chargeDp)) throw new Error("Invalid delivery order");
  const value = qty * price;
  if (!Number.isFinite(value)) throw new Error("Invalid turnover");
  const stt = value * (side === "BUY" ? r.sttBuy : r.sttSell);
  const exchange = value * r.exchange, sebi = value * r.sebi;
  const stamp = side === "BUY" ? value * r.stampBuy : 0;
  const dp = side === "SELL" && chargeDp ? r.dpPerScripSellDay : 0;
  const brokerage = r.brokeragePerOrder;
  const gst = (exchange + sebi + dp + brokerage) * r.gst;
  const total = stt + exchange + sebi + stamp + dp + brokerage + gst;
  if (!Number.isFinite(total)) throw new Error("Invalid charges");
  return { stt, exchange, sebi, stamp, dp, brokerage, gst, total };
}

export type DataManifest = { market: "NSE"; instrument: string; dataKind: "REAL_HISTORICAL_1MIN"; sha256: string; provider: string; sourceReference: string; attestedReal: true };
const ingested = new WeakSet<object>();
/** Strict provenance gate. An attestation/hash is auditable, not proof data is genuine. No network. */
export function ingestHistoricalBars(bytes: Buffer, manifest: DataManifest): ReadonlyArray<Readonly<Bar>> {
  if (!manifest || manifest.market !== "NSE" || manifest.dataKind !== "REAL_HISTORICAL_1MIN" || manifest.attestedReal !== true || !manifest.instrument?.trim() || !manifest.provider?.trim() || !manifest.sourceReference?.trim() || !/^[a-f0-9]{64}$/.test(manifest.sha256 || "")) throw new Error("Real NSE historical data provenance required");
  if (createHash("sha256").update(bytes).digest("hex") !== manifest.sha256) throw new Error("Data hash mismatch");
  const rows: unknown = JSON.parse(bytes.toString("utf8"));
  if (!Array.isArray(rows) || !rows.length) throw new Error("Expected nonempty 1-minute bar array");
  let prev = -Infinity;
  const result = Object.freeze(rows.map((raw: unknown) => {
    const b = raw as Bar;
    if (!b || !Number.isSafeInteger(b.t) || b.t <= prev || b.t % 60000 !== 0 || ![b.o,b.h,b.l,b.c].every(x => Number.isFinite(x) && x > 0) || !nonnegative(b.v) || b.h < Math.max(b.o,b.c,b.l) || b.l > Math.min(b.o,b.c,b.h)) throw new Error("Invalid, duplicate, or unordered 1-minute OHLCV bar");
    prev = b.t;
    return Object.freeze({t:b.t,o:b.o,h:b.h,l:b.l,c:b.c,v:b.v});
  }));
  ingested.add(result);
  return result;
}

type Signal = { action: "BUY"; qty: number; stop: number; target: number } | { action: "SELL" } | { action: "HOLD" };
type Position = { qty: number; entry: number; entryTime: number; entryFees: number; stop: number; target: number };
type Trade = { entry: number; exit: number; qty: number; net: number; exitTime: number; reason: string };
const day = (t: number) => new Date(t + 19800000).toISOString().slice(0,10);
/**
 * Caller must supply only ingestHistoricalBars output and an isolated causal strategy.
 * Signal at close executes at next bar open, stops/targets use conservative gap and
 * stop-first assumptions. Single long-only scrip, no tick ordering or partial fills.
 * Daily breaker halts NEW entries after realized losses; never blocks risk exits.
 * Open positions remain marked, never silently treated as closed.
 */
export function replayDelivery(bars: ReadonlyArray<Readonly<Bar>>, rates: DeliveryRates, capital: number, dailyLossLimit: number, strategy: (history: ReadonlyArray<Readonly<Bar>>) => Signal) {
  validateDeliveryRates(rates);
  if (!ingested.has(bars as object)) throw new Error("Replay requires provenance-gated historical data");
  if (!Number.isFinite(capital) || capital <= 0 || !Number.isFinite(dailyLossLimit) || dailyLossLimit <= 0 || typeof strategy !== "function" || !bars.length) throw new Error("Invalid replay configuration");
  let cash = capital, pos: Position | null = null, pending: Signal | null = null;
  const history: Readonly<Bar>[] = [], trades: Trade[] = [], realized: Record<string, number> = {}, dpDays = new Set<string>();
  let rejectedOrders = 0;
  for (const b of bars) {
    const d = day(b.t);
    const close = (price: number, reason: string) => {
      if (!pos) return;
      const p = pos;
      if (day(p.entryTime) === d) throw new Error("Same-day exit cannot be costed as delivery; replay aborted");
      const fee = deliveryLegCharges("SELL", p.qty, price, rates, !dpDays.has(d)).total;
      dpDays.add(d); cash += p.qty * price - fee;
      const net = p.qty * (price - p.entry) - p.entryFees - fee;
      realized[d] = (realized[d] || 0) + net;
      trades.push({ entry:p.entry, exit:price, qty:p.qty, net, exitTime:b.t, reason });
      pos = null;
    };
    // Existing protection has priority at the open, including gaps.
    if (pos && b.o <= pos.stop) close(b.o, "STOP_GAP");
    else if (pos && b.o >= pos.target) close(b.o, "TARGET_GAP");
    if (pending?.action === "SELL" && pos) close(b.o, "SIGNAL");
    else if (pending?.action === "BUY" && !pos && (realized[d] || 0) > -dailyLossLimit) {
      const s = pending;
      if (!Number.isInteger(s.qty) || s.qty <= 0 || !Number.isFinite(s.stop) || !Number.isFinite(s.target) || s.stop <= 0 || s.stop >= b.o || s.target <= b.o) rejectedOrders++;
      else {
        const fee = deliveryLegCharges("BUY", s.qty, b.o, rates, false).total;
        if (s.qty * b.o + fee > cash) rejectedOrders++;
        else { cash -= s.qty * b.o + fee; pos = { qty:s.qty, entry:b.o, entryTime:b.t, entryFees:fee, stop:s.stop, target:s.target }; }
      }
    }
    pending = null;
    // Bar ambiguity is resolved against the position, never using future ticks.
    if (pos && b.l <= pos.stop) close(pos.stop, "STOP");
    else if (pos && b.h >= pos.target) close(pos.target, "TARGET");
    history.push(b);
    const signal = strategy(Object.freeze(history.slice()));
    if (!signal || !["BUY","SELL","HOLD"].includes(signal.action)) throw new Error("Invalid strategy signal");
    pending = signal.action === "HOLD" ? null : Object.freeze({ ...signal });
  }
  const openPosition = pos as Position | null;
  const mark = bars[bars.length - 1].c;
  return { trades, cash, openPosition, markedEquity: cash + (openPosition ? openPosition.qty * mark : 0), realizedByExitDay: realized, rejectedOrders, pendingAtEnd: pending, limitations: "Paper only; marked equity excludes hypothetical exit fees; no settlement, corporate actions, tick ordering, partial fills or independent provenance verification." };
}
