# Statistical Robustness Report (Gate 5)

**Date:** 2026-11-17 · **Baseline commit:** `d095fc0754edd40ca369a127ce140a7d22e0e680`
**Reproduce:** `npm run test:stats` → `data/provenance/statistical_robustness.json`

**Verdict: `NEGATIVE_RESULT_ROBUST_TO_CLUSTERING`.** All 27 arm-periods are negative under all three
interval methods. The originally reported trade-level bootstrap turns out to be *adequately* calibrated
here (design effect 0.88–1.07), for a reason that is itself the main finding: per-trade costs dominate
P&L variance, so clustering trades by session adds almost no dependence.

## Method

| Method | What it respects | Role |
|---|---|---|
| Trade bootstrap (10,000 reps) | independence of trades | the method used in the original study |
| **Session-cluster bootstrap** (10,000) | same-session clustering, shared regime | **primary interval** |
| Moving-block bootstrap (block = 5 trades) | serial dependence | robustness |
| Realised equity curve | ordering, drawdown | sequencing risk |

Design effect = SE(session-cluster) / SE(trade). Values near 1.0 mean the original intervals were not
materially overstated. Lag-1 autocorrelation of trade P&L is reported for every arm; all values lie
within ±0.15, i.e. no meaningful serial dependence.

## OOS 2024 (confirmatory) — nine evaluable arms

P&L per trade is **after** the harness cost model, whose rates are UNVERIFIED (see Cost report).

| Arm | Trades | Sessions | Gross/trade | Net/trade | 95% CI trade | 95% CI cluster | 95% CI block | DE | Lag-1 | Exposure | Max DD |
|---|---|---|---|---|---|---|---|---|---|---|---|
| x_macd_momentum | 835 | 247 | +26.58 | −162.92 | [−185.52, −139.67] | [−184.10, −140.41] | [−183.94, −139.74] | 1.00 | +0.009 | 0.91 | 136,036 |
| x_ichimoku_cloud | 480 | 245 | +5.76 | −183.31 | [−220.53, −146.09] | [−217.89, −148.70] | [−217.14, −147.53] | 0.97 | +0.002 | 0.77 | 87,987 |
| x_keltner_channel | 362 | 216 | +28.19 | −160.22 | [−205.57, −114.72] | [−199.91, −120.23] | [−199.40, −117.76] | 0.95 | +0.007 | 0.59 | 58,001 |
| x_choppiness_index | 239 | 167 | +54.31 | −134.56 | [−192.16, −77.06] | [−184.99, −84.74] | [−177.58, −86.59] | 0.88 | +0.024 | 0.40 | 32,308 |
| x_parabolic_sar | 866 | 247 | +28.48 | −160.57 | [−182.63, −137.56] | [−181.51, −139.28] | [−182.37, −137.92] | 1.00 | +0.062 | 0.91 | 139,090 |
| x_fibonacci_retracement | 390 | 162 | +33.74 | −153.90 | [−186.03, −121.46] | [−188.08, −119.56] | [−184.86, −125.27] | 1.02 | −0.087 | 0.36 | 60,352 |
| x_volume_profile | 497 | 238 | −45.49 | −234.81 | [−270.23, −199.27] | [−271.84, −196.02] | [−271.34, −201.58] | 1.07 | +0.086 | 0.82 | 117,317 |
| x_donchian_trend_50 | 216 | 160 | +53.28 | −134.85 | [−191.80, −77.82] | [−182.44, −86.09] | [−175.98, −84.66] | 0.93 | −0.147 | 0.36 | 29,128 |
| x_mtf_trend_confirmation | 697 | 245 | +29.85 | −158.05 | [−185.86, −129.82] | [−183.61, −130.61] | [−183.19, −132.20] | 0.95 | +0.055 | 0.91 | 110,159 |

`x_obv_confirmation` is not evaluable (0 trades — the index carries no volume). Exposure is the share
of in-session minutes with a position open; overnight carry is excluded from it and reported separately
(1,698 of 4,582 OOS trades, 37.1% — see `METHOD-001`).

## Pooled portfolio (nine arms summed per session)

| Period | Role | Sessions | Net | Mean/session | 95% CI (session cluster) | Max DD |
|---|---|---|---|---|---|---|
| 2022 TRAIN | exploratory | 245 | −₹760,212.07 | −₹3,102.91 | [−3,532.63, −2,679.09] | 760,212.07 |
| 2023 VALIDATION | exploratory | 244 | −₹776,511.84 | −₹3,182.43 | [−3,468.94, −2,887.12] | 776,511.84 |
| 2024 OOS | **confirmatory** | 247 | −₹769,246.59 | −₹3,114.36 | [−3,489.87, −2,741.01] | 769,246.59 |

For every period the maximum drawdown **equals** the total loss, which means the cumulative P&L curve
never rises above its starting point: these portfolios lose steadily from the first session. There is
no equity peak to draw down from, and therefore no "early strength then decay" story — the result is
uniformly and immediately negative.

## Exploratory vs confirmatory

- **Exploratory:** 2022 (TRAIN) and 2023 (VALIDATION). Used to observe; no parameter was chosen on
  them (M7 confirms the protocol has no grid).
- **Confirmatory:** 2024 (OOS), untouched by any fitting decision and pre-committed by
  `RESEARCH_PROTOCOL.md`.
- **Result:** the confirmatory period reproduces the exploratory sign and magnitude (mean
  −₹3,114/session vs −₹3,103 and −₹3,182). Consistency across three independent years is the strongest
  form of evidence available here — evidence *against* the strategies, since all three are negative.

## Cross-validation against the published study

| Check | Published | Recomputed here | Agreement |
|---|---|---|---|
| OOS net, 9 arms | — | −₹769,246.59 | — |
| OOS net, 8 arms (excl. volume_profile) | −₹652,544.47 | −769,246.61 − (−116,702.14) = **−₹652,544.47** | ✅ exact |
| OOS mean net/trade, 8 arms | −₹159.75 | −652,544.47 / 4,085 = **−₹159.74** | ✅ |

## Statistical vs economic significance — the honest reading

The intervals are narrow enough that "negative" is statistically unambiguous. But the *cause* is not a
bad signal: gross P&L per trade is **positive in 8 of 9 arms** (+₹5.76 to +₹54.31). The arms lose
because modelled costs are −₹188 to −₹290 per trade. So the statistically robust statement is:

> These strategies have a small positive gross edge that is roughly an order of magnitude too small
> to survive round-trip costs, and that shortfall is stable across three years and all interval
> methods.

This is *not* a validation of the strategies, and it is not a demonstration that costs are the only
obstacle: gross edge of ₹26–54 per trade on a ₹1L sleeve (2.6–5.4 bps) is within the noise of the data
authenticity limits, and the instrument mismatch (index data, equity cost schedule) means even the
gross sign is not transferable to the intended instrument.

## Limits

1. Intervals quantify sampling uncertainty **of this dataset**, which is unauthenticated. They say
   nothing about vendor error.
2. Costs are a deterministic function of price and quantity, so they inflate the mean but barely widen
   the interval — the narrow CIs are partly an artefact of a deterministic cost term, not of a precise
   estimate of market edge.
3. Session clustering assumes sessions are the dependence unit. Overlapping overnight carries (37% of
   trades) couple adjacent sessions, which the cluster bootstrap does not model.
4. Nine arms are tested on the same data without a multiplicity correction. Since every arm is
   negative, multiplicity cannot create a false positive here; it would only matter if one arm had
   come out positive (none did).
