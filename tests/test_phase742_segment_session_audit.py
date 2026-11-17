"""
OmniTradePro Apex V2.0 - Phase 7.4.2 Test Suite
Segment Scope, Muhurat Microstructure & Session Fixture Audit

MODE: STRICT OFFLINE RESEARCH ONLY
No live broker execution. No real money. No real order submission.
No network connections. Strictly offline verified fixtures and unit tests.
"""

import hashlib
import os
import sys
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
import pytest

REPO_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(REPO_ROOT))

from core.nse_calendar import (
    NseCalendar,
    SessionType,
    ExchangeSegment,
    MuhuratSessionPhase,
    NSE_CALENDAR_VERSION,
    WEEKDAY_HOLIDAYS_EVIDENCE_2026,
    WEEKEND_HOLIDAYS_EVIDENCE_2026,
    CLEARING_ONLY_HOLIDAYS_EVIDENCE_2026,
    UNVERIFIED_SEGMENT_HOLIDAYS_2026,
    FIXTURE_REGISTRY_2026,
    SPECIAL_SESSIONS_EVIDENCE_2026,
    HolidayEvidence,
    SpecialSessionEvidence,
)
from core.historical_data_framework import IST


# =====================================================================
# TASK 1: HOLIDAY SEGMENT SCOPE & REGULATORY RECONCILIATION
# =====================================================================

class TestTask1SegmentScopeAndClearingReconciliation:
    """
    Audits calendar exchange segment scope and reconciles Capital Market (Equity)
    trading holidays against Clearing & Settlement holidays.
    Primary Circulars: NSE/CMTR/71775 and NSE/CMTR/72260.
    """

    def test_calendar_exchange_segment_scope(self):
        """Calendar explicitly identifies its scope as CAPITAL_MARKET (Equity)."""
        segment = NseCalendar.get_calendar_segment()
        assert segment == "CAPITAL_MARKET"
        assert segment == ExchangeSegment.CAPITAL_MARKET.value

    def test_sixteen_weekday_holidays_reconciled(self):
        """Verifies all 16 weekday Capital Market holidays are present and verified."""
        weekday_holidays = NseCalendar.get_weekday_holidays(2026)
        assert len(weekday_holidays) == 16

        # Municipal Corporation Election on 2026-01-15 reconciled with NSE/CMTR/72260
        ev_election = NseCalendar.get_holiday_evidence(date(2026, 1, 15))
        assert ev_election is not None
        assert "72260" in ev_election.circular_ref
        assert ev_election.verification_status == "VERIFIED"
        assert ev_election.segment == "EQUITY"

    def test_clearing_holidays_that_are_normal_trading_days(self):
        """
        Investigates and proves why the NSE website displays additional entries:
        Clearing & Settlement holidays are NOT Equity Trading holidays.
        On these 4 dates in 2026, the equity market is fully OPEN for trading (09:15-15:30 IST),
        while banking/clearing operations are paused (settlement pushed to T+1):
        1. 2026-02-19: Chhatrapati Shivaji Maharaj Jayanti
        2. 2026-03-19: Gudhi Padwa
        3. 2026-04-01: Annual Bank Closing (NI Act)
        4. 2026-08-26: Id-E-Milad
        """
        clearing_only_dates = NseCalendar.get_clearing_only_holidays(2026)
        assert len(clearing_only_dates) == 4

        expected_clearing_only = [
            date(2026, 2, 19),
            date(2026, 3, 19),
            date(2026, 4, 1),
            date(2026, 8, 26),
        ]

        for c_date in expected_clearing_only:
            assert c_date in clearing_only_dates
            # 1. Must NOT be an exchange trading holiday
            assert NseCalendar.is_holiday(c_date) is False
            # 2. Must be recognized as a clearing holiday
            assert NseCalendar.is_clearing_holiday(c_date) is True
            assert NseCalendar.is_trading_day_on_clearing_holiday(c_date) is True

            # 3. During market hours (e.g. 10:00 IST), trading MUST be valid and REGULAR
            dt_trade = datetime.combine(c_date, time(10, 0), tzinfo=IST)
            assert NseCalendar.is_valid_trading_time(dt_trade) is True
            assert NseCalendar.get_session_type(dt_trade) == SessionType.REGULAR

    def test_annual_bank_closing_trading_continuity(self):
        """
        Detailed audit of 2026-04-01 (Annual Bank Closing):
        Banks close their annual accounts, but NSE Capital Market trades normally.
        Trading engines must NOT halt on 2026-04-01.
        """
        d_bank = date(2026, 4, 1)
        assert NseCalendar.is_holiday(d_bank) is False
        assert NseCalendar.is_clearing_holiday(d_bank) is True

        dt_open = datetime(2026, 4, 1, 9, 15, tzinfo=IST)
        dt_close = datetime(2026, 4, 1, 15, 30, tzinfo=IST)
        assert NseCalendar.is_valid_trading_time(dt_open) is True
        assert NseCalendar.is_valid_trading_time(dt_close) is True
        assert NseCalendar.get_session_type(dt_open) == SessionType.REGULAR

    def test_unverified_segment_entries_explicitly_flagged(self):
        """Unresolved or unverified entries in non-equity segments must be marked UNVERIFIED."""
        unverified = NseCalendar.get_unverified_segment_evidence(2026)
        assert len(unverified) >= 1
        for record in unverified:
            assert record.verification_status == "UNVERIFIED"
            assert record.segment != "CAPITAL_MARKET"


# =====================================================================
# TASK 2: MUHURAT SESSION DETAILED MICROSTRUCTURAL PHASES (NSE/CMTR/76941)
# =====================================================================

class TestTask2MuhuratSessionMicrostructure:
    """
    Audits every phase of Diwali Muhurat Trading on Sunday 2026-11-08 per NSE/CMTR/76941:
    - Pre-Open Order Entry (14:05 - 14:10)
    - Pre-Open Limit Only (14:10 - 14:15)
    - Pre-Open Matching (14:15 - 14:17)
    - Pre-Open Buffer (14:17 - 14:20)
    - Continuous Trading (14:20 - 15:30)
    - CAS Transition (15:15 - 15:20)
    - Closing Auction Entry (15:20 - 15:30)
    - Closing Auction Matching (15:30 - 15:35)
    - CAS Buffer (15:35 - 15:50)
    - Closing Session (15:50 - 16:00)
    """

    def test_pre_open_entry_phase(self):
        """14:05:00 to 14:09:59 is PRE_OPEN_ENTRY (Limit & Market orders)."""
        t_pre = datetime(2026, 11, 8, 14, 4, 59, tzinfo=IST)
        t_start = datetime(2026, 11, 8, 14, 5, 0, tzinfo=IST)
        t_end = datetime(2026, 11, 8, 14, 9, 59, tzinfo=IST)

        assert NseCalendar.get_muhurat_phase(t_pre) == MuhuratSessionPhase.CLOSED
        assert NseCalendar.get_muhurat_phase(t_start) == MuhuratSessionPhase.PRE_OPEN_ENTRY
        assert NseCalendar.get_muhurat_phase(t_end) == MuhuratSessionPhase.PRE_OPEN_ENTRY
        assert NseCalendar.is_valid_trading_time(t_start) is False

    def test_pre_open_limit_only_phase(self):
        """14:10:00 to 14:14:59 is PRE_OPEN_LIMIT_ONLY (Limit orders only)."""
        t_start = datetime(2026, 11, 8, 14, 10, 0, tzinfo=IST)
        t_mid = datetime(2026, 11, 8, 14, 12, 30, tzinfo=IST)
        t_end = datetime(2026, 11, 8, 14, 14, 59, tzinfo=IST)

        assert NseCalendar.get_muhurat_phase(t_start) == MuhuratSessionPhase.PRE_OPEN_LIMIT_ONLY
        assert NseCalendar.get_muhurat_phase(t_mid) == MuhuratSessionPhase.PRE_OPEN_LIMIT_ONLY
        assert NseCalendar.get_muhurat_phase(t_end) == MuhuratSessionPhase.PRE_OPEN_LIMIT_ONLY
        assert NseCalendar.is_valid_trading_time(t_mid) is False

    def test_pre_open_matching_phase(self):
        """14:15:00 to 14:16:59 is PRE_OPEN_MATCHING."""
        t_start = datetime(2026, 11, 8, 14, 15, 0, tzinfo=IST)
        t_end = datetime(2026, 11, 8, 14, 16, 59, tzinfo=IST)

        assert NseCalendar.get_muhurat_phase(t_start) == MuhuratSessionPhase.PRE_OPEN_MATCHING
        assert NseCalendar.get_muhurat_phase(t_end) == MuhuratSessionPhase.PRE_OPEN_MATCHING
        assert NseCalendar.is_valid_trading_time(t_start) is False

    def test_pre_open_buffer_phase(self):
        """14:17:00 to 14:19:59 is PRE_OPEN_BUFFER."""
        t_start = datetime(2026, 11, 8, 14, 17, 0, tzinfo=IST)
        t_end = datetime(2026, 11, 8, 14, 19, 59, tzinfo=IST)

        assert NseCalendar.get_muhurat_phase(t_start) == MuhuratSessionPhase.PRE_OPEN_BUFFER
        assert NseCalendar.get_muhurat_phase(t_end) == MuhuratSessionPhase.PRE_OPEN_BUFFER
        assert NseCalendar.is_valid_trading_time(t_start) is False

    def test_continuous_trading_phase(self):
        """14:20:00 to 15:14:59 is CONTINUOUS_TRADING for all securities."""
        t_open = datetime(2026, 11, 8, 14, 20, 0, tzinfo=IST)
        t_mid = datetime(2026, 11, 8, 14, 45, 0, tzinfo=IST)
        t_end = datetime(2026, 11, 8, 15, 14, 59, tzinfo=IST)

        assert NseCalendar.get_muhurat_phase(t_open) == MuhuratSessionPhase.CONTINUOUS_TRADING
        assert NseCalendar.get_muhurat_phase(t_mid) == MuhuratSessionPhase.CONTINUOUS_TRADING
        assert NseCalendar.get_muhurat_phase(t_end) == MuhuratSessionPhase.CONTINUOUS_TRADING
        assert NseCalendar.is_valid_trading_time(t_open) is True
        assert NseCalendar.is_valid_trading_time(t_mid) is True
        assert NseCalendar.get_session_type(t_open) == SessionType.SPECIAL_MUHURAT

    def test_closing_auction_phases(self):
        """CAS Reference calculation (15:15-15:20), Order Entry (15:20-15:30), Matching (15:30-15:35)."""
        t_cas_ref = datetime(2026, 11, 8, 15, 16, 0, tzinfo=IST)
        t_cas_entry = datetime(2026, 11, 8, 15, 25, 0, tzinfo=IST)
        t_cas_match = datetime(2026, 11, 8, 15, 32, 0, tzinfo=IST)
        t_cas_buf = datetime(2026, 11, 8, 15, 40, 0, tzinfo=IST)

        assert NseCalendar.get_muhurat_phase(t_cas_ref) == MuhuratSessionPhase.CAS_TRANSITION
        assert NseCalendar.get_muhurat_phase(t_cas_entry) == MuhuratSessionPhase.CLOSING_AUCTION_ENTRY
        assert NseCalendar.get_muhurat_phase(t_cas_match) == MuhuratSessionPhase.CLOSING_AUCTION_MATCHING
        assert NseCalendar.get_muhurat_phase(t_cas_buf) == MuhuratSessionPhase.CAS_TRANSITION_BUFFER

        # During 14:20 to 15:30, normal continuous orders continue for non-CAS securities
        assert NseCalendar.is_valid_trading_time(t_cas_entry) is True
        # After 15:30:00, continuous trading is closed
        assert NseCalendar.is_valid_trading_time(t_cas_match) is False
        assert NseCalendar.is_valid_trading_time(t_cas_buf) is False

    def test_closing_session_definition_and_boundaries(self):
        """
        15:50:00 to 16:00:00 is CLOSING_SESSION (official Post-Close Trading session
        executing strictly at the determined closing price).
        It is NOT an ordinary idle post-close period.
        """
        t_before = datetime(2026, 11, 8, 15, 49, 59, tzinfo=IST)
        t_start = datetime(2026, 11, 8, 15, 50, 0, tzinfo=IST)
        t_mid = datetime(2026, 11, 8, 15, 55, 0, tzinfo=IST)
        t_end = datetime(2026, 11, 8, 16, 0, 0, tzinfo=IST)
        t_after = datetime(2026, 11, 8, 16, 0, 1, tzinfo=IST)

        assert NseCalendar.get_muhurat_phase(t_before) == MuhuratSessionPhase.CAS_TRANSITION_BUFFER
        assert NseCalendar.get_muhurat_phase(t_start) == MuhuratSessionPhase.CLOSING_SESSION
        assert NseCalendar.get_muhurat_phase(t_mid) == MuhuratSessionPhase.CLOSING_SESSION
        assert NseCalendar.get_muhurat_phase(t_end) == MuhuratSessionPhase.CLOSING_SESSION
        assert NseCalendar.get_muhurat_phase(t_after) == MuhuratSessionPhase.CLOSED

        assert NseCalendar.is_muhurat_post_close(t_mid) is True
        assert NseCalendar.get_session_type(t_mid) == SessionType.POST_CLOSE
        # Regular trading strategy orders cannot trade during closing-price-only session
        assert NseCalendar.is_valid_trading_time(t_mid) is False


# =====================================================================
# TASK 3: DISASTER RECOVERY (DR) SESSION BOUNDARIES (NSE/MSD/73126)
# =====================================================================

class TestTask3DrSessionBoundaries:
    """
    Audits DR session timing and boundary conditions on both 5 and 6 March 2026.
    """

    def test_thursday_dr_session_exact_boundaries(self):
        """Thursday 2026-03-05: 09:15 to 15:30 IST from DR site."""
        t_pre = datetime(2026, 3, 5, 9, 14, 59, tzinfo=IST)
        t_open = datetime(2026, 3, 5, 9, 15, 0, tzinfo=IST)
        t_mid = datetime(2026, 3, 5, 12, 0, 0, tzinfo=IST)
        t_close = datetime(2026, 3, 5, 15, 30, 0, tzinfo=IST)
        t_post = datetime(2026, 3, 5, 15, 30, 1, tzinfo=IST)

        assert NseCalendar.is_dr_session(t_pre) is False
        assert NseCalendar.is_valid_trading_time(t_pre) is False

        assert NseCalendar.is_dr_session(t_open) is True
        assert NseCalendar.is_valid_trading_time(t_open) is True
        assert NseCalendar.get_session_type(t_open) == SessionType.SPECIAL_DR

        assert NseCalendar.is_dr_session(t_mid) is True
        assert NseCalendar.is_valid_trading_time(t_mid) is True

        assert NseCalendar.is_dr_session(t_close) is True
        assert NseCalendar.is_valid_trading_time(t_close) is True

        assert NseCalendar.is_dr_session(t_post) is False
        assert NseCalendar.is_valid_trading_time(t_post) is False

    def test_friday_dr_session_exact_boundaries(self):
        """Friday 2026-03-06: 09:15 to 15:30 IST from DR site."""
        t_pre = datetime(2026, 3, 6, 9, 14, 59, tzinfo=IST)
        t_open = datetime(2026, 3, 6, 9, 15, 0, tzinfo=IST)
        t_mid = datetime(2026, 3, 6, 14, 0, 0, tzinfo=IST)
        t_close = datetime(2026, 3, 6, 15, 30, 0, tzinfo=IST)
        t_post = datetime(2026, 3, 6, 15, 30, 1, tzinfo=IST)

        assert NseCalendar.is_dr_session(t_pre) is False
        assert NseCalendar.is_valid_trading_time(t_pre) is False

        assert NseCalendar.is_dr_session(t_open) is True
        assert NseCalendar.is_valid_trading_time(t_open) is True
        assert NseCalendar.get_session_type(t_open) == SessionType.SPECIAL_DR

        assert NseCalendar.is_dr_session(t_mid) is True
        assert NseCalendar.is_valid_trading_time(t_mid) is True

        assert NseCalendar.is_dr_session(t_close) is True
        assert NseCalendar.is_valid_trading_time(t_close) is True

        assert NseCalendar.is_dr_session(t_post) is False
        assert NseCalendar.is_valid_trading_time(t_post) is False

    def test_saturday_seventh_march_weekend_rejection(self):
        """Saturday 2026-03-07 has zero trading. Strictly CLOSED."""
        t_sat = datetime(2026, 3, 7, 10, 0, 0, tzinfo=IST)
        assert NseCalendar.is_dr_session(t_sat) is False
        assert NseCalendar.is_valid_trading_time(t_sat) is False
        assert NseCalendar.get_session_type(t_sat) == SessionType.CLOSED


# =====================================================================
# TASK 4: FIXTURE PROVENANCE & REGISTRY INTEGRITY
# =====================================================================

class TestTask4FixtureProvenanceAndChecksums:
    """
    Verifies that all 4 fixtures in data/fixtures/ are explicitly classified as SYNTHETIC,
    documented with exact expected bar counts and coverage, and verified against SHA-256.
    """

    def test_all_fixtures_marked_synthetic(self):
        """Every generated fixture must be strictly classified as SYNTHETIC."""
        all_fixtures = NseCalendar.get_all_fixture_provenance()
        assert len(all_fixtures) == 4

        for name, record in all_fixtures.items():
            assert record.provenance == "SYNTHETIC", f"Fixture {name} must be SYNTHETIC"
            assert record.expected_bar_count > 0
            assert len(record.expected_sha256) == 64
            assert record.coverage_type in ("FULL", "PARTIAL")

    def test_special_sessions_fixture_documented_as_partial(self):
        """
        Confirms that special_sessions_1m.csv is documented as a PARTIAL synthetic fixture:
        45 bars DR (12% of full session) + 70 bars Muhurat (100% of continuous trading).
        It must NEVER be labeled as a complete full-day session.
        """
        rec = NseCalendar.get_fixture_provenance("special_sessions_1m.csv")
        assert rec is not None
        assert rec.coverage_type == "PARTIAL"
        assert rec.expected_bar_count == 115
        assert "partial" in rec.coverage_description.lower()
        assert "45 bars dr" in rec.coverage_description.lower()

    def test_disk_fixtures_match_expected_sha256_checksums(self):
        """Verifies bit-for-bit file integrity against registered SHA-256 checksums."""
        fixtures_dir = os.path.join(REPO_ROOT, "data", "fixtures")

        for filename, record in FIXTURE_REGISTRY_2026.items():
            fpath = os.path.join(fixtures_dir, filename)
            assert os.path.exists(fpath), f"Fixture missing: {filename}"

            with open(fpath, "rb") as f:
                content = f.read()

            actual_sha256 = hashlib.sha256(content).hexdigest().lower()
            assert actual_sha256 == record.expected_sha256.lower(), (
                f"SHA-256 mismatch for {filename}:\n"
                f"  Expected: {record.expected_sha256}\n"
                f"  Actual:   {actual_sha256}"
            )

            # Check bar count (lines minus header)
            lines = content.decode("utf-8").strip().splitlines()
            bar_count = len(lines) - 1
            assert bar_count == record.expected_bar_count, (
                f"Bar count mismatch for {filename}: expected {record.expected_bar_count}, got {bar_count}"
            )
