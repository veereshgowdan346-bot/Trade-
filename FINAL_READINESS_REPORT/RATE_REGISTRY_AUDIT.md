# RATE-001 — Statutory & Brokerage Rate Registry Audit

**Status: OPEN — every rate remains UNVERIFIED. Fail-closed behaviour CONFIRMED.**
**Verification date:** 2026-11-17

---

## 1. What can and cannot be verified here

RATE-001 requires, per rate: **value · segment · effective date · official source · verification
timestamp · status**. This environment has **no official NSE/SEBI/GST/broker tariff document** and
outbound network access is limited to `github.com`, `npmjs.org`, `pypi.org`. The relevant official
portals are unreachable.

Therefore **rate values cannot be verified, and no rate value was changed.** Inventing a plausible
value (or copying one from a secondary blog) is precisely the failure mode RATE-001 exists to prevent.
What *is* verifiable offline was verified.

## 2. Registry inventory (executed)

`config/statutory_rates.json`, `specVersion 2026.11.17-phase2`, sha256 `95ba7ebb9869…`

**26 rate heads:**

| Status | Count | Meaning |
|---|---:|---|
| `UNVERIFIED` | 21 | Value present, no official evidence |
| `UNSUPPORTED_NO_EVIDENCE` | 2 | `NSE_EQ_DELIVERY`, `CDS_ANY` — excluded, fail closed |
| `UNVERIFIED_ASSUMED_SAME_AS_ANGEL` | 3 | One broker's rates explicitly assumed, not observed |
| **`VERIFIED`** | **0** | Correct: no local official document exists |

Heads covered: STT, exchange transaction, stamp duty per segment; GST; SEBI turnover fee; and per
broker — intraday per-leg brokerage, delivery per-leg, round-trip brokerage floor, minimum round-trip
deduction (the last is a **modelled construct**, not a tariff line, and is labelled as such).

## 3. Checks executed — 15 PASS / 0 FAIL

```
PASS every rate head carries a status field
PASS every broker declares a verification status
PASS no rate is VERIFIED without an official source and effective date
PASS verified rate count is consistent with available evidence (found 0)
PASS all unsupported segments are explicitly marked
PASS Python can load the authoritative spec
PASS TS and Python read byte-identical spec (sha256)
PASS TS and Python agree on specVersion
PASS TS and Python agree on the segment list
PASS NSE_EQ DELIVERY fails closed
PASS NSE_EQ CNC fails closed
PASS CDS_ANY fails closed
PASS supported NSE_EQ INTRADAY still prices
PASS Python side treats DELIVERY/CDS as unsupported
PASS no hardcoded statutory rate literals outside the spec
```

Notable: **cross-runtime parity is proven by file checksum**, not by comparing two hand-maintained
tables. TypeScript (`src/lib/rateSpec.ts`) and Python (`risk/rate_spec.py`) load the *same bytes* of
`config/statutory_rates.json`, so they cannot drift. A source scan found **no shadow rate literals**
in `src/lib`, `src/app` or `src/components` outside the authoritative spec.

## 4. Fail-closed contract (still intact)

| Request | Result |
|---|---|
| `NSE` / `EQ` / `DELIVERY` | throws `UnsupportedSegmentError` — "fail closed" |
| `NSE` / `EQ` / `CNC` | throws |
| `CDS` / `FUT` | throws |
| `NSE` / `EQ` / `INTRADAY` | prices normally |

This matches the 9-tier matrix in `FINAL_REGRESSION_RESULTS.md`, where DELIVERY/CNC/UNKNOWN pairs
resolve to `BLOCKED`.

## 5. Remaining action (the only path to closure)

Attach **dated official documents** to `config/statutory_rates.json`:

1. NSE equity/FO/MCX transaction-charge circulars (segment + effective date).
2. SEBI turnover-fee circular.
3. GST rate notification (and the clarification on which heads GST applies to).
4. State stamp-duty schedule for the relevant state.
5. Each broker's published tariff page, screenshotted and dated.

For each, set `status: "VERIFIED"`, `source: "<document id/URL>"`, `effectiveDate: "<date>"`,
`verifiedAt: "<ISO timestamp>"`. Only then may `verifiedCount > 0`, and the audit check that currently
requires `verifiedCount === 0` must be replaced by a per-rate evidence check (not simply relaxed).

## 6. Consequence for the product

Cost figures throughout the reports are **estimates on unverified rates**. They are internally
consistent (one spec, one parity path, one rounding rule), and they are *not* a statement about what a
broker will actually charge. This is why acceptance tier **COST MODEL remains FAIL/UNVERIFIED** and why
no cost-based profitability claim is permitted.

## 7. Evidence

- `scripts/rate_registry_audit.js` → `data/rate_registry_audit.json`
- `npm run test:rate` → 15 PASS / 0 FAIL
- Existing parity/rounding suites: `npm test` → 169/169
