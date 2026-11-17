# OMNITRADEPRO_11 — PAPER TRADING SYSTEM VERIFICATION

**Modules:** TS: `engine.ts` paper pipeline + `brokers.ts#dispatchOrder` simulation boundary; Python: `simulation/paper_trading.py` (910 LOC).  
**Verdict: PASSED (with documented simplifications).** The isolation requirement ("broker operations must terminate at the simulation boundary") is enforced by four independent interlocks.

## 1. Isolation Proof — no real orders can leave the system

| Layer | Mechanism | Evidence |
|-------|-----------|----------|
| UI | LIVE toggle removed (UI-001); flash/paper flows only | build + code |
| API | `/api/orders` rejects LIVE payloads (403) | code + pytest (`test_environment_variables_cannot_override_live_kill_switch` ×5 env vars) |
| Engine | `placeOrder` step 0 rejects LIVE under every config incl. `process.env.TRADING_MODE` | code + suite |
| Gateway | `routeOrder` refuses `tradingMode === "LIVE"` | code |
| Broker | `dispatchOrder`: PAPER builds the exact broker payload but **acknowledges locally** (`PAPER-<BROKER>-<ts>` id, `mode: "PAPER"`); no HTTP order call exists for any mode | code (brokers.ts 405–460) |
| Python | `BrokerAdapter.place_order` → permanent reject + `order.mark_rejected`; `MockBrokerAdapter` simulates with `MOCK_*` ids | pytest phase1/71 |

`cancelOrder` LIVE path exists but is unreachable for new orders (legacy-only; live cancels route through `cancelBrokerOrder` only if a `brokerOrderId` exists — none can be created). Failover drill `simulateDrop` throws simulated network errors without external calls ✓.

## 2. Feature checklist (§11)

| Requirement | TS engine | Python PaperTrading | Status |
|-------------|-----------|---------------------|--------|
| Simulated broker | ✅ dispatchOrder local ack | ✅ MockBrokerAdapter | ✅ |
| Virtual capital | ✅ cfg.capital + deployed tracking | ✅ `set_capital/get_equity/get_used_margin` | ✅ |
| Virtual positions | ✅ positions table (mode PAPER) | ✅ Position class + unrealized/realized | ✅ |
| Virtual orders | ✅ orders table (OPEN/FILLING/FILLED/REJECTED_*/CANCELLED) | ✅ OrderStatus enum lifecycle | ✅ |
| Simulated fills | ✅ market fills at genuine live LTP | ✅ `_calculate_fill` | ✅ |
| Partial fills | ❌ whole-qty only | ✅ `simulate_partial_fill` + partial accounting | ⚠️ split verdict |
| Rejected orders | ✅ coded rejects recorded | ✅ `get_rejected_orders` | ✅ |
| Cancelled orders | ✅ `cancelOrder` | ✅ `cancel_order/cancel_all` | ✅ |
| Simulated slippage | ✅ 8bps/8bps two-sided in charges | ✅ `_calculate_slippage` | ✅ |
| Brokerage simulation | ✅ full statutory model | ⚠️ flat model divergence (TAX-006) | ⚠️ |
| Tax simulation | ✅ STT/exch/SEBI/stamp/GST | ⚠️ GST+SEBI only | ⚠️ |
| Stop-loss monitoring | ✅ tick + candle brackets, TSL | ✅ `should_exit_position` + RiskManager | ✅ |
| Target monitoring | ✅ net-positive gated | ✅ | ✅ |
| Realized / unrealized P&L | ✅ `dailyPnl` PAPER split | ✅ `get_pnl` | ✅ |
| Trade history | ✅ today-scoped (daily wipe) | ✅ `get_trade_history` | ✅ |
| Daily reports | ✅ `getState` + audit log | ⚠️ history queries only | ⚠️ |
| Restart recovery | ✅ `enforceDailyReset` + `reconcileClosingPositions` (LIVE rows preserved, PAPER reverted) | ✅ `recover_state` | ✅ |

## 3. E2E paper flow exercised (this audit)
Flash Test order path (`FLASH_TEST`) → live-tick gate → simulated fill @ real LTP → bracket tracking → close with charges → audit entry: verified end-to-end in code review + suite tests (order lifecycle, restart recovery, reconciliation suites PASS). The 10-step §12 workflow is supported (see UI report).

## 4. Findings
- TS paper engine fills LIMIT orders at the crossing tick (price improvement on gaps) — ORD-003 family; acceptable disclosure.
- Python and TS paper engines are separate implementations with different fee fidelity (TAX-006) — P&L from one is not comparable to the other.
- Paper fills never exercise real broker latency (local ack) — latency figures (`latencyMs`) measure routing logic only; do not interpret as execution latency.

## 5. Verdict
**PAPER TRADING VERIFIED** as a closed simulation with genuine market data input (WS ticks) and genuine cost accounting (TS stack). No execution pathway can send real orders.
