# OMNITRADEPRO RECOMMENDED UPGRADES

Ranked by (safety value ÷ effort). Category labels per §16. None of these were auto-implemented where Category C applies.

## P0 — before any further financial validation
1. **Ingest official statutory/tax source documents** and verify the rate register (unblocks Gate 7; enables TAX-001/002/004/005 fixes). [Category C]
2. **Ingest GENUINE_HISTORICAL datasets** (provenance-checked) and run walk-forward train/val/OOS with the corrected execution model. [Research]
3. **Decide MICRO-001** (−₹50 micro-capital hurdle): remove or bound it. [Category C]

## P1 — safety & correctness
4. TAX-001: delivery rate table + DP charges; explicit "unsupported segment" rejection for CDS. [Category C — after sources]
5. Replace the fabricated `calculateNetPnL` fallback breakdown (TAX-002) with derived or absent values. [Category C]
6. Single hurdle-constant module (TAX-005); resolve Angel/Groww flat-vs-per-leg (TAX-004). [Category C]
7. API authentication + CSRF + rate limiting + webhook HMAC/replay/idempotency (SEC-001). [Category A/B]
8. RT-001: evaluate live consensus on closed candles only (aligns live with validated backtest semantics). [Category C — changes timing]
9. WAVE-001 product decision: pause-all-in-chop vs mean-reversion-in-chop. [Category C]

## P2 — architecture & quality
10. ARCH-001: collapse or fence the Python stack; add cost/quorum parity tests (only calendar parity exists today).
11. ARCH-002: decouple PySide6 from `core/broker_adapter.py` behind an interface.
12. BT-003: wire session close-out, exchange holidays, and walk-forward helpers into `runBacktest`.
13. BT-004: replace trade-based Sharpe/Sortino with trade-based, non-annualized or properly annualized metrics.
14. Add the missing Declarative RSI plugin JSON or retire it from the inventory (STR-001).
15. Partial-fill modeling in the TS paper engine (parity with Python).
16. Quorum rounding: use floor() not round() for the 75% boundary (tighter safety).

## P3 — UX & process
17. Playwright E2E for the 10-step paper workflow + duplicate-click/reload tests.
18. Surface the minimum-capital matrix and MICRO-001 warning in the capital input UI.
19. aria-labels for icon controls.
20. Make the JS harness exit non-zero on failures (it currently always exits 0); route CI at it.
21. `npm audit`/`pip-audit` in CI when network policy allows.
22. Extend `verify_cross_language_parity.py` to cost + quorum math.
