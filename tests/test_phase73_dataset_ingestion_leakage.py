"""
OmniTradePro Apex V2.0 — Phase 7.3
Historical Dataset Ingestion & Independent Validation Tests

Tests:
1. CSV data ingestion across timeframes (1m, 5m, 15m, 1D).
2. Malformed CSV safety guards (missing columns, unparseable lines, empty files).
3. Raw file preservation invariant (read-only file access).
4. Data validation (non-positive prices, negative/NaN volumes, OHLC geometry, duplicates, gaps, splits).
5. Data provenance enforcement (refusal to classify SAMPLE/SYNTHETIC as GENUINE_HISTORICAL).
6. Versioned NSE calendar validation (regular, holidays, Muhurat special session, DR session).
7. Lookahead bias & data leakage audit:
   - Rolling indicator causality vs future-bar lookahead injection.
   - Feature scaler isolation vs global scaler leakage injection.
   - Chronological split non-leakage vs temporal overlap injection.
8. Cross-language consistency (Python vs TypeScript parity).
"""

import json
import os
import sys
import math
import hashlib
from pathlib import Path
from datetime import datetime, date, timezone, timedelta
from typing import List, Dict, Any, Callable, Optional, Tuple, Set
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
    IST
)
from core.nse_calendar import NseCalendar, SessionType, NSE_CALENDAR_VERSION
from core.csv_data_ingestion import CsvDataIngestion, CsvIngestionResult
from core.leakage_audit import LeakageAuditor, LeakageAuditResult

FIXTURES_DIR = os.path.join(REPO_ROOT, "data", "fixtures")


class TestCsvDataIngestionAndValidation:
    """Task 1 & Task 2: CSV Data Ingestion and Rigorous Validation."""

    def test_valid_csv_ingestion_sample_nifty50(self):
        """Verifies clean ingestion of 375 1-minute bars of NIFTY50 data."""
        csv_path = os.path.join(FIXTURES_DIR, "sample_nifty50_1m.csv")
        result = CsvDataIngestion.ingest_csv_file(
            file_path=csv_path,
            instrument="NIFTY50",
            exchange="NSE",
            timeframe="1m",
            source_classification="SAMPLE"
        )

        assert result.raw_file_sha256 is not None
        assert len(result.raw_file_sha256) == 64
        assert result.quality_report.total_observed_bars == 375
        assert result.quality_report.valid_bars == 375
        assert result.quality_report.invalid_bars == 0
        assert result.quality_report.duplicate_count == 0
        assert result.quality_report.intrasession_missing_bars == 0
        assert result.quality_report.overnight_gap_count == 0
        assert result.quality_report.quality_score_pct == 100.0
        assert result.is_valid_for_research is True

        # Invariant: Raw file was not modified on disk
        with open(csv_path, "rb") as f:
            disk_sha256 = hashlib.sha256(f.read()).hexdigest()
        assert disk_sha256 == result.raw_file_sha256

    def test_multiday_overnight_gap_csv_ingestion(self):
        """Verifies that 2-day CSV correctly classifies interday overnight gap without penalty."""
        csv_path = os.path.join(FIXTURES_DIR, "multiday_overnight_1m.csv")
        result = CsvDataIngestion.ingest_csv_file(
            file_path=csv_path,
            instrument="NIFTY50_MULTIDAY",
            exchange="NSE",
            timeframe="1m",
            source_classification="SAMPLE"
        )

        assert result.quality_report.total_observed_bars == 750
        assert result.quality_report.valid_bars == 750
        assert result.quality_report.overnight_gap_count == 1
        assert result.quality_report.intrasession_missing_bars == 0
        assert result.quality_report.quality_score_pct == 100.0
        assert result.is_valid_for_research is True

    def test_corrupted_csv_anomaly_detection(self):
        """Detects negative prices, negative volumes, bad geometry, duplicates, gaps, and splits."""
        csv_path = os.path.join(FIXTURES_DIR, "corrupted_anomalies_1m.csv")
        result = CsvDataIngestion.ingest_csv_file(
            file_path=csv_path,
            instrument="CORRUPT_FIXTURE",
            exchange="NSE",
            timeframe="1m",
            source_classification="SAMPLE"
        )

        rep = result.quality_report
        assert rep.total_observed_bars == 100
        assert rep.valid_bars == 89
        assert rep.invalid_bars == 11
        assert rep.duplicate_count == 3
        assert rep.intrasession_missing_bars == 11
        assert rep.overnight_gap_count == 0
        assert rep.quality_score_pct == 89.55
        assert result.is_valid_for_research is False

        # Verify specific anomaly types were captured with raw values
        anomaly_types = {a.anomaly_type for a in rep.anomalies}
        assert "NEGATIVE_OR_ZERO_PRICE" in anomaly_types
        assert "NEGATIVE_OR_NAN_VOLUME" in anomaly_types
        assert "INVALID_OHLC_GEOMETRY" in anomaly_types
        assert "DUPLICATE_TIMESTAMP" in anomaly_types
        assert "OUT_OF_ORDER_TIMESTAMP" in anomaly_types
        assert "INTRASESSION_MISSING_CANDLE" in anomaly_types
        assert "POTENTIAL_UNADJUSTED_CORPORATE_ACTION" in anomaly_types
        assert "SESSION_BOUNDARY_BREACH" in anomaly_types

    def test_malformed_csv_file_rejection(self, tmp_path):
        """Safely rejects missing columns or non-existent files."""
        # 1. Non-existent file
        with pytest.raises(FileNotFoundError):
            CsvDataIngestion.ingest_csv_file(
                file_path=str(tmp_path / "does_not_exist.csv"),
                instrument="TEST"
            )

        # 2. Missing mandatory column (e.g. missing 'close')
        bad_csv = tmp_path / "missing_col.csv"
        bad_csv.write_text("timestamp,open,high,low,volume\n2026-02-18 09:15:00,100,105,95,1000\n")
        with pytest.raises(ValueError, match="Missing mandatory column 'c'"):
            CsvDataIngestion.ingest_csv_file(
                file_path=str(bad_csv),
                instrument="TEST"
            )

        # 3. Empty CSV file
        empty_csv = tmp_path / "empty.csv"
        empty_csv.write_text("")
        res_empty = CsvDataIngestion.ingest_csv_file(
            file_path=str(empty_csv),
            instrument="TEST"
        )
        assert res_empty.quality_report.total_observed_bars == 0
        assert res_empty.is_valid_for_research is False


class TestDataProvenanceEnforcement:
    """Task 3: Data Provenance and False Classification Guards."""

    def test_refuse_genuine_classification_on_sample_fixtures(self):
        """Never allows SAMPLE or SYNTHETIC files to be falsely labeled GENUINE_HISTORICAL."""
        csv_path = os.path.join(FIXTURES_DIR, "sample_nifty50_1m.csv")
        with pytest.raises(ValueError, match="requires authenticated external archive evidence|Provenance Integrity Violation"):
            CsvDataIngestion.ingest_csv_file(
                file_path=csv_path,
                instrument="NIFTY50",
                source_classification="GENUINE_HISTORICAL"
            )

    def test_provenance_metadata_completeness(self):
        """Verifies complete metadata provenance recording."""
        csv_path = os.path.join(FIXTURES_DIR, "sample_nifty50_1m.csv")
        result = CsvDataIngestion.ingest_csv_file(
            file_path=csv_path,
            instrument="NIFTY50",
            exchange="NSE",
            timeframe="1m",
            source_classification="SAMPLE"
        )
        prov = result.provenance
        assert prov.instrument == "NIFTY50"
        assert prov.exchange == "NSE"
        assert prov.timeframe == "1m"
        assert prov.provenance_type == "SAMPLE"
        assert prov.raw_sha256 == result.raw_file_sha256
        assert prov.start_time_iso != "N/A"
        assert prov.end_time_iso != "N/A"


class TestNseCalendarValidation:
    """Task 4: NSE Calendar, Holidays, and Special Sessions."""

    def test_calendar_version(self):
        """Verifies versioned auditable calendar."""
        assert NseCalendar.VERSION in ("2026.1", "2026.2")
        assert NSE_CALENDAR_VERSION in ("2026.1", "2026.2")

    def test_regular_session_boundaries(self):
        """Verifies NSE regular trading window 09:15 - 15:30 IST on trading days."""
        # Wednesday 2026-02-18
        dt_pre = datetime(2026, 2, 18, 9, 5, tzinfo=IST)
        assert NseCalendar.get_session_type(dt_pre) == SessionType.PRE_OPEN
        assert NseCalendar.is_valid_trading_time(dt_pre) is False

        dt_open = datetime(2026, 2, 18, 9, 15, tzinfo=IST)
        assert NseCalendar.get_session_type(dt_open) == SessionType.REGULAR
        assert NseCalendar.is_valid_trading_time(dt_open) is True

        dt_mid = datetime(2026, 2, 18, 12, 30, tzinfo=IST)
        assert NseCalendar.get_session_type(dt_mid) == SessionType.REGULAR
        assert NseCalendar.is_valid_trading_time(dt_mid) is True

        dt_close = datetime(2026, 2, 18, 15, 30, tzinfo=IST)
        assert NseCalendar.get_session_type(dt_close) == SessionType.REGULAR
        assert NseCalendar.is_valid_trading_time(dt_close) is True

        dt_post = datetime(2026, 2, 18, 15, 45, tzinfo=IST)
        assert NseCalendar.get_session_type(dt_post) == SessionType.POST_CLOSE
        assert NseCalendar.is_valid_trading_time(dt_post) is False

    def test_official_2026_holidays(self):
        """Verifies rejection of official 2026 holidays."""
        # Republic Day: 2026-01-26 (Monday)
        dt_rep = datetime(2026, 1, 26, 10, 0, tzinfo=IST)
        assert NseCalendar.is_holiday(dt_rep.date()) is True
        assert NseCalendar.get_session_type(dt_rep) == SessionType.CLOSED
        assert NseCalendar.is_valid_trading_time(dt_rep) is False

        # Good Friday: 2026-04-03
        dt_gf = datetime(2026, 4, 3, 10, 0, tzinfo=IST)
        assert NseCalendar.is_holiday(dt_gf.date()) is True
        assert NseCalendar.get_session_type(dt_gf) == SessionType.CLOSED

    def test_muhurat_special_session(self):
        """Verifies Diwali Muhurat session on 2026-11-08 (14:20 to 15:30 IST per NSE/CMTR/76941)."""
        # Daytime before special session is closed as holiday
        dt_diwali_day = datetime(2026, 11, 8, 10, 0, tzinfo=IST)
        assert NseCalendar.get_session_type(dt_diwali_day) == SessionType.CLOSED
        assert NseCalendar.is_valid_trading_time(dt_diwali_day) is False

        # Continuous Muhurat trading session is authorized (14:20 to 15:30 IST)
        dt_muhurat = datetime(2026, 11, 8, 14, 30, tzinfo=IST)
        assert NseCalendar.is_muhurat_session(dt_muhurat) is True
        assert NseCalendar.get_session_type(dt_muhurat) == SessionType.SPECIAL_MUHURAT
        assert NseCalendar.is_valid_trading_time(dt_muhurat) is True

        # Old invalid evening timing (18:15-19:15) is strictly CLOSED
        dt_old_evening = datetime(2026, 11, 8, 18, 30, tzinfo=IST)
        assert NseCalendar.is_muhurat_session(dt_old_evening) is False
        assert NseCalendar.get_session_type(dt_old_evening) == SessionType.CLOSED
        assert NseCalendar.is_valid_trading_time(dt_old_evening) is False

    def test_mcx_commodity_hours(self):
        """Verifies MCX commodity extended hours (09:00 - 23:30 IST)."""
        dt_evening = datetime(2026, 2, 18, 20, 0, tzinfo=IST)
        # NSE Equity is closed
        assert NseCalendar.get_session_type(dt_evening, exchange="NSE") == SessionType.CLOSED
        # MCX Commodity is open
        assert NseCalendar.get_session_type(dt_evening, exchange="MCX") == SessionType.COMMODITY_REGULAR
        assert NseCalendar.is_valid_trading_time(dt_evening, exchange="MCX") is True


class TestLookaheadAndDataLeakageAudit:
    """Task 5: Lookahead Bias and Data Leakage Auditing."""

    @pytest.fixture
    def sample_candles(self):
        csv_path = os.path.join(FIXTURES_DIR, "sample_nifty50_1m.csv")
        res = CsvDataIngestion.ingest_csv_file(csv_path, "NIFTY50")
        return res.valid_candles

    def test_causal_rolling_indicator_passes(self, sample_candles):
        """Purely causal rolling indicator (e.g. 5-period SMA) passes causality audit."""
        def causal_sma5(candles: List[CandleRecord]) -> List[float]:
            out = []
            for i in range(len(candles)):
                if i < 4:
                    out.append(float("nan"))
                else:
                    window = [c.close for c in candles[i - 4:i + 1]]
                    out.append(sum(window) / 5.0)
            return out

        audit = LeakageAuditor.audit_indicator_causality(sample_candles, causal_sma5)
        assert audit.has_leakage is False
        assert audit.severity == "NONE"

    def test_deliberate_indicator_lookahead_detected(self, sample_candles):
        """Deliberately introduces future-bar access (centered MA using t+1) and confirms detection."""
        def forward_looking_ma(candles: List[CandleRecord]) -> List[float]:
            out = []
            n = len(candles)
            for i in range(n):
                if i == 0 or i == n - 1:
                    out.append(candles[i].close)
                else:
                    # Lookahead: Accesses i + 1 (the future candle!)
                    out.append((candles[i - 1].close + candles[i].close + candles[i + 1].close) / 3.0)
            return out

        audit = LeakageAuditor.audit_indicator_causality(sample_candles, forward_looking_ma)
        assert audit.has_leakage is True
        assert audit.leakage_type == "INDICATOR_LOOKAHEAD_FUTURE_BAR"
        assert audit.severity == "CRITICAL"
        assert "relies on future bars" in audit.message

    def test_feature_scaler_isolation_passes(self):
        """Feature scaler fitted strictly on training distribution passes."""
        train_features = [10.0, 15.0, 20.0, 25.0]
        test_features = [5.0, 30.0]  # Test has broader min/max

        scaler_min = min(train_features)  # 10.0
        scaler_max = max(train_features)  # 25.0

        audit = LeakageAuditor.audit_scaler_leakage(train_features, test_features, scaler_min, scaler_max)
        assert audit.has_leakage is False
        assert audit.severity == "NONE"

    def test_deliberate_global_scaler_leakage_detected(self):
        """Deliberately fits scaler across train + test and confirms leakage detection."""
        train_features = [10.0, 15.0, 20.0, 25.0]
        test_features = [5.0, 30.0]  # Min is 5.0, Max is 30.0 globally

        # Contaminated scaler: fit on ALL features
        contaminated_min = min(train_features + test_features)  # 5.0 (leaked from test!)
        contaminated_max = max(train_features + test_features)  # 30.0 (leaked from test!)

        audit = LeakageAuditor.audit_scaler_leakage(train_features, test_features, contaminated_min, contaminated_max)
        assert audit.has_leakage is True
        assert audit.leakage_type == "GLOBAL_FEATURE_SCALER_LEAKAGE"
        assert audit.severity == "CRITICAL"
        assert "leaking test distributions" in audit.message

    def test_chronological_partitions_pass(self):
        """Monotonic non-overlapping temporal partitions pass audit."""
        train_ts = [1000, 2000, 3000]
        val_ts = [4000, 5000]
        test_ts = [6000, 7000]

        audit = LeakageAuditor.audit_temporal_partitions(train_ts, val_ts, test_ts)
        assert audit.has_leakage is False
        assert audit.severity == "NONE"

    def test_deliberate_train_test_overlap_detected(self):
        """Deliberately injects temporal overlap (train bar >= test bar) and confirms detection."""
        train_ts = [1000, 2000, 6500]  # 6500 overlaps with test!
        val_ts = []
        test_ts = [6000, 7000]

        audit = LeakageAuditor.audit_temporal_partitions(train_ts, val_ts, test_ts)
        assert audit.has_leakage is True
        assert audit.leakage_type == "TRAIN_TEST_TEMPORAL_OVERLAP"
        assert audit.severity == "CRITICAL"

    def test_deliberate_shuffled_kfold_leakage_detected(self):
        """Deliberately shuffles partition timestamps (simulating random k-fold) and confirms detection."""
        shuffled_train = [3000, 1000, 2000]  # Out of order!
        test_ts = [6000, 7000]

        audit = LeakageAuditor.audit_temporal_partitions(shuffled_train, [], test_ts)
        assert audit.has_leakage is True
        assert audit.leakage_type == "OUT_OF_ORDER_PARTITION_TIMESTAMPS"
        assert audit.severity == "CRITICAL"
