# Blocker Register (Phase 2 — consolidated)

**Date:** 2026-11-17 · **Baseline commit:** `d095fc0754edd40ca369a127ce140a7d22e0e680`
**Scope:** every issue that prevents a positive readiness verdict. Statuses are `OPEN`, `PARTIAL`,
`RESOLVED`, or `ACCEPTED-RISK` (accepted only where a human explicitly accepted it — **none have
been**; nothing here is downgraded to make the project look ready).

This register supersedes nothing: `REMAINING_ISSUES.md` remains the detailed per-issue log. This is
the single-page view with owners-unknown and evidence pointers.

## Severity A — blocks any claim of profitability or live readiness

| ID | Issue | Status | Evidence | What would close it |
|---|---|---|---|---|
| **RATE-001** | 0 of 26 statutory/brokerage heads verified against a regulator, exchange or broker publication. | **OPEN** | `OFFICIAL_RATE_EVIDENCE_REGISTER.md`, `npm run test:rate` (15/15 pass-fail-closed, not verification) | Retrieve 26 primary documents from a network that can reach nseindia.com / sebi.gov.in / cbic.gov.in / brokers (sandbox egress is blocked) |
| **PROFIT-001** | No strategy produces positive net P&L on real data. 0/8 arms `OOS_SUPPORTED`; 0/9 positive at baseline costs. | **FAIL (confirmed)** | `OOS_RESULTS_REAL_DATA.md`, `STATISTICAL_ROBUSTNESS_REPORT.md`, `COST_SENSITIVITY_REPORT.md` | A strategy with gross edge materially above modelled round-trip cost — not a tuning exercise |
| **DATA-002** | Data authenticity: no exchange/vendor attestation that the prices are genuine NSE prints. | **OPEN** | `DATA_PROVENANCE_AUDIT.md` | Vendor attestation or reconciliation against a licensed reference feed |
| **METHOD-001** | Harness carries positions overnight (37.1% of OOS trades) instead of squaring off intraday; contradicts the intraday mandate. | **OPEN (new)** | `INDEPENDENT_METHODOLOGY_AUDIT.md`, `npm run test:methodology` exit 1 | Re-run the study with `intradayOnly: true` and republish; owner decision, since it changes every P&L figure |
| **INSTR-001** | Instrument mismatch: NIFTY 50 index data with an *equity intraday* cost schedule; index not tradable; ₹1L notional ≈ 4–5 units, below any index lot. | **OPEN (new)** | `DATA_PROVENANCE_AUDIT.md` §Instrument identity | Acquire the intended instrument's data (NSE equities or index futures) with the matching cost schedule |

## Severity B — blocks a clean data-quality pass

| ID | Issue | Status | Evidence | What would close it |
|---|---|---|---|---|
| **CAL-001** | Exchange session calendar: 2022-10-24 present in the third-party calendar, absent from the 2022 file (weekday discrepancy, unresolved). | **OPEN (new)** | `data/provenance/calendar_crosscheck.json` | Adjudicate against the official NSE session list/circular |
| **CAL-002** | Application's own calendar model (`nse_calendar.ts`) covers 2026 only; 2022–2025 are `UNCHECKED` internally. | **OPEN** | `DATA_QUALITY_REPORT_REAL.md` | Model the historical years and cross-check against the same independent source |
| **CAL-003** | Calendar authority is third-party (`pandas_market_calendars`), not an official publication. | **OPEN (structural)** | `scripts/calendar_crosscheck.py` header | Official NSE calendar, reachable only with network access |
| **DATA-001** | 2020 equity tapes have no licence and mix instruments (grade F, `REAL_MIXED_INSTRUMENTS`). | **PARTIAL** — quarantined, never used for P&L, not redistributed | `HISTORICAL_DATA_PROVENANCE.md` | A licensed, per-symbol 1-min equities source |

## Severity C — model and process gaps (do not change the verdict)

| ID | Issue | Status |
|---|---|---|
| **CORR-001** | 6 of 10 experimental arms are highly correlated; "8 strategies" overstates independent evidence. | OPEN — quantified in `OOS_RESULTS_REAL_DATA.md` |
| **RT-001** | Real-time data path unexercised (no live feed in the sandbox). | OPEN |
| **WAVE-001** | Elliott-wave module is heuristic; not validated, excluded from research. | OPEN |
| **QUORUM-002** | Multi-strategy quorum logic only partially exercised. | OPEN |
| **STATS-001** | Nine arms tested without multiplicity correction. | ACCEPTED for this study — every arm is negative, so multiplicity cannot create a false positive |
| **STATS-002** | Session-cluster bootstrap does not model dependence induced by overnight carry between adjacent sessions. | OPEN — bounded in the robustness report; moot if METHOD-001 closes |

## Resolved in this phase

| ID | Issue | Evidence |
|---|---|---|
| BT-004 | `riskAdjustedBasis` inconsistency | Fixed + stricter assertion; regression green |
| PERF-001 | `Math.max(...)` stack overflow over >100k elements | Fixed with `reduce` |
| DATA-003 | Upstream blob SHA not recorded in the manifest | **Fixed this gate** — `upstreamBlobSha`/`upstreamHeadCommit`/size match now recorded and re-verified live |
| AUDIT-001 | Methodology claimed "no look-ahead" by code reading only | **Fixed this gate** — behavioural tests M3/M4 |
| AUDIT-002 | Intervals reported trade-level only | **Fixed this gate** — cluster + block bootstrap, design effect reported |
| AUDIT-003 | Cost sensitivity reported as a single ladder without statutory/slippage separation | **Fixed this gate** — split, six labelled assumptions, break-even analysis |

## Standing restrictions honoured

No push, no merge, no deploy, no live trading, PAPER only. No strategy parameter changed. No result
re-tuned to look positive. No fabricated data, rate, provenance or citation. No strategy promoted —
the two arms that turn positive at zero slippage are explicitly *not* promoted.
