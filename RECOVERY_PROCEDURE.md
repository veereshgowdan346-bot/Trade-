# Recovery Procedure

OmniTradePro Apex V2.0 · generated 2026-11-18T04:43:52.976Z.

Written so a fresh environment can rebuild and verify this project **without any chat history**. Follow it in
order; each step states what success looks like.

> **Mode: RESEARCH / PAPER ONLY.** Do not configure broker credentials, do not enable live trading, do not push
> to a remote unless the owner explicitly asks.

## Step 0 — Determine what you actually have

`git rev-parse --abbrev-ref HEAD; git rev-parse HEAD; git rev-parse HEAD^; git rev-list --count HEAD`

- `fatal: ambiguous argument 'HEAD^'` means a 1-commit shallow clone: this workspace has been reset and
  any commit hash from a previous session **cannot be trusted** until it resolves.
- `[ -f .git/shallow ] && echo shallow` confirms it.

## Step 1 — Restore full history

`git fetch --unshallow` → `git rev-list --count HEAD` should return the full count, and
`.git/shallow` must be gone.

## Step 2 — Inspect the working tree before trusting anything

`git status --porcelain`

After a reset the commits are lost but **the files are usually still there** as uncommitted changes. Verify content,
not hashes:

`python3 -c "import json;print(len(json.load(open('data/security/application_defects.json'))['defects']))"`
→ expects `11`.

If the artefacts are present, re-commit them (Step 6) before doing anything else.

## Step 3 — Rebuild dependencies

`npm ci` → exit 0; creates `node_modules` from the lockfile.
`npm run test:prep` → exit 0; creates `dist_test_cjs/` (the probes run against this build).
`pip install --break-system-packages -r requirements.txt` → exit 0.

A missing package makes pytest fail at *collection* (exit 2). That is an environment failure, not a code
regression — fix the environment and re-run rather than recording a failure.

## Step 4 — Restore the external datasets

The five CSVs are not in Git (`data/external/` is ignored). Fetch them and verify identity:

`curl -sL https://codeload.github.com/technovusin/nifty50-historical-data/tar.gz/refs/heads/main | tar xz --strip-components=1 --wildcards '*/1min/*'`
`curl -sL https://codeload.github.com/hunterabhi/daily-1-minute-eod-data/tar.gz/refs/heads/master | tar xz --wildcards '*.csv'`

Place these five files in `data/external/nse/` and check each with
`git hash-object <file>` against the table in `RECOVERY_MANIFEST.md`. All five must match.
Then run `node scripts/import_external_data.js` (exit 0).

## Step 5 — Verify the build before trusting a regression result

`node scripts/adversarial_api_probe.js` → `48 passed, 0 failed`
`node scripts/env_config_probe.js` → `43 passed, 0 failed`
`node scripts/mutation_check.js` → `5/5 mutants detected`
`node scripts/test_bundle_audit.js` → `27 passed, 0 failed` (the inventory tooling fails when it should)
`node scripts/audit_safety.js` → `PAPER_ONLY_SAFETY_PASS`

These figures were last reproduced in the workspace at the commit recorded above. They were previously reproduced
inside clones of recovery bundles; no bundle exists now, so only the workspace path is currently available. A
failure here means the environment or the restore is wrong — not that the project regressed.

## Step 6 — Re-establish the commit line

If the artefacts survived as uncommitted changes:

`git add -A && git commit -m "Recover work after sandbox reset"`

Record the new HEAD. It will **not** match any hash from an earlier session, and it must not be reported as if it
does. The tree content is what matters.

## Step 7 — Full regression

`node scripts/run_regression_record.js` → `21/21 gates as expected`.

Expected non-zero: `test:history` exits 1 **by design** while the 36 historical findings remain
reachable from origin/master. Reporting it as passing would be false.

## Step 8 — Rebuild the recovery bundle

Durability is out of scope for a local bundle and is covered by `OFF_MACHINE_BACKUP_HANDOFF.md`: only a copy
restored from a different machine upgrades `DURABLE_BACKUP_NOT_ESTABLISHED`.

No bundle exists at the time of writing (see the destroyed-bundle table). Rebuilding one does not make the
inventory complete — it only re-establishes this machine's ability to produce one. Until a copy is restored from
somewhere else, `DURABLE_BACKUP_NOT_ESTABLISHED` stays.

`mkdir -p backups && git bundle create backups/repo_all_refs_$(date +%Y%m%dT%H%M%S).bundle --all`
`git bundle verify backups/*.bundle` → `The bundle records a complete history`
`git clone backups/<bundle> /tmp/restore-check` → compare `git rev-parse HEAD^{tree}` with the original.

Then re-run `node scripts/generate_recovery_docs.js` so `RECOVERY_MANIFEST.md` carries the new
hash, and **copy the bundle off-machine**. Until that copy exists and has been restored from, the status is
`DURABLE_BACKUP_NOT_ESTABLISHED`.

## Bundle integrity: do not trust `git bundle verify` alone

`git bundle verify` reads the bundle header and prerequisites. It prints `is okay` and exits 0 for a
bundle whose pack is truncated — cloning that same file fails with `fatal: early EOF`. Treat a bundle as
sound only when all of the following hold:

1. `git clone <bundle> <dir>` succeeds,
2. `git fsck --full` in that clone is clean,
3. the clone's HEAD and tree match what the bundle is supposed to contain,
4. `node scripts/audit_bundles.js --full` records all of the above in
   `data/security/bundle_audit.json`.

## What must never be done during a recovery

- Do not `git reset --hard`, `git clean`, rebase, amend or force-push: the working tree may be the
  only surviving copy.
- Do not delete `backups/` or any bundle.
- Do not write a commit hash into a report without checking `git cat-file -t <hash>` first.
- Do not request, type or test real broker credentials; do not access the broker account.
