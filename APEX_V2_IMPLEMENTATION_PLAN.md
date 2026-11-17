# APEX_V2_IMPLEMENTATION_PLAN.md

## OmniTradePro Apex V2.0 — Implementation Plan

**Date:** 2026-11-17  
**Status:** PENDING IMPLEMENTATION  
**Mode:** Paper Trading First, then Live  

---

## Phase 1: Critical Safety Repairs (P0)

### Task 1.1: Fix CNC Stop Loss Calculation
**File:** `risk/risk_manager.py`  
**Lines:** 290-299  

**Changes:**
```python
def _calculate_max_risk_cnc(self, order: Order, market_price: float) -> float:
    position_value = order.price * order.quantity if order.price else market_price * order.quantity
    stop_loss = market_price * (1 - self.stop_loss_pct / 100)
    risk_per_share = market_price - stop_loss
    return risk_per_share * order.quantity
```

**Test:** Unit test with ₹100 price, 10 qty, 2% stop loss

---

### Task 1.2: Replace MARKET Orders with SL-M Type
**File:** `core/broker_adapter.py`  
**Lines:** 729-740  

**Changes:**
- Add validation to check if MARKET orders are supported
- Implement fallback to LIMIT with buffer for Angel One
- Add `is_market_order_supported()` method

**Test:** Integration test with Angel One API, verify order type validation

---

### Task 1.3: Implement Order Timeout Reconciliation
**File:** `core/engine.py`  
**New Fields:**
```python
self._order_timestamps: Dict[str, float] = {}
self._order_timeout = 30.0  # seconds
self._pending_orders: Dict[str, Order] = {}
```

**Changes:**
- Track order submission timestamps
- Add timeout check in `reconcile_orders()`
- Cancel stale orders or mark for review

**Test:** Place order, simulate 35s delay, verify timeout handling

---

### Task 1.4: Fix Daily Reset Live Position Protection
**File:** `risk/risk_manager.py`  
**Lines:** 430-435  

**Changes:**
```python
def reset_daily(self) -> None:
    if self._positions:
        self.logger.warning("Daily reset: Cannot reset with unresolved live positions")
        return
    self._daily_pnl = 0.0
    self._daily_trades = 0
    self._daily_loss_exceeded = False
    self.logger.info("Daily risk metrics reset")
```

**Test:** Day reset with live position should be blocked

---

### Task 1.5: Fix Emergency Stop Mock Broker Reference
**File:** `core/engine.py`  
**Line:** 430  

**Changes:**
```python
if not positions and hasattr(self.broker, "_mock_positions"):
    positions = list(getattr(self.broker, "_mock_positions", []))
```

**Test:** Emergency stop with MockBrokerAdapter squares off all positions

---

## Phase 2: Broker Reconciliation & Failover (P1)

### Task 2.1: Implement REST-Based Position Reconciliation
**File:** `core/engine.py`  
**Method:** `reconcile_positions()`

**Changes:**
```python
def reconcile_positions(self) -> Dict[str, dict]:
    with self._lock:
        broker_positions = self.broker.get_positions()
        # Cross-check with stored positions
        self._positions = {p.symbol: p.to_dict() for p in broker_positions}
        return self._positions
```

**Schedule:** Every 30 seconds in running mode

**Test:** Simulate position drift, verify reconciliation corrects

---

### Task 2.2: Add Broker Failover Logic
**File:** `core/engine.py` (new class: BrokerFailoverManager)

**Implementation:**
```python
class BrokerFailoverManager:
    def __init__(self, brokers: Dict[str, BrokerAdapter]):
        self.brokers = brokers
        self.primary = None
        self.standby = None
    
    def select_available_broker(self) -> Optional[BrokerAdapter]:
        # Round-robin selection based on health
        for broker in [self.primary, self.standby]:
            if broker and broker.is_connected():
                return broker
        return None
    
    def sync_positions(self, source: BrokerAdapter):
        # Sync positions across brokers
```

**Test:** Primary broker fails, orders route to standby

---

### Task 2.3: Add Exchange Session/Holiday Check
**File:** `core/broker_adapter.py`  
**Method:** `place_order()`

**Changes:**
```python
from core.indian_market_rules import is_market_open_ist, is_trading_holiday

def place_order(self, order: Order) -> Optional[str]:
    if not is_market_open_ist():
        order.mark_rejected("Market closed")
        return None
    if is_trading_holiday():
        order.mark_rejected("Market holiday")
        return None
    # ... existing logic
```

**Test:** Weekend/holiday order placement should fail

---

## Phase 3: EOD Square-Off (P1)

### Task 3.1: Implement Scheduled EOD Square-Off
**File:** `core/engine.py`  
**New Method:** `schedule_eod_squareoff()`

**Implementation:**
```python
from apscheduler.schedulers.background import BackgroundScheduler

def schedule_eod_squareoff(self):
    scheduler = BackgroundScheduler()
    scheduler.add_job(
        self._execute_eod_squareoff,
        'cron',
        hour=15, minute=10,  # Before broker's 15:15 auto-close
        id='eod_squareoff'
    )
    scheduler.start()

def _execute_eod_squareoff(self):
    if self.is_paper_trading and self.paper_trading:
        return self.paper_trading.square_off_all()
    return self.broker.square_off_all()  # Implement on broker adapter
```

**Test:** Run automated test at EOD time, verify positions closed

---

## Phase 4: Enhanced Position Management (P2)

### Task 4.1: Implement Partial-Fill Handling
**File:** `core/broker_adapter.py`  
**Enhance:** `Order.record_fill()` and `place_order()`

**Changes:**
- Track fill events and update position quantities
- Fire events on partial fill
- Update order status correctly

---

### Task 4.2: Add Recovery State Persistence
**File:** `core/database.py`  
**New Tables:**
```sql
CREATE TABLE IF NOT EXISTS order_timeouts (
    order_id TEXT PRIMARY KEY,
    submitted_at REAL NOT NULL,
    timeout_at REAL NOT NULL,
    status TEXT DEFAULT 'PENDING'
);

CREATE TABLE IF NOT EXISTS broker_health (
    broker TEXT PRIMARY KEY,
    last_check REAL,
    status TEXT,
    error_message TEXT
);
```

**Test:** Restart with pending orders, verify recovery

---

### Task 4.3: Improve Duplicate Order Prevention
**File:** `core/engine.py`  
**Lines:** 597-605

**Changes:**
- Expand key to include order_type, product_type, trigger_price
- Increase time window to 5 seconds
- Add idempotency key support for broker API

---

## Phase 5: Risk Management Enhancements (P2)

### Task 5.1: Fix Risk Calculation (1% of Capital)
**File:** `risk/risk_manager.py`

**Changes:**
```python
def _calculate_max_risk_intraday(self, order: Order, market_price: float) -> float:
    position_value = market_price * order.quantity
    position_risk = position_value * (self.stop_loss_pct / 100)
    # 1% risk rule - position risk should not exceed 1% of capital
    max_allowed_risk = self._capital_base * 0.01
    return min(position_risk, max_allowed_risk)
```

---

### Task 5.2: Add Historical Fee Schedule Support
**File:** `risk/cost_guardrail.py`

**Changes:**
- Add effective dates to brokerage rates
- Add method to lookup fee for given date
- Support gradual rate changes

---

## Git Checkpoints

Each task will be committed with message:
```
fix(safety): <brief description>

Co-Authored-By: Claude Code <noreply@anthropic.com>
```

Checkpoint branches:
- `checkpoint/phase-1-safety` after Phase 1
- `checkpoint/phase-2-fault-tolerance` after Phase 2
- `checkpoint/phase-3-eod` after Phase 3

---

## Verification Matrix

| Task | Unit Test | Integration Test | Paper Test | Live Test |
|------|-----------|------------------|------------|-----------|
| 1.1 | ✓ | ✓ | ✓ | N/A |
| 1.2 | ✓ | ✓ | ✓ | N/A |
| 1.3 | ✓ | ✓ | ✓ | N/A |
| 1.4 | ✓ | ✓ | ✓ | N/A |
| 1.5 | ✓ | ✓ | ✓ | N/A |
| 2.1 | ✓ | ✓ | ✓ | N/A |
| 2.2 | ✓ | ✓ | ✓ | N/A |
| 2.3 | ✓ | ✓ | ✓ | N/A |
| 3.1 | ✓ | ✓ | ✓ | N/A |
| 4.1 | ✓ | ✓ | ✓ | N/A |
| 4.2 | ✓ | ✓ | ✓ | N/A |
| 4.3 | ✓ | ✓ | ✓ | N/A |
| 5.1 | ✓ | ✓ | ✓ | N/A |
| 5.2 | ✓ | ✓ | ✓ | N/A |

---

## Post-Implementation Verification

After all implementations:

1. Run full test suite: `python -m pytest tests/ -v`
2. Run paper trading simulation for 1 full trading day
3. Verify no position drift during simulated disconnect
4. Test all edge cases:
   - Weekend/holiday order attempts
   - Multiple broker failover
   - Emergency stop with live positions
   - Daily reset with live positions
   - Order timeout handling

---

## Ready for LIVE Mode

Only after ALL:
- [ ] All unit tests pass
- [ ] All integration tests pass  
- [ ] Paper trading runs without errors for 1 week
- [ ] Disconnection simulations handled correctly
- [ ] All 12 critical safety requirements verified

then enable `LIVE` mode toggle.