# Portfolio-Level Research

**Status: research only. NEGATIVE. No execution policy was changed.***

## What was measured

From the per-strategy research runs (`scripts/experimental_research.js`,
`scripts/experimental_research_output.json`):

* **Strategy return correlation** — pairwise correlation of daily net P&L across the 10
  experimental strategies (45 pairs).
* **Portfolio combination** — equal-weight average of daily P&L (no leverage, no optimisation).
* **Combined drawdown** — peak-to-trough on the combined equity curve.
* **Cost contribution** — statutory charges attributed per strategy.
* **Concentration** — each strategy's signed contribution to portfolio P&L.
* **Regime-specific behaviour** — per-regime results in `EXPERIMENTAL_STRATEGIES.md`.

## Results

| Metric | Value |
|---|---|
| Equal-weight portfolio net (3 regimes) | **−₹1,56,048.10** |
| Equal-weight portfolio max drawdown | **₹1,56,048.10** (i.e. monotonically down) |
| Strategies contributing any P&L | 10 / 10 |
| Pairs with \|corr\| ≥ 0.7 | 13 of 45 |
| Sessions in the correlation sample | **12** |
| Correlation reliability | **INSUFFICIENT_SAMPLE_DO_NOT_ACT_ON** |

The 95%-of-capital drawdown and the fact that drawdown equals total loss indicate there is no
diversification benefit to harvest here: combining ten losing strategies produces a losing
portfolio. Diversification reduces variance around a positive expectancy; it cannot manufacture
a positive one, and it does not here.

## Why the correlation figures are not actionable

With 12 daily observations, a ±0.7 correlation threshold is statistical noise — two sparse
series over 12 points routinely produce ±1.0 spuriously. The report therefore records the
numbers **and** labels them unreliable rather than presenting "13 highly correlated pairs" as a
finding. Establishing real correlation structure needs ≥ 30–60 sessions per strategy from a
representative tape, which is not available offline.

## Cost contribution

Charges scale with trade count, and the high-frequency strategies are where cost drag bites:
`x_parabolic_sar` (1,865 trades) and `x_macd_momentum` (1,507 trades) carry the largest absolute
charge burden. Aggressive-flip strategies are structurally disadvantaged at these cost levels —
a finding consistent with the production quorum's conservative 75% quorum + wave gate.

## Conclusions

1. **Negative portfolio evidence.** No combination of the experimental strategies is net
   positive; the best single strategy is positive in 1 of 3 regimes only.
2. **No diversification payoff** was observed, and the sample is too small to claim otherwise.
3. **No execution policy changed.** The production quorum, risk limits and paper engine were
   not modified on the basis of this research — that would require independent out-of-sample
   evidence plus explicit authorisation.
4. **Next required step** (blocked): a representative multi-year historical dataset, then
   ≥ 30-session correlation estimation, then walk-forward with a sealed holdout.
