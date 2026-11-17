"""
Momentum Trading Strategy for AuraTrader-AngelOne.
Combines Relative Strength Index (RSI), Rate of Change (ROC), and Trend filter (SMA)
to capture strong directional movements in liquid Indian equities and indices.
"""

from collections import deque
from datetime import datetime
from typing import Optional, Dict, List, Any

from .base_strategy import BaseStrategy, Signal, StrategySignal


class MomentumStrategy(BaseStrategy):
    """
    Momentum Strategy based on RSI and ROC.

    Logic:
    - Long Entry: RSI crosses above 55, ROC > 0.5%, price > 20-period SMA
    - Short Entry: RSI crosses below 45, ROC < -0.5%, price < 20-period SMA
    - Exit: Opposite signal or Stop Loss (1.5%) / Target (3.0%) reached
    """

    def __init__(
        self,
        symbols: List[str],
        parameters: Optional[Dict[str, Any]] = None
    ):
        super().__init__("momentum_strategy", symbols, parameters)
        self._rsi_period = int(self.get_params('rsi_period', 14))
        self._roc_period = int(self.get_params('roc_period', 10))
        self._sma_period = int(self.get_params('sma_period', 20))
        self._rsi_upper = float(self.get_params('rsi_upper', 55.0))
        self._rsi_lower = float(self.get_params('rsi_lower', 45.0))
        self._stop_loss_pct = float(self.get_params('stop_loss_pct', 1.5))
        self._target_pct = float(self.get_params('target_pct', 3.0))

        self._in_position: Dict[str, str] = {s: "FLAT" for s in symbols}

    def _calculate_rsi(self, prices: List[float], period: int = 14) -> float:
        """Calculate Relative Strength Index."""
        if len(prices) <= period:
            return 50.0

        gains = []
        losses = []
        for i in range(1, len(prices)):
            change = prices[i] - prices[i - 1]
            if change > 0:
                gains.append(change)
                losses.append(0.0)
            else:
                gains.append(0.0)
                losses.append(abs(change))

        # Use recent period
        recent_gains = gains[-period:]
        recent_losses = losses[-period:]

        avg_gain = sum(recent_gains) / period
        avg_loss = sum(recent_losses) / period

        if avg_loss == 0.0:
            return 100.0 if avg_gain > 0 else 50.0

        rs = avg_gain / avg_loss
        return 100.0 - (100.0 / (1.0 + rs))

    def calculate_indicators(self, data: Dict[str, Any]) -> Dict[str, float]:
        """Calculate RSI, ROC, and SMA."""
        symbol = data['symbol']
        bars = list(self._bars.get(symbol, []))
        if not bars:
            return {'rsi': 50.0, 'roc': 0.0, 'sma': 0.0, 'price': 0.0}

        prices = [b['close'] for b in bars]
        current_price = prices[-1]

        rsi = self._calculate_rsi(prices, self._rsi_period)

        # ROC calculation
        if len(prices) > self._roc_period and prices[-self._roc_period - 1] > 0:
            past_price = prices[-self._roc_period - 1]
            roc = ((current_price - past_price) / past_price) * 100.0
        else:
            roc = 0.0

        # SMA calculation
        if len(prices) >= self._sma_period:
            sma = sum(prices[-self._sma_period:]) / self._sma_period
        else:
            sma = sum(prices) / len(prices)

        return {
            'rsi': round(rsi, 2),
            'roc': round(roc, 2),
            'sma': round(sma, 2),
            'price': current_price
        }

    def on_tick(self, symbol: str, price: float, timestamp: datetime, **kwargs) -> None:
        """Process real-time tick."""
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
        """Process OHLCV bar."""
        self.add_bar(symbol, bar)
        indicators = self.calculate_indicators({'symbol': symbol})
        signal = self.evaluate_signal(symbol, **indicators)
        if signal:
            self.generate_signal(signal)

    def evaluate_signal(self, symbol: str, **kwargs) -> Optional[Signal]:
        """Evaluate momentum signal conditions."""
        rsi = kwargs.get('rsi', 50.0)
        roc = kwargs.get('roc', 0.0)
        sma = kwargs.get('sma', 0.0)
        price = kwargs.get('price', 0.0)

        if price <= 0:
            return None

        current_pos = self._in_position.get(symbol, "FLAT")

        # Long Signal
        if rsi >= self._rsi_upper and roc > 0.3 and price > sma:
            if current_pos != "LONG":
                self._in_position[symbol] = "LONG"
                sl = price * (1.0 - self._stop_loss_pct / 100.0)
                tp = price * (1.0 + self._target_pct / 100.0)
                return Signal(
                    strategy_name=self.name,
                    signal_type=StrategySignal.BUY,
                    symbol=symbol,
                    confidence=min(0.95, 0.6 + (rsi - 50) / 100.0),
                    stop_loss_price=round(sl, 2),
                    target_price=round(tp, 2),
                    indicators={'rsi': rsi, 'roc': roc, 'sma': sma}
                )

        # Short Signal
        elif rsi <= self._rsi_lower and roc < -0.3 and price < sma:
            if current_pos != "SHORT":
                self._in_position[symbol] = "SHORT"
                sl = price * (1.0 + self._stop_loss_pct / 100.0)
                tp = price * (1.0 - self._target_pct / 100.0)
                return Signal(
                    strategy_name=self.name,
                    signal_type=StrategySignal.SELL,
                    symbol=symbol,
                    confidence=min(0.95, 0.6 + (50 - rsi) / 100.0),
                    stop_loss_price=round(sl, 2),
                    target_price=round(tp, 2),
                    indicators={'rsi': rsi, 'roc': roc, 'sma': sma}
                )

        # Mean Reversal / Neutral Exit
        elif current_pos == "LONG" and (rsi < 48 or price < sma):
            self._in_position[symbol] = "FLAT"
            return Signal(
                strategy_name=self.name,
                signal_type=StrategySignal.EXIT,
                symbol=symbol,
                confidence=0.8,
                indicators={'rsi': rsi, 'roc': roc, 'sma': sma}
            )
        elif current_pos == "SHORT" and (rsi > 52 or price > sma):
            self._in_position[symbol] = "FLAT"
            return Signal(
                strategy_name=self.name,
                signal_type=StrategySignal.EXIT,
                symbol=symbol,
                confidence=0.8,
                indicators={'rsi': rsi, 'roc': roc, 'sma': sma}
            )

        return None

