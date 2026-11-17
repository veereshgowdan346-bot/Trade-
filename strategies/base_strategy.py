"""
Abstract Base Strategy
All trading strategies must inherit from this class
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Optional, Dict, List, Any, Callable
from collections import deque


class StrategySignal(Enum):
    """Trading signal enumeration."""
    BUY = "BUY"
    SELL = "SELL"
    HOLD = "HOLD"
    EXIT = "EXIT"


@dataclass
class Signal:
    """Trading signal from a strategy."""
    strategy_name: str
    signal_type: StrategySignal
    symbol: str
    confidence: float  # 0.0 to 1.0
    timestamp: datetime = field(default_factory=datetime.now)
    timestamp_bar: datetime = field(default_factory=datetime.now)

    # Technical indicators
    indicators: Dict[str, float] = field(default_factory=dict)

    # Position sizing
    suggested_size: float = 1.0  # As fraction of capital

    # Exit conditions
    stop_loss_price: Optional[float] = None
    target_price: Optional[float] = None

    # Additional metadata
    metadata: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "strategy_name": self.strategy_name,
            "signal_type": self.signal_type.value,
            "symbol": self.symbol,
            "confidence": self.confidence,
            "timestamp": self.timestamp.isoformat(),
            "timestamp_bar": self.timestamp_bar.isoformat(),
            "indicators": self.indicators,
            "suggested_size": self.suggested_size,
            "stop_loss_price": self.stop_loss_price,
            "target_price": self.target_price,
            "metadata": self.metadata
        }


class BaseStrategy(ABC):
    """
    Abstract base class for all trading strategies.

    Strategies receive tick data and emit trading signals.
    Each strategy maintains its own state and can have multiple symbols.
    """

    def __init__(
        self,
        name: str,
        symbols: List[str],
        parameters: Optional[Dict[str, Any]] = None
    ):
        """
        Initialize base strategy.

        Args:
            name: Strategy name
            symbols: List of symbols this strategy trades
            parameters: Strategy parameters
        """
        self.name = name
        self.symbols = symbols
        self.parameters = parameters or {}

        # State
        self._is_active = False
        self._positions: Dict[str, Dict[str, Any]] = {}

        # Data buffers
        self._bars: Dict[str, deque] = {}
        self._prices: Dict[str, deque] = {}

        # Callback for signals
        self._signal_callback: Optional[Callable[[Signal], None]] = None

        # Performance tracking
        self._signal_count = 0
        self._win_count = 0
        self._loss_count = 0
        self._last_signal_time: Optional[datetime] = None

        # Bars configuration
        self._bar_length = self.parameters.get('bar_length', 1)  # minutes
        self._bar_buffer_size = self.parameters.get('bar_buffer_size', 500)

        # Initialize buffers
        for symbol in symbols:
            self._bars[symbol] = deque(maxlen=self._bar_buffer_size)
            self._prices[symbol] = deque(maxlen=self._bar_buffer_size)

    @property
    def is_active(self) -> bool:
        """Check if strategy is active."""
        return self._is_active

    @property
    def position(self) -> float:
        """Current position (long +1, short -1, flat 0)."""
        if not self._positions:
            return 0.0
        return sum(p.get('direction', 0) for p in self._positions.values())

    @property
    def metrics(self) -> Dict[str, Any]:
        """Get strategy metrics."""
        return {
            "name": self.name,
            "active": self._is_active,
            "symbols": len(self.symbols),
            "signal_count": self._signal_count,
            "win_rate": self._win_count / max(1, self._win_count + self._loss_count),
            "last_signal": self._last_signal_time.isoformat() if self._last_signal_time else None
        }

    def activate(self) -> None:
        """Activate the strategy."""
        self._is_active = True

    def deactivate(self) -> None:
        """Deactivate the strategy."""
        self._is_active = False

    def set_signal_callback(self, callback: Callable[[Signal], None]) -> None:
        """Set callback for trading signals."""
        self._signal_callback = callback

    def on_tick(self, symbol: str, price: float, timestamp: datetime, **kwargs) -> None:
        """
        Process incoming tick data.

        Args:
            symbol: Symbol
            price: Current price
            timestamp: Timestamp
            **kwargs: Additional market data
        """
        raise NotImplementedError("Subclasses must implement on_tick")

    def on_bar(self, symbol: str, bar: Dict[str, Any]) -> None:
        """
        Process completed bar data.

        Args:
            symbol: Symbol
            bar: OHLCV bar dictionary
        """
        raise NotImplementedError("Subclasses must implement on_bar")

    def generate_signal(self, signal: Signal) -> None:
        """
        Generate a trading signal.

        Args:
            signal: Trading signal
        """
        self._signal_count += 1
        self._last_signal_time = signal.timestamp

        if self._signal_callback:
            self._signal_callback(signal)

    def update_position(self, symbol: str, position: Dict[str, Any]) -> None:
        """
        Update position for a symbol.

        Args:
            symbol: Symbol
            position: Position dictionary with 'direction', 'quantity', 'avg_price'
        """
        self._positions[symbol] = position

    def add_bar(self, symbol: str, bar: Dict[str, Any]) -> None:
        """
        Add a bar to the buffer.

        Args:
            symbol: Symbol
            bar: OHLCV bar
        """
        self._bars[symbol].append(bar)
        if 'close' in bar:
            self._prices[symbol].append(bar['close'])

    def get_recent_bars(self, symbol: str, count: int = 50) -> List[Dict[str, Any]]:
        """Get recent bars for a symbol."""
        bars = list(self._bars.get(symbol, []))
        return bars[-count:] if bars else []

    def get_recent_prices(self, symbol: str, count: int = 50) -> List[float]:
        """Get recent prices for a symbol."""
        prices = list(self._prices.get(symbol, []))
        return prices[-count:] if prices else []

    @abstractmethod
    def calculate_indicators(self, data: Dict[str, Any]) -> Dict[str, float]:
        """
        Calculate technical indicators.

        Args:
            data: Market data dictionary

        Returns:
            Dictionary of indicator values
        """
        pass

    @abstractmethod
    def evaluate_signal(self, symbol: str, **kwargs) -> Optional[Signal]:
        """
        Evaluate whether to generate a signal.

        Args:
            symbol: Symbol to evaluate
            **kwargs: Additional data

        Returns:
            Signal if one is generated, None otherwise
        """
        pass

    def reset_metrics(self) -> None:
        """Reset strategy metrics."""
        self._signal_count = 0
        self._win_count = 0
        self._loss_count = 0
        self._last_signal_time = None

    def record_result(self, won: bool) -> None:
        """Record a trade result."""
        if won:
            self._win_count += 1
        else:
            self._loss_count += 1

    def get_params(self, key: str, default: Any = None) -> Any:
        """Get a parameter value."""
        return self.parameters.get(key, default)

    def set_params(self, key: str, value: Any) -> None:
        """Set a parameter value."""
        self.parameters[key] = value

    def __repr__(self) -> str:
        return f"<{self.__class__.__name__}: {self.name} (active={self._is_active})>"