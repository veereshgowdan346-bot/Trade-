"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { INSTRUMENTS } from "@/lib/instruments";
import type { Ctx, Tone } from "./ctx";
import { DashboardPage, LiveTradingPage, RiskPage } from "./pages/PagesA";
import { ConsensusPage, MarketWatchPage, OrdersPage, PositionsPage } from "./pages/PagesB";
import { AuditPage, EodPage, SettingsPage, StrategyHubPage, TokenMasterPage } from "./pages/PagesC";
import { TradeCalendarPage } from "./pages/TradeCalendarPage";
import type { AppState, BrokerKey, MarketData, WatchRow, WsStatus } from "./types";
import { api, Badge, inr, pnlClass, regimeTone } from "./ui";

type StreamTickPayload = {
  type: "tick";
  symbol: string;
  ltp: number;
  dayOpen: number;
  high: number;
  low: number;
  change: number;
  changePct: number;
  volume: number;
  candle: { t: number; o: number; h: number; l: number; c: number; v: number };
  bids: { price: number; qty: number; orders: number }[];
  asks: { price: number; qty: number; orders: number }[];
  ts: number;
  ticksReceived: number;
};

type StreamStatusPayload = {
  type: "status";
  ws: WsStatus;
  ts: number;
};

const PAGES = [
  { id: 0, label: "Dashboard", icon: "▦" },
  { id: 1, label: "Live Trading View", icon: "◩" },
  { id: 2, label: "Risk Management", icon: "⛨" },
  { id: 3, label: "Live Market Watch", icon: "◎" },
  { id: 4, label: "Orders & Trades", icon: "☰" },
  { id: 5, label: "Positions", icon: "◈" },
  { id: 6, label: "Strategy Consensus", icon: "◬" },
  { id: 7, label: "Strategy Hub & Webhook", icon: "⌁" },
  { id: 8, label: "Audit Trail & Pre-Flight", icon: "✓" },
  { id: 9, label: "Gmail EOD Dispatcher", icon: "✉" },
  { id: 10, label: "Token Master", icon: "#" },
  { id: 11, label: "Settings & Broker Vault", icon: "⚿" },
  { id: 12, label: "Trade History Calendar", icon: "📅" },
];

export default function Cockpit() {
  const [page, setPage] = useState(0);
  const [symbol, setSymbolState] = useState("SBIN");
  const [state, setState] = useState<AppState | null>(null);
  const [market, setMarket] = useState<MarketData | null>(null);
  const [watch, setWatch] = useState<WatchRow[]>([]);
  const [toasts, setToasts] = useState<{ id: number; msg: string; tone: Tone }[]>([]);
  const [clock, setClock] = useState("");
  const [bootErr, setBootErr] = useState<string | null>(null);
  const [flashing, setFlashing] = useState(false);
  const [resyncing, setResyncing] = useState(false);
  const symRef = useRef(symbol);
  const tickQueueRef = useRef<Map<string, StreamTickPayload>>(new Map());
  const rafRef = useRef<number | null>(null);
  const lastSseAtRef = useRef<Record<string, number>>({});

  useEffect(() => {
    symRef.current = symbol;
  }, [symbol]);

  const toast = useCallback((msg: string, tone: Tone = "info") => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, msg, tone }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 5200);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const s = await api<AppState & { error?: string }>("/api/state");
      if (s && s.risk) {
        setState(s);
        setBootErr(null);
      } else if (s?.error) {
        setBootErr(s.error);
      }
    } catch (e) {
      setBootErr(e instanceof Error ? e.message : "State fetch failed");
    }
  }, []);

  const setSymbol = useCallback((s: string) => {
    setMarket(null);
    setSymbolState(s);
  }, []);

  // Sub-100ms EventSource SSE tick & socket status stream with rAF atomic batching
  useEffect(() => {
    const flushBatch = () => {
      rafRef.current = null;
      const batch = new Map(tickQueueRef.current);
      tickQueueRef.current.clear();
      if (!batch.size) return;

      const curSym = symRef.current;
      const symTick = batch.get(curSym);
      let maxTicksReceived = 0;
      for (const tk of batch.values()) {
        if (tk.ticksReceived > maxTicksReceived) maxTicksReceived = tk.ticksReceived;
        lastSseAtRef.current[tk.symbol] = tk.ts;
      }

      if (symTick) {
        setMarket((prev) => {
          if (!prev || prev.inst.symbol !== curSym) return prev;
          const candles = prev.candles.slice();
          const last = candles[candles.length - 1];
          if (!last || last.t < symTick.candle.t) {
            candles.push(symTick.candle);
            if (candles.length > 100) candles.shift();
          } else if (last.t === symTick.candle.t) {
            candles[candles.length - 1] = symTick.candle;
          }
          return {
            ...prev,
            now: symTick.ts,
            ltp: symTick.ltp,
            change: symTick.change,
            changePct: symTick.changePct,
            high: symTick.high,
            low: symTick.low,
            volume: symTick.volume,
            candles,
            depth: symTick.bids.length || symTick.asks.length ? { bids: symTick.bids, asks: symTick.asks } : prev.depth,
            feed: "ANGEL_WS_V2",
            feedStatus: "LIVE STREAMING",
            ws: prev.ws ? { ...prev.ws, connected: true, connectionState: "LIVE STREAMING", ticksReceived: symTick.ticksReceived, lastTickAt: symTick.ts } : prev.ws,
          };
        });
      }

      setWatch((prev) =>
        prev.map((row) => {
          const tk = batch.get(row.symbol);
          if (!tk) return row;
          return {
            ...row,
            ltp: tk.ltp,
            change: tk.change,
            changePct: tk.changePct,
            high: tk.high,
            low: tk.low,
            volume: tk.volume,
            source: "ANGEL_WS_V2",
          };
        }),
      );

      setState((prev) => {
        if (!prev) return prev;
        let unrealized = 0;
        const positions = prev.positions.map((p) => {
          const tk = batch.get(p.symbol);
          const ltp = tk ? tk.ltp : p.ltp;
          const dir = p.side === "BUY" ? 1 : -1;
          const mtm = tk ? Math.round((ltp - p.entryPrice) * p.qty * dir * 100) / 100 : p.mtm;
          unrealized += mtm;
          return tk ? { ...p, ltp, mtm } : p;
        });
        return {
          ...prev,
          feed: "ANGEL_WS_V2",
          feedStatus: "LIVE STREAMING",
          positions,
          pnl: { ...prev.pnl, unrealized: Math.round(unrealized * 100) / 100, total: Math.round((prev.pnl.realized + unrealized) * 100) / 100 },
          ws: prev.ws ? { ...prev.ws, connected: true, connectionState: "LIVE STREAMING", ticksReceived: Math.max(prev.ws.ticksReceived, maxTicksReceived), lastTickAt: Date.now() } : prev.ws,
        };
      });
    };

    const es = new EventSource("/api/stream");
    es.addEventListener("tick", (e) => {
      try {
        const ev = JSON.parse((e as MessageEvent).data) as StreamTickPayload;
        tickQueueRef.current.set(ev.symbol, ev);
        if (rafRef.current === null) {
          rafRef.current = window.requestAnimationFrame(flushBatch);
        }
      } catch {
        /* ignore malformed SSE frame */
      }
    });
    es.addEventListener("status", (e) => {
      try {
        const ev = JSON.parse((e as MessageEvent).data) as StreamStatusPayload;
        setState((prev) =>
          prev
            ? {
                ...prev,
                ws: ev.ws,
                feed: ev.ws.connected && ev.ws.ticksReceived > 0 ? "ANGEL_WS_V2" : prev.feed,
                feedStatus: ev.ws.connectionState ?? prev.feedStatus,
              }
            : prev,
        );
        setMarket((prev) => (prev ? { ...prev, ws: ev.ws, feedStatus: ev.ws.connectionState ?? prev.feedStatus } : prev));
      } catch {
        /* ignore */
      }
    });

    return () => {
      es.close();
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const init = setTimeout(() => void refresh(), 0);
    const t = setInterval(() => void refresh(), 2500);
    return () => {
      clearTimeout(init);
      clearInterval(t);
    };
  }, [refresh]);

  useEffect(() => {
    let alive = true;
    const pull = async () => {
      const sym = symRef.current;
      const startedAt = Date.now();
      try {
        const m = await api<MarketData>(`/api/market?symbol=${sym}`);
        if (alive && m && m.candles && symRef.current === sym) {
          // Do not overwrite fresher SSE ticks with an older HTTP fallback snapshot
          if ((lastSseAtRef.current[sym] ?? 0) > startedAt) {
            setMarket((prev) =>
              prev && prev.inst.symbol === sym
                ? { ...prev, ema9: m.ema9, ema21: m.ema21, vwap: m.vwap, consensus: m.consensus, inst: m.inst }
                : m,
            );
          } else {
            setMarket(m);
          }
        }
      } catch {
        /* transient */
      }
    };
    void pull();
    const t = setInterval(pull, 1000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [symbol]);

  useEffect(() => {
    let alive = true;
    const pull = async () => {
      try {
        const w = await api<{ rows: WatchRow[] }>("/api/watch");
        if (alive && w.rows) setWatch(w.rows);
      } catch {
        /* transient */
      }
    };
    void pull();
    const t = setInterval(pull, 4000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, []);

  useEffect(() => {
    const tick = () => setClock(new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(11, 19));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);

  const ctx: Ctx = { state, market, watch, symbol, setSymbol, go: setPage, refresh, toast };
  const cons = market?.consensus;
  const risk = state?.risk;

  const setPrimary = async (b: BrokerKey) => {
    await api("/api/config", { primaryBroker: b });
    await refresh();
    toast(`Primary broker set to ${b.toUpperCase()}`, "ok");
  };

  const toggleTradingMode = async () => {
    // FIX (APEX-V2 AUDIT UI-001): the PAPER⇄LIVE toggle was a misleading dead affordance —
    // its confirm dialog claimed "enables real capital order dispatch", but the server-side
    // interlock (normaliseRisk + placeOrder + routeOrder + dispatchOrder) permanently forces
    // PAPER mode. The control is replaced by an honest read-only badge; the permanent
    // live-trading restriction is surfaced instead of a fake switch.
    toast("Live execution is permanently disabled by security mandate (Phase 6.9 interlock). All order flow terminates at the paper simulation boundary.", "info");
  };

  const flashTestOrder = async () => {
    setFlashing(true);
    const t0 = performance.now();
    try {
      const r = await api<{ ok: boolean; status: string; reason?: string; execMs?: number; details?: { entry?: number } }>("/api/orders", {
        symbol: "SBIN",
        side: "BUY",
        qty: 1,
        orderType: "MARKET",
        strategy: "FLASH_TEST",
        flashTest: true,
      });
      const rttMs = Math.max(1, Math.round(performance.now() - t0));
      if (r.ok && r.details?.entry != null) {
        toast(`[ORDER FILLED] SBIN @ ₹${Number(r.details.entry).toFixed(2)} in ${rttMs} ms ✓`, "ok");
      } else {
        toast(`Flash Test [${r.status}]: ${r.reason ?? "Failed"} (${rttMs} ms)`, "err");
      }
      await refresh();
    } finally {
      setFlashing(false);
    }
  };

  const reSyncSession = async () => {
    setResyncing(true);
    try {
      const primary = state?.risk.primaryBroker ?? "angel";
      const r = await api<{ state: string; message: string; funds?: { available: number } }>("/api/brokers/connect", {
        broker: primary,
        force: true,
      });
      if (r.state === "CONNECTED") {
        toast(`[SESSION SYNCED] ${primary.toUpperCase()} connected ✓ Available: ${inr(r.funds?.available ?? 0)}`, "ok");
      } else {
        toast(`[SESSION SYNC] ${primary.toUpperCase()}: ${r.message}`, "err");
      }
      await refresh();
    } catch (e) {
      toast(`Session re-sync failed: ${e instanceof Error ? e.message : String(e)}`, "err");
    } finally {
      setResyncing(false);
    }
  };

  const wsObj = market?.ws ?? state?.ws;
  const wsConnState = wsObj?.connectionState ?? (wsObj?.connected ? "LIVE STREAMING" : wsObj?.reconnecting ? "RECONNECTING" : wsObj?.connecting ? "CONNECTING" : "DISCONNECTED");
  const feedSource = market?.feed ?? state?.feed ?? "DISCONNECTED";
  const isLiveFeed = feedSource === "ANGEL_WS_V2" || wsConnState === "LIVE STREAMING";
  const isHistFeed = feedSource === "ANGEL_HIST";
  const wsConnected = wsObj?.connected ?? false;
  const feedStatusText = wsConnState === "LIVE STREAMING" ? "LIVE STREAMING" : wsConnState === "CONNECTING" ? "CONNECTING" : wsConnState === "RECONNECTING" ? "RECONNECTING" : (market?.feedStatus ?? state?.feedStatus ?? "MARKET CLOSED / WS DISCONNECTED");

  return (
    <div className="h-screen w-screen flex flex-col overflow-hidden">
      {/* HeaderTopBar 56px */}
      <header className="HeaderTopBar bar-glass border-b flex items-center gap-4 px-4 shrink-0">
        <div className="flex items-center gap-2 w-[188px] shrink-0">
          <div className="h-7 w-7 rounded-md grid place-items-center font-black text-[13px]" style={{ background: "linear-gradient(135deg,#00e5ff,#10b981)", color: "#04120d" }}>
            Ω
          </div>
          <div className="leading-tight">
            <div className="text-[13px] font-bold tracking-wide">OmniTradePro</div>
            <div className="label !text-[9px]">Apex Terminal</div>
          </div>
        </div>
        <select className="input !w-[170px]" value={symbol} onChange={(e) => setSymbol(e.target.value)} aria-label="Symbol">
          {INSTRUMENTS.map((i) => (
            <option key={i.symbol} value={i.symbol}>
              {i.exchange} · {i.symbol}
            </option>
          ))}
        </select>
        <div className="mono leading-tight w-[170px]">
          <div className="text-[16px] font-semibold">
            {market?.ltp !== null && market?.ltp !== undefined ? market.ltp.toLocaleString("en-IN", { minimumFractionDigits: 2 }) : "—"}
          </div>
          <div className={`text-[11px] ${market?.ltp !== null && market?.ltp !== undefined ? pnlClass(market?.change) : "text-[#f59e0b]"}`}>
            {market?.ltp !== null && market?.ltp !== undefined
              ? `${market.change >= 0 ? "+" : ""}${market.change.toFixed(2)} (${market.changePct.toFixed(2)}%)`
              : feedStatusText}
          </div>
        </div>
        <div className="flex-1" />
        <div className="flex items-center gap-1.5">
          <span className="label">Primary</span>
          <select className="input !w-[118px]" value={risk?.primaryBroker ?? "angel"} onChange={(e) => void setPrimary(e.target.value as BrokerKey)}>
            <option value="angel">Angel One</option>
            <option value="shoonya">Shoonya</option>
            <option value="groww">Groww</option>
          </select>
        </div>
        <div className="mono leading-tight text-right w-[120px]">
          <div className="label">Day P&L (net)</div>
          <div className={`text-[14px] font-semibold ${pnlClass(state?.pnl.total)}`}>{state ? inr(state.pnl.total) : "—"}</div>
        </div>
        {state?.circuit.tripped ? <Badge tone="bear">CIRCUIT TRIPPED</Badge> : <Badge tone="bull">RISK ARMED</Badge>}
        <button
          type="button"
          onClick={() => void reSyncSession()}
          disabled={resyncing}
          className="btn !h-7 !px-2.5 !text-[11px] font-semibold"
          style={{ background: "rgba(0,229,255,0.12)", border: "1px solid rgba(0,229,255,0.45)", color: "#00e5ff" }}
          title="Trigger fresh token refresh and dynamic TOTP re-login for 24h broker session"
        >
          {resyncing ? "↻ Re-Syncing…" : "↻ Re-Sync Session"}
        </button>
        <button
          type="button"
          onClick={() => void flashTestOrder()}
          disabled={flashing}
          className="btn btn-primary !h-7 !px-2.5 !text-[11px]"
          title="Dispatch 1-share Paper BUY probe on SBIN against live tick and benchmark latency"
        >
          {flashing ? "Testing…" : "⚡ Flash Test Order"}
        </button>
        <button
          type="button"
          onClick={() => void toggleTradingMode()}
          className={`badge cursor-pointer ${risk?.tradingMode === "LIVE" ? "badge-bear" : "badge-amber"}`}
          title="PAPER mode only — live execution is permanently disabled by the Phase 6.9 safety interlock. Click for details."
        >
          {(risk?.tradingMode ?? "PAPER") === "LIVE" ? "PAPER" : (risk?.tradingMode ?? "PAPER")} · LIVE DISABLED
        </button>
        <div className="mono text-[13px] w-[94px] text-right">
          <span className="muted text-[10px] mr-1">IST</span>
          {clock}
        </div>
      </header>

      {/* SubHeaderNavBar 36px */}
      <div className="SubHeaderNavBar bar-glass border-b flex items-center gap-3 px-4 shrink-0 text-[11.5px] overflow-hidden whitespace-nowrap" style={{ borderColor: "var(--line)" }}>
        <span className="label">Regime</span>
        {cons ? <Badge tone={regimeTone(cons.regime.regime)}>{cons.regime.regime}</Badge> : <Badge>…</Badge>}
        <span className="mono muted">ADX {cons?.regime.adx ?? "—"}</span>
        <span className="mono muted">ATR {cons ? cons.atr.toFixed(2) : "—"}</span>
        <span className="mono muted">Quorum {cons?.quorumPct ?? "—"}%</span>
        <span className="mono muted">GBM {cons?.gbm.forDirection ?? "—"}%</span>
        <div className="flex-1" />
        <span className="flex items-center gap-1.5">
          <i className={`inline-block h-2 w-2 rounded-full ${state?.session.equityOpen ? "bg-[#10b981]" : "bg-[#475569]"}`} />
          NSE/NFO
        </span>
        <span className="flex items-center gap-1.5">
          <i className={`inline-block h-2 w-2 rounded-full ${state?.session.mcxOpen ? "bg-[#10b981]" : "bg-[#475569]"}`} />
          MCX
        </span>
        <Badge tone={wsConnState === "LIVE STREAMING" ? "bull" : wsConnState === "CONNECTING" || wsConnState === "RECONNECTING" || isHistFeed ? "amber" : "bear"}>
          {wsConnState === "LIVE STREAMING"
            ? `SSE · LIVE STREAMING (${wsObj?.ticksReceived ?? 0} ticks)`
            : wsConnState === "RECONNECTING"
              ? "WS RECONNECTING…"
              : wsConnState === "CONNECTING"
                ? "WS CONNECTING…"
                : "MARKET CLOSED / WS DISCONNECTED"}
        </Badge>
        <span className="muted">Auto-trader (5s)</span>
        <Badge tone={risk?.autoTrade ? "bull" : "mute"}>{risk?.autoTrade ? "ACTIVE" : "OFF"}</Badge>
      </div>

      <div className="flex flex-1 min-h-0">
        {/* Sidebar 220px */}
        <aside className="Sidebar bar-glass border-r flex flex-col shrink-0 py-2" style={{ borderColor: "var(--line)" }}>
          <div className="flex-1 scroll">
            {PAGES.map((p) => (
              <button key={p.id} className={`nav-item ${page === p.id ? "active" : ""}`} onClick={() => setPage(p.id)}>
                <span className="mono w-5 text-center opacity-80">{p.icon}</span>
                <span className="flex-1 truncate">{p.label}</span>
                <span className="mono text-[10px] opacity-50">{p.id}</span>
              </button>
            ))}
          </div>
          <div className="px-3 pt-2 border-t space-y-1.5" style={{ borderColor: "var(--line)" }}>
            <div className="label">Broker Matrix</div>
            {(["angel", "shoonya", "groww"] as BrokerKey[]).map((b) => {
              const s = state?.brokers[b];
              return (
                <div key={b} className="flex items-center justify-between text-[11.5px]">
                  <span className="capitalize">
                    {b === "angel" ? "Angel One" : b}
                    {risk?.primaryBroker === b && <span className="cyan"> ★</span>}
                  </span>
                  <span className={s?.state === "CONNECTED" ? "up" : s?.state === "ERROR" ? "down" : "muted"}>{s?.state === "CONNECTED" ? "LIVE" : s?.state === "ERROR" ? "ERR" : s?.state === "CONFIGURED" ? "READY" : "—"}</span>
                </div>
              );
            })}
          </div>
        </aside>

        <main className="flex-1 min-w-0 scroll p-3" style={{ height: "calc(100vh - 92px)" }}>
          {!state ? (
            <div className="h-full grid place-items-center muted text-sm">
              {bootErr ? `Boot error: ${bootErr}` : "Booting risk sentinel…"}
            </div>
          ) : (
            <>
              {!isLiveFeed && (
                <div className="glass px-3 py-2 mb-3 text-[12px] flex items-center justify-between" style={{ borderColor: "rgba(245,158,11,.5)" }}>
                  <span>
                    <b className="text-[#f59e0b]">● {feedStatusText}</b> — Paper and Live execution strictly require real SmartWebSocketV2 ticks (zero synthetic prices).
                  </span>
                  <button className="btn !h-6 !text-[11px]" onClick={() => setPage(11)}>
                    Connect Broker →
                  </button>
                </div>
              )}
              {page === 0 && <DashboardPage ctx={ctx} />}
              {page === 1 && <LiveTradingPage ctx={ctx} />}
              {page === 2 && <RiskPage ctx={ctx} />}
              {page === 3 && <MarketWatchPage ctx={ctx} />}
              {page === 4 && <OrdersPage ctx={ctx} />}
              {page === 5 && <PositionsPage ctx={ctx} />}
              {page === 6 && <ConsensusPage ctx={ctx} />}
              {page === 7 && <StrategyHubPage ctx={ctx} />}
              {page === 8 && <AuditPage ctx={ctx} />}
              {page === 9 && <EodPage ctx={ctx} />}
              {page === 10 && <TokenMasterPage ctx={ctx} />}
              {page === 11 && <SettingsPage ctx={ctx} />}
              {page === 12 && <TradeCalendarPage ctx={ctx} />}
            </>
          )}
        </main>
      </div>

      <div className="fixed bottom-4 right-4 flex flex-col gap-2 z-50">
        {toasts.map((t) => (
          <div key={t.id} className="glass px-3 py-2 text-[12px] max-w-[380px]" style={{ borderColor: t.tone === "ok" ? "rgba(16,185,129,.6)" : t.tone === "err" ? "rgba(239,68,68,.6)" : "rgba(0,229,255,.5)" }}>
            {t.msg}
          </div>
        ))}
      </div>
    </div>
  );
}
