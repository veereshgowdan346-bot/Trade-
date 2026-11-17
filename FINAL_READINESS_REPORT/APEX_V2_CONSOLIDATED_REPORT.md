# OMNITRADEPRO APEX V2.0 — Consolidated Final Report

**Session date:** 2026-11-17 · **Branch:** `arena/b6463544-trade` · **Base commit:** `60d7c41`
**Verified HEAD at session start:** `2af7e41` (24 files, +3,330/−31, working tree clean)
**Verdict: PARTIALLY PASS — research infrastructure and reporting integrity improved; deployment
remains BLOCKED by unverified cost rates and the total absence of real market data.**

This report is the single consolidated deliverable. Every claim below points at a file, a command or
a measured number. Status vocabulary is restricted to **PASS / FAIL / BLOCKED / UNVERIFIED**.

---

## A. Baseline verification (done first, not assumed)

| Check | Result |
|---|---|
| Branch / HEAD | `arena/b6463544-trade` @ `2af7e41` (parent `60d7c41`, grafted depth 1) |
| Working tree | clean at start |
| Tracked files | 402 |
| Reports | 25 `.md` in `FINAL_READINESS_REPORT/` |
| Remote | `veereshgowdan346-bot/Trade-.git`; **1 unpushed local commit**, nothing pushed |
| Prior claims re-tested, not trusted | `npm test` 169/169 · math 40/40 · anchors `ANCHORS_REPRODUCED_EXACTLY` · registry 11/11 |

No destructive git operation was performed; no history was rewritten.

## B. Defects resolved this session

### B1. BT-004 — Sharpe/Sortino annualised per-trade returns → **PASS (FIXED)**
The array named `dailyReturns` held per-trade returns but was scaled by √252, yielding −81.37 on a
single session. Replaced with `computeRiskAdjustedRatios()` over **IST-session** equity returns;
`null` + `INSUFFICIENT_SAMPLE` below 20 sessions; `DAILY_ANNUALIZED` above; standard downside
deviation; `EPS=1e-12` zero-dispersion guard. **Financial output changed — declared** (see
`RISK_ADJUSTED_METRICS.md`). Evidence: `scripts/metric_tests.js` **9 PASS / 0 FAIL**.

### B2. DATA-001 (pipeline half) — no provenance, no dataset identity, no synthetic guard → **PASS**
`src/lib/data_quality.ts`: declared `kind` (`REAL`/`SYNTHETIC`/`INCOMPLETE`/`UNVERIFIED`), SHA-256
dataset fingerprints, staleness/session/holiday/zero-volume checks, **per-session** candle coverage,
grading, `researchUsable` and `profitClaimAllowed`. `assertProvenanceConsistent()` **throws** if synthetic data
claims to be REAL. `scripts/data_quality_audit.js`: 5 datasets audited, **10/10 negative controls
detected**, **6/6 registry invariants hold**. Three fixtures grade A (100%); `special_sessions_1m`
grades **D (65%)** and `corrupted_anomalies_1m` grades **F (25.5%)** — both refused for research use,
because they are 84.67% and 73.33% incomplete respectively (`npm run test:data` exits 0).

### B3. CORR-001 — 12-session correlation sample → **MEASURED (PRELIMINARY), NOT SUPPORTED**
Expanded to 30 sessions × 3 regimes = 90 sessions on genuine NSE trading days, full-prefix signals. A
bounded-window shortcut was **measured at only ~99.6% agreement and rejected**. Findings: mean |r|
0.299 pooled / **0.288 Fisher z-averaged within regimes** (primary), exposure overlap 0.718,
portfolio −₹4,54,585.91, **0 positive days in 90**, charges **9.85× net loss**. No diversification
claim is made.

### B4. RATE-001 — registry audited, not "fixed" → **BLOCKED / UNVERIFIED**
26 rate heads: 21 UNVERIFIED, 2 UNSUPPORTED_NO_EVIDENCE, 3 assumed, **0 VERIFIED** — correct, since no
official tariff document exists locally and NSE/SEBI/GST portals are unreachable. Verified instead:
provenance completeness, TS↔Python **byte-identical spec** (sha256 `95ba7ebb9869…`), fail-closed for
`NSE_EQ_DELIVERY`/`CNC`/`CDS_ANY`, and **no shadow rate literals** in UI/source. **15 PASS / 0 FAIL**.

### B5. PERF-001 ladder — **PASS**, 32k/64k rows now included
11 rows from 1k → 200k, `allComparedRunsIdentical: true`:

| Bars | Fast (ms) | µs/bar | Trades | Net (₹) |
|---:|---:|---:|---:|---:|
| 1,000 | 13.1 | 13.11 | 6 | −1,975.70 |
| 8,000 | 31.2 | 3.90 | 34 | −7,096.43 |
| 16,000 | 67.0 | 4.19 | 56 | −12,788.46 |
| **32,000** | **143.4** | 4.48 | 76 | −16,902.06 |
| **64,000** | **269.1** | 4.20 | 153 | −34,021.99 |
| 100,000 | 409.5 | 4.10 | 227 | −48,195.40 |
| 200,000 | 879.3 | 4.40 | 395 | −82,192.86 |

Flat µs/bar ⇒ linear scaling confirmed. Exact equivalence to the legacy path is proven separately
(`scripts/perf_equivalence.js`, 3/3 trade-level EXACT MATCH + determinism).

## C. Blocker register

| ID | Root cause | Modules | Evidence | Remediation | Status | Remaining action |
|---|---|---|---|---|---|---|
| **RATE-001** | No official tariff documents locally; official portals unreachable | `config/statutory_rates.json`, `src/lib/tax.ts`, `src/lib/rateSpec.ts`, `risk/rate_spec.py` | `data/rate_registry_audit.json`, 15/15 checks | Registry audited, parity + fail-closed proven, **no value invented** | **BLOCKED / UNVERIFIED** | Attach dated official circulars + broker screenshots; then per-rate VERIFIED |
| **PROFIT-001** | Negative expectancy across all reproducible datasets; sample too small for claims | `backtest_engine`, research scripts | anchors −₹7,576.06 / −₹4,023.54 / −₹602.96; 9/10 then 10/10 strategies negative | Protocol documented, no re-tuning to flatter results | **FAIL** | Real data + ≥60 sessions/regime |
| **DATA-001** | No real market data in repo | `data/fixtures`, `data_quality.ts` | `data/dataset_registry.json` | Pipeline built + certified; synthetic guard enforced | **Pipeline PASS / Data BLOCKED** | Supply real NSE data with retrieval date + adjustment policy |
| **CORR-001** | Prior sample 12 sessions | `experimental_harness.ts`, `portfolio_correlation.js` | 90-session study, PRELIMINARY | Upgraded and labelled | **MEASURED / NOT SUPPORTED** | ≥60 sessions of real data |
| **BT-004** | √252 on per-trade returns | `backtest_engine.ts` | 9/9 metric tests | Fixed | **PASS (FIXED)** | none |
| **PERF-001** | O(n²) prefix recomputation | `consensus_fast.ts` | equivalence + ladder | Fixed previously; ladder completed | **PASS** | none |
| **RT-001** | Live feed vs simulated tape | data layer | no live feed code reachable | none attempted | **BLOCKED (Category C)** | Authorisation required |
| **WAVE-001** | Wave-detection thresholds uncalibrated | strategy layer | — | none attempted | **BLOCKED (Category C)** | Authorisation required |
| **QUORUM-002** | Quorum tuning | consensus | — | none attempted | **BLOCKED (Category C)** | Authorisation required |
| **EXP-001** | 10 research strategies, no edge | `experimental_strategies.ts` | original study 9/10 net negative (equal-weight −₹1,56,048.10); 90-session study 10/10 net negative; `promotionCandidates: NONE` | Evaluated, none promoted, all `enabled: false` | **FAIL (research finding)** | Do not promote |

## D. Regression — actual results

| Suite | Result |
|---|---|
| `npm test` (jest unit/integration) | **169 / 169 PASS** |
| `scripts/run_comprehensive_tests.js` (independent math) | **40 / 40 PASS** |
| `scripts/metric_tests.js` (BT-004) | **9 / 9 PASS** |
| `scripts/portfolio_stats_tests.js` (CORR-001) | **26 / 26 PASS** |
| `scripts/experimental_registry_tests.js` | **11 / 11 PASS** |
| `scripts/rate_registry_audit.js` (RATE-001) | **15 / 15 PASS** |
| `scripts/data_quality_audit.js` (DATA-001) | 10/10 controls + 6/6 invariants, exit 0 |
| `scripts/perf_equivalence.js` | EXACT MATCH 3/3, deterministic |
| `scripts/anchor_reproduction.js` | `ANCHORS_REPRODUCED_EXACTLY` (12 checks) |

`npm run test:all` (the full chain) exits **0**. No test was weakened; the one changed assertion in
`run_comprehensive_tests.js` was made **stricter** (null-or-number **plus** declared basis).

## E. Honest corrections made during this session

Recorded because they matter for trusting the numbers:

1. My first DATA-001 control harness had an inverted flag, so three controls reported "not detected".
   The **harness** was wrong, not the validator — fixed, then 10/10 detected.
2. My first CORR-001 enumeration missed all broker heads (wrong JSON shape assumption) — 16 heads
   became 26 after fixing the enumeration.
3. Five CORR-001 unit-test expectations were arithmetically wrong (DD, recovery, overlap, r). Each was
   re-derived **by hand** and the *test* corrected — the library was **not** changed to fit the test.
4. I initially typed a 32k net P&L from memory (−20,395.23); the measured value is **−16,902.06**.
   Corrected against `perf_benchmark_output.json`.

## F. Accepted limitations (not defects, not hidden)

- Synthetic fixtures cannot support profitability conclusions; `profitClaimAllowed` is `false` for all
  five datasets by design.
- Correlations at 30 sessions are `PRELIMINARY`; no allocation recommendation follows from them.
- The 20-session risk-adjusted floor and the 200-bar research minimum are **project choices**, stated
  in code and tests, not statistical derivations.
- Annualisation by √252 assumes i.i.d. daily returns.
- The Python engine is exercised by tests but is not in the UI request path (`ARCH-001`).
- No browser E2E automation (`UI-002`); rate limiting is per-instance (`RATE-LIMIT-001`).

## G. Safety posture (unchanged)

Live trading permanently disabled · no real-money orders · no live broker API connection · no
credential access · no leverage increase · no stop-loss weakening · no risk-limit relaxation · no
parameter optimisation to flatter results · no deploy or push.

## H. Final acceptance tiers

| Tier | Status |
|---|---|
| CODE | **PASS** |
| TEST | **PASS** |
| COST MODEL | **FAIL / UNVERIFIED** (RATE-001) |
| BACKTEST | **PASS** |
| PAPER | **PASS** |
| ALGORITHM SIMULATION | **PASS** |
| DATA PIPELINE | **PASS** (data itself BLOCKED) |
| PROFITABILITY | **FAIL** (PROFIT-001) |

## I. What would have to change for a PASS

1. Attach dated official rate documents and move heads to `VERIFIED` (RATE-001).
2. Supply real NSE data with retrieval timestamp, timezone and adjustment policy (DATA-001).
3. Re-run PROFIT-001 and CORR-001 on ≥60 real sessions per regime with the predefined protocol,
   reporting every parameter set including failures.
4. Only then consider the Category-C items — and only with explicit authorisation.

## J. FINAL VERDICT

# PARTIALLY PASS

Research infrastructure, reporting integrity and two genuine defects (BT-004, DATA-001 pipeline) are
resolved and evidenced. The system is **not** live-trading-ready and **no profitability claim is made**:
the binding constraints are unverified cost rates and the absence of any real market data — neither of
which can be fixed by code in this environment.
