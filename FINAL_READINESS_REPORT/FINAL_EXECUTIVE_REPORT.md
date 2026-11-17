# OmniTradePro Apex V2.0 — Final Executive Report

**Audit type:** complete end-to-end audit, fix, test, retest, final regression
**Date:** 2026-11-17
**Branch:** `arena/16f5d371-trade` · **Base commit:** `1741aeb` · **HEAD at audit start:** `b9fff0e`
**Mode:** offline · simulation only · paper trading only · **live trading permanently disabled**

---

## 0. UPDATE — PERF-001 and experimental research (this session)

This report was the Phase-3 hand-off. It has been **superseded in two places** since:

| Item | Phase-3 status | Current status |
|---|---|---|
| PERF-001 (O(n²) backtest) | FAIL — documented, not fixed | **PASS — FIXED.** `src/lib/consensus_fast.ts` evaluates decisions in O(n); exact bar-for-bar equivalence proven (0 divergences); 8,000 bars 3,568 ms → 36 ms (98.5×); 200,000 bars 944 ms (re-measured 2026-11-17 on the same host: 8,000 bars 2,697 → 31 ms, 86.4×; 200,000 bars 879 ms — see `PERFORMANCE_BENCHMARKS.md`). |
| Subsystem probes | 11 / 12 | **12 / 12 PASS** |
| Financial anchors | −7,576.06 / −4,023.54 / −602.96 | **Unchanged, bit-identical** (`scripts/anchor_reproduction.js`) |
| Experimental strategies | none | **10-strategy registry built, all disabled, 9/10 net negative, 0 promoted.** See `EXPERIMENTAL_STRATEGIES.md`, `PORTFOLIO_RESEARCH.md` |
| Test totals | 597 | **636 PASS / 0 FAIL** |

Everything else in this report (defects PAUSE-001/PAPER-002/UI-01/TEST-002, cost model, risk,
security, UI, paper trading) was re-verified in this session and still holds. RATE-001 and
PROFIT-001 remain open/blocked — PERF-001 no longer limits profitability research; the missing
representative dataset now does.

---

## 1. Scope executed

Every layer of the repository was re-inspected from scratch — prior PASS marks were not
trusted. Frontend (Next.js/TSX), API routes, TypeScript libraries (risk, tax, strategies,
indicators, backtest, apiGuard), Python core (engine, broker adapter, paper trading, risk,
cost model, strategies, decision engine), JSON strategy/config files, DDL/migrations,
scripts, fixtures, tests, docs, build configuration and Git state.

Workflow executed in one continuous session: baseline/git audit → full inspection →
per-subsystem probes → fix → component tests → integration tests → end-to-end workflow →
final complete regression from the final source state → consolidated report (this folder).

## 2. Defects found and corrected in this phase

| ID | Severity | Defect | Correction | Status |
|---|---|---|---|---|
| UI-01 | MEDIUM | `npm run lint` failed (1 error, 1 warning): `TradeCalendarPage.tsx` called `setState` synchronously in a mount effect, and a first fix attempt wrote a ref during render | Fetch split into a stable `useCallback`; mount fetch deferred to a task; toast ref synchronized in its own effect; behaviour unchanged (one mount fetch, refresh button intact) | **FIXED — lint 0 problems** |
| PAUSE-001 | **HIGH** | `TradingEngine.pause()` set `state=PAUSED` but left `_running=True`; `place_order()` gated only on `_running` → **a paused bot still accepted new orders**. The Pause control did not actually stop trading | `place_order()` now rejects non-emergency orders while `state == PAUSED`; emergency square-off keeps its bypass so open exposure can always be flattened | **FIXED — regression test added** |
| PAPER-002 | **HIGH** | `TradingEngine.start()` never started the simulated execution engine (`PaperTrading._running` stayed `False`), so every paper order was rejected with "Paper trading not running". `stop()` likewise never stopped it | `start()` starts the paper engine it owns; `stop()` stops it. Live branch remains hard-blocked | **FIXED — regression tests added** |
| TEST-002 | LOW | `test_phase71…::test_git_branches_and_tags_hygiene` failed: the remote-ref allowlist only permitted `origin/master`, while the authorized PR branch `origin/arena/16f5d371-trade` legitimately exists | Allowlist extended to `origin/master` + `origin/arena/*`. All other branches, extra remotes and any tag still fail | **FIXED — security intent preserved** |
| PERF-001 | MEDIUM | Backtest is super-linear in bar count: `runBacktest` calls `evaluateConsensus(candles.slice(0, i))` per bar and each call recomputes every indicator over the whole prefix (O(n²)) | Not rewritten (would be an architecture change with real risk of altering the financial model). Measured and documented with a scaling table | **OPEN — documented, not fixed** |

Full per-issue detail: `FINAL_READINESS_REPORT/REMAINING_ISSUES.md`.

## 3. Component verification summary

| Area | Result |
|---|---|
| Python test suite | **388 passed / 0 failed** (376 pre-existing + 12 new lifecycle/workflow tests) |
| TypeScript suite | **169 passed / 0 failed** |
| Independent math verification | **40 passed / 0 failed** |
| Type check (`tsc --noEmit`) | **PASS**, exit 0 |
| Lint (`eslint .`) | **PASS**, 0 errors / 0 warnings |
| Production build (`next build`) | **PASS**, 19 API routes compiled |
| Subsystem probes (new) | **11 / 12 PASS** (the one FAIL is the PERF-001 scaling finding) |
| Cross-language cost parity | **PASS** (TS ↔ Python identical on 17 fixtures) |
| Live-execution interlock | **PASS** — both stacks hard-block real orders |

## 4. Honest status of profitability

**No credible profitability evidence exists.** On the reproducible fixtures used in this
audit the net result is **negative** after realistic statutory costs and slippage:

* 1-minute synthetic seed-42 fixture: 74 trades, **net −₹7,576.06**
* Walk-forward (2 folds, chronological, 30 OOS trades): **net −₹4,023.54**
* Multi-day overnight fixture: 3 trades, **net −₹602.96** (charges ₹474.59; all exits STOP_LOSS)

Older documents in the repository claim positive seeds; those runs are not independent
out-of-sample evidence for the current code and must not be quoted as such. Classification:
**Negative evidence** (see `PROFITABILITY_RESEARCH.md`).

## 5. Final acceptance tiers

| Tier | Verdict |
|---|---|
| CODE VERIFIED | **PASS** |
| TEST VERIFIED | **PASS** |
| COST MODEL VERIFIED | **FAIL / UNVERIFIED** — arithmetic and cross-language parity verified, but statutory rates are not backed by dated official documents in the repo |
| BACKTEST VERIFIED | **PASS** (data integrity, chronology, no look-ahead, reproducibility) — *mechanism*, not profitability |
| PAPER TRADING VERIFIED | **PASS** — isolated simulation lifecycle |
| ALGORITHM SIMULATION VERIFIED | **PASS** — 12-stage workflow, paper path only |
| PROFITABILITY EVIDENCE AVAILABLE | **FAIL** — no adequate independent OOS evidence |

**The project is not live-trading-ready and must not be presented as such.**

## 6. The ten required answers

1. **What is fully completed?** The complete authorised audit workflow: full repository
   inspection, 4 defects fixed (2 high-severity engine defects, 1 lint failure, 1 test-hygiene
   defect), 12 new adversarial lifecycle/workflow tests, a new 12-check subsystem probe
   harness, the mandated 9-tier capital matrix, and this 20-document report set.
2. **What is tested and PASS?** 388 Python tests, 169 TypeScript tests, 40 independent math
   checks, type check, lint, production build, cross-language parity, look-ahead/future-data
   leakage, warm-up contract, regime/quorum fail-closed behaviour, paper lifecycle, the
   12-stage bot workflow, and the live-execution interlock.
3. **What was fixed?** UI-01 (lint/React effect), PAUSE-001 (paused engine accepted orders),
   PAPER-002 (engine never started the paper engine), TEST-002 (remote-branch allowlist).
4. **What remains unresolved?** Statutory rate verification (RATE-001, BLOCKED — no official dated
   documents, fail-closed paths intact); real market data (DATA-001 — pipeline now resolved, data
   itself BLOCKED); profitability (PROFIT-001 — FAIL); three Category-C items carried from earlier
   phases (RT-001, WAVE-001, QUORUM-002) requiring explicit authorisation.
   **PERF-001 is PASS** (fixed and equivalence-proven; ladder completed 1k–200k incl. 32k/64k) and
   **BT-004 is FIXED** (Sharpe/Sortino now computed on IST-session returns, `null` below 20 sessions).
   See `APEX_V2_CONSOLIDATED_REPORT.md`.
5. **Is paper trading ready?** **Yes, within the isolated simulation scope** — start, stop,
   pause, resume, fills, fees, slippage, positions, P&L, restart recovery and duplicate-order
   protection all verified; no path to a real broker exists.
6. **Is automatic paper simulation ready?** **Yes** — the 12-stage Algorithm Bot workflow runs
   end-to-end against the paper engine only, with duplicate-start, no-signal, insufficient-cash
   and error paths exercised.
7. **Which brokerage/tax values remain unverified?** Every statutory number is **UNVERIFIED**
   against a dated official source, because no official tariff document is available in the
   repository or reachable in this environment. Specifically unverified: brokerage rates and
   minimum-per-order floors, STT/CTT per segment and side, exchange transaction charges per
   segment, SEBI turnover fee, stamp duty (state-wise, buy-side only), GST applicability and
   base, IPFT, and all delivery/CNC/currency/commodity rate rows. Two segments are
   deliberately **fail-closed** and refuse to trade rather than guess:
   `NSE_EQ_DELIVERY` and `CDS_ANY` raise `UNSUPPORTED_NO_EVIDENCE`.
8. **Is there credible profitability evidence?** **No.** Net results are negative on every
   reproducible dataset in this audit; sample sizes are too small for statistical claims.
9. **Has anything been pushed to GitHub?** **Nothing in this phase.** No push and no deploy
   was performed. The branch `arena/16f5d371-trade` was already published earlier under a
   separate explicit authorisation (PR #1, head `b9fff0e`); this phase's commit is **local
   only**.
10. **Exact final commit?** See `GIT_RELEASE_STATUS.md` — the local commit created at the end
    of this phase, on top of `b9fff0e`, **not pushed**.

## 7. Evidence index

`COMPLETE_TEST_RESULTS.md`, `REGRESSION_RESULTS.md`, `GIT_RELEASE_STATUS.md`,
`scripts/final_readiness_probes_output.json`, `scripts/phase2_recheck_matrix_output.json`,
`tests/test_final_readiness_lifecycle.py`.
