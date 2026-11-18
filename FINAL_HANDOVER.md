# Final Handover

OmniTradePro Apex V2.0 · generated 2026-11-18 by `scripts/generate_handover.js`.

**Decision: SECURITY BLOCKED — RESEARCH/PAPER ONLY.** Nothing in this document authorises live trading,
real-money execution or production deployment. Every remaining blocker below belongs to someone other than
the codebase, and none of them can be discharged by writing more code.

---

## A. Account-owner actions

These require the owner of the broker account to act inside the broker's own interface. They must not be
performed by an automated agent, and this repository must never be given the credentials to perform them.

### A1. Revoke the exposed broker API credentials — **NOT_CONFIRMED**

- **Why:** 36 findings across 6 commits reachable from
  origin/master are public. Values displayed in every scan: 0 (by design).
- **Action:** log in to the broker's developer/API console and **delete or regenerate** the API key in use
  during the affected period.
- **Confirmation required:** a dated statement from the owner that the old key no longer authenticates.
  Until then rotation stays `NOT_CONFIRMED` and the incident stays open.

### A2. Reset the TOTP seed — **NOT_CONFIRMED**

- **Why:** a leaked TOTP seed is worse than a leaked API key: it lets anyone with the seed mint valid second
  factors for the account.
- **Action:** disable and re-enrol TOTP in the broker's security settings, which issues a new seed.
- **Confirmation required:** dated owner confirmation that the previous seed is invalid.

### A3. Record a decision on the historical Git exposure

- Either "accepted risk, no rewrite", or a completed rewrite performed by the owner outside this workspace.
- The plan, its risks and its prerequisites are in `FINAL_READINESS_REPORT/GIT_HISTORY_REMEDIATION_PLAN.md`.
- **Do not** rewrite while the credentials are still live — rotation first, cleanup second.

### A4. Arrange durable, off-machine backups

- Current state: **DURABLE_BACKUP_NOT_ESTABLISHED**. Bundles created in this workspace live on sandbox-local
  storage and are destroyed by environment resets: 0 exist now, 14 earlier
  ones were recorded and then lost. That is the clearest possible demonstration that a local copy is not a backup.
- **Action:** copy a verified bundle out of this machine to storage the owner controls and can restore from.
  Inventory, hashes and the restore procedure: `RECOVERY_MANIFEST.md` and `RECOVERY_PROCEDURE.md`.
- **Do not** treat this handover, or any file in this repository, as a backup.

---

## B. External evidence (nobody can supply this by coding)

| # | Requirement | Current state | Who can supply it |
|---|---|---|---|
| B1 | Official documentation for all 26 transaction-cost heads | 21 UNVERIFIED, 2 segments unevidenced, 3 assumed | CBDT, NSE/MCX, SEBI, CBIC, and the three brokers' tariff pages — see `MISSING_EVIDENCE_REGISTER.md` |
| B2 | Licensed, authentic **equity-instrument** intraday data | Index data only; 10 of 10 strategies blocked for equity validation | A licensed data vendor or the exchange |
| B3 | Authoritative resolution of the 2022-10-24 calendar discrepancy | Open: the third-party calendar contains the date, the data does not | NSE circular / holiday list for 2022 |
| B4 | Verification of the 2025 calendar | UNCHECKED — never assessed | NSE holiday list and special-session circulars for 2025 |

Official sources were unreachable from this environment (TLS failures); **0 documents were retrieved and
0 rates were verified**. That is a fact about the environment, not permission to approximate.

---

## C. Code tasks

### C1. Open code defects

None. Every defect in the register is FIXED or is an accepted-and-documented deployment constraint. No verified code defect remains open.

### C2. Accepted constraint, not a defect

- **SEC-009 — process-local rate limiting.** Multi-instance deployment stays blocked. Lifting it requires a
  shared store with independently verified design, failure modes and tests; none has been added, because an
  unaudited dependency would be worse than the documented limit.

### C3. Tasks that are only unblocked *by* external evidence

These are deliberately **not** started, because starting them would mean inventing the inputs:

1. Populate the rate registry and re-run the cost model — only once B1 exists.
2. Re-run equity validation — only once B2 exists.
3. Resolve the calendar item and assess 2025 — only once B3 and B4 exist.

Closure criterion for each: the document is held, cited, and the affected test changes from a documented
blocker to a passing check **without** any parameter being tuned to reach it.

---

## Current verified state

| Item | Value |
|---|---|
| Branch | `arena/f721e253-trade` |
| Regression gates | 22/22 as expected (by-design non-zero: History scanner (test:history) exit 1) |
| Adversarial probe | dist_test_cjs/apiGuard.js: 48 passed, 0 failed |
| Mutation gate | 5/5 reintroduced vulnerabilities detected |
| Environment probe | env-config probe: 43 passed, 0 failed |
| Defects | 15 fixed, 1 accepted-by-design, 0 open, 16 total |
| Research (strict OOS) | -Rs 6,79,195.43 net (sum of 8 arms; pooled total -Rs 6,79,195.42), 3956 trades, 0 of 8 arms positive, 0 overnight-carried trades |
| Strategy scope | 10 of 10 strategies blocked for equity validation; 10 strategies remain disabled |
| Backup durability | DURABLE_BACKUP_NOT_ESTABLISHED |

Negative results are reported unchanged. No profitability, production-readiness or live-trading claim is made
anywhere in this handover.
