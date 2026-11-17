# OMNITRADEPRO PERFORMANCE & RELIABILITY REPORT (CONSOLIDATED)

Detailed evidence: `OMNITRADEPRO_14_PERFORMANCE_AND_RELIABILITY.md`.

## Verdict: PASSED (Gate 14)

## Measured (this workspace, 2026-11-17)
| Workload | Result |
|----------|--------|
| Full JS test suite (151 tests) | 2.5 s |
| Independent math harness (40 tests) | 0.14 s |
| Python suite (363 tests) | 0.7 s |
| Full typecheck | 6.3 s |
| Next build (22 routes) | ~16 s |
| Backtest | ≈0.3 ms/bar (750 bars × 3 modes in 0.6 s) |
| CSV ingestion + full quality audit (750 rows) | <0.9 s |
| Consensus evaluation (indicators + 5 voters + GBM, 200 candles) | sub-ms |

## Reliability mechanisms (verified)
Claim-based order/position state machine (no double-close races) · per-symbol tick locks · daily wipe bounds table growth · restart reconciliation (PAPER→OPEN, LIVE→alert) · failure-injection suites (phase 67/68) PASS · WS crash-protection (no blind SLs on stale data) · migrations + rollback SQL · plugin cache dedupe · capped candle buffers (260 bars/symbol).

## Limits (documented, low urgency)
Single-process state maps (not multi-instance safe) · no 100k-bar soaks (no such dataset) · `getState()` does bracket/circuit work per poll · Sharpe-style stats invalid (BT-004) wherever shown.
