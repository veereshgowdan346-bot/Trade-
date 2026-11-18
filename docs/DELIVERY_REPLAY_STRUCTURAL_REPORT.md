# Delivery replay structural report — research prototype, NOT live-ready

No strategy backtest was run during this overhaul. This is a new isolated paper-only prototype, not a replacement of the legacy harness or production engine. Existing synthetic scripts and older harnesses remain in the repository for provenance; they are not suitable for drawing real-market conclusions. The archived walk-forward script is disabled and its output marked invalid. No network or broker access is provided.

## Costs

`src/lib/delivery_replay.ts` computes modeled per-leg delivery STT (separate buy and sell rates), exchange, SEBI, buy stamp duty, brokerage, GST on exchange, SEBI, DP and brokerage, and DP per scrip/sell day. All inputs, including DP, are mandatory and nonnegative; no default tariff or implicit waiver exists. The user-mentioned 0.1% per side is used only in unit test fixtures, not asserted as verified tariff. The tariff identifier is caller-provided and is **not verified**. Contract-note rounding, applicable levies, rate effective dates, broker/depository tariffs and zero-brokerage eligibility require dated official evidence and reconciliation before use. Same-day closing aborts rather than being misclassified as delivery; settlement eligibility is not implemented. The existing authoritative `roundTripCharges` still rejects delivery; it has not been weakened or given guessed rates.

## Replay

Close-of-bar strategies receive an immutable prefix; their decision executes no earlier than the following bar open. During each bar the engine processes opening gaps, pending orders, then stop/target (stop-first when OHLC ordering is ambiguous). Circuit breaker checks realized daily P&L **inside** the loop before new entries and does not prevent risk exits. A single long-only scrip shares one cash balance; entry fees count against capital. Open positions are explicitly returned, with marked equity excluding prospective exit costs. Same-day exit aborts, so this prototype cannot yet run general intraday stop scenarios. No leverage, shorting, partial fills, liquidity, brokerage order semantics, holidays, auctions, settlement, corporate actions, spread, slippage, or historical rate changes are modeled. Gaps and OHLC priority are assumptions, not executable-fill guarantees. Arbitrary callback code is not sandboxed: it could obtain future data via closure, filesystem or other means; genuine blind evaluation requires a constrained strategy interface and isolation, plus adversarial causality tests.

## Data gate

The new entry point requires an in-process object created by `ingestHistoricalBars` from JSON 1-minute OHLCV with strict chronology, basic OHLC checks and a SHA-256 manifest identifying provider, instrument, source and an explicit real-NSE attestation. A hash confirms byte integrity, **not authenticity**; caller claims can be false, no independent licensing or provider verification is implemented, session completeness, exchange calendar, corporate actions and market identity are not verified. Tick ingestion is not implemented. The gate applies only to the new replay, not to legacy backtests. No actual real equity feed has been imported or verified.

## Validation and remaining gate

`scripts/test_delivery_replay.js` uses tiny hand-crafted fixtures solely for unit tests, including leg-cost arithmetic, hash and provenance rejection, prefix lengths, gap-stop and in-loop breaker behavior, and same-day exit rejection. These are not strategy tests and have no evidentiary P&L. Compile the module into `dist_test_cjs` before running this test. Full project type checking is also required.

**Readiness: NOT READY for true live-market mechanics or validated real-market expectancy.** Required work includes evidenced dated tariff and DP schedules, precise tax/rounding and contract-note reconciliation, delivery eligibility/settlement and same-day classification, robust data authentication and corrections, realistic fill/slippage/liquidity modeling, sandboxed causal strategies, and end-to-end independent review. Live trading remains disabled.

## Subsequent user-authorized scenario and CSV pipeline

A separate fixed cost scenario now accepts the user-supplied 0.1% STT per side, ₹15.34 DP plus GST, exchange 0.00322%, SEBI 0.0001%, buy stamp 0.015%, GST 18% and zero brokerage. These rates are **user-provided, not independently verified**; no dated official evidence was added, and the existing authoritative delivery rejection is unchanged. The calculator does not implement contract-note rounding; ₹15.34 × 1.18 = ₹18.1012 before rounding.

`data/historical_real/README.md` describes the local CSV/manifest interface. The new fixed long-only MACD runner is an exploratory paper replay, not a chronological train/validation/OOS evaluation, and it can fail on same-day exits. No market data or backtest was run to validate it. These changes do not close the readiness limitations listed above.

## Automated data access and intraday intervals

A local Yahoo chart fetcher and optional fetch/compile/replay wrapper now support declared 1-, 5- and 15-minute bars. Five sessions are required for 1-minute data; 30 for 5/15-minute data. Missing regular-session bars are recorded rather than fabricated; stop/target hits may be missed, so results on incomplete bars are less reliable. This is exploratory replay, not a validated OOS test. Provider metadata and hashes cannot independently prove authenticity. Indicator periods are measured in bars, so changing interval changes the strategy's time horizon. Same-day exits still abort. Provider availability and network restrictions may prevent the workflow from fetching any data.
