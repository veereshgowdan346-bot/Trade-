# Experimental Strategy Registry

**Status: PASS for isolation/integrity; NEGATIVE for profitability evidence.**

## What was built

`src/lib/experimental_strategies.ts` — a research registry of **10 strategies**, each with
unique ID, version, description, hypothesis, required data, indicators, entry/exit semantics,
risk assumptions, cost assumptions, supported regimes, limitations, configuration schema,
research status and `enabled: false` (structurally locked).

| ID | Family | Implementation | Status |
|---|---|---|---|
| `x_macd_momentum` | MOMENTUM | MACD 12/26/9 histogram | EXPLORATORY |
| `x_ichimoku_cloud` | TREND_FOLLOWING | Tenkan/Kijun/Senkou B | EXPLORATORY |
| `x_keltner_channel` | VOLATILITY_REGIME | EMA20 ± 1.5×ATR | EXPLORATORY |
| `x_choppiness_index` | REGIME_CONDITIONED | Choppiness filter (veto only) | EXPLORATORY |
| `x_obv_confirmation` | VOLUME_CONFIRMATION | OBV vs OBV EMA | EXPLORATORY |
| `x_parabolic_sar` | TREND_FOLLOWING | SAR 0.02/0.2 | EXPLORATORY |
| `x_fibonacci_retracement` | MEAN_REVERSION | 38.2–61.8% pullback | EXPLORATORY |
| `x_volume_profile` | MOMENTUM | POC / 70% value area | EXPLORATORY |
| `x_donchian_trend_50` | BREAKOUT | 50-bar channel | EXPLORATORY |
| `x_mtf_trend_confirmation` | MULTI_TIMEFRAME | dual-horizon EMA | EXPLORATORY |

They build on the ten pre-existing research implementations in `strategies_extended.ts`
(adds metadata, validation and an isolated runner — no new signal logic was invented, and
nothing was wired into the quorum).

## Isolation guarantees (tested, 11/11 PASS)

`scripts/experimental_registry_tests.js`:
* registry validates; exactly 10 strategies; **every one disabled**;
* `validateRegistry()` **throws** if a strategy is enabled, if IDs duplicate, or if required
  metadata is missing;
* unknown IDs rejected;
* `runExperimental` executes all 10 on synthetic data and each reports `enabled: false` and a
  valid signal/confidence;
* **source-level assertion that `strategies.ts`, `engine.ts`, `backtest_engine.ts` and `risk.ts`
  do not import the experimental module** — the production decision path is untouched;
* the 7 core quorum voters are still present.

## Research evaluation (`scripts/experimental_research.js`)

Harness (identical for every strategy, no per-strategy tuning, no parameter search):
signal from `candles.slice(0,i)`, fill at `c[i].c`, exit on opposite signal / 2×ATR stop /
3×ATR target / day boundary, ₹1,00,000 notional sleeve, statutory round-trip costs (Shoonya) +
slippage, no leverage. 4,500 bars per regime (12 sessions) × 3 regimes.

Aggregate net across the three regimes:

| Strategy | Trades | Net P&L | Regimes positive |
|---|---|---|---|
| x_parabolic_sar | 1,865 | **+74,451.82** | 1 / 3 |
| x_donchian_trend_50 | 221 | −5,530.91 | 1 / 3 |
| x_obv_confirmation | 1,217 | −87,371.42 | 1 / 3 |
| x_macd_momentum | 1,507 | −122,793.35 | 1 / 3 |
| x_choppiness_index | 168 | −122,257.07 | 1 / 3 |
| x_mtf_trend_confirmation | 973 | −147,815.31 | 1 / 3 |
| x_fibonacci_retracement | 661 | −171,349.62 | 1 / 3 |
| x_ichimoku_cloud | 700 | −244,871.91 | 1 / 3 |
| x_keltner_channel | 530 | −248,966.22 | 1 / 3 |
| x_volume_profile | 1,139 | **−483,977.00** | 0 / 3 |

## Promotion decision

**No strategy is promoted.** Nine of ten are net negative across the tested regimes. The single
positive aggregate (`x_parabolic_sar`, +₹74,451.82 over 1,865 trades) is positive in **only one
of three** regimes, which is the classic signature of a regime-specific artefact rather than an
edge — and it has no independent holdout evidence. Per the brief, an in-sample positive result
is explicitly not sufficient for inclusion, and there is no code path to enable one without
authorisation.

## Remaining risks / limitations

* Synthetic datasets only; no representative historical tape.
* One fixed parameter set each — deliberately not tuned (tuning would overfit the evaluation).
* Costs use UNVERIFIED statutory rates, so absolute figures are provisional.
* Volume-based strategies (`x_obv_confirmation`, `x_volume_profile`) are fragile on synthetic
  volume series; their negative results are partly a data artefact and are labelled as such.
