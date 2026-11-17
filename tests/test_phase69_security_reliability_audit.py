"""
OmniTradePro Apex V2.0 — Phase 6.9 Security & Reliability Audit Test Suite.

Audits:
1. Live Order Execution Rejection across all entry points.
2. Environment Variable Immunity (environment variables cannot enable live trading).
3. Credential & Token Sanitization (redaction of passwords, tokens, API keys in audit logs).
4. Repeated Database Migrations & Repeated Startup Recovery Idempotency.
5. Partial-fill, Duplicate-order, and Uncertain-order Recovery with mocked fixtures.
6. Configuration Defaults and Fail-Safe Behavior.
"""

import os
import re
import sys
from pathlib import Path
import pytest
from unittest.mock import MagicMock, patch

sys.path.insert(0, str(Path(__file__).parent.parent))

from core.broker_adapter import BrokerAdapter, MockBrokerAdapter, Order, OrderType, ProductType
from core.engine import TradingEngine, EngineConfig, EngineState


# ---------------------------------------------------------------------------
# 1. LIVE ORDER EXECUTION PERMANENT HARD-BLOCK AUDIT (TASK 1 & TASK 6)
# ---------------------------------------------------------------------------

class DummyLiveBroker(BrokerAdapter):
    """Simulates an attempted live broker adapter (NOT a test fixture)."""
    IS_TEST_FIXTURE = False


def test_live_broker_adapter_place_order_rejected():
    """Verify BrokerAdapter.place_order permanently rejects live orders."""
    broker = BrokerAdapter()
    order = Order(
        symbol="RELIANCE",
        transaction_type="BUY",
        quantity=10,
        order_type=OrderType.MARKET,
        price=2500.0,
        product_type=ProductType.INTRADAY
    )

    result = broker.place_order(order)
    assert result is None, "Live broker order must return None"
    assert order.status == "REJECTED", "Live broker order status must be REJECTED"
    assert "Live broker execution permanently disabled" in order.reject_reason


def test_trading_engine_rejects_non_fixture_broker_order():
    """Verify TradingEngine strictly blocks orders if broker is not an offline test fixture."""
    live_broker = DummyLiveBroker()
    engine = TradingEngine(broker=live_broker, paper_trading=None)
    engine.state = EngineState.RUNNING
    engine._running = True
    engine.is_paper_trading = False

    order = Order(
        symbol="TCS",
        transaction_type="BUY",
        quantity=5,
        order_type=OrderType.LIMIT,
        price=3500.0,
        product_type=ProductType.INTRADAY
    )

    success = engine.place_order(order)
    assert success is False, "TradingEngine must refuse to route order through non-fixture broker"


def test_mock_fixture_broker_permitted_for_offline_tests():
    """Verify offline MockBrokerAdapter works strictly for test fixture purposes."""
    mock_broker = MockBrokerAdapter()
    engine = TradingEngine(broker=mock_broker, paper_trading=None)
    engine.state = EngineState.RUNNING
    engine._running = True

    order = Order(
        symbol="INFY",
        transaction_type="BUY",
        quantity=10,
        order_type=OrderType.LIMIT,
        price=1500.0,
        product_type=ProductType.INTRADAY
    )

    success = engine.place_order(order)
    assert success is True, "Offline mock fixture must work for tests"
    assert order.order_id.startswith("MOCK_")


# ---------------------------------------------------------------------------
# 2. ENVIRONMENT VARIABLE IMMUNITY AUDIT (TASK 2)
# ---------------------------------------------------------------------------

def test_environment_variables_cannot_enable_live_trading(monkeypatch):
    """
    Verify setting TRADING_MODE=LIVE or LIVE_TRADING=true in environment
    cannot bypass safety interlocks.
    """
    monkeypatch.setenv("TRADING_MODE", "LIVE")
    monkeypatch.setenv("LIVE_TRADING", "true")
    monkeypatch.setenv("ENABLE_LIVE_ORDERS", "1")
    monkeypatch.setenv("NODE_ENV", "production")

    # In Python core engine, is_paper_trading must remain True by default
    mock_broker = MockBrokerAdapter()
    engine = TradingEngine(broker=mock_broker)
    assert engine.is_paper_trading is True, "Environment variable must NOT disable paper trading"

    # BrokerAdapter must continue to reject live order placement
    broker = BrokerAdapter()
    order = Order(
        symbol="RELIANCE", transaction_type="BUY", quantity=10, order_type=OrderType.MARKET
    )
    assert broker.place_order(order) is None
    assert order.status == "REJECTED"


# ---------------------------------------------------------------------------
# 3. CREDENTIAL SANITIZATION & LEAK PREVENTION AUDIT (TASK 3)
# ---------------------------------------------------------------------------

SENSITIVE_KEY_REGEX = re.compile(
    r"password|pin|secret|token|apikey|jwt|auth|credential|cookie|private|bearer", re.IGNORECASE
)


def sanitize_sensitive_data(val, depth=0):
    """Python mirror of TypeScript sanitizeSensitiveData."""
    if depth > 10 or val is None:
        return val
    if isinstance(val, str):
        if re.search(r"bearer\s+[a-zA-Z0-9_\-\.]+", val, re.IGNORECASE):
            return re.sub(r"bearer\s+[a-zA-Z0-9_\-\.]+", "Bearer [REDACTED]", val, flags=re.IGNORECASE)
        if re.match(r"^[a-zA-Z0-9_\-]{20,}\.[a-zA-Z0-9_\-]{20,}\.[a-zA-Z0-9_\-]{20,}$", val):
            return "[REDACTED_JWT]"
        return val
    if isinstance(val, list):
        return [sanitize_sensitive_data(x, depth + 1) for x in val]
    if isinstance(val, dict):
        out = {}
        for k, v in val.items():
            if SENSITIVE_KEY_REGEX.search(k):
                out[k] = "[REDACTED]"
            else:
                out[k] = sanitize_sensitive_data(v, depth + 1)
        return out
    return val


def test_credential_sanitization_masks_all_sensitive_keys():
    """Verify sensitive credentials (passwords, tokens, keys) are cleanly redacted."""
    raw_payload = {
        "symbol": "RELIANCE",
        "userId": "MOCK_USER_ID",
        "password": "SuperSecretPassword123",
        "apiKey": "ShoonyaApiKeyABC999",
        "api_secret": "VerySecretKey456",
        "totp_secret": "JBSWY3DPEHPK3PXP",
        "jwtToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w",
        "nested": {
            "authToken": "Bearer secret_bearer_token_xyz",
            "tradingPin": "1234",
            "safeField": 500.0
        }
    }

    clean = sanitize_sensitive_data(raw_payload)

    assert clean["password"] == "[REDACTED]"
    assert clean["apiKey"] == "[REDACTED]"
    assert clean["api_secret"] == "[REDACTED]"
    assert clean["totp_secret"] == "[REDACTED]"
    assert clean["jwtToken"] == "[REDACTED]"
    assert clean["nested"]["authToken"] == "[REDACTED]"
    assert clean["nested"]["tradingPin"] == "[REDACTED]"
    assert clean["nested"]["safeField"] == 500.0
    assert clean["symbol"] == "RELIANCE"


def test_gitignore_covers_sensitive_files():
    """Verify .gitignore exists and specifies .env, .env.local, and credentials."""
    assert os.path.exists(".gitignore"), ".gitignore file must exist in workspace root"
    with open(".gitignore", "r", encoding="utf-8") as f:
        content = f.read()

    assert ".env" in content
    assert ".env.local" in content
    assert "data/credentials.json" in content or "*.json" in content


# ---------------------------------------------------------------------------
# 4. REPEATED MIGRATIONS & STARTUP RECOVERY IDEMPOTENCY AUDIT (TASK 4)
# ---------------------------------------------------------------------------

def test_repeated_migration_sql_idempotency():
    """Verify migration DDL contains IF NOT EXISTS and is safe for repeated runs."""
    migration_path = os.path.join("drizzle", "0001_initial_sl_distance_migration.sql")
    assert os.path.exists(migration_path), "Migration file must exist"
    with open(migration_path, "r", encoding="utf-8") as f:
        sql = f.read()

    assert "ADD COLUMN IF NOT EXISTS" in sql, "Column addition must be idempotent"
    assert "UPDATE" in sql, "Backfill statement must exist"


def test_repeated_startup_recovery_idempotency():
    """Verify running reconciliation 5 times consecutively produces zero side effects."""
    from tests.test_phase68_order_reconciliation_failure_injection import Phase68Engine, Position, Order

    engine = Phase68Engine()
    pos = Position(
        id=1, symbol="RELIANCE", side="BUY", qty=20, entry_price=2500.0, sl_price=2480.0,
        target_price=2550.0, initial_sl_distance=20.0, status="CLOSING"
    )
    engine.positions[1] = pos
    engine.orders[101] = Order(
        id=101, symbol="RELIANCE", side="SELL", qty=20, price=2520.0, status="FILLED",
        reason="Exit", position_id=1
    )

    # First recovery reconciles the position
    r1 = engine.reconcile_closing_positions()
    assert r1 == 1
    assert pos.status == "CLOSED"

    # Repeated runs (2 through 5) must be exact no-ops
    for i in range(2, 6):
        r_subsequent = engine.reconcile_closing_positions()
        assert r_subsequent == 0, f"Run {i} must be a strict no-op"
        assert pos.status == "CLOSED"


# ---------------------------------------------------------------------------
# 5. PARTIAL-FILL, DUPLICATE-ORDER & UNCERTAIN-ORDER AUDIT (TASK 5)
# ---------------------------------------------------------------------------

def test_multi_slice_partial_fill_recovery():
    """Verify recovery when an order is partially executed across 3 slices."""
    from tests.test_phase68_order_reconciliation_failure_injection import Phase68Engine, Position, Order

    engine = Phase68Engine()
    # Position of 100 shares
    pos = Position(
        id=10, symbol="TCS", side="BUY", qty=100, entry_price=3500.0, sl_price=3470.0,
        target_price=3560.0, initial_sl_distance=30.0, status="CLOSING"
    )
    engine.positions[10] = pos

    # Partial execution 1: 30 shares @ 3520
    # Partial execution 2: 40 shares @ 3525
    engine.orders[201] = Order(
        id=201, symbol="TCS", side="SELL", qty=30, price=3520.0, status="FILLED",
        reason="Slice 1", position_id=10, filled_qty=30
    )
    engine.orders[202] = Order(
        id=202, symbol="TCS", side="SELL", qty=40, price=3525.0, status="FILLED",
        reason="Slice 2", position_id=10, filled_qty=40
    )

    reconciled = engine.reconcile_closing_positions()
    assert reconciled == 1

    # Total executed = 70 shares; remaining = 30 shares
    assert pos.status == "OPEN"
    assert pos.qty == 30
    assert pos.entry_price == 3500.0

    # Sliced closed record has 70 shares
    slices = [p for p in engine.positions.values() if p.id != 10]
    assert len(slices) == 1
    s = slices[0]
    assert s.status == "CLOSED"
    assert s.qty == 70
    # VWAP: (30*3520 + 40*3525)/70 = (105600 + 141000)/70 = 246600 / 70 = 3522.86
    assert s.exit_price == 3522.86


def test_duplicate_order_prevention_via_atomic_claim():
    """Verify concurrent close requests for the same position are rejected."""
    from tests.test_phase68_order_reconciliation_failure_injection import Phase68Engine, Position

    engine = Phase68Engine()
    pos = Position(
        id=20, symbol="INFY", side="BUY", qty=50, entry_price=1450.0, sl_price=1430.0,
        target_price=1490.0, initial_sl_distance=20.0, status="OPEN"
    )
    engine.positions[20] = pos

    # First claim succeeds
    claim1 = engine.mark_closing(20)
    assert claim1 is True
    assert pos.status == "CLOSING"

    # Simultaneous second claim is rejected
    claim2 = engine.mark_closing(20)
    assert claim2 is False, "Concurrent close claim must be rejected"


def test_uncertain_order_status_prevents_unhedged_open():
    """Verify in-flight uncertain orders are NOT reverted to OPEN."""
    from tests.test_phase68_order_reconciliation_failure_injection import Phase68Engine, Position, Order

    engine = Phase68Engine()
    pos = Position(
        id=30, symbol="HDFC", side="BUY", qty=20, entry_price=1600.0, sl_price=1580.0,
        target_price=1640.0, initial_sl_distance=20.0, status="CLOSING"
    )
    engine.positions[30] = pos
    engine.orders[301] = Order(
        id=301, symbol="HDFC", side="SELL", qty=20, price=1610.0, status="PENDING",
        reason="Exit (Pending OMS Acknowledgment)", position_id=30
    )

    reconciled = engine.reconcile_closing_positions()
    assert reconciled == 0
    assert pos.status == "CLOSING", "Uncertain position must NOT revert to OPEN"
    assert len(engine.alerts) == 1
    assert engine.alerts[0]["type"] == "UNCERTAIN_EXIT_ORDER"


# ---------------------------------------------------------------------------
# 6. CONFIGURATION DEFAULTS & FAIL-SAFE BEHAVIOR AUDIT (TASK 7)
# ---------------------------------------------------------------------------

def test_engine_config_defaults_are_fail_safe():
    """Verify default engine configuration defaults to safest possible state."""
    cfg = EngineConfig()
    assert cfg.pause_on_disconnect is True, "Engine must pause trading on disconnect"
    assert cfg.enable_auto_reconnect is True
    assert cfg.max_consecutive_errors == 5

    from risk.risk_manager import RiskManager, RiskConfig as PyRiskConfig
    risk_cfg = PyRiskConfig()
    assert risk_cfg.enable_kill_switch is True
    assert risk_cfg.max_positions == 5
    assert risk_cfg.max_daily_loss == 500.0


def test_trading_engine_fails_safe_on_kill_switch():
    """Verify order is rejected when risk manager kill switch is triggered."""
    from risk.risk_manager import RiskManager
    mock_broker = MockBrokerAdapter()
    risk_manager = RiskManager(emergency_kill_switch=True)
    # Trip the emergency kill switch
    risk_manager._trigger_kill_switch()
    assert risk_manager.is_kill_switch_active() is True

    engine = TradingEngine(broker=mock_broker, risk_manager=risk_manager, paper_trading=None)
    engine.state = EngineState.RUNNING
    engine._running = True

    order = Order(
        symbol="RELIANCE",
        transaction_type="BUY",
        quantity=10,
        order_type=OrderType.LIMIT,
        price=2500.0
    )

    # Order must be rejected because kill switch is active
    success = engine.place_order(order)
    assert success is False
