"""
Cost Guardrail Module (Phase 2 refactor).

PHASE 2 (TAX-006 / ARCH-001): the legacy flat "₹20 + ₹20 + GST-on-brokerage-only +
₹0.01/share SEBI" model is RETIRED. It diverged from the authoritative statutory model
(no STT, no exchange transaction charges, no stamp duty, wrong SEBI basis) and had no
tests or callers. All cost arithmetic now delegates to risk/statutory_cost.py, which
mirrors src/lib/tax.ts over the single authoritative spec (config/statutory_rates.json).

The class names (CostBreakdown, TradeAnalysis, CostGuardrail) are preserved for
import compatibility with risk/__init__.py; their calculations are now authoritative.
"""

import logging
from dataclasses import dataclass, field
from typing import Any, Dict, Optional

from risk.risk_manager import RiskManager
from risk.statutory_cost import (
    ChargeBreakdown,
    UnsupportedSegmentError,
    calculate_net_pnl,
    leg_charges,
    round_trip_charges,
)

LEGACY_FLAT_MODEL_RETIRED = True  # Phase 2 marker (TAX-006)


@dataclass
class CostBreakdown:
    """
    Cost breakdown for a round trip, computed by the authoritative engine.

    Historical field names are preserved; values now come from risk/statutory_cost.py.
    `basis` mirrors TS: FULL_ROUND_TRIP (computed) or MINIMUM_FLOOR_ESTIMATE
    (total-only floor when trade parameters are absent — TAX-002: no fabricated heads).
    """

    brokerage_buy: float = 0.0
    brokerage_sell: float = 0.0
    total_brokerage: float = 0.0
    gst_on_brokerage: float = 0.0  # retained name; value is GST on (brokerage + exchange + SEBI)
    sebi_government_fee: float = 0.0  # authoritative: turnover × ₹10/crore
    stamp_duty: float = 0.0
    total_taxes: float = 0.0
    total_cost: float = 0.0
    brokerage_cnc_buy: float = 0.0
    brokerage_cnc_sell: float = 0.0
    # Phase 2 authoritative heads (previously missing entirely):
    stt: float = 0.0
    exchange_fees: float = 0.0
    entry_slippage: float = 0.0
    exit_slippage: float = 0.0
    slippage: float = 0.0
    entry_turnover: float = 0.0
    exit_turnover: float = 0.0
    total_turnover: float = 0.0
    basis: str = "MINIMUM_FLOOR_ESTIMATE"
    rate_spec_version: str = ""
    authoritative: Optional[ChargeBreakdown] = None

    def calculate_total(self, quantity: int) -> float:
        """Backward-compatible: recompute nothing (values come from the engine)."""
        return self.total_cost

    def to_dict(self) -> Dict[str, Any]:
        return {
            "brokerage_buy": self.brokerage_buy,
            "brokerage_sell": self.brokerage_sell,
            "total_brokerage": self.total_brokerage,
            "gst_on_brokerage": self.gst_on_brokerage,
            "sebi_government_fee": self.sebi_government_fee,
            "stamp_duty": self.stamp_duty,
            "stt": self.stt,
            "exchange_fees": self.exchange_fees,
            "slippage": self.slippage,
            "total_taxes": self.total_taxes,
            "total_cost": self.total_cost,
            "basis": self.basis,
            "rate_spec_version": self.rate_spec_version,
        }


def breakdown_from_charge(c: ChargeBreakdown, entry_leg: Optional[ChargeBreakdown] = None) -> CostBreakdown:
    """Adapt the authoritative ChargeBreakdown to the legacy CostBreakdown shape."""
    entry_brk = entry_leg.brokerage if entry_leg else round(c.brokerage / 2, 2)
    exit_brk = round(c.brokerage - entry_brk, 2)
    taxes = c.stt + c.exchange_fees + c.sebi + c.stamp + c.gst
    return CostBreakdown(
        brokerage_buy=entry_brk,
        brokerage_sell=exit_brk,
        total_brokerage=c.brokerage,
        gst_on_brokerage=c.gst,
        sebi_government_fee=c.sebi,
        stamp_duty=c.stamp,
        stt=c.stt,
        exchange_fees=c.exchange_fees,
        entry_slippage=c.entry_slippage,
        exit_slippage=c.exit_slippage,
        slippage=c.slippage,
        entry_turnover=c.entry_turnover,
        exit_turnover=c.exit_turnover,
        total_turnover=c.total_turnover,
        total_taxes=taxes,
        total_cost=c.total,
        basis=c.basis,
        rate_spec_version=c.rate_spec_version,
        authoritative=c,
    )


@dataclass
class TradeAnalysis:
    """Analysis of a potential trade against costs."""

    symbol: str
    entry_price: float
    exit_price: float
    quantity: int
    expected_pnl: float
    commission: CostBreakdown = field(default_factory=CostBreakdown)
    net_pnl: float = 0.0
    roi_pct: float = 0.0
    cost_ratio: float = 0.0
    is_profitable: bool = False
    reason: str = ""


class CostGuardrail:
    """
    Cost Guardrail — rejects trades whose expected net profit does not clear the
    authoritative transaction cost model.
    """

    MIN_PROFIT_TO_COST_RATIO = 2.0
    SAFETY_BUFFER_PCT = 20.0
    MINIMUM_PROFIT_RUPEES = 50.0

    def __init__(self, risk_manager: Optional[RiskManager] = None):
        self.risk_manager = risk_manager
        self.logger = logging.getLogger(f"{__name__}.CostGuardrail")
        self.logger.setLevel(logging.INFO)
        self._analysis_history: list = []

    def calculate_costs(
        self,
        quantity: int,
        product_type: str = "INTRADAY",
        entry_price: Optional[float] = None,
        exit_price: Optional[float] = None,
        side: str = "BUY",
        exchange: str = "NSE",
        kind: str = "EQ",
        broker: str = "shoonya",
        entry_slippage_bps: Optional[float] = None,
        exit_slippage_bps: Optional[float] = None,
    ) -> CostBreakdown:
        """
        Round-trip transaction costs via the authoritative engine.

        With prices: FULL_ROUND_TRIP statutory computation (identical to TS roundTripCharges).
        Without prices: MINIMUM_FLOOR_ESTIMATE (broker minimum deduction, zeroed heads —
        TAX-002: never fabricate component values).
        """
        if entry_price and exit_price:
            c = round_trip_charges(
                exchange, kind, broker, quantity, entry_price, exit_price,
                side=side, product_type=product_type,
                entry_slippage_bps=entry_slippage_bps, exit_slippage_bps=exit_slippage_bps,
            )
            entry_leg = leg_charges(exchange, kind, broker, quantity, entry_price, side, product_type)
            return breakdown_from_charge(c, entry_leg)
        res = calculate_net_pnl(0.0, broker)
        return breakdown_from_charge(res["charges"])

    def analyze_trade(
        self,
        symbol: str,
        entry_price: float,
        exit_price: float,
        quantity: int,
        side: str = "BUY",
        product_type: str = "INTRADAY",
        exchange: str = "NSE",
        kind: str = "EQ",
        broker: str = "shoonya",
    ) -> TradeAnalysis:
        expected_pnl = (exit_price - entry_price) * quantity if side.upper() == "BUY" else (entry_price - exit_price) * quantity
        costs = self.calculate_costs(
            quantity, product_type=product_type,
            entry_price=entry_price, exit_price=exit_price, side=side,
            exchange=exchange, kind=kind, broker=broker,
        )
        net_pnl = expected_pnl - costs.total_cost
        investment = entry_price * quantity
        roi_pct = (net_pnl / investment * 100) if investment > 0 else 0
        cost_ratio = costs.total_cost / expected_pnl if expected_pnl > 0 else float("inf")
        is_profitable = self._is_trade_profitable(expected_pnl, net_pnl, costs, investment)
        reason = "PASS" if is_profitable else self._get_rejection_reason(expected_pnl, net_pnl, costs, roi_pct)
        analysis = TradeAnalysis(
            symbol=symbol, entry_price=entry_price, exit_price=exit_price,
            quantity=quantity, expected_pnl=expected_pnl, commission=costs,
            net_pnl=net_pnl, roi_pct=roi_pct, cost_ratio=cost_ratio,
            is_profitable=is_profitable, reason=reason,
        )
        self._analysis_history.append(analysis)
        if len(self._analysis_history) > 1000:
            self._analysis_history.pop(0)
        return analysis

    def _is_trade_profitable(self, expected_pnl: float, net_pnl: float, costs: CostBreakdown, investment: float) -> bool:
        if net_pnl <= 0:
            return False
        if net_pnl < self.MINIMUM_PROFIT_RUPEES:
            return False
        if costs.total_cost > expected_pnl / self.MIN_PROFIT_TO_COST_RATIO:
            return False
        if investment > 0 and net_pnl / investment * 100 <= 0:
            return False
        return True

    def _get_rejection_reason(self, expected_pnl: float, net_pnl: float, costs: CostBreakdown, roi_pct: float) -> str:
        if net_pnl <= 0:
            return "Expected loss after costs"
        if net_pnl < self.MINIMUM_PROFIT_RUPEES:
            return f"Net profit ₹{net_pnl:.2f} below minimum ₹{self.MINIMUM_PROFIT_RUPEES}"
        if costs.total_cost > expected_pnl / self.MIN_PROFIT_TO_COST_RATIO:
            return f"Costs (₹{costs.total_cost:.2f}) too high vs expected profit"
        if roi_pct <= 0:
            return "Negative ROI"
        return "Unknown reason"

    def evaluate_order_size(
        self,
        entry_price: float,
        expected_move: float,
        available_capital: float,
        product_type: str = "INTRADAY",
    ) -> int:
        if expected_move <= 0:
            return 0
        exit_price = entry_price + expected_move
        best_qty = 0
        for quantity in range(1, 1001):
            if entry_price * quantity > available_capital:
                break
            analysis = self.analyze_trade("TEST", entry_price, exit_price, quantity)
            if analysis.is_profitable:
                best_qty = quantity
            else:
                break
        return best_qty
