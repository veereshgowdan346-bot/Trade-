"""
VWAP (Volume Weighted Average Price) Strategy
Generates buy signals when price crosses above VWAP and sell signals when price crosses below.
"""

import math
from collections import deque
from datetime import datetime, timedelta
from typing import Optional, Dict, List, Any

from .base_strategy import BaseStrategy, Signal, StrategySignal


class VWAPStrategy(BaseStrategy):
    """
    VWAP-based mean reversion strategy.

    Logic:
    - Buy when price crosses above VWAP by a threshold
    - Sell when price crosses below VWAP by a threshold
    - VWAP is calculated over the trading session

    Parameters:
    - vwap_threshold: Percentage distance from VWAP to trigger signal
    - session_start: Session start hour (default 9:15 for Indian markets)
    - session_end: Session end hour (default 15:30)
    - lookback_period: VWAP calculation period in minutes
    - min_volume: Minimum volume to consider (avoid illiquid periods)
    """

    def __init__(
        self,
        symbols: List[str],
        parameters: Optional[Dict[str, Any]] = None
    ):
        super().__init__("vwap_strategy", symbols, parameters)

        # VWAP parameters
        self._vwap_threshold = self.get_params('vwap_threshold', 0.2)  # 0.2%
        self._session_start = self.get_params('session_start', 9.5)  # 9:30 AM
        self._session_end = self.get_params('session_end', 15.5)  # 3:30 PM
        self._lookback_minutes = self.get_params('lookback_minutes', 60)
        self._min_volume = self.get_params('min_volume', 100)

        # VWAP calculation data
        self._cumulative_price_volume: Dict[str, float] = {}
        self._cumulative_volume: Dict[str, int] = {}

        # Trade tracking
        self._in_position: Dict[str, bool] = {}

        # Initialize tracking
        for symbol in symbols:
            self._cumulative_price_volume[symbol] = 0.0
            self._cumulative_volume[symbol] = 0
            self._in_position[symbol] = False

    def calculate_indicators(self, data: Dict[str, Any]) -> Dict[str, float]:
        """
        Calculate VWAP and related indicators.

        Args:
            data: Market data with 'price', 'volume', 'timestamp', 'symbol'

        Returns:
            Dictionary with VWAP, price distance, and direction
        """
        symbol = data['symbol']
        price = data.get('price', 0)
        volume = data.get('volume', 0)
        timestamp = data.get('timestamp', datetime.now())

        # Check if in session
        hour = timestamp.hour + timestamp.minute / 60

        if hour < self._session_start or hour >= self._session_end:
            return {
                'vwap': price,
                'price_vwap_distance': 0,
                'vwap_direction': 0,
                'in_session': False
            }

        # Update cumulative totals
        self._cumulative_price_volume[symbol] += price * volume
        self._cumulative_volume[symbol] += volume

        # Calculate VWAP
        if self._cumulative_volume[symbol] > 0:
            vwap = self._cumulative_price_volume[symbol] / self._cumulative_volume[symbol]
        else:
            vwap = price

        # Calculate price distance from VWAP
        distance = ((price - vwap) / vwap) * 100 if vwap > 0 else 0

        # Direction: positive = price above VWAP, negative = price below VWAP
        direction = 1 if price > vwap else (-1 if price < vwap else 0)

        return {
            'vwap': vwap,
            'price_vwap_distance': distance,
            'vwap_direction': direction,
            'in_session': True,
            'volume': volume,
            'cumulative_volume': self._cumulative_volume[symbol]
        }

    def on_tick(self, symbol: str, price: float, timestamp: datetime, **kwargs) -> None:
        """Process incoming tick."""
        volume = kwargs.get('volume', 0)

        # Calculate indicators
        indicators = self.calculate_indicators({
            'symbol': symbol,
            'price': price,
            'volume': volume,
            'timestamp': timestamp
        })

        # Update price buffer
        self.add_bar(symbol, {
            'timestamp': timestamp,
            'open': price,
            'high': price,
            'low': price,
            'close': price,
            'volume': volume
        })

        # Evaluate signal
        signal = self.evaluate_signal(symbol, **indicators)
        if signal:
            self.generate_signal(signal)

    def on_bar(self, symbol: str, bar: Dict[str, Any]) -> None:
        """Process completed bar - reset VWAP at session start if needed."""
        self.add_bar(symbol, bar)

        # Reset VWAP at session start
        bar_hour = bar['timestamp'].hour + bar['timestamp'].minute / 60
        if bar_hour == self._session_start:
            self._cumulative_price_volume[symbol] = bar['close'] * bar.get('volume', 0)
            self._cumulative_volume[symbol] = bar.get('volume', 0)

    def evaluate_signal(self, symbol: str, **kwargs) -> Optional[Signal]:
        """
        Evaluate VWAP signal conditions.

        Buy: Price > VWAP + threshold AND not already in position
        Sell: Price < VWAP - threshold AND in position
        """
        if not kwargs.get('in_session', False):
            return None

        distance = kwargs.get('price_vwap_distance', 0)
        vwap = kwargs.get('vwap', 0)
        volume = kwargs.get('volume', 0)

        # Skip low volume periods
        if volume < self._min_volume:
            return None

        # Check for buy signal
        if distance >= self._vwap_threshold and not self._in_position.get(symbol, False):
            return Signal(
                strategy_name=self.name,
                signal_type=StrategySignal.BUY,
                symbol=symbol,
                confidence=min(1.0, distance / self._vwap_threshold),
                indicators={'vwap': vwap, 'distance': distance},
                stop_loss_price=vwap * (1 - self._vwap_threshold / 100),
                target_price=vwap * (1 + 2 * self._vwap_threshold / 100),
                suggested_size=0.5
            )

        # Check for sell signal
        if distance <= -self._vwap_threshold and self._in_position.get(symbol, False):
            return Signal(
                strategy_name=self.name,
                signal_type=StrategySignal.SELL,
                symbol=symbol,
                confidence=min(1.0, abs(distance) / self._vwap_threshold),
                indicators={'vwap': vwap, 'distance': distance},
                target_price=vwap * (1 - self._vwap_threshold / 100),
                stop_loss_price=vwap * (1 + 2 * self._vwap_threshold / 100),
                suggested_size=1.0
            )

        return None

    def update_position_status(self, symbol: str, is_long: bool) -> None:
        """Update position status for a symbol."""
        self._in_position[symbol] = is_long

    def reset_vwap(self, symbol: Optional[str] = None) -> None:
        """Reset VWAP cumulative calculations."""
        if symbol:
            self._cumulative_price_volume[symbol] = 0.0
            self._cumulative_volume[symbol] = 0
            self._in_position[symbol] = False
        else:
            for sym in self.symbols:
                self.reset_vwap(sym)

    def get_vwap(self, symbol: str) -> float:
        """Get current VWAP for a symbol."""
        if self._cumulative_volume[symbol] > 0:
            return self._cumulative_price_volume[symbol] / self._cumulative_volume[symbol]
        return 0.0

    def reset_metrics(self) -> None:
        """Override reset to also reset VWAP state."""
        super().reset_metrics()
        self.reset_vwap()