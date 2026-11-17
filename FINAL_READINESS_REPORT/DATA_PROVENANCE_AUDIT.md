# Data Provenance Audit (Gate 2)

**Date:** 2026-11-17 · **Baseline commit:** `d095fc0754edd40ca369a127ce140a7d22e0e680`
**Reproduce:** `npm run test:external` → `data/provenance/external_dataset_manifest.json`, `data/provenance/external_quality_report.json`

## Verdict

`PROVENANCE_PARTIAL` — every local file is byte-pinned to a specific upstream blob and its licence
status is recorded, but **no dataset is authenticated**. Licence permission and exchange authenticity
are different properties and this audit keeps them apart: the MIT licence on one repository permits
redistribution; it says nothing about whether the prices are real NSE prints.

## Per-dataset record

| Dataset | Upstream | Blob SHA (verified live) | Size match | Licence | Redistributable | Authenticity | Local SHA-256 |
|---|---|---|---|---|---|---|---|
| NIFTY50_1min_2022 | technovusin/nifty50-historical-data `1min/2022/` | `4f05c9804c956b8662dabb7d106b1e4702f3a77e` | ✅ 6,019,857 B | MIT (© 2026 technovusin) | **Yes, with notice** | `UNVERIFIED_REDISTRIBUTION` | `930acb495657287f…` ✅ |
| NIFTY50_1min_2023 | same | `eec7d0efbfab465e9c686c8e9479c875fc60c2bd` | ✅ 5,975,228 B | MIT | **Yes, with notice** | `UNVERIFIED_REDISTRIBUTION` | `cc261ba326b3c61c…` ✅ |
| NIFTY50_1min_2024 | same | `35e0c5727c29b50e54c91ca756126c1697adb557` | ✅ 6,014,477 B | MIT | **Yes, with notice** | `UNVERIFIED_REDISTRIBUTION` | `f0a82b04aeb8722c…` ✅ |
| 20200108 equity tape | hunterabhi/daily-1-minute-eod-data | `e30c473ef60b732aa5bf53275e5cef66d8cfb3dc` | ✅ 7,850,611 B | **None** (all rights reserved) | **No** | `UNVERIFIED_REDISTRIBUTION` | `1396acc67ad32ce9…` ✅ |
| 20200110 equity tape | same | `91521f18604ff4a158ac9ddcc7710be7d2c1aed4` | ✅ 7,911,222 B | **None** | **No** | `UNVERIFIED_REDISTRIBUTION` | `e55c17d9b18f033a…` ✅ |

Upstream heads at audit time: `technovusin` = `088a7a856da9b670c505c0831d2f472f0d69027c`
(2026-11-17T10:02:58Z); `hunterabhi` = `f482c664a0726aa5726cc98146ca3818c8f09064` (2020-01-12).

`upstreamBlobSha`, `upstreamHeadCommit` and `upstreamBlobSizeMatches` are now recorded by
`scripts/import_external_data.js` for every dataset. This closes the gap found in this audit: the
manifest previously pinned local bytes but not the upstream object they descend from, so a local hash
match proved self-consistency only.

## Redistribution status

- **Tracked external CSVs: 0.** Verified with `git ls-files | grep -c data/external` → `0`.
- `data/external/` is excluded by `.gitignore:42`, so no raw tape can enter a commit by accident.
- The two 2020 equity tapes are **not redistributed**, consistent with their absent licence.
- The three NIFTY index files may be redistributed under MIT **with the copyright notice retained**;
  they are still kept out of Git because the dataset is reproducible from the pinned blob SHA.

## Instrument identity — a mismatch that must be stated plainly

| Property | Strategy mandate | Data used |
|---|---|---|
| Instrument | NSE **equity**, intraday (`.NS` cash segment) | **NIFTY 50 index** |
| Cost model | Equity intraday: STT, exchange fee, stamp, GST, brokerage | Equity intraday (`kind: "EQ"`, `productType: "INTRADAY"`) |
| Volume | Required by volume-based arms | **Absent** (index series reports zero volume) |

Consequences, all of which bound what the study can claim:

1. The index is **not directly tradable**. Results are a notional study, not an implementable P&L.
2. The cost model applied is the *equity* schedule, but the instrument is an index. Those costs are
   the wrong schedule for index futures and, at 16 bps/side, far heavier than index derivatives —
   which biases the net figure pessimistic, while the underlying price series is not the traded
   instrument. The two errors point in opposite directions and **neither is quantified**.
3. The sleeve is ₹1,00,000 notional; at index levels of ~22,000 the position is ~4–5 units, well
   below the minimum tradable lot for NIFTY futures or any index product. The study is therefore a
   per-₹1L normalisation, not a minimum-size trade.
4. `x_obv_confirmation` yields **0 trades** and `x_volume_profile` is degraded, because an index has
   no volume. Volume-dependent conclusions are `NOT_EVALUABLE`, not "negative".

## Checked: 2020 equity data is not redistributed

The 2020 tapes were imported for structural inspection only (grade `F`, `REAL_MIXED_INSTRUMENTS`:
multiple symbols interleaved, no per-symbol separation, no licence). They were never used to produce
any P&L figure and are excluded from every research run.

## What remains unverified

| Item | Status |
|---|---|
| Prices are genuine NSE executions | **UNVERIFIED** — no exchange/vendor attestation exists |
| Vendor derivation method (how 1-min bars were built) | **UNKNOWN** — no documentation in either repo |
| 2022 file completeness vs the exchange session list | **UNRESOLVED** — see Calendar report (2022-10-24) |
| Absence of survivorship/selection effect in an index series | Structure implies none (the index is rebalanced, not selected), but the index *methodology* is out of scope for an intraday study |
| Data vendor continuity (blob could change upstream) | Pinned by blob SHA; any upstream change would be detected by hash mismatch |
