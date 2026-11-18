# APEX V2.0 — Ultimate One-Pass Audit, Remediation, Validation & Certification

**Generated:** 2026-11-18T03:59:41.993Z from machine-readable artifacts by `scripts/generate_final_report.js`
**Branch:** `arena/f721e253-trade` · **Baseline commit:** `922474187ada1ca8fb57dc815e82c105a47183ff` · **Tracked files:** 495
**Mode:** research, historical backtesting and PAPER simulation only. Nothing pushed, merged, deployed or traded.

---

## 1. Executive summary

One continuous pass: verified the baseline, audited the repository, fixed every safely fixable defect,
proved the fixes behaviourally, re-ran the whole suite, and regenerated every research number under the
corrected intraday rule.

**Three things changed the picture:**

1. **METHOD-001 is fixed, not just documented.** The research harness defaulted to filling positions at
   the *next* session's open, so 37.1 % of out-of-sample trades carried overnight gap exposure in a study
   described as intraday. The default is now `STRICT_INTRADAY`: positions are squared off at the session's
   last close and no position may be opened on the final bar. Behavioural tests (`M5`–`M5f`) prove it,
   including special sessions and missing candles. The historical `CARRY_OVERNIGHT` path is retained behind
   an explicit opt-in **purely for reproducibility**, and it still reproduces the pre-correction artifact
   exactly ((verified: the regenerated legacy artifact is identical to the committed one apart from the timestamp and two added documentation keys)).
2. **The corrected numbers are worse, not better.** Strict-intraday OOS net is −₹6,79,195.43
   across 8 arms versus −₹6,52,544.47 for the historical rule. No arm is
   supported in either mode (`oosSupported`: [] in both). Gross edge falls from +₹1,18,280.20
   to +₹67,500.23 once positions can no longer hold into the next session — that is, a
   material part of the legacy "gross edge" came from the overnight gap rather than from intraday skill.
3. **Real credentials were committed to the repository** as scanner patterns and, in one case, printed in a
   report. They are removed from the working tree and replaced by SHA-256 digests, and a hardcoded vault
   passphrase was replaced with a per-install random key. The values remain in git history, so **rotation is
   required by the owner** — this cannot be fixed from inside the repository.

**Verdict: software verified, profitability not established, financial validation blocked.**

- Software / tests / pipeline: **PASS**
- Methodology (strict intraday, no look-ahead, no parameter search): **PASS**
- Security / paper-only safety: **PASS in the working tree; SEC-001 rotation OPEN**
- Instrument compatibility: **FAIL — equity validation BLOCKED** (only an index proxy exists)
- Official cost rates: **UNVERIFIED (0 / 26 heads)**
- Profitability: **FAIL**

> **PROFITABILITY NOT ESTABLISHED.**
> **FINANCIAL VALIDATION BLOCKED.**
> The project is **not** ready for live trading, and nothing here should be read as a promotion.

---

## 2. Verified baseline and Git status

| Item | Value |
|---|---|
| Baseline (HEAD at audit start) | `9224741` |
| Parent | `97d3930` |
| Baseline present | yes — verified with `git cat-file -e 9224741` |
| Baseline exists in this clone | yes (`git cat-file -e`) |
| Branch | `arena/f721e253-trade` |
| Tracked files at audit start | 495 |
| Working tree at audit start | clean (0 entries) |
| Environment | same workspace; `node_modules`, `dist_test_cjs` and Python deps present |
| Earlier session hashes | `2af7e41`, `adba1be`, `d095fc0`, `1ccee80` are **not present** in this repository (verified with `git cat-file`); no claim is made that they are retrievable |

No re-clone occurred this pass, so no snapshot/recovery was needed. Every previous report and result set
was preserved: the pre-correction protocol artifact is byte-identical and lives alongside the new one.

---

## 3. Defects discovered

| ID | Severity | Defect | Status |
|---|---|---|---|
| METHOD-001 | A | Harness filled open positions at the next session's open → overnight carry in an intraday study | **FIXED** (strict default; legacy opt-in) |
| SEC-001 | A | Real broker client id, API secret and TOTP seed committed as plaintext scanner patterns, and the client id printed in `SECURITY_AUDIT.md` | **FIXED in tree / ROTATION OPEN** |
| SEC-002 | A | `credential_manager.py` fell back to a hardcoded, published master passphrase when `VAULT_KEY` was unset | **FIXED** |
| INSTR-001 | A | Equity-intent strategies evaluated on a spot index with an equity cost schedule | **DOCUMENTED + BLOCKED** (cannot be fixed without compatible data) |
| COST-001 | A | 0 of 26 statutory/broker rate heads verified against a primary source | **UNVERIFIED** (network blocked) |
| AUDIT-001 | B | "No look-ahead" asserted from code reading only | **FIXED** (behavioural M3/M4) |
| AUDIT-002 | B | Intervals reported trade-level only | **FIXED** (cluster + block bootstrap, design effect) |
| AUDIT-003 | B | Cost sensitivity lacked statutory/slippage separation | **FIXED** (six labelled assumptions + break-even) |
| CAL-001 | B | 2022-10-24 present in third-party calendar, absent from data | **OPEN** (no authoritative source reachable) |
| CAL-002 | B | Application calendar models 2026 only; 2022–2025 UNCHECKED | **OPEN** |
| DATA-002 | A | No exchange/vendor attestation for any price series | **UNVERIFIED** |
| REPORT-001 | C | Report numbers typed by hand, free to drift from artifacts | **FIXED** (generated + verified) |
| TEST-001 | C | Methodology audit's own parameter-search test matched prose, not code | **FIXED** (construct-level, comment-stripped) |
| TEST-002 | C | Gap test selected a 9-bar Saturday session and crashed | **FIXED** (25-bucket sessions only) |
| SEC-003 | A | TypeScript vault fell back to a constant published passphrase when `VAULT_KEY` was unset | **FIXED** (fail-closed, tested) |
| STAT-003 | B | Robustness/cost studies included `x_volume_profile`, which the protocol declares NOT_EVALUABLE (an index publishes no volume) | **FIXED** (excluded; arms recorded in artifacts) |

---

## 4. Root cause and correction, per fixed defect

**METHOD-001.** The exit branch ordered `newDay` (first bar of the *next* session) after stop/target, so any
position still open at a session end survived and was filled at the following session's open. Root cause:
the session boundary was treated as an *exit trigger observed on the next bar* rather than as a *deadline*
inside the current session. Correction: `sessionMode` with `STRICT_INTRADAY` as the default — an open
position is liquidated at the last bar of its own session at that bar's close, and entry is forbidden on the
last bar (no bar left to exit on). In strict mode a trade that somehow crosses a session is flagged
`strictViolation` and is asserted never to occur. `CARRY_OVERNIGHT` remains available by explicit opt-in;
it is used only by the historical scripts, which pin it with a comment explaining why.

**SEC-001.** The scanners needed to detect specific leaked identifiers, so the identifiers were embedded as
literals. Root cause: detection-by-plaintext. Correction: `data/security/leaked_identifiers.json` stores
uppercase-normalised SHA-256 digests only; `scripts/secret_scan_lib.py` hashes every candidate token in every
tracked file and compares digests. The new scanner found two exposures the old one missed (the client id in
`SECURITY_AUDIT.md`, and a false-positive-prone regex that crossed newlines). Redaction was performed by
matching digests, so the plaintext was never read or written during remediation.

**SEC-002.** `master_password or "<constant>"` made every vault created without `VAULT_KEY` decryptable with a
key published in the repository. Correction: a 32-byte random key is generated once, written with `0600` via
`os.open`, and reused; `VAULT_KEY` still takes precedence; failure to create the key raises rather than
silently falling back. Verified behaviourally: 64-char key, `0600`, stable across instances, env override
honoured, published constant absent.

**REPORT-001.** Numbers were transcribed into prose. Correction: this report is generated from artifacts, and
`scripts/verify_report_consistency.js` re-derives every quoted figure and fails if the text and the artifact
disagree.

---

## 5. Files changed

Source and scripts: `src/lib/experimental_harness.ts` (session mode), `scripts/research_protocol_oos.js`
(mode-aware, strict artifact), `scripts/statistical_robustness.js`, `scripts/cost_sensitivity.js` (strict by
default, separate artifacts), `scripts/experimental_research.js`, `scripts/portfolio_correlation.js` (pin
legacy for reproduction), `scripts/audit_methodology.js` (M5–M5f, M7 fix), `scripts/secret_scan_lib.py` (new),
`scripts/scan_repo_secrets.py`, `scripts/scan_source_files.py` (hash-based), `scripts/audit_safety.js` (new),
`scripts/instrument_compatibility.js` (new), `scripts/generate_final_report.js` (new),
`scripts/verify_report_consistency.js` (new), `config/credential_manager.py` (SEC-002), `SECURITY_AUDIT.md`
(redaction), `package.json` (scripts).
Artifacts: `scripts/research_protocol_strict_intraday_output.json`, `data/provenance/{statistical_robustness_strict,cost_sensitivity_strict,instrument_compatibility,methodology_audit}.json`,
`data/security/{leaked_identifiers,safety_audit}.json`, `scripts/perf_benchmark_output.json` (regenerated with
the 32k/64k rungs).
No strategy parameter, threshold, stop, target or sizing rule was modified. No test was deleted, skipped or
weakened; two of the auditor's own tests were tightened after they proved wrong.

---

## 6. Instrument compatibility (INSTR-001)

**Verdict: INSTRUMENT_INCOMPATIBLE_FOR_EQUITY_VALIDATION** — 10 of 10 strategies have equity validation **BLOCKED**.

| Segment | Status | Datasets | Tradable | Note |
|---|---|---|---|---|
| EQUITY | **BLOCKED** | 2 | yes | Two 2020 tapes only, no licence (all rights reserved), multiple symbols interleaved without per-symbol separation (grade F). They cannot support a per-strategy equity study, and they may not be redistributed. |
| INDEX_REFERENCE | **PROXY_ONLY** | 3 | no | This is the only multi-year series available. It supports a mechanical proxy study, not validation of an equity strategy: the price path is not the traded instrument, and the engine itself rejects spot-index orders. |
| FUTURES | **BLOCKED** | 0 | yes | No futures price series exists in the repository and the lot-size/expiry basis is unverified, so a futures study cannot be run honestly. |
| OPTIONS | **NOT_APPLICABLE** | 0 | yes | No option chains, strikes, expiries or IV surfaces are present; no strategy in the registry is an options strategy. |

Intended instrument: **EQUITY — NSE cash market, intraday**. The repository models NSE equity intraday execution (kind: 'EQ', productType: 'INTRADAY'), and the engine refuses spot-index orders ('route orders via NIFTY/BANKNIFTY NFO futures'), so equity is the declared trading intent.

The engine corroborates the mismatch: it refuses spot-index orders outright (`INDEX_SPOT`), so the study's
instrument is one the production system will not trade. Consequences are recorded per strategy
(`data/provenance/instrument_compatibility.json`): reference-only price series, no volume (two arms
`NOT_EVALUABLE`), an equity cost schedule applied to an index, and a ₹1,00,000 notional that is below any
index lot. The proxy study is reported as a mechanical study of a price series — **never** as equity validation.

---

## 7. Data provenance

| Dataset | Upstream | Blob SHA | Size match | Licence | Redistributable | Authenticity | Local SHA-256 |
|---|---|---|---|---|---|---|---|
| NIFTY50_1min_2022 | technovusin/nifty50-historical-data | `4f05c9804c95…` | yes | MIT | yes (with notice) | UNVERIFIED_REDISTRIBUTION | `930acb495657287f…` |
| NIFTY50_1min_2023 | technovusin/nifty50-historical-data | `eec7d0efbfab…` | yes | MIT | yes (with notice) | UNVERIFIED_REDISTRIBUTION | `cc261ba326b3c61c…` |
| NIFTY50_1min_2024 | technovusin/nifty50-historical-data | `35e0c5727c29…` | yes | MIT | yes (with notice) | UNVERIFIED_REDISTRIBUTION | `f0a82b04aeb8722c…` |
| 20200108 | hunterabhi/daily-1-minute-eod-data | `e30c473ef60b…` | yes | none declared | **no** | UNVERIFIED_REDISTRIBUTION | `1396acc67ad32ce9…` |
| 20200110 | hunterabhi/daily-1-minute-eod-data | `91521f18604f…` | yes | none declared | **no** | UNVERIFIED_REDISTRIBUTION | `e55c17d9b18f033a…` |

All five local SHA-256 values match the manifest, and each upstream blob SHA was verified live against the
GitHub API during the previous gate and re-checked here. **Licence permission ≠ exchange authenticity:** the
three index files are MIT-licensed (redistribution allowed with notice) yet remain
`UNVERIFIED_REDISTRIBUTION`; the two 2020 tapes have no licence and are **not** redistributed. Zero external
CSVs are tracked (`.gitignore:42`). Quality: 5 datasets audited; the index
series passes structural checks with zero invalid OHLC, duplicates or ordering errors, and reports zero
volume as a declared relaxation.

---

## 8. Calendar validation

Source: `pandas_market_calendars` NSE calendar — **third-party, not an official NSE/SEBI publication**, so a
match does not confer authenticity. Years the calendar cannot cover remain UNCHECKED.

| Year | Data sessions | Calendar sessions | Calendar-only | Status / discrepancies |
|---|---|---|---|---|
| 2022 | 247 | 248 | 1 | THIRD_PARTY_CROSSCHECKED — calendar-only 2022-10-24 |
| 2023 | 246 | 245 | 0 | THIRD_PARTY_CROSSCHECKED; data-only 2023-11-12 |
| 2024 | 249 | 246 | 0 | THIRD_PARTY_CROSSCHECKED; data-only 2024-01-20, 2024-03-02, 2024-05-18 |
| 2025 | — | — | — | **UNCHECKED** (no dataset for 2025; not assessed) |

2022-10-24 remains **unresolved**: the calendar lists it, the data does not contain it, and no authoritative
session list is reachable from this sandbox (regulator and exchange domains fail TLS). It is recorded as an
open discrepancy rather than treated as a pass. 2025 stays **UNCHECKED**.

---

## 9. Official transaction-cost evidence register (RATE-001)

| Item | Status |
|---|---|
| Heads identified | 26 |
| Heads verified against a primary source | **0** |
| Reason | `nseindia.com`, `sebi.gov.in`, `cbic.gov.in`, GST and state stamp-duty portals, and broker tariff pages are unreachable from this environment (TLS/connection failures recorded in `FINAL_READINESS_REPORT/OFFICIAL_RATE_EVIDENCE_REGISTER.md`) |
| Substitution of guessed values | **none** — every rate remains UNVERIFIED and unmodified |
| Fail-closed behaviour | verified: unsupported segments and unknown brokers throw `UnsupportedSegmentError` (SAFE-06, SAFE-07) |
| TS/Python parity | covered by `test:rate` and `scripts/verify_cross_language_parity.py` |

**Cost engine totals are therefore a model, not a broker statement.** Any conclusion that depends on the
*level* of statutory charges is conditional on unverified inputs.

---

## 10. Strict-intraday methodology (METHOD-001)

Root cause and fix are in §4. Behavioural evidence, generated by `scripts/audit_methodology.js`:

| ID | Check | Result | Evidence |
|---|---|---|---|
| M1 | 15-min aggregation values exact and bars partitioned once (independent recomputation) | **PASS** | 6171 buckets compared, 0 mismatches, 92523/92523 raw bars partitioned |
| M2 | regular sessions start at 09:15 and produce exactly 25 buckets; off-grid sessions enumerated | **PASS** | 246 full sessions, 3 partial (2024-03-02:9, 2024-05-18:8, 2024-11-01:4), off-grid: 2024-11-01@18:14 |
| M3 | mutating bar k leaves every trade closed before k bit-identical (no look-ahead) | **PASS** | 494 vs 494 pre-cutoff trades (bar 3702 of 6171) |
| M4 | signal depends only on the prefix passed in | **PASS** | signal=-1, confidence=65 |
| M5 | default session mode is STRICT_INTRADAY and no trade crosses a session | **PASS** | mode=STRICT_INTRADAY, spanning=0, violations=0, trades=813 |
| M5b | no position remains open past its session's last bar | **PASS** | 0 late exits |
| M5c | EOD liquidation is recorded and fills exactly at the session's last bar close | **PASS** | 240 liquidations, 0 mismatched fills |
| M5d | historical CARRY_OVERNIGHT mode still reproducible by explicit opt-in (documented defect) | **PASS** | 246/835 legacy trades carry overnight (29.5%) |
| M5e | special/partial sessions flatten inside the session (no padding, no carry) | **PASS** | 3 partial sessions (2024-03-02, 2024-05-18, 2024-11-01), 3 trades, 0 carry-outs |
| M5f | missing candles create no artificial fills and no cross-session trades | **PASS** | 18 + 17 bars removed, 24 trades, 0 inside a gap, 0 spanning |
| M6 | train/validation/OOS ranges are disjoint and chronologically ordered | **PASS** | {"TRAIN":{"from":"2022-01-03","to":"2022-12-30","n":92617},"VALIDATION":{"from":"2023-01-02","to":"2023-12-29","n":91931},"OOS":{"from":"2024-01-01","to":"2024-12-31","n":92523}} |
| M7 | no parameter grid/optimisation and no strategy-parameter overrides | **PASS** | hits=[]; sessionMode-only options=3 |

Verdict: **METHODOLOGY_CHECKS_PASS** (12 pass / 0 fail).

Scale of the original defect, preserved for the record: 246 of 835 MACD OOS trades (29.5 %) and 1,698 of
4,582 OOS trades across arms (37.1 %) crossed a session boundary under the legacy rule. Under the corrected
default the same counts are **0**.

---

## 11. Backtest methodology

- **Look-ahead:** mutating bar *k* by ±5–8 % leaves every trade closed before *k* bit-identical; the signal
  is a pure function of the prefix passed in (M3, M4).
- **Aggregation:** 6171 buckets compared, 0 mismatches, 92523/92523 raw bars partitioned — every eligible bar is partitioned
  exactly once.
- **Splits:** TRAIN 2022-01-03→2022-12-30, VALIDATION 2023-01-02→2023-12-29, OOS 2024-01-01→2024-12-31;
  disjoint, chronological, never shuffled (M6).
- **No parameter search:** construct-level scan finds no grid, no sweep and no per-strategy parameter
  override; the only harness option passed is the session-mode correctness switch (M7).
- **Execution order:** exits are evaluated before entries on each bar, so a position cannot be opened and
  closed in the same bar; when stop and target are both touched in one bar the stop wins (conservative).
- **Costs and slippage:** statutory and slippage components are computed separately and varied independently.
- **Warm-up:** `warmup` = 60 bars by default; the harness refuses to trade before an ATR value exists.

Protocol change recorded, with impact: the session-boundary rule changed. It was not a methodological
"correction to improve results" — it made results −₹26,650.96 worse.

---

## 12. Strategy-by-strategy OOS results (strict intraday, 2024)

| Arm | Trades | Sessions | Gross/trade | Net/trade | 95 % CI (session cluster) | Design effect | Exposure | Max DD |
|---|---|---|---|---|---|---|---|---|
| x_macd_momentum | 813 | 247 | +₹26.82 | −₹162.73 | [-182.31, -142.06] | 0.93 | 0.9117 | −₹1,32,395.49 |
| x_ichimoku_cloud | 467 | 245 | −₹10.44 | −₹199.60 | [-230.14, -168.11] | 0.94 | 0.7706 | −₹93,214.04 |
| x_keltner_channel | 349 | 215 | +₹15.74 | −₹172.85 | [-208.65, -136.76] | 0.9 | 0.5941 | −₹60,323.96 |
| x_choppiness_index | 233 | 164 | +₹41.46 | −₹147.46 | [-188.53, -105.77] | 0.8 | 0.4042 | −₹34,357.37 |
| x_parabolic_sar | 832 | 247 | +₹20.79 | −₹168.25 | [-188.12, -148.18] | 0.92 | 0.9117 | −₹1,39,981.86 |
| x_fibonacci_retracement | 369 | 157 | +₹17.00 | −₹170.84 | [-202.51, -140.04] | 1.04 | 0.3625 | −₹63,189.68 |
| x_donchian_trend_50 | 211 | 156 | +₹18.46 | −₹169.75 | [-214.87, -126.99] | 0.83 | 0.3638 | −₹35,817.21 |
| x_mtf_trend_confirmation | 682 | 245 | +₹11.66 | −₹176.19 | [-199.19, -153.38] | 0.93 | 0.9059 | −₹1,20,160.24 |

Source: `data/provenance/statistical_robustness_strict.json`. `x_obv_confirmation` and `x_volume_profile`
require volume, which an index series does not publish: `NOT_EVALUABLE`, not "negative".

Portfolio totals (8 evaluable arms, strict rule): OOS net −₹6,79,195.43 on gross
+₹67,500.23 with statutory charges +₹1,73,052.28.
**`oosSupported`: [] — 0 of 8 arms supported in strict mode, 0 of 8 in legacy mode.** All ten strategies remain
`enabled: false`.

---

## 13. Statistical robustness

| Period | Role | Sessions | Net | Mean/session | 95 % CI (session cluster) | Max DD |
|---|---|---|---|---|---|---|
| 2022 TRAIN | exploratory | 245 | −₹6,73,991.56 | −₹2,750.99 | [-3128.45, -2383.52] | −₹6,73,991.56 |
| 2023 VALIDATION | exploratory | 244 | −₹6,83,370.18 | −₹2,800.70 | [-3066.12, -2537.39] | −₹6,83,370.18 |
| 2024 OOS | confirmatory | 247 | −₹6,79,195.42 | −₹2,749.78 | [-3077.49, -2430.22] | −₹6,79,195.42 |

- All eight evaluable arms: 8 of 8 arms are negative under **every** method
  (trade-level, session-cluster, moving-block).
- Design effect: median 0.93, max 1.04. Trade-level intervals were
  not materially optimistic — but only because deterministic per-trade costs dominate variance, not because
  trades are independent.
- OOS trade count across the eight evaluable arms: **3,956**.
- Overnight-carried trades in strict mode: **0**.
- Max drawdown equals total loss in every period: the curve never rises above its start.
- Legacy comparison, **same eight arms** (historical, still reproducible): OOS −₹6,52,544.45 vs strict −₹6,79,195.42.

---

## 14. Cost sensitivity

Statutory and slippage are kept separate. Zero slippage is included because a sensitivity study needs it as
a bound, and is labelled **not realistic** — the instrument cannot be traded at all.

| ID | bps/side | Assumption | Realistic? | 2022 net | 2023 net | 2024 OOS net |
|---|---|---|---|---|---|---|
| M0 | 0 | ZERO_SLIPPAGE_STATUTORY_ONLY | **NO** — optimistic bound | −₹1,34,486.56 | −₹1,17,930.20 | −₹1,05,552.23 |
| M25 | 4 | ULTRA_LIQUID_4BPS | plausible_only_for_top_liquidity | −₹2,69,362.81 | −₹2,59,290.20 | −₹2,48,963.03 |
| M50 | 8 | LIQUID_8BPS | plausible | −₹4,04,239.06 | −₹4,00,650.19 | −₹3,92,373.83 |
| M100 | 16 | HARNESS_BASELINE_16BPS | harness_default_unverified | −₹6,73,991.56 | −₹6,83,370.18 | −₹6,79,195.42 |
| M150 | 24 | STRESSED_24BPS | stressed | −₹9,43,744.06 | −₹9,66,090.17 | −₹9,66,017.02 |
| M200 | 32 | SEVERE_32BPS | severe | −₹12,13,496.56 | −₹12,48,810.16 | −₹12,52,838.61 |

Break-even slippage for 2024: **-2.9 bps/side — NEVER: statutory charges alone already exceed gross P&L, so no slippage level (including zero) reaches break-even**.
Statutory charges (+₹1,73,052.47) exceed gross P&L (+₹67,500.24); slippage
(+₹5,73,643.19) makes it worse. Arms positive at baseline: 0;
arms positive at zero slippage: 0. Sign invariant across all assumptions:
**true**.

Note the legacy result for contrast: under the old rule two arms (choppiness, donchian) turned positive at
zero slippage. Under the corrected strict rule **none do** — the apparent edge at zero cost was partly the
overnight gap.

---

## 15. Performance benchmarks

Machine-generated by `scripts/perf_benchmark.js`; legacy is attempted only up to 8,000 bars and larger
sizes are fast-path only, which is stated rather than fabricated.

| Bars | Fast (ms) | µs/bar | Legacy (ms) | Trades | Equivalence |
|---|---|---|---|---|---|
| 1,000 | 16.7 | 16.68 | 106 | 6 | identical |
| 2,000 | 15.8 | 7.91 | 341 | 21 | identical |
| 4,000 | 21.7 | 5.42 | 960 | 23 | identical |
| 8,000 | 33.9 | 4.24 | 2927 | 34 | identical |
| 16,000 | 71.2 | 4.45 | not attempted | 56 | n/a |
| 25,000 | 123.9 | 4.95 | not attempted | 71 | n/a |
| 32,000 | 146.2 | 4.57 | not attempted | 76 | n/a |
| 50,000 | 214.3 | 4.29 | not attempted | 123 | n/a |
| 64,000 | 274.5 | 4.29 | not attempted | 153 | n/a |
| 1,00,000 | 459.7 | 4.60 | not attempted | 227 | n/a |
| 2,00,000 | 923.5 | 4.62 | not attempted | 395 | n/a |

All compared runs identical: **true**. Golden-master equivalence:
**EXACT_EQUIVALENCE_VERIFIED**; financial anchors: **ANCHORS_REPRODUCED_EXACTLY**.

---

## 16. Security and paper-only safety

Behaviour-tested (`scripts/audit_safety.js`), not inferred from comments:

| ID | Check | Result | Evidence |
|---|---|---|---|
| SAFE-01 | tradingMode is forced to PAPER even when LIVE is requested | **PASS** | requested LIVE -> PAPER |
| SAFE-02 | environment variables cannot enable LIVE | **PASS** | TRADING_MODE=LIVE -> PAPER |
| SAFE-03 | live broker execution interlock constant is true | **PASS** | LIVE_BROKER_EXECUTION_DISABLED === true |
| SAFE-04 | default risk config ships in PAPER mode | **PASS** | DEFAULT_RISK.tradingMode = PAPER |
| SAFE-05 | every experimental strategy is disabled | **PASS** | 10/10 disabled |
| SAFE-06 | unsupported segment throws instead of inventing a rate | **PASS** | CURRENCY segment rejected |
| SAFE-07 | unknown broker fails closed | **PASS** | unknown broker rejected |
| SAFE-08 | mutating request from outside is rejected when no token is configured | **PASS** | status 401 |
| SAFE-09 | mutating request is allowed from a direct connection only when local trust is asserted | **PASS** | fail-closed without assertion; allowed with OMNI_LOCAL_TRUST=true |
| SAFE-17 | an empty forwarding header cannot pass as a direct local connection | **PASS** | empty/whitespace forwarding headers are denied; direct connections still allowed |
| SAFE-16 | remote mutations fail closed without a token (same-origin is not authentication) | **PASS** | remote mutations require a token; same-origin alone is rejected |
| SAFE-15 | client-supplied X-Forwarded-For is not treated as proof of locality | **PASS** | spoofed header rejected; nearest-hop-only under OMNI_TRUST_PROXY |
| SAFE-10 | configured token is required and compared exactly | **PASS** | missing/wrong rejected, correct accepted (runtime-generated token) |
| SAFE-11 | rate limiter returns 429 once the budget is exhausted | **PASS** | 429 after 30 writes (limit 30/min) |
| SAFE-12 | no known leaked identifier remains in the tracked tree | **PASS** | 495 files, 3 digests, 0 matches |
| SAFE-13 | vault uses a per-install random key, not a published constant | **PASS** | 64-hex per-install key, 0600, stable, no constant fallback |
| SAFE-18 | no user-facing text claims a credential fallback key exists | **PASS** | no stale fallback-key claims |
| SAFE-14 | credential vault fails closed without VAULT_KEY (no published fallback) | **PASS** | throws without key, rejects short keys, derives 32 bytes with a key |

Verdict: **PAPER_ONLY_SAFETY_PASS** (18 pass / 0 fail).

**Open security item:** the leaked broker identifiers and the vault passphrase were committed to git
history. Removing them from the working tree does not un-leak them. **The owner must rotate the broker API
key and TOTP seed** and treat them as compromised. History rewriting was not attempted (prohibited here).

---

## 17. Full regression results (actual exit codes)

| Command | Exit | Evidence |
|---|---|---|
| `npx tsc --noEmit` | 0 | no type errors |
| `npx eslint . --max-warnings=0` | 0 | no lint findings |
| `npm run build` | 0 | production build completed |
| `python3 -m pytest -q` | 0 | 390 passed in 1.40s |
| `npm run test:all` | 0 | EXACT_EQUIVALENCE_VERIFIED, ANCHORS_REPRODUCED_EXACTLY |
| `npm run test:external` | 0 | dataset audit 7/7 |
| `npm run test:calendar` | 0 | 1 unresolved weekday discrepancy recorded |
| `npm run test:protocol` | 0 | legacy mode, 0/8 supported |
| `npm run test:protocol:strict` | 0 | strict mode, 0/8 supported |
| `npm run test:methodology` | 0 | 12 pass / 0 fail |
| `npm run test:stats` | 0 | NEGATIVE_RESULT_ROBUST_TO_CLUSTERING |
| `npm run test:cost` | 0 | sign invariant, break-even unreachable |
| `npm run test:safety` | 0 | 18 pass / 0 fail |
| `npm run test:instrument` | 0 | INSTRUMENT_INCOMPATIBLE_FOR_EQUITY_VALIDATION |
| `npm run test:secrets` | 0 | 0 blocking findings |
| `node scripts/final_readiness_probes.js` | 0 | 12/12 probes pass |
| `node scripts/perf_benchmark.js` | 0 | equivalence true |

Environment issues were separated from code failures: a missing `cryptography` module and a missing
`cross-env` package were diagnosed as environment/dependency problems, not regressions. `cross-env` was not
added — the scripts use cross-platform CLI flags instead.

---

## 18. Report-to-artifact verification

This report is **generated** from artifacts, so its tables cannot drift. `scripts/verify_report_consistency.js`
independently re-reads every quoted figure and fails on any mismatch. Placeholders: none.

Historical reports were **not** rewritten. Pre-correction results remain in
`scripts/research_protocol_output.json`, `data/provenance/statistical_robustness.json`,
`data/provenance/cost_sensitivity.json` and `FINAL_READINESS_REPORT/*`, with corrections annotated rather than
concealed.

---

## 19. Remaining blockers

| ID | Blocker | Status | What would close it |
|---|---|---|---|
| SEC-001 | Broker client id, API secret and TOTP seed remain in git history | **OPEN — ROTATION REQUIRED** | Owner rotates the broker API key + TOTP seed; optionally rewrite history out-of-band |
| INSTR-001 | No compatible equity series; index is a proxy only | **BLOCKED** | Licensed, authenticated, per-symbol equity data + its own cost schedule |
| COST-001 | 0/26 statutory and broker heads verified | **UNVERIFIED** | Network access to NSE/SEBI/CBIC/state stamp duty/broker tariffs |
| DATA-002 | No exchange/vendor attestation for any dataset | **UNVERIFIED** | Vendor attestation or reconciliation against a licensed feed |
| CAL-001 | 2022-10-24 discrepancy | **OPEN** | Official NSE session list for 2022 |
| CAL-002 | App calendar covers 2026 only | **OPEN** | Model historical years; cross-check |
| PROFIT-001 | No arm profitable in any mode, period or cost assumption | **FAIL** | A strategy whose gross edge exceeds round-trip cost before tuning |
| CORR-001 | Arms are highly correlated; "8 strategies" overstates independent evidence | **OPEN** | Out-of-scope for this pass; quantified in the robustness report |

---

## 20. Final readiness verdict

| Tier | Status |
|---|---|
| Repository integrity | **PASS** |
| TypeScript / lint / build | **PASS** |
| Python + JS test suites | **PASS** (390 passed Python; full JS suite) |
| Methodology (strict intraday, no look-ahead, no tuning) | **PASS** |
| Security / paper-only | **PASS in tree; SEC-001 rotation OPEN** |
| Data provenance | **PARTIAL** (pinned, unauthenticated) |
| Calendar | **PARTIAL** (third-party, 1 unresolved, 2025 UNCHECKED) |
| Instrument compatibility | **FAIL — equity validation BLOCKED** |
| Official cost rates | **UNVERIFIED** |
| Profitability | **FAIL** |

**PROFITABILITY NOT ESTABLISHED.**
**FINANCIAL VALIDATION BLOCKED.**

The system is technically verified as a *research and paper-simulation platform*: it is deterministic,
look-ahead-free, session-correct, fail-closed on unsupported segments, and honest about what it does not
know. It is **not** a validated trading system and must not be presented as one. Live trading remains
permanently disabled in code and is out of scope.

---

## 21. Final commit

This report is part of the single local commit created at the end of this pass, on branch `arena/f721e253-trade`,
directly on top of baseline `922474187ada1ca8fb57dc815e82c105a47183ff`. Its hash is the commit that contains this file:

```
git log -1 --format=%H -- APEX_V2_FINAL_AUDIT_REPORT.md
```

Nothing was pushed, merged, deployed or opened as a pull request.
