"""
OmniTradePro Apex V2.0 — Phase 7.4.6
Closing Session Timing Reconciliation & Final Calendar Consistency Audit Test Suite

STRICT OFFLINE RESEARCH ONLY:
- Live broker execution permanently disabled via safety interlock.
- No network connections, live credentials, or real orders.
- Formal reconciliation of conflicting 15:40 vs 15:50 closing session timings.
- Verification of 6 distinct session states under Modern CAS architecture.
- 11-point microstructural boundary testing at exact seconds.
- Multi-convention candle timestamp semantics verification.
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
    CAS_GO_LIVE_DATE_2026,
    RANDOM_CLOSURE_WINDOWS,
    CLOSING_SESSION_RECONCILIATION_EVIDENCE_2026,
    SESSION_RULES_REGISTRY,
)
from core.historical_data_framework import HistoricalDataFramework
from core.broker_adapter import BrokerAdapter
from core.engine import TradingEngine


class TestPhase746ClosingSessionReconciliation:
    """Test Suite for Phase 7.4.6 Closing Session Timing Reconciliation & Consistency Audit."""

    # ========================================================================
    # TASK 1 — Resolve 15:40 vs 15:50 Conflict Across Regimes & Effective Dates
    # ========================================================================

    def test_task1_reconciliation_1540_vs_1550_modern_cas_regime(self):
        """
        Verify that under MODERN_CAS_2026 (post 2026-08-03):
        - 15:40:00 falls strictly inside TRANSITION_PERIOD (post-auction reconciliation).
        - Order entry is PROHIBITED (is_order_entry_allowed=False).
        - Continuous trading is INACTIVE (is_continuous_trading=False).
        - Closing session begins at 15:50:00, NOT 15:40:00.
        """
        eval_dt = datetime(2026, 8, 5, 15, 40, 0, tzinfo=IST) # Wednesday post go-live
        res = NseCalendar.evaluate_session_instant(
            eval_dt, SecurityCategory.NON_CAS, calendar_regime=CalendarRegime.MODERN_CAS_2026
        )
        assert res.granular_phase == "TRANSITION_PERIOD"
        assert res.is_continuous_trading is False
        assert res.is_order_entry_allowed is False
        assert res.order_type_allowed == "NONE"

        # Check closing session opens at 15:50:00
        res_closing = NseCalendar.evaluate_session_instant(
            datetime(2026, 8, 5, 15, 50, 0, tzinfo=IST),
            SecurityCategory.NON_CAS,
            calendar_regime=CalendarRegime.MODERN_CAS_2026,
        )
        assert res_closing.granular_phase == "CLOSING_SESSION"
        assert res_closing.session_type == SessionType.POST_CLOSE
        assert res_closing.is_continuous_trading is False
        assert res_closing.is_order_entry_allowed is True
        assert res_closing.order_type_allowed == "LIMIT_ONLY"

    def test_task1_reconciliation_1540_vs_1550_legacy_pre_cas_regime(self):
        """
        Verify that under LEGACY_PRE_CAS (prior to 2026-08-03):
        - Closing price calculation buffer ran 15:30:00 to 15:40:00.
        - Closing session began at 15:40:00 and ran until 16:00:00.
        """
        eval_dt_buf = datetime(2026, 2, 18, 15, 35, 0, tzinfo=IST)
        res_buf = NseCalendar.evaluate_session_instant(
            eval_dt_buf, SecurityCategory.NON_CAS, calendar_regime=CalendarRegime.LEGACY_PRE_CAS
        )
        assert res_buf.granular_phase == "BUFFER"
        assert res_buf.is_continuous_trading is False
        assert res_buf.is_order_entry_allowed is False

        eval_dt_closing = datetime(2026, 2, 18, 15, 40, 0, tzinfo=IST)
        res_closing = NseCalendar.evaluate_session_instant(
            eval_dt_closing, SecurityCategory.NON_CAS, calendar_regime=CalendarRegime.LEGACY_PRE_CAS
        )
        assert res_closing.granular_phase == "CLOSING_SESSION"
        assert res_closing.session_type == SessionType.POST_CLOSE
        assert res_closing.is_continuous_trading is False
        assert res_closing.is_order_entry_allowed is True
        assert res_closing.order_type_allowed == "LIMIT_ONLY"

    def test_task1_automatic_regime_selection_by_date(self):
        """
        Verify automatic regime selection based on CAS_GO_LIVE_DATE_2026 (2026-08-03):
        - Date 2026-08-02 (or earlier regular day 2026-07-31) defaults to LEGACY_PRE_CAS.
        - Date 2026-08-03 defaults to MODERN_CAS_2026.
        """
        # Friday 2026-07-31 at 15:40:00 -> Legacy closing session
        dt_pre = datetime(2026, 7, 31, 15, 40, 0, tzinfo=IST)
        res_pre = NseCalendar.evaluate_session_instant(dt_pre, SecurityCategory.NON_CAS)
        assert res_pre.granular_phase == "CLOSING_SESSION"
        assert res_pre.is_order_entry_allowed is True

        # Monday 2026-08-03 at 15:40:00 -> Modern transition period
        dt_post = datetime(2026, 8, 3, 15, 40, 0, tzinfo=IST)
        res_post = NseCalendar.evaluate_session_instant(dt_post, SecurityCategory.NON_CAS)
        assert res_post.granular_phase == "TRANSITION_PERIOD"
        assert res_post.is_order_entry_allowed is False

    def test_task1_unverified_modern_1540_closing_session_refutation(self):
        """
        Verify that claiming 15:40 is the modern closing session start is UNVERIFIED and refuted.
        Check SESSION_RULES_REGISTRY['UNVERIFIED_MODERN_1540_CLOSING_SESSION'].
        """
        rule = SESSION_RULES_REGISTRY["UNVERIFIED_MODERN_1540_CLOSING_SESSION"]
        assert rule.verification_status == "UNVERIFIED"
        assert rule.implementation_matches is False
        assert "15:40" in rule.rule_name
        assert "TRANSITION_PERIOD" in rule.notes
        assert "15:50:00" in rule.notes

    def test_task1_check_order_entry_permission_at_1540(self):
        """
        Verify check_order_entry_permission behavior at 15:40:00:
        - Modern CAS: Rejected (order entry prohibited during TRANSITION_PERIOD).
        - Legacy: Permitted for LIMIT order, rejected for MARKET order.
        """
        dt_modern = datetime(2026, 8, 5, 15, 40, 0, tzinfo=IST)
        perm_modern = NseCalendar.check_order_entry_permission(
            dt_modern, SecurityCategory.NON_CAS, "LIMIT", calendar_regime=CalendarRegime.MODERN_CAS_2026
        )
        assert perm_modern.is_allowed is False
        assert "TRANSITION_PERIOD" in perm_modern.reason

        dt_legacy = datetime(2026, 2, 18, 15, 40, 0, tzinfo=IST)
        perm_legacy_limit = NseCalendar.check_order_entry_permission(
            dt_legacy, SecurityCategory.NON_CAS, "LIMIT", calendar_regime=CalendarRegime.LEGACY_PRE_CAS
        )
        assert perm_legacy_limit.is_allowed is True
        assert perm_legacy_limit.order_type_allowed == "LIMIT_ONLY"

        perm_legacy_mkt = NseCalendar.check_order_entry_permission(
            dt_legacy, SecurityCategory.NON_CAS, "MARKET", calendar_regime=CalendarRegime.LEGACY_PRE_CAS
        )
        assert perm_legacy_mkt.is_allowed is False
        assert perm_legacy_mkt.order_type_allowed == "LIMIT_ONLY"
        assert "LIMIT" in perm_legacy_mkt.reason

    # ========================================================================
    # TASK 2 — Session Separation: 6 Distinct States Mapped
    # ========================================================================

    def test_task2_six_distinct_session_states_in_modern_cas(self):
        """
        Verify that all 6 required session states are distinctly represented:
        1. CONTINUOUS_TRADING: continuous=True, order_entry=True, ALL
        2. CLOSING_AUCTION_ORDER_ENTRY (or CAS_LIMIT_ONLY): continuous=False, order_entry=True
        3. CLOSING_AUCTION_MATCHING: continuous=False, order_entry=False, NONE
        4. TRANSITION_PERIOD: continuous=False, order_entry=False, NONE
        5. CLOSING_SESSION: continuous=False, order_entry=True, LIMIT_ONLY
        6. CLOSED: continuous=False, order_entry=False, NONE
        """
        day = date(2026, 8, 5)

        # 1. Continuous Trading (14:00:00)
        s1 = NseCalendar.evaluate_session_instant(
            datetime.combine(day, time(14, 0, 0), tzinfo=IST),
            SecurityCategory.CAS_ELIGIBLE,
            calendar_regime=CalendarRegime.MODERN_CAS_2026,
        )
        assert s1.granular_phase == "CONTINUOUS_TRADING"
        assert s1.is_continuous_trading is True
        assert s1.is_order_entry_allowed is True
        assert s1.order_type_allowed == "ALL"

        # 2. Closing Auction Order Entry (15:25:00 for CAS_ELIGIBLE)
        s2 = NseCalendar.evaluate_session_instant(
            datetime.combine(day, time(15, 25, 0), tzinfo=IST),
            SecurityCategory.CAS_ELIGIBLE,
            calendar_regime=CalendarRegime.MODERN_CAS_2026,
        )
        assert s2.granular_phase == "CLOSING_AUCTION_ORDER_ENTRY"
        assert s2.is_continuous_trading is False
        assert s2.is_order_entry_allowed is True
        assert s2.order_type_allowed == "ALL"

        # 3. Closing Auction Matching (15:32:00)
        s3 = NseCalendar.evaluate_session_instant(
            datetime.combine(day, time(15, 32, 0), tzinfo=IST),
            SecurityCategory.NON_CAS,
            calendar_regime=CalendarRegime.MODERN_CAS_2026,
        )
        assert s3.granular_phase == "CLOSING_AUCTION_MATCHING"
        assert s3.is_continuous_trading is False
        assert s3.is_order_entry_allowed is False
        assert s3.order_type_allowed == "NONE"

        # 4. Transition Period (15:40:00)
        s4 = NseCalendar.evaluate_session_instant(
            datetime.combine(day, time(15, 40, 0), tzinfo=IST),
            SecurityCategory.NON_CAS,
            calendar_regime=CalendarRegime.MODERN_CAS_2026,
        )
        assert s4.granular_phase == "TRANSITION_PERIOD"
        assert s4.is_continuous_trading is False
        assert s4.is_order_entry_allowed is False
        assert s4.order_type_allowed == "NONE"

        # 5. Closing Session (15:55:00)
        s5 = NseCalendar.evaluate_session_instant(
            datetime.combine(day, time(15, 55, 0), tzinfo=IST),
            SecurityCategory.NON_CAS,
            calendar_regime=CalendarRegime.MODERN_CAS_2026,
        )
        assert s5.granular_phase == "CLOSING_SESSION"
        assert s5.is_continuous_trading is False
        assert s5.is_order_entry_allowed is True
        assert s5.order_type_allowed == "LIMIT_ONLY"

        # 6. Post-Close Closed State (16:05:00)
        s6 = NseCalendar.evaluate_session_instant(
            datetime.combine(day, time(16, 5, 0), tzinfo=IST),
            SecurityCategory.NON_CAS,
            calendar_regime=CalendarRegime.MODERN_CAS_2026,
        )
        assert s6.granular_phase == "CLOSED"
        assert s6.is_continuous_trading is False
        assert s6.is_order_entry_allowed is False
        assert s6.order_type_allowed == "NONE"

    def test_task2_cas_scrip_order_entry_window_phases(self):
        """
        Verify CAS-eligible scrip progression between 15:15:00 and 15:30:00:
        - 15:14:59 -> CONTINUOUS_TRADING
        - 15:15:00 -> CAS_TRANSITION (reference price calculation)
        - 15:19:59 -> CAS_TRANSITION
        - 15:20:00 -> CLOSING_AUCTION_ORDER_ENTRY (market & limit)
        - 15:27:59 -> CLOSING_AUCTION_ORDER_ENTRY
        - 15:28:00 -> CAS_LIMIT_ONLY (random closure window 15:28-15:30)
        - 15:29:59 -> CAS_LIMIT_ONLY
        - 15:30:00 -> CLOSING_AUCTION_MATCHING
        """
        day = date(2026, 8, 5)
        cat = SecurityCategory.CAS_ELIGIBLE
        reg = CalendarRegime.MODERN_CAS_2026

        s_cont = NseCalendar.evaluate_session_instant(datetime.combine(day, time(15, 14, 59), tzinfo=IST), cat, calendar_regime=reg)
        assert s_cont.granular_phase == "CONTINUOUS_TRADING"
        assert s_cont.is_continuous_trading is True

        s_trans = NseCalendar.evaluate_session_instant(datetime.combine(day, time(15, 15, 0), tzinfo=IST), cat, calendar_regime=reg)
        assert s_trans.granular_phase == "CAS_TRANSITION"
        assert s_trans.is_order_entry_allowed is False

        s_entry = NseCalendar.evaluate_session_instant(datetime.combine(day, time(15, 20, 0), tzinfo=IST), cat, calendar_regime=reg)
        assert s_entry.granular_phase == "CLOSING_AUCTION_ORDER_ENTRY"
        assert s_entry.is_order_entry_allowed is True
        assert s_entry.order_type_allowed == "ALL"

        s_limit = NseCalendar.evaluate_session_instant(datetime.combine(day, time(15, 28, 0), tzinfo=IST), cat, calendar_regime=reg)
        assert s_limit.granular_phase == "CAS_LIMIT_ONLY"
        assert s_limit.is_order_entry_allowed is True
        assert s_limit.order_type_allowed == "LIMIT_ONLY"
        assert s_limit.is_random_closure_interval is True

        s_match = NseCalendar.evaluate_session_instant(datetime.combine(day, time(15, 30, 0), tzinfo=IST), cat, calendar_regime=reg)
        assert s_match.granular_phase == "CLOSING_AUCTION_MATCHING"
        assert s_match.is_order_entry_allowed is False

    # ========================================================================
    # TASK 3 — Exact Boundary Testing Across 11 Timestamps
    # ========================================================================

    @pytest.mark.parametrize(
        "time_str,expected_phase,expected_continuous,expected_entry,expected_order_type",
        [
            ("15:29:59", "CONTINUOUS_TRADING", True, True, "ALL"),
            ("15:30:00", "CLOSING_AUCTION_MATCHING", False, False, "NONE"),
            ("15:34:59", "CLOSING_AUCTION_MATCHING", False, False, "NONE"),
            ("15:35:00", "TRANSITION_PERIOD", False, False, "NONE"),
            ("15:39:59", "TRANSITION_PERIOD", False, False, "NONE"),
            ("15:40:00", "TRANSITION_PERIOD", False, False, "NONE"), # CRITICAL: not closing session
            ("15:49:59", "TRANSITION_PERIOD", False, False, "NONE"),
            ("15:50:00", "CLOSING_SESSION", False, True, "LIMIT_ONLY"), # CRITICAL: closing session start
            ("15:59:59", "CLOSING_SESSION", False, True, "LIMIT_ONLY"),
            ("16:00:00", "CLOSED", False, False, "NONE"),
            ("16:00:01", "CLOSED", False, False, "NONE"),
        ],
    )
    def test_task3_eleven_boundary_timestamps_modern_cas_instant(
        self, time_str, expected_phase, expected_continuous, expected_entry, expected_order_type
    ):
        """
        Verify all 11 exact microstructural boundary timestamps under MODERN_CAS_2026.
        Enforces strictly half-open interval semantics [T_start, T_end).
        """
        day = date(2026, 8, 5) # Wednesday
        h, m, s = map(int, time_str.split(":"))
        dt = datetime.combine(day, time(h, m, s), tzinfo=IST)

        res = NseCalendar.evaluate_session_instant(
            dt, SecurityCategory.NON_CAS, calendar_regime=CalendarRegime.MODERN_CAS_2026
        )
        assert res.granular_phase == expected_phase
        assert res.is_continuous_trading is expected_continuous
        assert res.is_order_entry_allowed is expected_entry
        assert res.order_type_allowed == expected_order_type

    @pytest.mark.parametrize(
        "time_str,expected_phase,expected_continuous,expected_entry,expected_order_type",
        [
            ("15:29:59", "CONTINUOUS_TRADING", True, True, "ALL"),
            ("15:30:00", "BUFFER", False, False, "NONE"),
            ("15:34:59", "BUFFER", False, False, "NONE"),
            ("15:35:00", "BUFFER", False, False, "NONE"),
            ("15:39:59", "BUFFER", False, False, "NONE"),
            ("15:40:00", "CLOSING_SESSION", False, True, "LIMIT_ONLY"), # Legacy closing session start
            ("15:49:59", "CLOSING_SESSION", False, True, "LIMIT_ONLY"),
            ("15:50:00", "CLOSING_SESSION", False, True, "LIMIT_ONLY"),
            ("15:59:59", "CLOSING_SESSION", False, True, "LIMIT_ONLY"),
            ("16:00:00", "CLOSED", False, False, "NONE"),
            ("16:00:01", "CLOSED", False, False, "NONE"),
        ],
    )
    def test_task3_eleven_boundary_timestamps_legacy_regime_instant(
        self, time_str, expected_phase, expected_continuous, expected_entry, expected_order_type
    ):
        """
        Verify all 11 exact microstructural boundary timestamps under LEGACY_PRE_CAS.
        Confirms legacy closing session began at 15:40:00, not 15:50:00.
        """
        day = date(2026, 2, 18)
        h, m, s = map(int, time_str.split(":"))
        dt = datetime.combine(day, time(h, m, s), tzinfo=IST)

        res = NseCalendar.evaluate_session_instant(
            dt, SecurityCategory.NON_CAS, calendar_regime=CalendarRegime.LEGACY_PRE_CAS
        )
        assert res.granular_phase == expected_phase
        assert res.is_continuous_trading is expected_continuous
        assert res.is_order_entry_allowed is expected_entry
        assert res.order_type_allowed == expected_order_type

    # ========================================================================
    # TASK 4 — Candle Timestamp Semantics Across Regimes
    # ========================================================================

    def test_task4_start_of_interval_boundary_candles(self):
        """
        Verify 1-minute candle evaluation with START_OF_INTERVAL convention:
        - Candle at 15:29:00 covers [15:29:00, 15:30:00) -> is_continuous_trading == True
        - Candle at 15:30:00 covers [15:30:00, 15:31:00) -> is_continuous_trading == False
        """
        day = date(2026, 8, 5)

        # 15:29:00 START
        dt_1529 = datetime.combine(day, time(15, 29, 0), tzinfo=IST)
        res_1529 = NseCalendar.evaluate_candle_session(
            dt_1529, 60, CandleTimestampConvention.START_OF_INTERVAL,
            SecurityCategory.NON_CAS, calendar_regime=CalendarRegime.MODERN_CAS_2026
        )
        assert res_1529.is_continuous_trading is True
        assert res_1529.granular_phase == "CONTINUOUS_TRADING"

        # 15:30:00 START
        dt_1530 = datetime.combine(day, time(15, 30, 0), tzinfo=IST)
        res_1530 = NseCalendar.evaluate_candle_session(
            dt_1530, 60, CandleTimestampConvention.START_OF_INTERVAL,
            SecurityCategory.NON_CAS, calendar_regime=CalendarRegime.MODERN_CAS_2026
        )
        assert res_1530.is_continuous_trading is False
        assert res_1530.granular_phase != "CONTINUOUS_TRADING"

    def test_task4_end_of_interval_boundary_candles(self):
        """
        Verify 1-minute candle evaluation with END_OF_INTERVAL convention:
        - Candle at 15:30:00 covers [15:29:00, 15:30:00) -> is_continuous_trading == True
        - Candle at 15:31:00 covers [15:30:00, 15:31:00) -> is_continuous_trading == False
        """
        day = date(2026, 8, 5)

        # 15:30:00 END
        dt_1530 = datetime.combine(day, time(15, 30, 0), tzinfo=IST)
        res_1530 = NseCalendar.evaluate_candle_session(
            dt_1530, 60, CandleTimestampConvention.END_OF_INTERVAL,
            SecurityCategory.NON_CAS, calendar_regime=CalendarRegime.MODERN_CAS_2026
        )
        assert res_1530.is_continuous_trading is True
        assert res_1530.granular_phase == "CONTINUOUS_TRADING"

        # 15:31:00 END
        dt_1531 = datetime.combine(day, time(15, 31, 0), tzinfo=IST)
        res_1531 = NseCalendar.evaluate_candle_session(
            dt_1531, 60, CandleTimestampConvention.END_OF_INTERVAL,
            SecurityCategory.NON_CAS, calendar_regime=CalendarRegime.MODERN_CAS_2026
        )
        assert res_1531.is_continuous_trading is False
        assert res_1531.granular_phase != "CONTINUOUS_TRADING"

    def test_task4_multi_minute_candle_duration_boundaries(self):
        """
        Verify 5-minute and 15-minute candle spans respect session boundaries:
        - 5-min candle at 15:25:00 START covers [15:25:00, 15:30:00) -> valid continuous
        - 5-min candle at 15:26:00 START covers [15:26:00, 15:31:00) -> straddles boundary -> invalid continuous
        - 15-min candle at 15:15:00 START covers [15:15:00, 15:30:00) -> valid continuous
        """
        day = date(2026, 8, 5)

        # 5m at 15:25:00 START (valid)
        c5_valid = NseCalendar.evaluate_candle_session(
            datetime.combine(day, time(15, 25, 0), tzinfo=IST), 300,
            CandleTimestampConvention.START_OF_INTERVAL,
            SecurityCategory.NON_CAS, calendar_regime=CalendarRegime.MODERN_CAS_2026
        )
        assert c5_valid.is_continuous_trading is True

        # 5m at 15:26:00 START (invalid - straddles 15:30:00)
        c5_invalid = NseCalendar.evaluate_candle_session(
            datetime.combine(day, time(15, 26, 0), tzinfo=IST), 300,
            CandleTimestampConvention.START_OF_INTERVAL,
            SecurityCategory.NON_CAS, calendar_regime=CalendarRegime.MODERN_CAS_2026
        )
        assert c5_invalid.is_continuous_trading is False

        # 15m at 15:15:00 START (valid)
        c15_valid = NseCalendar.evaluate_candle_session(
            datetime.combine(day, time(15, 15, 0), tzinfo=IST), 900,
            CandleTimestampConvention.START_OF_INTERVAL,
            SecurityCategory.NON_CAS, calendar_regime=CalendarRegime.MODERN_CAS_2026
        )
        assert c15_valid.is_continuous_trading is True

    # ========================================================================
    # TASK 5 — Regulatory Evidence Integrity Check
    # ========================================================================

    def test_task5_regulatory_evidence_integrity(self):
        """
        Verify all circular references in CLOSING_SESSION_RECONCILIATION_EVIDENCE_2026:
        1. LEGACY_PRE_CAS: NSE/CMTR/13444, effective 2010-01-04 to 2026-08-02
        2. MODERN_CAS_REGIME: SEBI HO/47/11/11(3)2025-MRD-POD2/I/2765/2026, NSE/CMTR/73362,
           NSE/CMTR/74466, NSE/CMTR/76941, effective 2026-08-03
        3. CONFLICT_RESOLUTION_1540_VS_1550: Explicit reconciliation
        """
        evidence = CLOSING_SESSION_RECONCILIATION_EVIDENCE_2026
        assert "LEGACY_PRE_CAS_REGIME" in evidence
        assert "MODERN_CAS_REGIME" in evidence
        assert "CONFLICT_RESOLUTION_1540_VS_1550" in evidence

        legacy = evidence["LEGACY_PRE_CAS_REGIME"]
        assert "NSE/CMTR/13444" in legacy["regulatory_circulars"]
        assert legacy["closing_session"] == "15:40:00 - 16:00:00"
        assert legacy["sunset_date"] == "2026-08-02"
        assert legacy["verification_status"] == "VERIFIED"

        modern = evidence["MODERN_CAS_REGIME"]
        assert modern["effective_date"] == "2026-08-03"
        assert modern["closing_session"] == "15:50:00 - 16:00:00"
        assert modern["transition_period"] == "15:35:00 - 15:50:00"
        assert modern["verification_status"] == "VERIFIED"
        assert any("73362" in c for c in modern["regulatory_circulars"])
        assert any("74466" in c for c in modern["regulatory_circulars"])
        assert any("76941" in c for c in modern["regulatory_circulars"])

        conflict = evidence["CONFLICT_RESOLUTION_1540_VS_1550"]
        assert conflict["status"] == "RESOLVED_DATE_AND_REGIME_DEPENDENT"
        assert conflict["verified_modern_closing_session_start"] == "15:50:00"
        assert conflict["modern_1540_as_closing_session_status"] == "UNVERIFIED"

    def test_task5_random_closure_windows_registry(self):
        """Verify modern CAS regular random closure window is registered."""
        assert "MODERN_CAS_REGULAR" in RANDOM_CLOSURE_WINDOWS
        win = RANDOM_CLOSURE_WINDOWS["MODERN_CAS_REGULAR"]
        assert win.window_start == time(15, 28)
        assert win.window_end == time(15, 30)

    # ========================================================================
    # TASK 6 — Safety Regression & Lockout Invariant
    # ========================================================================

    def test_task6_safety_interlock_live_execution_lockout(self):
        """Verify that live execution remains permanently locked out."""
        from core.broker_adapter import BrokerAdapter, Order, OrderType

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
        from core.broker_adapter import Order, OrderType

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
