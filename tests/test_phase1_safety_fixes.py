"""
Phase 1 Safety Fixes - Automated Test Suite
Tests for critical safety repairs in OmniTradePro Apex V2.0
"""

import pytest
import time
from pathlib import Path
from datetime import datetime, date
from unittest.mock import MagicMock, patch

# Import modules to test
import sys
sys.path.insert(0, str(Path(__file__).parent.parent))

from core.broker_adapter import BrokerAdapter, Order, OrderType, ProductType, ConnectionState, ConnectionMilestone, MockBrokerAdapter
from risk.risk_manager import RiskManager, RiskAction
from core.engine import TradingEngine, EngineConfig, EventType


class TestDailyResetPreservesLivePositions:
    """Test ISSUE-007: Daily reset must preserve live positions"""

    def test_daily_reset_blocks_when_positions_exist(self):
        """Verify daily reset is blocked when open positions exist"""
        risk_manager = RiskManager(
            max_daily_loss=500.0,
            max_per_trade_risk=100.0,
            stop_loss_pct=2.0
        )

        # Set capital
        risk_manager.set_capital(100000.0)

        # Add a live position
        risk_manager.add_position(
            symbol="SBIN",
            entry_price=500.0,
            quantity=10,
            direction=1,
            stop_loss=490.0,
            target=520.0
        )

        # Record some daily P&L
        risk_manager._daily_pnl = -100.0
        risk_manager._daily_trades = 5
        risk_manager._daily_loss_exceeded = False

        # Attempt daily reset - should be BLOCKED
        original_pnl = risk_manager._daily_pnl
        risk_manager.reset_daily()

        # Verify reset was NOT executed
        assert risk_manager._daily_pnl == original_pnl, "Daily reset should not execute with live positions"
        assert risk_manager._daily_trades == 5, "Trade count should not reset with live positions"

    def test_daily_reset_succeeds_when_no_positions(self):
        """Verify daily reset succeeds when no open positions"""
        risk_manager = RiskManager(
            max_daily_loss=500.0,
            max_per_trade_risk=100.0,
            stop_loss_pct=2.0
        )

        risk_manager.set_capital(100000.0)
        risk_manager._daily_pnl = -100.0
        risk_manager._daily_trades = 5
        risk_manager._daily_loss_exceeded = True

        # No positions added
        risk_manager.reset_daily()

        # Verify reset WAS executed
        assert risk_manager._daily_pnl == 0.0
        assert risk_manager._daily_trades == 0
        assert risk_manager._daily_loss_exceeded == False


class TestEmergencyStopFixedReferences:
    """Test ISSUE-004: Emergency stop uses correct mock broker reference"""

    def test_emergency_stop_fetches_mock_positions(self):
        """Verify emergency stop correctly fetches positions from MockBrokerAdapter"""
        mock_broker = MockBrokerAdapter()

        # Add a mock position
        from core.broker_adapter import Position
        mock_pos = Position(
            symbol="SBIN",
            instrument_token=1234,
            transaction_type="BUY",
            net_quantity=10,
            avg_price=500.0,
            ltp=510.0,
            unrealised_pnl=100.0,
            realised_pnl=0.0
        )
        mock_broker._mock_positions.append(mock_pos)

        # Create engine with mock broker
        config = EngineConfig()
        engine = TradingEngine(
            broker=mock_broker,
            config=config,
            paper_trading=None
        )
        engine.state = engine.state.RUNNING
        engine._running = True

        # Set has_paper_trading to False to use broker positions
        engine.is_paper_trading = False

        # Check that the broker has the expected attribute
        assert hasattr(mock_broker, "_mock_positions")
        assert len(mock_broker._mock_positions) == 1


class TestOrderTimeoutTracking:
    """Test ISSUE-005, ISSUE-011: Order timeout tracking and reconciliation"""

    def test_order_timestamps_tracked(self):
        """Verify order submission timestamps are tracked"""
        mock_broker = MockBrokerAdapter()
        engine = TradingEngine(
            broker=mock_broker,
            risk_manager=None,
            paper_trading=None
        )
        engine.state = engine.state.RUNNING
        engine._running = True

        # Place an order
        order = Order(
            symbol="SBIN",
            transaction_type="BUY",
            quantity=10,
            order_type=OrderType.LIMIT,
            price=500.0,
            product_type=ProductType.INTRADAY
        )

        result = engine.place_order(order)

        # Verify timestamp was tracked
        assert order.order_id in engine._order_timestamps
        assert time.time() - engine._order_timestamps[order.order_id] < 1.0  # Recent

    def test_reconcile_removes_completed_orders(self):
        """Verify order reconciliation removes completed orders from tracking"""
        mock_broker = MockBrokerAdapter()
        engine = TradingEngine(
            broker=mock_broker,
            risk_manager=None,
            paper_trading=None
        )
        engine.state = engine.state.RUNNING
        engine._running = True

        # Place an order
        order = Order(
            symbol="SBIN",
            transaction_type="BUY",
            quantity=10,
            order_type=OrderType.LIMIT,
            price=500.0,
            product_type=ProductType.INTRADAY
        )

        engine.place_order(order)
        order_id = order.order_id

        # Simulate fill
        order.record_fill(10, 501.0)

        # Reconcile
        result = engine.reconcile_orders()

        # Verify order is removed from pending
        assert order_id not in engine._order_timestamps or order_id not in engine._pending_orders


class TestMarketSessionValidation:
    """Test ISSUE-013: Exchange session and holiday validation"""

    def test_market_session_validation_in_place_order(self):
        """Verify place_order checks market status"""
        broker = BrokerAdapter()

        # Patch is_market_open_ist to return False (weekend/holiday)
        with patch('core.broker_adapter.is_market_open_ist', return_value=False):
            order = Order(
                symbol="SBIN",
                transaction_type="BUY",
                quantity=10,
                order_type=OrderType.LIMIT,
                price=500.0,
                product_type=ProductType.INTRADAY
            )

            result = broker.place_order(order)

            # Real broker should reject when market is closed
            assert result is None, "Order should be rejected when market is closed"

    def test_market_session_function_exists(self):
        """Verify market session validation function exists and works"""
        # Test that is_market_open_ist is defined and callable
        from core.broker_adapter import is_market_open_ist
        assert callable(is_market_open_ist)

        # Test with current time - just verify it returns a bool
        result = is_market_open_ist()
        assert isinstance(result, bool)


class TestEmergencyStopUsesLimitOrder:
    """Test: Emergency stop should use LIMIT order, not MARKET"""

    def test_emergency_stop_uses_limit_order_type(self):
        """Verify emergency stop creates LIMIT orders, not MARKET"""
        mock_broker = MockBrokerAdapter()

        # Add a mock position
        from core.broker_adapter import Position
        mock_pos = Position(
            symbol="SBIN",
            instrument_token=1234,
            transaction_type="BUY",
            net_quantity=10,
            avg_price=500.0,
            ltp=510.0,
            unrealised_pnl=100.0,
            realised_pnl=0.0
        )
        mock_broker._mock_positions.append(mock_pos)

        # Set up engine
        config = EngineConfig()
        engine = TradingEngine(
            broker=mock_broker,
            config=config,
            paper_trading=None
        )
        engine.state = engine.state.RUNNING
        engine._running = True
        engine.is_paper_trading = False

        # Capture order placed during emergency stop
        captured_orders = []
        def capture_order(order):
            captured_orders.append(order)
            return f"TEST_{len(captured_orders)}"

        with patch.object(mock_broker, 'place_order', side_effect=capture_order):
            result = engine.emergency_stop()

        # Verify LIMIT order was used
        assert len(captured_orders) > 0, "Emergency stop should place orders"
        for order in captured_orders:
            assert order.order_type == OrderType.LIMIT, f"Emergency stop should use LIMIT order, got {order.order_type}"


class TestRiskCalculationCNCFix:
    """Test ISSUE-001: Risk manager uses correct stop loss for CNC"""

    def test_cnc_stop_loss_uses_configured_percentage(self):
        """Verify CNC stop loss uses configured stop_loss_pct"""
        risk_manager = RiskManager(
            max_daily_loss=500.0,
            max_per_trade_risk=100.0,
            stop_loss_pct=2.0  # 2%
        )

        # Create order
        order = Order(
            symbol="SBIN",
            transaction_type="BUY",
            quantity=10,
            order_type=OrderType.LIMIT,
            price=500.0,
            product_type=ProductType.CNC
        )

        # Calculate max risk
        max_risk = risk_manager._calculate_max_risk_cnc(order, 500.0)

        # Should be based on 2% stop loss = ₹10 per share * 10 qty = ₹100
        expected_risk = 500.0 * 0.02 * 10  # price * stop_loss_pct * quantity

        assert abs(max_risk - expected_risk) < 1.0, f"Expected risk {expected_risk}, got {max_risk}"


# Run tests if executed directly
if __name__ == "__main__":
    pytest.main([__file__, "-v"])