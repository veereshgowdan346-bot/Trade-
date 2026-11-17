/**
 * GATE 5 — Statistical robustness of the real-data results.
 *
 * The original study bootstrapped TRADE-level P&L. Trades are not independent: they are clustered
 * within sessions (same day, same regime, overlapping signal state) and serially dependent. Trade-level
 * bootstrap therefore understates uncertainty. This script recomputes every interval three ways and
 * reports the design effect so the understatement is visible rather than assumed away.
 *
 *  - trade bootstrap        : resample trades i.i.d.           (the optimistic, originally used method)
 *  - session-cluster        : resample whole sessions           (respects same-day clustering)
 *  - moving-block bootstrap : resample contiguous blocks of k    (respects serial dependence)
 *
 * Also reports trade count, session count, exposure, max drawdown, lag-1 autocorrelation, and labels
 * each period exploratory (TRAIN/VALIDATION) or confirmatory (OOS).
 *
 * Usage: node scripts/statistical_robustness.js
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { researchBacktest } = require("../dist_test_cjs/experimental_harness.js");
const { EXPERIMENTAL_REGISTRY } = require("../dist_test_cjs/experimental_strategies.js");
const { getIstComponents } = require("../dist_test_cjs/nse_calendar.js");

const ROOT = path.join(__dirname, "..");
const CANON = path.join(ROOT, "data", "external", "canonical");
/**
 * METHOD-001: this study now runs the CORRECTED strict-intraday rule by default and writes to its own
 * artifact. `SESSION_MODE=CARRY_OVERNIGHT` regenerates the historical (overnight-inclusive) artifact
 * so the pre-correction numbers stay reproducible and are never silently overwritten.
 */
const SESSION_MODE =
  process.argv.includes("--legacy") || process.env.SESSION_MODE === "CARRY_OVERNIGHT" ? "CARRY_OVERNIGHT" : "STRICT_INTRADAY";
const OUT = path.join(
  ROOT,
  "data",
  "provenance",
  SESSION_MODE === "STRICT_INTRADAY" ? "statistical_robustness_strict.json" : "statistical_robustness.json",
);
const REPS = 10000;
const BLOCK = 5;

const mulberry32 = (a) => () => {
  a |= 0;
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

function aggregate(candles, bucketMin = 15) {
  const out = [];
  let key = null;
  let cur = null;
  for (const c of candles) {
    const ist = getIstComponents(c.t);
    const k = `${ist.dateStr}#${Math.floor((ist.hours * 60 + ist.minutes - 555) / bucketMin)}`;
    if (k !== key) {
      if (cur) out.push(cur);
      key = k;
      cur = { t: c.t, o: c.o, h: c.h, l: c.l, c: c.c, v: c.v };
    } else {
      if (c.h > cur.h) cur.h = c.h;
      if (c.l < cur.l) cur.l = c.l;
      cur.c = c.c;
      cur.v += c.v;
      cur.t = c.t;
    }
  }
  if (cur) out.push(cur);
  return out;
}

const q = (sorted, p) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(p * (sorted.length - 1))))];

function mean(xs) {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}
const sd = (xs) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
};

/** Bootstrap the MEAN of clusters; `draw` returns an array of cluster values for one resample. */
function bootstrapCI(clusters, stat, reps = REPS, seed = 12345) {
  const rnd = mulberry32(seed);
  const vals = [];
  for (let i = 0; i < reps; i++) {
    const pick = [];
    for (let j = 0; j < clusters.length; j++) pick.push(clusters[Math.floor(rnd() * clusters.length)]);
    vals.push(stat(pick));
  }
  vals.sort((a, b) => a - b);
  return { low: q(vals, 0.025), high: q(vals, 0.975), se: sd(vals) };
}

function blockCI(values, blockLen, stat, reps = REPS, seed = 999) {
  // moving-block bootstrap over a sequence (preserves local serial dependence)
  const n = values.length;
  const rnd = mulberry32(seed);
  const vals = [];
  const nBlocks = Math.ceil(n / blockLen);
  for (let r = 0; r < reps; r++) {
    const pick = [];
    for (let b = 0; b < nBlocks; b++) {
      const start = Math.floor(rnd() * Math.max(1, n - blockLen + 1));
      for (let j = 0; j < blockLen && pick.length < n; j++) pick.push(values[start + j]);
    }
    vals.push(stat(pick));
  }
  vals.sort((a, b) => a - b);
  return { low: q(vals, 0.025), high: q(vals, 0.975), se: sd(vals) };
}

function maxDrawdown(values) {
  let peak = 0;
  let cum = 0;
  let dd = 0;
  for (const v of values) {
    cum += v;
    if (cum > peak) peak = cum;
    if (peak - cum > dd) dd = peak - cum;
  }
  return dd;
}

function lag1(xs) {
  if (xs.length < 3) return null;
  const m = mean(xs);
  let num = 0;
  let den = 0;
  for (let i = 0; i < xs.length; i++) {
    den += (xs[i] - m) ** 2;
    if (i > 0) num += (xs[i] - m) * (xs[i - 1] - m);
  }
  return den === 0 ? null : num / den;
}

const YEARS = [
  { year: 2022, period: "TRAIN", role: "exploratory" },
  { year: 2023, period: "VALIDATION", role: "exploratory" },
  { year: 2024, period: "OOS", role: "confirmatory" },
];

const data = {};
for (const { year } of YEARS) {
  const raw = JSON.parse(fs.readFileSync(path.join(CANON, `NIFTY50_1min_${year}.json`), "utf8")).candles;
  data[year] = aggregate(raw);
}

const excludedArms = [];

const report = {
  generatedAt: new Date().toISOString(),
  command: SESSION_MODE === "STRICT_INTRADAY" ? "node scripts/statistical_robustness.js" : "SESSION_MODE=CARRY_OVERNIGHT node scripts/statistical_robustness.js",
  sessionMode: SESSION_MODE,
  method: { reps: REPS, blockLength: BLOCK, interval: "95%", seed: "mulberry32 deterministic" },
  caveats: [
    "P&L per trade is after the harness cost model, whose statutory and slippage rates are UNVERIFIED (RATE-001).",
    "Instrument is the NIFTY 50 index (authenticity UNVERIFIED_REDISTRIBUTION); it is not directly tradable.",
    "Session-cluster bootstrap is the primary interval; trade-level is shown only to expose the design effect.",
  ],
  strategies: [],
};

const evaluable = [];
const pooled = {};
for (const { year, period, role } of YEARS) {
  const candles = data[year];
  const allDays = [...new Set(candles.map((c) => getIstComponents(c.t).dateStr))];
  const sessionMinutes = new Map();
  for (const c of candles) {
    const d = getIstComponents(c.t).dateStr;
    sessionMinutes.set(d, (sessionMinutes.get(d) ?? 0) + 15);
  }
  const totalMinutes = [...sessionMinutes.values()].reduce((a, b) => a + b, 0);
  const perStrategy = [];
  for (const s of EXPERIMENTAL_REGISTRY) {
    // STAT-003: the protocol declares volume-dependent strategies NOT_EVALUABLE because an index
    // series publishes no volume. Those arms must not reappear here as if they were measurable.
    if (s.requiredData.some((r) => /volume/i.test(r))) {
      excludedArms.push({ id: s.id, reason: "requires volume; index series publishes none (NOT_EVALUABLE per protocol)" });
      continue;
    }
    const trades = researchBacktest(s.id, candles, { sessionMode: SESSION_MODE }).trades;
    if (trades.length === 0) {
      perStrategy.push({ id: s.id, name: s.name, period, evaluable: false, reason: "no trades (requires volume or never triggered)" });
      continue;
    }
    const nets = trades.map((t) => t.net);
    const gross = trades.map((t) => t.gross);
    const bySession = new Map();
    for (const t of trades) {
      const d = getIstComponents(t.entryTime).dateStr; // entry session (trade.day is the EXIT day)
      if (!bySession.has(d)) bySession.set(d, []);
      bySession.get(d).push(t.net);
    }
    const sessionSums = [...bySession.values()].map((v) => v.reduce((a, b) => a + b, 0));
    const sessionMeans = [...bySession.values()].map((v) => mean(v));
    // Exposure counts only in-session holding time: a trade carried overnight would otherwise add
    // ~17.75 h of gap time and push the share above 100% (an artefact, not exposure).
    const sessionEnd = new Map();
    for (const c of candles) {
      const d = getIstComponents(c.t).dateStr;
      if (!sessionEnd.has(d) || c.t > sessionEnd.get(d)) sessionEnd.set(d, c.t);
    }
    const tradedMinutes = trades.reduce((a, t) => {
      const d = getIstComponents(t.entryTime).dateStr;
      const end = sessionEnd.get(d) ?? t.entryTime;
      const stop = Math.min(t.exitTime, end);
      return a + Math.max(0, (stop - t.entryTime) / 60000);
    }, 0);
    const overnightTrades = trades.filter((t) => getIstComponents(t.entryTime).dateStr !== getIstComponents(t.exitTime).dateStr).length;

    const tradeCI = bootstrapCI(nets, (p) => mean(p), REPS, 11);
    // cluster bootstrap: resample sessions, each contributing its own mean per trade
    const clusterCI = bootstrapCI(
      [...bySession.values()],
      (p) => mean(p.flat()),
      REPS,
      22,
    );
    const blockCIRes = blockCI(nets, BLOCK, (p) => mean(p), REPS, 33);
    const sessionSumCI = bootstrapCI(sessionSums, (p) => mean(p), REPS, 44);

    perStrategy.push({
      id: s.id,
      name: s.name,
      period,
      role,
      evaluable: true,
      trades: trades.length,
      sessionsTraded: bySession.size,
      sessionsInPeriod: allDays.length,
      shareOfSessionsTraded: +(bySession.size / allDays.length).toFixed(4),
      tradesPerSession: +(trades.length / bySession.size).toFixed(2),
      exposureMinutes: Math.round(tradedMinutes),
      exposureShareOfSessionTime: +(tradedMinutes / totalMinutes).toFixed(4),
      overnightCarriedTrades: overnightTrades,
      overnightCarriedShare: +(overnightTrades / trades.length).toFixed(4),
      meanGrossPerTrade: +mean(gross).toFixed(2),
      meanNetPerTrade: +mean(nets).toFixed(2),
      sdNetPerTrade: +sd(nets).toFixed(2),
      netTotal: +nets.reduce((a, b) => a + b, 0).toFixed(2),
      maxDrawdownNet: +maxDrawdown(nets).toFixed(2),
      lag1AutocorrNet: lag1(nets) === null ? null : +lag1(nets).toFixed(4),
      ci95: {
        tradeLevel: { low: +tradeCI.low.toFixed(2), high: +tradeCI.high.toFixed(2), se: +tradeCI.se.toFixed(2) },
        sessionCluster: { low: +clusterCI.low.toFixed(2), high: +clusterCI.high.toFixed(2), se: +clusterCI.se.toFixed(2) },
        blockBootstrap: { low: +blockCIRes.low.toFixed(2), high: +blockCIRes.high.toFixed(2), se: +blockCIRes.se.toFixed(2) },
      },
      designEffect: +(clusterCI.se / tradeCI.se).toFixed(2),
      sessionMeanNet: +mean(sessionMeans).toFixed(2),
      sessionMeanNetCI: { low: +sessionSumCI.low.toFixed(2), high: +sessionSumCI.high.toFixed(2) },
      signStableAcrossMethods:
        tradeCI.high < 0 && clusterCI.high < 0 && blockCIRes.high < 0
          ? "NEGATIVE_ALL_METHODS"
          : tradeCI.low > 0 && clusterCI.low > 0 && blockCIRes.low > 0
            ? "POSITIVE_ALL_METHODS"
            : "SIGN_AMBIGUOUS",
    });

    // pooled portfolio: sum nets per session across arms of the same year
    if (!pooled[year]) pooled[year] = { period, role, bySession: new Map() };
    for (const [d, v] of bySession) {
      pooled[year].bySession.set(d, (pooled[year].bySession.get(d) ?? 0) + v.reduce((a, b) => a + b, 0));
    }
  }
  report.strategies.push({ year, period, role, results: perStrategy });
  if (perStrategy.some((r) => r.evaluable)) evaluable.push({ year, period });
}

report.pooledPortfolio = Object.entries(pooled).map(([year, p]) => {
  const sessionSums = [...p.bySession.values()];
  const ci = bootstrapCI(sessionSums, (x) => mean(x), REPS, 55);
  return {
    year: +year,
    period: p.period,
    role: p.role,
    sessions: sessionSums.length,
    netTotal: +sessionSums.reduce((a, b) => a + b, 0).toFixed(2),
    meanNetPerSession: +mean(sessionSums).toFixed(2),
    maxDrawdownNet: +maxDrawdown(sessionSums).toFixed(2),
    ci95SessionCluster: { low: +ci.low.toFixed(2), high: +ci.high.toFixed(2), se: +ci.se.toFixed(2) },
  };
});

const oos = report.strategies.find((s) => s.period === "OOS").results.filter((r) => r.evaluable);
report.summary = {
  evaluableStrategies: oos.length,
  oosTrades: oos.reduce((a, r) => a + r.trades, 0),
  oosSessionsInPeriod: report.strategies.find((s) => s.period === "OOS").results.find((r) => r.evaluable).sessionsInPeriod,
  oosSessionsTradedMin: Math.min(...oos.map((r) => r.sessionsTraded)),
  oosSessionsTradedMax: Math.max(...oos.map((r) => r.sessionsTraded)),
  oosOvernightCarriedTrades: oos.reduce((a, r) => a + r.overnightCarriedTrades, 0),
  negativeAllMethods: oos.filter((r) => r.signStableAcrossMethods === "NEGATIVE_ALL_METHODS").length,
  positiveAllMethods: oos.filter((r) => r.signStableAcrossMethods === "POSITIVE_ALL_METHODS").length,
  ambiguous: oos.filter((r) => r.signStableAcrossMethods === "SIGN_AMBIGUOUS").length,
  medianDesignEffect: +[oos.map((r) => r.designEffect).sort((a, b) => a - b)[Math.floor(oos.length / 2)]][0].toFixed(2),
  maxDesignEffect: +Math.max(...oos.map((r) => r.designEffect)).toFixed(2),
};
report.verdict =
  report.summary.positiveAllMethods > 0
    ? "POSITIVE_SIGN_SURVIVES_CLUSTERING"
    : report.summary.negativeAllMethods === oos.length
      ? "NEGATIVE_RESULT_ROBUST_TO_CLUSTERING"
      : "MIXED";

// Recorded after the per-strategy loops: the report object is constructed before they run.
report.excludedArms = excludedArms.filter((e, i, a) => a.findIndex((x) => x.id === e.id) === i);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n");

console.log("period      strategy                  trades sessions  net/trade  trade-CI            cluster-CI          block-CI           DE    sign");
for (const s of report.strategies) {
  for (const r of s.results) {
    if (!r.evaluable) continue;
    const f = (c) => `[${c.low.toFixed(2)},${c.high.toFixed(2)}]`.padEnd(19);
    console.log(
      `${r.period.padEnd(11)} ${r.id.padEnd(24)} ${String(r.trades).padStart(6)} ${String(r.sessionsTraded).padStart(8)} ${r.meanNetPerTrade.toFixed(2).padStart(10)}  ${f(r.ci95.tradeLevel)} ${f(r.ci95.sessionCluster)} ${f(r.ci95.blockBootstrap)} ${String(r.designEffect).padStart(5)} ${r.signStableAcrossMethods}`,
    );
  }
}
console.log("\npooled:");
for (const p of report.pooledPortfolio) console.log(`  ${p.year} ${p.period.padEnd(11)} sessions=${p.sessions} net=${p.netTotal} mean/session=${p.meanNetPerSession} CI=[${p.ci95SessionCluster.low},${p.ci95SessionCluster.high}] maxDD=${p.maxDrawdownNet}`);
console.log("\nsummary:", JSON.stringify(report.summary));
console.log("verdict:", report.verdict);
