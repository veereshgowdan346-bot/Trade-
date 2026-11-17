# DATA-001 — Canonical Market Data Pipeline & Quality Certification

**Status: RESOLVED (offline scope) / REAL-DATA PROVISIONING BLOCKED**
**Verification date:** 2026-11-17 · **Branch:** `arena/b6463544-trade`

---

## 1. What DATA-001 actually was

DATA-001 was never "the app cannot parse a CSV". It was: **no dataset in this repository could be
proven to be real market data, and nothing prevented synthetic fixtures from being used to support
a profitability statement.** Both halves are now enforced in code, not documented in prose.

## 2. What was inspected

| Item | Location | Finding |
|---|---|---|
| OHLC validator | `src/lib/data_sanitizer.ts` | Already solid: 7 anomaly classes (invalid OHLC, negative price, negative volume, duplicate, unordered, spike, gap) + `qualityScorePct` |
| CSV ingestion | `src/lib/csv_ingestion.ts` | Timestamp parsing (epoch / IST string), options, results |
| IST + calendar | `src/lib/nse_calendar.ts` | `getIstComponents`, `isExchangeHoliday`, holiday evidence |
| Fixtures | `data/fixtures/` | 5 datasets: sample NIFTY 50, walk-forward seed 42, multi-day overnight, special sessions, corrupted |
| Provenance | — | **MISSING.** No dataset declared what it was, where it came from, or whether it was synthetic |
| Checksums | — | **MISSING.** No dataset identity, so no result could be tied to an exact input |
| Staleness / session / holiday checks | — | **MISSING** |
| Synthetic-vs-real guard | — | **MISSING** |

## 3. What was built

`src/lib/data_quality.ts` (new, exported through `dist_test_cjs`):

- `DatasetProvenance` — id, **kind (`REAL` | `SYNTHETIC` | `INCOMPLETE` | `UNVERIFIED`)**, instrument,
  timeframe, source, retrieval/generation date, timezone, adjustments, limitations.
- `fingerprintCandles()` — canonical row serialisation → **SHA-256** (WebCrypto) with a deterministic
  FNV-1a fallback. Identical data yields an identical checksum; reordered data does not.
- `auditDataset()` — wraps the existing sanitizer and adds **staleness** (identical OHLC bar-to-bar),
  **zero volume**, **session boundary** (09:15–15:30 IST), **exchange-holiday bars**,
  **missing-candle coverage**, then produces a grade (`A`–`F`), explicit `blockers`,
  `researchUsable`, and `profitClaimAllowed`.
- `assertProvenanceConsistent()` — **throws** if a dataset declares `kind: "REAL"` while its source
  reads as synthetic/fixture/seed-based, or if a REAL dataset does not state its adjustments.

`scripts/data_quality_audit.js`: audits every fixture, runs 10 negative controls, enforces 6 registry
invariants, writes `data/dataset_registry.json` + `scripts/data_quality_output.json`.

## 4. Results (executed)

```
[audit] sample_nifty50_1m      rows= 375 grade=A score=100.0% usable=true  profitClaim=false SHA-256:289f641df363…
[audit] walkforward_seed42_1m  rows=1125 grade=A score=100.0% usable=true  profitClaim=false SHA-256:88e7c0036482…
[audit] multiday_overnight_1m  rows= 750 grade=A score=100.0% usable=true  profitClaim=false SHA-256:47cc437dbc69…
[audit] special_sessions_1m    rows= 115 grade=D score= 65.0% usable=false profitClaim=false SHA-256:69defc2c57b6…
[audit] corrupted_anomalies_1m rows= 100 grade=F score= 25.5% usable=false profitClaim=false SHA-256:1b94ae3facc6…
```

| Dataset | Sessions | Missing candles | Incomplete sessions | Grade | Research-usable |
|---|---:|---:|---:|---|---|
| sample_nifty50_1m | 1 | 0% | 0 | A (100%) | yes |
| walkforward_seed42_1m | 3 | 0% | 0 | A (100%) | yes |
| multiday_overnight_1m | 2 | 0% | 0 | A (100%) | yes |
| special_sessions_1m | 2 (45 + 70 bars) | **84.67%** | 2 | D (65%) | **no** |
| corrupted_anomalies_1m | 1 | 73.33% | 1 | **F (25.5%)** | **no** |

Two measurement defects were found and fixed during final review (see §8): coverage was averaged
per row rather than measured per session, and the expected-bar count used an inclusive 15:30 grid
(376 bars instead of 375). Both had made `special_sessions_1m` look complete when it is two
deliberately truncated windows — it is now correctly refused for research use.

**10/10 negative controls detected** — duplicate timestamps, unordered timestamps, invalid OHLC,
zero volume, stale repeats, exchange-holiday bar, out-of-session bar, insufficient history,
synthetic-labelled-REAL (provenance guard throws), checksum determinism/reordering sensitivity.

**6/6 registry invariants hold:** no unsubstantiated REAL claims · no profit claim on synthetic data ·
every dataset has a checksum · every dataset has provenance + limitations · a corrupted dataset is
never research-usable · at least one dataset is research-usable.

`npm run test:data` → `controlsAllDetected: true`, `invariantsOk: true`.

## 5. Honest limitation — why this remains BLOCKED for deployment

**There is no real market data in this environment.** Every dataset is `SYNTHETIC` or `INCOMPLETE`,
so `profitClaimAllowed` is `false` for all five, deliberately. The pipeline can now *certify* data;
it cannot *obtain* it. Supplying genuine NSE data (with retrieval date and adjustment policy) is the
remaining action, and it is the same blocker that prevents PROFIT-001 from ever resolving.

No candles were fabricated. No synthetic fixture is presented as real. The corrupted fixture is
labelled `INCOMPLETE` and is refused for research use.

## 6. Files changed

- **New:** `src/lib/data_quality.ts`, `scripts/data_quality_audit.js`, `data/dataset_registry.json`,
  `scripts/data_quality_output.json`
- **Modified:** `package.json` (`test:prep`, `test:data`, `test:all`)

## 7. Remaining risks

| Risk | Assessment |
|---|---|
| Grades `A` describe *internal consistency*, not authenticity | A synthetic series can be perfectly consistent. Grade ≠ real. |
| Session window hardcoded to 09:15–15:30 IST | Special/muhurat sessions are treated as exceptions via an explicit opt-in, never silently |
| `MIN_BARS_FOR_RESEARCH = 200` is a project choice | Stated in code and registry; not derived from a statistical power calculation |
| Holiday check depends on `nse_calendar` data quality | Checked against declared holidays only; unknown years yield no holiday coverage |
| Coverage assumes a single timeframe per dataset | `expectedIntervalMs` is one value, so a mixed-timeframe file is scored against one grid |
| Staleness is bar-to-bar within a session | A slow-moving but genuine series (low volatility) can trip it; the threshold is exact equality, not a tolerance |

## 8. Defects found during final review (and fixed)

1. **Coverage was averaged, not per-session.** One complete 375-bar session plus one 45-bar session
   averaged to "fine". Now measured per session, with `sessionsIncomplete` reported and a blocker at
   >10% missing coverage.
2. **Off-by-one in expected bars.** `(15:30 − 09:15 + 1)` = 376, but a 09:15–15:29 one-minute grid has
   **375** bars; the 15:30 stamp is the session close. Every complete session reported 0.27% "missing".
3. **Staleness fired across session boundaries.** Identical OHLC as the previous session's close is
   legitimate; the check is now restricted to bars within the same IST date.
4. **Dead binding** (`sanitized`) removed; `perTradeReturns` dead array removed from the engine.
