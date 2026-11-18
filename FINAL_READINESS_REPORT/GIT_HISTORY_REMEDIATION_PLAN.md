# Git History Remediation Plan (DEFENSIVE — NOT EXECUTED)

**Status: PLAN ONLY. No history was rewritten, no commit was deleted, no snapshot was removed, nothing
was pushed.**

Owner: repository owner (`veereshgowdan346-bot/Trade-`).
Prepared: 2026-11-18. Applies to the public GitHub remote `origin`.

---

## 1. What is exposed, and where

A digest-based scan of the **complete** local history (8 commits, 533 blobs, no shallow boundary)
found the broker client ID, API secret and TOTP seed in **36 findings across 6 commits**.

| Commit | Findings | Reachable from `origin/master` | Files |
|---|---|---|---|
| `c9b80bd2` (initial import) | 6 | **YES — public** | `SECURITY_AUDIT.md`, `scripts/scan_repo_secrets.py`, `scripts/scan_source_files.py` |
| `da4d4c82` | 6 | **YES — public** | same |
| `b9fff0e3` | 6 | **YES — public** | same |
| `1741aeb3` | 6 | **YES — public** | same |
| `6aba03f8` | 6 | **YES — public** | same |
| `60d7c41` (PR #1 merge) | 6 | **YES — public** | same |

Two commits are clean: `0f1d47d` (remediation) and `df52c08` (PR #2 merge). The current working tree
is also clean (0 blocking findings across 463 files).

**The material has been public since the initial commit `c9b80bd2`.** It is not confined to one commit,
and it is not confined to a recent window.

Honest framing of what this means:

- The exposure window is the entire published history, not a single bad push.
- The material sits in committed *source files* — a leaked-credential scanner script that contained the
  very literals it was meant to detect, plus an audit document.
- Any rewrite is a **cleanup of a copy**, not a reversal of the disclosure.

## 2. First action is rotation, not rewriting

Rewriting history while the credentials are still valid changes nothing about the risk. The value of
the leaked material disappears only when the broker account invalidates it.

Sequence must be:

1. **Rotate** the API key and TOTP seed in the broker's official security settings, and revoke the old
   API key explicitly (creating a new key is not the same as revoking the old one).
2. **Confirm** rotation out-of-band — from the broker's own account console, not from this repository.
3. **Only then** consider history remediation, and only if it is worth the cost described below.

Until step 2 is confirmed by the owner, security certification stays **BLOCKED**.

## 3. Risks of rewriting public history

These are the reasons this plan is deliberately conservative.

| Risk | Consequence |
|---|---|
| **It does not un-disclose anything** | Anyone who fetched, forked, or scraped the repo already has the blobs. GitHub may retain unreachable objects server-side for a period. Search engines and mirrors are outside your control. |
| **Forks keep the old history** | A fork's network is independent; force-pushing `master` does not alter existing forks. Forks must be enumerated and dealt with separately (or the repo made private and re-published). |
| **Caches** | GitHub's unauthenticated object cache can serve old commits by SHA for a while after a rewrite. Some commits stay retrievable by direct URL. |
| **Clones and backups** | Every developer clone, CI cache, and backup taken before the rewrite retains the material. These are unenumerable in practice. |
| **Collaborator disruption** | A force-push invalidates the history base of every open branch and PR. Open work must be rebased or re-created. |
| **Irreversibility without a verified backup** | A `filter-repo`/BFG run that is interrupted or mis-specified can destroy commit history permanently. |
| **Audit-trail loss** | Rewriting removes the evidence that the incident happened, which complicates any later compliance or incident review. |
| **False confidence** | A "clean" history after a rewrite can create the impression the credentials are safe, when only rotation makes them safe. |

Given the exposure already spans the initial commit, the incremental benefit of a rewrite is limited to
future clones — which is worth something, but is far smaller than rotation.

## 4. Protected recovery snapshot (do NOT delete)

Present on this machine, outside the repository, mode `0600`, directory `0700`:

```
/home/user/security_snapshot/
  repo_all_refs_20261118T003541.bundle      # complete history, all refs (1.6 MB)
  worktree_df52c08_20261118T003541.tar.gz   # working tree at df52c08 (1.4 MB)
```

`git bundle verify` confirms "The bundle records a complete history."

This bundle **contains the exposed material by design** — that is what makes it a usable recovery
point. It must not be moved into the repository, uploaded, or shared. Do not delete it until:

- rotation is confirmed, **and**
- a rewrite (if attempted) has completed and been verified, **and**
- the owner has confirmed the new remote state is correct.

Deleting it before those conditions removes the only local ability to inspect the pre-rewrite state.

## 5. Coordinated cleanup procedure (for the owner, later)

Only after rotation is confirmed. Nothing here is executed by this pass.

### Phase 0 — Decide whether to rewrite at all

Recommended default: **do not rewrite**, or defer. Rotation neutralises the credentials; a rewrite is
cosmetic cleanup with real risk. If the repository may ever face a compliance review, "we rotated within
N hours and documented it" is usually a stronger position than "we rewrote history".

If the owner does proceed:

### Phase 1 — Preparation

1. Verify the recovery bundle opens and the worktree tar extracts (on a scratch machine, not in place):
   `git clone /home/user/security_snapshot/repo_all_refs_*.bundle /tmp/verify_clone && git -C /tmp/verify_clone log --oneline | wc -l` → expect 8.
2. Take a **second** independent backup (a fresh mirror clone to a different disk/account):
   `git clone --mirror https://github.com/OWNER/REPO.git /backup/repo-mirror.git`.
3. Record the current tip: `git rev-parse origin/master` (today: `df52c08340e1a3ff9c7dff3edd830219fd000a8c`).
4. Freeze pushes: announce to collaborators, close or merge open PRs, disable branch protections that
   would block a force-push.
5. Enumerate forks: `gh api repos/OWNER/REPO/forks --paginate --jq '.[].full_name'` — each needs a
   separate decision.

### Phase 2 — Rewrite locally only

1. Install `git-filter-repo` (preferred over BFG; it is actively maintained and safer about refs).
2. Choose the narrowest rule that removes the literals **without** destroying legitimate history. Prefer
   replacing file *contents* over deleting whole commits:
   - `git filter-repo --replace-text replacements.txt` where `replacements.txt` maps each literal to
     `***REMOVED***` (build that file from the digests you already control, and **never commit it**).
3. Verify before publishing:
   - `git log --oneline | wc -l` is unchanged (8) — no commits lost;
   - a fresh digest scan of `--all` reports 0 findings;
   - the working tree at the new tip is byte-identical to `df52c08` (`git diff <new-tip> df52c08` empty).
4. Re-run the full test suite on the rewritten tree. Gates must be green before publishing.

### Phase 3 — Publish (destructive, requires explicit decision)

1. Force-push: `git push --force-with-lease origin master` (never bare `--force`).
2. Ask GitHub Support to purge cached views of the old commits, if the repo is sensitive enough to warrant it.
3. Decide on each fork: delete, contact owner, or leave (leaving them means the material stays public).
4. Rotate **again** if any doubt exists — a second rotation is cheap insurance.

### Phase 4 — Aftermath

1. Verify the public state: fresh clone in a temp dir, digest scan, expect 0 findings.
2. Keep the recovery bundle until the verification in step 1 passes, then destroy it
   (`shred -u` or equivalent) and record that it was destroyed.
3. Update the incident notes with: rotation timestamp, rewrite timestamp (if any), verification result.

## 6. What this pass did instead

- Scanned and reported, using digests only. Values displayed: **0**.
- Fixed the code defects that made the leak possible to recur (constant vault fallbacks, scanners
  containing literals).
- Preserved a verified recovery point before doing anything else.
- Rewrote nothing, deleted nothing, pushed nothing.

## 7. Blocking conditions for closing this item

The item cannot be closed until:

1. The owner confirms the API key was **revoked** and the TOTP seed **reset**, from the broker console.
2. A post-rotation digest scan of the current tree reports 0 findings (already true today).
3. The owner records a decision on history remediation — either "accepted risk, no rewrite" or a
   completed, verified rewrite.

Until 1 and 3 exist, `SECURITY-001` remains **BLOCKED** regardless of how clean the working tree is.
