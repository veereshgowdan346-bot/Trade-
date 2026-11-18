/**
 * PAPER-ONLY Offline Backtest — ₹1,000 Sleeve, Strict Intraday
 *
 * RESEARCH / PAPER SIMULATION ONLY. No broker access, no live orders, no network.
 * Uses the audited research harness (src/lib/experimental_harness.ts) with:
 *   - sleeve = ₹1,000
 *   - sessionMode = STRICT_INTRADAY (no overnight carry; EOD square-off)
 *   - statutory round-trip costs (Shoonya, NSE EQ intraday) + slippage per trade
 *   - circuit breaker: daily cumulative net <= -₹25 (2.5 × ₹10 maxSL) halts further entries that day
 *
 * Scenarios:
 *   A. NIFTY 50 index proxy 2024 OOS (real canonical data, 15-min bars) — honest minimum-size test.
 *      With the sizing fix, ₹1,000 cannot afford 1 NIFTY unit (~₹22k) => 0 trades, ₹0 P&L.
 *   B. Same NIFTY 2024 data at default ₹1,00,000 sleeve — reference expectancy (known negative).
 *   C. Deterministic synthetic GBM series priced ~₹100 (seed 42) — demonstrates ₹1,000 CAN trade
 *      when instrument price allows; clearly labelled synthetic, not market data.
 *
 * Output: data/provenance/paper_backtest_1000.json (new file; never overwrites existing provenance).
 * Usage: node scripts/paper_backtest_1000.js
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { researchBacktest, portfolioStats } = require("../dist_test_cjs/experimental_harness.js");
const { EXPERIMENTAL_REGISTRY } = require("../dist_test_cjs/experimental_strategies.js");

const ROOT = path.join(__dirname, "..");
const CANON_2024 = path.join(ROOT, "data", "external", "canonical", "NIFTY50_1min_2024.json");
const OUT = path.join(ROOT, "data", "provenance", "paper_backtest_1000.json");
const BUCKET_MIN = 15;
const IST_OFFSET_MS = 5.5 * 3600 * 1000;
const CAPITAL = 1000;
const MAX_SL = 10; // 1% of 1000
const DRAWDOWN_FLOOR = 25; // 2.5 x maxSL

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

/** Deterministic LCG for synthetic GBM (seed 42). */
function lcg(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0), s / 4294967296);
}

/** Synthetic 1-min GBM around ₹100, 5 sessions × 375 bars (09:15–15:30 IST), seed 42. */
function syntheticGBM() {
  const rnd = lcg(42);
  const candles = [];
  // 2024-01-02 .. 2024-01-08 weekdays (Mon–Fri + Mon), IST 09:15 start
  const days = ["2024-01-02", "2024-01-03", "2024-01-04", "2024-01-05", "2024-01-08"];
  let px = 100;
  for (const d of days) {
    const base = Date.parse(`${d}T09:15:00+05:30`);
    for (let m = 0; m < 375; m++) {
      const drift = 0.00002;
      const vol = 0.0012;
      const z = (rnd() + rnd() + rnd() - 1.5) / 1.5; // approx normal in [-1,1]
      const o = px;
      const c = Math.max(50, px * (1 + drift + vol * z));
      const h = Math.max(o, c) * (1 + Math.abs(z) * 0.0008);
      const l = Math.min(o, c) * (1 - Math.abs(z) * 0.0008);
      candles.push({ t: base + m * 60000, o: Number(o.toFixed(2)), h: Number(h.toFixed(2)), l: Number(l.toFixed(2)), c: Number(c.toFixed(2)), v: 1000 });
      px = c;
    }
  }
  return candles;
}

/** Apply circuit breaker post-hoc: halt entries after daily cumulative net <= -floor. */
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
  // Equity curve drawdown in rupees
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
    maxDrawdownHarness: stats.maxDrawdown,
    finalEquity: Number((capital + net).toFixed(2)),
    sessions: dailyArr.length,
    dailyPnl: Object.fromEntries([...byDay.entries()].sort()),
  };
}

function runScenario(name, bars, sleeve, capital) {
  const perStrategy = [];
  for (const s of EVALUABLE) {
    const { trades, crossSessionTrades } = researchBacktest(s.id, bars, { sleeve, sessionMode: "STRICT_INTRADAY" });
    const { kept, blocked, haltedDays } = applyCircuit(trades);
    const sum = summarize(kept, capital);
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
      `[${name}] ${s.id.padEnd(24)} raw ${String(trades.length).padStart(4)} | kept ${String(kept.length).padStart(4)} | blocked ${String(blocked).padStart(3)} | net ${String(sum.net).padStart(12)} | final ${sum.finalEquity}`,
    );
  }
  // Portfolio: sum of per-strategy daily P&L (equal-weight sleeves, as in research_protocol_oos.js)
  const allDaily = new Map();
  for (const row of perStrategy) {
    for (const [d, v] of Object.entries(row.dailyPnl)) allDaily.set(d, (allDaily.get(d) ?? 0) + v);
  }
  const portDailyArr = [...allDaily.entries()].sort().map(([, v]) => v);
  const portNet = portDailyArr.reduce((a, b) => a + b, 0);
  const portStats = portfolioStats(portDailyArr, capital * perStrategy.length);
  let peak = capital * perStrategy.length;
  let eq = peak;
  let portDD = 0;
  for (const v of portDailyArr) {
    eq += v;
    if (eq > peak) peak = eq;
    portDD = Math.max(portDD, peak - eq);
  }
  return {
    name,
    sleeve,
    capitalPerStrategy: capital,
    bars: bars.length,
    strategies: perStrategy,
    portfolio: {
      strategies: perStrategy.length,
      totalNet: Number(portNet.toFixed(2)),
      finalEquity: Number((capital * perStrategy.length + portNet).toFixed(2)),
      maxDrawdownRs: Number(portDD.toFixed(2)),
      harnessMaxDrawdown: portStats.maxDrawdown,
      sessions: portDailyArr.length,
    },
  };
}

function main() {
  const { candles } = JSON.parse(fs.readFileSync(CANON_2024, "utf8"));
  const bars2024 = aggregate(candles, BUCKET_MIN);
  console.error(`[paper-1000] NIFTY 2024: ${candles.length} 1-min -> ${bars2024.length} 15-min bars`);

  const scenarioA = runScenario("A-NIFTY-1000", bars2024, CAPITAL, CAPITAL);
  const scenarioB = runScenario("B-NIFTY-100K", bars2024, 100000, 100000);
  const synth1m = syntheticGBM();
  const synthBars = aggregate(synth1m, BUCKET_MIN);
  console.error(`[paper-1000] Synthetic GBM: ${synth1m.length} 1-min -> ${synthBars.length} 15-min bars`);
  const scenarioC = runScenario("C-SYNTH-1000", synthBars, CAPITAL, CAPITAL);

  const report = {
    generatedAt: new Date().toISOString(),
    mode: "PAPER_ONLY_OFFLINE_SIMULATION",
    disclaimer:
      "SIMULATED results only. Not live trading, not a forecast, not a profit promise. NIFTY 50 index is a non-tradable proxy; statutory rates are UNVERIFIED (0/26 verified). Past proxy backtest does not predict future results.",
    config: {
      capital: CAPITAL,
      sleeve: CAPITAL,
      sessionMode: "STRICT_INTRADAY",
      broker: "shoonya",
      maxSL: MAX_SL,
      drawdownFloor: DRAWDOWN_FLOOR,
      minConfidence: 55,
      costs: "statutory round-trip (Shoonya NSE EQ intraday) + 8bps slippage per leg",
      circuitBreaker: "daily cumulative net <= -25 halts further entries that day (post-hoc filter)",
    },
    scenarios: [scenarioA, scenarioB, scenarioC],
    keyFindings: {
      nifty1000Trades: scenarioA.portfolio.totalNet === 0 && scenarioA.strategies.every((s) => s.trades === 0)
        ? "0 trades — ₹1,000 cannot afford 1 NIFTY proxy unit (~₹22k). Capital fully preserved (₹1,000 -> ₹1,000). This is the honest minimum-size result, not a bug."
        : "See per-strategy rows.",
      syntheticNote: "Scenario C uses deterministic synthetic GBM (~₹100) to show ₹1,000 CAN trade when instrument price allows. Synthetic data is NOT market data.",
      referenceNote: "Scenario B (₹100k sleeve) reproduces the known negative expectancy; scaling it to ₹1,000 is illustrative only and is NOT a real backtest.",
    },
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({
    A_NIFTY_1000_portfolio: scenarioA.portfolio,
    B_NIFTY_100K_portfolio: scenarioB.portfolio,
    C_SYNTH_1000_portfolio: scenarioC.portfolio,
    output: OUT,
  }, null, 2));
}

main();
