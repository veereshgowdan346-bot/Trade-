# OMNITRADEPRO_04 — MATHEMATICAL VERIFICATION

**Method:** `scripts/independent_math_verification.js` — reference implementations written from textbook definitions (Wilder 1978; Bollinger; VWAP; GBM; Abramowitz–Stegun) and hand-computed fixtures, **not** copies of production code. Deterministic seeded walks (LCG) for property tests. This proves formula correctness, not self-consistency.

**Result: 40/40 PASS** (executed 2026-11-17 in this environment; exit code 0).  
Full run: `npm run test:math` (also chained into `npm test`).

---

## Verification Ledger

| # | Calculation | Verification | Result |
|---|------------|--------------|--------|
| 1 | EMA | independent reference on 200-pt walk; closed-form constant-input identity EMA(c)=c; hand vector [1,2,3,4,5] p=3 → [1,1.5,2.25,3.125,4.0625] | PASS |
| 2 | RMA (Wilder) | steady-state vs independent Wilder recurrence; hand vector [2,4,6,8] p=2 → [NaN,3,4.5,6.25] | PASS |
| 3 | True Range | exact definition incl. previous-close terms, 120 bars | PASS |
| 4 | ATR | equals Wilder-smoothed reference TR; constant-range convergence to true range | PASS |
| 5 | RSI | steady-state vs independent Wilder RSI (index-aligned); algebraic identity RSI=100·G/(G+L); saturation 100/0 on monotone series; [0,100] bounds | PASS (warmup deviation documented as MATH-003) |
| 6 | Bollinger | bands + width vs independent reference; zero-variance collapse | PASS |
| 7 | VWAP | hand vector (typical price × volume); zero-volume fallback = close (no div/0) | PASS |
| 8 | SuperTrend | constructed rally→breakdown: direction correct, ≤2 flips, flip at band cross | PASS |
| 9 | ADX/±DI | bounds [0,100] on 400 bars; persistent trend ⇒ +DI>−DI & ADX>25 | PASS |
| 10 | GBM probability | symmetric walk ⇒ p(up)∈(30,70); monotone rally ⇒ p(up)>65; degenerate ⇒ 50/50 (MATH-002); zero-close ⇒ finite | PASS |
| 11 | Normal CDF kernel | production A&S polynomial error < 1e-5 vs independent erf-based reference across ±6σ | PASS |
| 12 | Tax: NSE intraday | hand-computed round trip (100×100→101, Shoonya): brokerage ₹10, STT ₹2.525 (sell-side 0.025%), exch ₹0.597 (0.00297%), SEBI ₹0.020 (₹10/crore), stamp ₹0.30 (buy 0.003%), GST ₹1.910 (18% on brokerage+exch+sebi), slippage ₹16.08 (8bps both sides) | PASS |
| 13 | Tax: Angel floor | per-leg min(₹20,0.1%) then ₹40 RT floor + ₹55 total floor | PASS (model semantics pinned; see TAX-004 for critique) |
| 14 | Tax: delivery brokerage | ₹0 for DELIVERY/CNC (Shoonya) | PASS |
| 15 | Tax: STT side handling | BUY round trip: STT on exit value; SELL: on entry value | PASS |
| 16 | Tax: MCX/CTT | label CTT; 0.01% sell side | PASS |
| 17 | Tax: sumCharges | additive, paise-rounded | PASS |
| 18 | Tax: net ≠ gross | every real trade has charges > 0; net = gross − total | PASS |
| 19 | Sizing: 1% rule + 20% cap | invariant sweep across ₹1k…₹10L (riskAtStop ≤ 1%·capital; exposure ≤ 20%·capital·leverage) | PASS |
| 20 | Sizing: conf clamp | conf=2 cannot inflate qty (RISK-001) | PASS |
| 21 | Sizing: lot flooring | NFO 50-lot multiples; zero-size flagged | PASS |
| 22 | Sizing: RR ≥ 3R + tick alignment | target ≥ 3×SL; SL/target on tick grid | PASS |
| 23 | Kill-switch | `normaliseRisk` forces PAPER for "LIVE"/"live"/"PAPER"/""/"REAL" | PASS |
| 24 | confidenceMultiplier | 0.5→0.5, 1→1, 0→0.25 | PASS |
| 25–27 | Regression pins | TZ-001 (3 timestamp formats → exact epochs), MATH-001 (invalid periods throw), BT-002 (gap fill = open) | PASS |

## Checklist Coverage (§4 requirements)

| Check | Status | Note |
|-------|--------|------|
| Mathematical formula | ✅ verified | per ledger |
| Input data types | ✅ | `Candle` typed; JS number semantics documented (no decimal arithmetic — paise rounding via `r2`) |
| Initialization / warm-up | ✅ audited | MATH-003: RSI/ATR seed one bar early vs canonical Wilder; converges ≈2 periods |
| Numerical precision | ✅ | paise rounding, tick rounding verified; FP modulo pitfall avoided in tests |
| Floating-point behavior | ✅ | div/0 guards: VWAP zero-vol, BB width mid=0, DX s=0, ATR tr=0 |
| Missing values | ✅ | NaN warm-up padding correct; NaN → neutral in gates (MATH-002) |
| Zero denominators | ✅ | verified no crash paths |
| Zero volume | ✅ | VWAP fallback pinned |
| Invalid OHLC | ⚠️ partial | `data_sanitizer.validateAndSanitizeCandles` covers geometry/dupes (suite-tested); indicator functions themselves don't reject h<l (documented boundary) |
| Duplicate timestamps | ✅ | sanitizer + csv_ingestion detect and report, never silently repair |
| Out-of-order timestamps | ✅ | ingestion flags per quality report |
| Session resets | ✅ | VWAP is cumulative per supplied window; session-scoped by caller — NSE session logic verified in nse_calendar suite (200+ assertions) |
| Timezone correctness | ✅ FIXED | TZ-001 corrected; IST contract now deterministic on all hosts |
| Historical/realtime consistency | ⚠️ OPEN | RT-001 (forming candle in live analysis) — documented, not changed |

## Cross-language mathematical parity
`scripts/verify_cross_language_parity.py` → **100% match** — but only for the NSE calendar pair (TS↔Python). **Cost/quorum math has no parity coverage** (TAX-006/QUORUM-001 remain open).

## Environment reproducibility
All numbers above were produced by executing code in this workspace on 2026-11-17 (Node 22.22.3). Harness is deterministic (fixed seeds); anyone can re-run `npm test` for identical output.
