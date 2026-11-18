/**
 * PAPER-ONLY Offline Backtest — ₹3,000 Sleeve, Zero-Brokerage Swing (Multi-Day)
 *
 * RESEARCH / PAPER SIMULATION ONLY. No broker access, no live orders, no network.
 * Asset: synthetic low-priced Indian equities (₹50–₹150), 20 sessions each — clearly
 * labelled synthetic (no real equity data in repo; no external fetch permitted).
 *
 * Directive parameters:
 *   - sleeve ₹3,000, minConfidence 70, costAwareMinMarginMultiple 3
 *   - zeroBrokerage: brokerage + broker minimum = 0; STT/exchange/SEBI/stamp/GST/slippage kept
 *   - swing: sessionMode CARRY_OVERNIGHT (no 3:15 PM auto-square-off; multi-day holds allowed)
 *   - circuit breaker: daily cumulative net <= -₹75 (2.5 x ₹30 maxSL at 1% of 3000) halts entries
 *
 * Arms (same synthetic data, for attribution):
 *   SWING_ZERO_COST3 : CARRY_OVERNIGHT + zeroBrokerage + conf70 + 3x filter (directive)
 *   SWING_ZERO_NOFILT: CARRY_OVERNIGHT + zeroBrokerage + conf70, no cost filter
 *   INTRA_BROK_COST3 : STRICT_INTRADAY + brokerage + conf70 + 3x filter (prior directive, ₹3k)
 *
 * Output: data/provenance/paper_backtest_3000_swing_zero.json
 * Usage: node scripts/paper_backtest_3000_swing_zero.js
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { researchBacktest, portfolioStats } = require("../dist_test_cjs/experimental_harness.js");
const { EXPERIMENTAL_REGISTRY } = require("../dist_test_cjs/experimental_strategies.js");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "data", "provenance", "paper_backtest_3000_swing_zero.json");
const BUCKET_MIN = 15;
const IST_OFFSET_MS = 5.5 * 3600 * 1000;
const CAPITAL = 3000;
const DRAWDOWN_FLOOR = 75; // 2.5 x (1% of 3000 = 30)

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

/** 20 sessions (4 weeks, Mon–Fri) x 375 1-min bars, GBM clamped to [50,150]. */
function syntheticEquity({ startPx, drift, vol, seed }) {
  const rnd = lcg(seed);
  const candles = [];
  const days = [];
  const d0 = new Date("2024-01-01T00:00:00+05:30"); // Monday
  for (let k = 0; k < 28 && days.length < 20; k++) {
    const dt = new Date(d0.getTime() + k * 86400000);
    const dow = dt.getUTCDay(); // 0 Sun, 6 Sat (UTC approx; IST offset ignored for weekday gen)
    // Use IST weekday via toLocaleString
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
  const a = Date.parse(t.entryDay);
  const b = Date.parse(t.exitDay);
  return Math.round((b - a) / 86400000);
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
  const avgHold = n ? holds.reduce((a, b) => a + b, 0) / n : 0;
  const maxHold = n ? Math.max(...holds) : 0;
  const multiDay = holds.filter((h) => h >= 1).length;
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
    avgHoldingDays: Number(avgHold.toFixed(2)),
    maxHoldingDays: maxHold,
    multiDayTrades: multiDay,
    dailyPnl: Object.fromEntries([...byDay.entries()].sort()),
  };
}

function runArm(armName, bars, opts) {
  const perStrategy = [];
  for (const s of EVALUABLE) {
    const { trades, crossSessionTrades } = researchBacktest(s.id, bars, {
      sleeve: CAPITAL,
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
      `[${armName}] ${s.id.padEnd(24)} raw ${String(trades.length).padStart(4)} | kept ${String(kept.length).padStart(4)} | blocked ${String(blocked).padStart(3)} | net ${String(sum.net).padStart(12)} | final ${sum.finalEquity} | avgHold ${sum.avgHoldingDays}d`,
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
    const { candles: m1, days } = syntheticEquity(st);
    const bars = aggregate(m1, BUCKET_MIN);
    const lo = Math.min(...m1.map((c) => c.l));
    const hi = Math.max(...m1.map((c) => c.h));
    console.error(`[swing3000] ${st.name}: ${m1.length} 1-min -> ${bars.length} 15-min bars, ${days.length} sessions, range ₹${lo}–₹${hi}`);
    const swingZeroCost3 = runArm(`${st.name}-SWING_ZERO_COST3`, bars, {
      sessionMode: "CARRY_OVERNIGHT",
      zeroBrokerage: true,
      minConfidence: 70,
      costAwareMinMarginMultiple: 3,
    });
    const swingZeroNoFilt = runArm(`${st.name}-SWING_ZERO_NOFILT`, bars, {
      sessionMode: "CARRY_OVERNIGHT",
      zeroBrokerage: true,
      minConfidence: 70,
    });
    const intraBrokCost3 = runArm(`${st.name}-INTRA_BROK_COST3`, bars, {
      sessionMode: "STRICT_INTRADAY",
      zeroBrokerage: false,
      minConfidence: 70,
      costAwareMinMarginMultiple: 3,
    });
    results.push({ stock: st.name, params: st, sessions: days.length, range: { low: lo, high: hi }, swingZeroCost3, swingZeroNoFilt, intraBrokCost3 });
  }

  const allSwingPositive = results.every((r) => r.swingZeroCost3.portfolio.totalNet > 0);
  const report = {
    generatedAt: new Date().toISOString(),
    mode: "PAPER_ONLY_OFFLINE_SIMULATION",
    disclaimer:
      "SIMULATED results only on SYNTHETIC data (no real ₹50–₹150 equity OHLCV in repo; no external fetch). Zero-brokerage is a hypothetical cost assumption (statutory taxes kept, UNVERIFIED rates). Swing = CARRY_OVERNIGHT (overnight gap exposure). Not live trading, not a forecast, not a profit promise.",
    config: {
      capital: CAPITAL,
      sleeve: CAPITAL,
      minConfidence: 70,
      costAwareMinMarginMultiple: 3,
      drawdownFloor: DRAWDOWN_FLOOR,
      swingZeroCost3: { sessionMode: "CARRY_OVERNIGHT", zeroBrokerage: true, costFilter: 3 },
      swingZeroNoFilt: { sessionMode: "CARRY_OVERNIGHT", zeroBrokerage: true, costFilter: "none" },
      intraBrokCost3: { sessionMode: "STRICT_INTRADAY", zeroBrokerage: false, costFilter: 3 },
      costsZero: "brokerage 0 + STT/exchange/SEBI/stamp/GST/slippage (Shoonya statutory heads, UNVERIFIED)",
    },
    results,
    keyFindings: {
      expectancyFlipped: allSwingPositive
        ? "YES — swing zero-brokerage cost-aware arm is positive on all synthetic stocks."
        : "NO — swing zero-brokerage cost-aware arm is not positive on all synthetic stocks (see per-stock rows). Holding longer + zero brokerage reduces drag but does not flip expectancy on synthetic GBM.",
      note: "Compare SWING_ZERO_COST3 vs SWING_ZERO_NOFILT (filter effect) and vs INTRA_BROK_COST3 (swing+zero effect). Synthetic results do not generalise to real equities.",
    },
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({
    summary: results.map((r) => ({
      stock: r.stock,
      swingZeroCost3: r.swingZeroCost3.portfolio,
      swingZeroNoFilt: r.swingZeroNoFilt.portfolio,
      intraBrokCost3: r.intraBrokCost3.portfolio,
    })),
    output: OUT,
  }, null, 2));
}

main();
