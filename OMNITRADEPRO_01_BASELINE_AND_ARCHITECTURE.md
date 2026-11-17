# OMNITRADEPRO_01 — BASELINE AND ARCHITECTURE

**Audit date:** 2026-11-17 · **Branch:** `arena/16f5d371-trade` (branched from `master` @ `1741aeb3b4077c76fbeb72e1727d378c4a9843d7`)  
**Status:** COMPLETE

---

## 1. Git Verification (Baseline Report)

| Item | Value |
|------|-------|
| Current branch | `arena/16f5d371-trade` |
| HEAD commit (branch point) | `1741aeb` — "docs: complete master strategy, risk & architecture manual (20+ strategies, 9-gate pipeline, 200/800 rule)" |
| Prior commits | **1** total (single-commit repository history) |
| Working tree at baseline | clean, nothing to commit, no staged/unstaged/untracked files |
| Remote | `origin` → https://github.com/veereshgowdan346-bot/Trade-.git (fetch/push) |
| Branches | `master` (local), `arena/16f5d371-trade` (session branch), `origin/master`, `origin/HEAD` |
| Tags | none |
| Previously reported commit identifiers | none claimed by prior documentation could be verified beyond `1741aeb` (single-commit history). Historical incident commits `54972eb1`, `5e496c7d`, `1f6fbc58` referenced in tests are **absent** (verified expunged by `test_old_commits_unreachable_and_expunged`, PASS). |

User modifications: none present at baseline; none discarded.

## 2. Repository Inventory

- **316 tracked files.** By type: 124 Markdown, 74 Python, 52 TypeScript, 24 JSON, 15 JS, 9 TSX, 5 MJS, 4 CSV, 3 SQL, plus configs.
- **~49,200 LOC** of executable code (TS + Python + JS test harness).
- Documentation-heavy: 124 historical phase/report MD files (Phase 1–7.4 series) describing prior work. **Per the audit mandate, none of their claims were trusted; every functional claim below was re-verified against source and executed tests.**

### Directory map

| Area | Path(s) | Role |
|------|---------|------|
| Frontend | `src/app/`, `src/components/` (Cockpit, Chart, PagesA/B/C, TradeCalendarPage, ui.tsx) | Next.js 16 App Router UI |
| API | `src/app/api/*` (22 dynamic routes: orders, positions, engine, market, state, strategies, stream (SSE), vault, webhook, eod, health, watch, config, brokers, token-master, trades/calendar) | REST + SSE surface |
| Trading engine | `src/lib/engine.ts` (1,508 LOC) | Order pipeline, brackets, TSL, circuit/recovery, daily reset |
| Strategy engine | `src/lib/strategies.ts` (454), `src/lib/strategies_extended.ts` (577), `strategies/*.json` | Quorum voters, GBM gate, plugins, research strategies |
| Indicator engine | `src/lib/indicators.ts` | EMA/RMA/ATR/ADX/RSI/BB/VWAP/SuperTrend |
| Market intelligence | `src/lib/intelligence.ts` | Regime classifier (ADX/DI/ATR-ratio/BB-width) |
| Risk engine | `src/lib/risk.ts` | 1% risk rule, 20% exposure cap, sizing, circuit thresholds, LIVE interlock |
| Tax engine | `src/lib/tax.ts` | Brokerage + statutory charges + slippage + net P&L |
| Broker abstraction | `src/lib/brokers.ts`, `gateway.ts`, `sessions.ts`, `angelWs.ts`, `instruments.ts`, `tokenMaster.ts`, `vault.ts`, `totp.ts` | 3-broker failover (Shoonya/Angel/Groww), WS feed, credential vault |
| Market data | `angelWs.ts` (SmartWebSocketV2 ticks → 1m candles), historical REST warmup, `csv_ingestion.ts`, `data_sanitizer.ts` | Live + historical pipeline |
| Backtest/research | `backtest_engine.ts`, `historical_research.ts`, `advanced_research.ts`, `leakage_audit.ts` | Offline research |
| Database | `src/db/schema.ts`, `drizzle/` (PGlite/Postgres via drizzle-orm) | orders, positions, settings, audit |
| NSE calendar | `src/lib/nse_calendar.ts` (4,007 LOC) + `core/nse_calendar.py` (4,279 LOC) | Session/holiday/CAS-schedule compliance (cross-language pair) |
| Python stack | `core/`, `risk/`, `simulation/`, `strategies/`, `auth/`, `config/` | **Parallel** trading engine (PySide6 event loop, BrokerAdapter, PaperTrading, RiskManager, 6 strategies, TOTP/MPIN auth) |
| Testing | `scripts/run_comprehensive_tests.js` (3,476 LOC), `scripts/independent_math_verification.js` (new), `tests/test_phase*.py` (26 files), fixture CSVs in `data/fixtures/` | JS harness + pytest suites |
| Scripts | `scripts/*.js|py` (phase audit/reconciliation tooling, secret scanner, parity verifier) | Evidence tooling |
| Launch | `run.bat` / `run.ps1` | Windows launcher (PowerShell → Next.js) |

## 3. Architecture Map

```
┌────────────────────────── UI (Next.js/React 19, Tailwind) ──────────────────────────┐
│ Cockpit · Dashboard · LiveTrading(PAPER) · Risk · Strategies · MarketIntel · Logs   │
└───────────────┬─────────────────────────────────────────────────────────────────────┘
                │ REST + SSE (22 routes) — NO AUTH (SEC-001, local-desktop assumption)
┌───────────────▼─────────────────────────────────────────────────────────────────────┐
│ ENGINE (src/lib/engine.ts)                                                          │
│  placeOrder → LIVE interlock → feed gate → circuit → sessions → duplicate cap →      │
│  consensus(quorum 75% + GBM 65% + WaveGate) → recovery filter(90/85) →              │
│  preFlightCheck(hurdle) → sizePosition(1% risk, 20% cap, 3R target) →               │
│  net-yield hurdle → routeOrder                                                      │
└──┬──────────────┬───────────────────┬──────────────────────┬────────────────────────┘
   │              │                   │                      │
┌──▼───────┐ ┌────▼────────┐ ┌────────▼─────────┐ ┌──────────▼──────────┐
│strategies│ │ indicators  │ │ intelligence     │ │ risk.ts · tax.ts    │
│ 5 voters │ │ EMA/RSI/ATR │ │ ADX/DI/ATR/BB    │ │ sizing + statutory  │
│ + GBM    │ │ BB/VWAP/ST  │ │ regime + gates   │ │ cost model (UNVER.) │
│ + plugins│ └─────────────┘ └──────────────────┘ └─────────────────────┘
└──┬───────┘
┌──▼─────────────────────────────────────────────────────────────────────────────────┐
│ GATEWAY (3-broker failover) ──► brokers.dispatchOrder                                │
│   PAPER: simulated ack (PAPER-XXX id) — SIMULATION BOUNDARY (no HTTP order calls)   │
│   LIVE: HARD-BLOCKED (routeOrder + dispatchOrder + placeOrder interlocks)           │
└──┬─────────────────────────────────────────────────────────────────────────────────┘
   │ data only (funds/status/quotes/WS ticks)
┌──▼──────────────────┐   ┌─────────────────────────────────────────────┐
│ angelWs (SmartWS v2)│   │ DB (drizzle/PGlite): orders·positions·settings·audit │
│ ticks→1m candles    │   └─────────────────────────────────────────────┘
└─────────────────────┘

══════════════════════ PARALLEL PYTHON STACK (NOT imported by TS) ════════════════════
core/engine.py (TradingEngine, PySide6 QThread/Signal) → core/broker_adapter.py
  (place_order PERMANENTLY REJECTS live; MockBrokerAdapter simulates)
  → risk/risk_manager.py + risk/cost_guardrail.py (DIVERGENT cost model — TAX-006)
  → simulation/paper_trading.py (fills, partials, slippage, recovery)
  → strategies/decision_engine.py (2-skill consensus — QUORUM-001) + 6 strategy skills
  → auth/ (TOTP, MPIN, sessions) · core/nse_calendar.py (TS parity verified)
```

### Missing connections / duplication found
1. **ARCH-001 (HIGH):** Two full trading stacks (TS and Python) with **duplicated, divergent** financial logic (tax, quorum, risk). No cross-language parity tests exist for cost/quorum (parity script covers only the NSE calendar pair).
2. **ARCH-002 (MEDIUM):** `core/broker_adapter.py` imports PySide6 at module scope — GUI toolkit hard-wired into the core engine; test collection requires a GUI package.
3. `strategies/decision_engine.py` is not connected to the TS consensus; plugin JSON strategies do not vote in the TS quorum (informational only).
4. Documented plugin **#11 "Declarative RSI Plugin" has no JSON instance file** (engine supports the `rsi_reversion` type) — STR-001.

## 4. Environment Baseline

- Node v22.22.3, npm 10.9.8, TypeScript 5.9.3, Next.js 16.2.6, React 19.2.6, drizzle-orm 0.45.2, PGlite 0.5.x.
- Python 3.11.2; test deps installed this session: pytest 9.2.0, websockets 17.4, cryptography 50.0.2, pyotp 2.12.0, requests 2.34.2, PySide6 6.12.0 (headless, required by ARCH-002).
- `npm install` clean (registry). `npm run build` → PASS. `npm run typecheck` → PASS.

## 5. Baseline Integrity Statement

- No user modifications existed to preserve; none were discarded.
- All changes made by this audit are enumerated in `OMNITRADEPRO_MASTER_AUDIT_REPORT.md` §Change Log and are visible in the working tree.
- No commits were pushed (per mandate); no deployment performed; live execution remains disabled at every layer.
