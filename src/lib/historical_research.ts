/**
 * OmniTradePro Apex V2.0 — Phase 7.2
 * Historical Market Data Quality & Offline Research Framework (TypeScript)
 *
 * Provides:
 * 1. Timestamped OHLCV validation with raw preservation (zero silent mutations).
 * 2. Timezone verification (Asia/Kolkata +05:30) and market session boundary guards (NSE 09:15 - 15:30).
 * 3. Intrasession missing candle detection vs expected overnight/weekend gaps.
 * 4. Provenance tracking with deterministic SHA-256 integrity checksums.
 * 5. Strict chronological dataset splitting (train/validation/test) preventing lookahead bias.
 * 6. Explicit classification: SYNTHETIC, SAMPLE, and GENUINE_HISTORICAL datasets.
 */

import crypto from "node:crypto";
import type { Candle } from "./indicators";
import { evaluateCandleSession, type CandleTimestampConvention, type SecurityCategory, type CalendarRegime } from "./nse_calendar";

export type DataProvenanceType = "SYNTHETIC" | "SAMPLE" | "GENUINE_HISTORICAL";
export type AdjustmentType = "UNADJUSTED_RAW" | "SPLIT_ADJUSTED" | "SPLIT_AND_DIVIDEND_ADJUSTED";

export interface DataProvenance {
  datasetId: string;
  source: string;
  provenanceType: DataProvenanceType;
  instrument: string;
  exchange: string;
  timeframe: string;
  adjustment: AdjustmentType;
  startTimeIso: string;
  endTimeIso: string;
  importedAtIso: string;
  rawSha256: string;
  description: string;
}

export interface DataAnomaly {
  index: number;
  timestamp: number;
  anomalyType:
    | "NEGATIVE_OR_ZERO_PRICE"
    | "NEGATIVE_OR_NAN_VOLUME"
    | "INVALID_OHLC_GEOMETRY"
    | "DUPLICATE_TIMESTAMP"
    | "OUT_OF_ORDER_TIMESTAMP"
    | "SESSION_BOUNDARY_BREACH"
    | "INTRASESSION_MISSING_CANDLE"
    | "OVERNIGHT_GAP"
    | "SUSPICIOUS_PRICE_JUMP"
    | "POTENTIAL_UNADJUSTED_CORPORATE_ACTION"
    | "EMPTY_DATASET";
  severity: "CRITICAL" | "WARNING" | "ADVISORY";
  message: string;
  rawValues: Record<string, unknown>;
}

export interface DataQualityReport {
  totalObservedBars: number;
  validBars: number;
  invalidBars: number;
  duplicateCount: number;
  intrasessionMissingBars: number;
  overnightGapCount: number;
  sessionBoundaryBreachCount: number;
  qualityScorePct: number;
  scoreFormula: string;
  anomalies: DataAnomaly[];
  isValidForResearch: boolean;
  sha256Checksum: string;
}

export interface ChronologicalSplits {
  trainBars: Candle[];
  valBars: Candle[];
  testBars: Candle[];
  trainRange: [string, string];
  valRange: [string, string];
  testRange: [string, string];
  hasLeakage: boolean;
}

/** Compute deterministic SHA-256 for string or buffer payload */
export function computeDatasetSha256(payload: string | Buffer): string {
  return crypto.createHash("sha256").update(payload).digest("hex");
}

/** Convert timestamp in ms to localized IST Date */
export function toIstDate(timestampMs: number): {
  hours: number;
  minutes: number;
  dayOfWeek: number; // 0 = Sun, 1 = Mon ... 6 = Sat
  isoIst: string;
} {
  // IST offset is UTC + 5h 30m = 330 mins
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const d = new Date(timestampMs + istOffsetMs);
  return {
    hours: d.getUTCHours(),
    minutes: d.getUTCMinutes(),
    dayOfWeek: d.getUTCDay(),
    isoIst: d.toISOString().replace("Z", "+05:30"),
  };
}

/** Check if timestamp falls within regular NSE hours: 09:15 to 15:30 IST on Mon-Fri */
export function isRegularNseSession(timestampMs: number): boolean {
  const ist = toIstDate(timestampMs);
  // Exclude Saturday (6) and Sunday (0)
  if (ist.dayOfWeek === 0 || ist.dayOfWeek === 6) return false;
  const timeInMinutes = ist.hours * 60 + ist.minutes;
  // 09:15 = 9*60 + 15 = 555; 15:30 = 15*60 + 30 = 930
  return timeInMinutes >= 555 && timeInMinutes <= 930;
}

/**
 * Check if an OHLC candle bar is valid within continuous trading hours,
 * taking into account the candle duration, timestamp convention, and calendar regime.
 */
export function isValidCandleSession(
  timestampMs: number,
  timeframeSec = 60,
  convention: CandleTimestampConvention = "START_OF_INTERVAL",
  securityCategory: SecurityCategory | string = "NON_CAS",
  calendarRegime?: CalendarRegime | string
): boolean {
  const evalRes = evaluateCandleSession(timestampMs, timeframeSec, convention, securityCategory, "NSE", calendarRegime);
  return evalRes.isContinuousTrading;
}

/**
 * Exact mathematical data quality score formula without double-counting.
 * - Invalid bars carry 1.0 penalty.
 * - Session boundary breaches carry 0.5 penalty (0.5 discount from 1.0 invalid penalty).
 * - Intrasession missing bars carry 0.1 penalty.
 * - Duplicates are already part of invalid_bars and carry 0 additional penalty.
 * - Denominator is total_observed + missing_bars.
 */
export function calculateQualityScore(
  totalObservedBars: number,
  invalidBars: number,
  _duplicateCount = 0,
  sessionBoundaryBreachCount = 0,
  intrasessionMissingBars = 0,
): number {
  if (totalObservedBars <= 0) return 0.0;
  const penaltyUnits =
    invalidBars * 1.0 -
    sessionBoundaryBreachCount * 0.5 +
    intrasessionMissingBars * 0.1;
  const baseDenominator = Math.max(1, totalObservedBars + intrasessionMissingBars);
  const rawScore = Math.max(0, 100 * (1 - penaltyUnits / baseDenominator));
  return Math.round(rawScore * 100) / 100;
}

/**
 * Validate and audit historical candles with strict raw preservation.
 * Zero silent mutation of input data.
 */
export function auditHistoricalCandles(
  rawCandles: Candle[],
  options: {
    expectedIntervalSec?: number;
    maxJumpPct?: number;
    enforceSessionHours?: boolean;
  } = {},
): {
  validCandles: Candle[];
  report: DataQualityReport;
} {
  const expectedIntervalSec = options.expectedIntervalSec ?? 60;
  const intervalMs = expectedIntervalSec * 1000;
  const maxJumpPct = options.maxJumpPct ?? 10.0;
  const enforceSession = options.enforceSessionHours ?? true;

  const serialized = JSON.stringify(rawCandles);
  const sha256Checksum = computeDatasetSha256(serialized);

  if (!rawCandles || rawCandles.length === 0) {
    return {
      validCandles: [],
      report: {
        totalObservedBars: 0,
        validBars: 0,
        invalidBars: 0,
        duplicateCount: 0,
        intrasessionMissingBars: 0,
        overnightGapCount: 0,
        sessionBoundaryBreachCount: 0,
        qualityScorePct: 0.0,
        scoreFormula: "max(0, 100 * (1 - (invalid*1.0 + dup*1.0 + breach*0.5 + missing*0.1) / (total + missing)))",
        anomalies: [
          {
            index: -1,
            timestamp: 0,
            anomalyType: "EMPTY_DATASET",
            severity: "CRITICAL",
            message: "Dataset is empty",
            rawValues: {},
          },
        ],
        isValidForResearch: false,
        sha256Checksum,
      },
    };
  }

  const seenTimestamps = new Set<number>();
  let prevTs = -1;
  let prevClose = -1;
  let prevIstHours = -1;

  let duplicateCount = 0;
  let intrasessionMissingBars = 0;
  let overnightGapCount = 0;
  let sessionBoundaryBreachCount = 0;

  const anomalies: DataAnomaly[] = [];
  const validCandles: Candle[] = [];

  for (let i = 0; i < rawCandles.length; i++) {
    const c = rawCandles[i];
    let isBarValid = true;
    const rawValues = { index: i, t: c.t, o: c.o, h: c.h, l: c.l, c: c.c, v: c.v };

    // 1. Negative or Zero Price Guard
    if (c.o <= 0 || c.h <= 0 || c.l <= 0 || c.c <= 0) {
      anomalies.push({
        index: i,
        timestamp: c.t,
        anomalyType: "NEGATIVE_OR_ZERO_PRICE",
        severity: "CRITICAL",
        message: `Non-positive price: O=${c.o}, H=${c.h}, L=${c.l}, C=${c.c}`,
        rawValues,
      });
      isBarValid = false;
    }

    // 2. Negative Volume Guard
    if (c.v < 0 || Number.isNaN(c.v)) {
      anomalies.push({
        index: i,
        timestamp: c.t,
        anomalyType: "NEGATIVE_OR_NAN_VOLUME",
        severity: "CRITICAL",
        message: `Negative or NaN volume: V=${c.v}`,
        rawValues,
      });
      isBarValid = false;
    }

    // 3. Mathematical OHLC Geometry: High must be >= max(O, C), Low must be <= min(O, C)
    const expectedHigh = Math.max(c.o, c.c);
    const expectedLow = Math.min(c.o, c.c);
    if (c.h < expectedHigh - 1e-4 || c.l > expectedLow + 1e-4) {
      anomalies.push({
        index: i,
        timestamp: c.t,
        anomalyType: "INVALID_OHLC_GEOMETRY",
        severity: "CRITICAL",
        message: `Corrupted geometry: H=${c.h} < max(O,C)=${expectedHigh} or L=${c.l} > min(O,C)=${expectedLow}`,
        rawValues,
      });
      isBarValid = false;
    }

    // 4. Duplicate Timestamp Guard
    if (seenTimestamps.has(c.t)) {
      duplicateCount++;
      anomalies.push({
        index: i,
        timestamp: c.t,
        anomalyType: "DUPLICATE_TIMESTAMP",
        severity: "CRITICAL",
        message: `Duplicate timestamp: ${c.t}`,
        rawValues,
      });
      isBarValid = false;
    } else {
      seenTimestamps.add(c.t);
    }

    // 5. Monotonic Sequence Guard
    if (prevTs > 0 && c.t < prevTs) {
      anomalies.push({
        index: i,
        timestamp: c.t,
        anomalyType: "OUT_OF_ORDER_TIMESTAMP",
        severity: "CRITICAL",
        message: `Temporal inversion: current ${c.t} < prev ${prevTs}`,
        rawValues,
      });
      isBarValid = false;
    }

    // 6. Market Session Boundary Guard (09:15 - 15:30 IST)
    const ist = toIstDate(c.t);
    if (enforceSession && !isRegularNseSession(c.t)) {
      sessionBoundaryBreachCount++;
      anomalies.push({
        index: i,
        timestamp: c.t,
        anomalyType: "SESSION_BOUNDARY_BREACH",
        severity: "WARNING",
        message: `Out of regular NSE session hours: ${ist.isoIst}`,
        rawValues,
      });
      isBarValid = false;
    }

    // 7. Gap Analysis: Distinguish Overnight Gap from Intrasession Dropout
    if (prevTs > 0 && c.t > prevTs) {
      const deltaMs = c.t - prevTs;
      if (deltaMs > intervalMs * 1.5) {
        const isOvernight = prevIstHours >= 15 || ist.hours <= 9 || deltaMs > 14 * 60 * 60 * 1000;
        if (isOvernight) {
          overnightGapCount++;
          anomalies.push({
            index: i,
            timestamp: c.t,
            anomalyType: "OVERNIGHT_GAP",
            severity: "ADVISORY",
            message: `Overnight closure gap (${Math.round(deltaMs / (60 * 60 * 1000))}h)`,
            rawValues,
          });
        } else {
          const missingBars = Math.round(deltaMs / intervalMs) - 1;
          intrasessionMissingBars += missingBars;
          anomalies.push({
            index: i,
            timestamp: c.t,
            anomalyType: "INTRASESSION_MISSING_CANDLE",
            severity: "WARNING",
            message: `Missing ${missingBars} intraday bar(s)`,
            rawValues,
          });
        }
      }
    }

    // 8. Flash Jump / Circuit Limit Guard
    if (prevClose > 0 && isBarValid) {
      const jumpPct = (Math.abs(c.o - prevClose) / prevClose) * 100;
      if (jumpPct > maxJumpPct) {
        anomalies.push({
          index: i,
          timestamp: c.t,
          anomalyType: "SUSPICIOUS_PRICE_JUMP",
          severity: "ADVISORY",
          message: `Suspicious jump: ${jumpPct.toFixed(2)}% > threshold ${maxJumpPct}%`,
          rawValues,
        });
      }
    }

    if (isBarValid) {
      // Preserve raw precision without mutating values
      validCandles.push({
        t: c.t,
        o: c.o,
        h: c.h,
        l: c.l,
        c: c.c,
        v: c.v,
      });
      prevClose = c.c;
      prevTs = c.t;
      prevIstHours = ist.hours;
    }
  }

  const totalObserved = rawCandles.length;
  const validCount = validCandles.length;
  const invalidCount = totalObserved - validCount;

  // Exact Mathematical Formula without double-counting:
  const qualityScorePct = calculateQualityScore(
    totalObserved,
    invalidCount,
    duplicateCount,
    sessionBoundaryBreachCount,
    intrasessionMissingBars,
  );

  const isValidForResearch = qualityScorePct >= 95.0 && validCount >= 30;

  return {
    validCandles,
    report: {
      totalObservedBars: totalObserved,
      validBars: validCount,
      invalidBars: invalidCount,
      duplicateCount,
      intrasessionMissingBars,
      overnightGapCount,
      sessionBoundaryBreachCount,
      qualityScorePct,
      scoreFormula: "max(0, 100 * (1 - (invalid*1.0 - breach*0.5 + missing*0.1) / (total + missing)))",
      anomalies,
      isValidForResearch,
      sha256Checksum,
    },
  };
}

/**
 * Chronological partitioning into Train, Validation, and Test sets.
 * Guarantees zero lookahead bias and temporal leakage.
 */
export function chronologicalSplit(
  candles: Candle[],
  trainRatio = 0.6,
  valRatio = 0.2,
  _testRatio = 0.2,
): ChronologicalSplits {
  const n = candles.length;
  if (n < 3) throw new Error(`Insufficient candles (${n}) for chronological 3-way split`);

  const trainEnd = Math.max(1, Math.min(Math.floor(n * trainRatio), n - 2));
  const valEnd = Math.max(trainEnd + 1, Math.min(Math.floor(n * (trainRatio + valRatio)), n - 1));

  const trainBars = candles.slice(0, trainEnd);
  const valBars = candles.slice(trainEnd, valEnd);
  const testBars = candles.slice(valEnd);

  const hasLeakage =
    trainBars[trainBars.length - 1].t >= valBars[0].t ||
    valBars[valBars.length - 1].t >= testBars[0].t;

  const fmt = (arr: Candle[]): [string, string] => [
    new Date(arr[0].t).toISOString(),
    new Date(arr[arr.length - 1].t).toISOString(),
  ];

  return {
    trainBars,
    valBars,
    testBars,
    trainRange: fmt(trainBars),
    valRange: fmt(valBars),
    testRange: fmt(testBars),
    hasLeakage,
  };
}
