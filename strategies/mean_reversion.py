"""
Mean Reversion Trading Strategy for AuraTrader-AngelOne.
Combines Bollinger Bands and Relative Strength Index (RSI) to capture statistical reversals.
"""

import math
from collections import deque
from datetime import datetime
from typing import Optional, Dict, List, Any

from .base_strategy import BaseStrategy, Signal, StrategySignal


class MeanReversionStrategy(BaseStrategy):
    """
    Mean Reversion Strategy using Bollinger Bands and RSI.

    Logic:
    - Long Entry: Price <= Lower Bollinger Band and RSI < 30 (Oversold)
    - Short Entry: Price >= Upper Bollinger Band and RSI > 70 (Overbought)
    - Target: Return to 20-period SMA (Middle Band)
    - Stop Loss: 1.5% beyond the band extreme
    """

    def __init__(
        self,
        symbols: List[str],
        parameters: Optional[Dict[str, Any]] = None
    ):
        super().__init__("mean_reversion", symbols, parameters)
        self._bb_period = int(self.get_params('bb_period', 20))
        self._bb_std = float(self.get_params('bb_std', 2.0))
        self._rsi_period = int(self.get_params('rsi_period', 14))
        self._rsi_oversold = float(self.get_params('rsi_oversold', 30.0))
        self._rsi_overbought = float(self.get_params('rsi_overbought', 70.0))
        self._stop_loss_pct = float(self.get_params('stop_loss_pct', 1.5))

        self._in_position: Dict[str, str] = {s: "FLAT" for s in symbols}

    def _calculate_rsi(self, prices: List[float], period: int = 14) -> float:
        """Calculate Relative Strength Index."""
        if len(prices) <= period:
            return 50.0

        gains = []
        losses = []
        for i in range(1, len(prices)):
            diff = prices[i] - prices[i - 1]
            if diff > 0:
                gains.append(diff)
                losses.append(0.0)
            else:
                gains.append(0.0)
                losses.append(abs(diff))

        recent_gains = gains[-period:]
        recent_losses = losses[-period:]

        avg_gain = sum(recent_gains) / period
        avg_loss = sum(recent_losses) / period

        if avg_loss == 0.0:
            return 100.0 if avg_gain > 0 else 50.0

        rs = avg_gain / avg_loss
        return 100.0 - (100.0 / (1.0 + rs))

    def calculate_indicators(self, data: Dict[str, Any]) -> Dict[str, float]:
        """Calculate Bollinger Bands and RSI."""
        symbol = data['symbol']
        bars = list(self._bars.get(symbol, []))
        if len(bars) < 2:
            return {
                'bb_upper': 0.0,
                'bb_middle': 0.0,
                'bb_lower': 0.0,
                'rsi': 50.0,
                'current_price': 0.0
            }

        prices = [b['close'] for b in bars]
        current_price = prices[-1]

        # Calculate SMA
        lookback_prices = prices[-self._bb_period:]
        mean = sum(lookback_prices) / len(lookback_prices)

        # Standard deviation
        variance = sum((p - mean) ** 2 for p in lookback_prices) / len(lookback_prices)
        std_dev = math.sqrt(variance)

        bb_upper = mean + (self._bb_std * std_dev)
        bb_lower = mean - (self._bb_std * std_dev)
        bb_middle = mean

        rsi = self._calculate_rsi(prices, self._rsi_period)

        return {
            'bb_upper': round(bb_upper, 2),
            'bb_middle': round(bb_middle, 2),
            'bb_lower': round(bb_lower, 2),
            'rsi': round(rsi, 2),
            'current_price': current_price
        }

    def on_tick(self, symbol: str, price: float, timestamp: datetime, **kwargs) -> None:
        """Process incoming tick."""
        volume = kwargs.get('volume', 0)
        self.add_bar(symbol, {
            'timestamp': timestamp,
            'open': price,
            'high': price,
            'low': price,
            'close': price,
            'volume': volume
        })

        indicators = self.calculate_indicators({'symbol': symbol})
        signal = self.evaluate_signal(symbol, **indicators)
        if signal:
            self.generate_signal(signal)

    def on_bar(self, symbol: str, bar: Dict[str, Any]) -> None:
        """Process completed bar."""
        self.add_bar(symbol, bar)
        indicators = self.calculate_indicators({'symbol': symbol})
        signal = self.evaluate_signal(symbol, **indicators)
        if signal:
            self.generate_signal(signal)

    def evaluate_signal(self, symbol: str, **kwargs) -> Optional[Signal]:
        """Evaluate mean reversion conditions."""
        bb_upper = kwargs.get('bb_upper', 0.0)
        bb_middle = kwargs.get('bb_middle', 0.0)
        bb_lower = kwargs.get('bb_lower', 0.0)
        rsi = kwargs.get('rsi', 50.0)
        current_price = kwargs.get('current_price', 0.0)

        if current_price <= 0 or bb_middle <= 0:
            return None

        current_pos = self._in_position.get(symbol, "FLAT")

        # Buy oversold dip at lower band
        if current_price <= bb_lower and rsi <= self._rsi_oversold:
            if current_pos != "LONG":
                self._in_position[symbol] = "LONG"
                sl = current_price * (1.0 - self._stop_loss_pct / 100.0)
                tp = bb_middle  # Target middle band mean
                return Signal(
                    strategy_name=self.name,
                    signal_type=StrategySignal.BUY,
                    symbol=symbol,
                    confidence=0.88,
                    stop_loss_price=round(sl, 2),
                    target_price=round(tp, 2),
                    indicators={'bb_lower': bb_lower, 'bb_middle': bb_middle, 'rsi': rsi}
                )

        # Sell overbought surge at upper band
        elif current_price >= bb_upper and rsi >= self._rsi_overbought:
            if current_pos != "SHORT":
                self._in_position[symbol] = "SHORT"
                sl = current_price * (1.0 + self._stop_loss_pct / 100.0)
                tp = bb_middle  # Target middle band mean
                return Signal(
                    strategy_name=self.name,
                    signal_type=StrategySignal.SELL,
                    symbol=symbol,
                    confidence=0.88,
                    stop_loss_price=round(sl, 2),
                    target_price=round(tp, 2),
                    indicators={'bb_upper': bb_upper, 'bb_middle': bb_middle, 'rsi': rsi}
                )

        # Reached mean target -> Exit
        elif current_pos == "LONG" and current_price >= bb_middle:
            self._in_position[symbol] = "FLAT"
            return Signal(
                strategy_name=self.name,
                signal_type=StrategySignal.EXIT,
                symbol=symbol,
                confidence=0.9,
                indicators={'bb_middle': bb_middle, 'rsi': rsi}
            )
        elif current_pos == "SHORT" and current_price <= bb_middle:
            self._in_position[symbol] = "FLAT"
            return Signal(
                strategy_name=self.name,
                signal_type=StrategySignal.EXIT,
                symbol=symbol,
                confidence=0.9,
                indicators={'bb_middle': bb_middle, 'rsi': rsi}
            )

        return None

