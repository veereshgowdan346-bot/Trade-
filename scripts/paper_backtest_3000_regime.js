/**
 * PAPER-ONLY Offline Backtest — ₹3,000 Zero-Brokerage Swing + ADX Regime Filter
 *
 * RESEARCH / PAPER SIMULATION ONLY. No broker access, no live orders, no network.
 * Synthetic low-priced equities (₹50–₹150), 20 sessions each — clearly labelled synthetic.
 *
 * Directive: overarching ADX regime filter blocks ALL entries unless ADX(14) >= 25.
 *   SWING_ZERO_COST3_REGIME : CARRY_OVERNIGHT + zeroBrokerage + conf70 + 3x + ADX>=25 (directive)
 *   SWING_ZERO_COST3        : same without regime filter (prior baseline, for attribution)
 *
 * Output: data/provenance/paper_backtest_3000_regime.json
 * Usage: node scripts/paper_backtest_3000_regime.js
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { researchBacktest, portfolioStats } = require("../dist_test_cjs/experimental_harness.js");
const { EXPERIMENTAL_REGISTRY } = require("../dist_test_cjs/experimental_strategies.js");
const { adx } = require("../dist_test_cjs/indicators.js");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "data", "provenance", "paper_backtest_3000_regime.json");
const BUCKET_MIN = 15;
const IST_OFFSET_MS = 5.5 * 3600 * 1000;
const CAPITAL = 3000;
const DRAWDOWN_FLOOR = 75;
const ADX_MIN = 25;

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

function syntheticEquity({ startPx, drift, vol, seed }) {
  const rnd = lcg(seed);
  const candles = [];
  const days = [];
  const d0 = new Date("2024-01-01T00:00:00+05:30");
  for (let k = 0; k < 28 && days.length < 20; k++) {
    const dt = new Date(d0.getTime() + k * 86400000);
    const istDow = new Date(dt.toLocaleString("en-US", { timeZone: "Asia/Kolkata" })).getDay();
    if (istDow === 0 || istDow === 6) continue;
    days.push(dt.toISOString().slice(0, 10));
  }
  let px = startPx;
  for (const d of days) {
    const base = Date.parse(`${d}T09:15:00+05:30`);
    for (let m = 0; m < 375; m++) {
      const z = (rnd() + rnd() + rnd() - 1.5) / 1.5;
      const o = px;
      let c = px * (1 + drift + vol * z);
      c = Math.min(150, Math.max(50, c));
      const h = Math.min(150, Math.max(o, c) * (1 + Math.abs(z) * 0.0008));
      const l = Math.max(50, Math.min(o, c) * (1 - Math.abs(z) * 0.0008));
      candles.push({ t: base + m * 60000, o: Number(o.toFixed(2)), h: Number(h.toFixed(2)), l: Number(l.toFixed(2)), c: Number(c.toFixed(2)), v: 5000 });
      px = c;
    }
  }
  return { candles, days };
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

function holdingDays(t) {
  return Math.round((Date.parse(t.exitDay) - Date.parse(t.entryDay)) / 86400000);
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
  const holds = trades.map(holdingDays);
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
    avgHoldingDays: n ? Number((holds.reduce((a, b) => a + b, 0) / n).toFixed(2)) : 0,
    maxHoldingDays: n ? Math.max(...holds) : 0,
    multiDayTrades: holds.filter((h) => h >= 1).length,
    dailyPnl: Object.fromEntries([...byDay.entries()].sort()),
  };
}

function runArm(armName, bars, opts) {
  const perStrategy = [];
  for (const s of EVALUABLE) {
    const { trades, crossSessionTrades } = researchBacktest(s.id, bars, { sleeve: CAPITAL, ...opts });
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
      `[${armName}] ${s.id.padEnd(24)} raw ${String(trades.length).padStart(4)} | kept ${String(kept.length).padStart(4)} | net ${String(sum.net).padStart(12)} | final ${sum.finalEquity}`,
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

function adxStats(bars) {
  const { adx: arr } = adx(bars, 14);
  const valid = arr.filter((v) => Number.isFinite(v));
  const above = valid.filter((v) => v >= ADX_MIN).length;
  return {
    bars: bars.length,
    validAdxBars: valid.length,
    adxAbove25Bars: above,
    adxAbove25Pct: valid.length ? Number(((above / valid.length) * 100).toFixed(1)) : 0,
    adxMax: valid.length ? Number(Math.max(...valid).toFixed(2)) : null,
    adxMean: valid.length ? Number((valid.reduce((a, b) => a + b, 0) / valid.length).toFixed(2)) : null,
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
    const { candles: m1, days } = syntheticEquity(st);
    const bars = aggregate(m1, BUCKET_MIN);
    const lo = Math.min(...m1.map((c) => c.l));
    const hi = Math.max(...m1.map((c) => c.h));
    const adxInfo = adxStats(bars);
    console.error(`[regime] ${st.name}: ${bars.length} 15-min bars, ${days.length} sessions, range ₹${lo}–₹${hi}, ADX>=25 on ${adxInfo.adxAbove25Pct}% of valid bars (max ${adxInfo.adxMax})`);
    const regime = runArm(`${st.name}-REGIME`, bars, {
      sessionMode: "CARRY_OVERNIGHT",
      zeroBrokerage: true,
      minConfidence: 70,
      costAwareMinMarginMultiple: 3,
      regimeFilterAdxMin: ADX_MIN,
    });
    const baseline = runArm(`${st.name}-BASELINE`, bars, {
      sessionMode: "CARRY_OVERNIGHT",
      zeroBrokerage: true,
      minConfidence: 70,
      costAwareMinMarginMultiple: 3,
    });
    results.push({ stock: st.name, params: st, sessions: days.length, range: { low: lo, high: hi }, adx: adxInfo, regime, baseline });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    mode: "PAPER_ONLY_OFFLINE_SIMULATION",
    disclaimer:
      "SIMULATED results only on SYNTHETIC data. Zero-brokerage hypothetical (statutory taxes kept, UNVERIFIED). ADX(14) causal, prefix-only. Not live trading, not a forecast, not a profit promise.",
    config: {
      capital: CAPITAL,
      sleeve: CAPITAL,
      minConfidence: 70,
      costAwareMinMarginMultiple: 3,
      regimeFilterAdxMin: ADX_MIN,
      drawdownFloor: DRAWDOWN_FLOOR,
      regime: { sessionMode: "CARRY_OVERNIGHT", zeroBrokerage: true, regimeFilterAdxMin: ADX_MIN },
      baseline: { sessionMode: "CARRY_OVERNIGHT", zeroBrokerage: true, regimeFilterAdxMin: "none" },
    },
    results,
    keyFindings: {
      filterWorks: "See per-stock regime vs baseline rows. Filter blocks entries when ADX<25 (choppy) and allows only trending entries.",
      note: "Synthetic results do not generalise to real equities. ADX threshold 25 is a conventional heuristic, not a proven optimum.",
    },
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({
    summary: results.map((r) => ({
      stock: r.stock,
      adx: r.adx,
      regime: r.regime.portfolio,
      baseline: r.baseline.portfolio,
    })),
    output: OUT,
  }, null, 2));
}

main();
