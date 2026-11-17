# Remaining Issues

Status vocabulary: **PASS / FAIL / BLOCKED / UNVERIFIED** only.

## Open issues

### PERF-001 — Backtest runtime is quadratic (MEDIUM) — **FAIL** (documented, not fixed)
`runBacktest` recomputes all indicators over the full prefix for every bar, so cost is O(n²):
8,000 bars ≈ 2.9 s, a 200,000-bar run does not finish in 10 minutes. Fix requires incremental
indicator caching (Category B — architecture). **Not changed**: risk of silently altering
signal values. Mitigation today: keep datasets ≤ ~8,000 bars.

### RATE-001 — Statutory rates unverified (HIGH, external) — **BLOCKED / UNVERIFIED**
No dated official tariff documents are available in the repository and the environment cannot
reach broker/exchange documentation. Every brokerage/STT/exchange/SEBI/stamp/GST/IPFT value is
therefore UNVERIFIED. `NSE_EQ_DELIVERY` and `CDS_ANY` remain fail-closed. No rate was invented.

### PROFIT-001 — No credible profitability evidence (HIGH) — **FAIL**
Net results are negative on every reproducible dataset (−₹7,576.06 seed-42, −₹4,023.54 OOS
walk-forward, −₹602.96 multi-day). Sample sizes are too small for statistical claims.

### BT-004 — Backtest item carried from earlier phases (MEDIUM) — **UNVERIFIED/OPEN**
Carried forward unchanged; it does not affect correctness of the verified accounting path and
was not resolved in this phase.

### RT-001 / WAVE-001 / QUORUM-002 — Category C (BLOCKED)
Real-time data feed, wave-detection thresholding and quorum tuning are Category-C changes
(new thresholds / signals / architecture). **Not implemented** — they require explicit
authorisation and would risk weakening signal quality.

### ARCH-001 — Two-stack split, Python layer unreachable from the UI (LOW) — **UNVERIFIED**
The running application is TypeScript/Next.js; the Python engine/paper-trading library is
exercised by tests and scripts but is not wired into the request path. Documented so no reader
assumes otherwise. Changing this is an architecture decision requiring authorisation.

### UI-002 — No browser/E2E automation for the UI (LOW) — **UNVERIFIED**
UI verification relies on type check, lint, build and code inspection. A rendered-DOM
regression would not be caught automatically.

### RATE-LIMIT-001 — In-process rate limiter (LOW) — **UNVERIFIED**
Per-instance only; a multi-instance deployment would need a shared store.

## Resolved in this phase
| ID | Severity | Resolution | Status |
|---|---|---|---|
| PAUSE-001 | HIGH | Paused engine now rejects new orders (emergency square-off preserved) | **PASS** |
| PAPER-002 | HIGH | Engine start/stop now controls the paper engine; fills, cash, P&L observable | **PASS** |
| UI-01 | MEDIUM | `npm run lint` now 0 problems | **PASS** |
| TEST-002 | LOW | Remote-branch allowlist covers `origin/arena/*` only | **PASS** |

## Explicitly NOT done (per standing constraints)
* Live trading was **not** enabled; no real order path was added.
* No leverage increase, no SL weakening, no risk-limit relaxation.
* No parameter optimisation, no threshold tuning to manufacture trades or backtest results.
* No statutory rate was invented or silently substituted.
* No test was deleted and no assertion was weakened.
* No push, no deploy, no publish.
* The project is **not** declared live-trading-ready.
