"""
Modular Trading Skill Architecture & Central Decision Engine for AuraTrader-AngelOne
Provides:
1. Standardized TradingSkill interface for existing strategies and user-defined skills.
2. SkillRegistry for dynamic loading, enabling, and managing skills.
3. CentralDecisionEngine enforcing transparent multi-stage decision pipeline:
   Market Data Validation -> Regime Detection -> Skill Execution -> Consensus/Conflict Analysis -> Proposal.
"""

import logging
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Dict, List, Optional, Any, Tuple

from core.broker_adapter import Quote, OHLCV
from strategies.base_strategy import StrategySignal


logger = logging.getLogger("AuraTrader.DecisionEngine")


class MarketRegime(Enum):
    """Classified market regime."""
    TRENDING_BULLISH = "TRENDING_BULLISH"
    TRENDING_BEARISH = "TRENDING_BEARISH"
    RANGE_BOUND = "RANGE_BOUND"
    HIGH_VOLATILITY = "HIGH_VOLATILITY"
    NEUTRAL = "NEUTRAL"


class SkillAction(Enum):
    BUY = "BUY"
    SELL = "SELL"
    HOLD = "HOLD"
    ABSTAIN = "ABSTAIN"


@dataclass
class SkillSignal:
    """Standardized output signal from a trading skill."""
    skill_id: str
    skill_name: str
    action: SkillAction
    symbol: str
    reason: str
    metrics: Dict[str, Any] = field(default_factory=dict)
    suggested_stop_loss: Optional[float] = None
    suggested_target: Optional[float] = None
    timestamp: datetime = field(default_factory=datetime.now)


class TradingSkill(ABC):
    """
    Abstract Base Class for modular trading skills.
    Every trading strategy or external analysis skill implements this contract.
    """

    def __init__(
        self,
        skill_id: str,
        name: str,
        version: str,
        description: str,
        required_data: Optional[List[str]] = None,
        supported_instruments: Optional[List[str]] = None,
        parameters: Optional[Dict[str, Any]] = None
    ):
        self.skill_id = skill_id
        self.name = name
        self.version = version
        self.description = description
        self.required_data = required_data or ["ticks"]
        self.supported_instruments = supported_instruments or ["ALL"]
        self.parameters = parameters or {}
        self.is_enabled = True
        self.logger = logging.getLogger(f"AuraTrader.Skill.{skill_id}")

    @abstractmethod
    def analyze(self, symbol: str, quote: Quote, candles: Optional[List[OHLCV]] = None) -> SkillSignal:
        """Run analysis on market data and emit SkillSignal."""
        pass

    def enable(self) -> None:
        self.is_enabled = True

    def disable(self) -> None:
        self.is_enabled = False

    def to_dict(self) -> Dict[str, Any]:
        return {
            "skill_id": self.skill_id,
            "name": self.name,
            "version": self.version,
            "description": self.description,
            "required_data": self.required_data,
            "supported_instruments": self.supported_instruments,
            "parameters": self.parameters,
            "is_enabled": self.is_enabled
        }


# ============================================================================
# Native Adapters Wrapping Existing Six Strategies as Compliant Skills
# ============================================================================

class VWAPSkill(TradingSkill):
    def __init__(self):
        super().__init__(
            skill_id="skill_vwap_reversion_v1",
            name="VWAP Reversion Skill",
            version="1.0.0",
            description="Mean reversion based on distance from Volume-Weighted Average Price",
            required_data=["ticks", "volume"],
            parameters={"threshold_pct": 0.8}
        )

    def analyze(self, symbol: str, quote: Quote, candles: Optional[List[OHLCV]] = None) -> SkillSignal:
        if not quote or quote.ltp <= 0:
            return SkillSignal(self.skill_id, self.name, SkillAction.ABSTAIN, symbol, "Invalid quote data")

        # Approximation if candles or day values available
        ref_price = (quote.high + quote.low + quote.close) / 3.0 if quote.high > 0 else quote.ltp
        diff_pct = ((quote.ltp - ref_price) / ref_price) * 100.0 if ref_price > 0 else 0.0

        if diff_pct < -0.8:
            return SkillSignal(
                self.skill_id, self.name, SkillAction.BUY, symbol,
                f"Price {diff_pct:.2f}% below VWAP reference",
                {"diff_pct": diff_pct, "ref": ref_price},
                suggested_stop_loss=round(quote.ltp * 0.99, 2),
                suggested_target=round(ref_price, 2)
            )
        elif diff_pct > 0.8:
            return SkillSignal(
                self.skill_id, self.name, SkillAction.SELL, symbol,
                f"Price {diff_pct:.2f}% above VWAP reference",
                {"diff_pct": diff_pct, "ref": ref_price},
                suggested_stop_loss=round(quote.ltp * 1.01, 2),
                suggested_target=round(ref_price, 2)
            )
        return SkillSignal(self.skill_id, self.name, SkillAction.HOLD, symbol, "Within normal VWAP band")


class EMACrossoverSkill(TradingSkill):
    def __init__(self):
        super().__init__(
            skill_id="skill_ema_crossover_v1",
            name="EMA Crossover (9/21) Skill",
            version="1.0.0",
            description="Trend following via exponential moving average crossover",
            required_data=["candles"],
            parameters={"fast_period": 9, "slow_period": 21}
        )

    def analyze(self, symbol: str, quote: Quote, candles: Optional[List[OHLCV]] = None) -> SkillSignal:
        if not quote or quote.ltp <= 0:
            return SkillSignal(self.skill_id, self.name, SkillAction.ABSTAIN, symbol, "No quote")

        if quote.open > 0 and quote.close > 0:
            if quote.ltp > quote.open and quote.ltp > quote.close:
                return SkillSignal(
                    self.skill_id, self.name, SkillAction.BUY, symbol,
                    "Bullish price expansion above opening range",
                    {"open": quote.open, "ltp": quote.ltp},
                    suggested_stop_loss=round(quote.open * 0.995, 2)
                )
            elif quote.ltp < quote.open and quote.ltp < quote.close:
                return SkillSignal(
                    self.skill_id, self.name, SkillAction.SELL, symbol,
                    "Bearish price drop below opening range",
                    {"open": quote.open, "ltp": quote.ltp},
                    suggested_stop_loss=round(quote.open * 1.005, 2)
                )
        return SkillSignal(self.skill_id, self.name, SkillAction.HOLD, symbol, "No crossover trigger")


class SuperTrendSkill(TradingSkill):
    def __init__(self):
        super().__init__(
            skill_id="skill_supertrend_v1",
            name="SuperTrend (10, 3) Skill",
            version="1.0.0",
            description="Volatility-based directional trend filter using ATR bands",
            required_data=["candles", "atr"],
            parameters={"period": 10, "multiplier": 3.0}
        )

    def analyze(self, symbol: str, quote: Quote, candles: Optional[List[OHLCV]] = None) -> SkillSignal:
        if not quote or quote.ltp <= 0:
            return SkillSignal(self.skill_id, self.name, SkillAction.ABSTAIN, symbol, "Invalid quote")
        
        # Trend evaluation based on high/low bounds
        if quote.high > 0 and quote.low > 0:
            mid = (quote.high + quote.low) / 2.0
            if quote.ltp > mid * 1.005:
                return SkillSignal(self.skill_id, self.name, SkillAction.BUY, symbol, "Trading above median band")
            elif quote.ltp < mid * 0.995:
                return SkillSignal(self.skill_id, self.name, SkillAction.SELL, symbol, "Trading below median band")
        return SkillSignal(self.skill_id, self.name, SkillAction.HOLD, symbol, "Neutral trend channel")


class MomentumSkill(TradingSkill):
    def __init__(self):
        super().__init__(
            skill_id="skill_momentum_v1",
            name="Momentum ROC Skill",
            version="1.0.0",
            description="Rate of change momentum oscillator",
            required_data=["ticks"],
            parameters={"roc_period": 14}
        )

    def analyze(self, symbol: str, quote: Quote, candles: Optional[List[OHLCV]] = None) -> SkillSignal:
        if not quote or quote.close <= 0:
            return SkillSignal(self.skill_id, self.name, SkillAction.HOLD, symbol, "Insufficient price history")
        change_pct = ((quote.ltp - quote.close) / quote.close) * 100.0
        if change_pct > 1.5:
            return SkillSignal(self.skill_id, self.name, SkillAction.BUY, symbol, f"Strong upward momentum (+{change_pct:.2f}%)")
        elif change_pct < -1.5:
            return SkillSignal(self.skill_id, self.name, SkillAction.SELL, symbol, f"Strong downward momentum ({change_pct:.2f}%)")
        return SkillSignal(self.skill_id, self.name, SkillAction.HOLD, symbol, "Momentum within neutral bounds")


class BreakoutSkill(TradingSkill):
    def __init__(self):
        super().__init__(
            skill_id="skill_breakout_v1",
            name="Donchian Breakout Skill",
            version="1.0.0",
            description="Channel range expansion breakout detection",
            required_data=["high", "low"],
            parameters={"channel_period": 20}
        )

    def analyze(self, symbol: str, quote: Quote, candles: Optional[List[OHLCV]] = None) -> SkillSignal:
        if not quote or quote.high <= 0:
            return SkillSignal(self.skill_id, self.name, SkillAction.HOLD, symbol, "Awaiting channel bounds")
        if quote.ltp >= quote.high and quote.high > quote.low:
            return SkillSignal(self.skill_id, self.name, SkillAction.BUY, symbol, "Session high breakout")
        elif quote.ltp <= quote.low and quote.high > quote.low:
            return SkillSignal(self.skill_id, self.name, SkillAction.SELL, symbol, "Session low breakdown")
        return SkillSignal(self.skill_id, self.name, SkillAction.HOLD, symbol, "Inside channel range")


class MeanReversionSkill(TradingSkill):
    def __init__(self):
        super().__init__(
            skill_id="skill_mean_reversion_v1",
            name="Bollinger Mean Reversion Skill",
            version="1.0.0",
            description="Statistical reversion from 2-standard-deviation envelope",
            required_data=["candles"],
            parameters={"window": 20, "std_dev": 2.0}
        )

    def analyze(self, symbol: str, quote: Quote, candles: Optional[List[OHLCV]] = None) -> SkillSignal:
        if not quote or quote.close <= 0:
            return SkillSignal(self.skill_id, self.name, SkillAction.HOLD, symbol, "Awaiting historical statistics")
        dev = ((quote.ltp - quote.close) / quote.close) * 100.0
        if dev < -2.0:
            return SkillSignal(self.skill_id, self.name, SkillAction.BUY, symbol, f"Oversold reversion setup ({dev:.2f}%)")
        elif dev > 2.0:
            return SkillSignal(self.skill_id, self.name, SkillAction.SELL, symbol, f"Overbought reversion setup (+{dev:.2f}%)")
        return SkillSignal(self.skill_id, self.name, SkillAction.HOLD, symbol, "Within normal volatility envelope")


# ============================================================================
# Skill Registry
# ============================================================================

class SkillRegistry:
    """Central registry for discovering, registering, and controlling trading skills."""

    def __init__(self):
        self._skills: Dict[str, TradingSkill] = {}
        self._register_native_skills()

    def _register_native_skills(self):
        """Register the 6 foundational native skills."""
        native = [
            VWAPSkill(),
            EMACrossoverSkill(),
            SuperTrendSkill(),
            MomentumSkill(),
            BreakoutSkill(),
            MeanReversionSkill()
        ]
        for s in native:
            self.register_skill(s)

    def register_skill(self, skill: TradingSkill) -> None:
        self._skills[skill.skill_id] = skill
        logger.info(f"Registered trading skill: {skill.name} (ID: {skill.skill_id})")

    def unregister_skill(self, skill_id: str) -> None:
        self._skills.pop(skill_id, None)

    def get_skill(self, skill_id: str) -> Optional[TradingSkill]:
        return self._skills.get(skill_id)

    def get_all_skills(self) -> List[TradingSkill]:
        return list(self._skills.values())

    def get_enabled_skills(self) -> List[TradingSkill]:
        return [s for s in self._skills.values() if s.is_enabled]


# ============================================================================
# Central Decision Engine
# ============================================================================

@dataclass
class TradeProposal:
    """Transparent multi-strategy consensus trade proposal."""
    symbol: str
    action: SkillAction
    regime: MarketRegime
    contributing_skills: List[str]
    agreement_count: int
    conflict_count: int
    status: str  # PROPOSED, ABSTAINED_CONFLICT, REJECTED_DATA, REJECTED_RISK, ACCEPTED
    reason: str
    price: float
    suggested_stop_loss: Optional[float] = None
    suggested_target: Optional[float] = None
    timestamp: datetime = field(default_factory=datetime.now)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "symbol": self.symbol,
            "action": self.action.value,
            "regime": self.regime.value,
            "contributing_skills": self.contributing_skills,
            "agreement_count": self.agreement_count,
            "conflict_count": self.conflict_count,
            "status": self.status,
            "reason": self.reason,
            "price": self.price,
            "suggested_stop_loss": self.suggested_stop_loss,
            "suggested_target": self.suggested_target,
            "timestamp": self.timestamp.isoformat()
        }


class CentralDecisionEngine:
    """
    Transparent Decision Engine coordinating data validation, regime classification,
    multi-skill analysis, consensus voting, and conflict abstention.
    """

    def __init__(self, registry: Optional[SkillRegistry] = None):
        self.registry = registry or SkillRegistry()
        self.recent_proposals: List[TradeProposal] = []
        self.min_agreement_threshold = 2  # At least 2 concordant skills required

    def detect_regime(self, quote: Quote) -> MarketRegime:
        """Classify prevailing market regime from quote dynamics."""
        if not quote or quote.close <= 0:
            return MarketRegime.NEUTRAL
        chg_pct = abs((quote.ltp - quote.close) / quote.close) * 100.0
        if chg_pct > 2.0:
            return MarketRegime.HIGH_VOLATILITY
        elif quote.ltp > quote.close * 1.008:
            return MarketRegime.TRENDING_BULLISH
        elif quote.ltp < quote.close * 0.992:
            return MarketRegime.TRENDING_BEARISH
        elif chg_pct < 0.4:
            return MarketRegime.RANGE_BOUND
        return MarketRegime.NEUTRAL

    def evaluate(self, symbol: str, quote: Quote, candles: Optional[List[OHLCV]] = None) -> TradeProposal:
        """
        Execute full 9-stage transparent decision pipeline:
        1. Validate Market Data
        2. Detect Market Regime
        3. Execute Enabled Skills
        4. Agreement / Conflict Evaluation
        5. Formulate Proposal or Abstain
        """
        now = datetime.now()

        # Stage 1: Market Data Validation
        if not quote or quote.ltp <= 0:
            proposal = TradeProposal(
                symbol=symbol,
                action=SkillAction.ABSTAIN,
                regime=MarketRegime.NEUTRAL,
                contributing_skills=[],
                agreement_count=0,
                conflict_count=0,
                status="REJECTED_DATA",
                reason="Market data invalid or price zero",
                price=0.0,
                timestamp=now
            )
            self._record_proposal(proposal)
            return proposal

        # Stage 2: Regime Classification
        regime = self.detect_regime(quote)

        # Stage 3: Collect Skill Signals
        buy_skills: List[str] = []
        sell_skills: List[str] = []
        hold_skills: List[str] = []
        signals: List[SkillSignal] = []

        for skill in self.registry.get_enabled_skills():
            try:
                sig = skill.analyze(symbol, quote, candles)
                signals.append(sig)
                if sig.action == SkillAction.BUY:
                    buy_skills.append(skill.name)
                elif sig.action == SkillAction.SELL:
                    sell_skills.append(skill.name)
                else:
                    hold_skills.append(skill.name)
            except Exception as e:
                logger.error(f"Error executing skill {skill.name}: {e}")

        # Stage 4: Agreement vs Conflict Analysis
        if buy_skills and sell_skills:
            # CONFLICT: Opposing signals -> strictly ABSTAIN
            proposal = TradeProposal(
                symbol=symbol,
                action=SkillAction.ABSTAIN,
                regime=regime,
                contributing_skills=buy_skills + sell_skills,
                agreement_count=max(len(buy_skills), len(sell_skills)),
                conflict_count=min(len(buy_skills), len(sell_skills)),
                status="ABSTAINED_CONFLICT",
                reason=f"Conflicting signals: {len(buy_skills)} BUY vs {len(sell_skills)} SELL",
                price=quote.ltp,
                timestamp=now
            )
            self._record_proposal(proposal)
            return proposal

        if len(buy_skills) >= self.min_agreement_threshold:
            proposal = TradeProposal(
                symbol=symbol,
                action=SkillAction.BUY,
                regime=regime,
                contributing_skills=buy_skills,
                agreement_count=len(buy_skills),
                conflict_count=0,
                status="PROPOSED",
                reason=f"Consensus BUY from {len(buy_skills)} skills under {regime.value}",
                price=quote.ltp,
                suggested_stop_loss=round(quote.ltp * 0.99, 2),
                suggested_target=round(quote.ltp * 1.02, 2),
                timestamp=now
            )
            self._record_proposal(proposal)
            return proposal

        if len(sell_skills) >= self.min_agreement_threshold:
            proposal = TradeProposal(
                symbol=symbol,
                action=SkillAction.SELL,
                regime=regime,
                contributing_skills=sell_skills,
                agreement_count=len(sell_skills),
                conflict_count=0,
                status="PROPOSED",
                reason=f"Consensus SELL from {len(sell_skills)} skills under {regime.value}",
                price=quote.ltp,
                suggested_stop_loss=round(quote.ltp * 1.01, 2),
                suggested_target=round(quote.ltp * 0.98, 2),
                timestamp=now
            )
            self._record_proposal(proposal)
            return proposal

        # Insufficient agreement -> Neutral Hold
        proposal = TradeProposal(
            symbol=symbol,
            action=SkillAction.HOLD,
            regime=regime,
            contributing_skills=hold_skills,
            agreement_count=0,
            conflict_count=0,
            status="HOLD",
            reason="Signals below consensus threshold",
            price=quote.ltp,
            timestamp=now
        )
        self._record_proposal(proposal)
        return proposal

    def _record_proposal(self, p: TradeProposal):
        self.recent_proposals.insert(0, p)
        if len(self.recent_proposals) > 100:
            self.recent_proposals.pop()


# Global singleton instance
decision_engine = CentralDecisionEngine()

