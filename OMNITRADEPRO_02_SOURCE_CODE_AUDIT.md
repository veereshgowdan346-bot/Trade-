# OMNITRADEPRO_02 — SOURCE CODE AUDIT

**Scope:** all critical TS/Python modules read and analyzed (engine, strategies, indicators, intelligence, risk, tax, gateway, brokers, market, backtest, csv_ingestion, settings, API routes, Python core/risk/simulation/strategies/auth). UI components sampled per §12.  
**Severity scale:** CRITICAL · HIGH · MEDIUM · LOW · INFORMATIONAL.  
**Status convention:** FIXED = corrected in this audit (Category A, documented, regression-tested) · OPEN = documented, not changed (Category C / needs external evidence / architectural decision).

---

## Issue Register

### TZ-001 — CSV ingestion is timezone-dependent (CRITICAL) — **FIXED**
1. File: `src/lib/csv_ingestion.ts` · 2. Line: 68–89 (`parseTimestampStr`) · 3. CRITICAL  
5. Actual: bare `"YYYY-MM-DD HH:MM:SS"` strings fell through to `Date.parse`, which V8 interprets in the **machine-local timezone**; the documented "assume IST (+05:30)" branch was dead code for that format.  
6. Expected: naive wall-clock strings must always parse as IST (contract stated in the function's own comment and matched by the Python twin `core/csv_data_ingestion.py`).  
7. Root cause: regex-based IST branch placed after a permissive `Date.parse` fallback.  
8. Impact: on UTC hosts, candles shifted +5:30 and session validation rejected 88% of fixture rows (46/375, 92/750, 42/89 ingested); results differ per host TZ — non-deterministic research pipelines. Passed unnoticed on IST dev machines.  
9. Correction: naive formats now parse as IST **before** the timezone-explicit fallback (offset/Z/date-only).  
10. Regression: `scripts/independent_math_verification.js` → "TZ-001 regression" (3 format variants pinned to exact epochs); suite `Phase 7.3` CSV tests restored to green (47 rows → 375/750/89).

### TSL-001 — Trailing-SL candle scan produces systematic false stop-outs (HIGH) — **FIXED**
1. `src/lib/engine.ts` · 2. `evaluatePositionBracket` (≈ line 629) · 3. HIGH  
5. Actual: after each TSL ratchet, the intra-candle bracket scan replayed **all post-entry candles** against the *new* (higher) stop. Any historical dip below the ratcheted level (before that level was in force) triggered `BRACKET_STOP_LOSS`.  
6. Expected: a stop level only governs candles formed after it became effective.  
7. Root cause: no `slSince` tracking; scan filter keyed only on entry time.  
8. Impact: after the first 1R ratchet to net-breakeven, any earlier wobble below breakeven+fees closed the position immediately — the documented 2R+ trailing feature could essentially never run; systematic truncation of winners with false "STOP_LOSS" labels.  
9. Correction: in-memory `slSince` per position (set at creation, updated on every ratchet, cleared on close); scan now covers only candles ending after the current stop became effective; after restart with unknown stop history, the candle scan is skipped (tick checks remain).  
10. Regression: covered by suite stability + code review; behavior change documented in §Performance claims note (revalidation required — see NET_PROFITABILITY).

### ORD-001 — Charge model priced against the wrong broker on explicit routing (MEDIUM) — **FIXED**
1. `src/lib/engine.ts` · 2. `placeOrder` step 4d · 3. MEDIUM  
5. Actual: `executionBroker = preferredBroker === "shoonya" ? "shoonya" : cfg.primaryBroker` — an explicit `req.broker: "angel"` order was costed at primaryBroker rates while routed to Angel.  
6. Expected: charge model must use the broker the order actually routes to.  
8. Impact: wrong hurdle evaluation and wrong expected-net accounting per broker.  
9. Correction: `executionBroker = preferredBroker`.  
10. Regression: math harness "Tax: …" + suite green; routing consistency reviewed.

### ORD-002 — Net-positive Take-Profit gate used fabricated fallback charges (MEDIUM) — **FIXED**
1. `src/lib/engine.ts` · 2. `checkLivePriceAgainstBracket` · 3. MEDIUM  
5. Actual: `calculateNetPnL` was called without instrument `kind`, silently triggering the fabricated flat-₹25/₹55 fallback breakdown instead of the real statutory model.  
6. Expected: kind-aware full charge model (the gate's own comment demands "all statutory fees & brokerage").  
9. Correction: `inst` threaded through; `kind`/`exchange` passed.  
10. Regression: math harness "Tax: net P&L never reports gross as net".

### ORD-003 — Tick-path Take-Profit filled at crossing tick, not limit price (MEDIUM) — **FIXED**
1. `src/lib/engine.ts` · 2. `checkLivePriceAgainstBracket` · 3. MEDIUM  
5. Actual: a resting limit target filled at the observed LTP (which can be arbitrarily beyond the target).  
6. Expected: limit orders fill at their limit price (or better only on documented gap logic).  
9. Correction: target fills at `targetPrice` on the tick path.  

### ORD-004 — Candle-path bracket fills at arbitrary later LTP (MEDIUM) — **FIXED**
1. `src/lib/engine.ts` · 2. `evaluatePositionBracket` · 3. MEDIUM  
5. Actual: SL/target detected on historical candles closed at `currentLtp` (current tick) — neither the stop price nor the target price.  
9. Correction: gap-aware fills — stops fill at stop price (or bar open if gapped through), targets at target price (or bar open if gapped through).  
10. Regression: math harness "BT-002 regression: gapped stop bar fills at the open".

### ORD-005 — Candle-path Take-Profit lacked the net-positive gate (MEDIUM) — **FIXED**
1. `src/lib/engine.ts` · 2. `evaluatePositionBracket` · 3. MEDIUM  
5. Actual: tick path required net>0 after charges to fire BRACKET_TARGET; candle path had no such gate (targets could fire at a net loss).  
9. Correction: identical gate applied on both paths.

### BT-001 — Backtest "net breakeven" buffer used hardcoded floors (MEDIUM) — **FIXED**
1. `src/lib/backtest_engine.ts` · 2. 1R ratchet block · 3. MEDIUM  
5. Actual: `feePerUnit = (25|55)/qty` fixed floors; actual round-trip charges (with slippage) are frequently higher → "BREAKEVEN" exits were often net-negative.  
6. Expected: same charge model as the live TSL engine (charges at entry=exit round trip).  
9. Correction: `roundTripCharges`-derived buffer (ZERO_FRICTION mode keeps 0).  

### BT-002 — Backtest ignores market gaps on exits (MEDIUM) — **FIXED**
1. `src/lib/backtest_engine.ts` · 2. SL/TARGET exits · 3. MEDIUM  
5. Actual: fills always at stop/target price even when the bar opened beyond the level.  
6. Expected (mandatory control "Market gaps"): gap-through fills at the bar open.  
9. Correction: gap-aware fills (both directions).

### MATH-001 — Indicator functions accept invalid periods (LOW) — **FIXED**
1. `src/lib/indicators.ts` · 2. `ema`/`rma`/`bollinger` entry · 3. LOW  
5. Actual: `period ≤ 0` → division by zero / silent NaN series.  
9. Correction: positive-integer validation with explicit errors.  
10. Regression: math harness "MATH-001 regression".

### MATH-002 — GBM gate NaN propagation (LOW) — **FIXED**
1. `src/lib/strategies.ts` · 2. `gbmProbability` · 3. LOW  
5. Actual: <2 usable returns (or zero closes → log(0)) produced NaN probabilities flowing into the quorum.  
9. Correction: degenerate windows return neutral 50/50; non-finite returns filtered; dead `drift` code removed.  
10. Regression: math harness GBM degenerate/zero-close tests.

### RISK-001 — Sizing confidence not clamped (LOW) — **FIXED**
1. `src/lib/risk.ts` · 2. `sizePosition` · 3. LOW  
5. Actual: caller-supplied `conf > 1` inflates `capitalCap` beyond the confidence-multiplier contract (max 1.0).  
9. Correction: clamp to [0,1].  
10. Regression: math harness "conf=2 clamped".

### UI-001 — PAPER⇄LIVE toggle falsely claims live capability (MEDIUM) — **FIXED**
1. `src/components/Cockpit.tsx` · 2. `toggleTradingMode` + badge · 3. MEDIUM  
5. Actual: a mode-toggle button with a confirm dialog stating "enables real capital order dispatch" — while every server layer forces PAPER. A fake control that lies about safety posture.  
6. Expected: no UI affordance may claim or attempt live enablement (mandate §12/§13).  
9. Correction: replaced with an honest read-only "PAPER · LIVE DISABLED" badge (click shows the interlock explanation).  

### TAX-001 — Delivery/CNC statutory model missing (HIGH) — **OPEN** (Category C: needs authorized rate table)
`src/lib/tax.ts` `ratesFor` ignores `productType`: delivery equity trades are costed with intraday sell-only STT (0.025%) instead of delivery rates on both sides; DP charges not modeled anywhere. Brokerage correctly ₹0 for delivery, but every other statutory head is intraday-only. Fix requires inserting official delivery rates — prohibited without source documents/authorization ("do not invent rates").

### TAX-002 — `calculateNetPnL` fallback fabricates a breakdown (HIGH) — **OPEN**
When `qty/entry/exit` are absent, the fallback emits fixed components (stt ₹5.0, exchange ₹3.5, sebi ₹0.5, stamp ₹2.0, gst ₹4.0) presented inside a `Charges` record as if computed; totals pinned to ₹25/₹55 floors. These numbers have no derivation. Removing them changes the financial model → Category C. Current behavior pinned by tests; every audit path that matters (orders, closes, backtests) passes full parameters and never hits this branch except ORD-002 (now fixed).

### TAX-003 — All statutory rates UNVERIFIED (MEDIUM) — **OPEN (policy)**
No official tariff/statutory documents exist locally, and this environment cannot fetch them. Per §7.1 every rate in `tax.ts` (STT 0.025% sell intraday; exch 0.00297%/0.00183%/0.03503%/MCX 0.0021%; SEBI ₹10/crore; stamp 0.003%/0.002%/0.003%; GST 18% on brokerage+exch+sebi; Shoonya flat ₹5/leg; Angel/Groww min(₹20, 0.1%)) is **UNVERIFIED** — plausible against public knowledge, consistent internally (independent hand-computed fixtures pass), but not source-verified. Minimum-total floors (₹25/₹55) and the "₹10 base/API/DP" claim are modeled constructs without citation (see TAX-002/004).

### TAX-004 — Angel/Groww per-leg formula is dead code (MEDIUM) — **OPEN**
`roundTripCharges` forces `Math.max(40, brokerage)` for angel/groww and `Math.max(10, …)` for shoonya; since `brokerageFor` returns ≤ ₹20/leg and exactly ₹5/leg respectively, the floor **always** binds → effective flat ₹40/₹10 per round trip regardless of turnover. This contradicts the `brokerageFor` docstring ("lower of ₹20 or 0.1%") and disables minimum-brokerage modeling for small trades. Direction of error: overstates small-trade costs. Changing it would *improve* reported net P&L → Category C authorization required.

### TAX-005 — Hurdle constants inconsistent (MEDIUM) — **OPEN**
`risk.ts` `STATUTORY_HURDLE_ANGEL = 70`; `tax.ts` floors angel/groww at ₹55; `engine.ts` `preFlightCheck` uses `minBrokerFloor = 55` for non-Shoonya while `placeOrder` uses 70 (with a `cfg.hurdle` escape hatch). Comments variously claim "₹55/₹70". No single source of truth.

### TAX-006 — Python cost engine diverges from TS cost engine (HIGH) — **OPEN**
`risk/cost_guardrail.py`: flat ₹20+₹20 brokerage, GST on brokerage only, SEBI ₹0.01/share×2 (wrong basis vs ₹10/crore turnover), **no STT**, no exchange transaction charges, stamp "negligible". TS `tax.ts` models all heads. Two authoritative-looking cost models disagree by design. Cross-language parity script does **not** cover cost models. The Python engine understates intraday statutory cost materially (missing STT/exchange/stamp).

### QUORUM-001 — Two parallel quorum designs (MEDIUM) — **OPEN**
TS: ≥75% of 5 active voters + GBM ≥65% + Wave Gate (+ recovery 90/85). Python `decision_engine.py`: `min_agreement_threshold = 2` concordant skills, no GBM. Unreconciled; "27-strategy quorum" marketing text describes only the TS stack.

### QUORUM-002 — Neutral votes dilute the quorum denominator (LOW) — **OPEN**
`evaluateConsensus`: `quorumPct = max(buy,sell)/voters` where `voters` counts every active strategy including neutral ones (e.g. 3 BUY + 2 neutral → 60% < 75% → fails). This is a defensible "all active voters must agree" reading, but it is not the "active voter" semantics the documentation implies (neutral ≠ opposed). Verified: disabled/suppressed/failed voters can never *increase* confidence (suppressed excluded from `active`; plugins and GBM never counted as voters; `externalVote` adds exactly one voter) ✓.

### QUORUM-003 — Stale comment "4 active quorum voters" (LOW) — **OPEN**
`strategies.ts` `Consensus` type comment says 4; actual active set is 5 in both regime branches.

### WAVE-001 — Choppy-regime active set can never trade (MEDIUM) — **OPEN**
In `CHOPPY_RANGING`, `waveActive` is forced false (`isConsolidation` includes `regime === "CHOPPY_RANGING"`), so `qualifies` is always false — yet the same branch promotes `bb`/`rs` mean-reversion voters as the "active in choppy regimes" set (per `BUILTIN_STRATEGIES` notes). The mean-reversion-in-chop design is dead code; behavior: trading is always paused in chop. Contradiction between design doc and engine; resolving it is a strategy-model decision (Category C).

### WAVE-002 — Self-included regime ratios (LOW) — **OPEN**
`classifyRegime` ATR-ratio/BB-width-ratio compare the current value against a trailing mean **including** the current value, shrinking ratios toward 1 and slightly delaying VOLATILITY_EXPANSION detection.

### MATH-003 — Warm-up seeding deviates from canonical Wilder (LOW) — **OPEN**
`rsi`/`atr` seed the first RMA window with `values[0]` (a synthetic 0 change / first-bar TR included). Canonical Wilder/TA-Lib seed with changes 1..period (TR 1..period). Production reaches its first valid value one bar early and differs transiently for ≈2 periods (verified: steady-state recurrence identical — math harness RMA/ATR/RSI steady-state tests pass). Not corrected: changes historical signals ⇒ Category C revalidation territory.

### MATH-004 — ADX DX NaN→0 mid-series (LOW) — **OPEN**
Zero-TR bars make DI/DX NaN; `clean` maps them to 0 before the ADX RMA, biasing ADX down transiently. Warm-up padding handled correctly.

### MATH-005 — RSI of a perfectly flat series returns 100 (LOW) — **OPEN**
`l[i] === 0 → 100` conflates "all gains" with "no movement"; neutral (50) or NaN would be defensible. Cosmetic: flat series are not tradeable anyway.

### RT-001 — Live analysis includes the FORMING candle (MEDIUM) — **OPEN**
`angelWs` aggregation appends the in-progress 1-minute bar to `candles`; `analysisCandles` feeds it to indicators/consensus, so readings repaint within the minute and are inconsistent with backtests (which use closed bars). No future data is used (not a look-ahead leak), but live/backtest parity is violated. Correction (closed-candles-only evaluation) would change live signal timing → recommended, not implemented (behavioral change).

### BT-003 — Backtest lacks mandatory session/holiday controls (MEDIUM) — **OPEN**
`runBacktest` has no per-day EOD square-off (only at final bar), no exchange-holiday/session gating, no walk-forward orchestration inside the loop (helpers exist in `historical_research.ts`/`advanced_research.ts` but are not wired in). Multi-day fixtures can hold overnight positions silently.

### BT-004 — Sharpe/Sortino annualization invalid (MEDIUM) — **OPEN**
Per-**trade** returns are annualized with √252 (a daily convention). Values are not comparable to standard Sharpe; misleads performance reading.

### BT-005 — Same-bar ambiguity & intra-bar ratchet (LOW) — **OPEN**
When one bar touches both SL and target, SL wins (conservative ✓ documented). The 1R breakeven ratchet triggers on the bar **high/low** extreme (optimistic intra-bar touch). Both are modeling conventions, disclosed here.

### BT-006 — Summary edge semantics (LOW) — **OPEN**
Zero-net trades counted as losses; `profitFactor`/`recoveryFactor` use sentinel 999 (cosmetic).

### SEC-001 — Unauthenticated API surface; optional webhook secret (MEDIUM) — **OPEN**
All 22 API routes (including `POST /api/orders`, `/api/config`, `/api/engine`) accept unauthenticated requests; `POST /api/v1/webhook` authenticates only if `webhookSecret` is set (default empty = open); secret compared non-constant-time; no rate limiting, replay protection, or idempotency keys on the webhook (duplicate signals can open duplicate orders across symbols). Mitigations present: every order path is PAPER-only (four independent LIVE interlocks), input validation at symbol/side/qty, audit logging with sensitive-data sanitizer, credential vault with encryption. Acceptable **only** under local-desktop/loopback deployment; must be remediated before any networked exposure.

### SEC-002 — Secret scan findings inert (LOW) — **OPEN (monitor)**
`scan_repo_secrets.py`: 12 findings — all are test-fixture strings, scanner self-matches, or redacted references to the historical credential incident (documented in `PHASE70_*`, `SECURITY_AUDIT.md`). No live credentials verified present; `.gitignore` correctly excludes `data/credentials*.json`, `.env*`, keys.

### ARCH-001 — Dual-stack divergence (HIGH) — **OPEN**
See §01. TS and Python stacks are fully parallel (0 imports across). Financial logic duplicated and divergent (TAX-006, QUORUM-001). Long-term: single source of truth or enforced parity suites for every duplicated financial function.

### ARCH-002 — PySide6 hard dependency in core (MEDIUM) — **OPEN**
`core/broker_adapter.py` imports `PySide6.QtCore` at module scope; headless test environments must install a GUI toolkit. Suggest interface decoupling.

### GA-001 — No failed-voter isolation in consensus (LOW) — **OPEN**
`evaluateConsensus` calls each voter without try/catch; one throwing strategy aborts the entire consensus (order rejected as unhandled error path). Treat as failed-voter → neutral would match §6 requirements.

### MICRO-001 — Micro-capital hurdle escape hatch (HIGH) — **OPEN (Category C review)**
`engine.ts`: when `cfg.capital ≤ 2000`, the net-yield hurdle is set to **−₹50**, i.e. trades with expected net loss up to ₹50 are permitted (5% of a ₹1,000 account per trade). Deliberate (commented) but contravenes the "net profit hurdle" concept; flagged for explicit decision.

### SCALE-001/002, STR-001, PY-001, DATA-001, ENGINE-001
Described in the dedicated reports (RISK_SCALABILITY, STRATEGY_VERIFICATION, COMPLETE_TEST, NET_PROFITABILITY respectively).

---

## Live-Trading Restriction Verification (all layers)
| Layer | Mechanism | Verified by |
|-------|-----------|-------------|
| UI | toggle removed/faked enablement removed (UI-001) | code + build |
| API | `/api/orders` rejects `mode/tradingMode: LIVE` (403) | code + pytest (`test_environment_variables_cannot_override_live_kill_switch`) |
| Config | `normaliseRisk` forces `tradingMode = "PAPER"` unconditionally | math harness 5-variant test |
| Engine | `placeOrder` step 0 rejects any LIVE request/env | code + Python phase tests |
| Gateway | `routeOrder` interlock refuses LIVE routing | code |
| Broker | `dispatchOrder` returns simulated ack only; LIVE hard-blocked; Python `BrokerAdapter.place_order` permanently rejects | code + `test_phase1_safety_fixes` |
| Restart | settings round-trip through `normaliseRisk` re-forces PAPER | code path verified |

## Change Authorization Summary
13 defects corrected under Category A (mathematical bugs, logic errors, missing validation, broken UI, state-sync). **Zero** Category C changes made: no thresholds, rates, strategy parameters, or hurdle values were altered; every correction that could affect historical results is listed above with impact direction (see MASTER_AUDIT §Change Log).
