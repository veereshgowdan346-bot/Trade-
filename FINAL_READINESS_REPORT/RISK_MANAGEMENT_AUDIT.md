# Risk Management Audit

## Inspected
`src/lib/risk.ts` (normaliseRisk, sizePosition, hurdleFloorFor, net-P&L helpers),
`risk/` Python (cost guardrail, rate spec), `core/engine.py` pre-trade validation,
kill switch and duplicate guard, `RiskManager` (daily loss, drawdown, exposure,
consecutive-loss, expected-loss filters), and the circuit breaker.

## Controls verified
| Control | Implementation | Verdict |
|---|---|---|
| Capital validation | `normaliseRisk` clamps to sane bounds; zero-size positions flagged | PASS |
| Position sizing (risk %, exposure cap, lot flooring) | 1% risk rule, 20% exposure cap, lot-size floor never exceeds raw qty | PASS |
| Invalid confidence handling | `conf > 1` clamped — cannot inflate quantity (RISK-001) | PASS |
| Max SL / target | computed from capital × riskPct; ≥ 3R target with tick rounding | PASS |
| Max daily loss / drawdown floor | `drawdownFloor = 2.5 × maxSL`, circuit breaker trips | PASS |
| Stop-loss / take-profit / brackets | checked on every tick, gap-aware fills | PASS |
| Slippage | modelled on both legs (2 × entry bps default) | PASS |
| Volatility filters | ATR-based sizing plus regime suppression | PASS |
| Exposure limits | 20% cap and venue exposure check | PASS |
| Order rejection paths | paused / stopped / kill switch / duplicate / insufficient cash / risk reject | PASS |
| Consecutive-loss control | engine counter → ERROR state at threshold | PASS |
| Expected-loss filter (micro capital) | balances ≤ ₹2,000 require expected net > 0 after all costs | PASS |
| Leverage | default 1 (none). **No leverage was added** | PASS |
| Risk/reward | R-multiple recorded per trade in the ledger | PASS |

## 9-tier capital matrix (mandated tiers, SIMULATED only, no leverage)
Instrument SBIN-EQ, entry ₹893.65, ATR ₹7.304, Shoonya, 20% exposure cap.
Source: `scripts/phase2_recheck_matrix_output.json`.

| Capital | Qty | Expected net | Charges | Hurdle | Policy | Order admissible |
|---|---|---|---|---|---|---|
| ₹1,000 | 0 | −25.00 | 25.00 | 0 | MICRO_001 | **No** |
| ₹2,000 | 0 | −25.00 | 25.00 | 0 | MICRO_001 | **No** |
| ₹5,000 | 0 | −25.00 | 25.00 | 25 | standard | **No** |
| ₹10,000 | 1 | 7.85 | 25.00 | 25 | standard | **No** (7.85 < 25) |
| ₹25,000 | 4 | 106.40 | 25.00 | 25 | standard | Yes |
| ₹50,000 | 8 | 236.76 | 26.04 | 25 | standard | Yes |
| ₹1,00,000 | 17 | 516.38 | 42.07 | 25 | standard | Yes |
| ₹5,00,000 | 89 | 2,753.39 | 170.26 | 25 | standard | Yes |
| ₹10,00,000 | 179 | 5,549.64 | 330.51 | 25 | standard | Yes |

## Mathematically unsuitable instruments per tier
* **₹1,000 – ₹2,000:** nothing is suitable. Position sizing yields qty 0 and the statutory
  minimum floor (₹25) exceeds any achievable expected profit. Equity intraday is infeasible;
  only a zero-friction assumption would "work", which is not permitted.
* **₹5,000:** equity intraday infeasible (qty 0 at 20% exposure on a ~₹894 instrument).
* **₹10,000:** exactly 1 share is sizeable, but expected net (₹7.85) is below the ₹25
  statutory hurdle → correctly blocked.
* **₹25,000 and above:** equity intraday admissible under the modelled cost model.
* **Any tier:** delivery/CNC and currency segments are structurally unsupported
  (fail-closed) and therefore unsuitable at every capital level.

## Probes
Regime/thin-data fail-closed (`P2`), warm-up guard preventing trades on insufficient data
(`P3_thin_data_no_trades`), concurrent determinism (`P6`), and the paused/stopped/insufficient
-cash/duplicate rejection paths (12 new lifecycle tests). No safeguard was weakened and no
exposure was increased to force trades.

## Remaining risks
The matrix uses unverified statutory rates; the ₹25 hurdle boundary is sensitive to real
per-order costs. Small-capital tiers remain economically unusable by construction.

## Verification status
**PASS** for control implementation and enforcement. Rate-dependent thresholds:
**UNVERIFIED** (inputs).
