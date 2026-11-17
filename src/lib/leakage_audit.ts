/**
 * OmniTradePro Apex V2.0 — Phase 7.4
 * Advanced Lookahead Bias & Data Leakage Audit Engine (TypeScript)
 *
 * Audits:
 * 1. Rolling indicator temporal causality (future bar access).
 * 2. Feature scaling & normalization leakage (fit on train vs fit on all).
 * 3. Chronological partition leakage (temporal overlap & random k-fold interleaving).
 * 4. Target horizon & label overlap with purging requirements (López de Prado Purging).
 * 5. Cross-validation embargo compliance (post-test buffer against autocorrelation).
 * 6. Model fitting timestamp vs prediction timestamp temporal causality.
 */

import type { Candle } from "./indicators";

export interface LeakageAuditResult {
  hasLeakage: boolean;
  leakageType?: string;
  severity: "NONE" | "WARNING" | "CRITICAL";
  message: string;
  diagnostics?: Record<string, unknown>;
}

/** Verify that indicator calculation at bar k is purely causal */
export function auditIndicatorCausality(
  candles: Candle[],
  indicatorFn: (c: Candle[]) => number[],
  evalIndices?: number[],
): LeakageAuditResult {
  const n = candles.length;
  if (n < 5) {
    return { hasLeakage: false, severity: "NONE", message: "Insufficient bars for causality check" };
  }

  const fullOutput = indicatorFn(candles);
  if (fullOutput.length !== n) {
    return {
      hasLeakage: true,
      leakageType: "OUTPUT_LENGTH_MISMATCH",
      severity: "CRITICAL",
      message: `Indicator output length (${fullOutput.length}) does not match candle count (${n})`,
    };
  }

  const indicesToTest = evalIndices ?? [
    Math.floor(n / 4),
    Math.floor(n / 2),
    Math.floor((3 * n) / 4),
    n,
  ];

  for (const idx of indicesToTest) {
    if (idx <= 1 || idx > n) continue;
    const prefix = candles.slice(0, idx);
    const prefixOutput = indicatorFn(prefix);

    const fullVal = fullOutput[idx - 1];
    const prefixVal = prefixOutput[prefixOutput.length - 1];

    if (Number.isNaN(fullVal) && Number.isNaN(prefixVal)) continue;

    if (Math.abs(fullVal - prefixVal) > 1e-6) {
      return {
        hasLeakage: true,
        leakageType: "INDICATOR_LOOKAHEAD_FUTURE_BAR",
        severity: "CRITICAL",
        message: `Lookahead detected at bar ${idx - 1}: prefix value ${prefixVal} != full series value ${fullVal}`,
        diagnostics: { barIndex: idx - 1, prefixVal, fullVal },
      };
    }
  }

  return { hasLeakage: false, severity: "NONE", message: "Zero lookahead bias detected" };
}

/** Audit whether a MinMax feature scaler leaked test distribution into training */
export function auditScalerLeakage(
  trainFeatures: number[],
  testFeatures: number[],
  scalerMin: number,
  scalerMax: number,
): LeakageAuditResult {
  if (trainFeatures.length === 0) {
    return { hasLeakage: false, severity: "NONE", message: "Empty feature set" };
  }

  const trueTrainMin = Math.min(...trainFeatures);
  const trueTrainMax = Math.max(...trainFeatures);

  const minErr = Math.abs(scalerMin - trueTrainMin);
  const maxErr = Math.abs(scalerMax - trueTrainMax);

  if (minErr > 1e-5 || maxErr > 1e-5) {
    const allFeatures = trainFeatures.concat(testFeatures);
    const allMin = Math.min(...allFeatures);
    const allMax = Math.max(...allFeatures);

    const isGlobal = Math.abs(scalerMin - allMin) <= 1e-5 || Math.abs(scalerMax - allMax) <= 1e-5;
    if (isGlobal) {
      return {
        hasLeakage: true,
        leakageType: "GLOBAL_FEATURE_SCALER_LEAKAGE",
        severity: "CRITICAL",
        message:
          "Feature scaler was fitted across training and testing data jointly, leaking test distributions.",
        diagnostics: {
          scalerMin,
          trainMin: trueTrainMin,
          globalMin: allMin,
          scalerMax,
          trainMax: trueTrainMax,
          globalMax: allMax,
        },
      };
    }

    return {
      hasLeakage: true,
      leakageType: "UNVERIFIED_SCALER_PARAMETERS",
      severity: "WARNING",
      message: "Scaler parameters do not strictly match training data bounds.",
      diagnostics: { scalerMin, trainMin: trueTrainMin },
    };
  }

  return { hasLeakage: false, severity: "NONE", message: "Scaler strictly isolated to training data" };
}

/** Verify strict chronological ordering between partitions */
export function auditTemporalPartitions(
  trainTimestamps: number[],
  valTimestamps: number[],
  testTimestamps: number[],
): LeakageAuditResult {
  if (trainTimestamps.length === 0 || testTimestamps.length === 0) {
    return { hasLeakage: false, severity: "NONE", message: "Empty partition" };
  }

  const maxTrain = Math.max(...trainTimestamps);
  const minTest = Math.min(...testTimestamps);

  if (valTimestamps.length > 0) {
    const minVal = Math.min(...valTimestamps);
    const maxVal = Math.max(...valTimestamps);

    if (maxTrain >= minVal) {
      const overlapCount = trainTimestamps.filter((t) => t >= minVal).length;
      return {
        hasLeakage: true,
        leakageType: "TRAIN_VAL_TEMPORAL_OVERLAP",
        severity: "CRITICAL",
        message: `Temporal leakage: max train timestamp (${maxTrain}) >= min val timestamp (${minVal}).`,
        diagnostics: { overlapCount },
      };
    }

    if (maxVal >= minTest) {
      const overlapCount = valTimestamps.filter((t) => t >= minTest).length;
      return {
        hasLeakage: true,
        leakageType: "VAL_TEST_TEMPORAL_OVERLAP",
        severity: "CRITICAL",
        message: `Temporal leakage: max val timestamp (${maxVal}) >= min test timestamp (${minTest}).`,
        diagnostics: { overlapCount },
      };
    }
  } else {
    if (maxTrain >= minTest) {
      return {
        hasLeakage: true,
        leakageType: "TRAIN_TEST_TEMPORAL_OVERLAP",
        severity: "CRITICAL",
        message: `Temporal leakage: max train timestamp (${maxTrain}) >= min test timestamp (${minTest}).`,
      };
    }
  }

  // Check monotonic internal ordering
  for (const [name, arr] of [
    ["train", trainTimestamps],
    ["val", valTimestamps],
    ["test", testTimestamps],
  ] as const) {
    for (let i = 1; i < arr.length; i++) {
      if (arr[i] < arr[i - 1]) {
        return {
          hasLeakage: true,
          leakageType: "OUT_OF_ORDER_PARTITION_TIMESTAMPS",
          severity: "CRITICAL",
          message: `Partition '${name}' contains out-of-order timestamps at index ${i}.`,
        };
      }
    }
  }

  return { hasLeakage: false, severity: "NONE", message: "Strict chronological partitions verified" };
}

/** Audit whether training labels with forward-looking horizons span into test set without purging */
export function auditLabelOverlapAndPurging(
  trainTimestamps: number[],
  testStartTimestamp: number,
  targetHorizonBars: number,
  barIntervalMs = 60000,
): LeakageAuditResult {
  if (trainTimestamps.length === 0 || targetHorizonBars <= 0) {
    return { hasLeakage: false, severity: "NONE", message: "No label horizon to audit" };
  }

  const horizonMs = targetHorizonBars * barIntervalMs;
  const unpurgedBars: Array<[number, number]> = [];

  for (const ts of trainTimestamps) {
    const labelEndTs = ts + horizonMs;
    if (labelEndTs >= testStartTimestamp) {
      unpurgedBars.push([ts, labelEndTs]);
    }
  }

  if (unpurgedBars.length > 0) {
    return {
      hasLeakage: true,
      leakageType: "LABEL_HORIZON_OVERLAP_UNPURGED",
      severity: "CRITICAL",
      message: `Label horizon leakage: ${unpurgedBars.length} training bar(s) span into test set (test start: ${testStartTimestamp}). Purging mandatory.`,
      diagnostics: {
        unpurgedCount: unpurgedBars.length,
        firstLeakageTs: unpurgedBars[0][0],
        targetHorizonBars,
      },
    };
  }

  return { hasLeakage: false, severity: "NONE", message: "All boundary labels cleanly purged" };
}

/** Audit whether cross-validation folds implement an embargo period after test slices */
export function auditEmbargoCompliance(
  testEndTimestamp: number,
  subsequentTrainStartTimestamp: number,
  embargoBars: number,
  barIntervalMs = 60000,
): LeakageAuditResult {
  if (embargoBars <= 0) {
    return { hasLeakage: false, severity: "NONE", message: "No embargo required" };
  }

  const requiredEmbargoMs = embargoBars * barIntervalMs;
  const actualBufferMs = subsequentTrainStartTimestamp - testEndTimestamp;

  if (actualBufferMs < requiredEmbargoMs) {
    const missingBars = Math.ceil((requiredEmbargoMs - actualBufferMs) / barIntervalMs);
    return {
      hasLeakage: true,
      leakageType: "EMBARGO_BUFFER_VIOLATION",
      severity: "WARNING",
      message: `Embargo buffer violation: buffer (${Math.floor(actualBufferMs / 1000)}s) < required (${Math.floor(requiredEmbargoMs / 1000)}s). Missing ${missingBars} bar(s).`,
      diagnostics: { actualBufferMs, requiredEmbargoMs, missingBars },
    };
  }

  return { hasLeakage: false, severity: "NONE", message: "Embargo compliance verified" };
}

/** Audit that all model predictions occur strictly at or after model fit timestamp */
export function auditModelFitTimestamp(
  modelFitTimestamp: number,
  predictionTimestamps: number[],
): LeakageAuditResult {
  if (predictionTimestamps.length === 0) {
    return { hasLeakage: false, severity: "NONE", message: "No predictions to audit" };
  }

  const retroactivePredictions = predictionTimestamps.filter((t) => t < modelFitTimestamp);
  if (retroactivePredictions.length > 0) {
    return {
      hasLeakage: true,
      leakageType: "RETROACTIVE_MODEL_FIT_LEAKAGE",
      severity: "CRITICAL",
      message: `Retroactive prediction detected: ${retroactivePredictions.length} prediction(s) before model fit was finalized.`,
      diagnostics: {
        modelFitTimestamp,
        earliestPrediction: Math.min(...retroactivePredictions),
        retroactiveCount: retroactivePredictions.length,
      },
    };
  }

  return { hasLeakage: false, severity: "NONE", message: "Model fit temporal causality verified" };
}
