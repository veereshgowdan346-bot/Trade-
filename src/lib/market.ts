import { getLiveFeed, getWsStatus, hasFreshLiveTick, warmupHistoricalCandles } from "./angelWs";
import type { Candle } from "./indicators";
import type { Instrument } from "./instruments";

/**
 * 100% Real-Time Market Feed Gateway.
 * Consumes exclusively genuine Angel One SmartWebSocketV2 live ticks and
 * Angel One historical REST candles (getCandleData). Zero synthetic or
 * pseudo-random price/candle generation.
 */

export type FeedSource = "ANGEL_WS_V2" | "ANGEL_HIST" | "DISCONNECTED";

export type Snapshot = {
  candles: Candle[];
  ltp: number | null;
  dayOpen: number | null;
  change: number;
  changePct: number;
  high: number | null;
  low: number | null;
  volume: number;
  source: FeedSource;
  statusLabel: string;
};

export type DepthRow = { price: number; qty: number; orders: number };

export function marketFeedMode(): FeedSource {
  const s = getWsStatus();
  if (s.connected && s.ticksReceived > 0) return "ANGEL_WS_V2";
  if (s.lastTickAt !== null) return "ANGEL_HIST";
  return "DISCONNECTED";
}

export function marketStatusText(): string {
  const s = getWsStatus();
  if (s.connectionState === "LIVE STREAMING" && s.ticksReceived > 0) return "LIVE STREAMING";
  if (s.connectionState === "LIVE STREAMING") return "LIVE STREAMING · AWAITING TICKS";
  if (s.connectionState === "RECONNECTING") return "RECONNECTING";
  if (s.connectionState === "CONNECTING") return "CONNECTING";
  return "MARKET CLOSED / WS DISCONNECTED";
}

export function isLiveTickReady(inst: Instrument): boolean {
  return hasFreshLiveTick(inst.symbol);
}

export function snapshot(inst: Instrument, count = 100): Snapshot {
  const ws = getWsStatus();
  if (ws.connected) {
    void warmupHistoricalCandles(inst);
  }

  const live = getLiveFeed(inst.symbol);
  if (!live || live.candles.length === 0) {
    return {
      candles: [],
      ltp: live?.ltp && live.ltp > 0 ? live.ltp : null,
      dayOpen: null,
      change: 0,
      changePct: 0,
      high: null,
      low: null,
      volume: 0,
      source: hasFreshLiveTick(inst.symbol) ? "ANGEL_WS_V2" : "DISCONNECTED",
      statusLabel: marketStatusText(),
    };
  }

  const candles = live.candles.slice(-count);
  const base = live.prevClose > 0 ? live.prevClose : live.dayOpen > 0 ? live.dayOpen : candles[0].o;
  const ltp = live.ltp > 0 ? live.ltp : candles[candles.length - 1].c;
  const change = base > 0 ? Math.round((ltp - base) * 100) / 100 : 0;
  const changePct = base > 0 ? Math.round(((ltp - base) / base) * 10000) / 100 : 0;
  const source: FeedSource = hasFreshLiveTick(inst.symbol) ? "ANGEL_WS_V2" : "ANGEL_HIST";

  return {
    candles,
    ltp,
    dayOpen: live.dayOpen > 0 ? live.dayOpen : candles[0].o,
    change,
    changePct,
    high: live.dayHigh > 0 ? live.dayHigh : Math.max(...candles.map((c) => c.h)),
    low: live.dayLow > 0 ? live.dayLow : Math.min(...candles.map((c) => c.l)),
    volume: live.volume || candles.reduce((a, c) => a + c.v, 0),
    source,
    statusLabel: source === "ANGEL_WS_V2" ? "ANGEL SMART-WS V2 · LIVE" : "MARKET CLOSED / WS DISCONNECTED",
  };
}

/** Up to 200 real 1-minute historical + live candles for indicator calculation. */
export function analysisCandles(inst: Instrument): Candle[] {
  return snapshot(inst, 200).candles;
}

/** Returns only genuine live/last-known exchange LTP, or null when disconnected. */
export function ltpOf(inst: Instrument): number | null {
  const live = getLiveFeed(inst.symbol);
  if (!live) return null;
  if (live.ltp > 0) return live.ltp;
  const lastBar = live.candles[live.candles.length - 1];
  return lastBar && lastBar.c > 0 ? lastBar.c : null;
}

/** Real Level-2 Best 5 Bid/Ask DOM from SmartWebSocketV2 Mode 3 (SNAP_QUOTE). */
export function depth(inst: Instrument): { bids: DepthRow[]; asks: DepthRow[] } {
  const live = getLiveFeed(inst.symbol);
  if (!live || (!live.bids.length && !live.asks.length)) {
    return { bids: [], asks: [] };
  }
  return { bids: live.bids, asks: live.asks };
}
