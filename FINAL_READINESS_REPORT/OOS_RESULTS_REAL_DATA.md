# OUT-OF-SAMPLE RESULTS ON REAL DATA

**Status: PROFIT-001 REMAINS FAIL — but for a sharper, better-evidenced reason.**
**Date:** 2026-11-17 · Protocol: `RESEARCH_PROTOCOL.md` v1.0.0 · Output: `scripts/research_protocol_output.json`

---

## 1. Headline

On **real NIFTY 50 data** (redistributed, authenticity unverified), across three independent years and
**12,046 evaluated trades**, with default parameters and no tuning:

> **8 of 8 evaluable strategies are net negative in TRAIN, VALIDATION and OOS. 0 are `OOS_SUPPORTED`.
> 2 were `NOT_EVALUABLE` (they need volume; the index has none).**

| Period | Strategies | Total net (₹) | Positive | Negative |
|---|---:|---:|---:|---:|
| TRAIN (2022) | 8 | −6,68,940.81 | 0 | 8 |
| VALIDATION (2023) | 8 | −6,69,087.96 | 0 | 8 |
| **OOS (2024)** | 8 | **−6,52,544.47** | 0 | 8 |

Reproducibility is strong: all three years land within ~2.5% of each other. That consistency is the
interesting part — the loss is structural, not a bad year.

## 2. The finding that matters: gross is positive, costs are not

| OOS aggregate (4,085 trades) | Amount (₹) |
|---|---:|
| Gross P&L | **+1,18,280.20** |
| Statutory charges | −1,78,659.69 |
| Slippage (assumption) | −5,92,164.99 |
| **Net** | **−6,52,544.47** |

Per trade: gross **+₹28.95**, statutory **−₹43.74**, slippage **−₹144.96**, net **−₹159.75**.

**Even at zero slippage the book loses −₹60,379.49 in the OOS year.** The strategies' gross edge is
smaller than the *statutory* cost alone, so the negative result does not depend on the slippage
assumption — which is the single most contested input in the model.

Slippage sensitivity of OOS net:

| Slippage scale | 0× | 0.25× | 0.5× | 1× (assumed) | 1.5× |
|---|---:|---:|---:|---:|---:|
| TRAIN | −99,825.70 | −2,42,104.76 | −3,84,383.82 | −6,68,940.81 | −9,53,500.07 |
| VALIDATION | −72,993.26 | −2,22,017.31 | −3,71,041.36 | −6,69,087.96 | −9,67,137.56 |
| **OOS** | **−60,379.49** | −2,08,420.74 | −3,56,461.99 | −6,52,544.48 | −9,48,626.97 |

The sign never changes across the entire plausible range. That is a robust conclusion.

## 3. Per-strategy OOS detail (2024, 249 sessions)

| Strategy | Trades | Gross ₹ | Statutory ₹ | Slippage ₹ | Net ₹ | Net @0 slippage ₹ | PF | Win % | Max DD ₹ | Bootstrap 95% CI (mean net/trade) | Verdict |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---|
| x_macd_momentum | 835 | 22,197 | 36,640 | 1,21,593 | −1,36,036 | −14,443 | 0.321 | 27.43 | 1,36,036 | [−185.85, −139.79] | NOT_SUPPORTED |
| x_parabolic_sar | 866 | 24,665 | 37,930 | 1,25,786 | −1,39,050 | −13,265 | 0.319 | 27.71 | 1,39,050 | [-183.13, -137.87] | NOT_SUPPORTED |
| x_mtf_trend_confirmation | 697 | 20,804 | 30,383 | 1,00,581 | −1,10,159 | −9,579 | 0.366 | 31.99 | 1,10,159 | [-185.45, -129.73] | NOT_SUPPORTED |
| x_ichimoku_cloud | 480 | 2,764 | 21,024 | 69,727 | −87,987 | −18,260 | 0.359 | 35.42 | 87,987 | [-219.74, -145.43] | NOT_SUPPORTED |
| x_fibonacci_retracement | 390 | 13,157 | 16,983 | 56,197 | −60,023 | −3,826 | 0.299 | 30.77 | 60,352 | [-186.16, -121.31] | NOT_SUPPORTED |
| x_keltner_channel | 362 | 10,205 | 15,814 | 52,392 | −58,001 | −5,609 | 0.429 | 36.74 | 58,001 | [-204.03, -114.82] | NOT_SUPPORTED |
| x_choppiness_index | 239 | 12,979 | 10,461 | 34,678 | −32,160 | **+2,518** | 0.496 | 40.17 | 32,308 | [-191.43, -77.03] | NOT_SUPPORTED |
| x_donchian_trend_50 | 216 | 11,508 | 9,425 | 31,211 | −29,128 | **+2,083** | 0.475 | 39.81 | 29,128 | **[−191.09, −76.68]** | NOT_SUPPORTED |
| x_obv_confirmation | — | — | — | — | — | — | — | — | — | — | NOT_EVALUABLE (needs volume) |
| x_volume_profile | — | — | — | — | — | — | — | — | — | — | NOT_EVALUABLE (needs volume) |

Two strategies (choppiness, donchian) turn marginally positive at zero slippage (+₹2.5k and +₹2.1k over
a year). They are **not** promoted: the amounts are within noise, their confidence intervals are
negative at the assumed cost, and the rule in §7 of the protocol requires a positive CI lower bound. A
₹2,000/year edge on a ₹1,00,000 sleeve is also far below any sane threshold for a real deployment.

## 4. Uncertainty, stated honestly

- Bootstrap CIs (10,000 resamples) are **entirely below zero** for every strategy where they are
  computable at the assumed cost — the negative expectancy is statistically clear, not marginal.
- Example (MACD): mean net per trade −₹162.92 with CI [−185.85, −139.79], t = −13.75.
- The *magnitude* is far less certain than the *sign*, because 77% of the modelled cost is a slippage
  assumption. Hence the sensitivity table in §2.
- Three years is not enough for regime inference; no claim is made about trending vs choppy markets.

## 5. What this does and does not establish

**Established:** with default parameters, on real NIFTY 50 intraday data, across three independent
years, the current experimental strategy set does not clear even statutory transaction costs. This is
consistent with — and now better evidenced than — the synthetic results.

**Not established:** that no strategy *could* be profitable; that the index proxy generalises to
tradable equity; that the cost rates are correct; that the data is authentic. No profitability claim is
made anywhere, and **production behaviour is unchanged** (`enabled: false` for all 10 strategies).

## 6. Evidence

- `scripts/research_protocol_output.json` — every figure above, per strategy and per period, including CIs.
- `data/provenance/external_dataset_manifest.json` — dataset hashes/provenance for the inputs.
- Reproduce: `node scripts/research_protocol_oos.js` (~17 s, deterministic).