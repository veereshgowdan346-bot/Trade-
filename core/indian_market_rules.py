"""
Indian Market Rules, Calendar & Exchange Specifications for AuraTrader-AngelOne
Implements verified session hours, 2026 holiday schedule, contract lot sizes,
and tick size rules for NSE, BSE, NFO, and MCX in Asia/Kolkata (IST).
"""

from datetime import datetime, time, date, timezone, timedelta
from enum import Enum
from typing import Optional, Dict, Any, Set


# Fixed Asia/Kolkata timezone offset (+05:30)
IST = timezone(timedelta(hours=5, minutes=30))


class MarketSession(Enum):
    """Trading session state."""
    CLOSED = "CLOSED"
    PRE_OPEN = "PRE_OPEN"          # 09:00 - 09:15 IST
    REGULAR = "REGULAR"            # 09:15 - 15:30 IST (Equities/F&O)
    POST_CLOSE = "POST_CLOSE"      # 15:40 - 16:00 IST
    COMMODITY_REGULAR = "COMMODITY_REGULAR"  # 09:00 - 23:30/23:55 IST (MCX)


# Official 2026 NSE/BSE Trading Holidays (16 Weekdays - Circulars NSE/CMTR/71775 & NSE/CMTR/72260)
TRADING_HOLIDAYS_2026: Set[date] = {
    date(2026, 1, 15),   # Municipal Corporation Election - Maharashtra
    date(2026, 1, 26),   # Republic Day
    date(2026, 3, 3),    # Holi
    date(2026, 3, 26),   # Shri Ram Navami
    date(2026, 3, 31),   # Shri Mahavir Jayanti
    date(2026, 4, 3),    # Good Friday
    date(2026, 4, 14),   # Dr. Baba Saheb Ambedkar Jayanti
    date(2026, 5, 1),    # Maharashtra Day
    date(2026, 5, 28),   # Bakri Id
    date(2026, 6, 26),   # Muharram
    date(2026, 9, 14),   # Ganesh Chaturthi
    date(2026, 10, 2),   # Mahatma Gandhi Jayanti
    date(2026, 10, 20),  # Dussehra
    date(2026, 11, 10),  # Diwali Balipratipada
    date(2026, 11, 24),  # Gurunanak Jayanti
    date(2026, 12, 25),  # Christmas
}

# Official 2026 NSE Weekend Holidays (4 Weekend Days)
WEEKEND_HOLIDAYS_2026: Set[date] = {
    date(2026, 2, 15),   # Mahashivratri (Sunday)
    date(2026, 3, 21),   # Id-Ul-Fitr (Saturday)
    date(2026, 8, 15),   # Independence Day (Saturday)
    date(2026, 11, 8),   # Diwali Laxmi Pujan (Sunday - Muhurat special session)
}


# Current Verified Index Lot Sizes for Indian Markets
LOT_SIZES: Dict[str, int] = {
    "NIFTY": 25,
    "NIFTY 50": 25,
    "BANKNIFTY": 15,
    "NIFTY BANK": 15,
    "FINNIFTY": 25,
    "MIDCPNIFTY": 50,
    "SENSEX": 10,
    "BANKEX": 15,
    "GOLD": 1,
    "SILVER": 1,
}


def get_ist_now() -> datetime:
    """Return current localized datetime in Asia/Kolkata timezone."""
    return datetime.now(timezone.utc).astimezone(IST)


def is_trading_holiday(check_date: Optional[date] = None) -> bool:
    """Check if the given date is an official Indian market trading holiday."""
    d = check_date or get_ist_now().date()
    return d in TRADING_HOLIDAYS_2026


def get_market_session(dt: Optional[datetime] = None, exchange: str = "NSE") -> MarketSession:
    """
    Determine the active trading session for an exchange.

    Args:
        dt: Datetime to check (defaults to current IST time)
        exchange: Exchange code ('NSE', 'BSE', 'NFO', 'MCX')

    Returns:
        MarketSession enum value
    """
    if dt is None:
        ist_dt = get_ist_now()
    elif dt.tzinfo is None:
        ist_dt = dt.replace(tzinfo=IST)
    else:
        ist_dt = dt.astimezone(IST)

    # Weekends are strictly closed (0=Monday, 5=Saturday, 6=Sunday)
    if ist_dt.weekday() >= 5:
        return MarketSession.CLOSED

    # Trading holidays
    if is_trading_holiday(ist_dt.date()):
        return MarketSession.CLOSED

    t = ist_dt.time()
    exch_upper = exchange.upper()

    # MCX Commodity trading hours (09:00 - 23:30/23:55 IST)
    if exch_upper in ("MCX", "COMMODITY"):
        if time(9, 0) <= t < time(23, 30):
            return MarketSession.COMMODITY_REGULAR
        return MarketSession.CLOSED

    # NSE/BSE Equity & Derivatives hours
    if time(9, 0) <= t < time(9, 15):
        return MarketSession.PRE_OPEN
    elif time(9, 15) <= t < time(15, 30):
        return MarketSession.REGULAR
    elif time(15, 40) <= t < time(16, 0):
        return MarketSession.POST_CLOSE

    return MarketSession.CLOSED


def is_market_open(dt: Optional[datetime] = None, exchange: str = "NSE") -> bool:
    """Return True if the specified market is currently in active regular trading."""
    session = get_market_session(dt, exchange)
    return session in (MarketSession.REGULAR, MarketSession.COMMODITY_REGULAR)


def is_intraday_squareoff_time(dt: Optional[datetime] = None, exchange: str = "NSE") -> bool:
    """
    Check if current time has passed the broker mandatory auto-square-off threshold.
    NSE/BSE: >= 15:15 IST
    MCX: >= 23:15 IST
    """
    ist_dt = dt.astimezone(IST) if dt else get_ist_now()
    t = ist_dt.time()
    exch_upper = exchange.upper()

    if exch_upper in ("MCX", "COMMODITY"):
        return t >= time(23, 15)
    return t >= time(15, 15)


def get_lot_size(symbol: str) -> int:
    """Return contract lot size for a symbol, defaulting to 1 for equities."""
    clean = symbol.upper().replace("NSE:", "").replace("BSE:", "").replace("MCX:", "").strip()
    # Check exact match first
    if clean in LOT_SIZES:
        return LOT_SIZES[clean]
    # Check longest substring match
    for key, lot in sorted(LOT_SIZES.items(), key=lambda x: len(x[0]), reverse=True):
        if key in clean:
            return lot
    return 1


def get_tick_size(symbol: str) -> float:
    """Return minimum price tick size for a symbol."""
    sym_upper = symbol.upper()
    if "MCX" in sym_upper or "GOLD" in sym_upper or "SILVER" in sym_upper:
        return 1.00
    if "USDINR" in sym_upper or "EURINR" in sym_upper:
        return 0.0025
    return 0.05
