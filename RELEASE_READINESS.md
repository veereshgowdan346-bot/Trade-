# OmniTradePro — Release Readiness & Security Closure

Generated: 2026-11-18T04:39:54.839Z  
Branch `arena/f721e253-trade` · HEAD `93c4dd8c52e4` · parent `77b965dc4d4c` · 13 commits · shallow: no  
Generator: `node scripts/generate_release_readiness.js`

## Release decision

| | |
|---|---|
| **DECISION** | **SECURITY BLOCKED** |
| Production readiness | **NOT CLAIMED** |
| Permitted use | **PAPER / RESEARCH ONLY** |

**Why not RESEARCH-ONLY READY.** The research *code* is in a releasable state: every gate passes, both vaults fail closed, the API guard is hardened and covered by adversarial tests. But the release decision cannot be separated from the credential exposure: 36 findings across 6 commits are reachable from the public remote, and rotation is **NOT_CONFIRMED**. Shipping a certificate that says "ready" while the broker key is still live and public would be exactly the misleading green this project has been engineered to avoid.

**What would change the decision:** the account owner revoking the API key and resetting the TOTP seed, confirmed out-of-band from the broker console. Nothing in this repository can confirm that.

---

## 1. Fixed

| ID | Defect | Severity | Status |
|---|---|---|---|
| **SEC-007** | Client-supplied X-Forwarded-For was accepted as proof of loopback locality, bypassing mutation authorization | HIGH | FIXED |
| **SEC-008** | Same-origin check was accepted as authentication for remote mutations | MEDIUM | FIXED |
| **SEC-010** | Empty or whitespace-only X-Forwarded-For was read as a direct local connection | HIGH | FIXED |
| **SEC-011** | Locality was inferred from the absence of a forwarding header, which the guard cannot actually verify | HIGH | FIXED |
| **REC-001** | `git bundle verify` was treated as an integrity check, but it does not read the pack | HIGH | FIXED |
| **REC-002** | Manifest claimed the in-repository bundle directory survived environment resets; the seventh reset destroyed it | MEDIUM | FIXED |
| **TEST-003** | Git-hygiene security test encoded a workspace snapshot and failed in every legitimate restore; its remote check also accepted look-alike repositories | MEDIUM | FIXED |
| **SEC-012** | A too-short OMNI_API_TOKEN was silently ignored, removing authentication entirely | HIGH | FIXED |
| **SEC-013** | Vault status banner claimed credentials were 'encrypted with a development fallback key' after the fallback was removed | MEDIUM | FIXED |
| **TEST-001** | Adversarial suite did not exercise the SEC-008 path, so a reintroduced SEC-008 passed 44/44 | HIGH | FIXED |
| **SEC-003** | TypeScript vault fell back to a published constant passphrase | CRITICAL | FIXED (earlier pass, re-verified) |
| **SEC-002** | Python credential manager fell back to a published constant password | CRITICAL | FIXED (earlier pass, re-verified) |
| **DOC-001** | Generated reports cited commit hashes that do not exist and asserted they were present | MEDIUM | FIXED |
| **REC-003** | Restored clones failed report consistency because the manifest describes a bundle inventory the clone does not contain | LOW | FIXED |
| **REC-004** | A bundle created from a shallow clone is unclonable, so a shallow workspace cannot produce a recovery artefact | HIGH | FIXED |

Two of these were found by challenging the code rather than re-running the suite: **SEC-011** (locality was inferred from a missing header the guard cannot verify) came out of the new adversarial probe, and **TEST-001** came out of mutation testing — a reintroduced SEC-008 passed 44/44 because no case reached the mutated line. Both are fixed, and the probe now fails on all four reintroduced vulnerabilities.

### Environment configuration (missing, malformed, contradictory, unsafe)

All six variables the code actually reads are documented in `CONFIGURATION.md` and exercised by `scripts/env_config_probe.js`: **43 passed / 0 failed**. A present-but-unusable token now fails closed (`AUTH_MISCONFIGURED`) instead of being silently ignored, which had removed authentication entirely (SEC-012).

### Mutation evidence (a suite that cannot fail is not evidence)

| Reintroduced vulnerability | Detected by probe |
|---|---|
| `SEC-010` empty X-Forwarded-For treated as an absent header | **yes — 1 failing case(s)** |
| `SEC-007` first (client-supplied) proxy hop trusted as locality | **yes — 7 failing case(s)** |
| `SEC-008` forged same-origin header accepted as authorisation | **yes — 4 failing case(s)** |
| `SEC-011` local trust inferred without the operator assertion | **yes — 12 failing case(s)** |
| `SEC-012` short token silently ignored instead of failing closed | **yes — 4 failing case(s)** |

All 5 mutants are generated into the OS temp directory and never written into the repository. Production build: **91 passed / 0 failed** (ALL_MUTANTS_DETECTED).

## 2. Verified unchanged

| Item | Evidence |
|---|---|
| Every mutating API route is guarded | automated route walk: 10 mutating routes, 0 unguarded (test) |
| Webhook authentication | independent probe: no secret → `WEBHOOK_UNAUTHENTICATED`, missing → `WEBHOOK_SECRET_REQUIRED`, wrong → `WEBHOOK_SECRET_INVALID`, correct → allowed, constant-time compare |
| Vault fail-closed (both languages) | SAFE-13, SAFE-14, direct probes |
| Safety probes | **18 pass / 0 fail** (PAPER_ONLY_SAFETY_PASS) |
| Methodology | **12 pass / 0 fail**; strict is the default; 0 overnight positions |
| Research-only execution | `productionChanged: false`; all strategies disabled; no broker connection in this pass |
| Full-history digest scan | 36 findings / 6 commits; working tree clean; values displayed 0 |

## 3. Blocked (repository cannot resolve)

| ID | Blocker | Severity | Required owner action |
|---|---|---|---|
| SECURITY-001 | Credential material in public Git history (36 findings across 6 commits) | CRITICAL | Revoke API key + reset TOTP seed |
| SECURITY-006 | Rotation unconfirmed | CRITICAL | Confirm from the broker console; do not paste secrets |
| INSTR-001 | No authentic equity instrument data (10 of 10 strategies blocked) | HIGH | Licensed, attested NSE equity intraday data |
| RATE-001 | Official rates unverified (26 heads, 0 verified) | HIGH | Dated official NSE/SEBI/CBIC/GST documents |
| DATA-002 | Dataset authenticity | MEDIUM | Vendor or exchange attestation |
| CAL-001 | 1 unresolved calendar discrepancy (2022-10-24) | MEDIUM | Authoritative NSE notice |
| SEC-009 | Rate limiter is process-local | LOW | Multi-instance deployment stays blocked until a shared limiter exists |

## 4. Externally dependent

| Item | Depends on | Consequence if unavailable |
|---|---|---|
| Credential rotation | Broker account owner | Security certification stays BLOCKED |
| Official cost documents | NSE / SEBI / CBIC / GST reachability | Financial validation stays BLOCKED |
| Equity instrument data | Data licence + vendor attestation | Equity validation stays BLOCKED |
| Calendar adjudication | NSE holiday/special-session notice | One weekday discrepancy remains OPEN |
| Durable storage | A remote or archive outside this machine | Work survives only as long as the sandbox |

## 5. Not tested / out of scope

- Live broker connectivity — deliberately out of scope; no credential may be used.
- Multi-instance deployment — no shared rate limiter exists (SEC-009).
- 2025 market sessions — no dataset exists, so UNCHECKED rather than assumed clean.
- Profitability — not established, and not a release criterion for a research tool.

## 6. Regression (actual exit codes)

| Gate | Command | Exit | Expected |
|---|---|---|---|
| TypeScript typecheck | `npx tsc --noEmit` | 0 | 0 |
| Lint (eslint, zero warnings) | `npx eslint . --max-warnings=0` | 0 | 0 |
| Production build | `npm run build` | 0 | 0 |
| Python test suite | `python3 -m pytest -q` | 0 | 0 |
| JavaScript suite (test:all) | `npm run test:all` | 0 | 0 |
| Security probes (test:safety) | `npm run test:safety` | 0 | 0 |
| Secret scanner (test:secrets) | `npm run test:secrets` | 0 | 0 |
| History scanner (test:history) | `npm run test:history` | 1 | 1 |
| Instrument compatibility | `npm run test:instrument` | 0 | 0 |
| External dataset audit | `npm run test:external` | 0 | 0 |
| Calendar cross-check | `npm run test:calendar` | 0 | 0 |
| Official rate registry audit | `npm run test:rate` | 0 | 0 |
| Methodology audit | `npm run test:methodology` | 0 | 0 |
| Research protocol (legacy carry) | `npm run test:protocol` | 0 | 0 |
| Research protocol (strict intraday) | `npm run test:protocol:strict` | 0 | 0 |
| Statistical robustness | `npm run test:stats` | 0 | 0 |
| Cost sensitivity | `npm run test:cost` | 0 | 0 |
| Bundle-audit negative tests | `node scripts/test_bundle_audit.js` | 0 | 0 |
| Environment configuration probe | `node scripts/env_config_probe.js` | 0 | 0 |
| Adversarial API probe | `node scripts/adversarial_api_probe.js` | 0 | 0 |
| Mutation detection (security suite can fail) | `node scripts/mutation_check.js` | 0 | 0 |
| Readiness probes | `node scripts/final_readiness_probes.js` | 0 | 0 |

**22 of 22 gates as expected** (ALL_GATES_AS_EXPECTED). No unexpected exits.

The history scanner's exit code of 1 is intentional and must remain red while the exposure stands. It is the single most important line in this table.

## 7. Research state (unchanged)

| Metric | Value |
|---|---|
| Strict OOS net | **−₹6,79,195.43** |
| Arms positive | **0 of 8** |
| Trades | 3,956 |
| Overnight positions (strict) | **0** |
| Statistical verdict | **NEGATIVE_RESULT_ROBUST_TO_CLUSTERING** |
| Cost sensitivity | 0 of 8 positive at baseline, 0 at zero slippage |
| Statutory status | **UNVERIFIED** |
| Instrument verdict | **INSTRUMENT_INCOMPATIBLE_FOR_EQUITY_VALIDATION** |
| Profitability claim | NONE — this study does not establish profitability |

## 8. Recovery

| Bundle | Size | Mode | SHA-256 (first 16) | Verification |
|---|---|---|---|---|
| none found | — | — | — | **NO RECOVERY BUNDLE** |

**Storage caveat, stated without softening:** these bundles live on local disk under `/home/user/security_snapshot`. They are not durable. This environment has already lost unpushed commits and snapshots three times mid-project; each time the content had to be recovered from working-tree state, and the commit hashes were gone. A local bundle is a recovery aid, not a backup. Durability requires a remote or archival copy, which this pass is not permitted to create.

## 9. Release conditions

| # | Condition | State |
|---|---|---|
| 1 | API key revoked and TOTP seed reset, confirmed by the owner | **NOT MET** |
| 2 | Security review of the exposure completed | **NOT MET** |
| 3 | Official rate evidence obtained | **NOT MET** |
| 4 | Authentic instrument data obtained | **NOT MET** |
| 5 | Calendar discrepancy adjudicated | **NOT MET** |
| 6 | All regression gates as expected | MET |
| 7 | Vaults fail closed | MET |
| 8 | Mutating routes authenticated | MET |
| 9 | Working tree free of credentials | MET |

## 10. Explicit non-claims

- This is **not** a production-readiness certificate.
- No credential has been rotated; nothing here implies it has been.
- No official fee rate is verified; none was invented.
- No dataset has been authenticated by an exchange; matching a blob hash proves file identity only.
- No strategy is profitable; the out-of-sample result is negative in every evaluable arm.
- Editing a file does not remove it from Git history, and a rewrite would not un-disclose what has already been fetched.

---

**FINAL DECISION: SECURITY BLOCKED.**

The code is in its best verified state; the exposure is not. Revoke the credentials, then re-run this pass.

