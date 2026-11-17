"""
AuraTrader-AngelOne - Instrument Master Service
Downloads, caches, validates, and indexes the official Angel One Scrip Master.
Resolves human-readable symbols to valid exchange trading symbols and symbol tokens.

Official Scrip Master URL:
https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json
"""

import os
import json
import time
import logging
from pathlib import Path
from dataclasses import dataclass
from typing import Optional, Dict, List, Tuple
from datetime import datetime

logger = logging.getLogger("InstrumentMaster")


@dataclass(frozen=True)
class InstrumentInfo:
    """Validated Instrument Metadata from Angel One Scrip Master."""
    token: str
    symbol: str             # e.g. "RELIANCE-EQ" or "Nifty 50"
    name: str               # e.g. "RELIANCE"
    exch_seg: str           # "NSE", "BSE", "NFO", "MCX"
    lotsize: int = 1
    tick_size: float = 0.05
    instrument_type: str = ""
    expiry: str = ""
    strike: float = 0.0


# Baseline seed dictionary for major equities and benchmarks for offline / test robustness
BASELINE_INSTRUMENTS: List[dict] = [
    {"token": "2885", "symbol": "RELIANCE-EQ", "name": "RELIANCE", "exch_seg": "NSE", "lotsize": 1, "tick_size": 0.05},
    {"token": "11536", "symbol": "TCS-EQ", "name": "TCS", "exch_seg": "NSE", "lotsize": 1, "tick_size": 0.05},
    {"token": "1594", "symbol": "INFY-EQ", "name": "INFY", "exch_seg": "NSE", "lotsize": 1, "tick_size": 0.05},
    {"token": "1333", "symbol": "HDFCBANK-EQ", "name": "HDFCBANK", "exch_seg": "NSE", "lotsize": 1, "tick_size": 0.05},
    {"token": "1660", "symbol": "ITC-EQ", "name": "ITC", "exch_seg": "NSE", "lotsize": 1, "tick_size": 0.05},
    {"token": "3045", "symbol": "SBIN-EQ", "name": "SBIN", "exch_seg": "NSE", "lotsize": 1, "tick_size": 0.05},
    {"token": "26000", "symbol": "Nifty 50", "name": "NIFTY", "exch_seg": "NSE", "lotsize": 50, "tick_size": 0.05},
    {"token": "26009", "symbol": "Nifty Bank", "name": "BANKNIFTY", "exch_seg": "NSE", "lotsize": 15, "tick_size": 0.05},
    {"token": "26037", "symbol": "Nifty Fin Services", "name": "FINNIFTY", "exch_seg": "NSE", "lotsize": 40, "tick_size": 0.05},
    {"token": "99926000", "symbol": "NIFTY", "name": "NIFTY 50", "exch_seg": "NSE", "lotsize": 50, "tick_size": 0.05},
    {"token": "99926009", "symbol": "BANKNIFTY", "name": "BANKNIFTY", "exch_seg": "NSE", "lotsize": 15, "tick_size": 0.05},
]


class InstrumentMaster:
    """
    Manages caching, downloading, and fast lookup of Angel One instrument tokens.
    """

    SCRIP_MASTER_URL = "https://margincalculator.angelbroking.com/OpenAPI_File/files/OpenAPIScripMaster.json"
    CACHE_DIR = Path.home() / ".auratrader"
    CACHE_FILE = CACHE_DIR / "scrip_master.json"
    META_FILE = CACHE_DIR / "scrip_master_meta.json"
    MAX_CACHE_AGE_SECONDS = 86400  # 24 hours

    def __init__(self, auto_load: bool = True):
        self.CACHE_DIR.mkdir(parents=True, exist_ok=True)
        # Fast multi-index lookups:
        # (exchange, symbol_upper) -> InstrumentInfo
        self._by_symbol: Dict[Tuple[str, str], InstrumentInfo] = {}
        # (exchange, token) -> InstrumentInfo
        self._by_token: Dict[Tuple[str, str], InstrumentInfo] = {}
        # (exchange, name_upper) -> InstrumentInfo
        self._by_name: Dict[Tuple[str, str], InstrumentInfo] = {}
        self._last_loaded_at: Optional[datetime] = None

        # Pre-seed with baseline instruments
        self._load_entries(BASELINE_INSTRUMENTS)

        if auto_load:
            self.load_cache()

    def _load_entries(self, entries: List[dict]) -> int:
        count = 0
        for item in entries:
            try:
                token = str(item.get("token", "")).strip()
                symbol = str(item.get("symbol", "")).strip()
                name = str(item.get("name", "")).strip()
                exch_seg = str(item.get("exch_seg", "NSE")).strip().upper()

                if not token or not symbol:
                    continue

                lotsize = int(float(item.get("lotsize", 1) or 1))
                tick_size = float(item.get("tick_size", 0.05) or 0.05)
                inst_type = str(item.get("instrumenttype", ""))
                expiry = str(item.get("expiry", ""))
                strike = float(item.get("strike", 0.0) or 0.0)

                info = InstrumentInfo(
                    token=token,
                    symbol=symbol,
                    name=name,
                    exch_seg=exch_seg,
                    lotsize=lotsize,
                    tick_size=tick_size,
                    instrument_type=inst_type,
                    expiry=expiry,
                    strike=strike
                )

                self._by_symbol[(exch_seg, symbol.upper())] = info
                self._by_token[(exch_seg, token)] = info
                if name:
                    self._by_name[(exch_seg, name.upper())] = info
                count += 1
            except Exception as e:
                continue
        return count

    def is_cache_stale(self) -> bool:
        """Check if local cache file is older than 24 hours."""
        if not self.CACHE_FILE.exists() or not self.META_FILE.exists():
            return True
        try:
            with open(self.META_FILE, 'r') as f:
                meta = json.load(f)
                download_time = meta.get("downloaded_at", 0)
                return (time.time() - download_time) > self.MAX_CACHE_AGE_SECONDS
        except Exception:
            return True

    def download_and_update(self, timeout: float = 15.0) -> bool:
        """
        Download official Scrip Master from Angel One and update local cache.
        """
        import requests
        try:
            logger.info(f"Downloading Angel One Scrip Master from {self.SCRIP_MASTER_URL}...")
            resp = requests.get(self.SCRIP_MASTER_URL, timeout=timeout)
            if resp.status_code == 200:
                data = resp.json()
                if isinstance(data, list) and len(data) > 0:
                    with open(self.CACHE_FILE, 'w', encoding='utf-8') as f:
                        json.dump(data, f)
                    with open(self.META_FILE, 'w', encoding='utf-8') as f:
                        json.dump({"downloaded_at": time.time(), "count": len(data)}, f)

                    loaded = self._load_entries(data)
                    self._last_loaded_at = datetime.now()
                    logger.info(f"Successfully loaded {loaded} instruments from downloaded Scrip Master.")
                    return True
        except Exception as e:
            logger.warning(f"Failed to download Angel One Scrip Master: {e}. Falling back to cached data.")
        return False

    def load_cache(self) -> bool:
        """Load instrument master from local disk cache."""
        if self.CACHE_FILE.exists():
            try:
                with open(self.CACHE_FILE, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    if isinstance(data, list):
                        loaded = self._load_entries(data)
                        self._last_loaded_at = datetime.now()
                        logger.info(f"Loaded {loaded} instruments from local cache.")
                        return True
            except Exception as e:
                logger.error(f"Error reading scrip master cache: {e}")
        return False

    def resolve_instrument(self, symbol: str, exchange: Optional[str] = None) -> Optional[InstrumentInfo]:
        """
        Resolve a user or strategy symbol to a verified InstrumentInfo.

        Examples of handled formats:
        - "NSE:RELIANCE" -> exch="NSE", sym="RELIANCE" -> matches "RELIANCE-EQ" (token: "2885")
        - "NSE:TCS" -> exch="NSE", sym="TCS" -> matches "TCS-EQ" (token: "11536")
        - "RELIANCE-EQ" -> exch="NSE", sym="RELIANCE-EQ"
        - "NIFTY 50" -> exch="NSE", sym="Nifty 50" (token: "26000")
        - "BANKNIFTY" -> exch="NSE", sym="Nifty Bank" (token: "26009")

        Returns:
            InstrumentInfo if resolved, None if symbol is invalid/unrecognized.
        """
        if not symbol or not isinstance(symbol, str):
            return None

        clean_symbol = symbol.strip()
        exch = (exchange or "NSE").strip().upper()

        # Handle prefix like "NSE:RELIANCE" or "BSE:TCS"
        if ":" in clean_symbol:
            parts = clean_symbol.split(":", 1)
            exch = parts[0].strip().upper()
            clean_symbol = parts[1].strip()

        clean_upper = clean_symbol.upper()

        # 1. Exact match on trading symbol (e.g. "RELIANCE-EQ" or "NIFTY 50")
        if (exch, clean_upper) in self._by_symbol:
            return self._by_symbol[(exch, clean_upper)]

        # 2. Try with standard "-EQ" suffix for NSE equities (e.g. "RELIANCE" -> "RELIANCE-EQ")
        if exch in ("NSE", "BSE"):
            eq_variant = f"{clean_upper}-EQ"
            if (exch, eq_variant) in self._by_symbol:
                return self._by_symbol[(exch, eq_variant)]

        # 3. Look up by company name (e.g. name="RELIANCE")
        if (exch, clean_upper) in self._by_name:
            return self._by_name[(exch, clean_upper)]

        # 4. Handle benchmark index aliases
        index_aliases = {
            "NIFTY": ("NSE", "NIFTY 50"),
            "NIFTY50": ("NSE", "NIFTY 50"),
            "NIFTY 50": ("NSE", "NIFTY 50"),
            "BANKNIFTY": ("NSE", "NIFTY BANK"),
            "NIFTYBANK": ("NSE", "NIFTY BANK"),
            "FINNIFTY": ("NSE", "NIFTY FIN SERVICES"),
        }
        if clean_upper in index_aliases:
            idx_exch, idx_sym = index_aliases[clean_upper]
            for (e, s), info in self._by_symbol.items():
                if e == idx_exch and (idx_sym in s.upper() or s.upper() in idx_sym):
                    return info

        return None

    def get_token(self, symbol: str, exchange: Optional[str] = None) -> Optional[str]:
        """Convenience method to retrieve string numeric token."""
        info = self.resolve_instrument(symbol, exchange)
        return info.token if info else None

    def get_trading_symbol(self, symbol: str, exchange: Optional[str] = None) -> Optional[str]:
        """Convenience method to retrieve official trading symbol."""
        info = self.resolve_instrument(symbol, exchange)
        return info.symbol if info else None

    def get_instrument_by_token(self, token: str, exchange: Optional[str] = None) -> Optional[InstrumentInfo]:
        """Look up InstrumentInfo by token."""
        token_str = str(token).strip()
        if exchange:
            return self._by_token.get((exchange.upper(), token_str))
        for (exch, t), info in self._by_token.items():
            if t == token_str:
                return info
        return None


# Global singleton instance
instrument_master = InstrumentMaster(auto_load=True)

