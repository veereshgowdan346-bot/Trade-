"""
OmniTradePro Apex V2.0 — Phase 7.4
Independent Integrity & Robustness Audit Test Suite

Operating Mode: STRICT OFFLINE RESEARCH ONLY.
No live broker execution. No real money. No credentials. No strategy optimization.

Tests Cover:
1. Provenance Integrity & Bypass Prevention (renamed files, missing/invalid evidence, SHA-256 immutability).
2. Corporate Action Handling (25% price drop warning behavior, raw preservation, unadjusted vs adjusted).
3. NSE Calendar Comprehensive Audit (15 official holidays, Muhurat session, DR session, boundary minutes).
4. Quality Score Mathematical Property & Golden Fixture Recomputation (zero double-counting invariant).
5. Advanced Leakage Audit:
   - Marcos López de Prado Purging (forward target horizon overlap detection).
   - Cross-Validation Embargo Buffers (post-test serial correlation buffer).
   - Model Fit Timestamp Causality (t_pred >= t_fit verification).
6. Deterministic SHA-256 and File Immutability Invariant.
"""

import os
import sys
import math
import shutil
import hashlib
import tempfile
from pathlib import Path
from datetime import datetime, date, time, timezone, timedelta
from typing import List, Dict, Any, Optional

import pytest

REPO_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(REPO_ROOT))

from core.historical_data_framework import (
    CandleRecord,
    AnomalyRecord,
    DataProvenance,
    DataQualityReport,
    DataProvenanceType,
    AdjustmentType,
    AnomalySeverity,
    HistoricalDataFramework,
    IST
)
from core.nse_calendar import NseCalendar, SessionType, NSE_CALENDAR_VERSION
from core.csv_data_ingestion import CsvDataIngestion, CsvIngestionResult
from core.leakage_audit import LeakageAuditor, LeakageAuditResult

FIXTURES_DIR = os.path.join(REPO_ROOT, "data", "fixtures")


# =====================================================================
# TASK 1: DATA PROVENANCE INTEGRITY & BYPASS PREVENTION
# =====================================================================

class TestTask1ProvenanceIntegrityAndBypassPrevention:
    """Verifies that dataset classification cannot be bypassed by file manipulation."""

    def test_provenance_bypass_by_renaming_or_moving_fails(self):
        """
        Moving or renaming a sample file to an arbitrary location outside fixture folders
        must NOT allow it to be classified as GENUINE_HISTORICAL without verified provenance evidence.
        """
        source_fixture = os.path.join(FIXTURES_DIR, "sample_nifty50_1m.csv")
        with tempfile.TemporaryDirectory() as tmp_dir:
            renamed_csv = os.path.join(tmp_dir, "production_nifty_feed_2026.csv")
            shutil.copyfile(source_fixture, renamed_csv)

            # Ingestion without evidence must raise ValueError
            with pytest.raises(ValueError, match="requires authenticated external archive evidence"):
                CsvDataIngestion.ingest_csv_file(
                    file_path=renamed_csv,
                    instrument="NIFTY50",
                    timeframe="1m",
                    source_classification="GENUINE_HISTORICAL",
                    provenance_evidence=None
                )

    def test_provenance_invalid_or_incomplete_evidence_rejected(self):
        """Incomplete or unverified provenance evidence dictionaries must fail fail-safe."""
        source_fixture = os.path.join(FIXTURES_DIR, "sample_nifty50_1m.csv")

        # 1. Missing archive_provider
        with pytest.raises(ValueError, match="requires authenticated external archive evidence"):
            CsvDataIngestion.ingest_csv_file(
                file_path=source_fixture,
                instrument="NIFTY50",
                source_classification="GENUINE_HISTORICAL",
                provenance_evidence={
                    "batch_id": "BATCH-001",
                    "manifest_sha256": "a" * 64,
                    "is_verified_feed": True
                }
            )

        # 2. Invalid manifest hash length (< 64 characters)
        with pytest.raises(ValueError, match="requires authenticated external archive evidence"):
            CsvDataIngestion.ingest_csv_file(
                file_path=source_fixture,
                instrument="NIFTY50",
                source_classification="GENUINE_HISTORICAL",
                provenance_evidence={
                    "archive_provider": "NSE_HISTORICAL_DATA_ARCHIVE",
                    "batch_id": "BATCH-001",
                    "manifest_sha256": "tooshort",
                    "is_verified_feed": True
                }
            )

        # 3. is_verified_feed is False
        with pytest.raises(ValueError, match="requires authenticated external archive evidence"):
            CsvDataIngestion.ingest_csv_file(
                file_path=source_fixture,
                instrument="NIFTY50",
                source_classification="GENUINE_HISTORICAL",
                provenance_evidence={
                    "archive_provider": "NSE_HISTORICAL_DATA_ARCHIVE",
                    "batch_id": "BATCH-001",
                    "manifest_sha256": "b" * 64,
                    "is_verified_feed": False
                }
            )

    def test_provenance_verified_genuine_evidence_succeeds(self):
        """Valid external archive evidence allows GENUINE_HISTORICAL classification."""
        with tempfile.TemporaryDirectory() as tmp_dir:
            temp_csv = os.path.join(tmp_dir, "nse_archive_nifty_2026.csv")
            source_fixture = os.path.join(FIXTURES_DIR, "sample_nifty50_1m.csv")
            shutil.copyfile(source_fixture, temp_csv)

            valid_evidence = {
                "archive_provider": "NSE_HISTORICAL_ARCHIVE",
                "batch_id": "202603-HIST-EQUITY-0042",
                "manifest_sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
                "is_verified_feed": True
            }

            result = CsvDataIngestion.ingest_csv_file(
                file_path=temp_csv,
                instrument="NIFTY50",
                timeframe="1m",
                source_classification="GENUINE_HISTORICAL",
                provenance_evidence=valid_evidence
            )

            assert result.provenance.provenance_type == "GENUINE_HISTORICAL"
            assert "NSE_HISTORICAL_ARCHIVE" in result.provenance.source
            assert result.provenance.raw_sha256 == result.raw_file_sha256

    def test_provenance_raw_byte_immutability(self):
        """Verifies that ingestion never mutates the underlying raw file bytes."""
        csv_path = os.path.join(FIXTURES_DIR, "sample_nifty50_1m.csv")
        with open(csv_path, "rb") as f:
            bytes_before = f.read()
            sha_before = hashlib.sha256(bytes_before).hexdigest()

        result = CsvDataIngestion.ingest_csv_file(
            file_path=csv_path,
            instrument="NIFTY50",
            timeframe="1m",
            source_classification="SAMPLE"
        )

        with open(csv_path, "rb") as f:
            bytes_after = f.read()
            sha_after = hashlib.sha256(bytes_after).hexdigest()

        assert bytes_before == bytes_after
        assert sha_before == sha_after == result.raw_file_sha256


# =====================================================================
# TASK 2: CORPORATE ACTION HANDLING & ZERO SILENT MODIFICATION
# =====================================================================

class TestTask2CorporateActionHandling:
    """Verifies that price drops >25% are logged as warnings and never silently mutated."""

    def test_corporate_action_split_warning_does_not_invalidate_bar(self):
        """A 1:1 stock split (-50% price drop) must be flagged with WARNING, not invalidated."""
        with tempfile.TemporaryDirectory() as tmp_dir:
            csv_path = os.path.join(tmp_dir, "split_test.csv")
            # 2 bars: bar 1 at 2000, bar 2 at 1000 (-50% drop)
            lines = [
                "timestamp,open,high,low,close,volume\n",
                "2026-03-02 09:15:00,2000.0,2010.0,1995.0,2005.0,15000\n",
                "2026-03-02 09:16:00,1000.0,1005.0,998.0,1002.0,30000\n"
            ]
            with open(csv_path, "w") as f:
                f.writelines(lines)

            result = CsvDataIngestion.ingest_csv_file(
                file_path=csv_path,
                instrument="SPLIT_TEST",
                timeframe="1m",
                source_classification="SAMPLE",
                corporate_action_split_threshold=25.0
            )

            # Bar is VALID
            assert result.quality_report.total_observed_bars == 2
            assert result.quality_report.valid_bars == 2
            assert result.quality_report.invalid_bars == 0

            # Warning is recorded
            split_anomalies = [
                a for a in result.quality_report.anomalies
                if a.anomaly_type == "POTENTIAL_UNADJUSTED_CORPORATE_ACTION"
            ]
            assert len(split_anomalies) == 1
            assert split_anomalies[0].severity == AnomalySeverity.WARNING.value
            assert "Severe price drop of -50.12%" in split_anomalies[0].message or "-50." in split_anomalies[0].message

            # Raw values are strictly preserved
            assert len(result.valid_candles) == 2
            assert result.valid_candles[0].open == 2000.0
            assert result.valid_candles[1].open == 1000.0

    def test_suspicious_price_jump_threshold(self):
        """A +15% intraday jump exceeds default max_jump_pct (10%) and logs an ADVISORY."""
        with tempfile.TemporaryDirectory() as tmp_dir:
            csv_path = os.path.join(tmp_dir, "jump_test.csv")
            lines = [
                "timestamp,open,high,low,close,volume\n",
                "2026-03-02 09:15:00,1000.0,1005.0,995.0,1000.0,10000\n",
                "2026-03-02 09:16:00,1150.0,1160.0,1140.0,1155.0,25000\n"
            ]
            with open(csv_path, "w") as f:
                f.writelines(lines)

            result = CsvDataIngestion.ingest_csv_file(
                file_path=csv_path,
                instrument="JUMP_TEST",
                timeframe="1m",
                source_classification="SAMPLE",
                max_jump_pct=10.0
            )

            assert result.quality_report.valid_bars == 2
            jump_anomalies = [a for a in result.quality_report.anomalies if a.anomaly_type == "SUSPICIOUS_PRICE_JUMP"]
            assert len(jump_anomalies) == 1
            assert jump_anomalies[0].severity == AnomalySeverity.ADVISORY.value


# =====================================================================
# TASK 3: NSE CALENDAR COMPREHENSIVE VERIFICATION (v2026.1)
# =====================================================================

class TestTask3NseCalendarVerification:
    """Audits versioned NSE Calendar (v2026.2) against 16 official holidays and special sessions."""

    def test_nse_calendar_version_and_holidays(self):
        """Verifies calendar version identifier and official 2026 holiday schedule."""
        assert NSE_CALENDAR_VERSION == "2026.2"
        holidays_2026 = NseCalendar.get_holidays_for_year(2026)
        assert len(holidays_2026) == 16

        # Key fixed national & cultural holidays
        assert date(2026, 1, 15) in holidays_2026  # Municipal Corporation Election
        assert date(2026, 1, 26) in holidays_2026  # Republic Day
        assert date(2026, 3, 3) in holidays_2026   # Holi (official date per NSE/CMTR/71775)
        assert date(2026, 4, 3) in holidays_2026   # Good Friday
        assert date(2026, 4, 14) in holidays_2026  # Dr. Ambedkar Jayanti
        assert date(2026, 5, 1) in holidays_2026   # Maharashtra Day
        assert date(2026, 10, 2) in holidays_2026  # Mahatma Gandhi Jayanti
        assert date(2026, 10, 20) in holidays_2026 # Dussehra
        assert date(2026, 11, 10) in holidays_2026 # Diwali Balipratipada
        assert date(2026, 11, 24) in holidays_2026 # Gurunanak Jayanti
        assert date(2026, 12, 25) in holidays_2026 # Christmas

    def test_regular_session_hours_and_minute_boundaries(self):
        """Regular equity session is strictly 09:15 to 15:30 IST on non-holiday weekdays."""
        # Normal trading day: Monday 2026-03-09
        t_pre = datetime(2026, 3, 9, 9, 14, 59, tzinfo=IST)
        t_open = datetime(2026, 3, 9, 9, 15, 0, tzinfo=IST)
        t_mid = datetime(2026, 3, 9, 12, 30, 0, tzinfo=IST)
        t_close = datetime(2026, 3, 9, 15, 30, 0, tzinfo=IST)
        t_post = datetime(2026, 3, 9, 15, 30, 1, tzinfo=IST)

        assert NseCalendar.is_valid_trading_time(t_pre) is False
        assert NseCalendar.is_valid_trading_time(t_open) is True
        assert NseCalendar.is_valid_trading_time(t_mid) is True
        assert NseCalendar.is_valid_trading_time(t_close) is True
        assert NseCalendar.is_valid_trading_time(t_post) is False

    def test_weekend_rejection(self):
        """Standard weekends (Saturday & Sunday) reject trading."""
        # Saturday 2026-03-14 (no special session)
        sat_time = datetime(2026, 3, 14, 10, 30, 0, tzinfo=IST)
        # Sunday 2026-03-15
        sun_time = datetime(2026, 3, 15, 10, 30, 0, tzinfo=IST)

        assert NseCalendar.is_valid_trading_time(sat_time) is False
        assert NseCalendar.is_valid_trading_time(sun_time) is False

    def test_special_session_disaster_recovery_switch(self):
        """
        Disaster Recovery (DR) live switch session per circular NSE/MSD/73126:
        - Thursday 2026-03-05: 09:15 - 15:30 (Live trading from DR site)
        - Friday 2026-03-06: 09:15 - 15:30 (Live trading from DR site)
        - Saturday 2026-03-07: Standard weekend closure (strictly CLOSED, no trading)
        """
        dr_thu_open = datetime(2026, 3, 5, 9, 15, 0, tzinfo=IST)
        dr_thu_mid = datetime(2026, 3, 5, 12, 0, 0, tzinfo=IST)
        dr_thu_close = datetime(2026, 3, 5, 15, 30, 0, tzinfo=IST)

        assert NseCalendar.is_dr_session(dr_thu_mid) is True
        assert NseCalendar.get_session_type(dr_thu_mid) == SessionType.SPECIAL_DR
        assert NseCalendar.is_valid_trading_time(dr_thu_open) is True
        assert NseCalendar.is_valid_trading_time(dr_thu_mid) is True
        assert NseCalendar.is_valid_trading_time(dr_thu_close) is True

        # Friday 2026-03-06 DR session
        dr_fri_mid = datetime(2026, 3, 6, 11, 0, 0, tzinfo=IST)
        assert NseCalendar.is_dr_session(dr_fri_mid) is True
        assert NseCalendar.get_session_type(dr_fri_mid) == SessionType.SPECIAL_DR

        # Saturday 2026-03-07: strictly CLOSED (removal of incorrect mock session confirmed)
        sat_dr_time = datetime(2026, 3, 7, 10, 0, 0, tzinfo=IST)
        assert NseCalendar.is_dr_session(sat_dr_time) is False
        assert NseCalendar.is_valid_trading_time(sat_dr_time) is False
        assert NseCalendar.get_session_type(sat_dr_time) == SessionType.CLOSED

    def test_special_session_muhurat_trading(self):
        """
        Muhurat Trading per circular NSE/CMTR/76941:
        Sunday 2026-11-08:
        - Pre-open: 14:05 - 14:20 IST
        - Continuous Trading: 14:20 - 15:30 IST
        - Post-close: 15:50 - 16:00 IST
        - Evening (18:15-19:15): strictly CLOSED
        """
        muhurat_pre = datetime(2026, 11, 8, 14, 10, 0, tzinfo=IST)
        muhurat_open = datetime(2026, 11, 8, 14, 20, 0, tzinfo=IST)
        muhurat_mid = datetime(2026, 11, 8, 14, 50, 0, tzinfo=IST)
        muhurat_close = datetime(2026, 11, 8, 15, 30, 0, tzinfo=IST)
        muhurat_post = datetime(2026, 11, 8, 15, 55, 0, tzinfo=IST)
        muhurat_closed = datetime(2026, 11, 8, 16, 5, 0, tzinfo=IST)

        assert NseCalendar.is_muhurat_pre_open(muhurat_pre) is True
        assert NseCalendar.is_valid_trading_time(muhurat_pre) is False  # Order entry only

        assert NseCalendar.is_valid_trading_time(muhurat_open) is True
        assert NseCalendar.is_valid_trading_time(muhurat_mid) is True
        assert NseCalendar.is_valid_trading_time(muhurat_close) is True
        assert NseCalendar.get_session_type(muhurat_mid) == SessionType.SPECIAL_MUHURAT

        assert NseCalendar.is_muhurat_post_close(muhurat_post) is True
        assert NseCalendar.is_valid_trading_time(muhurat_post) is False

        assert NseCalendar.is_valid_trading_time(muhurat_closed) is False

        # Verify old 18:15-19:15 timing is strictly CLOSED
        old_evening = datetime(2026, 11, 8, 18, 30, 0, tzinfo=IST)
        assert NseCalendar.is_muhurat_session(old_evening) is False
        assert NseCalendar.is_valid_trading_time(old_evening) is False


# =====================================================================
# TASK 4: QUALITY SCORE AUDIT & ZERO DOUBLE-COUNTING INVARIANT
# =====================================================================

class TestTask4QualityScoreIndependentAudit:
    """Verifies that the data quality score formula has zero double-counting."""

    def test_hand_calculated_quality_score_golden_recomputation(self):
        """
        Exact recomputation on synthetic counts:
        Case A (Corrupted anomalies fixture structure):
        Total observed bars = 100
        Valid bars = 89
        Invalid bars = 11 (includes 3 duplicates, 1 session breach, 7 corrupted OHLC)
        Session breaches = 1
        Intrasession missing bars = 11
        Base denominator = 100 + 11 = 111

        Under non-double-counting formula:
        Penalties = (11 * 1.0) - (1 * 0.5) + (11 * 0.1) = 11 - 0.5 + 1.1 = 11.6
        Deduction = (11.6 / 111) * 100 = 10.45045...%
        Quality Score = 100.0 - 10.45045... = 89.55%

        Case B (Clean intraday with 10 invalid bars and 1 breach):
        Total observed bars = 100, Invalid = 10, Breach = 1, Missing = 0
        Penalties = (10 * 1.0) - (1 * 0.5) = 9.5
        Deduction = (9.5 / 100) * 100 = 9.5%
        Quality Score = 90.50%
        """
        score_a = HistoricalDataFramework.calculate_quality_score(
            total_observed_bars=100,
            invalid_bars=11,
            duplicate_count=3,
            session_boundary_breach_count=1,
            intrasession_missing_bars=11
        )
        assert score_a == 89.55

        score_b = HistoricalDataFramework.calculate_quality_score(
            total_observed_bars=100,
            invalid_bars=10,
            duplicate_count=2,
            session_boundary_breach_count=1,
            intrasession_missing_bars=0
        )
        assert score_b == 90.50

    def test_duplicates_do_not_incur_second_penalty(self):
        """
        Duplicate bars are already members of invalid_bars.
        Adding duplicate_count must NOT reduce the quality score a second time.
        """
        # Baseline: 5 invalid bars, 0 duplicates
        score_base = HistoricalDataFramework.calculate_quality_score(
            total_observed_bars=100,
            invalid_bars=5,
            duplicate_count=0,
            session_boundary_breach_count=0,
            intrasession_missing_bars=0
        )
        assert score_base == 95.0

        # Scenario: 5 invalid bars, where 2 are duplicates
        score_with_dups = HistoricalDataFramework.calculate_quality_score(
            total_observed_bars=100,
            invalid_bars=5,
            duplicate_count=2,
            session_boundary_breach_count=0,
            intrasession_missing_bars=0
        )
        # Score must remain exactly 95.0, proving duplicates are not penalized twice
        assert score_with_dups == 95.0

    def test_quality_score_clamping_and_empty_dataset(self):
        """Quality score must be 0.0 for empty dataset and bounded within [0.0, 100.0]."""
        # Empty dataset
        assert HistoricalDataFramework.calculate_quality_score(0, 0, 0, 0, 0) == 0.0

        # Catastrophic penalty exceeding 100%
        score_floored = HistoricalDataFramework.calculate_quality_score(
            total_observed_bars=100,
            invalid_bars=250,
            duplicate_count=0,
            session_boundary_breach_count=0,
            intrasession_missing_bars=0
        )
        assert score_floored == 0.0


# =====================================================================
# TASK 5: ADVANCED LEAKAGE AUDIT (PURGING, EMBARGO & MODEL FIT)
# =====================================================================

class TestTask5AdvancedLeakageAudit:
    """Verifies advanced leakage detection: López de Prado Purging, Embargo, and Model Fit."""

    def test_lopez_de_prado_purging_detection(self):
        """
        Forward target horizon H=5 bars.
        If training bars span up to t=100 and test begins at t=101,
        bars from t=96 to t=100 have forward-looking target horizons overlapping into the test set.
        """
        # 1-minute bars: 60,000 ms
        base_ts = 1772433300000  # 2026-03-02 09:15:00
        interval_ms = 60000

        # 10 training bars: index 0 to 9 (09:15 to 09:24)
        train_ts = [base_ts + i * interval_ms for i in range(10)]
        # Test starts at index 10 (09:25)
        test_start_ts = base_ts + 10 * interval_ms

        # Audit with forward target horizon of 5 bars (5 minutes)
        # Bars at index 6, 7, 8, 9 have horizon ending at 11, 12, 13, 14 (all >= 10)
        result = LeakageAuditor.audit_label_overlap_and_purging(
            train_timestamps=train_ts,
            test_start_timestamp=test_start_ts,
            target_horizon_bars=5,
            bar_interval_ms=interval_ms
        )

        assert result.has_leakage is True
        assert result.leakage_type == "LABEL_HORIZON_OVERLAP_UNPURGED"
        assert result.severity == "CRITICAL"
        assert result.diagnostics["unpurged_count"] > 0

    def test_lopez_de_prado_purging_compliance(self):
        """When training boundary bars are purged, audit passes with zero violations."""
        base_ts = 1772433300000
        interval_ms = 60000
        test_start_ts = base_ts + 10 * interval_ms
        horizon_bars = 5

        # Properly purged: last training bar must be at index 5 (09:20),
        # so label horizon ending at index 5 + 5 = 10 (or earlier < 10)
        # If last bar is at index 4 (09:19), label ends at 4 + 5 = 9 < 10
        purged_train_ts = [base_ts + i * interval_ms for i in range(5)]

        result = LeakageAuditor.audit_label_overlap_and_purging(
            train_timestamps=purged_train_ts,
            test_start_timestamp=test_start_ts,
            target_horizon_bars=horizon_bars,
            bar_interval_ms=interval_ms
        )

        assert result.has_leakage is False
        assert "cleanly purged" in result.message

    def test_cross_validation_embargo_compliance(self):
        """Cross-validation fold with inadequate post-test buffer triggers embargo violation."""
        interval_ms = 60000
        test_end_ts = 1772433300000
        # Required embargo: 10 bars (600,000 ms)
        # Actual buffer: only 3 bars (180,000 ms)
        subsequent_train_start_ts = test_end_ts + 3 * interval_ms

        result = LeakageAuditor.audit_embargo_compliance(
            test_end_timestamp=test_end_ts,
            subsequent_train_start_timestamp=subsequent_train_start_ts,
            embargo_bars=10,
            bar_interval_ms=interval_ms
        )

        assert result.has_leakage is True
        assert result.leakage_type == "EMBARGO_BUFFER_VIOLATION"
        assert result.severity == "WARNING"

        # Compliant buffer: 12 bars buffer >= 10 bars required
        compliant_train_start_ts = test_end_ts + 12 * interval_ms
        result_compliant = LeakageAuditor.audit_embargo_compliance(
            test_end_timestamp=test_end_ts,
            subsequent_train_start_timestamp=compliant_train_start_ts,
            embargo_bars=10,
            bar_interval_ms=interval_ms
        )
        assert result_compliant.has_leakage is False

    def test_model_fit_timestamp_temporal_causality(self):
        """Predictions occurring before model fitting was finalized trigger retroactive leakage."""
        fit_ts = 1772436900000  # 10:15:00

        # Valid forward predictions
        valid_preds = [fit_ts + 60000 * i for i in range(1, 10)]
        result_valid = LeakageAuditor.audit_model_fit_timestamp(
            model_fit_timestamp=fit_ts,
            prediction_timestamps=valid_preds
        )
        assert result_valid.has_leakage is False

        # Injected retrodiction (prediction at 10:00:00, prior to fit at 10:15:00)
        leaked_preds = [fit_ts - 900000, fit_ts + 60000]
        result_leaked = LeakageAuditor.audit_model_fit_timestamp(
            model_fit_timestamp=fit_ts,
            prediction_timestamps=leaked_preds
        )
        assert result_leaked.has_leakage is True
        assert result_leaked.leakage_type == "RETROACTIVE_MODEL_FIT_LEAKAGE"
        assert result_leaked.severity == "CRITICAL"


# =====================================================================
# TASK 6: SAFETY INTERLOCK RE-VERIFICATION
# =====================================================================

class TestTask6SafetyInterlockVerification:
    """Verifies that live execution remains unconditionally blocked."""

    def test_live_execution_safety_interlock_active(self):
        """Confirms that offline research mode forbids broker order submissions."""
        from core.broker_adapter import BrokerAdapter, Order, OrderType
        adapter = BrokerAdapter()
        order = Order(
            symbol="NIFTY",
            transaction_type="BUY",
            quantity=50,
            order_type=OrderType.MARKET
        )
        res = adapter.place_order(order)
        assert res is None, "BrokerAdapter.place_order must return None"
        assert order.status == "REJECTED"
        assert "permanently disabled" in order.reject_reason.lower()
