"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Ctx } from "../ctx";
import { BROKER_NAMES, type BrokerKey } from "../types";
import { api, Badge, Empty, Field, inr, istTime, num, Panel, Stat, statusTone } from "../ui";

/* ------------------------------ Strategy Hub ------------------------------ */

type Strategies = {
  builtins: { id: string; name: string; note: string }[];
  plugins: { id: string; name: string; type: string; file: string; params?: Record<string, number> }[];
};

export function StrategyHubPage({ ctx }: { ctx: Ctx }) {
  const [data, setData] = useState<Strategies | null>(null);
  const [kind, setKind] = useState<"TRADINGVIEW" | "CHARTINK">("TRADINGVIEW");
  const [side, setSide] = useState("buy");
  const [secret, setSecret] = useState("");
  const [result, setResult] = useState<string>("");
  const load = useCallback(async () => setData(await api<Strategies>("/api/strategies")), []);
  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);
  const endpoint = typeof window !== "undefined" ? `${window.location.origin}/api/v1/webhook` : "/api/v1/webhook";
  const sample =
    kind === "TRADINGVIEW"
      ? { symbol: ctx.symbol, action: side, strategy: "PineScript-Demo" }
      : { stocks: ctx.symbol, trigger_prices: String(ctx.market?.ltp ?? ""), scan_name: side === "buy" ? "5min bullish breakout" : "5min bearish breakdown", triggered_at: "10:35 am" };
  const plugins = ctx.market?.consensus.plugins ?? [];

  const fire = async () => {
    const r = await fetch("/api/v1/webhook", { method: "POST", headers: { "Content-Type": "application/json", ...(secret ? { "x-webhook-secret": secret } : {}) }, body: JSON.stringify(sample) });
    const j = await r.json();
    setResult(JSON.stringify(j, null, 2));
    await ctx.refresh();
  };

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-3">
        <Panel
          title="Core strategies"
          right={<Badge tone="cyan">{data?.builtins.length ?? 0} built-in</Badge>}
          bodyClass="p-0"
        >
          <table className="grid">
            <tbody>
              {data?.builtins.map((b) => (
                <tr key={b.id}><td><b>{b.name}</b><div className="muted text-[11px]">{b.note}</div></td><td className="text-right"><Badge tone="bull">ACTIVE</Badge></td></tr>
              ))}
            </tbody>
          </table>
        </Panel>
        <Panel
          title="Plug-and-play plugins · /strategies/*.json"
          right={
            <button className="btn !h-6 !text-[11px]" onClick={async () => { const r = await api<{ count: number }>("/api/engine", { action: "reload-strategies" }); await load(); ctx.toast(`Reloaded: ${r.count} plugin(s) discovered`, "ok"); }}>
              ↻ Reload plugins
            </button>
          }
          bodyClass="p-0"
        >
          {!data?.plugins.length ? (
            <Empty>Drop a .json strategy into /strategies and press reload — no reboot.</Empty>
          ) : (
            <table className="grid">
              <thead><tr><th>Plugin</th><th>Type</th><th>File</th><th>Live vote ({ctx.symbol})</th></tr></thead>
              <tbody>
                {data.plugins.map((p) => {
                  const live = plugins.find((x) => x.id === p.id);
                  return (
                    <tr key={p.id}>
                      <td><b>{p.name}</b></td><td className="muted">{p.type}</td><td className="mono muted">{p.file}</td>
                      <td>{live ? <><Badge tone={live.vote === 1 ? "bull" : live.vote === -1 ? "bear" : "mute"}>{live.vote === 1 ? "BUY" : live.vote === -1 ? "SELL" : "FLAT"}</Badge> <span className="muted text-[11px]">{live.detail}</span></> : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <div className="p-3 text-[11px] muted border-t" style={{ borderColor: "var(--line)" }}>
            Schema: {"{ id, name, type: ema_cross | rsi_reversion | breakout, params }"}. Plugin votes are shown alongside the 4-voter quorum.
          </div>
        </Panel>
      </div>

      <Panel title="Webhook Gateway · TradingView & ChartInk">
        <div className="space-y-3 text-[12px]">
          <div>
            <div className="label mb-1">Endpoint (POST JSON)</div>
            <div className="mono p-2 rounded-md break-all" style={{ background: "rgba(8,11,16,.8)", border: "1px solid var(--line)", color: "#00e5ff" }}>{endpoint}</div>
            <div className="muted text-[11px] mt-1">Signals join the quorum as a 5th voter and must still clear regime gate, GBM ≥ {ctx.state?.risk.gbmMin}%, sizing, hurdle and circuit breaker.</div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Field label="Source">
              <select className="input" value={kind} onChange={(e) => setKind(e.target.value as "TRADINGVIEW" | "CHARTINK")}>
                <option value="TRADINGVIEW">TradingView alert</option>
                <option value="CHARTINK">ChartInk 5-min scan</option>
              </select>
            </Field>
            <Field label="Action">
              <select className="input" value={side} onChange={(e) => setSide(e.target.value)}><option value="buy">buy</option><option value="sell">sell</option></select>
            </Field>
            <Field label="Secret (if set)"><input className="input" value={secret} onChange={(e) => setSecret(e.target.value)} /></Field>
          </div>
          <pre className="mono text-[11px] p-2 rounded-md overflow-auto" style={{ background: "rgba(8,11,16,.8)", border: "1px solid var(--line)" }}>{JSON.stringify(sample, null, 2)}</pre>
          <div className="flex gap-2">
            <button className="btn btn-primary" onClick={() => void fire()}>Send test alert</button>
            <WebhookSecret ctx={ctx} />
          </div>
          {result && <pre className="mono text-[11px] p-2 rounded-md overflow-auto max-h-[220px]" style={{ background: "rgba(8,11,16,.8)", border: "1px solid var(--line)" }}>{result}</pre>}
        </div>
      </Panel>
    </div>
  );
}

function WebhookSecret({ ctx }: { ctx: Ctx }) {
  const [v, setV] = useState(ctx.state?.risk.webhookSecret ?? "");
  return (
    <div className="flex gap-2 flex-1">
      <input className="input" placeholder="Set webhook shared secret" value={v} onChange={(e) => setV(e.target.value)} />
      <button className="btn" onClick={async () => { await api("/api/config", { webhookSecret: v }); await ctx.refresh(); ctx.toast("Webhook secret saved", "ok"); }}>Save</button>
    </div>
  );
}

/* ------------------------------ Audit & Pre-flight ------------------------- */

type Pre = {
  ok: boolean; error?: string; symbol: string; exchange: string; token: string; tradingSymbol: string; tokenResolved: boolean; side: string; entry: number; atr: number; conf: number;
  size: { qty: number; capitalCap: number; riskCap: number; slPrice: number; targetPrice: number; slDistance: number; limitedBy: string };
  testQty: number; riskAtStop: number; maxSL: number; slWithinBudget: boolean; hurdle: number; regime: string; chain: string[]; note: string;
  brokers: { broker: string; payload: Record<string, unknown>; charges: { total: number }; expectedNet: number }[];
};

export function AuditPage({ ctx }: { ctx: Ctx }) {
  const [side, setSide] = useState<"BUY" | "SELL">("BUY");
  const [pre, setPre] = useState<Pre | null>(null);
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try {
      const r = await api<Pre>("/api/engine", { action: "preflight", symbol: ctx.symbol, side });
      setPre(r);
      await ctx.refresh();
    } finally {
      setBusy(false);
    }
  };
  const logs = ctx.state!.audit;
  const tone = (l: string) => (l === "CRITICAL" || l === "ERROR" ? "bear" : l === "WARN" ? "amber" : "cyan");
  return (
    <div className="space-y-3">
      <Panel
        title="Pre-Flight 3-Broker Order Test (PAPER)"
        right={
          <div className="flex gap-2 items-center">
            <select className="input !w-[90px] !h-6" value={side} onChange={(e) => setSide(e.target.value as "BUY" | "SELL")}><option>BUY</option><option>SELL</option></select>
            <button className="btn btn-primary !h-6 !text-[11px]" disabled={busy} onClick={() => void run()}>Run pre-flight · {ctx.symbol}</button>
          </div>
        }
      >
        {!pre ? (
          <div className="text-[12px] muted">Builds the Angel One, Shoonya and Groww routing payloads for the selected symbol, verifies bracket SL ≤ max SL, computes statutory charges per broker and writes the audit trail. No position is opened.</div>
        ) : !pre.ok ? (
          <div className="down text-[12px]">{pre.error}</div>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-6 gap-3">
              <Stat label="Entry" value={num(pre.entry)} sub={`${pre.exchange} · tok ${pre.token}`} />
              <Stat label="ATR14" value={num(pre.atr, 3)} />
              <Stat label="Sized qty" value={pre.size.qty} sub={`cap ${pre.size.capitalCap} / risk ${pre.size.riskCap}`} />
              <Stat label="Bracket SL" value={num(pre.size.slPrice)} cls="down" sub={`dist ${pre.size.slDistance}`} />
              <Stat label="Target" value={num(pre.size.targetPrice)} cls="up" />
              <Stat label="Risk at stop" value={inr(pre.riskAtStop)} sub={`budget ${inr(pre.maxSL)}`} cls={pre.slWithinBudget ? "up" : "down"} />
            </div>
            <div className="text-[11.5px] muted">
              {pre.note} · Failover chain: {pre.chain.map((c) => c.toUpperCase()).join(" → ")} · SL within budget: {pre.slWithinBudget ? "✔" : "✖"}
              {!pre.tokenResolved && " · derivative token pending daily master ingestion"}
            </div>
            <div className="grid grid-cols-3 gap-3">
              {pre.brokers.map((b) => (
                <div key={b.broker} className="rounded-md p-2 border" style={{ borderColor: "var(--line)", background: "rgba(8,11,16,.55)" }}>
                  <div className="flex justify-between mb-1"><b className="text-[12px]">{BROKER_NAMES[b.broker as BrokerKey]}</b><span className="mono text-[11px]">charges {inr(b.charges.total)} · exp. net {inr(b.expectedNet)}</span></div>
                  <pre className="mono text-[10.5px] overflow-auto max-h-[200px]">{JSON.stringify(b.payload, null, 1)}</pre>
                </div>
              ))}
            </div>
          </div>
        )}
      </Panel>
      <Panel title="Audit Trail" bodyClass="p-0" right={<span className="muted text-[11px]">{logs.length} latest events</span>}>
        <div className="scroll" style={{ maxHeight: 420 }}>
          <table className="grid">
            <thead><tr><th>Time (IST)</th><th>Level</th><th>Category</th><th>Message</th></tr></thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id}><td className="mono">{istTime(l.ts)}</td><td><Badge tone={tone(l.level)}>{l.level}</Badge></td><td className="muted">{l.category}</td><td className="!whitespace-normal">{l.message}</td></tr>
              ))}
            </tbody>
          </table>
          {logs.length === 0 && <Empty>No audit events yet.</Empty>}
        </div>
      </Panel>
    </div>
  );
}

/* ------------------------------ Gmail EOD ---------------------------------- */

export function EodPage({ ctx }: { ctx: Ctx }) {
  const [html, setHtml] = useState("");
  const [subject, setSubject] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const r = await api<{ html: string; subject: string }>("/api/eod");
    setHtml(r.html);
    setSubject(r.subject);
  }, []);
  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);
  const smtp = ctx.state!.vault.summary.smtp;
  const act = async (kind: "send" | "test") => {
    setBusy(true);
    try {
      const r = await api<{ ok: boolean; error?: string }>("/api/eod", { kind });
      ctx.toast(r.ok ? "Email dispatched via smtp.gmail.com:587" : `Email failed: ${r.error}`, r.ok ? "ok" : "err");
      await ctx.refresh();
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid grid-cols-[320px_1fr] gap-3">
      <div className="space-y-3">
        <Panel title="Gmail dispatcher">
          <div className="space-y-2 text-[12px]">
            <div className="flex justify-between"><span className="muted">SMTP</span><span className="mono">smtp.gmail.com:587</span></div>
            <div className="flex justify-between items-center"><span className="muted">Credentials</span>{smtp?.configured ? <Badge tone="bull">IN VAULT</Badge> : <Badge tone="amber">NOT SET</Badge>}</div>
            <div className="muted text-[11px]">Configure the Gmail address and App Password in Settings (page 11). Stored AES-256-GCM encrypted.</div>
            <div className="flex gap-2 pt-1">
              <button className="btn btn-primary flex-1" disabled={busy} onClick={() => void act("send")}>Send audit now</button>
              <button className="btn flex-1" disabled={busy} onClick={() => void act("test")}>SMTP test</button>
            </div>
            <button className="btn w-full" onClick={() => void load()}>↻ Refresh preview</button>
          </div>
        </Panel>
        <Panel title="Dispatch schedule (IST)">
          <ul className="text-[12px] space-y-1.5">
            <li className="flex justify-between"><span>Equity / NFO close</span><b className="mono">15:35</b></li>
            <li className="flex justify-between"><span>MCX close</span><b className="mono">23:25</b></li>
            <li className="pt-1 label">Instant emergency alerts</li>
            <li>• Daily circuit breaker trips</li>
            <li>• Statutory hurdle rejects an order</li>
            <li>• Broker session drops 3× in a row</li>
          </ul>
        </Panel>
      </div>
      <Panel title={subject || "EOD audit preview"} bodyClass="p-0">
        <iframe title="EOD preview" srcDoc={html} style={{ width: "100%", height: "calc(100vh - 190px)", border: 0, background: "#080b10" }} />
      </Panel>
    </div>
  );
}

/* ------------------------------ Token master ------------------------------- */

type TM = { last: { at: string; rows: number; source: string } | null; total: number; rows: { symbol: string; exchange: string; tradingSymbol: string; token: string; lotSize: number; resolved: boolean }[] };

export function TokenMasterPage({ ctx }: { ctx: Ctx }) {
  const [tm, setTm] = useState<TM | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => setTm(await api<TM>("/api/token-master")), []);
  useEffect(() => {
    const t = setTimeout(() => void load(), 0);
    return () => clearTimeout(t);
  }, [load]);
  const ingest = async () => {
    setBusy(true);
    try {
      const r = await api<{ ok: boolean; rows: number; error?: string }>("/api/token-master", {});
      ctx.toast(r.ok ? `Ingested ${r.rows} contracts` : `Ingestion failed: ${r.error}`, r.ok ? "ok" : "err");
      await load();
      await ctx.refresh();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel
      title="Unified Dynamic Token Master · NSE / NFO / MCX"
      bodyClass="p-0"
      right={
        <div className="flex items-center gap-2">
          <span className="text-[11px] muted">{tm?.last ? `Last ingest ${new Date(tm.last.at).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} · ${tm.last.rows} rows` : "Static fallback tokens in use"}</span>
          <button className="btn btn-primary !h-6 !text-[11px]" disabled={busy} onClick={() => void ingest()}>{busy ? "Downloading master…" : "Ingest now"}</button>
        </div>
      }
    >
      <div className="p-3 text-[11.5px] muted border-b" style={{ borderColor: "var(--line)" }}>
        Auto-ingest 08:45 IST. One human ticker maps to Angel One (symboltoken / tradingsymbol), Shoonya (tsym / exch) and Groww (trading_symbol / segment). NSE cash tokens are static; NFO & MCX futures resolve to the nearest expiry from Angel One&apos;s OpenAPIScripMaster.json.
      </div>
      <div className="scroll" style={{ maxHeight: "calc(100vh - 230px)" }}>
        <table className="grid">
          <thead><tr><th>Ticker</th><th>Exch</th><th>Trading symbol (Angel / Shoonya)</th><th>Token</th><th>Groww</th><th className="text-right">Lot</th><th>Status</th></tr></thead>
          <tbody>
            {tm?.rows.map((r) => (
              <tr key={r.symbol}>
                <td><b>{r.symbol}</b></td><td>{r.exchange}</td><td className="mono">{r.tradingSymbol}</td><td className="mono">{r.token}</td>
                <td className="mono muted">{r.tradingSymbol.replace(/-EQ$/, "")} · {r.exchange === "MCX" ? "COMMODITY" : r.exchange === "NSE" ? "CASH" : "FNO"}</td>
                <td className="mono text-right">{r.lotSize}</td>
                <td>{r.resolved ? <Badge tone="bull">RESOLVED</Badge> : <Badge tone="amber">PENDING MASTER</Badge>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

/* ------------------------------ Settings & Vault --------------------------- */

type FieldDef = { key: string; label: string; secret: boolean; hint?: string; pattern?: string };

function TotpBar({ broker }: { broker: BrokerKey }) {
  const [info, setInfo] = useState<{ ok: boolean; code?: string; error?: string } | null>(null);
  const [rem, setRem] = useState(30);
  const offset = useRef(0);
  const lastRem = useRef(30);
  const fetchIt = useCallback(async () => {
    try {
      const r = await api<{ ok: boolean; code?: string; remaining?: number; serverNow: number; error?: string }>(`/api/vault/totp?broker=${broker}`);
      offset.current = r.serverNow - Date.now();
      setInfo(r);
    } catch {
      /* transient */
    }
  }, [broker]);
  useEffect(() => {
    const init = setTimeout(() => void fetchIt(), 0);
    const t = setInterval(() => {
      const nowS = (Date.now() + offset.current) / 1000;
      const r = 30 - (nowS % 30);
      setRem(r);
      if (r > lastRem.current) void fetchIt(); // rolled over to a new window
      lastRem.current = r;
    }, 200);
    return () => {
      clearTimeout(init);
      clearInterval(t);
    };
  }, [fetchIt]);
  if (!info?.ok) return <div className="text-[11px] down">TOTP Error: {info?.error ?? "…"}</div>;
  const pct = (rem / 30) * 100;
  return (
    <div>
      <div className="flex justify-between items-baseline">
        <span className="label">Rotating TOTP</span>
        <span className="mono text-[11px] muted">{Math.ceil(rem)}s</span>
      </div>
      <div className="mono text-[20px] font-bold tracking-[0.25em] cyan">{info.code?.slice(0, 3)} {info.code?.slice(3)}</div>
      <div className="meter mt-1"><i style={{ width: `${pct}%`, background: rem < 6 ? "#ef4444" : "linear-gradient(90deg,#00e5ff,#10b981)", transition: "width .2s linear" }} /></div>
    </div>
  );
}

function VaultCard({ ctx, broker, defs, label }: { ctx: Ctx; broker: "angel" | "shoonya" | "groww" | "smtp"; defs: FieldDef[]; label: string }) {
  const sum = ctx.state!.vault.summary[broker];
  const [vals, setVals] = useState<Record<string, string>>({});
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [saveErr, setSaveErr] = useState<string | null>(null);
  const [connectSuccess, setConnectSuccess] = useState<{ clientCode: string; timestamp: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const isBroker = broker !== "smtp";
  const status = isBroker ? ctx.state!.brokers[broker as BrokerKey] : null;
  const ws = broker === "angel" ? ctx.state!.ws : null;

  const verifyConnectSave = async () => {
    setBusy(true);
    setSaveErr(null);
    try {
      const r = await api<{
        ok: boolean;
        error?: string;
        clientCode?: string;
        connectedAt?: string;
      }>("/api/vault", {
        broker: "angel",
        fields: vals,
        action: "verify-connect-save",
      });
      if (!r.ok) {
        const err = r.error || "Verification failed";
        setSaveErr(err);
        setConnectSuccess(null);
        ctx.toast(`Angel One: ${err}`, "err");
        return;
      }
      setVals({});
      setConnectSuccess({
        clientCode: r.clientCode ?? "Verified",
        timestamp: r.connectedAt ?? new Date().toISOString(),
      });
      ctx.toast(`✓ Angel One connected & saved permanently`, "ok");
      await ctx.refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setSaveErr(msg);
      setConnectSuccess(null);
      ctx.toast(`Error: ${msg}`, "err");
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    setSaveErr(null);
    const r = await api<{ ok: boolean; error?: string }>("/api/vault", { broker, fields: vals });
    if (!r.ok) {
      setSaveErr(r.error || "Failed to save credentials");
      ctx.toast(r.error || "Save failed", "err");
      return;
    }
    setVals({});
    await ctx.refresh();
    ctx.toast(`${label} credentials encrypted & saved`, "ok");
  };
  const connect = async () => {
    setBusy(true);
    setSaveErr(null);
    try {
      if (Object.values(vals).some((v) => v.trim())) {
        await api<{ ok: boolean; error?: string }>("/api/vault", { broker, fields: vals });
        setVals({});
      }
      const r = await api<{ state: string; message: string }>("/api/brokers/connect", { broker, force: true });
      ctx.toast(`${label}: ${r.state} — ${r.message}`, r.state === "CONNECTED" ? "ok" : "err");
      await ctx.refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setSaveErr(msg);
      ctx.toast(`Connect error: ${msg}`, "err");
    } finally {
      setBusy(false);
    }
  };
  const wipe = async () => {
    if (!confirm(`Wipe stored ${label} credentials?`)) return;
    setSaveErr(null);
    setConnectSuccess(null);
    await api(`/api/vault?broker=${broker}`, undefined, "DELETE");
    setVals({});
    await ctx.refresh();
  };

  return (
    <Panel title={label} right={status ? <Badge tone={statusTone(status.state)}>{status.state.replace("_", " ")}</Badge> : <Badge tone={sum?.configured ? "bull" : "amber"}>{sum?.configured ? "STORED" : "EMPTY"}</Badge>}>
      <div className="space-y-2.5">
        {sum?.configured && (
          <div className="rounded-md px-2.5 py-1.5 text-[11px] font-semibold flex items-center justify-between" style={{ background: "rgba(16,185,129,0.14)", border: "1px solid rgba(16,185,129,0.45)", color: "#10b981" }}>
            <span>[SAVED &amp; ENCRYPTED IN VAULT ✓]</span>
            {sum.updatedAt && <span className="mono text-[10px] opacity-80">{istTime(sum.updatedAt)} IST</span>}
          </div>
        )}

        {defs.map((f) => {
          const savedMask = sum?.fields[f.key];
          const isVis = Boolean(visible[f.key]);
          const val = vals[f.key] ?? "";
          const isPinField = broker === "angel" && (f.key === "tradingPin" || f.key === "password");
          const invalidPin = isPinField && val.trim() !== "" && !/^\d{4,6}$/.test(val.trim());
          return (
            <div key={f.key}>
              <div className="flex items-center justify-between mb-1 gap-2">
                <span className="label">{f.label}</span>
                {savedMask && (
                  <span className="mono text-[10px] px-1.5 py-0.5 rounded" style={{ background: "rgba(16,185,129,0.12)", color: "#10b981", border: "1px solid rgba(16,185,129,0.3)" }}>
                    Saved: {savedMask}
                  </span>
                )}
              </div>
              <div className="flex gap-1.5 items-center">
                <input
                  className="input mono flex-1"
                  type={f.secret && !isVis ? "password" : "text"}
                  inputMode={isPinField ? "numeric" : undefined}
                  maxLength={isPinField ? 6 : undefined}
                  autoComplete="off"
                  placeholder={savedMask ? `Stored (${savedMask}) — enter new value to rotate` : f.hint ?? ""}
                  value={val}
                  onChange={(e) => setVals({ ...vals, [f.key]: isPinField ? e.target.value.replace(/\D/g, "").slice(0, 6) : e.target.value })}
                />
                {f.secret && (
                  <button
                    type="button"
                    className="btn !h-[30px] !px-2 !text-[10.5px] shrink-0"
                    onClick={() => setVisible({ ...visible, [f.key]: !isVis })}
                  >
                    {isVis ? "Hide" : "Show"}
                  </button>
                )}
              </div>
              {invalidPin && <div className="text-[10.5px] down mt-0.5">Enter 4 to 6-digit MPIN / Trading Security PIN</div>}
            </div>
          );
        })}

        {isBroker && sum?.fields.totpSecret && <TotpBar broker={broker as BrokerKey} />}

        {status && (
          <div className="grid grid-cols-2 gap-2 pt-1">
            <Stat label="Available margin" value={status.funds ? inr(status.funds.available) : "—"} sub={status.funds ? "live API ledger" : "not synced"} />
            <Stat label="Margin used" value={status.funds ? inr(status.funds.used) : "—"} />
          </div>
        )}

        {ws && status?.state === "CONNECTED" && (
          <div className="text-[11px] mono px-2 py-1 rounded" style={{ background: "rgba(0,229,255,0.08)", border: "1px solid rgba(0,229,255,0.28)", color: ws.connected ? "#10b981" : "#f59e0b" }}>
            SmartWebSocketV2 [{ws.connectionState ?? (ws.connected ? "LIVE STREAMING" : "DISCONNECTED")}]: {ws.connected ? `${ws.subscribedCount} assets · ${ws.ticksReceived} ticks` : ws.lastError || "IDLE"}
          </div>
        )}

        {status && status.state !== "ERROR" && !saveErr && <div className="text-[11px] muted">{status.message}</div>}

        <div className="flex gap-2 pt-1">
          {broker === "angel" ? (
            <button
              type="button"
              className="btn btn-primary flex-1 font-semibold !text-[12px]"
              disabled={busy || (!sum?.configured && !Object.values(vals).some((v) => v.trim()))}
              onClick={() => void verifyConnectSave()}
            >
              {busy ? "↻ Verifying & Connecting…" : "✓ Verify, Connect & Save Permanently"}
            </button>
          ) : (
            <>
              <button className="btn btn-primary flex-1" onClick={() => void save()} disabled={!Object.values(vals).some((v) => v.trim())}>Save to vault</button>
              {isBroker && (
                <button
                  className="btn flex-1"
                  disabled={busy || (!sum?.configured && !Object.values(vals).some((v) => v.trim()))}
                  onClick={() => void connect()}
                >
                  {busy ? "Connecting…" : "Connect & sync"}
                </button>
              )}
            </>
          )}
          <button className="btn btn-bear shrink-0" disabled={!sum?.configured} onClick={() => void wipe()}>Wipe</button>
        </div>

        {broker === "angel" && (connectSuccess || (status?.state === "CONNECTED" && sum?.configured)) && (
          <div
            className="rounded-md px-3 py-2 text-[12px] font-semibold flex flex-col gap-1 mt-1.5"
            style={{
              background: "rgba(16,185,129,0.18)",
              border: "1px solid rgba(16,185,129,0.6)",
              color: "#10b981",
            }}
          >
            <div className="flex items-center gap-1.5 text-[12.5px]">
              <span className="font-bold text-[14px]">✓</span>
              <span>CONNECTED &amp; SAVED PERMANENTLY (Auto-Login Active)</span>
            </div>
            <div className="mono text-[11px] opacity-90 flex justify-between">
              <span>Client: {connectSuccess?.clientCode ?? sum?.fields.clientId ?? "Verified"}</span>
              <span>{connectSuccess?.timestamp ? istTime(connectSuccess.timestamp) : sum?.updatedAt ? istTime(sum.updatedAt) : "Active"} IST</span>
            </div>
          </div>
        )}

        {(saveErr || (broker !== "angel" && status?.state === "ERROR")) && (
          <div
            className="rounded-md px-2.5 py-2 text-[11.5px] font-medium break-words mt-1.5"
            style={{ background: "rgba(239,68,68,0.14)", border: "1px solid rgba(239,68,68,0.6)", color: "#ef4444" }}
          >
            ✖ {saveErr || status?.message}
          </div>
        )}
      </div>
    </Panel>
  );
}

export function SettingsPage({ ctx }: { ctx: Ctx }) {
  const [fields, setFields] = useState<Record<string, FieldDef[]> | null>(null);
  useEffect(() => {
    void api<{ fields: Record<string, FieldDef[]> }>("/api/vault").then((r) => setFields(r.fields));
  }, []);
  const r = ctx.state!.risk;
  const set = async (patch: Record<string, unknown>) => {
    await api("/api/config", patch);
    await ctx.refresh();
  };
  const brokerOpts = (
    <>
      <option value="angel">Angel One</option>
      <option value="shoonya">Shoonya</option>
      <option value="groww">Groww</option>
    </>
  );
  return (
    <div className="space-y-3">
      {ctx.state!.vault.fallbackKey && (
        <div className="glass px-3 py-2 text-[12px]" style={{ borderColor: "rgba(245,158,11,.5)" }}>
          ⚠ <b>VAULT_KEY</b> is not set — the credential vault is <b>disabled</b> and refuses to encrypt rather than use a fallback key. Set <span className="mono">VAULT_KEY</span> (at least 8 characters) in the server environment before storing broker secrets.
        </div>
      )}
      <Panel title="3-Broker Failover Router · priority">
        <div className="grid grid-cols-6 gap-4 items-end">
          <Field label="Primary"><select className="input" value={r.primaryBroker} onChange={(e) => void set({ primaryBroker: e.target.value })}>{brokerOpts}</select></Field>
          <Field label="Secondary"><select className="input" value={r.secondaryBroker} onChange={(e) => void set({ secondaryBroker: e.target.value })}>{brokerOpts}</select></Field>
          <Field label="Tertiary"><select className="input" value={r.tertiaryBroker} onChange={(e) => void set({ tertiaryBroker: e.target.value })}>{brokerOpts}</select></Field>
          <div className="col-span-3">
            <div className="label mb-1">Failover drill — simulate a dropped session (paper)</div>
            <div className="flex gap-4 text-[12px]">
              {(["angel", "shoonya", "groww"] as BrokerKey[]).map((b) => (
                <label key={b} className="flex items-center gap-1.5">
                  <input type="checkbox" checked={r.simulateDrop[b]} onChange={(e) => void set({ simulateDrop: { [b]: e.target.checked } })} />
                  Drop {BROKER_NAMES[b]}
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="text-[11px] muted mt-2">
          Per-attempt timeout 5000 ms with exponential backoff retry; hop to the next broker is audited with elapsed ms. Three consecutive failures on one broker trigger an emergency email.
          {" "}Angel WS V2: {ctx.state!.ws?.connected ? `CONNECTED (${ctx.state!.ws.subscribedCount} subs, ${ctx.state!.ws.ticksReceived} ticks)` : ctx.state!.ws?.lastError || "IDLE"}.
        </div>
      </Panel>
      {fields ? (
        <div className="grid grid-cols-3 gap-3">
          <VaultCard ctx={ctx} broker="angel" defs={fields.angel} label="Angel One SmartAPI" />
          <VaultCard ctx={ctx} broker="shoonya" defs={fields.shoonya} label="Shoonya (Finvasia)" />
          <VaultCard ctx={ctx} broker="groww" defs={fields.groww} label="Groww API" />
        </div>
      ) : (
        <Empty>Loading vault…</Empty>
      )}
      {fields && (
        <div className="grid grid-cols-3 gap-3">
          <VaultCard ctx={ctx} broker="smtp" defs={fields.smtp} label="Gmail SMTP (App Password)" />
        </div>
      )}
    </div>
  );
}
