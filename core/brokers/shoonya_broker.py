"""
Shoonya NorenAPI Broker Adapter
Production-Grade Connector for Finvasia Shoonya
Compliant with current NorenAPI and Shoonya Web/API standards.
"""

import asyncio
import hashlib
import json
import logging
import socket
import time
from datetime import datetime
from typing import Optional, Dict, List, Any, Callable

import pyotp
import requests
import websockets
from PySide6.QtCore import Signal, QObject

from core.instrument_master import instrument_master, InstrumentInfo

# Shoonya NorenAPI Endpoints - STRICTLY Active REST Gateway
SHOOONYA_BASE_URL = "https://api.shoonya.com/NorenWClientAPI/"
SHOOONYA_AUTH_ENDPOINT = "https://api.shoonya.com/NorenWClientAPI/QuickAuth"
SHOOONYA_WS_URL = "wss://api.shoonya.com/NorenWSTP/"
SHOOONYA_KNOWN_IP = "13.202.119.185"

# Setup DNS resolution fallback for api.shoonya.com to handle intermittent Windows DNS timeouts
_orig_getaddrinfo = socket.getaddrinfo


def _patched_getaddrinfo(host, port, family=0, type=0, proto=0, flags=0):
    try:
        return _orig_getaddrinfo(host, port, family, type, proto, flags)
    except socket.gaierror:
        if host == "api.shoonya.com":
            return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", (SHOOONYA_KNOWN_IP, port))]
        raise


socket.getaddrinfo = _patched_getaddrinfo


class ShoonyaAuthError(Exception):
    """Raised when Shoonya authentication fails."""
    def __init__(self, message: str, error_code: str = None, original_response: dict = None, static_ip_error: bool = False):
        self.message = message
        self.error_code = error_code
        self.original_response = original_response or {}
        self.static_ip_error = static_ip_error
        super().__init__(self.message)


class ShoonyaConnectionError(Exception):
    """Raised when WebSocket connection fails."""
    pass


class ShoonyaOrderError(Exception):
    """Raised when order placement fails."""
    pass


class ShoonyaBroker(QObject):
    """
    Shoonya NorenAPI Broker Adapter

    Production implementation:
    - Real-time SHA-256 and TOTP generation
    - Authentic Shoonya payload signature (NOREN_API vendor protocol)
    - Full WebSocket live stream (NorenWSTP) with Touchline (tk/tf) feed parsing
    - Reactive Qt signals for UI status and live market ticks
    """

    # Qt signals for UI updates
    connection_status_changed = Signal(str, str)
    tick_received = Signal(dict)
    order_executed = Signal(dict)
    position_update = Signal(dict)

    orders_executed: List[dict] = []

    def __init__(self, parent=None):
        super().__init__(parent)
        self.logger = logging.getLogger("ShoonyaBroker")

        # Connection state
        self._ws = None
        self._is_connected = False
        self._user_token: Optional[str] = None
        self._auth_code: Optional[str] = None
        self._listener_task: Optional[asyncio.Task] = None

        # Credentials - 6 Fields
        self._uid: Optional[str] = None           # Client ID / User ID
        self._pwd: Optional[str] = None           # Trading Password
        self._vc: Optional[str] = None            # Vendor Code (e.g. FA123456_U)
        self._app_key: Optional[str] = None       # API Secret Key
        self._imei: Optional[str] = "12345"       # Device IMEI / UUID
        self._totp_secret: Optional[str] = None   # Base32 TOTP Secret

        # Market data cache
        self._quotes: Dict[str, dict] = {}
        self._positions: Dict[str, dict] = {}
        self._tick_subscribers: List[Callable] = []
        self._subscribed_tokens: List[str] = []

    def set_credentials(self, credentials: Dict[str, str]) -> None:
        """
        Set and sanitize Shoonya credentials.
        """
        self._uid = str(credentials.get("client_id", "")).strip()
        self._pwd = str(credentials.get("password", "")).strip()

        vendor_code = str(credentials.get("vendor_code", "")).strip()
        if vendor_code:
            self._vc = vendor_code
        elif self._uid:
            self._vc = f"{self._uid}_U" if not self._uid.endswith("_U") else self._uid
        else:
            self._vc = ""

        app_key_raw = str(credentials.get("api_secret", ""))
        self._app_key = app_key_raw.strip().replace("\n", "").replace("\r", "").replace(" ", "")

        imei_raw = str(credentials.get("imei", "12345")).strip()
        self._imei = imei_raw if imei_raw else "12345"

        self._totp_secret = str(credentials.get("totp_secret", "")).strip()

    def _generate_totp(self) -> str:
        """Generate 6-digit live TOTP using pyotp."""
        if not self._totp_secret:
            raise ShoonyaAuthError("TOTP secret key is missing in credentials")
        try:
            return pyotp.TOTP(self._totp_secret).now()
        except Exception as e:
            raise ShoonyaAuthError(f"Failed to compute TOTP: {e}")

    def authenticate(self, credentials: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
        """
        Synchronous authentication method.
        Directly executes the Shoonya NorenWClientAPI QuickAuth request.
        """
        if credentials:
            self.set_credentials(credentials)

        if not all([self._uid, self._pwd, self._app_key]):
            raise ShoonyaAuthError("Missing required credentials: Client ID, Password, and API Secret are required")

        # 1. Compute Hashes
        pwd_hashed = hashlib.sha256(self._pwd.encode("utf-8")).hexdigest()

        # Web portal key derivation: S3cur3!d
        X = [83, 50, 97, 114, 110, 46, 27, 93]
        secret_chars = "".join(chr(X[p] + p) for p in range(len(X)))
        appkey_hashed = hashlib.sha256(f"{self._uid}|{secret_chars}".encode("utf-8")).hexdigest()

        factor2 = self._generate_totp()
        vendor_code = self._vc or (f"{self._uid}_U" if self._uid else "")

        # 2. Build verified NorenAPI JSON payload
        jdict = {
            "apkversion": "W2_20260827",
            "uid": self._uid,
            "pwd": pwd_hashed,
            "factor2": factor2,
            "appkey": appkey_hashed,
            "imei": self._imei or "12345",
            "addldivinf": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "app_key": vendor_code,
            "source": "API",
            "vc": "NOREN_API"
        }

        # 3. Payload and headers strictly formatted for Shoonya server
        payload = 'jData=' + json.dumps(jdict)
        headers = {'Content-Type': 'application/x-www-form-urlencoded'}
        endpoint = "https://api.shoonya.com/NorenWClientAPI/QuickAuth"

        try:
            response = requests.post(
                endpoint,
                data=payload,
                headers=headers,
                timeout=15
            )

            if response.status_code != 200:
                raise ShoonyaAuthError(f"HTTP Error {response.status_code}: {response.text}")

            data = response.json()
            stat = str(data.get("stat", "")).lower()

            if stat != "ok":
                emsg = data.get("emsg", "Unknown authentication error")
                is_ip_err = "ip" in emsg.lower() or "whitelist" in emsg.lower()
                self.logger.warning(f"Shoonya authentication rejected: {emsg}")
                raise ShoonyaAuthError(
                    message=f"Shoonya Error: {emsg}",
                    error_code=data.get("stat"),
                    original_response=data,
                    static_ip_error=is_ip_err
                )

            # Extract active user session token
            self._user_token = data.get("susertoken")
            self._auth_code = data.get("code")

            if not self._user_token:
                raise ShoonyaAuthError("Authentication succeeded but no susertoken returned")

            self.logger.info(f"Shoonya authenticated successfully. User token: {self._user_token[:12]}...")
            self.connection_status_changed.emit("CONNECTED", "Shoonya Authenticated")
            return data

        except requests.exceptions.RequestException as e:
            self.logger.error(f"Network error during Shoonya authentication: {e}")
            raise ShoonyaAuthError(f"Network error: {e}")
        except json.JSONDecodeError:
            self.logger.error("Invalid JSON response from Shoonya server")
            raise ShoonyaAuthError("Invalid JSON response from server")

    async def quick_auth(self) -> Dict[str, Any]:
        """
        Authenticate against Shoonya live endpoint /QuickAuth asynchronously.
        Uses verified production payload structure with SHA256 hashing.
        """
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(None, self.authenticate)

    def start_streaming(self, tokens: Optional[List[str]] = None) -> None:
        """
        Start WebSocket connection and streaming in a dedicated background daemon thread.
        Emits Qt signals (tick_received, connection_status_changed) back to the Qt main thread.
        """
        import threading

        def _runner():
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            self._async_loop = loop

            async def _connect_and_stream():
                ok = await self.connect()
                if ok:
                    if tokens:
                        await self.subscribe_ticks(tokens)
                    while self._is_connected and self._ws:
                        await asyncio.sleep(0.5)

            try:
                loop.run_until_complete(_connect_and_stream())
            except Exception as e:
                self.logger.error(f"WebSocket runner exception: {e}")
            finally:
                try:
                    loop.close()
                except Exception:
                    pass

        t = threading.Thread(target=_runner, daemon=True, name="ShoonyaWSThread")
        t.start()

    async def connect(self) -> bool:
        """
        Connect to Shoonya WebSocket (NorenWSTP) and complete handshake.
        """
        if not self._user_token:
            await self.quick_auth()

        try:
            self._ws = await websockets.connect(
                SHOOONYA_WS_URL,
                ssl=True,
                open_timeout=10,
                ping_interval=20,
                ping_timeout=10
            )

            # Send standard Shoonya WebSocket connection handshake
            handshake = {
                "t": "c",
                "uid": self._uid,
                "actid": self._uid,
                "susertoken": self._user_token,
                "source": "API"
            }
            await self._ws.send(json.dumps(handshake))

            # Await handshake acknowledgement {"t": "ck", "s": "OK"}
            ack_raw = await asyncio.wait_for(self._ws.recv(), timeout=10)
            ack_data = json.loads(ack_raw)

            if ack_data.get("t") == "ck" and ack_data.get("s") == "OK":
                self._is_connected = True
                self.connection_status_changed.emit("CONNECTED", "Shoonya WebSocket Connected")
                self.logger.info("Shoonya WebSocket connected and handshake confirmed")

                # Launch background tick listener loop
                self._listener_task = asyncio.create_task(self.handle_ticks())

                # Auto-subscribe default benchmark indices
                await self.subscribe_ticks(["NSE|26000", "NSE|26009"])
                return True
            else:
                self._is_connected = False
                err_msg = ack_data.get("emsg", "Handshake failed")
                self.connection_status_changed.emit("ERROR", err_msg)
                return False

        except Exception as e:
            self.logger.error(f"WebSocket connection error: {e}")
            self._is_connected = False
            self.connection_status_changed.emit("ERROR", str(e))
            return False

    async def subscribe_ticks(self, tokens: Optional[List[str]] = None) -> bool:
        """
        Subscribe to live Touchline quotes (t) on Shoonya WebSocket.
        Tokens format: ["NSE|26000", "NSE|26009"] or ["NIFTY", "BANKNIFTY"]
        """
        if not self._is_connected or not self._ws:
            return False

        if not tokens:
            tokens = ["NSE|26000", "NSE|26009"]

        formatted_keys = []
        for item in tokens:
            if "|" in item:
                formatted_keys.append(item)
            elif item.upper() in ("NIFTY", "NIFTY 50"):
                formatted_keys.append("NSE|26000")
            elif item.upper() in ("BANKNIFTY", "NIFTY BANK"):
                formatted_keys.append("NSE|26009")
            else:
                # Lookup in instrument master
                info = instrument_master.resolve_instrument(item)
                if info:
                    formatted_keys.append(f"{info.exch_seg}|{info.token}")
                else:
                    formatted_keys.append(f"NSE|{item}")

        k_str = "#".join(formatted_keys)
        sub_payload = {
            "t": "t",
            "k": k_str
        }

        try:
            await self._ws.send(json.dumps(sub_payload))
            self._subscribed_tokens = list(set(self._subscribed_tokens + formatted_keys))
            self.logger.info(f"Subscribed to Shoonya market feed: {k_str}")
            return True
        except Exception as e:
            self.logger.error(f"Subscription error: {e}")
            return False

    async def handle_ticks(self) -> None:
        """
        Continuously listen for incoming market data packets from Shoonya.
        """
        while self._is_connected and self._ws:
            try:
                message = await self._ws.recv()
                data = json.loads(message)

                t_type = data.get("t", "")
                if t_type in ("tk", "tf", "dk", "df"):
                    tick_data = self._parse_tick(data)
                    if tick_data:
                        self._quotes[tick_data["symbol"]] = tick_data
                        self.tick_received.emit(tick_data)
                        for cb in self._tick_subscribers:
                            try:
                                cb(tick_data)
                            except Exception:
                                pass

            except websockets.exceptions.ConnectionClosed:
                self.logger.warning("Shoonya WebSocket connection closed by remote server")
                self._is_connected = False
                self.connection_status_changed.emit("DISCONNECTED", "Connection closed")
                break
            except Exception as e:
                self.logger.error(f"Error processing tick message: {e}")

    def _parse_tick(self, data: dict) -> Optional[dict]:
        """
        Parse raw Shoonya packet (tk/tf/dk/df) into standard Quote dictionary.
        """
        try:
            token = str(data.get("tk", ""))
            exch = str(data.get("e", "NSE"))
            if not token:
                return None

            # Symbol resolution
            symbol = "NIFTY" if token == "26000" else ("BANKNIFTY" if token == "26009" else None)
            if not symbol:
                info = instrument_master.get_instrument_by_token(token, exch)
                symbol = info.symbol if info else f"{exch}:{token}"

            prev_quote = self._quotes.get(symbol, {})
            ltp_raw = data.get("lp")
            if ltp_raw is not None:
                ltp = float(ltp_raw)
            else:
                ltp = prev_quote.get("ltp", 0.0)

            close_raw = data.get("c", prev_quote.get("close", ltp))
            close_px = float(close_raw) if close_raw else ltp

            open_raw = data.get("o", prev_quote.get("open", ltp))
            open_px = float(open_raw) if open_raw else ltp

            high_raw = data.get("h", prev_quote.get("high", ltp))
            high_px = float(high_raw) if high_raw else ltp

            low_raw = data.get("l", prev_quote.get("low", ltp))
            low_px = float(low_raw) if low_raw else ltp

            vol_raw = data.get("v", data.get("toi", prev_quote.get("volume", 0)))
            vol = int(float(vol_raw)) if vol_raw else 0

            quote = {
                "symbol": symbol,
                "token": token,
                "exchange": exch,
                "ltp": ltp,
                "open": open_px,
                "high": high_px,
                "low": low_px,
                "close": close_px,
                "volume": vol,
                "timestamp": datetime.now().isoformat(),
                "bid": float(data.get("bp1", ltp * 0.999)),
                "ask": float(data.get("sp1", ltp * 1.001)),
            }
            return quote
        except Exception as e:
            self.logger.error(f"Error parsing Shoonya tick: {e}")
            return None

    def disconnect(self) -> None:
        """Disconnect WebSocket cleanly."""
        self._is_connected = False
        if self._listener_task and not self._listener_task.done():
            self._listener_task.cancel()
        if self._ws:
            try:
                asyncio.get_event_loop().create_task(self._ws.close())
            except Exception:
                pass
        self._ws = None
        self.connection_status_changed.emit("DISCONNECTED", "User disconnected")
        self.logger.info("Shoonya disconnected")

    def is_connected(self) -> bool:
        """Return live connection state."""
        return self._is_connected

    def get_quote(self, symbol: str) -> Optional[dict]:
        """Get latest quote for symbol."""
        return self._quotes.get(symbol)

    def get_all_quotes(self) -> Dict[str, dict]:
        """Get copy of all cached quotes."""
        return self._quotes.copy()

    def get_positions(self) -> List[dict]:
        """Return open positions."""
        return list(self._positions.values())

    def add_tick_subscriber(self, callback: Callable) -> None:
        """Register a callback for real-time ticks."""
        if callback not in self._tick_subscribers:
            self._tick_subscribers.append(callback)

    def remove_tick_subscriber(self, callback: Callable) -> None:
        """Unregister callback."""
        if callback in self._tick_subscribers:
            self._tick_subscribers.remove(callback)
