# Independent Methodology Audit (Gate 4)

**Date:** 2026-11-17 · **Baseline commit:** `d095fc0754edd40ca369a127ce140a7d22e0e680`
**Auditor stance:** verification only. No strategy parameter was changed, no result was re-tuned, no
promotion is implied by anything in this document.

**Reproduce:** `npm run test:methodology` → `data/provenance/methodology_audit.json`

## Verdict

`METHODOLOGY_DEFECT_FOUND` — 8 checks pass, 1 fails. The failing check is a **real harness defect**
(`METHOD-001`, overnight carry), not a test artefact. It is bounded and does not reverse the sign of
any result, but it must be disclosed because three previously written reports described the study as
strictly intraday.

## Results

| ID | Check | Result | Evidence |
|----|-------|--------|----------|
| M1 | 15-min aggregation exact (o/h/l/c/v recomputed independently) | **PASS** | 6,171 buckets, 0 mismatches, 92,523/92,523 raw bars partitioned exactly once |
| M2 | Regular sessions start 09:15, produce 25 buckets; off-grid sessions enumerated | **PASS** | 246 full sessions; partial 2024-03-02 (9), 2024-05-18 (8), 2024-11-01 (4); 2024-11-01 off-grid at 18:14 |
| M3 | Mutating bar *k* cannot change trades closed before *k* | **PASS** | 510 vs 510 pre-cut-off trades bit-identical (bar 3,702 of 6,171) |
| M4 | Signal depends only on the prefix supplied | **PASS** | identical output (signal −1, confidence 65) |
| M5 | Positions open at session end are squared off intraday | **FAIL** | 246/835 (29.5%) carry overnight; OOS-wide 1,698/4,582 (37.1%) |
| M5b | EOD exits fill at the documented next-session open | **PASS** | 134 EOD exits, 0 mismatched fills |
| M5c | Forcing true intraday exits does not reverse the result | **PASS** | default −₹769,246.59 vs intraday-only −₹775,379 |
| M6 | TRAIN/VALIDATION/OOS disjoint and chronologically ordered | **PASS** | 2022-01-03→2022-12-30 / 2023-01-02→2023-12-29 / 2024-01-01→2024-12-31 |
| M7 | No parameter grid, sweep or custom params in the protocol | **PASS** | `grid=false customParams=false` |

## METHOD-001 — overnight carry (the defect)

**What happens.** The harness closes a position still open at the end of session *D* at the **open of
the first bar of session *D+1***. A position opened at 09:20 and never stopped out therefore holds
through the close, overnight, and into the next session.

**Scale.** MACD arm: 246 of 835 OOS trades span two sessions (66 exit by stop, 46 by target, 134 at
the next open). Across the nine evaluable arms: 1,698 of 4,582 OOS trades (37.1%). Only 23 of the
spanning trades were opened on the session's final bar, so this is *not* a last-bar edge case — it is
the normal exit path for any position still open at the close.

**Why it matters.** The strategies are specified as intraday equity strategies with a mandatory EOD
square-off. Overnight gap risk is exposure the mandate does not permit, and gap P&L is not obtainable
by an intraday-only implementation. Any claim that these results are "pure intraday" is **false as
written**.

**Sensitivity (M5c).** A true intraday variant (exit at the session's last close, no entry on the last
bar) produces **−₹775,379** against **−₹769,246.59** for the default rule — marginally *worse*. The
defect therefore does not manufacture or rescue the result in either direction.

**Why it is not fixed.** Correcting the default would change every reported P&L figure, which a
verification-only phase may not do. Instead `researchBacktest` gained an **opt-in** `intradayOnly`
flag (default `false`, so all published numbers remain reproducible) and the variant is reported as
sensitivity. Closing METHOD-001 requires re-running the study under `intradayOnly: true` and
republishing, which is a decision for the strategy owner, not the auditor.

## Checks that constrain the other failure modes

- **No look-ahead (M3/M4).** Mutating a future bar by ±5–8% leaves every trade closed before that bar
  byte-identical, and the signal is a pure function of its prefix. This is the strongest available
  behavioural evidence against look-ahead in this harness.
- **No contamination (M6).** The three periods are disjoint calendar years with no overlap; 2024 is
  never used to fit anything.
- **No parameter search (M7).** The protocol passes no custom parameters and contains no grid; the
  registry defaults are used verbatim. There is therefore no OOS-parameter-search risk to mitigate —
  the corollary is that no arm was ever tuned, so a poor result cannot be attributed to tuning.
- **Session boundaries (M2).** Special sessions are detected and enumerated rather than padded to 25
  buckets: 2024-03-02 and 2024-05-18 (Saturday sessions, 9 and 8 buckets) and 2024-11-01 (Muhurat,
  4 buckets from 18:00). A padded/forward-filled session would have silently created bars that never
  traded.

## Limitations of this audit

1. It tests behaviour on the 2024 file; 2022 and 2023 share the same code path but were not re-tested
   bar by bar.
2. Pass/fail is behavioural, not a formal proof. M3/M4 make look-ahead *hard*, not impossible, to
   hide; a leak through a shared mutable cache outside the tested path would not be caught.
3. The intraday variant reimplements the exit rule inside the harness; a divergence between the
   variant and the production square-off logic would not be detected here.

## Test-status note

`npm run test:methodology` exits **1** by design while METHOD-001 is open — a red gate is the correct
signal for a known methodology defect. It is not a crash and not a regression.
