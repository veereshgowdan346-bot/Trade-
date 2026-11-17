# OMNITRADEPRO ARCHITECTURE REPORT

(Consolidated view — detailed maps and inventory in `OMNITRADEPRO_01_BASELINE_AND_ARCHITECTURE.md`.)

## System Shape
Two independent stacks sharing one repository:
1. **Production stack (TypeScript/Next.js 16):** UI → 22 API routes → `engine.ts` order pipeline → strategy/indicator/intelligence/risk/tax modules → 3-broker failover gateway → **simulation boundary** (`dispatchOrder` PAPER ack) → data-only broker REST/WS. Persistence: drizzle/PGlite (orders, positions, settings, audit). Feed: Angel One SmartWebSocketV2 ticks → 1-minute candles → 260-bar rolling buffers.
2. **Parallel Python stack:** PySide6 event-driven `TradingEngine` → `BrokerAdapter` (live order placement permanently rejected) / `MockBrokerAdapter` → `RiskManager` + `CostGuardrail` → `PaperTrading` simulator → `decision_engine` (2-skill consensus) + 6 strategies → TOTP/MPIN auth. Fully decoupled from the TS stack (0 cross-imports).

## Component health (verified)
| Component | State | Notes |
|-----------|-------|-------|
| Trading engine | Healthy | 4-layer LIVE interlock; claim-based state machine; TSL/circuit/recovery verified |
| Strategy engine | Healthy w/ caveats | 5 voters + GBM; plugin gap STR-001; dead chop path WAVE-001 |
| Indicator engine | Healthy | verified vs independent references; validation added (MATH-001) |
| Market intelligence | Healthy w/ caveats | WAVE-002 self-inclusion; RT-001 forming-candle |
| Risk engine | Healthy | invariants sweep-verified; MICRO-001 design flag |
| Tax engine | **Weak link** | arithmetic OK; rates UNVERIFIED; delivery missing; floors fabricated (TAX-001/002/003/004) |
| Broker abstraction | Healthy | failover with backoff/timeout; simulateDrop drills; no live order path |
| Database | Healthy | migrations + rollback present; reconciliation suites pass |
| Market data pipeline | **Fixed** | TZ-001 corrected; forming-candle disclosure (RT-001) |
| Simulation engine | Healthy | boundary proven; Python partial fills |
| Logging/audit | Healthy | sanitizer prevents secret leakage |
| Security boundary | Desktop-grade | SEC-001 blocks networked use |
| Testing infra | Strong | 554+ assertions across 3 harnesses; harness exit-code weakness noted |

## Architecture findings
- **ARCH-001 (HIGH):** duplicated divergent financial logic across stacks (TAX-006, QUORUM-001). Single-source-of-truth or parity-enforcement required.
- **ARCH-002 (MEDIUM):** PySide6 imported at core module scope (GUI coupled to engine; headless installs need GUI packages).
- **Missing connections:** plugins don't vote; Python decision engine not integrated; `runBacktest` not wired to walk-forward helpers; no CDS/DP rate branches.
- **Duplicated implementations:** NSE calendar (TS↔Python, parity-tested ✓), cost model (no parity ✗), risk manager (no parity ✗), paper trading (no parity ✗), strategies (EMA/ST/Donchian/MR in both languages, different params).

## Technology baseline
Node 22 / TS 5.9 strict / Next 16.2.6 / React 19 / drizzle 0.45 / PGlite; Python 3.11 + websockets/cryptography/pyotp/PySide6. Build + typecheck clean. Target deployment: local Windows desktop (`run.bat`/`run.ps1`).
