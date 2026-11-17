"""
SuperTrend Strategy
Trend-following strategy using SuperTrend indicator for buy/sell signals.
"""

import math
from collections import deque
from datetime import datetime
from typing import Optional, Dict, List, Any

from .base_strategy import BaseStrategy, Signal, StrategySignal


class SuperTrendStrategy(BaseStrategy):
    """
    SuperTrend trend-following strategy.

    SuperTrend is calculated as:
    - BasicTrend = (High + Low) / 2 + Multiplier * ATR
    - FinalTrend changes based on price crossing the basic trend

    Logic:
    - Price above SuperTrend: uptrend (BUY)
    - Price below SuperTrend: downtrend (SELL)

    Parameters:
    - atr_period: ATR calculation period (default 10)
    - multiplier: SuperTrend multiplier (default 3.0)
    - factor: Alternative name for multiplier
    - candle_lookback: Bars to use for trend confirmation
    """

    def __init__(
        self,
        symbols: List[str],
        parameters: Optional[Dict[str, Any]] = None
    ):
        super().__init__("supertrend_strategy", symbols, parameters)

        # SuperTrend parameters
        self._atr_period = self.get_params('atr_period', 10)
        self._multiplier = self.get_params('multiplier', 3.0)
        self._factor = self.get_params('factor', 3.0)  # Alternative parameter name

        # Use factor if multiplier not set
        if self._factor != 3.0 and self._multiplier == 3.0:
            self._multiplier = self._factor

        self._trend_confirm_bars = self.get_params('trend_confirm_bars', 3)

        # SuperTrend state per symbol
        self._super_trend: Dict[str, float] = {}
        self._trend_direction: Dict[str, int] = {}  # 1 = uptrend, -1 = downtrend
        self._prev_supertrend: Dict[str, float] = {}
        self._prev_trend: Dict[str, int] = {}
        self._atr_value: Dict[str, float] = {}

        # Initialize state
        for symbol in symbols:
            self._super_trend[symbol] = 0.0
            self._trend_direction[symbol] = 1  # Start with uptrend
            self._prev_supertrend[symbol] = 0.0
            self._prev_trend[symbol] = 1
            self._atr_value[symbol] = 0.0

    def _calculate_atr(self, symbol: str) -> float:
        """Calculate Average True Range."""
        bars = list(self._bars.get(symbol, []))

        if len(bars) < self._atr_period + 1:
            # Use simple average if not enough data
            closes = [b.get('close', 0) for b in bars[-min(14, len(bars)):]]
            if len(closes) < 2:
                return 0.0
            return sum(abs(closes[i] - closes[i-1]) for i in range(1, len(closes))) / (len(closes) - 1)

        # Calculate True Range for each bar
        tr_values = []
        for i in range(max(0, len(bars) - self._atr_period - 1), len(bars)):
            bar = bars[i]
            high = bar.get('high', 0)
            low = bar.get('low', 0)
            close = bar.get('close', 0)
            prev_close = bars[i-1].get('close', close) if i > 0 else close

            tr = max(
                high - low,
                abs(high - prev_close),
                abs(low - prev_close)
            )
            tr_values.append(tr)

        # Calculate EMA-style ATR
        if tr_values:
            atr = tr_values[-1]
            period = len(tr_values)
            for tr in tr_values[-period:-1]:
                atr = (atr * (period - 1) + tr) / period
            return atr
        return 0.0

    def _calculate_supertrend(
        self,
        symbol: str,
        bar: Dict[str, Any]
    ) -> tuple:
        """
        Calculate SuperTrend for a bar.

        Returns:
            Tuple of (supertrend_value, trend_direction)
        """
        close = bar.get('close', 0)
        high = bar.get('high', 0)
        low = bar.get('low', 0)

        # Calculate ATR
        atr = self._calculate_atr(symbol)
        self._atr_value[symbol] = atr

        if atr == 0:
            # No ATR data, use simple calculation
            hl2 = (high + low) / 2
            return hl2, self._trend_direction.get(symbol, 1)

        # Calculate basic UpperBand and LowerBand
        hl2 = (high + low) / 2
        upper_band = hl2 + self._multiplier * atr
        lower_band = hl2 - self._multiplier * atr

        # Determine trend direction and SuperTrend
        current_trend = self._trend_direction.get(symbol, 1)
        prev_supertrend = self._super_trend.get(symbol, hl2)

        # Uptrend logic
        if close > prev_supertrend:
            current_trend = 1
            if upper_band < prev_supertrend:
                supertrend = prev_supertrend
            else:
                supertrend = upper_band
        else:
            current_trend = -1
            if lower_band > prev_supertrend:
                supertrend = prev_supertrend
            else:
                supertrend = lower_band

        return supertrend, current_trend

    def calculate_indicators(self, data: Dict[str, Any]) -> Dict[str, float]:
        """Calculate SuperTrend and related indicators."""
        symbol = data['symbol']
        timestamp = data.get('timestamp', datetime.now())

        # Get latest bar
        bars = list(self._bars.get(symbol, []))
        if not bars:
            return {
                'super_trend': 0,
                'trend_direction': 1,
                'close_above_trend': 0,
                'atr': 0
            }

        latest_bar = bars[-1]
        supertrend, trend = self._calculate_supertrend(symbol, latest_bar)

        # Store previous values
        self._prev_supertrend[symbol] = self._super_trend.get(symbol, supertrend)
        self._prev_trend[symbol] = self._trend_direction.get(symbol, trend)

        # Store current values
        self._super_trend[symbol] = supertrend
        self._trend_direction[symbol] = trend

        close = latest_bar.get('close', 0)
        close_above_trend = close - supertrend if supertrend > 0 else 0

        return {
            'super_trend': supertrend,
            'trend_direction': trend,
            'close_above_trend': close_above_trend,
            'close': close,
            'trend_magnitude': abs(close_above_trend) if supertrend > 0 else 0,
            'atr': self._atr_value.get(symbol, 0)
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

        # Recalculate SuperTrend on completed bar
        self.calculate_indicators({'symbol': symbol})

    def evaluate_signal(self, symbol: str, **kwargs) -> Optional[Signal]:
        """
        Evaluate SuperTrend signal conditions.

        BUY: Close above SuperTrend (uptrend confirmed)
        SELL: Close below SuperTrend (downtrend confirmed) or trend reversal
        """
        trend_direction = int(kwargs.get('trend_direction', 1))
        supertrend = kwargs.get('super_trend', 0)
        close = kwargs.get('close', 0)
        trend_magnitude = kwargs.get('trend_magnitude', 0)
        atr = kwargs.get('atr', 0)
        close_above_trend = close - supertrend if supertrend > 0 else 0

        # Check for trend reversal
        prev_trend = self._prev_trend.get(symbol, trend_direction)

        if trend_direction != prev_trend:
            # Trend reversal detected
            if trend_direction == 1:
                # Uptrend started
                return Signal(
                    strategy_name=self.name,
                    signal_type=StrategySignal.BUY,
                    symbol=symbol,
                    confidence=min(1.0, trend_magnitude / (atr * 3) if atr > 0 else 0.5),
                    indicators={
                        'super_trend': supertrend,
                        'trend_direction': trend_direction,
                        'trend_change': True
                    },
                    stop_loss_price=close * 0.98,
                    target_price=close * 1.08,
                    suggested_size=0.6
                )
            else:
                # Downtrend started
                return Signal(
                    strategy_name=self.name,
                    signal_type=StrategySignal.SELL,
                    symbol=symbol,
                    confidence=min(1.0, abs(trend_magnitude) / (atr * 3) if atr > 0 else 0.5),
                    indicators={
                        'super_trend': supertrend,
                        'trend_direction': trend_direction,
                        'trend_change': True
                    },
                    target_price=close * 0.92,
                    stop_loss_price=close * 1.08,
                    suggested_size=1.0
                )

        # Check for position management signals
        # This could be extended for trailing stops or partial exits

        return None

    def get_supertrend_values(self, symbol: str) -> Dict[str, Any]:
        """Get current SuperTrend values for a symbol."""
        return {
            'super_trend': self._super_trend.get(symbol, 0),
            'trend_direction': self._trend_direction.get(symbol, 1),
            'is_uptrend': self._trend_direction.get(symbol, 1) == 1,
            'atr': self._atr_value.get(symbol, 0)
        }

    def is_uptrend(self, symbol: str) -> bool:
        """Check if symbol is in uptrend."""
        return self._trend_direction.get(symbol, 1) == 1

    def reset_state(self, symbol: Optional[str] = None) -> None:
        """Reset SuperTrend state for a symbol or all symbols."""
        if symbol:
            self._super_trend[symbol] = 0.0
            self._trend_direction[symbol] = 1
            self._prev_supertrend[symbol] = 0.0
            self._prev_trend[symbol] = 1
            self._atr_value[symbol] = 0.0

            # Clear bars for this symbol
            if symbol in self._bars:
                self._bars[symbol].clear()
            if symbol in self._prices:
                self._prices[symbol].clear()
        else:
            for sym in self.symbols:
                self.reset_state(sym)

    def reset_metrics(self) -> None:
        """Override reset to also reset SuperTrend state."""
        super().reset_metrics()
        self.reset_state()