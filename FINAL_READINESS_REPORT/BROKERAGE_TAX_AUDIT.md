# Brokerage & Tax Audit

## Inspected
`config/statutory_rates.json` (single authoritative spec), `src/lib/rateSpec.ts`,
`src/lib/tax.ts`, `risk/rate_spec.py`, `risk/statutory_cost.py`, `risk/cost_guardrail.py`,
and every consumer (backtest engines, paper trading, UI cost display).

## Coverage matrix
| Component | Implemented | Internal consistency | Official evidence |
|---|---|---|---|
| Brokerage (per order, per broker) | YES | PASS | **UNVERIFIED** |
| Minimum brokerage / per-order floor | YES | PASS | **UNVERIFIED** |
| STT (equity intraday, sell side) | YES | PASS | **UNVERIFIED** |
| STT/CTT (futures, options, commodity) | YES (spec rows) | PASS | **UNVERIFIED** |
| Exchange transaction charges (per segment) | YES | PASS | **UNVERIFIED** |
| SEBI turnover fee | YES | PASS | **UNVERIFIED** |
| Stamp duty (buy side, state-wise) | YES | PASS | **UNVERIFIED** |
| GST (rate + base) | YES | PASS | **UNVERIFIED** |
| IPFT | row present | PASS | **UNVERIFIED** |
| Delivery / CNC | **fail-closed** | `UnsupportedSegmentError` | **UNVERIFIED** |
| Currency (CDS) | **fail-closed** | `UnsupportedSegmentError` | **UNVERIFIED** |
| MCX / options / futures | spec rows present | PASS | **UNVERIFIED** |

Supported brokers in spec: **shoonya**, **angel**, **groww** (hurdle floors ₹25 / ₹70 / ₹70).

## Values that remain unverified (explicit list)
1. Brokerage slabs and per-order minimums for each broker.
2. Intraday equity STT rate and its exact application price.
3. Futures STT/CTT, options STT, commodity CTT rates.
4. Exchange transaction charge rates per segment and per exchange.
5. SEBI turnover fee rate (quoted per crore) and rounding.
6. Stamp duty rates and the state-wise schedule.
7. GST rate and the precise taxable base.
8. IPFT rates.
9. All delivery/CNC rows and all currency-segment rows (fail-closed by design).

No rate was invented, substituted, or silently re-based in this phase. No value was changed.

## What *was* verified
* Arithmetic correctness and rounding (`r2` half-up magnitude).
* Buy/sell asymmetry, per-order brokerage under partial fills, multi-leg aggregation.
* TS ↔ Python parity on 17 fixtures — **identical**.
* Fail-closed behaviour for unverified segments (refuses to trade).
* Micro-capital hurdle policy: balances ≤ ₹2,000 require strictly positive expected net
  after all costs (Phase-2 MICRO-001 correction, still in force).
* The earlier "flat ₹40 per order" model is retired everywhere; it survives only as a
  display-only legacy field with a comment saying so.

## Remaining risks
Since the rates are unverified, any headline net P&L in this repository is
**provisional**. If real rates differ materially, net results shift (both directions). This is
exactly why `COST MODEL VERIFIED` is **not** awarded.

## Verification status
**FAIL / UNVERIFIED** — arithmetic and parity PASS; official rate evidence BLOCKED
(no dated official documents available; network restricted).
