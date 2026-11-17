"""
OmniTradePro Apex V2.0 — Phase 7.3
Historical CSV Dataset Ingestion & Validation Pipeline

Mode: Strict Offline Research Only
- Safely ingests user-provided historical OHLCV CSV files without modification.
- Computes deterministic SHA-256 checksums from raw file bytes.
- Supports 1m, 5m, 15m, 1h, and 1D timeframes.
- Audits session boundaries, holidays, and special sessions via NseCalendar.
- Validates duplicate timestamps, missing candles, invalid geometry, and non-positive prices.
- Never silently repairs raw data.
- Enforces strict provenance labeling (never falsely classifies SAMPLE/SYNTHETIC as GENUINE_HISTORICAL).
"""

import csv
import hashlib
import io
import math
import os
import re
from dataclasses import dataclass, field, asdict
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any, Optional, Tuple, Set

from core.historical_data_framework import (
    CandleRecord,
    AnomalyRecord,
    DataQualityReport,
    DataProvenance,
    DataProvenanceType,
    AdjustmentType,
    AnomalySeverity,
    HistoricalDataFramework,
    IST
)
from core.nse_calendar import NseCalendar, SessionType


@dataclass
class CsvIngestionResult:
    provenance: DataProvenance
    quality_report: DataQualityReport
    valid_candles: List[CandleRecord]
    raw_file_sha256: str
    is_valid_for_research: bool
    source_file_path: str


class CsvDataIngestion:
    """Production-grade offline CSV ingestion and verification engine."""

    TIMEFRAME_SECONDS = {
        "1m": 60,
        "5m": 300,
        "15m": 900,
        "30m": 1800,
        "1h": 3600,
        "60m": 3600,
        "1D": 86400,
        "1d": 86400,
    }

    @staticmethod
    def parse_timestamp_str(raw_val: str) -> int:
        """
        Parse raw timestamp string into Unix timestamp in milliseconds.
        Handles:
        1. Epoch milliseconds or seconds (digits).
        2. ISO-8601 strings (e.g., '2026-02-18T09:15:00+05:30', '2026-02-18T03:45:00Z').
        3. Standard datetime strings (e.g., '2026-02-18 09:15:00').
        """
        s = raw_val.strip()
        # 1. Pure numeric epoch
        if re.match(r"^\d{10,13}$", s):
            val = int(s)
            return val if val >= 10_000_000_000 else val * 1000

        # 2. ISO format with timezone or standard format
        try:
            # Python 3.11+ fromisoformat handles +05:30, Z, etc.
            clean_s = s.replace("Z", "+00:00")
            dt = datetime.fromisoformat(clean_s)
            if dt.tzinfo is None:
                # If naive, assume Indian Standard Time (IST)
                dt = dt.replace(tzinfo=IST)
            return int(dt.timestamp() * 1000)
        except Exception:
            pass

        # 3. Format 'YYYY-MM-DD HH:MM:SS'
        for fmt in ("%Y-%m-%d %H:%M:%S", "%Y/%m/%d %H:%M:%S", "%d-%m-%Y %H:%M:%S"):
            try:
                dt = datetime.strptime(s, fmt).replace(tzinfo=IST)
                return int(dt.timestamp() * 1000)
            except Exception:
                continue

        raise ValueError(f"Unrecognized timestamp format: '{raw_val}'")

    @classmethod
    def ingest_csv_file(
        cls,
        file_path: str,
        instrument: str,
        exchange: str = "NSE",
        timeframe: str = "1m",
        source_classification: str = "SAMPLE",
        adjustment: str = "UNADJUSTED_RAW",
        enforce_session_hours: bool = True,
        max_jump_pct: float = 10.0,
        corporate_action_split_threshold: float = 25.0,
        provenance_evidence: Optional[Dict[str, Any]] = None
    ) -> CsvIngestionResult:
        """
        Ingests and validates a user-provided CSV file without modifying original bytes.
        Enforces strict provenance evidence for GENUINE_HISTORICAL classification.
        """
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"Historical CSV file not found: {file_path}")

        # Task 1 & 3: Provenance Integrity Guard
        # File renaming or moving to arbitrary locations CANNOT bypass verification.
        src_upper = source_classification.upper().strip()
        if src_upper == "GENUINE_HISTORICAL":
            norm_path = os.path.normpath(file_path).lower()
            is_fixture_path = any(k in norm_path for k in ("fixture", "sample", "synth", "test"))
            has_valid_evidence = (
                provenance_evidence is not None and
                bool(provenance_evidence.get("archive_provider")) and
                bool(provenance_evidence.get("batch_id") or provenance_evidence.get("vendor_license_id")) and
                bool(provenance_evidence.get("manifest_sha256") and len(provenance_evidence["manifest_sha256"]) == 64) and
                provenance_evidence.get("is_verified_feed") is True
            )
            if is_fixture_path or not has_valid_evidence:
                raise ValueError(
                    f"Provenance Integrity Violation: Assigning 'GENUINE_HISTORICAL' requires authenticated external "
                    f"archive evidence (archive_provider, batch_id, manifest_sha256, is_verified_feed=True). "
                    f"File renaming or relocation cannot bypass this verification. "
                    f"In offline research mode, unverified files must be classified as 'SAMPLE' or 'SYNTHETIC'."
                )

        # 1. Read raw bytes strictly read-only and compute deterministic SHA-256
        with open(file_path, "rb") as f:
            raw_bytes = f.read()

        file_sha256 = hashlib.sha256(raw_bytes).hexdigest()

        # 2. Parse CSV text safely
        try:
            text_content = raw_bytes.decode("utf-8")
        except UnicodeDecodeError:
            text_content = raw_bytes.decode("latin-1")

        csv_reader = csv.reader(io.StringIO(text_content))
        rows = list(csv_reader)

        if not rows:
            empty_report = DataQualityReport(
                total_observed_bars=0,
                valid_bars=0,
                invalid_bars=0,
                duplicate_count=0,
                intrasession_missing_bars=0,
                overnight_gap_count=0,
                session_boundary_breach_count=0,
                quality_score_pct=0.0,
                score_formula="max(0.0, 100.0 * (1.0 - (invalid*1.0 + dup*1.0 + breach*0.5 + missing*0.1) / (total + missing)))",
                anomalies=[AnomalyRecord(
                    index=-1,
                    timestamp=0,
                    anomaly_type="EMPTY_FILE",
                    severity=AnomalySeverity.CRITICAL.value,
                    message="CSV file contains 0 rows",
                    raw_values={}
                )],
                is_valid_for_research=False
            )
            provenance = DataProvenance(
                dataset_id=f"CSV-{instrument}-{timeframe}-{file_sha256[:8]}",
                source=f"OFFLINE_CSV_{src_upper}",
                provenance_type=src_upper,
                instrument=instrument,
                exchange=exchange,
                timeframe=timeframe,
                adjustment=adjustment,
                start_time_iso="N/A",
                end_time_iso="N/A",
                imported_at_iso=datetime.now(timezone.utc).astimezone(IST).isoformat(),
                raw_sha256=file_sha256,
                description=f"Empty CSV file: {os.path.basename(file_path)}"
            )
            return CsvIngestionResult(
                provenance=provenance,
                quality_report=empty_report,
                valid_candles=[],
                raw_file_sha256=file_sha256,
                is_valid_for_research=False,
                source_file_path=file_path
            )

        # 3. Detect Header Columns
        header_row = [c.strip().lower() for c in rows[0]]
        data_rows = rows[1:]

        # Column mapping
        col_map = {}
        for idx, col in enumerate(header_row):
            if col in ("timestamp", "datetime", "date_time", "time", "date", "ts"):
                col_map["t"] = idx
            elif col in ("open", "o", "open_price"):
                col_map["o"] = idx
            elif col in ("high", "h", "high_price"):
                col_map["h"] = idx
            elif col in ("low", "l", "low_price"):
                col_map["l"] = idx
            elif col in ("close", "c", "close_price"):
                col_map["c"] = idx
            elif col in ("volume", "v", "vol", "traded_qty"):
                col_map["v"] = idx

        # Mandatory columns
        for required_key in ("t", "o", "h", "l", "c"):
            if required_key not in col_map:
                raise ValueError(
                    f"Malformed CSV: Missing mandatory column '{required_key}'. Headers found: {header_row}"
                )

        # 4. Ingest and Validate Bars
        expected_interval_sec = cls.TIMEFRAME_SECONDS.get(timeframe, 60)
        interval_ms = expected_interval_sec * 1000

        seen_timestamps: Set[int] = set()
        prev_ts = -1
        prev_close = -1.0
        prev_dt_ist: Optional[datetime] = None

        anomalies: List[AnomalyRecord] = []
        valid_candles: List[CandleRecord] = []

        duplicate_count = 0
        intrasession_missing_bars = 0
        overnight_gap_count = 0
        session_boundary_breach_count = 0

        for r_idx, row in enumerate(data_rows):
            if not row or all(c.strip() == "" for c in row):
                continue  # Skip blank lines safely

            is_bar_valid = True
            raw_dict = {"row_index": r_idx + 2, "raw_row": row}

            # Parse Timestamp
            try:
                raw_t_str = row[col_map["t"]]
                ts_ms = cls.parse_timestamp_str(raw_t_str)
                dt_ist = datetime.fromtimestamp(ts_ms / 1000.0, tz=timezone.utc).astimezone(IST)
                dt_str = dt_ist.strftime("%Y-%m-%d %H:%M:%S %Z")
                raw_dict["parsed_ts"] = ts_ms
            except Exception as e:
                anomalies.append(AnomalyRecord(
                    index=r_idx,
                    timestamp=0,
                    anomaly_type="MALFORMED_TIMESTAMP",
                    severity=AnomalySeverity.CRITICAL.value,
                    message=f"Failed to parse timestamp in row {r_idx + 2}: {e}",
                    raw_values=raw_dict
                ))
                continue

            # Parse Numeric OHLCV
            try:
                o = float(row[col_map["o"]])
                h = float(row[col_map["h"]])
                l = float(row[col_map["l"]])
                c = float(row[col_map["c"]])
                v = float(row[col_map["v"]]) if "v" in col_map else 0.0
                raw_dict.update({"o": o, "h": h, "l": l, "c": c, "v": v})
            except Exception as e:
                anomalies.append(AnomalyRecord(
                    index=r_idx,
                    timestamp=ts_ms,
                    anomaly_type="MALFORMED_NUMERIC_FIELD",
                    severity=AnomalySeverity.CRITICAL.value,
                    message=f"Non-numeric value in row {r_idx + 2}: {e}",
                    raw_values=raw_dict
                ))
                continue

            # Check 1: Non-positive price
            if o <= 0.0 or h <= 0.0 or l <= 0.0 or c <= 0.0:
                anomalies.append(AnomalyRecord(
                    index=r_idx,
                    timestamp=ts_ms,
                    anomaly_type="NEGATIVE_OR_ZERO_PRICE",
                    severity=AnomalySeverity.CRITICAL.value,
                    message=f"Non-positive price at {dt_str}: O={o}, H={h}, L={l}, C={c}",
                    raw_values=raw_dict
                ))
                is_bar_valid = False

            # Check 2: Negative or non-finite volume
            if v < 0.0 or math.isnan(v) or math.isinf(v):
                anomalies.append(AnomalyRecord(
                    index=r_idx,
                    timestamp=ts_ms,
                    anomaly_type="NEGATIVE_OR_NAN_VOLUME",
                    severity=AnomalySeverity.CRITICAL.value,
                    message=f"Negative or non-finite volume at {dt_str}: V={v}",
                    raw_values=raw_dict
                ))
                is_bar_valid = False

            # Check 3: Mathematical OHLC Geometry
            max_body = max(o, c)
            min_body = min(o, c)
            if h < max_body - 1e-4 or l > min_body + 1e-4:
                anomalies.append(AnomalyRecord(
                    index=r_idx,
                    timestamp=ts_ms,
                    anomaly_type="INVALID_OHLC_GEOMETRY",
                    severity=AnomalySeverity.CRITICAL.value,
                    message=f"Corrupted OHLC geometry at {dt_str}: H={h} < max(O,C)={max_body} or L={l} > min(O,C)={min_body}",
                    raw_values=raw_dict
                ))
                is_bar_valid = False

            # Check 4: Duplicate Timestamp
            if ts_ms in seen_timestamps:
                duplicate_count += 1
                anomalies.append(AnomalyRecord(
                    index=r_idx,
                    timestamp=ts_ms,
                    anomaly_type="DUPLICATE_TIMESTAMP",
                    severity=AnomalySeverity.CRITICAL.value,
                    message=f"Duplicate timestamp encountered: {ts_ms} ({dt_str})",
                    raw_values=raw_dict
                ))
                is_bar_valid = False
            else:
                seen_timestamps.add(ts_ms)

            # Check 5: Monotonic Ordering
            if prev_ts > 0 and ts_ms < prev_ts:
                anomalies.append(AnomalyRecord(
                    index=r_idx,
                    timestamp=ts_ms,
                    anomaly_type="OUT_OF_ORDER_TIMESTAMP",
                    severity=AnomalySeverity.CRITICAL.value,
                    message=f"Temporal inversion: current {ts_ms} < previous {prev_ts}",
                    raw_values=raw_dict
                ))
                is_bar_valid = False

            # Check 6: Session Boundary & NSE Calendar
            if enforce_session_hours and timeframe != "1D":
                is_valid_session = NseCalendar.is_valid_trading_time(dt_ist, exchange=exchange)
                if not is_valid_session:
                    session_boundary_breach_count += 1
                    anomalies.append(AnomalyRecord(
                        index=r_idx,
                        timestamp=ts_ms,
                        anomaly_type="SESSION_BOUNDARY_BREACH",
                        severity=AnomalySeverity.WARNING.value,
                        message=f"Bar falls outside valid NSE session hours or on holiday: {dt_str}",
                        raw_values=raw_dict
                    ))
                    is_bar_valid = False

            # Check 7: Gap Analysis (Intrasession missing vs Overnight)
            if prev_ts > 0 and ts_ms > prev_ts and timeframe != "1D":
                delta_ms = ts_ms - prev_ts
                if delta_ms > interval_ms * 1.5:
                    is_overnight = False
                    if prev_dt_ist is not None:
                        is_overnight = (
                            (prev_dt_ist.date() != dt_ist.date()) or
                            (prev_dt_ist.time() >= datetime.strptime("15:29", "%H:%M").time() and
                             dt_ist.time() <= datetime.strptime("09:16", "%H:%M").time())
                        )
                    if is_overnight:
                        overnight_gap_count += 1
                        anomalies.append(AnomalyRecord(
                            index=r_idx,
                            timestamp=ts_ms,
                            anomaly_type="OVERNIGHT_GAP",
                            severity=AnomalySeverity.ADVISORY.value,
                            message=f"Market closure gap ({round(delta_ms / 3600000.0, 1)}h) from {prev_dt_ist} to {dt_ist}",
                            raw_values=raw_dict
                        ))
                    else:
                        missing_bars = int(round(delta_ms / interval_ms)) - 1
                        intrasession_missing_bars += missing_bars
                        anomalies.append(AnomalyRecord(
                            index=r_idx,
                            timestamp=ts_ms,
                            anomaly_type="INTRASESSION_MISSING_CANDLE",
                            severity=AnomalySeverity.WARNING.value,
                            message=f"Missing {missing_bars} expected bar(s) between {prev_dt_ist} and {dt_ist}",
                            raw_values=raw_dict
                        ))

            # Check 8: Corporate Actions & Sudden Large Price Drop / Split Inconsistency
            if prev_close > 0.0 and is_bar_valid:
                price_change_pct = ((o - prev_close) / prev_close) * 100.0
                # Detect potential unadjusted stock split (e.g. drop of -50% or -80% unadjusted)
                if price_change_pct < -corporate_action_split_threshold:
                    anomalies.append(AnomalyRecord(
                        index=r_idx,
                        timestamp=ts_ms,
                        anomaly_type="POTENTIAL_UNADJUSTED_CORPORATE_ACTION",
                        severity=AnomalySeverity.WARNING.value,
                        message=f"Severe price drop of {price_change_pct:.2f}% indicates possible unadjusted split/bonus",
                        raw_values=raw_dict
                    ))
                elif abs(price_change_pct) > max_jump_pct:
                    anomalies.append(AnomalyRecord(
                        index=r_idx,
                        timestamp=ts_ms,
                        anomaly_type="SUSPICIOUS_PRICE_JUMP",
                        severity=AnomalySeverity.ADVISORY.value,
                        message=f"Price jump of {price_change_pct:.2f}% exceeds threshold {max_jump_pct}%",
                        raw_values=raw_dict
                    ))

            # Valid candle ingestion (Preserves raw values exactly)
            if is_bar_valid:
                valid_candles.append(CandleRecord(
                    timestamp=ts_ms,
                    open=o,
                    high=h,
                    low=l,
                    close=c,
                    volume=v,
                    datetime_ist=dt_str
                ))
                prev_close = c
                prev_ts = ts_ms
                prev_dt_ist = dt_ist

        total_observed = len(data_rows)
        valid_count = len(valid_candles)
        invalid_count = total_observed - valid_count

        # Compute exact mathematical quality score without double-counting:
        quality_score = HistoricalDataFramework.calculate_quality_score(
            total_observed_bars=total_observed,
            invalid_bars=invalid_count,
            duplicate_count=duplicate_count,
            session_boundary_breach_count=session_boundary_breach_count,
            intrasession_missing_bars=intrasession_missing_bars
        )
        is_valid_for_research = (quality_score >= 95.0) and (valid_count >= 30)

        report = DataQualityReport(
            total_observed_bars=total_observed,
            valid_bars=valid_count,
            invalid_bars=invalid_count,
            duplicate_count=duplicate_count,
            intrasession_missing_bars=intrasession_missing_bars,
            overnight_gap_count=overnight_gap_count,
            session_boundary_breach_count=session_boundary_breach_count,
            quality_score_pct=quality_score,
            score_formula="max(0.0, 100.0 * (1.0 - (invalid*1.0 - breach*0.5 + missing*0.1) / (total + missing)))",
            anomalies=anomalies,
            is_valid_for_research=is_valid_for_research
        )

        start_iso = valid_candles[0].datetime_ist if valid_candles else "N/A"
        end_iso = valid_candles[-1].datetime_ist if valid_candles else "N/A"

        source_name = f"OFFLINE_CSV_{src_upper}"
        if provenance_evidence and isinstance(provenance_evidence, dict) and provenance_evidence.get("archive_provider"):
            source_name = f"{provenance_evidence['archive_provider']}_{src_upper}"

        provenance = DataProvenance(
            dataset_id=f"CSV-{instrument}-{timeframe}-{file_sha256[:8]}",
            source=source_name,
            provenance_type=src_upper,
            instrument=instrument,
            exchange=exchange,
            timeframe=timeframe,
            adjustment=adjustment,
            start_time_iso=start_iso,
            end_time_iso=end_iso,
            imported_at_iso=datetime.now(timezone.utc).astimezone(IST).isoformat(),
            raw_sha256=file_sha256,
            description=f"Imported CSV dataset: {os.path.basename(file_path)}"
        )

        return CsvIngestionResult(
            provenance=provenance,
            quality_report=report,
            valid_candles=valid_candles,
            raw_file_sha256=file_sha256,
            is_valid_for_research=is_valid_for_research,
            source_file_path=file_path
        )
