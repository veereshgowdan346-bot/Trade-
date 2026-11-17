# Performance & Reliability Audit

> **SUPERSEDED (PERF-001):** the O(n²) finding below was RESOLVED in a later session.
> `src/lib/consensus_fast.ts` evaluates the decision layer in O(n) with exact bar-for-bar
> equivalence (0 divergences); 8,000 bars 3,568 ms → 36 ms, 200,000 bars ≈ 944 ms (re-measured 2026-11-17 on the same host: 8,000 bars 2,697 → 31 ms, 86.4×; 200,000 bars 879 ms — see `PERFORMANCE_BENCHMARKS.md`).
> Current numbers and methodology: **`PERFORMANCE_BENCHMARKS.md`**. The determinism,
> concurrency, memory and restart-recovery results below still stand.


## Inspected
`src/lib/backtest_engine.ts` (per-bar decision loop), `runWalkForward`, indicator
implementations, paper-session concurrency, API handlers, logging volume, restart recovery.

## Scaling measurement (this phase, `final_readiness_probes_output.json`)
Instrument SBIN-EQ, standard friction, 20% exposure cap.

| Bars | Trades | Net P&L | Wall time | µs/bar | RSS delta |
|---|---|---|---|---|---|
| 500 | 4 | −₹348.17 | 63 ms | 125 | 6 MB |
| 1,000 | 4 | −₹348.17 | 58 ms | 58 | 4 MB |
| 2,000 | 7 | −₹734.35 | 355 ms | 178 | 10 MB |
| 4,000 | 12 | −₹817.53 | 816 ms | 204 | 17 MB |
| 8,000 | 29 | −₹1,645.07 | 2,869 ms | 342 | 2 MB |

A 200,000-bar run did not complete within a 600-second cap.

## Bottleneck identified — PERF-001 (MEDIUM, OPEN)
`runBacktest` evaluates the decision at every bar as
`evaluateConsensus(candles.slice(0, i), cfg)`; each call re-slices the prefix **and**
recomputes every indicator (EMA, RSI, ATR, VWAP, Bollinger, superTrend, ADX, regime,
probability) over that whole prefix. Cost is therefore **O(n²)** in bars and allocation is
O(n²) as well.

**Why it was not "fixed":** making this incremental requires caching recursive indicator state
across bars. Any error there would silently change signal values — an unauthorised
modification of the financial model, and a much larger blast radius than the defect itself.
Per the correction policy this is a Category-B (architecture) change and needs explicit
authorisation. It is reported, measured, and left intact.

**Practical mitigation available today:** keep audited datasets within the tested range
(≤ 8,000 bars completes in ≈ 3 s). Multi-year 1-minute studies are not tractable.

## Reliability results
| Check | Result |
|---|---|
| Repeated simulations (same input) | PASS — identical output every run |
| Concurrent/interleaved backtests (4 datasets) | PASS — `P6_concurrent_determinism`, results identical to sequential |
| Memory over the sweep | PASS — RSS delta ≤ 17 MB, no unbounded growth observed |
| CPU | Single-threaded, CPU-bound as expected for a Node batch job |
| Long-running paper sessions | PASS — pause/resume/stop do not leak loops (duplicate-start refused) |
| Restart recovery | PASS — fills/positions/session state survive a rebuild |
| Logging volume | Bounded; structured logs, no per-tick flood in the paper path |
| Error recovery | PASS — ERROR state with counters; failure-injection suite green |

## Not fixed (deliberate)
No caching layer, no worker threads, no streaming rewrite. The mandate forbids unnecessary
architectural rewrites, and each of those would alter runtime semantics without fixing the
underlying quadratic decision model.

## Remaining risks
Backtest runtime grows quadratically, so realistic multi-year studies are blocked. This
directly limits the profitability research (`PROFITABILITY_RESEARCH.md`).

## Verification status
**FAIL** for the large-dataset performance requirement (measured super-linear scaling).
**PASS** for determinism, concurrency, memory stability, restart recovery and error handling.
