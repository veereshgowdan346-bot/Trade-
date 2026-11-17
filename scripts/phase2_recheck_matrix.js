#!/usr/bin/env node
/**
 * Phase 2 remediation — re-run of the 9-tier capital matrix (₹1,000–₹10,00,000 SIMULATED)
 * and the multiday backtest evidence under the corrected MICRO-001 / TAX-005 gates.
 * SIMULATION ONLY — no live data, no orders, no profitability claims.
 */
const fs = require("fs");
const path = require("path");
const { sizePosition, normaliseRisk, computeSize } = require("../dist_test_cjs/risk.js");
const { roundTripCharges, calculateNetPnL, UnsupportedSegmentError } = require("../dist_test_cjs/tax.js");
const { runBacktest } = require("../dist_test_cjs/backtest_engine.js");

// Mandated audit tiers (FINAL READINESS §7): 1000, 2000, 5000, 10000, 25000,
// 50000, 100000, 500000, 1000000. (Previous run used 2500/250000; superseded.)
const tiers = [1000, 2000, 5000, 10000, 25000, 50000, 100000, 500000, 1000000];
const inst = { symbol: "SBIN", exchange: "NSE", kind: "EQ", tradingsymbol: "SBIN-EQ", lotSize: 1, tick: 0.05 };
const out = [];

for (const capital of tiers) {
  const cfg = normaliseRisk({ capital });
  const entry = 893.65;
  const atr = 7.304;
  const sizing = sizePosition({ inst, side: "BUY", entry, atr, conf: 0.8, cfg });
  // PreFlight semantics with the Phase-2 hurdle (micro => 0, else max(floor, cfg.hurdle))
  const isMicro = capital <= 2000;
  const hurdle = isMicro ? 0 : Math.max(cfg.hurdle || 0, cfg.primaryBroker === "shoonya" ? 25 : 70);
  const target = sizing.targetPrice;
  const net = calculateNetPnL({
    grossPnL: sizing.qty * (target - entry),
    broker: cfg.primaryBroker || "shoonya",
    qty: sizing.qty,
    entry,
    exit: target,
    exchange: "NSE",
    kind: "EQ",
    side: "BUY",
  });
  const admissible = net.netPnL > 0 && net.netPnL >= hurdle && sizing.qty > 0;
  out.push({
    capital,
    qty: sizing.qty,
    limitedBy: sizing.limitedBy,
    slDistance: sizing.slDistance,
    targetPrice: target,
    expectedNet: net.netPnL,
    charges: net.totalCharges,
    hurdle,
    microPolicy: isMicro ? "MICRO_001: hurdle=0 (expected-loss trades blocked)" : "standard",
    orderAdmissible: admissible,
  });
}

// Multiday backtest evidence with Phase-2 controls
const fx = path.join(__dirname, "..", "data", "fixtures", "multiday_overnight_1m.csv");
const csv = fs.readFileSync(fx, "utf8");
const candles = csv.trim().split(/\r?\n/).slice(1).map((l) => {
  const [ts, o, h, lo, c, v] = l.split(",");
  return { t: Date.parse(ts.replace(" ", "T") + "+05:30"), o: Number(o), h: Number(h), l: Number(lo), c: Number(c), v: Number(v) || 0 };
});
const btCfg = normaliseRisk({ capital: 500000, primaryBroker: "shoonya" });
const on = runBacktest(candles, inst, btCfg, "STANDARD_SHOONYA", {});
const zero = runBacktest(candles, inst, btCfg, "ZERO_FRICTION", {});
const angel = runBacktest(candles, inst, btCfg, "HIGH_ANGEL", {});
const research = runBacktest(candles, inst, btCfg, "STANDARD_SHOONYA", { eodSquareOff: false, enforceSessions: false, enforceHolidays: false });

const report = {
  generatedAt: new Date().toISOString(),
  policy: "SIMULATED balances only. No live data/orders. No profitability claims. MICRO-001 fix blocks expected-loss trades for capital <= 2000.",
  matrix: out,
  backtestMultiday: {
    fixture: "data/fixtures/multiday_overnight_1m.csv",
    controlsOn: { trades: on.totalTrades, netPnl: on.netPnl, charges: on.totalCharges, exitReasons: on.trades.reduce((a, t) => ((a[t.exitReason] = (a[t.exitReason] || 0) + 1), a), {}) },
    zeroFriction: { trades: zero.totalTrades, netPnl: zero.netPnl },
    highAngel: { trades: angel.totalTrades, netPnl: angel.netPnl, charges: angel.totalCharges },
    researchMode: { trades: research.totalTrades, netPnl: research.netPnl, note: "eodSquareOff=false (research only)" },
  },
  failClosed: {},
};

// TAX-001 fail-closed re-verification
for (const [label, args] of [
  ["DELIVERY", { exchange: "NSE", kind: "EQ", broker: "shoonya", qty: 10, entry: 100, exit: 105, side: "BUY", productType: "DELIVERY" }],
  ["CNC", { exchange: "NSE", kind: "EQ", broker: "shoonya", qty: 10, entry: 100, exit: 105, side: "BUY", productType: "CNC" }],
  ["UNKNOWN_PAIR", { exchange: "NFO", kind: "EQ", broker: "shoonya", qty: 10, entry: 100, exit: 105, side: "BUY" }],
]) {
  try {
    roundTripCharges(args);
    report.failClosed[label] = "NOT BLOCKED (BUG)";
  } catch (e) {
    report.failClosed[label] = "BLOCKED: " + (e && e.name);
  }
}

fs.writeFileSync(path.join(__dirname, "phase2_recheck_matrix_output.json"), JSON.stringify(report, null, 2) + "\n");
process.stdout.write(JSON.stringify(report, null, 2) + "\n");
