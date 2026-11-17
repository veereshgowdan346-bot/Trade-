"""
Main Trading Engine
Handles main trading loop, heartbeat, multi-thread event dispatcher,
network recovery with exponential backoff
"""

import asyncio
import logging
import queue
import signal
import threading
import time
from collections import deque
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from enum import Enum
from typing import Optional, Dict, List, Any, Callable, Set
from queue import Queue, Empty
from weakref import WeakSet

from .broker_adapter import BrokerAdapter, Order, OrderType, ProductType, ConnectionState, Quote
from risk.risk_manager import RiskAction


class EngineState(Enum):
    """Trading engine state enumeration."""
    STOPPED = "STOPPED"
    STARTING = "STARTING"
    RUNNING = "RUNNING"
    PAUSING = "PAUSING"
    PAUSED = "PAUSED"
    ERROR = "ERROR"
    RECOVERING = "RECOVERING"


class EventType(Enum):
    """Event types for the event dispatcher."""
    TICK = "TICK"
    ORDER_NEW = "ORDER_NEW"
    ORDER_FILLED = "ORDER_FILLED"
    ORDER_CANCELLED = "ORDER_CANCELLED"
    ORDER_REJECTED = "ORDER_REJECTED"
    POSITION_UPDATE = "POSITION_UPDATE"
    FUND_UPDATE = "FUND_UPDATE"
    TRADE_SIGNAL = "TRADE_SIGNAL"
    HEARTBEAT = "HEARTBEAT"
    DISCONNECT = "DISCONNECT"
    RECONNECT = "RECONNECT"
    ERROR = "ERROR"


@dataclass
class Event:
    """Trading event."""
    type: EventType
    data: Any
    timestamp: datetime = field(default_factory=datetime.now)
    source: Optional[str] = None

    def __eq__(self, other):
        if not isinstance(other, Event):
            return False
        return self.type == other.type and self.timestamp == other.timestamp


class EventDispatcher:
    """
    Multi-threaded event dispatcher.
    Routes events to registered handlers for each event type.
    """

    def __init__(self):
        self._handlers: Dict[EventType, List[Callable]] = {}
        self._event_queue: Queue = Queue()
        self._running = False
        self._thread: Optional[threading.Thread] = None
        self.logger = logging.getLogger(f"{__name__}.EventDispatcher")

    def subscribe(self, event_type: EventType, handler: Callable[[Event], None]) -> None:
        """Subscribe a handler to an event type."""
        if event_type not in self._handlers:
            self._handlers[event_type] = []
        self._handlers[event_type].append(handler)

    def unsubscribe(self, event_type: EventType, handler: Callable[[Event], None]) -> None:
        """Unsubscribe a handler from an event type."""
        if event_type in self._handlers:
            try:
                self._handlers[event_type].remove(handler)
            except ValueError:
                pass

    def dispatch(self, event: Event) -> None:
        """Queue an event for dispatch."""
        try:
            self._event_queue.put_nowait(event)
        except Exception as e:
            self.logger.error(f"Failed to queue event: {e}")

    def _process_events(self) -> None:
        """Process events from the queue."""
        while self._running:
            try:
                event = self._event_queue.get(timeout=0.1)
                self._dispatch_to_handlers(event)
            except Empty:
                continue
            except Exception as e:
                self.logger.error(f"Error processing event: {e}")

    def _dispatch_to_handlers(self, event: Event) -> None:
        """Dispatch event to all subscribed handlers."""
        handlers = self._handlers.get(event.type, [])
        for handler in handlers:
            try:
                handler(event)
            except Exception as e:
                self.logger.error(f"Error in event handler: {e}")

    def start(self) -> None:
        """Start the event dispatcher."""
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(target=self._process_events, daemon=True)
        self._thread.start()
        self.logger.info("Event dispatcher started")

    def stop(self) -> None:
        """Stop the event dispatcher."""
        self._running = False
        if self._thread:
            self._thread.join(timeout=5)
        self.logger.info("Event dispatcher stopped")


@dataclass
class EngineConfig:
    """Trading engine configuration."""
    heartbeat_interval: float = 1.0
    max_reconnect_delay: float = 60.0
    initial_reconnect_delay: float = 5.0
    reconnect_backoff_factor: float = 1.5
    max_consecutive_errors: int = 5
    tick_buffer_size: int = 1000
    event_queue_size: int = 10000
    position_reconciliation_interval: int = 30  # seconds
    enable_auto_reconnect: bool = True
    pause_on_disconnect: bool = True


class TradingEngine:
    """
    Main trading engine managing the complete trading lifecycle.

    Features:
    - Heartbeat monitoring
    - Multi-threaded event dispatch
    - Network recovery with exponential backoff
    - Position reconciliation
    - Strategy integration
    """

    def __init__(
        self,
        broker: BrokerAdapter,
        config: Optional[EngineConfig] = None,
        risk_manager: Optional[Any] = None,
        paper_trading: Optional[Any] = None
    ):
        """
        Initialize trading engine.

        Args:
            broker: Broker adapter instance
            config: Engine configuration
            risk_manager: Risk manager instance for order validation
            paper_trading: Paper trading engine for simulation mode
        """
        self.broker = broker
        self.config = config or EngineConfig()
        self.risk_manager = risk_manager
        self.paper_trading = paper_trading
        self.is_paper_trading = True
        self.state = EngineState.STOPPED

        self._event_dispatcher = EventDispatcher()
        self._event_handlers: Dict[EventType, Set[Callable]] = {}

        # Duplicate order detection cache
        self._recent_orders: Dict[tuple, float] = {}

        # FIX: Order timeout tracking for reconciliation
        self._order_timestamps: Dict[str, float] = {}  # order_id -> submission_time
        self._order_timeout = 30.0  # seconds before timeout
        self._pending_orders: Dict[str, 'Order'] = {}  # order_id -> Order object

        # Heartbeat
        self._heartbeat_timer: Optional[threading.Timer] = None
        self._last_heartbeat: Optional[datetime] = None
        self._heartbeat_interval = self.config.heartbeat_interval

        # Reconnection management
        self._reconnect_delay = self.config.initial_reconnect_delay
        self._reconnect_attempts = 0
        self._last_disconnect: Optional[datetime] = None
        self._reconnect_task: Optional[threading.Thread] = None

        # Data buffers
        self._tick_buffer: deque = deque(maxlen=self.config.tick_buffer_size)

        # Error tracking
        self._consecutive_errors = 0

        # Position tracking
        self._positions: Dict[str, dict] = {}
        self._position_subscribers: Set[Callable] = WeakSet()
        self.strategies: list = []

        # Thread safety
        self._lock = threading.RLock()
        self._running = False

        # Metrics
        self._start_time: Optional[datetime] = None
        self._event_count = 0
        self._tick_count = 0

        self.logger = logging.getLogger(f"{__name__}.TradingEngine")
        self.logger.setLevel(logging.INFO)

        # Register default handlers
        self._setup_default_handlers()

    def _setup_default_handlers(self) -> None:
        """Set up default event handlers."""
        self._event_dispatcher.subscribe(EventType.TICK, self._on_tick)
        self._event_dispatcher.subscribe(EventType.HEARTBEAT, self._on_heartbeat)
        self._event_dispatcher.subscribe(EventType.DISCONNECT, self._on_disconnect)
        self._event_dispatcher.subscribe(EventType.ERROR, self._on_error)
        self._event_dispatcher.subscribe(EventType.TRADE_SIGNAL, self._on_trade_signal)

    def add_strategy(self, strategy: Any) -> None:
        """Register a trading strategy with the engine."""
        if strategy not in self.strategies:
            self.strategies.append(strategy)
            if hasattr(strategy, 'set_signal_callback'):
                strategy.set_signal_callback(lambda sig: self.publish_trade_signal(sig.to_dict()))
            self.logger.info(f"Registered strategy {getattr(strategy, 'name', 'unnamed')} with engine")

    def _on_trade_signal(self, event: Event) -> None:
        """Process incoming trade signal from a strategy."""
        data = event.data
        if not data or not self._running:
            return

        signal_type = data.get('signal_type')
        if signal_type not in ("BUY", "SELL"):
            return

        symbol = data.get('symbol')
        if not symbol:
            return

        qty = int(data.get('quantity', 10))
        if qty <= 0:
            qty = 10

        ltp = self.broker.get_ltp(symbol)
        order = Order(
            symbol=symbol,
            transaction_type=signal_type,
            quantity=qty,
            order_type=OrderType.MARKET,
            product_type=ProductType.INTRADAY,
            price=ltp,
            trigger_price=data.get('stop_loss_price')
        )
        self.logger.info(f"Generated order from {data.get('strategy_name', 'strategy')} signal: {signal_type} {qty}x {symbol}")
        self.place_order(order)

    def _on_tick(self, event: Event) -> None:
        """Handle tick event."""
        quote = event.data
        if isinstance(quote, Quote):
            self._tick_buffer.append({
                'timestamp': event.timestamp,
                'symbol': quote.symbol,
                'ltp': quote.ltp,
                'bid': quote.bid,
                'ask': quote.ask,
                'volume': quote.volume
            })
            self._tick_count += 1

    def _on_heartbeat(self, event: Event) -> None:
        """Handle heartbeat event."""
        self._last_heartbeat = event.timestamp
        self.logger.info("Heartbeat - Engine running normally")

    def _on_disconnect(self, event: Event) -> None:
        """Handle disconnection event."""
        self.logger.warning("Disconnection detected")
        self._last_disconnect = event.timestamp

        if self.config.pause_on_disconnect:
            self.pause()

        if self.config.enable_auto_reconnect:
            self._schedule_reconnect()

    def _on_error(self, event: Event) -> None:
        """Handle error event."""
        self._consecutive_errors += 1
        self.logger.error(f"Error event: {event.data}")

        if self._consecutive_errors >= self.config.max_consecutive_errors:
            self.state = EngineState.ERROR
            self.logger.critical("Max consecutive errors reached, engine in ERROR state")

    def start(self) -> bool:
        """
        Start the trading engine.

        Returns:
            True if started successfully
        """
        if self.state == EngineState.RUNNING:
            self.logger.warning("Engine already running")
            return False

        self.logger.info("Starting trading engine...")
        self.state = EngineState.STARTING

        try:
            # Start event dispatcher
            self._event_dispatcher.start()

            # Start heartbeat
            self._start_heartbeat()

            # Start broker
            if not self.broker.is_connected():
                if not self.broker.generate_session():
                    self.logger.error("Failed to connect to broker")
                    self.state = EngineState.ERROR
                    return False

            # Subscribe to broker events
            self.broker.register_callback('tick', self._on_broker_tick)

            self.state = EngineState.RUNNING
            self._running = True
            self._start_time = datetime.now()

            self.logger.info("Trading engine started successfully")
            return True

        except Exception as e:
            self.logger.error(f"Failed to start engine: {e}")
            self.state = EngineState.ERROR
            return False

    def stop(self) -> None:
        """Stop the trading engine."""
        self.logger.info("Stopping trading engine...")
        self.state = EngineState.STOPPED
        self._running = False

        # Stop heartbeat
        if self._heartbeat_timer:
            self._heartbeat_timer.cancel()

        # Stop event dispatcher
        self._event_dispatcher.stop()

        # Disconnect broker
        self.broker.disconnect()

        self.logger.info("Trading engine stopped")

    def emergency_stop(self) -> Dict[str, Any]:
        """
        Emergency stop - cancels pending orders, squares off open positions, and activates kill switch.

        Returns:
            Dictionary with detailed stop results and error reporting
        """
        result = {
            "orders_cancelled": 0,
            "orders_placed": 0,
            "orders_failed": 0,
            "positions_closed": 0,
            "positions_pending_fill": 0,
            "failed_cancellations": 0,
            "errors": []
        }

        self.logger.critical("EMERGENCY STOP INITIATED")

        # 1. Cancel pending orders
        try:
            if self.is_paper_trading and self.paper_trading:
                for order_id in list(self.paper_trading.get_open_orders().keys()):
                    if self.paper_trading.cancel_order(order_id):
                        result["orders_cancelled"] += 1
                    else:
                        result["failed_cancellations"] += 1
            else:
                if hasattr(self.broker, "get_order_history"):
                    orders = self.broker.get_order_history()
                    for o in orders:
                        if o.get("status") in ("OPEN", "PENDING", "TRIGGER_PENDING"):
                            oid = o.get("orderId")
                            if oid:
                                if self.broker.cancel_order(oid):
                                    result["orders_cancelled"] += 1
                                else:
                                    result["failed_cancellations"] += 1
        except Exception as e:
            err = f"Error cancelling open orders during emergency stop: {e}"
            self.logger.error(err)
            result["errors"].append(err)

        # 2. Square off all positions (using is_emergency=True so exit is not blocked)
        try:
            positions = []
            if self.is_paper_trading and self.paper_trading:
                positions = list(self.paper_trading.get_positions())

            if not positions and hasattr(self.broker, "get_positions"):
                positions = list(self.broker.get_positions())

            # Fix: Check for _mock_positions (internal attribute) on mock broker
            if not positions and hasattr(self.broker, "_mock_positions"):
                positions = list(getattr(self.broker, "_mock_positions", []))

            for pos in positions:
                qty = getattr(pos, "net_quantity", None)
                if qty is None:
                    qty = getattr(pos, "quantity", 0)
                if qty == 0:
                    continue

                tx_type = getattr(pos, "transaction_type", None) or getattr(pos, "side", "BUY")
                action = "SELL" if tx_type in ("BUY", "LONG") else "BUY"
                sym = getattr(pos, "symbol", "")

                # FIX: Use LIMIT order instead of MARKET for emergency stop
                # Get current price for LIMIT order (from broker or paper trading)
                exit_price = 0.0
                if self.is_paper_trading and self.paper_trading:
                    quote = self.paper_trading.get_quote(sym) if hasattr(self.paper_trading, 'get_quote') else None
                    if quote:
                        exit_price = quote.ltp if hasattr(quote, 'ltp') else quote.get('ltp', 0)
                elif hasattr(self.broker, "get_ltp"):
                    exit_price = self.broker.get_ltp(sym)

                # Buffer: use current price + 0.5% for LIMIT order
                if exit_price > 0:
                    exit_price = round(exit_price * 1.005, 2) if action == "BUY" else round(exit_price * 0.995, 2)

                order = Order(
                    symbol=sym,
                    transaction_type=action,
                    quantity=abs(qty),
                    order_type=OrderType.LIMIT,  # FIX: Use LIMIT instead of MARKET
                    price=exit_price if exit_price > 0 else None,
                    product_type=ProductType.INTRADAY
                )

                order_id = self.place_order(order, is_emergency=True)
                if order_id:
                    result["orders_placed"] += 1
                    # Only report as closed if confirmed fill occurred (e.g. paper trading completes immediately)
                    if getattr(order, "status", "") == "COMPLETED":
                        result["positions_closed"] += 1
                    else:
                        result["positions_pending_fill"] += 1
                else:
                    result["orders_failed"] += 1
                    result["errors"].append(f"Failed to place square-off order for {sym}")
        except Exception as e:
            err = f"Error squaring off positions during emergency stop: {e}"
            self.logger.error(err)
            result["errors"].append(err)

        # 3. Trigger kill switch in risk manager to block any further new orders
        if self.risk_manager:
            self.risk_manager._trigger_kill_switch()
            self.logger.critical("EMERGENCY KILL SWITCH ACTIVATED - All subsequent orders blocked")

        return result

    def pause(self) -> None:
        """Pause the trading engine."""
        if self.state == EngineState.RUNNING:
            self.state = EngineState.PAUSED
            self.logger.info("Trading engine paused")

    def resume(self) -> None:
        """Resume the trading engine."""
        if self.state == EngineState.PAUSED:
            self.state = EngineState.RUNNING
            self.logger.info("Trading engine resumed")

    def _start_heartbeat(self) -> None:
        """Start the heartbeat timer."""
        def heartbeat_task():
            if not self._running:
                return

            event = Event(type=EventType.HEARTBEAT, data={"status": "alive"})
            self._event_dispatcher.dispatch(event)

            # Schedule next heartbeat
            self._heartbeat_timer = threading.Timer(
                self._heartbeat_interval,
                heartbeat_task
            )
            self._heartbeat_timer.daemon = True
            self._heartbeat_timer.start()

        heartbeat_task()

    def _on_broker_tick(self, quote: Quote) -> None:
        """Handle tick from broker."""
        event = Event(
            type=EventType.TICK,
            data=quote,
            source="broker"
        )
        self._event_dispatcher.dispatch(event)
        self.broker._quotes[quote.symbol] = quote

        # Dispatch tick to all active strategies
        for strat in self.strategies:
            if getattr(strat, 'is_active', False):
                try:
                    strat.on_tick(quote.symbol, quote.ltp, quote.timestamp, volume=quote.volume)
                except Exception as e:
                    self.logger.error(f"Error in strategy {getattr(strat, 'name', '')} on_tick: {e}")

    def _schedule_reconnect(self) -> None:
        """Schedule reconnection attempt."""
        if self._reconnect_task and self._reconnect_task.is_alive():
            return

        self.state = EngineState.RECOVERING

        def reconnect_task():
            time.sleep(self._reconnect_delay)

            if self._try_reconnect():
                self.state = EngineState.RUNNING
                self.logger.info("Reconnection successful")
            else:
                self.logger.warning(f"Reconnection failed, next attempt in {self._reconnect_delay}s")
                self._reconnect_delay = min(
                    self._reconnect_delay * self.config.reconnect_backoff_factor,
                    self.config.max_reconnect_delay
                )
                self._schedule_reconnect()

        self._reconnect_task = threading.Thread(target=reconnect_task, daemon=True)
        self._reconnect_task.start()

    def _try_reconnect(self) -> bool:
        """Attempt to reconnect."""
        try:
            if self.broker.reset_session():
                if self.broker.generate_session():
                    # Resubscribe to ticks
                    self._reconnect_delay = self.config.initial_reconnect_delay
                    self._reconnect_attempts = 0
                    return True
        except Exception as e:
            self.logger.error(f"Reconnection error: {e}")
        return False

    def publish_trade_signal(self, signal: Dict[str, Any]) -> None:
        """
        Publish a trade signal from a strategy.

        Args:
            signal: Trade signal dictionary
        """
        event = Event(
            type=EventType.TRADE_SIGNAL,
            data=signal,
            source="strategy"
        )
        self._event_dispatcher.dispatch(event)
        self._event_count += 1

    def place_order(self, order: Order, is_emergency: bool = False) -> bool:
        """
        Place an order with risk validation, duplicate prevention, and mode routing.

        Args:
            order: Order to place
            is_emergency: If True, bypasses pre-trade checks to guarantee emergency square-off execution

        Returns:
            True if order placed successfully
        """
        if not self._running and not is_emergency:
            self.logger.warning("Cannot place order, engine not running")
            return False

        if not is_emergency:
            # 0. Emergency kill switch check (highest priority)
            if self.risk_manager and self.risk_manager.is_kill_switch_active():
                self.logger.critical(f"Order for {order.symbol} REJECTED - Emergency kill switch active")
                return False

            # 1. Duplicate order protection (2-second window)
            now = time.time()
            order_key = (order.symbol, order.transaction_type, order.quantity, round(order.price or 0.0, 2))
            with self._lock:
                last_placed = self._recent_orders.get(order_key, 0.0)
                if now - last_placed < 2.0:
                    self.logger.warning(f"Duplicate order rejected for {order.symbol} (placed {now - last_placed:.2f}s ago)")
                    return False
                self._recent_orders[order_key] = now

            # 2. Risk Management validation
            if self.risk_manager:
                ltp = self.broker.get_ltp(order.symbol) or (order.price or 1000.0)
                risk_decision = self.risk_manager.evaluate_order(order, ltp)
                if risk_decision in (RiskAction.REJECT, RiskAction.CLOSE_ALL):
                    self.logger.warning(f"Order for {order.symbol} rejected by risk manager: {risk_decision.value}")
                    return False

        # 3. Paper trading vs Live execution routing
        if self.is_paper_trading and self.paper_trading:
            order_id = self.paper_trading.place_order(order)
            if order_id:
                # FIX: Track order timestamp for timeout reconciliation
                with self._lock:
                    self._order_timestamps[order_id] = time.time()
                    self._pending_orders[order_id] = order

                event = Event(
                    type=EventType.ORDER_NEW,
                    data={"order": order, "order_id": order_id, "mode": "paper"},
                    source="paper_trading"
                )
                self._event_dispatcher.dispatch(event)
                return True
            return False

        # CRITICAL SAFETY INTERLOCK (Phase 6.9): Real-money execution permanently disabled.
        # Live broker order placement is strictly blocked; only offline test fixtures are permitted.
        if getattr(self.broker, 'IS_TEST_FIXTURE', False):
            order_id = self.broker.place_order(order)
        else:
            self.logger.critical("CRITICAL SAFETY INTERLOCK: Live broker execution is permanently disabled. Real-money orders rejected.")
            return False

        if order_id:
            with self._lock:
                self._order_timestamps[order_id] = time.time()
                self._pending_orders[order_id] = order

            event = Event(
                type=EventType.ORDER_NEW,
                data={"order": order, "order_id": order_id, "mode": "mock"},
                source="engine"
            )
            self._event_dispatcher.dispatch(event)
            return True
        return False

    def cancel_order(self, order_id: str) -> bool:
        """Cancel an order."""
        return self.broker.cancel_order(order_id)

    def modify_order(self, order_id: str, **kwargs) -> bool:
        """Modify an order."""
        return self.broker.modify_order(order_id, **kwargs)

    def reconcile_positions(self) -> Dict[str, dict]:
        """
        Reconcile positions with broker.

        Returns:
            Dictionary of current positions
        """
        with self._lock:
            positions = self.broker.get_positions()
            self._positions = {p.symbol: p.to_dict() for p in positions}
            return self._positions

    def reconcile_orders(self) -> Dict[str, Any]:
        """
        Reconcile order statuses, partial fills, cancellations, and rejections with broker/paper trading.
        Also handles order timeout reconciliation.
        """
        reconciled = {"updated": 0, "completed": 0, "partially_filled": 0, "cancelled": 0, "rejected": 0, "timed_out": 0}
        now = time.time()

        try:
            # Get orders from broker/paper trading
            if self.is_paper_trading and self.paper_trading:
                orders = [o.to_dict() for o in self.paper_trading.get_filled_orders()]
                for o in self.paper_trading.get_open_orders().values():
                    orders.append(o.to_dict())
            else:
                orders = self.broker.get_order_history() if hasattr(self.broker, "get_order_history") else []

            # Track which broker orders we've seen
            broker_order_ids = set()

            for ord_data in orders:
                oid = ord_data.get("orderId") or ord_data.get("order_id")
                if oid:
                    broker_order_ids.add(oid)

                raw_status = str(ord_data.get("status", "")).upper()
                filled_qty = int(ord_data.get("filled_shares", ord_data.get("filled_quantity", 0)) or 0)
                tot_qty = int(ord_data.get("quantity", 0) or 0)

                if "COMPLETE" in raw_status:
                    reconciled["completed"] += 1
                    # Remove from pending if present
                    with self._lock:
                        self._pending_orders.pop(oid, None)
                        self._order_timestamps.pop(oid, None)
                elif "PARTIAL" in raw_status or (0 < filled_qty < tot_qty):
                    reconciled["partially_filled"] += 1
                elif "CANCEL" in raw_status:
                    reconciled["cancelled"] += 1
                    with self._lock:
                        self._pending_orders.pop(oid, None)
                        self._order_timestamps.pop(oid, None)
                elif "REJECT" in raw_status:
                    reconciled["rejected"] += 1
                    with self._lock:
                        self._pending_orders.pop(oid, None)
                        self._order_timestamps.pop(oid, None)

                reconciled["updated"] += 1

            # FIX: Handle order timeout reconciliation
            # Check for orders that have exceeded timeout and are not in broker history
            with self._lock:
                timed_out_orders = list(self._order_timestamps.items())

            for oid, submitted_at in timed_out_orders:
                if now - submitted_at > self._order_timeout:
                    if oid not in broker_order_ids:
                        # Order not found in broker - may have timed out
                        self.logger.warning(f"Order {oid} timed out after {self._order_timeout}s")
                        reconciled["timed_out"] += 1

                        # Cancel the pending order if possible
                        with self._lock:
                            order = self._pending_orders.pop(oid, None)
                            if order:
                                try:
                                    if order.order_type == OrderType.MARKET:
                                        # Cancel via broker
                                        self.broker.cancel_order(oid)
                                except Exception as e:
                                    self.logger.error(f"Error cancelling timed out order {oid}: {e}")

                            self._order_timestamps.pop(oid, None)

        except Exception as e:
            self.logger.error(f"Error during order reconciliation: {e}")

        return reconciled

    def recover_state(self) -> Dict[str, Any]:
        """
        Recover active positions and state from database on restart.
        """
        recovered = {"positions": 0, "orders": 0}
        try:
            from core.database import db_manager
            db_positions = db_manager.get_positions()
            for p in db_positions:
                sym = p.get("symbol")
                if sym:
                    self._positions[sym] = p
                    recovered["positions"] += 1

            self.logger.info(f"Restart recovery complete: restored {recovered['positions']} positions from database")
        except Exception as e:
            self.logger.error(f"Error during state recovery: {e}")
        return recovered

    def get_position(self, symbol: str) -> Optional[dict]:
        """Get position for a symbol."""
        return self._positions.get(symbol)

    def get_all_positions(self) -> Dict[str, dict]:
        """Get all positions."""
        return self._positions.copy()

    def subscribe_position_update(self, callback: Callable) -> None:
        """Subscribe to position updates."""
        self._position_subscribers.add(callback)

    def get_metrics(self) -> Dict[str, Any]:
        """Get engine metrics."""
        uptime = (datetime.now() - self._start_time).total_seconds() if self._start_time else 0

        return {
            "state": self.state.value,
            "uptime_seconds": uptime,
            "events_processed": self._event_count,
            "ticks_processed": self._tick_count,
            "consecutive_errors": self._consecutive_errors,
            "last_heartbeat": self._last_heartbeat.isoformat() if self._last_heartbeat else None,
            "tick_buffer_size": len(self._tick_buffer),
            "current_positions": len(self._positions),
            "account": self.broker.get_funds()
        }

    def get_tick_history(self, limit: int = 100) -> List[Dict]:
        """Get historical tick data."""
        return list(self._tick_buffer)[-limit:]

    def register_handler(self, event_type: EventType, handler: Callable[[Event], None]) -> None:
        """Register an event handler."""
        self._event_dispatcher.subscribe(event_type, handler)

    def unregister_handler(self, event_type: EventType, handler: Callable[[Event], None]) -> None:
        """Unregister an event handler."""
        self._event_dispatcher.unsubscribe(event_type, handler)

    def handle_disconnect(self) -> None:
        """Manual disconnect handler."""
        event = Event(type=EventType.DISCONNECT, data={"reason": "manual"})
        self._event_dispatcher.dispatch(event)

    def handle_reconnect(self) -> None:
        """Manual reconnect trigger."""
        event = Event(type=EventType.RECONNECT, data={})
        self._event_dispatcher.dispatch(event)

    def send_error(self, message: str) -> None:
        """Send an error event."""
        event = Event(type=EventType.ERROR, data={"message": message})
        self._event_dispatcher.dispatch(event)

    def force_reconnect(self) -> bool:
        """Force a reconnection attempt."""
        self.logger.warning("Forcing reconnection...")
        return self._try_reconnect()

    def get_connection_state(self) -> ConnectionState:
        """Get broker connection state."""
        return self.broker.get_connection_state()

    def is_connected(self) -> bool:
        """Check if engine and broker are connected."""
        return (
            self.state == EngineState.RUNNING and
            self.broker.is_connected()
        )


# Global event bus for application-wide events
_event_bus: Optional[EventDispatcher] = None


def get_event_bus() -> EventDispatcher:
    """Get or create the global event bus."""
    global _event_bus
    if _event_bus is None:
        _event_bus = EventDispatcher()
    return _event_bus


def publish_app_event(event: Event) -> None:
    """Publish an event to the application event bus."""
    get_event_bus().dispatch(event)