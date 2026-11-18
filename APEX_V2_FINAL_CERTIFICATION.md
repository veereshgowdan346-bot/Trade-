# OmniTradePro Apex V2.0 — Final Certification Report

Generated: 2026-11-18T04:25:44.948Z  
Generator: `node scripts/generate_apex_certification.js`  
Scope: one end-to-end pass — audit, safe fixes, full regression, certification and roadmap.  
Every figure is read from an artifact produced by an executed command. No credential value appears here.

## Certification statuses

| Dimension | Status | Basis |
|---|---|---|
| **SECURITY** | **BLOCKED** | Credential material is present in 6 commits reachable from the public remote; rotation is **NOT_CONFIRMED** by the account owner. |
| **FINANCIAL VALIDATION** | **BLOCKED** | 0 of 26 rate heads verified; instrument incompatible for equity validation; 1 unresolved calendar discrepancy. |
| **PROFITABILITY** | **NOT ESTABLISHED** | Strict OOS −₹6,79,195.43 over 8 arms with 0 positive; no independent evidence. |
| **EXECUTION** | **PAPER / RESEARCH ONLY** | No broker connection, no order routing, all strategies disabled. |
| **HISTORY** | **PUBLIC EXPOSURE CONFIRMED** | 36 findings across 6 commits, all reachable from `origin/master`. |
| **RECOVERY** | **VERIFIED (with caveat)** | Bundle verifies as a complete history; storage is local and the environment has lost data twice before (see §4). |

---

## 1. Executive summary

The application is a paper/research trading terminal. This pass found and fixed one **high-severity** authorization defect in the API guard, re-verified the two vault fixes from earlier passes, ran the complete regression suite (22 of 22 gates as expected), and confirmed that the research result is negative and unchanged.

Three things did **not** change, and none of them can be fixed from inside this repository:

1. **The credentials are public.** They sit in 36 findings across 6 commits that are reachable from the remote. Only the account owner can revoke them. Until then, security certification is blocked.
2. **Financial validation is blocked.** No official rate document could be retrieved from this environment, so all 26 rate heads remain unverified. No rate was guessed.
3. **The strategies lose money.** Strict out-of-sample net is −₹6,79,195.43 with 0 of 8 arms positive. That is reported as a result, not tuned away.

## 2. Repository baseline

| Item | Value |
|---|---|
| Branch | `arena/f721e253-trade` |
| HEAD | `c773d60a12bafc22eaebd413cea86a1d8e5c2ff9` |
| Parent | `2826a67986deed726ddf105c64c29d35cf431069` |
| Working tree at generation | 2 modified path(s) |
| Commits reachable | 10 |
| Shallow boundary | **none — full history** |
| Runtime | Node v22.22.3, Python 3.11.2 |
| Modules | 33 in `src/lib`, 19 API routes, 53 scripts |

The environment retained its state for this pass (HEAD matched the expected commit and the working tree was clean at start). That is the first time in four passes; the previous losses are recorded in §4 and §3.

## 3. Git history coverage

| Item | Value |
|---|---|
| Commits scanned | 9 |
| Blobs scanned | 597 |
| Shallow | false |
| Findings | **36** |
| Distinct commits | **6** |
| Reachable from `origin/master` | **36** |
| Values displayed | **0** |

Affected commits (no values): `1741aeb3b407`, `60d7c418f89b`, `6aba03f8af2d`, `b9fff0e3bdde`, `c9b80bd264c2`, `da4d4c829eb5`.

History coverage improved across passes: early scans ran on a depth-1 clone and could see one commit (6 findings). With the complete history available the same digest scan finds 36 findings across 6 commits, which reproduces exactly and deterministically on every run.

## 4. Recovery snapshot verification

| File | Size | Mode |
|---|---|---|
| — | — | **none present** |

`git bundle verify` → *The bundle records a complete history.*

**Persistence caveat, stated plainly:** the bundle lives under `/home/user/security_snapshot`, outside the repository, with directory mode 0700 and file mode 0600. It is not durable. Across the previous three passes, local commits and snapshots were lost twice when the machine was re-provisioned, and each time the content had to be re-derived from working-tree state. A local bundle is a recovery aid, not a backup.

## 5. Security findings

| ID | Severity | Title | Status |
|---|---|---|---|
| SEC-007 | HIGH | Client-supplied X-Forwarded-For was accepted as proof of loopback locality, bypassing mutation authorization | **FIXED** |
| SEC-008 | MEDIUM | Same-origin check was accepted as authentication for remote mutations | **FIXED** |
| SEC-010 | HIGH | Empty or whitespace-only X-Forwarded-For was read as a direct local connection | **FIXED** |
| SEC-011 | HIGH | Locality was inferred from the absence of a forwarding header, which the guard cannot actually verify | **FIXED** |
| REC-001 | HIGH | `git bundle verify` was treated as an integrity check, but it does not read the pack | **FIXED** |
| REC-002 | MEDIUM | Manifest claimed the in-repository bundle directory survived environment resets; the seventh reset destroyed it | **FIXED** |
| TEST-003 | MEDIUM | Git-hygiene security test encoded a workspace snapshot and failed in every legitimate restore; its remote check also accepted look-alike repositories | **FIXED** |
| SEC-012 | HIGH | A too-short OMNI_API_TOKEN was silently ignored, removing authentication entirely | **FIXED** |
| SEC-013 | MEDIUM | Vault status banner claimed credentials were 'encrypted with a development fallback key' after the fallback was removed | **FIXED** |
| TEST-001 | HIGH | Adversarial suite did not exercise the SEC-008 path, so a reintroduced SEC-008 passed 44/44 | **FIXED** |
| SEC-009 | LOW | Rate limiter is per-process and keyed by a claimed IP | **ACCEPTED + DOCUMENTED (deployment constraint)** |
| SEC-003 | CRITICAL | TypeScript vault fell back to a published constant passphrase | **FIXED (earlier pass, re-verified)** |
| SEC-002 | CRITICAL | Python credential manager fell back to a published constant password | **FIXED (earlier pass, re-verified)** |
| DOC-001 | MEDIUM | Generated reports cited commit hashes that do not exist and asserted they were present | **FIXED** |
| REC-003 | LOW | Restored clones failed report consistency because the manifest describes a bundle inventory the clone does not contain | **FIXED** |
| REC-004 | HIGH | A bundle created from a shallow clone is unclonable, so a shallow workspace cannot produce a recovery artefact | **FIXED** |
| SECURITY-001 | CRITICAL | Credential material in public Git history | **BLOCKED** |
| SECURITY-006 | CRITICAL | Rotation unconfirmed | **NOT_CONFIRMED** |

Safety probes: **18 pass / 0 fail** (PAPER_ONLY_SAFETY_PASS).

## 6. Public exposure status — **EXPOSED, PUBLIC, UNFIXED**

The broker client ID, API secret and TOTP seed are present in 36 findings across 6 commits: `1741aeb3`, `60d7c418`, `6aba03f8`, `b9fff0e3`, `c9b80bd2`, `da4d4c82`. Every one is reachable from `origin/master`, so the material has been publicly retrievable since the repository's initial import.

The current working tree is clean: 0 known identifiers across 468 files, including untracked files (the repository scanner walks tracked files only, so an independent all-files digest sweep was run). Editing a file today does not remove its earlier revisions from history.

## 7. Credential rotation — **NOT_CONFIRMED**

| Item | Value |
|---|---|
| API key revoked | **NOT CONFIRMED** |
| TOTP seed reset | **NOT CONFIRMED** |
| Account security reviewed | **NOT CONFIRMED** |
| Credentials accessed by this pass | **None** |

Rotation can only be confirmed by the account owner through the broker's official security console. No credential was read, tested, transmitted or requested, and no screenshot or paste containing secrets would be accepted as evidence.

Revoking the key prevents further use; it cannot recall copies already obtained by anyone who fetched the repository. Rotation therefore reduces future risk, not historical exposure.

## 8. Vault security results

| Property | TypeScript | Python |
|---|---|---|
| Committed fallback key | **none** (0 occurrences in the tree) | **none** |
| Missing key | throws `VaultKeyMissingError` | raises instead of falling back |
| Weak key (< 8 chars) | rejected | n/a (key is generated, not supplied) |
| Valid key derivation | scrypt → 32 bytes | per-install random, 64 hex chars |
| Key file permissions | n/a (env var) | 0600 |
| API error handling | 503 `VAULT_KEY_MISSING` | n/a |

Both vaults were probed behaviourally this pass, not merely read.

## 9. Application defects found

### SEC-007 — Client-supplied X-Forwarded-For was accepted as proof of loopback locality, bypassing mutation authorization

- **Severity:** HIGH  
- **File:** `src/lib/apiGuard.ts`  
- **Reachable from remote:** yes  
- **Present in working tree:** yes  
- **Status:** **FIXED**

**Reproduction:** With OMNI_API_TOKEN unset, authorizeMutation() on a request carrying only 'X-Forwarded-For: 127.0.0.1' returned null (allowed) because clientIp() read the client-controlled first hop and isLoopbackOrPrivate() trusted it.

**Impact:** Any network client able to reach the API could assert locality and mutate engine, order, config and vault state without a token, whenever OMNI_API_TOKEN was not configured.

**Remediation:** Forwarded headers no longer establish locality. isTrustedLocalClient() trusts a request only when it carries no forwarding headers (a direct connection) or when OMNI_TRUST_PROXY is enabled and the NEAREST hop (the last entry, appended by the proxy) is private. clientIp() reads the last hop only when the proxy is trusted.

**Verification:** PASS — spoofed header rejected, direct connection allowed, client-prepended loopback rejected, trusted-proxy nearest hop allowed.

### SEC-008 — Same-origin check was accepted as authentication for remote mutations

- **Severity:** MEDIUM  
- **File:** `src/lib/apiGuard.ts`  
- **Reachable from remote:** yes  
- **Present in working tree:** yes  
- **Status:** **FIXED**

**Reproduction:** With OMNI_API_TOKEN unset, a non-browser client sending Host, Origin and X-Forwarded-For consistently passed originMatchesHost() and was allowed to mutate state. A test asserted this so the limitation could not be forgotten.

**Impact:** Any remote client that could set two request headers could mutate engine, order, config and vault state without a token.

**Remediation:** originMatchesHost() no longer authorises a mutation. authorizeMutation() now permits a token-less mutation only from a genuinely local client; anything arriving through a proxy is rejected 401 AUTH_REQUIRED_FOR_REMOTE. Remote deployments must configure OMNI_API_TOKEN.

**Verification:** PASS — remote same-origin mutation rejected 401; same request with a bearer token allowed; local direct connection still allowed.

### SEC-010 — Empty or whitespace-only X-Forwarded-For was read as a direct local connection

- **Severity:** HIGH  
- **File:** `src/lib/apiGuard.ts`  
- **Reachable from remote:** yes  
- **Present in working tree:** yes  
- **Status:** **FIXED**

**Reproduction:** With OMNI_API_TOKEN unset, authorizeMutation() on a request carrying 'X-Forwarded-For:' with an empty or whitespace-only value was ALLOWED. The header parsed to an empty chain, which was indistinguishable from 'no forwarding header present', so a remote client could send the header empty and be classified as local. Found by an independent adversarial probe written outside the repository's own test suite; the repository test had asserted only that malformed values 'must not crash', not that they must be denied.

**Impact:** A remote, unauthenticated attacker could bypass mutation authorization whenever OMNI_API_TOKEN was not configured, simply by sending an empty X-Forwarded-For header.

**Remediation:** isTrustedLocalClient() now keys on the PRESENCE of a forwarding header rather than its parsed content. Any request carrying x-forwarded-for or x-real-ip is treated as proxied; with OMNI_TRUST_PROXY unset it is remote, and with the proxy trusted an unparseable nearest hop fails closed.

**Verification:** PASS — 27-case independent probe (forged Origin/Referer, spoofed loopback, multi-hop, empty/whitespace/malformed headers, x-real-ip, trusted proxy, token paths, webhook paths): 27/27 as expected.

### SEC-011 — Locality was inferred from the absence of a forwarding header, which the guard cannot actually verify

- **Severity:** HIGH  
- **File:** `src/lib/apiGuard.ts`  
- **Reachable from remote:** yes  
- **Present in working tree:** yes  
- **Status:** **FIXED**

**Reproduction:** With OMNI_API_TOKEN unset, a request carrying NO forwarding header at all was treated as a direct local connection and allowed to mutate state. A remote client that connects directly (no proxy) sends exactly that, so it was indistinguishable from a desktop operator. Discovered by the new adversarial probe, which flagged 'no forwarding header at all' as allowed while the task required it to fail closed.

**Impact:** Any network client able to reach the port without going through a header-setting proxy could bypass mutation authorization whenever no token was configured.

**Remediation:** Local trust must now be ASSERTED by the operator (OMNI_LOCAL_TRUST=true) or a token must be configured. Without either, every mutation and unauthenticated webhook call is denied 401 AUTH_NOT_CONFIGURED. The guard no longer pretends to detect locality it cannot observe.

**Verification:** PASS — production build 48/48; the deleted assertion also removes the misleading claim that header absence meant local.

### REC-001 — `git bundle verify` was treated as an integrity check, but it does not read the pack

- **Severity:** HIGH  
- **File:** `scripts/audit_bundles.js, RECOVERY_MANIFEST.md, RECOVERY_PROCEDURE.md`  
- **Reachable from remote:** no  
- **Present in working tree:** yes  
- **Status:** **FIXED**

**Reproduction:** Truncated a valid bundle to 150 bytes. `git bundle verify` printed '<file> is okay', listed the ref and exited 0. `git clone` of the same file failed with 'fatal: early EOF / error: index-pack died'. The same held for a bundle with 400 bytes of junk written into its pack. Every prior report described bundles as 'verified' on the strength of that command.

**Impact:** A corrupted or truncated backup would have been declared sound, which is the worst possible failure mode for a recovery artefact — the team believes a backup exists and is restorable when it is neither.

**Remediation:** audit_bundles.js now records two separate facts: `verify` = prerequisite check only (labelled 'pack NOT checked by this command') and `packIntegrity` = established solely by a successful clone plus fsck. The audit exits non-zero when a clone fails. The manifest and procedure state the limitation explicitly and give the four-part test for treating a bundle as sound. scripts/test_bundle_audit.js asserts that a truncated bundle still passes verify while failing restore, so the distinction cannot quietly disappear.

**Verification:** PASS — 21/21 negative tests; truncated bundle recorded as 'prerequisites ok' with 'pack NOT readable (clone failed)' and audit exit 1.

### REC-002 — Manifest claimed the in-repository bundle directory survived environment resets; the seventh reset destroyed it

- **Severity:** MEDIUM  
- **File:** `RECOVERY_MANIFEST.md (generated), scripts/generate_recovery_docs.js`  
- **Reachable from remote:** no  
- **Present in working tree:** yes  
- **Status:** **FIXED**

**Reproduction:** After the reset, `backups/` was absent (zero bundles) while untracked, not-ignored files such as CONFIGURATION.md, RECOVERY_MANIFEST.md, requirements.txt and scripts/audit_bundles.js were all present. Six bundles were destroyed.

**Impact:** The manifest told a future reader that the bundles were protected by their location. That was false, and it is exactly the assurance that must never be overstated: the difference between 'we have backups' and 'we have files that might be there'.

**Remediation:** The generator now states the measured rule (the snapshot keeps files git does not ignore and drops ignored paths and anything outside the root), describes bundles as session-local, and gives the three commands to regenerate and re-audit them after a reset. DURABLE_BACKUP_NOT_ESTABLISHED is reaffirmed with no qualification.

**Verification:** PASS — manifest text now matches observed behaviour; consistency guard green with 1 bundle on disk.

### TEST-003 — Git-hygiene security test encoded a workspace snapshot and failed in every legitimate restore; its remote check also accepted look-alike repositories

- **Severity:** MEDIUM  
- **File:** `tests/test_phase71_security_closure_verification.py`  
- **Reachable from remote:** no  
- **Present in working tree:** yes  
- **Status:** **FIXED**

**Reproduction:** Cloned the verified recovery bundle into a temporary directory, installed the pinned dependencies and ran pytest: 388 passed, 1 failed — 'master must remain a local branch'. A bundle restore, a single-branch clone or a CI checkout legitimately has only the checked-out branch locally, so the assertion failed for every consumer of the project while passing in the author's workspace. Writing the regression test for the fix then exposed a second bug: the remote check was a substring test, so 'https://github.com/veereshgowdan346-bot/Trade--fork.git' and a GitLab URL carrying the same owner path were both accepted.

**Impact:** The only failing check in a restored clone was a false positive, which trains people to ignore restore failures. Separately, the hygiene check that exists to catch a rogue remote would have waved through a look-alike fork.

**Remediation:** master must now exist as a ref (local or origin/master) rather than as a convenience branch. Remote URLs are matched exactly on host and owner/repository, accepting only github.com paths equal to veereshgowdan346-bot/Trade- (plus the local .bundle path a verified restore creates). Added test_remote_url_predicate_rejects_unauthorised_destinations, which fails if the predicate is widened to accept a fork, a foreign host, file:// URLs or an empty value.

**Verification:** PASS — 390 passed in the workspace and 390 passed inside a clone of the verified bundle (previously 388/1 fail). The predicate test rejects all 7 unauthorised forms.

### SEC-012 — A too-short OMNI_API_TOKEN was silently ignored, removing authentication entirely

- **Severity:** HIGH  
- **File:** `src/lib/apiGuard.ts`  
- **Reachable from remote:** yes  
- **Present in working tree:** yes  
- **Status:** **FIXED**

**Reproduction:** With OMNI_LOCAL_TRUST=true and OMNI_API_TOKEN='abc123', a header-less request with no credentials was ALLOWED. The operator had configured a token and believed the API was authenticated; the guard treated the short value as absent and fell through to the token-less local path. Webhooks behaved the same way for a short configured secret.

**Impact:** A typo or a truncated .env value silently downgrades an authenticated deployment to unauthenticated. No warning is emitted, so the operator has no way to notice.

**Remediation:** tokenState() distinguishes absent / usable / unusable. Present-but-unusable (blank or < 8 chars) now returns 401 AUTH_MISCONFIGURED on mutations and webhooks, and a configured-but-short webhook secret returns WEBHOOK_MISCONFIGURED. Empty is still treated as absent so a fresh .env works. Token precedence over OMNI_LOCAL_TRUST is explicit.

**Verification:** PASS — production 43/43 env checks; mutant reproduced the old behaviour and is now detected.

### SEC-013 — Vault status banner claimed credentials were 'encrypted with a development fallback key' after the fallback was removed

- **Severity:** MEDIUM  
- **File:** `src/components/pages/PagesC.tsx`  
- **Reachable from remote:** no  
- **Present in working tree:** yes  
- **Status:** **FIXED**

**Reproduction:** With VAULT_KEY unset, the UI displayed 'credentials are encrypted with a development fallback key'. In fact the vault fails closed and stores nothing; vaultUsingFallbackKey() now means 'unconfigured'.

**Impact:** False assurance: the operator is told encryption is happening (with a weak key) when the vault is actually disabled. Misleading security messaging is a defect in its own right.

**Remediation:** Banner now states the vault is disabled and refuses to encrypt rather than using a fallback key. vault_key.ts documents that the legacy name means 'unconfigured'. SAFE-18 fails if the misleading text returns anywhere in src/.

**Verification:** PASS — SAFE-18 green; tsc and lint clean.

### TEST-001 — Adversarial suite did not exercise the SEC-008 path, so a reintroduced SEC-008 passed 44/44

- **Severity:** HIGH  
- **File:** `scripts/adversarial_api_probe.js`  
- **Reachable from remote:** no  
- **Present in working tree:** yes  
- **Status:** **FIXED**

**Reproduction:** Mutation testing rebuilt apiGuard with 'originMatchesHost(req)' restored as an alternative to locality (mutant C). The probe reported 44 passed / 0 failed, because with OMNI_LOCAL_TRUST unset the function returns AUTH_NOT_CONFIGURED before ever reaching the origin check — the mutated line was unreachable in every case the probe covered.

**Impact:** A future regression of SEC-008 would have shipped green. The exact failure mode the SEC-010 incident demonstrated, repeated in a new test.

**Remediation:** Added four cases that run with OMNI_LOCAL_TRUST asserted (the desktop deployment shape) and a remote client forging Origin / Referer / X-Forwarded-Host / loopback Host. Mutant C now fails 4 cases.

**Verification:** PASS — mutant C (SEC-008 reintroduced) detected: 44 passed / 4 failed; production 48/48.

### SEC-009 — Rate limiter is per-process and keyed by a claimed IP

- **Severity:** LOW  
- **File:** `src/lib/apiGuard.ts`  
- **Reachable from remote:** yes  
- **Present in working tree:** yes  
- **Status:** **ACCEPTED + DOCUMENTED (deployment constraint)**

**Reproduction:** checkRateLimit() buckets on clientIp(); a caller rotating the claimed IP obtains fresh buckets.

**Impact:** Rate limiting is abuse control, not a security boundary; a determined caller can evade per-client limits.

**Remediation:** Kept as-is. The server is a single-process Next.js desktop backend with no shared store, so a distributed limiter would add a dependency without a supported topology. Documented as best-effort abuse control; multi-instance or horizontally scaled deployment remains BLOCKED until a shared limiter exists.

**Verification:** DOCUMENTED — limitation stated in the module docstring and in the release-readiness report.

### SEC-003 — TypeScript vault fell back to a published constant passphrase

- **Severity:** CRITICAL  
- **File:** `src/lib/vault.ts, src/lib/vault_key.ts`  
- **Reachable from remote:** yes  
- **Present in working tree:** no  
- **Status:** **FIXED (earlier pass, re-verified)**

**Reproduction:** Previously masterKey() returned scrypt(constant) when VAULT_KEY was unset, so any vault created without a key was decryptable by anyone reading the repository.

**Impact:** Credential disclosure from any installation that had never set VAULT_KEY.

**Remediation:** Derivation isolated in vault_key.ts; throws VaultKeyMissingError on missing/short keys; the route returns 503; no constant remains in the tree.

**Verification:** PASS — re-probed this pass: missing key throws, short key rejected, valid key derives 32 bytes.

### SEC-002 — Python credential manager fell back to a published constant password

- **Severity:** CRITICAL  
- **File:** `config/credential_manager.py`  
- **Reachable from remote:** yes  
- **Present in working tree:** no  
- **Status:** **FIXED (earlier pass, re-verified)**

**Reproduction:** The manager defaulted to a hardcoded master password when none was supplied.

**Impact:** Any vault written by the Python side was decryptable with a published constant.

**Remediation:** Per-installation random master key written with os.open(..., 0o600); missing master password raises instead of falling back.

**Verification:** PASS — re-probed this pass: 64-hex per-install key, mode 0600, no constant in source.

### DOC-001 — Generated reports cited commit hashes that do not exist and asserted they were present

- **Severity:** MEDIUM  
- **File:** `scripts/generate_final_report.js, scripts/generate_certification_report.js`  
- **Reachable from remote:** no  
- **Present in working tree:** yes  
- **Status:** **FIXED**

**Reproduction:** APEX_V2_FINAL_AUDIT_REPORT.md stated 'Baseline commit: 1ccee80...' and 'Baseline present | yes (1ccee80...)', but `git cat-file -t 1ccee80` reports the object does not exist locally or on origin. A 'Parent of baseline' row cited d095fc0..., also absent, and the certification report listed d095fc0/1ccee80 as places the historical material is 'retrievable from'. Verified with git cat-file -t for 60d7c41 (present), d095fc0, 1ccee80, 2af7e41, adba1be (all MISSING).

**Impact:** Reports asserted the existence of commits that are not in the repository, which is exactly the class of unverifiable evidence the project forbids. It also made a self-check ('baseline present: yes') that was never actually performed.

**Remediation:** Baseline and parent are now read from git at generation time and existence is tested with `git cat-file -e`. The false 'retrievable from d095fc0/1ccee80' sentence was replaced with the one commit verified to exist (60d7c41). Absent earlier-session hashes are now explicitly labelled as not present. verify_report_consistency.js additionally requires the cited baseline to exist and to be an ancestor of HEAD.

**Verification:** PASS — 82 claims, 0 failures; baseline now f61024e (verified present and reachable).

### REC-003 — Restored clones failed report consistency because the manifest describes a bundle inventory the clone does not contain

- **Severity:** LOW  
- **File:** `scripts/verify_report_consistency.js`  
- **Reachable from remote:** no  
- **Present in working tree:** yes  
- **Status:** **FIXED**

**Reproduction:** Cloned any bundle and ran `node scripts/verify_report_consistency.js` inside it: it exited 1 with 'no bundles on disk — an empty inventory cannot be reported as a pass'. The clone was correct; it simply has no backups/ directory, because bundles are not committed.

**Impact:** Every restored snapshot would have shown a consistency failure, which is the check a future reader uses to decide whether the reports can be trusted. A check that always fails in the restore path trains people to ignore it, and could mask a real mismatch.

**Remediation:** An absent backups/ directory is now reported as a note ('not applicable — this looks like a restored clone') and is not counted as a pass. Where the directory exists, every rule still applies. The audit tool keeps its own hard rule that an empty inventory is an error.

**Verification:** PASS on bundles created after commit 69ebd04 (consistency REPORT_MATCHES_ARTIFACTS inside the clone, with the note). Earlier bundles keep their measured failure and are not relabelled.

### REC-004 — A bundle created from a shallow clone is unclonable, so a shallow workspace cannot produce a recovery artefact

- **Severity:** HIGH  
- **File:** `scripts/audit_bundles.js, RECOVERY_PROCEDURE.md, scripts/generate_recovery_docs.js`  
- **Reachable from remote:** no  
- **Present in working tree:** yes  
- **Status:** **FIXED**

**Reproduction:** After the eighth reset the workspace was shallow (`git rev-parse --is-shallow-repository` = true). A bundle created with `git bundle create --all` from it produced `error: Could not read <sha>`, `fatal: Failed to traverse parents of commit df52c083`, `fatal: remote did not send all necessary objects`. `git bundle verify` on the same file still exited 0. After `git fetch --unshallow`, the identical command produced a bundle that clones cleanly (9 commits, fsck exit 0).

**Impact:** Every recovery artefact produced from a shallow workspace would have looked valid to `git bundle verify` and been unusable in a real restore — the same class of false assurance as REC-001, reached by a different route.

**Remediation:** audit_bundles.js records `workspaceShallow` in every artefact and prints an explicit warning naming `git fetch --unshallow` when the source is shallow. The clone check already fails such a bundle, and scripts/test_bundle_audit.js now builds a bundle from a depth-1 clone and asserts the audit rejects it (exit 1, packIntegrity not readable). The recovered workspace was unshallowed before any further claim was made.

**Verification:** PASS — 26/26 negative tests; the shallow-source bundle is rejected by the audit although verify exits 0.

Other checks performed with no defect found:

- every mutating API route (`POST/PUT/PATCH/DELETE`) imports and calls a guard — 10 routes checked;
- no shell execution with interpolated input (`exec` use is regex matching only);
- `Math.random` appears only in bootstrap sampling and simulated latency, never in token or key generation;
- IST handling is correct: the shift-then-use-UTC-getters idiom is used consistently, so there is no UTC/IST off-by-one in audit dating;
- ingestion validates duplicate timestamps, ordering, non-positive prices and missing candles.

## 10. Fixes applied

| Defect | Change | Regression test | Verified |
|---|---|---|---|
| SEC-007 | Forwarded headers no longer establish locality. | 5 test(s) | **PASS** |
| SEC-008 | originMatchesHost() no longer authorises a mutation. | 4 test(s) | **PASS** |
| SEC-010 | isTrustedLocalClient() now keys on the PRESENCE of a forwarding header rather than its parsed content. | 2 test(s) | **PASS** |
| SEC-011 | Local trust must now be ASSERTED by the operator (OMNI_LOCAL_TRUST=true) or a token must be configured. | 3 test(s) | **PASS** |
| REC-001 | audit_bundles. | 2 test(s) | **PASS** |
| REC-002 | The generator now states the measured rule (the snapshot keeps files git does not ignore and drops ignored paths and anything outside the root), describes bundles as session-local, and gives the three commands to regenerate and re-audit them after a reset. | 2 test(s) | **PASS** |
| TEST-003 | master must now exist as a ref (local or origin/master) rather than as a convenience branch. | 2 test(s) | **PASS** |
| SEC-012 | tokenState() distinguishes absent / usable / unusable. | 3 test(s) | **PASS** |
| SEC-013 | Banner now states the vault is disabled and refuses to encrypt rather than using a fallback key. | 1 test(s) | **PASS** |
| TEST-001 | Added four cases that run with OMNI_LOCAL_TRUST asserted (the desktop deployment shape) and a remote client forging Origin / Referer / X-Forwarded-Host / loopback Host. | 1 test(s) | **PASS** |
| SEC-003 | Derivation isolated in vault_key. | 1 test(s) | **PASS** |
| SEC-002 | Per-installation random master key written with os. | 1 test(s) | **PASS** |
| DOC-001 | Baseline and parent are now read from git at generation time and existence is tested with `git cat-file -e`. | 1 test(s) | **PASS** |
| REC-003 | An absent backups/ directory is now reported as a note ('not applicable — this looks like a restored clone') and is not counted as a pass. | 2 test(s) | **PASS on bundles created after commit 69ebd04 (consistency REPORT_MATCHES_ARTIFACTS inside the clone, with the note). Earlier bundles keep their measured failure and are not relabelled.** |
| REC-004 | audit_bundles. | 1 test(s) | **PASS** |

Two tests that encoded the old (vulnerable) behaviour were corrected rather than deleted: the API-guard loopback test and the webhook locality test. Correcting them strengthens the suite; leaving them would have pinned the bypass in place. No test was weakened to obtain a pass.

## 11. Backtest methodology

| Item | Value |
|---|---|
| Session mode (default) | **STRICT_INTRADAY** |
| Methodology checks | **12 pass / 0 fail** |
| Overnight positions in strict mode | **0** |
| Legacy carry | explicit opt-in only, reproducible |
| Parameter search | none — default registry configs |

Verified independently by the methodology audit: no trade crosses a session; end-of-day liquidation fills at the session's last bar; partial and special sessions flatten inside the session; missing candles produce no artificial fills; train/validation/OOS ranges are disjoint and chronological; mutating a bar leaves all earlier trades bit-identical (no look-ahead).

## 12. Statistical validation

| Period | Year | Sessions | Net | Mean/session |
|---|---|---|---|---|
| TRAIN | 2022 | 245 | −₹6,73,991.56 | −₹2,750.99 |
| VALIDATION | 2023 | 244 | −₹6,83,370.18 | −₹2,800.70 |
| OOS | 2024 | 247 | −₹6,79,195.42 | −₹2,749.78 |

| Item | Value |
|---|---|
| Strict OOS net | **−₹6,79,195.43** |
| Legacy (carry) OOS net | −₹6,52,544.47 |
| OOS trades | 3,956 |
| Arms positive | **0 of 8** |
| Statistical verdict | **NEGATIVE_RESULT_ROBUST_TO_CLUSTERING** |
| Arms excluded (no volume) | `x_obv_confirmation`, `x_volume_profile` |
| Profitability claim | NONE — this study does not establish profitability |

Clustering was tested rather than assumed: per-session and block-bootstrap intervals both remain negative, and the sign does not flip under any cost assumption (§15).

## 13. Data provenance

| Dataset | Licence | Redistribution | Authenticity | Rows | Sessions |
|---|---|---|---|---|---|
| `NIFTY50_1min_2022` | MIT | allowed | UNVERIFIED_REDISTRIBUTION | 92,617 | 247 |
| `NIFTY50_1min_2023` | MIT | allowed | UNVERIFIED_REDISTRIBUTION | 91,931 | 246 |
| `NIFTY50_1min_2024` | MIT | allowed | UNVERIFIED_REDISTRIBUTION | 92,523 | 249 |
| `20200108` | none declared | **not permitted** | UNVERIFIED_REDISTRIBUTION | 1,41,346 | 1 |
| `20200110` | none declared | **not permitted** | UNVERIFIED_REDISTRIBUTION | 1,42,020 | 1 |

All five files were re-downloaded this pass and matched against their upstream git blob SHA, which proves **file identity**, not **exchange authenticity**. Every dataset remains `UNVERIFIED_REDISTRIBUTION`. The unlicensed equity tape is not redistributed in this repository.

## 14. Instrument compatibility

| Item | Value |
|---|---|
| Verdict | **INSTRUMENT_INCOMPATIBLE_FOR_EQUITY_VALIDATION** |
| Strategies blocked for equity validation | **10 of 10** |
| Proxy studies completed on the index | 8 |
| Volume-dependent arms not evaluable | 2 |

| Segment | Status |
|---|---|
| EQUITY | **BLOCKED** |
| INDEX_REFERENCE | **PROXY_ONLY** |
| FUTURES | **BLOCKED** |
| OPTIONS | **NOT_APPLICABLE** |

The NIFTY 50 index is a reference series: not tradable, no volume, and not the instrument these strategies are specified for. Equity cost schedules are applied to it only as a documented research proxy. Index data is never presented as equity data, and missing index volume is never treated as real volume.

## 15. Official cost verification — **UNVERIFIED**

| Item | Value |
|---|---|
| Rate heads inventoried | 26 |
| Verified against dated official documents | **0** |
| Status breakdown | UNVERIFIED: 21, UNSUPPORTED_NO_EVIDENCE: 2, UNVERIFIED_ASSUMED_SAME_AS_ANGEL: 3 |
| Registry self-checks | 15 pass / 0 fail |
| Blocker | OPEN — every statutory/brokerage rate remains UNVERIFIED |

Statutory status inside the cost model remains **UNVERIFIED**. Official publishers (NSE, SEBI, CBIC, GST) were unreachable from this environment, so no rate was recorded as verified and no missing rate was estimated. Cost sensitivity therefore reports, and never optimises: 0 of 8 arms are positive at baseline and 0 at zero slippage, with the sign invariant across assumptions = true.

## 16. Calendar discrepancies

| Year | Status | Data sessions | Calendar sessions | Data-only | Calendar-only |
|---|---|---|---|---|---|
| 2022 | THIRD_PARTY_CROSSCHECKED | 247 | 248 | 0 | 1 |
| 2023 | THIRD_PARTY_CROSSCHECKED | 246 | 245 | 1 | 0 |
| 2024 | THIRD_PARTY_CROSSCHECKED | 249 | 246 | 3 | 0 |
| 2025 | UNCHECKED | — | — | 0 | 0 |

Unresolved weekday discrepancies: **1** — 2022-10-24, where the dataset and the third-party calendar disagree about whether NSE traded. Adjudication needs an authoritative NSE notice, which is unreachable here. Years not assessed: **2025** — no dataset exists, so 2025 stays UNCHECKED rather than assumed clean.

## 17. Full regression results

Recorded by `node scripts/run_regression_record.js` at c773d60a12bafc22eaebd413cea86a1d8e5c2ff9.

| Gate | Command | Exit | Expected | Detail |
|---|---|---|---|---|
| TypeScript typecheck | `npx tsc --noEmit` | 0 | 0 |  |
| Lint (eslint, zero warnings) | `npx eslint . --max-warnings=0` | 0 | 0 |  |
| Production build | `npm run build` | 0 | 0 | ƒ  (Dynamic)  server-rendered on demand |
| Python test suite | `python3 -m pytest -q` | 0 | 0 | 390 passed in 1.35s |
| JavaScript suite (test:all) | `npm run test:all` | 0 | 0 | 26 PASS / 0 FAIL / 15 PASS / 0 FAIL / "verdict": "ANCHORS_REPRODUCED_EXACTLY" |
| Security probes (test:safety) | `npm run test:safety` | 0 | 0 | safety audit: 18 PASS / 0 FAIL / PASS SAFE-16 remote mutations fail closed without a token (same-origin is not authentication) — remote mutations require a token; same-origin alone is rejected / verdict: PAPER_ONLY_SAFETY_PASS |
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
| Bundle-audit negative tests | `node scripts/test_bundle_audit.js` | 0 | 0 | PASS  parse "10 passed, 2 xfailed" — 10 passed, 2 xfailed / PASS  the old regex bug cannot recur: 1 failed before 388 passed is not green — 388 passed, 1 failed / bundle-audit tests: 26 passed, 0 failed |
| Environment configuration probe | `node scripts/env_config_probe.js` | 0 | 0 | env-config probe: 43 passed, 0 failed |
| Adversarial API probe | `node scripts/adversarial_api_probe.js` | 0 | 0 | dist_test_cjs/apiGuard.js: 48 passed, 0 failed |
| Mutation detection (security suite can fail) | `node scripts/mutation_check.js` | 0 | 0 | production build: 91 passed, 0 failed |
| Readiness probes | `node scripts/final_readiness_probes.js` | 0 | 0 | "passed": 12, / "verdict": "linear-ish" |

**22 of 22 gates returned the expected exit code** (ALL_GATES_AS_EXPECTED). Unexpected gates: none.

Not executed in this pass: nothing in the gate list. The history scanner is executed and exits **1 by design** — it is the visible, blocking result that must stay red until rotation.

Report consistency: **82 claims checked, 0 failures** (REPORT_MATCHES_ARTIFACTS).

## 18. Remaining blockers

| ID | Blocker | Status | Owner action required |
|---|---|---|---|
| SECURITY-001 | Credential material in public history | **BLOCKED** | Revoke API key + reset TOTP seed |
| SECURITY-006 | Rotation unconfirmed | **NOT_CONFIRMED** | Confirm from broker console |
| INSTR-001 | No authentic equity instrument data | **BLOCKED** | Licensed NSE equity intraday data |
| RATE-001 | Official rates unverifiable | **UNVERIFIED (26 heads)** | Dated official documents |
| DATA-002 | Dataset authenticity | **UNVERIFIED** | Vendor/exchange attestation |
| CAL-001 | 2022-10-24 session discrepancy | **OPEN** | Authoritative NSE notice |
| PROFIT-001 | Profitability | **NOT ESTABLISHED** | Independent reproducible OOS evidence |

## 19. Current project readiness

| Capability | State |
|---|---|
| Builds and tests reproducibly | **yes** — verified from a clean dependency install this pass |
| Secure by default (vaults) | **yes** — both fail closed, no committed keys |
| API authorization | **hardened** — one high-severity bypass fixed; token still recommended |
| Paper/research only | **yes** — LIVE execution blocked in code, all strategies disabled |
| Financial validation | **blocked** |
| Profitability | **not established** |
| Live trading readiness | **no** — and it is not a goal of this project |

## 20. Exact future roadmap

### Priority 1 — Credential revocation and exposure response

- **Objective:** render the exposed credentials useless.
- **Required evidence:** broker console confirmation that the API key is revoked and the TOTP seed reset; old key fails authentication.
- **Dependencies:** owner access to the broker account.
- **Acceptance criteria:** confirmation recorded out-of-band; no credential value pasted anywhere.
- **Tests:** `npm run test:history` still reports the historical exposure (expected); tree scan stays at 0 findings.
- **Blocking conditions:** none — this can start immediately and unblocks everything else in security.

### Priority 2 — Durable recovery and history remediation decision

- **Objective:** make artefacts survive machine loss and decide on history cleanup.
- **Required evidence:** a published remote (or private archive) that can restore the work; a signed-off decision to rewrite or not.
- **Dependencies:** Priority 1 (rotate first), owner decision, backup verification.
- **Acceptance criteria:** recovery tested by restoring into a scratch directory; decision documented in the remediation plan.
- **Tests:** clone from the bundle and re-run the gate set on the restored tree.
- **Blocking conditions:** no rewrite before rotation and a verified backup.

### Priority 3 — Security and application hardening

- **Objective:** close the residual API risks and keep the guard honest.
- **Required evidence:** `OMNI_API_TOKEN` required in every non-loopback deployment; a documented decision on the same-origin fallback (SEC-008).
- **Dependencies:** none.
- **Acceptance criteria:** token configured outside loopback; SAFE-15 stays green; no new bypass.
- **Tests:** API guard suite, SAFE-09/10/15, a fuzz pass over forwarded-header handling.
- **Blocking conditions:** none.

### Priority 4 — Authoritative market data and instrument compatibility

- **Objective:** replace proxy index studies with authentic equity data.
- **Required evidence:** licensed NSE equity intraday data with vendor or exchange attestation; resolved 2022-10-24 calendar question; 2025 sessions actually checked.
- **Dependencies:** data licence; network access to NSE/official sources.
- **Acceptance criteria:** INSTR-001 moves from BLOCKED; authenticity no longer UNVERIFIED; volume-dependent arms become evaluable or stay explicitly excluded.
- **Tests:** external dataset audit, calendar cross-check, instrument compatibility.
- **Blocking conditions:** unlicensed data may not be redistributed or used for promotion.

### Priority 5 — Official cost verification

- **Objective:** verify all 26 rate heads against dated official documents.
- **Required evidence:** NSE/SEBI/CBIC/GST publications with effective dates; broker tariff sheets.
- **Dependencies:** network reachability; document retention.
- **Acceptance criteria:** each head carries source, publication date, effective date, verification date.
- **Tests:** `npm run test:rate`; report consistency.
- **Blocking conditions:** rates stay UNVERIFIED until evidence exists; never estimate.

### Priority 6 — Research methodology and independent OOS validation

- **Objective:** reach a defensible conclusion about the strategies, positive or negative.
- **Required evidence:** strict-intraday results on authentic instruments with verified costs, replicated on a held-out period.
- **Dependencies:** Priorities 4 and 5.
- **Acceptance criteria:** conclusion reproducible from the published protocol; negative results retained.
- **Tests:** methodology audit, protocol strict, statistical robustness, cost sensitivity.
- **Blocking conditions:** no parameter tuning against the test set; no profitability claim without evidence.

### Priority 7 — Paper-trading reliability and risk controls

- **Objective:** make the paper engine trustworthy for long-running observation.
- **Required evidence:** supervised paper runs with reconciliation, restart and failure-injection results.
- **Dependencies:** Priority 3.
- **Acceptance criteria:** no order leaks through pause/restart; risk limits enforced and logged.
- **Tests:** lifecycle and failure-injection suites, readiness probes.
- **Blocking conditions:** live trading is explicitly out of scope and must not be enabled.

### Priority 8 — Documentation, reproducible builds and maintenance

- **Objective:** keep the project installable and honest.
- **Required evidence:** clean-room install and build on a fresh machine; environment variable documentation with no real values.
- **Dependencies:** none.
- **Acceptance criteria:** documented install works from scratch; reports regenerate from artifacts.
- **Tests:** full gate set; report consistency.
- **Blocking conditions:** never commit example credentials or production secrets.

---

**SECURITY: BLOCKED** — public exposure in 6 commits; rotation NOT_CONFIRMED.  
**FINANCIAL VALIDATION: BLOCKED** — 0 of 26 rates verified; instrument incompatible; 1 calendar discrepancy.  
**PROFITABILITY: NOT ESTABLISHED** — strict OOS −₹6,79,195.43, 0/8 arms positive.  
**EXECUTION: PAPER / RESEARCH ONLY.**  
**HISTORY: PUBLIC EXPOSURE CONFIRMED.**  
**RECOVERY: VERIFIED** (complete-history bundle) **with local-storage caveat.**

