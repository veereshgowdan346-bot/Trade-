# Remaining Issues

Status vocabulary: **PASS / FAIL / BLOCKED / UNVERIFIED** only.

## Phase 2 independent audit — new issues (2026-11-17)

Single-page view of all blockers: `BLOCKER_REGISTER.md`. New findings from this verification phase:

### METHOD-001 — Harness carries positions overnight — **OPEN, FAIL**
37.1% of OOS trades (1,698/4,582) and 29.5% of MACD's (246/835) exit in a *later* session: a position
open at the close is filled at the next session's open, not squared off intraday. This contradicts the
intraday mandate and the "pure intraday" wording of earlier reports. Sensitivity: true intraday exits
give −₹775,379 vs −₹769,247, so the negative conclusion is unchanged. Not fixed — fixing changes every
reported P&L figure, which this verification-only phase may not do. `researchBacktest` gained an opt-in
`intradayOnly` flag (default `false`) so the variant is measurable without disturbing published results.
Evidence: `INDEPENDENT_METHODOLOGY_AUDIT.md`; `npm run test:methodology` (exit 1 by design).

### INSTR-001 — Instrument mismatch — **OPEN**
Strategies are specified for NSE equity intraday; the study used the NIFTY 50 *index* with the *equity*
intraday cost schedule. The index is not tradable, ₹1L notional ≈ 4–5 units is below any index lot, and
the two errors (wrong cost schedule, non-tradable price series) bias in opposite directions and neither
is quantified. Evidence: `DATA_PROVENANCE_AUDIT.md`.

### CAL-001 — 2022-10-24 calendar discrepancy — **OPEN**
The independent third-party NSE calendar lists 2022-10-24 as a session; the 2022 file does not contain
it. Weekday discrepancy, unresolved, requires official adjudication. 2023/2024 data-only sessions are
explained (Sunday Muhurat 2023-11-12; Saturday special sessions 2024-01-20/03-02/05-18). 2025 UNCHECKED.
Evidence: `data/provenance/calendar_crosscheck.json`.

### DATA-003 — Upstream blob SHA not recorded — **PASS (FIXED)**
The manifest pinned local bytes but not the upstream object. `import_external_data.js` now records
`upstreamBlobSha`, `upstreamHeadCommit` and a size-match flag for all five datasets; all verified live.

### AUDIT-001/002/003 — Audit depth gaps in earlier reports — **PASS (FIXED)**
(1) "No look-ahead" is now behaviourally tested (bar mutation + prefix invariance), not asserted by code
reading. (2) Intervals now reported trade-level, session-cluster and moving-block with design effect.
(3) Cost sensitivity now separates statutory from slippage across six labelled assumptions with an
explicit break-even analysis.

## Master audit pass (2026-11-18, full history)

Baseline `df52c08`. Report: `FINAL_SECURITY_RESEARCH_AUDIT.md`. Plan: `GIT_HISTORY_REMEDIATION_PLAN.md`.

### SECURITY-001 — CORRECTED UPWARD: 36 findings across 6 public commits — **BLOCKED**

Earlier passes scanned a **depth-1 clone** and reported 6 findings in 1 commit. The clone was deepened
(read-only `git fetch --unshallow`) to the complete 8-commit history; the same digest scan now finds
**36 findings across 6 commits, every one reachable from `origin/master`**:

`c9b80bd2` (initial import), `da4d4c82`, `b9fff0e3`, `1741aeb3`, `6aba03f8`, `60d7c41`.

Only `0f1d47d` (remediation) and `df52c08` (PR #2 merge) are clean. Files implicated:
`SECURITY_AUDIT.md`, `scripts/scan_repo_secrets.py`, `scripts/scan_source_files.py`. Kinds:
`api_secret`, `client_or_user_id`, `totp_seed_prefix` (12 each). Values displayed: 0.

The exposure has therefore been public since the repository's **first commit**, not since a recent push.
The previous "6 findings / 1 commit" figure was not wrong in method — it was limited by truncated
history. Working tree remains clean (0 blocking findings, 463 files). **Certification stays BLOCKED.**

### SECURITY-006 — rotation unconfirmed — **NOT_CONFIRMED**

No credential was read, tested, transmitted or reused. Rotation must be confirmed by the owner from the
broker's official console; it cannot be self-certified from inside the repository.

### SEC-004 — scanners historically contained the literals they police — **FIXED (current), PRESENT (history)**

Current `scan_repo_secrets.py` and `scan_source_files.py` carry 0 literal hits when checked by digest.
Their historical revisions are part of the public exposure above and cannot be fixed by editing today's
files.

### SEC-005 — fixtures embed synthetic dummies instead of generating them — **ACCEPTED (LOW)**

Allowlisted by the scanner; obviously fake (`fakeReq`, dummy tokens). No real material involved.

## Security remediation & certification pass (2026-11-18)

Baseline `60d7c41` (the branch base; the working copy was re-cloned mid-pass — see the recovery note in §12). Report: `SECURITY_AND_RESEARCH_CERTIFICATION.md` (generated from artifacts).

### SECURITY-001 — credential exposure in public Git history — **BLOCKED**
History scan (`scripts/scan_git_history_secrets.py`, digest-based, no values printed) scans every
locally reachable commit and finds the broker client id, API secret and TOTP seed in `60d7c41`, which is
**`origin/master` itself** — i.e. already pushed to the GitHub remote. (Before the re-clone the same scan
found the material in 3 commits; only the public one is still reachable locally. See HIST-001.)
Working tree is clean (0 findings in 445 tracked files). **SECURITY CERTIFICATION BLOCKED**: rotation of
the API key and TOTP seed cannot be independently confirmed, and history rewrite was not authorized and
would not undo the public exposure anyway. The shallow clone (boundary `60d7c41`) also means pre-boundary
commits were not scanned — recorded as HIST-001 PRELIMINARY, not a clean pass.

### SECURITY-004 — pre-redaction copies may persist — **OPEN**
Remote, forks, developer clones, and the recovery snapshot created this pass
(`/tmp/security_snapshot/`, mode 0600, outside the repo) all may retain the material. The snapshot must
be destroyed after remediation.

### SEC-003 — TypeScript vault used a published fallback key — **PASS (FIXED)**
`src/lib/vault.ts` fell back to a constant passphrase when `VAULT_KEY` was unset (the same defect class as
Python SEC-002). Key derivation moved to `src/lib/vault_key.ts` (DB-free, unit-testable) and now throws
`VaultKeyMissingError`; short keys are rejected; the vault route returns 503 instead of encrypting with a
public key. Behavioural test SAFE-14.

### STAT-003 — volume-dependent arm included in robustness/cost studies — **PASS (FIXED)**
`x_volume_profile` appeared in the statistical and cost studies although the protocol correctly declares
it NOT_EVALUABLE (an index publishes no volume). Both now exclude volume-requiring arms and record the
exclusion in `excludedArms`. Consequence: OOS totals are now eight-arm figures
(−₹6,79,195.42/−₹6,79,195.43) rather than the earlier nine-arm ones; the earlier numbers remain in git
history and prior reports, annotated rather than overwritten.

### HIST-001 — history scan coverage limited by shallow clone — **PRELIMINARY**
Full-history scanning needs a complete clone; the shallow boundary hides everything before `60d7c41`.

## APEX V2.0 one-pass remediation — register update (2026-11-18)

Baseline `1ccee80`. Consolidated report: `APEX_V2_FINAL_AUDIT_REPORT.md` (generated from artifacts).

### METHOD-001 — overnight carry — **PASS (FIXED)**
Root cause: the `newDay` exit branch filled an open position at the NEXT session's open, treating the
session boundary as a trigger observed on the following bar instead of a deadline inside the current
session. Fix: `sessionMode` with `STRICT_INTRADAY` as the default — liquidation at the session's last
bar close, no entry on the last bar, `strictViolation` flag asserted never to occur. Historical
`CARRY_OVERNIGHT` retained behind explicit opt-in and still reproduces the old artifact exactly.
Behavioural tests M5–M5f cover: no cross-session trade, no position past the session's last bar,
liquidation price correctness, partial/special sessions, and two mid-session data gaps.
Impact: strict OOS net −₹6,79,195.43 vs legacy −₹6,52,544.47 — worse, not better; gross edge fell from
+₹1,18,280.20 to +₹67,500.23, i.e. part of the legacy "edge" was the overnight gap.

### SEC-001 — real broker credentials committed — **FIXED IN TREE / ROTATION OPEN**
A broker client id, API secret and TOTP seed were stored as plaintext scanner patterns, and the client
id was printed in `SECURITY_AUDIT.md`. Replaced by SHA-256 digests (`data/security/leaked_identifiers.json`)
with a hash-based scanner (`scripts/secret_scan_lib.py`); the report line was redacted by digest match.
The new scanner found exposures the old one missed. **Values remain in git history: the owner must rotate
the broker API key and TOTP seed.** History rewrite was not attempted (prohibited).

### SEC-002 — hardcoded vault passphrase — **PASS (FIXED)**
`credential_manager.py` fell back to a constant published in the repo when `VAULT_KEY` was unset.
Now a random 32-byte key is generated once with `0600` permissions and reused; `VAULT_KEY` still wins;
failure raises instead of silently degrading. Verified behaviourally.

### INSTR-001 — instrument mismatch — **BLOCKED**
Index proxy only; equity validation blocked for all 10 strategies; futures/options segments blocked or
not applicable. Machine-readable matrix: `data/provenance/instrument_compatibility.json`.

### REPORT-001 — hand-typed report numbers — **PASS (FIXED)**
`APEX_V2_FINAL_AUDIT_REPORT.md` is generated from artifacts;
`scripts/verify_report_consistency.js` re-checks 30 claims and fails on any mismatch.

### TEST-001 / TEST-002 — auditor test defects — **PASS (FIXED)**
The parameter-search test matched prose ("no parameter grid", "optimistic") instead of code; replaced with
construct-level matching over comment-stripped source. The missing-candle test crashed by selecting a
9-bar Saturday session; it now selects 25-bucket sessions and deletes two gaps.

## Open issues

### PERF-001 — Backtest runtime is quadratic — **PASS (FIXED in this session)**
Resolved by `src/lib/consensus_fast.ts` (O(n) decision evaluation). Exact equivalence proven
bar-for-bar (0 divergences, `scripts/perf_equivalence.js`); 200,000 bars now 944 ms vs. notable
completion in 600 s. All financial anchors bit-identical. Retained here for history — see
`PERFORMANCE_BENCHMARKS.md`.

#### (historical record) PERF-001 — backtest runtime is quadratic
`runBacktest` recomputes all indicators over the full prefix for every bar, so cost is O(n²):
8,000 bars ≈ 2.9 s, a 200,000-bar run does not finish in 10 minutes. Fix requires incremental
indicator caching (Category B — architecture). **Not changed**: risk of silently altering
signal values. Mitigation today: keep datasets ≤ ~8,000 bars.

### RATE-001 — Statutory rates unverified (HIGH, external) — **BLOCKED / UNVERIFIED** (evidence register added 2026-11-17)
Authoritative issuers and publication channels are now enumerated per head in
`OFFICIAL_RATE_EVIDENCE_REGISTER.md` (26 heads, 5 document classes). Verification still fails: every
issuer host is unreachable from this environment (`www.nseindia.com` and `www.sebi.gov.in` return
`curl: (35) OpenSSL SSL_connect: SSL_ERROR_SYSCALL`; `cbic.gov.in`, broker sites and even
`raw.githubusercontent.com` return `http=000`). **0 of 26 heads verified; no value or effective date was
invented.** New finding: on a representative round trip, statutory heads are ₹47.12 while the slippage
*assumption* is ₹160.20 (77.3% of modelled cost) — cost conclusions must therefore be stated with a
slippage sensitivity range, which the OOS study now does.

#### (previous text) RATE-001 — Statutory rates unverified (HIGH, external)
No dated official tariff documents are available in the repository and the environment cannot
reach broker/exchange documentation. Every brokerage/STT/exchange/SEBI/stamp/GST/IPFT value is
therefore UNVERIFIED. `NSE_EQ_DELIVERY` and `CDS_ANY` remain fail-closed. No rate was invented.

### PROFIT-001 — No credible profitability evidence (HIGH) — **FAIL (now evidenced on real data)**
First out-of-sample study on real data (`RESEARCH_PROTOCOL.md` v1.0.0, `OOS_RESULTS_REAL_DATA.md`):
8 evaluable strategies × 3 chronological years (2022 train / 2023 validation / 2024 OOS), 12,046 trades,
default parameters, no search. **8/8 net negative in every period; 0 OOS_SUPPORTED; 2 NOT_EVALUABLE**
(volume required, index has none). OOS gross **+₹1,18,280** but statutory charges alone were
**−₹1,78,660**, so net is **−₹60,379 even at ZERO slippage** — the negative result does not depend on the
slippage assumption. Bootstrap 95% CIs of mean net per trade are entirely negative for all 8.
This sharpens rather than resolves PROFIT-001.

#### (previous text) PROFIT-001 — No credible profitability evidence (HIGH) — **FAIL**
Net results are negative on every reproducible dataset (−₹7,576.06 seed-42, −₹4,023.54 OOS
walk-forward, −₹602.96 multi-day). Sample sizes are too small for statistical claims.

### BT-004 — Sharpe/Sortino annualised on per-trade returns (MEDIUM) — **PASS (FIXED 2026-11-17)**
Root cause identified: the array named `dailyReturns` held **per-trade** returns and was scaled by
√252, producing values such as −81.37 on a single session. Now `computeRiskAdjustedRatios()` uses
IST-**session** equity returns, returns `null` + `riskAdjustedBasis: INSUFFICIENT_SAMPLE` below 20
sessions, and declares `DAILY_ANNUALIZED` otherwise. Sortino downside deviation corrected to
`sqrt(mean(min(r,0)²))` over all observations; `EPS=1e-12` guards zero-dispersion blow-up.
Evidence: `scripts/metric_tests.js` 9 PASS / 0 FAIL; full regression green. This **changed a reported
financial output** (documented in `RISK_ADJUSTED_METRICS.md`); no execution logic was touched.

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

### EXP-001 — Experimental strategies show no edge (INFO) — **FAIL (research finding)**
10 research strategies evaluated across 3 regimes (4,500 bars each): 9 of 10 net negative; the
only positive aggregate (`x_parabolic_sar`, +₹74,451.82 over 1,865 trades) is positive in 1 of 3
regimes. None promoted. Portfolio equal-weight net −₹1,56,048.10. Not a defect — a result.

### CORR-001 — Portfolio correlation / diversification (LOW) — **MEASURED, PRELIMINARY, NOT SUPPORTED**
Upgraded this session from ~12 sessions to **30 sessions × 3 regimes = 90 sessions**, full-prefix
signals (a bounded-window shortcut measuring only ~99.6% agreement was rejected as inexact). Results:
45/45 pairs defined, mean |r| = 0.299, 2 pairs ≥ 0.7, **mean exposure overlap 0.718**, equal-weight
portfolio −₹4,54,585.91 with **0 positive days out of 90** and charges at **9.85× net loss**. Reliability
label `PRELIMINARY` (30–59 sessions), so no allocation claim is made and
`diversificationClaim: NOT_SUPPORTED`. See `PORTFOLIO_CORRELATION.md`.

### DATA-001 — Real data (HIGH, external) — **PARTIALLY RESOLVED: real data obtained, authenticity UNVERIFIED**
Real intraday data is now in the workspace (2026-11-17): NIFTY 50 1-minute for 2022/2023/2024
(277,071 bars, 742 sessions, MIT-licensed redistribution) plus two 2020 all-symbol equity tapes
(283,366 bars, no upstream licence → not redistributed). Every file carries upstream repo, blob SHA,
local SHA-256, retrieval timestamp and `authenticity: UNVERIFIED_REDISTRIBUTION`. Raw data stays
gitignored in `data/external/`; only provenance + quality reports are committed. Quality: three index
years grade **A** (100% / 99.8% / 99.5%), zero invalid OHLC / duplicates / ordering errors across
277,071 bars, and the auditor caught genuine special sessions (2023-11-12 Muhurat Sunday, 2024-03-02,
2024-05-18, 2024-11-01).
**Still blocking:** authenticity unproven; `nse_calendar` covers 2026 only so holiday validation is
`UNCHECKED` for 2022-2025 (reported as such, not as "clean"); the index is a proxy, not a tradable
instrument. See `HISTORICAL_DATA_PROVENANCE.md` and `DATA_QUALITY_REPORT_REAL.md`.

#### (previous text) DATA-001 — No representative historical dataset (HIGH, external) — pipeline resolved
The *pipeline* half is now resolved: `src/lib/data_quality.ts` + `scripts/data_quality_audit.js`
enforce provenance, SHA-256 dataset identity, style/session/holiday/staleness/zero-volume checks,
quality grading, and a **synthetic-can-never-be-labelled-REAL guard**. All 10 negative controls are
detected and 6/6 registry invariants hold; the corrupted fixture grades D and is refused for research.
`profitClaimAllowed` is `false` for every dataset — deliberately, because no real data exists here.
The *data* half remains BLOCKED: synthetic fixtures only (375–11,250 bars). This is now the binding
constraint on profitability
evidence, since PERF-001 no longer limits runtime (200k bars ≈ 1 s).

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
