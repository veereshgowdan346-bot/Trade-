"""
EOD Square-Off Manager (PAPER MODE)
Handles automatic End-Of-Day square-off with retry logic and failure handling.
"""

import logging
import time
from dataclasses import dataclass, field
from datetime import datetime, time as dtime
from enum import Enum
from typing import Optional, Dict, List, Any, Callable

from .broker_adapter import BrokerAdapter, Order, OrderType, ProductType


class SquareOffStatus(Enum):
    """EOD square-off result status."""
    SUCCESS = "SUCCESS"
    PARTIAL = "PARTIAL"
    FAILED = "FAILED"
    NO_POSITIONS = "NO_POSITIONS"
    MARKET_CLOSED = "MARKET_CLOSED"


@dataclass
class SquareOffResult:
    """Result of an EOD square-off operation."""
    status: SquareOffStatus
    symbol: str
    quantity: int
    entry_price: float
    exit_price: float = 0.0
    realised_pnl: float = 0.0
    order_id: Optional[str] = None
    retry_count: int = 0
    error: Optional[str] = None
    timestamp: datetime = field(default_factory=datetime.now)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "status": self.status.value,
            "symbol": self.symbol,
            "quantity": self.quantity,
            "entry_price": self.entry_price,
            "exit_price": self.exit_price,
            "realised_pnl": self.realised_pnl,
            "order_id": self.order_id,
            "retry_count": self.retry_count,
            "error": self.error,
            "timestamp": self.timestamp.isoformat()
        }


@dataclass
class SquareOffConfig:
    """Configuration for EOD square-off."""
    squareoff_minutes_before_close: int = 45  # 15:15 IST for NSE
    max_retry_attempts: int = 3
    retry_delay_seconds: float = 5.0
    price_buffer_pct: float = 0.5  # 0.5% buffer for LIMIT orders
    enable_logging: bool = True


class EODFailover:
    """
    EOD Square-Off manager for safe position exit.

    PAPER MODE ONLY - For automated end-of-day position closing.
    """

    def __init__(self, broker: BrokerAdapter, config: Optional[SquareOffConfig] = None):
        """
        Initialize EOD square-off manager.

        Args:
            broker: Broker adapter instance
            config: Square-off configuration
        """
        self.broker = broker
        self.config = config or SquareOffConfig()
        self.logger = logging.getLogger(f"{__name__}.EODFailover")
        self.logger.setLevel(logging.INFO)

        # Track square-off results
        self._results: List[SquareOffResult] = []
        self._scheduled_time: Optional[datetime] = None
        self._is_active: bool = False

    def is_market_closed(self) -> bool:
        """Check if market should be considered closed."""
        from .broker_adapter import is_market_open_ist
        return not is_market_open_ist()

    def get_squareoff_time(self) -> Optional[datetime]:
        """Get the scheduled square-off time (returns None if configured)."""
        return self._scheduled_time

    def needs_squareoff(self, check_time: Optional[datetime] = None) -> bool:
        """
        Check if EOD square-off is needed based on time.

        Returns True if it's time for square-off or market is closed.
        """
        now = check_time or datetime.now()

        # Check if market is closed
        if self.is_market_closed():
            return True

        # Check if scheduled time has passed
        if self._scheduled_time and now >= self._scheduled_time:
            return True

        return False

    def calculate_squareoff_time(self, market_close: dtime = None) -> datetime:
        """
        Calculate the EOD square-off time.

        Default: 15:15 IST for NSE (before broker's 15:30 close)
        """
        from zoneinfo import ZoneInfo

        # NSE market hours: 09:15 - 15:30 IST
        close_time = market_close or dtime(15, 15)  # 45 min before close

        # Today in IST
        ist = ZoneInfo("Asia/Kolkata")
        now_ist = datetime.now(ist)

        squareoff_time = datetime.combine(now_ist.date(), close_time, tzinfo=ist)

        # If time has passed, it's for tomorrow
        if squareoff_time <= now_ist:
            from datetime import timedelta
            squareoff_time = datetime.combine(now_ist.date() + timedelta(days=1), close_time, tzinfo=ist)

        return squareoff_time

    def square_off_symbol(self, symbol: str) -> SquareOffResult:
        """
        Square off a specific symbol position.

        Returns SquareOffResult with status and details.
        """
        # Validate symbol: only alphanumeric and dots (e.g., 'NSE:SYMBOL', 'SYMBOL-EQ')
        if not re.match(r'^[A-Za-z0-9.\-]+$', symbol):
            self.logger.error(f"Invalid symbol format: {symbol}")
            return SquareOffResult(
                status=SquareOffStatus.FAILED,
                symbol=symbol,
                quantity=0,
                entry_price=0.0,
                error="Invalid symbol format"
            )

        result = SquareOffStatus.FAILED

        # Get current position
        broker_positions = []
        if hasattr(self.broker, 'get_positions'):
            broker_positions = self.broker.get_positions()

        # Find position
        position = None
        for pos in broker_positions:
            sym = getattr(pos, 'symbol', '') or (pos.get('symbol', '') if isinstance(pos, dict) else '')
            if sym == symbol:
                position = pos
                break

        if not position:
            # Check paper trading if available
            return SquareOffResult(
                status=SquareOffStatus.NO_POSITIONS,
                symbol=symbol,
                quantity=0,
                entry_price=0.0
            )

        # Get position details
        qty = getattr(position, 'net_quantity', None) or position.get('net_quantity', 0) if isinstance(position, dict) else getattr(position, 'net_quantity', 0)
        if qty is None:
            qty = getattr(position, 'quantity', 0) or position.get('quantity', 0) if isinstance(position, dict) else 0

        if qty == 0:
            return SquareOffResult(
                status=SquareOffStatus.NO_POSITIONS,
                symbol=symbol,
                quantity=0,
                entry_price=getattr(position, 'avg_price', 0) or position.get('avg_price', 0) if isinstance(position, dict) else 0
            )

        entry_price = getattr(position, 'avg_price', 0) or (position.get('avg_price', 0) if isinstance(position, dict) else 0)
        side = getattr(position, 'transaction_type', '') or position.get('transaction_type', 'BUY') if isinstance(position, dict) else ''
        action = "SELL" if side in ("BUY", "LONG") else "BUY"

        # Get current price for LIMIT order
        current_price = self.broker.get_ltp(symbol) if hasattr(self.broker, 'get_ltp') else 0

        # Apply price buffer for safety
        if current_price > 0:
            if action == "BUY":
                exit_price = round(current_price * (1 + self.config.price_buffer_pct / 100), 2)
            else:
                exit_price = round(current_price * (1 - self.config.price_buffer_pct / 100), 2)
        else:
            exit_price = None

        # Create LIMIT order for square-off
        order = Order(
            symbol=symbol,
            transaction_type=action,
            quantity=abs(qty),
            order_type=OrderType.LIMIT,
            price=exit_price,
            product_type=ProductType.INTRADAY
        )

        # Retry logic
        order_id = None
        last_error = None
        attempts = 0

        for attempt in range(self.config.max_retry_attempts):
            attempts = attempt + 1

            if hasattr(self.broker, 'place_order'):
                order_id = self.broker.place_order(order)

                if order_id:
                    result = SquareOffStatus.SUCCESS
                    break
                else:
                    last_error = f"Attempt {attempts} failed to place square-off order"
                    order = Order(
                        symbol=symbol,
                        transaction_type=action,
                        quantity=abs(qty),
                        order_type=OrderType.LIMIT,
                        price=exit_price,
                        product_type=ProductType.INTRADAY
                    )
            else:
                last_error = "Broker does not support order placement"
                break

            if attempts < self.config.max_retry_attempts:
                time.sleep(self.config.retry_delay_seconds)

        # Calculate PnL if order filled
        realised_pnl = 0.0
        if order_id and hasattr(self.broker, 'get_order_by_id'):
            try:
                filled_order = self.broker.get_order_by_id(order_id)
                if filled_order:
                    exec_price = getattr(filled_order, 'avg_fill_price', 0) or (filled_order.get('avg_fill_price', 0) if isinstance(filled_order, dict) else 0)
                    if exec_price > 0 and entry_price > 0:
                        direction = 1 if side in ("BUY", "LONG") else -1
                        realised_pnl = direction * (exec_price - entry_price) * abs(qty)
            except Exception as e:
                self.logger.warning(f"Could not get fill price for {order_id}: {e}")

        return SquareOffResult(
            status=result if result else SquareOffStatus.FAILED,
            symbol=symbol,
            quantity=qty,
            entry_price=entry_price,
            exit_price=exit_price or current_price,
            realised_pnl=realised_pnl,
            order_id=order_id,
            retry_count=attempts,
            error=last_error
        )

    def square_off_all(self, wait_for_fill: bool = True, timeout_seconds: float = 30.0) -> Dict[str, Any]:
        """
        Square off all open positions.

        Returns summary of all square-off operations.
        """
        results = {
            "closed": [],
            "failed": [],
            "total_realised_pnl": 0.0,
            "remaining_positions": 0,
            "timestamp": datetime.now().isoformat()
        }

        # Get all positions
        if not hasattr(self.broker, 'get_positions'):
            results["failed"].append({
                "symbol": "ALL",
                "reason": "Broker does not support position query"
            })
            return results

        positions = self.broker.get_positions()

        if not positions:
            results["closed"].append({
                "symbol": "N/A",
                "reason": "No positions to close"
            })
            return results

        # Square off each position
        for pos in positions:
            symbol = getattr(pos, 'symbol', '') or (pos.get('symbol', '') if isinstance(pos, dict) else '')
            if not symbol:
                continue

            sq_result = self.square_off_symbol(symbol)

            if sq_result.status == SquareOffStatus.SUCCESS:
                results["closed"].append({
                    "symbol": symbol,
                    "order_id": sq_result.order_id,
                    "realised_pnl": sq_result.realised_pnl
                })
                results["total_realised_pnl"] += sq_result.realised_pnl
            elif sq_result.status == SquareOffStatus.NO_POSITIONS:
                pass  # Already closed
            else:
                results["failed"].append({
                    "symbol": symbol,
                    "reason": sq_result.error
                })

        # Check for remaining positions
        if hasattr(self.broker, 'get_positions'):
            remaining = self.broker.get_positions()
            results["remaining_positions"] = len([p for p in remaining if (getattr(p, 'net_quantity', 0) or 0) != 0])

        self.logger.info(
            f"EOD Square-Off: {len(results['closed'])} closed, "
            f"{len(results['failed'])} failed, PnL: ₹{results['total_realised_pnl']:,.2f}"
        )

        return results

    def schedule_squareoff(self) -> None:
        """Schedule EOD square-off at calculated time."""
        self._scheduled_time = self.calculate_squareoff_time()
        self._is_active = True
        self.logger.info(f"EOD Square-Off scheduled for {self._scheduled_time}")

    def cancel_schedule(self) -> None:
        """Cancel scheduled EOD square-off."""
        self._is_active = False
        self._scheduled_time = None
        self.logger.info("EOD Square-Off schedule cancelled")

    def get_history(self, limit: int = 100) -> List[Dict[str, Any]]:
        """Get historical square-off results."""
        return [r.to_dict() for r in self._results[-limit:]]


# Factory function
def create_eod_squareoff(broker: BrokerAdapter) -> EODFailover:
    """Create EOD square-off manager."""
    return EODFailover(broker)