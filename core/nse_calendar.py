"""
OmniTradePro Apex V2.0 — Phase 7.4.1
NSE & Indian Exchanges Evidence-Based Versioned Calendar & Session Engine

Version: 2026.2 (Evidence-Audited)
Auditable specifications for regular sessions, exchange holidays,
special sessions (Diwali Muhurat trading, DR live trading), and segment-specific schedules.

Official Regulatory References:
1. Annual Holiday Schedule:
   - Primary Circular: NSE/CMTR/71775 (Circular Ref: 172/2025, Published: 2025-12-12)
   - Supplementary Election Circular: NSE/CMTR/72890 (State Govt Election Gazette, Published: 2026-01-05)
2. Diwali Muhurat Trading 2026:
   - Circular: NSE/CMTR/76941 (Download Ref: 149/2026, Published: 2026-10-19)
3. Disaster Recovery (DR) Live Trading Sessions:
   - Circular: NSE/MSD/73126 (Circular Ref: 11/2026, Published: 2026-03-05)
"""

from dataclasses import dataclass, field
from dataclasses import dataclass, field
from datetime import datetime, date, time, timezone, timedelta
from enum import Enum
from typing import Optional, Dict, Any, Set, List, Tuple, Union

# Fixed Asia/Kolkata timezone offset (+05:30) — daylight saving independent
IST = timezone(timedelta(hours=5, minutes=30))
NSE_CALENDAR_VERSION = "2026.2"


class SessionType(Enum):
    REGULAR = "REGULAR"
    PRE_OPEN = "PRE_OPEN"
    POST_CLOSE = "POST_CLOSE"
    SPECIAL_MUHURAT = "SPECIAL_MUHURAT"
    SPECIAL_DR = "SPECIAL_DR"
    COMMODITY_REGULAR = "COMMODITY_REGULAR"
    CLOSED = "CLOSED"
    # Phase 7.4.3: Security-specific session types
    BLOCK_DEAL = "BLOCK_DEAL"
    SPECIAL_CAS = "SPECIAL_CAS"
    SPECIAL_PREOPEN = "SPECIAL_PREOPEN"
    CALL_AUCTION = "CALL_AUCTION"


class CalendarRegime(Enum):
    """
    Market Session Architecture & Regulatory Regime on NSE Capital Market.
    - LEGACY: Historical schedule prior to 2026-08-03 per NSE/CMTR/13444 (effective 2010-01-04 to 2026-08-02).
      VWAP Calculation Buffer 15:30:00 to 15:40:00, and Closing Session 15:40:00 to 16:00:00.
    - LEGACY_PRE_CAS: Alias for LEGACY.
    - CAS_V1: First-generation CAS schedule from 2026-08-03 through 2026-12-06 per SEBI HO/47/11/11(3)2025-MRD-POD2/I/2765/2026,
      NSE/CMTR/73362, NSE/CMTR/74466, and NSE/CMTR/76941. Auction Matching 15:30:00 to 15:35:00,
      Transition Period 15:35:00 to 15:50:00, and Closing Session 15:50:00 to 16:00:00.
    - MODERN_CAS_2026: Alias for CAS_V1.
    - CAS_V2: Second-generation CAS 2.0 schedule effective from 2026-12-07 onwards per SEBI HO/47/11/11(3)2025-MRD-POD2/I/23843/2026
      and NSE/CMTR/77355. Transition 15:30-15:31, Order Entry 15:31-15:40 (random closure 15:38-15:40),
      Order Matching 15:40-15:45, Transition Buffer 15:45-15:50, Post-Close 15:50-16:00.
    """
    LEGACY = "LEGACY"
    LEGACY_PRE_CAS = "LEGACY_PRE_CAS"
    CAS_V1 = "CAS_V1"
    MODERN_CAS_2026 = "MODERN_CAS_2026"
    CAS_V2 = "CAS_V2"


# Regulatory Effective Date Boundaries (Phase 7.4.7)
LEGACY_SUNSET_DATE = date(2026, 8, 2)
CAS_V1_GO_LIVE_DATE = date(2026, 8, 3)
CAS_V1_SUNSET_DATE = date(2026, 12, 6)
CAS_V2_GO_LIVE_DATE = date(2026, 12, 7)

# Backward-compatible aliases
CAS_GO_LIVE_DATE_2026 = CAS_V1_GO_LIVE_DATE


@dataclass(frozen=True)
class ScheduleVersionSpec:
    """Explicit versioned regulatory market session schedule specification."""
    version_id: str
    version_name: str
    effective_from: Optional[date]
    effective_to: Optional[date]
    governing_circulars: List[str]
    description: str


SCHEDULE_VERSIONS_REGISTRY: Dict[str, ScheduleVersionSpec] = {
    "LEGACY": ScheduleVersionSpec(
        version_id="LEGACY",
        version_name="Pre-CAS Legacy Schedule",
        effective_from=date(2010, 1, 4),
        effective_to=date(2026, 8, 2),
        governing_circulars=["NSE/CMTR/13444"],
        description="Historical schedule prior to CAS introduction with VWAP calculation buffer (15:30-15:40) and closing session (15:40-16:00)."
    ),
    "CAS_V1": ScheduleVersionSpec(
        version_id="CAS_V1",
        version_name="CAS 1.0 Initial Schedule",
        effective_from=date(2026, 8, 3),
        effective_to=date(2026, 12, 6),
        governing_circulars=[
            "SEBI/HO/47/11/11(3)2025-MRD-POD2/I/2765/2026",
            "NSE/CMTR/73362",
            "NSE/CMTR/74466",
            "NSE/CMTR/76941"
        ],
        description="First-generation Call Auction at Close (CAS 1.0) with auction matching at 15:30-15:35, transition buffer at 15:35-15:50, and closing session at 15:50-16:00."
    ),
    "CAS_V2": ScheduleVersionSpec(
        version_id="CAS_V2",
        version_name="CAS 2.0 Enhanced Schedule",
        effective_from=date(2026, 12, 7),
        effective_to=None,
        governing_circulars=[
            "SEBI/HO/47/11/11(3)2025-MRD-POD2/I/23843/2026",
            "NSE/CMTR/77355",
            "NSE_CAS2_FAQ_20261106"
        ],
        description="Second-generation Call Auction at Close (CAS 2.0) with transition at 15:30-15:31, order entry at 15:31-15:40 (random closure 15:38-15:40), order matching at 15:40-15:45, transition buffer at 15:45-15:50, and closing session at 15:50-16:00."
    ),
}


class SecurityCategory(Enum):
    """
    Security eligibility classification for exchange session scheduling.
    Per SEBI & NSE circulars:
    - CAS_ELIGIBLE: Securities eligible for Closing Auction Session (NIFTY 50, F&O liquid scrips, index constituents)
    - NON_CAS: Securities trading in regular continuous market without early CAS closure
    - SPECIAL_PREOPEN_IPO: Securities eligible for Special Pre-Open Session (IPOs, relisted, capital reduction)
    - ILLIQUID_CALL_AUCTION: Securities trading exclusively in Periodic Call Auctions (no continuous trading)
    """
    CAS_ELIGIBLE = "CAS_ELIGIBLE"
    NON_CAS = "NON_CAS"
    SPECIAL_PREOPEN_IPO = "SPECIAL_PREOPEN_IPO"
    ILLIQUID_CALL_AUCTION = "ILLIQUID_CALL_AUCTION"


class ExchangeSegment(Enum):
    """
    Exchange Segments on National Stock Exchange of India (NSE).
    Each segment maintains distinct trading hours, holiday schedules, and clearing cycles.
    """
    CAPITAL_MARKET = "CAPITAL_MARKET"              # Equity (CM) - Core Scope of Algorithmic Trading Engine
    EQUITY_DERIVATIVES = "EQUITY_DERIVATIVES"       # Futures & Options (F&O)
    CURRENCY_DERIVATIVES = "CURRENCY_DERIVATIVES"   # Currency Derivatives (CDS)
    COMMODITY_DERIVATIVES = "COMMODITY_DERIVATIVES" # Commodity Derivatives (COM)
    CLEARING_SETTLEMENT = "CLEARING_SETTLEMENT"     # NSCCL Clearing, Depository & Banking Settlement


class MuhuratSessionPhase(Enum):
    """
    Detailed microstructural phases of the Diwali Muhurat Trading Session (Sunday 2026-11-08)
    per official circular NSE/CMTR/76941 (Download Ref: 149/2026, Date: 2026-10-19).
    """
    CLOSED = "CLOSED"
    BLOCK_DEAL = "BLOCK_DEAL"                               # 13:50 - 14:05 IST (Bilateral block deal session window)
    PRE_OPEN_ENTRY = "PRE_OPEN_ENTRY"                       # 14:05 - 14:10 IST (Limit & Market order entry, random stop in last 2 mins)
    PRE_OPEN_LIMIT_ONLY = "PRE_OPEN_LIMIT_ONLY"             # 14:10 - 14:15 IST (Limit order entry only; market orders cannot be cancelled/modified)
    PRE_OPEN_MATCHING = "PRE_OPEN_MATCHING"                 # 14:15 - 14:17 IST (Order matching & trade confirmation)
    PRE_OPEN_BUFFER = "PRE_OPEN_BUFFER"                     # 14:17 - 14:20 IST (Transition buffer to continuous trading)
    CONTINUOUS_TRADING = "CONTINUOUS_TRADING"               # 14:20 - 15:30 IST (Continuous Trading Session; CAS securities close at 15:15)
    CAS_TRANSITION = "CAS_TRANSITION"                       # 15:15 - 15:20 IST (Reference price calculation for Closing Auction Session)
    CLOSING_AUCTION_ENTRY = "CLOSING_AUCTION_ENTRY"         # 15:20 - 15:25 IST (Closing Auction Order Entry: Limit/Market)
    CAS_LIMIT_ONLY = "CAS_LIMIT_ONLY"                       # 15:25 - 15:30 IST (Closing Auction Limit order only; random stop in last 2 mins)
    CLOSING_AUCTION_MATCHING = "CLOSING_AUCTION_MATCHING"   # 15:30 - 15:35 IST (CAS order matching & trade confirmation)
    CAS_TRANSITION_BUFFER = "CAS_TRANSITION_BUFFER"         # 15:35 - 15:50 IST (Post-auction transition & reconciliation period)
    CLOSING_SESSION = "CLOSING_SESSION"                     # 15:50 - 16:00 IST (Official Closing Session / Post-Close Trading at determined closing price)


class CandleTimestampConvention(str, Enum):
    """
    Standard industry conventions for timestamping OHLC(V) historical candles:
    - START_OF_INTERVAL: Timestamp marks the opening instant of the candle bar [t, t + delta_t).
      Common in modern electronic crypto and algorithmic equity venues.
      Under this convention, for 1m bars in regular NSE equity (09:15-15:30):
      First valid bar is 09:15:00 [09:15, 09:16).
      Last valid bar is 15:29:00 [15:29, 15:30).
      A bar stamped 15:30:00 [15:30, 15:31) falls outside continuous trading.
    - END_OF_INTERVAL: Timestamp marks the closing instant of the candle bar [t - delta_t, t).
      Traditional in legacy tick aggregation and financial feeds.
      Under this convention, for 1m bars in regular NSE equity (09:15-15:30):
      A bar stamped 09:15:00 [09:14, 09:15) falls in pre-open buffer.
      First valid bar is 09:16:00 [09:15, 09:16).
      Last valid bar is 15:30:00 [15:29, 15:30).
      A bar stamped 15:31:00 [15:30, 15:31) falls outside continuous trading.
    """
    START_OF_INTERVAL = "START_OF_INTERVAL"
    END_OF_INTERVAL = "END_OF_INTERVAL"


@dataclass(frozen=True)
class PcaCycleSchedule:
    """Exact operational schedule for an illiquid call auction cycle per NSE/CMTR/23114."""
    cycle_number: int
    cycle_start: time
    cycle_end: time
    order_entry_start: time
    order_entry_end: time
    random_closure_start: time
    random_closure_end: time
    matching_start: time
    matching_end: time
    buffer_start: time
    buffer_end: time
    source_circular: str = "NSE/CMTR/23114"
    verification_status: str = "VERIFIED"


# 6 Operational Cycles for Illiquid Securities per NSE Circular NSE/CMTR/23114
PCAIS_OPERATIONAL_CYCLES: List[PcaCycleSchedule] = [
    PcaCycleSchedule(
        cycle_number=1,
        cycle_start=time(9, 30),
        cycle_end=time(10, 30),
        order_entry_start=time(9, 30),
        order_entry_end=time(10, 15),
        random_closure_start=time(10, 14),
        random_closure_end=time(10, 15),
        matching_start=time(10, 15),
        matching_end=time(10, 23),
        buffer_start=time(10, 23),
        buffer_end=time(10, 30),
    ),
    PcaCycleSchedule(
        cycle_number=2,
        cycle_start=time(10, 30),
        cycle_end=time(11, 30),
        order_entry_start=time(10, 30),
        order_entry_end=time(11, 15),
        random_closure_start=time(11, 14),
        random_closure_end=time(11, 15),
        matching_start=time(11, 15),
        matching_end=time(11, 23),
        buffer_start=time(11, 23),
        buffer_end=time(11, 30),
    ),
    PcaCycleSchedule(
        cycle_number=3,
        cycle_start=time(11, 30),
        cycle_end=time(12, 30),
        order_entry_start=time(11, 30),
        order_entry_end=time(12, 15),
        random_closure_start=time(12, 14),
        random_closure_end=time(12, 15),
        matching_start=time(12, 15),
        matching_end=time(12, 23),
        buffer_start=time(12, 23),
        buffer_end=time(12, 30),
    ),
    PcaCycleSchedule(
        cycle_number=4,
        cycle_start=time(12, 30),
        cycle_end=time(13, 30),
        order_entry_start=time(12, 30),
        order_entry_end=time(13, 15),
        random_closure_start=time(13, 14),
        random_closure_end=time(13, 15),
        matching_start=time(13, 15),
        matching_end=time(13, 23),
        buffer_start=time(13, 23),
        buffer_end=time(13, 30),
    ),
    PcaCycleSchedule(
        cycle_number=5,
        cycle_start=time(13, 30),
        cycle_end=time(14, 30),
        order_entry_start=time(13, 30),
        order_entry_end=time(14, 15),
        random_closure_start=time(14, 14),
        random_closure_end=time(14, 15),
        matching_start=time(14, 15),
        matching_end=time(14, 23),
        buffer_start=time(14, 23),
        buffer_end=time(14, 30),
    ),
    PcaCycleSchedule(
        cycle_number=6,
        cycle_start=time(14, 30),
        cycle_end=time(15, 30),
        order_entry_start=time(14, 30),
        order_entry_end=time(15, 15),
        random_closure_start=time(15, 14),
        random_closure_end=time(15, 15),
        matching_start=time(15, 15),
        matching_end=time(15, 23),
        buffer_start=time(15, 23),
        buffer_end=time(15, 30),
    ),
]


# SEBI Special Pre-Open Session (SPOS) Schedule Specification per CIR/MRD/DP/01/2012
SPOS_SCHEDULE_SPEC = {
    "order_entry": {
        "start": time(9, 0),
        "end": time(9, 45),
        "order_types_allowed": ["LIMIT", "MARKET"],
        "random_closure_window": (time(9, 35), time(9, 45)),
        "circular_ref": "CIR/MRD/DP/01/2012",
        "verification_status": "VERIFIED"
    },
    "deterministic_limit_only_subphase": {
        "claim": "09:40-09:45 Limit orders only",
        "circular_ref": "NONE",
        "verification_status": "UNVERIFIED",
        "notes": "SEBI CIR/MRD/DP/01/2012 paragraph 3(f) permits both market and limit orders throughout the 45-minute order entry phase. Any claim of a distinct deterministic limit-only window is UNVERIFIED."
    },
    "order_matching": {
        "start": time(9, 45),
        "end": time(9, 55),
        "circular_ref": "CIR/MRD/DP/01/2012",
        "verification_status": "VERIFIED"
    },
    "buffer": {
        "start": time(9, 55),
        "end": time(10, 0),
        "circular_ref": "CIR/MRD/DP/01/2012",
        "verification_status": "VERIFIED"
    },
    "continuous_trading_start": {
        "time": time(10, 0),
        "circular_ref": "CIR/MRD/DP/01/2012",
        "verification_status": "VERIFIED"
    }
}


# 3-Tier Classification for Periodic Call Auction for Illiquid Securities (PCAIS)
PCAIS_THREE_TIER_SPEC = {
    "tier_1_regulatory_framework": {
        "circular_refs": ["CIR/MRD/DP/6/2013", "CIR/MRD/DP/38/2013"],
        "cycle_duration_minutes": 60,
        "order_entry_minutes": 45,
        "random_closure_window": "45th minute (last 1 min of order entry: 44:00-45:00)",
        "order_matching_minutes": 8,
        "buffer_minutes": 7,
        "continuous_trading_minutes": 0,
        "verification_status": "VERIFIED"
    },
    "tier_2_operational_schedule": {
        "circular_ref": "NSE/CMTR/23114",
        "cycles_per_day": 6,
        "overall_window": "09:30:00 to 15:30:00 IST",
        "verification_status": "VERIFIED"
    },
    "tier_3_local_simulated_schedule": {
        "circular_ref": "NONE (LOCAL TEST HARNESS)",
        "notes": "Simulated mock closure timestamps (e.g. 10:14:30) are test parameters for exercising rejection branches; NOT exchange rules.",
        "verification_status": "UNVERIFIED"
    }
}


@dataclass(frozen=True)
class RandomClosureWindow:
    """Permitted time window during which the exchange system may trigger random closure."""
    window_start: time
    window_end: time
    description: str


@dataclass(frozen=True)
class OrderEntryPermission:
    """
    Evaluation of order-entry permission.
    Distinguishes session classification from order-entry rules.
    """
    is_allowed: bool
    order_type_allowed: str  # "ALL", "LIMIT_ONLY", "NONE"
    is_random_closure_window: bool
    random_closure_window: Optional[RandomClosureWindow]
    reason: str


@dataclass(frozen=True)
class SecuritySessionEvaluation:
    """Security-specific session evaluation result."""
    datetime_ist: datetime
    security_category: SecurityCategory
    session_type: SessionType
    granular_phase: str
    is_continuous_trading: bool
    is_order_entry_allowed: bool
    order_type_allowed: str  # "ALL", "LIMIT_ONLY", "NONE"
    is_random_closure_interval: bool
    random_closure_window: Optional[RandomClosureWindow]
    description: str


# Defined random closure windows for official NSE sessions
RANDOM_CLOSURE_WINDOWS: Dict[str, RandomClosureWindow] = {
    "MUHURAT_PRE_OPEN": RandomClosureWindow(
        window_start=time(14, 13),
        window_end=time(14, 15),
        description="Diwali Muhurat Pre-Open random order entry closure (final 2 mins)"
    ),
    "MUHURAT_CAS": RandomClosureWindow(
        window_start=time(15, 28),
        window_end=time(15, 30),
        description="Diwali Muhurat CAS random order entry closure (final 2 mins)"
    ),
    "REGULAR_PRE_OPEN": RandomClosureWindow(
        window_start=time(9, 7),
        window_end=time(9, 8),
        description="Regular Equity Pre-Open random order entry closure (final 1 min)"
    ),
    "REGULAR_CAS": RandomClosureWindow(
        window_start=time(15, 43),
        window_end=time(15, 45),
        description="Regular Closing Auction Session random closure (final 2 mins)"
    ),
    "MODERN_CAS_REGULAR": RandomClosureWindow(
        window_start=time(15, 28),
        window_end=time(15, 30),
        description="Regular Modern CAS random order entry closure (final 2 mins)"
    ),
    "CAS_V2_REGULAR": RandomClosureWindow(
        window_start=time(15, 38),
        window_end=time(15, 40),
        description="CAS 2.0 Regular random order entry closure window (final 2 mins of order entry 15:38-15:40)"
    ),
    "SPOS_IPO": RandomClosureWindow(
        window_start=time(9, 35),
        window_end=time(9, 45),
        description="Special Pre-Open Session (SPOS) random order entry closure (final 10 mins)"
    ),
}


@dataclass(frozen=True)
class HolidayEvidence:
    """Official exchange record and provenance evidence for an exchange holiday."""
    date: date
    name: str
    day_of_week: str
    is_weekday: bool
    segment: str                    # "EQUITY" (Capital Market)
    circular_ref: str               # e.g., "NSE/CMTR/71775"
    publication_date: str           # "YYYY-MM-DD"
    verification_status: str        # "VERIFIED" or "UNVERIFIED"
    last_verified_date: str         # "YYYY-MM-DD"
    notes: Optional[str] = None


@dataclass(frozen=True)
class SpecialSessionEvidence:
    """Official exchange record and provenance evidence for special market sessions."""
    session_id: str
    segment: str                    # "EQUITY"
    date: date
    session_type: SessionType
    pre_open_start: Optional[time] = None
    pre_open_end: Optional[time] = None
    trading_start: Optional[time] = None
    trading_end: Optional[time] = None
    block_deal_start: Optional[time] = None
    block_deal_end: Optional[time] = None
    closing_auction_start: Optional[time] = None
    closing_auction_end: Optional[time] = None
    post_close_start: Optional[time] = None
    post_close_end: Optional[time] = None
    site: str = "PRIMARY"          # "PRIMARY" or "DR_SITE"
    circular_ref: str = ""
    publication_date: str = ""
    verification_status: str = "VERIFIED"
    last_verified_date: str = "2026-11-17"
    description: str = ""


@dataclass(frozen=True)
class RegulatoryRuleEvidence:
    """Official exchange record and provenance evidence for an exchange or regulatory rule."""
    rule_id: str
    rule_name: str
    circular_ref: str
    circular_date: str
    source_url_or_ref: str
    market_segment: str
    security_category: str
    effective_date: str
    verification_status: str  # "VERIFIED" or "UNVERIFIED"
    implementation_matches: bool
    notes: str


# ============================================================================
# OFFICIAL NSE / SEBI REGULATORY RULES & PROVENANCE EVIDENCE (Phase 7.4.4)
# ============================================================================

REGULATORY_RULES_EVIDENCE_2026: Dict[str, RegulatoryRuleEvidence] = {
    "CAS_ELIGIBLE": RegulatoryRuleEvidence(
        rule_id="CAS_ELIGIBLE",
        rule_name="Closing Auction Session Eligibility Framework",
        circular_ref="CIR/MRD/DP/21/2010",
        circular_date="2010-07-15",
        source_url_or_ref="https://www.sebi.gov.in/legal/circulars/jul-2010/call-auction-in-pre-open-session_1739.html",
        market_segment="CAPITAL_MARKET",
        security_category="CAS_ELIGIBLE",
        effective_date="2010-10-18",
        verification_status="VERIFIED",
        implementation_matches=True,
        notes="Governs call auction mechanics; supplemented by NSE/CMTR/76941 for Diwali Muhurat session specifying CAS continuous trading close at 15:15:00 and auction matching at 15:30:00."
    ),
    "NON_CAS": RegulatoryRuleEvidence(
        rule_id="NON_CAS",
        rule_name="Normal Continuous Market Schedule for Non-CAS Securities",
        circular_ref="NSE/CMTR/13444",
        circular_date="2009-12-16",
        source_url_or_ref="https://www.nseindia.com/resources/exchange-communication-circulars",
        market_segment="CAPITAL_MARKET",
        security_category="NON_CAS",
        effective_date="2010-01-04",
        verification_status="VERIFIED",
        implementation_matches=True,
        notes="Continuous equity market trading until 15:30:00 IST; verified against circular NSE/CMTR/76941 where Non-CAS continuous trading runs uninterrupted until 15:30:00 without early 15:15:00 close."
    ),
    "SPECIAL_PREOPEN_IPO": RegulatoryRuleEvidence(
        rule_id="SPECIAL_PREOPEN_IPO",
        rule_name="Special Pre-Open Session for IPOs and Relisted Securities (SPOS)",
        circular_ref="CIR/MRD/DP/01/2012",
        circular_date="2012-01-20",
        source_url_or_ref="https://www.sebi.gov.in/legal/circulars/jan-2012/call-auction-in-pre-open-session-for-initial-public-offerings-ipos-and-relisted-scrips_22107.html",
        market_segment="CAPITAL_MARKET",
        security_category="SPECIAL_PREOPEN_IPO",
        effective_date="2012-01-20",
        verification_status="VERIFIED",
        implementation_matches=True,
        notes="60-minute duration: 45m order entry (09:00-09:45, random closure 09:35-09:45), 10m order matching (09:45-09:55), 5m buffer (09:55-10:00). Continuous trading commences at 10:00:00 IST."
    ),
    "ILLIQUID_CALL_AUCTION": RegulatoryRuleEvidence(
        rule_id="ILLIQUID_CALL_AUCTION",
        rule_name="Periodic Call Auction for Illiquid Securities (PCAIS)",
        circular_ref="CIR/MRD/DP/6/2013",
        circular_date="2013-01-24",
        source_url_or_ref="https://www.sebi.gov.in/legal/circulars/jan-2013/periodic-call-auction-for-illiquid-scrips_24235.html",
        market_segment="CAPITAL_MARKET",
        security_category="ILLIQUID_CALL_AUCTION",
        effective_date="2013-04-08",
        verification_status="VERIFIED",
        implementation_matches=True,
        notes="Re-structured per CIR/MRD/DP/38/2013 (2013-12-19). 6 one-hour cycles (09:30-15:30 IST): 45m order entry (random stop in 45th minute, e.g. 10:14-10:15), 8m matching, 7m buffer. Zero continuous trading."
    ),
    "BLOCK_DEAL": RegulatoryRuleEvidence(
        rule_id="BLOCK_DEAL",
        rule_name="Block Deal Trading Window Framework",
        circular_ref="SEBI/HO/MRD/DOS2/CIR/P/2017/110",
        circular_date="2017-10-26",
        source_url_or_ref="https://www.sebi.gov.in/legal/circulars/oct-2017/revision-of-the-framework-for-block-deal-window_36357.html",
        market_segment="CAPITAL_MARKET",
        security_category="ALL",
        effective_date="2018-01-01",
        verification_status="VERIFIED",
        implementation_matches=True,
        notes="Establishes morning (08:45-09:00) and afternoon (14:05-14:20) windows; on Muhurat 2026, NSE circular NSE/CMTR/76941 designates 13:50:00 to 14:05:00 as the dedicated block deal window."
    ),
    "MUHURAT_SESSION": RegulatoryRuleEvidence(
        rule_id="MUHURAT_SESSION",
        rule_name="Diwali Muhurat Trading Session Framework (Samvat 2083)",
        circular_ref="NSE/CMTR/76941",
        circular_date="2026-10-19",
        source_url_or_ref="NSE Circular Ref: 149/2026 (Circulars Archive / Member Service Portal)",
        market_segment="CAPITAL_MARKET",
        security_category="ALL",
        effective_date="2026-11-08",
        verification_status="VERIFIED",
        implementation_matches=True,
        notes="Official schedule for Diwali Laxmi Pujan 2026: Block Deal 13:50-14:05, Pre-Open 14:05-14:20, Continuous Trading 14:20-15:30 (CAS closes 15:15), CAS 15:20-15:35, Closing Session 15:50-16:00."
    ),
    "POST_CLOSE": RegulatoryRuleEvidence(
        rule_id="POST_CLOSE",
        rule_name="Closing Session / Post-Close Trading Window",
        circular_ref="NSE/CMTR/13444",
        circular_date="2009-12-16",
        source_url_or_ref="https://www.nseindia.com/resources/exchange-communication-circulars",
        market_segment="CAPITAL_MARKET",
        security_category="ALL",
        effective_date="2010-01-04",
        verification_status="VERIFIED",
        implementation_matches=True,
        notes="Legacy regular trading days (prior to 2026-08-03): 15:40:00 to 16:00:00 IST per NSE/CMTR/13444. Modern CAS (effective 2026-08-03 per SEBI HO/47/11/11(3)2025-MRD-POD2/I/2765/2026, NSE/CMTR/73362, NSE/CMTR/74466, NSE/CMTR/76941): 15:50:00 to 16:00:00 IST. Orders accepted only as LIMIT orders and matched strictly at the determined closing price."
    ),
    "UNVERIFIED_SATURDAY_DR": RegulatoryRuleEvidence(
        rule_id="UNVERIFIED_SATURDAY_DR",
        rule_name="Purported Saturday Disaster Recovery Live Trading Session",
        circular_ref="NONE",
        circular_date="NONE",
        source_url_or_ref="UNVERIFIED",
        market_segment="CAPITAL_MARKET",
        security_category="ALL",
        effective_date="2026-03-07",
        verification_status="UNVERIFIED",
        implementation_matches=False,
        notes="Circular NSE/MSD/73126 restricts DR live trading to 2026-03-05 and 2026-03-06. Saturday 2026-03-07 is strictly a closed weekend with zero trading."
    ),
    "UNVERIFIED_EVENING_MUHURAT": RegulatoryRuleEvidence(
        rule_id="UNVERIFIED_EVENING_MUHURAT",
        rule_name="Purported 18:15-19:15 Evening Muhurat Session",
        circular_ref="NONE",
        circular_date="NONE",
        source_url_or_ref="UNVERIFIED",
        market_segment="CAPITAL_MARKET",
        security_category="ALL",
        effective_date="2026-11-08",
        verification_status="UNVERIFIED",
        implementation_matches=False,
        notes="Circular NSE/CMTR/76941 refutes obsolete 18:15-19:15 timing and defines afternoon session: Block Deal 13:50-14:05, Continuous 14:20-15:30."
    ),
    "UNVERIFIED_MODERN_1540_CLOSING_SESSION": RegulatoryRuleEvidence(
        rule_id="UNVERIFIED_MODERN_1540_CLOSING_SESSION",
        rule_name="Purported 15:40 Closing Session Start under Modern CAS",
        circular_ref="NONE",
        circular_date="NONE",
        source_url_or_ref="UNVERIFIED",
        market_segment="CAPITAL_MARKET",
        security_category="ALL",
        effective_date="2026-08-03",
        verification_status="UNVERIFIED",
        implementation_matches=False,
        notes="Under Modern CAS (effective 2026-08-03 per NSE/CMTR/73362, 74466, 76941), 15:40:00 falls strictly inside the mandatory TRANSITION_PERIOD (15:35-15:50). The official modern closing session starts at 15:50:00. Any claim that 15:40 is the closing session start on modern CAS dates is UNVERIFIED."
    ),
    "CAS_V2_SCHEDULE": RegulatoryRuleEvidence(
        rule_id="CAS_V2_SCHEDULE",
        rule_name="NSE Call Auction at Close (CAS) 2.0 Schedule",
        circular_ref="NSE/CMTR/77355",
        circular_date="2026-11-06",
        source_url_or_ref="https://www.nseindia.com/resources/exchange-communication-circulars",
        market_segment="CAPITAL_MARKET",
        security_category="ALL",
        effective_date="2026-12-07",
        verification_status="VERIFIED",
        implementation_matches=True,
        notes="SEBI circular HO/47/11/11(3)2025-MRD-POD2/I/23843/2026 dated 2026-10-15 and NSE circular NSE/CMTR/77355 dated 2026-11-06 establishing CAS 2.0 effective 2026-12-07: Transition 15:30-15:31, Order Entry 15:31-15:36 (Market & Limit), Limit-only Entry 15:36-15:40 with random closure 15:38-15:40, Order Matching 15:40-15:45, Transition Buffer 15:45-15:50, Post-Close 15:50-16:00."
    ),
}

# Alias for cross-language registry parity
SESSION_RULES_REGISTRY = REGULATORY_RULES_EVIDENCE_2026

CLOSING_SESSION_RECONCILIATION_EVIDENCE_2026: Dict[str, Any] = {
    "CAS_V2_REGIME": {
        "regulatory_circulars": [
            "SEBI/HO/47/11/11(3)2025-MRD-POD2/I/23843/2026",
            "NSE/CMTR/77355",
            "NSE_CAS2_FAQ_20261106"
        ],
        "effective_from": "2026-12-07",
        "effective_to": None,
        "effective_date": "2026-12-07",
        "market_segment": "CAPITAL_MARKET",
        "continuous_trading_end": "15:30:00",
        "reference_transition": "15:30:00 - 15:31:00",
        "closing_auction_entry": "15:31:00 - 15:36:00",
        "closing_auction_limit_only": "15:36:00 - 15:40:00",
        "random_closure_window": "15:38:00 - 15:40:00",
        "closing_auction_matching": "15:40:00 - 15:45:00",
        "transition_period": "15:45:00 - 15:50:00",
        "closing_session": "15:50:00 - 16:00:00",
        "market_closed": "16:00:00",
        "verification_status": "VERIFIED",
        "reconciliation_summary": (
            "CAS 2.0 framework effective 2026-12-07 introduces streamlined 1-minute reference transition "
            "(15:30-15:31), order entry (15:31-15:40) with random closure (15:38-15:40), order matching "
            "(15:40-15:45), transition buffer (15:45-15:50), and closing session (15:50-16:00). "
            "At 15:40:00, CAS 2.0 enters CLOSING_AUCTION_MATCHING."
        )
    },
    "MODERN_CAS_REGIME": {
        "regulatory_circulars": [
            "SEBI/HO/47/11/11(3)2025-MRD-POD2/I/2765/2026",
            "NSE/CMTR/73362",
            "NSE/CMTR/74466",
            "NSE/CMTR/76941"
        ],
        "effective_from": "2026-08-03",
        "effective_to": "2026-12-06",
        "effective_date": "2026-08-03",
        "market_segment": "CAPITAL_MARKET",
        "continuous_trading_end": "15:30:00",
        "closing_auction_entry": "15:20:00 - 15:30:00",
        "closing_auction_matching": "15:30:00 - 15:35:00",
        "transition_period": "15:35:00 - 15:50:00",
        "closing_session": "15:50:00 - 16:00:00",
        "market_closed": "16:00:00",
        "verification_status": "VERIFIED",
        "reconciliation_summary": (
            "Modern CAS architecture introduces 5-minute auction matching (15:30-15:35) "
            "and 15-minute transition/reconciliation buffer (15:35-15:50), shifting closing session "
            "opening from legacy 15:40 to 15:50:00 IST. The timestamp 15:40:00 falls inside the "
            "TRANSITION_PERIOD where order entry is strictly prohibited."
        )
    },
    "CAS_V1_REGIME": {
        "regulatory_circulars": [
            "SEBI/HO/47/11/11(3)2025-MRD-POD2/I/2765/2026",
            "NSE/CMTR/73362",
            "NSE/CMTR/74466",
            "NSE/CMTR/76941"
        ],
        "effective_from": "2026-08-03",
        "effective_to": "2026-12-06",
        "effective_date": "2026-08-03",
        "market_segment": "CAPITAL_MARKET",
        "continuous_trading_end": "15:30:00",
        "closing_auction_entry": "15:20:00 - 15:30:00",
        "closing_auction_matching": "15:30:00 - 15:35:00",
        "transition_period": "15:35:00 - 15:50:00",
        "closing_session": "15:50:00 - 16:00:00",
        "market_closed": "16:00:00",
        "verification_status": "VERIFIED",
        "reconciliation_summary": (
            "Modern CAS architecture introduces 5-minute auction matching (15:30-15:35) "
            "and 15-minute transition/reconciliation buffer (15:35-15:50), shifting closing session "
            "opening from legacy 15:40 to 15:50:00 IST. The timestamp 15:40:00 falls inside the "
            "TRANSITION_PERIOD where order entry is strictly prohibited."
        )
    },
    "LEGACY_PRE_CAS_REGIME": {
        "regulatory_circulars": [
            "NSE/CMTR/13444"
        ],
        "publication_date": "2009-12-16",
        "effective_from": "2010-01-04",
        "effective_to": "2026-08-02",
        "effective_date": "2010-01-04",
        "sunset_date": "2026-08-02",
        "market_segment": "CAPITAL_MARKET",
        "continuous_trading_end": "15:30:00",
        "buffer_period": "15:30:00 - 15:40:00",
        "closing_session": "15:40:00 - 16:00:00",
        "market_closed": "16:00:00",
        "verification_status": "VERIFIED",
        "reconciliation_summary": (
            "Historical pre-CAS schedule established in 2010 under NSE/CMTR/13444 with 10-minute "
            "VWAP buffer (15:30-15:40) followed by post-close session (15:40-16:00)."
        )
    },
    "CONFLICT_RESOLUTION_1540_VS_1550": {
        "status": "RESOLVED_DATE_AND_REGIME_DEPENDENT",
        "legacy_1540_status": "SUPERSEDED_BY_MODERN_CAS",
        "modern_1540_as_closing_session_status": "UNVERIFIED",
        "verified_modern_closing_session_start": "15:50:00",
        "resolution_finding": (
            "The 15:40 start time applies exclusively to the LEGACY_PRE_CAS regime (dates prior to "
            "2026-08-03). Under MODERN_CAS_2026 (dates on or after 2026-08-03, including Muhurat "
            "2026-11-08), 15:40 is strictly inside TRANSITION_PERIOD. Modern closing session starts at 15:50."
        )
    }
}


# ============================================================================
# OFFICIAL 2026 NSE EQUITY HOLIDAY RECORDS (16 Weekday Holidays + 4 Weekend)
# ============================================================================

# 1. Official Weekday Trading Holidays (16 Weekday Closures)
WEEKDAY_HOLIDAYS_EVIDENCE_2026: List[HolidayEvidence] = [
    HolidayEvidence(
        date=date(2026, 1, 15),
        name="Municipal Corporation Election - Maharashtra",
        day_of_week="Thursday",
        is_weekday=True,
        segment="EQUITY",
        circular_ref="NSE/CMTR/72260",
        publication_date="2026-01-12",
        verification_status="VERIFIED",
        last_verified_date="2026-11-17",
        notes="Official amendment circular NSE/CMTR/72260 (Ref: 05/2026) declaring full trading holiday; also notified under NSE/CMTR/72890"
    ),
    HolidayEvidence(
        date=date(2026, 1, 26),
        name="Republic Day",
        day_of_week="Monday",
        is_weekday=True,
        segment="EQUITY",
        circular_ref="NSE/CMTR/71775",
        publication_date="2025-12-12",
        verification_status="VERIFIED",
        last_verified_date="2026-11-17"
    ),
    HolidayEvidence(
        date=date(2026, 3, 3),
        name="Holi",
        day_of_week="Tuesday",
        is_weekday=True,
        segment="EQUITY",
        circular_ref="NSE/CMTR/71775",
        publication_date="2025-12-12",
        verification_status="VERIFIED",
        last_verified_date="2026-11-17"
    ),
    HolidayEvidence(
        date=date(2026, 3, 26),
        name="Shri Ram Navami",
        day_of_week="Thursday",
        is_weekday=True,
        segment="EQUITY",
        circular_ref="NSE/CMTR/71775",
        publication_date="2025-12-12",
        verification_status="VERIFIED",
        last_verified_date="2026-11-17"
    ),
    HolidayEvidence(
        date=date(2026, 3, 31),
        name="Shri Mahavir Jayanti",
        day_of_week="Tuesday",
        is_weekday=True,
        segment="EQUITY",
        circular_ref="NSE/CMTR/71775",
        publication_date="2025-12-12",
        verification_status="VERIFIED",
        last_verified_date="2026-11-17"
    ),
    HolidayEvidence(
        date=date(2026, 4, 3),
        name="Good Friday",
        day_of_week="Friday",
        is_weekday=True,
        segment="EQUITY",
        circular_ref="NSE/CMTR/71775",
        publication_date="2025-12-12",
        verification_status="VERIFIED",
        last_verified_date="2026-11-17"
    ),
    HolidayEvidence(
        date=date(2026, 4, 14),
        name="Dr. Baba Saheb Ambedkar Jayanti",
        day_of_week="Tuesday",
        is_weekday=True,
        segment="EQUITY",
        circular_ref="NSE/CMTR/71775",
        publication_date="2025-12-12",
        verification_status="VERIFIED",
        last_verified_date="2026-11-17"
    ),
    HolidayEvidence(
        date=date(2026, 5, 1),
        name="Maharashtra Day",
        day_of_week="Friday",
        is_weekday=True,
        segment="EQUITY",
        circular_ref="NSE/CMTR/71775",
        publication_date="2025-12-12",
        verification_status="VERIFIED",
        last_verified_date="2026-11-17"
    ),
    HolidayEvidence(
        date=date(2026, 5, 28),
        name="Bakri Id",
        day_of_week="Thursday",
        is_weekday=True,
        segment="EQUITY",
        circular_ref="NSE/CMTR/71775",
        publication_date="2025-12-12",
        verification_status="VERIFIED",
        last_verified_date="2026-11-17"
    ),
    HolidayEvidence(
        date=date(2026, 6, 26),
        name="Muharram",
        day_of_week="Friday",
        is_weekday=True,
        segment="EQUITY",
        circular_ref="NSE/CMTR/71775",
        publication_date="2025-12-12",
        verification_status="VERIFIED",
        last_verified_date="2026-11-17"
    ),
    HolidayEvidence(
        date=date(2026, 9, 14),
        name="Ganesh Chaturthi",
        day_of_week="Monday",
        is_weekday=True,
        segment="EQUITY",
        circular_ref="NSE/CMTR/71775",
        publication_date="2025-12-12",
        verification_status="VERIFIED",
        last_verified_date="2026-11-17"
    ),
    HolidayEvidence(
        date=date(2026, 10, 2),
        name="Mahatma Gandhi Jayanti",
        day_of_week="Friday",
        is_weekday=True,
        segment="EQUITY",
        circular_ref="NSE/CMTR/71775",
        publication_date="2025-12-12",
        verification_status="VERIFIED",
        last_verified_date="2026-11-17"
    ),
    HolidayEvidence(
        date=date(2026, 10, 20),
        name="Dussehra",
        day_of_week="Tuesday",
        is_weekday=True,
        segment="EQUITY",
        circular_ref="NSE/CMTR/71775",
        publication_date="2025-12-12",
        verification_status="VERIFIED",
        last_verified_date="2026-11-17"
    ),
    HolidayEvidence(
        date=date(2026, 11, 10),
        name="Diwali-Balipratipada",
        day_of_week="Tuesday",
        is_weekday=True,
        segment="EQUITY",
        circular_ref="NSE/CMTR/71775",
        publication_date="2025-12-12",
        verification_status="VERIFIED",
        last_verified_date="2026-11-17"
    ),
    HolidayEvidence(
        date=date(2026, 11, 24),
        name="Prakash Gurpurb Sri Guru Nanak Dev",
        day_of_week="Tuesday",
        is_weekday=True,
        segment="EQUITY",
        circular_ref="NSE/CMTR/71775",
        publication_date="2025-12-12",
        verification_status="VERIFIED",
        last_verified_date="2026-11-17"
    ),
    HolidayEvidence(
        date=date(2026, 12, 25),
        name="Christmas",
        day_of_week="Friday",
        is_weekday=True,
        segment="EQUITY",
        circular_ref="NSE/CMTR/71775",
        publication_date="2025-12-12",
        verification_status="VERIFIED",
        last_verified_date="2026-11-17"
    ),
]

# 2. Official Weekend Holidays (4 Weekend Days — tracked separately, not counted as weekday closures)
WEEKEND_HOLIDAYS_EVIDENCE_2026: List[HolidayEvidence] = [
    HolidayEvidence(
        date=date(2026, 2, 15),
        name="Mahashivratri",
        day_of_week="Sunday",
        is_weekday=False,
        segment="EQUITY",
        circular_ref="NSE/CMTR/71775",
        publication_date="2025-12-12",
        verification_status="VERIFIED",
        last_verified_date="2026-11-17",
        notes="Falls on Sunday; regular weekend closure"
    ),
    HolidayEvidence(
        date=date(2026, 3, 21),
        name="Id-Ul-Fitr (Ramadan Eid)",
        day_of_week="Saturday",
        is_weekday=False,
        segment="EQUITY",
        circular_ref="NSE/CMTR/71775",
        publication_date="2025-12-12",
        verification_status="VERIFIED",
        last_verified_date="2026-11-17",
        notes="Falls on Saturday; regular weekend closure"
    ),
    HolidayEvidence(
        date=date(2026, 8, 15),
        name="Independence Day",
        day_of_week="Saturday",
        is_weekday=False,
        segment="EQUITY",
        circular_ref="NSE/CMTR/71775",
        publication_date="2025-12-12",
        verification_status="VERIFIED",
        last_verified_date="2026-11-17",
        notes="Falls on Saturday; national holiday coinciding with weekend"
    ),
    HolidayEvidence(
        date=date(2026, 11, 8),
        name="Diwali Laxmi Pujan",
        day_of_week="Sunday",
        is_weekday=False,
        segment="EQUITY",
        circular_ref="NSE/CMTR/71775",
        publication_date="2025-12-12",
        verification_status="VERIFIED",
        last_verified_date="2026-11-17",
        notes="Falls on Sunday; daytime closed; special Muhurat trading session held"
    ),
]

# Mappings for fast lookup
WEEKDAY_HOLIDAYS_MAP_2026: Dict[date, HolidayEvidence] = {
    h.date: h for h in WEEKDAY_HOLIDAYS_EVIDENCE_2026
}

WEEKEND_HOLIDAYS_MAP_2026: Dict[date, HolidayEvidence] = {
    h.date: h for h in WEEKEND_HOLIDAYS_EVIDENCE_2026
}

ALL_HOLIDAYS_MAP_2026: Dict[date, HolidayEvidence] = {
    **WEEKDAY_HOLIDAYS_MAP_2026,
    **WEEKEND_HOLIDAYS_MAP_2026
}

# Backward-compatible dictionary for existing callers (maps 16 weekday holidays to names)
TRADING_HOLIDAYS_2026: Dict[date, str] = {
    h.date: h.name for h in WEEKDAY_HOLIDAYS_EVIDENCE_2026
}


# ============================================================================
# SPECIAL SESSIONS EVIDENCE (Diwali Muhurat & Disaster Recovery)
# ============================================================================

# Official Diwali Muhurat Trading Session (Sunday, 8 November 2026)
# Evidence Reference: NSE Circular NSE/CMTR/76941 (Download Ref: 149/2026, Date: 2026-10-19)
MUHURAT_SESSION_2026 = {
    "date": date(2026, 11, 8),
    "segment": "EQUITY",
    "block_deal_start": time(13, 50),   # 13:50 IST (Block deal window per NSE/CMTR/76941)
    "block_deal_end": time(14, 5),      # 14:05 IST
    "pre_open_start": time(14, 5),      # 14:05 IST
    "pre_open_limit_start": time(14, 10), # 14:10 IST (Limit orders only)
    "pre_open_match_start": time(14, 15), # 14:15 IST
    "pre_open_buffer_start": time(14, 17), # 14:17 IST
    "pre_open_end": time(14, 20),       # 14:20 IST (order entry, matching & buffer)
    "trading_start": time(14, 20),      # 14:20 IST (Continuous Trading Session open)
    "trading_end": time(15, 30),        # 15:30 IST (Normal Market close for Non-CAS; CAS closes at 15:15)
    "cas_continuous_end": time(15, 15), # 15:15 IST (Continuous Trading closes for CAS securities)
    "cas_transition_start": time(15, 15),
    "cas_transition_end": time(15, 20),
    "closing_auction_start": time(15, 20), # 15:20 IST (CAS order entry)
    "cas_limit_only_start": time(15, 25), # 15:25 IST (CAS limit orders only)
    "cas_limit_only_end": time(15, 30),
    "closing_auction_end": time(15, 35),   # 15:35 IST
    "cas_buffer_start": time(15, 35),
    "cas_buffer_end": time(15, 50),
    "post_close_start": time(15, 50),   # 15:50 IST
    "post_close_end": time(16, 0),      # 16:00 IST
    "circular_ref": "NSE/CMTR/76941",
    "publication_date": "2026-10-19",
    "verification_status": "VERIFIED",
    "last_verified_date": "2026-11-17",
    "description": "Diwali Muhurat Trading Session for Samvat 2083"
}

# Official Disaster Recovery (DR) Site Live Trading Sessions
# Evidence Reference: NSE Circular NSE/MSD/73126 (Circular Ref: 11/2026, Date: 2026-03-05)
# Schedule:
# - Thursday 2026-03-05: Live trading from DR Site during regular market hours (09:15 to 15:30 IST)
# - Friday 2026-03-06: Live trading from DR Site during regular market hours (09:15 to 15:30 IST)
# - Saturday 2026-03-07: Regular weekend closure (CLOSED) - NO trading session held
# - Monday 2026-03-09: Live trading resumed from Primary site during regular market hours (09:15 to 15:30 IST)
DR_SESSIONS_2026: List[Dict[str, Any]] = [
    {
        "session_id": "DR-2026-03-05",
        "date": date(2026, 3, 5),
        "segment": "EQUITY",
        "site": "DR_SITE",
        "trading_start": time(9, 15),
        "trading_end": time(15, 30),
        "circular_ref": "NSE/MSD/73126",
        "publication_date": "2026-03-05",
        "verification_status": "VERIFIED",
        "last_verified_date": "2026-11-17",
        "description": "Live Trading Session from Disaster Recovery (DR) Site - Day 1"
    },
    {
        "session_id": "DR-2026-03-06",
        "date": date(2026, 3, 6),
        "segment": "EQUITY",
        "site": "DR_SITE",
        "trading_start": time(9, 15),
        "trading_end": time(15, 30),
        "circular_ref": "NSE/MSD/73126",
        "publication_date": "2026-03-05",
        "verification_status": "VERIFIED",
        "last_verified_date": "2026-11-17",
        "description": "Live Trading Session from Disaster Recovery (DR) Site - Day 2"
    },
    {
        "session_id": "PRIMARY-2026-03-09",
        "date": date(2026, 3, 9),
        "segment": "EQUITY",
        "site": "PRIMARY",
        "trading_start": time(9, 15),
        "trading_end": time(15, 30),
        "circular_ref": "NSE/MSD/73126",
        "publication_date": "2026-03-05",
        "verification_status": "VERIFIED",
        "last_verified_date": "2026-11-17",
        "description": "Live Trading Resumed from Primary Site"
    }
]

SPECIAL_SESSIONS_EVIDENCE_2026: Dict[str, SpecialSessionEvidence] = {
    "2026-11-08": SpecialSessionEvidence(
        session_id="MUHURAT-2026-11-08",
        date=date(2026, 11, 8),
        session_type=SessionType.SPECIAL_MUHURAT,
        segment="EQUITY",
        block_deal_start=time(13, 50),
        block_deal_end=time(14, 5),
        trading_start=time(14, 20),
        trading_end=time(15, 30),
        pre_open_start=time(14, 5),
        pre_open_end=time(14, 20),
        post_close_start=time(15, 50),
        post_close_end=time(16, 0),
        circular_ref="NSE/CMTR/76941",
        publication_date="2026-10-19",
        verification_status="VERIFIED",
        last_verified_date="2026-11-17",
        description="Diwali Muhurat Trading Session for Samvat 2083"
    ),
    "2026-03-05": SpecialSessionEvidence(
        session_id="DR-2026-03-05",
        date=date(2026, 3, 5),
        session_type=SessionType.SPECIAL_DR,
        segment="EQUITY",
        site="DR_SITE",
        trading_start=time(9, 15),
        trading_end=time(15, 30),
        circular_ref="NSE/MSD/73126",
        publication_date="2026-03-05",
        verification_status="VERIFIED",
        last_verified_date="2026-11-17",
        description="Live Trading Session from Disaster Recovery (DR) Site - Day 1"
    ),
    "2026-03-06": SpecialSessionEvidence(
        session_id="DR-2026-03-06",
        date=date(2026, 3, 6),
        session_type=SessionType.SPECIAL_DR,
        segment="EQUITY",
        site="DR_SITE",
        trading_start=time(9, 15),
        trading_end=time(15, 30),
        circular_ref="NSE/MSD/73126",
        publication_date="2026-03-05",
        verification_status="VERIFIED",
        last_verified_date="2026-11-17",
        description="Live Trading Session from Disaster Recovery (DR) Site - Day 2"
    ),
}

# Alias for cross-language registry parity
SESSION_RULES_REGISTRY = REGULATORY_RULES_EVIDENCE_2026

# ============================================================================
# CLEARING & SETTLEMENT HOLIDAYS (Where Capital Market Trades Normally)
# ============================================================================

# Official Clearing & Settlement Holidays that are NORMAL TRADING DAYS for Capital Market
# Note: On these dates, the stock market is fully open (09:15-15:30 IST),
# but bank/clearing operations are closed (pay-in and pay-out deferred to T+1).
CLEARING_ONLY_HOLIDAYS_EVIDENCE_2026: List[HolidayEvidence] = [
    HolidayEvidence(
        date=date(2026, 2, 19),
        name="Chhatrapati Shivaji Maharaj Jayanti",
        day_of_week="Thursday",
        is_weekday=True,
        segment="CLEARING_SETTLEMENT",
        circular_ref="NSE/CPLY/CLEARING/2026",
        publication_date="2025-12-15",
        verification_status="VERIFIED",
        last_verified_date="2026-11-17",
        notes="Clearing & Settlement holiday; Capital Market is OPEN for normal trading (09:15-15:30 IST)"
    ),
    HolidayEvidence(
        date=date(2026, 3, 19),
        name="Gudhi Padwa",
        day_of_week="Thursday",
        is_weekday=True,
        segment="CLEARING_SETTLEMENT",
        circular_ref="NSE/CPLY/CLEARING/2026",
        publication_date="2025-12-15",
        verification_status="VERIFIED",
        last_verified_date="2026-11-17",
        notes="Clearing & Settlement holiday; Capital Market is OPEN for normal trading (09:15-15:30 IST)"
    ),
    HolidayEvidence(
        date=date(2026, 4, 1),
        name="Annual Bank Closing",
        day_of_week="Wednesday",
        is_weekday=True,
        segment="CLEARING_SETTLEMENT",
        circular_ref="RBI/2025-26/BANK-HOLIDAYS",
        publication_date="2025-12-15",
        verification_status="VERIFIED",
        last_verified_date="2026-11-17",
        notes="Annual bank accounts closing under NI Act; Capital Market is OPEN for normal trading (09:15-15:30 IST)"
    ),
    HolidayEvidence(
        date=date(2026, 8, 26),
        name="Id-E-Milad",
        day_of_week="Wednesday",
        is_weekday=True,
        segment="CLEARING_SETTLEMENT",
        circular_ref="NSE/CPLY/CLEARING/2026",
        publication_date="2025-12-15",
        verification_status="VERIFIED",
        last_verified_date="2026-11-17",
        notes="Clearing & Settlement holiday; Capital Market is OPEN for normal trading (09:15-15:30 IST)"
    ),
]

CLEARING_ONLY_HOLIDAYS_MAP_2026: Dict[date, HolidayEvidence] = {
    h.date: h for h in CLEARING_ONLY_HOLIDAYS_EVIDENCE_2026
}

# Complete clearing calendar includes trading holidays + clearing-only holidays
CLEARING_HOLIDAYS_MAP_2026: Dict[date, HolidayEvidence] = {
    **WEEKDAY_HOLIDAYS_MAP_2026,
    **CLEARING_ONLY_HOLIDAYS_MAP_2026
}

# Unverified segment schedules (marked UNVERIFIED in accordance with Phase 7.4.2 requirements)
UNVERIFIED_SEGMENT_HOLIDAYS_2026: List[HolidayEvidence] = [
    HolidayEvidence(
        date=date(2026, 9, 30),
        name="Quarter-End Forex Reconciliation",
        day_of_week="Wednesday",
        is_weekday=True,
        segment="CURRENCY_DERIVATIVES",
        circular_ref="RBI/FOREX/UNVERIFIED",
        publication_date="2026-01-01",
        verification_status="UNVERIFIED",
        last_verified_date="2026-11-17",
        notes="Tentative forex bank reconciliation; requires official RBI circular before promotion"
    )
]


# ============================================================================
# FIXTURE PROVENANCE REGISTRY (Strict Synthetic vs Genuine Classification)
# ============================================================================

@dataclass(frozen=True)
class FixtureProvenanceRecord:
    """Explicit metadata and provenance record for historical/synthetic dataset fixtures."""
    filename: str
    provenance: str             # "SYNTHETIC"
    expected_bar_count: int
    expected_sha256: str
    coverage_type: str          # "FULL" or "PARTIAL"
    coverage_description: str
    timeframe: str              # "1m"
    date_range: str
    instrument: str


FIXTURE_REGISTRY_2026: Dict[str, FixtureProvenanceRecord] = {
    "sample_nifty50_1m.csv": FixtureProvenanceRecord(
        filename="sample_nifty50_1m.csv",
        provenance="SYNTHETIC",
        expected_bar_count=375,
        expected_sha256="a785f1af9aecfc1f69a15536350e3adf9232d81a141bd8592c2091b7f85c3280",
        coverage_type="FULL",
        coverage_description="Complete single trading day regular equity session (09:15 to 15:29 IST, 375 bars)",
        timeframe="1m",
        date_range="2026-02-18",
        instrument="NIFTY50"
    ),
    "multiday_overnight_1m.csv": FixtureProvenanceRecord(
        filename="multiday_overnight_1m.csv",
        provenance="SYNTHETIC",
        expected_bar_count=750,
        expected_sha256="b96ec03a8018976dedf3890c1bedd52fe66033ed82d06fc05ad9966c438b244f",
        coverage_type="FULL",
        coverage_description="Complete two consecutive trading days (2026-02-18 and 2026-02-19, 375 bars each, 1 overnight gap)",
        timeframe="1m",
        date_range="2026-02-18 to 2026-02-19",
        instrument="NIFTY50"
    ),
    "corrupted_anomalies_1m.csv": FixtureProvenanceRecord(
        filename="corrupted_anomalies_1m.csv",
        provenance="SYNTHETIC",
        expected_bar_count=100,
        expected_sha256="5f3eb779a1aae1e52e515816e8cb0be82d8564189a03e076a2e0463127dbb1c8",
        coverage_type="PARTIAL",
        coverage_description="Partial session (100 bars) with deliberately injected synthetic defects: 3 duplicates, 11 missing bars, 1 unadjusted split, 1 pre-market bar",
        timeframe="1m",
        date_range="2026-02-18",
        instrument="NIFTY50"
    ),
    "special_sessions_1m.csv": FixtureProvenanceRecord(
        filename="special_sessions_1m.csv",
        provenance="SYNTHETIC",
        expected_bar_count=115,
        expected_sha256="a5fbf77cc061a7b2bffb785281f442e68985aacecd42eff87e58e71b2c8b1f79",
        coverage_type="PARTIAL",
        coverage_description="Partial multi-session synthetic fixture: 45 bars DR session (2026-03-05 09:15-09:59 IST, partial 12% of 375-bar session) + 70 bars Muhurat session (2026-11-08 14:20-15:29 IST, full 100% of continuous trading)",
        timeframe="1m",
        date_range="2026-03-05 to 2026-11-08",
        instrument="NIFTY50"
    ),
}

# Alias for cross-language registry parity
SESSION_RULES_REGISTRY = REGULATORY_RULES_EVIDENCE_2026


# ============================================================================
# NSE CALENDAR ENGINE
# ============================================================================

class NseCalendar:
    """Versioned, evidence-based exchange calendar for market validation and session checking."""

    VERSION = NSE_CALENDAR_VERSION

    @staticmethod
    def to_ist(dt: datetime) -> datetime:
        """Convert any timezone-aware datetime to IST (+05:30)."""
        if dt.tzinfo is None:
            return dt.replace(tzinfo=IST)
        return dt.astimezone(IST)

    @classmethod
    def get_weekday_holidays(cls, year: int = 2026) -> List[date]:
        """Return list of verified weekday trading holiday dates for the given year (16 for 2026)."""
        if year == 2026:
            return sorted(list(WEEKDAY_HOLIDAYS_MAP_2026.keys()))
        return []

    @classmethod
    def get_weekend_holidays(cls, year: int = 2026) -> List[date]:
        """Return list of holidays falling on weekends (4 for 2026)."""
        if year == 2026:
            return sorted(list(WEEKEND_HOLIDAYS_MAP_2026.keys()))
        return []

    @classmethod
    def get_holidays_for_year(cls, year: int) -> List[date]:
        """Return list of official weekday trading holiday dates for the given year (16 for 2026)."""
        return cls.get_weekday_holidays(year)

    @classmethod
    def get_all_holiday_evidence(cls, year: int = 2026) -> List[HolidayEvidence]:
        """Return complete evidence records for all holidays (both weekday and weekend)."""
        if year == 2026:
            return sorted(list(ALL_HOLIDAYS_MAP_2026.values()), key=lambda x: x.date)
        return []

    @classmethod
    def is_holiday(cls, check_date: date) -> bool:
        """Return True if date is an official weekday trading holiday."""
        return check_date in WEEKDAY_HOLIDAYS_MAP_2026

    @classmethod
    def is_weekend_holiday(cls, check_date: date) -> bool:
        """Return True if date is a festival/holiday falling on a weekend."""
        return check_date in WEEKEND_HOLIDAYS_MAP_2026

    @classmethod
    def get_holiday_name(cls, check_date: date) -> Optional[str]:
        """Return holiday name or None if regular trading day."""
        record = ALL_HOLIDAYS_MAP_2026.get(check_date)
        return record.name if record else None

    @classmethod
    def get_holiday_evidence(cls, check_date: date) -> Optional[HolidayEvidence]:
        """Return verified provenance evidence for a holiday date."""
        return ALL_HOLIDAYS_MAP_2026.get(check_date)

    @classmethod
    def get_regulatory_rule_evidence(cls, rule_id: str) -> Optional[RegulatoryRuleEvidence]:
        """Return verified regulatory evidence for a specified market rule."""
        if not rule_id or not isinstance(rule_id, str):
            return None
        return REGULATORY_RULES_EVIDENCE_2026.get(rule_id.strip().upper())

    @classmethod
    def get_all_regulatory_rules(cls) -> Dict[str, RegulatoryRuleEvidence]:
        """Return all registered regulatory rules and evidence."""
        return dict(REGULATORY_RULES_EVIDENCE_2026)

    @classmethod
    def is_muhurat_block_deal(cls, dt_ist: datetime) -> bool:
        """Check if datetime falls within the 2026 Muhurat block deal window (13:50 to 14:05 IST)."""
        d = dt_ist.date()
        t = dt_ist.time()
        if d == MUHURAT_SESSION_2026["date"]:
            if MUHURAT_SESSION_2026["block_deal_start"] <= t < MUHURAT_SESSION_2026["block_deal_end"]:
                return True
        return False

    @classmethod
    def is_muhurat_session(
        cls,
        dt_ist: datetime,
        security_category: Optional[SecurityCategory | str] = None
    ) -> bool:
        """
        Check if datetime falls within the official 2026 Muhurat continuous trading window.
        Governed by NSE Circular NSE/CMTR/76941:
        - For CAS securities: 14:20 to 15:15 IST.
        - For Non-CAS securities (and default): 14:20 to 15:30 IST.
        """
        d = dt_ist.date()
        t = dt_ist.time()
        if d == MUHURAT_SESSION_2026["date"]:
            if security_category is not None:
                cat = cls.validate_security_category(security_category)
                if cat == SecurityCategory.CAS_ELIGIBLE:
                    return MUHURAT_SESSION_2026["trading_start"] <= t < MUHURAT_SESSION_2026["cas_continuous_end"]
                elif cat == SecurityCategory.NON_CAS:
                    return MUHURAT_SESSION_2026["trading_start"] <= t <= MUHURAT_SESSION_2026["trading_end"]
                else:
                    return False
            else:
                if MUHURAT_SESSION_2026["trading_start"] <= t <= MUHURAT_SESSION_2026["trading_end"]:
                    return True
        return False

    @classmethod
    def is_muhurat_pre_open(cls, dt_ist: datetime) -> bool:
        """Check if datetime falls within the 2026 Muhurat pre-open window (14:05 to 14:20 IST)."""
        d = dt_ist.date()
        t = dt_ist.time()
        if d == MUHURAT_SESSION_2026["date"]:
            if MUHURAT_SESSION_2026["pre_open_start"] <= t < MUHURAT_SESSION_2026["pre_open_end"]:
                return True
        return False

    @classmethod
    def is_muhurat_post_close(cls, dt_ist: datetime) -> bool:
        """
        Check if datetime falls within the 2026 Muhurat closing session window (15:50 to 16:00 IST).
        Note: In SEBI/NSE microstructure, this is the official Closing Session / Post-Close Trading
        window where orders match strictly at the determined closing price. It is not an ordinary idle buffer.
        """
        d = dt_ist.date()
        t = dt_ist.time()
        if d == MUHURAT_SESSION_2026["date"]:
            if MUHURAT_SESSION_2026["post_close_start"] <= t <= MUHURAT_SESSION_2026["post_close_end"]:
                return True
        return False

    @classmethod
    def get_calendar_segment(cls) -> str:
        """Explicitly declare the exchange segment scope for this calendar (CAPITAL_MARKET)."""
        return ExchangeSegment.CAPITAL_MARKET.value

    @classmethod
    def get_muhurat_phase(
        cls,
        dt: datetime,
        include_block_deal: bool = False,
        granular_cas: bool = False
    ) -> MuhuratSessionPhase:
        """
        Evaluate exact microstructural phase of Diwali Muhurat Trading Session (Sunday 2026-11-08)
        per official circular NSE/CMTR/76941.
        By default, maintains 100% backward compatibility with Phase 7.4.2.
        When include_block_deal=True, identifies BLOCK_DEAL (13:50-14:05).
        When granular_cas=True, distinguishes CAS_LIMIT_ONLY (15:25-15:30) from CLOSING_AUCTION_ENTRY (15:20-15:25).
        """
        dt_ist = cls.to_ist(dt)
        if dt_ist.date() != MUHURAT_SESSION_2026["date"]:
            return MuhuratSessionPhase.CLOSED

        t = dt_ist.time()
        if t < time(13, 50):
            return MuhuratSessionPhase.CLOSED
        elif t < time(14, 5):
            return MuhuratSessionPhase.BLOCK_DEAL if include_block_deal else MuhuratSessionPhase.CLOSED
        elif t < time(14, 10):
            return MuhuratSessionPhase.PRE_OPEN_ENTRY
        elif t < time(14, 15):
            return MuhuratSessionPhase.PRE_OPEN_LIMIT_ONLY
        elif t < time(14, 17):
            return MuhuratSessionPhase.PRE_OPEN_MATCHING
        elif t < time(14, 20):
            return MuhuratSessionPhase.PRE_OPEN_BUFFER
        elif t < time(15, 15):
            return MuhuratSessionPhase.CONTINUOUS_TRADING
        elif t < time(15, 20):
            return MuhuratSessionPhase.CAS_TRANSITION
        elif t < time(15, 25):
            return MuhuratSessionPhase.CLOSING_AUCTION_ENTRY
        elif t < time(15, 30):
            return MuhuratSessionPhase.CAS_LIMIT_ONLY if granular_cas else MuhuratSessionPhase.CLOSING_AUCTION_ENTRY
        elif t < time(15, 35):
            return MuhuratSessionPhase.CLOSING_AUCTION_MATCHING
        elif t < time(15, 50):
            return MuhuratSessionPhase.CAS_TRANSITION_BUFFER
        elif t <= time(16, 0):
            return MuhuratSessionPhase.CLOSING_SESSION
        else:
            return MuhuratSessionPhase.CLOSED

    @classmethod
    def is_clearing_holiday(cls, check_date: date) -> bool:
        """
        Check if date is a clearing & settlement holiday (bank/depository closure).
        Includes the 16 trading holidays plus the 4 clearing-only dates.
        """
        return check_date in CLEARING_HOLIDAYS_MAP_2026

    @classmethod
    def is_trading_day_on_clearing_holiday(cls, check_date: date) -> bool:
        """
        Check if date is open for normal trading (09:15-15:30 IST) despite being a clearing holiday.
        (e.g., Annual Bank Closing on 2026-04-01).
        """
        return check_date in CLEARING_ONLY_HOLIDAYS_MAP_2026

    @classmethod
    def get_clearing_holidays(cls, year: int = 2026) -> List[date]:
        """Return all clearing holiday dates (trading holidays + clearing-only holidays)."""
        if year == 2026:
            return sorted(list(CLEARING_HOLIDAYS_MAP_2026.keys()))
        return []

    @classmethod
    def get_clearing_only_holidays(cls, year: int = 2026) -> List[date]:
        """Return the 4 clearing-only holidays that trade normally."""
        if year == 2026:
            return sorted(list(CLEARING_ONLY_HOLIDAYS_MAP_2026.keys()))
        return []

    @classmethod
    def get_clearing_holiday_evidence(cls, year: int = 2026) -> List[HolidayEvidence]:
        """Return verified provenance evidence for all clearing holidays."""
        if year == 2026:
            return sorted(list(CLEARING_HOLIDAYS_MAP_2026.values()), key=lambda x: x.date)
        return []

    @classmethod
    def get_unverified_segment_evidence(cls, year: int = 2026) -> List[HolidayEvidence]:
        """Return evidence records marked UNVERIFIED pending official circulars."""
        if year == 2026:
            return UNVERIFIED_SEGMENT_HOLIDAYS_2026
        return []

    @classmethod
    def get_fixture_provenance(cls, filename: str) -> Optional[FixtureProvenanceRecord]:
        """Retrieve explicit fixture provenance record by filename."""
        return FIXTURE_REGISTRY_2026.get(filename)

    @classmethod
    def get_all_fixture_provenance(cls) -> Dict[str, FixtureProvenanceRecord]:
        """Return complete fixture registry."""
        return FIXTURE_REGISTRY_2026

    @classmethod
    def is_dr_session(cls, dt_ist: datetime) -> bool:
        """
        Check if datetime falls within an official DR live trading session.
        Governed by NSE Circular NSE/MSD/73126:
        - 2026-03-05 and 2026-03-06 (Thursday & Friday) from 09:15 to 15:30 IST.
        - Saturday 2026-03-07 has NO trading (strictly False).
        """
        d = dt_ist.date()
        t = dt_ist.time()
        for dr in DR_SESSIONS_2026:
            if d == dr["date"] and dr["site"] == "DR_SITE":
                if dr["trading_start"] <= t <= dr["trading_end"]:
                    return True
        return False

    @classmethod
    def validate_security_category(cls, category: Any) -> SecurityCategory:
        """
        Validate and return SecurityCategory enum instance.
        Raises ValueError on invalid or missing category metadata.
        """
        if category is None:
            raise ValueError("Security category cannot be None. Must specify a valid SecurityCategory.")
        if isinstance(category, SecurityCategory):
            return category
        if isinstance(category, str):
            cat_upper = category.strip().upper()
            try:
                return SecurityCategory[cat_upper]
            except KeyError:
                pass
            for sc in SecurityCategory:
                if sc.value == cat_upper:
                    return sc
        valid_cats = [c.value for c in SecurityCategory]
        raise ValueError(f"Invalid security category: '{category}'. Valid categories are: {valid_cats}")

    @classmethod
    def resolve_schedule_version(
        cls,
        target_date: Union[date, datetime],
        segment: str = "CAPITAL_MARKET",
        security_category: Optional[SecurityCategory | str] = None,
    ) -> ScheduleVersionSpec:
        """
        Resolve the date-effective regulatory schedule version for a given trading date,
        market segment, and security category.
        - LEGACY: Before 2026-08-03 (effective_from = 2010-01-04, effective_to = 2026-08-02)
        - CAS_V1: 2026-08-03 through 2026-12-06 (effective_from = 2026-08-03, effective_to = 2026-12-06)
        - CAS_V2: Effective from 2026-12-07 onwards (effective_from = 2026-12-07, effective_to = None)
        """
        if isinstance(target_date, datetime):
            target_date = cls.to_ist(target_date).date()
        elif isinstance(target_date, str):
            target_date = date.fromisoformat(target_date[:10])

        if target_date < CAS_V1_GO_LIVE_DATE:
            return SCHEDULE_VERSIONS_REGISTRY["LEGACY"]
        elif target_date <= CAS_V1_SUNSET_DATE:
            return SCHEDULE_VERSIONS_REGISTRY["CAS_V1"]
        else:
            return SCHEDULE_VERSIONS_REGISTRY["CAS_V2"]

    @classmethod
    def get_schedule_version(
        cls,
        target_date: Union[date, datetime],
        segment: str = "CAPITAL_MARKET",
        security_category: Optional[SecurityCategory | str] = None,
    ) -> ScheduleVersionSpec:
        """Alias for resolve_schedule_version."""
        return cls.resolve_schedule_version(target_date, segment, security_category)

    @classmethod
    def evaluate_schedule_session(
        cls,
        target_date: Union[date, datetime, str],
        session_time: time,
        security_category: SecurityCategory | str = SecurityCategory.NON_CAS,
        exchange: str = "NSE",
    ) -> SecuritySessionEvaluation:
        """
        Evaluate the intraday session state defined by the date-effective schedule version,
        independent of exchange weekend/holiday calendar closure.
        """
        if isinstance(target_date, str):
            d = date.fromisoformat(target_date[:10])
        elif isinstance(target_date, datetime):
            d = cls.to_ist(target_date).date()
        else:
            d = target_date
        dt = datetime.combine(d, session_time, tzinfo=IST)
        return cls.evaluate_session_instant(dt, security_category, exchange, ignore_holidays=True)

    @classmethod
    def evaluate_session_instant(
        cls,
        dt: datetime,
        security_category: SecurityCategory | str = SecurityCategory.NON_CAS,
        exchange: str = "NSE",
        calendar_regime: Optional[CalendarRegime | str] = None,
        ignore_holidays: bool = False
    ) -> SecuritySessionEvaluation:
        """
        Evaluate exact microstructural session state at a precise instant in time,
        enforcing strictly half-open interval semantics [T_start, T_end).
        
        Rule: A session's closing timestamp is EXCLUSIVE and is NOT a valid trading instant
        for the terminating session.
        - Regular Market Continuous: [09:15:00, 15:30:00) -> at 15:30:00, continuous has ended;
          state is CLOSING_AUCTION_MATCHING (Modern CAS) or BUFFER (Legacy Pre-CAS).
        - Regular Closing Session:
          - Modern CAS (dates >= 2026-08-03 or regime=MODERN_CAS_2026):
            [15:50:00, 16:00:00) -> at 15:40:00 state is strictly TRANSITION_PERIOD;
            at 16:00:00 market has closed; state is CLOSED.
          - Legacy Pre-CAS (dates < 2026-08-03 or regime=LEGACY_PRE_CAS):
            [15:40:00, 16:00:00) -> at 16:00:00 market has closed; state is CLOSED.
        - Muhurat CAS Matching:     [15:30:00, 15:35:00) -> at 15:35:00, matching has ended; state is CAS_TRANSITION_BUFFER.
        - Muhurat Post-Close:       [15:50:00, 16:00:00) -> at 16:00:00, market has closed; state is CLOSED.
        """
        cat = cls.validate_security_category(security_category)
        dt_ist = cls.to_ist(dt)
        d = dt_ist.date()
        t = dt_ist.time()
        total_sec = t.hour * 3600 + t.minute * 60 + t.second

        # 1. Diwali Muhurat Session (Sunday 2026-11-08)
        if d == MUHURAT_SESSION_2026["date"]:
            t_block_start = 13 * 3600 + 50 * 60   # 13:50:00
            t_block_end = 14 * 3600 + 5 * 60      # 14:05:00
            t_pre_start = 14 * 3600 + 5 * 60      # 14:05:00
            t_pre_limit = 14 * 3600 + 10 * 60     # 14:10:00
            t_pre_match = 14 * 3600 + 15 * 60     # 14:15:00
            t_pre_buf = 14 * 3600 + 17 * 60       # 14:17:00
            t_cont_open = 14 * 3600 + 20 * 60     # 14:20:00
            t_cas_cont_end = 15 * 3600 + 15 * 60  # 15:15:00
            t_cas_trans_end = 15 * 3600 + 20 * 60 # 15:20:00
            t_cas_entry_end = 15 * 3600 + 25 * 60 # 15:25:00
            t_cas_limit_end = 15 * 3600 + 30 * 60 # 15:30:00
            t_cas_match_end = 15 * 3600 + 35 * 60 # 15:35:00
            t_cas_buf_end = 15 * 3600 + 50 * 60   # 15:50:00
            t_post_start = 15 * 3600 + 50 * 60    # 15:50:00
            t_post_end = 16 * 3600                # 16:00:00

            if total_sec < t_block_start:
                return SecuritySessionEvaluation(
                    datetime_ist=dt_ist,
                    security_category=cat,
                    session_type=SessionType.CLOSED,
                    granular_phase="CLOSED",
                    is_continuous_trading=False,
                    is_order_entry_allowed=False,
                    order_type_allowed="NONE",
                    is_random_closure_interval=False,
                    random_closure_window=None,
                    description="Market closed before Muhurat session"
                )
            elif total_sec < t_block_end:
                return SecuritySessionEvaluation(
                    datetime_ist=dt_ist,
                    security_category=cat,
                    session_type=SessionType.BLOCK_DEAL,
                    granular_phase="BLOCK_DEAL",
                    is_continuous_trading=False,
                    is_order_entry_allowed=False,
                    order_type_allowed="NONE",
                    is_random_closure_interval=False,
                    random_closure_window=None,
                    description="Bilateral block deal session window per circular NSE/CMTR/76941"
                )
            elif total_sec < t_pre_limit:
                return SecuritySessionEvaluation(
                    datetime_ist=dt_ist,
                    security_category=cat,
                    session_type=SessionType.PRE_OPEN,
                    granular_phase="PRE_OPEN_ENTRY",
                    is_continuous_trading=False,
                    is_order_entry_allowed=True,
                    order_type_allowed="ALL",
                    is_random_closure_interval=False,
                    random_closure_window=None,
                    description="Muhurat Pre-Open Order Entry (Market & Limit orders)"
                )
            elif total_sec < t_pre_match:
                is_rand = total_sec >= (14 * 3600 + 13 * 60)
                rand_win = RANDOM_CLOSURE_WINDOWS["MUHURAT_PRE_OPEN"] if is_rand else None
                return SecuritySessionEvaluation(
                    datetime_ist=dt_ist,
                    security_category=cat,
                    session_type=SessionType.PRE_OPEN,
                    granular_phase="PRE_OPEN_LIMIT_ONLY",
                    is_continuous_trading=False,
                    is_order_entry_allowed=True,
                    order_type_allowed="LIMIT_ONLY",
                    is_random_closure_interval=is_rand,
                    random_closure_window=rand_win,
                    description="Muhurat Pre-Open Limit-Only Order Entry (Random closure window 14:13-14:15)"
                )
            elif total_sec < t_pre_buf:
                return SecuritySessionEvaluation(
                    datetime_ist=dt_ist,
                    security_category=cat,
                    session_type=SessionType.PRE_OPEN,
                    granular_phase="PRE_OPEN_MATCHING",
                    is_continuous_trading=False,
                    is_order_entry_allowed=False,
                    order_type_allowed="NONE",
                    is_random_closure_interval=False,
                    random_closure_window=None,
                    description="Muhurat Pre-Open Order Matching & Trade Confirmation"
                )
            elif total_sec < t_cont_open:
                return SecuritySessionEvaluation(
                    datetime_ist=dt_ist,
                    security_category=cat,
                    session_type=SessionType.PRE_OPEN,
                    granular_phase="PRE_OPEN_BUFFER",
                    is_continuous_trading=False,
                    is_order_entry_allowed=False,
                    order_type_allowed="NONE",
                    is_random_closure_interval=False,
                    random_closure_window=None,
                    description="Muhurat Pre-Open Transition Buffer"
                )
            elif total_sec < t_cas_cont_end:
                if cat == SecurityCategory.ILLIQUID_CALL_AUCTION:
                    return SecuritySessionEvaluation(
                        datetime_ist=dt_ist,
                        security_category=cat,
                        session_type=SessionType.CLOSED,
                        granular_phase="CLOSED",
                        is_continuous_trading=False,
                        is_order_entry_allowed=False,
                        order_type_allowed="NONE",
                        is_random_closure_interval=False,
                        random_closure_window=None,
                        description="Illiquid securities have zero continuous trading"
                    )
                return SecuritySessionEvaluation(
                    datetime_ist=dt_ist,
                    security_category=cat,
                    session_type=SessionType.SPECIAL_MUHURAT,
                    granular_phase="CONTINUOUS_TRADING",
                    is_continuous_trading=True,
                    is_order_entry_allowed=True,
                    order_type_allowed="ALL",
                    is_random_closure_interval=False,
                    random_closure_window=None,
                    description="Diwali Muhurat Continuous Trading Session"
                )
            elif total_sec < t_cas_trans_end:
                if cat == SecurityCategory.CAS_ELIGIBLE:
                    return SecuritySessionEvaluation(
                        datetime_ist=dt_ist,
                        security_category=cat,
                        session_type=SessionType.SPECIAL_CAS,
                        granular_phase="CAS_TRANSITION",
                        is_continuous_trading=False,
                        is_order_entry_allowed=False,
                        order_type_allowed="NONE",
                        is_random_closure_interval=False,
                        random_closure_window=None,
                        description="Muhurat CAS Reference Price Calculation / Transition"
                    )
                elif cat == SecurityCategory.NON_CAS:
                    return SecuritySessionEvaluation(
                        datetime_ist=dt_ist,
                        security_category=cat,
                        session_type=SessionType.SPECIAL_MUHURAT,
                        granular_phase="CONTINUOUS_TRADING",
                        is_continuous_trading=True,
                        is_order_entry_allowed=True,
                        order_type_allowed="ALL",
                        is_random_closure_interval=False,
                        random_closure_window=None,
                        description="Muhurat Continuous Trading Session (Non-CAS continues to 15:30)"
                    )
                else:
                    return SecuritySessionEvaluation(
                        datetime_ist=dt_ist,
                        security_category=cat,
                        session_type=SessionType.CLOSED,
                        granular_phase="CLOSED",
                        is_continuous_trading=False,
                        is_order_entry_allowed=False,
                        order_type_allowed="NONE",
                        is_random_closure_interval=False,
                        random_closure_window=None,
                        description="Closed"
                    )
            elif total_sec < t_cas_entry_end:
                if cat == SecurityCategory.CAS_ELIGIBLE:
                    return SecuritySessionEvaluation(
                        datetime_ist=dt_ist,
                        security_category=cat,
                        session_type=SessionType.SPECIAL_CAS,
                        granular_phase="CLOSING_AUCTION_ENTRY",
                        is_continuous_trading=False,
                        is_order_entry_allowed=True,
                        order_type_allowed="ALL",
                        is_random_closure_interval=False,
                        random_closure_window=None,
                        description="Muhurat CAS Order Entry (Market & Limit orders)"
                    )
                elif cat == SecurityCategory.NON_CAS:
                    return SecuritySessionEvaluation(
                        datetime_ist=dt_ist,
                        security_category=cat,
                        session_type=SessionType.SPECIAL_MUHURAT,
                        granular_phase="CONTINUOUS_TRADING",
                        is_continuous_trading=True,
                        is_order_entry_allowed=True,
                        order_type_allowed="ALL",
                        is_random_closure_interval=False,
                        random_closure_window=None,
                        description="Muhurat Continuous Trading Session (Non-CAS continues to 15:30)"
                    )
                else:
                    return SecuritySessionEvaluation(
                        datetime_ist=dt_ist,
                        security_category=cat,
                        session_type=SessionType.CLOSED,
                        granular_phase="CLOSED",
                        is_continuous_trading=False,
                        is_order_entry_allowed=False,
                        order_type_allowed="NONE",
                        is_random_closure_interval=False,
                        random_closure_window=None,
                        description="Closed"
                    )
            elif total_sec < t_cas_limit_end:
                if cat == SecurityCategory.CAS_ELIGIBLE:
                    is_rand = total_sec >= (15 * 3600 + 28 * 60)
                    rand_win = RANDOM_CLOSURE_WINDOWS["MUHURAT_CAS"] if is_rand else None
                    return SecuritySessionEvaluation(
                        datetime_ist=dt_ist,
                        security_category=cat,
                        session_type=SessionType.SPECIAL_CAS,
                        granular_phase="CAS_LIMIT_ONLY",
                        is_continuous_trading=False,
                        is_order_entry_allowed=True,
                        order_type_allowed="LIMIT_ONLY",
                        is_random_closure_interval=is_rand,
                        random_closure_window=rand_win,
                        description="Muhurat CAS Limit-Only Entry (Random closure window 15:28-15:30)"
                    )
                elif cat == SecurityCategory.NON_CAS:
                    return SecuritySessionEvaluation(
                        datetime_ist=dt_ist,
                        security_category=cat,
                        session_type=SessionType.SPECIAL_MUHURAT,
                        granular_phase="CONTINUOUS_TRADING",
                        is_continuous_trading=True,
                        is_order_entry_allowed=True,
                        order_type_allowed="ALL",
                        is_random_closure_interval=False,
                        random_closure_window=None,
                        description="Muhurat Continuous Trading Session (Non-CAS continues to 15:30)"
                    )
                else:
                    return SecuritySessionEvaluation(
                        datetime_ist=dt_ist,
                        security_category=cat,
                        session_type=SessionType.CLOSED,
                        granular_phase="CLOSED",
                        is_continuous_trading=False,
                        is_order_entry_allowed=False,
                        order_type_allowed="NONE",
                        is_random_closure_interval=False,
                        random_closure_window=None,
                        description="Closed"
                    )
            elif total_sec < t_cas_match_end:
                if cat == SecurityCategory.CAS_ELIGIBLE:
                    return SecuritySessionEvaluation(
                        datetime_ist=dt_ist,
                        security_category=cat,
                        session_type=SessionType.SPECIAL_CAS,
                        granular_phase="CLOSING_AUCTION_MATCHING",
                        is_continuous_trading=False,
                        is_order_entry_allowed=False,
                        order_type_allowed="NONE",
                        is_random_closure_interval=False,
                        random_closure_window=None,
                        description="Muhurat CAS Order Matching & Price Discovery"
                    )
                else:
                    return SecuritySessionEvaluation(
                        datetime_ist=dt_ist,
                        security_category=cat,
                        session_type=SessionType.CLOSED,
                        granular_phase="CLOSED",
                        is_continuous_trading=False,
                        is_order_entry_allowed=False,
                        order_type_allowed="NONE",
                        is_random_closure_interval=False,
                        random_closure_window=None,
                        description="Normal market closed at 15:30"
                    )
            elif total_sec < t_cas_buf_end:
                if cat == SecurityCategory.CAS_ELIGIBLE:
                    return SecuritySessionEvaluation(
                        datetime_ist=dt_ist,
                        security_category=cat,
                        session_type=SessionType.SPECIAL_CAS,
                        granular_phase="CAS_TRANSITION_BUFFER",
                        is_continuous_trading=False,
                        is_order_entry_allowed=False,
                        order_type_allowed="NONE",
                        is_random_closure_interval=False,
                        random_closure_window=None,
                        description="Muhurat CAS Post-Auction Buffer & Reconciliation"
                    )
                else:
                    return SecuritySessionEvaluation(
                        datetime_ist=dt_ist,
                        security_category=cat,
                        session_type=SessionType.CLOSED,
                        granular_phase="CLOSED",
                        is_continuous_trading=False,
                        is_order_entry_allowed=False,
                        order_type_allowed="NONE",
                        is_random_closure_interval=False,
                        random_closure_window=None,
                        description="Normal market closed at 15:30"
                    )
            elif total_sec < t_post_end:
                return SecuritySessionEvaluation(
                    datetime_ist=dt_ist,
                    security_category=cat,
                    session_type=SessionType.POST_CLOSE,
                    granular_phase="CLOSING_SESSION",
                    is_continuous_trading=False,
                    is_order_entry_allowed=True,
                    order_type_allowed="LIMIT_ONLY",
                    is_random_closure_interval=False,
                    random_closure_window=None,
                    description="Official Closing Session / Post-Close Trading at determined closing price"
                )
            else:
                return SecuritySessionEvaluation(
                    datetime_ist=dt_ist,
                    security_category=cat,
                    session_type=SessionType.CLOSED,
                    granular_phase="CLOSED",
                    is_continuous_trading=False,
                    is_order_entry_allowed=False,
                    order_type_allowed="NONE",
                    is_random_closure_interval=False,
                    random_closure_window=None,
                    description="Market closed"
                )

        # 2. Weekends & Official Holidays
        if not ignore_holidays and calendar_regime is None and (dt_ist.weekday() >= 5 or d in TRADING_HOLIDAYS_2026):
            return SecuritySessionEvaluation(
                datetime_ist=dt_ist,
                security_category=cat,
                session_type=SessionType.CLOSED,
                granular_phase="CLOSED",
                is_continuous_trading=False,
                is_order_entry_allowed=False,
                order_type_allowed="NONE",
                is_random_closure_interval=False,
                random_closure_window=None,
                description="Market closed (Weekend or Exchange Holiday)"
            )

        # Base regular session type (SPECIAL_DR on DR days, REGULAR on standard days)
        base_reg_type = SessionType.SPECIAL_DR if cls.is_dr_session(dt_ist) else SessionType.REGULAR

        # 3. Special Pre-Open Session (SPOS) for IPO / Relisted Securities
        if cat == SecurityCategory.SPECIAL_PREOPEN_IPO:
            if calendar_regime is not None:
                reg_val = calendar_regime.value if isinstance(calendar_regime, CalendarRegime) else str(calendar_regime)
                if reg_val == "CAS_V2":
                    spos_regime = CalendarRegime.CAS_V2
                elif reg_val in ("CAS_V1", "MODERN_CAS_2026"):
                    spos_regime = CalendarRegime.CAS_V1
                else:
                    spos_regime = CalendarRegime.LEGACY_PRE_CAS
            else:
                if d < CAS_V1_GO_LIVE_DATE:
                    spos_regime = CalendarRegime.LEGACY_PRE_CAS
                elif d <= CAS_V1_SUNSET_DATE:
                    spos_regime = CalendarRegime.CAS_V1
                else:
                    spos_regime = CalendarRegime.CAS_V2

            t_spos_start = 9 * 3600               # 09:00:00
            t_spos_rand_start = 9 * 3600 + 35 * 60 # 09:35:00
            t_spos_entry_end = 9 * 3600 + 45 * 60  # 09:45:00
            t_spos_match_end = 9 * 3600 + 55 * 60  # 09:55:00
            t_spos_cont_open = 10 * 3600           # 10:00:00
            t_mkt_close = 15 * 3600 + 30 * 60      # 15:30:00
            t_cas_match_end = 15 * 3600 + 35 * 60 if spos_regime == CalendarRegime.CAS_V1 else (15 * 3600 + 45 * 60 if spos_regime == CalendarRegime.CAS_V2 else 15 * 3600 + 40 * 60)
            t_post_start = 15 * 3600 + 50 * 60 if spos_regime in (CalendarRegime.CAS_V1, CalendarRegime.CAS_V2) else 15 * 3600 + 40 * 60
            t_post_end = 16 * 3600                 # 16:00:00

            if total_sec < t_spos_start:
                return SecuritySessionEvaluation(
                    datetime_ist=dt_ist,
                    security_category=cat,
                    session_type=SessionType.CLOSED,
                    granular_phase="CLOSED",
                    is_continuous_trading=False,
                    is_order_entry_allowed=False,
                    order_type_allowed="NONE",
                    is_random_closure_interval=False,
                    random_closure_window=None,
                    description="Pre-market closed before SPOS"
                )
            elif total_sec < t_spos_rand_start:
                return SecuritySessionEvaluation(
                    datetime_ist=dt_ist,
                    security_category=cat,
                    session_type=SessionType.SPECIAL_PREOPEN,
                    granular_phase="SPOS_ORDER_ENTRY",
                    is_continuous_trading=False,
                    is_order_entry_allowed=True,
                    order_type_allowed="ALL",
                    is_random_closure_interval=False,
                    random_closure_window=None,
                    description="Special Pre-Open Session Order Entry (Market & Limit orders)"
                )
            elif total_sec < t_spos_entry_end:
                rand_win = RANDOM_CLOSURE_WINDOWS["SPOS_IPO"]
                return SecuritySessionEvaluation(
                    datetime_ist=dt_ist,
                    security_category=cat,
                    session_type=SessionType.SPECIAL_PREOPEN,
                    granular_phase="SPOS_ORDER_ENTRY",
                    is_continuous_trading=False,
                    is_order_entry_allowed=True,
                    order_type_allowed="ALL",
                    is_random_closure_interval=True,
                    random_closure_window=rand_win,
                    description="Special Pre-Open Session Order Entry (Random closure window 09:35-09:45)"
                )
            elif total_sec < t_spos_match_end:
                return SecuritySessionEvaluation(
                    datetime_ist=dt_ist,
                    security_category=cat,
                    session_type=SessionType.SPECIAL_PREOPEN,
                    granular_phase="SPOS_MATCHING",
                    is_continuous_trading=False,
                    is_order_entry_allowed=False,
                    order_type_allowed="NONE",
                    is_random_closure_interval=False,
                    random_closure_window=None,
                    description="Special Pre-Open Session Order Matching & Price Discovery"
                )
            elif total_sec < t_spos_cont_open:
                return SecuritySessionEvaluation(
                    datetime_ist=dt_ist,
                    security_category=cat,
                    session_type=SessionType.SPECIAL_PREOPEN,
                    granular_phase="SPOS_BUFFER",
                    is_continuous_trading=False,
                    is_order_entry_allowed=False,
                    order_type_allowed="NONE",
                    is_random_closure_interval=False,
                    random_closure_window=None,
                    description="Special Pre-Open Session Buffer Period before Continuous Trading"
                )
            elif total_sec < t_mkt_close:
                return SecuritySessionEvaluation(
                    datetime_ist=dt_ist,
                    security_category=cat,
                    session_type=base_reg_type,
                    granular_phase="CONTINUOUS_TRADING",
                    is_continuous_trading=True,
                    is_order_entry_allowed=True,
                    order_type_allowed="ALL",
                    is_random_closure_interval=False,
                    random_closure_window=None,
                    description="Continuous Trading Session for IPO/Relisted Security (10:00-15:30 IST)"
                )
            elif total_sec < t_post_start:
                if spos_regime == CalendarRegime.CAS_V2:
                    if total_sec < (15 * 3600 + 40 * 60):
                        return SecuritySessionEvaluation(
                            datetime_ist=dt_ist,
                            security_category=cat,
                            session_type=SessionType.SPECIAL_CAS,
                            granular_phase="BUFFER",
                            is_continuous_trading=False,
                            is_order_entry_allowed=False,
                            order_type_allowed="NONE",
                            is_random_closure_interval=False,
                            random_closure_window=None,
                            description="SPOS scrip post-continuous buffer before CAS 2.0 matching"
                        )
                    elif total_sec < (15 * 3600 + 45 * 60):
                        return SecuritySessionEvaluation(
                            datetime_ist=dt_ist,
                            security_category=cat,
                            session_type=SessionType.SPECIAL_CAS,
                            granular_phase="CLOSING_AUCTION_MATCHING",
                            is_continuous_trading=False,
                            is_order_entry_allowed=False,
                            order_type_allowed="NONE",
                            is_random_closure_interval=False,
                            random_closure_window=None,
                            description="SPOS scrip closing auction matching period"
                        )
                    else:
                        return SecuritySessionEvaluation(
                            datetime_ist=dt_ist,
                            security_category=cat,
                            session_type=SessionType.SPECIAL_CAS,
                            granular_phase="TRANSITION_PERIOD",
                            is_continuous_trading=False,
                            is_order_entry_allowed=False,
                            order_type_allowed="NONE",
                            is_random_closure_interval=False,
                            random_closure_window=None,
                            description="SPOS scrip post-auction transition period buffer"
                        )
                elif spos_regime in (CalendarRegime.CAS_V1, CalendarRegime.MODERN_CAS_2026):
                    if total_sec < t_cas_match_end:
                        return SecuritySessionEvaluation(
                            datetime_ist=dt_ist,
                            security_category=cat,
                            session_type=SessionType.SPECIAL_CAS,
                            granular_phase="CLOSING_AUCTION_MATCHING",
                            is_continuous_trading=False,
                            is_order_entry_allowed=False,
                            order_type_allowed="NONE",
                            is_random_closure_interval=False,
                            random_closure_window=None,
                            description="SPOS scrip closing auction matching period"
                        )
                    else:
                        return SecuritySessionEvaluation(
                            datetime_ist=dt_ist,
                            security_category=cat,
                            session_type=SessionType.SPECIAL_CAS,
                            granular_phase="TRANSITION_PERIOD",
                            is_continuous_trading=False,
                            is_order_entry_allowed=False,
                            order_type_allowed="NONE",
                            is_random_closure_interval=False,
                            random_closure_window=None,
                            description="SPOS scrip post-auction transition period buffer"
                        )
                else:
                    return SecuritySessionEvaluation(
                        datetime_ist=dt_ist,
                        security_category=cat,
                        session_type=SessionType.CLOSED,
                        granular_phase="BUFFER",
                        is_continuous_trading=False,
                        is_order_entry_allowed=False,
                        order_type_allowed="NONE",
                        is_random_closure_interval=False,
                        random_closure_window=None,
                        description="Post-market buffer"
                    )
            elif total_sec < t_post_end:
                return SecuritySessionEvaluation(
                    datetime_ist=dt_ist,
                    security_category=cat,
                    session_type=SessionType.POST_CLOSE,
                    granular_phase="CLOSING_SESSION",
                    is_continuous_trading=False,
                    is_order_entry_allowed=True,
                    order_type_allowed="LIMIT_ONLY",
                    is_random_closure_interval=False,
                    random_closure_window=None,
                    description="Closing Session / Post-Close Trading at determined closing price"
                )
            else:
                return SecuritySessionEvaluation(
                    datetime_ist=dt_ist,
                    security_category=cat,
                    session_type=SessionType.CLOSED,
                    granular_phase="CLOSED",
                    is_continuous_trading=False,
                    is_order_entry_allowed=False,
                    order_type_allowed="NONE",
                    is_random_closure_interval=False,
                    random_closure_window=None,
                    description="Market closed"
                )

        # 4. Periodic Call Auction for Illiquid Securities (PCAIS) - Instant Evaluation
        if cat == SecurityCategory.ILLIQUID_CALL_AUCTION:
            t_pcais_open = 9 * 3600 + 30 * 60   # 09:30:00
            t_pcais_close = 15 * 3600 + 30 * 60 # 15:30:00

            if total_sec < t_pcais_open or total_sec >= t_pcais_close:
                return SecuritySessionEvaluation(
                    datetime_ist=dt_ist,
                    security_category=cat,
                    session_type=SessionType.CLOSED,
                    granular_phase="CLOSED",
                    is_continuous_trading=False,
                    is_order_entry_allowed=False,
                    order_type_allowed="NONE",
                    is_random_closure_interval=False,
                    random_closure_window=None,
                    description="Closed (Periodic Call Auction active only 09:30 to 15:30)"
                )

            # Determine cycle index (0 to 5)
            cycle_idx = (total_sec - t_pcais_open) // 3600
            cycle_start = t_pcais_open + cycle_idx * 3600
            sec_in_cycle = total_sec - cycle_start
            cycle_num = cycle_idx + 1

            if sec_in_cycle < 45 * 60:
                is_rand = sec_in_cycle >= 44 * 60
                rand_start_time = time((cycle_start + 44 * 60) // 3600, ((cycle_start + 44 * 60) % 3600) // 60)
                rand_end_time = time((cycle_start + 45 * 60) // 3600, ((cycle_start + 45 * 60) % 3600) // 60)
                rand_win = RandomClosureWindow(
                    window_start=rand_start_time,
                    window_end=rand_end_time,
                    description=f"PCAIS Cycle {cycle_num} Random Order Closure Window (final 1 min)"
                ) if is_rand else None

                return SecuritySessionEvaluation(
                    datetime_ist=dt_ist,
                    security_category=cat,
                    session_type=SessionType.CALL_AUCTION,
                    granular_phase=f"CALL_AUCTION_ORDER_ENTRY_CYCLE_{cycle_num}",
                    is_continuous_trading=False,
                    is_order_entry_allowed=True,
                    order_type_allowed="ALL",
                    is_random_closure_interval=is_rand,
                    random_closure_window=rand_win,
                    description=f"Periodic Call Auction Cycle {cycle_num} Order Entry (45 mins)"
                )
            elif sec_in_cycle < 53 * 60:
                return SecuritySessionEvaluation(
                    datetime_ist=dt_ist,
                    security_category=cat,
                    session_type=SessionType.CALL_AUCTION,
                    granular_phase=f"CALL_AUCTION_MATCHING_CYCLE_{cycle_num}",
                    is_continuous_trading=False,
                    is_order_entry_allowed=False,
                    order_type_allowed="NONE",
                    is_random_closure_interval=False,
                    random_closure_window=None,
                    description=f"Periodic Call Auction Cycle {cycle_num} Order Matching (8 mins)"
                )
            else:
                return SecuritySessionEvaluation(
                    datetime_ist=dt_ist,
                    security_category=cat,
                    session_type=SessionType.CALL_AUCTION,
                    granular_phase=f"CALL_AUCTION_BUFFER_CYCLE_{cycle_num}",
                    is_continuous_trading=False,
                    is_order_entry_allowed=False,
                    order_type_allowed="NONE",
                    is_random_closure_interval=False,
                    random_closure_window=None,
                    description=f"Periodic Call Auction Cycle {cycle_num} Buffer (7 mins)"
                )

        # 5. CAS_ELIGIBLE and NON_CAS on Regular Trading Days - Instant Evaluation
        if calendar_regime is not None:
            reg_val = calendar_regime.value if isinstance(calendar_regime, CalendarRegime) else str(calendar_regime)
            if reg_val == "CAS_V2":
                regime = CalendarRegime.CAS_V2
            elif reg_val in ("CAS_V1", "MODERN_CAS_2026"):
                regime = CalendarRegime.CAS_V1
            else:
                regime = CalendarRegime.LEGACY
        else:
            sched_ver = cls.resolve_schedule_version(d, exchange, cat)
            if sched_ver.version_id == "CAS_V2":
                regime = CalendarRegime.CAS_V2
            elif sched_ver.version_id == "CAS_V1":
                regime = CalendarRegime.CAS_V1
            else:
                regime = CalendarRegime.LEGACY

        t_pre_start = 9 * 3600                # 09:00:00
        t_pre_limit = 9 * 3600 + 7 * 60       # 09:07:00
        t_pre_match = 9 * 3600 + 8 * 60       # 09:08:00
        t_pre_buf = 9 * 3600 + 12 * 60        # 09:12:00
        t_cont_open = 9 * 3600 + 15 * 60      # 09:15:00

        if total_sec < t_pre_start:
            return SecuritySessionEvaluation(
                datetime_ist=dt_ist,
                security_category=cat,
                session_type=SessionType.CLOSED,
                granular_phase="CLOSED",
                is_continuous_trading=False,
                is_order_entry_allowed=False,
                order_type_allowed="NONE",
                is_random_closure_interval=False,
                random_closure_window=None,
                description="Market closed before pre-open"
            )
        elif total_sec < t_pre_limit:
            return SecuritySessionEvaluation(
                datetime_ist=dt_ist,
                security_category=cat,
                session_type=SessionType.PRE_OPEN,
                granular_phase="PRE_OPEN_ENTRY",
                is_continuous_trading=False,
                is_order_entry_allowed=True,
                order_type_allowed="ALL",
                is_random_closure_interval=False,
                random_closure_window=None,
                description="Pre-Open Order Entry (Market & Limit orders)"
            )
        elif total_sec < t_pre_match:
            rand_win = RANDOM_CLOSURE_WINDOWS["REGULAR_PRE_OPEN"]
            return SecuritySessionEvaluation(
                datetime_ist=dt_ist,
                security_category=cat,
                session_type=SessionType.PRE_OPEN,
                granular_phase="PRE_OPEN_LIMIT_ONLY",
                is_continuous_trading=False,
                is_order_entry_allowed=True,
                order_type_allowed="LIMIT_ONLY",
                is_random_closure_interval=True,
                random_closure_window=rand_win,
                description="Pre-Open Limit-Only Order Entry (Random closure window 09:07-09:08)"
            )
        elif total_sec < t_pre_buf:
            return SecuritySessionEvaluation(
                datetime_ist=dt_ist,
                security_category=cat,
                session_type=SessionType.PRE_OPEN,
                granular_phase="PRE_OPEN_MATCHING",
                is_continuous_trading=False,
                is_order_entry_allowed=False,
                order_type_allowed="NONE",
                is_random_closure_interval=False,
                random_closure_window=None,
                description="Pre-Open Order Matching & Trade Confirmation"
            )
        elif total_sec < t_cont_open:
            return SecuritySessionEvaluation(
                datetime_ist=dt_ist,
                security_category=cat,
                session_type=SessionType.PRE_OPEN,
                granular_phase="PRE_OPEN_BUFFER",
                is_continuous_trading=False,
                is_order_entry_allowed=False,
                order_type_allowed="NONE",
                is_random_closure_interval=False,
                random_closure_window=None,
                description="Pre-Open Transition Buffer"
            )
        elif total_sec >= t_cont_open:
            if regime == CalendarRegime.CAS_V2:
                # CAS 2.0 Regulatory Architecture (strictly half-open instant evaluation [T_start, T_end))
                t_cont_close = 15 * 3600 + 30 * 60     # 15:30:00
                t_cas2_trans_end = 15 * 3600 + 31 * 60 # 15:31:00
                t_cas2_entry_end = 15 * 3600 + 36 * 60 # 15:36:00
                t_cas2_limit_end = 15 * 3600 + 40 * 60 # 15:40:00
                t_cas2_match_end = 15 * 3600 + 45 * 60 # 15:45:00
                t_cas2_buf_end = 15 * 3600 + 50 * 60   # 15:50:00
                t_post_end = 16 * 3600                 # 16:00:00

                if cat == SecurityCategory.CAS_ELIGIBLE:
                    if total_sec < t_cont_close:
                        return SecuritySessionEvaluation(
                            datetime_ist=dt_ist,
                            security_category=cat,
                            session_type=base_reg_type,
                            granular_phase="CONTINUOUS_TRADING",
                            is_continuous_trading=True,
                            is_order_entry_allowed=True,
                            order_type_allowed="ALL",
                            is_random_closure_interval=False,
                            random_closure_window=None,
                            description="Continuous Trading Session for CAS scrip under CAS 2.0 (09:15-15:30 IST)"
                        )
                    elif total_sec < t_cas2_trans_end:
                        return SecuritySessionEvaluation(
                            datetime_ist=dt_ist,
                            security_category=cat,
                            session_type=SessionType.SPECIAL_CAS,
                            granular_phase="CAS_TRANSITION",
                            is_continuous_trading=False,
                            is_order_entry_allowed=False,
                            order_type_allowed="NONE",
                            is_random_closure_interval=False,
                            random_closure_window=None,
                            description="CAS 2.0 Reference Price Calculation / Transition Buffer (15:30-15:31 IST)"
                        )
                    elif total_sec < t_cas2_entry_end:
                        return SecuritySessionEvaluation(
                            datetime_ist=dt_ist,
                            security_category=cat,
                            session_type=SessionType.SPECIAL_CAS,
                            granular_phase="CLOSING_AUCTION_ORDER_ENTRY",
                            is_continuous_trading=False,
                            is_order_entry_allowed=True,
                            order_type_allowed="ALL",
                            is_random_closure_interval=False,
                            random_closure_window=None,
                            description="CAS 2.0 Closing Auction Session Order Entry (Market & Limit orders, 15:31-15:36 IST)"
                        )
                    elif total_sec < t_cas2_limit_end:
                        is_rand = total_sec >= (15 * 3600 + 38 * 60)
                        rand_win = RANDOM_CLOSURE_WINDOWS["CAS_V2_REGULAR"] if is_rand else None
                        return SecuritySessionEvaluation(
                            datetime_ist=dt_ist,
                            security_category=cat,
                            session_type=SessionType.SPECIAL_CAS,
                            granular_phase="CAS_LIMIT_ONLY",
                            is_continuous_trading=False,
                            is_order_entry_allowed=True,
                            order_type_allowed="LIMIT_ONLY",
                            is_random_closure_interval=is_rand,
                            random_closure_window=rand_win,
                            description="CAS 2.0 Closing Auction Limit-Only Order Entry (Random closure window 15:38-15:40 IST)"
                        )
                    elif total_sec < t_cas2_match_end:
                        return SecuritySessionEvaluation(
                            datetime_ist=dt_ist,
                            security_category=cat,
                            session_type=SessionType.SPECIAL_CAS,
                            granular_phase="CLOSING_AUCTION_MATCHING",
                            is_continuous_trading=False,
                            is_order_entry_allowed=False,
                            order_type_allowed="NONE",
                            is_random_closure_interval=False,
                            random_closure_window=None,
                            description="CAS 2.0 Closing Auction Order Matching & Equilibrium Price Discovery (15:40-15:45 IST)"
                        )
                    elif total_sec < t_cas2_buf_end:
                        return SecuritySessionEvaluation(
                            datetime_ist=dt_ist,
                            security_category=cat,
                            session_type=SessionType.SPECIAL_CAS,
                            granular_phase="TRANSITION_PERIOD",
                            is_continuous_trading=False,
                            is_order_entry_allowed=False,
                            order_type_allowed="NONE",
                            is_random_closure_interval=False,
                            random_closure_window=None,
                            description="CAS 2.0 Post-Auction Transition Period & Trade Confirmation Buffer (15:45-15:50 IST)"
                        )
                    elif total_sec < t_post_end:
                        return SecuritySessionEvaluation(
                            datetime_ist=dt_ist,
                            security_category=cat,
                            session_type=SessionType.POST_CLOSE,
                            granular_phase="CLOSING_SESSION",
                            is_continuous_trading=False,
                            is_order_entry_allowed=True,
                            order_type_allowed="LIMIT_ONLY",
                            is_random_closure_interval=False,
                            random_closure_window=None,
                            description="Closing Session / Post-Close Trading at determined closing price (15:50-16:00 IST)"
                        )
                    else:
                        return SecuritySessionEvaluation(
                            datetime_ist=dt_ist,
                            security_category=cat,
                            session_type=SessionType.CLOSED,
                            granular_phase="CLOSED",
                            is_continuous_trading=False,
                            is_order_entry_allowed=False,
                            order_type_allowed="NONE",
                            is_random_closure_interval=False,
                            random_closure_window=None,
                            description="Market closed"
                        )
                else:
                    # NON_CAS under CAS_V2
                    if total_sec < t_cont_close:
                        return SecuritySessionEvaluation(
                            datetime_ist=dt_ist,
                            security_category=cat,
                            session_type=base_reg_type,
                            granular_phase="CONTINUOUS_TRADING",
                            is_continuous_trading=True,
                            is_order_entry_allowed=True,
                            order_type_allowed="ALL",
                            is_random_closure_interval=False,
                            random_closure_window=None,
                            description="Continuous Trading Session (09:15-15:30 IST)"
                        )
                    elif total_sec < t_cas2_limit_end:
                        return SecuritySessionEvaluation(
                            datetime_ist=dt_ist,
                            security_category=cat,
                            session_type=SessionType.SPECIAL_CAS,
                            granular_phase="BUFFER",
                            is_continuous_trading=False,
                            is_order_entry_allowed=False,
                            order_type_allowed="NONE",
                            is_random_closure_interval=False,
                            random_closure_window=None,
                            description="Post-continuous buffer before closing price determination (15:30-15:40 IST)"
                        )
                    elif total_sec < t_cas2_match_end:
                        return SecuritySessionEvaluation(
                            datetime_ist=dt_ist,
                            security_category=cat,
                            session_type=SessionType.SPECIAL_CAS,
                            granular_phase="CLOSING_AUCTION_MATCHING",
                            is_continuous_trading=False,
                            is_order_entry_allowed=False,
                            order_type_allowed="NONE",
                            is_random_closure_interval=False,
                            random_closure_window=None,
                            description="Closing Auction Order Matching Period (15:40-15:45 IST)"
                        )
                    elif total_sec < t_cas2_buf_end:
                        return SecuritySessionEvaluation(
                            datetime_ist=dt_ist,
                            security_category=cat,
                            session_type=SessionType.SPECIAL_CAS,
                            granular_phase="TRANSITION_PERIOD",
                            is_continuous_trading=False,
                            is_order_entry_allowed=False,
                            order_type_allowed="NONE",
                            is_random_closure_interval=False,
                            random_closure_window=None,
                            description="Post-Auction Transition Period & Trade Confirmation Buffer (15:45-15:50 IST)"
                        )
                    elif total_sec < t_post_end:
                        return SecuritySessionEvaluation(
                            datetime_ist=dt_ist,
                            security_category=cat,
                            session_type=SessionType.POST_CLOSE,
                            granular_phase="CLOSING_SESSION",
                            is_continuous_trading=False,
                            is_order_entry_allowed=True,
                            order_type_allowed="LIMIT_ONLY",
                            is_random_closure_interval=False,
                            random_closure_window=None,
                            description="Closing Session / Post-Close Trading at determined closing price (15:50-16:00 IST)"
                        )
                    else:
                        return SecuritySessionEvaluation(
                            datetime_ist=dt_ist,
                            security_category=cat,
                            session_type=SessionType.CLOSED,
                            granular_phase="CLOSED",
                            is_continuous_trading=False,
                            is_order_entry_allowed=False,
                            order_type_allowed="NONE",
                            is_random_closure_interval=False,
                            random_closure_window=None,
                            description="Market closed"
                        )
            elif regime in (CalendarRegime.CAS_V1, CalendarRegime.MODERN_CAS_2026):
                # Modern CAS Architecture (effective 2026-08-03 per SEBI & NSE circulars)
                t_cas_cont_end = 15 * 3600 + 15 * 60   # 15:15:00
                t_cas_trans_end = 15 * 3600 + 20 * 60  # 15:20:00
                t_cas_entry_end = 15 * 3600 + 28 * 60  # 15:28:00
                t_cont_close = 15 * 3600 + 30 * 60     # 15:30:00
                t_cas_match_end = 15 * 3600 + 35 * 60  # 15:35:00
                t_cas_buf_end = 15 * 3600 + 50 * 60    # 15:50:00
                t_post_end = 16 * 3600                 # 16:00:00

                if cat == SecurityCategory.CAS_ELIGIBLE:
                    if total_sec < t_cas_cont_end:
                        return SecuritySessionEvaluation(
                            datetime_ist=dt_ist,
                            security_category=cat,
                            session_type=base_reg_type,
                            granular_phase="CONTINUOUS_TRADING",
                            is_continuous_trading=True,
                            is_order_entry_allowed=True,
                            order_type_allowed="ALL",
                            is_random_closure_interval=False,
                            random_closure_window=None,
                            description="Continuous Trading Session for CAS scrip (09:15-15:15 IST)"
                        )
                    elif total_sec < t_cas_trans_end:
                        return SecuritySessionEvaluation(
                            datetime_ist=dt_ist,
                            security_category=cat,
                            session_type=SessionType.SPECIAL_CAS,
                            granular_phase="CAS_TRANSITION",
                            is_continuous_trading=False,
                            is_order_entry_allowed=False,
                            order_type_allowed="NONE",
                            is_random_closure_interval=False,
                            random_closure_window=None,
                            description="CAS Reference Price Calculation / Transition Buffer"
                        )
                    elif total_sec < t_cas_entry_end:
                        return SecuritySessionEvaluation(
                            datetime_ist=dt_ist,
                            security_category=cat,
                            session_type=SessionType.SPECIAL_CAS,
                            granular_phase="CLOSING_AUCTION_ORDER_ENTRY",
                            is_continuous_trading=False,
                            is_order_entry_allowed=True,
                            order_type_allowed="ALL",
                            is_random_closure_interval=False,
                            random_closure_window=None,
                            description="Closing Auction Session Order Entry (Market & Limit orders)"
                        )
                    elif total_sec < t_cont_close:
                        is_rand = total_sec >= (15 * 3600 + 28 * 60)
                        rand_win = RANDOM_CLOSURE_WINDOWS["MODERN_CAS_REGULAR"] if is_rand else None
                        return SecuritySessionEvaluation(
                            datetime_ist=dt_ist,
                            security_category=cat,
                            session_type=SessionType.SPECIAL_CAS,
                            granular_phase="CAS_LIMIT_ONLY",
                            is_continuous_trading=False,
                            is_order_entry_allowed=True,
                            order_type_allowed="LIMIT_ONLY",
                            is_random_closure_interval=is_rand,
                            random_closure_window=rand_win,
                            description="Closing Auction Limit-Only Order Entry (Random closure window 15:28-15:30)"
                        )
                    elif total_sec < t_cas_match_end:
                        return SecuritySessionEvaluation(
                            datetime_ist=dt_ist,
                            security_category=cat,
                            session_type=SessionType.SPECIAL_CAS,
                            granular_phase="CLOSING_AUCTION_MATCHING",
                            is_continuous_trading=False,
                            is_order_entry_allowed=False,
                            order_type_allowed="NONE",
                            is_random_closure_interval=False,
                            random_closure_window=None,
                            description="Closing Auction Order Matching & Equilibrium Price Discovery"
                        )
                    elif total_sec < t_cas_buf_end:
                        return SecuritySessionEvaluation(
                            datetime_ist=dt_ist,
                            security_category=cat,
                            session_type=SessionType.SPECIAL_CAS,
                            granular_phase="TRANSITION_PERIOD",
                            is_continuous_trading=False,
                            is_order_entry_allowed=False,
                            order_type_allowed="NONE",
                            is_random_closure_interval=False,
                            random_closure_window=None,
                            description="Post-Auction Transition Period & Trade Confirmation Buffer"
                        )
                    elif total_sec < t_post_end:
                        return SecuritySessionEvaluation(
                            datetime_ist=dt_ist,
                            security_category=cat,
                            session_type=SessionType.POST_CLOSE,
                            granular_phase="CLOSING_SESSION",
                            is_continuous_trading=False,
                            is_order_entry_allowed=True,
                            order_type_allowed="LIMIT_ONLY",
                            is_random_closure_interval=False,
                            random_closure_window=None,
                            description="Closing Session / Post-Close Trading at determined closing price"
                        )
                    else:
                        return SecuritySessionEvaluation(
                            datetime_ist=dt_ist,
                            security_category=cat,
                            session_type=SessionType.CLOSED,
                            granular_phase="CLOSED",
                            is_continuous_trading=False,
                            is_order_entry_allowed=False,
                            order_type_allowed="NONE",
                            is_random_closure_interval=False,
                            random_closure_window=None,
                            description="Market closed"
                        )
                else:
                    # NON_CAS (Continuous market runs up to 15:30:00)
                    if total_sec < t_cont_close:
                        return SecuritySessionEvaluation(
                            datetime_ist=dt_ist,
                            security_category=cat,
                            session_type=base_reg_type,
                            granular_phase="CONTINUOUS_TRADING",
                            is_continuous_trading=True,
                            is_order_entry_allowed=True,
                            order_type_allowed="ALL",
                            is_random_closure_interval=False,
                            random_closure_window=None,
                            description="Continuous Trading Session (09:15-15:30 IST)"
                        )
                    elif total_sec < t_cas_match_end:
                        return SecuritySessionEvaluation(
                            datetime_ist=dt_ist,
                            security_category=cat,
                            session_type=SessionType.SPECIAL_CAS,
                            granular_phase="CLOSING_AUCTION_MATCHING",
                            is_continuous_trading=False,
                            is_order_entry_allowed=False,
                            order_type_allowed="NONE",
                            is_random_closure_interval=False,
                            random_closure_window=None,
                            description="Closing Auction Order Matching Period"
                        )
                    elif total_sec < t_cas_buf_end:
                        return SecuritySessionEvaluation(
                            datetime_ist=dt_ist,
                            security_category=cat,
                            session_type=SessionType.SPECIAL_CAS,
                            granular_phase="TRANSITION_PERIOD",
                            is_continuous_trading=False,
                            is_order_entry_allowed=False,
                            order_type_allowed="NONE",
                            is_random_closure_interval=False,
                            random_closure_window=None,
                            description="Post-Auction Transition Period & Trade Confirmation Buffer"
                        )
                    elif total_sec < t_post_end:
                        return SecuritySessionEvaluation(
                            datetime_ist=dt_ist,
                            security_category=cat,
                            session_type=SessionType.POST_CLOSE,
                            granular_phase="CLOSING_SESSION",
                            is_continuous_trading=False,
                            is_order_entry_allowed=True,
                            order_type_allowed="LIMIT_ONLY",
                            is_random_closure_interval=False,
                            random_closure_window=None,
                            description="Closing Session / Post-Close Trading at determined closing price"
                        )
                    else:
                        return SecuritySessionEvaluation(
                            datetime_ist=dt_ist,
                            security_category=cat,
                            session_type=SessionType.CLOSED,
                            granular_phase="CLOSED",
                            is_continuous_trading=False,
                            is_order_entry_allowed=False,
                            order_type_allowed="NONE",
                            is_random_closure_interval=False,
                            random_closure_window=None,
                            description="Market closed"
                        )
            else:
                # LEGACY_PRE_CAS Regime (NSE/CMTR/13444, 2010 to 2026-08-02)
                t_cont_close = 15 * 3600 + 30 * 60    # 15:30:00
                t_post_start = 15 * 3600 + 40 * 60    # 15:40:00
                t_post_end = 16 * 3600                # 16:00:00

                if total_sec < t_cont_close:
                    return SecuritySessionEvaluation(
                        datetime_ist=dt_ist,
                        security_category=cat,
                        session_type=base_reg_type,
                        granular_phase="CONTINUOUS_TRADING",
                        is_continuous_trading=True,
                        is_order_entry_allowed=True,
                        order_type_allowed="ALL",
                        is_random_closure_interval=False,
                        random_closure_window=None,
                        description="Continuous Trading Session (09:15-15:30 IST)"
                    )
                elif total_sec < t_post_start:
                    return SecuritySessionEvaluation(
                        datetime_ist=dt_ist,
                        security_category=cat,
                        session_type=SessionType.CLOSED,
                        granular_phase="BUFFER",
                        is_continuous_trading=False,
                        is_order_entry_allowed=False,
                        order_type_allowed="NONE",
                        is_random_closure_interval=False,
                        random_closure_window=None,
                        description="Closing price calculation buffer"
                    )
                elif total_sec < t_post_end:
                    return SecuritySessionEvaluation(
                        datetime_ist=dt_ist,
                        security_category=cat,
                        session_type=SessionType.POST_CLOSE,
                        granular_phase="CLOSING_SESSION",
                        is_continuous_trading=False,
                        is_order_entry_allowed=True,
                        order_type_allowed="LIMIT_ONLY",
                        is_random_closure_interval=False,
                        random_closure_window=None,
                        description="Closing Session / Post-Close Trading at determined closing price"
                    )
                else:
                    return SecuritySessionEvaluation(
                        datetime_ist=dt_ist,
                        security_category=cat,
                        session_type=SessionType.CLOSED,
                        granular_phase="CLOSED",
                        is_continuous_trading=False,
                        is_order_entry_allowed=False,
                        order_type_allowed="NONE",
                        is_random_closure_interval=False,
                        random_closure_window=None,
                        description="Market closed"
                    )

    @classmethod
    def evaluate_candle_session(
        cls,
        dt: datetime,
        timeframe_sec: int = 60,
        convention: CandleTimestampConvention | str = CandleTimestampConvention.START_OF_INTERVAL,
        security_category: SecurityCategory | str = SecurityCategory.NON_CAS,
        exchange: str = "NSE",
        calendar_regime: Optional[CalendarRegime | str] = None,
        timeframe_minutes: Optional[int] = None,
        ignore_holidays: bool = False
    ) -> SecuritySessionEvaluation:
        """
        Evaluate session state for an OHLC candle bar, respecting candle duration and timestamp convention.
        
        Under START_OF_INTERVAL:
            The bar spans [dt, dt + timeframe_sec).
            For 1m regular equity (09:15-15:30):
            - Bar 09:15:00 spans [09:15, 09:16) -> CONTINUOUS_TRADING (is_continuous_trading=True)
            - Bar 15:29:00 spans [15:29, 15:30) -> CONTINUOUS_TRADING (is_continuous_trading=True)
            - Bar 15:30:00 spans [15:30, 15:31) -> BUFFER / CLOSING_AUCTION_MATCHING (is_continuous_trading=False)
            
        Under END_OF_INTERVAL:
            The bar spans [dt - timeframe_sec, dt).
            For 1m regular equity (09:15-15:30):
            - Bar 09:15:00 spans [09:14, 09:15) -> PRE_OPEN_BUFFER (is_continuous_trading=False)
            - Bar 09:16:00 spans [09:15, 09:16) -> CONTINUOUS_TRADING (is_continuous_trading=True)
            - Bar 15:30:00 spans [15:29, 15:30) -> CONTINUOUS_TRADING (is_continuous_trading=True)
            - Bar 15:31:00 spans [15:30, 15:31) -> BUFFER / CLOSING_AUCTION_MATCHING (is_continuous_trading=False)
        """
        if timeframe_minutes is not None:
            timeframe_sec = timeframe_minutes * 60
        conv = CandleTimestampConvention(convention) if isinstance(convention, str) else convention
        dt_ist = cls.to_ist(dt)
        delta = timedelta(seconds=timeframe_sec)

        if conv == CandleTimestampConvention.START_OF_INTERVAL:
            bar_start = dt_ist
            bar_end = dt_ist + delta
        else:
            bar_start = dt_ist - delta
            bar_end = dt_ist

        eval_start = cls.evaluate_session_instant(bar_start, security_category, exchange, calendar_regime=calendar_regime, ignore_holidays=ignore_holidays)
        if not eval_start.is_continuous_trading:
            return eval_start

        # Check instant immediately preceding bar_end
        instant_before_end = bar_end - timedelta(microseconds=1)
        eval_end = cls.evaluate_session_instant(instant_before_end, security_category, exchange, calendar_regime=calendar_regime, ignore_holidays=ignore_holidays)

        if not eval_end.is_continuous_trading:
            return SecuritySessionEvaluation(
                datetime_ist=dt_ist,
                security_category=eval_start.security_category,
                session_type=eval_end.session_type,
                granular_phase=eval_end.granular_phase,
                is_continuous_trading=False,
                is_order_entry_allowed=False,
                order_type_allowed="NONE",
                is_random_closure_interval=False,
                random_closure_window=None,
                description=f"Candle spans beyond continuous trading close ({eval_start.granular_phase} to {eval_end.granular_phase})"
            )

        return eval_start

    # Alias for candle evaluation
    evaluate_candle_bar = evaluate_candle_session

    @classmethod
    def evaluate_security_session(
        cls,
        dt: datetime,
        security_category: SecurityCategory | str,
        exchange: str = "NSE",
        endpoint_inclusive: bool = True,
        calendar_regime: Optional[CalendarRegime | str] = None,
        ignore_holidays: bool = False
    ) -> SecuritySessionEvaluation:
        """
        Evaluate complete security-specific session state, continuous trading availability,
        order-entry permissions, and random closure intervals.

        When endpoint_inclusive=False, strictly enforces exclusive closing boundaries [T_start, T_end)
        delegating directly to evaluate_session_instant.
        When endpoint_inclusive=True (default for backward compatibility), maintains inclusive closing
        endpoints (e.g. 15:30:00 as continuous trading and 16:00:00 as closing session).

        Source of Truth Circulars:
        - Modern CAS Regime: SEBI HO/47/11/11(3)2025-MRD-POD2/I/2765/2026, NSE/CMTR/73362, NSE/CMTR/74466 (effective 2026-08-03)
        - Diwali Muhurat 2026: NSE/CMTR/76941 (19 Oct 2026)
        - Special Pre-Open Session (SPOS) for IPOs: SEBI/CIR/MRD/DP/01/2012
        - Periodic Call Auction for Illiquid Securities (PCAIS): SEBI/CIR/MRD/DP/6/2013
        - DR Site Live Trading: NSE/MSD/73126 (5 Mar 2026)
        - Annual Holidays: NSE/CMTR/71775 & NSE/CMTR/72260
        - Historical Pre-CAS Schedule: NSE/CMTR/13444 (effective 2010-01-04 to 2026-08-02)
        """
        if not endpoint_inclusive:
            return cls.evaluate_session_instant(dt, security_category, exchange, calendar_regime=calendar_regime)
        cat = cls.validate_security_category(security_category)
        dt_ist = cls.to_ist(dt)
        d = dt_ist.date()
        t = dt_ist.time()
        total_sec = t.hour * 3600 + t.minute * 60 + t.second

        # 1. Diwali Muhurat Session (Sunday 2026-11-08)
        if d == MUHURAT_SESSION_2026["date"]:
            t_block_start = 13 * 3600 + 50 * 60   # 13:50:00
            t_block_end = 14 * 3600 + 5 * 60      # 14:05:00
            t_pre_start = 14 * 3600 + 5 * 60      # 14:05:00
            t_pre_limit = 14 * 3600 + 10 * 60     # 14:10:00
            t_pre_match = 14 * 3600 + 15 * 60     # 14:15:00
            t_pre_buf = 14 * 3600 + 17 * 60       # 14:17:00
            t_pre_end = 14 * 3600 + 20 * 60       # 14:20:00
            t_cont_open = 14 * 3600 + 20 * 60     # 14:20:00
            t_cas_cont_end = 15 * 3600 + 15 * 60  # 15:15:00
            t_cas_trans_end = 15 * 3600 + 20 * 60 # 15:20:00
            t_cas_entry_end = 15 * 3600 + 25 * 60 # 15:25:00
            t_cas_limit_end = 15 * 3600 + 30 * 60 # 15:30:00
            t_cas_match_end = 15 * 3600 + 35 * 60 # 15:35:00
            t_cas_buf_end = 15 * 3600 + 50 * 60   # 15:50:00
            t_post_start = 15 * 3600 + 50 * 60    # 15:50:00
            t_post_end = 16 * 3600                # 16:00:00

            if total_sec < t_block_start:
                return SecuritySessionEvaluation(
                    datetime_ist=dt_ist,
                    security_category=cat,
                    session_type=SessionType.CLOSED,
                    granular_phase="CLOSED",
                    is_continuous_trading=False,
                    is_order_entry_allowed=False,
                    order_type_allowed="NONE",
                    is_random_closure_interval=False,
                    random_closure_window=None,
                    description="Market closed before Muhurat session"
                )
            elif total_sec < t_block_end:
                return SecuritySessionEvaluation(
                    datetime_ist=dt_ist,
                    security_category=cat,
                    session_type=SessionType.BLOCK_DEAL,
                    granular_phase="BLOCK_DEAL",
                    is_continuous_trading=False,
                    is_order_entry_allowed=False,
                    order_type_allowed="NONE",
                    is_random_closure_interval=False,
                    random_closure_window=None,
                    description="Bilateral block deal session window per circular NSE/CMTR/76941"
                )
            elif total_sec < t_pre_limit:
                return SecuritySessionEvaluation(
                    datetime_ist=dt_ist,
                    security_category=cat,
                    session_type=SessionType.PRE_OPEN,
                    granular_phase="PRE_OPEN_ENTRY",
                    is_continuous_trading=False,
                    is_order_entry_allowed=True,
                    order_type_allowed="ALL",
                    is_random_closure_interval=False,
                    random_closure_window=None,
                    description="Muhurat Pre-Open Order Entry (Market & Limit orders)"
                )
            elif total_sec < t_pre_match:
                is_rand = total_sec >= (14 * 3600 + 13 * 60)
                rand_win = RANDOM_CLOSURE_WINDOWS["MUHURAT_PRE_OPEN"] if is_rand else None
                return SecuritySessionEvaluation(
                    datetime_ist=dt_ist,
                    security_category=cat,
                    session_type=SessionType.PRE_OPEN,
                    granular_phase="PRE_OPEN_LIMIT_ONLY",
                    is_continuous_trading=False,
                    is_order_entry_allowed=True,
                    order_type_allowed="LIMIT_ONLY",
                    is_random_closure_interval=is_rand,
                    random_closure_window=rand_win,
                    description="Muhurat Pre-Open Limit-Only Order Entry (Random closure window 14:13-14:15)"
                )
            elif total_sec < t_pre_buf:
                return SecuritySessionEvaluation(
                    datetime_ist=dt_ist,
                    security_category=cat,
                    session_type=SessionType.PRE_OPEN,
                    granular_phase="PRE_OPEN_MATCHING",
                    is_continuous_trading=False,
                    is_order_entry_allowed=False,
                    order_type_allowed="NONE",
                    is_random_closure_interval=False,
                    random_closure_window=None,
                    description="Muhurat Pre-Open Order Matching & Trade Confirmation"
                )
            elif total_sec < t_cont_open:
                return SecuritySessionEvaluation(
                    datetime_ist=dt_ist,
                    security_category=cat,
                    session_type=SessionType.PRE_OPEN,
                    granular_phase="PRE_OPEN_BUFFER",
                    is_continuous_trading=False,
                    is_order_entry_allowed=False,
                    order_type_allowed="NONE",
                    is_random_closure_interval=False,
                    random_closure_window=None,
                    description="Muhurat Pre-Open Transition Buffer"
                )
            elif total_sec < t_cas_cont_end:
                # 14:20 to 15:15: Continuous Trading for all eligible
                if cat == SecurityCategory.ILLIQUID_CALL_AUCTION:
                    return SecuritySessionEvaluation(
                        datetime_ist=dt_ist,
                        security_category=cat,
                        session_type=SessionType.CLOSED,
                        granular_phase="CLOSED",
                        is_continuous_trading=False,
                        is_order_entry_allowed=False,
                        order_type_allowed="NONE",
                        is_random_closure_interval=False,
                        random_closure_window=None,
                        description="Illiquid securities have zero continuous trading"
                    )
                return SecuritySessionEvaluation(
                    datetime_ist=dt_ist,
                    security_category=cat,
                    session_type=SessionType.SPECIAL_MUHURAT,
                    granular_phase="CONTINUOUS_TRADING",
                    is_continuous_trading=True,
                    is_order_entry_allowed=True,
                    order_type_allowed="ALL",
                    is_random_closure_interval=False,
                    random_closure_window=None,
                    description="Diwali Muhurat Continuous Trading Session"
                )
            elif total_sec < t_cas_trans_end:
                # 15:15 to 15:20
                if cat == SecurityCategory.CAS_ELIGIBLE:
                    return SecuritySessionEvaluation(
                        datetime_ist=dt_ist,
                        security_category=cat,
                        session_type=SessionType.SPECIAL_CAS,
                        granular_phase="CAS_TRANSITION",
                        is_continuous_trading=False,
                        is_order_entry_allowed=False,
                        order_type_allowed="NONE",
                        is_random_closure_interval=False,
                        random_closure_window=None,
                        description="Muhurat CAS Reference Price Calculation / Transition"
                    )
                elif cat == SecurityCategory.NON_CAS:
                    return SecuritySessionEvaluation(
                        datetime_ist=dt_ist,
                        security_category=cat,
                        session_type=SessionType.SPECIAL_MUHURAT,
                        granular_phase="CONTINUOUS_TRADING",
                        is_continuous_trading=True,
                        is_order_entry_allowed=True,
                        order_type_allowed="ALL",
                        is_random_closure_interval=False,
                        random_closure_window=None,
                        description="Muhurat Continuous Trading Session (Non-CAS continues to 15:30)"
                    )
                else:
                    return SecuritySessionEvaluation(
                        datetime_ist=dt_ist,
                        security_category=cat,
                        session_type=SessionType.CLOSED,
                        granular_phase="CLOSED",
                        is_continuous_trading=False,
                        is_order_entry_allowed=False,
                        order_type_allowed="NONE",
                        is_random_closure_interval=False,
                        random_closure_window=None,
                        description="Closed"
                    )
            elif total_sec < t_cas_entry_end:
                # 15:20 to 15:25
                if cat == SecurityCategory.CAS_ELIGIBLE:
                    return SecuritySessionEvaluation(
                        datetime_ist=dt_ist,
                        security_category=cat,
                        session_type=SessionType.SPECIAL_CAS,
                        granular_phase="CLOSING_AUCTION_ENTRY",
                        is_continuous_trading=False,
                        is_order_entry_allowed=True,
                        order_type_allowed="ALL",
                        is_random_closure_interval=False,
                        random_closure_window=None,
                        description="Muhurat CAS Order Entry (Market & Limit orders)"
                    )
                elif cat == SecurityCategory.NON_CAS:
                    return SecuritySessionEvaluation(
                        datetime_ist=dt_ist,
                        security_category=cat,
                        session_type=SessionType.SPECIAL_MUHURAT,
                        granular_phase="CONTINUOUS_TRADING",
                        is_continuous_trading=True,
                        is_order_entry_allowed=True,
                        order_type_allowed="ALL",
                        is_random_closure_interval=False,
                        random_closure_window=None,
                        description="Muhurat Continuous Trading Session (Non-CAS continues to 15:30)"
                    )
                else:
                    return SecuritySessionEvaluation(
                        datetime_ist=dt_ist,
                        security_category=cat,
                        session_type=SessionType.CLOSED,
                        granular_phase="CLOSED",
                        is_continuous_trading=False,
                        is_order_entry_allowed=False,
                        order_type_allowed="NONE",
                        is_random_closure_interval=False,
                        random_closure_window=None,
                        description="Closed"
                    )
            elif total_sec < t_cas_limit_end:
                # 15:25 to 15:30
                if cat == SecurityCategory.CAS_ELIGIBLE:
                    is_rand = total_sec >= (15 * 3600 + 28 * 60)
                    rand_win = RANDOM_CLOSURE_WINDOWS["MUHURAT_CAS"] if is_rand else None
                    return SecuritySessionEvaluation(
                        datetime_ist=dt_ist,
                        security_category=cat,
                        session_type=SessionType.SPECIAL_CAS,
                        granular_phase="CAS_LIMIT_ONLY",
                        is_continuous_trading=False,
                        is_order_entry_allowed=True,
                        order_type_allowed="LIMIT_ONLY",
                        is_random_closure_interval=is_rand,
                        random_closure_window=rand_win,
                        description="Muhurat CAS Limit-Only Entry (Random closure window 15:28-15:30)"
                    )
                elif cat == SecurityCategory.NON_CAS:
                    return SecuritySessionEvaluation(
                        datetime_ist=dt_ist,
                        security_category=cat,
                        session_type=SessionType.SPECIAL_MUHURAT,
                        granular_phase="CONTINUOUS_TRADING",
                        is_continuous_trading=True,
                        is_order_entry_allowed=True,
                        order_type_allowed="ALL",
                        is_random_closure_interval=False,
                        random_closure_window=None,
                        description="Muhurat Continuous Trading Session (Non-CAS continues to 15:30)"
                    )
                else:
                    return SecuritySessionEvaluation(
                        datetime_ist=dt_ist,
                        security_category=cat,
                        session_type=SessionType.CLOSED,
                        granular_phase="CLOSED",
                        is_continuous_trading=False,
                        is_order_entry_allowed=False,
                        order_type_allowed="NONE",
                        is_random_closure_interval=False,
                        random_closure_window=None,
                        description="Closed"
                    )
            elif total_sec < t_cas_match_end:
                # 15:30 to 15:35
                if cat == SecurityCategory.CAS_ELIGIBLE:
                    return SecuritySessionEvaluation(
                        datetime_ist=dt_ist,
                        security_category=cat,
                        session_type=SessionType.SPECIAL_CAS,
                        granular_phase="CLOSING_AUCTION_MATCHING",
                        is_continuous_trading=False,
                        is_order_entry_allowed=False,
                        order_type_allowed="NONE",
                        is_random_closure_interval=False,
                        random_closure_window=None,
                        description="Muhurat CAS Order Matching & Price Discovery"
                    )
                else:
                    return SecuritySessionEvaluation(
                        datetime_ist=dt_ist,
                        security_category=cat,
                        session_type=SessionType.CLOSED,
                        granular_phase="CLOSED",
                        is_continuous_trading=False,
                        is_order_entry_allowed=False,
                        order_type_allowed="NONE",
                        is_random_closure_interval=False,
                        random_closure_window=None,
                        description="Normal market closed at 15:30"
                    )
            elif total_sec < t_cas_buf_end:
                # 15:35 to 15:50
                if cat == SecurityCategory.CAS_ELIGIBLE:
                    return SecuritySessionEvaluation(
                        datetime_ist=dt_ist,
                        security_category=cat,
                        session_type=SessionType.SPECIAL_CAS,
                        granular_phase="CAS_TRANSITION_BUFFER",
                        is_continuous_trading=False,
                        is_order_entry_allowed=False,
                        order_type_allowed="NONE",
                        is_random_closure_interval=False,
                        random_closure_window=None,
                        description="Muhurat CAS Post-Auction Buffer & Reconciliation"
                    )
                else:
                    return SecuritySessionEvaluation(
                        datetime_ist=dt_ist,
                        security_category=cat,
                        session_type=SessionType.CLOSED,
                        granular_phase="CLOSED",
                        is_continuous_trading=False,
                        is_order_entry_allowed=False,
                        order_type_allowed="NONE",
                        is_random_closure_interval=False,
                        random_closure_window=None,
                        description="Normal market closed at 15:30"
                    )
            elif total_sec <= t_post_end:
                # 15:50 to 16:00
                return SecuritySessionEvaluation(
                    datetime_ist=dt_ist,
                    security_category=cat,
                    session_type=SessionType.POST_CLOSE,
                    granular_phase="CLOSING_SESSION",
                    is_continuous_trading=False,
                    is_order_entry_allowed=True,
                    order_type_allowed="LIMIT_ONLY",
                    is_random_closure_interval=False,
                    random_closure_window=None,
                    description="Official Closing Session / Post-Close Trading at determined closing price"
                )
            else:
                return SecuritySessionEvaluation(
                    datetime_ist=dt_ist,
                    security_category=cat,
                    session_type=SessionType.CLOSED,
                    granular_phase="CLOSED",
                    is_continuous_trading=False,
                    is_order_entry_allowed=False,
                    order_type_allowed="NONE",
                    is_random_closure_interval=False,
                    random_closure_window=None,
                    description="Market closed"
                )

        # 2. Weekends & Official Holidays
        if not ignore_holidays and calendar_regime is None and (dt_ist.weekday() >= 5 or cls.is_holiday(d)):
            return SecuritySessionEvaluation(
                datetime_ist=dt_ist,
                security_category=cat,
                session_type=SessionType.CLOSED,
                granular_phase="CLOSED",
                is_continuous_trading=False,
                is_order_entry_allowed=False,
                order_type_allowed="NONE",
                is_random_closure_interval=False,
                random_closure_window=None,
                description="Market closed (Weekend or Exchange Holiday)"
            )

        # Base regular session type (SPECIAL_DR on DR days, REGULAR on standard days)
        base_reg_type = SessionType.SPECIAL_DR if cls.is_dr_session(dt_ist) else SessionType.REGULAR

        # 3. Special Pre-Open Session (SPOS) for IPO / Relisted Securities
        if cat == SecurityCategory.SPECIAL_PREOPEN_IPO:
            if calendar_regime is not None:
                reg_val = calendar_regime.value if isinstance(calendar_regime, CalendarRegime) else str(calendar_regime)
                if reg_val == "CAS_V2":
                    spos_regime = CalendarRegime.CAS_V2
                elif reg_val in ("CAS_V1", "MODERN_CAS_2026"):
                    spos_regime = CalendarRegime.CAS_V1
                else:
                    spos_regime = CalendarRegime.LEGACY_PRE_CAS
            else:
                if d < CAS_V1_GO_LIVE_DATE:
                    spos_regime = CalendarRegime.LEGACY_PRE_CAS
                elif d <= CAS_V1_SUNSET_DATE:
                    spos_regime = CalendarRegime.CAS_V1
                else:
                    spos_regime = CalendarRegime.CAS_V2

            t_spos_start = 9 * 3600               # 09:00:00
            t_spos_rand_start = 9 * 3600 + 35 * 60 # 09:35:00
            t_spos_entry_end = 9 * 3600 + 45 * 60  # 09:45:00
            t_spos_match_end = 9 * 3600 + 55 * 60  # 09:55:00
            t_spos_cont_open = 10 * 3600           # 10:00:00
            t_mkt_close = 15 * 3600 + 30 * 60      # 15:30:00
            t_cas_match_end = 15 * 3600 + 35 * 60 if spos_regime == CalendarRegime.CAS_V1 else (15 * 3600 + 45 * 60 if spos_regime == CalendarRegime.CAS_V2 else 15 * 3600 + 40 * 60)
            t_post_start = 15 * 3600 + 50 * 60 if spos_regime in (CalendarRegime.CAS_V1, CalendarRegime.CAS_V2) else 15 * 3600 + 40 * 60
            t_post_end = 16 * 3600                 # 16:00:00

            if total_sec < t_spos_start:
                return SecuritySessionEvaluation(
                    datetime_ist=dt_ist,
                    security_category=cat,
                    session_type=SessionType.CLOSED,
                    granular_phase="CLOSED",
                    is_continuous_trading=False,
                    is_order_entry_allowed=False,
                    order_type_allowed="NONE",
                    is_random_closure_interval=False,
                    random_closure_window=None,
                    description="Pre-market closed before SPOS"
                )
            elif total_sec < t_spos_rand_start:
                return SecuritySessionEvaluation(
                    datetime_ist=dt_ist,
                    security_category=cat,
                    session_type=SessionType.SPECIAL_PREOPEN,
                    granular_phase="SPOS_ORDER_ENTRY",
                    is_continuous_trading=False,
                    is_order_entry_allowed=True,
                    order_type_allowed="ALL",
                    is_random_closure_interval=False,
                    random_closure_window=None,
                    description="Special Pre-Open Session Order Entry (Market & Limit orders)"
                )
            elif total_sec < t_spos_entry_end:
                rand_win = RANDOM_CLOSURE_WINDOWS["SPOS_IPO"]
                return SecuritySessionEvaluation(
                    datetime_ist=dt_ist,
                    security_category=cat,
                    session_type=SessionType.SPECIAL_PREOPEN,
                    granular_phase="SPOS_ORDER_ENTRY",
                    is_continuous_trading=False,
                    is_order_entry_allowed=True,
                    order_type_allowed="ALL",
                    is_random_closure_interval=True,
                    random_closure_window=rand_win,
                    description="Special Pre-Open Session Order Entry (Random closure window 09:35-09:45)"
                )
            elif total_sec < t_spos_match_end:
                return SecuritySessionEvaluation(
                    datetime_ist=dt_ist,
                    security_category=cat,
                    session_type=SessionType.SPECIAL_PREOPEN,
                    granular_phase="SPOS_MATCHING",
                    is_continuous_trading=False,
                    is_order_entry_allowed=False,
                    order_type_allowed="NONE",
                    is_random_closure_interval=False,
                    random_closure_window=None,
                    description="Special Pre-Open Session Order Matching & Price Discovery"
                )
            elif total_sec < t_spos_cont_open:
                return SecuritySessionEvaluation(
                    datetime_ist=dt_ist,
                    security_category=cat,
                    session_type=SessionType.SPECIAL_PREOPEN,
                    granular_phase="SPOS_BUFFER",
                    is_continuous_trading=False,
                    is_order_entry_allowed=False,
                    order_type_allowed="NONE",
                    is_random_closure_interval=False,
                    random_closure_window=None,
                    description="Special Pre-Open Session Buffer Period before Continuous Trading"
                )
            elif total_sec <= t_mkt_close:
                return SecuritySessionEvaluation(
                    datetime_ist=dt_ist,
                    security_category=cat,
                    session_type=base_reg_type,
                    granular_phase="CONTINUOUS_TRADING",
                    is_continuous_trading=True,
                    is_order_entry_allowed=True,
                    order_type_allowed="ALL",
                    is_random_closure_interval=False,
                    random_closure_window=None,
                    description="Continuous Trading for IPO/Relisted Security (10:00-15:30 IST)"
                )
            elif total_sec < t_post_start:
                if spos_regime == CalendarRegime.CAS_V2:
                    if total_sec < (15 * 3600 + 40 * 60):
                        return SecuritySessionEvaluation(
                            datetime_ist=dt_ist,
                            security_category=cat,
                            session_type=SessionType.SPECIAL_CAS,
                            granular_phase="BUFFER",
                            is_continuous_trading=False,
                            is_order_entry_allowed=False,
                            order_type_allowed="NONE",
                            is_random_closure_interval=False,
                            random_closure_window=None,
                            description="SPOS scrip post-continuous buffer before CAS 2.0 matching"
                        )
                    elif total_sec < (15 * 3600 + 45 * 60):
                        return SecuritySessionEvaluation(
                            datetime_ist=dt_ist,
                            security_category=cat,
                            session_type=SessionType.SPECIAL_CAS,
                            granular_phase="CLOSING_AUCTION_MATCHING",
                            is_continuous_trading=False,
                            is_order_entry_allowed=False,
                            order_type_allowed="NONE",
                            is_random_closure_interval=False,
                            random_closure_window=None,
                            description="SPOS scrip closing auction matching period"
                        )
                    else:
                        return SecuritySessionEvaluation(
                            datetime_ist=dt_ist,
                            security_category=cat,
                            session_type=SessionType.SPECIAL_CAS,
                            granular_phase="TRANSITION_PERIOD",
                            is_continuous_trading=False,
                            is_order_entry_allowed=False,
                            order_type_allowed="NONE",
                            is_random_closure_interval=False,
                            random_closure_window=None,
                            description="SPOS scrip post-auction transition period buffer"
                        )
                elif spos_regime in (CalendarRegime.CAS_V1, CalendarRegime.MODERN_CAS_2026):
                    if total_sec < t_cas_match_end:
                        return SecuritySessionEvaluation(
                            datetime_ist=dt_ist,
                            security_category=cat,
                            session_type=SessionType.SPECIAL_CAS,
                            granular_phase="CLOSING_AUCTION_MATCHING",
                            is_continuous_trading=False,
                            is_order_entry_allowed=False,
                            order_type_allowed="NONE",
                            is_random_closure_interval=False,
                            random_closure_window=None,
                            description="SPOS scrip closing auction matching period"
                        )
                    else:
                        return SecuritySessionEvaluation(
                            datetime_ist=dt_ist,
                            security_category=cat,
                            session_type=SessionType.SPECIAL_CAS,
                            granular_phase="TRANSITION_PERIOD",
                            is_continuous_trading=False,
                            is_order_entry_allowed=False,
                            order_type_allowed="NONE",
                            is_random_closure_interval=False,
                            random_closure_window=None,
                            description="SPOS scrip post-auction transition period buffer"
                        )
                else:
                    return SecuritySessionEvaluation(
                        datetime_ist=dt_ist,
                        security_category=cat,
                        session_type=SessionType.CLOSED,
                        granular_phase="BUFFER",
                        is_continuous_trading=False,
                        is_order_entry_allowed=False,
                        order_type_allowed="NONE",
                        is_random_closure_interval=False,
                        random_closure_window=None,
                        description="Post-market buffer"
                    )
            elif total_sec <= t_post_end:
                return SecuritySessionEvaluation(
                    datetime_ist=dt_ist,
                    security_category=cat,
                    session_type=SessionType.POST_CLOSE,
                    granular_phase="CLOSING_SESSION",
                    is_continuous_trading=False,
                    is_order_entry_allowed=True,
                    order_type_allowed="LIMIT_ONLY",
                    is_random_closure_interval=False,
                    random_closure_window=None,
                    description="Closing Session / Post-Close Trading at determined closing price"
                )
            else:
                return SecuritySessionEvaluation(
                    datetime_ist=dt_ist,
                    security_category=cat,
                    session_type=SessionType.CLOSED,
                    granular_phase="CLOSED",
                    is_continuous_trading=False,
                    is_order_entry_allowed=False,
                    order_type_allowed="NONE",
                    is_random_closure_interval=False,
                    random_closure_window=None,
                    description="Market closed"
                )

        # 4. Periodic Call Auction for Illiquid Securities (PCAIS) - Inclusive Evaluation
        if cat == SecurityCategory.ILLIQUID_CALL_AUCTION:
            # 6 one-hour cycles between 09:30 and 15:30. Zero continuous trading.
            t_pcais_open = 9 * 3600 + 30 * 60   # 09:30:00
            t_pcais_close = 15 * 3600 + 30 * 60 # 15:30:00

            if total_sec < t_pcais_open or total_sec >= t_pcais_close:
                return SecuritySessionEvaluation(
                    datetime_ist=dt_ist,
                    security_category=cat,
                    session_type=SessionType.CLOSED,
                    granular_phase="CLOSED",
                    is_continuous_trading=False,
                    is_order_entry_allowed=False,
                    order_type_allowed="NONE",
                    is_random_closure_interval=False,
                    random_closure_window=None,
                    description="Closed (Periodic Call Auction active only 09:30 to 15:30)"
                )

            # Determine cycle index (0 to 5)
            cycle_idx = (total_sec - t_pcais_open) // 3600
            cycle_start = t_pcais_open + cycle_idx * 3600
            sec_in_cycle = total_sec - cycle_start
            cycle_num = cycle_idx + 1

            if sec_in_cycle < 45 * 60:
                is_rand = sec_in_cycle >= 44 * 60
                rand_start_time = time((cycle_start + 44 * 60) // 3600, ((cycle_start + 44 * 60) % 3600) // 60)
                rand_end_time = time((cycle_start + 45 * 60) // 3600, ((cycle_start + 45 * 60) % 3600) // 60)
                rand_win = RandomClosureWindow(
                    window_start=rand_start_time,
                    window_end=rand_end_time,
                    description=f"PCAIS Cycle {cycle_num} Random Order Closure Window (final 1 min)"
                ) if is_rand else None

                return SecuritySessionEvaluation(
                    datetime_ist=dt_ist,
                    security_category=cat,
                    session_type=SessionType.CALL_AUCTION,
                    granular_phase=f"CALL_AUCTION_ORDER_ENTRY_CYCLE_{cycle_num}",
                    is_continuous_trading=False,
                    is_order_entry_allowed=True,
                    order_type_allowed="ALL",
                    is_random_closure_interval=is_rand,
                    random_closure_window=rand_win,
                    description=f"Periodic Call Auction Cycle {cycle_num} Order Entry (45 mins)"
                )
            elif sec_in_cycle < 53 * 60:
                return SecuritySessionEvaluation(
                    datetime_ist=dt_ist,
                    security_category=cat,
                    session_type=SessionType.CALL_AUCTION,
                    granular_phase=f"CALL_AUCTION_MATCHING_CYCLE_{cycle_num}",
                    is_continuous_trading=False,
                    is_order_entry_allowed=False,
                    order_type_allowed="NONE",
                    is_random_closure_interval=False,
                    random_closure_window=None,
                    description=f"Periodic Call Auction Cycle {cycle_num} Order Matching (8 mins)"
                )
            else:
                return SecuritySessionEvaluation(
                    datetime_ist=dt_ist,
                    security_category=cat,
                    session_type=SessionType.CALL_AUCTION,
                    granular_phase=f"CALL_AUCTION_BUFFER_CYCLE_{cycle_num}",
                    is_continuous_trading=False,
                    is_order_entry_allowed=False,
                    order_type_allowed="NONE",
                    is_random_closure_interval=False,
                    random_closure_window=None,
                    description=f"Periodic Call Auction Cycle {cycle_num} Buffer (7 mins)"
                )

        # 5. CAS_ELIGIBLE and NON_CAS on Regular Trading Days
        if calendar_regime is not None:
            reg_val = calendar_regime.value if isinstance(calendar_regime, CalendarRegime) else str(calendar_regime)
            if reg_val == "CAS_V2":
                regime = CalendarRegime.CAS_V2
            elif reg_val in ("CAS_V1", "MODERN_CAS_2026"):
                regime = CalendarRegime.CAS_V1
            else:
                regime = CalendarRegime.LEGACY
        else:
            sched_ver = cls.resolve_schedule_version(d, exchange, cat)
            if sched_ver.version_id == "CAS_V2":
                regime = CalendarRegime.CAS_V2
            elif sched_ver.version_id == "CAS_V1":
                regime = CalendarRegime.CAS_V1
            else:
                regime = CalendarRegime.LEGACY

        t_pre_start = 9 * 3600                # 09:00:00
        t_pre_limit = 9 * 3600 + 7 * 60       # 09:07:00
        t_pre_match = 9 * 3600 + 8 * 60       # 09:08:00
        t_pre_buf = 9 * 3600 + 12 * 60        # 09:12:00
        t_cont_open = 9 * 3600 + 15 * 60      # 09:15:00

        if total_sec < t_pre_start:
            return SecuritySessionEvaluation(
                datetime_ist=dt_ist,
                security_category=cat,
                session_type=SessionType.CLOSED,
                granular_phase="CLOSED",
                is_continuous_trading=False,
                is_order_entry_allowed=False,
                order_type_allowed="NONE",
                is_random_closure_interval=False,
                random_closure_window=None,
                description="Market closed before pre-open"
            )
        elif total_sec < t_pre_limit:
            return SecuritySessionEvaluation(
                datetime_ist=dt_ist,
                security_category=cat,
                session_type=SessionType.PRE_OPEN,
                granular_phase="PRE_OPEN_ENTRY",
                is_continuous_trading=False,
                is_order_entry_allowed=True,
                order_type_allowed="ALL",
                is_random_closure_interval=False,
                random_closure_window=None,
                description="Pre-Open Order Entry (Market & Limit orders)"
            )
        elif total_sec < t_pre_match:
            rand_win = RANDOM_CLOSURE_WINDOWS["REGULAR_PRE_OPEN"]
            return SecuritySessionEvaluation(
                datetime_ist=dt_ist,
                security_category=cat,
                session_type=SessionType.PRE_OPEN,
                granular_phase="PRE_OPEN_LIMIT_ONLY",
                is_continuous_trading=False,
                is_order_entry_allowed=True,
                order_type_allowed="LIMIT_ONLY",
                is_random_closure_interval=True,
                random_closure_window=rand_win,
                description="Pre-Open Limit-Only Order Entry (Random closure window 09:07-09:08)"
            )
        elif total_sec < t_pre_buf:
            return SecuritySessionEvaluation(
                datetime_ist=dt_ist,
                security_category=cat,
                session_type=SessionType.PRE_OPEN,
                granular_phase="PRE_OPEN_MATCHING",
                is_continuous_trading=False,
                is_order_entry_allowed=False,
                order_type_allowed="NONE",
                is_random_closure_interval=False,
                random_closure_window=None,
                description="Pre-Open Order Matching & Trade Confirmation"
            )
        elif total_sec < t_cont_open:
            return SecuritySessionEvaluation(
                datetime_ist=dt_ist,
                security_category=cat,
                session_type=SessionType.PRE_OPEN,
                granular_phase="PRE_OPEN_BUFFER",
                is_continuous_trading=False,
                is_order_entry_allowed=False,
                order_type_allowed="NONE",
                is_random_closure_interval=False,
                random_closure_window=None,
                description="Pre-Open Transition Buffer"
            )
        elif total_sec >= t_cont_open:
            if regime == CalendarRegime.CAS_V2:
                # CAS 2.0 Regulatory Architecture (effective 2026-12-07 per SEBI HO/47/11/11(3)2025-MRD-POD2/I/23843/2026 & NSE/CMTR/77355)
                t_cont_close = 15 * 3600 + 30 * 60     # 15:30:00
                t_cas2_trans_end = 15 * 3600 + 31 * 60 # 15:31:00
                t_cas2_entry_end = 15 * 3600 + 36 * 60 # 15:36:00
                t_cas2_limit_end = 15 * 3600 + 40 * 60 # 15:40:00
                t_cas2_match_end = 15 * 3600 + 45 * 60 # 15:45:00
                t_cas2_buf_end = 15 * 3600 + 50 * 60   # 15:50:00
                t_post_end = 16 * 3600                 # 16:00:00

                if cat == SecurityCategory.CAS_ELIGIBLE:
                    if total_sec <= t_cont_close:
                        return SecuritySessionEvaluation(
                            datetime_ist=dt_ist,
                            security_category=cat,
                            session_type=base_reg_type,
                            granular_phase="CONTINUOUS_TRADING",
                            is_continuous_trading=True,
                            is_order_entry_allowed=True,
                            order_type_allowed="ALL",
                            is_random_closure_interval=False,
                            random_closure_window=None,
                            description="Continuous Trading Session for CAS scrip under CAS 2.0 (09:15-15:30 IST)"
                        )
                    elif total_sec < t_cas2_trans_end:
                        return SecuritySessionEvaluation(
                            datetime_ist=dt_ist,
                            security_category=cat,
                            session_type=SessionType.SPECIAL_CAS,
                            granular_phase="CAS_TRANSITION",
                            is_continuous_trading=False,
                            is_order_entry_allowed=False,
                            order_type_allowed="NONE",
                            is_random_closure_interval=False,
                            random_closure_window=None,
                            description="CAS 2.0 Reference Price Calculation / Transition Buffer (15:30-15:31 IST)"
                        )
                    elif total_sec < t_cas2_entry_end:
                        return SecuritySessionEvaluation(
                            datetime_ist=dt_ist,
                            security_category=cat,
                            session_type=SessionType.SPECIAL_CAS,
                            granular_phase="CLOSING_AUCTION_ORDER_ENTRY",
                            is_continuous_trading=False,
                            is_order_entry_allowed=True,
                            order_type_allowed="ALL",
                            is_random_closure_interval=False,
                            random_closure_window=None,
                            description="CAS 2.0 Closing Auction Session Order Entry (Market & Limit orders, 15:31-15:36 IST)"
                        )
                    elif total_sec < t_cas2_limit_end:
                        is_rand = total_sec >= (15 * 3600 + 38 * 60)
                        rand_win = RANDOM_CLOSURE_WINDOWS["CAS_V2_REGULAR"] if is_rand else None
                        return SecuritySessionEvaluation(
                            datetime_ist=dt_ist,
                            security_category=cat,
                            session_type=SessionType.SPECIAL_CAS,
                            granular_phase="CAS_LIMIT_ONLY",
                            is_continuous_trading=False,
                            is_order_entry_allowed=True,
                            order_type_allowed="LIMIT_ONLY",
                            is_random_closure_interval=is_rand,
                            random_closure_window=rand_win,
                            description="CAS 2.0 Closing Auction Limit-Only Order Entry (Random closure window 15:38-15:40 IST)"
                        )
                    elif total_sec < t_cas2_match_end:
                        return SecuritySessionEvaluation(
                            datetime_ist=dt_ist,
                            security_category=cat,
                            session_type=SessionType.SPECIAL_CAS,
                            granular_phase="CLOSING_AUCTION_MATCHING",
                            is_continuous_trading=False,
                            is_order_entry_allowed=False,
                            order_type_allowed="NONE",
                            is_random_closure_interval=False,
                            random_closure_window=None,
                            description="CAS 2.0 Closing Auction Order Matching & Equilibrium Price Discovery (15:40-15:45 IST)"
                        )
                    elif total_sec < t_cas2_buf_end:
                        return SecuritySessionEvaluation(
                            datetime_ist=dt_ist,
                            security_category=cat,
                            session_type=SessionType.SPECIAL_CAS,
                            granular_phase="TRANSITION_PERIOD",
                            is_continuous_trading=False,
                            is_order_entry_allowed=False,
                            order_type_allowed="NONE",
                            is_random_closure_interval=False,
                            random_closure_window=None,
                            description="CAS 2.0 Post-Auction Transition Period & Trade Confirmation Buffer (15:45-15:50 IST)"
                        )
                    elif total_sec <= t_post_end:
                        return SecuritySessionEvaluation(
                            datetime_ist=dt_ist,
                            security_category=cat,
                            session_type=SessionType.POST_CLOSE,
                            granular_phase="CLOSING_SESSION",
                            is_continuous_trading=False,
                            is_order_entry_allowed=True,
                            order_type_allowed="LIMIT_ONLY",
                            is_random_closure_interval=False,
                            random_closure_window=None,
                            description="Closing Session / Post-Close Trading at determined closing price (15:50-16:00 IST)"
                        )
                    else:
                        return SecuritySessionEvaluation(
                            datetime_ist=dt_ist,
                            security_category=cat,
                            session_type=SessionType.CLOSED,
                            granular_phase="CLOSED",
                            is_continuous_trading=False,
                            is_order_entry_allowed=False,
                            order_type_allowed="NONE",
                            is_random_closure_interval=False,
                            random_closure_window=None,
                            description="Market closed"
                        )
                else:
                    # NON_CAS under CAS_V2
                    if total_sec <= t_cont_close:
                        return SecuritySessionEvaluation(
                            datetime_ist=dt_ist,
                            security_category=cat,
                            session_type=base_reg_type,
                            granular_phase="CONTINUOUS_TRADING",
                            is_continuous_trading=True,
                            is_order_entry_allowed=True,
                            order_type_allowed="ALL",
                            is_random_closure_interval=False,
                            random_closure_window=None,
                            description="Continuous Trading Session (09:15-15:30 IST)"
                        )
                    elif total_sec < t_cas2_limit_end:
                        return SecuritySessionEvaluation(
                            datetime_ist=dt_ist,
                            security_category=cat,
                            session_type=SessionType.SPECIAL_CAS,
                            granular_phase="BUFFER",
                            is_continuous_trading=False,
                            is_order_entry_allowed=False,
                            order_type_allowed="NONE",
                            is_random_closure_interval=False,
                            random_closure_window=None,
                            description="Post-continuous buffer before closing price determination (15:30-15:40 IST)"
                        )
                    elif total_sec < t_cas2_match_end:
                        return SecuritySessionEvaluation(
                            datetime_ist=dt_ist,
                            security_category=cat,
                            session_type=SessionType.SPECIAL_CAS,
                            granular_phase="CLOSING_AUCTION_MATCHING",
                            is_continuous_trading=False,
                            is_order_entry_allowed=False,
                            order_type_allowed="NONE",
                            is_random_closure_interval=False,
                            random_closure_window=None,
                            description="Closing Auction Order Matching Period (15:40-15:45 IST)"
                        )
                    elif total_sec < t_cas2_buf_end:
                        return SecuritySessionEvaluation(
                            datetime_ist=dt_ist,
                            security_category=cat,
                            session_type=SessionType.SPECIAL_CAS,
                            granular_phase="TRANSITION_PERIOD",
                            is_continuous_trading=False,
                            is_order_entry_allowed=False,
                            order_type_allowed="NONE",
                            is_random_closure_interval=False,
                            random_closure_window=None,
                            description="Post-Auction Transition Period & Trade Confirmation Buffer (15:45-15:50 IST)"
                        )
                    elif total_sec <= t_post_end:
                        return SecuritySessionEvaluation(
                            datetime_ist=dt_ist,
                            security_category=cat,
                            session_type=SessionType.POST_CLOSE,
                            granular_phase="CLOSING_SESSION",
                            is_continuous_trading=False,
                            is_order_entry_allowed=True,
                            order_type_allowed="LIMIT_ONLY",
                            is_random_closure_interval=False,
                            random_closure_window=None,
                            description="Closing Session / Post-Close Trading at determined closing price (15:50-16:00 IST)"
                        )
                    else:
                        return SecuritySessionEvaluation(
                            datetime_ist=dt_ist,
                            security_category=cat,
                            session_type=SessionType.CLOSED,
                            granular_phase="CLOSED",
                            is_continuous_trading=False,
                            is_order_entry_allowed=False,
                            order_type_allowed="NONE",
                            is_random_closure_interval=False,
                            random_closure_window=None,
                            description="Market closed"
                        )
            elif regime in (CalendarRegime.CAS_V1, CalendarRegime.MODERN_CAS_2026):
                # Modern CAS Architecture (effective 2026-08-03 per SEBI & NSE circulars)
                t_cas_cont_end = 15 * 3600 + 15 * 60   # 15:15:00
                t_cas_trans_end = 15 * 3600 + 20 * 60  # 15:20:00
                t_cas_entry_end = 15 * 3600 + 28 * 60  # 15:28:00
                t_cont_close = 15 * 3600 + 30 * 60     # 15:30:00
                t_cas_match_end = 15 * 3600 + 35 * 60  # 15:35:00
                t_cas_buf_end = 15 * 3600 + 50 * 60    # 15:50:00
                t_post_end = 16 * 3600                 # 16:00:00

                if cat == SecurityCategory.CAS_ELIGIBLE:
                    if total_sec <= t_cas_cont_end:
                        return SecuritySessionEvaluation(
                            datetime_ist=dt_ist,
                            security_category=cat,
                            session_type=base_reg_type,
                            granular_phase="CONTINUOUS_TRADING",
                            is_continuous_trading=True,
                            is_order_entry_allowed=True,
                            order_type_allowed="ALL",
                            is_random_closure_interval=False,
                            random_closure_window=None,
                            description="Continuous Trading Session for CAS scrip (09:15-15:15 IST)"
                        )
                    elif total_sec < t_cas_trans_end:
                        return SecuritySessionEvaluation(
                            datetime_ist=dt_ist,
                            security_category=cat,
                            session_type=SessionType.SPECIAL_CAS,
                            granular_phase="CAS_TRANSITION",
                            is_continuous_trading=False,
                            is_order_entry_allowed=False,
                            order_type_allowed="NONE",
                            is_random_closure_interval=False,
                            random_closure_window=None,
                            description="CAS Reference Price Calculation / Transition Buffer"
                        )
                    elif total_sec < t_cas_entry_end:
                        return SecuritySessionEvaluation(
                            datetime_ist=dt_ist,
                            security_category=cat,
                            session_type=SessionType.SPECIAL_CAS,
                            granular_phase="CLOSING_AUCTION_ORDER_ENTRY",
                            is_continuous_trading=False,
                            is_order_entry_allowed=True,
                            order_type_allowed="ALL",
                            is_random_closure_interval=False,
                            random_closure_window=None,
                            description="Closing Auction Session Order Entry (Market & Limit orders)"
                        )
                    elif total_sec <= t_cont_close:
                        is_rand = total_sec >= (15 * 3600 + 28 * 60)
                        rand_win = RANDOM_CLOSURE_WINDOWS["MODERN_CAS_REGULAR"] if is_rand else None
                        return SecuritySessionEvaluation(
                            datetime_ist=dt_ist,
                            security_category=cat,
                            session_type=SessionType.SPECIAL_CAS,
                            granular_phase="CAS_LIMIT_ONLY",
                            is_continuous_trading=False,
                            is_order_entry_allowed=True,
                            order_type_allowed="LIMIT_ONLY",
                            is_random_closure_interval=is_rand,
                            random_closure_window=rand_win,
                            description="Closing Auction Limit-Only Order Entry (Random closure window 15:28-15:30)"
                        )
                    elif total_sec < t_cas_match_end:
                        return SecuritySessionEvaluation(
                            datetime_ist=dt_ist,
                            security_category=cat,
                            session_type=SessionType.SPECIAL_CAS,
                            granular_phase="CLOSING_AUCTION_MATCHING",
                            is_continuous_trading=False,
                            is_order_entry_allowed=False,
                            order_type_allowed="NONE",
                            is_random_closure_interval=False,
                            random_closure_window=None,
                            description="Closing Auction Order Matching & Equilibrium Price Discovery"
                        )
                    elif total_sec < t_cas_buf_end:
                        return SecuritySessionEvaluation(
                            datetime_ist=dt_ist,
                            security_category=cat,
                            session_type=SessionType.SPECIAL_CAS,
                            granular_phase="TRANSITION_PERIOD",
                            is_continuous_trading=False,
                            is_order_entry_allowed=False,
                            order_type_allowed="NONE",
                            is_random_closure_interval=False,
                            random_closure_window=None,
                            description="Post-Auction Transition Period & Trade Confirmation Buffer"
                        )
                    elif total_sec <= t_post_end:
                        return SecuritySessionEvaluation(
                            datetime_ist=dt_ist,
                            security_category=cat,
                            session_type=SessionType.POST_CLOSE,
                            granular_phase="CLOSING_SESSION",
                            is_continuous_trading=False,
                            is_order_entry_allowed=True,
                            order_type_allowed="LIMIT_ONLY",
                            is_random_closure_interval=False,
                            random_closure_window=None,
                            description="Closing Session / Post-Close Trading at determined closing price"
                        )
                    else:
                        return SecuritySessionEvaluation(
                            datetime_ist=dt_ist,
                            security_category=cat,
                            session_type=SessionType.CLOSED,
                            granular_phase="CLOSED",
                            is_continuous_trading=False,
                            is_order_entry_allowed=False,
                            order_type_allowed="NONE",
                            is_random_closure_interval=False,
                            random_closure_window=None,
                            description="Market closed"
                        )
                else:
                    # NON_CAS (Continuous market runs up to 15:30:00)
                    if total_sec <= t_cont_close:
                        return SecuritySessionEvaluation(
                            datetime_ist=dt_ist,
                            security_category=cat,
                            session_type=base_reg_type,
                            granular_phase="CONTINUOUS_TRADING",
                            is_continuous_trading=True,
                            is_order_entry_allowed=True,
                            order_type_allowed="ALL",
                            is_random_closure_interval=False,
                            random_closure_window=None,
                            description="Continuous Trading Session (09:15-15:30 IST)"
                        )
                    elif total_sec < t_cas_match_end:
                        return SecuritySessionEvaluation(
                            datetime_ist=dt_ist,
                            security_category=cat,
                            session_type=SessionType.SPECIAL_CAS,
                            granular_phase="CLOSING_AUCTION_MATCHING",
                            is_continuous_trading=False,
                            is_order_entry_allowed=False,
                            order_type_allowed="NONE",
                            is_random_closure_interval=False,
                            random_closure_window=None,
                            description="Closing Auction Order Matching Period"
                        )
                    elif total_sec < t_cas_buf_end:
                        return SecuritySessionEvaluation(
                            datetime_ist=dt_ist,
                            security_category=cat,
                            session_type=SessionType.SPECIAL_CAS,
                            granular_phase="TRANSITION_PERIOD",
                            is_continuous_trading=False,
                            is_order_entry_allowed=False,
                            order_type_allowed="NONE",
                            is_random_closure_interval=False,
                            random_closure_window=None,
                            description="Post-Auction Transition Period & Trade Confirmation Buffer"
                        )
                    elif total_sec <= t_post_end:
                        return SecuritySessionEvaluation(
                            datetime_ist=dt_ist,
                            security_category=cat,
                            session_type=SessionType.POST_CLOSE,
                            granular_phase="CLOSING_SESSION",
                            is_continuous_trading=False,
                            is_order_entry_allowed=True,
                            order_type_allowed="LIMIT_ONLY",
                            is_random_closure_interval=False,
                            random_closure_window=None,
                            description="Closing Session / Post-Close Trading at determined closing price"
                        )
                    else:
                        return SecuritySessionEvaluation(
                            datetime_ist=dt_ist,
                            security_category=cat,
                            session_type=SessionType.CLOSED,
                            granular_phase="CLOSED",
                            is_continuous_trading=False,
                            is_order_entry_allowed=False,
                            order_type_allowed="NONE",
                            is_random_closure_interval=False,
                            random_closure_window=None,
                            description="Market closed"
                        )
            else:
                # LEGACY_PRE_CAS
                t_cont_close = 15 * 3600 + 30 * 60    # 15:30:00
                t_post_start = 15 * 3600 + 40 * 60    # 15:40:00
                t_post_end = 16 * 3600                # 16:00:00

                if total_sec <= t_cont_close:
                    return SecuritySessionEvaluation(
                        datetime_ist=dt_ist,
                        security_category=cat,
                        session_type=base_reg_type,
                        granular_phase="CONTINUOUS_TRADING",
                        is_continuous_trading=True,
                        is_order_entry_allowed=True,
                        order_type_allowed="ALL",
                        is_random_closure_interval=False,
                        random_closure_window=None,
                        description="Continuous Trading Session (09:15-15:30 IST)"
                    )
                elif total_sec < t_post_start:
                    return SecuritySessionEvaluation(
                        datetime_ist=dt_ist,
                        security_category=cat,
                        session_type=SessionType.CLOSED,
                        granular_phase="BUFFER",
                        is_continuous_trading=False,
                        is_order_entry_allowed=False,
                        order_type_allowed="NONE",
                        is_random_closure_interval=False,
                        random_closure_window=None,
                        description="Closing price calculation buffer"
                    )
                elif total_sec <= t_post_end:
                    return SecuritySessionEvaluation(
                        datetime_ist=dt_ist,
                        security_category=cat,
                        session_type=SessionType.POST_CLOSE,
                        granular_phase="CLOSING_SESSION",
                        is_continuous_trading=False,
                        is_order_entry_allowed=True,
                        order_type_allowed="LIMIT_ONLY",
                        is_random_closure_interval=False,
                        random_closure_window=None,
                        description="Closing Session / Post-Close Trading at determined closing price"
                    )
                else:
                    return SecuritySessionEvaluation(
                        datetime_ist=dt_ist,
                        security_category=cat,
                        session_type=SessionType.CLOSED,
                        granular_phase="CLOSED",
                        is_continuous_trading=False,
                        is_order_entry_allowed=False,
                        order_type_allowed="NONE",
                        is_random_closure_interval=False,
                        random_closure_window=None,
                        description="Market closed"
                    )

    @classmethod
    def check_order_entry_permission(
        cls,
        dt: datetime,
        security_category: SecurityCategory | str = SecurityCategory.NON_CAS,
        order_type: str = "LIMIT",
        exchange_closure_time: Optional[datetime] = None,
        calendar_regime: Optional[CalendarRegime | str] = None,
    ) -> OrderEntryPermission:
        """
        Evaluate whether an order entry/modification is permitted at a given datetime.
        Distinguishes order-entry permissions from session state classification.
        Accounts for:
        - Security category eligibility
        - Order type (LIMIT vs MARKET) during limit-only phases
        - Random closure windows and exchange-controlled closure events
        - Calendar regime (MODERN_CAS_2026 vs LEGACY_PRE_CAS)
        """
        eval_res = cls.evaluate_security_session(dt, security_category, calendar_regime=calendar_regime)
        order_type_upper = order_type.upper()

        if not eval_res.is_order_entry_allowed:
            return OrderEntryPermission(
                is_allowed=False,
                order_type_allowed="NONE",
                is_random_closure_window=False,
                random_closure_window=None,
                reason=f"Order entry not allowed during {eval_res.granular_phase} ({eval_res.description})"
            )

        # Check order type restrictions (e.g. LIMIT_ONLY phases)
        if eval_res.order_type_allowed == "LIMIT_ONLY" and order_type_upper != "LIMIT":
            return OrderEntryPermission(
                is_allowed=False,
                order_type_allowed="LIMIT_ONLY",
                is_random_closure_window=eval_res.is_random_closure_interval,
                random_closure_window=eval_res.random_closure_window,
                reason=f"Only LIMIT orders are permitted during {eval_res.granular_phase}. Rejected order type: {order_type_upper}"
            )

        # Check random closure window and simulated/actual exchange closure event
        if eval_res.is_random_closure_interval:
            if exchange_closure_time is not None:
                dt_ist = cls.to_ist(dt)
                closure_ist = cls.to_ist(exchange_closure_time)
                if dt_ist >= closure_ist:
                    return OrderEntryPermission(
                        is_allowed=False,
                        order_type_allowed="NONE",
                        is_random_closure_window=True,
                        random_closure_window=eval_res.random_closure_window,
                        reason=f"[SIMULATED] Exchange random closure event already triggered at {closure_ist.strftime('%H:%M:%S IST')}"
                    )

        return OrderEntryPermission(
            is_allowed=True,
            order_type_allowed=eval_res.order_type_allowed,
            is_random_closure_window=eval_res.is_random_closure_interval,
            random_closure_window=eval_res.random_closure_window,
            reason=f"Order entry permitted as {eval_res.order_type_allowed} during {eval_res.granular_phase}"
        )

    @classmethod
    def get_session_type(
        cls,
        dt: datetime,
        exchange: str = "NSE",
        instrument_type: str = "EQ",
        security_category: Optional[SecurityCategory | str] = None,
        calendar_regime: Optional[CalendarRegime | str] = None,
    ) -> SessionType:
        """
        Evaluate exact session type for a given datetime, exchange, and instrument type.
        If security_category is provided, evaluates security-specific schedule.
        Otherwise preserves 100% backward-compatible evidence-based evaluation:
        1. Special Muhurat Session (2026-11-08)
        2. DR Live Trading Session (2026-03-05 & 2026-03-06)
        3. Weekend Closures (Saturday & Sunday, e.g. 2026-03-07)
        4. Official Weekday Holidays (16 days in 2026)
        5. Regular Market Hours (MCX, Currency, Equity)
        """
        if security_category is not None:
            eval_res = cls.evaluate_security_session(dt, security_category, exchange, calendar_regime=calendar_regime)
            return eval_res.session_type

        dt_ist = cls.to_ist(dt)
        d = dt_ist.date()
        t = dt_ist.time()
        exch_upper = exchange.upper()
        inst_upper = instrument_type.upper()

        # 1. Special Muhurat Session on Sunday 2026-11-08 (Circular NSE/CMTR/76941)
        if d == MUHURAT_SESSION_2026["date"]:
            if cls.is_muhurat_pre_open(dt_ist):
                return SessionType.PRE_OPEN
            elif cls.is_muhurat_session(dt_ist):
                return SessionType.SPECIAL_MUHURAT
            elif cls.is_muhurat_post_close(dt_ist):
                return SessionType.POST_CLOSE
            return SessionType.CLOSED

        # 2. Disaster Recovery (DR) Live Trading Days (Circular NSE/MSD/73126)
        # Note: 2026-03-05 and 2026-03-06 run during standard market timings from DR site
        if cls.is_dr_session(dt_ist):
            return SessionType.SPECIAL_DR

        # 3. Standard Weekends (Saturday=5, Sunday=6) — Saturday 2026-03-07 is strictly CLOSED
        if dt_ist.weekday() >= 5:
            return SessionType.CLOSED

        # 4. Official Weekday Exchange Holidays (16 verified holidays in 2026)
        if cls.is_holiday(d):
            return SessionType.CLOSED

        # 5. MCX Commodity Trading Hours (09:00 - 23:30 IST)
        if exch_upper in ("MCX", "COMMODITY"):
            if time(9, 0) <= t <= time(23, 30):
                return SessionType.COMMODITY_REGULAR
            return SessionType.CLOSED

        # 6. Currency Derivatives Trading Hours (09:00 - 17:00 IST)
        if inst_upper in ("CUR", "CURRENCY", "CDS"):
            if time(9, 0) <= t <= time(17, 0):
                return SessionType.REGULAR
            return SessionType.CLOSED

        # 7. NSE/BSE Equity & Equity Derivatives (09:15 - 15:30 IST)
        if time(9, 0) <= t < time(9, 15):
            return SessionType.PRE_OPEN
        elif time(9, 15) <= t <= time(15, 30):
            return SessionType.REGULAR
        elif time(15, 40) <= t <= time(16, 0):
            return SessionType.POST_CLOSE

        return SessionType.CLOSED

    @classmethod
    def is_valid_trading_time(
        cls,
        dt: datetime,
        exchange: str = "NSE",
        instrument_type: str = "EQ",
        allow_special_sessions: bool = True,
        security_category: Optional[SecurityCategory | str] = None
    ) -> bool:
        """
        Return True if datetime is an authorized continuous trading bar.
        Accepts regular sessions, DR-site sessions, and optionally Muhurat trading.
        If security_category is provided, evaluates whether continuous trading
        is active for that specific category.
        """
        if security_category is not None:
            eval_res = cls.evaluate_security_session(dt, security_category, exchange)
            if not allow_special_sessions and eval_res.session_type in (SessionType.SPECIAL_MUHURAT, SessionType.SPECIAL_DR):
                return False
            return eval_res.is_continuous_trading

        session = cls.get_session_type(dt, exchange, instrument_type)
        if session in (SessionType.REGULAR, SessionType.COMMODITY_REGULAR):
            return True
        if allow_special_sessions and session in (SessionType.SPECIAL_MUHURAT, SessionType.SPECIAL_DR):
            return True
        return False
