# OMNITRADEPRO_14 — PERFORMANCE AND RELIABILITY

**Verdict: PARTIALLY PASSED** — structural reliability mechanisms verified; load/soak measurements limited to what this sandbox can execute honestly.

## 1. Performance measurements (executed, this environment)

| Test | Measurement | Result |
|------|-------------|--------|
| Full JS suite (151 tests incl. NSE calendar matrix) | wall time | **2.5 s** |
| Independent math harness (40 tests, 400-bar walks) | wall time | **0.14 s** |
| Python suite (363 tests) | wall time | **0.7 s** |
| `tsc --noEmit` on full src | wall time | **6.3 s** |
| `next build` (22 routes) | wall time | **~16 s** |
| CSV ingestion (750 rows, full audit) | wall time | **<0.9 s** |
| Backtest 750 bars × 3 friction modes | wall time | **0.6 s** (≈0.3 ms/bar) |
| Consensus evaluation (5 voters + GBM + indicators on 200 candles) | per call | sub-ms (inferred from 715-slice scan in <0.5 s) |

Memory: Node test processes stayed within sandbox defaults; no leaks observed in repeated suite runs (candle buffers capped at 260 bars/symbol in `angelWs`; plugin cache TTL 10s; global maps cleaned on close — verified `__omniInitialSlDist`/`__omniSlSince` delete paths).

## 2. Large datasets
- Ingestion handles 750-row multiday fixtures with full quality audit (hashing, session checks) in <1s; engine slices are bounded (`snapshot(count≤200)`), so memory is O(symbols·260) not O(dataset). Backtest is O(n·window) — fine to tens of thousands of bars at measured speed. **100k+ bar soaks not executed** (no such dataset in repo) — documented gap.

## 3. Reliability mechanisms verified

| Scenario | Mechanism | Evidence |
|----------|-----------|----------|
| Concurrent strategy calcs | pure functions; single-threaded event loop; plugin inflight dedupe | code + suite |
| Long-running simulation | daily wipe keeps tables bounded (`enforceDailyReset` archives stale rows) | suite `test_daily_reset_*` |
| Duplicate events | claim-based UPDATE (`WHERE status='OPEN'`), dedupe symbol sets, tick locks (`__omniTickLocks`) | code + reconciliation suites |
| Delayed/out-of-order events | candle aggregation keyed by minute bucket; late ticks update the correct bar (`lastBar.t === minuteTs` branch) | code |
| Missing candles | quality report counts intrasession gaps; engine does not fabricate bars (`data_sanitizer` never silently repairs) | suite §22 |
| WS disconnection | crash-protection lock, RECONNECTING states, warmup on reconnect, `NO_LIVE_FEED` order rejects | code + suite |
| Restart recovery | `reconcileClosingPositions` (PAPER→OPEN, LIVE→alert), daily reset, `initialSlDistance` persisted (Phase 6.7) | pytest `test_phase67_restart_recovery` PASS |
| Database failure | claim/returning pattern prevents double-close races; migration files + rollback SQL present (`drizzle/0001_*`) | `test_phase68_*` PASS |
| Application crashes | crash-protection + circuit lockout persist via settings; order states reconcile on boot | phase67/68 suites |
| State reconciliation | `reconcileClosingPositions` + EOD square-off (`eod` route + `core/eod_squareoff.py`) | suites |

## 4. Order-state consistency
Verified invariant chain: OPEN → FILLING → FILLED / REJECTED_* / CANCELLED; positions OPEN → CLOSING → CLOSED, each transition via conditional UPDATE claims. Failure-injection suites (`test_phase68_order_reconciliation_failure_injection`, `test_phase67_*`) PASS. Restart test preserves simulated order states correctly (live-legacy rows untouched).

## 5. Findings / limits
- Single-process Node state (global maps) is not multi-instance safe — acceptable for desktop; document before any scaling.
- `getState()` runs bracket/circuit checks synchronously on every poll — fine at desktop scale; watch under many positions.
- Python engine threading model (QThread/ThreadPoolExecutor) tested at unit level only; no multi-hour soak executed.
- BT-004-style stat warnings apply to any performance readouts.

## 6. Verdict
Reliability engineering is **above-average for this class of project** (claim-based transitions, reconciliation, failure-injection tests). Remaining: large-dataset soaks and multi-instance analysis (documented, low urgency for the desktop target).
