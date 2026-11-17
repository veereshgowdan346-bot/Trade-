# Paper Trading Audit

## Inspected
`simulation/paper_trading.py` (PaperTrading, PaperTradingConfig, FilledOrder, Position),
`core/engine.py` (start/stop/pause/resume, order routing, duplicate guard, interlock),
`src/lib/engine.ts` (TypeScript paper path), DB persistence/restart recovery.

## Lifecycle verification (12 new tests, all passing)
| Behaviour | Test | Result |
|---|---|---|
| Start | `test_start_then_duplicate_start_is_rejected` | PASS |
| Duplicate start (no second loop) | same | PASS — second `start()` returns False |
| Stop | `test_stop_halts_order_flow` | PASS — orders rejected after stop |
| Pause blocks NEW orders | `test_pause_blocks_new_orders_but_allows_emergency` | **PASS (was FAIL → PAUSE-001 fixed)** |
| Emergency square-off while paused | same | PASS — bypass preserved |
| Resume | `test_pause_blocks_new_orders_but_allows_emergency` | PASS |
| Resume without pause (no-op) | `test_resume_without_pause_is_a_noop` | PASS |
| Entry + simulated fill | `test_paper_fill_updates_cash_and_produces_pnl` | PASS |
| Fees + slippage applied | same | PASS |
| Insufficient cash rejected (no overdraft) | `test_insufficient_cash_is_rejected_not_overdrawn` | PASS |
| Duplicate-order window (2 s) | `test_duplicate_order_window_rejects_resubmission` | PASS |
| Restart recovery (state preserved) | `test_restart_recovery_preserves_paper_state` | PASS |
| Passive limit not auto-filled | `test_limit_buy_below_ask_does_not_fill` | PASS |
| Order rejection accounting | paper engine rejected-orders ledger | PASS |
| Audit trail / logs | filled-orders history + structured logs | PASS |

## Defects found and fixed
* **PAUSE-001 (HIGH):** a paused engine still accepted new orders, because `pause()` only
  changed `state` while `place_order()` gated on `_running`. Now a paused engine rejects new
  orders; emergency square-off still works.
* **PAPER-002 (HIGH):** `TradingEngine.start()` never started `PaperTrading`, so every paper
  order was rejected with "Paper trading not running"; `stop()` never stopped it either.
  Now the lifecycle is mirrored, and fills, cash movements, positions and P&L are observable.
  Observed accounting after a 5-share ₹2,980 buy: cash ₹100,000 → **₹85,060.96** (₹14,900
  notional + ≈₹39.04 costs) — internally consistent.

## Proof that no simulated order can reach a real broker
1. `TradingEngine.__init__` sets `is_paper_trading = True` unconditionally.
2. `place_order()` routes to `paper_trading` when that flag is set.
3. The live branch is guarded: only a broker declaring `IS_TEST_FIXTURE = True` is called;
   anything else hits the interlock  →
   `CRITICAL SAFETY INTERLOCK: Live broker execution is permanently disabled` and returns
   `False` **before** any adapter call. Regression test:
   `test_live_interlock_rejects_non_fixture_broker` (PASS).
4. TypeScript side: `LIVE_BROKER_EXECUTION_DISABLED = true` and `normaliseRisk` forces PAPER
   mode, rejecting any LIVE attempt via API/config/env.
5. No network egress or credential use occurs in any audited paper path.

## Remaining risks
The Python paper engine is not wired into the running Next.js application (the UI drives the
TypeScript engine + SQLite). This is documented in `ARCHITECTURE_AUDIT.md`; it is not a safety
risk, but it means the Python lifecycle is exercised by tests rather than by user clicks.

## Verification status
**PASS** — PAPER TRADING VERIFIED (isolated simulation).
