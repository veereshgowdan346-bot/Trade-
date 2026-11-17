# OMNITRADEPRO BACKTEST REPORT (CONSOLIDATED)

Detailed validation: `OMNITRADEPRO_09_BACKTEST_VALIDATION.md`.

## Verdict: PARTIALLY PASSED (Gate 9)

## What the engine guarantees (verified)
- **Chronological, causal replay:** decisions on closed bars only (`slice(0,i)`); entry at decision-bar close; management strictly after entry. Look-ahead/leakage suites pass (indicator causality, scaler isolation, temporal partitions, purging, embargo, fit-timestamps).
- **Costs end-to-end:** every simulated trade carries brokerage + STT/exchange/SEBI/stamp/GST + two-sided slippage (or explicit ZERO_FRICTION).
- **Execution realism (after this audit's fixes):** gap-through fills at bar open (BT-002), net-breakeven buffer from the real charge model (BT-001), conservative same-bar SL-over-target priority.

## What the engine does NOT yet guarantee (mandatory-control gaps)
| Control | Status |
|---------|--------|
| Partial fills | ❌ whole-qty assumption |
| Rejected-order accounting | ⚠️ silent skips |
| Session timing (per-day EOD square-off) | ❌ BT-003 |
| Exchange holidays in-loop | ❌ BT-003 (helpers exist, unwired) |
| In-engine walk-forward/rolling splits | ❌ BT-003 (helpers exist, unwired) |
| Standard Sharpe/Sortino | ❌ BT-004 (√252 over per-trade returns — invalid) |

## Executed evidence (synthetic fixtures only — DATA-001)
| Dataset | Trades | Net (Shoonya) | Net (Angel) | Net (0-friction) |
|---------|--------|---------------|-------------|------------------|
| synthetic_gbm | 0 | 0 | 0 | 0 (gates reject noise) |
| sample_nifty50 (375 bars) | 0 | 0 | 0 | 0 (sizing: 20% cap < unit price at ₹1L) |
| multiday_overnight (750 bars, ₹5L) | 3 | **−₹602.96** | −₹709.16 | −₹128.37 |

All 3 trades stopped at −1R; friction (₹474.59) exceeded gross loss (₹128.37). No parameter tuning performed.

## Bottom line
The engine is a sound *research instrument* (causal, cost-aware, leakage-audited) but is **not a validation system** until: genuine historical data is ingested, walk-forward orchestration is wired, session/holiday controls are implemented, and sample sizes become meaningful. Historical performance claims in legacy repo docs remain UNVERIFIED (their datasets are absent).
