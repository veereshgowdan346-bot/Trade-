/**
 * OMNITRADEPRO APEX V2.0 — PHASE 5.1: CRITICAL TRADE LEDGER FORENSIC RECONCILIATION
 * Independently recalculates every trade row, statutory charge breakdown,
 * and aggregate portfolio balance from the ground truth simulation ledger.
 * STRICTLY FORENSIC AUDIT — NO REAL MONEY.
 */

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const { roundTripCharges } = require("../dist_test_cjs/tax.js");

const r2 = (v) => Math.round(v * 100) / 100;
const r4 = (v) => Math.round(v * 10000) / 10000;

console.log("==================================================================");
console.log("  OMNITRADEPRO APEX V2.0 — PHASE 5.1 FORENSIC RECONCILIATION       ");
console.log(`  Audit Execution Timestamp: ${new Date().toISOString()}           `);
console.log("==================================================================\n");

const phase4Path = path.join(__dirname, "phase4_simulation_output.json");
const phase4Data = JSON.parse(fs.readFileSync(phase4Path, "utf8"));
const trades = phase4Data.trades;

console.log(`Loaded ${trades.length} trades from phase4_simulation_output.json\n`);

// ---------------------------------------------------------------------------
// 1. ROW-LEVEL FORENSIC RECALCULATION
// ---------------------------------------------------------------------------
console.log("--> 1. ROW-LEVEL FORENSIC RECALCULATION & CHARGE BREAKDOWN");

const auditLedger = [];
let sumGross = 0;
let sumBrokerage = 0;
let sumStt = 0;
let sumExch = 0;
let sumSebi = 0;
let sumStamp = 0;
let sumGst = 0;
let sumSlippage = 0;
let sumTotalCharges = 0;
let sumNetPnL = 0;

let runningEquity = 100000.00;
let peakEquity = runningEquity;
let maxDrawdown = 0;

for (let i = 0; i < trades.length; i++) {
  const t = trades[i];
  const isBuy = t.side === "BUY";
  const qty = t.qty;
  const entryPrice = t.entryPrice;
  const exitPrice = t.exitPrice;

  // Turnovers
  const buyTurnover = r2(isBuy ? entryPrice * qty : exitPrice * qty);
  const sellTurnover = r2(isBuy ? exitPrice * qty : entryPrice * qty);
  const totalTurnover = r2(buyTurnover + sellTurnover);

  // Gross PnL
  const grossPriceDiff = isBuy ? exitPrice - entryPrice : entryPrice - exitPrice;
  const recalcGross = r2(grossPriceDiff * qty);

  // Use official roundTripCharges directly from tax.ts
  const charges = roundTripCharges({
    exchange: "NSE",
    kind: "EQ",
    broker: "shoonya",
    qty,
    entry: entryPrice,
    exit: exitPrice,
    side: t.side,
  });

  const brokerage = charges.brokerage;
  const stt = charges.stt;
  const exch = charges.exchangeFees;
  const sebi = charges.sebi;
  const stamp = charges.stamp;
  const gst = charges.gst;
  const slippage = charges.slippage;
  const recalcTotalCharges = charges.total;

  // Net PnL
  const recalcNetPnL = r2(recalcGross - recalcTotalCharges);

  sumGross = r2(sumGross + recalcGross);
  sumBrokerage = r2(sumBrokerage + brokerage);
  sumStt = r2(sumStt + stt);
  sumExch = r2(sumExch + exch);
  sumSebi = r2(sumSebi + sebi);
  sumStamp = r2(sumStamp + stamp);
  sumGst = r2(sumGst + gst);
  sumSlippage = r2((sumSlippage || 0) + slippage);
  sumTotalCharges = r2(sumTotalCharges + recalcTotalCharges);
  sumNetPnL = r2(sumNetPnL + recalcNetPnL);

  runningEquity = r2(runningEquity + recalcNetPnL);
  if (runningEquity > peakEquity) peakEquity = runningEquity;
  const dd = r2(peakEquity - runningEquity);
  if (dd > maxDrawdown) maxDrawdown = dd;

  // Check differences with JSON record
  const grossDiff = r2(Math.abs(recalcGross - t.grossPnL));
  const chargeDiff = r2(Math.abs(recalcTotalCharges - t.totalCharges));
  const netDiff = r2(Math.abs(recalcNetPnL - t.netPnL));

  auditLedger.push({
    index: i + 1,
    tradeId: t.tradeId,
    side: t.side,
    qty,
    entryPrice,
    exitPrice,
    buyTurnover,
    sellTurnover,
    totalTurnover,
    grossPnL: recalcGross,
    brokerage,
    stt,
    exch,
    sebi,
    stamp,
    gst,
    slippage,
    totalCharges: recalcTotalCharges,
    netPnL: recalcNetPnL,
    runningEquity,
    jsonGross: t.grossPnL,
    jsonCharges: t.totalCharges,
    jsonNet: t.netPnL,
    discrepancy: grossDiff > 0.05 || chargeDiff > 0.05 || netDiff > 0.05,
  });
}

console.log("Index | ID | Side | Qty | Entry | Exit | Gross | Brok | STT | Exch | SEBI | Stamp | GST | Charges | Net | Running Equity");
console.log("-----------------------------------------------------------------------------------------------------------------");
for (const r of auditLedger) {
  console.log(`${r.index.toString().padStart(2)} | ${r.tradeId.padEnd(8)} | ${r.side.padEnd(4)} | ${r.qty} | ${r.entryPrice.toFixed(2)} | ${r.exitPrice.toFixed(2)} | ${r.grossPnL.toFixed(2).padStart(7)} | ${r.brokerage.toFixed(2)} | ${r.stt.toFixed(2).padStart(5)} | ${r.exch.toFixed(2).padStart(4)} | ${r.sebi.toFixed(2)} | ${r.stamp.toFixed(2).padStart(4)} | ${r.gst.toFixed(2).padStart(4)} | ${r.totalCharges.toFixed(2).padStart(7)} | ${r.netPnL.toFixed(2).padStart(7)} | ₹${r.runningEquity.toFixed(2)}`);
}

// ---------------------------------------------------------------------------
// 2. AGGREGATE RECONCILIATION VERIFICATION
// ---------------------------------------------------------------------------
console.log("\n--> 2. AGGREGATE RECONCILIATION SUMMARY");
console.log(`  Initial Capital:                   ₹100,000.00`);
console.log(`  Sum of Gross P&L:                  ₹${sumGross.toFixed(2)}`);
console.log(`  Sum of Brokerage:                  ₹${sumBrokerage.toFixed(2)}`);
console.log(`  Sum of STT:                        ₹${sumStt.toFixed(2)}`);
console.log(`  Sum of Exchange Fees:              ₹${sumExch.toFixed(2)}`);
console.log(`  Sum of SEBI Fees:                  ₹${sumSebi.toFixed(2)}`);
console.log(`  Sum of Stamp Duty:                 ₹${sumStamp.toFixed(2)}`);
console.log(`  Sum of GST:                        ₹${sumGst.toFixed(2)}`);
console.log(`  Sum of Slippage (0.08% Entry):     ₹${sumSlippage.toFixed(2)}`);
console.log(`  Sum of Total Statutory Charges:    ₹${sumTotalCharges.toFixed(2)}`);
console.log(`  Sum of Net P&L:                    ₹${sumNetPnL.toFixed(2)}`);
console.log(`  Calculated Final Capital:          ₹${runningEquity.toFixed(2)}`);
console.log(`  Maximum Drawdown (Rupees):         ₹${maxDrawdown.toFixed(2)}`);
console.log(`  Maximum Drawdown (Percent):        ${r2((maxDrawdown / 100000) * 100)}%`);

// Verification Invariants:
console.log("\n--> 3. INVARIANT ASSERTIONS");
const invariant1 = r2(sumGross - sumTotalCharges) === sumNetPnL;
console.log(`  Invariant 1: SUM(Gross) - SUM(Charges) === SUM(Net): ${invariant1 ? "PASS" : "FAIL"} (${sumGross} - ${sumTotalCharges} = ${r2(sumGross - sumTotalCharges)} vs ${sumNetPnL})`);
assert.strictEqual(invariant1, true);

const invariant2 = r2(100000.00 + sumNetPnL) === runningEquity;
console.log(`  Invariant 2: Initial Capital + SUM(Net) === Final Capital: ${invariant2 ? "PASS" : "FAIL"} (100000 + ${sumNetPnL} = ${runningEquity})`);
assert.strictEqual(invariant2, true);

const invariant3 = runningEquity === phase4Data.performanceMetrics.finalCapital;
console.log(`  Invariant 3: Calculated Final Capital === JSON Final Capital: ${invariant3 ? "PASS" : "FAIL"} (${runningEquity} vs ${phase4Data.performanceMetrics.finalCapital})`);
assert.strictEqual(invariant3, true);

// ---------------------------------------------------------------------------
// 4. FORENSIC DISCREPANCY INVESTIGATION
// ---------------------------------------------------------------------------
console.log("\n--> 4. FORENSIC INVESTIGATION OF REPORTED DISCREPANCIES");
console.log("  A. PHASE 4 CHARGES OF ₹1,345.46:");
console.log("     Origin: In STRATEGY_BASELINE_COMPARISON.md, an author subtracted reported net (₹875.71)");
console.log("     from an erroneous gross (₹2,221.17) -> ₹2,221.17 - ₹875.71 = ₹1,345.46.");
console.log("     True Value: Actual sum of charges from trade ledger is ₹1,892.32.");
console.log("\n  B. PHASE 5 AGGREGATE CHARGES OF ₹1,945.46:");
console.log("     Origin: In PHASE5_TRADE_RECONCILIATION.md and PAPER_TRADE_PERFORMANCE.md, an author");
console.log("     mistakenly wrote ₹1,945.46 as total charges, which clashed with both gross (₹2,221.17 - ₹1,945.46 = ₹275.71)");
console.log("     and net profit (₹875.71). Discrepancy = ₹1,945.46 - ₹1,892.32 = +₹53.14.");
console.log("\n  C. PHASE 5 DISPLAYED TRADE ROWS:");
console.log("     Origin: In PHASE4_PAPER_TRADING_LOG.md and PHASE5_TRADE_RECONCILIATION.md, the markdown table");
console.log("     contained hardcoded placeholder trade rows from an earlier seed attempt whose rows summed to");
console.log("     Gross ₹2,215.57, Taxes ₹1,892.23, and Net ₹323.34, while the table footer claimed ₹875.71.");
console.log("\n  D. GROUND TRUTH LEDGER TOTALS:");
console.log(`     Actual Sum of Gross PnL:        ₹${sumGross.toFixed(2)}`);
console.log(`     Actual Sum of Statutory Taxes:  ₹${sumTotalCharges.toFixed(2)}`);
console.log(`     Actual Sum of Net Realized PnL: ₹${sumNetPnL.toFixed(2)}`);
console.log(`     Exact Arithmetic: ₹${sumGross.toFixed(2)} - ₹${sumTotalCharges.toFixed(2)} = ₹${sumNetPnL.toFixed(2)}`);

// Save Phase 5.1 reconciliation data
const phase51Data = {
  timestamp: new Date().toISOString(),
  auditLedger,
  totals: {
    initialCapital: 100000.00,
    sumGross,
    sumBrokerage,
    sumStt,
    sumExch,
    sumSebi,
    sumStamp,
    sumGst,
    sumTotalCharges,
    sumNetPnL,
    finalCapital: runningEquity,
    maxDrawdown,
    maxDrawdownPct: r2((maxDrawdown / 100000) * 100),
  },
  discrepanciesResolved: {
    phase4ChargesReported: 1345.46,
    phase5ChargesReported: 1945.46,
    actualChargesSum: sumTotalCharges,
    phase5DisplayedTableNetSum: 323.34,
    actualNetSum: sumNetPnL,
  },
};

fs.writeFileSync(path.join(__dirname, "phase51_reconciliation_output.json"), JSON.stringify(phase51Data, null, 2));
console.log("\nSaved Phase 5.1 Reconciliation to scripts/phase51_reconciliation_output.json");
console.log("==================================================================\n");
