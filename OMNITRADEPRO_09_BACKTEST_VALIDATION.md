# OMNITRADEPRO_09 — HISTORICAL BACKTESTING ENGINE VALIDATION

**Module:** `src/lib/backtest_engine.ts` (+ research helpers in `historical_research.ts`, `advanced_research.ts`, `leakage_audit.ts`).  
**Verdict: PARTIALLY PASSED** — chronological causality proven; mandatory controls partially implemented (gaps fixed this audit; session/holiday/walk-forward gaps remain).

## 1. Mandatory Controls (§9)

| Control | Status | Evidence |
|---------|--------|----------|
| Chronological execution | ✅ PASS | bar loop `for i=35..n`; decisions on `candles.slice(0,i)` (closed bars only), entry at bar *i* close, management from bar *i+1* |
| No look-ahead bias | ✅ PASS | proven structurally (slice(0,i) excludes bar i); suite "Lookahead Audit" (causal indicator passes / forward lookahead detected) PASS |
| No future data leakage | ✅ PASS | `leakage_audit.ts` suite: indicator causality, scaler training isolation, temporal partitions, label overlap/purging, embargo, fit-timestamp — all PASS |
| No repainting | ✅ PARTIAL | backtest itself is causal; **live engine includes the forming candle (RT-001)** → live/backtest divergence remains open |
| Realistic order fills | ✅ FIXED | BT-001 (breakeven fee buffer = real charge model), BT-002/ORD-004 (gap-aware fills); same-bar SL-over-target ambiguity resolved conservatively (SL first) |
| Transaction costs | ✅ PASS | `roundTripCharges` per trade incl. statutory heads + two-sided slippage (8bps default) |
| Brokerage / statutory taxes | ✅ PASS | friction modes: STANDARD_SHOONYA / HIGH_ANGEL / ZERO_FRICTION — all executed |
| Slippage | ✅ PASS | entry+exit bps from cfg; ZERO_FRICTION explicit |
| Partial fills | ❌ N/A-OPEN | engine assumes whole fills (documented simplification) |
| Rejected orders | ⚠️ OPEN | sizing-zero setups skip entry silently (equivalent to reject) but no reject accounting in summary |
| Market gaps | ✅ FIXED | BT-002 gap-through fills at bar open |
| Stop-loss execution | ✅ PASS | conservative intra-bar priority; fills stop-price-or-worse |
| Session timing | ❌ OPEN (BT-003) | no per-day EOD square-off (only final bar); no intraday session gating in the loop |
| Exchange holidays | ❌ OPEN (BT-003) | loop ignores holidays (fixtures contain none); calendar helpers exist but unwired |
| Missing data handling | ⚠️ PARTIAL | `data_sanitizer` validates up-stream; engine assumes contiguous bars (no gap-fill of missing minutes) |

## 2. Validation Methodology Support
- **Split support exists:** `historical_research.chronologicalSplit` (train/validation/OOS) + `calculateQualityScore`, `computeDatasetSha256` (immutable dataset IDs) — tested in suite §22.
- **Walk-forward/rolling support exists:** `advanced_research.calculateWalkForwardRobustness` + `forecastVolatilityParkinson`/`detectRegimeTransitions` etc. — tested at function level.
- **NOT WIRED:** `runBacktest` itself performs no splitting/walk-forward orchestration — a user must call the helpers manually. Therefore **no result in this repo constitutes a validated walk-forward study** (BT-003).
- Regime coverage: fixtures cover regular/multiday/special sessions; no genuine bull/bear/high-vol **real** datasets (DATA-001: only SAMPLE/SYNTHETIC provenance in repo).

## 3. Executed Backtest Evidence (this audit)
Datasets: `data/fixtures/*` (SAMPLE provenance — synthetic; illustrative ONLY).

| Dataset | Bars (ingested) | Capital | Trades | Gross | Charges (Shoonya) | Net | Notes |
|---------|-----------------|---------|--------|-------|-------------------|-----|-------|
| synthetic_gbm_1m | 240 | ₹50,000 | 0 | 0 | 0 | 0 | gates reject noise (454/715 wave-pauses pattern) |
| sample_nifty50_1m | 375 (post-TZ fix; was 46) | ₹1,00,000 | 0 | 0 | 0 | 0 | qty 0: 20% cap < ₹22.4k unit (SCALE-002) |
| multiday_overnight_1m | 750 | ₹1,00,000 | 0 | 0 | 0 | 0 | same sizing block |
| multiday_overnight_1m | 750 | ₹5,00,000 | **3** | −128.37 | **474.59** | **−602.96** | all 3 stopped at −1R; Angel net −709.16; ZERO_FRICTION −128.37 |

Key insight: on the only dataset producing trades, **statutory+slippage friction (₹474.59) exceeded gross loss (₹128.37)** — costs dominated. Reported honestly; no parameter tuning attempted (mandate).

## 4. Statistical hygiene of the summary engine
- Expectancy = p·avgWin − (1−p)·avgLoss ✓; Profit factor = Σwins/|Σlosses| ✓ (sentinel 999 cosmetic — BT-006).
- **BT-004 (MEDIUM, OPEN):** Sharpe/Sortino annualize per-trade returns with √252 — statistically invalid; values shown in this repo (e.g. −81.37) are not standard Sharpe and must not be compared to literature.
- Max drawdown on trade sequence (not marked-to-market) — standard for trade ledgers, disclosed.
- Sample size: 3 trades — **no statistical significance whatsoever**; no performance claim can be made.

## 5. Verdict
Backtest engine is **causal and cost-aware after this audit's fixes**, suitable for research iteration. It is **NOT yet compliant** with §9's full mandatory control set (partial fills, session timing, holiday handling, in-engine walk-forward) and cannot produce validated performance on the current dataset inventory (synthetic fixtures only).
