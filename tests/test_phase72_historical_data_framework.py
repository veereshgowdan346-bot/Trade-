"""
OmniTradePro Apex V2.0 — Phase 7.2
Historical Market Data Quality & Offline Research Framework Tests

Tests:
1. OHLC geometry verification (High >= max(O,C), Low <= min(O,C))
2. Non-positive price and negative volume detection
3. Duplicate and out-of-order timestamp detection
4. IST timezone (Asia/Kolkata +05:30) and NSE regular session boundary enforcement (09:15 - 15:30)
5. Differentiation of expected overnight market gaps from intrasession missing candles
6. Mathematical precision of Data Quality Score formula
7. Deterministic SHA-256 dataset checksums
8. Strict chronological splitting (Train/Val/Test) with zero temporal leakage
9. Indicator temporal causality verification
10. Provenance classification (SYNTHETIC, SAMPLE, GENUINE_HISTORICAL)
11. Invariant: Raw input preservation without silent mutation
"""

import json
import os
import sys
import math
import hashlib
from pathlib import Path
from datetime import datetime, date, timezone, timedelta
import pytest

REPO_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(REPO_ROOT))

from core.historical_data_framework import (
    HistoricalDataFramework,
    CandleRecord,
    AnomalyRecord,
    DataProvenance,
    DataQualityReport,
    ChronologicalSplits,
    DataProvenanceType,
    AdjustmentType,
    AnomalySeverity,
    IST,
    TRADING_HOLIDAYS_2026,
)

FIXTURES_DIR = os.path.join(os.path.dirname(__file__), "..", "data", "fixtures")


def load_fixture(filename: str):
    path = os.path.join(FIXTURES_DIR, filename)
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


class TestHistoricalDataQualityAndIntegrity:
    """Core validation of OHLCV integrity, timezone boundaries, and gap distinction."""

    def test_ohlc_geometry_validation(self):
        """Verifies High >= max(Open, Close) and Low <= min(Open, Close)."""
        corrupted_candles = [
            {"t": 1771386900000, "o": 100.0, "h": 95.0, "l": 90.0, "c": 98.0, "v": 1000},  # H < O
            {"t": 1771386960000, "o": 100.0, "h": 105.0, "l": 102.0, "c": 101.0, "v": 1000}, # L > C
            {"t": 1771387020000, "o": 100.0, "h": 105.0, "l": 95.0, "c": 102.0, "v": 1000},  # Valid
        ]

        valid, report = HistoricalDataFramework.validate_dataset(corrupted_candles, enforce_session_hours=False)

        assert report.total_observed_bars == 3
        assert report.valid_bars == 1
        assert report.invalid_bars == 2
        assert len(valid) == 1
        assert valid[0].open == 100.0
        assert valid[0].close == 102.0

        geom_anomalies = [a for a in report.anomalies if a.anomaly_type == "INVALID_OHLC_GEOMETRY"]
        assert len(geom_anomalies) == 2
        assert geom_anomalies[0].index == 0
        assert geom_anomalies[1].index == 1

    def test_non_positive_price_and_negative_volume(self):
        """Rejects zero/negative prices and negative/NaN volumes."""
        bad_candles = [
            {"t": 1771386900000, "o": 0.0, "h": 10.0, "l": 0.0, "c": 5.0, "v": 100},
            {"t": 1771386960000, "o": 10.0, "h": 12.0, "l": -1.0, "c": 11.0, "v": 100},
            {"t": 1771387020000, "o": 10.0, "h": 12.0, "l": 9.0, "c": 11.0, "v": -50},
            {"t": 1771387080000, "o": 10.0, "h": 12.0, "l": 9.0, "c": 11.0, "v": float("nan")},
        ]

        valid, report = HistoricalDataFramework.validate_dataset(bad_candles, enforce_session_hours=False)

        assert report.total_observed_bars == 4
        assert report.valid_bars == 0
        assert report.invalid_bars == 4
        price_anomalies = [a for a in report.anomalies if a.anomaly_type == "NEGATIVE_OR_ZERO_PRICE"]
        vol_anomalies = [a for a in report.anomalies if a.anomaly_type == "NEGATIVE_OR_NAN_VOLUME"]
        assert len(price_anomalies) == 2
        assert len(vol_anomalies) == 2

    def test_duplicate_and_out_of_order_timestamps(self):
        """Detects duplicate timestamps and temporal inversions."""
        unordered_candles = [
            {"t": 1771386900000, "o": 100.0, "h": 105.0, "l": 95.0, "c": 102.0, "v": 1000},
            {"t": 1771386900000, "o": 100.0, "h": 105.0, "l": 95.0, "c": 102.0, "v": 1000}, # Duplicate
            {"t": 1771386800000, "o": 100.0, "h": 105.0, "l": 95.0, "c": 102.0, "v": 1000}, # Out-of-order (< prev)
        ]

        valid, report = HistoricalDataFramework.validate_dataset(unordered_candles, enforce_session_hours=False)

        assert report.duplicate_count == 1
        dup_anomalies = [a for a in report.anomalies if a.anomaly_type == "DUPLICATE_TIMESTAMP"]
        order_anomalies = [a for a in report.anomalies if a.anomaly_type == "OUT_OF_ORDER_TIMESTAMP"]
        assert len(dup_anomalies) == 1
        assert len(order_anomalies) == 1

    def test_ist_timezone_and_session_boundaries(self):
        """Verifies session boundaries for NSE (09:15 - 15:30 IST) and exclusions (weekends & holidays)."""
        # 2026-02-18 09:15 IST (Regular Session Open)
        dt_open = datetime(2026, 2, 18, 9, 15, tzinfo=IST)
        assert HistoricalDataFramework.is_regular_nse_session(dt_open) is True

        # 2026-02-18 15:30 IST (Regular Session Close)
        dt_close = datetime(2026, 2, 18, 15, 30, tzinfo=IST)
        assert HistoricalDataFramework.is_regular_nse_session(dt_close) is True

        # 2026-02-18 08:30 IST (Pre-Market / Out-of-Session)
        dt_pre = datetime(2026, 2, 18, 8, 30, tzinfo=IST)
        assert HistoricalDataFramework.is_regular_nse_session(dt_pre) is False

        # 2026-02-18 16:00 IST (Post-Market)
        dt_post = datetime(2026, 2, 18, 16, 0, tzinfo=IST)
        assert HistoricalDataFramework.is_regular_nse_session(dt_post) is False

        # 2026-02-21 (Saturday - Weekend)
        dt_weekend = datetime(2026, 2, 21, 11, 0, tzinfo=IST)
        assert HistoricalDataFramework.is_regular_nse_session(dt_weekend) is False

        # 2026-01-26 (Republic Day - Official Trading Holiday)
        dt_holiday = datetime(2026, 1, 26, 11, 0, tzinfo=IST)
        assert HistoricalDataFramework.is_regular_nse_session(dt_holiday) is False

    def test_overnight_gap_vs_intrasession_missing(self):
        """Distinguishes expected market closure overnight gaps from intraday missing bars."""
        multiday_data = load_fixture("multiday_overnight_1m.json")
        valid, report = HistoricalDataFramework.validate_dataset(multiday_data, expected_interval_sec=60)

        # 750 bars total across 2 days (375 bars each day)
        assert report.total_observed_bars == 750
        assert report.valid_bars == 750
        assert report.invalid_bars == 0
        assert report.overnight_gap_count == 1
        assert report.intrasession_missing_bars == 0
        assert report.quality_score_pct == 100.0
        assert report.is_valid_for_research is True

        # Confirm the gap anomaly is ADVISORY, not an error
        gap_anomalies = [a for a in report.anomalies if a.anomaly_type == "OVERNIGHT_GAP"]
        assert len(gap_anomalies) == 1
        assert gap_anomalies[0].severity == AnomalySeverity.ADVISORY.value

    def test_exact_data_quality_score_formula(self):
        """Verifies exact data quality score formula calculation."""
        # Formula: max(0.0, 100.0 * (1.0 - (invalid*1.0 + dup*1.0 + breach*0.5 + missing*0.1) / (total + missing)))
        corrupted_data = load_fixture("corrupted_anomalies_1m.json")
        valid, report = HistoricalDataFramework.validate_dataset(corrupted_data, expected_interval_sec=60)

        assert report.total_observed_bars == 100
        # Expected penalties:
        # Invalid bars: bar 10 (neg price), 20 (neg vol), 30 (bad geom), 40 (dup), 50 (unordered), 90 (out of session)
        # Note: duplicate is also counted in duplicate_count; session breach is in session_boundary_breach_count
        # Missing bars: 5 intraday missing bars from bar 59 to 65
        assert report.duplicate_count >= 1
        assert report.intrasession_missing_bars >= 5
        assert report.session_boundary_breach_count >= 1

        denom = report.total_observed_bars + report.intrasession_missing_bars
        # Audited Phase 7.4 formula without double-counting:
        # Invalid bars carry 1.0 penalty. Session breach bars carry 0.5 penalty.
        # Intrasession missing bars carry 0.1 penalty each.
        expected_penalty = (
            report.invalid_bars * 1.0 -
            report.session_boundary_breach_count * 0.5 +
            report.intrasession_missing_bars * 0.1
        )
        expected_score = round(max(0.0, 100.0 * (1.0 - (expected_penalty / denom))), 2)

        assert report.quality_score_pct == expected_score
        assert report.quality_score_pct == 89.55
        assert report.quality_score_pct < 95.0
        assert report.is_valid_for_research is False

    def test_raw_preservation_without_silent_mutation(self):
        """Ensures raw input values are preserved exactly and not mutated."""
        raw_row = {"t": 1771386900000, "o": 100.0, "h": 95.0, "l": 90.0, "c": 98.0, "v": 1000}
        raw_copy = dict(raw_row)

        valid, report = HistoricalDataFramework.validate_dataset([raw_row], enforce_session_hours=False)

        # Raw input dictionary was NOT modified
        assert raw_row == raw_copy
        assert raw_row["h"] == 95.0  # Wick was NOT silently elevated to 100.0!

        # Corrupted row is rejected from valid list and preserved in anomaly raw_values
        assert len(valid) == 0
        assert report.anomalies[0].raw_values["h"] == 95.0


class TestProvenanceAndReproducibility:
    """Verifies deterministic checksums, metadata provenance, and chronological splits."""

    def test_deterministic_sha256_checksum(self):
        """Validates that identical raw datasets produce identical cryptographic SHA-256 hashes."""
        synth_data = load_fixture("synthetic_gbm_1m.json")
        raw_bytes_1 = json.dumps(synth_data, sort_keys=True).encode("utf-8")
        raw_bytes_2 = json.dumps(synth_data, sort_keys=True).encode("utf-8")

        hash_1 = HistoricalDataFramework.compute_sha256(raw_bytes_1)
        hash_2 = HistoricalDataFramework.compute_sha256(raw_bytes_2)

        assert hash_1 == hash_2
        assert len(hash_1) == 64

        # Any bit modification creates completely different hash
        mutated_data = list(synth_data)
        mutated_data[0] = dict(mutated_data[0])
        mutated_data[0]["o"] += 0.01
        mutated_bytes = json.dumps(mutated_data, sort_keys=True).encode("utf-8")
        mutated_hash = HistoricalDataFramework.compute_sha256(mutated_bytes)
        assert mutated_hash != hash_1

    def test_provenance_record_metadata(self):
        """Verifies provenance record tracking with all mandatory fields."""
        synth_data = load_fixture("synthetic_gbm_1m.json")
        raw_bytes = json.dumps(synth_data).encode("utf-8")
        raw_hash = HistoricalDataFramework.compute_sha256(raw_bytes)

        provenance = DataProvenance(
            dataset_id="SYNTH-GBM-2026-02-18",
            source="OFFLINE_GBM_SIMULATOR_V2",
            provenance_type=DataProvenanceType.SYNTHETIC.value,
            instrument="NIFTY50_SYNTH",
            exchange="NSE",
            timeframe="1m",
            adjustment=AdjustmentType.UNADJUSTED_RAW.value,
            start_time_iso="2026-02-18T09:15:00+05:30",
            end_time_iso="2026-02-18T15:29:00+05:30",
            imported_at_iso="2026-11-17T13:00:00+05:30",
            raw_sha256=raw_hash,
            description="Synthetic Geometric Brownian Motion 1m test dataset"
        )

        assert provenance.provenance_type == "SYNTHETIC"
        assert provenance.adjustment == "UNADJUSTED_RAW"
        assert provenance.raw_sha256 == raw_hash
        assert provenance.exchange == "NSE"

    def test_strict_chronological_split_non_leakage(self):
        """Guarantees max(Train.t) < min(Val.t) and max(Val.t) < min(Test.t)."""
        sample_data = load_fixture("sample_nifty50_1m.json")
        valid, report = HistoricalDataFramework.validate_dataset(sample_data)
        assert len(valid) == 375

        # Split 60% Train (225 bars), 20% Val (75 bars), 20% Test (75 bars)
        splits = HistoricalDataFramework.chronological_split(valid, train_ratio=0.60, val_ratio=0.20, test_ratio=0.20)

        assert splits.has_leakage is False
        assert len(splits.train_bars) == 225
        assert len(splits.val_bars) == 75
        assert len(splits.test_bars) == 75

        # Strict temporal non-overlap assertion
        max_train_ts = splits.train_bars[-1].timestamp
        min_val_ts = splits.val_bars[0].timestamp
        max_val_ts = splits.val_bars[-1].timestamp
        min_test_ts = splits.test_bars[0].timestamp

        assert max_train_ts < min_val_ts, f"Train overlap: max train {max_train_ts} >= min val {min_val_ts}"
        assert max_val_ts < min_test_ts, f"Val overlap: max val {max_val_ts} >= min test {min_test_ts}"

    def test_indicator_temporal_causality_verification(self):
        """Verifies that indicator length matches candle count and preserves causality."""
        sample_data = load_fixture("sample_nifty50_1m.json")
        valid, report = HistoricalDataFramework.validate_dataset(sample_data)

        # Simulation of causal indicator (e.g. SMA)
        is_causal = HistoricalDataFramework.verify_indicator_temporal_causality(valid, len(valid))
        assert is_causal is True

        # Non-causal indicator that drops or pads incorrectly
        is_not_causal = HistoricalDataFramework.verify_indicator_temporal_causality(valid, len(valid) - 5)
        assert is_not_causal is False
