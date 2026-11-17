import fs from "node:fs";

async function pollState() {
  const res = await fetch("http://localhost:3000/api/state");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json();
}

async function api(path, body) {
  const res = await fetch(`http://localhost:3000${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return await res.json();
}

function fmt(n, d = 2) {
  if (n === null || n === undefined) return "—";
  return Number(n).toFixed(d);
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function runDualPhaseSentinel() {
  console.log("================================================================================");
  console.log("   OMNITRADEPRO - FINTECH QA AUDITOR & STRICT DUAL-CAPITAL SENTINEL");
  console.log("   Protocol: Autonomous Monitoring of Two Phases (Total 10-12 Round-Trip Trades)");
  console.log("   Phase 1: ₹1,000 Micro-Capital Stress Test (5-6 Trades)");
  console.log("   Phase 2: ₹1,00,000 Macro-Capital Scaling Test (5-6 Trades)");
  console.log("================================================================================\n");

  const report = {
    startedAt: new Date().toISOString(),
    phase1: { capital: 1000, leverage: 5, trades: [] },
    phase2: { capital: 100000, leverage: 5, trades: [] },
    completedAt: null,
  };

  // ---------------------------------------------------------------------------
  // PHASE 1: ₹1,000 Micro-Capital
  // ---------------------------------------------------------------------------
  console.log(">>> [INITIATING PHASE 1: ₹1,000 MICRO-CAPITAL STRESS TEST] <<<");
  await api("/api/config", {
    capital: 1000,
    leverage: 5,
    riskPct: 1,
    tradingMode: "PAPER",
    enforceSessions: false,
    autoTrade: true,
  });
  await api("/api/engine", { action: "reset-circuit" });

  let initState = await pollState();
  const phase1InitialTradeIds = new Set((initState.trades || []).map((t) => t.id));
  let phase1Closed = [];
  let knownOpenIds = new Set();
  let iter = 0;

  console.log(`[Phase 1] Config locked: Capital ₹1,000 | 5x MIS | Auto-Trade Daemon ACTIVE`);
  console.log(`[Phase 1] Monitoring live ticks until 5 full round-trip trades complete...\n`);

  while (phase1Closed.length < 5) {
    iter++;
    try {
      const state = await pollState();
      const openPos = state.positions || [];
      const allTrades = state.trades || [];
      const ws = state.ws || {};

      for (const p of openPos) {
        if (!knownOpenIds.has(p.id)) {
          knownOpenIds.add(p.id);
          console.log(`\n[P1 NEW POSITION] #${p.id} ${p.symbol} ${p.side} ${p.qty}x @ ₹${fmt(p.entryPrice)} | SL: ₹${fmt(p.slPrice)} | TGT: ₹${fmt(p.targetPrice)} | Strategy: ${p.strategy}`);
        }
      }

      for (const t of allTrades) {
        if (!phase1InitialTradeIds.has(t.id) && !phase1Closed.some((x) => x.id === t.id)) {
          phase1Closed.push(t);
          report.phase1.trades.push(t);
          const durSec = t.closedAt && t.openedAt ? Math.round((new Date(t.closedAt).getTime() - new Date(t.openedAt).getTime()) / 1000) : 0;
          const dir = t.side === "BUY" ? 1 : -1;
          const expGross = Math.round((t.exitPrice - t.entryPrice) * t.qty * dir * 100) / 100;
          const mathOk = Math.abs(expGross - t.grossPnl) < 0.05;

          console.log(`\n================================================================================`);
          console.log(`>>> [PHASE 1 TRADE #${phase1Closed.length}/5 COMPLETED] <<<`);
          console.log(`  Asset & Side:     ${t.symbol} (${t.exchange}) ${t.side} (${t.side === "BUY" ? "LONG" : "SHORT-SELL MIS"})`);
          console.log(`  Quantity:         ${t.qty} shares (Notional: ₹${fmt(t.qty * t.entryPrice)})`);
          console.log(`  Entry Price:      ₹${fmt(t.entryPrice)}`);
          console.log(`  Exit Price:       ₹${fmt(t.exitPrice)} (${t.exitReason})`);
          console.log(`  Duration:         ${durSec}s`);
          console.log(`  Gross P&L:        ${t.grossPnl >= 0 ? "+" : ""}₹${fmt(t.grossPnl)}`);
          console.log(`  Total Charges:    ₹${fmt(t.totalCharges || (t.charges?.total))} (Brokerage + STT + Stamp + Exch + GST)`);
          console.log(`  Net Realized:     ${t.netPnl >= 0 ? "+" : ""}₹${fmt(t.netPnl)}`);
          console.log(`  Calculation Math: ${mathOk ? "VERIFIED 100% ACCURATE ✓" : "DISCREPANCY ✖"}`);
          console.log(`================================================================================\n`);
        }
      }

      if (iter % 3 === 0) {
        const desc = openPos.map((p) => `${p.symbol} ${p.qty}@₹${fmt(p.entryPrice)} (LTP ₹${fmt(p.ltp)}, MTM: ${p.mtm >= 0 ? "+" : ""}₹${fmt(p.mtm)})`).join(" | ");
        console.log(`[P1 Heartbeat] Ticks: ${ws.ticksReceived} | Open: ${openPos.length} (${desc || "None"}) | Closed: ${phase1Closed.length}/5`);
      }

      await sleep(5000);
    } catch (e) {
      console.error(`[P1 Watchdog Error]:`, e.message);
      await sleep(5000);
    }
  }

  console.log(`\n>>> PHASE 1 COMPLETE: 5 Full Round-Trip Trades Completed under ₹1,000 Micro-Capital! <<<\n`);

  // Square off any open trades before Phase 2
  console.log(">>> Squaring off any remaining open positions before Phase 2 transition...");
  await api("/api/engine", { action: "squareoff-all" });
  await sleep(3000);

  // ---------------------------------------------------------------------------
  // PHASE 2: ₹1,00,000 Macro-Capital
  // ---------------------------------------------------------------------------
  console.log("\n================================================================================");
  console.log(">>> [INITIATING PHASE 2: ₹1,00,000 MACRO-CAPITAL SCALING TEST] <<<");
  console.log("================================================================================\n");

  await api("/api/config", {
    capital: 100000,
    leverage: 5,
    riskPct: 1,
    tradingMode: "PAPER",
    enforceSessions: false,
    autoTrade: true,
  });
  await api("/api/engine", { action: "reset-circuit" });

  initState = await pollState();
  const phase2InitialTradeIds = new Set((initState.trades || []).map((t) => t.id));
  let phase2Closed = [];
  knownOpenIds = new Set();
  iter = 0;

  console.log(`[Phase 2] Config locked: Capital ₹1,00,000 | 5x MIS (₹5,00,000 BP) | 1% Max Risk (₹1,000)`);
  console.log(`[Phase 2] Monitoring live ticks until 5 full round-trip trades complete...\n`);

  while (phase2Closed.length < 5) {
    iter++;
    try {
      const state = await pollState();
      const openPos = state.positions || [];
      const allTrades = state.trades || [];
      const ws = state.ws || {};

      for (const p of openPos) {
        if (!knownOpenIds.has(p.id)) {
          knownOpenIds.add(p.id);
          const notional = p.qty * p.entryPrice;
          const exposureCap = 100000; // 20% of 5L
          console.log(`\n[P2 NEW POSITION] #${p.id} ${p.symbol} ${p.side} ${p.qty}x @ ₹${fmt(p.entryPrice)}`);
          console.log(`  Notional: ₹${fmt(notional)} (Within 20% Cap ₹${exposureCap}: ${notional <= exposureCap + 1})`);
          console.log(`  Bracket: SL ₹${fmt(p.slPrice)} | TGT ₹${fmt(p.targetPrice)} | Strategy: ${p.strategy}`);
        }
      }

      for (const t of allTrades) {
        if (!phase2InitialTradeIds.has(t.id) && !phase2Closed.some((x) => x.id === t.id)) {
          phase2Closed.push(t);
          report.phase2.trades.push(t);
          const durSec = t.closedAt && t.openedAt ? Math.round((new Date(t.closedAt).getTime() - new Date(t.openedAt).getTime()) / 1000) : 0;
          const dir = t.side === "BUY" ? 1 : -1;
          const expGross = Math.round((t.exitPrice - t.entryPrice) * t.qty * dir * 100) / 100;
          const mathOk = Math.abs(expGross - t.grossPnl) < 0.05;

          console.log(`\n================================================================================`);
          console.log(`>>> [PHASE 2 TRADE #${phase2Closed.length}/5 COMPLETED] <<<`);
          console.log(`  Asset & Side:     ${t.symbol} (${t.exchange}) ${t.side} (${t.side === "BUY" ? "LONG" : "SHORT-SELL MIS"})`);
          console.log(`  Quantity:         ${t.qty} shares (Notional: ₹${fmt(t.qty * t.entryPrice)})`);
          console.log(`  Entry Price:      ₹${fmt(t.entryPrice)}`);
          console.log(`  Exit Price:       ₹${fmt(t.exitPrice)} (${t.exitReason})`);
          console.log(`  Duration:         ${durSec}s`);
          console.log(`  Gross P&L:        ${t.grossPnl >= 0 ? "+" : ""}₹${fmt(t.grossPnl)}`);
          console.log(`  Total Charges:    ₹${fmt(t.totalCharges || (t.charges?.total))} (Brokerage + STT + Stamp + Exch + GST)`);
          console.log(`  Net Realized:     ${t.netPnl >= 0 ? "+" : ""}₹${fmt(t.netPnl)}`);
          console.log(`  Calculation Math: ${mathOk ? "VERIFIED 100% ACCURATE ✓" : "DISCREPANCY ✖"}`);
          console.log(`================================================================================\n`);
        }
      }

      if (iter % 3 === 0) {
        const desc = openPos.map((p) => `${p.symbol} ${p.qty}@₹${fmt(p.entryPrice)} (LTP ₹${fmt(p.ltp)}, SL: ₹${fmt(p.slPrice)}, MTM: ${p.mtm >= 0 ? "+" : ""}₹${fmt(p.mtm)})`).join(" | ");
        console.log(`[P2 Heartbeat] Ticks: ${ws.ticksReceived} | Open: ${openPos.length} (${desc || "None"}) | Closed: ${phase2Closed.length}/5`);
      }

      await sleep(5000);
    } catch (e) {
      console.error(`[P2 Watchdog Error]:`, e.message);
      await sleep(5000);
    }
  }

  report.completedAt = new Date().toISOString();
  fs.writeFileSync("audit_dual_phase_results.json", JSON.stringify(report, null, 2));

  console.log("\n================================================================================");
  console.log("   DUAL-PHASE AUDIT COMPLETED SUCCESSFULLY!");
  console.log(`   Phase 1 Trades: ${report.phase1.trades.length} | Phase 2 Trades: ${report.phase2.trades.length}`);
  console.log("   Results written to audit_dual_phase_results.json");
  console.log("================================================================================\n");
}

runDualPhaseSentinel().catch(console.error);

