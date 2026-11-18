# Missing-Evidence Register

OmniTradePro Apex V2.0 · generated 2026-11-18 by `scripts/generate_handover.js`.

This register lists every external document that is **required but not held**. Nothing in this repository
may be upgraded from `UNVERIFIED` without the document named below. No value has been estimated,
interpolated or substituted, and none may be.

Status of the cost model: **OPEN — every statutory/brokerage rate remains UNVERIFIED** — 21 heads UNVERIFIED,
2 segments without any evidence, 3 heads assumed rather than sourced.

## 1. Transaction-cost heads (26 of 26 unverified)

| # | Segment | Head | Status | Required document | Issuing authority | Applicable date range | Validation criterion |
|---|---|---|---|---|---|---|---|
| 1 | NSE_EQ_INTRADAY | stt | **UNVERIFIED** | Securities Transaction Tax rate notification (Finance Act / STT Rules, current schedule) | Central Board of Direct Taxes (CBDT), Government of India | rate in force for each backtested session, 2022-01-01 onward | official rate table stating the rate per instrument class and its effective date; must match the charge applied on that date |
| 2 | NSE_EQ_INTRADAY | exchangeTxn | **UNVERIFIED** | Exchange transaction-charge circular for the relevant segment | NSE / MCX (as published on the exchange website) | each circular's effective period covering 2022-01-01 onward | circular number, effective date and per-lakh or per-crore rate referenced directly |
| 3 | NSE_EQ_INTRADAY | stampDuty | **UNVERIFIED** | Stamp duty schedule for securities market instruments | State stamp authorities consolidated by the exchange / SEBI | rates applicable on each trade date | state-wise schedule and collecting agency, with the effective date |
| 4 | NSE_FUT | stt | **UNVERIFIED** | Securities Transaction Tax rate notification (Finance Act / STT Rules, current schedule) | Central Board of Direct Taxes (CBDT), Government of India | rate in force for each backtested session, 2022-01-01 onward | official rate table stating the rate per instrument class and its effective date; must match the charge applied on that date |
| 5 | NSE_FUT | exchangeTxn | **UNVERIFIED** | Exchange transaction-charge circular for the relevant segment | NSE / MCX (as published on the exchange website) | each circular's effective period covering 2022-01-01 onward | circular number, effective date and per-lakh or per-crore rate referenced directly |
| 6 | NSE_FUT | stampDuty | **UNVERIFIED** | Stamp duty schedule for securities market instruments | State stamp authorities consolidated by the exchange / SEBI | rates applicable on each trade date | state-wise schedule and collecting agency, with the effective date |
| 7 | NSE_OPT | stt | **UNVERIFIED** | Securities Transaction Tax rate notification (Finance Act / STT Rules, current schedule) | Central Board of Direct Taxes (CBDT), Government of India | rate in force for each backtested session, 2022-01-01 onward | official rate table stating the rate per instrument class and its effective date; must match the charge applied on that date |
| 8 | NSE_OPT | exchangeTxn | **UNVERIFIED** | Exchange transaction-charge circular for the relevant segment | NSE / MCX (as published on the exchange website) | each circular's effective period covering 2022-01-01 onward | circular number, effective date and per-lakh or per-crore rate referenced directly |
| 9 | NSE_OPT | stampDuty | **UNVERIFIED** | Stamp duty schedule for securities market instruments | State stamp authorities consolidated by the exchange / SEBI | rates applicable on each trade date | state-wise schedule and collecting agency, with the effective date |
| 10 | MCX_ANY | stt | **UNVERIFIED** | Securities Transaction Tax rate notification (Finance Act / STT Rules, current schedule) | Central Board of Direct Taxes (CBDT), Government of India | rate in force for each backtested session, 2022-01-01 onward | official rate table stating the rate per instrument class and its effective date; must match the charge applied on that date |
| 11 | MCX_ANY | exchangeTxn | **UNVERIFIED** | Exchange transaction-charge circular for the relevant segment | NSE / MCX (as published on the exchange website) | each circular's effective period covering 2022-01-01 onward | circular number, effective date and per-lakh or per-crore rate referenced directly |
| 12 | MCX_ANY | stampDuty | **UNVERIFIED** | Stamp duty schedule for securities market instruments | State stamp authorities consolidated by the exchange / SEBI | rates applicable on each trade date | state-wise schedule and collecting agency, with the effective date |
| 13 | NSE_EQ_DELIVERY | segment unsupported | **UNSUPPORTED_NO_EVIDENCE** | Authoritative publication for this head | Competent authority (not yet identified) | trade dates covered | primary document stating the value and effective date |
| 14 | CDS_ANY | segment unsupported | **UNSUPPORTED_NO_EVIDENCE** | Authoritative publication for this head | Competent authority (not yet identified) | trade dates covered | primary document stating the value and effective date |
| 15 | GLOBAL | gst | **UNVERIFIED** | GST rate notification applicable to brokerage and transaction charges | Central Board of Indirect Taxes and Customs (CBIC) | rate in force per trade date | notification citing the 18% category and its effective period |
| 16 | GLOBAL | sebiTurnoverFee | **UNVERIFIED** | SEBI turnover-fee circular | Securities and Exchange Board of India (SEBI) | rate in force per trade date | circular stating the rate and the date it took effect |
| 17 | BROKER:shoonya | intradayPerLeg | **UNVERIFIED** | Published brokerage tariff card (intraday) | Broker (Shoonya / Finvasia; Angel One; Groww) | tariff in force on each trade date | current tariff page or PDF from the broker showing the per-order charge |
| 18 | BROKER:shoonya | deliveryPerLeg | **UNVERIFIED** | Published brokerage tariff card (delivery) | Broker (Shoonya / Finvasia; Angel One; Groww) | tariff in force on each trade date | current tariff page or PDF showing the delivery charge |
| 19 | BROKER:shoonya | roundTripBrokerageFloor | **UNVERIFIED** | Broker tariff card stating minimum/round-trip brokerage | Broker (Shoonya / Finvasia; Angel One; Groww) | tariff in force on each trade date | explicit statement of the minimum charge per round trip |
| 20 | BROKER:shoonya | minimumRoundTripDeduction | **UNVERIFIED** | Broker tariff card plus depot/DP charge schedule | Broker (Shoonya / Finvasia; Angel One; Groww) | tariff in force on each trade date | itemised minimum total deduction per round trip, sourced not inferred |
| 21 | BROKER:angel | deliveryPerLeg | **UNVERIFIED** | Published brokerage tariff card (delivery) | Broker (Shoonya / Finvasia; Angel One; Groww) | tariff in force on each trade date | current tariff page or PDF showing the delivery charge |
| 22 | BROKER:angel | roundTripBrokerageFloor | **UNVERIFIED** | Broker tariff card stating minimum/round-trip brokerage | Broker (Shoonya / Finvasia; Angel One; Groww) | tariff in force on each trade date | explicit statement of the minimum charge per round trip |
| 23 | BROKER:angel | minimumRoundTripDeduction | **UNVERIFIED** | Broker tariff card plus depot/DP charge schedule | Broker (Shoonya / Finvasia; Angel One; Groww) | tariff in force on each trade date | itemised minimum total deduction per round trip, sourced not inferred |
| 24 | BROKER:groww | deliveryPerLeg | **UNVERIFIED_ASSUMED_SAME_AS_ANGEL** | Published brokerage tariff card (delivery) | Broker (Shoonya / Finvasia; Angel One; Groww) | tariff in force on each trade date | current tariff page or PDF showing the delivery charge |
| 25 | BROKER:groww | roundTripBrokerageFloor | **UNVERIFIED_ASSUMED_SAME_AS_ANGEL** | Broker tariff card stating minimum/round-trip brokerage | Broker (Shoonya / Finvasia; Angel One; Groww) | tariff in force on each trade date | explicit statement of the minimum charge per round trip |
| 26 | BROKER:groww | minimumRoundTripDeduction | **UNVERIFIED_ASSUMED_SAME_AS_ANGEL** | Broker tariff card plus depot/DP charge schedule | Broker (Shoonya / Finvasia; Angel One; Groww) | tariff in force on each trade date | itemised minimum total deduction per round trip, sourced not inferred |

A head becomes VERIFIED only when the document above is held locally, names the rate **and** the date it took
effect, and the value in the registry matches it. A matching hash proves file identity, never authenticity.

## 2. Calendar evidence

| Year | Current state | Problem | Required document | Issuing authority | Applicable date range | Validation criterion |
|---|---|---|---|---|---|---|
| 2022 | DISCREPANCY | 2022-10-24 (weekday_discrepancy (Monday) — requires manual adjudication) — in the third-party calendar but absent from the data | NSE circular / official trading-holiday list covering that date | NSE | 2022-10-24 | An official circular confirming whether the exchange traded, plus the data vendor's explanation for the missing session |
| 2025 | UNCHECKED | No session dataset for the year | NSE official holiday list for 2025 | NSE | Full year | Every trading session in the year must match an official holiday list and the exchange's special-session circulars |
| 2025 | UNCHECKED | No dataset for 2025; the year was never assessed | NSE official holiday list and special-session circulars for 2025 | NSE | 2025-01-01 to 2025-12-31 | Session-for-session agreement with the official list; anything less is not "verified" |

## 3. Equity-instrument data

| Requirement | Current state | Why the existing data will not do | Acceptance criterion |
|---|---|---|---|
| Authentic, appropriately licensed **equity-instrument** intraday data | Only NIFTY **index** data is held (third-party mirrors; one repository has **no licence**) | Index levels are not tradable equity instruments, and the instrument-compatibility audit blocks `10 of 10` strategies for equity validation | A licence statement naming the permitted use, a vendor or exchange as the origin, and per-instrument OHLCV that reconciles to an official session calendar |

## 4. What would NOT satisfy these rows

- A screenshot, a blog, a broker marketing page without an effective date, or a value "everyone knows".
- A file whose hash matches a recorded hash but whose origin cannot be established.
- Any number produced by fitting the backtest to published results.
