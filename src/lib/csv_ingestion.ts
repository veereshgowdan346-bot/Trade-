/**
 * OmniTradePro Apex V2.0 — Phase 7.3
 * Historical CSV Dataset Ingestion & Validation Pipeline (TypeScript)
 *
 * Mode: Strict Offline Research Only
 * - Safely ingests user-provided historical OHLCV CSV files without modification.
 * - Computes deterministic SHA-256 checksums from raw file bytes.
 * - Supports 1m, 5m, 15m, 1h, and 1D timeframes.
 * - Audits session boundaries, holidays, and special sessions via nse_calendar.
 * - Validates duplicate timestamps, missing candles, invalid geometry, and non-positive prices.
 * - Never silently repairs raw data.
 * - Enforces strict provenance labeling (never falsely classifies SAMPLE/SYNTHETIC as GENUINE_HISTORICAL).
 */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type { Candle } from "./indicators";
import {
  DataProvenance,
  DataProvenanceType,
  AdjustmentType,
  DataAnomaly,
  DataQualityReport,
  calculateQualityScore,
} from "./historical_research";
import { isValidTradingTime, getIstComponents } from "./nse_calendar";

export interface CsvIngestOptions {
  instrument: string;
  exchange?: string;
  timeframe?: string;
  sourceClassification?: DataProvenanceType;
  adjustment?: AdjustmentType;
  enforceSessionHours?: boolean;
  maxJumpPct?: number;
  corporateActionSplitThreshold?: number;
  provenanceEvidence?: {
    archiveProvider?: string;
    batchId?: string;
    vendorLicenseId?: string;
    manifestSha256?: string;
    isVerifiedFeed?: boolean;
  };
}

export interface CsvIngestionResult {
  provenance: DataProvenance;
  qualityReport: DataQualityReport;
  validCandles: Candle[];
  rawFileSha256: string;
  isValidForResearch: boolean;
  sourceFilePath: string;
}

const TIMEFRAME_SECONDS: Record<string, number> = {
  "1m": 60,
  "5m": 300,
  "15m": 900,
  "30m": 1800,
  "1h": 3600,
  "60m": 3600,
  "1D": 86400,
  "1d": 86400,
};

/**
 * Parse raw timestamp string into Unix timestamp in milliseconds.
 * Deterministic across environments: naive (timezone-less) wall-clock strings are
 * ALWAYS interpreted as IST (+05:30), matching the Python twin
 * (core/csv_data_ingestion.py: "If naive, assume Indian Standard Time").
 * FIX (APEX-V2 AUDIT TZ-001): the naive form must be matched BEFORE the generic
 * Date.parse fallback — V8 accepts "YYYY-MM-DD HH:MM:SS" as machine-LOCAL time,
 * which silently made ingestion timezone-dependent (e.g. rejected 88% of rows on
 * UTC hosts while appearing correct on IST hosts).
 */
export function parseTimestampStr(rawVal: string): number {
  const s = rawVal.trim();
  // 1. Pure numeric epoch (ms or sec)
  if (/^\d{10,13}$/.test(s)) {
    const val = parseInt(s, 10);
    return val >= 10_000_000_000 ? val : val * 1000;
  }

  // 2. Format 'YYYY-MM-DD HH:MM:SS' (or 'T'-separated) WITHOUT timezone info:
  //    assumed to be IST (+05:30) by contract. Checked before Date.parse.
  const match = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})[ T](\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/);
  if (match) {
    const [_, y, m, d, hh, mm, ss] = match;
    const pad = (n: string | undefined) => (n && n.length === 1 ? `0${n}` : n || "00");
    const isoStr = `${y}-${pad(m)}-${pad(d)}T${pad(hh)}:${pad(mm)}:${pad(ss)}+05:30`;
    const t = Date.parse(isoStr);
    if (!Number.isNaN(t)) return t;
    throw new Error(`Unrecognized timestamp format: '${rawVal}'`);
  }

  // 3. Strings with an explicit timezone (Z / ±hh:mm) or date-only ISO are unambiguous.
  if (/(Z|[+-]\d{2}:?\d{2})$/.test(s) || /^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/.test(s)) {
    const parsedIso = Date.parse(s);
    if (!Number.isNaN(parsedIso)) {
      return parsedIso;
    }
  }

  throw new Error(`Unrecognized timestamp format: '${rawVal}'`);
}

/** Ingest and validate a CSV file from disk */
export function ingestCsvFile(
  filePath: string,
  options: CsvIngestOptions,
): CsvIngestionResult {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Historical CSV file not found: ${filePath}`);
  }

  const sourceClassification = options.sourceClassification ?? "SAMPLE";
  const normPath = path.normalize(filePath).toLowerCase();

  // Task 1 & 3: Provenance Integrity Guard
  // File renaming or moving to arbitrary locations CANNOT bypass verification.
  if (sourceClassification === "GENUINE_HISTORICAL") {
    const isFixturePath = ["fixture", "sample", "synth", "test"].some((k) =>
      normPath.includes(k),
    );
    const ev = options.provenanceEvidence;
    const hasValidEvidence =
      ev &&
      Boolean(ev.archiveProvider) &&
      Boolean(ev.batchId || ev.vendorLicenseId) &&
      Boolean(ev.manifestSha256 && ev.manifestSha256.length === 64) &&
      ev.isVerifiedFeed === true;

    if (isFixturePath || !hasValidEvidence) {
      throw new Error(
        `Provenance Integrity Violation: Assigning 'GENUINE_HISTORICAL' requires authenticated external archive evidence (archiveProvider, batchId, manifestSha256, isVerifiedFeed=true). File renaming or relocation cannot bypass this check. In offline research mode, unverified files must be classified as 'SAMPLE' or 'SYNTHETIC'.`,
      );
    }
  }

  // Read strictly read-only raw bytes and compute deterministic SHA-256
  const rawBuffer = fs.readFileSync(filePath);
  const rawFileSha256 = crypto.createHash("sha256").update(rawBuffer).digest("hex");
  const rawText = rawBuffer.toString("utf-8");

  return ingestCsvContent(rawText, rawFileSha256, filePath, options);
}

/** Ingest and validate raw CSV string */
export function ingestCsvContent(
  rawText: string,
  rawFileSha256: string,
  sourceFilePath: string,
  options: CsvIngestOptions,
): CsvIngestionResult {
  const instrument = options.instrument;
  const exchange = options.exchange ?? "NSE";
  const timeframe = options.timeframe ?? "1m";
  const sourceClassification = options.sourceClassification ?? "SAMPLE";
  const adjustment = options.adjustment ?? "UNADJUSTED_RAW";
  const enforceSessionHours = options.enforceSessionHours ?? true;
  const maxJumpPct = options.maxJumpPct ?? 10.0;
  const corporateActionSplitThreshold = options.corporateActionSplitThreshold ?? 25.0;

  const lines = rawText.split(/\r?\n/).filter((l) => l.trim().length > 0);

  if (lines.length === 0) {
    const emptyReport: DataQualityReport = {
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
          message: "CSV file contains zero records",
          rawValues: {},
        },
      ],
      isValidForResearch: false,
      sha256Checksum: rawFileSha256,
    };

    const emptyProvenance: DataProvenance = {
      datasetId: `CSV-${instrument}-${timeframe}-${rawFileSha256.slice(0, 8)}`,
      source: `OFFLINE_CSV_${sourceClassification}`,
      provenanceType: sourceClassification,
      instrument,
      exchange,
      timeframe,
      adjustment,
      startTimeIso: "N/A",
      endTimeIso: "N/A",
      importedAtIso: new Date().toISOString(),
      rawSha256: rawFileSha256,
      description: `Empty CSV file: ${path.basename(sourceFilePath)}`,
    };

    return {
      provenance: emptyProvenance,
      qualityReport: emptyReport,
      validCandles: [],
      rawFileSha256,
      isValidForResearch: false,
      sourceFilePath,
    };
  }

  // Parse header
  const headerCols = lines[0].split(",").map((c) => c.trim().toLowerCase());
  const colMap: Record<string, number> = {};

  for (let idx = 0; idx < headerCols.length; idx++) {
    const col = headerCols[idx];
    if (["timestamp", "datetime", "date_time", "time", "date", "ts"].includes(col)) {
      colMap["t"] = idx;
    } else if (["open", "o", "open_price"].includes(col)) {
      colMap["o"] = idx;
    } else if (["high", "h", "high_price"].includes(col)) {
      colMap["h"] = idx;
    } else if (["low", "l", "low_price"].includes(col)) {
      colMap["l"] = idx;
    } else if (["close", "c", "close_price"].includes(col)) {
      colMap["c"] = idx;
    } else if (["volume", "v", "vol", "traded_qty"].includes(col)) {
      colMap["v"] = idx;
    }
  }

  for (const req of ["t", "o", "h", "l", "c"]) {
    if (colMap[req] === undefined) {
      throw new Error(`Malformed CSV: Missing mandatory column '${req}'. Found: ${headerCols.join(", ")}`);
    }
  }

  const expectedIntervalSec = TIMEFRAME_SECONDS[timeframe] ?? 60;
  const intervalMs = expectedIntervalSec * 1000;

  const seenTimestamps = new Set<number>();
  let prevTs = -1;
  let prevClose = -1;
  let prevDateStr: string | null = null;
  let prevTotalMinutes = -1;

  let duplicateCount = 0;
  let intrasessionMissingBars = 0;
  let overnightGapCount = 0;
  let sessionBoundaryBreachCount = 0;

  const anomalies: DataAnomaly[] = [];
  const validCandles: Candle[] = [];

  for (let rIdx = 1; rIdx < lines.length; rIdx++) {
    const line = lines[rIdx].trim();
    if (!line) continue;

    const parts = line.split(",").map((p) => p.trim());
    let isBarValid = true;
    const rawValues: Record<string, unknown> = { rowIndex: rIdx + 1, rawLine: line };

    // 1. Parse timestamp
    let tsMs = 0;
    try {
      tsMs = parseTimestampStr(parts[colMap["t"]]);
      rawValues["parsedTs"] = tsMs;
    } catch (e: any) {
      anomalies.push({
        index: rIdx - 1,
        timestamp: 0,
        anomalyType: "EMPTY_DATASET",
        severity: "CRITICAL",
        message: `Failed to parse timestamp at row ${rIdx + 1}: ${e?.message}`,
        rawValues,
      });
      continue;
    }

    // 2. Parse numeric OHLCV
    const o = parseFloat(parts[colMap["o"]]);
    const h = parseFloat(parts[colMap["h"]]);
    const l = parseFloat(parts[colMap["l"]]);
    const c = parseFloat(parts[colMap["c"]]);
    const v = colMap["v"] !== undefined ? parseFloat(parts[colMap["v"]]) : 0;
    rawValues["o"] = o;
    rawValues["h"] = h;
    rawValues["l"] = l;
    rawValues["c"] = c;
    rawValues["v"] = v;

    if (Number.isNaN(o) || Number.isNaN(h) || Number.isNaN(l) || Number.isNaN(c)) {
      anomalies.push({
        index: rIdx - 1,
        timestamp: tsMs,
        anomalyType: "NEGATIVE_OR_ZERO_PRICE",
        severity: "CRITICAL",
        message: `Non-numeric price in row ${rIdx + 1}`,
        rawValues,
      });
      continue;
    }

    // Check 1: Non-positive price
    if (o <= 0 || h <= 0 || l <= 0 || c <= 0) {
      anomalies.push({
        index: rIdx - 1,
        timestamp: tsMs,
        anomalyType: "NEGATIVE_OR_ZERO_PRICE",
        severity: "CRITICAL",
        message: `Non-positive price: O=${o}, H=${h}, L=${l}, C=${c}`,
        rawValues,
      });
      isBarValid = false;
    }

    // Check 2: Negative or non-finite volume
    if (v < 0 || Number.isNaN(v) || !Number.isFinite(v)) {
      anomalies.push({
        index: rIdx - 1,
        timestamp: tsMs,
        anomalyType: "NEGATIVE_OR_NAN_VOLUME",
        severity: "CRITICAL",
        message: `Negative or non-finite volume: V=${v}`,
        rawValues,
      });
      isBarValid = false;
    }

    // Check 3: Mathematical OHLC Geometry
    const maxBody = Math.max(o, c);
    const minBody = Math.min(o, c);
    if (h < maxBody - 1e-4 || l > minBody + 1e-4) {
      anomalies.push({
        index: rIdx - 1,
        timestamp: tsMs,
        anomalyType: "INVALID_OHLC_GEOMETRY",
        severity: "CRITICAL",
        message: `Corrupted OHLC geometry: H=${h} < max(O,C)=${maxBody} or L=${l} > min(O,C)=${minBody}`,
        rawValues,
      });
      isBarValid = false;
    }

    // Check 4: Duplicate Timestamp
    if (seenTimestamps.has(tsMs)) {
      duplicateCount++;
      anomalies.push({
        index: rIdx - 1,
        timestamp: tsMs,
        anomalyType: "DUPLICATE_TIMESTAMP",
        severity: "CRITICAL",
        message: `Duplicate timestamp: ${tsMs}`,
        rawValues,
      });
      isBarValid = false;
    } else {
      seenTimestamps.add(tsMs);
    }

    // Check 5: Monotonic sequence
    if (prevTs > 0 && tsMs < prevTs) {
      anomalies.push({
        index: rIdx - 1,
        timestamp: tsMs,
        anomalyType: "OUT_OF_ORDER_TIMESTAMP",
        severity: "CRITICAL",
        message: `Temporal inversion: current ${tsMs} < prev ${prevTs}`,
        rawValues,
      });
      isBarValid = false;
    }

    // Check 6: Session Boundary & NSE Calendar
    const ist = getIstComponents(tsMs);
    if (enforceSessionHours && timeframe !== "1D") {
      const validTime = isValidTradingTime(tsMs, exchange);
      if (!validTime) {
        sessionBoundaryBreachCount++;
        anomalies.push({
          index: rIdx - 1,
          timestamp: tsMs,
          anomalyType: "SESSION_BOUNDARY_BREACH",
          severity: "WARNING",
          message: `Out of valid NSE session hours or holiday: ${ist.dateStr} ${ist.hours}:${ist.minutes}`,
          rawValues,
        });
        isBarValid = false;
      }
    }

    // Check 7: Gap Analysis
    if (prevTs > 0 && tsMs > prevTs && timeframe !== "1D") {
      const deltaMs = tsMs - prevTs;
      if (deltaMs > intervalMs * 1.5) {
        let isOvernight = false;
        if (prevDateStr !== null) {
          isOvernight =
            prevDateStr !== ist.dateStr ||
            (prevTotalMinutes >= (15 * 60 + 29) && ist.totalMinutes <= (9 * 60 + 16));
        }
        if (isOvernight) {
          overnightGapCount++;
          anomalies.push({
            index: rIdx - 1,
            timestamp: tsMs,
            anomalyType: "OVERNIGHT_GAP",
            severity: "ADVISORY",
            message: `Overnight closure gap (${Math.round(deltaMs / 3600000)}h)`,
            rawValues,
          });
        } else {
          const missingBars = Math.round(deltaMs / intervalMs) - 1;
          intrasessionMissingBars += missingBars;
          anomalies.push({
            index: rIdx - 1,
            timestamp: tsMs,
            anomalyType: "INTRASESSION_MISSING_CANDLE",
            severity: "WARNING",
            message: `Missing ${missingBars} intraday bar(s)`,
            rawValues,
          });
        }
      }
    }

    // Check 8: Corporate Actions & Flash Drops
    if (prevClose > 0 && isBarValid) {
      const priceChangePct = ((o - prevClose) / prevClose) * 100;
      if (priceChangePct < -corporateActionSplitThreshold) {
        anomalies.push({
          index: rIdx - 1,
          timestamp: tsMs,
          anomalyType: "POTENTIAL_UNADJUSTED_CORPORATE_ACTION",
          severity: "WARNING",
          message: `Severe price drop of ${priceChangePct.toFixed(2)}% indicates possible unadjusted split/bonus`,
          rawValues,
        });
      } else if (Math.abs(priceChangePct) > maxJumpPct) {
        anomalies.push({
          index: rIdx - 1,
          timestamp: tsMs,
          anomalyType: "SUSPICIOUS_PRICE_JUMP",
          severity: "ADVISORY",
          message: `Price jump of ${priceChangePct.toFixed(2)}% exceeds threshold ${maxJumpPct}%`,
          rawValues,
        });
      }
    }

    if (isBarValid) {
      // Invariant: Preserves raw values without mutation
      validCandles.push({ t: tsMs, o, h, l, c, v });
      prevClose = c;
      prevTs = tsMs;
      prevDateStr = ist.dateStr;
      prevTotalMinutes = ist.totalMinutes;
    }
  }

  const totalObserved = lines.length - 1;
  const validCount = validCandles.length;
  const invalidCount = totalObserved - validCount;

  // Exact Mathematical Quality Score without double-counting
  const qualityScorePct = calculateQualityScore(
    totalObserved,
    invalidCount,
    duplicateCount,
    sessionBoundaryBreachCount,
    intrasessionMissingBars,
  );

  const isValidForResearch = qualityScorePct >= 95.0 && validCount >= 30;

  const startIso = validCandles.length > 0 ? new Date(validCandles[0].t).toISOString() : "N/A";
  const endIso =
    validCandles.length > 0 ? new Date(validCandles[validCandles.length - 1].t).toISOString() : "N/A";

  const qualityReport: DataQualityReport = {
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
    sha256Checksum: rawFileSha256,
  };

  const sourceName =
    options.provenanceEvidence && options.provenanceEvidence.archiveProvider
      ? `${options.provenanceEvidence.archiveProvider}_${sourceClassification}`
      : `OFFLINE_CSV_${sourceClassification}`;

  const provenance: DataProvenance = {
    datasetId: `CSV-${instrument}-${timeframe}-${rawFileSha256.slice(0, 8)}`,
    source: sourceName,
    provenanceType: sourceClassification,
    instrument,
    exchange,
    timeframe,
    adjustment,
    startTimeIso: startIso,
    endTimeIso: endIso,
    importedAtIso: new Date().toISOString(),
    rawSha256: rawFileSha256,
    description: `Imported CSV dataset: ${path.basename(sourceFilePath)}`,
  };

  return {
    provenance,
    qualityReport,
    validCandles,
    rawFileSha256,
    isValidForResearch,
    sourceFilePath,
  };
}
