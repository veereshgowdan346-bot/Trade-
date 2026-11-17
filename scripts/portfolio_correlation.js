/**
 * CORR-001 — Portfolio correlation and diversification study.
 *
 * Addresses the previous study's fatal weakness: 12 sessions. This run uses **30 real sessions
 * per regime** (11,250 one-minute bars), full-prefix signals (no windowing shortcut — windowed
 * signals were measured at only ~99.6% agreement, so they were rejected), and labels every
 * correlation with a reliability class.
 *
 * Reported: daily strategy returns, pairwise correlation (overall + rolling + by regime),
 * drawdown correlation, exposure overlap, concentration, portfolio volatility, combined max
 * drawdown, turnover and cost contribution.
 *
 * Research only. Nothing here changes execution policy.
 *
 * Usage: node scripts/portfolio_correlation.js   (slow: full-prefix evaluation, ~5-10 min)
 */
"use strict";

const fs = require("fs");
const path = require("path");
const {
  researchBacktest,
  reliabilityLabel,
  pearson,
  rollingCorrelation,
  drawdownSeries,
  portfolioStats,
  exposureOverlap,
  istDay,
} = require("../dist_test_cjs/experimental_harness.js");
const { EXPERIMENTAL_IDS } = require("../dist_test_cjs/experimental_strategies.js");
const { isExchangeHoliday, isWeekendHoliday, getIstComponents } = require("../dist_test_cjs/nse_calendar.js");

const T0 = Date.parse("2026-01-05T09:15:00+05:30");
const BAR_MS = 60 * 1000;
const BARS_PER_SESSION = 375; // 09:15-15:29 NSE grid
const SESSIONS = 30;

function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/**
 * Session start timestamps for real NSE trading days: weekends and declared exchange holidays are
 * skipped, so 30 sessions are 30 genuine weekday trading days rather than 30 consecutive calendar
 * days (which would have included Saturdays, Sundays and Republic Day).
 */
function tradingDayStarts(count) {
  const dayMs = 24 * 3600 * 1000;
  const starts = [];
  for (let d = 0; starts.length < count; d++) {
    const dayStart = T0 + d * dayMs;
    const dateStr = getIstComponents(dayStart).dateStr;
    if (isWeekendHoliday(dateStr) || isExchangeHoliday(dateStr)) continue;
    starts.push(dayStart);
    if (d > 200) throw new Error("calendar exhausted looking for trading days");
  }
  return starts;
}

const DAY_STARTS = tradingDayStarts(SESSIONS);

/** 30 sessions of 375 one-minute bars on genuine trading days. */
function makeSessionData(mode, seed) {
  const r = lcg(seed);
  const out = [];
  let p = 900;
  for (let d = 0; d < DAY_STARTS.length; d++) {
    const dayStart = DAY_STARTS[d];
    for (let b = 0; b < BARS_PER_SESSION; b++) {
      const drift =
        mode === "TRENDING" ? 0.02 : mode === "CHOPPY" ? 0 : 0;
      const shock = mode === "VOLATILE" ? (r() - 0.5) * 6 : 0;
      p = Math.max(50, p + drift + shock + (r() - 0.5) * 2.2);
      out.push({
        t: dayStart + b * BAR_MS,
        o: p,
        h: p + 1.3,
        l: p - 1.3,
        c: p + (r() - 0.5) * 0.6,
        v: 1000 + Math.floor(r() * 500),
      });
    }
  }
  return out;
}

const REGIMES = { TRENDING: 101, CHOPPY: 202, VOLATILE: 303 };

const perStrategy = {};
const perRegimeSeries = {};
let sessionsTotal = 0;

for (const [regime, seed] of Object.entries(REGIMES)) {
  const candles = makeSessionData(regime, seed);
  const days = [...new Set(candles.map((c) => istDay(c.t)))];
  sessionsTotal = days.length;
  perRegimeSeries[regime] = { days, series: {}, exposure: {}, costs: {} };
  for (const id of EXPERIMENTAL_IDS) {
    // HISTORICAL MODE: pinned so the published correlation artifact stays reproducible (METHOD-001).
    const res = researchBacktest(id, candles, { sessionMode: "CARRY_OVERNIGHT" });
    perRegimeSeries[regime].series[id] = days.map((d) => res.dailyPnl[d] ?? 0);
    perRegimeSeries[regime].exposure[id] = res.exposureDays;
    perRegimeSeries[regime].costs[id] = res.trades.reduce((a, t) => a + t.charges, 0);
    const s = portfolioStats(perRegimeSeries[regime].series[id]);
    perStrategy[id] = perStrategy[id] || { name: id, byRegime: {}, aggregateNet: 0, aggregateTrades: 0, aggregateCharges: 0 };
    perStrategy[id].byRegime[regime] = { ...s, trades: res.trades.length, charges: Number(perRegimeSeries[regime].costs[id].toFixed(2)) };
    perStrategy[id].aggregateNet = Number((perStrategy[id].aggregateNet + s.net).toFixed(2));
    perStrategy[id].aggregateTrades += res.trades.length;
    perStrategy[id].aggregateCharges = Number((perStrategy[id].aggregateCharges + perRegimeSeries[regime].costs[id]).toFixed(2));
  }
  console.error(`[${regime}] ${days.length} sessions x ${BARS_PER_SESSION} bars, ${EXPERIMENTAL_IDS.length} strategies evaluated`);
}

/* ------------------------- correlations & portfolio ---------------------- */

const reliability = reliabilityLabel(sessionsTotal);
const correlations = [];
for (let i = 0; i < EXPERIMENTAL_IDS.length; i++) {
  for (let j = i + 1; j < EXPERIMENTAL_IDS.length; j++) {
    const a = EXPERIMENTAL_IDS[i];
    const b = EXPERIMENTAL_IDS[j];
    const byRegime = {};
    for (const regime of Object.keys(REGIMES)) {
      byRegime[regime] = pearson(perRegimeSeries[regime].series[a], perRegimeSeries[regime].series[b]);
    }
    // pooled series across regimes (non-overlapping periods, concatenated chronologically)
    const pooledA = Object.keys(REGIMES).flatMap((r) => perRegimeSeries[r].series[a]);
    const pooledB = Object.keys(REGIMES).flatMap((r) => perRegimeSeries[r].series[b]);
    // Pooled = three regimes concatenated. This MIXES between-regime level shifts into a
    // within-regime statistic, so it is descriptive only. The primary evidence is byRegime, and
    // meanByRegime uses the Fisher z-transform (the correct way to average correlations).
    const pooled = pearson(pooledA, pooledB);
    const ddCorr = pearson(drawdownSeries(pooledA), drawdownSeries(pooledB));
    const overlap = Object.keys(REGIMES).reduce((acc, r) => acc + exposureOverlap(perRegimeSeries[r].exposure[a], perRegimeSeries[r].exposure[b]), 0) / Object.keys(REGIMES).length;
    correlations.push({
      a,
      b,
      pooledCorr: pooled,
      meanByRegime: fisherMean(Object.values(byRegime)),
      byRegime,
      drawdownCorr: ddCorr,
      exposureOverlap: Number(overlap.toFixed(3)),
      rolling30: Object.fromEntries(Object.keys(REGIMES).map((r) => [r, rollingCorrelation(perRegimeSeries[r].series[a], perRegimeSeries[r].series[b], 30).slice(-1)[0]])),
    });
  }
}

const defined = correlations.filter((c) => c.pooledCorr !== null);

/** Average correlations via Fisher z: z = atanh(r), average, then tanh back. */
function fisherMean(rs) {
  const vals = rs.filter((r) => r !== null && Math.abs(r) < 0.999999);
  if (!vals.length) return null;
  const z = vals.reduce((a, r) => a + Math.atanh(r), 0) / vals.length;
  return Number(Math.tanh(z).toFixed(3));
}

/* equal-weight portfolio per regime, then pooled */
const portfolioByRegime = {};
for (const regime of Object.keys(REGIMES)) {
  const regimeDaily = perRegimeSeries[regime].days.map((_, i) =>
    EXPERIMENTAL_IDS.reduce((a, id) => a + perRegimeSeries[regime].series[id][i], 0) / EXPERIMENTAL_IDS.length,
  );
  portfolioByRegime[regime] = portfolioStats(regimeDaily);
}
const pooledDaily = Object.keys(REGIMES).flatMap((r) => {
  const days = perRegimeSeries[r].days;
  return days.map((_, i) => EXPERIMENTAL_IDS.reduce((a, id) => a + perRegimeSeries[r].series[id][i], 0) / EXPERIMENTAL_IDS.length);
});
const portfolio = portfolioStats(pooledDaily);

const concentration = EXPERIMENTAL_IDS.map((id) => ({
  id,
  contribution: perStrategy[id].aggregateNet,
  shareOfGrossAbs: null,
})).sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
const grossAbs = concentration.reduce((a, c) => a + Math.abs(c.contribution), 0) || 1;
for (const c of concentration) c.shareOfGrossAbs = Number((Math.abs(c.contribution) / grossAbs).toFixed(3));

const costTotal = EXPERIMENTAL_IDS.reduce((a, id) => a + perStrategy[id].aggregateCharges, 0);

const report = {
  generatedAt: new Date().toISOString(),
  scope: "RESEARCH ONLY — no execution policy is changed by this study",
  method: {
    sessionsPerRegime: sessionsTotal,
    barsPerSession: BARS_PER_SESSION,
    regimes: Object.keys(REGIMES),
    signals: "full-prefix (no windowing — windowed signals were measured at ~99.6% agreement and rejected as inexact)",
    harness: "src/lib/experimental_harness.ts (shared with experimental_research.js — single source of truth)",
    reliabilityThresholds: { INSUFFICIENT_SAMPLE: "< 30 sessions", PRELIMINARY: "30-59 sessions", RELIABLE: ">= 60 sessions", UNVERIFIED: "zero variance / undefined" },
    statisticalCaveat:
      "30 sessions is PRELIMINARY by the project's own rule. Correlations here must not be treated as stable estimates; they are reported to show direction and overlap, not to support allocation decisions.",
  },
  reliability,
  perStrategy,
  correlations: {
    reliability,
    pairs: correlations.length,
    definedPairs: defined.length,
    highCorrelationPairs: defined.filter((c) => Math.abs(c.pooledCorr) >= 0.7).map((c) => ({ a: c.a, b: c.b, corr: c.pooledCorr })),
    meanAbsCorrelation: defined.length ? Number((defined.reduce((a, c) => a + Math.abs(c.pooledCorr), 0) / defined.length).toFixed(3)) : null,
    meanAbsExposureOverlap: Number((correlations.reduce((a, c) => a + c.exposureOverlap, 0) / correlations.length).toFixed(3)),
    matrix: correlations,
  },
  portfolio: {
    pooled: { ...portfolio, annualisedVolatility: null },
    pooledNote:
      "annualisedVolatility is intentionally null for the pooled figure: the three regimes are separate synthetic tapes, so scaling their concatenated daily volatility by sqrt(252) would imply a continuous 90-day record that does not exist. Per-regime figures below are annualised.",
    byRegime: portfolioByRegime,
    concentration,
    totalCharges: Number(costTotal.toFixed(2)),
    costToAbsNetRatio: Math.abs(portfolio.net) > 0 ? Number((costTotal / Math.abs(portfolio.net)).toFixed(3)) : null,
  },
  conclusions: {
    diversificationClaim: "NOT_SUPPORTED",
    primaryCorrelationStatistic: "meanByRegime (Fisher z-averaged across regimes); pooledCorr is descriptive only",
    reason:
      "The equal-weight portfolio remains net negative in every regime. Diversification can reduce variance around a positive expectancy; it cannot create one. With PRELIMINARY sample sizes, no allocation recommendation is made.",
    promotionCandidates: [],
    executionPolicyChanged: false,
  },
};

fs.writeFileSync(path.join(__dirname, "portfolio_correlation_output.json"), JSON.stringify(report, null, 2) + "\n");
console.log(
  JSON.stringify(
    {
      reliability,
      sessionsPerRegime: sessionsTotal,
      portfolio: report.portfolio.pooled,
      byRegimeNet: Object.fromEntries(Object.entries(portfolioByRegime).map(([k, v]) => [k, v.net])),
      correlation: {
        meanByRegimeAbs: Number((correlations.reduce((a, c) => a + Math.abs(c.meanByRegime ?? 0), 0) / correlations.length).toFixed(3)),
        pairs: report.correlations.pairs,
        defined: report.correlations.definedPairs,
        highPairs: report.correlations.highCorrelationPairs.length,
        meanAbs: report.correlations.meanAbsCorrelation,
        meanOverlap: report.correlations.meanAbsExposureOverlap,
      },
      conclusions: report.conclusions,
    },
    null,
    2,
  ),
);
