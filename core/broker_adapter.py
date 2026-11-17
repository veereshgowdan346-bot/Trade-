"""
Angel One SmartAPI Broker Adapter
Handles authentication, session generation, WebSocket live feed,
order placement, modification, cancellation, fund/margin check
"""

import asyncio
import json
import logging
import threading
import time
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Optional, Dict, List, Any, Callable, Coroutine, Tuple
from queue import Queue, Empty

import websockets
import requests
from PySide6.QtCore import QThread, Signal, QObject, QTimer

from core.rate_limiter import smartapi_rate_limiter, ApiEndpoint
from core.instrument_master import instrument_master, InstrumentInfo
# Note: is_market_open_ist is defined locally in this module (line 344)

try:
    from SmartApi import SmartConnect
    try:
        from SmartApi.smartWebSocketV2 import SmartWebSocketV2 as SmartWebsocket
    except ImportError:
        from SmartApi.smartApiWebsocket import SmartWebsocket
    SMARTAPI_AVAILABLE = True
except ImportError:
    try:
        from smartapi import SmartConnect
        from smartapi.smartapiwebsocket import SmartWebsocket
        SMARTAPI_AVAILABLE = True
        logging.info("smartapi-python package found")
    except ImportError:
        SMARTAPI_AVAILABLE = False
        SmartConnect = None
        SmartWebsocket = None
        logging.warning("smartapi-python not available, using mock implementation")


def validate_angel_credentials(
    client_id: Optional[str],
    api_key: Optional[str],
    pin: Optional[str],
    totp_secret: Optional[str] = None,
    mpin: Optional[str] = None
) -> Tuple[bool, Optional[str]]:
    """
    Validate all four Angel One user credentials locally before network calls.
    Returns (True, None) if valid, or (False, error_message) if invalid.
    Does not expose sensitive credential values in error messages.
    """
    if not client_id or not str(client_id).strip():
        return False, "Client ID is required."
    if not api_key or not str(api_key).strip():
        return False, "SmartAPI API Key is required."
    effective_pin = mpin if mpin is not None else pin
    if not effective_pin or not str(effective_pin).strip():
        return False, "Trading PIN / Password is required."
    if totp_secret is not None:
        clean = str(totp_secret).strip().replace(" ", "").upper()
        if not clean:
            return False, "TOTP Secret Key is empty."
        try:
            import base64
            missing_padding = len(clean) % 8
            padded = clean + ('=' * ((8 - missing_padding) % 8))
            decoded = base64.b32decode(padded, casefold=True)
            if len(decoded) == 0:
                return False, "TOTP Secret Key is invalid (empty after base32 decode)."
        except Exception:
            return False, "Invalid TOTP Secret Key format (must be a valid Base32 string)."
    return True, None


def generate_totp_code(
    totp_secret: str,
    min_validity_seconds: float = 3.0,
    time_func: Optional[Callable[[], float]] = None,
    sleep_func: Optional[Callable[[float], None]] = None
) -> Tuple[str, float, bool]:
    """
    Generate current 6-digit TOTP code from a Base32 secret with rollover protection.

    If fewer than `min_validity_seconds` remain in the current 30-second window,
    waits for the rollover into the next window to guarantee validity during network transit.

    Args:
        totp_secret: Base32 encoded TOTP secret key.
        min_validity_seconds: Seconds threshold before rollover wait (default: 3.0s).
        time_func: Time retrieval function (defaults to time.time, injectable for testing).
        sleep_func: Sleep function (defaults to time.sleep, injectable for testing).

    Returns:
        Tuple of (totp_code: str, remaining_seconds: float, did_rollover: bool)

    Raises:
        ValueError: If the secret is invalid Base32 or empty.
    """
    if not totp_secret or not str(totp_secret).strip():
        raise ValueError("TOTP secret key cannot be empty.")

    clean_secret = str(totp_secret).strip().replace(" ", "").upper()
    try:
        import base64
        missing_padding = len(clean_secret) % 8
        padded = clean_secret + ('=' * ((8 - missing_padding) % 8))
        decoded = base64.b32decode(padded, casefold=True)
        if len(decoded) == 0:
            raise ValueError("Decoded secret key is empty.")
    except Exception as e:
        raise ValueError(f"Invalid Base32 format for TOTP secret key: {e}")

    import pyotp
    import time

    get_time = time_func or time.time
    do_sleep = sleep_func or time.sleep

    now = get_time()
    time_remaining = 30.0 - (now % 30.0)
    did_rollover = False

    if time_remaining < min_validity_seconds:
        sleep_needed = time_remaining + 0.2
        do_sleep(sleep_needed)
        now = get_time()
        time_remaining = 30.0 - (now % 30.0)
        did_rollover = True

    totp = pyotp.TOTP(clean_secret)
    code = totp.at(int(now)) if hasattr(totp, 'at') else totp.now()
    if not code or len(code) != 6 or not code.isdigit():
        raise ValueError("Generated TOTP code is not a valid 6-digit numeric string.")

    return code, time_remaining, did_rollover


class OrderType(Enum):
    """Order type enumeration."""
    MARKET = "MARKET"
    LIMIT = "LIMIT"
    SL_M = "SL-M"
    SL = "SL"


class ProductType(Enum):
    """Product type enumeration."""
    INTRADAY = "INTRADAY"
    CNC = "CNC"
    CO = "CO"
    MIS = "MIS"


@dataclass
class Order:
    """Represents a trade order with full lifecycle and partial fill tracking."""
    symbol: str
    transaction_type: str  # BUY or SELL
    quantity: int
    order_type: OrderType
    price: Optional[float] = None
    product_type: ProductType = ProductType.INTRADAY
    trigger_price: Optional[float] = None
    sqxl: Optional[float] = None  # Stop loss/limit
    trailing_sl: Optional[float] = None
    order_id: Optional[str] = None
    status: str = "NEW"  # NEW, SUBMITTED, PARTIALLY_FILLED, COMPLETED, CANCELLED, REJECTED
    filled_quantity: int = 0
    remaining_quantity: Optional[int] = None
    avg_fill_price: float = 0.0
    reject_reason: Optional[str] = None
    timestamp: datetime = field(default_factory=datetime.now)

    @property
    def remaining_qty(self) -> int:
        if self.remaining_quantity is not None:
            return self.remaining_quantity
        return max(0, self.quantity - self.filled_quantity)

    def record_fill(self, fill_qty: int, fill_price: float) -> None:
        """Record fill and update lifecycle state transition."""
        if fill_qty <= 0:
            return
        new_filled = self.filled_quantity + fill_qty
        if new_filled > 0:
            self.avg_fill_price = ((self.avg_fill_price * self.filled_quantity) + (fill_price * fill_qty)) / new_filled
        self.filled_quantity = new_filled
        self.remaining_quantity = max(0, self.quantity - self.filled_quantity)
        if self.remaining_quantity == 0:
            self.status = "COMPLETED"
        else:
            self.status = "PARTIALLY_FILLED"

    def mark_rejected(self, reason: str = "") -> None:
        self.status = "REJECTED"
        self.reject_reason = reason

    def mark_cancelled(self) -> None:
        self.status = "CANCELLED"

    def to_dict(self) -> Dict[str, Any]:
        return {
            "symbol": self.symbol,
            "transaction_type": self.transaction_type,
            "quantity": self.quantity,
            "order_type": self.order_type.value,
            "price": self.price,
            "product_type": self.product_type.value,
            "trigger_price": self.trigger_price,
            "sqxl": self.sqxl,
            "trailing_sl": self.trailing_sl,
            "order_id": self.order_id,
            "status": self.status,
            "filled_quantity": self.filled_quantity,
            "remaining_quantity": self.remaining_qty,
            "avg_fill_price": self.avg_fill_price,
            "reject_reason": self.reject_reason,
            "timestamp": self.timestamp.isoformat()
        }


@dataclass
class OHLCV:
    """OHLCV candle data."""
    symbol: str
    timestamp: datetime
    open: float
    high: float
    low: float
    close: float
    volume: int

    @classmethod
    def from_dict(cls, data: Dict) -> 'OHLCV':
        return cls(
            symbol=data['symbol'],
            timestamp=datetime.fromtimestamp(data['timestamp']),
            open=data['open'],
            high=data['high'],
            low=data['low'],
            close=data['close'],
            volume=data['volume']
        )


@dataclass
class Quote:
    """Real-time market quote."""
    symbol: str
    ltp: float  # Last traded price
    bid: float
    ask: float
    volume: int
    timestamp: datetime
    oi: int = 0  # Open interest
    open: float = 0.0
    high: float = 0.0
    low: float = 0.0
    close: float = 0.0

    @classmethod
    def from_dict(cls, data: Dict) -> 'Quote':
        return cls(
            symbol=data['symbol'],
            ltp=data['ltp'],
            bid=data['bid'],
            ask=data['ask'],
            volume=data['volume'],
            timestamp=datetime.fromtimestamp(data.get('timestamp', time.time())),
            oi=data.get('oi', 0),
            open=data.get('open', data['ltp']),
            high=data.get('high', data['ltp']),
            low=data.get('low', data['ltp']),
            close=data.get('close', data['ltp'])
        )


@dataclass
class Position:
    """Represents a trading position."""
    symbol: str
    instrument_token: int
    transaction_type: str  # BUY or SELL
    net_quantity: int
    avg_price: float
    ltp: float
    unrealised_pnl: float
    realised_pnl: float
    timestamp: datetime = field(default_factory=datetime.now)

    @property
    def realised_pnl_rupees(self) -> float:
        return self.realised_pnl


@dataclass
class AccountDetails:
    """Account details and margin information."""
    equity: float
    used_margin: float
    available_margin: float
    day_trading_pnl: float
    gross_exposure: float
    span: float
    exposure: float
    timestamp: datetime = field(default_factory=datetime.now)


class ConnectionState(Enum):
    """Connection state enumeration."""
    DISCONNECTED = "DISCONNECTED"
    CONNECTING = "CONNECTING"
    CONNECTED = "CONNECTED"
    RECONNECTING = "RECONNECTING"
    ERROR = "ERROR"


class ConnectionMilestone(Enum):
    """
    Fine-grained Angel One connectivity and live-data feed milestones.
    Never report LIVE status simply because authentication succeeded.
    """
    DISCONNECTED = "DISCONNECTED"
    AUTHENTICATING = "AUTHENTICATING"
    AUTHENTICATION_SUCCESS = "AUTHENTICATED"
    WEBSOCKET_CONNECTING = "CONNECTING WS"
    WEBSOCKET_CONNECTED = "WS CONNECTED"
    SUBSCRIPTION_SENT = "SUBSCRIBING"
    SUBSCRIPTION_CONFIRMED = "SUBSCRIBED"
    FIRST_VALID_TICK_RECEIVED = "RECEIVING TICKS"
    LIVE_DATA_CONFIRMED = "LIVE DATA CONFIRMED"
    STALE_DATA = "STALE DATA"
    FEED_IDLE_MARKET_CLOSED = "MARKET CLOSED"
    RECONNECTING = "RECONNECTING"
    ERROR = "AUTH FAILED"


def is_market_open_ist(now_dt: Optional[datetime] = None) -> bool:
    """
    Check if Indian Stock Market (NSE/BSE) regular trading session is currently open.
    Trading hours: Monday to Friday, 09:15 AM to 03:30 PM IST (UTC+5:30).
    """
    if now_dt is None:
        utc_now = datetime.now(timezone.utc)
        ist_now = utc_now + timedelta(hours=5, minutes=30)
    else:
        if now_dt.tzinfo is not None:
            ist_now = now_dt.astimezone(timezone(timedelta(hours=5, minutes=30)))
        else:
            ist_now = now_dt

    # Weekends (5 = Saturday, 6 = Sunday)
    if ist_now.weekday() >= 5:
        return False

    current_minutes = ist_now.hour * 60 + ist_now.minute
    market_open_minutes = 9 * 60 + 15    # 09:15 IST
    market_close_minutes = 15 * 60 + 30  # 15:30 IST

    return market_open_minutes <= current_minutes <= market_close_minutes


class BrokerAdapter:
    """
    Angel One SmartAPI Broker Adapter

    Handles:
    - Authentication and session management
    - WebSocket live feed subscription
    - Order placement, modification, cancellation
    - Fund and margin checks
    - Position tracking
    """

    def __init__(self, credentials: Optional[Dict[str, str]] = None):
        """
        Initialize broker adapter.

        Args:
            credentials: Dictionary containing api_key, client_id, etc.
        """
        self.credentials = credentials or {}
        self.api_key: Optional[str] = None
        self.client_id: Optional[str] = None
        self.mpin: Optional[str] = None
        self.password: Optional[str] = None
        self.totp_secret: Optional[str] = None
        self.session_token: Optional[str] = None
        self.jwt_token: Optional[str] = None
        self.feed_token: Optional[str] = None
        self.refresh_token: Optional[str] = None
        self.first_tick_time: float = 0.0
        self.last_tick_time: float = 0.0
        self.last_tick_timestamp_str: str = ""
        self.connection_milestone: ConnectionMilestone = ConnectionMilestone.DISCONNECTED
        self._stale_timeout_seconds: float = 15.0
        self._seen_ticks: set = set()
        self._subscribed_tokens: List[str] = []
        self._symbol_tick_stats: Dict[str, Dict[str, Any]] = {}
        self._total_ticks_received: int = 0
        self._auto_reconnect_enabled: bool = True
        self._reconnect_in_progress: bool = False

        self._smart_connect = None
        self._websocket: Optional[Any] = None
        self._connection_state = ConnectionState.DISCONNECTED
        self._reconnect_task = None
        self._callbacks: Dict[str, List[Callable]] = {}
        self._tick_queue: Queue = Queue()
        self._ws_thread: Optional[threading.Thread] = None
        self._ws_running = False

        # Market data cache
        self._quotes: Dict[str, Quote] = {}
        self._candles: Dict[str, List[OHLCV]] = {}
        self._positions: Dict[str, Position] = {}

        # Reconnect settings
        self._reconnect_delay = 5
        self._max_reconnect_delay = 60
        self._reconnect_attempts = 0

        self.logger = logging.getLogger(f"{__name__}.{self.__class__.__name__}")

        if SMARTAPI_AVAILABLE:
            self._initialize_sdk()

    def _initialize_sdk(self) -> None:
        """Initialize SmartAPI SDK."""
        if self.credentials:
            self.api_key = self.credentials.get('api_key')
            self.client_id = self.credentials.get('client_id')
            self.mpin = self.credentials.get('mpin') or self.credentials.get('password') or self.credentials.get('pin')
            self.password = self.mpin
            raw_totp = self.credentials.get('totp_secret')
            self.totp_secret = str(raw_totp).strip().replace(" ", "").upper() if raw_totp else None

            if self.api_key:
                try:
                    self._smart_connect = SmartConnect(api_key=self.api_key)
                    self.logger.info("SmartAPI SDK initialized successfully")
                except Exception as e:
                    self.logger.error(f"Failed to initialize SmartAPI SDK: {e}")

    def set_credentials(self, credentials: Dict[str, str]) -> None:
        """Update API credentials."""
        self.credentials = credentials
        self.api_key = credentials.get('api_key')
        self.client_id = credentials.get('client_id')
        self.mpin = credentials.get('mpin') or credentials.get('password') or credentials.get('pin')
        self.password = self.mpin
        raw_totp = credentials.get('totp_secret')
        self.totp_secret = str(raw_totp).strip().replace(" ", "").upper() if raw_totp else None
        self.initialize_sdk()

    def initialize_sdk(self) -> None:
        """Re-initialize SDK with new credentials."""
        if self.api_key:
            try:
                self._smart_connect = SmartConnect(api_key=self.api_key)
                self.logger.info("SmartAPI SDK re-initialized successfully")
            except Exception as e:
                self.logger.error(f"Failed to re-initialize SmartAPI SDK: {e}")

    def generate_session(self, password: Optional[str] = None, totp: Optional[str] = None) -> bool:
        """
        Generate authenticated session with Angel One API.

        Args:
            password: Optional password/PIN override
            totp: Optional current 6-digit TOTP override

        Returns:
            True if session generated successfully
        """
        if not self._smart_connect:
            if self.api_key:
                self.initialize_sdk()
            if not self._smart_connect:
                self.logger.error("SmartConnect not initialized - API key missing")
                return False

        pwd = password or self.password
        if not pwd or not self.client_id:
            self.logger.error("Missing client_id or trading PIN/password")
            return False

        try:
            self.connection_milestone = ConnectionMilestone.AUTHENTICATING
            totp_code = totp
            if not totp_code and self.totp_secret:
                try:
                    totp_code, _, _ = generate_totp_code(self.totp_secret, min_validity_seconds=3.0)
                except Exception as e:
                    self.logger.error(f"Automatic TOTP calculation failed: {e}")

            if not totp_code:
                self.connection_milestone = ConnectionMilestone.ERROR
                self.logger.error("TOTP code is required for Angel One authentication")
                return False

            result = self._smart_connect.generateSession(
                self.client_id,
                pwd,
                totp_code
            )

            if result and result.get('status') is True and 'data' in result:
                data = result['data']
                self.jwt_token = data.get('jwtToken')
                self.feed_token = data.get('feedToken')
                self.refresh_token = data.get('refreshToken')
                self.session_token = self.jwt_token
                self._connection_state = ConnectionState.CONNECTED
                self.connection_milestone = ConnectionMilestone.AUTHENTICATION_SUCCESS
                self.logger.info("Session generated successfully with Angel One SmartAPI")
                # Automatically launch WebSocket 2.0 live market feed
                self.start_live_feed()
                return True
            else:
                msg = result.get('message', 'Authentication failed') if isinstance(result, dict) else str(result)
                errcode = result.get('errorcode', '') if isinstance(result, dict) else ''
                self.logger.error(f"Session generation failed: {msg} {f'({errcode})' if errcode else ''}")
                self._connection_state = ConnectionState.ERROR
                self.connection_milestone = ConnectionMilestone.ERROR
                return False

        except Exception as e:
            self.logger.error(f"Error generating session: {e}")
            self._connection_state = ConnectionState.ERROR
            self.connection_milestone = ConnectionMilestone.ERROR
            return False

    def reset_session(self) -> bool:
        """Reset the current session."""
        try:
            self.first_tick_time = 0.0
            self.last_tick_time = 0.0
            self.last_tick_timestamp_str = ""
            self.connection_milestone = ConnectionMilestone.DISCONNECTED
            if self._smart_connect and self.session_token:
                self._smart_connect.resetSession()
                self.session_token = None
                self._connection_state = ConnectionState.DISCONNECTED
                return True
        except Exception as e:
            self.logger.error(f"Error resetting session: {e}")
        return False

    def get_profile(self) -> Optional[Dict[str, Any]]:
        """Get user profile information."""
        if not self._smart_connect:
            return None
        try:
            return self._smart_connect.getProfile()
        except Exception as e:
            self.logger.error(f"Error getting profile: {e}")
            return None

    def get_limit_check(self) -> Optional[Dict[str, Any]]:
        """Get order limit check details."""
        if not self._smart_connect:
            return None
        try:
            return self._smart_connect.getLimitCheck()
        except Exception as e:
            self.logger.error(f"Error getting limit check: {e}")
            return None

    def get_positions(self) -> List[Position]:
        """Get all current positions."""
        if not self._smart_connect:
            return []
        try:
            result = self._smart_connect.getPositions()
            positions = []

            if result and 'data' in result:
                for p in result['data']:
                    position = Position(
                        symbol=p['symbol'],
                        instrument_token=p.get('instrumentToken', 0),
                        transaction_type=p['transactionType'],
                        net_quantity=int(p['netqty']),
                        avg_price=float(p['avgPrice']),
                        ltp=0.0,  # Will be updated from quotes
                        unrealised_pnl=float(p.get('unrealisedPnl', 0)),
                        realised_pnl=float(p.get('realisedPnl', 0)),
                        timestamp=datetime.fromisoformat(p.get('timestamp', datetime.now().isoformat()))
                    )
                    positions.append(position)

            return positions
        except Exception as e:
            self.logger.error(f"Error getting positions: {e}")
            return []

    def get_holdings(self) -> List[Dict[str, Any]]:
        """Get all holdings."""
        if not self._smart_connect:
            return []
        try:
            return self._smart_connect.getHoldings()
        except Exception as e:
            self.logger.error(f"Error getting holdings: {e}")
            return []

    def get_mutual_funds(self) -> List[Dict[str, Any]]:
        """Get mutual fund holdings."""
        if not self._smart_connect:
            return []
        try:
            return self._smart_connect.getMutualFunds()
        except Exception as e:
            self.logger.error(f"Error getting mutual funds: {e}")
            return []

    def get_funds(self) -> Optional[AccountDetails]:
        """Get account fund and margin details."""
        if not self._smart_connect:
            return None
        try:
            result = self._smart_connect.getAccount()
            if result and 'data' in result:
                data = result['data']
                return AccountDetails(
                    equity=float(data.get('equity', 0)),
                    used_margin=float(data.get('usedMargin', 0)),
                    available_margin=float(data.get('availableMargin', 0)),
                    day_trading_pnl=float(data.get('dayTradingPnl', 0)),
                    gross_exposure=float(data.get('grossExposure', 0)),
                    span=float(data.get('span', 0)),
                    exposure=float(data.get('exposure', 0))
                )
        except Exception as e:
            self.logger.error(f"Error getting funds: {e}")
        return None

    def place_order(self, order: Order) -> Optional[str]:
        """
        Place a new order on Angel One SmartAPI using exact official request schema.
        CRITICAL SAFETY INTERLOCK (Phase 6.9): Real-money execution permanently disabled.
        """
        self.logger.critical(f"CRITICAL SAFETY INTERLOCK: Live broker execution permanently disabled. Refusing to place live order for {order.symbol}.")
        order.mark_rejected("Live broker execution permanently disabled")
        return None

    def modify_order(self, order_id: str, **kwargs) -> bool:
        """Modify an existing order on Angel One with rate limit protection."""
        if not self._smart_connect:
            return False
        smartapi_rate_limiter.acquire(ApiEndpoint.ORDER, timeout=3.0)
        try:
            result = self._smart_connect.modifyOrder(order_id, **kwargs)
            return result is not None and (result.get('status') is True or result.get('data') is not None)
        except Exception as e:
            self.logger.error(f"Error modifying order {order_id}: {e}")
            return False

    def cancel_order(self, order_id: str, variety: str = "NORMAL") -> bool:
        """Cancel an existing order on Angel One with rate limit protection."""
        if not self._smart_connect:
            return False
        smartapi_rate_limiter.acquire(ApiEndpoint.ORDER, timeout=3.0)
        try:
            result = self._smart_connect.cancelOrder(variety=variety, orderid=order_id)
            return result is not None and (result.get('status') is True or result.get('data') is not None)
        except Exception as e:
            self.logger.error(f"Error cancelling order {order_id}: {e}")
            return False

    def get_order_history(self, order_id: Optional[str] = None) -> List[Dict]:
        """
        Get order history.

        Args:
            order_id: Optional specific order ID

        Returns:
            List of order history entries
        """
        if not self._smart_connect:
            return []
        try:
            result = self._smart_connect.getOrders()
            if order_id:
                return [o for o in result.get('data', []) if o.get('orderId') == order_id]
            return result.get('data', [])
        except Exception as e:
            self.logger.error(f"Error getting order history: {e}")
            return []

    def get_order_by_id(self, order_id: str) -> Optional[Dict]:
        """Get specific order by ID."""
        orders = self.get_order_history(order_id)
        return orders[0] if orders else None

    def subscribe_to_ticks(self, tokens: List[Any], callback: Callable[[Quote], None]) -> bool:
        """
        Subscribe to real-time tick data.

        Args:
            tokens: List of instrument tokens (int or str)
            callback: Callback function to handle tick data

        Returns:
            True if subscription successful
        """
        if 'tick' not in self._callbacks:
            self._callbacks['tick'] = []
        if callback not in self._callbacks['tick']:
            self._callbacks['tick'].append(callback)

        token_strs = [str(t) for t in tokens]
        return self.start_live_feed(token_strs)

    def start_live_feed(self, tokens: Optional[List[str]] = None) -> bool:
        """
        Initiate real-time WebSocket 2.0 streaming feed from Angel One.
        Subscribes to core benchmark indices and high-liquidity equities.
        """
        if not SMARTAPI_AVAILABLE or not self._smart_connect or not self.feed_token:
            self.logger.warning("WebSocket 2.0 not available or unauthenticated")
            return False

        # Stop existing feed if any
        self.stop_live_feed()

        # Core 8 instruments: NIFTY 50, BANKNIFTY, FINNIFTY, RELIANCE, TCS, INFY, HDFCBANK, ITC
        CORE_TOKENS = ["26000", "26009", "26037", "2885", "11536", "1594", "1333", "1660"]
        sub_tokens = tokens or CORE_TOKENS
        self._subscribed_tokens = sub_tokens
        self.connection_milestone = ConnectionMilestone.WEBSOCKET_CONNECTING

        try:
            auth_token = self.jwt_token or self.session_token or ""
            if auth_token and not auth_token.startswith("Bearer "):
                auth_token = f"Bearer {auth_token}"

            self._websocket = SmartWebsocket(
                auth_token=auth_token,
                api_key=self.api_key,
                client_code=self.client_id,
                feed_token=self.feed_token,
                max_retry_attempt=10,
                retry_delay=5
            )

            # Bind callbacks
            self._websocket.on_open = self._on_ws_open
            self._websocket.on_data = self._on_ws_data
            self._websocket.on_error = self._on_ws_error
            self._websocket.on_close = self._on_ws_close

            self._ws_thread = threading.Thread(target=self._websocket.connect, daemon=True)
            self._ws_thread.start()
            self._ws_running = True
            self.logger.info(f"WebSocket 2.0 client started. Subscribing to tokens: {sub_tokens}")
            return True
        except Exception as e:
            self.logger.error(f"Error starting WebSocket 2.0 feed: {e}")
            self._ws_running = False
            self.connection_milestone = ConnectionMilestone.ERROR
            return False

    def stop_live_feed(self) -> None:
        """Stop WebSocket 2.0 feed safely."""
        self._ws_running = False
        if self._websocket:
            try:
                self._websocket.close_connection()
            except Exception:
                pass
            self._websocket = None
        self.connection_milestone = ConnectionMilestone.DISCONNECTED

    def _build_token_subscription_list(self, tokens: List[str]) -> List[Dict[str, Any]]:
        """
        Group instrument tokens by exchangeType per Angel One SmartWebSocketV2 schema:
        1: nse_cm (NSE Cash Equities & Benchmark Indices)
        2: nse_fo (NSE Futures & Options)
        3: bse_cm (BSE Cash Equities)
        """
        groups: Dict[int, List[str]] = {1: [], 2: [], 3: []}
        for tok in tokens:
            t_str = str(tok).strip()
            if not t_str:
                continue
            # Look up segment
            inst = instrument_master.get_instrument_by_token(t_str, "NSE")
            if not inst:
                inst = instrument_master.get_instrument_by_token(t_str, "BSE")

            if inst and inst.exch_seg == "NFO":
                groups[2].append(t_str)
            elif inst and inst.exch_seg == "BSE":
                groups[3].append(t_str)
            else:
                groups[1].append(t_str)

        token_list = []
        for exch_type, tok_list in groups.items():
            if tok_list:
                token_list.append({
                    "exchangeType": exch_type,
                    "tokens": tok_list
                })
        return token_list if token_list else [{"exchangeType": 1, "tokens": tokens}]

    def _on_ws_open(self, *args, **kwargs) -> None:
        """Callback when WebSocket connection opens."""
        self.logger.info("Angel One SmartAPI WebSocket 2.0 connected.")
        self.connection_milestone = ConnectionMilestone.WEBSOCKET_CONNECTED
        tokens = self._subscribed_tokens or ["26000", "26009", "26037", "2885", "11536", "1594", "1333", "1660"]
        try:
            if self._websocket:
                token_list = self._build_token_subscription_list(tokens)
                self._websocket.subscribe(
                    correlation_id="auratrader_live",
                    mode=2,  # Quote mode (includes OHLC and volume)
                    token_list=token_list
                )
                self.connection_milestone = ConnectionMilestone.SUBSCRIPTION_SENT
                self.logger.info(f"Subscribed to {len(tokens)} tokens across {len(token_list)} exchange groups in Quote mode")
        except Exception as e:
            self.logger.error(f"Error subscribing to tokens on WebSocket open: {e}")

    def _on_ws_data(self, wsapp, parsed_data: Dict[str, Any]) -> None:
        """Process unpacked binary tick data from SmartWebSocketV2."""
        if not isinstance(parsed_data, dict):
            return

        try:
            token = str(parsed_data.get("token", "")).strip()
            if not token:
                return

            raw_ltp = parsed_data.get("last_traded_price", 0)
            ltp = float(raw_ltp) / 100.0 if raw_ltp > 0 else 0.0
            if ltp <= 0:
                return

            seq = parsed_data.get("sequence_number", 0)
            exch_ts = parsed_data.get("exchange_timestamp", 0)
            # Duplicate suppression
            fingerprint = (token, seq, exch_ts, ltp)
            if fingerprint in self._seen_ticks:
                return
            self._seen_ticks.add(fingerprint)
            if len(self._seen_ticks) > 5000:
                self._seen_ticks.clear()

            # Resolve instrument symbol
            info = instrument_master.get_instrument_by_token(token, "NSE")
            symbol = info.symbol if info else f"TOKEN:{token}"
            # Standardize symbol names for consistency
            sym_key = symbol
            if symbol == "Nifty 50":
                sym_key = "NIFTY 50"
            elif symbol in ("Nifty Bank", "BANKNIFTY"):
                sym_key = "BANKNIFTY"
            elif symbol in ("Nifty Fin Services", "FINNIFTY"):
                sym_key = "FINNIFTY"
            elif info and info.exch_seg == "NSE" and not sym_key.startswith("NSE:"):
                sym_key = f"NSE:{info.name}"

            raw_vol = parsed_data.get("volume_trade_for_the_day", 0)
            raw_open = parsed_data.get("open_price_of_the_day", 0)
            raw_high = parsed_data.get("high_price_of_the_day", 0)
            raw_low = parsed_data.get("low_price_of_the_day", 0)
            raw_close = parsed_data.get("closed_price", 0)

            open_p = float(raw_open) / 100.0 if raw_open > 0 else ltp
            high_p = float(raw_high) / 100.0 if raw_high > 0 else ltp
            low_p = float(raw_low) / 100.0 if raw_low > 0 else ltp
            close_p = float(raw_close) / 100.0 if raw_close > 0 else ltp

            now = datetime.now()
            quote = Quote(
                symbol=sym_key,
                ltp=ltp,
                bid=ltp - 0.05,
                ask=ltp + 0.05,
                volume=int(raw_vol),
                timestamp=now,
                open=open_p,
                high=high_p,
                low=low_p,
                close=close_p
            )

            # Update cache and timestamp
            self._quotes[sym_key] = quote
            self._total_ticks_received += 1
            now_ts = time.time()
            if self.first_tick_time == 0.0:
                self.first_tick_time = now_ts
                self.connection_milestone = ConnectionMilestone.FIRST_VALID_TICK_RECEIVED
            else:
                self.connection_milestone = ConnectionMilestone.LIVE_DATA_CONFIRMED

            self.last_tick_time = now_ts
            self.last_tick_timestamp_str = now.strftime("%H:%M:%S")

            # Per-symbol tracking
            self._symbol_tick_stats[sym_key] = {
                "token": token,
                "ltp": ltp,
                "volume": int(raw_vol),
                "last_update": self.last_tick_timestamp_str,
                "timestamp": now_ts,
                "seq": seq
            }

            # Send to Candle Aggregator
            try:
                from core.candle_aggregator import candle_aggregator
                candle_aggregator.process_tick(quote)
            except Exception:
                pass

            # Notify listeners
            for cb in self._callbacks.get('tick', []):
                try:
                    cb(quote)
                except Exception as e:
                    self.logger.error(f"Error in tick listener: {e}")

        except Exception as e:
            self.logger.error(f"Error processing WebSocket tick: {e}")

    def _on_ws_error(self, *args, **kwargs) -> None:
        """Handle WebSocket error with signature resilience."""
        err_msg = args[1] if len(args) > 1 else (args[0] if args else kwargs.get("error", "Unknown WebSocket error"))
        self.logger.warning(f"WebSocket 2.0 error: {err_msg}")
        self.connection_milestone = ConnectionMilestone.ERROR

    def _on_ws_close(self, *args, **kwargs) -> None:
        """Handle WebSocket close."""
        self.logger.info("WebSocket 2.0 closed.")
        self._ws_running = False
        if self._connection_state == ConnectionState.CONNECTED:
            self.connection_milestone = ConnectionMilestone.RECONNECTING
            self._trigger_auto_reconnect()
        else:
            self.connection_milestone = ConnectionMilestone.DISCONNECTED

    def _trigger_auto_reconnect(self) -> None:
        """Supervisor thread for WebSocket reconnection with bounded exponential backoff."""
        if not self._auto_reconnect_enabled or self._reconnect_in_progress:
            return

        def _reconnect_worker():
            self._reconnect_in_progress = True
            delay = 2.0
            max_delay = 30.0
            attempts = 0
            while self._connection_state == ConnectionState.CONNECTED and not self._ws_running and attempts < 10:
                attempts += 1
                self.logger.info(f"Reconnection attempt {attempts} in {delay:.1f}s...")
                time.sleep(delay)
                if self._connection_state != ConnectionState.CONNECTED or self._ws_running:
                    break
                try:
                    success = self.start_live_feed(self._subscribed_tokens)
                    if success:
                        self.logger.info("Reconnection initiated successfully.")
                        break
                except Exception as ex:
                    self.logger.warning(f"Reconnection attempt {attempts} failed: {ex}")
                delay = min(delay * 2.0, max_delay)
            self._reconnect_in_progress = False

        t = threading.Thread(target=_reconnect_worker, daemon=True)
        t.start()

    def is_feed_stale(self) -> bool:
        """
        Check if live market feed has stalled.
        Returns True if:
        1. Connected and WebSocket streaming is active.
        2. At least one valid tick was received (last_tick_time > 0).
        3. Elapsed time since last tick exceeds _stale_timeout_seconds (15s).
        """
        if not self.is_connected() or not self._ws_running:
            return False
        if self.last_tick_time <= 0.0:
            return False  # Still waiting for initial tick, not stale
        return (time.time() - self.last_tick_time) > self._stale_timeout_seconds

    def get_connection_milestone(self) -> ConnectionMilestone:
        """Derive the precise current connection milestone."""
        if not self.is_connected():
            if self._connection_state == ConnectionState.ERROR:
                return ConnectionMilestone.ERROR
            if self._connection_state == ConnectionState.RECONNECTING:
                return ConnectionMilestone.RECONNECTING
            return ConnectionMilestone.DISCONNECTED

        if not self._ws_running or self._websocket is None:
            return ConnectionMilestone.AUTHENTICATION_SUCCESS

        if self.last_tick_time <= 0.0:
            if not is_market_open_ist():
                return ConnectionMilestone.FEED_IDLE_MARKET_CLOSED
            return self.connection_milestone if self.connection_milestone in (
                ConnectionMilestone.WEBSOCKET_CONNECTING,
                ConnectionMilestone.WEBSOCKET_CONNECTED,
                ConnectionMilestone.SUBSCRIPTION_SENT,
                ConnectionMilestone.SUBSCRIPTION_CONFIRMED
            ) else ConnectionMilestone.SUBSCRIPTION_CONFIRMED

        # Ticks have been received
        if self.is_feed_stale():
            if not is_market_open_ist():
                return ConnectionMilestone.FEED_IDLE_MARKET_CLOSED
            return ConnectionMilestone.STALE_DATA

        now = time.time()
        if (now - self.last_tick_time) <= 5.0:
            return ConnectionMilestone.LIVE_DATA_CONFIRMED
        elif (now - self.last_tick_time) <= self._stale_timeout_seconds:
            return ConnectionMilestone.FIRST_VALID_TICK_RECEIVED

        if not is_market_open_ist():
            return ConnectionMilestone.FEED_IDLE_MARKET_CLOSED

        return ConnectionMilestone.STALE_DATA

    def get_last_tick_timestamp(self) -> str:
        """Return formatted time string of last received tick, or '--:--:--'."""
        return self.last_tick_timestamp_str or "--:--:--"

    def get_total_tick_count(self) -> int:
        """Return total number of valid ticks processed in current session."""
        return self._total_ticks_received

    def get_symbol_tick_stats(self, symbol: str) -> Optional[Dict[str, Any]]:
        """Return tick stats dictionary for symbol if available."""
        return self._symbol_tick_stats.get(symbol)

    def get_quote(self, symbol: str) -> Optional[Quote]:
        """Get latest quote for a symbol, polling Angel One API if connected."""
        if symbol in self._quotes:
            return self._quotes[symbol]

        if not self._smart_connect:
            return None

        inst = instrument_master.resolve_instrument(symbol)
        if not inst:
            return None

        # Rate Limiting (10 req/s)
        if not smartapi_rate_limiter.acquire(ApiEndpoint.QUOTE, timeout=2.0):
            return None

        try:
            result = self._smart_connect.ltpData(inst.exch_seg, inst.symbol, inst.token)
            if result and result.get('status') and 'data' in result:
                d = result['data']
                ltp = float(d.get('ltp', 0.0))
                quote = Quote(
                    symbol=symbol,
                    ltp=ltp,
                    bid=float(d.get('bid', ltp - 0.05)),
                    ask=float(d.get('ask', ltp + 0.05)),
                    volume=int(d.get('volume', 0)),
                    timestamp=datetime.now()
                )
                self._quotes[symbol] = quote
                return quote
        except Exception as e:
            self.logger.error(f"Error fetching quote for {symbol}: {e}")
        return None

    def get_quotes(self) -> Dict[str, Quote]:
        """Get all cached quotes."""
        return self._quotes.copy()

    def get_ltp(self, symbol: str) -> float:
        """Get last traded price for a symbol."""
        quote = self._quotes.get(symbol)
        return quote.ltp if quote else 0.0

    def get_historical_data(
        self,
        symbol: str,
        from_date: str,
        to_date: str,
        interval: str = "1DAY"
    ) -> List[OHLCV]:
        """
        Get historical market data.

        Args:
            symbol: Symbol/Instrument token
            from_date: Start date (YYYY-MM-DD)
            to_date: End date (YYYY-MM-DD)
            interval: Candle interval (DAY, HOUR, MINUTE, etc.)

        Returns:
            List of OHLCV candles
        """
        if not self._smart_connect:
            return []
        try:
            result = self._smart_connect.getHistoricalData(
                tradingsymbol=symbol,
                symboltoken=symbol,  # Will resolve
                fromdate=from_date,
                todate=to_date,
                interval=interval
            )

            candles = []
            if result and 'data' in result:
                for c in result['data']:
                    candles.append(OHLCV.from_dict(c))
            return candles
        except Exception as e:
            self.logger.error(f"Error getting historical data: {e}")
            return []

    def search_instrument(self, symbol: str, exchange: str = "NSE") -> Optional[Dict]:
        """Search for instrument details."""
        if not self._smart_connect:
            return None
        try:
            result = self._smart_connect.searchSymbols(symbol, exchange)
            return result
        except Exception as e:
            self.logger.error(f"Error searching instrument {symbol}: {e}")
            return None

    def get_connection_state(self) -> ConnectionState:
        """Get current connection state."""
        return self._connection_state

    def is_connected(self) -> bool:
        """Check if connected to API."""
        return self._connection_state == ConnectionState.CONNECTED

    def disconnect(self) -> None:
        """Disconnect from API and WebSocket."""
        try:
            if self._websocket and self._ws_running:
                # WebSocket will close automatically on thread exit
                pass
            self._connection_state = ConnectionState.DISCONNECTED
            self._ws_running = False
        except Exception as e:
            self.logger.error(f"Error disconnecting: {e}")

    def register_callback(self, event: str, callback: Callable) -> None:
        """Register an event callback."""
        if event not in self._callbacks:
            self._callbacks[event] = []
        self._callbacks[event].append(callback)

    def unregister_callback(self, event: str, callback: Callable) -> None:
        """Unregister an event callback."""
        if event in self._callbacks:
            try:
                self._callbacks[event].remove(callback)
            except ValueError:
                pass

    def generate_session_async(
        self,
        password: Optional[str] = None,
        timeout: float = 30.0,
        totp: Optional[str] = None
    ) -> Tuple[bool, str]:
        """
        Generate session asynchronously (call from QThread worker, NOT from UI thread).

        Args:
            password: Optional password/PIN override
            timeout: Network timeout in seconds
            totp: Optional 6-digit TOTP code override

        Returns:
            Tuple of (success: bool, message: str)
        """
        if not self._smart_connect:
            if self.api_key:
                self.initialize_sdk()
            if not self._smart_connect:
                return False, "SmartConnect not initialized - please configure a valid Angel One API key"

        pwd = password or self.mpin or self.password
        if not self.client_id or not pwd:
            return False, "Missing Client ID or Angel One 4-Digit MPIN"

        try:
            self.connection_milestone = ConnectionMilestone.AUTHENTICATING
            totp_code = totp
            if not totp_code and self.totp_secret:
                try:
                    totp_code, _, _ = generate_totp_code(self.totp_secret, min_validity_seconds=3.0)
                except Exception as e:
                    self.connection_milestone = ConnectionMilestone.ERROR
                    return False, f"Automatic TOTP calculation failed: {e}. Please check your TOTP Secret Key or use manual fallback."

            if not totp_code:
                self.connection_milestone = ConnectionMilestone.ERROR
                return False, "TOTP is mandatory for 2FA. Provide a valid TOTP Secret Key for automatic generation, or enter a 6-digit TOTP code."

            # Generate session with timeout protection
            session_result = {'data': None, 'error': None}

            def _sync_session_gen():
                try:
                    result = self._smart_connect.generateSession(
                        self.client_id,
                        pwd,
                        totp_code
                    )
                    session_result['data'] = result
                except Exception as e:
                    session_result['error'] = e

            # Run in thread with timeout
            sync_thread = threading.Thread(target=_sync_session_gen, daemon=True)
            sync_thread.start()
            sync_thread.join(timeout=timeout)

            if sync_thread.is_alive():
                self.connection_milestone = ConnectionMilestone.ERROR
                return False, "Authentication timeout (30s) - please check network connectivity and static IP whitelisting"

            if session_result['error']:
                self.connection_milestone = ConnectionMilestone.ERROR
                return False, f"Authentication error: {session_result['error']}"

            result = session_result['data']

            if result and result.get('status') is True and 'data' in result:
                data = result['data']
                self.jwt_token = data.get('jwtToken')
                self.feed_token = data.get('feedToken')
                self.refresh_token = data.get('refreshToken')
                self.session_token = self.jwt_token
                self._connection_state = ConnectionState.CONNECTED
                self.connection_milestone = ConnectionMilestone.AUTHENTICATION_SUCCESS
                self.logger.info("Angel One SmartAPI authentication succeeded")
                self.start_live_feed()
                return True, "Successfully authenticated with Angel One SmartAPI"
            else:
                msg = result.get('message', 'Authentication failed') if isinstance(result, dict) else str(result)
                errcode = result.get('errorcode', '') if isinstance(result, dict) else ''
                self._connection_state = ConnectionState.ERROR
                self.connection_milestone = ConnectionMilestone.ERROR
                if "Please enter four digit MPIN" in msg or errcode in ("AB1010", "AB1004"):
                    user_msg = (
                        f"Authentication Rejected by Angel One: {msg}"
                        f"{f' [{errcode}]' if errcode else ''}\n\n"
                        "Root Cause: The 4-digit MPIN entered does not match your Angel One mobile login PIN.\n"
                        "Please verify your 4-digit numeric MPIN (used in the Angel One mobile app) and try again."
                    )
                else:
                    user_msg = f"Authentication failed: {msg} {f'({errcode})' if errcode else ''}"
                return False, user_msg

        except Exception as e:
            self.logger.error(f"Error generating session: {e}")
            self._connection_state = ConnectionState.ERROR
            self.connection_milestone = ConnectionMilestone.ERROR
            return False, f"Session error: {e}"

    def is_sdk_available(self) -> bool:
        """Check if SmartAPI SDK is available."""
        return SMARTAPI_AVAILABLE and self._smart_connect is not None


class AsyncAuthWorker(QObject):
    """
    Worker class for asynchronous authentication.
    MUST be run in a QThread to avoid blocking the Qt UI thread.
    """

    # Signals for Qt thread-safe communication
    auth_finished = Signal(bool, str)  # success, message
    auth_progress = Signal(str)       # status message
    error_occurred = Signal(str)      # error message
    finished = Signal()               # completed signal for thread cleanup

    def __init__(self, broker_adapter: BrokerAdapter):
        super().__init__()
        self.broker = broker_adapter
        self._abort = False

    def abort(self):
        """Signal the worker to abort."""
        self._abort = True

    def run_authentication(
        self,
        password: Optional[str] = None,
        timeout: float = 30.0,
        totp: Optional[str] = None
    ):
        """
        Run authentication asynchronously.
        This method should be called from a QThread.
        """
        try:
            if self._abort:
                self.auth_finished.emit(False, "Authentication cancelled")
                return

            self.auth_progress.emit("Validating credentials...")

            # Validate credentials first (synchronous, fast)
            if not self.broker.api_key or not self.broker.client_id:
                self.auth_finished.emit(False, "Missing API key or Client ID")
                return

            self.auth_progress.emit("Verifying TOTP code...")

            if self._abort:
                self.auth_finished.emit(False, "Authentication cancelled")
                return

            self.auth_progress.emit("Connecting to Angel One API...")

            # Run async session generation
            success, message = self.broker.generate_session_async(password, timeout, totp=totp)

            if self._abort:
                self.auth_finished.emit(False, "Authentication cancelled")
                return

            self.auth_finished.emit(success, message)
        finally:
            self.finished.emit()


# ============================================================================
# OFFLINE TEST FIXTURE ONLY: MockBrokerAdapter
# STRICT BOUNDARY: Never instantiated in production or live execution paths.
# Reserved exclusively for offline automated unit tests (e.g. test_broker_adapter.py).
# ============================================================================
class MockBrokerAdapter(BrokerAdapter):
    """
    Offline test fixture implementation.
    STRICT COMPLIANCE: Must never be instantiated in production runtime.
    """
    IS_TEST_FIXTURE = True

    DEFAULT_BASE_PRICES = {
        "NIFTY 50": 24350.0,
        "BANKNIFTY": 51800.0,
        "FINNIFTY": 23900.0,
        "NSE:RELIANCE": 2980.0,
        "NSE:TCS": 4120.0,
        "NSE:INFY": 1840.0,
        "NSE:HDFCBANK": 1675.0,
        "NSE:ITC": 490.0
    }

    def __init__(self, credentials: Optional[Dict[str, str]] = None):
        super().__init__(credentials)
        self._mock_positions: List[Position] = []
        self._mock_funds = AccountDetails(
            equity=100000.0,
            used_margin=0.0,
            available_margin=100000.0,
            day_trading_pnl=0.0,
            gross_exposure=0.0,
            span=0.0,
            exposure=0.0
        )
        self._orders: Dict[str, Order] = {}
        # Prepopulate quotes
        for sym, price in self.DEFAULT_BASE_PRICES.items():
            self._quotes[sym] = Quote(
                symbol=sym,
                ltp=price,
                bid=price - 0.5,
                ask=price + 0.5,
                volume=150000,
                timestamp=datetime.now()
            )

    def generate_session(self, password: Optional[str] = None, totp: Optional[str] = None) -> bool:
        """Simulate successful authentication."""
        self._connection_state = ConnectionState.CONNECTED
        self.connection_milestone = ConnectionMilestone.AUTHENTICATION_SUCCESS
        return True

    def generate_session_async(
        self,
        password: Optional[str] = None,
        timeout: float = 30.0,
        totp: Optional[str] = None
    ) -> Tuple[bool, str]:
        self._connection_state = ConnectionState.CONNECTED
        self.connection_milestone = ConnectionMilestone.AUTHENTICATION_SUCCESS
        return True, "Mock session generated successfully"

    def get_positions(self) -> List[Position]:
        return self._mock_positions

    def get_funds(self) -> AccountDetails:
        return self._mock_funds

    def place_order(self, order: Order) -> Optional[str]:
        order_id = f"MOCK_{int(time.time() * 1000)}"
        order.order_id = order_id
        fill_price = order.price or self.get_ltp(order.symbol)
        order.record_fill(order.quantity, fill_price)
        self._orders[order_id] = order
        self.logger.info(f"[MOCK] Order placed: {order_id} for {order.symbol} ({order.quantity} @ {fill_price})")
        return order_id

    def get_order_history(self, order_id: Optional[str] = None) -> List[Dict]:
        orders = [o.to_dict() for o in self._orders.values()]
        if order_id:
            return [o for o in orders if o.get("order_id") == order_id]
        return orders

    def simulate_partial_fill(self, order_id: str, fill_qty: int, fill_price: float) -> bool:
        if order_id in self._orders:
            self._orders[order_id].record_fill(fill_qty, fill_price)
            return True
        return False

    def cancel_order(self, order_id: str) -> bool:
        if order_id in self._orders:
            self._orders[order_id].status = "CANCELLED"
            return True
        return False

    def modify_order(self, order_id: str, **kwargs) -> bool:
        if order_id in self._orders:
            order = self._orders[order_id]
            if "price" in kwargs and kwargs["price"] is not None:
                order.price = kwargs["price"]
            if "quantity" in kwargs and kwargs["quantity"] is not None:
                order.quantity = kwargs["quantity"]
            return True
        return False

    def get_quote(self, symbol: str) -> Optional[Quote]:
        if symbol not in self._quotes:
            base = 1000.0
            self._quotes[symbol] = Quote(
                symbol=symbol,
                ltp=base,
                bid=base - 0.25,
                ask=base + 0.25,
                volume=50000,
                timestamp=datetime.now()
            )
        return self._quotes.get(symbol)

    def get_ltp(self, symbol: str) -> float:
        q = self.get_quote(symbol)
        return q.ltp if q else 1000.0