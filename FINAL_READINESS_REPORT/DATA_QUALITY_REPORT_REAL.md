# DATA QUALITY REPORT — REAL (REDISTRIBUTED) DATASETS

**Status: PASS for mechanical validation · authenticity UNVERIFIED · profitability still blocked**
**Date:** 2026-11-17 · Auditor: `scripts/audit_external_datasets.js` (7/7 checks pass)

---

## 1. Method

The **same** `auditDataset()` from `src/lib/data_quality.ts` used on the synthetic fixtures, applied to
real data with only the relaxations that genuine market data legitimately requires. Every relaxation is
recorded in the output (`relaxations[]`) — nothing is suppressed silently.

| Relaxation | Why it is legitimate |
|---|---|
| `allowZeroVolume` | The NIFTY 50 index publishes no volume; 100% zero volume is correct, not missing |
| `allowSpecialSessions` | Muhurat/special sessions genuinely run outside 09:15–15:30 IST |
| `minSessionsForResearch: 20` | Time-series research needs *sessions*, not row counts |

Checks applied unchanged: OHLC integrity, duplicate timestamps, ordering, per-session candle coverage,
within-session staleness, SHA-256 identity, provenance completeness, synthetic-vs-real guard.

## 2. Results

| Dataset | Rows | Sessions | Grade | Score | Missing candles | Short sessions | Holiday check | Research-usable |
|---|---:|---:|---|---:|---:|---:|---|---|
| NIFTY50_1min_2022 | 92,617 | 247 | **A** | 100% | 0.01% | 0 | UNCHECKED | **yes** |
| NIFTY50_1min_2023 | 91,931 | 246 | **A** | 99.8% | 0.35% | 1 | UNCHECKED | **yes** |
| NIFTY50_1min_2024 | 92,523 | 249 | **A** | 99.5% | 0.91% | 3 | UNCHECKED | **yes** |
| 20200108 (tape) | 141,346 | 1 | F | — | 0% | — | UNCHECKED | **no** (mixed instruments) |
| 20200110 (tape) | 142,020 | 1 | F | — | 0% | — | UNCHECKED | **no** (mixed instruments) |

Integrity: **zero** invalid OHLC bars, **zero** duplicate timestamps, **zero** out-of-order rows across
all 467,437 index bars. Price continuity is plausible (2022 opens 17,392 → 2024 levels in range).

## 3. Real-world anomalies the pipeline caught (not planted)

| Date | Bars | What it is |
|---|---:|---|
| 2023-11-12 | 61 | Muhurat trading session on a **Sunday** — flagged `OUTSIDE_SESSION`, classified as a special session |
| 2024-03-02 | 107 | Special **Saturday** session |
| 2024-05-18 | 106 | Special **Saturday** session |
| 2024-11-01 | 60 | Diwali Muhurat session |

These are genuine exchange sessions, not data corruption — and the auditor treats them as such *only*
because the relaxation is declared and the short-session list is printed for the reader. Without that
declaration they would (correctly) block the dataset.

Zero-volume share of 21.4% / 18.8% in the two equity tapes is also real: illiquid small caps simply do
not trade every minute. That is precisely why volume-based strategies cannot be run on the index series.

## 4. Gaps reported honestly

1. **Holiday coverage = `UNCHECKED` for every real dataset.** `nse_calendar` declares holidays for 2026
   only; `getHolidaysForYear(2022..2025)` returns `[]`. Previously the audit would have reported
   "0 holiday bars", which reads like "verified clean". It now reports `UNCHECKED` with the year listed.
   **This is a real gap in the calendar data, not a false pass.**
2. **Authenticity unverified** — checksums prove *stability*, not *authenticity*.
3. **Equity tapes are not a time series** — they interleave hundreds of symbols; the auditor marks them
   `MIXED_INSTRUMENTS` with `researchUsable: false` so they can never be backtested as one series.

## 5. Comparison with the synthetic fixtures

| | Synthetic fixtures | Real datasets |
|---|---|---|
| Grades achieved | A×3, D (special sessions), F (corrupted) | A×3, F (mixed tapes) |
| Detected defects | 10/10 planted controls | 0 planted — genuine anomalies only |
| Profit-claim permitted | no | no |

The same auditor produces sensible verdicts on both, which is the point of building it before obtaining
data. Nothing was tuned to make the real data pass: the three index years pass because they are
internally consistent, and the tapes fail because a mixed-instrument file is not a series.

## 6. Evidence

- `data/provenance/external_quality_report.json` (full per-dataset stats, checksums, relaxations, blockers)
- `data/provenance/external_dataset_manifest.json` (provenance, licences, hashes, retrieval)
- Reproduce: `node scripts/import_external_data.js && node scripts/audit_external_datasets.js`
