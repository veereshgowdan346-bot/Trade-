# Market Data & Indicator Audit

## Inspected
`src/lib/indicators.ts` (ema, trueRange, rma, atr, adx, bollinger, rsi, vwap, superTrend),
`src/lib/data_sanitizer.ts`, `src/lib/csv_ingestion.ts`, `src/lib/nse_calendar.ts`,
fixture CSVs under `data/fixtures/`, and the Python-side OHLCV handling.

## Data integrity checks
| Check | Result |
|---|---|
| OHLCV schema/type validation | PASS — invalid rows rejected, not silently coerced |
| Missing candles | PASS — gaps preserved, no synthetic fill inserted into the decision path |
| Duplicate candles | PASS — deduplicated by timestamp |
| Out-of-order / stale ticks | PASS — discarded with a warning (paper engine validates timestamps) |
| Timezone / IST handling | PASS — naive timestamps parse as IST regardless of host TZ (TZ-001 regression) |
| Timestamp ordering | PASS |
| Market session boundaries | PASS — CAS/segment session modelling with versioned effective dates |
| Trading holidays | PASS — NSE calendar with correction tests |
| Future-data leakage | PASS — causal proof (see below) |

## Indicator verification (warm-up contract, per index)
Measured on a 120-bar series (`scripts/final_readiness_probes_output.json`):

| Indicator | Warm-up NaN (expected `period−1`) | Non-finite after warm-up |
|---|---|---|
| RSI(14) | 13 | **0** |
| ATR(14) | 13 | **0** |
| EMA(21) | 0 (seeded) | **0** |
| Bollinger(20) | 19 × 4 arrays | **0** |
| VWAP | 0 | **0** |

Degenerate input: a zero-range series yields NaN in RSI (0/0) — a documented indicator
property, confined to warm-up, and it cannot reach a decision because the backtest refuses
series shorter than `warmup + 15` bars (verified: 10 bars → 0 trades, 0 P&L).

Division-by-zero / infinity: no unhandled path; invalid periods throw (`MATH-001` regression)
instead of looping silently to NaN.

## Look-ahead / repainting proof
* Structural: `runBacktest` decides at bar *i* using `candles.slice(0, i)` only
  (`backtest_engine.ts:109`), reported as `decisionsUseOnlyPastBars: true`.
* Dynamic (`P4`, this phase): a backtest over 700 bars and a backtest truncated at bar 450
  produce **byte-identical trades** for every entry at or before bar 450.
* Causality: indicator values at bar 299 are unchanged when bars 300–699 are appended
  (EMA/RSI/ATR identical to the last float).
* Repainting: superTrend/EMA/RSI are computed on closed candles with no forward reference —
  no repaint path found.

## Fixtures
* `data/fixtures/walkforward_seed42_1m.csv` (+ meta) — SHA-256 `5a9f4aaf…82973`, 375 bars,
  reproducible seed-42 synthetic 1-minute series. **Not regenerated** in this phase.
* `data/fixtures/multiday_overnight_1m.csv` — IST-string timestamps, multi-day.
  (The audit's matrix script parses these as `…+05:30`, which fixed an earlier probe crash —
  the fixture itself was correct.)

## Remaining risks
Fixtures are **synthetic and small** (375–700 bars). No large representative historical
dataset is available offline, which is the primary reason profitability cannot be established.

## Verification status
**PASS** for integrity, timezone/session handling, indicator warm-up and look-ahead
prevention. Historical representativeness: **UNVERIFIED**.
