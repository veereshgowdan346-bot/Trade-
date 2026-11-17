"use client";

import { useState } from "react";
import type { Ctx } from "../ctx";
import { api, Badge, Empty, inr, istTime, num, Panel, pnlClass, regimeTone, Stat, statusTone } from "../ui";

export function MarketWatchPage({ ctx }: { ctx: Ctx }) {
  const [filter, setFilter] = useState<"ALL" | "NSE" | "NFO" | "MCX" | "SIGNAL">("ALL");
  const rows = ctx.watch.filter((r) => (filter === "ALL" ? true : filter === "SIGNAL" ? r.qualifies : r.exchange === filter));
  return (
    <Panel
      title="Live Market Watch · Nifty 50 liquid + MCX scanner"
      bodyClass="p-0"
      right={
        <div className="flex gap-1">
          {(["ALL", "NSE", "NFO", "MCX", "SIGNAL"] as const).map((f) => (
            <button key={f} className={`btn !h-6 !text-[11px] ${filter === f ? "btn-primary" : ""}`} onClick={() => setFilter(f)}>
              {f}
            </button>
          ))}
        </div>
      }
    >
      <div className="scroll" style={{ maxHeight: "calc(100vh - 170px)" }}>
        <table className="grid">
          <thead>
            <tr>
              <th>Symbol</th><th>Exch</th><th className="text-right">LTP</th><th className="text-right">Chg</th><th className="text-right">Chg %</th>
              <th className="text-right">High</th><th className="text-right">Low</th><th className="text-right">Volume</th><th>Regime</th><th className="text-right">ADX</th>
              <th>Signal</th><th className="text-right">Quorum</th><th className="text-right">GBM</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.symbol} className="cursor-pointer" onClick={() => { ctx.setSymbol(r.symbol); ctx.go(1); }}>
                <td><b>{r.symbol}</b> <span className="muted text-[10.5px]">{r.name}</span></td>
                <td>{r.exchange}</td>
                <td className="mono text-right">{num(r.ltp)}</td>
                <td className={`mono text-right ${r.ltp !== null ? pnlClass(r.change) : "muted"}`}>{r.ltp !== null ? `${r.change >= 0 ? "+" : ""}${num(r.change)}` : "—"}</td>
                <td className={`mono text-right ${r.ltp !== null ? pnlClass(r.changePct) : "muted"}`}>{r.ltp !== null ? `${r.changePct >= 0 ? "+" : ""}${r.changePct.toFixed(2)}%` : "—"}</td>
                <td className="mono text-right">{num(r.high)}</td>
                <td className="mono text-right">{num(r.low)}</td>
                <td className="mono text-right">{r.volume > 0 ? r.volume.toLocaleString("en-IN") : "—"}</td>
                <td><Badge tone={regimeTone(r.regime)}>{r.regime.replace("TRENDING_", "T·").replace("_", " ")}</Badge></td>
                <td className="mono text-right">{r.adx}</td>
                <td><Badge tone={r.direction === "BUY" ? "bull" : r.direction === "SELL" ? "bear" : "mute"}>{r.direction}</Badge></td>
                <td className="mono text-right">{r.quorum}%</td>
                <td className="mono text-right">{r.gbm}%</td>
                <td>{r.qualifies && <Badge tone="bull">QUALIFIED</Badge>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <Empty>No instruments match.</Empty>}
      </div>
    </Panel>
  );
}

export function OrdersPage({ ctx }: { ctx: Ctx }) {
  const { orders, trades } = ctx.state!;
  const cancelOrd = async (id: number) => {
    const r = await api<{ ok: boolean; reason?: string }>(`/api/orders/${id}/cancel`, {});
    ctx.toast(r.ok ? `Order #${id} cancelled` : r.reason || "Cancel failed", r.ok ? "ok" : "err");
    await ctx.refresh();
  };
  return (
    <div className="space-y-3">
      <Panel title="Order Book · every attempt incl. rejections" bodyClass="p-0">
        <div className="scroll" style={{ maxHeight: 340 }}>
          {orders.length === 0 ? (
            <Empty>No orders yet. Place one from the Dashboard or run the autonomous scan.</Empty>
          ) : (
            <table className="grid">
              <thead>
                <tr><th>Time</th><th>#</th><th>Symbol</th><th>Mode</th><th>Side</th><th className="text-right">Qty</th><th className="text-right">Price</th><th>Status</th><th>Source</th><th>Strategy</th><th>Broker</th><th className="text-right">Exp. net</th><th>Detail</th><th></th></tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id}>
                    <td className="mono">{istTime(o.ts)}</td>
                    <td className="mono muted">{o.id}</td>
                    <td><b>{o.symbol}</b></td>
                    <td>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold ${o.mode === "LIVE" ? "bg-[#10b981]/20 text-[#10b981] border border-[#10b981]/40" : "bg-[#f59e0b]/20 text-[#f59e0b] border border-[#f59e0b]/40"}`}>
                        {o.mode === "LIVE" ? "L LIVE" : "P PAPER"}
                      </span>
                    </td>
                    <td>{o.side === "BUY" ? <Badge tone="bull">BUY</Badge> : o.side === "SELL" ? <Badge tone="bear">SELL</Badge> : "—"}</td>
                    <td className="mono text-right">{o.qty || "—"}</td>
                    <td className="mono text-right">{o.price ? num(o.price) : "—"}</td>
                    <td><Badge tone={statusTone(o.status)}>{o.status.replace("REJECTED_", "REJ·")}</Badge></td>
                    <td className="muted">{o.source}</td>
                    <td className="muted">{o.strategy}</td>
                    <td>{o.brokerUsed ? `${o.brokerUsed.toUpperCase()}${o.failover ? " ⇄" : ""}` : "—"}</td>
                    <td className="mono text-right">{o.expectedNet != null ? inr(o.expectedNet) : "—"}</td>
                    <td className="muted truncate max-w-[340px]" title={o.reason ?? ""}>{o.reason}</td>
                    <td>{o.status === "OPEN" && <button className="btn btn-bear !h-6 !text-[11px]" onClick={() => void cancelOrd(o.id)}>Cancel</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Panel>
      <Panel
        title="Trade Execution Log · closed round-trips"
        bodyClass="p-0"
        right={
          <button className="btn !h-6 !text-[11px] font-bold" onClick={() => ctx.go(12)}>
            📅 Open Calendar History →
          </button>
        }
      >
        <div className="scroll" style={{ maxHeight: 300 }}>
          {trades.length === 0 ? (
            <Empty>No closed trades yet.</Empty>
          ) : (
            <table className="grid">
              <thead>
                <tr><th>Closed (IST)</th><th>Mode</th><th>Symbol</th><th>Side</th><th className="text-right">Qty</th><th className="text-right">Entry</th><th className="text-right">Exit</th><th>Exit reason</th><th className="text-right">Gross</th><th className="text-right">Charges</th><th className="text-right">Net P&L</th><th>Broker</th><th>Strategy</th></tr>
              </thead>
              <tbody>
                {trades.map((t) => (
                  <tr key={t.id}>
                    <td className="mono">{istTime(t.closedAt)}</td>
                    <td>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold ${t.mode === "LIVE" ? "bg-[#10b981]/20 text-[#10b981] border border-[#10b981]/40" : "bg-[#f59e0b]/20 text-[#f59e0b] border border-[#f59e0b]/40"}`}>
                        {t.mode === "LIVE" ? "L LIVE" : "P PAPER"}
                      </span>
                    </td>
                    <td><b>{t.symbol}</b></td>
                    <td><Badge tone={t.side === "BUY" ? "bull" : "bear"}>{t.side}</Badge></td>
                    <td className="mono text-right">{t.qty}</td>
                    <td className="mono text-right">{num(t.entryPrice)}</td>
                    <td className="mono text-right">{num(t.exitPrice)}</td>
                    <td className="muted">{t.exitReason}</td>
                    <td className={`mono text-right ${pnlClass(t.grossPnl)}`}>{inr(t.grossPnl)}</td>
                    <td className="mono text-right text-[#f59e0b]">{inr(t.totalCharges)}</td>
                    <td className={`mono text-right font-bold ${pnlClass(t.netPnl)}`}>
                      <span className={`text-[9.5px] font-bold px-1 py-0.2 mr-1 rounded ${t.mode === "LIVE" ? "bg-[#10b981]/20 text-[#10b981]" : "bg-[#f59e0b]/20 text-[#f59e0b]"}`}>
                        {t.mode === "LIVE" ? "L" : "P"}
                      </span>
                      {inr(t.netPnl)}
                    </td>
                    <td>{t.broker.toUpperCase()}</td>
                    <td className="muted">{t.strategy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Panel>
    </div>
  );
}

export function PositionsPage({ ctx }: { ctx: Ctx }) {
  const { positions, pnl } = ctx.state!;
  const [brokerSync, setBrokerSync] = useState<{ broker: string; positions: { ok: boolean; positions: unknown[]; error?: string }; orders: { ok: boolean; orders: unknown[]; error?: string } }[] | null>(null);
  const [syncing, setSyncing] = useState(false);

  const close = async (id: number) => {
    const r = await api<{ ok: boolean; net: number; reason?: string }>(`/api/positions/${id}/close`, {});
    ctx.toast(r.ok ? `Position squared off, net ${inr(r.net)}` : r.reason || "Close failed", r.ok ? "ok" : "err");
    await ctx.refresh();
  };
  const syncBrokers = async () => {
    setSyncing(true);
    try {
      const r = await api<{ ok: boolean; brokers: typeof brokerSync }>("/api/brokers/positions");
      setBrokerSync(r.brokers ?? null);
      ctx.toast("Synced live broker positions & order books", "info");
    } finally {
      setSyncing(false);
    }
  };
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-5 gap-3">
        <Panel><Stat label="Open positions" value={positions.length} /></Panel>
        <Panel><Stat label="Open MTM" value={inr(pnl.unrealized)} cls={pnlClass(pnl.unrealized)} /></Panel>
        <Panel><Stat label="Realized (net)" value={inr(pnl.realized)} cls={pnlClass(pnl.realized)} /></Panel>
        <Panel>
          <button className="btn btn-primary w-full !h-9" disabled={syncing} onClick={() => void syncBrokers()}>
            {syncing ? "Syncing…" : "Sync Live Broker Books"}
          </button>
        </Panel>
        <Panel>
          <button className="btn btn-bear w-full !h-9" disabled={!positions.length} onClick={async () => { const x = await api<{ closed: number }>("/api/engine", { action: "squareoff-all" }); ctx.toast(`Squared off ${x.closed}`, "ok"); await ctx.refresh(); }}>
            Square off all
          </button>
        </Panel>
      </div>
      <Panel title="Open Positions · MIS" bodyClass="p-0">
        {positions.length === 0 ? (
          <Empty>No open positions.</Empty>
        ) : (
          <table className="grid">
            <thead>
              <tr><th>Symbol</th><th>Mode</th><th>Side</th><th className="text-right">Qty</th><th className="text-right">Avg entry</th><th className="text-right">LTP</th><th className="text-right">Stop-loss</th><th className="text-right">Target</th><th className="text-right">MTM P&L</th><th>Broker</th><th>Strategy</th><th>Opened</th><th></th></tr>
            </thead>
            <tbody>
              {positions.map((p) => (
                <tr key={p.id}>
                  <td><b>{p.symbol}</b> <span className="muted text-[10.5px]">{p.exchange}</span></td>
                  <td><Badge tone={p.mode === "LIVE" ? "bear" : "amber"}>{p.mode ?? "PAPER"}</Badge></td>
                  <td><Badge tone={p.side === "BUY" ? "bull" : "bear"}>{p.side}</Badge></td>
                  <td className="mono text-right">{p.qty}</td>
                  <td className="mono text-right">{num(p.entryPrice)}</td>
                  <td className="mono text-right">{num(p.ltp)}</td>
                  <td className="mono text-right down">{num(p.slPrice)}</td>
                  <td className="mono text-right up">{num(p.targetPrice)}</td>
                  <td className={`mono text-right font-bold ${pnlClass(p.mtm)}`}>{inr(p.mtm)}</td>
                  <td>{p.broker.toUpperCase()}</td>
                  <td className="muted">{p.strategy}</td>
                  <td className="mono">{istTime(p.openedAt)}</td>
                  <td><button className="btn btn-bear !h-6 !text-[11px]" onClick={() => void close(p.id)}>Square off</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
      {brokerSync && (
        <Panel title="Live Broker Exchange Positions & Order Books">
          <div className="grid grid-cols-3 gap-3 text-[11.5px]">
            {brokerSync.map((b) => (
              <div key={b.broker} className="rounded-md p-2 border" style={{ borderColor: "var(--line)", background: "rgba(8,11,16,.55)" }}>
                <div className="flex justify-between mb-1">
                  <b className="uppercase">{b.broker}</b>
                  <span className="mono muted">{b.positions.ok ? `${b.positions.positions.length} pos / ${b.orders.orders.length} ord` : b.positions.error}</span>
                </div>
                <pre className="mono text-[10px] overflow-auto max-h-[160px]">{JSON.stringify({ positions: b.positions.positions, orders: b.orders.orders }, null, 1)}</pre>
              </div>
            ))}
          </div>
        </Panel>
      )}
    </div>
  );
}

function Gauge({ value, threshold, label }: { value: number; threshold: number; label: string }) {
  const r = 70;
  const cx = 90;
  const cy = 86;
  const arc = (pct: number) => {
    const a = Math.PI * (1 - pct / 100);
    return [cx + r * Math.cos(a), cy - r * Math.sin(a)] as const;
  };
  const [x1, y1] = arc(value);
  const [tx1, ty1] = arc(threshold);
  const [tx2, ty2] = [cx + (r + 9) * Math.cos(Math.PI * (1 - threshold / 100)), cy - (r + 9) * Math.sin(Math.PI * (1 - threshold / 100))];
  const ok = value >= threshold;
  return (
    <svg viewBox="0 0 180 104" width="100%" style={{ maxWidth: 260 }}>
      <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} stroke="rgba(148,163,184,.15)" strokeWidth="11" fill="none" strokeLinecap="round" />
      {value > 0 && <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${x1} ${y1}`} stroke={ok ? "#10b981" : "#00e5ff"} strokeWidth="11" fill="none" strokeLinecap="round" />}
      <line x1={tx1} y1={ty1} x2={tx2} y2={ty2} stroke="#f59e0b" strokeWidth="2" />
      <text x={cx} y={cy - 10} textAnchor="middle" fill={ok ? "#10b981" : "#e6edf3"} fontSize="26" fontWeight="700" fontFamily="Cascadia Mono, Consolas, monospace">{value}%</text>
      <text x={cx} y={cy + 8} textAnchor="middle" fill="#7b8794" fontSize="9">{label} · gate ≥ {threshold}%</text>
    </svg>
  );
}

export function ConsensusPage({ ctx }: { ctx: Ctx }) {
  const { market, state } = ctx;
  const c = market?.consensus;
  const [scanning, setScanning] = useState(false);
  if (!c || !state) return <Empty>Loading consensus telemetry…</Empty>;
  const scan = async () => {
    setScanning(true);
    try {
      const r = await api<{ scanned: number; fired: number; results: { symbol: string; status: string }[] }>("/api/engine", { action: "scan" });
      ctx.toast(`Scanned ${r.scanned} · ${r.fired} order(s) routed${r.results.length - r.fired ? ` · ${r.results.length - r.fired} rejected by gates` : ""}`, r.fired ? "ok" : "info");
      await ctx.refresh();
    } finally {
      setScanning(false);
    }
  };
  const toggleAuto = async () => {
    await api("/api/config", { autoTrade: !state.risk.autoTrade });
    await ctx.refresh();
  };
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <h2 className="text-[14px] font-bold">{ctx.symbol}</h2>
        <Badge tone={regimeTone(c.regime.regime)}>{c.regime.regime}</Badge>
        {c.waveGate && (
          <Badge tone={c.waveGate.active ? "bull" : "amber"}>
            {c.waveGate.active ? `⚡ WAVE UNLOCKED (${c.waveGate.waveType})` : "⏸ WAVE GATE: CONSOLIDATION PAUSED"}
          </Badge>
        )}
        {c.regime.meanReversionActive && <Badge tone="cyan">TREND-FOLLOWING SUPPRESSED · MEAN-REVERSION ACTIVE</Badge>}
        <div className="flex-1" />
        <button className={`btn ${state.risk.autoTrade ? "btn-bull" : ""}`} onClick={() => void toggleAuto()}>Auto-trade: {state.risk.autoTrade ? "ON" : "OFF"}</button>
        <button className="btn btn-primary" disabled={scanning} onClick={() => void scan()}>{scanning ? "Scanning…" : "Run autonomous scan"}</button>
      </div>

      {c.strategies.length === 0 ? (
        <Panel title="Strategy Voters">
          <Empty>MARKET CLOSED / WS DISCONNECTED — Awaiting at least 30 real 1m candles from Angel One to compute quorum voters.</Empty>
        </Panel>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-2.5">
          {c.strategies.map((s) => (
            <Panel key={s.id} title={s.name} right={<Badge tone={s.vote === 1 ? "bull" : s.vote === -1 ? "bear" : "mute"}>{s.vote === 1 ? "BUY" : s.vote === -1 ? "SELL" : "FLAT"}</Badge>}>
              <div className="space-y-2">
                <div className="meter"><i style={{ width: `${s.strength}%`, background: s.vote === 1 ? "#10b981" : s.vote === -1 ? "#ef4444" : "#475569" }} /></div>
                <div className="flex justify-between text-[10.5px] muted"><span>{s.family.replace("_", " ")}</span><span className="mono">strength {Math.round(s.strength)}</span></div>
                <div className="text-[11.5px] min-h-[32px]">{s.detail}</div>
              </div>
            </Panel>
          ))}
        </div>
      )}

      <div className="grid grid-cols-3 gap-3">
        <Panel title="Quorum Gauge">
          <div className="flex flex-col items-center">
            <Gauge value={c.quorumPct} threshold={state.risk.quorumPct} label="Quorum" />
            <div className="text-[11.5px] muted mono">{c.buyVotes} BUY · {c.sellVotes} SELL · {c.voters} voters</div>
          </div>
        </Panel>
        <Panel title="GBM Probability Meter">
          <div className="space-y-3">
            <div className="flex justify-between mono text-[12px]"><span className="up">P(up) {c.gbm.up}%</span><span className="down">P(down) {c.gbm.down}%</span></div>
            <div className="meter" style={{ height: 14 }}>
              <i style={{ width: `${c.gbm.up}%`, background: "linear-gradient(90deg,#065f46,#10b981)" }} />
              <span style={{ position: "absolute", left: `${state.risk.gbmMin}%`, top: 0, bottom: 0, width: 2, background: "#f59e0b" }} />
              <span style={{ position: "absolute", left: `${100 - state.risk.gbmMin}%`, top: 0, bottom: 0, width: 2, background: "#f59e0b" }} />
            </div>
            <div className="text-[11px] muted">Gate: directional probability ≥ {state.risk.gbmMin}% over a {c.gbm.horizon}-minute horizon. Current for {c.direction}: <b className="mono">{c.gbm.forDirection}%</b></div>
          </div>
        </Panel>
        <Panel title="Verdict · regime telemetry">
          <div className="space-y-2 text-[12px]">
            <div className="flex justify-between items-center"><span className="muted">Direction</span><Badge tone={c.direction === "BUY" ? "bull" : c.direction === "SELL" ? "bear" : "mute"}>{c.direction}</Badge></div>
            <div className="flex justify-between items-center"><span className="muted">Qualifies for execution</span>{c.qualifies ? <Badge tone="bull">YES</Badge> : <Badge tone="bear">NO</Badge>}</div>
            <div className="grid grid-cols-3 gap-2 pt-1">
              <Stat label="ADX14" value={c.regime.adx} sub={`+DI ${c.regime.plusDI} / -DI ${c.regime.minusDI}`} />
              <Stat label="ATR ratio" value={c.regime.atrRatio} />
              <Stat label="BB width" value={`${c.regime.bbWidth}%`} sub={`×${c.regime.bbWidthRatio}`} />
            </div>
            {c.suppressed.map((s) => <div key={s.id} className="text-[11px] muted">⛔ {s.name}: {s.detail}</div>)}
          </div>
        </Panel>
      </div>
    </div>
  );
}
