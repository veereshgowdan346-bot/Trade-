/**
 * PAPER-ONLY Honest Chronological Walk-Forward — ₹3,000, Locked Parameters
 *
 * RESEARCH / PAPER SIMULATION ONLY. No broker access, no live orders, no network.
 * Synthetic low-priced equities (₹50–₹150), 60 sessions per stock, split chronologically:
 *   TRAIN = sessions 1–20, VALIDATION = 21–40, OOS = 41–60. No overlap, no shuffling.
 * Parameters are PRE-REGISTERED and LOCKED (no OOS tuning):
 *   sleeve ₹3,000, CARRY_OVERNIGHT (swing), zeroBrokerage (statutory kept),
 *   minConfidence 70, costAwareMinMarginMultiple 3, regimeFilterAdxMin 25,
 *   exits 2xATR stop / 3xATR target (harness defaults), circuit breaker -₹75/day.
 *
 * Decision rule (pre-registered, from research_protocol_oos.js):
 *   OOS_SUPPORTED requires net>0 in BOTH validation and OOS, >=100 trades in each,
 *   and bootstrap 95% CI for mean trade net with positive lower bound. Otherwise NOT_SUPPORTED.
 *   No promotion follows from this study under any outcome.
 *
 * Output: data/provenance/paper_walkforward_3000.json
 * Usage: node scripts/paper_walkforward_3000.js
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { researchBacktest, portfolioStats } = require("../dist_test_cjs/experimental_harness.js");
const { EXPERIMENTAL_REGISTRY } = require("../dist_test_cjs/experimental_strategies.js");
const { roundTripCharges } = require("../dist_test_cjs/tax.js");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "data", "provenance", "paper_walkforward_3000.json");
const BUCKET_MIN = 15;
const IST_OFFSET_MS = 5.5 * 3600 * 1000;
const CAPITAL = 3000;
const DRAWDOWN_FLOOR = 75;

const VOLUME_REQUIRED = new Set(
  EXPERIMENTAL_REGISTRY.filter((s) => (s.requiredData || []).some((r) => /volume/i.test(r))).map((s) => s.id),
);
const EVALUABLE = EXPERIMENTAL_REGISTRY.filter((s) => !VOLUME_REQUIRED.has(s.id));

const LOCKED_OPTS = {
  sleeve: CAPITAL,
  sessionMode: "CARRY_OVERNIGHT",
  zeroBrokerage: true,
  minConfidence: 70,
  costAwareMinMarginMultiple: 3,
  regimeFilterAdxMin: 25,
};

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

function syntheticEquity({ startPx, drift, vol, seed, sessions = 60 }) {
  const rnd = lcg(seed);
  const candles = [];
  const days = [];
  const d0 = new Date("2024-01-01T00:00:00+05:30");
  for (let k = 0; k < 120 && days.length < sessions; k++) {
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

function istDay(ms) {
  return new Date(ms).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function splitBySessions(bars, days) {
  const daySet = new Set(days);
  const trainDays = new Set(days.slice(0, 20));
  const valDays = new Set(days.slice(20, 40));
  const oosDays = new Set(days.slice(40, 60));
  const train = bars.filter((b) => trainDays.has(istDay(b.t)));
  const val = bars.filter((b) => valDays.has(istDay(b.t)));
  const oos = bars.filter((b) => oosDays.has(istDay(b.t)));
  return { train, val, oos, daySet };
}

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

function metrics(trades, label) {
  const n = trades.length;
  if (!n) {
    return {
      label, trades: 0, sessions: 0, gross: 0, charges: 0, net: 0, winRatePct: 0,
      profitFactor: null, expectancy: null, maxDrawdown: 0, avgNet: null, ci95: null, tStat: null,
      note: "no trades",
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
    maxDrawdown: portfolioStats(daily, CAPITAL).maxDrawdown,
    ci95: bootstrapCI(nets),
    tStat: sd > 0 ? Number((mean / (sd / Math.sqrt(n))).toFixed(2)) : null,
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
    const { train, val, oos } = splitBySessions(bars, days);
    console.error(`[wf] ${st.name}: ${bars.length} bars -> train ${train.length} | val ${val.length} | oos ${oos.length} (20/20/20 sessions)`);
    const periods = { TRAIN: train, VALIDATION: val, OOS: oos };
    const perStrategy = [];
    for (const s of EVALUABLE) {
      const row = { id: s.id, name: s.name, periods: {} };
      for (const [pname, pbars] of Object.entries(periods)) {
        const { trades } = researchBacktest(s.id, pbars, LOCKED_OPTS);
        const { kept, blocked } = applyCircuit(trades);
        row.periods[pname] = { ...metrics(kept, `${s.id}/${pname}`), rawTrades: trades.length, blockedByCircuit: blocked };
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
      perStrategy.push(row);
      console.error(
        `[wf] ${s.id.padEnd(24)} train ${String(row.periods.TRAIN.net).padStart(12)} | valid ${String(v.net).padStart(12)} | OOS ${String(o.net).padStart(12)} | OOS trades ${String(o.trades).padStart(4)} | ${row.verdict}`,
      );
    }
    const portfolio = {};
    for (const pname of ["TRAIN", "VALIDATION", "OOS"]) {
      const sums = perStrategy.map((r) => r.periods[pname].net);
      const gross = perStrategy.reduce((a, r) => a + (r.periods[pname].gross ?? 0), 0);
      const charges = perStrategy.reduce((a, r) => a + (r.periods[pname].charges ?? 0), 0);
      const trades = perStrategy.reduce((a, r) => a + (r.periods[pname].trades ?? 0), 0);
      portfolio[pname] = {
        strategies: perStrategy.length,
        totalNet: Number(sums.reduce((a, b) => a + b, 0).toFixed(2)),
        meanStrategyNet: Number((sums.reduce((a, b) => a + b, 0) / perStrategy.length).toFixed(2)),
        positiveStrategies: sums.filter((v) => v > 0).length,
        negativeStrategies: sums.filter((v) => v < 0).length,
        gross: Number(gross.toFixed(2)),
        charges: Number(charges.toFixed(2)),
        trades,
      };
    }
    results.push({ stock: st.name, params: st, bars: { total: bars.length, train: train.length, val: val.length, oos: oos.length }, strategies: perStrategy, portfolio });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    mode: "PAPER_ONLY_OFFLINE_SIMULATION",
    disclaimer:
      "SIMULATED results only on SYNTHETIC data (no real equity OHLCV in repo; no external fetch). Locked parameters, no OOS tuning. Not live trading, not a forecast, not a profit promise. Statutory rates UNVERIFIED.",
    protocol: {
      version: "1.0.0",
      predefined: true,
      lockedParams: LOCKED_OPTS,
      splits: "chronological 20/20/20 sessions; no overlap, no shuffling, no OOS-informed selection",
      decisionRule: "OOS_SUPPORTED requires net>0 in validation AND OOS, >=100 trades in each, and bootstrap 95% CI lower bound >0",
      promotionPolicy: "no outcome promotes a strategy; production execution stays disabled",
    },
    results,
    summary: {
      perStock: results.map((r) => ({
        stock: r.stock,
        portfolio: r.portfolio,
        oosSupported: r.strategies.filter((s) => s.verdict === "OOS_SUPPORTED").map((s) => s.id),
        notSupported: r.strategies.filter((s) => s.verdict === "NOT_SUPPORTED").map((s) => s.id),
      })),
      profitabilityClaim: "NONE — this study does not establish profitability",
      productionChanged: false,
    },
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ summary: report.summary, output: OUT }, null, 2));
}

main();
