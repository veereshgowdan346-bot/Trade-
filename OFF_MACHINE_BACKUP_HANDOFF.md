# Off-Machine Backup Handoff

OmniTradePro Apex V2.0 · generated 2026-11-18T04:36:10.107Z by `scripts/generate_backup_handoff.js`.
Regenerate with `node scripts/generate_backup_handoff.js`; the facts below are read from the repository.

**Status: `DURABLE_BACKUP_NOT_ESTABLISHED`.** No off-machine copy exists. This document is a request, not
evidence of a backup, and nothing in the repository may be described as durable until section 5 is complete.

---

## 1. What is being backed up

| Item | Value |
|---|---|
| Branch | `arena/f721e253-trade` |
| HEAD | `0046eeb473ef5241202dcba66dbf183e0b07b2e1` |
| Parent | `c773d60a12bafc22eaebd413cea86a1d8e5c2ff9` |
| Tree | `38a1b9f037dc4fc7ba97fed0f787fb9a66e52932` |
| Commits in history | 11 (complete) |
| Tracked files | 496 |
| Repository status | full history, git fsck --full clean |

A restore test was run this pass from a bundle with sha256 `510c9d1505debd6092a6e5b66b4d6870…`
(17,87,771 bytes): clone exit 0, git fsck --full exit 0, 11 commits,
496 files, pytest 390 passed, adversarial 48 passed, 0 failed, environment 43 passed, 0 failed, mutation 5/5 mutants detected.
That bundle was deleted
afterwards — it was in the temporary directory, which is no more durable than `backups/`. The test proves
the source is restorable; it does not prove a copy exists.

## 2. Why you are being asked, and not the agent

14 recovery bundles are on record, and every one was
destroyed by an environment reset,
because `backups/` is git-ignored and the workspace snapshot drops ignored paths. Two further lessons from
this audit apply to any future attempt:

- `git bundle verify` exits 0 for a truncated or shallow-source bundle while the clone fails (REC-001,
  REC-004). A checksum or a verify line is not proof of restorability; only a successful clone plus
  `git fsck --full` is.
- No storage connector in this environment is authorised. Google Drive and Dropbox are present but disconnected;
  S3 and GitHub-as-storage are unavailable. Uploading to any of them requires the owner's explicit authorisation,
  which has not been given.

Pushing to the project's own remote is **not** an acceptable substitute: it would publish the historical commit
line that contains the 36 credential findings, which is the exposure this audit exists to contain.

## 3. What the owner must do (destination)

Choose storage the owner controls and can read back from a machine that is not this sandbox — an encrypted archive
on the owner's own disk plus a second copy elsewhere, a private cloud bucket, or an encrypted object under the
owner's account. Requirements:

1. It must not be this workspace, a folder inside it, or another directory on this sandbox.
2. It must be readable by the owner without the agent's involvement.
3. The copy must be encrypted if it leaves storage the owner physically controls.

## 4. Produce and upload (run by the owner, after authorising this workspace)

`git fetch --unshallow` — only if `git rev-parse --is-shallow-repository` prints `true`.
`git bundle create /tmp/apex_0046eeb.bundle --all`
`sha256sum /tmp/apex_0046eeb.bundle > /tmp/apex.sha256`
`git bundle verify /tmp/apex_0046eeb.bundle` — header check only; not evidence of integrity.
`git clone /tmp/apex_0046eeb.bundle /tmp/restore_check && cd /tmp/restore_check && git fsck --full`

Upload the `.bundle` and its `.sha256` to the chosen destination, then record in the register
which destination holds it, the date, and the SHA-256.

## 5. Verify the uploaded copy (the step that upgrades the status)

Perform these steps from a **different machine** against the **downloaded** copy, not the original:

| Step | Command | Expected |
|---|---|---|
| 1 | `sha256sum apex_0046eeb.bundle` | matches the recorded value |
| 2 | `git clone apex_0046eeb.bundle restored` | exit 0 |
| 3 | `cd restored && git rev-parse HEAD` | `0046eeb473ef5241202dcba66dbf183e0b07b2e1` |
| 4 | `git rev-list --count HEAD && git ls-files | wc -l` | 11 and 496 |
| 5 | `git fsck --full` | exit 0 |
| 6 | `npm ci && npm run test:prep` | exit 0 (Node 22.22.3 used here; pin your own) |
| 7 | `python3 -m pip install -r requirements.txt` | exit 0 (Python 3.11.2 used here) |
| 8 | `QT_QPA_PLATFORM=offscreen python3 -m pytest -q` | 390 passed |
| 9 | `node scripts/adversarial_api_probe.js` | 48 passed, 0 failed |
| 10 | `node scripts/env_config_probe.js` | 43 passed, 0 failed |
| 11 | `node scripts/mutation_check.js` | 5/5 mutants detected |
| 12 | `node scripts/audit_safety.js` | PAPER_ONLY_SAFETY_PASS |
| 13 | `node scripts/test_bundle_audit.js` | 26 passed, 0 failed |
| 14 | `OMNI_RESTORED_CLONE=1 node scripts/verify_report_consistency.js` | REPORT_MATCHES_ARTIFACTS |

Only when steps 1–14 have been completed against the downloaded copy, and the date and operator recorded, may
`DURABLE_BACKUP_NOT_ESTABLISHED` be replaced with `DURABLE_BACKUP_ESTABLISHED`. A checksum alone,
a successful upload, or a restore performed on this machine does **not** qualify.

## 6. What will not happen here

No upload, no connector authorisation, no push, and no new workspace-only bundle presented as a backup. The audit
stops at the boundary of what it can honestly claim.
