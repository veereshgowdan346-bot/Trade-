"""
OmniTradePro Apex V2.0 — Phase 7.4.3
Independent Test Suite: CAS-Aware Session State Correction & Random Closure Modeling

MODE: STRICT OFFLINE RESEARCH ONLY
No live broker connectivity, credentials, real orders, or real-money execution.

Authoritative Circulars & Regulatory Sources of Truth:
1. Diwali Muhurat Trading 2026:
   - Primary Circular: NSE/CMTR/76941 (Download Ref: 149/2026, Published: 2026-10-19)
2. Special Pre-Open Session (SPOS) for IPOs & Relisted Securities:
   - SEBI Circular: CIR/MRD/DP/01/2012 (Published: 2012-01-20)
3. Periodic Call Auction for Illiquid Securities (PCAIS):
   - SEBI Circular: CIR/MRD/DP/6/2013 (Published: 2013-01-24)
4. Annual Holidays & Disaster Recovery Sessions:
   - NSE/CMTR/71775, NSE/CMTR/72260, NSE/MSD/73126
"""

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(REPO_ROOT))

import pytest
from datetime import datetime, date, time, timezone, timedelta

from core.nse_calendar import (
    NseCalendar,
    SessionType,
    SecurityCategory,
    MuhuratSessionPhase,
    RandomClosureWindow,
    OrderEntryPermission,
    SecuritySessionEvaluation,
    RANDOM_CLOSURE_WINDOWS,
    MUHURAT_SESSION_2026,
    IST
)


class TestTask1SecuritySpecificSessionStates:
    """Task 1: Security-specific session evaluation and validation."""

    def test_security_category_validation(self):
        """Validate supported security categories and reject invalid/missing categories."""
        # Supported enum instances
        assert NseCalendar.validate_security_category(SecurityCategory.CAS_ELIGIBLE) == SecurityCategory.CAS_ELIGIBLE
        assert NseCalendar.validate_security_category(SecurityCategory.NON_CAS) == SecurityCategory.NON_CAS
        assert NseCalendar.validate_security_category(SecurityCategory.SPECIAL_PREOPEN_IPO) == SecurityCategory.SPECIAL_PREOPEN_IPO
        assert NseCalendar.validate_security_category(SecurityCategory.ILLIQUID_CALL_AUCTION) == SecurityCategory.ILLIQUID_CALL_AUCTION

        # Case-insensitive string mapping
        assert NseCalendar.validate_security_category("cas_eligible") == SecurityCategory.CAS_ELIGIBLE
        assert NseCalendar.validate_security_category("NON_CAS") == SecurityCategory.NON_CAS
        assert NseCalendar.validate_security_category("special_preopen_ipo") == SecurityCategory.SPECIAL_PREOPEN_IPO
        assert NseCalendar.validate_security_category("illiquid_call_auction") == SecurityCategory.ILLIQUID_CALL_AUCTION

        # Rejection of None, empty string, or invalid category
        with pytest.raises(ValueError, match="cannot be None"):
            NseCalendar.validate_security_category(None)

        with pytest.raises(ValueError, match="Invalid security category"):
            NseCalendar.validate_security_category("")

        with pytest.raises(ValueError, match="Invalid security category"):
            NseCalendar.validate_security_category("COMMODITY_FUTURES")

        with pytest.raises(ValueError, match="Invalid security category"):
            NseCalendar.evaluate_security_session(
                datetime(2026, 11, 8, 14, 30, tzinfo=IST),
                security_category="INVALID_CATEGORY"
            )


class TestTask2MuhuratScheduleAndBoundaries:
    """
    Task 2: Diwali Muhurat 2026 exact microstructure and boundary tests
    governed strictly by NSE Circular NSE/CMTR/76941.
    """

    def test_block_deal_window_1350_to_1405(self):
        """13:50 to 14:05 IST is the institutional block deal window."""
        t_before = datetime(2026, 11, 8, 13, 49, 59, tzinfo=IST)
        t_start = datetime(2026, 11, 8, 13, 50, 0, tzinfo=IST)
        t_mid = datetime(2026, 11, 8, 13, 57, 30, tzinfo=IST)
        t_end = datetime(2026, 11, 8, 14, 4, 59, tzinfo=IST)
        t_after = datetime(2026, 11, 8, 14, 5, 0, tzinfo=IST)

        assert NseCalendar.is_muhurat_block_deal(t_before) is False
        assert NseCalendar.is_muhurat_block_deal(t_start) is True
        assert NseCalendar.is_muhurat_block_deal(t_mid) is True
        assert NseCalendar.is_muhurat_block_deal(t_end) is True
        assert NseCalendar.is_muhurat_block_deal(t_after) is False

        # Session evaluation
        eval_mid = NseCalendar.evaluate_security_session(t_mid, SecurityCategory.CAS_ELIGIBLE)
        assert eval_mid.session_type == SessionType.BLOCK_DEAL
        assert eval_mid.granular_phase == "BLOCK_DEAL"
        assert eval_mid.is_continuous_trading is False
        assert eval_mid.is_order_entry_allowed is False

        # Phase enum with include_block_deal flag
        assert NseCalendar.get_muhurat_phase(t_mid, include_block_deal=True) == MuhuratSessionPhase.BLOCK_DEAL
        # Backward compatibility with 7.4.2 (defaults to CLOSED before 14:05)
        assert NseCalendar.get_muhurat_phase(t_mid, include_block_deal=False) == MuhuratSessionPhase.CLOSED

    def test_pre_open_microstructure_1405_to_1420(self):
        """Pre-open phases: 14:05-14:10 entry, 14:10-14:15 limit-only, 14:15-14:17 match, 14:17-14:20 buffer."""
        t_entry = datetime(2026, 11, 8, 14, 7, 0, tzinfo=IST)
        t_limit = datetime(2026, 11, 8, 14, 11, 0, tzinfo=IST)
        t_match = datetime(2026, 11, 8, 14, 16, 0, tzinfo=IST)
        t_buf = datetime(2026, 11, 8, 14, 18, 0, tzinfo=IST)

        eval_entry = NseCalendar.evaluate_security_session(t_entry, SecurityCategory.CAS_ELIGIBLE)
        assert eval_entry.session_type == SessionType.PRE_OPEN
        assert eval_entry.granular_phase == "PRE_OPEN_ENTRY"
        assert eval_entry.is_order_entry_allowed is True
        assert eval_entry.order_type_allowed == "ALL"
        assert eval_entry.is_random_closure_interval is False

        eval_limit = NseCalendar.evaluate_security_session(t_limit, SecurityCategory.CAS_ELIGIBLE)
        assert eval_limit.session_type == SessionType.PRE_OPEN
        assert eval_limit.granular_phase == "PRE_OPEN_LIMIT_ONLY"
        assert eval_limit.is_order_entry_allowed is True
        assert eval_limit.order_type_allowed == "LIMIT_ONLY"
        assert eval_limit.is_random_closure_interval is False

        eval_match = NseCalendar.evaluate_security_session(t_match, SecurityCategory.CAS_ELIGIBLE)
        assert eval_match.granular_phase == "PRE_OPEN_MATCHING"
        assert eval_match.is_order_entry_allowed is False

        eval_buf = NseCalendar.evaluate_security_session(t_buf, SecurityCategory.CAS_ELIGIBLE)
        assert eval_buf.granular_phase == "PRE_OPEN_BUFFER"
        assert eval_buf.is_order_entry_allowed is False

    def test_pre_open_random_closure_window_1413_to_1415(self):
        """Random closure occurs in the final 2 minutes of pre-open order entry (14:13 to 14:15)."""
        t_before = datetime(2026, 11, 8, 14, 12, 59, tzinfo=IST)
        t_start = datetime(2026, 11, 8, 14, 13, 0, tzinfo=IST)
        t_mid = datetime(2026, 11, 8, 14, 14, 15, tzinfo=IST)
        t_end = datetime(2026, 11, 8, 14, 14, 59, tzinfo=IST)

        assert NseCalendar.evaluate_security_session(t_before, SecurityCategory.CAS_ELIGIBLE).is_random_closure_interval is False
        eval_start = NseCalendar.evaluate_security_session(t_start, SecurityCategory.CAS_ELIGIBLE)
        assert eval_start.is_random_closure_interval is True
        assert eval_start.random_closure_window == RANDOM_CLOSURE_WINDOWS["MUHURAT_PRE_OPEN"]

        eval_mid = NseCalendar.evaluate_security_session(t_mid, SecurityCategory.CAS_ELIGIBLE)
        assert eval_mid.is_random_closure_interval is True
        assert eval_mid.random_closure_window.window_start == time(14, 13)
        assert eval_mid.random_closure_window.window_end == time(14, 15)

        eval_end = NseCalendar.evaluate_security_session(t_end, SecurityCategory.CAS_ELIGIBLE)
        assert eval_end.is_random_closure_interval is True

    def test_continuous_trading_commences_at_1420(self):
        """Continuous trading session commences at exactly 14:20:00 IST."""
        t_before = datetime(2026, 11, 8, 14, 19, 59, tzinfo=IST)
        t_start = datetime(2026, 11, 8, 14, 20, 0, tzinfo=IST)
        t_mid = datetime(2026, 11, 8, 14, 45, 0, tzinfo=IST)

        assert NseCalendar.is_valid_trading_time(t_before, security_category=SecurityCategory.CAS_ELIGIBLE) is False
        assert NseCalendar.is_valid_trading_time(t_start, security_category=SecurityCategory.CAS_ELIGIBLE) is True
        assert NseCalendar.is_valid_trading_time(t_mid, security_category=SecurityCategory.CAS_ELIGIBLE) is True

        eval_mid = NseCalendar.evaluate_security_session(t_mid, SecurityCategory.CAS_ELIGIBLE)
        assert eval_mid.session_type == SessionType.SPECIAL_MUHURAT
        assert eval_mid.granular_phase == "CONTINUOUS_TRADING"
        assert eval_mid.is_continuous_trading is True


class TestTask2CasVsNonCasDivergence:
    """
    Task 2: CAS-eligible vs Non-CAS divergence between 15:15 and 15:30 on Muhurat Day.
    - CAS securities continuous trading closes at 15:15:00.
    - Non-CAS securities continuous trading runs until 15:30:00.
    """

    def test_cas_closure_at_1515_vs_non_cas_continuation(self):
        """At 15:15:00, continuous trading closes for CAS securities, but continues for Non-CAS."""
        t_before = datetime(2026, 11, 8, 15, 14, 59, tzinfo=IST)
        t_close = datetime(2026, 11, 8, 15, 15, 0, tzinfo=IST)
        t_mid_trans = datetime(2026, 11, 8, 15, 18, 0, tzinfo=IST)

        # Before 15:15: both are in continuous trading
        assert NseCalendar.is_valid_trading_time(t_before, security_category=SecurityCategory.CAS_ELIGIBLE) is True
        assert NseCalendar.is_valid_trading_time(t_before, security_category=SecurityCategory.NON_CAS) is True

        # At 15:15:00: CAS closes continuous trading, Non-CAS remains open
        assert NseCalendar.is_valid_trading_time(t_close, security_category=SecurityCategory.CAS_ELIGIBLE) is False
        assert NseCalendar.is_valid_trading_time(t_close, security_category=SecurityCategory.NON_CAS) is True

        # At 15:18:00: CAS is in reference transition, Non-CAS continues trading
        eval_cas = NseCalendar.evaluate_security_session(t_mid_trans, SecurityCategory.CAS_ELIGIBLE)
        assert eval_cas.session_type == SessionType.SPECIAL_CAS
        assert eval_cas.granular_phase == "CAS_TRANSITION"
        assert eval_cas.is_continuous_trading is False
        assert eval_cas.is_order_entry_allowed is False

        eval_non_cas = NseCalendar.evaluate_security_session(t_mid_trans, SecurityCategory.NON_CAS)
        assert eval_non_cas.session_type == SessionType.SPECIAL_MUHURAT
        assert eval_non_cas.granular_phase == "CONTINUOUS_TRADING"
        assert eval_non_cas.is_continuous_trading is True
        assert eval_non_cas.is_order_entry_allowed is True

    def test_cas_order_entry_1520_to_1525_vs_non_cas(self):
        """15:20 to 15:25 is CAS order entry (Market & Limit) for CAS, continuous for Non-CAS."""
        t_cas_entry = datetime(2026, 11, 8, 15, 22, 30, tzinfo=IST)

        eval_cas = NseCalendar.evaluate_security_session(t_cas_entry, SecurityCategory.CAS_ELIGIBLE)
        assert eval_cas.session_type == SessionType.SPECIAL_CAS
        assert eval_cas.granular_phase == "CLOSING_AUCTION_ENTRY"
        assert eval_cas.is_continuous_trading is False
        assert eval_cas.is_order_entry_allowed is True
        assert eval_cas.order_type_allowed == "ALL"

        eval_non_cas = NseCalendar.evaluate_security_session(t_cas_entry, SecurityCategory.NON_CAS)
        assert eval_non_cas.session_type == SessionType.SPECIAL_MUHURAT
        assert eval_non_cas.granular_phase == "CONTINUOUS_TRADING"
        assert eval_non_cas.is_continuous_trading is True
        assert eval_non_cas.is_order_entry_allowed is True

    def test_cas_limit_only_and_random_closure_1525_to_1530(self):
        """15:25 to 15:30 is CAS limit-only entry, with random closure in final 2 mins (15:28-15:30)."""
        t_limit_early = datetime(2026, 11, 8, 15, 26, 0, tzinfo=IST)
        t_random_win = datetime(2026, 11, 8, 15, 29, 0, tzinfo=IST)

        # 15:26: Limit-only, outside random closure
        eval_early = NseCalendar.evaluate_security_session(t_limit_early, SecurityCategory.CAS_ELIGIBLE)
        assert eval_early.session_type == SessionType.SPECIAL_CAS
        assert eval_early.granular_phase == "CAS_LIMIT_ONLY"
        assert eval_early.is_order_entry_allowed is True
        assert eval_early.order_type_allowed == "LIMIT_ONLY"
        assert eval_early.is_random_closure_interval is False

        # 15:29: Limit-only, inside random closure window
        eval_rand = NseCalendar.evaluate_security_session(t_random_win, SecurityCategory.CAS_ELIGIBLE)
        assert eval_rand.session_type == SessionType.SPECIAL_CAS
        assert eval_rand.granular_phase == "CAS_LIMIT_ONLY"
        assert eval_rand.is_order_entry_allowed is True
        assert eval_rand.order_type_allowed == "LIMIT_ONLY"
        assert eval_rand.is_random_closure_interval is True
        assert eval_rand.random_closure_window == RANDOM_CLOSURE_WINDOWS["MUHURAT_CAS"]

        # Non-CAS remains in continuous trading
        assert NseCalendar.is_valid_trading_time(t_random_win, security_category=SecurityCategory.NON_CAS) is True

    def test_cas_matching_1530_to_1535_and_non_cas_close(self):
        """At 15:30:00, Non-CAS continuous trading closes. CAS begins order matching."""
        t_match = datetime(2026, 11, 8, 15, 32, 0, tzinfo=IST)

        eval_cas = NseCalendar.evaluate_security_session(t_match, SecurityCategory.CAS_ELIGIBLE)
        assert eval_cas.session_type == SessionType.SPECIAL_CAS
        assert eval_cas.granular_phase == "CLOSING_AUCTION_MATCHING"
        assert eval_cas.is_continuous_trading is False
        assert eval_cas.is_order_entry_allowed is False

        eval_non_cas = NseCalendar.evaluate_security_session(t_match, SecurityCategory.NON_CAS)
        assert eval_non_cas.session_type == SessionType.CLOSED
        assert eval_non_cas.granular_phase == "CLOSED"
        assert eval_non_cas.is_continuous_trading is False
        assert eval_non_cas.is_order_entry_allowed is False

    def test_cas_transition_buffer_1535_to_1550(self):
        """15:35 to 15:50 is post-auction transition and reconciliation."""
        t_buf = datetime(2026, 11, 8, 15, 42, 0, tzinfo=IST)

        eval_cas = NseCalendar.evaluate_security_session(t_buf, SecurityCategory.CAS_ELIGIBLE)
        assert eval_cas.session_type == SessionType.SPECIAL_CAS
        assert eval_cas.granular_phase == "CAS_TRANSITION_BUFFER"
        assert eval_cas.is_continuous_trading is False
        assert eval_cas.is_order_entry_allowed is False

    def test_closing_session_1550_to_1600(self):
        """15:50 to 16:00 is the official Closing Session executing at closing price."""
        t_close_start = datetime(2026, 11, 8, 15, 50, 0, tzinfo=IST)
        t_close_mid = datetime(2026, 11, 8, 15, 55, 0, tzinfo=IST)
        t_close_end = datetime(2026, 11, 8, 16, 0, 0, tzinfo=IST)
        t_after = datetime(2026, 11, 8, 16, 0, 1, tzinfo=IST)

        for t in (t_close_start, t_close_mid, t_close_end):
            eval_res = NseCalendar.evaluate_security_session(t, SecurityCategory.CAS_ELIGIBLE)
            assert eval_res.session_type == SessionType.POST_CLOSE
            assert eval_res.granular_phase == "CLOSING_SESSION"
            assert eval_res.is_continuous_trading is False
            assert eval_res.is_order_entry_allowed is True
            assert eval_res.order_type_allowed == "LIMIT_ONLY"

        eval_after = NseCalendar.evaluate_security_session(t_after, SecurityCategory.CAS_ELIGIBLE)
        assert eval_after.session_type == SessionType.CLOSED
        assert eval_after.is_order_entry_allowed is False


class TestTask3RandomClosureModeling:
    """
    Task 3: Random closure modeled as exchange-controlled interval [start, end]
    and order-entry permissions separated from session state classification.
    """

    def test_random_closure_windows_structure(self):
        """Verify defined random closure window boundaries per official circulars."""
        # Muhurat Pre-open: 14:13 to 14:15
        muh_pre = RANDOM_CLOSURE_WINDOWS["MUHURAT_PRE_OPEN"]
        assert muh_pre.window_start == time(14, 13)
        assert muh_pre.window_end == time(14, 15)

        # Muhurat CAS: 15:28 to 15:30
        muh_cas = RANDOM_CLOSURE_WINDOWS["MUHURAT_CAS"]
        assert muh_cas.window_start == time(15, 28)
        assert muh_cas.window_end == time(15, 30)

        # Regular Pre-open: 09:07 to 09:08
        reg_pre = RANDOM_CLOSURE_WINDOWS["REGULAR_PRE_OPEN"]
        assert reg_pre.window_start == time(9, 7)
        assert reg_pre.window_end == time(9, 8)

        # SPOS IPO: 09:35 to 09:45
        spos_ipo = RANDOM_CLOSURE_WINDOWS["SPOS_IPO"]
        assert spos_ipo.window_start == time(9, 35)
        assert spos_ipo.window_end == time(9, 45)

    def test_limit_order_rejection_during_limit_only_phase(self):
        """During limit-only phases (e.g. 14:11:00), market orders must be rejected."""
        t_limit_phase = datetime(2026, 11, 8, 14, 11, 0, tzinfo=IST)

        # LIMIT order is permitted
        perm_limit = NseCalendar.check_order_entry_permission(
            t_limit_phase,
            security_category=SecurityCategory.CAS_ELIGIBLE,
            order_type="LIMIT"
        )
        assert perm_limit.is_allowed is True
        assert perm_limit.order_type_allowed == "LIMIT_ONLY"

        # MARKET order is rejected
        perm_mkt = NseCalendar.check_order_entry_permission(
            t_limit_phase,
            security_category=SecurityCategory.CAS_ELIGIBLE,
            order_type="MARKET"
        )
        assert perm_mkt.is_allowed is False
        assert "Only LIMIT orders are permitted" in perm_mkt.reason

    def test_simulated_exchange_closure_event(self):
        """
        Verify behavior when an exchange-controlled closure event triggers during
        the random closure window (e.g. at 14:13:42 IST).
        """
        t_window = datetime(2026, 11, 8, 14, 13, 30, tzinfo=IST)
        t_event = datetime(2026, 11, 8, 14, 13, 42, tzinfo=IST)
        t_after_event = datetime(2026, 11, 8, 14, 13, 45, tzinfo=IST)

        # Before exchange closure triggers: order is permitted
        perm_before = NseCalendar.check_order_entry_permission(
            t_window,
            security_category=SecurityCategory.CAS_ELIGIBLE,
            order_type="LIMIT",
            exchange_closure_time=t_event
        )
        assert perm_before.is_allowed is True
        assert perm_before.is_random_closure_window is True

        # At/after exchange closure triggers: order is rejected
        perm_after = NseCalendar.check_order_entry_permission(
            t_after_event,
            security_category=SecurityCategory.CAS_ELIGIBLE,
            order_type="LIMIT",
            exchange_closure_time=t_event
        )
        assert perm_after.is_allowed is False
        assert "Exchange random closure event already triggered" in perm_after.reason


class TestTask4SpecialPreOpenAndIlliquidSecurities:
    """
    Task 1 & 4: Special Pre-Open Session (SPOS) for IPOs and
    Periodic Call Auction for Illiquid Securities (PCAIS).
    """

    def test_spos_ipo_schedule_regular_day(self):
        """SPOS: 09:00-09:45 order entry, 09:45-09:55 matching, 09:55-10:00 buffer, continuous opens at 10:00."""
        reg_date = date(2026, 2, 18) # Wednesday (normal trading day)

        t_entry = datetime(2026, 2, 18, 9, 20, 0, tzinfo=IST)
        t_rand = datetime(2026, 2, 18, 9, 40, 0, tzinfo=IST)
        t_match = datetime(2026, 2, 18, 9, 50, 0, tzinfo=IST)
        t_buf = datetime(2026, 2, 18, 9, 58, 0, tzinfo=IST)
        t_cont_open = datetime(2026, 2, 18, 10, 0, 0, tzinfo=IST)
        t_cont_mid = datetime(2026, 2, 18, 11, 30, 0, tzinfo=IST)

        # 09:20: SPOS Order Entry
        eval_entry = NseCalendar.evaluate_security_session(t_entry, SecurityCategory.SPECIAL_PREOPEN_IPO)
        assert eval_entry.session_type == SessionType.SPECIAL_PREOPEN
        assert eval_entry.granular_phase == "SPOS_ORDER_ENTRY"
        assert eval_entry.is_continuous_trading is False
        assert eval_entry.is_order_entry_allowed is True

        # 09:40: Random closure window (09:35 to 09:45)
        eval_rand = NseCalendar.evaluate_security_session(t_rand, SecurityCategory.SPECIAL_PREOPEN_IPO)
        assert eval_rand.is_random_closure_interval is True
        assert eval_rand.random_closure_window == RANDOM_CLOSURE_WINDOWS["SPOS_IPO"]

        # 09:50: Matching
        eval_match = NseCalendar.evaluate_security_session(t_match, SecurityCategory.SPECIAL_PREOPEN_IPO)
        assert eval_match.granular_phase == "SPOS_MATCHING"
        assert eval_match.is_continuous_trading is False
        assert eval_match.is_order_entry_allowed is False

        # 09:58: Buffer
        eval_buf = NseCalendar.evaluate_security_session(t_buf, SecurityCategory.SPECIAL_PREOPEN_IPO)
        assert eval_buf.granular_phase == "SPOS_BUFFER"
        assert eval_buf.is_continuous_trading is False

        # Continuous trading opens at 10:00:00, NOT 09:15:00
        assert NseCalendar.is_valid_trading_time(datetime(2026, 2, 18, 9, 30, 0, tzinfo=IST), security_category=SecurityCategory.SPECIAL_PREOPEN_IPO) is False
        assert NseCalendar.is_valid_trading_time(t_cont_open, security_category=SecurityCategory.SPECIAL_PREOPEN_IPO) is True
        assert NseCalendar.is_valid_trading_time(t_cont_mid, security_category=SecurityCategory.SPECIAL_PREOPEN_IPO) is True

    def test_pcais_illiquid_call_auction_cycles(self):
        """
        Periodic Call Auction for Illiquid Securities:
        6 one-hour cycles (09:30-10:30, 10:30-11:30, 11:30-12:30, 12:30-13:30, 13:30-14:30, 14:30-15:30).
        Zero continuous trading throughout the day.
        """
        # Continuous trading is strictly False at all times
        assert NseCalendar.is_valid_trading_time(datetime(2026, 2, 18, 9, 45, tzinfo=IST), security_category=SecurityCategory.ILLIQUID_CALL_AUCTION) is False
        assert NseCalendar.is_valid_trading_time(datetime(2026, 2, 18, 11, 0, tzinfo=IST), security_category=SecurityCategory.ILLIQUID_CALL_AUCTION) is False
        assert NseCalendar.is_valid_trading_time(datetime(2026, 2, 18, 14, 0, tzinfo=IST), security_category=SecurityCategory.ILLIQUID_CALL_AUCTION) is False

        # Cycle 1 (09:30 - 10:30)
        t_c1_entry = datetime(2026, 2, 18, 9, 45, 0, tzinfo=IST)
        eval_c1 = NseCalendar.evaluate_security_session(t_c1_entry, SecurityCategory.ILLIQUID_CALL_AUCTION)
        assert eval_c1.session_type == SessionType.CALL_AUCTION
        assert eval_c1.granular_phase == "CALL_AUCTION_ORDER_ENTRY_CYCLE_1"
        assert eval_c1.is_order_entry_allowed is True
        assert eval_c1.is_random_closure_interval is False

        # Cycle 1 random closure (10:14 to 10:15)
        t_c1_rand = datetime(2026, 2, 18, 10, 14, 30, tzinfo=IST)
        eval_c1_rand = NseCalendar.evaluate_security_session(t_c1_rand, SecurityCategory.ILLIQUID_CALL_AUCTION)
        assert eval_c1_rand.is_random_closure_interval is True
        assert eval_c1_rand.random_closure_window.window_start == time(10, 14)
        assert eval_c1_rand.random_closure_window.window_end == time(10, 15)

        # Cycle 1 matching (10:15 to 10:23)
        t_c1_match = datetime(2026, 2, 18, 10, 20, 0, tzinfo=IST)
        eval_c1_match = NseCalendar.evaluate_security_session(t_c1_match, SecurityCategory.ILLIQUID_CALL_AUCTION)
        assert eval_c1_match.granular_phase == "CALL_AUCTION_MATCHING_CYCLE_1"
        assert eval_c1_match.is_order_entry_allowed is False

        # Cycle 1 buffer (10:23 to 10:30)
        t_c1_buf = datetime(2026, 2, 18, 10, 25, 0, tzinfo=IST)
        eval_c1_buf = NseCalendar.evaluate_security_session(t_c1_buf, SecurityCategory.ILLIQUID_CALL_AUCTION)
        assert eval_c1_buf.granular_phase == "CALL_AUCTION_BUFFER_CYCLE_1"
        assert eval_c1_buf.is_order_entry_allowed is False

        # Cycle 2 starts at 10:30
        t_c2_entry = datetime(2026, 2, 18, 10, 35, 0, tzinfo=IST)
        eval_c2 = NseCalendar.evaluate_security_session(t_c2_entry, SecurityCategory.ILLIQUID_CALL_AUCTION)
        assert eval_c2.granular_phase == "CALL_AUCTION_ORDER_ENTRY_CYCLE_2"


class TestTask5ExactBoundaryVerification:
    """
    Task 5: Exact boundary tests across all critical milestone seconds on Muhurat Day.
    - 13:50:00 (Block deal start)
    - 14:05:00 (Pre-open start)
    - 14:10:00 (Pre-open limit-only start)
    - 14:15:00 (Pre-open matching start)
    - 14:17:00 (Pre-open buffer start)
    - 14:20:00 (Continuous trading open)
    - 15:15:00 (CAS continuous close / CAS transition start)
    - 15:20:00 (CAS order entry start)
    - 15:25:00 (CAS limit-only start)
    - 15:30:00 (CAS matching start / Non-CAS continuous close)
    - 15:35:00 (CAS post-auction buffer start)
    - 15:50:00 (Closing session start)
    - 16:00:00 (Market close)
    """

    def test_all_13_muhurat_boundary_seconds(self):
        """Evaluate state at exact milestone boundary seconds."""
        boundaries = [
            (datetime(2026, 11, 8, 13, 50, 0, tzinfo=IST), "BLOCK_DEAL", SessionType.BLOCK_DEAL, False),
            (datetime(2026, 11, 8, 14, 5, 0, tzinfo=IST), "PRE_OPEN_ENTRY", SessionType.PRE_OPEN, False),
            (datetime(2026, 11, 8, 14, 10, 0, tzinfo=IST), "PRE_OPEN_LIMIT_ONLY", SessionType.PRE_OPEN, False),
            (datetime(2026, 11, 8, 14, 15, 0, tzinfo=IST), "PRE_OPEN_MATCHING", SessionType.PRE_OPEN, False),
            (datetime(2026, 11, 8, 14, 17, 0, tzinfo=IST), "PRE_OPEN_BUFFER", SessionType.PRE_OPEN, False),
            (datetime(2026, 11, 8, 14, 20, 0, tzinfo=IST), "CONTINUOUS_TRADING", SessionType.SPECIAL_MUHURAT, True),
            (datetime(2026, 11, 8, 15, 15, 0, tzinfo=IST), "CAS_TRANSITION", SessionType.SPECIAL_CAS, False),
            (datetime(2026, 11, 8, 15, 20, 0, tzinfo=IST), "CLOSING_AUCTION_ENTRY", SessionType.SPECIAL_CAS, False),
            (datetime(2026, 11, 8, 15, 25, 0, tzinfo=IST), "CAS_LIMIT_ONLY", SessionType.SPECIAL_CAS, False),
            (datetime(2026, 11, 8, 15, 30, 0, tzinfo=IST), "CLOSING_AUCTION_MATCHING", SessionType.SPECIAL_CAS, False),
            (datetime(2026, 11, 8, 15, 35, 0, tzinfo=IST), "CAS_TRANSITION_BUFFER", SessionType.SPECIAL_CAS, False),
            (datetime(2026, 11, 8, 15, 50, 0, tzinfo=IST), "CLOSING_SESSION", SessionType.POST_CLOSE, False),
            (datetime(2026, 11, 8, 16, 0, 0, tzinfo=IST), "CLOSING_SESSION", SessionType.POST_CLOSE, False),
            (datetime(2026, 11, 8, 16, 0, 1, tzinfo=IST), "CLOSED", SessionType.CLOSED, False),
        ]

        for dt_b, exp_phase, exp_type, exp_cont in boundaries:
            eval_res = NseCalendar.evaluate_security_session(dt_b, SecurityCategory.CAS_ELIGIBLE)
            assert eval_res.granular_phase == exp_phase, f"Failed phase at {dt_b}: got {eval_res.granular_phase}, expected {exp_phase}"
            assert eval_res.session_type == exp_type, f"Failed session type at {dt_b}: got {eval_res.session_type}, expected {exp_type}"
            assert eval_res.is_continuous_trading == exp_cont, f"Failed continuous trading flag at {dt_b}"
