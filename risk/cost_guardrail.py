"""
Cost Guardrail Module
Calculates flat brokerage (₹20 buy + ₹20 sell = ₹40) plus estimated taxes.
Strictly rejects any trade where expected net profit does not comfortably exceed transaction costs.
"""

import logging
from dataclasses import dataclass, field
from typing import Optional, Dict, Any

from risk.risk_manager import RiskManager


@dataclass
class CostBreakdown:
    """Detailed cost breakdown for a trade."""
    brokerage_buy: float = 20.0
    brokerage_sell: float = 20.0
    total_brokerage: float = 40.0
    gst_on_brokerage: float = 0.0  # 18% GST on brokerage
    sebi_government_fee: float = 0.0  # ₹0.01 per share (buy + sell)
    stamp_duty: float = 0.0  # Varies by state, typically negligible for intraday
    total_taxes: float = 0.0
    total_cost: float = 40.0

    # For CNC (Cash and Carry) - additional charges may apply
    brokerage_cnc_buy: float = 0.0  # May be flat or percentage
    brokerage_cnc_sell: float = 0.0

    def calculate_gst(self) -> float:
        """Calculate GST on brokerage."""
        self.gst_on_brokerage = self.total_brokerage * 0.18
        return self.gst_on_brokerage

    def calculate_sebi_fee(self, quantity: int) -> float:
        """Calculate SEBI government fee."""
        self.sebi_government_fee = quantity * 0.01 * 2  # Buy + sell
        return self.sebi_government_fee

    def calculate_total(self, quantity: int) -> float:
        """Calculate total transaction cost."""
        self.calculate_gst()
        self.calculate_sebi_fee(quantity)
        self.total_taxes = self.gst_on_brokerage
        self.total_cost = self.total_brokerage + self.total_taxes + self.sebi_government_fee
        return self.total_cost

    def to_dict(self) -> Dict[str, float]:
        return {
            "brokerage_buy": self.brokerage_buy,
            "brokerage_sell": self.brokerage_sell,
            "total_brokerage": self.total_brokerage,
            "gst_on_brokerage": self.gst_on_brokerage,
            "sebi_government_fee": self.sebi_government_fee,
            "total_taxes": self.total_taxes,
            "total_cost": self.total_cost
        }


@dataclass
class TradeAnalysis:
    """Analysis of a potential trade against costs."""
    symbol: str
    entry_price: float
    exit_price: float
    quantity: int
    expected_pnl: float
    commission: float = field(default_factory=lambda: CostBreakdown())
    net_pnl: float = 0.0
    roi_pct: float = 0.0
    cost_ratio: float = 0.0  # Cost as % of expected profit
    is_profitable: bool = False
    reason: str = ""


class CostGuardrail:
    """
    Cost Guardrail - Protects small capital accounts from transaction costs.

    For small capital (e.g., ₹2,000), transaction costs can wipe out profits.
    This module ensures:
    - Expected net profit comfortably exceeds ₹40 brokerage + taxes
    - Minimum profit threshold is maintained
    - Cost awareness is built into every trade decision
    """

    # Minimum profit ratio to cost - must earn at least 2x brokerage costs
    MIN_PROFIT_TO_COST_RATIO = 2.0

    # Safety buffer percentage - actual profit should be higher than calculated
    SAFETY_BUFFER_PCT = 20.0

    # Minimum profit in rupees to make trade worthwhile
    MINIMUM_PROFIT_RUPEES = 50.0

    def __init__(self, risk_manager: Optional[RiskManager] = None):
        """
        Initialize cost guardrail.

        Args:
            risk_manager: Optional risk manager instance
        """
        self.risk_manager = risk_manager
        self.logger = logging.getLogger(f"{__name__}.CostGuardrail")
        self.logger.setLevel(logging.INFO)

        # Fee configuration
        self._brokerage_buy = 20.0
        self._brokerage_sell = 20.0
        self._total_brokerage = 40.0

        # Track analysis history
        self._analysis_history: list = []

    def calculate_costs(self, quantity: int, product_type: str = "INTRADAY") -> CostBreakdown:
        """
        Calculate total transaction costs.

        Args:
            quantity: Order quantity
            product_type: "INTRADAY" or "CNC"

        Returns:
            CostBreakdown with all costs
        """
        costs = CostBreakdown(
            brokerage_buy=self._brokerage_buy,
            brokerage_sell=self._brokerage_sell
        )
        costs.calculate_total(quantity)
        return costs

    def analyze_trade(
        self,
        symbol: str,
        entry_price: float,
        exit_price: float,
        quantity: int,
        side: str = "BUY"  # or "SELL" for short
    ) -> TradeAnalysis:
        """
        Analyze a potential trade against cost guardrail.

        Args:
            symbol: Trading symbol
            entry_price: Entry price
            exit_price: Expected exit price
            quantity: Quantity
            side: "BUY" for long, "SELL" for short

        Returns:
            TradeAnalysis with profitability assessment
        """
        # Calculate expected P&L
        if side.upper() == "BUY":
            expected_pnl = (exit_price - entry_price) * quantity
        else:
            expected_pnl = (entry_price - exit_price) * quantity

        # Calculate costs
        costs = self.calculate_costs(quantity)

        # Calculate net P&L
        net_pnl = expected_pnl - costs.total_cost

        # Calculate ROI
        investment = entry_price * quantity
        roi_pct = (net_pnl / investment * 100) if investment > 0 else 0

        # Calculate cost ratio
        cost_ratio = costs.total_cost / expected_pnl if expected_pnl > 0 else float('inf')

        # Determine if trade passes guardrail
        is_profitable = self._is_trade_profitable(
            expected_pnl=expected_pnl,
            net_pnl=net_pnl,
            costs=costs,
            investment=investment
        )

        # Determine reason
        reason = self._get_rejection_reason(
            expected_pnl=expected_pnl,
            net_pnl=net_pnl,
            costs=costs,
            roi_pct=roi_pct
        ) if not is_profitable else "PASS"

        analysis = TradeAnalysis(
            symbol=symbol,
            entry_price=entry_price,
            exit_price=exit_price,
            quantity=quantity,
            expected_pnl=expected_pnl,
            commission=costs,
            net_pnl=net_pnl,
            roi_pct=roi_pct,
            cost_ratio=cost_ratio,
            is_profitable=is_profitable,
            reason=reason
        )

        # Store in history
        self._analysis_history.append(analysis)
        if len(self._analysis_history) > 1000:
            self._analysis_history.pop(0)

        return analysis

    def _is_trade_profitable(
        self,
        expected_pnl: float,
        net_pnl: float,
        costs: CostBreakdown,
        investment: float
    ) -> bool:
        """
        Determine if a trade passes the cost guardrail.

        Criteria:
        1. Net P&L > 0
        2. Net P&L > Minimum profit threshold
        3. Cost ratio < Maximum allowed
        4. ROI > Minimum acceptable
        """
        # Must be profitable
        if net_pnl <= 0:
            return False

        # Must meet minimum profit threshold
        if net_pnl < self.MINIMUM_PROFIT_RUPEES:
            return False

        # Cost must be reasonable vs profit
        if costs.total_cost > expected_pnl / self.MIN_PROFIT_TO_COST_RATIO:
            return False

        # ROI must be positive (obviously satisfied if net_pnl > 0)
        if net_pnl / investment * 100 <= 0:
            return False

        return True

    def _get_rejection_reason(
        self,
        expected_pnl: float,
        net_pnl: float,
        costs: CostBreakdown,
        roi_pct: float
    ) -> str:
        """Get reason for trade rejection."""
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
        product_type: str = "INTRADAY"
    ) -> int:
        """
        Calculate optimal order size based on cost guardrail.

        Args:
            entry_price: Entry price
            expected_move: Expected price move (positive for long)
            available_capital: Available capital
            product_type: Order product type

        Returns:
            Maximum quantity that passes cost guardrail
        """
        if expected_move <= 0:
            return 0

        exit_price = entry_price + expected_move

        # Binary search for optimal quantity
        low, high = 1, 1000  # Reasonable limits
        best_qty = 0

        for quantity in range(1, 1001):
            analysis = self.analyze_trade(
                symbol="TEST",
                entry_price=entry_price,
                exit_price=exit_price,
                quantity=quantity
            )

            if analysis.is_profitable:
                best_qty = quantity
            else:
                break

        # Check if this fits in available capital
        required_capital = entry_price * best_qty
        if required_capital > available_capital:
            # Reduce to fit capital
            max_by_capital = int(available_capital / entry_price)
            if max_by_capital < best_qty:
                # Re-evaluate
                analysis = self.analyze_trade(
                    symbol="TEST",
                    entry_price=entry_price,
                    exit_price=exit_price,
                    quantity=max_by_capital
                )
                if not analysis.is_profitable:
                    best_qty = max_by_capital * 0.8  # Be conservative

        return int(best_qty)

    def get_cost_aware_position_size(
        self,
        symbol: str,
        entry_price: float,
        target_profit_pct: float,
        available_capital: float,
        commission_rate: float = 0.0,
        brokerage_fixed: float = 40.0
    ) -> Dict[str, Any]:
        """
        Calculate position size that accounts for costs.

        This is a sophisticated calculation that determines
        position size where costs don't erode intended returns.
        """
        # Target profit in rupees
        target_profit_rupees = available_capital * (target_profit_pct / 100)

        # Minimum expected profit must exceed costs by safety margin
        min_expected_profit = brokerage_fixed * self.MIN_PROFIT_TO_COST_RATIO
        min_expected_profit *= (1 + self.SAFETY_BUFFER_PCT / 100)

        # Calculate required price move
        required_move_per_share = min_expected_profit / available_capital * entry_price

        # Maximum quantity
        max_qty = int(available_capital / entry_price)

        # Find quantity where costs are acceptable
        for qty in range(max_qty, 0, -1):
            costs = self.calculate_costs(qty)
            position_value = entry_price * qty

            # Cost as % of position
            cost_pct = (costs.total_cost / position_value) * 100

            # Expected profit at target
            expected_profit = position_value * (target_profit_pct / 100)

            # Net after costs
            net_profit = expected_profit - costs.total_cost

            if net_profit > 0 and cost_pct < 1.0:  # Costs < 1% of position
                return {
                    "quantity": qty,
                    "position_value": position_value,
                    "expected_cost": costs.total_cost,
                    "cost_percentage": cost_pct,
                    "net_profit": net_profit,
                    "roi_percentage": (net_profit / position_value) * 100
                }

        return {
            "quantity": 0,
            "position_value": 0,
            "expected_cost": 0,
            "cost_percentage": 0,
            "net_profit": 0,
            "roi_percentage": 0,
            "reason": "Even 1 share has negative net expected return"
        }

    def is_cost_effective(
        self,
        expected_profit: float,
        brokerage: float = 40.0,
        tax_estimate: float = 0.0
    ) -> bool:
        """
        Quick check if expected profit justifies costs.

        Args:
            expected_profit: Expected profit before costs
            brokerage: Brokerage cost
            tax_estimate: Estimated tax

        Returns:
            True if trade passes cost guardrail
        """
        total_cost = brokerage + tax_estimate
        net_profit = expected_profit - total_cost

        # Must earn at least 2x costs
        min_required = brokerage * self.MIN_PROFIT_TO_COST_RATIO

        return net_profit >= min_required and net_profit > 0

    def estimate_tax(self, profit: float, days_held: int = 0) -> float:
        """
        Estimate tax on profit.

        For intraday: No STT, minimal taxes
        For delivery: STT + taxes apply
        """
        # Simplified tax calculation for Indian markets
        if days_held == 0:
            # Intraday - minimal taxes
            stt = profit * 0.001 if profit > 0 else 0  # 0.1% STT on winning trades
            return stt
        else:
            # Delivery - full taxation
            # This is approximate - actual taxation depends on multiple factors
            total_tax = 0
            if profit > 0:
                total_tax += profit * 0.001  # STT
                total_tax += profit * 0.03   # Tax on securities transaction
            return total_tax

    def get_min_profit_for_cost(self, brokerage: float = 40.0) -> float:
        """
        Get minimum expected profit required to cover costs.

        Args:
            brokerage: Brokerage cost

        Returns:
            Minimum expected profit
        """
        return brokerage * self.MIN_PROFIT_TO_COST_RATIO

    def get_analysis_history(self, limit: int = 50) -> list:
        """Get recent trade analysis history."""
        return self._analysis_history[-limit:]

    def clear_history(self) -> None:
        """Clear analysis history."""
        self._analysis_history.clear()

    def set_brokerage(self, buy: float = 20.0, sell: float = 20.0) -> None:
        """Set brokerage rates."""
        self._brokerage_buy = buy
        self._brokerage_sell = sell
        self._total_brokerage = buy + sell
        self.logger.info(f"Brokerage set: Buy ₹{buy}, Sell ₹{sell}, Total ₹{self._total_brokerage}")


# Convenience function for quick cost check
def check_trade_profitability(
    entry: float,
    exit_price: float,
    qty: int,
    side: str = "BUY",
    brokerage: float = 40.0
) -> Dict[str, Any]:
    """
    Quick check if a trade is cost-effective.

    Returns dict with: profitable, net_pnl, cost_ratio, reason
    """
    if side.upper() == "BUY":
        expected_pnl = (exit_price - entry) * qty
    else:
        expected_pnl = (entry - exit_price) * qty

    net_pnl = expected_pnl - brokerage

    result = {
        "profitable": net_pnl > 0,
        "expected_pnl": expected_pnl,
        "brokerage": brokerage,
        "net_pnl": net_pnl,
        "cost_ratio": brokerage / expected_pnl if expected_pnl > 0 else float('inf'),
        "reason": ""
    }

    if net_pnl <= 0:
        result["reason"] = "Expected loss after brokerage"
    elif net_pnl < 50:
        result["reason"] = "Net profit below ₹50 minimum"
    elif brokerage > expected_pnl / 2:
        result["reason"] = "Brokerage costs too high vs expected profit"
    else:
        result["reason"] = "PASS"

    return result