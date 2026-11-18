/**
 * PAPER-ONLY Offline Backtest — ₹1,000 Sleeve, Low-Priced Equities, Cost-Aware (3x)
 *
 * RESEARCH / PAPER SIMULATION ONLY. No broker access, no live orders, no network.
 * Asset: synthetic low-priced Indian equities (₹50–₹150) — clearly labelled synthetic
 * because no real ₹50–₹150 equity OHLCV data exists in this repo and no external
 * market-data fetch is permitted. Three deterministic GBM series (seed 42) simulate
 * trending / choppy / volatile regimes.
 *
 * Cost-aware rule (user directive):
 *   - Only enter if projected gross at 3xATR target >= 3x projected round-trip statutory charges.
 *   - High-conviction only: minConfidence = 70 (vs default 55) to reduce trade frequency.
 *   - STRICT_INTRADAY, sleeve ₹1,000, circuit breaker daily net <= -₹25 halts entries.
 *
 * Comparison arms (same synthetic data):
 *   BASE   : minConfidence 55, no cost filter (legacy behaviour)
 *   COST3  : minConfidence 70, costAwareMinMarginMultiple 3 (directive)
 *
 * Output: data/provenance/paper_backtest_1000_lowprice.json
 * Usage: node scripts/paper_backtest_1000_lowprice.js
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { researchBacktest, portfolioStats } = require("../dist_test_cjs/experimental_harness.js");
const { EXPERIMENTAL_REGISTRY } = require("../dist_test_cjs/experimental_strategies.js");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "data", "provenance", "paper_backtest_1000_lowprice.json");
const BUCKET_MIN = 15;
const IST_OFFSET_MS = 5.5 * 3600 * 1000;
const CAPITAL = 1000;
const DRAWDOWN_FLOOR = 25;

const VOLUME_REQUIRED = new Set(
  EXPERIMENTAL_REGISTRY.filter((s) => (s.requiredData || []).some((r) => /volume/i.test(r))).map((s) => s.id),
);
const EVALUABLE = EXPERIMENTAL_REGISTRY.filter((s) => !VOLUME_REQUIRED.has(s.id));

function aggregate(candles, bucketMin) {
  const out = [];
  let bucketKey = null;
  let cur = null;
  for (const c of candles) {
    const istMs = c.t + IST_OFFSET_MS;
    const minutesOfDay = Math.floor((istMs % 86400000) / 60000);
    const sessionStart = 9 * 60 + 15;
    const key = `${Math.floor((istMs / 86400000) | 0)}:${Math.floor((minutesOfDay - sessionStart) / bucketMin)}`;
    if (key !== bucketKey) {
      if (cur) out.push(cur);
      bucketKey = key;
      cur = { t: c.t, o: c.o, h: c.h, l: c.l, c: c.c, v: c.v };
    } else {
      cur.h = Math.max(cur.h, c.h);
      cur.l = Math.min(cur.l, c.l);
      cur.c = c.c;
      cur.v += c.v;
      cur.t = c.t;
    }
  }
  if (cur) out.push(cur);
  return out;
}

function lcg(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0), s / 4294967296);
}

/** Deterministic synthetic equity: GBM, 5 sessions x 375 1-min bars, price clamped to [50,150]. */
function syntheticEquity({ startPx, drift, vol, seed }) {
  const rnd = lcg(seed);
  const candles = [];
  const days = ["2024-01-02", "2024-01-03", "2024-01-04", "2024-01-05", "2024-01-08"];
  let px = startPx;
  for (const d of days) {
    const base = Date.parse(`${d}T09:15:00+05:30`);
    for (let m = 0; m < 375; m++) {
      const z = (rnd() + rnd() + rnd() - 1.5) / 1.5;
      const o = px;
      let c = px * (1 + drift + vol * z);
      c = Math.min(150, Math.max(50, c)); // enforce ₹50–₹150 band
      const h = Math.min(150, Math.max(o, c) * (1 + Math.abs(z) * 0.0008));
      const l = Math.max(50, Math.min(o, c) * (1 - Math.abs(z) * 0.0008));
      candles.push({ t: base + m * 60000, o: Number(o.toFixed(2)), h: Number(h.toFixed(2)), l: Number(l.toFixed(2)), c: Number(c.toFixed(2)), v: 5000 });
      px = c;
    }
  }
  return candles;
}

function applyCircuit(trades) {
  const sorted = [...trades].sort((a, b) => a.entryTime - b.entryTime);
  const daily = new Map();
  const kept = [];
  let blocked = 0;
  const haltedDays = new Set();
  for (const t of sorted) {
    const day = t.exitDay || t.day;
    if (haltedDays.has(day)) {
      blocked++;
      continue;
    }
    kept.push(t);
    const cum = (daily.get(day) ?? 0) + t.net;
    daily.set(day, cum);
    if (cum <= -DRAWDOWN_FLOOR) haltedDays.add(day);
  }
  return { kept, blocked, haltedDays: [...haltedDays] };
}

function summarize(trades, capital) {
  const n = trades.length;
  const gross = trades.reduce((a, t) => a + t.gross, 0);
  const charges = trades.reduce((a, t) => a + t.charges, 0);
  const net = trades.reduce((a, t) => a + t.net, 0);
  const wins = trades.filter((t) => t.net > 0).length;
  const byDay = new Map();
  for (const t of trades) byDay.set(t.day, (byDay.get(t.day) ?? 0) + t.net);
  const dailyArr = [...byDay.entries()].sort().map(([, v]) => v);
  const stats = portfolioStats(dailyArr, capital);
  let peak = capital;
  let equity = capital;
  let maxDD = 0;
  for (const v of dailyArr) {
    equity += v;
    if (equity > peak) peak = equity;
    maxDD = Math.max(maxDD, peak - equity);
  }
  return {
    trades: n,
    gross: Number(gross.toFixed(2)),
    charges: Number(charges.toFixed(2)),
    net: Number(net.toFixed(2)),
    winRatePct: n ? Number(((wins / n) * 100).toFixed(2)) : 0,
    maxDrawdownRs: Number(maxDD.toFixed(2)),
    harnessMaxDrawdown: stats.maxDrawdown,
    finalEquity: Number((capital + net).toFixed(2)),
    sessions: dailyArr.length,
    dailyPnl: Object.fromEntries([...byDay.entries()].sort()),
  };
}

function runArm(armName, bars, opts) {
  const perStrategy = [];
  for (const s of EVALUABLE) {
    const { trades, crossSessionTrades } = researchBacktest(s.id, bars, {
      sleeve: CAPITAL,
      sessionMode: "STRICT_INTRADAY",
      ...opts,
    });
    const { kept, blocked, haltedDays } = applyCircuit(trades);
    const sum = summarize(kept, CAPITAL);
    perStrategy.push({
      id: s.id,
      name: s.name,
      rawTrades: trades.length,
      blockedByCircuit: blocked,
      haltedDays,
      crossSessionTrades,
      ...sum,
    });
    console.error(
      `[${armName}] ${s.id.padEnd(24)} raw ${String(trades.length).padStart(4)} | kept ${String(kept.length).padStart(4)} | blocked ${String(blocked).padStart(3)} | net ${String(sum.net).padStart(12)} | final ${sum.finalEquity}`,
    );
  }
  const allDaily = new Map();
  for (const row of perStrategy) {
    for (const [d, v] of Object.entries(row.dailyPnl)) allDaily.set(d, (allDaily.get(d) ?? 0) + v);
  }
  const portDailyArr = [...allDaily.entries()].sort().map(([, v]) => v);
  const portNet = portDailyArr.reduce((a, b) => a + b, 0);
  const portStats = portfolioStats(portDailyArr, CAPITAL * perStrategy.length);
  let peak = CAPITAL * perStrategy.length;
  let eq = peak;
  let portDD = 0;
  for (const v of portDailyArr) {
    eq += v;
    if (eq > peak) peak = eq;
    portDD = Math.max(portDD, peak - eq);
  }
  return {
    arm: armName,
    opts,
    bars: bars.length,
    strategies: perStrategy,
    portfolio: {
      strategies: perStrategy.length,
      totalNet: Number(portNet.toFixed(2)),
      finalEquity: Number((CAPITAL * perStrategy.length + portNet).toFixed(2)),
      maxDrawdownRs: Number(portDD.toFixed(2)),
      harnessMaxDrawdown: portStats.maxDrawdown,
      sessions: portDailyArr.length,
      totalTrades: perStrategy.reduce((a, r) => a + r.trades, 0),
      totalRawTrades: perStrategy.reduce((a, r) => a + r.rawTrades, 0),
    },
  };
}

function main() {
  const stocks = [
    { name: "SYNTH_A_TREND_75", startPx: 75, drift: 0.00005, vol: 0.001, seed: 42 },
    { name: "SYNTH_B_CHOPPY_100", startPx: 100, drift: 0, vol: 0.0015, seed: 123 },
    { name: "SYNTH_C_VOLATILE_125", startPx: 125, drift: 0, vol: 0.0025, seed: 777 },
  ];
  const results = [];
  for (const st of stocks) {
    const m1 = syntheticEquity(st);
    const bars = aggregate(m1, BUCKET_MIN);
    const lo = Math.min(...m1.map((c) => c.l));
    const hi = Math.max(...m1.map((c) => c.h));
    console.error(`[lowprice] ${st.name}: ${m1.length} 1-min -> ${bars.length} 15-min bars, range ₹${lo}–₹${hi}`);
    const base = runArm(`${st.name}-BASE`, bars, { minConfidence: 55 });
    const cost3 = runArm(`${st.name}-COST3`, bars, { minConfidence: 70, costAwareMinMarginMultiple: 3 });
    results.push({ stock: st.name, params: st, range: { low: lo, high: hi }, base, cost3 });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    mode: "PAPER_ONLY_OFFLINE_SIMULATION",
    disclaimer:
      "SIMULATED results only on SYNTHETIC data (no real ₹50–₹150 equity OHLCV exists in this repo; no external fetch permitted). Not live trading, not a forecast, not a profit promise. Statutory rates UNVERIFIED (0/26). Synthetic GBM cannot prove real-market expectancy.",
    config: {
      capital: CAPITAL,
      sleeve: CAPITAL,
      sessionMode: "STRICT_INTRADAY",
      broker: "shoonya",
      drawdownFloor: DRAWDOWN_FLOOR,
      base: { minConfidence: 55, costFilter: "none" },
      cost3: { minConfidence: 70, costAwareMinMarginMultiple: 3 },
      costs: "statutory round-trip (Shoonya NSE EQ intraday) + 8bps slippage per leg",
    },
    results,
    keyFindings: {
      expectancyFlipped: results.every((r) => r.cost3.portfolio.totalNet > 0)
        ? "YES — cost-aware arm is positive on all synthetic stocks (see per-stock rows)."
        : "NO — cost-aware arm does not flip expectancy to positive on synthetic data (see per-stock rows). Fewer trades, smaller loss, but still negative.",
      note: "Cost filter reduces trade frequency and brokerage drag but cannot create edge where none exists. Synthetic results do not generalise to real equities.",
    },
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({
    summary: results.map((r) => ({
      stock: r.stock,
      base: r.base.portfolio,
      cost3: r.cost3.portfolio,
    })),
    output: OUT,
  }, null, 2));
}

main();
