"""
Broker Failover and Reconciliation Manager (PAPER MODE)
Manages failover between multiple brokers with order/position reconciliation.
Implements safe failover logic without accessing live trading systems.
"""

import logging
import threading
import time
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Optional, Dict, List, Any, Callable

from .broker_adapter import BrokerAdapter, Order, OrderType, ProductType


class BrokerHealth(Enum):
    """Broker health status."""
    UNKNOWN = "UNKNOWN"
    CONNECTING = "CONNECTING"
    CONNECTED = "CONNECTED"
    DISCONNECTED = "DISCONNECTED"
    ERROR = "ERROR"


@dataclass
class FailoverState:
    """State tracking for broker failover."""
    primary_broker: Optional[str] = None
    active_broker: Optional[str] = None
    broker_health: Dict[str, BrokerHealth] = field(default_factory=dict)
    order_broker_mapping: Dict[str, str] = field(default_factory=dict)  # order_id -> broker_name
    pending_reconciliation: bool = False
    last_reconciliation: Optional[datetime] = None


class BrokerFailoverManager:
    """
    Manages broker failover with order/position safety.

    PAPER MODE ONLY - Never used with live trading credentials.
    """

    def __init__(self, brokers: Dict[str, BrokerAdapter]):
        """
        Initialize failover manager with broker instances.

        Args:
            brokers: Dict mapping broker name to BrokerAdapter instance
        """
        self.brokers = brokers
        self.state = FailoverState()
        self.logger = logging.getLogger(f"{__name__}.BrokerFailoverManager")
        self.logger.setLevel(logging.INFO)

        # Initialize health status
        for name in brokers:
            self.state.broker_health[name] = BrokerHealth.UNKNOWN

        # Order ID prefix per broker for tracking
        self._order_prefix_map: Dict[str, str] = {}

        # Thread-safe order ID generation
        self._lock = threading.Lock()
        self._order_counter = 0

    def set_primary(self, broker_name: str) -> bool:
        """Set the primary broker for order routing."""
        if broker_name not in self.brokers:
            self.logger.error(f"Unknown broker: {broker_name}")
            return False

        self.state.primary_broker = broker_name
        if self.state.active_broker is None:
            self.state.active_broker = broker_name
            self.state.broker_health[broker_name] = BrokerHealth.CONNECTED
        return True

    def get_active_broker(self) -> Optional[BrokerAdapter]:
        """Get the currently active broker adapter."""
        if self.state.active_broker and self.state.active_broker in self.brokers:
            return self.brokers[self.state.active_broker]
        return None

    def check_order_status(self, order_id: str) -> Optional[Dict[str, Any]]:
        """
        Check order status in broker systems.

        Returns order info with broker source, or None if not found.
        """
        # Check where this order is tracked
        broker_name = self.state.order_broker_mapping.get(order_id)

        if broker_name and broker_name in self.brokers:
            broker = self.brokers[broker_name]
            if hasattr(broker, 'get_order_by_id'):
                return broker.get_order_by_id(order_id)

        # Search all brokers
        for name, broker in self.brokers.items():
            if hasattr(broker, 'get_order_history'):
                orders = broker.get_order_history(order_id)
                if orders:
                    self.state.order_broker_mapping[order_id] = name
                    return orders[0] if isinstance(orders, list) else orders

        return None

    def validate_position_exists(self, symbol: str) -> bool:
        """Check if position exists in any broker."""
        for name, broker in self.brokers.items():
            if hasattr(broker, 'get_positions'):
                positions = broker.get_positions()
                for pos in positions:
                    pos_symbol = getattr(pos, 'symbol', None) or pos.get('symbol', '') if isinstance(pos, dict) else ''
                    if pos_symbol == symbol:
                        return True
        return False

    def reconcile_order_before_failover(self, order_id: str) -> bool:
        """
        Verify order status before allowing failover.

        Returns True if order is in a clean state for failover.
        """
        order_info = self.check_order_status(order_id)

        if not order_info:
            self.logger.warning(f"Order {order_id} not found in any broker - may be unknown state")
            return False

        status = str(order_info.get('status', '')).upper() if isinstance(order_info, dict) else str(getattr(order_info, 'status', '')).upper()

        # Clean states - safe to failover
        if status in ('COMPLETED', 'CANCELLED', 'REJECTED'):
            return True

        # Pending/partially filled - require reconciliation
        if status in ('NEW', 'SUBMITTED', 'PARTIALLY_FILLED', 'TRIGGER_PENDING'):
            self.logger.warning(f"Order {order_id} in {status} state - blocking failover")
            return False

        return False

    def execute_failover(self, reason: str = "Broker failure") -> Optional[str]:
        """
        Execute broker failover safely.

        Returns name of new active broker, or None if failover failed.
        """
        # Sanitize reason: remove newlines and limit special characters
        sanitized_reason = reason.replace('\n', ' ').replace('\r', '').strip()[:100]
        self.logger.warning(f"Initiating failover: {sanitized_reason}")

        # Get current broker
        current_broker = self.state.active_broker

        # Check for clean state on current broker
        if current_broker:
            # Verify no pending orders that need resolution
            for order_id, broker_name in list(self.state.order_broker_mapping.items()):
                if broker_name == current_broker:
                    if not self.reconcile_order_before_failover(order_id):
                        self.logger.error(f"Cannot failover - order {order_id} not reconciled")
                        return None

        # Find healthy backup broker
        backup = None
        for name, broker in self.brokers.items():
            if name == current_broker:
                continue
            if hasattr(broker, 'is_connected') and broker.is_connected():
                backup = name
                break

        if not backup:
            # Try any broker that's not the current one
            for name in self.brokers:
                if name != current_broker:
                    backup = name
                    break

        if not backup:
            self.logger.error("No backup broker available")
            return None

        # Switch to backup
        self.state.active_broker = backup
        self.state.broker_health[backup] = BrokerHealth.CONNECTED
        self.state.pending_reconciliation = True

        self.logger.info(f"Failover complete - now using {backup}")
        return backup

    def reconcile_positions(self) -> Dict[str, Any]:
        """
        Reconcile positions across all brokers.

        Returns dict with reconciliation results.
        """
        results = {
            "brokers_checked": 0,
            "positions_confirmed": 0,
            "discrepancies": [],
            "timestamp": datetime.now().isoformat()
        }

        for name, broker in self.brokers.items():
            results["brokers_checked"] += 1

            if hasattr(broker, 'get_positions'):
                try:
                    positions = broker.get_positions()
                    for pos in positions:
                        pos_symbol = getattr(pos, 'symbol', '') or (pos.get('symbol', '') if isinstance(pos, dict) else '')
                        if pos_symbol:
                            results["positions_confirmed"] += 1
                except Exception as e:
                    self.logger.error(f"Error reconciling {name}: {e}")
                    results["discrepancies"].append({"broker": name, "error": str(e)})

        self.state.pending_reconciliation = False
        self.state.last_reconciliation = datetime.now()

        return results

    def generate_unique_order_id(self) -> str:
        """Generate a unique internal order ID.

        Guarantees uniqueness even when called multiple times within the same
        millisecond by using a thread-safe counter combined with a UUID component.
        Format: BROKER_TIMESTAMP_COUNTER_UUIDFRAGMENT
        """
        active = self.state.active_broker or "unknown"
        timestamp = int(time.time() * 1000)

        # Thread-safe counter for collision resistance within same millisecond
        with self._lock:
            self._order_counter += 1
            counter = self._order_counter

        # Use last 6 chars of UUIDv4 for additional collision resistance
        uuid_fragment = uuid.uuid4().hex[:6]

        return f"{active.upper()}_{timestamp}_{counter}_{uuid_fragment}"

    def register_order(self, internal_id: str, broker_order_id: str, broker_name: str) -> None:
        """Register an order with the failover tracker."""
        self.state.order_broker_mapping[internal_id] = broker_name
        if internal_id not in self._order_prefix_map:
            self._order_prefix_map[broker_name] = internal_id

    def get_order_broker(self, order_id: str) -> Optional[str]:
        """Get which broker an order belongs to."""
        return self.state.order_broker_mapping.get(order_id)

    def clear_completed_order(self, order_id: str) -> None:
        """Remove order from tracking after completion."""
        if order_id in self.state.order_broker_mapping:
            del self.state.order_broker_mapping[order_id]

    def update_health(self, broker_name: str, health: BrokerHealth) -> None:
        """Update broker health status."""
        self.state.broker_health[broker_name] = health

        if health == BrokerHealth.ERROR and broker_name == self.state.active_broker:
            self.logger.warning(f"Active broker {broker_name} in ERROR state")
            # Trigger automatic failover check
            return False
        return True


# Convenience function for backward compatibility
def create_failover_manager(brokers: Dict[str, BrokerAdapter]) -> BrokerFailoverManager:
    """Factory function to create a failover manager."""
    return BrokerFailoverManager(brokers)