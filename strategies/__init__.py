"""Trading strategies module for AuraTrader-AngelOne."""
from .base_strategy import BaseStrategy, Signal, StrategySignal
from .vwap_strategy import VWAPStrategy
from .ema_crossover import EMACrossoverStrategy
from .supertrend_strategy import SuperTrendStrategy
from .momentum_strategy import MomentumStrategy
from .breakout_strategy import BreakoutStrategy
from .mean_reversion import MeanReversionStrategy

__all__ = [
    'BaseStrategy',
    'Signal',
    'StrategySignal',
    'VWAPStrategy',
    'EMACrossoverStrategy',
    'SuperTrendStrategy',
    'MomentumStrategy',
    'BreakoutStrategy',
    'MeanReversionStrategy'
]
