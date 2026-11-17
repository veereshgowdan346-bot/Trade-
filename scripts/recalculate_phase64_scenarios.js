const fs = require('fs');
const path = require('path');
const { roundTripCharges } = require('../dist_test_cjs/tax.js');

const r2 = (v) => Math.round(v * 100) / 100;
const r4 = (v) => Math.round(v * 10000) / 10000;

console.log('=== PHASE 6.4 EXECUTION COST RECALCULATION & STRESS TEST SCRIPT ===\n');

// 1. Load Raw Trade Datasets
const p4Path = path.join(__dirname, 'phase4_simulation_output.json');
const rawPhase4 = JSON.parse(fs.readFileSync(p4Path, 'utf8'));
const phase4Trades = rawPhase4.trades;

const whipsawPath = path.join(__dirname, 'phase62_whipsaw_output.json');
const rawWhipsaw = JSON.parse(fs.readFileSync(whipsawPath, 'utf8'));
const whipsawTrades = rawWhipsaw.trades;

console.log(`Loaded ${phase4Trades.length} Phase 4 paper trades.`);
console.log(`Loaded ${whipsawTrades.length} High-Volatility Whipsaw trades.\n`);

// Scenarios to evaluate:
const scenarios = [
  { name: 'Zero Slippage (0 bps / 0 bps)', entryBps: 0, exitBps: 0 },
  { name: '4 bps Each Side (4 bps / 4 bps)', entryBps: 4, exitBps: 4 },
  { name: '8 bps Each Side (8 bps / 8 bps)', entryBps: 8, exitBps: 8 },
  { name: '12 bps Each Side (12 bps / 12 bps)', entryBps: 12, exitBps: 12 },
  // Baseline for comparison:
  { name: 'Baseline One-Sided (8 bps Entry / 0 bps Exit)', entryBps: 8, exitBps: 0 },
];

function runScenarioOnTrades(trades, entryBps, exitBps, datasetName) {
  let runningCap = 100000.00;
  let peakCap = runningCap;
  let maxDD = 0;

  let sumGross = 0;
  let sumBrokerage = 0;
  let sumSTT = 0;
  let sumExch = 0;
  let sumSEBI = 0;
  let sumStamp = 0;
  let sumGST = 0;
  let sumEntrySlip = 0;
  let sumExitSlip = 0;
  let sumTotSlip = 0;
  let sumTotalCharges = 0;
  let sumNet = 0;

  const tradeResults = [];

  for (let i = 0; i < trades.length; i++) {
    const t = trades[i];
    const isBuy = t.side === 'BUY';
    const entryPrice = t.entryPrice;
    const exitPrice = t.exitPrice;
    const qty = t.qty;

    const entryTurnover = r2(qty * entryPrice);
    const exitTurnover = r2(qty * exitPrice);
    const totTurnover = r2(entryTurnover + exitTurnover);
    const buyTurnover = isBuy ? entryTurnover : exitTurnover;
    const sellTurnover = isBuy ? exitTurnover : entryTurnover;

    // Gross PnL
    const rawGross = isBuy ? (exitPrice - entryPrice) * qty : (entryPrice - exitPrice) * qty;
    const gross = r2(rawGross);

    // Call two-sided roundTripCharges:
    const charges = roundTripCharges({
      exchange: 'NSE',
      kind: 'EQ',
      broker: 'shoonya',
      qty,
      entry: entryPrice,
      exit: exitPrice,
      side: t.side,
      entrySlippageBps: entryBps,
      exitSlippageBps: exitBps,
    });

    const net = r2(gross - charges.total);
    runningCap = r2(runningCap + net);
    if (runningCap > peakCap) peakCap = runningCap;
    const dd = r2(peakCap - runningCap);
    if (dd > maxDD) maxDD = dd;

    sumGross = r2(sumGross + gross);
    sumBrokerage = r2(sumBrokerage + charges.brokerage);
    sumSTT = r2(sumSTT + charges.stt);
    sumExch = r2(sumExch + charges.exchangeFees);
    sumSEBI = r2(sumSEBI + charges.sebi);
    sumStamp = r2(sumStamp + charges.stamp);
    sumGST = r2(sumGST + charges.gst);
    sumEntrySlip = r2(sumEntrySlip + charges.entrySlippage);
    sumExitSlip = r2(sumExitSlip + charges.exitSlippage);
    sumTotSlip = r2(sumTotSlip + charges.slippage);
    sumTotalCharges = r2(sumTotalCharges + charges.total);
    sumNet = r2(sumNet + net);

    tradeResults.push({
      tradeId: t.tradeId || `WHIPSAW_${t.id}`,
      side: t.side,
      qty,
      entryPrice,
      exitPrice,
      entryTurnover,
      exitTurnover,
      totTurnover,
      gross,
      brokerage: charges.brokerage,
      stt: charges.stt,
      exch: charges.exchangeFees,
      sebi: charges.sebi,
      stamp: charges.stamp,
      gst: charges.gst,
      entrySlippage: charges.entrySlippage,
      exitSlippage: charges.exitSlippage,
      totalSlippage: charges.slippage,
      totalCharges: charges.total,
      net,
      runningEquity: runningCap,
    });
  }

  const maxDDPct = r2((maxDD / 100000.00) * 100);
  const winCount = tradeResults.filter((tr) => tr.net > 0).length;
  const winRate = r2((winCount / trades.length) * 100);

  return {
    datasetName,
    entryBps,
    exitBps,
    tradesCount: trades.length,
    winCount,
    winRate,
    sumGross,
    sumBrokerage,
    sumSTT,
    sumExch,
    sumSEBI,
    sumStamp,
    sumGST,
    sumEntrySlip,
    sumExitSlip,
    sumTotSlip,
    sumTotalCharges,
    sumNet,
    finalCapital: runningCap,
    maxDDRs: maxDD,
    maxDDPct,
    trades: tradeResults,
  };
}

// Execute all scenarios for Phase 4 (15 trades)
console.log('--- RECALCULATING PHASE 4 FORWARD PAPER TRADES (15 TRADES) ---');
const phase4Results = scenarios.map((sc) => {
  const res = runScenarioOnTrades(phase4Trades, sc.entryBps, sc.exitBps, 'Phase 4 Paper Trades');
  console.log(`Scenario: ${sc.name.padEnd(45)} | Net: Rs ${res.sumNet.toString().padStart(8)} | Charges: Rs ${res.sumTotalCharges.toString().padStart(8)} | Slip: Rs ${res.sumTotSlip.toString().padStart(8)} | Max DD: ${res.maxDDPct}%`);
  return { ...sc, ...res };
});

// Execute all scenarios for Whipsaw (19 trades)
console.log('\n--- RECALCULATING HIGH-VOLATILITY WHIPSAW STRESS TRADES (19 TRADES) ---');
const whipsawResults = scenarios.map((sc) => {
  const res = runScenarioOnTrades(whipsawTrades, sc.entryBps, sc.exitBps, 'High-Vol Whipsaw Stress Trades');
  console.log(`Scenario: ${sc.name.padEnd(45)} | Net: Rs ${res.sumNet.toString().padStart(8)} | Charges: Rs ${res.sumTotalCharges.toString().padStart(8)} | Slip: Rs ${res.sumTotSlip.toString().padStart(8)} | Max DD: ${res.maxDDPct}%`);
  return { ...sc, ...res };
});

const output = {
  timestamp: new Date().toISOString(),
  phase: '6.4',
  description: 'Execution Cost Model Correction & Two-Sided Slippage Stress Testing',
  scenariosSummary: {
    phase4PaperTrades: phase4Results.map((r) => ({
      name: r.name,
      entryBps: r.entryBps,
      exitBps: r.exitBps,
      gross: r.sumGross,
      brokerage: r.sumBrokerage,
      stt: r.sumSTT,
      exch: r.sumExch,
      sebi: r.sumSEBI,
      stamp: r.sumStamp,
      gst: r.sumGST,
      entrySlippage: r.sumEntrySlip,
      exitSlippage: r.sumExitSlip,
      totalSlippage: r.sumTotSlip,
      totalCharges: r.sumTotalCharges,
      netPnL: r.sumNet,
      finalCapital: r.finalCapital,
      maxDD: r.maxDDPct,
      winRate: r.winRate,
    })),
    whipsawStressTrades: whipsawResults.map((r) => ({
      name: r.name,
      entryBps: r.entryBps,
      exitBps: r.exitBps,
      gross: r.sumGross,
      brokerage: r.sumBrokerage,
      stt: r.sumSTT,
      exch: r.sumExch,
      sebi: r.sumSEBI,
      stamp: r.sumStamp,
      gst: r.sumGST,
      entrySlippage: r.sumEntrySlip,
      exitSlippage: r.sumExitSlip,
      totalSlippage: r.sumTotSlip,
      totalCharges: r.sumTotalCharges,
      netPnL: r.sumNet,
      finalCapital: r.finalCapital,
      maxDD: r.maxDDPct,
      winRate: r.winRate,
    })),
  },
  detailedPhase4Scenarios: phase4Results,
  detailedWhipsawScenarios: whipsawResults,
};

const outPath = path.join(__dirname, 'phase64_recalculation_output.json');
fs.writeFileSync(outPath, JSON.stringify(output, null, 2), 'utf8');
console.log(`\nPhase 6.4 Recalculation output successfully written to: ${outPath}`);
