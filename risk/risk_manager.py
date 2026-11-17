"""
Risk Management Module
Enforces max daily loss, per-trade stop-loss, trailing stop-loss, emergency kill switch
"""

import logging
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import Optional, Dict, List, Any, Callable

# deferred import below


class RiskAction(Enum):
    """Risk management action enumeration."""
    PASS = "PASS"
    REDUCE = "REDUCE"
    REJECT = "REJECT"
    CLOSE_ALL = "CLOSE_ALL"


from core.broker_adapter import Order


@dataclass
class RiskMetrics:
    """Current risk metrics."""
    daily_pnl: float = 0.0
    daily_trades: int = 0
    active_positions: int = 0
    total_capital: float = 0.0
    used_margin: float = 0.0
    available_capital: float = 0.0
    drawdown_pct: float = 0.0


@dataclass
class PositionTracker:
    """Track position details for risk calculations."""
    symbol: str
    entry_price: float
    current_price: float
    quantity: int
    direction: int  # 1 for long, -1 for short
    entry_time: datetime
    stop_loss: float
    target: float
    trailing_stop: float = 0.0
    max_price: float = 0.0  # For trailing stop tracking
    min_price: float = 0.0  # For short trailing stop

    def unrealised_pnl(self) -> float:
        """Calculate unrealised P&L."""
        if self.direction > 0:
            return (self.current_price - self.entry_price) * self.quantity
        else:
            return (self.entry_price - self.current_price) * abs(self.quantity)

    def should_exit(self) -> bool:
        """Check if position should be exited based on stop loss or target."""
        if self.direction > 0:
            return (self.current_price <= self.stop_loss or
                    self.current_price >= self.target)
        else:
            return (self.current_price >= self.stop_loss or
                    self.current_price <= self.target)


class RiskManager:
    """
    Risk Management subsystem for AuraTrader-AngelOne.

    Features:
    - Maximum daily loss limit
    - Per-trade stop-loss
    - Trailing stop-loss
    - Emergency kill switch
    - Position sizing
    - Drawdown protection
    """

    def __init__(
        self,
        max_daily_loss: float = 500.0,
        max_per_trade_risk: float = 100.0,
        stop_loss_pct: float = 2.0,
        trailing_stop_pct: float = 1.0,
        max_positions: int = 5,
        max_drawdown_pct: float = 5.0,
        emergency_kill_switch: bool = False
    ):
        """
        Initialize Risk Manager.

        Args:
            max_daily_loss: Maximum loss per day in INR 
            max_per_trade_risk: Maximum loss per trade in INR 
            stop_loss_pct: Stop loss as percentage
            trailing_stop_pct: Trailing stop as percentage
            max_positions: Maximum concurrent positions
            max_drawdown_pct: Maximum drawdown percentage
            emergency_kill_switch: Enable emergency kill switch
        """
        # Risk limits
        self.max_daily_loss = max_daily_loss
        self.max_per_trade_risk = max_per_trade_risk
        self.stop_loss_pct = stop_loss_pct
        self.trailing_stop_pct = trailing_stop_pct
        self.max_positions = max_positions
        self.max_drawdown_pct = max_drawdown_pct

        # State
        self._emergency_kill_switch = emergency_kill_switch
        self._kill_switch_triggered = False
        self._daily_pnl = 0.0
        self._daily_trades = 0
        self._daily_loss_exceeded = False
        self._capital_base = 0.0

        # Position tracking
        self._positions: Dict[str, PositionTracker] = {}
        self._position_history: deque = deque(maxlen=1000)

        # Risk callbacks
        self._risk_violation_callbacks: List[Callable[[str, RiskAction], None]] = []
        self._kill_switch_callbacks: List[Callable[[], None]] = []

        # Logger
        self.logger = logging.getLogger(f"{__name__}.RiskManager")
        self.logger.setLevel(logging.INFO)

        # Register for engine events
        self._setup_event_handlers()

    def _setup_event_handlers(self) -> None:
        """Set up event handlers."""
        # Handle position updates and P&L changes
        pass

    def set_capital(self, capital: float) -> None:
        """Set the base capital for risk calculations."""
        self._capital_base = capital
        self.logger.info(f"Capital set to INR {capital:,.2f}")

    def update_position(self, symbol: str, current_price: float, **kwargs) -> None:
        """
        Update position with current market data.

        Args:
            symbol: Symbol
            current_price: Current market price
            **kwargs: Additional position data
        """
        if symbol not in self._positions:
            return

        pos = self._positions[symbol]
        pos.current_price = current_price

        # Update trailing stop for long positions
        if pos.direction > 0:
            if current_price > pos.max_price:
                pos.max_price = current_price
                pos.trailing_stop = current_price * (1 - self.trailing_stop_pct / 100)

        # Update trailing stop for short positions
        elif pos.direction < 0:
            if current_price < pos.min_price:
                pos.min_price = current_price
                pos.trailing_stop = current_price * (1 + self.trailing_stop_pct / 100)

    def add_position(
        self,
        symbol: str,
        entry_price: float,
        quantity: int,
        direction: int,
        stop_loss: float,
        target: float
    ) -> bool:
        """
        Add a new position to track.

        Args:
            symbol: Symbol
            entry_price: Entry price
            quantity: Quantity
            direction: 1 for long, -1 for short
            stop_loss: Stop loss price
            target: Target price

        Returns:
            True if position added successfully
        """
        if len(self._positions) >= self.max_positions:
            self._notify_risk_violation(f"Max positions ({self.max_positions}) reached", RiskAction.REJECT)
            return False

        self._positions[symbol] = PositionTracker(
            symbol=symbol,
            entry_price=entry_price,
            current_price=entry_price,
            quantity=quantity,
            direction=direction,
            entry_time=datetime.now(),
            stop_loss=stop_loss,
            target=target
        )

        self.logger.info(f"Position tracking started: {symbol} ({direction} {quantity} @ {entry_price})")
        return True

    def remove_position(self, symbol: str) -> None:
        """Remove a position from tracking."""
        if symbol in self._positions:
            pos = self._positions.pop(symbol)
            self._position_history.append(pos)
            self.logger.info(f"Position removed: {symbol}")

    def check_daily_loss(self, current_pnl: float) -> bool:
        """
        Check if daily loss limit has been exceeded.

        Args:
            current_pnl: Current day's P&L

        Returns:
            True if within limits, False if exceeded
        """
        self._daily_pnl = current_pnl

        if current_pnl <= -self.max_daily_loss:
            if not self._daily_loss_exceeded:
                self._daily_loss_exceeded = True
                self.logger.warning(f"Daily loss limit exceeded: INR {current_pnl:,.2f}")
                self._notify_risk_violation(
                    f"Daily loss limit exceeded: INR {current_pnl:,.2f}",
                    RiskAction.CLOSE_ALL
                )
                self._trigger_kill_switch()
            return False

        # Reset if we're in profit
        if current_pnl > 0:
            self._daily_loss_exceeded = False

        return True

    def evaluate_order(self, order: Order, market_price: float) -> RiskAction:
        """
        Evaluate an order against risk rules.

        Args:
            order: Order to evaluate
            market_price: Current market price

        Returns:
            RiskAction - decision on the order
        """
        # Check kill switch
        if self._kill_switch_triggered:
            self.logger.warning(f"Kill switch active - rejecting order for {order.symbol}")
            return RiskAction.REJECT

        # Check daily loss
        if self._daily_loss_exceeded:
            self.logger.warning(f"Daily loss exceeded - rejecting order for {order.symbol}")
            return RiskAction.CLOSE_ALL

        # Calculate potential risk per trade
        if order.product_type.value == "CNC":  # Cash and carry
            max_risk = self._calculate_max_risk_cnc(order, market_price)
        else:
            max_risk = self._calculate_max_risk_intraday(order, market_price)

        if max_risk > self.max_per_trade_risk:
            self.logger.warning(f"Risk per trade INR {max_risk:,.2f} exceeds limit INR {self.max_per_trade_risk:,.2f}")
            return RiskAction.REDUCE

        # Check if adding this position would exceed max positions
        if len(self._positions) >= self.max_positions:
            if order.symbol not in self._positions:
                self._notify_risk_violation(f"Max positions limit reached", RiskAction.REJECT)
                return RiskAction.REJECT

        return RiskAction.PASS

    def _calculate_max_risk_cnc(self, order: Order, market_price: float) -> float:
        """Calculate maximum risk for cash and carry (CNC) orders."""
        # For CNC, we're buying outright, risk is based on stop loss
        position_value = order.price * order.quantity if order.price else market_price * order.quantity

        # FIX: Use configurable stop_loss_pct instead of hardcoded 0.5%
        stop_loss = market_price * (1 - self.stop_loss_pct / 100)
        risk_per_share = market_price - stop_loss

        return risk_per_share * order.quantity

    def _calculate_max_risk_intraday(self, order: Order, market_price: float) -> float:
        """Calculate maximum risk for intraday orders."""
        position_value = market_price * order.quantity
        risk_amount = position_value * (self.stop_loss_pct / 100)
        return risk_amount

    def calculate_stop_loss(self, entry_price: float, stop_loss_pct: Optional[float] = None) -> float:
        """Calculate stop loss price."""
        pct = stop_loss_pct or self.stop_loss_pct
        return entry_price * (1 - pct / 100)

    def calculate_trailing_stop(self, current_price: float, direction: int) -> float:
        """Calculate trailing stop price."""
        if direction > 0:  # Long
            return current_price * (1 - self.trailing_stop_pct / 100)
        else:  # Short
            return current_price * (1 + self.trailing_stop_pct / 100)

    def check_drawdown(self, equity: float) -> bool:
        """
        Check if drawdown limit exceeded.

        Args:
            equity: Current equity value

        Returns:
            True if within limits
        """
        if self._capital_base == 0:
            return True

        drawdown = (self._capital_base - equity) / self._capital_base * 100

        if drawdown > self.max_drawdown_pct:
            self.logger.warning(f"Drawdown limit exceeded: {drawdown:.2f}%")
            self._notify_risk_violation(
                f"Drawdown limit exceeded: {drawdown:.2f}%",
                RiskAction.CLOSE_ALL
            )
            self._trigger_kill_switch()
            return False

        return True

    def _trigger_kill_switch(self) -> None:
        """Trigger emergency kill switch."""
        if self._emergency_kill_switch and not self._kill_switch_triggered:
            self._kill_switch_triggered = True
            self.logger.critical("EMERGENCY KILL SWITCH ACTIVATED")
            for callback in self._kill_switch_callbacks:
                try:
                    callback()
                except Exception as e:
                    self.logger.error(f"Error in kill switch callback: {e}")

    def reset_kill_switch(self) -> None:
        """Reset the kill switch."""
        self._kill_switch_triggered = False
        self.logger.info("Kill switch reset")

    def is_kill_switch_active(self) -> bool:
        """Check if kill switch is active."""
        return self._kill_switch_triggered

    def should_exit_position(self, symbol: str, current_price: float) -> Optional[str]:
        """
        Check if position should be exited.

        Args:
            symbol: Symbol
            current_price: Current market price

        Returns:
            Exit reason if should exit, None otherwise
        """
        if symbol not in self._positions:
            return None

        pos = self._positions[symbol]
        pos.current_price = current_price

        # Check stop loss
        if pos.direction > 0:
            if current_price <= pos.stop_loss:
                return "stop_loss"
            if current_price >= pos.target:
                return "target"
        else:
            if current_price >= pos.stop_loss:
                return "stop_loss"
            if current_price <= pos.target:
                return "target"

        # Check trailing stop
        if pos.trailing_stop > 0:
            if pos.direction > 0 and current_price <= pos.trailing_stop:
                return "trailing_stop"
            elif pos.direction < 0 and current_price >= pos.trailing_stop:
                return "trailing_stop"

        return None

    def get_metrics(self) -> RiskMetrics:
        """Get current risk metrics."""
        total_pnl = sum(pos.unrealised_pnl() for pos in self._positions.values())
        daily_pnl = self._daily_pnl + total_pnl

        return RiskMetrics(
            daily_pnl=daily_pnl,
            daily_trades=self._daily_trades,
            active_positions=len(self._positions),
            total_capital=self._capital_base,
            used_margin=sum(abs(pos.quantity * pos.current_price) for pos in self._positions.values()),
            available_capital=self._capital_base - sum(abs(pos.unrealised_pnl()) for pos in self._positions.values()) if self._capital_base else 0,
            drawdown_pct=0.0  # Would need max equity for proper calculation
        )

    def get_positions(self) -> Dict[str, PositionTracker]:
        """Get all tracked positions."""
        return self._positions.copy()

    def get_daily_pnl(self) -> float:
        """Get daily P&L."""
        return self._daily_pnl

    def increment_trade_count(self) -> None:
        """Increment daily trade count."""
        self._daily_trades += 1

    def reset_daily(self) -> None:
        """Reset daily metrics - never archive live positions."""
        # Check for unresolved live positions - do not reset if positions exist
        if self._positions:
            self.logger.warning("Daily reset: Cannot reset with unresolved live positions - preserving state")
            return  # Do NOT reset daily metrics while positions are open

        self._daily_pnl = 0.0
        self._daily_trades = 0
        self._daily_loss_exceeded = False
        self.logger.info("Daily risk metrics reset")

    def register_risk_violation_callback(self, callback: Callable[[str, RiskAction], None]) -> None:
        """Register callback for risk violations."""
        self._risk_violation_callbacks.append(callback)

    def register_kill_switch_callback(self, callback: Callable[[], None]) -> None:
        """Register callback for kill switch activation."""
        self._kill_switch_callbacks.append(callback)

    def _notify_risk_violation(self, message: str, action: RiskAction) -> None:
        """Notify registered callbacks of risk violation."""
        self.logger.warning(f"Risk violation: {message} -> {action.value}")
        for callback in self._risk_violation_callbacks:
            try:
                callback(message, action)
            except Exception as e:
                self.logger.error(f"Error in risk violation callback: {e}")

    def set_kill_switch_enabled(self, enabled: bool) -> None:
        """Enable or disable kill switch."""
        self._emergency_kill_switch = enabled
        status = "enabled" if enabled else "disabled"
        self.logger.info(f"Kill switch {status}")

    def get_kill_switch_status(self) -> bool:
        """Get kill switch status."""
        return self._kill_switch_triggered


@dataclass
class RiskConfig:
    """Risk configuration dataclass."""
    max_daily_loss: float = 500.0
    max_per_trade_risk: float = 100.0
    stop_loss_pct: float = 2.0
    trailing_stop_pct: float = 1.0
    max_positions: int = 5
    max_drawdown_pct: float = 5.0
    enable_kill_switch: bool = True