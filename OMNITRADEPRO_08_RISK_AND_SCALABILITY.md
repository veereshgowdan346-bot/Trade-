# OMNITRADEPRO_08 — RISK MANAGEMENT AND CAPITAL SCALABILITY

**Modules:** `src/lib/risk.ts`, `src/lib/engine.ts` (circuit/recovery/preFlight), `risk/risk_manager.py`, `risk/cost_guardrail.py`.  
**Verdict: PARTIALLY PASSED** — risk invariants verified by executed sweeps; two design findings flagged for Category C review (MICRO-001, SCALE-001).

## 1. Risk Engine Verification (documented parameters vs actual code)

| Control | Documented | Implemented | Verified |
|---------|-----------|-------------|----------|
| Per-trade risk | 1% rule | `riskPct` default 1, clamp [0.1,25]; `maxRiskAmount = capital·riskPct/100` (min ₹1) | ✅ harness sweep ₹1k–₹10L: `riskAtStop ≤ maxRisk` always |
| ATR stop-loss | 1.5×ATR14 (min 2 ticks) | `slDistance = max(tick·2, roundTick(atr·1.5))` | ✅ |
| Bracket guarantee | risk-at-stop ≤ max risk | double-clamp of slDistance after lot flooring | ✅ (edge: if maxRisk/qty < tick, floor at tick can breach by ≤1 tick — documented) |
| 3R target | ≥3×SL | `rewardRisk` clamp [3,10]; targetDistance = max(3R, rr×R) | ✅ |
| Position sizing | min(capital cap, risk cap), lot floored | `floorTo(min(floor(conf·effCap/entry), floor(maxRisk/slDist)), lotSize)` | ✅ |
| 20% exposure cap | per trade ≤20% buying power | `maxExposureCap = capital·leverage·0.20`; effectiveCapital = min(free, cap) | ✅ sweep: exposure ≤ 20%·capital·lev |
| Buying power | capital·leverage, deployed deducted | `preFlightCheck` + step 6 hard check `deployed+notional ≤ totalAvailableCap` | ✅ |
| Max open positions | default 5, clamp [1,25] | enforced in preFlight + placeOrder | ✅ |
| Duplicate positions | 1 per symbol | `DUPLICATE_POSITION` reject | ✅ |
| Daily drawdown | `drawdownFloor` default 2.5×maxSL (₹25 @ ₹1k) | clamp ≥ maxSL; `breachesCircuit` | ✅ |
| Circuit breaker | hard stop | `hardStop = max(3×floor, 90%·capital)` ⇒ trip + square-off + lock until next IST day/admin reset | ✅ |
| Recovery mode (200/800) | ≥90% quorum + ≥85% GBM | engine 4c + scan gate; capital capped to `remainingCapital` | ✅ |
| Catastrophic shutdown | included above | `squareOffAll` + CRITICAL audit + alerts | ✅ |
| Stop/target state | persisted per position | orders.slPrice/targetPrice + positions columns + `initialSlDistance` persistence (Phase 6.7) | ✅ |
| Available/reserved capital | deployed tracking | `freeCapital = totalCap − Σ(entry·qty)` | ✅ |
| Leverage | default 1, clamp [1,20] | ⚠️ 20× max leverage is aggressive (config, not changed) | ✅ as-implemented |
| TSL 1R net-breakeven / 2R+ trail | ratchet | verified with fee buffer (TSL-001 fixed) | ✅ |

**Fail-scenarios (§8.2):** repeated/consecutive losses → recovery then circuit (chain verified in `checkCircuit`); sudden volatility → ATR-based SL widens, hurdle gate rejects low-yield setups; gap movements → gap-aware fills (BT-002/ORD-004); missing/stale data → `NO_LIVE_FEED` + crash lock; duplicate positions → rejected; DB interruption → order/position writes are sequential with claim-based updates (`CLOSING` claim pattern) minimizing races; application restart → daily reset + reconciliation (`reconcileClosingPositions`), TSL history caveat (TSL-001 restart note).

## 2. Simulation Capital Scenarios (executed — full matrix)

Instrument assumptions: NIFTY FUT (₹26,000, ATR ₹120, lot 75), BANKNIFTY FUT (₹58,000, ATR ₹260, lot 35), RELIANCE-EQ (₹1,500, ATR ₹12, lot 1), TATASTEEL-EQ (₹170, ATR ₹2.2, lot 1). conf=1, Shoonya charges at 3R target. **Hypothetical test balances only.**

| Capital | Min valid position | Qty examples (NIFTY/BNF/RELIANCE/TATA) | Charges at target | Max exposure (20%) | Risk (1%) | Findings |
|---------|-------------------|----------------------------------------|-------------------|--------------------|-----------|----------|
| ₹1,000 | TATASTEEL only | 0 / 0 / 0 / **1** | ₹25 (floor) | ₹200 | ₹10 | NIFTY/BNF/RELIANCE **untradeable** (CAPITAL limit). TATA risk ₹3.3 |
| ₹2,000 | TATASTEEL | 0/0/0/**2** | ₹25 | ₹400 | ₹20 | same |
| ₹5,000 | TATASTEEL | 0/0/0/**5** | ₹25 | ₹1,000 | ₹50 | RELIANCE qty 0 (capitalCap=3 < lot 1? no: 20%·5000=1000·conf/1500=0) |
| ₹10,000 | RELIANCE 1, TATA 11 | 0/0/**1**/**11** | ₹25 | ₹2,000 | ₹100 | futures still untradeable |
| ₹25,000 | RELIANCE 3, TATA 29 | 0/0/**3**/**29** | ₹25 | ₹5,000 | ₹250 | |
| ₹50,000 | RELIANCE 6, TATA 58 | 0/0/**6**/**58** | ₹29.72 / ₹31.67 | ₹10,000 | ₹500 | charges leave the ₹25 floor |
| ₹1,00,000 | RELIANCE 13, TATA 117 | 0/0/**13**/**117** | ₹50.64 / ₹51.89 | ₹20,000 | ₹1,000 | NIFTY-lot instruments remain impossible (20% cap = ₹20k < ₹26k unit) |
| ₹5,00,000 | RELIANCE 66, TATA 588 | 0*/0*/**66**/**588** | ₹208.96 / ₹213.29 | ₹1,00,000 | ₹5,000 | *NIFTY/BNF limited by **LOT_SIZE** (riskCap 27 < lot 75) |
| ₹10,00,000 | RELIANCE 133, TATA 1176 | 0*/0*/**133**/**1176** | ₹409.12 / ₹414.78 | ₹2,00,000 | ₹10,000 | NIFTY needs **≥ ~₹13.5L** (riskCap ≥75 ⇒ maxRisk ≥75×180) |

**SCALE-001:** NIFTY/BANKNIFTY futures cannot be traded at ANY tier ≤ ₹10L under the 1% rule + 1.5×ATR SL + lot sizes (NIFTY needs ≈₹13.5L, BNF ≈₹31.2L at these ATRs). **SCALE-002:** instruments priced ≳₹22,500/unit yield qty 0 at ≤₹1L (20% cap × conf < unit price) — demonstrated live on the NIFTY-50 fixture (0 trades at ₹1L, 3 trades at ₹5L).  
Insufficient-capital behavior: `SIZE_ZERO`/`CAPITAL_EXHAUSTED` rejects with explicit reason ✓. Rounding effects: lot flooring can zero-out viable raw sizes (LIMITED_BY=LOT_SIZE); tick rounding of SL/target verified on-grid. Micro-capital ₹25 charge floor dominates P&L at ₹1k–2k (TATA target gross ₹3.3·3R≈₹10 < ₹25 floor ⇒ preflight hurdle correctly blocks except MICRO-001 carve-out).

## 3. MICRO-001 — Micro-capital carve-out (HIGH, OPEN, Category C)
For `capital ≤ ₹2,000`, `preFlightCheck`/`placeOrder` set `effectiveHurdle = −₹50`: expected-net **losses up to ₹50** are permitted — 5% of a ₹1,000 account per trade, vs the 1% risk rule. Deliberate and commented, but contravenes the net-profit-hurdle concept and dwarfs the risk budget. Requires explicit decision: remove (safest), shrink to ≤ −maxSL, or scope to research-only modes.

## 4. Python RiskManager
`risk/risk_manager.py`: separate risk model (kill switch, daily-loss, drawdown, trailing stops, CNC/intraday risk caps) — coherent internally, exercised by pytest (phase suites), **not reconciled with TS risk.ts** (ARCH-001). CNC stop-loss %, intraday risk caps verified only at Python level.

## 5. Recommendations
1. Decide MICRO-001; until then treat ≤₹2,000 accounts as research-only (UI warning recommended).
2. Publish per-instrument minimum-capital guidance from this matrix in the UI (usability + honest expectations).
3. Leverage default stays 1 ✓; consider reducing the 20× clamp before any future deployment.
4. Fix the one-tick bracket edge (SL floor at tick vs maxRisk) or document tolerance.
