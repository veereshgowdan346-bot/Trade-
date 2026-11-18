> **SUPERSEDED — see `APEX_V2_FINAL_CERTIFICATION.md` (2026-11-18, Apex V2.0 pass).**
>
> This report is a dated snapshot and its numbers are intentionally frozen: it records safety at
> 14/14 probes and 8 scanned commits, which was accurate when written. The later pass added SAFE-15 and
> the ninth commit, so those figures are no longer current. The body is preserved unedited; current
> figures live in the Apex certification report.

# OmniTradePro — Final Security Remediation & Research-Only Master Audit

Generated: 2026-11-18T01:02:23.456Z  
Generator: `node scripts/generate_master_audit_report.js`  
Method: every figure below is read from a JSON artifact produced by an executed command. 
No value is remembered, and no credential value appears anywhere in this document.

## Final statuses

| Dimension | Status | Why |
|---|---|---|
| **SECURITY** | **BLOCKED** | Credential material sits in public Git history (6 commits, all reachable from the remote). Rotation is **NOT CONFIRMED** by the account owner, and exposure remediation has not been reviewed. |
| **FINANCIAL VALIDATION** | **BLOCKED** | 0 of 26 official rate heads verified; equity instrument data unavailable/unauthenticated; 1 unresolved calendar discrepancy. |
| **PROFITABILITY** | **NOT ESTABLISHED** | Strict OOS net −₹6,79,195.43 across 8 arms; 0 positive. No independent out-of-sample evidence. |
| **EXECUTION** | **PAPER / RESEARCH ONLY** | No broker connection, no order routing, all strategies disabled. |

---

## 1. Verified Git baseline

| Item | Value |
|---|---|
| Branch | `arena/f721e253-trade` |
| HEAD | `df52c08340e1a3ff9c7dff3edd830219fd000a8c` |
| Parent | `60d7c418f89beb392661642a95bfaadd2f99068c` |
| Commits reachable (all refs) | 8 |
| Shallow boundary | **none — full history** |
| Remote | `origin https://github.com/veereshgowdan346-bot/Trade-.git (fetch)` |

The working copy arrived as a **depth-1 clone** (boundary `df52c08`, 1 commit reachable). A read-only `git fetch --unshallow` was performed to restore the complete 8-commit history so the audit could cover what actually exists on the remote. This fetched objects; it did not rewrite, push, or delete anything.

## 2. Working tree

| Item | Value |
|---|---|
| Modified/untracked paths at generation | 28 |
| Credential findings in working tree | **0** (clean) |
| Files covered by the tree scanner | 463 |

## 3. Public credential exposure status — **EXPOSED, PUBLIC, UNFIXED**

| Item | Value |
|---|---|
| Findings | **36** |
| Distinct commits affected | **6** |
| Reachable from `origin/master` | **36** |
| Commits scanned / blobs scanned | 8 / 533 |
| Kinds | api_secret, client_or_user_id, totp_seed_prefix |
| Values displayed | **0** (digest matching only) |
| Verdict | **HISTORY_EXPOSURE_FOUND** |

Affected commits and file paths (no values):

| Commit | Findings | Public |
|---|---|---|
| `1741aeb3b407` | 6 | **yes** |
| `60d7c418f89b` | 6 | **yes** |
| `6aba03f8af2d` | 6 | **yes** |
| `b9fff0e3bdde` | 6 | **yes** |
| `c9b80bd264c2` | 6 | **yes** |
| `da4d4c829eb5` | 6 | **yes** |

Files implicated: `SECURITY_AUDIT.md` (6), `scripts/scan_repo_secrets.py` (12), `scripts/scan_source_files.py` (18).

**This is materially worse than earlier reports stated.** Those reports scanned a shallow clone and could see only the boundary commit (6 findings, 1 commit). With the complete history available, the same digest scan finds 36 findings across 6 commits spanning the initial import through the PR #1 merge. The exposure has been public since the repository's first commit.

The two commits that are clean are the remediation commit and the PR #2 merge commit. Deleting a file in a later commit does not remove it from history, and it does not un-publish anything already pushed.

## 4. Credential rotation — **NOT_CONFIRMED**

| Item | Value |
|---|---|
| Rotation status | **NOT_CONFIRMED** |
| Evidence required | Owner confirmation from the broker's official security console |
| Credentials accessed by this pass | **None** |
| Credentials transmitted | **None** |

No credential was read, tested, transmitted or reused. Rotation cannot be self-certified from inside the repository, so it is not claimed. Security certification stays BLOCKED until the owner confirms.

Safe instructions for the owner (broker platform only — never through this repo):

1. Sign in to the broker's official web portal with the existing account.
2. Open the API / developer section and **revoke** the existing API key. Creating a new key is not the same as revoking the old one — the old key must be explicitly deleted.
3. Disable/reset the TOTP secret: remove the authenticator enrolment and re-enrol from scratch, so the old seed cannot produce valid codes.
4. Change the account password if it was ever stored alongside these values.
5. Confirm out-of-band (from the console, not from any file here) that the old key now fails.
6. Do not paste the new credentials into this repository, any branch, commit, issue or CI log.

## 5. Security findings and remediation

| ID | Item | Status | Detail |
|---|---|---|---|
| SECURITY-001 | Credential material in public Git history | **BLOCKED** | 36 findings / 6 public commits. Requires owner rotation; a rewrite was not performed. |
| SEC-002 | Python vault fell back to a published constant password | **FIXED** | Per-install random master key generated with `os.open(..., 0o600)`; no constant fallback; raises when a master password is required and absent. |
| SEC-003 | TypeScript vault fell back to a published constant passphrase | **FIXED** | Derivation isolated in `src/lib/vault_key.ts`; throws `VaultKeyMissingError`; rejects keys shorter than 8 chars; route returns 503. |
| SEC-004 | Scanners historically contained the literals they police | **FIXED** | Current `scan_repo_secrets.py` / `scan_source_files.py` carry 0 literal hits when checked by digest. The historical copies remain in public history. |
| SEC-005 | Test fixtures embed synthetic dummies rather than generating them | **ACCEPTED (LOW)** | Allowlisted by the scanner; they are obviously fake (`fakeReq`, dummy tokens). Generating them at runtime would be tidier but they are not real material. |

Safety probes: **14 pass / 0 fail** (PAPER_ONLY_SAFETY_PASS).

## 6. Shallow-history limitation

| Item | Value |
|---|---|
| Shallow at generation | **no** — complete history present |
| Commits scanned | 8 |
| Limitation text from scanner | Full history present locally. |

The earlier limitation is now **resolved for this repository**: the clone was deepened and the scan covers every commit reachable from the remote. Any repository that is still a shallow clone would carry the old caveat: absence of findings in a truncated history is not evidence of cleanliness.

## 7. Recovery snapshot

| File | Size | Mode | Purpose |
|---|---|---|---|
| `repo_all_refs_20261118T005537.bundle` | 15,96,545 bytes | 600 | complete git history bundle |
| `worktree_recovered_20261118T005537.tar.gz` | 13,81,554 bytes | 600 | working-tree archive |

`git bundle verify` reports: *The bundle records a complete history.*

Location `/home/user/security_snapshot` is outside the repository with directory mode 0700 and file mode 0600. It contains the exposed material by design — that is what makes it a usable recovery point. It must not be moved into the repository, and it must not be destroyed until rotation is confirmed and any future rewrite has been verified.

A previous snapshot under `/tmp/security_snapshot/` was **lost** when the machine was re-provisioned; it was never persisted. That is why the snapshot now lives under `/home/user`. Recorded as a loss, not silently replaced.

## 8. Strict intraday methodology

| Item | Value |
|---|---|
| Default session mode | **STRICT_INTRADAY** |
| Methodology checks | **12 pass / 0 fail** |
| OOS trades | 3,956 |
| Legacy (carry) OOS net, same arms, opt-in only | −₹6,52,544.47 |
| Overnight positions carried (strict) | **0** |
| Evaluable arms | 8 |
| Arms excluded — NOT_EVALUABLE (no volume) | `x_obv_confirmation`, `x_volume_profile` |
| Strict verdict | **NEGATIVE_RESULT_ROBUST_TO_CLUSTERING** |

Methodology audit confirms: strict intraday is the default; no trade crosses a session; EOD liquidation fills at the session's last bar; special/partial sessions flatten inside the session; missing candles create no artificial fills; legacy carry is reproducible only by explicit opt-in; no parameter grid and no strategy-parameter overrides exist.

Per-period pooled results (strict, proxies):

| Period | Year | Sessions | Net | Mean/session |
|---|---|---|---|---|
| TRAIN | 2022 | 245 | −₹6,73,991.56 | −₹2,750.99 |
| VALIDATION | 2023 | 244 | −₹6,83,370.18 | −₹2,800.70 |
| OOS | 2024 | 247 | −₹6,79,195.42 | −₹2,749.78 |

## 9. Instrument and data compatibility

| Item | Value |
|---|---|
| Instrument verdict | **INSTRUMENT_INCOMPATIBLE_FOR_EQUITY_VALIDATION** |
| Strategies whose equity validation is blocked | **10 of 10** |
| Proxy studies completed on the index | 8 |
| Not evaluable (volume required) | 2 |

| Segment | Status |
|---|---|
| EQUITY | **BLOCKED** |
| INDEX_REFERENCE | **PROXY_ONLY** |
| FUTURES | **BLOCKED** |
| OPTIONS | **NOT_APPLICABLE** |

The NIFTY 50 index is a reference series: not tradable, no volume, and not the equity instrument the strategies are specified for. Equity cost schedules are applied to it only as a documented research proxy. No equity cost is ever applied to index data as if it were the traded instrument.

Data provenance — local hash verification is **not** exchange authenticity:

| Dataset | Licence | Redistribution | Authenticity | Rows | Sessions |
|---|---|---|---|---|---|
| `NIFTY50_1min_2022` | MIT | allowed | UNVERIFIED_REDISTRIBUTION | 92,617 | 247 |
| `NIFTY50_1min_2023` | MIT | allowed | UNVERIFIED_REDISTRIBUTION | 91,931 | 246 |
| `NIFTY50_1min_2024` | MIT | allowed | UNVERIFIED_REDISTRIBUTION | 92,523 | 249 |
| `20200108` | none declared | **not permitted** | UNVERIFIED_REDISTRIBUTION | 1,41,346 | 1 |
| `20200110` | none declared | **not permitted** | UNVERIFIED_REDISTRIBUTION | 1,42,020 | 1 |

Every file was re-downloaded this pass through the GitHub blobs API and matched against its upstream git blob SHA, which proves the bytes match what upstream published. It proves nothing about whether the vendor's data is authentic NSE output. No unlicensed dataset is redistributed in this repository.

## 10. Official cost verification — **UNVERIFIED**

| Item | Value |
|---|---|
| Rate heads inventoried | **26** |
| Verified against official documents | **0** |
| Status breakdown | UNVERIFIED: 21, UNSUPPORTED_NO_EVIDENCE: 2, UNVERIFIED_ASSUMED_SAME_AS_ANGEL: 3 |
| Registry checks | 15 pass / 0 fail |
| Blocker | OPEN — every statutory/brokerage rate remains UNVERIFIED |

Statutory status in the cost model: **UNVERIFIED**. No rate was invented, rounded to a convenient number, or copied from a secondary narrative and called official. Where a rate could not be verified from a dated official document, it stays UNVERIFIED and continues to block financial validation.

## 11. Calendar discrepancies

| Year | Status | Data sessions | Calendar sessions | Data-only | Calendar-only |
|---|---|---|---|---|---|
| 2022 | THIRD_PARTY_CROSSCHECKED | 247 | 248 | 0 | 1 |
| 2023 | THIRD_PARTY_CROSSCHECKED | 246 | 245 | 1 | 0 |
| 2024 | THIRD_PARTY_CROSSCHECKED | 249 | 246 | 3 | 0 |
| 2025 | UNCHECKED | — | — | 0 | 0 |

Unresolved weekday discrepancies: **1** (2022-10-24 — the dataset contains a session the third-party calendar expects and vice versa; it needs an authoritative NSE notice to adjudicate, which is unreachable from this environment).

Years not assessed: **2025** — no dataset exists, so 2025 remains UNCHECKED rather than assumed clean.

The cross-check calendar is `pandas_market_calendars` (THIRD_PARTY). Agreement with it does not establish authenticity.

## 12. Test results (actual exit codes)

Recorded by `node scripts/run_regression_record.js` on 2026-11-18T01:02:05.987Z  
Environment: Node v22.22.3, Python 3.11.2, Qt platform offscreen.

| Gate | Command | Exit | Expected | Detail |
|---|---|---|---|---|
| TypeScript typecheck | `npx tsc --noEmit` | 0 | 0 |  |
| Lint (eslint, zero warnings) | `npx eslint . --max-warnings=0` | 0 | 0 |  |
| Production build | `npm run build` | 0 | 0 | ƒ  (Dynamic)  server-rendered on demand |
| Python test suite | `python3 -m pytest -q` | 0 | 0 | 389 passed in 2.74s |
| JavaScript suite (test:all) | `npm run test:all` | 0 | 0 | 26 PASS / 0 FAIL / 15 PASS / 0 FAIL / "verdict": "ANCHORS_REPRODUCED_EXACTLY" |
| Security probes (test:safety) | `npm run test:safety` | 0 | 0 | safety audit: 14 PASS / 0 FAIL / verdict: PAPER_ONLY_SAFETY_PASS |
| Secret scanner (test:secrets) | `npm run test:secrets` | 0 | 0 | blocking findings: 0 |
| History scanner (test:history) | `npm run test:history` | 1 | 1 | findings:        36 across 6 commit(s) / verdict: HISTORY_EXPOSURE_FOUND |
| Instrument compatibility | `npm run test:instrument` | 0 | 0 | strategies: 10 (equity validation BLOCKED for all 10) |
| External dataset audit | `npm run test:external` | 0 | 0 | external audit: 7 PASS / 0 FAIL |
| Calendar cross-check | `npm run test:calendar` | 0 | 0 | unresolved weekday discrepancies: 1 |
| Official rate registry audit | `npm run test:rate` | 0 | 0 | 15 PASS / 0 FAIL |
| Methodology audit | `npm run test:methodology` | 0 | 0 | methodology audit: 12 PASS / 0 FAIL / PASS M4 signal depends only on the prefix passed in — signal=-1, confidence=65 |
| Research protocol (legacy carry) | `npm run test:protocol` | 0 | 0 | } |
| Research protocol (strict intraday) | `npm run test:protocol:strict` | 0 | 0 | } |
| Statistical robustness | `npm run test:stats` | 0 | 0 | verdict: NEGATIVE_RESULT_ROBUST_TO_CLUSTERING |
| Cost sensitivity | `npm run test:cost` | 0 | 0 | verdict: { |
| Readiness probes | `node scripts/final_readiness_probes.js` | 0 | 0 | "passed": 12, / "verdict": "linear-ish" |

**18 of 18 gates returned the expected exit code** (ALL_GATES_AS_EXPECTED).

The history scanner's exit code of 1 is **not** a defect: it is the correct, visible, blocking result while known credential material remains in public history. It must stay red until rotation happens. Suppressing it would be exactly the kind of silence this audit exists to prevent.

Report consistency: **56 claims checked, 0 failures** (REPORT_MATCHES_ARTIFACTS).

## 13. Remaining blockers

| ID | Blocker | Status | Unblocks when |
|---|---|---|---|
| SECURITY-001 | Credential material in public history | **BLOCKED** | Owner revokes the API key and resets the TOTP seed, confirmed from the broker console. |
| SECURITY-006 | Rotation unconfirmed | **NOT_CONFIRMED** | Owner confirmation, out-of-band. |
| INSTR-001 | ETF/equity instrument data unavailable or unauthenticated | **BLOCKED** | Authentic, licensed NSE equity intraday data is obtained. |
| RATE-001 | Official fee/statutory rates | **UNVERIFIED 26 heads** | Dated official NSE/SEBI/CBIC/GST documents are retrievable. |
| DATA-002 | Dataset authenticity | **UNVERIFIED** | Vendor or exchange attests to the bytes. |
| CAL-001 | 2022-10-24 session discrepancy | **OPEN** | Authoritative NSE holiday/special-session notice. |
| PROFIT-001 | Profitability | **NOT ESTABLISHED** | Independent, realistic, reproducible OOS evidence. Current result is negative on all 8 evaluable arms. |

## 14. Exact safe next steps for the owner

1. **Rotate now** — revoke the API key and reset the TOTP seed in the broker console (§4). Nothing else meaningfully reduces risk until this is done.
2. **Confirm** the old key fails, then tell me it is done so the status can move from NOT_CONFIRMED.
3. **Read** `FINAL_READINESS_REPORT/GIT_HISTORY_REMEDIATION_PLAN.md` and decide whether to attempt a history rewrite. The recommendation is to rely on rotation; a rewrite is optional cleanup with real risk and no retroactive un-disclosure.
4. **Keep** the recovery bundle until rotation is confirmed and any rewrite has been verified; then destroy it deliberately and record that you did.
5. **Do not** paste credentials into this repository, its issues, its commits or any CI log.
6. **Leave** broker execution disabled and treat every strategy result as research until independent out-of-sample evidence exists.

## 15. Post-exposure verification (verification-only pass, 2026-11-18)

A second pass re-verified every claim above without changing strategy logic, data or safety controls. It exists because the earlier figures were produced under a truncated history, and a correction of that size deserves an independent re-derivation rather than a single reading.

| Check | Result |
|---|---|
| Branch / HEAD under test | `arena/f721e253-trade` / `df52c08340e1a3ff9c7dff3edd830219fd000a8c` |
| Working tree at start of pass | re-cloned again; three local commits (incl. the previous report commit) were lost as objects and recovered as working-tree state |
| Commits scanned after re-deepening | 8 (shallow: false) |
| Findings reproduced | **36 across 6 commits** — identical to the earlier full-history scan |
| Per-commit file distribution | identical in every commit: `SECURITY_AUDIT.md` x6 per commit, `scripts/scan_repo_secrets.py` x12 per commit, `scripts/scan_source_files.py` x18 per commit |
| Values displayed | **0** |
| Working tree identifiers (all files, untracked included) | **0 of 468 files** |
| Regression gates | **18 of 18** as expected |
| Rotation status | **NOT_CONFIRMED** (unchanged; no credential accessed) |

Vault behaviour, re-probed rather than read:

| Probe | TypeScript | Python |
|---|---|---|
| Missing key | throws `VaultKeyMissingError` | no constant fallback in source |
| Key shorter than 8 chars | rejected | — |
| Valid key | 32 bytes derived | 64-hex per-install key, file mode 0600 |

### New findings versus the earlier shallow-clone scans

| Report | Environment | Result | Standing |
|---|---|---|---|
| `SECURITY_AND_RESEARCH_CERTIFICATION.md` (earlier pass) | depth-1 clone, 1 commit visible | 6 findings, 1 commit | **superseded** — banner added, body preserved unedited |
| `FINAL_SECURITY_RESEARCH_AUDIT.md` §3 (first full-history pass) | complete 8-commit history | 36 findings, 6 commits | current |
| This section (verification pass) | complete 8-commit history, re-derived | 36 findings, 6 commits | **confirmed, independently reproduced** |

The distinction that matters: the early figure was not a measurement error, it was a **coverage** limit — a shallow clone cannot see commits it never fetched. The corrected figure does not change any remedy; it changes the scale, and it moves the start of the exposure window to the repository's first commit.

### Operational finding from this pass

The working copy was re-provisioned twice during this audit. Each time, unpushed local commits and the recovery snapshot under `/home/user/security_snapshot` disappeared with the machine, and the content had to be recovered from working-tree state. The guardrails held (nothing was lost that could not be re-derived, and every gate was re-run), but the lesson is concrete: **durability requires a remote, not a local commit**. The owner should decide where this work is published before treating any local hash as permanent.

---

**Security certification: BLOCKED** (public history exposure; rotation NOT_CONFIRMED).  
**Financial validation: BLOCKED** (0 of 26 rate heads verified; instrument compatibility failed; authenticity unverified).  
**Profitability: NOT ESTABLISHED** (strict OOS −₹6,79,195.43, 0/8 arms positive).  
**Execution: PAPER / RESEARCH ONLY.** Not live-trading-ready.

