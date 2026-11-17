# HISTORICAL DATA PROVENANCE REPORT

**Status: PARTIALLY RESOLVED — real intraday data obtained, authenticity UNVERIFIED, profitability still blocked.**
**Date:** 2026-11-17

---

## 1. The constraint that shapes everything

Official NSE downloads are impossible here (`www.nseindia.com` → `SSL_ERROR_SYSCALL`, see
`OFFICIAL_RATE_EVIDENCE_REGISTER.md` §1). The only reachable hosts are GitHub, PyPI and npm.
Therefore real market data can only be obtained as a **third-party redistribution**, which can never
establish that the bytes equal the exchange's originals.

That is not a reason to refuse the data; it is a reason to label it precisely:

> `kind: REAL_REDISTRIBUTION` · `authenticity: UNVERIFIED_REDISTRIBUTION`

A `REAL_REDISTRIBUTION` dataset is usable for **mechanical** validation of the pipeline and for
research that is honest about its provenance. It is **not** sufficient for a profitability claim,
because two independent things remain unproven: that the prices are authentic, and that the cost rates
are correct.

## 2. Datasets obtained

All bytes were fetched through the GitHub API (`api.github.com` contents/git-blobs, base64) and hashed
locally. `raw.githubusercontent.com` is blocked, so that API is the only distribution path.

| Dataset | Instrument | Rows | Sessions | Period | Upstream | Licence | SHA-256 (file) |
|---|---|---:|---:|---|---|---|---|
| NIFTY50_1min_2022 | NIFTY 50 index | 92,617 | 247 | 2022 | `technovusin/nifty50-historical-data` | **MIT** | `930acb495657287f8873ddb3…` |
| NIFTY50_1min_2023 | NIFTY 50 index | 91,931 | 246 | 2023 | same | MIT | `cc261ba326b3c61c5e54c58d…` |
| NIFTY50_1min_2024 | NIFTY 50 index | 92,523 | 249 | 2024 | same | MIT | `f0a82b04aeb8722c8fae0431…` |
| 20200108 | NSE equity tape (multi-symbol) | 141,346 | 1 | 2020-01-08 | `hunterabhi/daily-1-minute-eod-data` | **none declared** | `1396acc67ad32ce93f6b2b09…` |
| 20200110 | NSE equity tape (multi-symbol) | 142,020 | 1 | 2020-01-10 | same | none declared | `e55c17d9b18f033a1eb6da0d…` |

Upstream blob SHAs, file sizes, byte counts and retrieval timestamps are recorded per dataset in
`data/provenance/external_dataset_manifest.json`.

**Format handling**
- Index files: `Epoch,Timestamp,Open,High,Low,Close`. The epoch column is true UTC (e.g. `1641181500`
  = 2022-01-03 **03:45 UTC** = **09:15 IST**), so timestamps are taken from the epoch, not by re-parsing
  the naive local string.
- Equity tapes: `Date,Symbol,Time,open,high,low,close,volume` with `YYYYMMDD` dates and IST wall-clock
  times. The importer normalises the date before parsing — a plain `Date.parse` of `20200108T09:15:00`
  silently yields `NaN`, which is exactly the class of bug that produces "0 trades" mysteries.
- Timezone: `Asia/Kolkata` throughout; verified by asserting the first bar of each index file lands on
  09:15 IST.
- **Corporate actions:** the index series needs none (levels are not adjusted). The equity tapes carry
  **no adjustment metadata upstream**, so they must be treated as unadjusted. They are not used for
  any performance inference.

## 3. Licensing and what is committed

| Dataset | Redistribution allowed? | Committed to Git? |
|---|---|---|
| NIFTY 50 2022–2024 | Yes (MIT) | **No** — 18 MB of raw input; kept in `data/external/` (gitignored). Only the manifest and derived reports are committed. |
| Equity tapes 2020-01-08/10 | **No licence declared → all rights reserved** | **No** — not redistributed, not committed; used only for integrity validation locally. |

Reproduce with: `node scripts/import_external_data.js` (expects raw files in `data/external/nse/`).
The script is deterministic; re-running produces the same SHA-256 values, which is how authenticity
drift would be detected on a future re-fetch.

## 4. Strict separation from synthetic data

| | Synthetic | Real (external) |
|---|---|---|
| Location | `data/fixtures/**` (committed) | `data/external/**` (gitignored) |
| Label | `SYNTHETIC` | `REAL_REDISTRIBUTION` (+ `authenticity: UNVERIFIED_REDISTRIBUTION`) |
| Auditor | `scripts/data_quality_audit.js` | `scripts/audit_external_datasets.js` |
| Manifest | `data/dataset_registry.json` | `data/provenance/external_dataset_manifest.json` |
| Profit claim | `profitClaimAllowed: false` | `profitClaimAllowed: false` |

No series mixes the two, no results table mixes the two, and both auditors assert
`profitClaimAllowed === false` for every dataset they touch.

## 5. What was genuinely learned from real data

The 2023 and 2024 files contain **real special sessions on weekend dates** (e.g. 2023-11-12, 2024-01-20,
2024-03-02, 2024-05-18) with ~60 bars each, plus truncated sessions. This validates the session logic
against reality rather than against a fixture I wrote: the auditor flags those bars as `OUTSIDE_SESSION`,
and the run records the relaxation explicitly instead of silently passing.

## 6. Limitations that keep DATA-001 open

1. **Authenticity unproven** — a redistribution cannot be checked against the exchange.
2. **Holiday validation cannot run** — `nse_calendar` covers 2026 only (16 declared holidays; 2022–2025
   return 0). The audit therefore reports `holidayCoverage: UNCHECKED` for these years rather than
   implying "no holiday bars found". This is a real gap in the calendar data, now surfaced.
3. **Index ≠ tradable instrument** — the NIFTY level is not directly tradable; applying an NSE-equity
   intraday cost model to it is a *proxy*.
4. **No volume in index data** — volume-based strategies are `NOT_EVALUABLE`, not run on zeros.
5. **Equity tapes cover 2 sessions** — enough to validate ingestion, nowhere near enough for inference.

## 7. The legitimate path to fully-verified data

1. A **licensed vendor or broker historical API** (paid, contractual): Kite Connect / Angel One SmartAPI
   historical, TrueData, GlobalDataFeeds. Requires credentials and a subscription — must not be done in
   this environment, and must never be wired to live trading.
2. **NSE's own data services / bhavcopy archive** from a network that can reach `nseindia.com`, storing
   the raw files with retrieval timestamp + SHA-256 in `data/evidence/`.
3. For corporate actions, a **vendor adjustment factor file** per symbol; unadjusted prices must never be
   used across splits/bonuses.

Until then, DATA-001 stays **BLOCKED for profitability purposes** while its *pipeline* half remains PASS.
