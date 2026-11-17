# Profitability Research

> No return figure in this document is a promise, forecast or target. All results are
> historical simulations on synthetic fixtures with **unverified** statutory rates.

## Method
Every strategy run is charged realistic round-trip costs (brokerage floors, STT, exchange,
SEBI, stamp duty, GST) plus entry/exit slippage; net figures only. Gross is never reported as
net. Datasets are separated by provenance: synthetic fixtures, in-sample walks, out-of-sample
folds, and paper-trading simulation. No parameter was optimised on the final OOS window.

## Results (final source state)

| Dataset | Trades | Gross | Charges | **Net** | Win rate | Profit factor | Max DD | Classification |
|---|---|---|---|---|---|---|---|---|
| seed-42 1-minute fixture (375 bars, BT-003) | 74 | negative | — | **−₹7,576.06** | < 50% | < 1 | — | Negative evidence |
| Same fixture, research mode (no EOD square-off) | 72 | negative | — | **−₹7,177.69** | < 50% | < 1 | — | Negative evidence |
| Walk-forward, 2 folds, **out-of-sample** | 30 | negative | — | **−₹4,023.54** | < 50% | < 1 | — | Negative evidence |
| Multi-day overnight fixture (controls on) | 3 | negative | ₹474.59 | **−₹602.96** | 0% (all STOP_LOSS) | 0 | — | Negative evidence |
| Multi-day, zero friction (control only) | 3 | negative | 0 | −₹128.37 | 0% | 0 | — | Control, not tradable |
| Multi-day, high-cost Angel control | 3 | negative | ₹580.79 | −₹709.16 | 0% | 0 | — | Control |

## Metrics that could not be established
* **Expectancy confidence:** sample sizes are 3–74 trades. A 30-trade OOS sample cannot
  distinguish a small edge from noise; no confidence interval supports a positive expectancy.
* **Cost-to-profit ratio:** with negative net outcomes the ratio is undefined/negative.
* **Regime robustness across market conditions:** only synthetic regimes are available.
* **Multi-year OOS performance:** blocked by PERF-001 (quadratic runtime) and by the absence
  of a large historical dataset.

## Classification
**Negative evidence** on every reproducible dataset in the current code. Earlier documents in
the repository that report positive seeds (e.g. "5 of 5 seeds net profitable") were produced
by different configurations and are **not** independent out-of-sample evidence for this
codebase; they must not be quoted as a profitability result. The Phase-5 sample of N=15 trades
with a 95% expectancy interval spanning roughly −₹102 to +₹205 is, by its own construction,
statistically inconclusive.

## Honest conclusion
There is **no credible profitability evidence**. The strategies are implemented correctly and
fail closed; they are simply not shown to make money after costs. This is not a defect to be
"fixed" by tuning — it is a research finding that requires a large, representative,
independent out-of-sample dataset (unavailable offline).

## Verification status
**FAIL** — PROFITABILITY EVIDENCE AVAILABLE is not awarded. The requirement "adequate
independent out-of-sample evidence" is unmet.
