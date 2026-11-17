# OMNITRADEPRO_10 — PROFITABILITY AND PERFORMANCE MEASUREMENT (NET)

**Verdict: NOT VERIFIED (no adequate data).** This report deliberately refuses to make profitability claims.

## 1. The only executed net-performance evidence (this audit)

Dataset: `data/fixtures/multiday_overnight_1m.csv` — **SAMPLE/synthetic provenance** (generated fixture, not market history). Capital ₹5,00,000 (first tier where sizing permits entries on this price level).

| Metric (AFTER all charges) | STANDARD_SHOONYA | HIGH_ANGEL | ZERO_FRICTION |
|----------------------------|------------------|------------|---------------|
| Trade count | 3 | 3 | 3 |
| Win rate | 0% | 0% | 0% |
| Gross P&L | −₹128.37 | −₹128.37 | −₹128.37 |
| Brokerage+taxes+slippage | **₹474.59** | **₹580.79** | ₹0 |
| **Net P&L** | **−₹602.96** | **−₹709.16** | −₹128.37 |
| Avg win / avg loss | 0 / −200.99 | 0 / −236.39 | 0 / −42.79 |
| Profit factor | 0 | 0 | 0 |
| Expectancy | −₹200.99 | −₹236.39 | −₹42.79 |
| Max drawdown | ₹602.96 (0.12%) | ₹709.16 | ₹128.37 |
| Consecutive losses | 3 | 3 | 3 |
| Sharpe/Sortino | −81.4/−15.7 (**invalid annualization — BT-004**) | same caveat | same |

Per-trade ledger (all STOP_LOSS at −1R): #1 −₹178.02, #2 −₹178.68, #3 −₹246.26 (Shoonya).

## 2. Required §10 metric coverage
Gross ✅ · Net ✅ · Brokerage ✅ · Taxes ✅ · Slippage ✅ · Win rate ✅ · Avg win/loss ✅ · Profit factor ✅ · Expectancy ✅ · Max DD ✅ · Recovery factor ✅ (−1) · Sharpe ⚠️ computed but invalid basis (BT-004) · Sortino ⚠️ same · Consecutive losses ✅ · Trade count ✅ · Frequency (1 trade/230 bars) ✅ · Capital utilization (0.24% peak notional) ✅ · Exposure duration (65–76 bars) ✅ · Risk-adjusted (R-multiples: all −1R) ✅.

## 3. §10 verification requirements
| Requirement | Finding |
|-------------|---------|
| Statistical significance | **NONE** — n=3 on synthetic data |
| Sample size | grossly inadequate |
| Period stability | not assessable |
| Regime stability | not assessable (only TRENDING_BULL entries qualified) |
| Sensitivity to costs | **demonstrated:** costs 3.7× gross loss; ZERO_FRICTION moves net from −603 to −128 (friction = 79% of the loss) |
| Sensitivity to execution | gap fills & BE buffer fixes materially changed exits (BT-001/002); results are execution-assumption-dependent |
| Profit concentration | n/a (zero winners) |
| Overfitting / selection bias | **no tuning performed** (mandate); gate thresholds taken as-found |

## 4. Statements
- **Gross is never presented as net** — every table above is post-charge; the engine's own alerting distinguishes gross/charges/net ✓.
- **No guarantee of future performance** is made or implied.
- Historical claims in the repo's 124 legacy MD files (e.g. "PHASE5_FINAL_RESEARCH_VERDICT", win rates, expectancy figures in earlier reports) were **not reproducible in this audit** because the datasets backing them are not in the repository (DATA-001). They are classified **UNVERIFIED CLAIMS**.
- The 3R target with 37.5% required win rate to break even pre-costs; post-costs the required rate is higher (target gross ₹2,509 vs charges ₹203/round trip at ₹5L sizing → breakeven win-rate ≈ 41.5% at 3R). Derived math, illustrative only.

## 5. Conclusion
**Net profitability: NOT VERIFIED.** The system is mathematically honest (cost model enforced end-to-end after fixes), but profitability cannot be established without genuine historical data, walk-forward execution (BT-003), and materially larger samples. Any deployment consideration must start with ingesting GENUINE_HISTORICAL datasets through the existing provenance-checked pipeline.
