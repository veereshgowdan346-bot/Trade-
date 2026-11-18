# Recovery Manifest

OmniTradePro Apex V2.0 · generated 2026-11-18T04:04:55.774Z by `scripts/generate_recovery_docs.js`.

This file is generated from the repository itself. Re-run `node scripts/generate_recovery_docs.js` after
any commit that changes what it reports — the numbers here are not maintained by hand.

## Repository

| Item | Value |
|---|---|
| Branch | `arena/f721e253-trade` |
| HEAD | `82e8c0b9a7b56b55d6c619ce90d550a125d52e2a` |
| Parent | `80c9660f9e046ce4e0619e8787f2d24ccd79e547` |
| Tree ID | `f69be7f59f6c92d8e13c4a51b6f369985c32e8f0` |
| Commits in history | 23 (complete) |
| Tracked files | 495 |
| Working tree at generation | 8 modified entries (this document was regenerated before the commit that records it — see git log) |

A generated document cannot name the commit that contains it. The HEAD above is therefore the commit the
generator ran against; when it shows modified entries, the commit that records this manifest is the next one on the
branch. Requirements 1 and 8 of the audit use it accordingly: `scripts/verify_report_consistency.js`
requires that this HEAD is an ancestor of the current one, that the recorded commit count is no larger than the
actual count, and that every bundle listed below exists — never that the two hashes are equal.

## Recovery bundles

Every bundle in `backups/` is listed below. The inventory is measured by
`scripts/audit_bundles.js`, which verifies each bundle, restores it into a temporary clone, and (with
`--full`) installs the pinned dependencies and runs the suites inside that clone. Bundles are **never**
patched, renamed or deleted: an older bundle is a historical snapshot and is expected to reproduce the defects
that existed when it was taken.

| Bundle | Bytes | SHA-256 | HEAD | Tree | Commits | Prereq check | pytest |
|---|---|---|---|---|---|---|---|
| `repo_all_refs_20261118T032901.bundle` | 17,47,015 | `2afe8bc12b1b5c22…` | `4f0420b` | `545e5c4` | 9 | ok (header only) | 390 passed |
| `repo_all_refs_20261118T033418.bundle` | 17,63,771 | `967819c663249ae9…` | `244fa89` | `168797b` | 10 | ok (header only) | 390 passed |
| `repo_all_refs_20261118T033529.bundle` | 17,66,400 | `3c805f8af67c3d16…` | `69ebd04` | `3c63b6e` | 11 | ok (header only) | 390 passed |
| `repo_all_refs_20261118T034025.bundle` | 17,68,211 | `c2a5dd4355d2889b…` | `7ec6ac5` | `a7e7584` | 12 | ok (header only) | 390 passed |
| `repo_all_refs_20261118T034655.bundle` | 17,77,482 | `32ff9f78fff352f4…` | `179f54e` | `05439b6` | 14 | ok (header only) | 390 passed |
| `repo_all_refs_20261118T035249.bundle` | 17,84,340 | `305bf432e083501d…` | `3525964` | `e0777bb` | 16 | ok (header only) | 390 passed |
| `repo_all_refs_20261118T035947.bundle` | 17,91,350 | `ecb93d44932aad83…` | `f228a8d` | `cad5e3c` | 20 | ok (header only) | 390 passed |
| `repo_all_refs_20261118T040208.bundle` | 17,93,535 | `972bab789e11f49f…` | `80c9660` | `7cd3b33` | 22 | ok (header only) | 390 passed |

All 8 bundles on disk reproduce the fixed suite (pytest 390, TEST-003 13 passed).

The newest bundle is the one to restore from:
`backups/repo_all_refs_20261118T040208.bundle` — 17,93,535 bytes, sha256 `972bab789e11f49fc434301ab62b9f79201db129bfdd146ca382338f797413e4`.
Prerequisite check: prerequisites ok (header only; pack checked by the clone). Independent restore test: bundle HEAD matches (80c9660) · tree matches (7cd3b33) · 22 commits · 495 tracked files · working tree clean · git fsck --full clean · workspace is 1 commit(s) ahead.

**Verified integrity note (REC-001).** `git bundle verify` checks the header and prerequisites only. It
reports `is okay` for a bundle whose pack is truncated, while cloning that bundle fails with
`early EOF`. The integrity claim for each bundle above therefore comes from the restore (clone +
`git fsck --full`), never from that command. `scripts/test_bundle_audit.js` keeps a regression
test for exactly this, so the command cannot quietly return to being treated as proof.

**Durability, measured (REC-002).** An earlier version of this manifest claimed the `backups/` directory
survived environment resets because it sits inside the workspace. The seventh reset disproved it: every bundle
was destroyed while untracked, **not-ignored** files (`CONFIGURATION.md`, `requirements.txt`,
this manifest) survived. The working rule is that the workspace snapshot keeps files git does not ignore and
drops ignored paths, along with anything outside the repository root. Bundles are therefore session-local and
**must be regenerated after a reset**:

`mkdir -p backups && git bundle create backups/repo_all_refs_$(date +%Y%m%dT%H%M%S).bundle --all`
`node scripts/audit_bundles.js --full --python=<venv>/bin/python`
`node scripts/generate_recovery_docs.js`

**Recorded but no longer present.** The bundles below were audited, recorded and then destroyed by the seventh
reset. They are listed so that a destroyed backup is never read as one that was never made, and so the older
snapshots stay accounted for. **None of them can be restored.** Nothing was recovered from them, and no claim in
this document depends on their contents. The HEAD hashes are the values the audit recorded at the time; those
commits no longer exist in this repository (`git cat-file -t` reports them missing), so they are quoted as
history, not as verifiable identities.

| File | Bytes | SHA-256 (prefix) | HEAD as recorded (object absent) | Commits | Files | Recorded pytest | Recorded TEST-003 |
|---|---|---|---|---|---|---|---|
| `repo_all_refs_20261118T023531.bundle` | 1724900 | `b955f8cd2c88f8c1`… | `413c0b38ab01f92247596fd8bc877314b4a72523` | 9 | 485 | 388 passed, 1 failed | 11 passed, 1 failed |
| `repo_all_refs_20261118T024147.bundle` | 1740159 | `38a57b0a3fb7f363`… | `cddfe3d3dc54bfacddc01d465bff5662a9f82c6d` | 10 | 489 | 388 passed, 1 failed | 11 passed, 1 failed |
| `repo_all_refs_20261118T025017.bundle` | 1744760 | `75e724b6e27787b8`… | `8271770c36b4a6cf37758dfa0f4d29b4c6ac519f` | 12 | 489 | 388 passed, 1 failed | 11 passed, 1 failed |
| `repo_all_refs_20261118T025639.bundle` | 1751413 | `6fbd7a24fc7274c5`… | `a56f58d6d1f8e44691b8125494301b267d903413` | 13 | 489 | 390 passed | 13 passed |
| `repo_all_refs_20261118T030624.bundle` | 1756778 | `4dacd6077ca260ac`… | `962900cc6a9079fd94b35e54bb0d818e4e343c20` | 15 | 489 | 390 passed | 13 passed |
| `repo_all_refs_20261118T032321.bundle` | 1768652 | `4b5563d0cfd72081`… | `16b028cc30c5f7ba849bf88f901ec203911978b2` | 17 | 491 | 390 passed | 13 passed |

Source: `4f0420b74230e3220e00e957d355828c93bea49f` · seventh workspace reset (2026-11-18): the snapshot drops git-ignored paths, and backups/ is ignored

Three of those six carried the pre-TEST-003 defect (`388 passed, 1 failed`, TEST-003 `11 passed, 1 failed`);
their recorded results are shown as they were measured, never as green. The three later ones passed 390.

**Per-bundle consistency nuance (REC-003).** The oldest two bundles on disk (`…032901`, `…033418`)
were cut before `69ebd04`, which taught the verifier that a clone legitimately has no `backups/`
directory. Restoring them and running the consistency check inside reports `REPORT_ARTIFACT_MISMATCH` —
a stale-tooling artefact, not a data problem: their pytest, TEST-003, adversarial, environment, mutation and secret
results are all as recorded. Later bundles verify clean inside the clone. Neither result has been relabelled.

Status remains `DURABLE_BACKUP_NOT_ESTABLISHED`: bundles exist only on one machine, none off-machine, and
none has survived a reset. Only an independently restored off-machine copy would change that.

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
