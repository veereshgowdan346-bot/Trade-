"""
OmniTradePro Apex V2.0 — Phase 7.4.5
Boundary Semantics & Regulatory Evidence Gap Closure Test Suite

STRICT OFFLINE RESEARCH ONLY:
- Live broker execution permanently disabled via safety interlock.
- No network connections, live credentials, or real orders.
- Formal microstructural interval boundary tests [T_start, T_end).
- Candle timestamp convention tests (START_OF_INTERVAL vs END_OF_INTERVAL).
- SPOS regulatory validation and refutation of unverified limit-only window.
- PCAIS 6-cycle verification across 3 regulatory tiers.
- Tri-state random closure logic verification.
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
    CandleTimestampConvention,
    RANDOM_CLOSURE_WINDOWS,
    PCAIS_OPERATIONAL_CYCLES,
    SPOS_SCHEDULE_SPEC,
    PCAIS_THREE_TIER_SPEC,
    REGULATORY_RULES_EVIDENCE_2026,
)
from core.historical_data_framework import HistoricalDataFramework
from core.broker_adapter import BrokerAdapter
from core.engine import TradingEngine


class TestPhase745BoundarySemantics:
    """Test Suite for Phase 7.4.5 Boundary Semantics & Regulatory Gap Closure."""

    # ========================================================================
    # TASK 1 — Resolve Boundary Inconsistencies & Interval Inclusiveness
    # ========================================================================

    def test_task1_regular_continuous_trading_interval(self):
        """
        Verify Regular Market Continuous Trading: [09:15:00, 15:30:00) IST.
        - Start 09:15:00 is INCLUSIVE.
        - End 15:30:00 is EXCLUSIVE. Instant 15:30:00 has entered BUFFER, not continuous trading.
        """
        day = date(2026, 2, 18) # Wednesday (non-holiday)
        cat = SecurityCategory.NON_CAS

        # 1 sec before open
        s_before = NseCalendar.evaluate_session_instant(datetime(2026, 2, 18, 9, 14, 59, tzinfo=IST), cat)
        assert s_before.is_continuous_trading is False
        assert s_before.granular_phase == "PRE_OPEN_BUFFER"

        # Exact open instant (09:15:00) -> INCLUSIVE START
        s_open = NseCalendar.evaluate_session_instant(datetime(2026, 2, 18, 9, 15, 0, tzinfo=IST), cat)
        assert s_open.is_continuous_trading is True
        assert s_open.granular_phase == "CONTINUOUS_TRADING"
        assert s_open.is_order_entry_allowed is True

        # Last continuous trading second (15:29:59)
        s_last_sec = NseCalendar.evaluate_session_instant(datetime(2026, 2, 18, 15, 29, 59, tzinfo=IST), cat)
        assert s_last_sec.is_continuous_trading is True
        assert s_last_sec.granular_phase == "CONTINUOUS_TRADING"

        # Exact close instant (15:30:00) -> EXCLUSIVE END (Continuous trading has ceased)
        s_close = NseCalendar.evaluate_session_instant(datetime(2026, 2, 18, 15, 30, 0, tzinfo=IST), cat)
        assert s_close.is_continuous_trading is False
        assert s_close.granular_phase == "BUFFER"
        assert s_close.is_order_entry_allowed is False

        # 1 sec into buffer (15:30:01)
        s_after = NseCalendar.evaluate_session_instant(datetime(2026, 2, 18, 15, 30, 1, tzinfo=IST), cat)
        assert s_after.is_continuous_trading is False
        assert s_after.granular_phase == "BUFFER"

    def test_task1_regular_closing_session_interval(self):
        """
        Verify Regular Closing Session: [15:40:00, 16:00:00) IST.
        - Start 15:40:00 is INCLUSIVE.
        - End 16:00:00 is EXCLUSIVE. Instant 16:00:00 is CLOSED.
        """
        cat = SecurityCategory.NON_CAS

        # 1 sec before closing session (15:39:59)
        s_before = NseCalendar.evaluate_session_instant(datetime(2026, 2, 18, 15, 39, 59, tzinfo=IST), cat)
        assert s_before.session_type == SessionType.CLOSED
        assert s_before.granular_phase == "BUFFER"
        assert s_before.is_order_entry_allowed is False

        # Exact start instant (15:40:00) -> INCLUSIVE START
        s_start = NseCalendar.evaluate_session_instant(datetime(2026, 2, 18, 15, 40, 0, tzinfo=IST), cat)
        assert s_start.session_type == SessionType.POST_CLOSE
        assert s_start.granular_phase == "CLOSING_SESSION"
        assert s_start.is_order_entry_allowed is True
        assert s_start.order_type_allowed == "LIMIT_ONLY"

        # Last second of closing session (15:59:59)
        s_last = NseCalendar.evaluate_session_instant(datetime(2026, 2, 18, 15, 59, 59, tzinfo=IST), cat)
        assert s_last.session_type == SessionType.POST_CLOSE
        assert s_last.granular_phase == "CLOSING_SESSION"
        assert s_last.is_order_entry_allowed is True

        # Exact end instant (16:00:00) -> EXCLUSIVE END (Market is CLOSED)
        s_end = NseCalendar.evaluate_session_instant(datetime(2026, 2, 18, 16, 0, 0, tzinfo=IST), cat)
        assert s_end.session_type == SessionType.CLOSED
        assert s_end.granular_phase == "CLOSED"
        assert s_end.is_order_entry_allowed is False

        # 1 sec after close (16:00:01)
        s_after = NseCalendar.evaluate_session_instant(datetime(2026, 2, 18, 16, 0, 1, tzinfo=IST), cat)
        assert s_after.session_type == SessionType.CLOSED
        assert s_after.granular_phase == "CLOSED"
        assert s_after.is_order_entry_allowed is False

    def test_task1_muhurat_cas_matching_interval(self):
        """
        Verify Diwali Muhurat CAS Matching: [15:30:00, 15:35:00) IST per NSE/CMTR/76941.
        - Start 15:30:00 is INCLUSIVE.
        - End 15:35:00 is EXCLUSIVE. Instant 15:35:00 is CAS_TRANSITION_BUFFER.
        """
        cat = SecurityCategory.CAS_ELIGIBLE

        # 1 sec before matching (15:29:59) -> In CAS limit-only / random closure
        s_before = NseCalendar.evaluate_session_instant(datetime(2026, 11, 8, 15, 29, 59, tzinfo=IST), cat)
        assert s_before.granular_phase == "CAS_LIMIT_ONLY"
        assert s_before.is_order_entry_allowed is True

        # Exact start instant (15:30:00) -> INCLUSIVE START of Matching
        s_start = NseCalendar.evaluate_session_instant(datetime(2026, 11, 8, 15, 30, 0, tzinfo=IST), cat)
        assert s_start.session_type == SessionType.SPECIAL_CAS
        assert s_start.granular_phase == "CLOSING_AUCTION_MATCHING"
        assert s_start.is_continuous_trading is False
        assert s_start.is_order_entry_allowed is False

        # Last second of matching (15:34:59)
        s_mid = NseCalendar.evaluate_session_instant(datetime(2026, 11, 8, 15, 34, 59, tzinfo=IST), cat)
        assert s_mid.granular_phase == "CLOSING_AUCTION_MATCHING"

        # Exact end instant (15:35:00) -> EXCLUSIVE END of Matching (Transition buffer)
        s_end = NseCalendar.evaluate_session_instant(datetime(2026, 11, 8, 15, 35, 0, tzinfo=IST), cat)
        assert s_end.session_type == SessionType.SPECIAL_CAS
        assert s_end.granular_phase == "CAS_TRANSITION_BUFFER"
        assert s_end.is_order_entry_allowed is False

        # 1 sec into buffer (15:35:01)
        s_after = NseCalendar.evaluate_session_instant(datetime(2026, 11, 8, 15, 35, 1, tzinfo=IST), cat)
        assert s_after.granular_phase == "CAS_TRANSITION_BUFFER"

    def test_task1_muhurat_post_close_interval(self):
        """
        Verify Diwali Muhurat Post-Close Session: [15:50:00, 16:00:00) IST per NSE/CMTR/76941.
        - Start 15:50:00 is INCLUSIVE.
        - End 16:00:00 is EXCLUSIVE. Instant 16:00:00 is CLOSED.
        """
        cat = SecurityCategory.CAS_ELIGIBLE

        # 1 sec before (15:49:59)
        s_before = NseCalendar.evaluate_session_instant(datetime(2026, 11, 8, 15, 49, 59, tzinfo=IST), cat)
        assert s_before.granular_phase == "CAS_TRANSITION_BUFFER"
        assert s_before.is_order_entry_allowed is False

        # Exact start instant (15:50:00) -> INCLUSIVE START
        s_start = NseCalendar.evaluate_session_instant(datetime(2026, 11, 8, 15, 50, 0, tzinfo=IST), cat)
        assert s_start.session_type == SessionType.POST_CLOSE
        assert s_start.granular_phase == "CLOSING_SESSION"
        assert s_start.is_order_entry_allowed is True
        assert s_start.order_type_allowed == "LIMIT_ONLY"

        # Last second (15:59:59)
        s_last = NseCalendar.evaluate_session_instant(datetime(2026, 11, 8, 15, 59, 59, tzinfo=IST), cat)
        assert s_last.session_type == SessionType.POST_CLOSE
        assert s_last.granular_phase == "CLOSING_SESSION"

        # Exact end instant (16:00:00) -> EXCLUSIVE END (Market CLOSED)
        s_end = NseCalendar.evaluate_session_instant(datetime(2026, 11, 8, 16, 0, 0, tzinfo=IST), cat)
        assert s_end.session_type == SessionType.CLOSED
        assert s_end.granular_phase == "CLOSED"
        assert s_end.is_order_entry_allowed is False

        # 1 sec after close (16:00:01)
        s_after = NseCalendar.evaluate_session_instant(datetime(2026, 11, 8, 16, 0, 1, tzinfo=IST), cat)
        assert s_after.session_type == SessionType.CLOSED
        assert s_after.granular_phase == "CLOSED"

    # ========================================================================
    # TASK 2 — Define Candle Timestamp Semantics & 15:30 Boundary
    # ========================================================================

    def test_task2_candle_convention_start_of_interval(self):
        """
        Verify START_OF_INTERVAL (Candle Opening Time) convention:
        - Candle stamped 09:15:00 covers [09:15, 09:16) -> VALID continuous bar.
        - Candle stamped 15:29:00 covers [15:29, 15:30) -> LAST VALID continuous bar.
        - Candle stamped 15:30:00 covers [15:30, 15:31) -> INVALID for continuous (BUFFER).
        - Candle stamped 15:31:00 covers [15:31, 15:32) -> INVALID for continuous (BUFFER).
        """
        conv = CandleTimestampConvention.START_OF_INTERVAL
        cat = SecurityCategory.NON_CAS

        # 09:15:00 bar
        c_open = NseCalendar.evaluate_candle_session(datetime(2026, 2, 18, 9, 15, 0, tzinfo=IST), 60, conv, cat)
        assert c_open.is_continuous_trading is True
        assert c_open.granular_phase == "CONTINUOUS_TRADING"
        assert HistoricalDataFramework.is_valid_candle_session(datetime(2026, 2, 18, 9, 15, 0, tzinfo=IST), 60, conv) is True

        # 15:29:00 bar (last bar of regular session)
        c_last = NseCalendar.evaluate_candle_session(datetime(2026, 2, 18, 15, 29, 0, tzinfo=IST), 60, conv, cat)
        assert c_last.is_continuous_trading is True
        assert c_last.granular_phase == "CONTINUOUS_TRADING"
        assert HistoricalDataFramework.is_valid_candle_session(datetime(2026, 2, 18, 15, 29, 0, tzinfo=IST), 60, conv) is True

        # 15:30:00 bar -> SPANS BEYOND 15:30:00 CLOSE -> NOT CONTINUOUS TRADING!
        c_30 = NseCalendar.evaluate_candle_session(datetime(2026, 2, 18, 15, 30, 0, tzinfo=IST), 60, conv, cat)
        assert c_30.is_continuous_trading is False
        assert c_30.granular_phase == "BUFFER"
        assert HistoricalDataFramework.is_valid_candle_session(datetime(2026, 2, 18, 15, 30, 0, tzinfo=IST), 60, conv) is False

        # 15:31:00 bar
        c_31 = NseCalendar.evaluate_candle_session(datetime(2026, 2, 18, 15, 31, 0, tzinfo=IST), 60, conv, cat)
        assert c_31.is_continuous_trading is False
        assert c_31.granular_phase == "BUFFER"
        assert HistoricalDataFramework.is_valid_candle_session(datetime(2026, 2, 18, 15, 31, 0, tzinfo=IST), 60, conv) is False

    def test_task2_candle_convention_end_of_interval(self):
        """
        Verify END_OF_INTERVAL (Candle Closing Time) convention:
        - Candle stamped 09:15:00 covers [09:14, 09:15) -> INVALID for continuous (PRE_OPEN_BUFFER).
        - Candle stamped 09:16:00 covers [09:15, 09:16) -> FIRST VALID continuous bar.
        - Candle stamped 15:30:00 covers [15:29, 15:30) -> LAST VALID continuous bar.
        - Candle stamped 15:31:00 covers [15:30, 15:31) -> INVALID for continuous (BUFFER).
        """
        conv = CandleTimestampConvention.END_OF_INTERVAL
        cat = SecurityCategory.NON_CAS

        # 09:15:00 bar covers [09:14, 09:15) -> PRE_OPEN_BUFFER
        c_open = NseCalendar.evaluate_candle_session(datetime(2026, 2, 18, 9, 15, 0, tzinfo=IST), 60, conv, cat)
        assert c_open.is_continuous_trading is False
        assert c_open.granular_phase == "PRE_OPEN_BUFFER"
        assert HistoricalDataFramework.is_valid_candle_session(datetime(2026, 2, 18, 9, 15, 0, tzinfo=IST), 60, conv) is False

        # 09:16:00 bar covers [09:15, 09:16) -> FIRST VALID
        c_first = NseCalendar.evaluate_candle_session(datetime(2026, 2, 18, 9, 16, 0, tzinfo=IST), 60, conv, cat)
        assert c_first.is_continuous_trading is True
        assert c_first.granular_phase == "CONTINUOUS_TRADING"
        assert HistoricalDataFramework.is_valid_candle_session(datetime(2026, 2, 18, 9, 16, 0, tzinfo=IST), 60, conv) is True

        # 15:30:00 bar covers [15:29, 15:30) -> LAST VALID
        c_30 = NseCalendar.evaluate_candle_session(datetime(2026, 2, 18, 15, 30, 0, tzinfo=IST), 60, conv, cat)
        assert c_30.is_continuous_trading is True
        assert c_30.granular_phase == "CONTINUOUS_TRADING"
        assert HistoricalDataFramework.is_valid_candle_session(datetime(2026, 2, 18, 15, 30, 0, tzinfo=IST), 60, conv) is True

        # 15:31:00 bar covers [15:30, 15:31) -> BUFFER
        c_31 = NseCalendar.evaluate_candle_session(datetime(2026, 2, 18, 15, 31, 0, tzinfo=IST), 60, conv, cat)
        assert c_31.is_continuous_trading is False
        assert c_31.granular_phase == "BUFFER"
        assert HistoricalDataFramework.is_valid_candle_session(datetime(2026, 2, 18, 15, 31, 0, tzinfo=IST), 60, conv) is False

    def test_task2_boundary_dual_interpretation_contrast(self):
        """
        Direct contrast at 15:30:00 IST proving that candle meaning depends strictly on convention:
        - Under START_OF_INTERVAL, 15:30:00 is NOT continuous trading (it represents 15:30-15:31).
        - Under END_OF_INTERVAL, 15:30:00 IS continuous trading (it represents 15:29-15:30).
        - In NO case is any bar spanning past 15:30:00 (e.g. START at 15:30 or END at 15:31) continuous!
        """
        t_30 = datetime(2026, 2, 18, 15, 30, 0, tzinfo=IST)
        
        is_cont_start = HistoricalDataFramework.is_valid_candle_session(t_30, 60, CandleTimestampConvention.START_OF_INTERVAL)
        is_cont_end = HistoricalDataFramework.is_valid_candle_session(t_30, 60, CandleTimestampConvention.END_OF_INTERVAL)
        
        assert is_cont_start is False, "Under START_OF_INTERVAL, 15:30 bar represents 15:30-15:31 and must be False"
        assert is_cont_end is True, "Under END_OF_INTERVAL, 15:30 bar represents 15:29-15:30 and must be True"

    # ========================================================================
    # TASK 3 — IPO Special Pre-Open Session (SPOS) Schedule & Order Types
    # ========================================================================

    def test_task3_spos_schedule_and_order_types(self):
        """
        Verify full SPOS schedule per SEBI Circular CIR/MRD/DP/01/2012:
        - 09:00:00 to 09:45:00: Order entry phase.
        - Paragraph 3(f) permits BOTH LIMIT and MARKET orders!
        - Random closure in last 10 minutes: 09:35:00 to 09:45:00.
        - 09:45:00 to 09:55:00: Order matching and trade confirmation.
        - 09:55:00 to 10:00:00: Transition buffer.
        - 10:00:00: Continuous trading commences.
        """
        cat = SecurityCategory.SPECIAL_PREOPEN_IPO

        # 09:20:00 order entry: Both LIMIT and MARKET allowed
        p_lmt = NseCalendar.check_order_entry_permission(datetime(2026, 2, 18, 9, 20, 0, tzinfo=IST), cat, "LIMIT")
        p_mkt = NseCalendar.check_order_entry_permission(datetime(2026, 2, 18, 9, 20, 0, tzinfo=IST), cat, "MARKET")
        assert p_lmt.is_allowed is True
        assert p_mkt.is_allowed is True
        assert p_lmt.order_type_allowed == "ALL"

        # 09:40:00 inside random closure eligibility window (before event): Both LIMIT and MARKET allowed
        p_rand_lmt = NseCalendar.check_order_entry_permission(datetime(2026, 2, 18, 9, 40, 0, tzinfo=IST), cat, "LIMIT")
        p_rand_mkt = NseCalendar.check_order_entry_permission(datetime(2026, 2, 18, 9, 40, 0, tzinfo=IST), cat, "MARKET")
        assert p_rand_lmt.is_allowed is True
        assert p_rand_mkt.is_allowed is True
        assert p_rand_lmt.is_random_closure_window is True

        # 09:50:00 matching: Order entry not allowed
        p_match = NseCalendar.check_order_entry_permission(datetime(2026, 2, 18, 9, 50, 0, tzinfo=IST), cat, "LIMIT")
        assert p_match.is_allowed is False

        # 09:58:00 buffer: Order entry not allowed
        p_buf = NseCalendar.check_order_entry_permission(datetime(2026, 2, 18, 9, 58, 0, tzinfo=IST), cat, "LIMIT")
        assert p_buf.is_allowed is False

        # 10:00:00 continuous trading open
        s_cont = NseCalendar.evaluate_session_instant(datetime(2026, 2, 18, 10, 0, 0, tzinfo=IST), cat)
        assert s_cont.is_continuous_trading is True
        assert s_cont.granular_phase == "CONTINUOUS_TRADING"

    def test_task3_spos_refute_unverified_deterministic_limit_only_subphase(self):
        """
        Verify that any claim of a deterministic limit-only window (e.g. 09:40-09:45)
        for SPOS is explicitly documented as UNVERIFIED.
        SEBI CIR/MRD/DP/01/2012 contains NO provision restricting order types during 09:40-09:45.
        """
        unverified_subphase = SPOS_SCHEDULE_SPEC["deterministic_limit_only_subphase"]
        assert unverified_subphase["verification_status"] == "UNVERIFIED"
        assert unverified_subphase["circular_ref"] == "NONE"
        assert "CIR/MRD/DP/01/2012 paragraph 3(f) permits both market and limit orders" in unverified_subphase["notes"]

    # ========================================================================
    # TASK 4 — Illiquid Periodic Call Auction (PCAIS) 6 Cycles & 3-Tier Split
    # ========================================================================

    def test_task4_pcais_six_operational_cycles(self):
        """
        Verify the exact operational schedule of all 6 PCAIS cycles per NSE/CMTR/23114.
        Each cycle is 1 hour (45m entry with 1m random closure, 8m matching, 7m buffer).
        """
        cycles = PCAIS_OPERATIONAL_CYCLES
        assert len(cycles) == 6

        expected_hours = [
            (1, time(9, 30), time(10, 30), time(10, 15), time(10, 14), time(10, 23)),
            (2, time(10, 30), time(11, 30), time(11, 15), time(11, 14), time(11, 23)),
            (3, time(11, 30), time(12, 30), time(12, 15), time(12, 14), time(12, 23)),
            (4, time(12, 30), time(13, 30), time(13, 15), time(13, 14), time(13, 23)),
            (5, time(13, 30), time(14, 30), time(14, 15), time(14, 14), time(14, 23)),
            (6, time(14, 30), time(15, 30), time(15, 15), time(15, 14), time(15, 23)),
        ]

        for num, c_start, c_end, o_end, r_start, m_end in expected_hours:
            c = cycles[num - 1]
            assert c.cycle_number == num
            assert c.cycle_start == c_start
            assert c.cycle_end == c_end
            assert c.order_entry_end == o_end
            assert c.random_closure_start == r_start
            assert c.matching_end == m_end
            assert c.buffer_end == c_end
            assert c.source_circular == "NSE/CMTR/23114"
            assert c.verification_status == "VERIFIED"

    def test_task4_pcais_three_tier_classification(self):
        """
        Verify the 3-Tier classification of PCAIS:
        - Tier 1: Regulatory Framework (SEBI CIR/MRD/DP/6/2013 & CIR/MRD/DP/38/2013) -> VERIFIED
        - Tier 2: NSE Operational Schedule (NSE/CMTR/23114) -> VERIFIED
        - Tier 3: Local Simulated Test Schedule -> UNVERIFIED (mock parameters only)
        """
        spec = PCAIS_THREE_TIER_SPEC

        t1 = spec["tier_1_regulatory_framework"]
        assert t1["verification_status"] == "VERIFIED"
        assert t1["cycle_duration_minutes"] == 60
        assert t1["order_entry_minutes"] == 45
        assert t1["order_matching_minutes"] == 8
        assert t1["buffer_minutes"] == 7
        assert t1["continuous_trading_minutes"] == 0

        t2 = spec["tier_2_operational_schedule"]
        assert t2["verification_status"] == "VERIFIED"
        assert t2["circular_ref"] == "NSE/CMTR/23114"
        assert t2["cycles_per_day"] == 6

        t3 = spec["tier_3_local_simulated_schedule"]
        assert t3["verification_status"] == "UNVERIFIED"
        assert t3["circular_ref"] == "NONE (LOCAL TEST HARNESS)"
        assert "NOT exchange rules" in t3["notes"]

    # ========================================================================
    # TASK 5 — Random Closure Tri-State Logic
    # ========================================================================

    def test_task5_tri_state_random_closure_logic(self):
        """
        Verify Tri-State Random Closure Logic:
        1. Before Window (t < 09:07:00): window not active, order entry permitted.
        2. In Window, Before Event (09:07:00 <= t < t_event): window active, order entry PERMITTED!
           (Crucial: Entering eligibility window does NOT prematurely close order entry!)
        3. At/After Event (t >= t_event): window active, order entry REJECTED with [SIMULATED].
        """
        cat = SecurityCategory.NON_CAS # Regular pre-open (09:00-09:15) with random window 09:07-09:08

        # Simulated exchange closure event at 09:07:35 IST
        t_event = datetime(2026, 2, 18, 9, 7, 35, tzinfo=IST)

        # State 1: Before eligibility window (09:06:59 IST)
        t1 = datetime(2026, 2, 18, 9, 6, 59, tzinfo=IST)
        p1 = NseCalendar.check_order_entry_permission(t1, cat, "LIMIT", exchange_closure_time=t_event)
        assert p1.is_allowed is True
        assert p1.is_random_closure_window is False

        # State 2: Inside eligibility window, but BEFORE closure event (09:07:20 IST)
        t2 = datetime(2026, 2, 18, 9, 7, 20, tzinfo=IST)
        p2 = NseCalendar.check_order_entry_permission(t2, cat, "LIMIT", exchange_closure_time=t_event)
        assert p2.is_allowed is True, "Order entry MUST be allowed inside window before closure event"
        assert p2.is_random_closure_window is True

        # State 3A: At exact closure event instant (09:07:35 IST)
        t3a = datetime(2026, 2, 18, 9, 7, 35, tzinfo=IST)
        p3a = NseCalendar.check_order_entry_permission(t3a, cat, "LIMIT", exchange_closure_time=t_event)
        assert p3a.is_allowed is False
        assert p3a.is_random_closure_window is True
        assert "[SIMULATED]" in p3a.reason

        # State 3B: After closure event, remaining inside window (09:07:50 IST)
        t3b = datetime(2026, 2, 18, 9, 7, 50, tzinfo=IST)
        p3b = NseCalendar.check_order_entry_permission(t3b, cat, "LIMIT", exchange_closure_time=t_event)
        assert p3b.is_allowed is False
        assert p3b.is_random_closure_window is True
        assert "[SIMULATED]" in p3b.reason

    # ========================================================================
    # TASK 6 — Safety Interlock & Live Broker Execution Lockout Verification
    # ========================================================================

    def test_task6_safety_broker_adapter_lockout(self):
        """Verify that BrokerAdapter hard-blocks live order execution in offline software research mode."""
        from core.broker_adapter import BrokerAdapter, Order, OrderType

        adapter = BrokerAdapter()
        order = Order(
            symbol="RELIANCE",
            transaction_type="BUY",
            quantity=10,
            order_type=OrderType.LIMIT,
            price=2500.0
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
            price=2500.0
        )

        class LiveBrokerSimulator:
            IS_TEST_FIXTURE = False
            def place_order(self, o):
                return "UNAUTHORIZED_LIVE_ORDER"

        engine = TradingEngine(broker=LiveBrokerSimulator())
        assert engine.place_order(order) is False


if __name__ == "__main__":
    pytest.main(["-v", __file__])
