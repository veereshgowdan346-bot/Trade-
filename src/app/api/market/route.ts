import { NextRequest } from "next/server";
import { getWsStatus } from "@/lib/angelWs";
import { analyse } from "@/lib/engine";
import { ema, vwap } from "@/lib/indicators";
import { depth, snapshot } from "@/lib/market";
import { getRisk } from "@/lib/settings";
import { resolveInstrument } from "@/lib/tokenMaster";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const symbol = req.nextUrl.searchParams.get("symbol") ?? "RELIANCE";
  const count = Math.min(100, Math.max(60, Number(req.nextUrl.searchParams.get("count")) || 100));
  const inst = await resolveInstrument(symbol);
  if (!inst) return Response.json({ error: "Unknown symbol" }, { status: 404 });

  const now = Date.now();
  const snap = snapshot(inst, 200);
  const candles = snap.candles;
  const closes = candles.map((c) => c.c);
  const e9 = closes.length ? ema(closes, 9) : [];
  const e21 = closes.length ? ema(closes, 21) : [];
  const vw = candles.length ? vwap(candles) : [];
  const from = Math.max(0, candles.length - count);
  const cfg = await getRisk();
  const cons = await analyse(inst, cfg);

  return Response.json({
    now,
    inst,
    ltp: snap.ltp,
    change: snap.change,
    changePct: snap.changePct,
    high: snap.high,
    low: snap.low,
    volume: snap.volume,
    candles: candles.slice(from),
    ema9: e9.slice(from),
    ema21: e21.slice(from),
    vwap: vw.slice(from),
    depth: depth(inst),
    consensus: cons,
    feed: snap.source,
    feedStatus: snap.statusLabel,
    ws: getWsStatus(),
  });
}
