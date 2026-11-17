"use client";

import { useEffect, useState } from "react";
import Chart from "../Chart";
import type { Ctx } from "../ctx";
import { BROKER_NAMES, type BrokerKey, type Pos } from "../types";
import { api, Badge, Empty, Field, inr, istTime, num, Panel, pnlClass, regimeTone, Stat, statusTone } from "../ui";

type OrderResp = { ok: boolean; status: string; reason?: string; details?: Record<string, unknown> };

export function OrderTicket({ ctx }: { ctx: Ctx }) {
  const { state, market, symbol } = ctx;
  const [qty, setQty] = useState("");
  const [broker, setBroker] = useState("");
  const [orderType, setOrderType] = useState<"MARKET" | "LIMIT">("MARKET");
  const [limitPrice, setLimitPrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<OrderResp | null>(null);
  const cons = market?.consensus;
  const risk = state?.risk;
  const mode = risk?.tradingMode ?? "PAPER";

  const send = async (side: "BUY" | "SELL") => {
    if (mode === "LIVE" && !confirm(`Confirm LIVE ${orderType} ${side} order for ${symbol}?`)) return;
    setBusy(true);
    try {
      const r = await api<OrderResp>("/api/orders", {
        symbol,
        side,
        qty: qty ? Number(qty) : undefined,
        orderType,
        price: orderType === "LIMIT" && limitPrice ? Number(limitPrice) : undefined,
        broker: broker || undefined,
        strategy: "MANUAL",
      });
      setLast(r);
      ctx.toast(
        r.ok ? `${symbol} ${side} routed (${String(r.details?.mode ?? mode).toLowerCase()})` : `Rejected: ${r.reason}`,
        r.ok ? "ok" : "err",
      );
      await ctx.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Panel title="Order Ticket · MIS" right={<Badge tone={mode === "LIVE" ? "bear" : "amber"}>{mode}</Badge>}>
      <div className="space-y-3">
        <div className="flex items-baseline justify-between">
          <div>
            <div className="text-[15px] font-bold">{symbol}</div>
            <div className="text-[11px] muted">
              {market?.inst.exchange} · lot {market?.inst.lotSize} · token {market?.inst.token}
            </div>
          </div>
          <div className="mono text-[18px] font-semibold">{market ? num(market.ltp) : "—"}</div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Qty" hint="Blank = Kelly-ATR auto size">
            <input className="input mono" inputMode="numeric" placeholder="auto" value={qty} onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))} />
          </Field>
          <Field label="Order Type">
            <select className="input" value={orderType} onChange={(e) => setOrderType(e.target.value as "MARKET" | "LIMIT")}>
              <option value="MARKET">MARKET</option>
              <option value="LIMIT">LIMIT</option>
            </select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Route via">
            <select className="input" value={broker} onChange={(e) => setBroker(e.target.value)}>
              <option value="">Primary ({BROKER_NAMES[risk?.primaryBroker ?? "angel"]})</option>
              <option value="angel">Angel One</option>
              <option value="shoonya">Shoonya</option>
              <option value="groww">Groww</option>
            </select>
          </Field>
          {orderType === "LIMIT" ? (
            <Field label="Limit Price">
              <input className="input mono" inputMode="decimal" placeholder={market ? String(market.ltp) : "0.00"} value={limitPrice} onChange={(e) => setLimitPrice(e.target.value)} />
            </Field>
          ) : (
            <div />
          )}
        </div>
        <div className="grid grid-cols-2 gap-2">
          <button className="btn btn-bull !h-9" disabled={busy} onClick={() => void send("BUY")}>
            BUY
          </button>
          <button className="btn btn-bear !h-9" disabled={busy} onClick={() => void send("SELL")}>
            SELL
          </button>
        </div>
        <div className="text-[11px] muted leading-relaxed">
          Gates: circuit breaker → sizing (≤ ₹{risk?.capital}) → bracket SL (≤ ₹{risk?.maxSL}) → ₹{risk?.hurdle} net hurdle → 3-broker failover route.
          {cons && (
            <>
              {" "}
              ATR14 <span className="mono">{cons.atr.toFixed(2)}</span>.
            </>
          )}
        </div>
        {last && (
          <div className="rounded-md p-2 text-[11.5px] border" style={{ borderColor: last.ok ? "rgba(16,185,129,.5)" : "rgba(239,68,68,.5)", background: "rgba(8,11,16,.6)" }}>
            <div className="mb-1">
              <Badge tone={last.ok ? "bull" : "bear"}>{last.status}</Badge>
            </div>
            <div className="muted break-words">{last.reason ?? "Order acknowledged and bracket attached."}</div>
          </div>
        )}
      </div>
    </Panel>
  );
}

export function BrokerCard({ ctx, b }: { ctx: Ctx; b: BrokerKey }) {
  const s = ctx.state?.brokers[b];
  const primary = ctx.state?.risk.primaryBroker === b;
  const fails = ctx.state?.failures[b] ?? 0;
  return (
    <div className="glass p-3 flex flex-col gap-2 min-w-0">
      <div className="flex items-center justify-between">
        <div className="text-[13px] font-bold">{BROKER_NAMES[b]}</div>
        <div className="flex gap-1">
          {primary && <Badge tone="cyan">PRIMARY</Badge>}
          <Badge tone={statusTone(s?.state ?? "")}>{s?.state?.replace("_", " ") ?? "…"}</Badge>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Available" value={s?.funds ? inr(s.funds.available) : "—"} sub={s?.funds ? "live API" : "not synced"} />
        <Stat label="Margin used" value={s?.funds ? inr(s.funds.used) : "—"} />
      </div>
      <div className="text-[11px] muted truncate" title={s?.message}>
        {s?.message} {fails > 0 && <span className="down">· {fails} consecutive failure(s)</span>}
      </div>
    </div>
  );
}

export function DashboardPage({ ctx }: { ctx: Ctx }) {
  const { state, market, watch } = ctx;
  if (!state) return null;
  const p = state.pnl;
  const winRate = p.trades ? Math.round((p.wins / p.trades) * 100) : 0;
  const cons = market?.consensus;
  return (
    <div className="space-y-3">
      <div className="flex gap-2 overflow-x-auto scroll pb-1">
        {watch.slice(0, 14).map((w) => (
          <button key={w.symbol} onClick={() => ctx.setSymbol(w.symbol)} className="TickerCard glass px-2 py-1.5 text-left" style={{ borderColor: ctx.symbol === w.symbol ? "rgba(0,229,255,.6)" : undefined }}>
            <div className="text-[11px] font-bold truncate">{w.symbol}</div>
            <div className="mono text-[12.5px] font-semibold">
              {w.ltp !== null ? (w.ltp >= 10000 ? Math.round(w.ltp).toLocaleString("en-IN") : w.ltp.toFixed(2)) : "—"}
            </div>
            <div className={`mono text-[10.5px] ${w.ltp !== null ? pnlClass(w.changePct) : "muted"}`}>
              {w.ltp !== null ? `${w.changePct >= 0 ? "+" : ""}${w.changePct.toFixed(2)}%` : "NO TICK"}
            </div>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3">
        {(["angel", "shoonya", "groww"] as BrokerKey[]).map((b) => (
          <BrokerCard key={b} ctx={ctx} b={b} />
        ))}
      </div>

      <div className="grid grid-cols-[1fr_300px] gap-3">
        <Panel
          title={`${ctx.symbol} · 1m · mini chart`}
          bodyClass="p-0"
          right={
            <button className="btn !h-6 !text-[11px]" onClick={() => ctx.go(1)}>
              Expand ↗
            </button>
          }
        >
          <Chart data={market} height={300} mini />
        </Panel>
        <OrderTicket ctx={ctx} />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Panel
          title="Today · Net Performance"
          right={
            <div className="flex items-center gap-1.5">
              {state.risk.tradingMode === "LIVE" ? (
                <span className="px-2 py-0.5 rounded text-[10.5px] font-extrabold bg-[#10b981]/20 text-[#10b981] border border-[#10b981]/50 inline-flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#10b981]" /> L LIVE
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded text-[10.5px] font-extrabold bg-[#f59e0b]/20 text-[#f59e0b] border border-[#f59e0b]/50 inline-flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#f59e0b]" /> P PAPER
                </span>
              )}
            </div>
          }
        >
          <div className="space-y-2.5">
            <div className="grid grid-cols-3 gap-3">
              <Stat
                label="Net P&L"
                value={
                  <span className="inline-flex items-center gap-1">
                    <span className={`text-[10px] font-bold px-1 py-0.2 rounded ${state.risk.tradingMode === "LIVE" ? "bg-[#10b981]/20 text-[#10b981]" : "bg-[#f59e0b]/20 text-[#f59e0b]"}`}>
                      {state.risk.tradingMode === "LIVE" ? "L" : "P"}
                    </span>
                    {inr(p.total)}
                  </span>
                }
                cls={pnlClass(p.total)}
              />
              <Stat label="Realized" value={inr(p.realized)} cls={pnlClass(p.realized)} />
              <Stat label="Open MTM" value={inr(p.unrealized)} cls={pnlClass(p.unrealized)} />
              <Stat label="Taxes & fees" value={inr(p.charges)} cls="text-[#f59e0b]" />
              <Stat label="Trades" value={p.trades} />
              <Stat label="Win rate" value={`${winRate}%`} />
            </div>

            {/* Strict Segregation Footer: Zero-State guarantee */}
            <div className="flex items-center justify-between text-[11px] pt-1.5 border-t border-[var(--line)]">
              <span className="text-muted flex items-center gap-1">
                <span className="px-1 py-0.2 text-[9.5px] font-bold rounded bg-[#f59e0b]/20 text-[#f59e0b]">P</span>
                Paper: <b className={`mono ${pnlClass(p.paper?.total ?? 0)}`}>{inr(p.paper?.total ?? 0)}</b> ({p.paper?.trades ?? 0}t)
              </span>
              <span className="text-muted flex items-center gap-1">
                <span className="px-1 py-0.2 text-[9.5px] font-bold rounded bg-[#10b981]/20 text-[#10b981]">L</span>
                Live: <b className={`mono ${pnlClass(p.live?.total ?? 0)}`}>{inr(p.live?.total ?? 0)}</b> ({p.live?.trades ?? 0}t)
              </span>
            </div>
          </div>
        </Panel>
        <Panel title="Risk Sentinel">
          <div className="space-y-2 text-[12px]">
            <div className="flex justify-between"><span className="muted">Allocated capital</span><span className="mono">{inr(state.risk.capital)}</span></div>
            <div className="flex justify-between"><span className="muted">Max SL / trade</span><span className="mono">{inr(state.risk.maxSL)}</span></div>
            <div className="flex justify-between"><span className="muted">Circuit floor (daily)</span><span className="mono">-{inr(state.risk.drawdownFloor)}</span></div>
            <div className="flex justify-between"><span className="muted">Net hurdle</span><span className="mono">{inr(state.risk.hurdle)}</span></div>
            <div className="flex justify-between items-center"><span className="muted">Breaker</span>{state.circuit.tripped ? <Badge tone="bear">TRIPPED</Badge> : state.recovery?.active ? <Badge tone="amber" className="animate-pulse">RECOVERY WATCH (200/800)</Badge> : <Badge tone="bull">ARMED</Badge>}</div>
            <div className="flex justify-between items-center"><span className="muted">Crash Lock</span>{state.crashProtection?.active ? <Badge tone="amber">CRASH PROTECT ON</Badge> : <Badge tone="bull">FEED LIVE</Badge>}</div>
            <div className="meter"><i style={{ width: `${Math.min(100, Math.max(0, (-p.total / state.risk.drawdownFloor) * 100))}%`, background: "linear-gradient(90deg,#f59e0b,#ef4444)" }} /></div>
            <div className="text-[10.5px] muted">Drawdown used: {Math.round(Math.min(100, Math.max(0, (-p.total / state.risk.drawdownFloor) * 100)))}%</div>
            {state.recovery?.active && (
              <div className="text-[11px] p-1.5 rounded bg-[#f59e0b]/10 border border-[#f59e0b]/30 text-[#f59e0b]">
                <b>Recovery Watch Active:</b> Deploying remaining {inr(state.recovery.remainingCapital)} on ≥90% quorum setups to recover {inr(state.recovery.deficit)} deficit.
              </div>
            )}
          </div>
        </Panel>
        <Panel title="Signal · current symbol">
          {cons ? (
            <div className="space-y-2 text-[12px]">
              <div className="flex items-center justify-between"><span className="muted">Regime</span><Badge tone={regimeTone(cons.regime.regime)}>{cons.regime.regime}</Badge></div>
              <div className="flex items-center justify-between"><span className="muted">Direction</span><Badge tone={cons.direction === "BUY" ? "bull" : cons.direction === "SELL" ? "bear" : "mute"}>{cons.direction}</Badge></div>
              <div className="flex justify-between"><span className="muted">Quorum</span><span className="mono">{cons.quorumPct}% (≥{state.risk.quorumPct})</span></div>
              <div className="flex justify-between"><span className="muted">GBM probability</span><span className="mono">{cons.gbm.forDirection}% (≥{state.risk.gbmMin})</span></div>
              <div className="flex justify-between items-center"><span className="muted">Qualifies</span>{cons.qualifies ? <Badge tone="bull">YES</Badge> : <Badge>NO</Badge>}</div>
              <button className="btn w-full" onClick={() => ctx.go(6)}>Open consensus matrix</button>
            </div>
          ) : (
            <Empty>Loading signal…</Empty>
          )}
        </Panel>
      </div>
    </div>
  );
}

export function LiveTradingPage({ ctx }: { ctx: Ctx }) {
  const { state, market } = ctx;
  if (!state) return null;
  const pos = state.positions.find((p) => p.symbol === ctx.symbol);
  const overlay = pos ? { entry: pos.entryPrice, sl: pos.slPrice, target: pos.targetPrice, side: pos.side } : null;
  const d = market?.depth;
  const depthLen = d ? Math.max(d.bids.length, d.asks.length) : 0;
  const maxQ = Math.max(1, ...(d ? [...d.bids, ...d.asks].map((r) => r.qty) : [1]));
  const working = state.orders.filter((o) => o.status === "OPEN").slice(0, 6);
  const cancelOrd = async (id: number) => {
    const r = await api<{ ok: boolean; reason?: string }>(`/api/orders/${id}/cancel`, {});
    ctx.toast(r.ok ? `Order #${id} cancelled` : r.reason || "Cancel failed", r.ok ? "ok" : "err");
    await ctx.refresh();
  };
  return (
    <div className="grid grid-cols-[1fr_300px] gap-3">
      <div className="space-y-3 min-w-0">
        <Panel
          title={`${ctx.symbol} · ${market?.inst.name ?? ""} · 1m`}
          bodyClass="p-0"
          right={
            <div className="flex items-center gap-3 text-[11px] mono">
              <span style={{ color: "#f59e0b" }}>— VWAP</span>
              <span style={{ color: "#00e5ff" }}>— EMA9</span>
              <span style={{ color: "#a78bfa" }}>— EMA21</span>
              <Badge tone="cyan">30 FPS</Badge>
            </div>
          }
        >
          <Chart data={market} height={460} overlay={overlay} />
        </Panel>
        <Panel title="Active working orders / brackets" bodyClass="p-0">
          {state.positions.length === 0 && working.length === 0 ? (
            <Empty>No working orders or open brackets</Empty>
          ) : (
            <table className="grid">
              <thead>
                <tr><th>Time</th><th>Symbol</th><th>Side</th><th>Qty</th><th>Price</th><th>SL</th><th>Target</th><th>Broker</th><th>Status</th><th></th></tr>
              </thead>
              <tbody>
                {working.map((o) => (
                  <tr key={`ord-${o.id}`}>
                    <td className="mono">{istTime(o.ts)}</td><td>{o.symbol}</td>
                    <td><Badge tone={o.side === "BUY" ? "bull" : "bear"}>{o.side}</Badge></td>
                    <td className="mono">{o.qty}</td><td className="mono">{num(o.price)}</td>
                    <td className="mono down">{num(o.slPrice)}</td><td className="mono up">{num(o.targetPrice)}</td>
                    <td>{(o.brokerRequested ?? "—").toUpperCase()}</td><td><Badge tone="amber">OPEN LIMIT</Badge></td>
                    <td><button className="btn btn-bear !h-6 !text-[11px]" onClick={() => void cancelOrd(o.id)}>Cancel</button></td>
                  </tr>
                ))}
                {state.positions.map((p: Pos) => (
                  <tr key={`pos-${p.id}`}>
                    <td className="mono">{istTime(p.openedAt)}</td><td>{p.symbol}</td>
                    <td><Badge tone={p.side === "BUY" ? "bull" : "bear"}>{p.side}</Badge></td>
                    <td className="mono">{p.qty}</td><td className="mono">{num(p.entryPrice)}</td>
                    <td className="mono down">{num(p.slPrice)}</td><td className="mono up">{num(p.targetPrice)}</td>
                    <td>{p.broker.toUpperCase()}</td><td><Badge tone="cyan">BRACKET LIVE</Badge></td>
                    <td></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>
      <div className="space-y-3">
        <Panel title="L2 Market Depth (DOM)" bodyClass="p-0">
          {d && depthLen > 0 ? (
            <table className="grid">
              <thead><tr><th>Bid qty</th><th>Bid</th><th>Ask</th><th>Ask qty</th></tr></thead>
              <tbody>
                {Array.from({ length: depthLen }).map((_, i) => {
                  const b = d.bids[i];
                  const a = d.asks[i];
                  return (
                    <tr key={i}>
                      <td className="mono up" style={{ background: b ? `linear-gradient(270deg, rgba(16,185,129,.22) ${(b.qty / maxQ) * 100}%, transparent 0)` : undefined }}>{b ? b.qty : "—"}</td>
                      <td className="mono up">{b ? num(b.price) : "—"}</td>
                      <td className="mono down">{a ? num(a.price) : "—"}</td>
                      <td className="mono down" style={{ background: a ? `linear-gradient(90deg, rgba(239,68,68,.22) ${(a.qty / maxQ) * 100}%, transparent 0)` : undefined }}>{a ? a.qty : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <Empty>{market?.feed === "ANGEL_WS_V2" ? "Awaiting Mode 3 depth…" : "No depth — MARKET CLOSED / WS DISCONNECTED"}</Empty>
          )}
        </Panel>
        <OrderTicket ctx={ctx} />
      </div>
    </div>
  );
}

export function RiskPage({ ctx }: { ctx: Ctx }) {
  const { state, market } = ctx;
  const r = state!.risk;
  const [tradingMode, setTradingMode] = useState<"PAPER" | "LIVE">(r.tradingMode ?? "PAPER");
  const [capital, setCapital] = useState(String(r.capital));
  const [riskPct, setRiskPct] = useState(String(r.riskPct));
  const [floor, setFloor] = useState(String(r.drawdownFloor));
  const [hurdle, setHurdle] = useState(String(r.hurdle));
  const [rr, setRr] = useState(String(r.rewardRisk));
  const [lev, setLev] = useState(String(r.leverage));
  const [maxPos, setMaxPos] = useState(String(r.maxOpenPositions ?? 5));
  const [enforce, setEnforce] = useState(r.enforceSessions);
  const [auto, setAuto] = useState(r.autoTrade);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setAuto(r.autoTrade), 0);
    return () => clearTimeout(t);
  }, [r.autoTrade]);

  const calcSL = Math.round(Number(capital) * Number(riskPct)) / 100;
  const onRisk = (cap: string, pct: string) => {
    const sl = Math.round(Number(cap) * Number(pct)) / 100;
    setFloor(String(Math.round(sl * 2.5 * 100) / 100));
  };

  const save = async (overrideAuto?: boolean) => {
    const nextAuto = overrideAuto !== undefined ? overrideAuto : auto;
    if (tradingMode === "LIVE" && r.tradingMode !== "LIVE") {
      if (!confirm("WARNING: Enabling LIVE mode dispatches real broker orders with real capital. Proceed?")) return;
    }
    setSaving(true);
    try {
      await api("/api/config", {
        tradingMode,
        capital: Number(capital),
        riskPct: Number(riskPct),
        drawdownFloor: Number(floor),
        hurdle: Number(hurdle),
        rewardRisk: Number(rr),
        leverage: Number(lev),
        maxOpenPositions: Number(maxPos),
        enforceSessions: enforce,
        autoTrade: nextAuto,
      });
      if (overrideAuto !== undefined) setAuto(overrideAuto);
      if (nextAuto) {
        // Trigger immediate first scan cycle
        void api("/api/engine", { action: "scan" }).catch(() => {});
      }
      await ctx.refresh();
      ctx.toast(
        overrideAuto !== undefined
          ? nextAuto
            ? "▶ Auto-Trader started (5s scan cycle active) ✓"
            : "⏹ Auto-Trader stopped (Open brackets protected)"
          : `Risk configuration saved (${tradingMode} mode)`,
        "ok",
      );
    } finally {
      setSaving(false);
    }
  };

  const cons = market?.consensus;
  const gbmFor = cons ? (cons.direction === "SELL" ? cons.gbm.down : cons.gbm.up) : 50;
  const conf = Math.min(1, Math.max(0.25, 0.5 + (gbmFor / 100 - 0.5) * 2));
  const entry = market?.ltp ?? 0;
  const atr = cons?.atr ?? 0;
  const maxExpCap = r.capital * r.leverage * 0.2;
  const maxRiskAmt = r.capital * (Number(r.riskPct || 1) / 100);
  const capCap = entry ? Math.floor((maxExpCap * conf) / entry) : 0;
  const riskCap = atr ? Math.floor(maxRiskAmt / (atr * 1.5)) : 0;

  return (
    <div className="grid grid-cols-[1fr_380px] gap-3">
      <Panel title="Administrator Risk Sovereignty">
        <div className="grid grid-cols-3 gap-4">
          <Field label="Allocated Capital (₹)" hint="Sizing never exceeds this">
            <input className="input mono" value={capital} onChange={(e) => { setCapital(e.target.value); onRisk(e.target.value, riskPct); }} />
          </Field>
          <Field label="Risk per trade (%)" hint="Of allocated capital">
            <input className="input mono" value={riskPct} onChange={(e) => { setRiskPct(e.target.value); onRisk(capital, e.target.value); }} />
          </Field>
          <Field label="Calculated Max SL (₹)" hint="Capital × Risk %">
            <input className="input mono" readOnly value={calcSL.toFixed(2)} style={{ color: "#00e5ff" }} />
          </Field>
          <Field label="Daily Drawdown Floor (₹)" hint="Default 2.5× SL · trips the circuit breaker">
            <input className="input mono" value={floor} onChange={(e) => setFloor(e.target.value)} />
          </Field>
          <Field label="Statutory Net Hurdle (₹)" hint="Shoonya ₹25 · Angel One ₹70">
            <input className="input mono" value={hurdle} onChange={(e) => setHurdle(e.target.value)} />
          </Field>
          <Field label="Reward : Risk (target)" hint="Target = SL distance × R (1:3+ minimum)">
            <input className="input mono" value={rr} onChange={(e) => setRr(e.target.value)} />
          </Field>
          <Field label="MIS leverage multiplier" hint="1 = strictly allocated capital">
            <input className="input mono" value={lev} onChange={(e) => setLev(e.target.value)} />
          </Field>
          <Field label="Max Open Positions" hint="Concurrent position cap">
            <input className="input mono" value={maxPos} onChange={(e) => setMaxPos(e.target.value.replace(/\D/g, ""))} />
          </Field>
          <Field label="Execution Mode" hint="LIVE deploys real orders">
            <select className="input" value={tradingMode} onChange={(e) => setTradingMode(e.target.value as "PAPER" | "LIVE")}>
              <option value="PAPER">PAPER (Real Tick Sim)</option>
              <option value="LIVE">LIVE (Real Broker)</option>
            </select>
          </Field>
          <label className="flex items-center gap-2 text-[12px] mt-5">
            <input type="checkbox" checked={enforce} onChange={(e) => setEnforce(e.target.checked)} /> Enforce exchange sessions
          </label>
          <label className="flex items-center gap-2 text-[12px] mt-5 col-span-2">
            <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} /> Autonomous auto-trader daemon (every 5s)
          </label>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button className="btn btn-primary !h-9 !px-5 font-semibold" disabled={saving} onClick={() => void save()}>
            [ 💾 Save &amp; Apply Risk Config ]
          </button>
          {auto ? (
            <button
              type="button"
              className="btn btn-bear !h-9 !px-5 font-bold shadow-md"
              disabled={saving}
              onClick={() => void save(false)}
              title="Pause automated entries while keeping existing open bracket stop-losses protected"
            >
              [ ⏹ Stop Auto-Trading ]
            </button>
          ) : (
            <button
              type="button"
              className="btn btn-bull !h-9 !px-5 font-bold shadow-md"
              disabled={saving}
              onClick={() => void save(true)}
              title="Save config, arm 5s autonomous daemon and trigger immediate scan"
            >
              [ ▶ Start Auto-Trading ]
            </button>
          )}
          {auto ? (
            <Badge tone="bull" className="!text-[12px] !py-1 !px-2.5 font-bold animate-pulse">
              ● AUTO-TRADER RUNNING (5s Scan Active)
            </Badge>
          ) : (
            <Badge tone="amber" className="!text-[12px] !py-1 !px-2.5 font-bold">
              ○ AUTO-TRADER STOPPED
            </Badge>
          )}
          <span className="text-[11px] muted">No daily trade-count limit: every setup that clears quorum, GBM and hurdle executes.</span>
        </div>
      </Panel>

      <div className="space-y-3">
        <Panel title={`Kelly-ATR sizing · ${ctx.symbol}`}>
          <div className="mono text-[12px] space-y-1.5">
            <div className="muted text-[11px]">size = min(⌊20% BP × conf ÷ entry⌋, ⌊1% risk ÷ (ATR14 × 1.5)⌋)</div>
            <div className="flex justify-between"><span className="muted">Entry</span><span>{num(entry)}</span></div>
            <div className="flex justify-between"><span className="muted">ATR(14)</span><span>{num(atr, 3)}</span></div>
            <div className="flex justify-between"><span className="muted">Confidence × (GBM {gbmFor}%)</span><span>{conf.toFixed(2)}</span></div>
            <div className="flex justify-between"><span className="muted">Capital cap</span><span>{capCap}</span></div>
            <div className="flex justify-between"><span className="muted">ATR-risk cap</span><span>{riskCap}</span></div>
            <div className="flex justify-between font-bold"><span>Position size (pre-lot)</span><span className="cyan">{Math.min(capCap, riskCap)}</span></div>
            <div className="text-[11px] muted pt-1">Lot step {market?.inst.lotSize}. Saved config applies on the next order.</div>
          </div>
        </Panel>
        <Panel title="Circuit Breaker & Recovery">
          <div className="space-y-2 text-[12px]">
            <div className="flex justify-between"><span className="muted">State</span>{state!.circuit.tripped ? <Badge tone="bear">TRIPPED</Badge> : state!.recovery?.active ? <Badge tone="amber" className="animate-pulse">RECOVERY WATCH</Badge> : <Badge tone="bull">ARMED</Badge>}</div>
            {state!.circuit.tripped && <div className="down text-[11.5px]">{state!.circuit.reason}</div>}
            {state!.recovery?.active && <div className="text-[11.5px] text-[#f59e0b]">{state!.recovery.reason}</div>}
            <div className="flex justify-between"><span className="muted">Crash Lock</span>{state!.crashProtection?.active ? <Badge tone="amber">ACTIVE (ASSETS LOCKED)</Badge> : <Badge tone="bull">FEED LIVE</Badge>}</div>
            <div className="flex justify-between"><span className="muted">Day net P&L</span><span className={`mono ${pnlClass(state!.pnl.total)}`}>{inr(state!.pnl.total)}</span></div>
            <div className="flex gap-2 pt-1">
              <button className="btn btn-bear flex-1" onClick={async () => { const x = await api<{ closed: number }>("/api/engine", { action: "squareoff-all" }); ctx.toast(`Squared off ${x.closed} position(s)`, "ok"); await ctx.refresh(); }}>Square off all</button>
              <button className="btn flex-1" disabled={!state!.circuit.tripped && !state!.recovery?.active} onClick={async () => { if (confirm("Admin override: unlock live trading and reset recovery / circuit state?")) { await api("/api/engine", { action: "reset-circuit" }); await ctx.refresh(); ctx.toast("Circuit & recovery state reset", "info"); } }}>Admin unlock</button>
            </div>
          </div>
        </Panel>
        <Panel title="Autonomous Auto-Trader Daemon (5s)">
          <div className="space-y-1.5 text-[12px]">
            <div className="flex justify-between items-center">
              <span className="muted">Daemon loop</span>
              {state!.autoTrader?.daemonRunning ? <Badge tone="bull">RUNNING (5s)</Badge> : <Badge tone="amber">STANDBY</Badge>}
            </div>
            <div className="flex justify-between"><span className="muted">Scanner armed</span><span className="mono">{r.autoTrade ? "YES" : "OFF"}</span></div>
            <div className="flex justify-between"><span className="muted">Last tick</span><span className="mono">{istTime(state!.autoTrader?.lastTickAt ?? null)}</span></div>
            <div className="flex justify-between"><span className="muted">Last scan / fired</span><span className="mono">{state!.autoTrader ? `${state!.autoTrader.lastScanCount} scanned · ${state!.autoTrader.lastFiredCount} fired` : "—"}</span></div>
            {state!.autoTrader?.lastError && <div className="down text-[11px]">{state!.autoTrader.lastError}</div>}
          </div>
        </Panel>
      </div>
    </div>
  );
}
