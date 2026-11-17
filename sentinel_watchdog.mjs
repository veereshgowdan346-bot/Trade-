import fs from "node:fs";

async function pollState() {
  const res = await fetch("http://localhost:3000/api/state");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

function fmt(n, d = 2) {
  if (n === null || n === undefined) return "—";
  return Number(n).toFixed(d);
}

async function runWatchdog() {
  console.log("================================================================================");
  console.log("   OMNITRADEPRO - FINTECH QA SYSTEMS SENTINEL & READ-ONLY OBSERVER");
  console.log("   Protocol: Autonomous Monitoring until 5-6 Full Round-Trip Trades Complete");
  console.log("   Initial Capital: ₹1,00,000.00 | MIS Multiplier: 5x | Auto-Trader: ACTIVE");
  console.log("================================================================================\n");

  let knownClosedIds = new Set();
  let knownOpenIds = new Set();
  let iteration = 0;

  while (true) {
    iteration++;
    try {
      const state = await pollState();
      const openPos = state.positions || [];
      const closedTrades = state.trades || [];
      const pnl = state.pnl || {};
      const auto = state.autoTrader || {};
      const ws = state.ws || {};

      const istTime = state.session?.istTime || new Date().toLocaleTimeString();

      // Check for newly opened positions
      for (const p of openPos) {
        if (!knownOpenIds.has(p.id)) {
          knownOpenIds.add(p.id);
          console.log(`\n>>> [NEW POSITION OPENED AUTONOMOUSLY] <<<`);
          console.log(`  Asset:        ${p.symbol} (${p.exchange})`);
          console.log(`  Direction:    ${p.side} (${p.side === "BUY" ? "LONG" : "SHORT-SELL MIS"})`);
          console.log(`  Quantity:     ${p.qty} shares/units`);
          console.log(`  Entry Price:  ₹${fmt(p.entryPrice)}`);
          console.log(`  SL Price:     ₹${fmt(p.slPrice)}`);
          console.log(`  Target Price: ₹${fmt(p.targetPrice)}`);
          console.log(`  Strategy:     ${p.strategy}`);
          console.log(`--------------------------------------------------------------------------------`);
        }
      }

      // Check for newly closed trades
      for (const t of closedTrades) {
        if (!knownClosedIds.has(t.id)) {
          knownClosedIds.add(t.id);
          const durSec = t.closedAt && t.openedAt ? Math.round((new Date(t.closedAt).getTime() - new Date(t.openedAt).getTime()) / 1000) : 0;
          console.log(`\n>>> [TRADE #${knownClosedIds.size} COMPLETED & SQUARED OFF] <<<`);
          console.log(`  Asset:        ${t.symbol} (${t.exchange})`);
          console.log(`  Direction:    ${t.side} (${t.side === "BUY" ? "LONG" : "SHORT-SELL MIS"})`);
          console.log(`  Quantity:     ${t.qty} shares/units`);
          console.log(`  Entry Price:  ₹${fmt(t.entryPrice)}`);
          console.log(`  Exit Price:   ₹${fmt(t.exitPrice)}`);
          console.log(`  Exit Reason:  ${t.exitReason}`);
          console.log(`  Duration:     ${durSec} seconds`);
          console.log(`  Gross P&L:    ${t.grossPnl >= 0 ? "+" : ""}₹${fmt(t.grossPnl)}`);
          console.log(`  Total Charges: ₹${fmt(t.totalCharges || (t.charges?.total))} (Brokerage ₹40 + STT + Stamp + GST + Slip)`);
          console.log(`  Net P&L:      ${t.netPnl >= 0 ? "+" : ""}₹${fmt(t.netPnl)}`);

          // Audit calculation math
          const dir = t.side === "BUY" ? 1 : -1;
          const expectedGross = Math.round((t.exitPrice - t.entryPrice) * t.qty * dir * 100) / 100;
          const mathOk = Math.abs(expectedGross - t.grossPnl) < 0.05;
          console.log(`  Math Check:   ${mathOk ? "VERIFIED ACCURATE ✓" : "DISCREPANCY DETECTED ✖"}`);
          console.log(`--------------------------------------------------------------------------------`);
        }
      }

      // Check termination condition: 5 to 6 completed trades
      if (knownClosedIds.size >= 5) {
        console.log(`\n================================================================================`);
        console.log(`TARGET REACHED: ${knownClosedIds.size} full round-trip trades completed autonomously!`);
        console.log(`================================================================================\n`);
        break;
      }

      // Progress heartbeat line every 3 iterations (~15s)
      if (iteration % 3 === 1) {
        const openDesc = openPos.map(p => `${p.symbol} ${p.side} ${p.qty}@${fmt(p.entryPrice)} (LTP: ₹${fmt(p.ltp)}, SL: ₹${fmt(p.slPrice)}, TGT: ₹${fmt(p.targetPrice)}, MTM: ${p.mtm >= 0 ? "+" : ""}₹${fmt(p.mtm)})`).join(" | ");
        console.log(`[${istTime}] Ticks: ${ws.ticksReceived} | Open: ${openPos.length} (${openDesc || "None"}) | Closed: ${knownClosedIds.size}/5 | Realized P&L: ₹${fmt(pnl.realized)}`);
      }

      await new Promise(r => setTimeout(r, 5000));
    } catch (err) {
      console.error(`[Watchdog Error]:`, err.message);
      await new Promise(r => setTimeout(r, 5000));
    }
  }
}

runWatchdog().catch(console.error);
