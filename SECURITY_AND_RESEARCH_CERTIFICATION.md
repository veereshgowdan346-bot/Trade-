> **SUPERSEDED — see `FINAL_SECURITY_RESEARCH_AUDIT.md` (2026-11-18).**
>
> This report was generated when the working copy was a **depth-limited clone**, so the history scan
> could see only the shallow boundary commit. Figures in §3 (6 findings / 1 commit) reflect that
> limitation. A later pass deepened the clone to the complete 8-commit history and found **36 findings
> across 6 commits, all public**. The body of this report is preserved unedited as the record of what was
> known at the time; the accuracy was limited by missing history, not by a wrong method.
>
> Everything not derived from history coverage (vault fixes, methodology, statistics, costs) still holds.

# OmniTradePro — Final Security Remediation & Research Certification

**Generated:** 2026-11-17T17:35:36.546Z by `scripts/generate_certification_report.js`
**Branch:** `arena/b6463544-trade` · **HEAD:** `60d7c418f89beb392661642a95bfaadd2f99068c` · **Parent:** `n/a (shallow-clone boundary — parent commit not fetched)` · **Tree at generation:** 96 modified path(s)
**Mode:** verification, defensive remediation, historical research and paper simulation. No live execution, no real money, no push/deploy/PR.

---

## 1. Certification summary

| Area | Status |
|---|---|
| Working tree cleanliness (credentials) | **PASS** — 0 findings in every tracked file |
| Git history (credentials) | **FAIL — EXPOSURE CONFIRMED, AND PUBLIC** |
| Credential rotation | **BLOCKED** — cannot be independently confirmed from this environment |
| History remediation | **BLOCKED** — requires explicit owner authorization; prohibited in this pass |
| Vault key handling (Python + TypeScript) | **PASS** — fail-closed, per-install key, 0600, no published fallback |
| Strict intraday (METHOD-001) | **PASS** — 12/12 behavioural checks, 0 overnight trades |
| Instrument compatibility | **FAIL — equity validation BLOCKED** (index proxy only) |
| Data authenticity | **UNVERIFIED** |
| Official rates | **UNVERIFIED (0/26)** |
| Profitability | **FAIL** |
| Regression suite | **PASS** (one intentional red gate: test:history) |

> **SECURITY CERTIFICATION IS BLOCKED.** Rotation of the exposed broker API key and TOTP seed has not
> been independently confirmed, and history remediation has not been authorized.
>
> **PROFITABILITY NOT ESTABLISHED. FINANCIAL VALIDATION BLOCKED.**
> This project is **not** live-trading-ready and must not be represented as such.

---

## 2. Credential exposure and rotation status

**Exposure confirmed.** Three identifiers are affected — a broker client/user id, an API secret and a
TOTP seed prefix. Values are **not** reproduced anywhere in this document, in any artifact, or in any
scanner output; matching is performed on SHA-256 digests stored in `data/security/leaked_identifiers.json`.

| Commit | Visibility | Paths containing material | Identifier kinds |
|---|---|---|---|
| `60d7c418f89b…` | **PUBLIC** (reachable from origin/master) | `SECURITY_AUDIT.md`<br>`scripts/scan_repo_secrets.py`<br>`scripts/scan_source_files.py` | client_or_user_id, api_secret, totp_seed_prefix |

Findings: **6** across **1** commit(s).
Reachable from origin/master: **6** → publicExposure = `true`.

### What this means

The material is reachable from origin/master, so it was **pushed to the GitHub remote**. Consequences
that must not be softened:

1. Deleting the strings from the latest tree (done in the previous pass) removes them from *HEAD only*.
   They remain retrievable from history — locally from 60d7c41, d095fc0 and 1ccee80, and remotely from
   GitHub's stored objects, any fork, and any clone.
2. **The API secret and the TOTP seed must be treated as compromised.** The TOTP seed is the more severe
   of the two: it allows generation of valid second factors for the broker account.
3. Rotation is the only effective remedy. History rewriting cannot recall copies that already exist.

### Rotation status: BLOCKED

| Item | Status |
|---|---|
| Broker API key revoked/rotated | **BLOCKED** — no independent confirmation available |
| Broker TOTP seed regenerated | **BLOCKED** — no independent confirmation available |
| Account owner verification | **BLOCKED** — the owner must confirm; no confirmation channel exists here |

No attempt was made to use the credentials, and none should be.

---

## 3. Git history security report

| Item | Value |
|---|---|
| Commits scanned (--all) | 1 |
| Blobs scanned | 386 |
| Shallow clone | true |
| Shallow boundary | `60d7c418f89beb392661642a95bfaadd2f99068c` |
| Findings | 6 |
| Kinds | api_secret, client_or_user_id, totp_seed_prefix |
| Verdict | **HISTORY_EXPOSURE_FOUND** |

**Coverage limitation (not a clean pass):** the clone is shallow with boundary `60d7c418f89beb392661642a95bfaadd2f99068c`,
so commits *before* that point are absent locally and were **not** scanned. The remote holds them, and if
the material predates the boundary it is exposed there too. Full-history scanning requires a complete clone.

**Other copies that may retain the material** (documented, not remediated):

- the GitHub remote (origin) and any forks of it;
- any developer clone or backup taken before the previous pass;
- the protected recovery snapshot created in this pass
  (/home/user/security_snapshot/, mode 0600, outside the repository), which by definition
  contains the pre-redaction history and must be destroyed after remediation;
- CI logs, chat transcripts, or ticket attachments where build output was pasted.

**History rewrite: NOT PERFORMED.** It requires explicit authorization (mission B.5), it would rewrite
shared public history, and it cannot undo the public exposure. Recommended sequence for the owner:
rotate first (removes the value of the leaked material), then decide whether to rewrite.

---

## 4. Vault key handling

| Check | Result |
|---|---|
| Python vault: per-install random key, 0600, stable, env override honoured | **PASS** |
| Python vault: no hardcoded fallback passphrase | **PASS** (constant removed) |
| TypeScript vault: fails closed without VAULT_KEY | **PASS** (SEC-003 fixed this pass) |
| TypeScript vault: rejects keys shorter than 8 characters | **PASS** |
| TypeScript vault: derives a 32-byte AES key only from VAULT_KEY | **PASS** |

The TypeScript vault previously fell back to a constant passphrase committed to this repository — the
same defect class as the Python vault fixed earlier. Key derivation now lives in `src/lib/vault_key.ts`
(database-free, unit-testable) and throws VaultKeyMissingError rather than inventing a key. The vault API
returns 503 VAULT_KEY_MISSING instead of silently encrypting with a public key.

---

## 5. Strict-intraday verification (METHOD-001)

| ID | Check | Result |
|---|---|---|
| M1 | 15-min aggregation values exact and bars partitioned once (independent recomputation) | **PASS** |
| M2 | regular sessions start at 09:15 and produce exactly 25 buckets; off-grid sessions enumerated | **PASS** |
| M3 | mutating bar k leaves every trade closed before k bit-identical (no look-ahead) | **PASS** |
| M4 | signal depends only on the prefix passed in | **PASS** |
| M5 | default session mode is STRICT_INTRADAY and no trade crosses a session | **PASS** |
| M5b | no position remains open past its session's last bar | **PASS** |
| M5c | EOD liquidation is recorded and fills exactly at the session's last bar close | **PASS** |
| M5d | historical CARRY_OVERNIGHT mode still reproducible by explicit opt-in (documented defect) | **PASS** |
| M5e | special/partial sessions flatten inside the session (no padding, no carry) | **PASS** |
| M5f | missing candles create no artificial fills and no cross-session trades | **PASS** |
| M6 | train/validation/OOS ranges are disjoint and chronologically ordered | **PASS** |
| M7 | no parameter grid/optimisation and no strategy-parameter overrides | **PASS** |

- Default mode: STRICT_INTRADAY — confirmed by asserting result.sessionMode.
- **Overnight trades in strict mode: 0** across 3,956 OOS trades.
- No next-session-open exit in strict mode; liquidation fills exactly at the session's last bar close.
- No entry on a session's final bar; partial (2024-03-02, 2024-05-18) and special (Muhurat 2024-11-01) sessions flatten correctly.
- Missing candles: two deliberate mid-session gaps, 0 artificial fills, 0 cross-session trades.
- Legacy CARRY_OVERNIGHT remains explicit opt-in and its historical artifact reproduces byte-identically.

---

## 6. Instrument compatibility

**Verdict: INSTRUMENT_INCOMPATIBLE_FOR_EQUITY_VALIDATION.** Equity validation is **BLOCKED** for all 10 strategies.

| Segment | Status |
|---|---|
| EQUITY | **BLOCKED** |
| INDEX_REFERENCE | **PROXY_ONLY** |
| FUTURES | **BLOCKED** |
| OPTIONS | **NOT_APPLICABLE** |

Index and equity research are kept separate: the index series is PROXY_ONLY, carries no volume, and is
**not** treated as an equity substitute. The equity intraday cost schedule is applied to it only as a
documented research proxy, with the mismatch stated per strategy in
`data/provenance/instrument_compatibility.json`. Authentic per-symbol equity data with a suitable
licence is **not available** in this repository.

---

## 7. Data provenance

| Dataset | Licence | Redistributable | Authenticity | Upstream blob |
|---|---|---|---|---|
| NIFTY50_1min_2022 | MIT | yes (with notice) | UNVERIFIED_REDISTRIBUTION | `4f05c9804c95…` |
| NIFTY50_1min_2023 | MIT | yes (with notice) | UNVERIFIED_REDISTRIBUTION | `eec7d0efbfab…` |
| NIFTY50_1min_2024 | MIT | yes (with notice) | UNVERIFIED_REDISTRIBUTION | `35e0c5727c29…` |
| 20200108 | none declared | **no** | UNVERIFIED_REDISTRIBUTION | `e30c473ef60b…` |
| 20200110 | none declared | **no** | UNVERIFIED_REDISTRIBUTION | `91521f18604f…` |

Licence permission and exchange authenticity are kept separate. No unlicensed dataset is redistributed
(0 external files tracked; .gitignore:42). Authenticity remains **UNVERIFIED**: a public repository does
not establish that the prices originated at NSE.

**Calendar:** 2023-11-12 and 2024-01-20/03-02/05-18 are legitimate weekend special sessions absent from the
third-party calendar. **2022-10-24 remains unresolved** — the authoritative NSE list is unreachable
(curl: (35) OpenSSL SSL_connect: SSL_ERROR_SYSCALL), so it stays OPEN rather than being assumed clean.
**2025 remains UNCHECKED.**

---

## 8. Official-rate evidence register

| Item | Value |
|---|---|
| Heads | 26 |
| Verified against a primary source | **0** |
| Status | **UNVERIFIED** |
| Reason | nseindia.com, sebi.gov.in, cbic.gov.in, gst.gov.in and broker tariff pages all fail TLS from this environment (http=000, SSL_ERROR_SYSCALL) |
| In-repo evidence | secondary, undated narratives only — explicitly not official documents |
| Substitution of invented values | **none** |
| Fail-closed behaviour | verified (unsupported segment and unknown broker both throw) |

Statutory charges, broker charges and slippage are reported separately throughout. No rate was invented.

---

## 9. Statistical and profitability report

**Strict intraday, 2024 OOS, eight evaluable arms.** x_obv_confirmation and x_volume_profile are
NOT_EVALUABLE: the index publishes no volume (STAT-003).

| Arm | Trades | Net/trade | 95% CI (session cluster) | Verdict |
|---|---|---|---|---|
| x_macd_momentum | 813 | −₹162.73 | [-182.31, -142.06] | NOT_SUPPORTED |
| x_ichimoku_cloud | 467 | −₹199.60 | [-230.14, -168.11] | NOT_SUPPORTED |
| x_keltner_channel | 349 | −₹172.85 | [-208.65, -136.76] | NOT_SUPPORTED |
| x_choppiness_index | 233 | −₹147.46 | [-188.53, -105.77] | NOT_SUPPORTED |
| x_parabolic_sar | 832 | −₹168.25 | [-188.12, -148.18] | NOT_SUPPORTED |
| x_fibonacci_retracement | 369 | −₹170.84 | [-202.51, -140.04] | NOT_SUPPORTED |
| x_donchian_trend_50 | 211 | −₹169.75 | [-214.87, -126.99] | NOT_SUPPORTED |
| x_mtf_trend_confirmation | 682 | −₹176.19 | [-199.19, -153.38] | NOT_SUPPORTED |

| Portfolio (strict) | Value |
|---|---|
| OOS net | −₹6,79,195.43 |
| OOS gross | +₹67,500.23 |
| OOS statutory | +₹1,73,052.28 |
| oosSupported | `[]` (0 of 8) |
| Sessions | 247 |
| Mean net/session | −₹2,749.78 |
| 95% CI (session cluster) | [-3077.49, -2430.22] |
| Max drawdown | −₹6,79,195.42 (equals total loss — monotone decline) |

**Legacy comparison (historical, still reproducible):** OOS −₹6,52,544.47 for the
8-arm portfolio, −₹6,52,544.45 in the cluster-bootstrap study. Strict is
−₹26,650.96 *worse* — the correction did not flatter the strategies.

**Cost sensitivity (strict):** gross +₹67,500.24, statutory +₹1,73,052.47,
slippage +₹5,73,643.19 at 16 bps/side. Break-even slippage
**-2.9 bps/side — NEVER: statutory charges alone already exceed gross P&L, so no slippage level (including zero) reaches break-even**.
Arms positive at baseline: 0; at zero slippage:
0 (of 8). Sign invariant across all
assumptions: **true**.

**Bootstrap methods:** trade-level, session-cluster and moving-block all agree (negative under every
method); median design effect 0.93.

**STAT-003 correction:** the robustness and cost studies previously included x_volume_profile, an arm the
protocol declares NOT_EVALUABLE for lack of volume. It is now excluded in both, with the exclusion
recorded in excludedArms inside each artifact. This changes the eight-arm OOS total from the previously
reported nine-arm figure; the earlier numbers remain in git history and in prior reports, annotated here
rather than quietly overwritten. No parameter was tuned and no arm was added or removed to improve a result.

All strategies remain enabled: false.

---

## 10. Full regression report (actual exit codes)

| Command | Exit | Note |
|---|---|---|
| npx tsc --noEmit | 0 | clean |
| npx eslint . --max-warnings=0 | 0 | clean |
| npm run build | 0 | production build |
| python3 -m pytest -q | 0 | 389 passed |
| npm run test:all | 0 | EXACT_EQUIVALENCE_VERIFIED, ANCHORS_REPRODUCED_EXACTLY |
| npm run test:methodology | 0 | 12 pass / 0 fail |
| npm run test:safety | 0 | 14 pass / 0 fail |
| npm run test:secrets | 0 | 0 blocking findings in tracked files |
| npm run test:history | **1** | **intended** — history exposure found; stays red until rotation/remediation |
| npm run test:instrument | 0 | equity validation BLOCKED (documented) |
| npm run test:external | 0 | dataset audit passes |
| npm run test:calendar | 0 | 1 unresolved weekday discrepancy recorded |
| node scripts/final_readiness_probes.js | 0 | 12/12 probes |
| node scripts/perf_benchmark.js | 0 | equivalence true; 200k bars 923.5 ms |

Environment issues were separated from code defects: missing cryptography was installed to verify the
Python vault; cross-env was not added (CLI flags used instead).

---

## 11. Remaining blocker register

| ID | Blocker | Status | Closing condition |
|---|---|---|---|
| SECURITY-001 | Exposed broker API secret + TOTP seed + client id, public on origin/master | **BLOCKED** | Owner rotates all three and confirms; optionally authorizes history rewrite |
| SECURITY-004 | Pre-redaction copies may persist (remote, forks, clones, recovery bundle) | **OPEN** | Destroy the recovery bundle after remediation; audit clones/forks |
| INSTR-001 | Equity validation blocked; index proxy only | **BLOCKED** | Licensed, authenticated per-symbol equity data |
| COST-001 | 0/26 rate heads verified | **UNVERIFIED** | Reachable regulator/exchange/broker documents |
| DATA-002 | Dataset authenticity | **UNVERIFIED** | Vendor attestation or reconciliation to a licensed feed |
| CAL-001 | 2022-10-24 discrepancy | **OPEN** | Official NSE session list |
| CAL-002 | App calendar models 2026 only | **OPEN** | Model and cross-check historical years |
| PROFIT-001 | No arm profitable | **FAIL** | A strategy whose gross edge exceeds round-trip cost before tuning |
| HIST-001 | History scan incomplete (shallow clone) | **PRELIMINARY** | Full clone, then re-scan every commit |

---

## 12. Final Git status and commit hash

| Item | Value |
|---|---|
| Branch | `arena/b6463544-trade` |
| HEAD at report generation | `60d7c418f89beb392661642a95bfaadd2f99068c` |
| Parent | `n/a (shallow-clone boundary — parent commit not fetched)` |
| Working tree at generation | 96 modified path(s) — the report and artifacts of this pass |
| Snapshot | /home/user/security_snapshot/ (worktree tar, mode 0600, outside the repository) |
| Pushed / merged / deployed | **No** |

### Recovery note: the environment was re-cloned during this pass

The working copy was re-cloned from the GitHub remote mid-pass. Three local commits created by the
previous passes (`1ccee80`, `791e0a3`, `c9b2af2`) **no longer exist as objects** — reflog shows only
`clone` then `checkout`, and the objects are absent. Their *content* survived and is preserved in this
commit as working-tree state, verified by re-running every gate; but their hashes must not be cited as
existing. Consequences recorded honestly:

- the earlier history scan reported 18 findings across 3 commits; after re-cloning, only the boundary
  commit is reachable locally, so the reproducible figure is the 6 findings in `60d7c41` shown in §3.
  The 18/3 figure cannot be re-derived from this environment and is therefore not asserted as current.
- the exposure conclusion is unchanged: `60d7c41` is the PUBLIC commit and it alone carries the material.
- a fresh recovery snapshot was taken before any git operation on the re-cloned tree.

The commit containing this file is the final commit of this pass:

    git log -1 --format=%H -- SECURITY_AND_RESEARCH_CERTIFICATION.md

**Not live-trading-ready. Security certification BLOCKED pending credential rotation.**
