# OmniTradePro Apex V2.0 — Release Readiness Register

Generated: 2026-11-18T05:05:40.224Z  
Branch `arena/f721e253-trade` · HEAD `3592dc4b36ab` · parent `9931e3bee2a8` · 16 commits  
Generator: `node scripts/generate_release_register.js`

**DECISION: SECURITY BLOCKED.** Production readiness is not claimed. Permitted use: PAPER / RESEARCH ONLY.

## Register

| Issue | Severity | Status | Evidence | Files affected | Test coverage | Remaining dependency | Responsible | Closure criteria |
|---|---|---|---|---|---|---|---|---|
| **SEC-007** | HIGH | FIXED | PASS — spoofed header rejected, direct connection allowed, client-prepended loopback rejected, trusted-proxy nearest hop allowed. | `src/lib/apiGuard.ts` | scripts/run_comprehensive_tests.js; scripts/run_comprehensive_tests.js; scripts/run_comprehensive_tests.js; scripts/audit_safety.js; scripts/audit_safety.js | none | engineering (done) | closed — fix present, regression test green, gate re-run |
| **SEC-008** | MEDIUM | FIXED | PASS — remote same-origin mutation rejected 401; same request with a bearer token allowed; local direct connection still allowed. | `src/lib/apiGuard.ts` | scripts/run_comprehensive_tests.js; scripts/run_comprehensive_tests.js; scripts/run_comprehensive_tests.js; scripts/audit_safety.js | none | engineering (done) | closed — fix present, regression test green, gate re-run |
| **SEC-010** | HIGH | FIXED | PASS — 27-case independent probe (forged Origin/Referer, spoofed loopback, multi-hop, empty/whitespace/malformed headers, x-real-ip, trusted proxy, token paths, webhook paths): 27/27 as expected. | `src/lib/apiGuard.ts` | scripts/run_comprehensive_tests.js; scripts/audit_safety.js | none | engineering (done) | closed — fix present, regression test green, gate re-run |
| **SEC-011** | HIGH | FIXED | PASS — production build 48/48; the deleted assertion also removes the misleading claim that header absence meant local. | `src/lib/apiGuard.ts` | scripts/adversarial_api_probe.js; scripts/run_comprehensive_tests.js; scripts/audit_safety.js | none | engineering (done) | closed — fix present, regression test green, gate re-run |
| **REC-001** | HIGH | FIXED | PASS — 21/21 negative tests; truncated bundle recorded as 'prerequisites ok' with 'pack NOT readable (clone failed)' and audit exit 1. | `scripts/audit_bundles.js, RECOVERY_MANIFEST.md, RECOVERY_PROCEDURE.md` | scripts/test_bundle_audit.js; scripts/audit_bundles.js | none | engineering (done) | closed — fix present, regression test green, gate re-run |
| **REC-002** | MEDIUM | FIXED | PASS — manifest text now matches observed behaviour; consistency guard green with 1 bundle on disk. | `RECOVERY_MANIFEST.md (generated), scripts/generate_recovery_docs.js` | RECOVERY_MANIFEST.md text is generated, so the claim cannot drift from the generator; scripts/verify_report_consistency.js requires the manifest's bundle rows to match backups/ on disk | none | engineering (done) | closed — fix present, regression test green, gate re-run |
| **TEST-003** | MEDIUM | FIXED | PASS — 390 passed in the workspace and 390 passed inside a clone of the verified bundle (previously 388/1 fail). The predicate test rejects all 7 unauthorised forms. | `tests/test_phase71_security_closure_verification.py` | tests/test_phase71_security_closure_verification.py::test_git_branches_and_tags_hygiene; tests/test_phase71_security_closure_verification.py::test_remote_url_predicate_rejects_unauthorised_destinations | none | engineering (done) | closed — fix present, regression test green, gate re-run |
| **SEC-012** | HIGH | FIXED | PASS — production 43/43 env checks; mutant reproduced the old behaviour and is now detected. | `src/lib/apiGuard.ts` | scripts/env_config_probe.js; scripts/run_comprehensive_tests.js; scripts/mutation_check.js | none | engineering (done) | closed — fix present, regression test green, gate re-run |
| **SEC-013** | MEDIUM | FIXED | PASS — SAFE-18 green; tsc and lint clean. | `src/components/pages/PagesC.tsx` | scripts/audit_safety.js | none | engineering (done) | closed — fix present, regression test green, gate re-run |
| **TEST-001** | HIGH | FIXED | PASS — mutant C (SEC-008 reintroduced) detected: 44 passed / 4 failed; production 48/48. | `scripts/adversarial_api_probe.js` | scripts/adversarial_api_probe.js | none | engineering (done) | closed — fix present, regression test green, gate re-run |
| **SEC-009** | LOW | ACCEPTED + DOCUMENTED (deployment constraint) | DOCUMENTED — limitation stated in the module docstring and in the release-readiness report. | `src/lib/apiGuard.ts` | scripts/run_comprehensive_tests.js | deployment topology (shared rate-limit store) | engineering (future work) | closed only when a tested shared-store limiter exists; multi-instance stays blocked until then |
| **SEC-003** | CRITICAL | FIXED (earlier pass, re-verified) | PASS — re-probed this pass: missing key throws, short key rejected, valid key derives 32 bytes. | `src/lib/vault.ts, src/lib/vault_key.ts` | scripts/audit_safety.js | none | engineering (done) | closed — fix present, regression test green, gate re-run |
| **SEC-002** | CRITICAL | FIXED (earlier pass, re-verified) | PASS — re-probed this pass: 64-hex per-install key, mode 0600, no constant in source. | `config/credential_manager.py` | scripts/audit_safety.js | none | engineering (done) | closed — fix present, regression test green, gate re-run |
| **DOC-001** | MEDIUM | FIXED | PASS — 82 claims, 0 failures; baseline now f61024e (verified present and reachable). | `scripts/generate_final_report.js, scripts/generate_certification_report.js` | scripts/verify_report_consistency.js | none | engineering (done) | closed — fix present, regression test green, gate re-run |
| **REC-003** | LOW | FIXED | PASS on bundles created after commit 69ebd04 (consistency REPORT_MATCHES_ARTIFACTS inside the clone, with the note). Earlier bundles keep their measured failure and are not relabelled. | `scripts/verify_report_consistency.js` | scripts/test_bundle_audit.js; bundles 034025 and 034655 restore and verify clean inside their clones; 032901 and 033418 predate this fix and still show the old mismatch, which is why this record exists | none | engineering (done) | closed — fix present, regression test green, gate re-run |
| **REC-004** | HIGH | FIXED | PASS — 26/26 negative tests; the shallow-source bundle is rejected by the audit although verify exits 0. | `scripts/audit_bundles.js, RECOVERY_PROCEDURE.md, scripts/generate_recovery_docs.js` | scripts/test_bundle_audit.js | none | engineering (done) | closed — fix present, regression test green, gate re-run |
| **SECURITY-001** | CRITICAL | BLOCKED — PUBLIC EXPOSURE CONFIRMED | 36 findings across 6 commits, all reachable from origin/master; values displayed 0; working tree clean | `SECURITY_AUDIT.md, scripts/scan_repo_secrets.py, scripts/scan_source_files.py (historical revisions)` | npm run test:history (exit 1 by design) | owner revocation + TOTP reset, confirmed out-of-band | account owner | credentials revoked and seed reset; security review of the exposure recorded; history decision documented |
| **SECURITY-006** | CRITICAL | NOT_CONFIRMED | no credential accessed, tested or transmitted in any pass; status cannot be self-certified | `n/a (account state)` | none possible from the repository | broker console confirmation | account owner | owner states the old key fails and the TOTP seed was re-enrolled |
| **INSTR-001** | HIGH | BLOCKED | INSTRUMENT_INCOMPATIBLE_FOR_EQUITY_VALIDATION; equity validation blocked for 10 of 10 strategies | `data/external/**, scripts/instrument_compatibility.js, data/dataset_registry.json` | npm run test:instrument; npm run test:external | licensed, attested NSE equity intraday data | data licensing (owner) | authentic equity data present and attested; strategies re-evaluated on the correct instrument |
| **RATE-001** | HIGH | UNVERIFIED (26 heads, 0 verified) | registry audit 15 pass / 0 fail; blocker: OPEN — every statutory/brokerage rate remains UNVERIFIED | `data/rate_registry_audit.json, cost spec` | npm run test:rate; npm run test:cost | dated official NSE/SEBI/CBIC/GST documents | external evidence (owner or research) | each head carries source, publication date, effective date, verification date |
| **DATA-002** | MEDIUM | UNVERIFIED | all datasets UNVERIFIED_REDISTRIBUTION; blob-SHA match proves file identity only | `data/provenance/external_dataset_manifest.json` | npm run test:external | vendor or exchange attestation | data provider / owner | authenticity documented by the source, not inferred from hashes |
| **CAL-001** | MEDIUM | OPEN (1 unresolved weekday discrepancy) | 2022-10-24 disagreement between dataset and third-party calendar; 1 year(s) UNCHECKED (2025) | `data/provenance/calendar_crosscheck.json, src/lib/nse_calendar.ts` | npm run test:calendar | authoritative NSE holiday/special-session notice | external evidence | discrepancy adjudicated against an official notice; 2025 verified or explicitly deferred |
| **BACKUP-001** | HIGH | NO BUNDLE PRESENT | no recovery bundle found | `/home/user/security_snapshot` | git bundle verify (recorded below) | remote or archival copy outside this machine | repository owner | a verified copy exists somewhere that survives machine loss |
| **PROFIT-001** | INFO | NOT ESTABLISHED (negative result preserved) | strict OOS −₹6,79,195.43; 0 of 8 arms positive; 3956 trades | `scripts/research_protocol_strict_intraday_output.json, data/provenance/statistical_robustness_strict.json` | npm run test:protocol:strict; npm run test:stats; npm run test:cost | independent reproducible OOS evidence on authentic instruments with verified costs | research | not a goal of this phase; would require evidence, never tuning |

## Gate results (actual exit codes)

| Gate | Command | Exit | Expected | Passed/expected |
|---|---|---|---|---|
| TypeScript typecheck | `npx tsc --noEmit` | 0 | 0 | yes |
| Lint (eslint, zero warnings) | `npx eslint . --max-warnings=0` | 0 | 0 | yes |
| Production build | `npm run build` | 0 | 0 | yes |
| Python test suite | `python3 -m pytest -q` | 0 | 0 | yes |
| JavaScript suite (test:all) | `npm run test:all` | 0 | 0 | yes |
| Security probes (test:safety) | `npm run test:safety` | 0 | 0 | yes |
| Secret scanner (test:secrets) | `npm run test:secrets` | 0 | 0 | yes |
| History scanner (test:history) | `npm run test:history` | 1 | 1 | yes |
| Instrument compatibility | `npm run test:instrument` | 0 | 0 | yes |
| External dataset audit | `npm run test:external` | 0 | 0 | yes |
| Calendar cross-check | `npm run test:calendar` | 0 | 0 | yes |
| Official rate registry audit | `npm run test:rate` | 0 | 0 | yes |
| Methodology audit | `npm run test:methodology` | 0 | 0 | yes |
| Research protocol (legacy carry) | `npm run test:protocol` | 0 | 0 | yes |
| Research protocol (strict intraday) | `npm run test:protocol:strict` | 0 | 0 | yes |
| Statistical robustness | `npm run test:stats` | 0 | 0 | yes |
| Cost sensitivity | `npm run test:cost` | 0 | 0 | yes |
| Bundle-audit negative tests | `node scripts/test_bundle_audit.js` | 0 | 0 | yes |
| Environment configuration probe | `node scripts/env_config_probe.js` | 0 | 0 | yes |
| Adversarial API probe | `node scripts/adversarial_api_probe.js` | 0 | 0 | yes |
| Mutation detection (security suite can fail) | `node scripts/mutation_check.js` | 0 | 0 | yes |
| Readiness probes | `node scripts/final_readiness_probes.js` | 0 | 0 | yes |

**22 of 22 gates as expected** (ALL_GATES_AS_EXPECTED). `test:history` exits 1 deliberately and is **not** reported as a pass.

Test counts: Python 389 passed / 0 failed / 0 skipped. JavaScript 172 passed / 0 failed. Security probes 18 passed / 0 failed.

## Recovery bundles

No bundle present.

**DURABLE_BACKUP_NOT_ESTABLISHED.** These files are on local disk. Three environment resets have already destroyed unpushed commits and snapshots; content was recovered each time from working-tree state, but the hashes were lost. No download link is claimed, and no copy outside this machine exists.

## Release gates

| Gate | State |
|---|---|
| Historical credentials exposed, rotation not owner-confirmed | **UNMET** |
| Security review of the exposure incomplete | **UNMET** |
| Official transaction-cost evidence incomplete (26/26 unverified) | **UNMET** |
| Authentic equity-instrument data unavailable | **UNMET** |
| Calendar discrepancy unresolved | **UNMET** |
| Durable backup not established | **UNMET** |
| SEC-009 multi-instance limitation (only if multi-instance is proposed) | **NOT PROPOSED — deployment single-instance only** |
| Any critical security test failing | **MET** (all green; history scan red by design) |
| Unexplained discrepancy between code, tests and reports | **MET** (82 claims verified) |

---

**FINAL DECISION: SECURITY BLOCKED.**

