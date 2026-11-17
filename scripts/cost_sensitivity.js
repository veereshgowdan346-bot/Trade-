/**
 * GATE 6 — Cost sensitivity.
 *
 * Statutory charges and slippage are kept strictly separate. Slippage is varied across labelled
 * assumptions, including zero — zero is reported as an OPTIMISTIC BOUND, never as realistic.
 *
 * Every statutory rate is UNVERIFIED (RATE-001: 0 of 26 heads verified against a regulator or
 * exchange publication). Nothing here replaces those rates with invented values; the statutory
 * component is the model's current value, carried as an explicit assumption.
 *
 * Usage: node scripts/cost_sensitivity.js
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { researchBacktest } = require("../dist_test_cjs/experimental_harness.js");
const { EXPERIMENTAL_REGISTRY } = require("../dist_test_cjs/experimental_strategies.js");
const { getIstComponents } = require("../dist_test_cjs/nse_calendar.js");
const { roundTripCharges } = require("../dist_test_cjs/tax.js");

const ROOT = path.join(__dirname, "..");
const CANON = path.join(ROOT, "data", "external", "canonical");
/**
 * METHOD-001: strict-intraday by default, with its own artifact. `SESSION_MODE=CARRY_OVERNIGHT`
 * regenerates the historical artifact so the pre-correction figures remain reproducible.
 */
const SESSION_MODE =
  process.argv.includes("--legacy") || process.env.SESSION_MODE === "CARRY_OVERNIGHT" ? "CARRY_OVERNIGHT" : "STRICT_INTRADAY";
const OUT = path.join(
  ROOT,
  "data",
  "provenance",
  SESSION_MODE === "STRICT_INTRADAY" ? "cost_sensitivity_strict.json" : "cost_sensitivity.json",
);

const BASE_BPS = 16; // harness default, per side (entry and exit)
const ASSUMPTIONS = [
  { id: "M0", multiplier: 0, bpsPerSide: 0, label: "ZERO_SLIPPAGE_STATUTORY_ONLY", realistic: false, note: "Perfect fills at the modelled price. NOT REALISTIC; shown as an optimistic bound only." },
  { id: "M25", multiplier: 0.25, bpsPerSide: 4, label: "ULTRA_LIQUID_4BPS", realistic: "plausible_only_for_top_liquidity", note: "Assumes 4 bps/side — achievable only in the most liquid names; the NIFTY index itself is not tradable." },
  { id: "M50", multiplier: 0.5, bpsPerSide: 8, label: "LIQUID_8BPS", realistic: "plausible", note: "8 bps/side, a common assumption for liquid large caps." },
  { id: "M100", multiplier: 1, bpsPerSide: BASE_BPS, label: "HARNESS_BASELINE_16BPS", realistic: "harness_default_unverified", note: "The model's default (16 bps/side). Not evidence-backed; a documented assumption." },
  { id: "M150", multiplier: 1.5, bpsPerSide: 24, label: "STRESSED_24BPS", realistic: "stressed", note: "24 bps/side." },
  { id: "M200", multiplier: 2, bpsPerSide: 32, label: "SEVERE_32BPS", realistic: "severe", note: "32 bps/side." },
];

const mulberry32 = (a) => () => {
  a |= 0;
  a = (a + 0x6d2b79f5) | 0;
  let t = Math.imul(a ^ (a >>> 15), 1 | a);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
function clusterCI(clusters, stat, reps = 5000, seed = 7) {
  const rnd = mulberry32(seed);
  const vals = [];
  for (let i = 0; i < reps; i++) {
    const pick = [];
    for (let j = 0; j < clusters.length; j++) pick.push(clusters[Math.floor(rnd() * clusters.length)]);
    vals.push(stat(pick));
  }
  vals.sort((a, b) => a - b);
  return { low: vals[Math.floor(0.025 * (vals.length - 1))], high: vals[Math.floor(0.975 * (vals.length - 1))] };
}

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

const YEARS = [
  { year: 2022, period: "TRAIN" },
  { year: 2023, period: "VALIDATION" },
  { year: 2024, period: "OOS" },
];

const excludedArms = [];

const report = {
  generatedAt: new Date().toISOString(),
  command: SESSION_MODE === "STRICT_INTRADAY" ? "node scripts/cost_sensitivity.js" : "SESSION_MODE=CARRY_OVERNIGHT node scripts/cost_sensitivity.js",
  sessionMode: SESSION_MODE,
  statutoryStatus: "UNVERIFIED",
  statutoryNote:
    "Every statutory head (STT, exchange transaction charge, SEBI turnover fee, GST, stamp duty, brokerage) is UNVERIFIED against any regulator, exchange or broker publication (RATE-001: 0/26 heads). Values used are the model's existing rates and are carried as unverified assumptions, never as official figures.",
  slippageNote: "Slippage is varied independently of statutory charges. Zero slippage is an optimistic bound, not a realistic case.",
  baseBpsPerSide: BASE_BPS,
  assumptions: ASSUMPTIONS,
  periods: [],
};

const oosPerArm = [];
const oosSessionClusters = new Map(); // session -> net under each assumption (pooled)

for (const { year, period } of YEARS) {
  const candles = aggregate(JSON.parse(fs.readFileSync(path.join(CANON, `NIFTY50_1min_${year}.json`), "utf8")).candles);
  const perArm = [];
  const pooledByAssumption = Object.fromEntries(ASSUMPTIONS.map((a) => [a.id, { gross: 0, statutory: 0, slippage: 0, net: 0, trades: 0 }]));
  const costSplit = { statutory: 0, slippage: 0, gross: 0, trades: 0 };

  for (const s of EXPERIMENTAL_REGISTRY) {
    // STAT-003: volume-dependent arms are NOT_EVALUABLE on an index series (no volume) — see protocol.
    if (s.requiredData.some((r) => /volume/i.test(r))) {
      excludedArms.push({ id: s.id, reason: "requires volume; index series publishes none (NOT_EVALUABLE per protocol)" });
      continue;
    }
    const trades = researchBacktest(s.id, candles, { sessionMode: SESSION_MODE }).trades;
    if (trades.length === 0) continue;
    const rows = trades.map((t) => {
      const ch = roundTripCharges({
        exchange: "NSE",
        kind: "EQ",
        broker: "shoonya",
        qty: t.qty,
        entry: t.entry,
        exit: t.exit,
        side: t.side,
        productType: "INTRADAY",
      });
      const statutory = ch.total - ch.slippage;
      return { gross: t.gross, statutory, slipBase: ch.slippage, day: t.day ?? getIstComponents(t.entryTime).dateStr };
    });
    costSplit.gross += rows.reduce((a, r) => a + r.gross, 0);
    costSplit.statutory += rows.reduce((a, r) => a + r.statutory, 0);
    costSplit.slippage += rows.reduce((a, r) => a + r.slipBase, 0);
    costSplit.trades += rows.length;

    const armOut = { id: s.id, trades: rows.length, gross: +rows.reduce((a, r) => a + r.gross, 0).toFixed(2), netByAssumption: {} };
    for (const asm of ASSUMPTIONS) {
      const net = rows.reduce((a, r) => a + r.gross - r.statutory - asm.multiplier * r.slipBase, 0);
      armOut.netByAssumption[asm.id] = { net: +net.toFixed(2), perTrade: +(net / rows.length).toFixed(2) };
      pooledByAssumption[asm.id].gross += rows.reduce((a, r) => a + r.gross, 0);
      pooledByAssumption[asm.id].statutory += rows.reduce((a, r) => a + r.statutory, 0);
      pooledByAssumption[asm.id].slippage += asm.multiplier * rows.reduce((a, r) => a + r.slipBase, 0);
      pooledByAssumption[asm.id].net += net;
      pooledByAssumption[asm.id].trades += rows.length;
      if (period === "OOS") {
        for (const r of rows) {
          if (!oosSessionClusters.has(r.day)) oosSessionClusters.set(r.day, Object.fromEntries(ASSUMPTIONS.map((x) => [x.id, 0])));
          oosSessionClusters.get(r.day)[asm.id] += r.gross - r.statutory - asm.multiplier * r.slipBase;
        }
      }
    }
    perArm.push(armOut);
    if (period === "OOS") oosPerArm.push({ id: s.id, trades: rows.length, gross: armOut.gross, netByAssumption: armOut.netByAssumption });
  }

  const pooled = {};
  for (const asm of ASSUMPTIONS) {
    const p = pooledByAssumption[asm.id];
    pooled[asm.id] = {
      label: asm.label,
      bpsPerSide: asm.bpsPerSide,
      realistic: asm.realistic,
      trades: p.trades,
      gross: +p.gross.toFixed(2),
      statutory: +p.statutory.toFixed(2),
      slippage: +p.slippage.toFixed(2),
      net: +p.net.toFixed(2),
      perTrade: +(p.net / p.trades).toFixed(2),
      sign: p.net > 0 ? "POSITIVE" : "NEGATIVE",
    };
  }
  // break-even slippage: solve gross - statutory - m*slip = 0
  const mStar = costSplit.slippage > 0 ? (costSplit.gross - costSplit.statutory) / costSplit.slippage : null;
  report.periods.push({
    year,
    period,
    trades: costSplit.trades,
    gross: +costSplit.gross.toFixed(2),
    statutoryAtBaseline: +costSplit.statutory.toFixed(2),
    slippageAtBaseline: +costSplit.slippage.toFixed(2),
    statutoryShareOfCosts: +(costSplit.statutory / (costSplit.statutory + costSplit.slippage)).toFixed(4),
    perArm,
    pooled,
    breakEvenSlippage: {
      multiplier: mStar === null ? null : +mStar.toFixed(3),
      bpsPerSide: mStar === null ? null : +(mStar * BASE_BPS).toFixed(1),
      interpretation:
        mStar === null
          ? "no slippage model available"
          : mStar <= 0
            ? "NEVER: statutory charges alone already exceed gross P&L, so no slippage level (including zero) reaches break-even"
            : "gross P&L covers costs only if realised slippage is below this level",
    },
  });
}

// OOS interval at each assumption using session clusters
const sessionKeys = [...oosSessionClusters.keys()];
report.oosIntervals = ASSUMPTIONS.map((asm) => {
  const clusters = sessionKeys.map((d) => oosSessionClusters.get(d)[asm.id]);
  const ci = clusterCI(clusters, (p) => mean(p), 5000, 101);
  return {
    assumption: asm.id,
    label: asm.label,
    bpsPerSide: asm.bpsPerSide,
    realistic: asm.realistic,
    meanNetPerSession: +mean(clusters).toFixed(2),
    ci95SessionCluster: { low: +ci.low.toFixed(2), high: +ci.high.toFixed(2) },
    sign: mean(clusters) > 0 ? "POSITIVE" : "NEGATIVE",
  };
});
report.oosArmsAtZeroSlippage = oosPerArm.map((a) => ({
  id: a.id,
  trades: a.trades,
  gross: a.gross,
  netZeroSlippage: a.netByAssumption.M0.net,
  netBaseline: a.netByAssumption.M100.net,
  positiveOnlyAtZeroSlippage: a.netByAssumption.M0.net > 0 && a.netByAssumption.M100.net < 0,
}));
report.verdict = {
  armsPositiveAtBaseline: oosPerArm.filter((a) => a.netByAssumption.M100.net > 0).length,
  armsPositiveAtZeroSlippage: oosPerArm.filter((a) => a.netByAssumption.M0.net > 0).length,
  totalArms: oosPerArm.length,
  signInvariantAcrossAllAssumptions: ASSUMPTIONS.every((asm) => report.periods.every((p) => p.pooled[asm.id].sign === report.periods[0].pooled[asm.id].sign)),
  statement:
    "Cost sensitivity is reported, not optimised. Zero slippage is an optimistic bound and is never presented as achievable. Statutory rates remain UNVERIFIED and unmodified.",
};

// Recorded after the per-strategy loops: the report object is constructed before they run.
report.excludedArms = excludedArms.filter((e, i, a) => a.findIndex((x) => x.id === e.id) === i);

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n");

for (const p of report.periods) {
  console.log(`\n${p.year} ${p.period}: ${p.trades} trades, gross ${p.gross}, statutory ${p.statutoryAtBaseline}, slippage(baseline) ${p.slippageAtBaseline} (statutory = ${(100 * p.statutoryShareOfCosts).toFixed(1)}% of modelled costs)`);
  for (const asm of ASSUMPTIONS) {
    const x = p.pooled[asm.id];
    console.log(`   ${asm.id.padEnd(4)} ${String(asm.bpsPerSide).padStart(2)}bps/side ${x.label.padEnd(32)} net ${String(x.net).padStart(13)}  per trade ${String(x.perTrade).padStart(8)}  ${x.sign}`);
  }
  console.log(`   break-even: ${p.breakEvenSlippage.bpsPerSide === null ? "n/a" : p.breakEvenSlippage.bpsPerSide + " bps/side"} — ${p.breakEvenSlippage.interpretation}`);
}
console.log("\nOOS session-cluster intervals:");
for (const x of report.oosIntervals) console.log(`   ${x.assumption.padEnd(4)} ${String(x.bpsPerSide).padStart(2)}bps mean/session ${String(x.meanNetPerSession).padStart(10)} CI [${x.ci95SessionCluster.low},${x.ci95SessionCluster.high}] ${x.sign}`);
console.log("\nverdict:", JSON.stringify(report.verdict, null, 2));
