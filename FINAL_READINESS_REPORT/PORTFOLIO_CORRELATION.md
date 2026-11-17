# CORR-001 — Portfolio Correlation & Diversification Study

**Status: MEASURED (PRELIMINARY sample) · DIVERSIFICATION CLAIM: NOT SUPPORTED**
**Verification date:** 2026-11-17

---

## 1. Why the previous study was not usable

The earlier correlation study covered **~12 sessions**. A correlation coefficient estimated on 12
overlapping observations is not an estimate of anything stable — and the previous report was right to
label it `INSUFFICIENT_SAMPLE_DO_NOT_ACT_ON`, but that left CORR-001 without a measurement.

## 2. Rejected shortcut (recorded so it is not retried)

Generating 30 sessions of full-prefix evaluation is expensive (prefix → O(n²)). Computing signals on a
rolling 600-bar window instead was measured first:

```
window=300: signal agreement 1424/1430 = 99.58%
window=600: signal agreement 1425/1430 = 99.65%
window=900: signal agreement 1424/1430 = 99.58%
```

**~99.6% is not exact**, and a study whose inputs differ from the engine's is not evidence. The
shortcut was rejected; the study runs **full prefixes** (≈90 s of compute).

## 3. Method

- **30 sessions × 375 bars per regime**, 3 regimes (TRENDING / CHOPPY / VOLATILE) = **90 sessions**,
  11,250 bars per regime. Sessions are **genuine NSE trading days**: weekends and declared exchange
  holidays are skipped via `nse_calendar`, so the tape contains no Saturday/Sunday/Republic-Day bars.
  (Skipping calendar days shifts timestamps only; the seeded price process is unchanged, which is why
  the P&L figures below are identical to the pre-calendar-fix run.)
- **10 experimental strategies**, one shared harness: `src/lib/experimental_harness.ts` — now the
  single source of truth used by *both* `experimental_research.js` and this study. The refactor was
  regression-checked: `experimental_research_output.json` is **byte-identical** (modulo timestamps)
  to the pre-refactor output.
- Reliability classes fixed in advance: `<30` INSUFFICIENT_SAMPLE · `30–59` PRELIMINARY ·
  `≥60` RELIABLE · zero-variance/undefined → UNVERIFIED.
- Reported: per-regime Pearson (**primary**, Fisher z-averaged), pooled Pearson (**descriptive only** —
  concatenating three regimes mixes between-regime level shifts into a within-regime statistic),
  30-session rolling, **drawdown correlation**, **exposure overlap**, concentration, portfolio
  volatility, combined max drawdown, turnover, cost contribution.

## 4. Results

**Reliability: `PRELIMINARY`** (30 sessions/regime) — by the project's own rule this is not yet a
stable estimate.

| Strategy | Net (₹) | Trades | Charges (₹) |
|---|---:|---:|---:|
| x_parabolic_sar | −10,54,731.14 | 5,022 | 10,35,055.19 |
| x_macd_momentum | −7,45,780.82 | 3,487 | 7,18,610.52 |
| x_obv_confirmation | −6,83,780.99 | 3,272 | 6,74,421.43 |
| x_mtf_trend_confirmation | −6,39,467.96 | 3,157 | 6,50,647.41 |
| x_fibonacci_retracement | −5,09,554.81 | 2,614 | 5,38,772.14 |
| x_volume_profile | −3,93,085.24 | 1,669 | 3,43,973.11 |
| x_ichimoku_cloud | −2,87,422.56 | 1,477 | 3,04,407.03 |
| x_keltner_channel | −1,13,018.17 | 519 | 1,06,926.87 |
| x_donchian_trend_50 | −77,250.31 | 329 | 67,776.81 |
| x_choppiness_index | −41,767.14 | 182 | 37,483.73 |

**10 / 10 net negative.** Correlation: 45/45 pairs defined, **mean |r| = 0.299** pooled and
**0.288 Fisher z-averaged within regimes** (the primary figure),
**2 pairs ≥ 0.7** (keltner–donchian 0.796, choppiness–donchian 0.730).
**Mean exposure overlap = 0.718** — the strategies are in the market on ~72% of the same days, so
"10 strategies" is largely one exposure repeated.

Equal-weight portfolio, pooled across regimes:

| Metric | Value |
|---|---:|
| Sessions | 90 |
| Net | −4,54,585.91 |
| Max drawdown | 4,54,585.91 |
| Daily volatility | 1,555.69 |
| Recovery factor | −1.0 |
| Positive days | **0 / 90** |
| Worst day | −10,709.39 |
| Annualised volatility | **N/A** (three separate tapes; not a continuous 90-day record) |
| Turnover proxy | 4.546 |
| Total charges | 44,78,074.24 |
| **Charges ÷ |net|** | **9.85×** |

By regime: TRENDING −1,33,834.71 · CHOPPY −1,31,963.13 · VOLATILE −1,88,788.07.

Concentration: parabolic SAR 23.2%, MACD momentum 16.4%, OBV 15.0%, MTF 14.1% of gross absolute P&L.

## 5. Interpretation (what the numbers do and do not say)

1. **Diversification cannot rescue this book.** Low-to-moderate correlation (mean |r| 0.299) is present,
   but a portfolio of zero-expectancy strategies stays zero-expectancy minus costs. Diversification
   reduces variance, it does not create edge. **No diversification benefit is claimed.**
2. **The loss is cost drag, not signal error.** Charges are ~9.85× net loss; for MACD momentum,
   charges (₹7.19 L) exceed the net loss (₹7.46 L) — gross P&L is close to flat. Trading ~116
   round-trips per session on a ₹1 L sleeve cannot pay ₹40-ish per round trip.
3. **Overlap 0.718 destroys the "portfolio" premise.** Combining strategies that are simultaneously
   exposed on 7 of 10 days is not diversification; it is the same market bet sized 10× larger.
4. **90/90 negative days** is a structural consequence of deterministic cost drag, not a market claim.

## 6. Verdict

- CORR-001: **MEASURED, PRELIMINARY, NOT SUPPORTED** for any diversification/allocation claim.
- `promotionCandidates: NONE`. Execution policy unchanged (this study is research-only).
- To reach `RELIABLE`, the study needs ≥60 sessions per regime **of real data** — which is blocked by
  DATA-001's real-data gap, not by code.

## 7. Evidence & files

- `scripts/portfolio_correlation.js`, output `scripts/portfolio_correlation_output.json`
- `src/lib/experimental_harness.ts` (harness + `reliabilityLabel`, `pearson`, `rollingCorrelation`,
  `drawdownSeries`, `portfolioStats`, `exposureOverlap`)
- `scripts/portfolio_stats_tests.js` → **26 PASS / 0 FAIL** (known-answer tests incl. r=±1, r=0,
  flat-series null, drawdown series, recovery factor, overlap)
- `npm run test:portfolio` reproduces the study; `npm run test:portfolio-stats` runs the unit tests.

**Note on test rigour:** the first run of the unit tests produced 5 failures. On inspection all five
were incorrect *expectations* in my test (e.g. `DD([100,−50,30,−10]) = 50`, not 60; overlap = 1/2, not
1/3), each re-derived by hand. The library code was not changed to make tests pass.
