# FINAL EVIDENCE-BASED READINESS ASSESSMENT — Evidence Acquisition Phase

**Date:** 2026-11-17 · **Baseline commit:** `adba1be311f56dd6328e6f88d64f50402aa862d7` · **Branch:** `arena/b6463544-trade`
**Verdict: PARTIALLY PASS — evidence quality improved substantially; deployment still BLOCKED.**

---

## 1. What this phase was asked to do, and what actually happened

| Task | Outcome |
|---|---|
| 1. Identify authoritative sources for every unverified charge/tariff | **DONE** — 26 heads mapped to issuer + publication channel in `OFFICIAL_RATE_EVIDENCE_REGISTER.md` |
| 2. Record URL, effective date, instrument, rate, status | **PARTIAL** — URL/issuer/status recorded; **effective date and rate remain `null`** because no official document is retrievable. Nothing invented. |
| 3. Legitimate route to historical NSE OHLCV with provenance | **DONE (with caveat)** — real NIFTY 50 1-min 2022-2024 + 2020 equity tapes via MIT-licensed redistribution; authenticity `UNVERIFIED_REDISTRIBUTION` |
| 4. Reproducible import + validation workflow | **DONE** — `import_external_data.js` (hashes, canonical cache), `audit_external_datasets.js` (7/7 checks) |
| 5. Strict synthetic/real separation | **DONE** — separate directories, labels, auditors, manifests; both assert `profitClaimAllowed: false` |
| 6. Reproducible protocol with chronological train/validation/OOS | **DONE** — `RESEARCH_PROTOCOL.md` v1.0.0, predefined decision rule |
| 7. Test strategies without enabling them | **DONE** — 8 evaluated; all remain `enabled: false`; 2 `NOT_EVALUABLE` |
| 8. Costs, slippage, drawdown, trades, uncertainty | **DONE** — statutory vs slippage split, slippage sensitivity ladder, bootstrap CIs, per-strategy drawdowns |
| 9. Preserve FAIL/BLOCKED statuses | **DONE** — PROFIT-001 stays FAIL, RATE-001 stays BLOCKED, no status upgraded without evidence |
| 10. Regression after changes | **DONE** — see §5 |

## 2. The evidence that changed

**Before this phase:** all research rested on synthetic fixtures; no data could be labelled real.
**After:** 742 real sessions (277,071 index bars) are in the workspace with full provenance, hashes and
quality grades, plus two real multi-symbol tapes used for ingestion validation only.

**The key research result (new, real data):**

| OOS 2024 (4,085 trades) | ₹ |
|---|---:|
| Gross | **+1,18,280.20** |
| Statutory charges | −1,78,659.69 |
| Slippage (assumption) | −5,92,164.99 |
| **Net** | **−6,52,544.47** |
| **Net at zero slippage** | **−60,379.49** |

The strategies do generate a small gross edge (+₹28.95/trade) — a genuinely new finding — but it is
smaller than statutory costs alone (−₹43.74/trade). The negative result is therefore **robust to the
slippage assumption**, which was previously the weakest link in the argument.

## 3. Acceptance tiers after this phase

| Tier | Status | Basis |
|---|---|---|
| CODE | **PASS** | tsc/lint/build clean; 2 library options added (validation only) |
| TEST | **PASS** | 169 + 40 + 11 + 9 + 26 + 15 + 7 new external checks |
| DATA PIPELINE | **PASS** | synthetic 10/10 controls; real 7/7 checks; 3 index years grade A |
| DATA AUTHENTICITY | **UNVERIFIED** | redistribution cannot be proven against the exchange |
| COST MODEL | **FAIL / UNVERIFIED** | 0/26 rate heads verified |
| BACKTEST | **PASS** | anchors `ANCHORS_REPRODUCED_EXACTLY`, equivalence exact |
| PAPER | **PASS** | unchanged from previous verification |
| OOS RESEARCH | **PASS (as evidence) / FAIL (as edge)** | protocol executed; 0/8 supported |
| PROFITABILITY | **FAIL** | net negative in all periods, even at zero slippage |

## 4. Coherence check against prior reports

- `DATA_QUALITY_PIPELINE.md` still stands for synthetic data (unchanged grades: A/A/A/D/F).
- `PORTFOLIO_CORRELATION.md` still stands (synthetic, 90 sessions); it is **not** superseded by this
  phase, and the two are labelled separately.
- `OOS_RESULTS_REAL_DATA.md` supersedes nothing — it is the first real-data study.
- No document claims profitability; every one ends with an explicit negation.

## 5. Regression

Executed after the two library changes (`allowZeroVolume`, `allowSpecialSessions`,
`minSessionsForResearch`, holiday-coverage reporting) — all validation-only, no trading path touched:

- `npx tsc --noEmit` → **0**
- `npm run lint` → **0**
- `npm test` → **169/169** · math **40/40** · registry **11/11** · metrics **9/9** · portfolio-stats **26/26** · rate **15/15**
- `node scripts/data_quality_audit.js` → controls 10/10, invariants 6/6, exit 0 (synthetic grades unchanged)
- `node scripts/audit_external_datasets.js` → 7/7, exit 0
- `node scripts/final_readiness_probes.js` → 12/12
- anchors → `ANCHORS_REPRODUCED_EXACTLY`; perf → `EXACT_EQUIVALENCE_VERIFIED`
- Python `pytest` → 389 passed

## 6. Remaining research blockers

| # | Blocker | Status | Exact remaining action |
|---|---|---|---|
| 1 | RATE-001 — statutory/brokerage rates | **BLOCKED / UNVERIFIED** | Fetch dated official circulars + broker tariff pages from a network that can reach the issuers; attach PDF/HTML + SHA-256 per head; all 26 heads |
| 2 | DATA-001 — authenticity | **UNVERIFIED** | Obtain data directly from NSE or a licensed vendor; store raw files with retrieval proof |
| 3 | DATA-001 — holiday calendar | **UNCHECKED for 2022-2025** | Extend `nse_calendar` beyond 2026 with official holiday lists |
| 4 | PROFIT-001 — no edge | **FAIL** | Only after 1-3: re-run the protocol at production timeframe with authentic data and verified costs |
| 5 | CORR-001 — correlation | **PRELIMINARY / NOT SUPPORTED** | Re-run on ≥60 real sessions/regime once authenticity is established |
| 6 | RT-001 / WAVE-001 / QUORUM-002 | **BLOCKED (Category C)** | Require explicit authorisation |
| 7 | EXP-001 — experimental set | **FAIL (finding)** | All 10 stay `enabled: false` |

## 7. Safety posture (unchanged and re-verified)

Live execution disabled · PAPER forced in the risk layer · no broker REST call in the order path · no
credentials present · DELIVERY/CNC/CDS fail closed · 0/10 experimental strategies enabled · no push,
merge, deploy or PR performed · production trading behaviour unmodified.

## 8. Bottom line

The project now has **real market data with honest provenance** and **one reproducible out-of-sample
study** where previously it had neither. The evidence points the same way the synthetic work did — no
strategy clears transaction costs — but the reasoning is now much stronger: gross is positive, statutory
costs exceed it, and the conclusion survives a zero-slippage test.

**Not live-trading-ready. No profitability claim is made. Two external blockers (official rate documents,
authentic data) cannot be resolved from this environment.**
