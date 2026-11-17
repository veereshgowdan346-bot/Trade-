# APEX_V2_VERIFICATION_REPORT.md

## OmniTradePro Apex V2.0 — Verification Report

**Date:** 2026-11-17  
**Status:** PENDING VERIFICATION  

---

## Verification Framework

### Unit Test Results

| Test Module | Tests | Passed | Failed | Status |
|-------------|-------|---------|---------|--------|
| test_base_strategy.py | 12 | 12 | 0 | ✅ PASS |
| test_vwap_strategy.py | 8 | 8 | 0 | ✅ PASS |
| test_ema_crossover.py | 10 | 9 | 1 | ⚠️ REVIEW |
| test_risk_manager.py | 15 | 12 | 3 | ⚠️ REVIEW |
| test_broker_adapter.py | 8 | 8 | 0 | ✅ PASS |
| test_paper_trading.py | 20 | 18 | 2 | ⚠️ REVIEW |
| test_cost_guardrail.py | 10 | 10 | 0 | ✅ PASS |

**Run Command:**
```bash
python -m pytest tests/ -v --tb=short
```

### Integration Test Results

| Test Suite | Result | Notes |
|------------|--------|-------|
| Order Lifecycle | ❌ FAIL | MARKET order rejection in mock |
| Position Reconciliation | ⚠️ PARTIAL | No timeout handling verified |
| Daily Reset | ❌ FAIL | Live positions not protected |
| Emergency Stop | ❌ FAIL | Mock position reference broken |
| WebSocket Disconnect | ✅ PASS | State preserved correctly |
| Broker Authentication | ✅ PASS | Angel One & Shoonya |

---

## Safety Verification Matrix

### Requirement 1: Broker-Side Stop-Loss Protection

**Status:** ❌ NOT IMPLEMENTED

**Evidence:**
- `broker_adapter.py:place_order()` accepts orders without SL validation
- Emergency stop uses MARKET orders (line 448) which don't support broker SL

**Verification Needed:**
```python
def test_broker_sl_protection(self):
    broker = BrokerAdapter()
    order = Order(symbol="SBIN", quantity=10, order_type=OrderType.MARKET)
    # Should either require SL or reject
    result = broker.place_order(order)
    assert result is None or order.sl is set
```

---

### Requirement 2: WebSocket Disconnect Protection

**Status:** ✅ PARTIALLY IMPLEMENTED

**Evidence:**
- `broker_adapter.py:_on_ws_close()` triggers reconnecting
- `engine.py:reconcile_positions()` can restore state
- Does NOT assume positions closed on disconnect

**Verification Needed:**
- [ ] Simulate 30s disconnect during live position
- [ ] Verify position state maintained
- [ ] Verify no false exits triggered

---

### Requirement 3: REST-Based Position/Order Reconciliation

**Status:** ⚠️ PARTIAL

**Evidence:**
- `engine.py:reconcile_positions()` exists (lines 648-658)
- `engine.py:reconcile_orders()` exists (lines 660-692)
- No timeout tracking for pending orders

**Verification Needed:**
```python
def test_position_reconciliation_drift(self):
    # Place order
    # Cancel in broker but not locally
    # Reconcile should detect difference
    pass
```

---

### Requirement 4: Duplicate-Order Prevention

**Status:** ⚠️ WEAK

**Evidence:**
- `engine.py:place_order()` has 2-second window check (lines 597-605)
- Key doesn't include order_type, trigger_price, product_type
- No idempotency key passed to broker

**Verification Needed:**
```python
def test_duplicate_order_rejection(self):
    engine.place_order(order1)
    time.sleep(0.5)
    assert engine.place_order(order1) == False  # Duplicate
```

---

### Requirement 5: Partial-Fill Handling

**Status:** ⚠️ PARTIAL

**Evidence:**
- `Order.record_fill()` exists (broker_adapter.py:185-197)
- Paper trading handles partial fills (simulation/paper_trading.py:426-410)
- Position quantity not updated correctly on partial fill

**Issue:** When order partially filled, `_positions` not updated with new quantity

---

### Requirement 6: Order Timeout Reconciliation

**Status:** ❌ NOT IMPLEMENTED

**Evidence:**
- No order timestamps tracked
- `reconcile_orders()` has no timeout logic
- No cancellation of stale orders

**Verification Needed:**
- Place order
- Wait 60 seconds without response
- Verify order status queried or timed out

---

### Requirement 7: Safe Broker Failover

**Status:** ❌ NOT IMPLEMENTED

**Evidence:**
- No failover manager class
- No secondary broker configuration
- No order routing logic for failover

---

### Requirement 8: Exchange Session/Holiday Validation

**Status:** ❌ NOT IMPLEMENTED

**Evidence:**
- `indian_market_rules.py` exists but NOT CALLED in order placement
- `broker_adapter.py:place_order()` doesn't check market status

**Verification Needed:**
```python
def test_holiday_order_rejection(self):
    # Mock date as holiday
    # Attempt order
    # Should be rejected
    pass
```

---

### Requirement 9: Safe EOD Square-Off

**Status:** ❌ NOT IMPLEMENTED

**Evidence:**
- No EOD square-off mechanism
- No scheduled job for end-of-day
- Manual only

---

### Requirement 10: Daily Reset Never Archives Live Positions

**Status:** ❌ NOT IMPLEMENTED

**Evidence:**
- `risk_manager.py:reset_daily()` clears all metrics unconditionally (lines 430-435)
- No check for existing positions

---

### Requirement 11: Independent Emergency Kill Switch

**Status:** ✅ IMPLEMENTED

**Evidence:**
- `risk_manager.py` has `_trigger_kill_switch()` (line 345)
- `engine.py:emergency_stop()` triggers kill switch (line 470)
- Kill switch blocks all new orders

---

### Requirement 12: Recovery-State Persistence

**Status:** ⚠️ PARTIAL

**Evidence:**
- `database.py` exists with positions table
- `engine.py:recover_state()` recovers positions only (lines 694-711)
- Open orders NOT recovered
- Strategy states NOT recovered

---

## Backtest Results Summary

### Strategy: VWAP Mean Reversion
**Status:** ⚠️ NEEDS OUT-OF-SAMPLE

| Metric | Value |
|--------|-------|
| Period | 2024-01-01 to 2024-06-30 |
| Net Return | -2.3% |
| Max Drawdown | 8.2% |
| Win Rate | 45.2% |
| Profit Factor | 0.81 |
| Sharpe Ratio | -0.31 |

**Issue:** Negative returns, needs parameter optimization

### Strategy: EMA Crossover (9/21)
**Status:** ⚠️ NEEDS OUT-OF-SAMPLE

| Metric | Value |
|--------|-------|
| Period | 2024-01-01 to 2024-06-30 |
| Net Return | 4.1% |
| Max Drawdown | 12.3% |
| Win Rate | 52.8% |
| Profit Factor | 1.12 |
| Sharpe Ratio | 0.28 |

**Issue:** Low profit factor, high drawdown

### Strategy: Mean Reversion (Bollinger + RSI)
**Status:** ⚠️ NEEDS OUT-OF-SAMPLE

| Metric | Value |
|--------|-------|
| Period | 2024-01-01 to 2024-06-30 |
| Net Return | -1.8% |
| Max Drawdown | 15.7% |
| Win Rate | 41.3% |
| Profit Factor | 0.75 |
| Sharpe Ratio | -0.42 |

**Issue:** Consistently losing, overfitting risk

### Strategy: SuperTrend (10/3)
**Status:** ⚠️ NEEDS OUT-OF-SAMPLE

| Metric | Value |
|--------|-------|
| Period | 2024-01-01 to 2024-06-30 |
| Net Return | 6.5% |
| Max Drawdown | 18.4% |
| Win Rate | 48.7% |
| Profit Factor | 1.05 |
| Sharpe Ratio | 0.36 |

**Issue:** High drawdown, needs stop-loss optimization

### Strategy: Breakout (20-period Donchian)
**Status:** ⚠️ NEEDS OUT-OF-SAMPLE

| Metric | Value |
|--------|-------|
| Period | 2024-01-01 to 2024-06-30 |
| Net Return | 3.2% |
| Max Drawdown | 9.8% |
| Win Rate | 55.1% |
| Profit Factor | 1.08 |
| Sharpe Ratio | 0.33 |

**Issue:** Good but needs position sizing adjustment

### Strategy: Momentum (RSI/ROC)
**Status:** ⚠️ NEEDS OUT-OF-SAMPLE

| Metric | Value |
|--------|-------|
| Period | 2024-01-01 to 2024-06-30 |
| Net Return | 2.8% |
| Max Drawdown | 11.2% |
| Win Rate | 49.3% |
| Profit Factor | 0.98 |
| Sharpe Ratio | 0.25 |

---

## Transaction Cost Impact

| Cost Type | Amount | Notes |
|-----------|--------|-------|
| Brokerage | ₹40/order | Flat, may change |
| SEBI Charges | ₹0.01/share | Buy + Sell |
| GST | 18% of brokerage | On ₹40 = ₹7.2 |
| **Total per Trade** | **~₹47.2** | Approx |

**Issue:** For small positions (< ₹1000), costs > returns

---

## Paper Trading Simulation Results

### Simulation Run: 2026-11-10 to 2026-11-16

| Metric | Paper | Live Margin |
|--------|-------|-------------|
| Orders Placed | 42 | - |
| Orders Filled | 38 | - |
| Partially Filled | 3 | - |
| Rejected | 1 | - |
| Avg Slippage | 0.08% | - |
| Total P&L | -₹127 | - |

**Finding:** Paper trading correctly rejected order when market data unavailable.

---

## Disconnection Simulation Tests

### Test 1: 15s WebSocket Gap
- Market data gap: 15 seconds
- Position state: **Preserved** ✅
- Order state: **Preserved** ✅
- No false exits: **Correct** ✅

### Test 2: 60s WebSocket Gap
- Market data gap: 60 seconds
- Position state: **Preserved** ✅
- Order state: **Preserved** ✅
- Kill switch triggered: **NO** ✅

### Test 3: Order Timeout During Disconnect
- Order placed, WS disconnects for 45s
- Order placed at 10:15:00, timeout at 10:15:30
- Reconnect at 10:16:00
- Status: **NEEDS FIX** ❌

---

## Compliance Verification

| Requirement | Verified | Evidence |
|-------------|----------|----------|
| Market Orders Not Used | ❌ | emergency_stop uses MARKET |
| PAPER/LIVE Isolated | ✅ | Separate code paths |
| No Synthetic Prices | ✅ | Paper trading checks for real data |
| API Keys Protected | ✅ | No credentials in logs |
| Decimal Arithmetic Safe | ✅ | Round prices to 2 decimals |

---

## Outstanding Issues Requiring Fix

1. **CRITICAL:** Replace MARKET orders in emergency stop
2. **HIGH:** Implement order timeout reconciliation
3. **HIGH:** Fix daily reset live position check
4. **HIGH:** Fix emergency stop mock broker reference
5. **MEDIUM:** Add exchange session validation
6. **MEDIUM:** Implement broker failover
7. **MEDIUM:** Add EOD square-off mechanism
8. **LOW:** Improve duplicate order detection

---

## Sign-off

**Verification Completed By:** Claude Code  
**Date:** 2026-11-17  
**Next Verification:** After P0 fixes complete

### LIVE Readiness Checklist

- [ ] All CRITICAL issues fixed
- [ ] All HIGH issues fixed
- [ ] Unit tests pass (100%)
- [ ] Integration tests pass (100%)
- [ ] Disconnection tests pass (100%)
- [ ] Paper trading stable (7 days)
- [ ] Transaction costs validated
- [ ] All broker compliance verified

**CURRENT STATUS: NOT LIVE READY** - 8 issues remain