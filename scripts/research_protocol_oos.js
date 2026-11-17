/**
 * Reproducible research protocol — chronological train / validation / out-of-sample.
 *
 * PROTOCOL (fixed before running; see FINAL_READINESS_REPORT/RESEARCH_PROTOCOL.md)
 *   Data      : NIFTY 50 index 1-minute, aggregated to 15-minute bars.
 *               TRAIN = 2022, VALIDATION = 2023, OUT-OF-SAMPLE = 2024. No overlap, no shuffling.
 *   Signals   : full prefix (candles.slice(0,i)) — identical to the production engine's convention.
 *               No rolling-window approximation.
 *   Parameters: DEFAULT configs only. No search, no tuning, no per-period choice. Nothing is
 *               selected using OOS data.
 *   Costs     : statutory round-trip model (Shoonya, intraday equity) + slippage, applied per trade.
 *               The index is not directly tradable, so this is a PROXY and rates are UNVERIFIED.
 *   Volume    : the index publishes no volume -> volume-based strategies are NOT_EVALUABLE, not
 *               silently run with zeros.
 *   Decision  : OOS_SUPPORTED requires net > 0 in BOTH validation and OOS, >= 100 trades in each,
 *               and a bootstrap 95% CI for mean trade net excluding zero. Otherwise NOT_SUPPORTED.
 *               No promotion follows from this study under any outcome; production stays disabled.
 *
 * Usage: node scripts/research_protocol_oos.js
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { researchBacktest, portfolioStats, SLEEVE, MIN_CONFIDENCE } = require("../dist_test_cjs/experimental_harness.js");
const { roundTripCharges } = require("../dist_test_cjs/tax.js");
const { EXPERIMENTAL_REGISTRY } = require("../dist_test_cjs/experimental_strategies.js");

const ROOT = path.join(__dirname, "..");
const CANON = path.join(ROOT, "data", "external", "canonical");
/**
 * METHOD-001: session mode is explicit here.
 *   SESSION_MODE=CARRY_OVERNIGHT (default for this script) reproduces the HISTORICAL figures that
 *   were published before the strict-intraday correction — those numbers carry overnight exposure.
 *   SESSION_MODE=STRICT_INTRADAY is the corrected rule mandated for an intraday strategy and writes
 *   to a SEPARATE artifact, so neither result set can silently overwrite the other.
 */
const SESSION_MODE =
  process.argv.includes("--strict") || process.env.SESSION_MODE === "STRICT_INTRADAY" ? "STRICT_INTRADAY" : "CARRY_OVERNIGHT";
const OUT = path.join(
  __dirname,
  SESSION_MODE === "STRICT_INTRADAY" ? "research_protocol_strict_intraday_output.json" : "research_protocol_output.json",
);
const BUCKET_MIN = 15;

const PERIODS = [
  { name: "TRAIN", year: 2022, file: "NIFTY50_1min_2022.json" },
  { name: "VALIDATION", year: 2023, file: "NIFTY50_1min_2023.json" },
  { name: "OOS", year: 2024, file: "NIFTY50_1min_2024.json" },
];

const VOLUME_REQUIRED = new Set(
  EXPERIMENTAL_REGISTRY.filter((s) => (s.requiredData || []).some((r) => /volume/i.test(r))).map((s) => s.id),
);

/* ------------------------------ deterministic RNG ------------------------------ */
function lcg(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0), s / 4294967296);
}

/* --------------------------------- aggregation -------------------------------- */
const IST_OFFSET_MS = 5.5 * 3600 * 1000;
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
      cur.t = c.t; // stamp the bucket by its last bar (bar-close convention)
    }
  }
  if (cur) out.push(cur);
  return out;
}

/* --------------------------------- statistics --------------------------------- */
function bootstrapCI(values, iters = 10000, seed = 42) {
  if (values.length < 10) return { low: null, high: null, note: "fewer than 10 observations" };
  const rnd = lcg(seed);
  const means = new Float64Array(iters);
  const n = values.length;
  for (let i = 0; i < iters; i++) {
    let sum = 0;
    for (let j = 0; j < n; j++) sum += values[(rnd() * n) | 0];
    means[i] = sum / n;
  }
  means.sort();
  return {
    low: Number(means[Math.floor(iters * 0.025)].toFixed(4)),
    high: Number(means[Math.floor(iters * 0.975)].toFixed(4)),
    iters,
    resamples: n,
  };
}

function metrics(trades, label) {
  const n = trades.length;
  if (!n) {
    return {
      label, trades: 0, sessions: 0, gross: 0, charges: 0, net: 0, winRatePct: 0, profitFactor: null,
      expectancy: null, maxDrawdown: 0, avgNet: null, ci95: null, tStat: null, costToGrossRatio: null,
      statutoryCharges: 0, slippageAssumption: 0, slippageSharePct: null,
      perTrade: null, slippageSensitivity: null, note: "no trades",
    };
  }
  const gross = trades.reduce((a, t) => a + t.gross, 0);
  const charges = trades.reduce((a, t) => a + t.charges, 0);
  const net = trades.reduce((a, t) => a + t.net, 0);
  const wins = trades.filter((t) => t.net > 0);
  const losses = trades.filter((t) => t.net <= 0);
  const gw = wins.reduce((a, t) => a + t.net, 0);
  const gl = Math.abs(losses.reduce((a, t) => a + t.net, 0));
  const nets = trades.map((t) => t.net);
  const mean = net / n;
  const sd = n > 1 ? Math.sqrt(nets.reduce((a, v) => a + (v - mean) ** 2, 0) / (n - 1)) : 0;
  // decompose the cost model: statutory heads vs the SLIPPAGE ASSUMPTION, which dominates
  let statutory = 0;
  let slippage = 0;
  for (const t of trades) {
    const ch = roundTripCharges({
      exchange: "NSE", kind: "EQ", broker: "shoonya", qty: t.qty,
      entry: t.entry, exit: t.exit, side: t.side, productType: "INTRADAY",
    });
    statutory += ch.brokerage + ch.stt + ch.exchangeFees + ch.sebi + ch.stamp + ch.gst;
    slippage += ch.slippage;
  }
  const byDay = new Map();
  for (const t of trades) byDay.set(t.day, (byDay.get(t.day) ?? 0) + t.net);
  const daily = [...byDay.values()];
  return {
    label,
    trades: n,
    sessions: daily.length,
    gross: Number(gross.toFixed(2)),
    charges: Number(charges.toFixed(2)),
    net: Number(net.toFixed(2)),
    winRatePct: Number(((wins.length / n) * 100).toFixed(2)),
    profitFactor: gl > 0 ? Number((gw / gl).toFixed(3)) : null,
    expectancy: Number(mean.toFixed(2)),
    avgNet: Number(mean.toFixed(2)),
    maxDrawdown: portfolioStats(daily).maxDrawdown,
    ci95: bootstrapCI(nets),
    tStat: sd > 0 ? Number((mean / (sd / Math.sqrt(n))).toFixed(2)) : null,
    costToGrossRatio: Math.abs(gross) > 0 ? Number((charges / Math.abs(gross)).toFixed(3)) : null,
    statutoryCharges: Number(statutory.toFixed(2)),
    slippageAssumption: Number(slippage.toFixed(2)),
    slippageSharePct: charges > 0 ? Number(((slippage / charges) * 100).toFixed(1)) : null,
    perTrade: { gross: Number((gross / n).toFixed(2)), statutory: Number((statutory / n).toFixed(2)), slippage: Number((slippage / n).toFixed(2)), net: Number((net / n).toFixed(2)) },
    // net if the slippage ASSUMPTION were scaled: it is unverified, so the result must be shown to depend on it
    slippageSensitivity: Object.fromEntries(
      [0, 0.25, 0.5, 1, 1.5].map((k) => [String(k), Number((gross - statutory - k * slippage).toFixed(2))]),
    ),
  };
}

/* ------------------------------------ run ------------------------------------ */
const periodData = {};
for (const p of PERIODS) {
  const { candles } = JSON.parse(fs.readFileSync(path.join(CANON, p.file), "utf8"));
  periodData[p.name] = { raw: candles.length, bars: aggregate(candles, BUCKET_MIN), sessions: new Set(candles.map((c) => new Date(c.t + IST_OFFSET_MS).toISOString().slice(0, 10))).size };
  console.error(`[protocol] ${p.name.padEnd(10)} ${p.year}: ${candles.length} 1-min bars -> ${periodData[p.name].bars.length} ${BUCKET_MIN}-min bars over ${periodData[p.name].sessions} sessions`);
}

const results = [];
for (const s of EXPERIMENTAL_REGISTRY) {
  const row = { id: s.id, name: s.name, enabled: s.enabled, volumeDependent: VOLUME_REQUIRED.has(s.id) };
  if (row.volumeDependent) {
    row.verdict = "NOT_EVALUABLE";
    row.reason = "requires volume; the NIFTY 50 index series publishes none — refusing to run it on zeros";
    results.push(row);
    console.error(`[protocol] ${s.id.padEnd(24)} NOT_EVALUABLE (volume)`);
    continue;
  }
  row.periods = {};
  for (const p of PERIODS) {
    const { trades } = researchBacktest(s.id, periodData[p.name].bars, { sessionMode: SESSION_MODE });
    row.periods[p.name] = metrics(trades, `${s.id}/${p.name}`);
  }
  const v = row.periods.VALIDATION;
  const o = row.periods.OOS;
  const ciExcludesZero = o.ci95 && o.ci95.low !== null && (o.ci95.low > 0 || o.ci95.high < 0);
  const positiveOos = o.ci95 && o.ci95.low !== null && o.ci95.low > 0;
  row.decision = {
    positiveInValidation: v.net > 0,
    positiveInOos: o.net > 0,
    minTradesMet: v.trades >= 100 && o.trades >= 100,
    ciExcludesZero,
    ciLowerBoundPositive: !!positiveOos,
  };
  row.verdict =
    row.decision.positiveInValidation && row.decision.positiveInOos && row.decision.minTradesMet && row.decision.ciLowerBoundPositive
      ? "OOS_SUPPORTED"
      : "NOT_SUPPORTED";
  results.push(row);
  console.error(
    `[protocol] ${s.id.padEnd(24)} train ${String(row.periods.TRAIN.net).padStart(12)} | valid ${String(v.net).padStart(12)} | OOS ${String(o.net).padStart(12)} | OOS trades ${String(o.trades).padStart(4)} | ${row.verdict}`,
  );
}

/* ------------------------------ portfolio view ------------------------------ */
const portfolio = {};
for (const p of PERIODS) {
  const rows = results.filter((r) => r.periods).map((r) => r.periods[p.name]);
  const agg = rows.reduce(
    (a, r) => ({
      gross: a.gross + (r.gross ?? 0),
      statutory: a.statutory + (r.statutoryCharges ?? 0),
      slip: a.slip + (r.slippageAssumption ?? 0),
    }),
    { gross: 0, statutory: 0, slip: 0 },
  );
  const ids = results.filter((r) => r.periods).map((r) => r.id);
  const sums = ids.map((id) => results.find((r) => r.id === id).periods[p.name].net);
  portfolio[p.name] = {
    strategies: ids.length,
    totalNet: Number(sums.reduce((a, b) => a + b, 0).toFixed(2)),
    meanStrategyNet: Number((sums.reduce((a, b) => a + b, 0) / ids.length).toFixed(2)),
    positiveStrategies: sums.filter((v) => v > 0).length,
    negativeStrategies: sums.filter((v) => v < 0).length,
    gross: Number(agg.gross.toFixed(2)),
    statutoryCharges: Number(agg.statutory.toFixed(2)),
    slippageAssumption: Number(agg.slip.toFixed(2)),
    netAtSlippageScale: Object.fromEntries([0, 0.25, 0.5, 1, 1.5].map((k) => [String(k), Number((agg.gross - agg.statutory - k * agg.slip).toFixed(2))])),
  };
}

const report = {
  generatedAt: new Date().toISOString(),
  protocol: {
    version: "1.0.0",
    predefined: true,
    data: "NIFTY 50 index, 1-minute, aggregated to 15-minute bars",
    instrumentWarning:
      "The NIFTY 50 index is a reference series: it is not tradable, carries no volume and is NOT the equity instrument the strategies are specified for. The equity intraday cost schedule is applied as a documented research proxy (INSTR-001).",
    periods: PERIODS.map((p) => ({ name: p.name, year: p.year, sessions: periodData[p.name].sessions, bars15m: periodData[p.name].bars.length })),
    splits: "chronological years; no overlap, no shuffling, no OOS-informed selection",
    signalComputation: "full prefix, identical to production convention",
    parameterSearch: "none — default registry configs only",
    costs: {
      model: "statutory round-trip (Shoonya, NSE equity intraday) + slippage, per trade",
      caveat:
        "The NIFTY 50 index is not directly tradable and every statutory/brokerage rate is UNVERIFIED (RATE-001). Cost figures are a proxy, not a broker statement.",
    },
    volumePolicy: "volume-dependent strategies reported NOT_EVALUABLE rather than run on zeros",
    decisionRule:
      "OOS_SUPPORTED requires net > 0 in validation AND OOS, >= 100 trades in each, and a bootstrap 95% CI for mean trade net with a positive lower bound.",
    promotionPolicy: "no outcome of this study promotes a strategy; production execution stays disabled",
    harness: { sleeve: SLEEVE, minConfidence: MIN_CONFIDENCE, sourceOfTruth: "src/lib/experimental_harness.ts" },
    sessionMode: {
      mode: SESSION_MODE,
      meaning:
        SESSION_MODE === "STRICT_INTRADAY"
          ? "positions are squared off at the session's last bar; no trade crosses a session"
          : "HISTORICAL RULE — a position open at a session end fills at the next session's open and therefore carries overnight gap exposure",
      status: SESSION_MODE === "STRICT_INTRADAY" ? "CORRECTED" : "LEGACY_RETAINED_FOR_REPRODUCTION",
    },
    aggregation: `1-min -> ${BUCKET_MIN}-min (o=first, h=max, l=min, c=last, v=sum), stamped at bucket close`,
  },
  datasets: "data/external (REAL_REDISTRIBUTION, authenticity UNVERIFIED) — see data/provenance/external_dataset_manifest.json",
  results,
  portfolio,
  summary: {
    evaluated: results.filter((r) => r.periods).length,
    notEvaluable: results.filter((r) => r.verdict === "NOT_EVALUABLE").length,
    oosSupported: results.filter((r) => r.verdict === "OOS_SUPPORTED").map((r) => r.id),
    notSupported: results.filter((r) => r.verdict === "NOT_SUPPORTED").map((r) => r.id),
    profitabilityClaim: "NONE — this study does not establish profitability",
    productionChanged: false,
  },
};

fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n");
console.log(
  JSON.stringify({ portfolio, summary: report.summary, periods: report.protocol.periods }, null, 2),
);
