/**
 * PERF-001 GOLDEN-MASTER EQUIVALENCE HARNESS
 *
 * Proves that the O(n) fast evaluator (`consensus_fast.evaluateConsensusAt`) reproduces the
 * legacy O(n^2) path (`evaluateConsensus(candles.slice(0, i + 1))`) EXACTLY, bar by bar.
 *
 * Compared per bar:
 *   regime (all fields incl. rounded values) · wave gate · every strategy vote, strength and
 *   detail string · suppressed set · buy/sell/voters/quorum/direction · GBM triple ·
 *   qualifies flag · ATR · plugin votes · last price
 * Then compared at trade level (runBacktest legacy vs fast):
 *   every trade (entry/exit time, side, qty, entry/exit price, reason, gross, charges, net,
 *   R-multiple, bars held) and the full summary.
 *
 * Exit code is non-zero on ANY divergence, so this can gate CI.
 *
 * Usage: node scripts/perf_equivalence.js   (needs `npm run test:prep` first)
 */
"use strict";

const fs = require("fs");
const path = require("path");

const { evaluateConsensus } = require("../dist_test_cjs/strategies.js");
const { evaluateConsensusAt, buildSnapshot } = require("../dist_test_cjs/consensus_fast.js");
const { runBacktest } = require("../dist_test_cjs/backtest_engine.js");
const { normaliseRisk } = require("../dist_test_cjs/risk.js");

const T0 = Date.parse("2026-01-05T09:15:00+05:30");
const STEP = 60 * 1000;
const inst = { symbol: "SBIN", exchange: "NSE", kind: "EQ", tradingsymbol: "SBIN-EQ", lotSize: 1, tick: 0.05 };
const cfg = normaliseRisk({ capital: 100000 });

function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function mk(n, fn) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const [o, h, l, c] = fn(i);
    out.push({ t: T0 + i * STEP, o, h, l, c, v: 1000 });
  }
  return out;
}

const DATASETS = {
  // Strong trend
  trend: () => mk(1200, (i) => { const c = 900 + i * 0.9; return [c, c + 2, c - 2, c + 0.5]; }),
  // Choppy sine with noise -> exercises CHOPPY_RANGING suppression path
  choppy: () => { const r = lcg(11); return mk(1200, (i) => { const c = 900 + Math.sin(i / 4) * 6 + (r() - 0.5) * 3; return [c, c + 2, c - 2, c]; }); },
  // Volatile random walk -> exercises VOLATILITY_EXPANSION / wave-gate branches
  volatile: () => { const r = lcg(77); let p = 900; return mk(1200, () => { p = Math.max(50, p + (r() - 0.5) * 14); return [p, p + 3, p - 3, p + (r() - 0.5) * 4]; }); },
  // Regime-switching series: trend -> chop -> trend (crosses every classification branch)
  switching: () => { const r = lcg(5); let p = 900; return mk(1500, (i) => { const phase = Math.floor(i / 300) % 3; p += phase === 0 ? 0.6 : phase === 1 ? Math.sin(i) * 2 + (r() - 0.5) : -(r() - 0.5) * 18; return [p, p + 2, p - 2, p + (r() - 0.5) * 2]; }); },
};

let failures = 0;
const report = { generatedAt: new Date().toISOString(), datasets: {}, tradeLevel: {}, verdict: null };

function cmp(label, a, b, where) {
  if (a === b) return true;
  // Distinguish -0 vs 0 as equal (they are numerically identical)
  if (typeof a === "number" && typeof b === "number" && a === 0 && b === 0) return true;
  if (typeof a === "number" && typeof b === "number" && Number.isNaN(a) && Number.isNaN(b)) return true;
  failures++;
  if (failures <= 12) console.error(`  DIVERGENCE ${label} @ ${where}: legacy=${JSON.stringify(a)} fast=${JSON.stringify(b)}`);
  return false;
}

function cmpConsensus(leg, fast, i, ds) {
  const where = `${ds}#${i}`;
  let same = true;
  // regime (every field)
  for (const k of Object.keys(leg.regime)) same = cmp(`regime.${k}`, leg.regime[k], fast.regime[k], where) && same;
  for (const k of Object.keys(leg.waveGate)) same = cmp(`waveGate.${k}`, leg.waveGate[k], fast.waveGate[k], where) && same;
  cmp("buyVotes", leg.buyVotes, fast.buyVotes, where);
  cmp("sellVotes", leg.sellVotes, fast.sellVotes, where);
  cmp("voters", leg.voters, fast.voters, where);
  cmp("quorumPct", leg.quorumPct, fast.quorumPct, where);
  cmp("direction", leg.direction, fast.direction, where);
  cmp("qualifies", leg.qualifies, fast.qualifies, where);
  cmp("atr", leg.atr, fast.atr, where);
  cmp("lastPrice", leg.lastPrice, fast.lastPrice, where);
  for (const k of ["up", "down", "forDirection", "horizon"]) cmp(`gbm.${k}`, leg.gbm[k], fast.gbm[k], where);
  // strategies (vote, strength, detail, id, suppressed) — order-sensitive
  cmp("strategies.length", leg.strategies.length, fast.strategies.length, where);
  for (let s = 0; s < Math.min(leg.strategies.length, fast.strategies.length); s++) {
    for (const k of ["id", "vote", "strength", "detail", "suppressed"]) {
      cmp(`strategies[${s}].${k}`, leg.strategies[s][k], fast.strategies[s][k], where);
    }
  }
  cmp("suppressed.length", leg.suppressed.length, fast.suppressed.length, where);
  for (let s = 0; s < Math.min(leg.suppressed.length, fast.suppressed.length); s++) {
    for (const k of ["id", "vote", "strength", "detail"]) {
      cmp(`suppressed[${s}].${k}`, leg.suppressed[s][k], fast.suppressed[s][k], where);
    }
  }
  cmp("plugins.length", leg.plugins.length, fast.plugins.length, where);
  for (let s = 0; s < Math.min(leg.plugins.length, fast.plugins.length); s++) {
    for (const k of ["id", "vote", "detail", "type"]) cmp(`plugins[${s}].${k}`, leg.plugins[s][k], fast.plugins[s][k], where);
  }
  return same;
}

/* ---------------------- 1. bar-by-bar equivalence ---------------------- */
console.error("[1/3] bar-by-bar equivalence (legacy prefix vs fast index)");
for (const [name, gen] of Object.entries(DATASETS)) {
  const c = gen();
  const snap = buildSnapshot(c);
  const before = failures;
  let barsCompared = 0;
  // Mirror the ENGINE's convention exactly: decision at bar i uses the prefix EXCLUDING
  // bar i (candles.slice(0, i)), i.e. fast index i-1. Bars 0.. are covered as -1 prefix.
  for (let i = 1; i < c.length; i++) {
    const leg = evaluateConsensus(c.slice(0, i), cfg);
    const fast = evaluateConsensusAt(c, i - 1, snap, cfg);
    cmpConsensus(leg, fast, i, name);
    barsCompared++;
  }
  report.datasets[name] = {
    bars: c.length,
    barsCompared,
    divergences: failures - before,
    status: failures === before ? "EXACT_MATCH" : "DIVERGED",
  };
  console.error(`   ${name}: ${barsCompared} bars -> ${failures === before ? "EXACT MATCH" : `DIVERGED (${failures - before})`}`);
}

/* ------------------------ 2. trade-level equivalence ------------------- */
console.error("[2/3] trade-level equivalence (runBacktest legacy vs fast)");
function runFast(c, controls) {
  return runBacktest(c, inst, cfg, "STANDARD_SHOONYA", { ...(controls || {}), fastEval: true });
}

const tradeCases = {
  trend_3000: DATASETS.trend().concat(mk(1800, (i) => { const c = 1980 + i * 0.8; return [c, c + 2, c - 2, c + 0.4]; })),
  volatile_2500: (() => { const r = lcg(31); let p = 950; return mk(2500, () => { p = Math.max(50, p + (r() - 0.5) * 10); return [p, p + 2.5, p - 2.5, p + (r() - 0.5) * 3]; }); })(),
  switching_1500: DATASETS.switching(),
};

for (const [name, c] of Object.entries(tradeCases)) {
  const legacy = runBacktest(c, inst, cfg, "STANDARD_SHOONYA");
  const fast = runFast(c);
  const before = failures;
  cmp("summary.totalTrades", legacy.totalTrades, fast.totalTrades, name);
  cmp("summary.netPnl", legacy.netPnl, fast.netPnl, name);
  cmp("summary.grossPnl", legacy.grossPnl, fast.grossPnl, name);
  cmp("summary.totalCharges", legacy.totalCharges, fast.totalCharges, name);
  cmp("summary.maxDrawdown", legacy.maxDrawdown, fast.maxDrawdown, name);
  cmp("summary.winRatePct", legacy.winRatePct, fast.winRatePct, name);
  cmp("summary.profitFactor", legacy.profitFactor, fast.profitFactor, name);
  cmp("summary.expectancy", legacy.expectancy, fast.expectancy, name);
  cmp("trades.length", legacy.trades.length, fast.trades.length, name);
  for (let t = 0; t < Math.min(legacy.trades.length, fast.trades.length); t++) {
    for (const k of ["entryTime", "exitTime", "side", "qty", "entryPrice", "exitPrice", "exitReason", "grossPnl", "charges", "netPnl", "rMultiple", "barsHeld"]) {
      cmp(`trade[${t}].${k}`, legacy.trades[t][k], fast.trades[t][k], name);
    }
  }
  report.tradeLevel[name] = {
    bars: c.length,
    trades: legacy.totalTrades,
    legacyNet: legacy.netPnl,
    fastNet: fast.netPnl,
    divergences: failures - before,
    status: failures === before ? "EXACT_MATCH" : "DIVERGED",
  };
  console.error(`   ${name}: ${legacy.totalTrades} trades, net ${legacy.netPnl} -> ${failures === before ? "EXACT MATCH" : `DIVERGED (${failures - before})`}`);
}

/* --------------------------- 3. reproducibility ----------------------- */
console.error("[3/3] determinism (fast path run twice)");
{
  const c = tradeCases.switching_1500;
  const a = runFast(c);
  const b = runFast(c);
  const same = JSON.stringify(a) === JSON.stringify(b);
  cmp("determinism", true, same, "switching_1500");
  report.determinism = { status: same ? "EXACT_MATCH" : "DIVERGED" };
  console.error(`   deterministic: ${same}`);
}

report.totalDivergences = failures;
report.verdict = failures === 0 ? "EXACT_EQUIVALENCE_VERIFIED" : "EQUIVALENCE_FAILED";
fs.writeFileSync(path.join(__dirname, "perf_equivalence_output.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({ verdict: report.verdict, divergences: failures, datasets: report.datasets, tradeLevel: report.tradeLevel }, null, 2));
process.exitCode = failures === 0 ? 0 : 1;
