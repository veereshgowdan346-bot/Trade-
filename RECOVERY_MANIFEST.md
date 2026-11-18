# Recovery Manifest

OmniTradePro Apex V2.0 · generated 2026-11-18T04:25:49.094Z by `scripts/generate_recovery_docs.js`.

This file is generated from the repository itself. Re-run `node scripts/generate_recovery_docs.js` after
any commit that changes what it reports — the numbers here are not maintained by hand.

## Repository

| Item | Value |
|---|---|
| Branch | `arena/f721e253-trade` |
| HEAD | `c773d60a12bafc22eaebd413cea86a1d8e5c2ff9` |
| Parent | `2826a67986deed726ddf105c64c29d35cf431069` |
| Tree ID | `5f88a7e891e34a69ac01ebd7216a93020e18c165` |
| Commits in history | 10 (complete) |
| Tracked files | 496 |
| Working tree at generation | 4 modified entries (this document was regenerated before the commit that records it — see git log) |

A generated document cannot name the commit that contains it. The HEAD above is therefore the commit the
generator ran against; when it shows modified entries, the commit that records this manifest is the next one on the
branch. Requirements 1 and 8 of the audit use it accordingly: `scripts/verify_report_consistency.js`
requires that this HEAD is an ancestor of the current one, that the recorded commit count is no larger than the
actual count, and that every bundle listed below exists — never that the two hashes are equal.

## Recovery bundles

Every bundle present in `backups/` is listed below. The inventory is measured by
`scripts/audit_bundles.js`, which verifies each bundle, restores it into a temporary clone, and (with
`--full`) installs the pinned dependencies and runs the suites inside that clone. Bundles are **never**
patched, renamed or deleted: an older bundle is a historical snapshot and is expected to reproduce the defects
that existed when it was taken.

**No recovery bundle exists on this machine.** The audit recorded this absence explicitly (`state: NONE_PRESENT`, verdict `NO_BUNDLE_EXISTS`) instead of reporting an empty success. Nothing here can be restored from; see the destroyed-bundle table below for what was lost and how it is known.

Bundles on disk: 0.

There is no bundle to restore from. The last measurement of this workspace before the loss is recorded in the archive table below; it is a record, not a copy.



**Shallow-source trap (REC-004).** A bundle created from a shallow clone lacks its parents: `git bundle verify`
still reports success, but cloning it fails with `Could not read <sha>` / `remote did not send all necessary objects`.
This workspace came back from the eighth reset as a one-commit shallow clone, so the trap was live here. Run
`git fetch --unshallow` before creating any bundle, and treat the clone check — not the verify command — as
the gate. The audit records `workspaceShallow` in its artefact.

**Verified integrity note (REC-001).** `git bundle verify` checks the header and prerequisites only. It
reports `is okay` for a bundle whose pack is truncated, while cloning that bundle fails with
`early EOF`. The integrity claim for each bundle above therefore comes from the restore (clone +
`git fsck --full`), never from that command. `scripts/test_bundle_audit.js` keeps a regression
test for exactly this, so the command cannot quietly return to being treated as proof.

**Durability, measured (REC-002).** An earlier version of this manifest claimed the `backups/` directory
survived environment resets because it sits inside the workspace. The seventh reset disproved it: every bundle
was destroyed while untracked, **not-ignored** files (`CONFIGURATION.md`, `requirements.txt`,
this manifest) survived. The working rule is that the workspace snapshot keeps files git does not ignore and
drops ignored paths, along with anything outside the repository root. Bundles are therefore session-local,
survive no reset, and **must be regenerated after one**:

`mkdir -p backups && git bundle create backups/repo_all_refs_$(date +%Y%m%dT%H%M%S).bundle --all`
`node scripts/audit_bundles.js --full --python=<venv>/bin/python`
`node scripts/build_bundle_archive_register.js`
`node scripts/generate_recovery_docs.js`

**Recorded but no longer present.** The bundles below were audited, recorded and then destroyed — six by the
seventh reset, eight by the eighth. They are listed so that a destroyed backup is never read as one that was never made, and so the older
snapshots stay accounted for. **None of them can be restored.** Nothing was recovered from them, and no claim in
this document depends on their contents. The HEAD hashes are the values the audit recorded at the time; those
commits no longer exist in this repository (`git cat-file -t` reports them missing), so they are quoted as
history, not as verifiable identities.

| File | Bytes | HEAD as recorded | Commits | Recorded pytest | Recorded TEST-003 | Evidence for this row |
|---|---|---|---|---|---|---|
| `repo_all_refs_20261118T023531.bundle` | 1724900 | `413c0b3` | 9 | 388 passed, 1 failed | 11 passed, 1 failed | recorded only — source commit `4f0420b` is absent |
| `repo_all_refs_20261118T024147.bundle` | 1740159 | `cddfe3d` | 10 | 388 passed, 1 failed | 11 passed, 1 failed | recorded only — source commit `4f0420b` is absent |
| `repo_all_refs_20261118T025017.bundle` | 1744760 | `8271770` | 12 | 388 passed, 1 failed | 11 passed, 1 failed | recorded only — source commit `4f0420b` is absent |
| `repo_all_refs_20261118T025639.bundle` | 1751413 | `a56f58d` | 13 | 390 passed | 13 passed | recorded only — source commit `4f0420b` is absent |
| `repo_all_refs_20261118T030624.bundle` | 1756778 | `962900c` | 15 | 390 passed | 13 passed | recorded only — source commit `4f0420b` is absent |
| `repo_all_refs_20261118T032321.bundle` | 1768652 | `16b028c` | 17 | 390 passed | 13 passed | recorded only — source commit `4f0420b` is absent |
| `repo_all_refs_20261118T032901.bundle` | 1747015 | `4f0420b` | 9 | 390 passed | 13 passed | audit artefact survives (`2826a67`) |
| `repo_all_refs_20261118T033418.bundle` | 1763771 | `244fa89` | 10 | 390 passed | 13 passed | audit artefact survives (`2826a67`) |
| `repo_all_refs_20261118T033529.bundle` | 1766400 | `69ebd04` | 11 | 390 passed | 13 passed | audit artefact survives (`2826a67`) |
| `repo_all_refs_20261118T034025.bundle` | 1768211 | `7ec6ac5` | 12 | 390 passed | 13 passed | audit artefact survives (`2826a67`) |
| `repo_all_refs_20261118T034655.bundle` | 1777482 | `179f54e` | 14 | 390 passed | 13 passed | audit artefact survives (`2826a67`) |
| `repo_all_refs_20261118T035249.bundle` | 1784340 | `3525964` | 16 | 390 passed | 13 passed | audit artefact survives (`2826a67`) |
| `repo_all_refs_20261118T035947.bundle` | 1791350 | `f228a8d` | 20 | 390 passed | 13 passed | audit artefact survives (`2826a67`) |
| `repo_all_refs_20261118T040208.bundle` | 1793535 | `80c9660` | 22 | 390 passed | 13 passed | audit artefact survives (`2826a67`) |

Evidence split: 8 row(s) rest on an audit artefact that is still in this repository; 6 rest on a source commit that no longer exists and are UNVERIFIABLE beyond the fact that they were recorded. Every row was produced by a real measurement (the bundle was cloned, fsck'd and tested) at the time it was written — none of those files exists now.

Three of those six carried the pre-TEST-003 defect (`388 passed, 1 failed`, TEST-003 `11 passed, 1 failed`);
their recorded results are shown as they were measured, never as green. The three later ones passed 390.

**Per-bundle consistency nuance (REC-003).** The two oldest of the eight recorded in the second batch
(`…032901`, `…033418`)
were cut before `69ebd04`, which taught the verifier that a clone legitimately has no `backups/`
directory. Restoring them and running the consistency check inside reports `REPORT_ARTIFACT_MISMATCH` —
a stale-tooling artefact, not a data problem: their pytest, TEST-003, adversarial, environment, mutation and secret
results are all as recorded. Later bundles verify clean inside the clone. Neither result has been relabelled.

Status remains `DURABLE_BACKUP_NOT_ESTABLISHED`, and it is now stronger than a caution: fourteen bundles
were created on this machine and none exists anywhere today. There is no off-machine copy, so there is nothing to
restore. Only an independently restored off-machine copy, verified by someone other than the agent that wrote it,
would change this.

## Dependencies

| Ecosystem | Command | Lock/pin |
|---|---|---|
| Node | `npm ci` | `package-lock.json` (lockfileVersion 3, 537 packages) |
| Node build step | `npm run test:prep` | compiles `src/lib/*.ts` to `dist_test_cjs/` |
| Python | `pip install --break-system-packages -r requirements.txt` | pinned in `requirements.txt` |
| Python UI tests | `QT_QPA_PLATFORM=offscreen` | required for PySide6 headless |

Packages that were missing in a fresh environment and caused four gates to fail are now pinned:
`requests`, `PySide6`, `pyotp`, `pandas_market_calendars`. A missing package
makes pytest *collection* fail (exit 2) — that is an environment failure and must not be reported as a code
regression.

## External datasets

| File | Bytes | Git blob SHA-1 | Source repository | Licence |
|---|---|---|---|---|
| NIFTY50_1min_2022.csv | 60,19,857 | `4f05c9804c956b8662dabb7d106b1e4702f3a77e` | technovusin/nifty50-historical-data | MIT |
| NIFTY50_1min_2023.csv | 59,75,228 | `eec7d0efbfab465e9c686c8e9479c875fc60c2bd` | technovusin/nifty50-historical-data | MIT |
| NIFTY50_1min_2024.csv | 60,14,477 | `35e0c5727c29b50e54c91ca756126c1697adb557` | technovusin/nifty50-historical-data | MIT |
| 20200108.csv | 78,50,611 | `e30c473ef60b732aa5bf53275e5cef66d8cfb3dc` | hunterabhi/daily-1-minute-eod-data | NO LICENCE |
| 20200110.csv | 79,11,222 | `91521f18604ff4a158ac9ddcc7710be7d2c1aed4` | hunterabhi/daily-1-minute-eod-data | NO LICENCE |

Notes that must not be lost:

- A matching blob SHA proves **byte identity with a previously fetched file**, not exchange authenticity.
- The `hunterabhi` repository states **no licence**; those two files are internal research only and must
  not be redistributed.
- All five files are **NIFTY index** data. They are not equity-instrument data, and they cannot lift the
  `INSTRUMENT_INCOMPATIBLE_FOR_EQUITY_VALIDATION` block.

## Artefacts a recovery must preserve

| Artefact | Purpose |
|---|---|
| `data/security/application_defects.json` | 11 defect entries with reproduction and verification |
| `RELEASE_REGISTER.md` | single authoritative defect/release register |
| `FINAL_HANDOVER.md` | responsible-party handover (account owner / evidence / code) |
| `MISSING_EVIDENCE_REGISTER.md` | 26 cost heads with authority, date range, criterion |
| `CONFIGURATION.md` + `.env.example` | six environment variables, placeholders only |
| `scripts/adversarial_api_probe.js` | 48-case mutation-boundary matrix |
| `scripts/env_config_probe.js` | 43-case environment-configuration probe |
| `scripts/mutation_check.js` | 5-mutant gate proving the suites can fail |
| `scripts/run_regression_record.js` | 21-gate regression record |
| `scripts/verify_report_consistency.js` | report-vs-artefact consistency (82 claims) |
| `FINAL_READINESS_REPORT/GIT_HISTORY_REMEDIATION_PLAN.md` | history exposure plan (not executed) |
