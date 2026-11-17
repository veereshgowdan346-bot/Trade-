# Final Readiness Verdict — Phase 2 Independent Research Audit

**Date:** 2026-11-17 · **Branch:** `arena/b6463544-trade` · **Baseline:** `d095fc0754edd40ca369a127ce140a7d22e0e680`
**Mode:** PAPER only. Nothing merged, pushed, deployed or traded. No strategy promoted.
**Mandate:** verification only — no optimisation, no parameter change to improve results.

---

## Verdict

# 🔴 NOT READY

**The research result is negative and the negative result is robust.** Nine evaluable strategy arms
were tested on three independent calendar years of real 1-minute NIFTY 50 data; every arm loses money
in every year under every statistical method and every cost assumption tested. The software, tests,
data pipeline and backtest mechanics are in good shape; the *trading thesis* is not, and two of the
inputs it depends on (official cost rates, data authenticity) are unverified.

| Tier | Status | Basis |
|---|---|---|
| Code quality | 🟢 PASS | `tsc` 0, `lint` 0, build OK |
| Test suite | 🟢 PASS | 389 pytest (root incl. `test_shoonya_auth.py`; 388 under `tests/`), full jest suite, `EXACT_EQUIVALENCE_VERIFIED`, `ANCHORS_REPRODUCED_EXACTLY` |
| Data pipeline | 🟢 PASS | External audit exit 0; byte-pinned blobs; zero raw data tracked |
| Backtest mechanics | 🟡 PASS with defect | Aggregation exact (0 mismatches / 92,523 bars), no look-ahead, splits clean — but METHOD-001 overnight carry |
| Data authenticity | 🔴 UNVERIFIED | No exchange/vendor attestation |
| Calendar | 🟡 PARTIAL | Third-party cross-check; 1 unresolved weekday discrepancy; 2025 UNCHECKED |
| Cost model | 🔴 FAIL / UNVERIFIED | 0/26 statutory heads verified |
| **Profitability** | 🔴 **FAIL** | 0/9 arms positive at baseline; 0/9 `OOS_SUPPORTED` |

All 10 strategies remain `enabled: false`. This verdict does not change that.

---

## Gate certification

### Gate 1 — Git recovery integrity: 🟢 PASS

| Check | Result |
|---|---|
| HEAD | `d095fc0754edd40ca369a127ce140a7d22e0e680` — **MATCH** |
| Parent | `60d7c41` — correct |
| Tracked files | 431 |
| Commit contents | 57 files (45 added, 12 modified); largest 180 KB; no `data/external` |
| Working tree | **clean** (0 entries) after restoring 2 files |
| Lost local-only commits | `2af7e41`, `adba1be` — both `fatal: Not a valid object name` (absent from the object database, as documented) |

The two dirty entries found at gate entry were `data/provenance/external_quality_report.json` and
`data/rate_registry_audit.json`, rewritten with new timestamps by the post-commit verification runs.
Their diffs were **timestamp-only** (verified by filtering the diff: no non-timestamp line changed);
both were restored. No content was lost and no research result changed.

The loss of `adba1be`/`2af7e41` remains documented in the recovery commit message. It was caused by
unpushed commits living only in an environment-replaced clone; the content survives in `d095fc0`.

### Gate 2 — Data provenance: 🟡 PARTIAL

All five datasets: local SHA-256 matches the manifest, upstream blob SHA now recorded and re-verified
live, size match confirmed. Licences: MIT (three index files) / none (two 2020 tapes).
**Authenticity UNVERIFIED for all five.** 2020 equity data is **not redistributed** (0 external files
tracked; `.gitignore:42`). Instrument mismatch (index data, equity cost schedule) documented as
`INSTR-001`. → `DATA_PROVENANCE_AUDIT.md`

### Gate 3 — Calendar / validation: 🟡 PARTIAL

Independent third-party NSE calendar obtained and diffed year by year:

| Year | Data | Calendar | Discrepancies |
|---|---|---|---|
| 2022 | 247 | 248 | calendar-only **2022-10-24** (weekday — **unresolved**) |
| 2023 | 246 | 245 | data-only 2023-11-12 (Sunday Muhurat — expected) |
| 2024 | 249 | 246 | data-only 2024-01-20, 2024-03-02, 2024-05-18 (Saturday special sessions — expected) |
| 2025 | — | — | **UNCHECKED** (no dataset) |

Missing calendar evidence is **not** treated as a pass: 2022-10-24 is recorded as an open discrepancy
and the third-party calendar is explicitly not an official publication. → `data/provenance/calendar_crosscheck.json`

### Gate 4 — Methodology: 🟡 8/9 PASS, defect found

Aggregation exact; no look-ahead under bar-mutation and prefix tests; splits disjoint and ordered; no
parameter grid. **METHOD-001 fails**: 246/835 (29.5%) of MACD's OOS trades and 1,698/4,582 (37.1%)
across arms carry overnight exposure. Sensitivity: true intraday exits give −₹775,379 vs −₹769,247, so
the defect does not change the conclusion. → `INDEPENDENT_METHODOLOGY_AUDIT.md`

### Gate 5 — Statistical robustness: 🔴 NEGATIVE, ROBUST

Design effect 0.88–1.07 (trade-level intervals were not materially optimistic); lag-1 autocorrelation
within ±0.15; 27/27 arm-periods `NEGATIVE_ALL_METHODS`; pooled OOS −₹769,246.59, mean −₹3,114.36 per
session, CI [−₹3,489.87, −₹2,741.01]; max drawdown equals total loss (monotone decline); exposure
0.36–0.91 of session time. Cross-validation reproduces the published 8-arm OOS figure **exactly**
(−₹652,544.47). → `STATISTICAL_ROBUSTNESS_REPORT.md`

### Gate 6 — Cost sensitivity: 🔴 UNVERIFIED, SIGN INVARIANT

Statutory ₹200,449.40 (23.2%) and slippage ₹664,470.58 (76.8%) kept separate. Six labelled slippage
assumptions, zero included and labelled **not realistic**. Sign negative at every assumption in every
year; 0/9 arms positive at baseline, 2/9 only at zero slippage (not promoted). Break-even is
**never reachable** at zero slippage; it would require statutory charges to be overstated by >52%.
All statutory rates remain UNVERIFIED and unmodified. → `COST_SENSITIVITY_REPORT.md`

### Gate 7 — Final certification: 🟢 with one intentional red gate

| Command | Exit |
|---|---|
| `tsc --noEmit` | 0 |
| `eslint . --max-warnings=0` | 0 |
| `npm run build` | 0 |
| `pytest` | 0 — 389 passed |
| `npm run test:all` | 0 — `EXACT_EQUIVALENCE_VERIFIED`, `ANCHORS_REPRODUCED_EXACTLY` |
| `npm run test:external` | 0 |
| `npm run test:calendar` | 0 |
| `npm run test:protocol` | 0 — `oosSupported: []` |
| `npm run test:stats` | 0 |
| `npm run test:cost` | 0 |
| `npm run test:methodology` | **1 — by design**, `METHODOLOGY_DEFECT_FOUND` (METHOD-001 open) |

The red methodology gate is deliberate: a diagnostic that finds a defect must fail. It is a defect
signal, not a build break, and it will stay red until METHOD-001 is closed or explicitly accepted.

---

## What the evidence actually supports

**Supported:** these eight-ten mechanical strategies, run with unchanged defaults on real 1-minute
NIFTY 50 data across 2022–2024, produce a small positive gross edge (₹6–₹54/trade in 8 of 9 arms) that
is an order of magnitude smaller than modelled round-trip costs, so they lose money net in every year,
under every interval method and every cost assumption, including an unrealistically favourable one.

**Not supported:** any claim that a specific arm "works"; any claim of live readiness; any claim that
the data is authentic; any claim that the cost model is correct; any claim of implementable P&L (the
instrument is not tradable in the size modelled).

## What would change the verdict

1. **RATE-001** — retrieve the 26 official rate documents from a network with regulator access.
2. **DATA-002** — obtain vendor/exchange attestation or reconcile against a licensed feed.
3. **INSTR-001** — acquire data for the *intended* instrument with its matching cost schedule.
4. **METHOD-001** — re-run the study under `intradayOnly: true` and republish every figure.
5. **CAL-001** — adjudicate 2022-10-24 against the official session list.
6. **PROFIT-001** — a strategy whose gross edge exceeds round-trip cost before any tuning. Nothing in
   this audit suggests one of the current arms is close: the best break-even requirement is that the
   statutory schedule be overstated by more than half.

## Honest statement of what I could not do

I could not verify a single official Indian rate, nor reach any exchange, regulator or broker
publication — outbound network access is limited to GitHub, npm and PyPI. The calendar is third-party.
The data is unauthenticated. Therefore this audit certifies the *mechanics* and the *robustness of a
negative finding*; it cannot certify the *inputs* or a *profitable outcome*. Both would require
sources this environment cannot reach.
