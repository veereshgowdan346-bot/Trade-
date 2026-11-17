"""
OmniTradePro Apex V2.0 - Phase 7.4.1 Test Suite
NSE Calendar Correction & Evidence Audit Verification

MODE: STRICT OFFLINE RESEARCH ONLY
No live broker execution. No real money. No real order submission.
No network connections. Strictly offline verified fixtures and unit tests.
"""

import sys
from pathlib import Path
from datetime import date, datetime, time, timedelta, timezone
import pytest

REPO_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(REPO_ROOT))

from core.nse_calendar import (
    NseCalendar,
    SessionType,
    NSE_CALENDAR_VERSION,
    WEEKDAY_HOLIDAYS_EVIDENCE_2026,
    WEEKEND_HOLIDAYS_EVIDENCE_2026,
    SPECIAL_SESSIONS_EVIDENCE_2026,
    HolidayEvidence,
    SpecialSessionEvidence,
)
from core.historical_data_framework import IST


# =====================================================================
# TASK 1: 2026 NSE EQUITY HOLIDAY SCHEDULE RECONCILIATION
# =====================================================================

class TestTask1HolidayReconciliation:
    """
    Reconciles calendar against official NSE 2026 Equity Holiday circulars:
    Primary circular: NSE/CMTR/71775 (dated 2025-12-12)
    Civic election circular: NSE/CMTR/72890 (dated 2026-01-05)
    """

    def test_calendar_version(self):
        """Calendar version must be 2026.2 reflecting evidence-based corrections."""
        assert NSE_CALENDAR_VERSION == "2026.2"

    def test_sixteen_weekday_holidays_exact_count(self):
        """Official list has exactly 16 weekday holidays in 2026, not 15."""
        weekday_holidays = NseCalendar.get_weekday_holidays(2026)
        assert len(weekday_holidays) == 16
        assert len(weekday_holidays) != 15

    def test_all_sixteen_weekday_holidays_present(self):
        """Verifies every one of the 16 official weekday holidays."""
        weekday_holidays = NseCalendar.get_weekday_holidays(2026)

        expected_holidays = [
            date(2026, 1, 15),  # Maharashtra Municipal Corporation Elections
            date(2026, 1, 26),  # Republic Day
            date(2026, 3, 3),   # Holi (Tuesday per NSE/CMTR/71775, not Wednesday 2026-03-04)
            date(2026, 3, 26),  # Ram Navami (Thursday)
            date(2026, 3, 31),  # Mahavir Jayanti (Tuesday)
            date(2026, 4, 3),   # Good Friday
            date(2026, 4, 14),  # Dr. Baba Saheb Ambedkar Jayanti (Tuesday)
            date(2026, 5, 1),   # Maharashtra Day (Friday)
            date(2026, 5, 28),  # Bakri Id (Thursday per NSE/CMTR/71775, not Wednesday 2026-05-27)
            date(2026, 6, 26),  # Muharram (Friday)
            date(2026, 9, 14),  # Ganesh Chaturthi (Monday)
            date(2026, 10, 2),  # Mahatma Gandhi Jayanti (Friday)
            date(2026, 10, 20), # Dussehra (Tuesday)
            date(2026, 11, 10), # Diwali-Balipratipada (Tuesday)
            date(2026, 11, 24), # Gurunanak Jayanti (Tuesday)
            date(2026, 12, 25), # Christmas (Friday)
        ]

        for exp_date in expected_holidays:
            assert exp_date in weekday_holidays, f"Missing weekday holiday: {exp_date}"
            assert exp_date.weekday() < 5, f"Weekday holiday must be Mon-Fri: {exp_date}"

    def test_four_weekend_holidays_tracked_separately(self):
        """
        4 holidays fall on Saturday or Sunday and must NOT be counted as weekday closures:
        1. Mahashivratri: Sunday 2026-02-15 (not Tuesday 2026-02-17)
        2. Id-ul-Fitr: Saturday 2026-03-21 (not Friday 2026-03-20)
        3. Independence Day: Saturday 2026-08-15
        4. Diwali Laxmi Pujan: Sunday 2026-11-08 (special Muhurat session held)
        """
        weekend_holidays = NseCalendar.get_weekend_holidays(2026)
        assert len(weekend_holidays) == 4

        expected_weekends = [
            date(2026, 2, 15),
            date(2026, 3, 21),
            date(2026, 8, 15),
            date(2026, 11, 8),
        ]

        for w_date in expected_weekends:
            assert w_date in weekend_holidays, f"Missing weekend holiday: {w_date}"
            assert w_date.weekday() >= 5, f"Weekend holiday must be Sat/Sun: {w_date}"
            assert NseCalendar.is_weekend_holiday(w_date) is True
            # Weekend holidays must not be in weekday list
            assert w_date not in NseCalendar.get_weekday_holidays(2026)

    def test_previous_discrepancies_eliminated(self):
        """Verifies that erroneous dates from prior implementation are explicitly rejected."""
        weekday_holidays = NseCalendar.get_weekday_holidays(2026)

        # Old Mahashivratri was incorrectly on Tuesday 2026-02-17
        assert date(2026, 2, 17) not in weekday_holidays
        # Old Holi was incorrectly on Wednesday 2026-03-04
        assert date(2026, 3, 4) not in weekday_holidays
        # Old Id-ul-Fitr was incorrectly on Friday 2026-03-20
        assert date(2026, 3, 20) not in weekday_holidays
        # Old Bakri Id was incorrectly on Wednesday 2026-05-27
        assert date(2026, 5, 27) not in weekday_holidays
        # Diwali Laxmi Pujan is on Sunday (not a weekday holiday)
        assert date(2026, 11, 8) not in weekday_holidays


# =====================================================================
# TASK 2: DIWALI MUHURAT TRADING SESSION (NSE/CMTR/76941)
# =====================================================================

class TestTask2MuhuratSession:
    """
    Audits Diwali Laxmi Pujan session on Sunday 8 November 2026
    per official circular NSE/CMTR/76941 dated 19 October 2026:
    - Pre-open: 14:05 - 14:20 IST
    - Continuous Trading: 14:20 - 15:30 IST
    - Closing Auction: 15:20 - 15:35 IST
    - Post-close: 15:50 - 16:00 IST
    - Old timing (18:15 - 19:15) removed and verified closed.
    """

    def test_muhurat_pre_open_session(self):
        """Pre-open runs 14:05 to 14:20 IST (order entry/modification, no trade matching)."""
        t_before = datetime(2026, 11, 8, 14, 4, 59, tzinfo=IST)
        t_start = datetime(2026, 11, 8, 14, 5, 0, tzinfo=IST)
        t_mid = datetime(2026, 11, 8, 14, 12, 30, tzinfo=IST)
        t_end = datetime(2026, 11, 8, 14, 19, 59, tzinfo=IST)

        assert NseCalendar.is_valid_trading_time(t_before) is False
        assert NseCalendar.get_session_type(t_before) == SessionType.CLOSED

        assert NseCalendar.is_muhurat_pre_open(t_start) is True
        assert NseCalendar.get_session_type(t_start) == SessionType.PRE_OPEN
        assert NseCalendar.is_valid_trading_time(t_start) is False

        assert NseCalendar.is_muhurat_pre_open(t_mid) is True
        assert NseCalendar.is_valid_trading_time(t_mid) is False

        assert NseCalendar.is_muhurat_pre_open(t_end) is True
        assert NseCalendar.is_valid_trading_time(t_end) is False

    def test_muhurat_continuous_trading_session(self):
        """Continuous trading runs 14:20 to 15:30 IST."""
        t_open = datetime(2026, 11, 8, 14, 20, 0, tzinfo=IST)
        t_trade1 = datetime(2026, 11, 8, 14, 45, 0, tzinfo=IST)
        t_trade2 = datetime(2026, 11, 8, 15, 15, 0, tzinfo=IST)
        t_close = datetime(2026, 11, 8, 15, 30, 0, tzinfo=IST)

        assert NseCalendar.is_muhurat_session(t_open) is True
        assert NseCalendar.get_session_type(t_open) == SessionType.SPECIAL_MUHURAT
        assert NseCalendar.is_valid_trading_time(t_open) is True

        assert NseCalendar.is_muhurat_session(t_trade1) is True
        assert NseCalendar.is_valid_trading_time(t_trade1) is True

        assert NseCalendar.is_muhurat_session(t_trade2) is True
        assert NseCalendar.is_valid_trading_time(t_trade2) is True

        assert NseCalendar.is_muhurat_session(t_close) is True
        assert NseCalendar.is_valid_trading_time(t_close) is True

    def test_muhurat_post_close_session(self):
        """Post-close session runs 15:50 to 16:00 IST."""
        t_post1 = datetime(2026, 11, 8, 15, 50, 0, tzinfo=IST)
        t_post_mid = datetime(2026, 11, 8, 15, 55, 0, tzinfo=IST)
        t_post_end = datetime(2026, 11, 8, 16, 0, 0, tzinfo=IST)
        t_after = datetime(2026, 11, 8, 16, 0, 1, tzinfo=IST)

        assert NseCalendar.is_muhurat_post_close(t_post1) is True
        assert NseCalendar.get_session_type(t_post1) == SessionType.POST_CLOSE
        assert NseCalendar.is_valid_trading_time(t_post1) is False

        assert NseCalendar.is_muhurat_post_close(t_post_mid) is True
        assert NseCalendar.is_valid_trading_time(t_post_mid) is False

        assert NseCalendar.is_muhurat_post_close(t_post_end) is True
        assert NseCalendar.is_valid_trading_time(t_post_end) is False

        assert NseCalendar.is_valid_trading_time(t_after) is False
        assert NseCalendar.get_session_type(t_after) == SessionType.CLOSED

    def test_daytime_closed_before_muhurat(self):
        """Morning and early afternoon are strictly closed."""
        t_morning = datetime(2026, 11, 8, 9, 30, 0, tzinfo=IST)
        t_noon = datetime(2026, 11, 8, 12, 0, 0, tzinfo=IST)
        t_early_afternoon = datetime(2026, 11, 8, 14, 0, 0, tzinfo=IST)

        assert NseCalendar.is_valid_trading_time(t_morning) is False
        assert NseCalendar.is_valid_trading_time(t_noon) is False
        assert NseCalendar.is_valid_trading_time(t_early_afternoon) is False
        assert NseCalendar.get_session_type(t_morning) == SessionType.CLOSED

    def test_old_evening_timing_strictly_closed(self):
        """Verifies old incorrect 18:15 - 19:15 session is removed and rejected."""
        t_old_open = datetime(2026, 11, 8, 18, 15, 0, tzinfo=IST)
        t_old_mid = datetime(2026, 11, 8, 18, 30, 0, tzinfo=IST)
        t_old_close = datetime(2026, 11, 8, 19, 15, 0, tzinfo=IST)

        assert NseCalendar.is_muhurat_session(t_old_open) is False
        assert NseCalendar.is_valid_trading_time(t_old_open) is False
        assert NseCalendar.get_session_type(t_old_open) == SessionType.CLOSED

        assert NseCalendar.is_muhurat_session(t_old_mid) is False
        assert NseCalendar.is_valid_trading_time(t_old_mid) is False
        assert NseCalendar.get_session_type(t_old_mid) == SessionType.CLOSED

        assert NseCalendar.is_muhurat_session(t_old_close) is False
        assert NseCalendar.is_valid_trading_time(t_old_close) is False


# =====================================================================
# TASK 3: DISASTER RECOVERY (DR) SESSION RECONCILIATION (NSE/MSD/73126)
# =====================================================================

class TestTask3DisasterRecoverySession:
    """
    Audits DR live switch session per circular NSE/MSD/73126 dated 5 March 2026:
    - Thursday 5 March 2026: Live trading from DR site (09:15 - 15:30 IST)
    - Friday 6 March 2026: Live trading from DR site (09:15 - 15:30 IST)
    - Saturday 7 March 2026: Strictly CLOSED (standard weekend, no trading)
    - Monday 9 March 2026: Resumed from Primary site (09:15 - 15:30 IST)
    """

    def test_thursday_dr_site_trading(self):
        """Thursday 2026-03-05 trades from DR site during regular market hours."""
        t_open = datetime(2026, 3, 5, 9, 15, 0, tzinfo=IST)
        t_mid = datetime(2026, 3, 5, 12, 30, 0, tzinfo=IST)
        t_close = datetime(2026, 3, 5, 15, 30, 0, tzinfo=IST)

        assert NseCalendar.is_dr_session(t_open) is True
        assert NseCalendar.is_valid_trading_time(t_open) is True
        assert NseCalendar.get_session_type(t_open) == SessionType.SPECIAL_DR

        assert NseCalendar.is_dr_session(t_mid) is True
        assert NseCalendar.is_valid_trading_time(t_mid) is True

        assert NseCalendar.is_dr_session(t_close) is True
        assert NseCalendar.is_valid_trading_time(t_close) is True

    def test_friday_dr_site_trading(self):
        """Friday 2026-03-06 trades from DR site during regular market hours."""
        t_open = datetime(2026, 3, 6, 9, 15, 0, tzinfo=IST)
        t_mid = datetime(2026, 3, 6, 14, 0, 0, tzinfo=IST)
        t_close = datetime(2026, 3, 6, 15, 30, 0, tzinfo=IST)

        assert NseCalendar.is_dr_session(t_open) is True
        assert NseCalendar.is_valid_trading_time(t_open) is True
        assert NseCalendar.get_session_type(t_mid) == SessionType.SPECIAL_DR

        assert NseCalendar.is_dr_session(t_close) is True
        assert NseCalendar.is_valid_trading_time(t_close) is True

    def test_saturday_seventh_march_strictly_closed(self):
        """Saturday 7 March 2026 is strictly CLOSED. Unsupported Saturday session is removed."""
        t_sat_s1 = datetime(2026, 3, 7, 9, 30, 0, tzinfo=IST)
        t_sat_mid = datetime(2026, 3, 7, 11, 0, 0, tzinfo=IST)
        t_sat_s2 = datetime(2026, 3, 7, 12, 0, 0, tzinfo=IST)

        assert NseCalendar.is_dr_session(t_sat_s1) is False
        assert NseCalendar.is_valid_trading_time(t_sat_s1) is False
        assert NseCalendar.get_session_type(t_sat_s1) == SessionType.CLOSED

        assert NseCalendar.is_dr_session(t_sat_mid) is False
        assert NseCalendar.is_valid_trading_time(t_sat_mid) is False
        assert NseCalendar.get_session_type(t_sat_mid) == SessionType.CLOSED

        assert NseCalendar.is_dr_session(t_sat_s2) is False
        assert NseCalendar.is_valid_trading_time(t_sat_s2) is False
        assert NseCalendar.get_session_type(t_sat_s2) == SessionType.CLOSED

    def test_monday_primary_site_resumption(self):
        """Monday 9 March 2026 resumes normal trading from Primary site."""
        t_mon = datetime(2026, 3, 9, 10, 0, 0, tzinfo=IST)
        assert NseCalendar.is_dr_session(t_mon) is False
        assert NseCalendar.is_valid_trading_time(t_mon) is True
        assert NseCalendar.get_session_type(t_mon) == SessionType.REGULAR


# =====================================================================
# TASK 4: EVIDENCE-BASED CALENDAR METADATA AUDIT
# =====================================================================

class TestTask4EvidenceMetadata:
    """
    Audits provenance and regulatory verification status of all calendar entries.
    """

    def test_all_holidays_have_official_circular_references(self):
        """Every holiday must cite an official NSE circular and publication date."""
        all_evidence = NseCalendar.get_all_holiday_evidence()
        assert len(all_evidence) == 20  # 16 weekday + 4 weekend

        for ev in all_evidence:
            assert isinstance(ev, HolidayEvidence)
            assert ev.date.year == 2026
            assert len(ev.name) > 0
            assert ev.segment == "EQUITY"
            assert ev.circular_ref.startswith("NSE/CMTR/")
            assert ev.verification_status == "VERIFIED"
            assert ev.last_verified_date == "2026-11-17"
            assert len(ev.publication_date) == 10

    def test_special_sessions_evidence(self):
        """Muhurat and DR sessions have verified circular references."""
        assert "2026-11-08" in SPECIAL_SESSIONS_EVIDENCE_2026
        assert "2026-03-05" in SPECIAL_SESSIONS_EVIDENCE_2026
        assert "2026-03-06" in SPECIAL_SESSIONS_EVIDENCE_2026

        muhurat_ev = SPECIAL_SESSIONS_EVIDENCE_2026["2026-11-08"]
        assert muhurat_ev.circular_ref == "NSE/CMTR/76941"
        assert muhurat_ev.publication_date == "2026-10-19"
        assert muhurat_ev.verification_status == "VERIFIED"
        assert muhurat_ev.session_type == SessionType.SPECIAL_MUHURAT

        dr_ev_thu = SPECIAL_SESSIONS_EVIDENCE_2026["2026-03-05"]
        assert dr_ev_thu.circular_ref == "NSE/MSD/73126"
        assert dr_ev_thu.publication_date == "2026-03-05"
        assert dr_ev_thu.verification_status == "VERIFIED"
        assert dr_ev_thu.session_type == SessionType.SPECIAL_DR

        dr_ev_fri = SPECIAL_SESSIONS_EVIDENCE_2026["2026-03-06"]
        assert dr_ev_fri.circular_ref == "NSE/MSD/73126"
        assert dr_ev_fri.publication_date == "2026-03-05"
        assert dr_ev_fri.verification_status == "VERIFIED"

    def test_no_fabricated_sessions_exist(self):
        """Confirm unsupported Saturday 2026-03-07 is absent from special sessions evidence."""
        assert "2026-03-07" not in SPECIAL_SESSIONS_EVIDENCE_2026


# =====================================================================
# TASK 5: REGRESSION SAFETY, HOLIDAY REJECTION & TIMEZONE AUDIT
# =====================================================================

class TestTask5RegressionSafety:
    """
    Verifies that all 16 weekday holidays reject regular session trading,
    and that IST timezone is DST-independent.
    """

    def test_all_weekday_holidays_reject_regular_trading(self):
        """During 09:15 to 15:30 on all 16 weekday holidays, session is strictly CLOSED."""
        weekday_holidays = NseCalendar.get_weekday_holidays(2026)
        for h_date in weekday_holidays:
            dt_morning = datetime.combine(h_date, time(9, 30), tzinfo=IST)
            dt_noon = datetime.combine(h_date, time(12, 0), tzinfo=IST)
            dt_afternoon = datetime.combine(h_date, time(15, 0), tzinfo=IST)

            assert NseCalendar.is_valid_trading_time(dt_morning) is False, f"Trading allowed on holiday {h_date}"
            assert NseCalendar.is_valid_trading_time(dt_noon) is False, f"Trading allowed on holiday {h_date}"
            assert NseCalendar.is_valid_trading_time(dt_afternoon) is False, f"Trading allowed on holiday {h_date}"

            assert NseCalendar.get_session_type(dt_morning) == SessionType.CLOSED
            assert NseCalendar.get_session_type(dt_noon) == SessionType.CLOSED

    def test_ist_daylight_independence(self):
        """IST is permanently UTC+05:30 across winter, summer, and monsoon periods."""
        dts = [
            datetime(2026, 1, 15, 12, 0, tzinfo=IST),   # Winter
            datetime(2026, 6, 26, 12, 0, tzinfo=IST),   # Monsoon
            datetime(2026, 11, 8, 14, 30, tzinfo=IST),  # Post-monsoon
        ]
        for dt in dts:
            utcoffset = dt.utcoffset()
            assert utcoffset == timedelta(hours=5, minutes=30)
            # Daylight saving time is nonexistent in IST (fixed UTC+05:30)
            assert dt.dst() is None or dt.dst() == timedelta(0)
