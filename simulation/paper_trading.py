"""
Paper Trading Module
Virtual order book, realistic slippage, simulated fills using live market data,
real-time P&L calculator
"""

import logging
from collections import deque
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import Optional, Dict, List, Any, Callable

from core.broker_adapter import BrokerAdapter, Order, OrderType, ProductType, Quote


class OrderStatus(Enum):
    """Paper trading order status."""
    PENDING = "PENDING"
    SUBMITTED = "SUBMITTED"
    PARTIALLY_FILLED = "PARTIALLY_FILLED"
    FILLED = "FILLED"
    CANCELLED = "CANCELLED"
    REJECTED = "REJECTED"
    EXPIRED = "EXPIRED"


@dataclass
class FilledOrder:
    """A filled order in paper trading."""
    order_id: str
    symbol: str
    side: str
    quantity: int
    filled_quantity: int = 0
    avg_fill_price: float = 0.0
    fill_price: float = 0.0
    fill_quantity: int = 0
    status: OrderStatus = OrderStatus.FILLED
    timestamp: datetime = field(default_factory=datetime.now)
    fee: float = 0.0

    def to_dict(self) -> Dict[str, Any]:
        return {
            "order_id": self.order_id,
            "symbol": self.symbol,
            "side": self.side,
            "quantity": self.quantity,
            "filled_quantity": self.filled_quantity,
            "avg_fill_price": self.avg_fill_price,
            "status": self.status.value,
            "timestamp": self.timestamp.isoformat(),
            "fee": self.fee
        }


@dataclass
class Position:
    """Paper trading position."""
    symbol: str
    side: str  # LONG or SHORT
    quantity: int
    avg_price: float
    unrealised_pnl: float = 0.0
    realised_pnl: float = 0.0
    entry_time: datetime = field(default_factory=datetime.now)
    current_price: float = 0.0
    orders: List[FilledOrder] = field(default_factory=list)

    def update_pnl(self, current_price: float) -> float:
        """Update unrealised P&L."""
        self.current_price = current_price
        if self.side == "LONG":
            self.unrealised_pnl = (current_price - self.avg_price) * self.quantity
        else:
            self.unrealised_pnl = (self.avg_price - current_price) * self.quantity
        return self.unrealised_pnl

    def close(self, current_price: float) -> float:
        """Close position and return realised P&L."""
        realised = self.unrealised_pnl
        self.unrealised_pnl = 0.0
        self.quantity = 0
        return realised

    @property
    def unrealized_pnl(self) -> float:
        return self.unrealised_pnl

    @property
    def realized_pnl(self) -> float:
        return self.realised_pnl

    @property
    def charges(self) -> float:
        # Phase 2: sum actual recorded fees; never fabricate defaults (TAX-002 policy).
        return sum(float(getattr(o, 'fee', 0.0) or 0.0) for o in self.orders)


@dataclass
class PaperTradingConfig:
    """Paper trading configuration."""
    default_slippage_pct: float = 0.05  # 0.05% default slippage
    min_slippage: float = 0.0   # No negative slippage
    max_slippage: float = 0.3  # 0.3% max slippage
    commission_per_order: float = 40.0  # Legacy display field (no longer used for fee math)
    commission_multiplier: float = 1.0  # For scaling
    broker_id: str = "shoonya"  # Broker whose authoritative rate spec rows apply (Phase 2 TAX-006)
    fill_probability: float = 0.98  # 98% fill rate for limit orders
    market_impact_pct: float = 0.01  # 0.01% market impact for large orders
    order_book_depth: int = 10  # Number of levels to consider


class PaperTrading:
    """
    Paper Trading engine - virtual order execution using live market data.

    Features:
    - Virtual order book with realistic liquidity simulation
    - Slippage modeling based on order size and volatility
    - Simulated fills with realistic timing
    - Real-time P&L calculation
    - Trade history tracking
    """

    def __init__(
        self,
        broker: Optional[BrokerAdapter] = None,
        config: Optional[PaperTradingConfig] = None,
        initial_capital: float = 100000.0,
        db_manager: Optional[Any] = None
    ):
        """
        Initialize paper trading.

        Args:
            broker: Broker adapter for live market data
            config: Paper trading configuration
            initial_capital: Starting virtual capital
            db_manager: SQLite database persistence manager
        """
        self.broker = broker
        self.config = config or PaperTradingConfig()
        self.initial_capital = initial_capital

        # State
        self._running = False
        self._capital = initial_capital
        self._used_margin = 0.0

        # Account tracking
        self._cash = initial_capital
        self._positions: Dict[str, Position] = {}
        self._filled_orders: List[FilledOrder] = []
        self._open_orders: Dict[str, Order] = {}
        self._closed_positions: List[Dict[str, Any]] = []
        self._cancelled_orders: List[Order] = []
        self._rejected_orders: List[Order] = []

        # Database Manager
        self.db_manager = db_manager
        if self.db_manager is None:
            try:
                from core.database import db_manager as default_db
                self.db_manager = default_db
            except Exception:
                self.db_manager = None

        # P&L tracking
        self._realised_pnl = 0.0
        self._unrealised_pnl = 0.0
        self._total_pnl = 0.0

        # Event callbacks
        self._fill_callbacks: List[Callable[[FilledOrder], None]] = []
        self._order_callbacks: List[Callable[[Order, OrderStatus], None]] = []

        # Market data cache
        self._order_books: Dict[str, Dict[str, Any]] = {}
        self._quotes: Dict[str, Quote] = {}

        # Logger
        self.logger = logging.getLogger(f"{__name__}.PaperTrading")
        self.logger.setLevel(logging.INFO)

        # Subscribe to live data if broker available
        if self.broker:
            self.broker.register_callback('tick', self._on_tick)

    def _on_tick(self, quote: Quote) -> None:
        """Process live tick data and match open orders."""
        if not quote or not quote.symbol:
            return

        # Stale & out-of-order tick validation
        last_quote = self._quotes.get(quote.symbol)
        if last_quote and hasattr(quote, 'timestamp') and hasattr(last_quote, 'timestamp'):
            if quote.timestamp and last_quote.timestamp and quote.timestamp < last_quote.timestamp:
                self.logger.warning(
                    f"Stale/Out-of-order tick discarded for {quote.symbol}: "
                    f"{quote.timestamp} < {last_quote.timestamp}"
                )
                return

        self._quotes[quote.symbol] = quote

        # Check and process pending open orders for this symbol
        pending_ids = [oid for oid, o in list(self._open_orders.items()) if o.symbol == quote.symbol]
        for oid in pending_ids:
            ord_obj = self._open_orders.get(oid)
            if not ord_obj:
                continue
            fill_p, fill_q = self._calculate_fill(ord_obj, quote)
            if fill_q > 0:
                ord_obj.record_fill(fill_q, fill_p)
                filled = FilledOrder(
                    order_id=oid,
                    symbol=ord_obj.symbol,
                    side=ord_obj.transaction_type.upper(),
                    quantity=ord_obj.quantity,
                    filled_quantity=fill_q,
                    fill_price=fill_p,
                    avg_fill_price=fill_p,
                    status=OrderStatus.FILLED if ord_obj.remaining_qty == 0 else OrderStatus.PARTIALLY_FILLED,
                    fee=self._calculate_fees(ord_obj.quantity, fill_p, fill_q, ord_obj.transaction_type),
                    timestamp=datetime.now()
                )
                self._execute_fill(filled)
                if ord_obj.remaining_qty == 0:
                    self._notify_order_status(ord_obj, OrderStatus.FILLED)

        # Update position P&L
        if quote.symbol in self._positions:
            pos = self._positions[quote.symbol]
            pos.update_pnl(quote.ltp)
            self._unrealised_pnl = sum(
                p.unrealised_pnl for p in self._positions.values()
            )
            self._total_pnl = self._realised_pnl + self._unrealised_pnl

            # Fire position update event
            self._dispatch_position_update(pos)

    def place_order(self, order: Order) -> Optional[str]:
        """
        Place a paper trade order.

        Args:
            order: Order to place

        Returns:
            Order ID if order accepted, None if rejected
        """
        if not self._running:
            self.logger.warning("Paper trading not running")
            return None

        # Input validation
        if order.quantity <= 0:
            self.logger.warning("Order quantity must be positive")
            order.mark_rejected("Order quantity must be positive")
            self._rejected_orders.append(order)
            return None
        if order.price is not None and order.price < 0:
            self.logger.warning("Order price cannot be negative")
            order.mark_rejected("Order price cannot be negative")
            self._rejected_orders.append(order)
            return None

        # Check sufficient cash (for buy orders)
        if order.transaction_type.upper() == "BUY":
            required_cash = self._calculate_order_value(order)
            if required_cash > self._cash:
                self.logger.warning(f"Insufficient cash for order: {required_cash:.2f} > {self._cash:.2f}")
                order.mark_rejected(f"Insufficient cash: required {required_cash:.2f} > available {self._cash:.2f}")
                self._notify_order_status(order, OrderStatus.REJECTED)
                self._rejected_orders.append(order)
                if self.db_manager:
                    try:
                        self.db_manager.save_order(order.to_dict())
                    except Exception:
                        pass
                return None

        order_id = f"PAPER_{self._generate_order_id()}"
        order.order_id = order_id
        self._open_orders[order_id] = order

        self.logger.info(f"Order submitted: {order_id} - {order.symbol} {order.quantity} @ {order.price}")

        # Process order
        self._process_order(order, order_id)

        return order_id

    def _process_order(self, order: Order, order_id: str) -> None:
        """Process an order and simulate fill."""
        quote = self._quotes.get(order.symbol)
        if not quote and self.broker:
            quote = self.broker.get_quote(order.symbol)
            if quote:
                self._quotes[order.symbol] = quote

        if not quote:
            # Phase 8: Paper Trading must NEVER use fake or synthetic production market prices.
            # If Angel One real market data is unavailable, stop new market-data-dependent paper orders.
            # Do not substitute synthetic prices or generate artificial ticks.
            self.logger.warning(
                f"Paper order {order_id} rejected for {order.symbol}: "
                f"Genuine Angel One market data is unavailable."
            )
            order.mark_rejected("WAITING FOR REAL MARKET DATA (No genuine Angel One quote available)")
            self._notify_order_status(order, OrderStatus.REJECTED)
            self._rejected_orders.append(order)
            if self.db_manager:
                try:
                    self.db_manager.save_order(order.to_dict())
                except Exception:
                    pass
            if order_id in self._open_orders:
                del self._open_orders[order_id]
            return

        # Calculate fill based on order type
        fill_price, fill_qty = self._calculate_fill(order, quote)

        if fill_qty <= 0:
            if order.order_type in (OrderType.LIMIT, OrderType.SL, OrderType.SL_M):
                order.status = "PENDING"
                self._notify_order_status(order, OrderStatus.SUBMITTED)
                if self.db_manager:
                    try:
                        self.db_manager.save_order(order.to_dict())
                    except Exception:
                        pass
                return
            order.mark_rejected("No fill available")
            self._notify_order_status(order, OrderStatus.REJECTED)
            self._rejected_orders.append(order)
            if self.db_manager:
                try:
                    self.db_manager.save_order(order.to_dict())
                except Exception:
                    pass
            if order_id in self._open_orders:
                del self._open_orders[order_id]
            return

        # Record fill on Order dataclass
        order.record_fill(fill_qty, fill_price)

        # Create filled order
        filled = FilledOrder(
            order_id=order_id,
            symbol=order.symbol,
            side=order.transaction_type.upper(),
            quantity=order.quantity,
            filled_quantity=fill_qty,
            fill_price=fill_price,
            avg_fill_price=fill_price,
            status=OrderStatus.FILLED,
            fee=self._calculate_fees(order.quantity, fill_price, fill_qty, order.transaction_type),
            timestamp=datetime.now()
        )

        self._execute_fill(filled)

    def _calculate_fill(self, order: Order, quote: Quote) -> tuple:
        """Calculate fill price and quantity with slippage."""
        quantity = order.quantity

        # Market order fill
        if order.order_type == OrderType.MARKET:
            slippage = self._calculate_slippage(order, quote)
            if order.transaction_type.upper() == "BUY":
                fill_price = round(quote.ask + slippage, 2)
            else:
                fill_price = round(max(0.05, quote.bid - slippage), 2)
            return fill_price, quantity

        # Limit order fill
        elif order.order_type == OrderType.LIMIT:
            if order.transaction_type.upper() == "BUY":
                # Buy limit order fills if ask <= limit price
                if quote.ask <= order.price:
                    slippage = self._calculate_slippage(order, quote)
                    fill_price = round(min(quote.ask, order.price) + slippage, 2)
                    return fill_price, quantity
            else:
                # Sell limit order fills if bid >= limit price
                if quote.bid >= order.price:
                    slippage = self._calculate_slippage(order, quote)
                    fill_price = round(max(0.05, max(quote.bid, order.price) - slippage), 2)
                    return fill_price, quantity

            # Limit not hit - order stays open
            return 0.0, 0

        # Stop loss / Stop limit
        elif order.order_type in (OrderType.SL_M, OrderType.SL):
            trigger = order.trigger_price or order.price or quote.ltp
            if order.transaction_type.upper() == "BUY":
                if quote.ltp >= trigger:
                    slippage = self._calculate_slippage(order, quote)
                    return round(quote.ask + slippage, 2), quantity
            else:
                if quote.ltp <= trigger:
                    slippage = self._calculate_slippage(order, quote)
                    return round(max(0.05, quote.bid - slippage), 2), quantity
            return 0.0, 0

        return 0.0, 0

    def _calculate_slippage(self, order: Order, quote: Quote) -> float:
        """
        Calculate realistic slippage based on order size and volatility.
        """
        # Base slippage
        base_slippage = self.config.default_slippage_pct / 100 * quote.ltp

        # Size-based slippage (larger orders have more slippage)
        position_value = order.quantity * quote.ltp
        size_slippage = (position_value / self._cash) * self.config.market_impact_pct * quote.ltp

        # Total slippage with limits
        total_slippage = min(base_slippage + size_slippage, quote.ltp * self.config.max_slippage / 100)

        return total_slippage

    def _calculate_order_value(self, order: Order) -> float:
        """Calculate total order value including estimated costs."""
        quote = self._quotes.get(order.symbol)
        if not quote and self.broker:
            quote = self.broker.get_quote(order.symbol)
            if quote:
                self._quotes[order.symbol] = quote
        if quote and quote.ltp > 0:
            return order.quantity * quote.ltp * (1 + self.config.commission_multiplier)
        if order.price and order.price > 0:
            return order.quantity * order.price * (1 + self.config.commission_multiplier)
        ltp = self.broker.get_ltp(order.symbol) if self.broker else 0.0
        if ltp > 0:
            return order.quantity * ltp * (1 + self.config.commission_multiplier)
        return 0.0

    def _calculate_fees(self, quantity: int, price: float, filled_qty: int, side: str = "BUY") -> float:
        """
        Per-leg trading fees via the AUTHORITATIVE statutory engine (Phase 2 TAX-006).

        Replaces the legacy `commission_per_order + ₹0.01/share` formula, which shared
        no basis with the statutory model (wrong SEBI basis, no STT/exchange/stamp/GST).
        Fees now come from risk/statutory_cost.leg_charges — the exact Python twin of
        src/lib/tax.ts over config/statutory_rates.json. Slippage is excluded here
        because paper fills already embed slippage in the fill price (no double count).

        Args:
            quantity: Order quantity
            price: Execution price
            filled_qty: Filled quantity
            side: Order side ("BUY"/"SELL") — stamp duty on buy legs, STT/CTT on sell legs

        Returns:
            Total fees for this executed leg (raises on unsupported segments: fail closed)
        """
        from risk.statutory_cost import leg_charges

        leg = leg_charges(
            "NSE", "EQ", self.config.broker_id,
            float(filled_qty), float(price), side,
            product_type="INTRADAY", slippage_bps=0.0, order_qty=float(quantity),
        )
        return leg.total

    def _execute_fill(self, filled: FilledOrder) -> None:
        """Execute a filled order with accurate long/short position accounting."""
        action = filled.side.upper()
        qty = filled.filled_quantity
        price = filled.fill_price

        # Update cash
        if action == "BUY":
            self._cash -= price * qty + filled.fee
        else:
            self._cash += price * qty - filled.fee

        # Position accounting
        if filled.symbol not in self._positions or self._positions[filled.symbol].quantity == 0:
            # Open brand new position
            side = "LONG" if action == "BUY" else "SHORT"
            pos = Position(
                symbol=filled.symbol,
                side=side,
                quantity=qty,
                avg_price=price,
                current_price=price,
                unrealised_pnl=0.0,
                realised_pnl=0.0,
                orders=[filled]
            )
            self._positions[filled.symbol] = pos
            if self.db_manager:
                try:
                    self.db_manager.save_position(pos.to_dict())
                except Exception:
                    pass
        else:
            pos = self._positions[filled.symbol]
            pos.orders.append(filled)
            if (pos.side == "LONG" and action == "BUY") or (pos.side == "SHORT" and action == "SELL"):
                # Increasing existing position size
                total_value = pos.avg_price * pos.quantity + price * qty
                pos.quantity += qty
                pos.avg_price = total_value / pos.quantity
                pos.update_pnl(price)
                if self.db_manager:
                    try:
                        self.db_manager.save_position(pos.to_dict())
                    except Exception:
                        pass
            else:
                # Reducing or closing position
                close_qty = min(pos.quantity, qty)
                if pos.side == "LONG":
                    trade_pnl = close_qty * (price - pos.avg_price)
                else:
                    trade_pnl = close_qty * (pos.avg_price - price)

                self._realised_pnl += trade_pnl
                pos.realised_pnl += trade_pnl
                pos.quantity -= close_qty

                # Position flipped in the opposite direction
                remainder = qty - close_qty
                if remainder > 0:
                    pos.side = "SHORT" if action == "SELL" else "LONG"
                    pos.quantity = remainder
                    pos.avg_price = price
                    pos.update_pnl(price)
                    if self.db_manager:
                        try:
                            self.db_manager.save_position(pos.to_dict())
                        except Exception:
                            pass
                elif pos.quantity == 0:
                    closed_record = {
                        "symbol": filled.symbol,
                        "side": pos.side,
                        "entry_price": pos.avg_price,
                        "exit_price": price,
                        "quantity": close_qty,
                        "realised_pnl": trade_pnl,
                        "entry_time": pos.entry_time.isoformat() if hasattr(pos.entry_time, 'isoformat') else str(pos.entry_time),
                        "exit_time": datetime.now().isoformat(),
                        "fee": filled.fee
                    }
                    self._closed_positions.append(closed_record)
                    del self._positions[filled.symbol]
                    if self.db_manager:
                        try:
                            self.db_manager.delete_position(filled.symbol)
                        except Exception:
                            pass
                else:
                    if self.db_manager:
                        try:
                            self.db_manager.save_position(pos.to_dict())
                        except Exception:
                            pass

        self._filled_orders.append(filled)
        if self.db_manager:
            try:
                self.db_manager.save_trade(filled.to_dict())
            except Exception:
                pass

        # Remove from open orders
        if filled.order_id in self._open_orders:
            ord_obj = self._open_orders[filled.order_id]
            ord_obj.status = "COMPLETED"
            if self.db_manager:
                try:
                    self.db_manager.save_order(ord_obj.to_dict())
                except Exception:
                    pass
            del self._open_orders[filled.order_id]

        # Update total P&L
        self._unrealised_pnl = sum(
            p.unrealised_pnl for p in self._positions.values()
        )
        self._total_pnl = self._realised_pnl + self._unrealised_pnl

        # Notify callbacks
        self._notify_fill(filled)
        self._notify_order_status(
            self._open_orders.get(filled.order_id, filled),
            OrderStatus.FILLED
        )

    def cancel_order(self, order_id: str) -> bool:
        """Cancel a pending order."""
        if order_id in self._open_orders:
            order = self._open_orders[order_id]
            order.mark_cancelled()
            self._notify_order_status(order, OrderStatus.CANCELLED)
            del self._open_orders[order_id]
            self._cancelled_orders.append(order)
            if self.db_manager:
                try:
                    self.db_manager.save_order(order.to_dict())
                except Exception as e:
                    self.logger.error(f"Error persisting cancelled order to db: {e}")
            self.logger.info(f"Order cancelled: {order_id}")
            return True

        if any(f.order_id == order_id for f in self._filled_orders):
            self.logger.warning(f"Cannot cancel order {order_id}: Already executed/filled.")
            return False

        return False

    def cancel_all_orders(self) -> List[str]:
        """Cancel all active pending orders, preserving executed and cancelled history."""
        cancelled = []
        for oid in list(self._open_orders.keys()):
            if self.cancel_order(oid):
                cancelled.append(oid)
        self.logger.info(f"Cancelled {len(cancelled)} pending open orders.")
        return cancelled

    def square_off_position(self, symbol: str) -> Optional[str]:
        """
        Square off an individual open paper position by executing an inverse market order.
        Returns the exit order ID if successful, or None if quote is unavailable or position is empty.
        """
        if symbol not in self._positions:
            self.logger.warning(f"No active position to square off for symbol: {symbol}")
            return None

        pos = self._positions[symbol]
        if pos.quantity <= 0:
            return None

        # Verify quote availability
        quote = self._quotes.get(symbol)
        if not quote and self.broker:
            quote = self.broker.get_quote(symbol)
            if quote:
                self._quotes[symbol] = quote

        if not quote or quote.ltp <= 0:
            self.logger.error(
                f"Square off FAILED for {symbol}: No genuine market quote available. "
                f"Position record preserved safely without modification."
            )
            return None

        inv_side = "SELL" if pos.side == "LONG" else "BUY"
        exit_order = Order(
            symbol=symbol,
            transaction_type=inv_side,
            quantity=pos.quantity,
            order_type=OrderType.MARKET,
            product_type=ProductType.INTRADAY,
            price=quote.ltp
        )
        return self.place_order(exit_order)

    def square_off_all(self) -> Dict[str, Any]:
        """
        Square off all open paper trading positions by executing opposite-side market orders.
        Does NOT reset account history or capital; records each exit fill and realized P&L.
        """
        results = {
            "closed": [],
            "failed": [],
            "total_realised_pnl": 0.0,
            "remaining_open_positions": 0
        }
        symbols_to_close = list(self._positions.keys())
        for symbol in symbols_to_close:
            pos = self._positions.get(symbol)
            if not pos or pos.quantity <= 0:
                continue
            prev_realised = self._realised_pnl
            exit_order_id = self.square_off_position(symbol)
            if exit_order_id and (symbol not in self._positions or self._positions[symbol].quantity == 0):
                pnl_diff = self._realised_pnl - prev_realised
                results["closed"].append({
                    "symbol": symbol,
                    "order_id": exit_order_id,
                    "realised_pnl": pnl_diff
                })
                results["total_realised_pnl"] += pnl_diff
            else:
                results["failed"].append({
                    "symbol": symbol,
                    "reason": "Market quote unavailable or execution rejected"
                })

        results["remaining_open_positions"] = len(self._positions)
        self.logger.info(
            f"Square Off All completed: {len(results['closed'])} closed, "
            f"{len(results['failed'])} failed, Realised P&L: ₹{results['total_realised_pnl']:,.2f}"
        )
        return results

    def get_closed_positions(self) -> List[Dict[str, Any]]:
        """Get history of closed positions."""
        return self._closed_positions.copy()

    def get_cancelled_orders(self) -> List[Order]:
        """Get list of cancelled orders."""
        return self._cancelled_orders.copy()

    def get_rejected_orders(self) -> List[Order]:
        """Get list of rejected orders."""
        return self._rejected_orders.copy()

    def recover_state(self) -> None:
        """Recover active positions and trade history from SQLite database across restarts."""
        if not self.db_manager:
            return
        try:
            db_positions = self.db_manager.get_positions()
            for p_dict in db_positions:
                sym = p_dict["symbol"]
                qty = int(p_dict.get("quantity", 0))
                if qty > 0:
                    self._positions[sym] = Position(
                        symbol=sym,
                        side=p_dict.get("side", "LONG"),
                        quantity=qty,
                        avg_price=float(p_dict.get("avg_price", 0.0)),
                        current_price=float(p_dict.get("current_price", 0.0)),
                        unrealised_pnl=float(p_dict.get("unrealised_pnl", 0.0)),
                        realised_pnl=float(p_dict.get("realised_pnl", 0.0))
                    )
            self.logger.info(f"Recovered {len(self._positions)} positions from database.")
        except Exception as e:
            self.logger.error(f"Error recovering state from database: {e}")

    def modify_order(self, order_id: str, **kwargs) -> bool:
        """Modify an existing order."""
        if order_id in self._open_orders:
            order = self._open_orders[order_id]
            if 'price' in kwargs:
                order.price = kwargs['price']
            if 'quantity' in kwargs:
                order.quantity = kwargs['quantity']
            return True
        return False

    def _generate_order_id(self) -> int:
        """Generate unique order ID."""
        return int(datetime.now().timestamp() * 1000) % 100000000

    def _notify_fill(self, filled: FilledOrder) -> None:
        """Notify fill callbacks."""
        for callback in self._fill_callbacks:
            try:
                callback(filled)
            except Exception as e:
                self.logger.error(f"Error in fill callback: {e}")

    def _notify_order_status(self, order: Order, status: OrderStatus) -> None:
        """Notify order status callbacks."""
        for callback in self._order_callbacks:
            try:
                callback(order, status)
            except Exception as e:
                self.logger.error(f"Error in order callback: {e}")

    def _dispatch_position_update(self, position: Position) -> None:
        """Dispatch position update event."""
        from core.engine import Event, EventType
        event = Event(
            type=EventType.POSITION_UPDATE,
            data=position.to_dict() if hasattr(position, 'to_dict') else {
                'symbol': position.symbol,
                'quantity': position.quantity,
                'current_price': position.current_price,
                'unrealised_pnl': position.unrealised_pnl
            },
            source="paper_trading"
        )
        # Would need event bus reference

    def register_fill_callback(self, callback: Callable[[FilledOrder], None]) -> None:
        """Register callback for order fills."""
        self._fill_callbacks.append(callback)

    def register_order_callback(self, callback: Callable[[Order, OrderStatus], None]) -> None:
        """Register callback for order status changes."""
        self._order_callbacks.append(callback)

    def start(self) -> None:
        """Start paper trading engine."""
        self._running = True
        self.logger.info("Paper trading engine started")

    def stop(self) -> None:
        """Stop paper trading engine."""
        self._running = False
        self.logger.info("Paper trading engine stopped")

    def is_running(self) -> bool:
        """Check if paper trading is running."""
        return self._running

    def get_position(self, symbol: str) -> Optional[Position]:
        """Get position for a symbol."""
        return self._positions.get(symbol)

    def get_all_positions(self) -> Dict[str, Position]:
        """Get all positions."""
        return self._positions.copy()

    def get_positions(self) -> List[Position]:
        """Get list of all positions."""
        return list(self._positions.values())

    def get_filled_orders(self) -> List[FilledOrder]:
        """Get all filled orders."""
        return self._filled_orders.copy()

    def get_open_orders(self) -> Dict[str, Order]:
        """Get all open orders."""
        return self._open_orders.copy()

    def get_pnl(self) -> Dict[str, float]:
        """Get P&L breakdown."""
        return {
            "cash": self._cash,
            "realised_pnl": self._realised_pnl,
            "unrealised_pnl": self._unrealised_pnl,
            "total_pnl": self._total_pnl,
            "capital": self._cash + self._total_pnl
        }

    def get_capital(self) -> float:
        """Get current available capital."""
        return self._cash + self._total_pnl

    def get_equity(self) -> float:
        """Get total equity (cash + positions)."""
        return self._cash + sum(
            p.unrealised_pnl for p in self._positions.values()
        )

    def get_used_margin(self) -> float:
        """Get used margin."""
        return sum(
            abs(p.avg_price * p.quantity) for p in self._positions.values()
        )

    def reset(self) -> None:
        """Reset paper trading to initial state (wipes simulation memory)."""
        self._cash = self.initial_capital
        self._positions.clear()
        self._filled_orders.clear()
        self._open_orders.clear()
        self._closed_positions.clear()
        self._cancelled_orders.clear()
        self._rejected_orders.clear()
        self._realised_pnl = 0.0
        self._unrealised_pnl = 0.0
        self._total_pnl = 0.0
        self.logger.info("Paper trading reset to initial capital")

    def set_capital(self, capital: float) -> None:
        """Set starting capital."""
        self.initial_capital = capital
        self._cash = capital
        self._realised_pnl = 0.0
        self._unrealised_pnl = 0.0

    def get_trade_history(self, symbol: Optional[str] = None, limit: int = 100) -> List[FilledOrder]:
        """Get trade history, optionally filtered by symbol."""
        orders = self._filled_orders
        if symbol:
            orders = [o for o in orders if o.symbol == symbol]
        return orders[-limit:]

    def get_win_loss_stats(self) -> Dict[str, Any]:
        """Get win/loss statistics."""
        wins = 0
        losses = 0
        total_profit = 0.0

        for order in self._filled_orders:
            if order.side.upper() == "BUY":
                # For completed positions, check if we have the sell
                profit = 0
                for o in self._filled_orders:
                    if o.symbol == order.symbol and o.side.upper() == "SELL":
                        profit = (o.fill_price - order.avg_fill_price) * o.filled_quantity - o.fee - order.fee
                        break

                if profit > 0:
                    wins += 1
                elif profit < 0:
                    losses += 1
                total_profit += profit

        return {
            "total_trades": wins + losses,
            "winning_trades": wins,
            "losing_trades": losses,
            "win_rate": wins / max(1, wins + losses) * 100,
            "total_profit": total_profit,
            "average_profit_per_trade": total_profit / max(1, wins + losses)
        }


# Enhanced Position with to_dict method
def _position_to_dict(pos: Position) -> Dict[str, Any]:
    """Convert position to dictionary."""
    return {
        "symbol": pos.symbol,
        "side": pos.side,
        "quantity": pos.quantity,
        "avg_price": pos.avg_price,
        "current_price": pos.current_price,
        "unrealised_pnl": pos.unrealised_pnl,
        "realised_pnl": pos.realised_pnl,
        "entry_time": pos.entry_time.isoformat(),
        "total_value": pos.quantity * pos.current_price if pos.current_price else 0
    }

# Add method to Position class
if not hasattr(Position, 'to_dict'):
    Position.to_dict = _position_to_dict