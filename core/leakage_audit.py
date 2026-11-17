"""
OmniTradePro Apex V2.0 — Phase 7.4
Advanced Lookahead Bias & Data Leakage Audit Engine

Audits:
1. Rolling indicator temporal causality (future bar access).
2. Feature scaling & normalization leakage (fit on train vs fit on all).
3. Chronological partition leakage (temporal overlap & random k-fold interleaving).
4. Target horizon & label overlap with purging requirements (López de Prado Purging).
5. Cross-validation embargo compliance (post-test buffer against autocorrelation).
6. Model fitting timestamp vs prediction timestamp temporal causality.
"""

from dataclasses import dataclass, field
from typing import List, Dict, Any, Callable, Optional, Tuple, Set
import math

from core.historical_data_framework import CandleRecord


@dataclass
class LeakageAuditResult:
    has_leakage: bool
    leakage_type: Optional[str] = None
    severity: str = "NONE"
    message: str = "Zero lookahead bias or data leakage detected"
    diagnostics: Dict[str, Any] = field(default_factory=dict)


class LeakageAuditor:
    """Rigorous quantitative auditor preventing forward-looking bias and temporal contamination."""

    @staticmethod
    def audit_indicator_causality(
        candles: List[CandleRecord],
        indicator_fn: Callable[[List[CandleRecord]], List[float]],
        eval_indices: Optional[List[int]] = None
    ) -> LeakageAuditResult:
        """
        Verify that indicator calculation at bar k is purely causal:
        indicator_fn(candles[:k])[-1] == indicator_fn(candles)[k-1].
        """
        n = len(candles)
        if n < 5:
            return LeakageAuditResult(has_leakage=False, message="Insufficient bars for causality check")

        full_output = indicator_fn(candles)
        if len(full_output) != n:
            return LeakageAuditResult(
                has_leakage=True,
                leakage_type="OUTPUT_LENGTH_MISMATCH",
                severity="CRITICAL",
                message=f"Indicator output length ({len(full_output)}) does not match candle length ({n})"
            )

        indices_to_test = eval_indices or [n // 4, n // 2, (3 * n) // 4, n]
        for idx in indices_to_test:
            if idx <= 1 or idx > n:
                continue
            prefix = candles[:idx]
            prefix_output = indicator_fn(prefix)

            full_val = full_output[idx - 1]
            prefix_val = prefix_output[-1]

            if math.isnan(full_val) and math.isnan(prefix_val):
                continue

            if abs(full_val - prefix_val) > 1e-6:
                return LeakageAuditResult(
                    has_leakage=True,
                    leakage_type="INDICATOR_LOOKAHEAD_FUTURE_BAR",
                    severity="CRITICAL",
                    message=(
                        f"Lookahead detected at bar {idx-1}: prefix value {prefix_val} "
                        f"!= full series value {full_val}. Indicator relies on future bars."
                    ),
                    diagnostics={"bar_index": idx - 1, "prefix_val": prefix_val, "full_val": full_val}
                )

        return LeakageAuditResult(has_leakage=False)

    @staticmethod
    def audit_scaler_leakage(
        train_features: List[float],
        test_features: List[float],
        scaler_min: float,
        scaler_max: float
    ) -> LeakageAuditResult:
        """
        Audit whether a MinMax feature scaler leaked test distribution into training.
        """
        if not train_features:
            return LeakageAuditResult(has_leakage=False)

        true_train_min = min(train_features)
        true_train_max = max(train_features)

        min_err = abs(scaler_min - true_train_min)
        max_err = abs(scaler_max - true_train_max)

        if min_err > 1e-5 or max_err > 1e-5:
            all_features = train_features + test_features
            all_min = min(all_features)
            all_max = max(all_features)

            is_global = (abs(scaler_min - all_min) <= 1e-5) or (abs(scaler_max - all_max) <= 1e-5)
            if is_global:
                return LeakageAuditResult(
                    has_leakage=True,
                    leakage_type="GLOBAL_FEATURE_SCALER_LEAKAGE",
                    severity="CRITICAL",
                    message="Feature scaler was fitted across training and testing data jointly, leaking test distributions.",
                    diagnostics={
                        "scaler_min": scaler_min, "train_min": true_train_min, "global_min": all_min,
                        "scaler_max": scaler_max, "train_max": true_train_max, "global_max": all_max
                    }
                )
            else:
                return LeakageAuditResult(
                    has_leakage=True,
                    leakage_type="UNVERIFIED_SCALER_PARAMETERS",
                    severity="WARNING",
                    message="Scaler parameters do not strictly match training data bounds.",
                    diagnostics={"scaler_min": scaler_min, "train_min": true_train_min}
                )

        return LeakageAuditResult(has_leakage=False)

    @staticmethod
    def audit_temporal_partitions(
        train_timestamps: List[int],
        val_timestamps: List[int],
        test_timestamps: List[int]
    ) -> LeakageAuditResult:
        """
        Verify strict chronological ordering between partitions:
        max(train) < min(val) and max(val) < min(test).
        """
        if not train_timestamps or not test_timestamps:
            return LeakageAuditResult(has_leakage=False)

        max_train = max(train_timestamps)
        min_test = min(test_timestamps)

        if val_timestamps:
            min_val = min(val_timestamps)
            max_val = max(val_timestamps)

            if max_train >= min_val:
                overlap_count = sum(1 for t in train_timestamps if t >= min_val)
                return LeakageAuditResult(
                    has_leakage=True,
                    leakage_type="TRAIN_VAL_TEMPORAL_OVERLAP",
                    severity="CRITICAL",
                    message=f"Temporal leakage: max train timestamp ({max_train}) >= min val timestamp ({min_val}).",
                    diagnostics={"overlap_bars": overlap_count}
                )

            if max_val >= min_test:
                overlap_count = sum(1 for t in val_timestamps if t >= min_test)
                return LeakageAuditResult(
                    has_leakage=True,
                    leakage_type="VAL_TEST_TEMPORAL_OVERLAP",
                    severity="CRITICAL",
                    message=f"Temporal leakage: max val timestamp ({max_val}) >= min test timestamp ({min_test}).",
                    diagnostics={"overlap_bars": overlap_count}
                )
        else:
            if max_train >= min_test:
                return LeakageAuditResult(
                    has_leakage=True,
                    leakage_type="TRAIN_TEST_TEMPORAL_OVERLAP",
                    severity="CRITICAL",
                    message=f"Temporal leakage: max train timestamp ({max_train}) >= min test timestamp ({min_test})."
                )

        for name, ts_list in (("train", train_timestamps), ("val", val_timestamps), ("test", test_timestamps)):
            for i in range(1, len(ts_list)):
                if ts_list[i] < ts_list[i - 1]:
                    return LeakageAuditResult(
                        has_leakage=True,
                        leakage_type="OUT_OF_ORDER_PARTITION_TIMESTAMPS",
                        severity="CRITICAL",
                        message=f"Partition '{name}' contains unordered timestamps at index {i}."
                    )

        return LeakageAuditResult(has_leakage=False)

    @staticmethod
    def audit_label_overlap_and_purging(
        train_timestamps: List[int],
        test_start_timestamp: int,
        target_horizon_bars: int,
        bar_interval_ms: int = 60000
    ) -> LeakageAuditResult:
        """
        Audit whether training labels with forward-looking horizons span into the test set.
        Under Marcos López de Prado's Purging methodology, any training bar t whose label
        evaluation horizon [t, t + H * interval] reaches test_start_timestamp must be purged.
        """
        if not train_timestamps or target_horizon_bars <= 0:
            return LeakageAuditResult(has_leakage=False)

        horizon_ms = target_horizon_bars * bar_interval_ms
        unpurged_overlapping_bars = []

        for ts in train_timestamps:
            label_end_ts = ts + horizon_ms
            if label_end_ts >= test_start_timestamp:
                unpurged_overlapping_bars.append((ts, label_end_ts))

        if unpurged_overlapping_bars:
            return LeakageAuditResult(
                has_leakage=True,
                leakage_type="LABEL_HORIZON_OVERLAP_UNPURGED",
                severity="CRITICAL",
                message=(
                    f"Label horizon leakage detected: {len(unpurged_overlapping_bars)} training bar(s) "
                    f"have forward labels spanning into the test set (test start: {test_start_timestamp}). "
                    f"Purging is mandatory."
                ),
                diagnostics={
                    "unpurged_count": len(unpurged_overlapping_bars),
                    "first_leakage_ts": unpurged_overlapping_bars[0][0],
                    "target_horizon_bars": target_horizon_bars
                }
            )

        return LeakageAuditResult(has_leakage=False, message="All boundary labels cleanly purged")

    @staticmethod
    def audit_embargo_compliance(
        test_end_timestamp: int,
        subsequent_train_start_timestamp: int,
        embargo_bars: int,
        bar_interval_ms: int = 60000
    ) -> LeakageAuditResult:
        """
        Audit whether cross-validation folds implement an embargo period after test slices
        to eliminate autoregressive correlation leakage.
        """
        if embargo_bars <= 0:
            return LeakageAuditResult(has_leakage=False)

        required_embargo_ms = embargo_bars * bar_interval_ms
        actual_buffer_ms = subsequent_train_start_timestamp - test_end_timestamp

        if actual_buffer_ms < required_embargo_ms:
            missing_bars = int(math.ceil((required_embargo_ms - actual_buffer_ms) / bar_interval_ms))
            return LeakageAuditResult(
                has_leakage=True,
                leakage_type="EMBARGO_BUFFER_VIOLATION",
                severity="WARNING",
                message=(
                    f"Embargo buffer violation: actual buffer ({actual_buffer_ms // 1000}s) is less than "
                    f"required embargo ({required_embargo_ms // 1000}s). Missing {missing_bars} embargo bar(s)."
                ),
                diagnostics={"actual_buffer_ms": actual_buffer_ms, "required_embargo_ms": required_embargo_ms}
            )

        return LeakageAuditResult(has_leakage=False, message="Embargo compliance verified")

    @staticmethod
    def audit_model_fit_timestamp(
        model_fit_timestamp: int,
        prediction_timestamps: List[int]
    ) -> LeakageAuditResult:
        """
        Audit that all model predictions occur strictly at or after the timestamp when
        the model fitting was finalized.
        """
        if not prediction_timestamps:
            return LeakageAuditResult(has_leakage=False)

        retroactive_predictions = [t for t in prediction_timestamps if t < model_fit_timestamp]
        if retroactive_predictions:
            return LeakageAuditResult(
                has_leakage=True,
                leakage_type="RETROACTIVE_MODEL_FIT_LEAKAGE",
                severity="CRITICAL",
                message=(
                    f"Retroactive prediction detected: {len(retroactive_predictions)} prediction(s) "
                    f"occurred before model fit was finalized (model_fit_ts: {model_fit_timestamp}, "
                    f"earliest_pred: {min(retroactive_predictions)})."
                ),
                diagnostics={
                    "model_fit_timestamp": model_fit_timestamp,
                    "earliest_prediction": min(retroactive_predictions),
                    "retroactive_count": len(retroactive_predictions)
                }
            )

        return LeakageAuditResult(has_leakage=False, message="Model fit temporal causality verified")
