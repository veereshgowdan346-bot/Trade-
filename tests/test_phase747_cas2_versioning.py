"""
OmniTradePro Apex V2.0 — Phase 7.4.7
CAS 2.0 Future-Effective Calendar Versioning Audit Test Suite

STRICT OFFLINE RESEARCH ONLY:
- Live broker execution permanently disabled via safety interlock.
- No network connections, live credentials, or real orders.
- Date-effective regulatory schedule versioning (LEGACY, CAS_V1, CAS_V2).
- Multi-phase CAS 2.0 microstructural transitions effective from 2026-12-07.
- Date-aware evaluation and resolution at 15:40:00 across all regimes.
- Exact-second boundary validation and candle timestamp duration testing.
- Regulatory evidence integrity check against official SEBI & NSE circulars.
"""

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(REPO_ROOT))

import pytest
from datetime import datetime, time, date, timedelta
from typing import Dict, Any

from core.nse_calendar import (
    NseCalendar,
    IST,
    SecurityCategory,
    SessionType,
    CalendarRegime,
    CandleTimestampConvention,
    ScheduleVersionSpec,
    SCHEDULE_VERSIONS_REGISTRY,
    LEGACY_SUNSET_DATE,
    CAS_V1_GO_LIVE_DATE,
    CAS_V1_SUNSET_DATE,
    CAS_V2_GO_LIVE_DATE,
    RANDOM_CLOSURE_WINDOWS,
    REGULATORY_RULES_EVIDENCE_2026,
    CLOSING_SESSION_RECONCILIATION_EVIDENCE_2026,
    SESSION_RULES_REGISTRY,
)
from core.broker_adapter import BrokerAdapter, Order, OrderType
from core.engine import TradingEngine


class TestPhase747Cas2Versioning:
    """Test Suite for Phase 7.4.7 CAS 2.0 Future-Effective Calendar Versioning Audit."""

    # ========================================================================
    # TASK 1 — Versioned Regulatory Schedule Architecture
    # ========================================================================

    def test_task1_schedule_versions_registry_completeness(self):
        """
        Verify that SCHEDULE_VERSIONS_REGISTRY contains explicit specifications
        for LEGACY, CAS_V1, and CAS_V2 with complete, non-overlapping date spans.
        """
        assert "LEGACY" in SCHEDULE_VERSIONS_REGISTRY
        assert "CAS_V1" in SCHEDULE_VERSIONS_REGISTRY
        assert "CAS_V2" in SCHEDULE_VERSIONS_REGISTRY

        legacy = SCHEDULE_VERSIONS_REGISTRY["LEGACY"]
        cas_v1 = SCHEDULE_VERSIONS_REGISTRY["CAS_V1"]
        cas_v2 = SCHEDULE_VERSIONS_REGISTRY["CAS_V2"]

        # Check LEGACY bounds
        assert legacy.version_id == "LEGACY"
        assert legacy.effective_from == date(2010, 1, 4)
        assert legacy.effective_to == date(2026, 8, 2)
        assert "NSE/CMTR/13444" in legacy.governing_circulars

        # Check CAS_V1 bounds
        assert cas_v1.version_id == "CAS_V1"
        assert cas_v1.effective_from == date(2026, 8, 3)
        assert cas_v1.effective_to == date(2026, 12, 6)
        assert "SEBI/HO/47/11/11(3)2025-MRD-POD2/I/2765/2026" in cas_v1.governing_circulars
        assert "NSE/CMTR/73362" in cas_v1.governing_circulars

        # Check CAS_V2 bounds
        assert cas_v2.version_id == "CAS_V2"
        assert cas_v2.effective_from == date(2026, 12, 7)
        assert cas_v2.effective_to is None  # Active open-ended
        assert "SEBI/HO/47/11/11(3)2025-MRD-POD2/I/23843/2026" in cas_v2.governing_circulars
        assert "NSE/CMTR/77355" in cas_v2.governing_circulars
        assert "NSE_CAS2_FAQ_20261106" in cas_v2.governing_circulars

    def test_task1_date_boundary_constants_integrity(self):
        """
        Verify that the boundary constants align seamlessly without temporal gaps.
        LEGACY ends 2026-08-02, CAS_V1 starts 2026-08-03.
        CAS_V1 ends 2026-12-06, CAS_V2 starts 2026-12-07.
        """
        assert LEGACY_SUNSET_DATE == date(2026, 8, 2)
        assert CAS_V1_GO_LIVE_DATE == date(2026, 8, 3)
        assert CAS_V1_SUNSET_DATE == date(2026, 12, 6)
        assert CAS_V2_GO_LIVE_DATE == date(2026, 12, 7)

        # Check exact contiguous day steps
        assert CAS_V1_GO_LIVE_DATE - LEGACY_SUNSET_DATE == timedelta(days=1)
        assert CAS_V2_GO_LIVE_DATE - CAS_V1_SUNSET_DATE == timedelta(days=1)

    def test_task1_resolve_schedule_version_boundaries(self):
        """
        Test that resolve_schedule_version correctly resolves dates across boundaries:
        - 2026-08-02 -> LEGACY
        - 2026-08-03 -> CAS_V1
        - 2026-12-06 -> CAS_V1
        - 2026-12-07 -> CAS_V2
        - Future dates (e.g. 2027-01-15) -> CAS_V2
        - Pre-2026 dates (e.g. 2024-05-10) -> LEGACY
        """
        # Historical date
        ver_hist = NseCalendar.resolve_schedule_version(date(2024, 5, 10))
        assert ver_hist.version_id == "LEGACY"

        # Boundary: Last day of legacy
        ver_leg_end = NseCalendar.resolve_schedule_version(date(2026, 8, 2))
        assert ver_leg_end.version_id == "LEGACY"

        # Boundary: First day of CAS 1.0
        ver_v1_start = NseCalendar.resolve_schedule_version(date(2026, 8, 3))
        assert ver_v1_start.version_id == "CAS_V1"

        # Mid CAS 1.0
        ver_v1_mid = NseCalendar.resolve_schedule_version(date(2026, 10, 15))
        assert ver_v1_mid.version_id == "CAS_V1"

        # Boundary: Last day of CAS 1.0
        ver_v1_end = NseCalendar.resolve_schedule_version(date(2026, 12, 6))
        assert ver_v1_end.version_id == "CAS_V1"

        # Boundary: First day of CAS 2.0
        ver_v2_start = NseCalendar.resolve_schedule_version(date(2026, 12, 7))
        assert ver_v2_start.version_id == "CAS_V2"

        # Far future
        ver_v2_future = NseCalendar.resolve_schedule_version(date(2027, 3, 31))
        assert ver_v2_future.version_id == "CAS_V2"

    def test_task1_resolve_schedule_version_datetime_and_string_inputs(self):
        """
        Test that resolve_schedule_version supports datetime objects (with or without tz)
        and ISO date string inputs.
        """
        dt_ist = datetime(2026, 12, 7, 10, 0, 0, tzinfo=IST)
        assert NseCalendar.resolve_schedule_version(dt_ist).version_id == "CAS_V2"

        dt_naive = datetime(2026, 12, 6, 15, 30, 0)
        assert NseCalendar.resolve_schedule_version(dt_naive).version_id == "CAS_V1"

        str_date = "2026-12-07"
        assert NseCalendar.resolve_schedule_version(str_date).version_id == "CAS_V2"

        # get_schedule_version alias parity
        assert NseCalendar.get_schedule_version(dt_ist).version_id == "CAS_V2"
        assert NseCalendar.get_schedule_version("2026-08-02").version_id == "LEGACY"

    # ========================================================================
    # TASK 2 — CAS V2 Microstructural Schedule Validation (2026-12-07 Onwards)
    # ========================================================================

    def test_task2_cas_v2_continuous_trading_span(self):
        """
        Under CAS 2.0 (2026-12-07 onwards), continuous trading runs continuously
        from 09:15:00 to 15:30:00 for BOTH CAS_ELIGIBLE and NON_CAS securities.
        """
        test_date = date(2026, 12, 7)  # Monday CAS 2.0 Go-Live

        for cat in [SecurityCategory.CAS_ELIGIBLE, SecurityCategory.NON_CAS]:
            # 09:15:00 exact start
            res_open = NseCalendar.evaluate_session_instant(
                datetime.combine(test_date, time(9, 15, 0), tzinfo=IST), cat
            )
            assert res_open.granular_phase == "CONTINUOUS_TRADING"
            assert res_open.session_type == SessionType.REGULAR
            assert res_open.is_continuous_trading is True
            assert res_open.is_order_entry_allowed is True
            assert res_open.order_type_allowed == "ALL"

            # 15:14:59 mid-session
            res_mid = NseCalendar.evaluate_session_instant(
                datetime.combine(test_date, time(15, 14, 59), tzinfo=IST), cat
            )
            assert res_mid.granular_phase == "CONTINUOUS_TRADING"
            assert res_mid.is_continuous_trading is True

            # 15:20:00 (unlike CAS 1.0 which closed at 15:15:00 for CAS scrips, CAS 2.0 runs to 15:30:00)
            res_1520 = NseCalendar.evaluate_session_instant(
                datetime.combine(test_date, time(15, 20, 0), tzinfo=IST), cat
            )
            assert res_1520.granular_phase == "CONTINUOUS_TRADING"
            assert res_1520.is_continuous_trading is True

            # 15:29:59 last second of continuous trading
            res_last = NseCalendar.evaluate_session_instant(
                datetime.combine(test_date, time(15, 29, 59), tzinfo=IST), cat
            )
            assert res_last.granular_phase == "CONTINUOUS_TRADING"
            assert res_last.is_continuous_trading is True
            assert res_last.is_order_entry_allowed is True

    def test_task2_cas_v2_transition_phase_1530_to_1531(self):
        """
        Under CAS 2.0:
        15:30:00 to 15:31:00 is Reference Price Calculation / Transition.
        - Granular phase: CAS_TRANSITION
        - Continuous trading: False
        - Order entry allowed: False (NONE)
        """
        test_date = date(2026, 12, 7)

        # 15:30:00 exact boundary
        res_1530 = NseCalendar.evaluate_session_instant(
            datetime.combine(test_date, time(15, 30, 0), tzinfo=IST),
            SecurityCategory.CAS_ELIGIBLE
        )
        assert res_1530.granular_phase == "CAS_TRANSITION"
        assert res_1530.session_type == SessionType.SPECIAL_CAS
        assert res_1530.is_continuous_trading is False
        assert res_1530.is_order_entry_allowed is False
        assert res_1530.order_type_allowed == "NONE"
        assert res_1530.is_random_closure_interval is False

        # 15:30:30 midpoint
        res_1530_30 = NseCalendar.evaluate_session_instant(
            datetime.combine(test_date, time(15, 30, 30), tzinfo=IST),
            SecurityCategory.CAS_ELIGIBLE
        )
        assert res_1530_30.granular_phase == "CAS_TRANSITION"
        assert res_1530_30.is_order_entry_allowed is False

        # 15:30:59 last second before order entry opens
        res_1530_59 = NseCalendar.evaluate_session_instant(
            datetime.combine(test_date, time(15, 30, 59), tzinfo=IST),
            SecurityCategory.CAS_ELIGIBLE
        )
        assert res_1530_59.granular_phase == "CAS_TRANSITION"
        assert res_1530_59.is_order_entry_allowed is False

    def test_task2_cas_v2_order_entry_phase_1531_to_1536(self):
        """
        Under CAS 2.0:
        15:31:00 to 15:36:00 is Closing Auction Order Entry (Limit and Market).
        - Granular phase: CLOSING_AUCTION_ORDER_ENTRY
        - Continuous trading: False
        - Order entry allowed: True (ALL)
        - Random closure: False
        """
        test_date = date(2026, 12, 7)

        # 15:31:00 exact start of order entry
        res_1531 = NseCalendar.evaluate_session_instant(
            datetime.combine(test_date, time(15, 31, 0), tzinfo=IST),
            SecurityCategory.CAS_ELIGIBLE
        )
        assert res_1531.granular_phase == "CLOSING_AUCTION_ORDER_ENTRY"
        assert res_1531.session_type == SessionType.SPECIAL_CAS
        assert res_1531.is_continuous_trading is False
        assert res_1531.is_order_entry_allowed is True
        assert res_1531.order_type_allowed == "ALL"
        assert res_1531.is_random_closure_interval is False

        # 15:33:00 mid order entry
        res_1533 = NseCalendar.evaluate_session_instant(
            datetime.combine(test_date, time(15, 33, 0), tzinfo=IST),
            SecurityCategory.CAS_ELIGIBLE
        )
        assert res_1533.granular_phase == "CLOSING_AUCTION_ORDER_ENTRY"
        assert res_1533.is_order_entry_allowed is True
        assert res_1533.order_type_allowed == "ALL"

        # 15:35:59 last second of general order entry
        res_1535_59 = NseCalendar.evaluate_session_instant(
            datetime.combine(test_date, time(15, 35, 59), tzinfo=IST),
            SecurityCategory.CAS_ELIGIBLE
        )
        assert res_1535_59.granular_phase == "CLOSING_AUCTION_ORDER_ENTRY"
        assert res_1535_59.is_order_entry_allowed is True
        assert res_1535_59.order_type_allowed == "ALL"
        assert res_1535_59.is_random_closure_interval is False

    def test_task2_cas_v2_limit_only_entry_and_random_closure_1536_to_1540(self):
        """
        Under CAS 2.0:
        15:36:00 to 15:40:00 is Limit-Only Order Entry.
        - Between 15:36:00 and 15:37:59: is_random_closure_interval=False, order_type_allowed='LIMIT_ONLY'
        - Between 15:38:00 and 15:40:00: is_random_closure_interval=True, order_type_allowed='LIMIT_ONLY'
        - Random closure window is CAS_V2_REGULAR (15:38:00 to 15:40:00).
        """
        test_date = date(2026, 12, 7)

        # 15:36:00 start of limit-only phase
        res_1536 = NseCalendar.evaluate_session_instant(
            datetime.combine(test_date, time(15, 36, 0), tzinfo=IST),
            SecurityCategory.CAS_ELIGIBLE
        )
        assert res_1536.granular_phase == "CAS_LIMIT_ONLY"
        assert res_1536.session_type == SessionType.SPECIAL_CAS
        assert res_1536.is_order_entry_allowed is True
        assert res_1536.order_type_allowed == "LIMIT_ONLY"
        assert res_1536.is_random_closure_interval is False

        # 15:37:59 right before random closure window
        res_1537_59 = NseCalendar.evaluate_session_instant(
            datetime.combine(test_date, time(15, 37, 59), tzinfo=IST),
            SecurityCategory.CAS_ELIGIBLE
        )
        assert res_1537_59.granular_phase == "CAS_LIMIT_ONLY"
        assert res_1537_59.order_type_allowed == "LIMIT_ONLY"
        assert res_1537_59.is_random_closure_interval is False

        # 15:38:00 start of random closure window
        res_1538 = NseCalendar.evaluate_session_instant(
            datetime.combine(test_date, time(15, 38, 0), tzinfo=IST),
            SecurityCategory.CAS_ELIGIBLE
        )
        assert res_1538.granular_phase == "CAS_LIMIT_ONLY"
        assert res_1538.order_type_allowed == "LIMIT_ONLY"
        assert res_1538.is_random_closure_interval is True

        # 15:39:30 inside random closure window
        res_1539_30 = NseCalendar.evaluate_session_instant(
            datetime.combine(test_date, time(15, 39, 30), tzinfo=IST),
            SecurityCategory.CAS_ELIGIBLE
        )
        assert res_1539_30.granular_phase == "CAS_LIMIT_ONLY"
        assert res_1539_30.order_type_allowed == "LIMIT_ONLY"
        assert res_1539_30.is_random_closure_interval is True

        # 15:39:59 last second of limit-only random closure window
        res_1539_59 = NseCalendar.evaluate_session_instant(
            datetime.combine(test_date, time(15, 39, 59), tzinfo=IST),
            SecurityCategory.CAS_ELIGIBLE
        )
        assert res_1539_59.granular_phase == "CAS_LIMIT_ONLY"
        assert res_1539_59.is_random_closure_interval is True

    def test_task2_cas_v2_order_matching_1540_to_1545(self):
        """
        Under CAS 2.0:
        15:40:00 to 15:45:00 is Closing Auction Order Matching.
        - Granular phase: CLOSING_AUCTION_MATCHING
        - Order entry allowed: False (NONE)
        - Continuous trading: False
        - Random closure: False
        """
        test_date = date(2026, 12, 7)

        # 15:40:00 exact start of matching
        res_1540 = NseCalendar.evaluate_session_instant(
            datetime.combine(test_date, time(15, 40, 0), tzinfo=IST),
            SecurityCategory.CAS_ELIGIBLE
        )
        assert res_1540.granular_phase == "CLOSING_AUCTION_MATCHING"
        assert res_1540.session_type == SessionType.SPECIAL_CAS
        assert res_1540.is_continuous_trading is False
        assert res_1540.is_order_entry_allowed is False
        assert res_1540.order_type_allowed == "NONE"
        assert res_1540.is_random_closure_interval is False

        # 15:42:30 mid matching
        res_1542 = NseCalendar.evaluate_session_instant(
            datetime.combine(test_date, time(15, 42, 30), tzinfo=IST),
            SecurityCategory.CAS_ELIGIBLE
        )
        assert res_1542.granular_phase == "CLOSING_AUCTION_MATCHING"
        assert res_1542.is_order_entry_allowed is False

        # 15:44:59 end of matching
        res_1544_59 = NseCalendar.evaluate_session_instant(
            datetime.combine(test_date, time(15, 44, 59), tzinfo=IST),
            SecurityCategory.CAS_ELIGIBLE
        )
        assert res_1544_59.granular_phase == "CLOSING_AUCTION_MATCHING"
        assert res_1544_59.is_order_entry_allowed is False

    def test_task2_cas_v2_transition_buffer_1545_to_1550(self):
        """
        Under CAS 2.0:
        15:45:00 to 15:50:00 is Transition Buffer Period.
        - Granular phase: TRANSITION_PERIOD
        - Order entry allowed: False (NONE)
        """
        test_date = date(2026, 12, 7)

        res_1545 = NseCalendar.evaluate_session_instant(
            datetime.combine(test_date, time(15, 45, 0), tzinfo=IST),
            SecurityCategory.CAS_ELIGIBLE
        )
        assert res_1545.granular_phase == "TRANSITION_PERIOD"
        assert res_1545.session_type == SessionType.SPECIAL_CAS
        assert res_1545.is_order_entry_allowed is False
        assert res_1545.order_type_allowed == "NONE"

        res_1549_59 = NseCalendar.evaluate_session_instant(
            datetime.combine(test_date, time(15, 49, 59), tzinfo=IST),
            SecurityCategory.CAS_ELIGIBLE
        )
        assert res_1549_59.granular_phase == "TRANSITION_PERIOD"
        assert res_1549_59.is_order_entry_allowed is False

    def test_task2_cas_v2_post_close_closing_session_1550_to_1600(self):
        """
        Under CAS 2.0:
        15:50:00 to 16:00:00 is Post-Close Closing Session.
        - Granular phase: CLOSING_SESSION
        - SessionType: POST_CLOSE
        - Order entry allowed: True (LIMIT_ONLY)
        After 16:00:00 -> CLOSED.
        """
        test_date = date(2026, 12, 7)

        # 15:50:00 start of closing session
        res_1550 = NseCalendar.evaluate_session_instant(
            datetime.combine(test_date, time(15, 50, 0), tzinfo=IST),
            SecurityCategory.CAS_ELIGIBLE
        )
        assert res_1550.granular_phase == "CLOSING_SESSION"
        assert res_1550.session_type == SessionType.POST_CLOSE
        assert res_1550.is_order_entry_allowed is True
        assert res_1550.order_type_allowed == "LIMIT_ONLY"

        # 15:59:59 end of closing session
        res_1559_59 = NseCalendar.evaluate_session_instant(
            datetime.combine(test_date, time(15, 59, 59), tzinfo=IST),
            SecurityCategory.CAS_ELIGIBLE
        )
        assert res_1559_59.granular_phase == "CLOSING_SESSION"
        assert res_1559_59.is_order_entry_allowed is True

        # 16:00:00 market closed
        res_1600 = NseCalendar.evaluate_session_instant(
            datetime.combine(test_date, time(16, 0, 0), tzinfo=IST),
            SecurityCategory.CAS_ELIGIBLE
        )
        assert res_1600.granular_phase == "CLOSED"
        assert res_1600.session_type == SessionType.CLOSED
        assert res_1600.is_order_entry_allowed is False
        assert res_1600.order_type_allowed == "NONE"

    # ========================================================================
    # TASK 3 — Critical Tri-Regime Comparison at 15:40:00
    # ========================================================================

    def test_task3_deterministic_resolution_at_154000_across_regimes(self):
        """
        Verify the three-way deterministic divergence at 15:40:00:
        1. 2026-08-02 (or pre-2026-08-03) -> LEGACY -> CLOSING_SESSION (Order Entry: LIMIT_ONLY)
        2. 2026-12-06 (or 2026-08-03..2026-12-06) -> CAS_V1 -> TRANSITION_PERIOD (Order Entry: NONE)
        3. 2026-12-07 (or post-2026-12-07) -> CAS_V2 -> CLOSING_AUCTION_MATCHING (Order Entry: NONE)
        """
        # 1. LEGACY:
        # A. On regular trading day (Friday 2026-07-31)
        dt_legacy = datetime(2026, 7, 31, 15, 40, 0, tzinfo=IST)
        res_leg = NseCalendar.evaluate_session_instant(dt_legacy, SecurityCategory.CAS_ELIGIBLE)
        assert res_leg.granular_phase == "CLOSING_SESSION"
        assert res_leg.session_type == SessionType.POST_CLOSE
        assert res_leg.is_order_entry_allowed is True
        assert res_leg.order_type_allowed == "LIMIT_ONLY"
        assert res_leg.is_continuous_trading is False

        # B. On exact schedule boundary date 2026-08-02 via evaluate_schedule_session
        res_leg_bound = NseCalendar.evaluate_schedule_session(
            date(2026, 8, 2), time(15, 40, 0), SecurityCategory.CAS_ELIGIBLE
        )
        assert res_leg_bound.granular_phase == "CLOSING_SESSION"
        assert res_leg_bound.is_order_entry_allowed is True
        assert res_leg_bound.order_type_allowed == "LIMIT_ONLY"

        # 2. CAS_V1:
        # A. On regular trading day (Friday 2026-12-04)
        dt_v1 = datetime(2026, 12, 4, 15, 40, 0, tzinfo=IST)
        res_v1 = NseCalendar.evaluate_session_instant(dt_v1, SecurityCategory.CAS_ELIGIBLE)
        assert res_v1.granular_phase == "TRANSITION_PERIOD"
        assert res_v1.is_order_entry_allowed is False
        assert res_v1.order_type_allowed == "NONE"
        assert res_v1.is_continuous_trading is False

        # B. On exact schedule boundary date 2026-12-06 via evaluate_schedule_session
        res_v1_bound = NseCalendar.evaluate_schedule_session(
            date(2026, 12, 6), time(15, 40, 0), SecurityCategory.CAS_ELIGIBLE
        )
        assert res_v1_bound.granular_phase == "TRANSITION_PERIOD"
        assert res_v1_bound.is_order_entry_allowed is False
        assert res_v1_bound.order_type_allowed == "NONE"

        # 3. CAS_V2:
        # On go-live trading day (Monday 2026-12-07)
        dt_v2 = datetime(2026, 12, 7, 15, 40, 0, tzinfo=IST)
        res_v2 = NseCalendar.evaluate_session_instant(dt_v2, SecurityCategory.CAS_ELIGIBLE)
        assert res_v2.granular_phase == "CLOSING_AUCTION_MATCHING"
        assert res_v2.session_type == SessionType.SPECIAL_CAS
        assert res_v2.is_order_entry_allowed is False
        assert res_v2.order_type_allowed == "NONE"
        assert res_v2.is_continuous_trading is False

    def test_task3_non_cas_security_at_154000_across_regimes(self):
        """
        Verify NON_CAS security behavior at 15:40:00 across all three regimes:
        - LEGACY: CLOSING_SESSION (Order Entry: LIMIT_ONLY)
        - CAS_V1: TRANSITION_PERIOD (Order Entry: NONE)
        - CAS_V2: CLOSING_AUCTION_MATCHING (Order Entry: NONE)
        """
        # LEGACY
        dt_legacy = datetime(2026, 7, 31, 15, 40, 0, tzinfo=IST)
        res_leg = NseCalendar.evaluate_session_instant(dt_legacy, SecurityCategory.NON_CAS)
        assert res_leg.granular_phase == "CLOSING_SESSION"
        assert res_leg.is_order_entry_allowed is True
        assert res_leg.order_type_allowed == "LIMIT_ONLY"

        # CAS_V1
        dt_v1 = datetime(2026, 12, 4, 15, 40, 0, tzinfo=IST)
        res_v1 = NseCalendar.evaluate_session_instant(dt_v1, SecurityCategory.NON_CAS)
        assert res_v1.granular_phase == "TRANSITION_PERIOD"
        assert res_v1.is_order_entry_allowed is False
        assert res_v1.order_type_allowed == "NONE"

        # CAS_V2
        dt_v2 = datetime(2026, 12, 7, 15, 40, 0, tzinfo=IST)
        res_v2 = NseCalendar.evaluate_session_instant(dt_v2, SecurityCategory.NON_CAS)
        assert res_v2.granular_phase == "CLOSING_AUCTION_MATCHING"
        assert res_v2.is_order_entry_allowed is False
        assert res_v2.order_type_allowed == "NONE"

    # ========================================================================
    # TASK 4 — Historical Regression & Special Categories
    # ========================================================================

    def test_task4_spos_special_preopen_under_cas_v2(self):
        """
        Test SPOS (IPO / Relisted securities) under CAS 2.0:
        SPOS retains 09:00:00 to 09:45:00 order entry, 09:45:00 to 09:55:00 matching,
        09:55:00 to 10:00:00 buffer, and continuous trading starting at 10:00:00.
        Under CAS 2.0, continuous trading closes at 15:30:00.
        """
        test_date = date(2026, 12, 7)

        # 09:20:00 -> SPOS order entry (whereas regular market is continuous)
        res_spos_entry = NseCalendar.evaluate_session_instant(
            datetime.combine(test_date, time(9, 20, 0), tzinfo=IST),
            SecurityCategory.SPECIAL_PREOPEN_IPO
        )
        assert res_spos_entry.granular_phase == "SPOS_ORDER_ENTRY"
        assert res_spos_entry.session_type == SessionType.SPECIAL_PREOPEN
        assert res_spos_entry.is_continuous_trading is False
        assert res_spos_entry.is_order_entry_allowed is True

        # 09:50:00 -> SPOS matching
        res_spos_match = NseCalendar.evaluate_session_instant(
            datetime.combine(test_date, time(9, 50, 0), tzinfo=IST),
            SecurityCategory.SPECIAL_PREOPEN_IPO
        )
        assert res_spos_match.granular_phase == "SPOS_MATCHING"
        assert res_spos_match.is_order_entry_allowed is False

        # 10:00:00 -> Continuous trading begins for SPOS
        res_spos_cont = NseCalendar.evaluate_session_instant(
            datetime.combine(test_date, time(10, 0, 0), tzinfo=IST),
            SecurityCategory.SPECIAL_PREOPEN_IPO
        )
        assert res_spos_cont.granular_phase == "CONTINUOUS_TRADING"
        assert res_spos_cont.is_continuous_trading is True

        # 15:30:00 -> Continuous trading ends; enters CAS 2.0 buffer for SPOS
        res_spos_1530 = NseCalendar.evaluate_session_instant(
            datetime.combine(test_date, time(15, 30, 0), tzinfo=IST),
            SecurityCategory.SPECIAL_PREOPEN_IPO
        )
        assert res_spos_1530.granular_phase == "BUFFER"
        assert res_spos_1530.is_continuous_trading is False

    def test_task4_historical_regression_legacy_schedule_preservation(self):
        """
        Verify that passing calendar_regime=CalendarRegime.LEGACY (or evaluating pre-2026-08-03 dates)
        strictly preserves legacy VWAP buffer (15:30-15:40) and legacy closing session (15:40-16:00).
        """
        eval_dt = datetime(2026, 6, 15, 15, 35, 0, tzinfo=IST)
        res = NseCalendar.evaluate_session_instant(
            eval_dt,
            SecurityCategory.NON_CAS,
            calendar_regime=CalendarRegime.LEGACY
        )
        assert res.granular_phase == "BUFFER"
        assert res.is_continuous_trading is False
        assert res.is_order_entry_allowed is False
        assert "Closing price calculation buffer" in res.description

        eval_dt_close = datetime(2026, 6, 15, 15, 45, 0, tzinfo=IST)
        res_close = NseCalendar.evaluate_session_instant(
            eval_dt_close,
            SecurityCategory.NON_CAS,
            calendar_regime=CalendarRegime.LEGACY
        )
        assert res_close.granular_phase == "CLOSING_SESSION"
        assert res_close.is_order_entry_allowed is True
        assert res_close.order_type_allowed == "LIMIT_ONLY"

    def test_task4_historical_regression_cas_v1_schedule_preservation(self):
        """
        Verify that passing calendar_regime=CalendarRegime.CAS_V1 (or evaluating dates in
        2026-08-03..2026-12-06) preserves CAS 1.0 behavior:
        - CAS securities continuous trading closes early at 15:15:00.
        - CAS auction matching is 15:30:00 to 15:35:00.
        - Transition period is 15:35:00 to 15:50:00.
        - Closing session is 15:50:00 to 16:00:00.
        """
        eval_dt = datetime(2026, 9, 10, 15, 20, 0, tzinfo=IST)
        # In CAS 1.0, CAS securities continuous ends at 15:15
        res_cas_1520 = NseCalendar.evaluate_session_instant(
            eval_dt,
            SecurityCategory.CAS_ELIGIBLE,
            calendar_regime=CalendarRegime.CAS_V1
        )
        assert res_cas_1520.granular_phase == "CLOSING_AUCTION_ORDER_ENTRY"
        assert res_cas_1520.is_continuous_trading is False

        # Non-CAS in CAS 1.0 continues until 15:30
        res_noncas_1520 = NseCalendar.evaluate_session_instant(
            eval_dt,
            SecurityCategory.NON_CAS,
            calendar_regime=CalendarRegime.CAS_V1
        )
        assert res_noncas_1520.granular_phase == "CONTINUOUS_TRADING"
        assert res_noncas_1520.is_continuous_trading is True

    # ========================================================================
    # TASK 5 — Exact Second Boundary & Candle Timestamp Semantics
    # ========================================================================

    @pytest.mark.parametrize(
        "t_str, expected_phase, expected_continuous, expected_entry, expected_order_types, expected_random",
        [
            ("15:29:59", "CONTINUOUS_TRADING", True, True, "ALL", False),
            ("15:30:00", "CAS_TRANSITION", False, False, "NONE", False),
            ("15:30:59", "CAS_TRANSITION", False, False, "NONE", False),
            ("15:31:00", "CLOSING_AUCTION_ORDER_ENTRY", False, True, "ALL", False),
            ("15:35:59", "CLOSING_AUCTION_ORDER_ENTRY", False, True, "ALL", False),
            ("15:36:00", "CAS_LIMIT_ONLY", False, True, "LIMIT_ONLY", False),
            ("15:37:59", "CAS_LIMIT_ONLY", False, True, "LIMIT_ONLY", False),
            ("15:38:00", "CAS_LIMIT_ONLY", False, True, "LIMIT_ONLY", True),
            ("15:39:59", "CAS_LIMIT_ONLY", False, True, "LIMIT_ONLY", True),
            ("15:40:00", "CLOSING_AUCTION_MATCHING", False, False, "NONE", False),
            ("15:44:59", "CLOSING_AUCTION_MATCHING", False, False, "NONE", False),
            ("15:45:00", "TRANSITION_PERIOD", False, False, "NONE", False),
            ("15:49:59", "TRANSITION_PERIOD", False, False, "NONE", False),
            ("15:50:00", "CLOSING_SESSION", False, True, "LIMIT_ONLY", False),
            ("15:59:59", "CLOSING_SESSION", False, True, "LIMIT_ONLY", False),
            ("16:00:00", "CLOSED", False, False, "NONE", False),
        ]
    )
    def test_task5_cas_v2_exact_second_boundary_points(
        self, t_str, expected_phase, expected_continuous, expected_entry, expected_order_types, expected_random
    ):
        """
        Parametrized 16-point exact-second boundary test under CAS 2.0 (2026-12-07).
        Validates microstructural session classification, order entry allowances, and random closure flags.
        """
        h, m, s = map(int, t_str.split(":"))
        eval_dt = datetime(2026, 12, 7, h, m, s, tzinfo=IST)
        res = NseCalendar.evaluate_session_instant(eval_dt, SecurityCategory.CAS_ELIGIBLE)

        assert res.granular_phase == expected_phase, f"Failed at {t_str}: expected {expected_phase}, got {res.granular_phase}"
        assert res.is_continuous_trading == expected_continuous, f"Failed continuous at {t_str}"
        assert res.is_order_entry_allowed == expected_entry, f"Failed order entry at {t_str}"
        assert res.order_type_allowed == expected_order_types, f"Failed order types at {t_str}"
        assert res.is_random_closure_interval == expected_random, f"Failed random closure flag at {t_str}"

    def test_task5_cas_v2_candle_bar_evaluation_around_1530(self):
        """
        Verify OHLC candle evaluation across the 15:30:00 boundary under CAS 2.0
        for both START_OF_INTERVAL and END_OF_INTERVAL conventions:
        - 15:29:00 START_OF_INTERVAL (covers 15:29:00 - 15:30:00): continuous trading.
        - 15:30:00 START_OF_INTERVAL (covers 15:30:00 - 15:31:00): CAS_TRANSITION, not continuous.
        - 15:30:00 END_OF_INTERVAL (covers 15:29:00 - 15:30:00): continuous trading.
        - 15:31:00 END_OF_INTERVAL (covers 15:30:00 - 15:31:00): CAS_TRANSITION, not continuous.
        """
        test_date = date(2026, 12, 7)

        # 1. START_OF_INTERVAL convention
        # Bar 15:29:00 -> [15:29:00, 15:30:00) -> fully continuous
        dt_1529_start = datetime.combine(test_date, time(15, 29, 0), tzinfo=IST)
        bar_1529_start = NseCalendar.evaluate_candle_bar(
            dt_1529_start,
            timeframe_minutes=1,
            convention=CandleTimestampConvention.START_OF_INTERVAL,
            security_category=SecurityCategory.CAS_ELIGIBLE
        )
        assert bar_1529_start.granular_phase == "CONTINUOUS_TRADING"
        assert bar_1529_start.is_continuous_trading is True

        # Bar 15:30:00 -> [15:30:00, 15:31:00) -> CAS_TRANSITION
        dt_1530_start = datetime.combine(test_date, time(15, 30, 0), tzinfo=IST)
        bar_1530_start = NseCalendar.evaluate_candle_bar(
            dt_1530_start,
            timeframe_minutes=1,
            convention=CandleTimestampConvention.START_OF_INTERVAL,
            security_category=SecurityCategory.CAS_ELIGIBLE
        )
        assert bar_1530_start.granular_phase == "CAS_TRANSITION"
        assert bar_1530_start.is_continuous_trading is False

        # 2. END_OF_INTERVAL convention
        # Bar 15:30:00 -> represents interval [15:29:00, 15:30:00) -> continuous trading
        dt_1530_end = datetime.combine(test_date, time(15, 30, 0), tzinfo=IST)
        bar_1530_end = NseCalendar.evaluate_candle_bar(
            dt_1530_end,
            timeframe_minutes=1,
            convention=CandleTimestampConvention.END_OF_INTERVAL,
            security_category=SecurityCategory.CAS_ELIGIBLE
        )
        assert bar_1530_end.granular_phase == "CONTINUOUS_TRADING"
        assert bar_1530_end.is_continuous_trading is True

        # Bar 15:31:00 -> represents interval [15:30:00, 15:31:00) -> CAS_TRANSITION
        dt_1531_end = datetime.combine(test_date, time(15, 31, 0), tzinfo=IST)
        bar_1531_end = NseCalendar.evaluate_candle_bar(
            dt_1531_end,
            timeframe_minutes=1,
            convention=CandleTimestampConvention.END_OF_INTERVAL,
            security_category=SecurityCategory.CAS_ELIGIBLE
        )
        assert bar_1531_end.granular_phase == "CAS_TRANSITION"
        assert bar_1531_end.is_continuous_trading is False

    # ========================================================================
    # TASK 6 — Regulatory Evidence & Offline Safety Interlock Verification
    # ========================================================================

    def test_task6_regulatory_evidence_integrity(self):
        """
        Verify regulatory registry references for CAS V2:
        - Rule CAS_V2_SCHEDULE in REGULATORY_RULES_EVIDENCE_2026.
        - Circular NSE/CMTR/77355 and SEBI/HO/47/11/11(3)2025-MRD-POD2/I/23843/2026.
        - Entry CAS_V2_REGIME in CLOSING_SESSION_RECONCILIATION_EVIDENCE_2026.
        """
        assert "CAS_V2_SCHEDULE" in REGULATORY_RULES_EVIDENCE_2026
        rule_spec = REGULATORY_RULES_EVIDENCE_2026["CAS_V2_SCHEDULE"]
        assert rule_spec.circular_ref == "NSE/CMTR/77355"
        assert rule_spec.effective_date == "2026-12-07"
        assert rule_spec.implementation_matches is True
        assert rule_spec.verification_status == "VERIFIED"

        assert "CAS_V2_REGIME" in CLOSING_SESSION_RECONCILIATION_EVIDENCE_2026
        recon_spec = CLOSING_SESSION_RECONCILIATION_EVIDENCE_2026["CAS_V2_REGIME"]
        assert recon_spec["effective_from"] == "2026-12-07"
        assert recon_spec["closing_auction_matching"] == "15:40:00 - 15:45:00"
        assert recon_spec["verification_status"] == "VERIFIED"

    def test_task6_offline_research_safety_interlocks(self):
        """
        Enforce strict non-negotiable safety interlocks:
        - BrokerAdapter blocks any attempt to connect or place live orders.
        - TradingEngine refuses live order placement.
        """
        adapter = BrokerAdapter()
        order = Order(
            symbol="RELIANCE",
            transaction_type="BUY",
            quantity=10,
            order_type=OrderType.LIMIT,
            price=2500.0,
        )
        res = adapter.place_order(order)
        assert res is None, "BrokerAdapter must refuse live order placement"
        assert order.status == "REJECTED"
        assert "Live broker execution permanently disabled" in order.reject_reason

    def test_task6_safety_trading_engine_lockout(self):
        """Verify that TradingEngine permanently enforces offline research execution lockout."""
        order = Order(
            symbol="RELIANCE",
            transaction_type="BUY",
            quantity=10,
            order_type=OrderType.LIMIT,
            price=2500.0,
        )

        class LiveBrokerSimulator:
            IS_TEST_FIXTURE = False
            def place_order(self, o):
                return "UNAUTHORIZED_LIVE_ORDER"

        engine = TradingEngine(broker=LiveBrokerSimulator())
        assert engine.place_order(order) is False
