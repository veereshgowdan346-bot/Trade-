"""
EMA (Exponential Moving Average) Crossover Strategy
Generates buy signals when fast EMA crosses above slow EMA and sell signals when it crosses below.
"""

import math
from collections import deque
from datetime import datetime
from typing import Optional, Dict, List, Any

from .base_strategy import BaseStrategy, Signal, StrategySignal


class EMACrossoverStrategy(BaseStrategy):
    """
    EMA Crossover mean reversion strategy.

    Logic:
    - Fast EMA crosses above Slow EMA: BUY signal
    - Fast EMA crosses below Slow EMA: SELL signal
    - Uses EMA instead of SMA for faster reaction

    Parameters:
    - fast_ema_period: Fast EMA period (default 9)
    - slow_ema_period: Slow EMA period (default 21)
    - ema_source: Price source for EMA (close, typical, median, weighted)
    - cross_threshold: Minimum cross magnitude to avoid noise
    - min_momentum: Minimum price momentum to confirm signal
    """

    def __init__(
        self,
        symbols: List[str],
        parameters: Optional[Dict[str, Any]] = None
    ):
        super().__init__("ema_crossover", symbols, parameters)

        # EMA parameters
        self._fast_period = self.get_params('fast_period', 9)
        self._slow_period = self.get_params('slow_period', 21)
        self._source = self.get_params('ema_source', 'close')
        self._cross_threshold = self.get_params('cross_threshold', 0.01)  # %
        self._min_momentum = self.get_params('min_momentum', 0.05)  # %

        # EMA state for each symbol
        self._fast_ema: Dict[str, float] = {}
        self._slow_ema: Dict[str, float] = {}
        self._prev_fast_ema: Dict[str, float] = {}
        self._prev_slow_ema: Dict[str, float] = {}

        # Cross detection state
        self._last_cross_direction: Dict[str, int] = {}  # 1 for above, -1 for below

        # Momentum tracking
        self._momentum_window = self.get_params('momentum_window', 10)

        # Initialize state
        for symbol in symbols:
            self._fast_ema[symbol] = 0.0
            self._slow_ema[symbol] = 0.0
            self._prev_fast_ema[symbol] = 0.0
            self._prev_slow_ema[symbol] = 0.0
            self._last_cross_direction[symbol] = 0

    def _calculate_ema(self, price: float, ema_prev: float, period: int) -> float:
        """Calculate EMA value."""
        if ema_prev == 0:
            return price
        multiplier = 2 / (period + 1)
        return (price * multiplier) + (ema_prev * (1 - multiplier))

    def _get_source_price(self, bar: Dict[str, Any]) -> float:
        """Get price source based on configuration."""
        if self._source == 'close':
            return bar.get('close', bar.get('open', 0))
        elif self._source == 'high':
            return bar.get('high', bar.get('close', 0))
        elif self._source == 'low':
            return bar.get('low', bar.get('close', 0))
        elif self._source == 'typical':
            high = bar.get('high', 0)
            low = bar.get('low', 0)
            close = bar.get('close', 0)
            return (high + low + close) / 3
        elif self._source == 'median':
            high = bar.get('high', 0)
            low = bar.get('low', 0)
            return (high + low) / 2
        elif self._source == 'weighted':
            close = bar.get('close', 0)
            high = bar.get('high', 0)
            low = bar.get('low', 0)
            return (high + close + close + low) / 4
        return bar.get('close', 0)

    def calculate_indicators(self, data: Dict[str, Any]) -> Dict[str, float]:
        """
        Calculate EMA and crossover indicators.

        Returns values for current and previous EMAs, cross status, and momentum.
        """
        symbol = data['symbol']
        bars = self.get_recent_bars(symbol, max(100, self._slow_period + 10))

        if len(bars) < self._slow_period:
            return {
                'fast_ema': 0, 'slow_ema': 0, 'cross': 0,
                'momentum': 0, 'cross_confirmed': False
            }

        # Calculate EMAs from scratch for accuracy
        fast_ema = None
        slow_ema = None

        for bar in bars:
            price = self._get_source_price(bar)

            if fast_ema is None:
                fast_ema = price
            else:
                fast_ema = self._calculate_ema(price, fast_ema, self._fast_period)

            if slow_ema is None:
                slow_ema = price
            else:
                slow_ema = self._calculate_ema(price, slow_ema, self._slow_period)

        # Store current values
        self._prev_fast_ema[symbol] = self._fast_ema[symbol]
        self._prev_slow_ema[symbol] = self._slow_ema[symbol]
        self._fast_ema[symbol] = fast_ema or 0
        self._slow_ema[symbol] = slow_ema or 0

        # Detect cross
        prev_diff = (self._prev_fast_ema[symbol] - self._prev_slow_ema[symbol]) if self._prev_fast_ema[symbol] else 0
        curr_diff = (self._fast_ema[symbol] - self._slow_ema[symbol]) if self._fast_ema[symbol] else 0

        # Determine cross direction
        cross = 0  # 0 = no cross, 1 = bullish cross, -1 = bearish cross
        if prev_diff < 0 and curr_diff > 0:
            cross = 1  # Bullish cross
        elif prev_diff > 0 and curr_diff < 0:
            cross = -1  # Bearish cross

        # Calculate momentum
        prices = [self._get_source_price(b) for b in bars[-self._momentum_window:]]
        if len(prices) >= 2:
            momentum = ((prices[-1] - prices[0]) / prices[0]) * 100
        else:
            momentum = 0

        return {
            'fast_ema': self._fast_ema[symbol],
            'slow_ema': self._slow_ema[symbol],
            'cross': cross,
            'momentum': momentum,
            'fast_ema_pct': (curr_diff / self._slow_ema[symbol] * 100) if self._slow_ema[symbol] else 0
        }

    def on_tick(self, symbol: str, price: float, timestamp: datetime, **kwargs) -> None:
        """Process incoming tick."""
        volume = kwargs.get('volume', 0)

        # Update price buffer
        self.add_bar(symbol, {
            'timestamp': timestamp,
            'open': price,
            'high': price,
            'low': price,
            'close': price,
            'volume': volume
        })

        # Calculate indicators
        indicators = self.calculate_indicators({'symbol': symbol})

        # Evaluate signal
        signal = self.evaluate_signal(symbol, **indicators)
        if signal:
            self.generate_signal(signal)

    def on_bar(self, symbol: str, bar: Dict[str, Any]) -> None:
        """Process completed bar."""
        self.add_bar(symbol, bar)

    def evaluate_signal(self, symbol: str, **kwargs) -> Optional[Signal]:
        """
        Evaluate EMA crossover signal conditions with momentum filter.
        """
        cross = kwargs.get('cross', 0)
        fast_ema = kwargs.get('fast_ema', 0)
        slow_ema = kwargs.get('slow_ema', 0)
        momentum = kwargs.get('momentum', 0)
        fast_ema_diff = kwargs.get('fast_ema_pct', 0)

        # Skip if no cross
        if cross == 0:
            return None

        # Check threshold
        if abs(fast_ema_diff) < self._cross_threshold:
            return None

        # Check momentum
        if abs(momentum) < self._min_momentum:
            return None

        # Bullish cross (buy signal)
        if cross == 1:
            return Signal(
                strategy_name=self.name,
                signal_type=StrategySignal.BUY,
                symbol=symbol,
                confidence=min(1.0, abs(momentum) / self._min_momentum),
                indicators={
                    'fast_ema': fast_ema,
                    'slow_ema': slow_ema,
                    'cross_magnitude': fast_ema_diff,
                    'momentum': momentum
                },
                stop_loss_price=slow_ema * (1 - self._min_momentum / 100),
                target_price=slow_ema * (1 + 2 * self._min_momentum / 100),
                suggested_size=0.7
            )

        # Bearish cross (sell signal)
        elif cross == -1:
            return Signal(
                strategy_name=self.name,
                signal_type=StrategySignal.SELL,
                symbol=symbol,
                confidence=min(1.0, abs(momentum) / self._min_momentum),
                indicators={
                    'fast_ema': fast_ema,
                    'slow_ema': slow_ema,
                    'cross_magnitude': fast_ema_diff,
                    'momentum': momentum
                },
                target_price=slow_ema * (1 + self._min_momentum / 100),
                stop_loss_price=slow_ema * (1 - 2 * self._min_momentum / 100),
                suggested_size=1.0
            )

        return None

    def get_ema_values(self, symbol: str) -> Dict[str, float]:
        """Get current EMA values for a symbol."""
        return {
            'fast_ema': self._fast_ema.get(symbol, 0),
            'slow_ema': self._slow_ema.get(symbol, 0)
        }

    def reset_ema_state(self, symbol: Optional[str] = None) -> None:
        """Reset EMA state for a symbol or all symbols."""
        if symbol:
            self._fast_ema[symbol] = 0.0
            self._slow_ema[symbol] = 0.0
            self._prev_fast_ema[symbol] = 0.0
            self._prev_slow_ema[symbol] = 0.0
            self._last_cross_direction[symbol] = 0
        else:
            for sym in self.symbols:
                self.reset_ema_state(sym)

    def reset_metrics(self) -> None:
        """Override reset to also reset EMA state."""
        super().reset_metrics()
        self.reset_ema_state()