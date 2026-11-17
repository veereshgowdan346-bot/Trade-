"""
Breakout Trading Strategy for AuraTrader-AngelOne.
Identifies range expansions and Donchian channel breakouts with volume confirmation.
"""

from collections import deque
from datetime import datetime
from typing import Optional, Dict, List, Any

from .base_strategy import BaseStrategy, Signal, StrategySignal


class BreakoutStrategy(BaseStrategy):
    """
    Breakout Strategy (Donchian Channel Breakout).

    Logic:
    - Long Entry: Close breaks above 20-period highest high with above-average volume
    - Short Entry: Close breaks below 20-period lowest low with above-average volume
    - Stop Loss: Placed at recent channel midpoint or percentage stop
    - Target: Placed at 2:1 profit-to-risk ratio
    """

    def __init__(
        self,
        symbols: List[str],
        parameters: Optional[Dict[str, Any]] = None
    ):
        super().__init__("breakout_strategy", symbols, parameters)
        self._lookback_period = int(self.get_params('lookback_period', 20))
        self._volume_multiplier = float(self.get_params('volume_multiplier', 1.2))
        self._stop_loss_pct = float(self.get_params('stop_loss_pct', 1.5))
        self._target_pct = float(self.get_params('target_pct', 3.0))

        self._in_position: Dict[str, str] = {s: "FLAT" for s in symbols}

    def calculate_indicators(self, data: Dict[str, Any]) -> Dict[str, float]:
        """Calculate channel highs, lows, and average volume."""
        symbol = data['symbol']
        bars = list(self._bars.get(symbol, []))
        if len(bars) < 2:
            return {
                'channel_high': 0.0,
                'channel_low': 0.0,
                'channel_mid': 0.0,
                'avg_volume': 0.0,
                'current_price': 0.0,
                'current_volume': 0.0
            }

        recent_bars = bars[-self._lookback_period - 1:-1] if len(bars) > self._lookback_period else bars[:-1]
        if not recent_bars:
            recent_bars = bars

        channel_high = max(b.get('high', b['close']) for b in recent_bars)
        channel_low = min(b.get('low', b['close']) for b in recent_bars)
        channel_mid = (channel_high + channel_low) / 2.0

        vols = [b.get('volume', 0) for b in recent_bars]
        avg_volume = sum(vols) / len(vols) if vols else 0.0

        current_bar = bars[-1]
        current_price = current_bar['close']
        current_volume = current_bar.get('volume', 0)

        return {
            'channel_high': round(channel_high, 2),
            'channel_low': round(channel_low, 2),
            'channel_mid': round(channel_mid, 2),
            'avg_volume': round(avg_volume, 2),
            'current_price': current_price,
            'current_volume': current_volume
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
        """Evaluate breakout conditions."""
        channel_high = kwargs.get('channel_high', 0.0)
        channel_low = kwargs.get('channel_low', 0.0)
        channel_mid = kwargs.get('channel_mid', 0.0)
        current_price = kwargs.get('current_price', 0.0)
        current_volume = kwargs.get('current_volume', 0.0)
        avg_volume = kwargs.get('avg_volume', 0.0)

        if current_price <= 0 or channel_high <= 0 or channel_low <= 0:
            return None

        current_pos = self._in_position.get(symbol, "FLAT")
        vol_confirmed = (current_volume >= avg_volume * self._volume_multiplier) if avg_volume > 0 else True

        # Bullish Breakout
        if current_price > channel_high and vol_confirmed:
            if current_pos != "LONG":
                self._in_position[symbol] = "LONG"
                sl = max(channel_mid, current_price * (1.0 - self._stop_loss_pct / 100.0))
                tp = current_price * (1.0 + self._target_pct / 100.0)
                return Signal(
                    strategy_name=self.name,
                    signal_type=StrategySignal.BUY,
                    symbol=symbol,
                    confidence=0.85,
                    stop_loss_price=round(sl, 2),
                    target_price=round(tp, 2),
                    indicators={
                        'channel_high': channel_high,
                        'channel_low': channel_low,
                        'channel_mid': channel_mid
                    }
                )

        # Bearish Breakdown
        elif current_price < channel_low and vol_confirmed:
            if current_pos != "SHORT":
                self._in_position[symbol] = "SHORT"
                sl = min(channel_mid, current_price * (1.0 + self._stop_loss_pct / 100.0))
                tp = current_price * (1.0 - self._target_pct / 100.0)
                return Signal(
                    strategy_name=self.name,
                    signal_type=StrategySignal.SELL,
                    symbol=symbol,
                    confidence=0.85,
                    stop_loss_price=round(sl, 2),
                    target_price=round(tp, 2),
                    indicators={
                        'channel_high': channel_high,
                        'channel_low': channel_low,
                        'channel_mid': channel_mid
                    }
                )

        # Exit if price falls back across midpoint
        elif current_pos == "LONG" and current_price < channel_mid:
            self._in_position[symbol] = "FLAT"
            return Signal(
                strategy_name=self.name,
                signal_type=StrategySignal.EXIT,
                symbol=symbol,
                confidence=0.8,
                indicators={'channel_mid': channel_mid}
            )
        elif current_pos == "SHORT" and current_price > channel_mid:
            self._in_position[symbol] = "FLAT"
            return Signal(
                strategy_name=self.name,
                signal_type=StrategySignal.EXIT,
                symbol=symbol,
                confidence=0.8,
                indicators={'channel_mid': channel_mid}
            )

        return None

