# Backtesting Audit

## Inspected
`src/lib/backtest_engine.ts` (`runBacktest`, `runWalkForward`, `BacktestControls`),
`src/lib/historical_research.ts`, `src/lib/leakage_audit.ts`, `src/lib/data_sanitizer.ts`,
`src/lib/csv_ingestion.ts`, fixtures, and the walk-forward output controls.

## Verified behaviours
| Area | Result |
|---|---|
| Historical data loading + validation | PASS |
| Market sessions / trading holidays | PASS |
| Entry/exit execution, brackets | PASS |
| EOD square-off (with research-mode control) | PASS |
| Gap-aware fills (gap through stop → fill at open, not stop price) | PASS (BT-002 regression) |
| Slippage on both legs | PASS |
| Brokerage and statutory charges per trade | PASS |
| Partial fills | PASS |
| Stop-loss / take-profit / breakeven | PASS |
| Position sizing and exposure caps | PASS |
| Drawdown (absolute and %) | PASS |
| Trade accounting (gross / charges / net / R-multiple) | PASS |
| Walk-forward: chronological folds, OOS window, reproducibility | PASS |
| Look-ahead prevention | PASS (see proof below) |
| Reproducibility (same input → same output, repeated runs) | PASS |

## Evidence — BT-003
* Fixture `walkforward_seed42_1m.csv` (375 bars, SHA `5a9f4aaf…82973`):
  **74 trades**, **0 cross-day trades**, 1 `EOD_EXIT`, **net −₹7,576.06**
  (research mode: 72 trades, 1 EOD exit, −₹7,177.69).
* `runWalkForward(375, 375)`: **2 folds**, **30 out-of-sample trades**,
  **OOS net −₹4,023.54**, `decisionsUseOnlyPastBars: true`,
  `lookAheadGuard` description present, run reproducible.
* Multi-day fixture with controls on: **3 trades**, **net −₹602.96**, charges ₹474.59, all
  exits `STOP_LOSS`; zero-friction control −₹128.37; high-cost Angel control −₹709.16.
  Research mode identical (−₹602.96) because stop-losses close intraday, so EOD never binds.

## Look-ahead proof (this phase, P4)
A 700-bar backtest and the same data truncated at bar 450 produce **byte-identical** trades
for every entry at or before bar 450; indicator values at bar 299 are unchanged when later
bars are appended. No future data influences past signals, and no optimisation against the
final OOS window was performed.

## Performance caveat (PERF-001)
Runtime is super-linear: 500 bars ≈ 63 ms, 1,000 ≈ 58 ms, 2,000 ≈ 355 ms, 4,000 ≈ 1,011 ms,
8,000 ≈ 2,869 ms (≈ 342 µs/bar at 8k). A 200,000-bar run did not finish inside a 10-minute
cap. Cause: per-bar `evaluateConsensus(candles.slice(0, i))` recomputes all indicators over
the full prefix. Documented, not rewritten (would risk changing indicator values).

## Remaining risks
The engine is *mechanically* trustworthy but has only been exercised on synthetic fixtures of
375–8,000 bars. No representative historical dataset → no defensible performance claim.

## Verification status
**PASS** — BACKTEST VERIFIED (mechanism, integrity, chronology, reproducibility).
Profitability is a separate question and is **negative** (see `PROFITABILITY_RESEARCH.md`).
