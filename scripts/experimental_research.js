/**
 * EXPERIMENTAL STRATEGY + PORTFOLIO RESEARCH EVALUATOR (research only)
 *
 * Runs each registry strategy standalone through a deliberately simple, documented research
 * harness, then evaluates the strategies *together* at portfolio level.
 *
 * Research harness rules (identical for every strategy, no per-strategy tuning):
 *   - Signal is computed on the PREFIX excluding the current bar (candles.slice(0, i)),
 *     mirroring the production engine, and the fill happens at c[i].c — no look-ahead.
 *   - Enter when |signal| = 1 and confidence >= 55. Flat otherwise (one position at a time).
 *   - Exit on: opposite signal, ATR stop (2x ATR14), ATR target (3x ATR14), or day boundary.
 *   - Sleeve = Rs 1,00,000 notional per strategy; qty = floor(sleeve / price), min 1.
 *   - Costs come from the repository's statutory round-trip model (Shoonya rows) + slippage.
 *   - No leverage, no parameter search, no optimisation against the evaluated data.
 *
 * Every number here is RESEARCH. It is not a profitability claim and does not enable anything.
 *
 * Usage: node scripts/experimental_research.js   (after `npm run test:prep`)
 */
"use strict";

const fs = require("fs");
const path = require("path");

const { EXPERIMENTAL_REGISTRY, validateRegistry } = require("../dist_test_cjs/experimental_strategies.js");
const { researchBacktest: researchHarness, MIN_CONFIDENCE, SLEEVE } = require("../dist_test_cjs/experimental_harness.js");

const T0 = Date.parse("2026-01-05T09:15:00+05:30");
const STEP = 60 * 1000;
const BARS_PER_DAY = 375; // 09:15-15:29 on a 1-minute grid, matching the repository fixtures

function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function mk(n, fn) {
  const out = new Array(n);
  for (let i = 0; i < n; i++) {
    const [o, h, l, c, v] = fn(i);
    out[i] = { t: T0 + i * STEP, o, h, l, c, v: v === undefined ? 1000 : v };
  }
  return out;
}

const REGIMES = {
  TRENDING: () => { const r = lcg(101); let p = 900; return mk(4500, (i) => { p += 0.35 + (r() - 0.5) * 2.2; return [p, p + 1.4, p - 1.4, p + (r() - 0.5), 1200]; }); },
  CHOPPY: () => { const r = lcg(202); return mk(4500, (i) => { const c = 900 + Math.sin(i / 6) * 7 + (r() - 0.5) * 2; return [c, c + 1.5, c - 1.5, c, 900]; }); },
  VOLATILE: () => { const r = lcg(303); let p = 900; return mk(4500, () => { p = Math.max(60, p + (r() - 0.5) * 16); return [p, p + 4, p - 4, p + (r() - 0.5) * 5, 2000]; }); },
};


/**
 * Research backtest — now delegating to the shared harness so this script and
 * scripts/portfolio_correlation.js cannot drift apart (CORR-001 / DATA-001 requirement).
 */
function researchBacktest(strategyId, candles) {
  // HISTORICAL MODE: this synthetic-regime study was published under the permissive session rule.
  // Pinned explicitly so its artifact stays reproducible; new work must use the strict default.
  return researchHarness(strategyId, candles, { sessionMode: "CARRY_OVERNIGHT" }).trades;
}

function metrics(trades, label) {
  const n = trades.length;
  if (!n) {
    return { label, trades: 0, gross: 0, net: 0, winRatePct: 0, profitFactor: 0, expectancy: 0, avgWin: 0, avgLoss: 0, maxDrawdown: 0, totalCharges: 0, costToGrossRatio: null, note: "no trades" };
  }
  const gross = trades.reduce((a, t) => a + t.gross, 0);
  const net = trades.reduce((a, t) => a + t.net, 0);
  const charges = trades.reduce((a, t) => a + t.charges, 0);
  const wins = trades.filter((t) => t.net > 0);
  const losses = trades.filter((t) => t.net <= 0);
  const grossWin = wins.reduce((a, t) => a + t.net, 0);
  const grossLoss = Math.abs(losses.reduce((a, t) => a + t.net, 0));
  let eq = 0;
  let peak = 0;
  let dd = 0;
  for (const t of trades) {
    eq += t.net;
    peak = Math.max(peak, eq);
    dd = Math.max(dd, peak - eq);
  }
  return {
    label,
    trades: n,
    gross: Number(gross.toFixed(2)),
    net: Number(net.toFixed(2)),
    totalCharges: Number(charges.toFixed(2)),
    winRatePct: Number(((wins.length / n) * 100).toFixed(1)),
    profitFactor: grossLoss > 0 ? Number((grossWin / grossLoss).toFixed(3)) : null,
    expectancy: Number((net / n).toFixed(2)),
    avgWin: wins.length ? Number((grossWin / wins.length).toFixed(2)) : 0,
    avgLoss: losses.length ? Number((-grossLoss / losses.length).toFixed(2)) : 0,
    maxDrawdown: Number(dd.toFixed(2)),
    costToGrossRatio: Math.abs(gross) > 0 ? Number((charges / Math.abs(gross)).toFixed(3)) : null,
  };
}

/* ------------------------------- run matrix ------------------------------ */
const val = validateRegistry();
console.error(`[registry] ${val.count} experimental strategies validated, all disabled`);

const perStrategy = {};
const dailyByStrategy = {}; // id -> Map(day -> net)
for (const s of EXPERIMENTAL_REGISTRY) {
  perStrategy[s.id] = { name: s.name, family: s.family, status: s.status, byRegime: {} };
  dailyByStrategy[s.id] = new Map();
  for (const [regimeName, gen] of Object.entries(REGIMES)) {
    const candles = gen();
    const trades = researchBacktest(s.id, candles);
    const m = metrics(trades, `${s.id}@${regimeName}`);
    perStrategy[s.id].byRegime[regimeName] = m;
    for (const t of trades) {
      const cur = dailyByStrategy[s.id].get(t.day) || 0;
      dailyByStrategy[s.id].set(t.day, cur + t.net);
    }
    console.error(`[${s.id}] ${regimeName}: ${m.trades} trades, net ${m.net}, PF ${m.profitFactor}`);
  }
  const all = Object.values(perStrategy[s.id].byRegime);
  const totTrades = all.reduce((a, m) => a + m.trades, 0);
  const totNet = all.reduce((a, m) => a + m.net, 0);
  perStrategy[s.id].aggregate = {
    trades: totTrades,
    net: Number(totNet.toFixed(2)),
    regimesPositive: all.filter((m) => m.net > 0).length,
    regimesTested: all.length,
  };
}

/* ---------------------------- portfolio analysis ------------------------- */
const ids = EXPERIMENTAL_REGISTRY.map((s) => s.id);
const days = [...new Set(ids.flatMap((id) => [...dailyByStrategy[id].keys()]))].sort();
const series = {};
for (const id of ids) series[id] = days.map((d) => dailyByStrategy[id].get(d) || 0);

function corr(a, b) {
  const n = a.length;
  const ma = a.reduce((x, y) => x + y, 0) / n;
  const mb = b.reduce((x, y) => x + y, 0) / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    num += (a[i] - ma) * (b[i] - mb);
    da += (a[i] - ma) ** 2;
    db += (b[i] - mb) ** 2;
  }
  if (da === 0 || db === 0) return null; // undefined correlation for a flat strategy
  return Number((num / Math.sqrt(da * db)).toFixed(3));
}

const correlations = [];
for (let i = 0; i < ids.length; i++) {
  for (let j = i + 1; j < ids.length; j++) {
    const c = corr(series[ids[i]], series[ids[j]]);
    correlations.push({ a: ids[i], b: ids[j], corr: c });
  }
}
const definedCorr = correlations.filter((c) => c.corr !== null);
const highCorr = definedCorr.filter((c) => Math.abs(c.corr) >= 0.7);

// equal-weight portfolio: average daily P&L across strategies, per day
const portfolioDaily = days.map((_, di) => ids.reduce((a, id) => a + series[id][di], 0) / ids.length);
let eq = 0, peak = 0, maxDD = 0;
for (const v of portfolioDaily) {
  eq += v;
  peak = Math.max(peak, eq);
  maxDD = Math.max(maxDD, peak - eq);
}
const portfolio = {
  days,
  equalWeightNet: Number(eq.toFixed(2)),
  equalWeightMaxDrawdown: Number(maxDD.toFixed(2)),
  strategiesWithAnyPnl: ids.filter((id) => series[id].some((v) => v !== 0)).length,
  concentration: ids
    .map((id) => ({ id, contribution: Number(series[id].reduce((a, b) => a + b, 0).toFixed(2)) }))
    .sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution)),
  costContribution: ids.map((id) => {
    const charges = Object.values(perStrategy[id].byRegime).reduce((a, m) => a + m.totalCharges, 0);
    const net = Object.values(perStrategy[id].byRegime).reduce((a, m) => a + m.net, 0);
    return { id, charges: Number(charges.toFixed(2)), net: Number(net.toFixed(2)) };
  }),
};

const anyPositiveOos = EXPERIMENTAL_REGISTRY.some((s) => {
  const agg = perStrategy[s.id].aggregate;
  return agg.trades >= 20 && agg.net > 0 && agg.regimesPositive === agg.regimesTested;
});

const report = {
  generatedAt: new Date().toISOString(),
  scope: "RESEARCH ONLY — experimental strategies are disabled and not connected to the production quorum",
  harnessRules: {
    signalPrefix: "candles.slice(0,i) (excludes current bar)",
    fillModel: "entry at c[i].c, stop/target at level, EOD at next-day open",
    minConfidence: MIN_CONFIDENCE,
    sleeve: SLEEVE,
    sourceOfTruth: "src/lib/experimental_harness.ts",
    costModel: "statutory round-trip (Shoonya) + slippage; rates UNVERIFIED against official tariffs",
    leverage: "none",
    parameterSearch: "none",
  },
  registryValidation: val,
  datasets: Object.fromEntries(Object.entries(REGIMES).map(([k, g]) => [k, { bars: g().length, barsPerDay: BARS_PER_DAY }])),
  perStrategy,
  correlation: {
    pairs: correlations.length,
    definedPairs: definedCorr.length,
    highCorrelationPairs: highCorr,
    // Daily-P&L correlations over a handful of sessions are statistically meaningless.
    // Reporting the count without this caveat would be false precision.
    sampleDays: days.length,
    reliability: days.length >= 30 ? "ADEQUATE" : "INSUFFICIENT_SAMPLE_DO_NOT_ACT_ON",
    matrix: correlations,
  },
  portfolio,
  verdict: {
    promotionCandidates: anyPositiveOos ? "NONE_MEETING_FULL_CRITERIA_SEE_NOTES" : "NONE",
    reason: anyPositiveOos
      ? "At least one strategy is net positive across all tested regimes; it still lacks independent holdout evidence and authorisation."
      : "No experimental strategy is net positive across all tested regimes on this harness; none is a promotion candidate.",
    profitabilityEvidence: "NEGATIVE_INSUFFICIENT",
  },
};

fs.writeFileSync(path.join(__dirname, "experimental_research_output.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify({
  verdict: report.verdict,
  aggregate: Object.fromEntries(Object.entries(perStrategy).map(([k, v]) => [k, v.aggregate])),
  portfolio: { net: portfolio.equalWeightNet, maxDD: portfolio.equalWeightMaxDrawdown },
  highCorrelationPairs: highCorr.length,
}, null, 2));
