# Financial Mathematics Audit

## Inspected
`src/lib/tax.ts`, `src/lib/rateSpec.ts`, `config/statutory_rates.json`,
`risk/statutory_cost.py`, `risk/rate_spec.py`, `risk/cost_guardrail.py`,
`simulation/paper_trading.py` (fee application), `src/lib/risk.ts` (sizing, break-even,
net P&L), plus every independent calculator used by the verification suites.

## Arithmetic verified
* **Rounding:** `r2(x) = floor(x*100 + 0.5)/100` — half-up on magnitude, implemented
  identically in TypeScript and Python. Decimal `ROUND_HALF_UP` was rejected because it
  diverges on binary-representable values; the floor form is the pinned contract.
* **Per-leg charging:** brokerage is charged per **order** (not per fill) via `order_qty`;
  partial fills are aggregated so a split fill is never over-charged (verified ≤ ₹0.02
  deviation per fill).
* **Buy/sell asymmetry:** STT/CTT applies on the sell side for intraday equity; stamp duty on
  the buy side only; exchange charge, SEBI fee and GST apply per leg on their documented
  bases. SELL scenario correctly uses `sellVal = entryVal` for the round trip.
* **GST base:** brokerage + exchange transaction charges + SEBI fee (not on STT/stamp).
* **Minimum floors:** broker minimum-per-order floors are applied after per-leg brokerage and
  are not double-counted across legs.
* **Net P&L:** `net = gross − (all statutory charges) − slippage`. A guard test asserts
  charges > 0 for every real trade so gross can never be reported as net.
* **Break-even:** `breakEven` solves for the price at which net = 0 after both legs' charges
  plus slippage, rounded to the instrument tick; verified on a sweep of capitals and sides.

## Anchor reconciliation (re-verified this phase)
50 shares @ ₹2,500 (turnover ₹250,625), Shoonya: total **₹256.54**
(brokerage 10.00, STT 31.41, exchange 7.44, SEBI 0.25, stamp 3.75, GST 3.18, slippage 200.50).
Same trade, Angel One: **₹291.94** (brokerage 40.00, GST 8.58). Hurdle floors: ₹25 (Shoonya),
₹70 (Angel/Groww). All match the Phase-2 anchors exactly — no drift.

## Cross-language parity
`tests/test_cost_parity.py` + `scripts/cost_parity_ts.js` over 17 fixtures
(`data/fixtures/cost_parity_scenarios.json`): TypeScript and Python produce identical charges
and net P&L. **PASS**

## Multi-leg / partial fills / multiple orders
Multi-leg totals, partial-fill aggregation (per-order brokerage preserved), multiple orders
per session and both sides were exercised. **PASS**

## Fail-closed segments
`NSE_EQ_DELIVERY` and `CDS_ANY` raise `UnsupportedSegmentError` in both languages and the
order is refused rather than priced with an invented row. DELIVERY / CNC / UNKNOWN_PAIR all
return `BLOCKED: UnsupportedSegmentError` in the matrix run.

## Not verified (honest boundary)
Every **statutory rate value** is **UNVERIFIED**: no dated official tariff document exists in
the repository and the environment cannot reach broker/exchange documentation. Arithmetic
proven; inputs unproven. See `BROKERAGE_TAX_AUDIT.md`.

## Verification status
**PASS** for arithmetic, parity, rounding, sides, partial fills, break-even.
**UNVERIFIED** for the statutory inputs themselves.
