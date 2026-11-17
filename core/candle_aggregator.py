"""
AuraTrader-AngelOne - Real-Time Candle Aggregator
Constructs authentic OHLCV candles from live tick feeds.
Feeds candles and ticks to trading strategies with duplicate tick suppression,
session boundary checking, and thread-safe bar emission.
"""

import threading
import logging
from datetime import datetime, time as dtime
from typing import Dict, List, Optional, Callable, Any
from collections import deque

from core.broker_adapter import Quote, OHLCV

logger = logging.getLogger("CandleAggregator")

# Standard Indian Market Hours (09:15 to 15:30 IST)
MARKET_OPEN = dtime(9, 15)
MARKET_CLOSE = dtime(15, 30)


class CandleAggregator:
    """
    Thread-safe real-time candle builder for live market ticks.
    Aggregates incoming ticks into discrete timeframe bars (e.g. 1-minute).
    """

    def __init__(self, bar_seconds: int = 60, max_bars: int = 500):
        self.bar_seconds = bar_seconds
        self.max_bars = max_bars
        self._lock = threading.RLock()

        # In-progress bars: symbol -> {open, high, low, close, volume, bar_start, tick_count}
        self._current_bars: Dict[str, Dict[str, Any]] = {}
        # Completed historical bars: symbol -> deque[OHLCV]
        self._bars: Dict[str, deque] = {}
        # Last tick fingerprint for duplicate rejection: symbol -> (timestamp, ltp, volume)
        self._last_tick_fingerprints: Dict[str, tuple] = {}

        # Listeners / Strategies
        self._bar_callbacks: List[Callable[[str, OHLCV], None]] = []
        self._tick_callbacks: List[Callable[[Quote], None]] = []

    def register_bar_callback(self, callback: Callable[[str, OHLCV], None]) -> None:
        """Register a callback for completed OHLCV bars."""
        with self._lock:
            self._bar_callbacks.append(callback)

    def register_tick_callback(self, callback: Callable[[Quote], None]) -> None:
        """Register a callback for validated raw ticks."""
        with self._lock:
            self._tick_callbacks.append(callback)

    def is_market_session(self, dt: datetime) -> bool:
        """Validate if timestamp falls within Indian equity trading hours."""
        t = dt.time()
        return MARKET_OPEN <= t <= MARKET_CLOSE

    def process_tick(self, quote: Quote) -> Optional[OHLCV]:
        """
        Ingest a live market quote, filter duplicates, and update/complete the current candle bar.
        Returns the completed OHLCV candle if a bar boundary was crossed, else None.
        """
        if not quote or not quote.symbol or quote.ltp <= 0:
            return None

        sym = quote.symbol
        ts = quote.timestamp if isinstance(quote.timestamp, datetime) else datetime.now()
        price = float(quote.ltp)
        volume = int(quote.volume or 0)

        with self._lock:
            # 1. Duplicate tick suppression
            fingerprint = (ts.timestamp(), price, volume)
            if self._last_tick_fingerprints.get(sym) == fingerprint:
                return None
            self._last_tick_fingerprints[sym] = fingerprint

            # 2. Determine timeframe bucket start
            ts_sec = int(ts.timestamp())
            bar_start_sec = ts_sec - (ts_sec % self.bar_seconds)
            bar_start = datetime.fromtimestamp(bar_start_sec)

            completed_candle = None
            curr = self._current_bars.get(sym)

            if curr is None:
                # First tick for this symbol
                self._current_bars[sym] = {
                    "open": price,
                    "high": price,
                    "low": price,
                    "close": price,
                    "volume": volume,
                    "bar_start": bar_start,
                    "tick_count": 1
                }
            elif bar_start > curr["bar_start"]:
                # New bar started: finalize the previous bar
                completed_candle = OHLCV(
                    symbol=sym,
                    timestamp=curr["bar_start"],
                    open=curr["open"],
                    high=curr["high"],
                    low=curr["low"],
                    close=curr["close"],
                    volume=max(0, volume - curr["volume"]) if volume >= curr["volume"] else volume
                )

                if sym not in self._bars:
                    self._bars[sym] = deque(maxlen=self.max_bars)
                self._bars[sym].append(completed_candle)

                # Initialize new bar
                self._current_bars[sym] = {
                    "open": price,
                    "high": price,
                    "low": price,
                    "close": price,
                    "volume": volume,
                    "bar_start": bar_start,
                    "tick_count": 1
                }
            else:
                # Update existing bar
                curr["high"] = max(curr["high"], price)
                curr["low"] = min(curr["low"], price)
                curr["close"] = price
                curr["volume"] = volume
                curr["tick_count"] += 1

        # Notify callbacks outside lock to prevent deadlocks
        if completed_candle:
            for cb in self._bar_callbacks:
                try:
                    cb(sym, completed_candle)
                except Exception as e:
                    logger.error(f"Error in candle aggregator bar callback: {e}")

        for cb in self._tick_callbacks:
            try:
                cb(quote)
            except Exception as e:
                logger.error(f"Error in candle aggregator tick callback: {e}")

        return completed_candle

    def get_bars(self, symbol: str) -> List[OHLCV]:
        """Retrieve stored historical bars for a symbol."""
        with self._lock:
            return list(self._bars.get(symbol, []))

    def get_current_bar(self, symbol: str) -> Optional[Dict[str, Any]]:
        """Get the forming candle bar for a symbol."""
        with self._lock:
            curr = self._current_bars.get(symbol)
            return dict(curr) if curr else None


# Global singleton instance
candle_aggregator = CandleAggregator(bar_seconds=60)
