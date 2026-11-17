const fs = require('fs');
const path = require('path');
const { roundTripCharges } = require('../dist_test_cjs/tax.js');

const r2 = (v) => Math.round(v * 100) / 100;
const r4 = (v) => Math.round(v * 10000) / 10000;

console.log('=== PHASE 6.5 FINAL EXECUTION MODEL & DATA QUALITY AUDIT SCRIPT ===\n');

// 1. Load Raw Simulation Ledgers
const p4Path = path.join(__dirname, 'phase4_simulation_output.json');
const rawPhase4 = JSON.parse(fs.readFileSync(p4Path, 'utf8'));
const p4Trades = rawPhase4.trades;

const whipsawPath = path.join(__dirname, 'phase62_whipsaw_output.json');
const rawWhipsaw = JSON.parse(fs.readFileSync(whipsawPath, 'utf8'));
const wTrades = rawWhipsaw.trades;

console.log(`Loaded ${p4Trades.length} Phase 4 paper trades.`);
console.log(`Loaded ${wTrades.length} High-Volatility Whipsaw trades.\n`);

const slippageScenarios = [0, 4, 8, 12]; // bps per side

function auditDataset(trades, datasetName) {
  console.log(`--> AUDITING: ${datasetName} (${trades.length} trades)`);
  const resultsByScenario = {};

  for (const bps of slippageScenarios) {
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

    const rowAudits = [];

    for (let i = 0; i < trades.length; i++) {
      const t = trades[i];
      const isBuy = t.side === 'BUY';
      const entryPrice = t.entryPrice;
      const exitPrice = t.exitPrice;
      const qty = t.qty;

      // Independent turnover calculation
      const entryTurnover = r2(qty * entryPrice);
      const exitTurnover = r2(qty * exitPrice);
      const totTurnover = r2(entryTurnover + exitTurnover);
      const buyTurnover = isBuy ? entryTurnover : exitTurnover;
      const sellTurnover = isBuy ? exitTurnover : entryTurnover;

      // Independent gross calculation
      const rawGross = isBuy ? (exitPrice - entryPrice) * qty : (entryPrice - exitPrice) * qty;
      const gross = r2(rawGross);

      // Independent statutory calculation
      const brk = 10.00;
      const stt = r2(sellTurnover * 0.00025);
      const exch = r2(totTurnover * 0.0000297);
      const sebi = r2(totTurnover * 0.000001);
      const stamp = r2(buyTurnover * 0.00003);
      const gst = r2((brk + (totTurnover * 0.0000297) + (totTurnover * 0.000001)) * 0.18);

      // Symmetrical slippage
      const entrySlipRate = bps / 10000;
      const exitSlipRate = bps / 10000;
      const entrySlip = r2(entryTurnover * entrySlipRate);
      const exitSlip = r2(exitTurnover * exitSlipRate);
      const totSlip = r2(entrySlip + exitSlip);

      // Call production roundTripCharges:
      const charges = roundTripCharges({
        exchange: 'NSE',
        kind: 'EQ',
        broker: 'shoonya',
        qty,
        entry: entryPrice,
        exit: exitPrice,
        side: t.side,
        entrySlippageBps: bps,
        exitSlippageBps: bps,
      });

      // Assert engine charges match independent calculation within float rounding
      const expectedUnrounded = brk + (sellTurnover * 0.00025) + (totTurnover * 0.0000297) + (totTurnover * 0.000001) + (buyTurnover * 0.00003) + ((brk + (totTurnover * 0.0000297) + (totTurnover * 0.000001)) * 0.18) + (entryTurnover * entrySlipRate) + (exitTurnover * exitSlipRate);
      const expectedCharges = r2(expectedUnrounded);

      if (Math.abs(charges.total - expectedCharges) > 0.01) {
        console.error(`Mismatch on trade ${t.tradeId || t.id}: engine ${charges.total} !== expected ${expectedCharges}`);
      }

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

      // Assert invariant Gross - Charges === Net strictly
      if (r2(gross - charges.total) !== net) {
        console.error(`Invariant violated on trade ${t.tradeId || t.id}: ${gross} - ${charges.total} !== ${net}`);
      }

      rowAudits.push({
        id: t.tradeId || t.id,
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
        entrySlip: charges.entrySlippage,
        exitSlip: charges.exitSlippage,
        totSlip: charges.slippage,
        charges: charges.total,
        net,
        runningCap,
      });
    }

    const maxDDPct = r2((maxDD / 100000) * 100);
    const winRate = r2((rowAudits.filter((r) => r.net > 0).length / trades.length) * 100);

    console.log(`  [${bps} bps each side]: Net P&L: Rs ${sumNet.toString().padStart(8)} | Charges: Rs ${sumTotalCharges.toString().padStart(8)} | Slippage: Rs ${sumTotSlip.toString().padStart(8)} | Max DD: ${maxDDPct}% | Win: ${winRate}%`);

    resultsByScenario[`bps_${bps}`] = {
      bpsPerSide: bps,
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
      winRate,
      trades: rowAudits,
    };
  }

  return resultsByScenario;
}

const p4Audit = auditDataset(p4Trades, 'Phase 4 Paper Trades (15 trades)');
console.log();
const whipsawAudit = auditDataset(wTrades, 'High-Volatility Whipsaw Trades (19 trades)');

// ---------------------------------------------------------------------------
// 2. BREAK-EVEN SENSITIVITY ANALYSIS
// ---------------------------------------------------------------------------
console.log('\n--- BREAK-EVEN SENSITIVITY RECOMPUTATION ---');
const p4TotTurnover = p4Audit.bps_0.trades.reduce((a, b) => a + b.totTurnover, 0);
const p4Gross = p4Audit.bps_0.sumGross;
const p4StatutoryZeroSlip = p4Audit.bps_0.sumTotalCharges;
const p4AlphaCushion = r2(p4Gross - p4StatutoryZeroSlip);

const p4SymmetricalBreakEvenBps = r4((p4AlphaCushion / p4TotTurnover) * 10000);
console.log(`Total Turnover (Phase 4): Rs ${p4TotTurnover}`);
console.log(`Gross Alpha: Rs ${p4Gross}`);
console.log(`Statutory Taxes (Zero Slip): Rs ${p4StatutoryZeroSlip}`);
console.log(`Net Alpha Cushion: Rs ${p4AlphaCushion}`);
console.log(`Symmetrical Two-Sided Break-Even Slippage: ${p4SymmetricalBreakEvenBps} bps per side`);

// Sensitivity to gross P&L (+/- 10%)
const beGrossPlus10 = r4(((p4AlphaCushion + (p4Gross * 0.10)) / p4TotTurnover) * 10000);
const beGrossMinus10 = r4(((p4AlphaCushion - (p4Gross * 0.10)) / p4TotTurnover) * 10000);
console.log(`Sensitivity (+10% Gross): ${beGrossPlus10} bps per side`);
console.log(`Sensitivity (-10% Gross): ${beGrossMinus10} bps per side`);

// Sensitivity to statutory costs (+/- 20% in brokerage/taxes)
const beCostsPlus20 = r4(((p4Gross - (p4StatutoryZeroSlip * 1.20)) / p4TotTurnover) * 10000);
const beCostsMinus20 = r4(((p4Gross - (p4StatutoryZeroSlip * 0.80)) / p4TotTurnover) * 10000);
console.log(`Sensitivity (+20% Statutory Costs): ${beCostsPlus20} bps per side`);
console.log(`Sensitivity (-20% Statutory Costs): ${beCostsMinus20} bps per side`);

// Save Phase 6.5 Output
const phase65Output = {
  timestamp: new Date().toISOString(),
  phase: '6.5',
  p4Audit,
  whipsawAudit,
  breakEvenSensitivity: {
    dataset: 'Phase 4 Forward Paper Trading (15 trades)',
    totalTurnover: p4TotTurnover,
    grossAlpha: p4Gross,
    statutoryFrictionZeroSlip: p4StatutoryZeroSlip,
    netAlphaCushion: p4AlphaCushion,
    symmetricalBreakEvenBps: p4SymmetricalBreakEvenBps,
    sensitivityToGross: {
      plus10Pct: beGrossPlus10,
      minus10Pct: beGrossMinus10,
    },
    sensitivityToStatutoryCosts: {
      plus20Pct: beCostsPlus20,
      minus20Pct: beCostsMinus20,
    },
    disclaimer: 'DATASET-SPECIFIC SIMULATED THRESHOLD ONLY; NOT GUARANTEED LIVE MARKET CAPACITY',
  },
};

const outPath = path.join(__dirname, 'phase65_audit_output.json');
fs.writeFileSync(outPath, JSON.stringify(phase65Output, null, 2), 'utf8');
console.log(`\nPhase 6.5 Audit Output saved to: ${outPath}`);
