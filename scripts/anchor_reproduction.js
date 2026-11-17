/**
 * FINANCIAL ANCHOR REPRODUCTION (post-PERF-001)
 *
 * Re-derives the three headline numbers that every report in this repository quotes, from the
 * CURRENT source, so the performance work can be shown to have changed nothing financially.
 *
 * Documented anchors (Phase-2 evidence, capital Rs 5,00,000, Shoonya friction):
 *   fixture  walkforward_seed42_1m.csv : 74 trades, net -7576.06, 0 cross-day, 1 EOD exit
 *   research (eodSquareOff=false)      : 72 trades, net -7177.69
 *   walk-forward (375/375)             : 2 folds, 30 OOS trades, net -4023.54
 *   multiday_overnight_1m.csv          : 3 trades, net -602.96, charges 474.59
 *
 * Usage: node scripts/anchor_reproduction.js   (after `npm run test:prep`)
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { runBacktest, runWalkForward } = require("../dist_test_cjs/backtest_engine.js");
const { normaliseRisk } = require("../dist_test_cjs/risk.js");

const inst = { symbol: "SBIN", exchange: "NSE", kind: "EQ", tradingsymbol: "SBIN-EQ", lotSize: 1, tick: 0.05 };
const cfg = normaliseRisk({ capital: 500000, primaryBroker: "shoonya" });

function parse(p, istStrings) {
  return fs.readFileSync(p, "utf8").trim().split(/\r?\n/).slice(1).map((l) => {
    const [t, o, h, lo, c, v] = l.split(",");
    const ts = istStrings ? Date.parse(t.trim().replace(" ", "T") + "+05:30") : Number(t);
    return { t: ts, o: +o, h: +h, l: +lo, c: +c, v: +v };
  });
}

const fx = parse(path.join(__dirname, "..", "data", "fixtures", "walkforward_seed42_1m.csv"), false);
const md = parse(path.join(__dirname, "..", "data", "fixtures", "multiday_overnight_1m.csv"), true);
const IST = { timeZone: "Asia/Kolkata" };
const day = (t) => new Date(t).toLocaleDateString("en-CA", IST);

const bt = runBacktest(fx, inst, cfg, "STANDARD_SHOONYA");
const btR = runBacktest(fx, inst, cfg, "STANDARD_SHOONYA", { eodSquareOff: false });
const wf = runWalkForward(fx, inst, cfg, "STANDARD_SHOONYA", { trainBars: 375, testBars: 375 });
const mb = runBacktest(md, inst, cfg, "STANDARD_SHOONYA");

const observed = {
  fixtureTrades: bt.totalTrades,
  fixtureNet: bt.netPnl,
  fixtureCrossDay: bt.trades.filter((t) => day(t.entryTime) !== day(t.exitTime)).length,
  fixtureEodExits: bt.trades.filter((t) => t.exitReason === "EOD_EXIT").length,
  researchTrades: btR.totalTrades,
  researchNet: btR.netPnl,
  wfFolds: wf.folds.length,
  wfOosTrades: wf.oosTrades.length,
  wfOosNet: wf.oosSummary.netPnl,
  wfChronology: wf.chronologyProof,
  multidayTrades: mb.totalTrades,
  multidayNet: mb.netPnl,
  multidayCharges: mb.totalCharges,
};
const expected = {
  fixtureTrades: 74, fixtureNet: -7576.06, fixtureCrossDay: 0, fixtureEodExits: 1,
  researchTrades: 72, researchNet: -7177.69,
  wfFolds: 2, wfOosTrades: 30, wfOosNet: -4023.54,
  multidayTrades: 3, multidayNet: -602.96, multidayCharges: 474.59,
};
const checks = {};
let allMatch = true;
for (const k of Object.keys(expected)) {
  const match = JSON.stringify(observed[k]) === JSON.stringify(expected[k]);
  checks[k] = { expected: expected[k], observed: observed[k], match };
  if (!match) allMatch = false;
}
const chronologyOk = Object.values(wf.chronologyProof).every(Boolean);

const report = {
  generatedAt: new Date().toISOString(),
  command: "node scripts/anchor_reproduction.js",
  config: { capital: cfg.capital, broker: "shoonya", friction: "STANDARD_SHOONYA" },
  checks,
  chronologyOk,
  verdict: allMatch && chronologyOk ? "ANCHORS_REPRODUCED_EXACTLY" : "ANCHOR_MISMATCH",
};
fs.writeFileSync(path.join(__dirname, "anchor_reproduction_output.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
process.exitCode = report.verdict === "ANCHORS_REPRODUCED_EXACTLY" ? 0 : 1;
