# OMNITRADEPRO APEX V2.0 — INSTITUTIONAL IMPROVEMENT ROADMAP

**Date:** 2026-11-17  
**Author:** Quantitative Systems Architect  
**Workspace:** `c:\Users\veere\Desktop\g4`  
**Execution Objective:** Systematic transition from prototype to verified institutional quantitative trading terminal.  

---

## 1. PHASING & IMPLEMENTATION GANTT OVERVIEW

| Phase | Focus Area | Priority | Target Timeline | Key Milestone Deliverable |
| :---: | :--- | :---: | :---: | :--- |
| **0** | Baseline & Environment Fixes | **P0** | Day 1 | Git repo initialization, SQLite sandbox fallback, Baseline Typecheck |
| **1** | Critical Safety Repairs | **P0** | Days 2–3 | Daily Reset Live Order Skip, REST Position Reconciliation |
| **2** | Risk & Exposure Enhancements | **P1** | Days 4–5 | Weekly Drawdown Floor, Signal Correlation De-biasing |
| **3** | Research Strategy Extensions | **P1** | Days 6–8 | 10 Experimental Modular Strategies (Disabled by Default) |
| **4** | Historical Simulation Engine | **P2** | Days 9–12 | Out-of-Sample Walk-Forward Backtester with Statutory Friction |
| **5** | Verification & Validation Gate | **P0** | Days 13–14 | Comprehensive Automated Mathematical & Integration Test Suite |

---

## 2. DETAILED ACTION ITEMS BY PHASE

### Phase 0: Baseline & Environment
1. **P0.1 Version Control Baseline:** Initialize local Git repository (`git init`) to allow reversible checkpoints.
2. **P0.2 Python Database Sandbox Fallback:** Add environment variable / workspace fallback in `core/database.py` so imports succeed in sandboxed environments.
3. **P0.3 Strict TypeScript Baseline:** Confirm `npm run typecheck` passes with 0 errors.

### Phase 1: Critical Safety Repairs
1. **P1.1 Daily Reset Live Order Preservation (VERIFIED FIXED):**
   Ensure `enforceDailyReset()` in `src/lib/engine.ts` only archives prior-day orders where `mode != 'LIVE' OR brokerRequested IS NULL`.
2. **P1.2 Active REST Position Reconciliation:**
   Implement background periodic reconciliation against Shoonya (`GetPositions`) and Angel One (`getPosition`) to detect out-of-sync broker positions.
3. **P1.3 Exchange-Side Stop-Loss Orders:**
   Design broker-side OCO / Stoploss variety orders for live execution rather than relying solely on server in-process brackets.

### Phase 2: Risk & Intelligence Enhancements
1. **P2.1 Weekly Drawdown Circuit Breaker:**
   Add `weeklyLossLimit` to `RiskConfig` (default $5 \times \text{maxSL} = ₹50$). Halt trading if past 7 days' cumulative net loss breaches floor.
2. **P2.2 Correlated Signal Weighting:**
   Address the co-dependence between Dual EMA 9/21 and SuperTrend 10/3 by clustering trend signals into a single consolidated voter.
3. **P2.3 Bar-Close Signal Confirmation:**
   Update `evaluateConsensus()` to evaluate directional signals strictly on closed bars ($C_{t-1}$), eliminating intra-bar repainting.

### Phase 3: Research Strategy Extensions (10 Experimental Modules)
Implement 10 modular research strategies (disabled by default, unit-tested):
1. MACD Momentum (12, 26, 9)
2. Ichimoku Cloud (9, 26, 52)
3. Keltner Channel (20, 1.5 ATR)
4. Choppiness Index (14)
5. On-Balance Volume (OBV) Confirmation
6. Parabolic SAR (0.02, 0.20)
7. Fibonacci Retracement Levels
8. Volume Profile & Value Area High/Low
9. Donchian Trend Following (50-bar)
10. Multi-Timeframe Trend Confirmation (1-min / 5-min)

### Phase 4: Backtesting & Simulation Framework
1. **P4.1 Simulation Engine (`src/lib/backtest_engine.ts`):**
   Accept historical OHLCV data array, simulate bar-by-bar execution through `evaluateConsensus()`, `sizePosition()`, and `roundTripCharges()`.
2. **P4.2 Sensitivity Matrix:**
   Evaluate performance across zero, standard, and high friction conditions.

### Phase 5: Acceptance Verification Gate
1. Complete mathematical property test execution.
2. Verification report documenting `VERIFIED`, `FIXED`, `UNVERIFIED`, and `NOT IMPLEMENTED`.
