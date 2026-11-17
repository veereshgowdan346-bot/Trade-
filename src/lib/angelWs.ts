import WebSocket from "ws";
import type { Candle } from "./indicators";
import type { Exchange, Instrument } from "./instruments";
import { ANGEL_BASE, angelHeaders, ensureAngelSession } from "./sessions";
import { audit } from "./settings";
import { ingestScripMaster, resolveAll } from "./tokenMaster";
import { loadCreds } from "./vault";

export const ANGEL_WS_URL = "wss://smartapisocket.angelone.in/smart-stream";
export const WS_HEARTBEAT_MS = 30_000;
const RECONNECT_DELAYS_MS = [1_000, 2_000, 5_000] as const;

export type WsConnectionState = "DISCONNECTED" | "CONNECTING" | "LIVE STREAMING" | "RECONNECTING";

export type WsDepthRow = { price: number; qty: number; orders: number };

export type LiveFeedEntry = {
  symbol: string;
  token: string;
  exchange: Exchange;
  ltp: number;
  dayOpen: number;
  dayHigh: number;
  dayLow: number;
  prevClose: number;
  volume: number;
  lastTickAt: number;
  lastWsTickAt: number | null;
  candles: Candle[];
  bids: WsDepthRow[];
  asks: WsDepthRow[];
};

export type AngelTick = {
  mode: number;
  exchangeType: number;
  token: string;
  sequenceNumber: number;
  exchangeTimestamp: number;
  ltp: number;
  lastTradedQty?: number;
  atp?: number;
  volume?: number;
  open?: number;
  high?: number;
  low?: number;
  close?: number;
  bids: WsDepthRow[];
  asks: WsDepthRow[];
};

export type WsStatusPayload = {
  connected: boolean;
  connecting: boolean;
  reconnecting: boolean;
  connectionState: WsConnectionState;
  subscribedCount: number;
  ticksReceived: number;
  lastTickAt: number | null;
  lastPongAt: number | null;
  lastError: string | null;
};

export type StreamTickEvent = {
  type: "tick";
  symbol: string;
  ltp: number;
  dayOpen: number;
  high: number;
  low: number;
  change: number;
  changePct: number;
  volume: number;
  candle: Candle;
  bids: WsDepthRow[];
  asks: WsDepthRow[];
  ts: number;
  ticksReceived: number;
};

export type StreamStatusEvent = {
  type: "status";
  ws: WsStatusPayload;
  ts: number;
};

export type StreamEvent = StreamTickEvent | StreamStatusEvent;

export type TickListener = (symbol: string, ltp: number, ts: number) => void;
export type StreamListener = (ev: StreamEvent) => void;

type WsRuntime = {
  socket: WebSocket | null;
  connected: boolean;
  connecting: boolean;
  reconnecting: boolean;
  stopped: boolean;
  reconnectAttempt: number;
  reconnectTimer: NodeJS.Timeout | null;
  pingTimer: NodeJS.Timeout | null;
  lastTickAt: number | null;
  lastPongAt: number | null;
  ticksReceived: number;
  subscribedCount: number;
  lastError: string | null;
  feeds: Map<string, LiveFeedEntry>;
  tokenIndex: Map<string, Instrument>;
  histLoaded: Set<string>;
  histPending: Set<string>;
  histQueueRunning: boolean;
  lastHistCallAt: number;
  listeners: Set<TickListener>;
  streamListeners: Set<StreamListener>;
};

type G = typeof globalThis & { __omniAngelWs?: WsRuntime };

function runtime(): WsRuntime {
  const g = globalThis as G;
  if (!g.__omniAngelWs) {
    g.__omniAngelWs = {
      socket: null,
      connected: false,
      connecting: false,
      reconnecting: false,
      stopped: false,
      reconnectAttempt: 0,
      reconnectTimer: null,
      pingTimer: null,
      lastTickAt: null,
      lastPongAt: null,
      ticksReceived: 0,
      subscribedCount: 0,
      lastError: null,
      feeds: new Map(),
      tokenIndex: new Map(),
      histLoaded: new Set(),
      histPending: new Set(),
      histQueueRunning: false,
      lastHistCallAt: 0,
      listeners: new Set(),
      streamListeners: new Set(),
    };
  }
  return g.__omniAngelWs;
}

function computeConnectionState(rt: WsRuntime): WsConnectionState {
  if (rt.connected) return "LIVE STREAMING";
  if (rt.reconnecting) return "RECONNECTING";
  if (rt.connecting) return "CONNECTING";
  return "DISCONNECTED";
}

function emitStream(ev: StreamEvent) {
  const rt = runtime();
  for (const fn of rt.streamListeners) {
    try {
      fn(ev);
    } catch {
      /* isolate SSE stream subscribers */
    }
  }
}

function emitStatus() {
  emitStream({ type: "status", ws: getWsStatus(), ts: Date.now() });
}

export function exchangeToAngelType(ex: Exchange): number {
  if (ex === "NSE") return 1;
  if (ex === "NFO") return 2;
  return 5; // MCX
}

/** Parses Angel One SmartWebSocketV2 Little-Endian binary packets (Modes 1, 2, 3). */
export function parseAngelBinaryTick(buf: Buffer): AngelTick | null {
  if (buf.length < 51) return null;
  const mode = buf.readUInt8(0);
  const exchangeType = buf.readUInt8(1);
  const token = buf.subarray(2, 27).toString("utf8").replace(/\0+$/, "").trim();
  if (!token) return null;

  const sequenceNumber = Number(buf.readBigInt64LE(27));
  const exchangeTimestamp = Number(buf.readBigInt64LE(35));
  const ltp = Math.round((Number(buf.readBigInt64LE(43)) / 100) * 100) / 100;

  const tick: AngelTick = {
    mode,
    exchangeType,
    token,
    sequenceNumber,
    exchangeTimestamp: exchangeTimestamp > 0 ? exchangeTimestamp : Date.now(),
    ltp,
    bids: [],
    asks: [],
  };

  if (mode >= 2 && buf.length >= 123) {
    tick.lastTradedQty = Number(buf.readBigInt64LE(51));
    tick.atp = Number(buf.readBigInt64LE(59)) / 100;
    tick.volume = Number(buf.readBigInt64LE(67));
    tick.open = Number(buf.readBigInt64LE(91)) / 100;
    tick.high = Number(buf.readBigInt64LE(99)) / 100;
    tick.low = Number(buf.readBigInt64LE(107)) / 100;
    tick.close = Number(buf.readBigInt64LE(115)) / 100;
  }

  if (mode >= 3 && buf.length >= 347) {
    const bids: WsDepthRow[] = [];
    const asks: WsDepthRow[] = [];
    for (let i = 0; i < 10; i++) {
      const off = 147 + i * 20;
      const flag = buf.readUInt16LE(off);
      const qty = Number(buf.readBigInt64LE(off + 2));
      const price = Math.round((Number(buf.readBigInt64LE(off + 10)) / 100) * 100) / 100;
      const orders = buf.readUInt16LE(off + 18);
      if (price <= 0 && qty <= 0) continue;
      if (flag === 1 || (flag === 0 && i < 5 && bids.length < 5)) {
        if (flag === 1 || i < 5) bids.push({ price, qty, orders });
        else asks.push({ price, qty, orders });
      } else {
        asks.push({ price, qty, orders });
      }
    }
    tick.bids = bids.slice(0, 5);
    tick.asks = asks.slice(0, 5);
  }

  return tick;
}

function fmtAngelIst(ms: number): string {
  const ist = new Date(ms + 5.5 * 3600_000);
  const y = ist.getUTCFullYear();
  const m = String(ist.getUTCMonth() + 1).padStart(2, "0");
  const d = String(ist.getUTCDate()).padStart(2, "0");
  const hh = String(ist.getUTCHours()).padStart(2, "0");
  const mm = String(ist.getUTCMinutes()).padStart(2, "0");
  return `${y}-${m}-${d} ${hh}:${mm}`;
}

/** Warms up real 1-minute historical candles from Angel One REST getCandleData (rate-limited). */
export async function warmupHistoricalCandles(inst: Instrument): Promise<void> {
  const rt = runtime();
  if (!inst.resolved || inst.token === "PENDING_MASTER") return;
  if (rt.histLoaded.has(inst.symbol) || rt.histPending.has(inst.symbol)) return;
  rt.histPending.add(inst.symbol);
  try {
    const gap = Date.now() - rt.lastHistCallAt;
    if (gap < 380) await new Promise((r) => setTimeout(r, 380 - gap));
    rt.lastHistCallAt = Date.now();

    const sess = await ensureAngelSession(false);
    const to = Date.now();
    const from = to - 4 * 86_400_000;
    const res = await fetch(`${ANGEL_BASE}/rest/secure/angelbroking/historical/v1/getCandleData`, {
      method: "POST",
      headers: angelHeaders(sess.apiKey, sess.jwtToken),
      body: JSON.stringify({
        exchange: inst.exchange,
        symboltoken: inst.token,
        interval: "ONE_MINUTE",
        fromdate: fmtAngelIst(from),
        todate: fmtAngelIst(to),
      }),
      cache: "no-store",
    });
    const json = (await res.json().catch(() => null)) as { status?: boolean; data?: [string, number, number, number, number, number][] } | null;
    if (res.ok && json?.status && Array.isArray(json.data) && json.data.length > 0) {
      const bars: Candle[] = json.data.slice(-240).map(([ts, o, h, l, c, v]) => ({
        t: Math.floor(new Date(ts).getTime() / 60_000) * 60_000,
        o: Number(o),
        h: Number(h),
        l: Number(l),
        c: Number(c),
        v: Number(v) || 0,
      }));
      const existing = rt.feeds.get(inst.symbol);
      if (existing) {
        const firstLiveT = existing.candles[0]?.t ?? Infinity;
        existing.candles = [...bars.filter((b) => b.t < firstLiveT), ...existing.candles].slice(-260);
      } else {
        const lastBar = bars[bars.length - 1];
        rt.feeds.set(inst.symbol, {
          symbol: inst.symbol,
          token: inst.token,
          exchange: inst.exchange,
          ltp: lastBar.c,
          dayOpen: bars[0].o,
          dayHigh: Math.max(...bars.map((b) => b.h)),
          dayLow: Math.min(...bars.map((b) => b.l)),
          prevClose: bars[0].o,
          volume: bars.reduce((a, b) => a + b.v, 0),
          lastTickAt: Date.now(),
          lastWsTickAt: null,
          candles: bars,
          bids: [],
          asks: [],
        });
      }
      rt.histLoaded.add(inst.symbol);
    }
  } catch {
    /* historical warmup requires valid authenticated session */
  } finally {
    rt.histPending.delete(inst.symbol);
  }
}

export async function warmupAllInstruments(): Promise<void> {
  const rt = runtime();
  if (rt.histQueueRunning) return;
  rt.histQueueRunning = true;
  try {
    const all = await resolveAll();
    for (const inst of all) {
      if (rt.stopped) break;
      await warmupHistoricalCandles(inst);
    }
  } finally {
    rt.histQueueRunning = false;
  }
}

function applyTick(tick: AngelTick) {
  const rt = runtime();
  const inst = rt.tokenIndex.get(`${tick.exchangeType}:${tick.token}`);
  if (!inst || !(tick.ltp > 0)) return;

  const now = Date.now();
  const minuteTs = Math.floor(tick.exchangeTimestamp / 60_000) * 60_000;
  let entry = rt.feeds.get(inst.symbol);
  let activeBar: Candle;

  if (!entry) {
    activeBar = { t: minuteTs, o: tick.ltp, h: tick.ltp, l: tick.ltp, c: tick.ltp, v: tick.lastTradedQty ?? 0 };
    entry = {
      symbol: inst.symbol,
      token: inst.token,
      exchange: inst.exchange,
      ltp: tick.ltp,
      dayOpen: tick.open && tick.open > 0 ? tick.open : tick.ltp,
      dayHigh: tick.high && tick.high > 0 ? tick.high : tick.ltp,
      dayLow: tick.low && tick.low > 0 ? tick.low : tick.ltp,
      prevClose: tick.close && tick.close > 0 ? tick.close : tick.ltp,
      volume: tick.volume ?? 0,
      lastTickAt: now,
      lastWsTickAt: now,
      candles: [activeBar],
      bids: tick.bids,
      asks: tick.asks,
    };
    rt.feeds.set(inst.symbol, entry);
  } else {
    const prevVol = entry.volume;
    const newVol = tick.volume ?? prevVol;
    const volDelta = newVol >= prevVol ? newVol - prevVol : tick.lastTradedQty ?? 0;

    entry.ltp = tick.ltp;
    if (tick.open && tick.open > 0) entry.dayOpen = tick.open;
    if (tick.high && tick.high > 0) entry.dayHigh = tick.high;
    if (tick.low && tick.low > 0) entry.dayLow = tick.low;
    if (tick.close && tick.close > 0) entry.prevClose = tick.close;
    if (tick.volume !== undefined) entry.volume = tick.volume;
    if (tick.bids.length) entry.bids = tick.bids;
    if (tick.asks.length) entry.asks = tick.asks;
    entry.lastTickAt = now;
    entry.lastWsTickAt = now;

    const lastBar = entry.candles[entry.candles.length - 1];
    if (!lastBar || lastBar.t < minuteTs) {
      activeBar = {
        t: minuteTs,
        o: tick.ltp,
        h: tick.ltp,
        l: tick.ltp,
        c: tick.ltp,
        v: Math.max(0, volDelta || tick.lastTradedQty || 0),
      };
      entry.candles.push(activeBar);
      if (entry.candles.length > 260) entry.candles.shift();
    } else if (lastBar.t === minuteTs) {
      lastBar.h = Math.max(lastBar.h, tick.ltp);
      lastBar.l = Math.min(lastBar.l, tick.ltp);
      lastBar.c = tick.ltp;
      lastBar.v += Math.max(0, volDelta || tick.lastTradedQty || 0);
      activeBar = lastBar;
    } else {
      activeBar = lastBar;
    }
  }

  rt.lastTickAt = now;
  rt.ticksReceived += 1;

  const base = entry.prevClose > 0 ? entry.prevClose : entry.dayOpen > 0 ? entry.dayOpen : activeBar.o;
  const change = base > 0 ? Math.round((entry.ltp - base) * 100) / 100 : 0;
  const changePct = base > 0 ? Math.round(((entry.ltp - base) / base) * 10000) / 100 : 0;

  emitStream({
    type: "tick",
    symbol: inst.symbol,
    ltp: entry.ltp,
    dayOpen: entry.dayOpen,
    high: entry.dayHigh,
    low: entry.dayLow,
    change,
    changePct,
    volume: entry.volume,
    candle: { ...activeBar },
    bids: entry.bids,
    asks: entry.asks,
    ts: now,
    ticksReceived: rt.ticksReceived,
  });

  for (const listener of rt.listeners) {
    try {
      listener(inst.symbol, tick.ltp, now);
    } catch {
      /* isolate tick listeners */
    }
  }
}

function scheduleReconnect() {
  const rt = runtime();
  if (rt.stopped || rt.reconnectTimer) return;
  const delay = RECONNECT_DELAYS_MS[Math.min(rt.reconnectAttempt, RECONNECT_DELAYS_MS.length - 1)];
  rt.reconnectAttempt += 1;
  rt.reconnecting = true;
  emitStatus();
  rt.reconnectTimer = setTimeout(() => {
    rt.reconnectTimer = null;
    void connectAngelWs();
  }, delay);
}

/** Connects to Angel One SmartWebSocketV2 if vault credentials are configured (reuses valid JWT). */
export async function connectAngelWs(forceReconnect = false): Promise<{ ok: boolean; error?: string }> {
  const rt = runtime();
  const creds = await loadCreds("angel");
  if (!creds?.clientId || !(creds.password || creds.tradingPin) || !creds.apiKey || !creds.totpSecret) {
    rt.reconnecting = false;
    rt.connecting = false;
    emitStatus();
    return { ok: false, error: "Angel One credentials not configured" };
  }

  if (forceReconnect && rt.socket) {
    try {
      rt.socket.close();
    } catch {
      /* ignore */
    }
    rt.socket = null;
    rt.connected = false;
  }

  if (rt.connected || rt.connecting) return { ok: true };
  if (rt.reconnectTimer) {
    clearTimeout(rt.reconnectTimer);
    rt.reconnectTimer = null;
  }
  rt.stopped = false;
  rt.connecting = true;
  emitStatus();

  try {
    // Reuse valid JWT/feedToken without triggering redundant loginByPassword calls
    const sess = await ensureAngelSession(false);
    if (!sess.feedToken) {
      throw new Error("Angel One session has no feedToken");
    }
    let allInst = await resolveAll();
    if (allInst.some((i) => !i.resolved || i.token === "PENDING_MASTER")) {
      await ingestScripMaster();
      allInst = await resolveAll();
    }
    rt.tokenIndex.clear();
    const byExchange = new Map<number, string[]>();
    const legacyTokens: string[] = [];
    let subCount = 0;

    for (const inst of allInst) {
      if (!inst.resolved || inst.token === "PENDING_MASTER") continue;
      const exType = exchangeToAngelType(inst.exchange);
      rt.tokenIndex.set(`${exType}:${inst.token}`, inst);
      const list = byExchange.get(exType) ?? [];
      list.push(inst.token);
      byExchange.set(exType, list);
      if (inst.legacyToken) {
        rt.tokenIndex.set(`${exType}:${inst.legacyToken}`, inst);
        legacyTokens.push(inst.legacyToken);
      }
      subCount++;
    }

    const tokenList = Array.from(byExchange.entries()).map(([exchangeType, tokens]) => ({
      exchangeType,
      tokens,
    }));

    const ws = new WebSocket(ANGEL_WS_URL, {
      headers: {
        Authorization: `Bearer ${sess.jwtToken}`,
        "x-api-key": sess.apiKey,
        "x-client-code": sess.clientCode,
        "x-feed-token": sess.feedToken,
      },
      handshakeTimeout: 10_000,
    });
    rt.socket = ws;

    ws.on("open", () => {
      rt.connected = true;
      rt.connecting = false;
      rt.reconnecting = false;
      rt.reconnectAttempt = 0;
      rt.lastError = null;
      rt.subscribedCount = subCount;
      rt.lastPongAt = Date.now();
      emitStatus();

      if (tokenList.length > 0) {
        ws.send(
          JSON.stringify({
            correlationID: "omnitrade1",
            action: 1,
            params: { mode: 3, tokenList },
          }),
        );
      }
      if (legacyTokens.length > 0) {
        ws.send(
          JSON.stringify({
            correlationID: "legacyidx",
            action: 1,
            params: { mode: 1, tokenList: [{ exchangeType: 1, tokens: legacyTokens }] },
          }),
        );
      }

      if (rt.pingTimer) clearInterval(rt.pingTimer);
      rt.pingTimer = setInterval(() => {
        if (ws.readyState !== WebSocket.OPEN) return;
        if (rt.lastPongAt && Date.now() - rt.lastPongAt > 75_000) {
          rt.lastError = "Heartbeat pong timeout (75s) — reconnecting";
          ws.terminate();
          return;
        }
        try {
          ws.ping();
          ws.send("ping");
        } catch {
          ws.terminate();
        }
      }, WS_HEARTBEAT_MS);

      void warmupAllInstruments();
      void audit("INFO", "WS_FEED", `Angel One SmartWebSocketV2 LIVE STREAMING (${subCount} instruments, 30s heartbeat)`);
    });

    ws.on("pong", () => {
      rt.lastPongAt = Date.now();
    });

    ws.on("message", (raw: WebSocket.RawData, isBinary: boolean) => {
      if (!isBinary) {
        const text = raw.toString();
        if (text === "pong") {
          rt.lastPongAt = Date.now();
        } else if (text.includes("error")) {
          rt.lastError = text.slice(0, 200);
          emitStatus();
        }
        return;
      }
      const buf = Buffer.isBuffer(raw) ? raw : Array.isArray(raw) ? Buffer.concat(raw) : Buffer.from(raw);
      const tick = parseAngelBinaryTick(buf);
      if (tick) applyTick(tick);
    });

    ws.on("error", (err) => {
      rt.lastError = err.message;
      rt.connecting = false;
      emitStatus();
    });

    ws.on("close", (code, reason) => {
      rt.connected = false;
      rt.connecting = false;
      if (rt.pingTimer) {
        clearInterval(rt.pingTimer);
        rt.pingTimer = null;
      }
      if (!rt.stopped) {
        rt.lastError = `Closed (${code}${reason.length ? `: ${reason.toString()}` : ""})`;
        scheduleReconnect();
      } else {
        rt.reconnecting = false;
        emitStatus();
      }
    });

    return { ok: true };
  } catch (e) {
    rt.connecting = false;
    rt.connected = false;
    rt.lastError = e instanceof Error ? e.message : String(e);
    scheduleReconnect();
    return { ok: false, error: rt.lastError };
  }
}

export function stopAngelWs() {
  const rt = runtime();
  rt.stopped = true;
  rt.reconnecting = false;
  if (rt.reconnectTimer) {
    clearTimeout(rt.reconnectTimer);
    rt.reconnectTimer = null;
  }
  if (rt.pingTimer) {
    clearInterval(rt.pingTimer);
    rt.pingTimer = null;
  }
  if (rt.socket) {
    try {
      rt.socket.close();
    } catch {
      /* ignore */
    }
    rt.socket = null;
  }
  rt.connected = false;
  rt.connecting = false;
  emitStatus();
}

export function registerTickListener(fn: TickListener) {
  runtime().listeners.add(fn);
}

export function subscribeStreamEvents(fn: StreamListener): () => void {
  const rt = runtime();
  rt.streamListeners.add(fn);
  return () => {
    rt.streamListeners.delete(fn);
  };
}

export function getAllLiveFeeds(): LiveFeedEntry[] {
  return Array.from(runtime().feeds.values());
}

export function getLiveFeed(symbol: string): LiveFeedEntry | null {
  return runtime().feeds.get(symbol) ?? null;
}

export function hasFreshLiveTick(symbol: string, maxAgeMs = 180_000): boolean {
  const rt = runtime();
  const entry = rt.feeds.get(symbol);
  if (!entry || entry.lastWsTickAt === null) return false;
  return rt.connected && Date.now() - entry.lastWsTickAt <= maxAgeMs;
}

export function getWsStatus(): WsStatusPayload {
  const rt = runtime();
  return {
    connected: rt.connected,
    connecting: rt.connecting,
    reconnecting: rt.reconnecting,
    connectionState: computeConnectionState(rt),
    subscribedCount: rt.subscribedCount,
    ticksReceived: rt.ticksReceived,
    lastTickAt: rt.lastTickAt,
    lastPongAt: rt.lastPongAt,
    lastError: rt.lastError,
  };
}
