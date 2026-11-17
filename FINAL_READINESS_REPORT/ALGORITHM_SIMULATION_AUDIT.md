# Algorithm Simulation Audit (supersedes `ALGORITHM_BOT_AUDIT.md`)

`ALGORITHM_BOT_AUDIT.md` is retained for history; this file is the current authoritative audit
for the automated paper workflow.

## Workflow verified (15 stages, per the current brief)

| # | Stage | Verification | Result |
|---|---|---|---|
| 1 | User enters simulation capital | 9-tier matrix; `normaliseRisk` clamps and forces PAPER | PASS |
| 2 | Strategy selection | plugin loader + validation; experimental strategies excluded by design | PASS |
| 3 | Input validation | invalid riskPct/conf rejected or clamped | PASS |
| 4 | Market data validation | sanitizer, staleness, thin-data guard | PASS |
| 5 | Regime detection | 5 scenarios, no throw, finite outputs | PASS |
| 6 | Indicators computed | warm-up contract: NaN only in first `period-1` bars, none after | PASS |
| 7 | Signals generated | 7 core voters + 3 plugins, per-voter semantics | PASS |
| 8 | Consensus | majority + suppressed set excluded from denominator | PASS |
| 9 | Quorum | ≥ 75% quorum and ≥ 65 GBM gate, both unmodified | PASS |
| 10 | Risk approval | sizing, exposure, drawdown, hurdle, kill switch | PASS |
| 11 | Paper order simulation | paper route only | PASS |
| 12 | Fees & slippage | statutory per-leg model, both legs | PASS |
| 13 | Position/cash update | ₹1,00,000 → ₹85,060.96 after a 5×₹2,980 buy | PASS |
| 14 | P&L reconciliation | realised/unrealised reported separately | PASS |
| 15 | Logs/dashboard | structured logs + persisted fills | PASS |

Integrated end-to-end: `test_twelve_stage_paper_workflow_end_to_end` — PASS.

## Control paths

Start PASS · Stop PASS · **Pause PASS (PAUSE-001 fixed: a paused engine now rejects new
orders while emergency square-off still works)** · Resume PASS · Restart PASS (state
preserved) · Duplicate-start PASS (second `start()` returns `False`) · No-signal PASS
(`qualifies:false`, no order) · Insufficient capital PASS (rejected, no overdraft) · Invalid
data PASS (warm-up guard → 0 trades) · API/broker failure PASS (failure-injection suite) ·
Recovery PASS.

## Paper-only proof

`TradingEngine.__init__` hard-codes `is_paper_trading = True`; the live branch only calls a
broker declaring `IS_TEST_FIXTURE`, otherwise it hits the interlock and returns `False` before
any adapter call (`test_live_interlock_rejects_non_fixture_broker` PASS). TypeScript mirrors
this with `LIVE_BROKER_EXECUTION_DISABLED = true` plus a `normaliseRisk` guard that rejects any
LIVE attempt from API, config or environment.

## Performance impact of PERF-001

Decision evaluation is now O(n) (`consensus_fast.ts`), proven equivalent bar-for-bar. The
simulation path itself is unchanged; only the backtest decision loop was optimized.

## Remaining risks

Signal quality is unproven (net negative on every reproducible dataset). Automation is
*mechanically* ready; it is not *commercially* validated. No live-trading capability exists.
