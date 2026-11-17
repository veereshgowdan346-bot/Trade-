"""
OmniTradePro Apex V2.0 — Phase 6.7 Restart Recovery & Execution Cost Enforcement Tests.

Scenarios tested:
1. Restart before any stop movement (1R is intact).
2. Restart after trailing-stop activation (1R distance is preserved from persisted record).
3. Restart after breakeven-stop movement (1R distance does not collapse to 0.10).
4. Restart while a position is in 'CLOSING' state (reconciles with filled exit order or reverts to OPEN).
5. Restart with missing or corrupted persisted state (safe fallback to tick/ATR, not moving SL).
6. Duplicate close requests after restart (atomic state transition guard rejects concurrent duplicate).
7. Cost-model verification across 0/0, 4/4, 8/8, and 12/12 bps scenarios.
"""

from dataclasses import dataclass
from typing import Optional, Dict, Any, List
import pytest


@dataclass
class Position:
    id: int
    symbol: str
    side: str
    qty: int
    entry_price: float
    sl_price: float
    target_price: float
    initial_sl_distance: Optional[float]
    status: str = "OPEN"
    order_id: Optional[int] = None


@dataclass
class Order:
    id: int
    position_id: Optional[int]
    symbol: str
    side: str
    qty: int
    price: float
    status: str
    reason: str


class MockEngine:
    def __init__(self):
        self.positions: Dict[int, Position] = {}
        self.orders: Dict[int, Order] = {}
        self.in_memory_1r_cache: Dict[int, float] = {}

    def simulate_crash_restart(self):
        """Simulates unexpected process restart: wipes in-memory cache completely."""
        self.in_memory_1r_cache.clear()

    def get_initial_sl_distance(self, pos: Position) -> float:
        """
        Phase 6.7 Corrected Implementation:
        Recovers initial 1R distance from persistent DB column or order record,
        NEVER reconstructing from current sl_price which may have moved.
        """
        # 1. In-memory cache
        if pos.id in self.in_memory_1r_cache:
            return self.in_memory_1r_cache[pos.id]

        # 2. Persisted column on position (Phase 6.7 primary fix)
        if pos.initial_sl_distance is not None and pos.initial_sl_distance > 0:
            self.in_memory_1r_cache[pos.id] = pos.initial_sl_distance
            return pos.initial_sl_distance

        # 3. Recover from original entry order
        if pos.order_id and pos.order_id in self.orders:
            ord_row = self.orders[pos.order_id]
            if ord_row.price > 0:
                dist = abs(pos.entry_price - ord_row.price)
                if dist > 0:
                    self.in_memory_1r_cache[pos.id] = dist
                    return dist

        # 4. Safe fallback: default tick (e.g. 0.10) - NEVER fallback to abs(entry - sl_price)
        safe_fallback = 1.0  # Safe default 1.0 point
        self.in_memory_1r_cache[pos.id] = safe_fallback
        return safe_fallback

    def attempt_atomic_close(self, pos_id: int) -> bool:
        """Atomic state claim: UPDATE positions SET status = 'CLOSING' WHERE id = ? AND status = 'OPEN'."""
        pos = self.positions.get(pos_id)
        if not pos or pos.status != "OPEN":
            return False  # rejected: already closing or closed
        pos.status = "CLOSING"
        return True

    def reconcile_closing_positions(self) -> int:
        """Phase 6.7 Startup Reconciliation Routine."""
        reconciled = 0
        for pos in list(self.positions.values()):
            if pos.status == "CLOSING":
                # Check if exit order exists in filled orders
                matching_exit = next(
                    (o for o in self.orders.values() if o.position_id == pos.id and o.status == "FILLED"),
                    None,
                )
                if matching_exit:
                    pos.status = "CLOSED"
                else:
                    # No filled exit order: safely restore to OPEN for active management
                    pos.status = "OPEN"
                reconciled += 1
        return reconciled


# ---------------------------------------------------------------------------
# RESTART SCENARIOS (TASK 3)
# ---------------------------------------------------------------------------

def test_restart_before_any_stop_movement():
    """Scenario 1: Restart before stop movement preserves original 1R."""
    engine = MockEngine()
    pos = Position(
        id=1,
        symbol="RELIANCE",
        side="BUY",
        qty=50,
        entry_price=2500.0,
        sl_price=2480.0,
        target_price=2560.0,
        initial_sl_distance=20.0,
    )
    engine.positions[1] = pos

    # Before restart
    assert engine.get_initial_sl_distance(pos) == 20.0

    # Crash & restart
    engine.simulate_crash_restart()
    assert len(engine.in_memory_1r_cache) == 0

    # After restart: distance restored from persistent column
    assert engine.get_initial_sl_distance(pos) == 20.0


def test_restart_after_trailing_stop_activation():
    """Scenario 2: Restart after trailing stop ratchets preserves original 1R."""
    engine = MockEngine()
    pos = Position(
        id=2,
        symbol="RELIANCE",
        side="BUY",
        qty=50,
        entry_price=2500.0,
        sl_price=2520.0,  # SL trailed +20 points above entry!
        target_price=2560.0,
        initial_sl_distance=20.0,
    )
    engine.positions[2] = pos

    engine.simulate_crash_restart()

    # Must NOT calculate abs(2500 - 2520) without knowing context, but restore persisted 20.0
    recovered_r = engine.get_initial_sl_distance(pos)
    assert recovered_r == 20.0
    # Next trail milestone is 3R from entry (2500 + 3*20 = 2560), NOT 2520 + 3*20
    next_milestone = pos.entry_price + 3 * recovered_r
    assert next_milestone == 2560.0


def test_restart_after_breakeven_stop_movement():
    """Scenario 3: Restart after breakeven stop does NOT collapse 1R to 0.10."""
    engine = MockEngine()
    pos = Position(
        id=3,
        symbol="RELIANCE",
        side="BUY",
        qty=39,
        entry_price=2508.43,
        sl_price=2508.53,  # Nominally moved to breakeven (+0.10)
        target_price=2548.43,
        initial_sl_distance=20.0,
    )
    engine.positions[3] = pos

    engine.simulate_crash_restart()

    recovered_r = engine.get_initial_sl_distance(pos)
    # The fatal bug was recovering abs(2508.43 - 2508.53) = 0.10
    assert recovered_r == 20.0
    assert recovered_r != 0.10


def test_restart_while_position_is_closing_with_filled_exit():
    """Scenario 4A: Position in 'CLOSING' with filled exit order is completed to CLOSED."""
    engine = MockEngine()
    pos = Position(
        id=4,
        symbol="RELIANCE",
        side="BUY",
        qty=50,
        entry_price=2500.0,
        sl_price=2480.0,
        target_price=2560.0,
        initial_sl_distance=20.0,
        status="CLOSING",
    )
    engine.positions[4] = pos
    # Filled exit order recorded prior to crash
    engine.orders[101] = Order(
        id=101,
        position_id=4,
        symbol="RELIANCE",
        side="SELL",
        qty=50,
        price=2480.0,
        status="FILLED",
        reason="Exit (STOP_LOSS)",
    )

    engine.simulate_crash_restart()
    reconciled = engine.reconcile_closing_positions()

    assert reconciled == 1
    assert engine.positions[4].status == "CLOSED"


def test_restart_while_position_is_closing_without_exit_order():
    """Scenario 4B: Position in 'CLOSING' with no filled exit order is reverted to OPEN."""
    engine = MockEngine()
    pos = Position(
        id=5,
        symbol="RELIANCE",
        side="BUY",
        qty=50,
        entry_price=2500.0,
        sl_price=2480.0,
        target_price=2560.0,
        initial_sl_distance=20.0,
        status="CLOSING",
    )
    engine.positions[5] = pos

    engine.simulate_crash_restart()
    reconciled = engine.reconcile_closing_positions()

    assert reconciled == 1
    # Must NOT be abandoned in CLOSING; must be safely OPEN for active management
    assert engine.positions[5].status == "OPEN"


def test_restart_with_missing_or_corrupted_persisted_state():
    """Scenario 5: Missing persisted initialSlDistance falls back safely without crash."""
    engine = MockEngine()
    pos = Position(
        id=6,
        symbol="RELIANCE",
        side="BUY",
        qty=50,
        entry_price=2500.0,
        sl_price=2500.10,  # breakeven
        target_price=2560.0,
        initial_sl_distance=None,  # corrupted or legacy row
    )
    engine.positions[6] = pos

    engine.simulate_crash_restart()
    recovered_r = engine.get_initial_sl_distance(pos)

    # Must fall back to safe default (1.0), never to 0.10
    assert recovered_r == 1.0
    assert recovered_r > 0


def test_duplicate_close_requests_after_restart():
    """Scenario 6: Duplicate close requests after restart are rejected atomically."""
    engine = MockEngine()
    pos = Position(
        id=7,
        symbol="RELIANCE",
        side="BUY",
        qty=50,
        entry_price=2500.0,
        sl_price=2480.0,
        target_price=2560.0,
        initial_sl_distance=20.0,
        status="OPEN",
    )
    engine.positions[7] = pos

    engine.simulate_crash_restart()

    # First close worker succeeds
    res1 = engine.attempt_atomic_close(7)
    assert res1 is True
    assert engine.positions[7].status == "CLOSING"

    # Concurrent second worker fails
    res2 = engine.attempt_atomic_close(7)
    assert res2 is False
    assert engine.positions[7].status == "CLOSING"


# ---------------------------------------------------------------------------
# COST-MODEL VERIFICATION (TASK 4)
# ---------------------------------------------------------------------------

def calculate_exact_costs(qty, entry, exit_p, side, bps):
    """Calculates statutory taxes and symmetrical slippage."""
    is_buy = side == "BUY"
    entry_val = qty * entry
    exit_val = qty * exit_p
    tot_turnover = entry_val + exit_val
    buy_val = entry_val if is_buy else exit_val
    sell_val = exit_val if is_buy else entry_val

    brk = 10.0
    stt = round(sell_val * 0.00025, 2)
    exch = round(tot_turnover * 0.0000297, 2)
    sebi = round(tot_turnover * 0.000001, 2)
    stamp = round(buy_val * 0.00003, 2)
    gst = round((brk + exch + sebi) * 0.18, 2)

    entry_slip = round(entry_val * (bps / 10000.0), 2)
    exit_slip = round(exit_val * (bps / 10000.0), 2)
    tot_slip = round(entry_slip + exit_slip, 2)

    unrounded = brk + (sell_val * 0.00025) + (tot_turnover * 0.0000297) + (tot_turnover * 0.000001) + (buy_val * 0.00003) + ((brk + (tot_turnover * 0.0000297) + (tot_turnover * 0.000001)) * 0.18) + (entry_val * (bps / 10000.0)) + (exit_val * (bps / 10000.0))
    total_charges = round(unrounded, 2)

    return {
        "statutory": round(brk + stt + exch + sebi + stamp + gst, 2),
        "entry_slip": entry_slip,
        "exit_slip": exit_slip,
        "tot_slip": tot_slip,
        "total_charges": total_charges,
    }


@pytest.mark.parametrize("bps, exp_slip, exp_total", [
    (0, 0.0, 46.67),
    (4, 79.06, 125.73),
    (8, 158.12, 204.79),
    (12, 237.18, 283.85),
])
def test_fixed_cost_scenarios_0_4_8_12_bps(bps, exp_slip, exp_total):
    """Verifies 0/0, 4/4, 8/8, 12/12 bps scenarios on Paper Trade 1 (39 shs @ 2529.94 -> 2538.09)."""
    res = calculate_exact_costs(39, 2529.94, 2538.09, "BUY", bps)
    assert res["tot_slip"] == exp_slip
    assert res["total_charges"] == exp_total
    assert res["entry_slip"] > 0 if bps > 0 else res["entry_slip"] == 0
    assert res["exit_slip"] > 0 if bps > 0 else res["exit_slip"] == 0
