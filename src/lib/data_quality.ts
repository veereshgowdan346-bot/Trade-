/**
 * DATA-001 — Dataset provenance, checksums and quality certification.
 *
 * The repository already had `validateAndSanitizeCandles` (OHLC integrity, duplicates, order,
 * spikes, gaps). What was missing for reproducible research:
 *
 *   - a DECLARED-KIND contract so synthetic data can never be presented as real market data;
 *   - provenance metadata (source, retrieval date, timezone, adjustments, limitations);
 *   - stable dataset checksums for versioning;
 *   - staleness, zero-volume, session-boundary and holiday validation;
 *   - a single quality grade with explicit blocking rules.
 *
 * Everything here is offline and read-only. No network, no broker, no execution.
 */

import type { Candle } from "./indicators";
import { validateAndSanitizeCandles, type DataAnomaly, type DataQualityReport } from "./data_sanitizer";
import { getIstComponents, isExchangeHoliday, getHolidaysForYear } from "./nse_calendar";

/** What the data actually IS. Synthetic must never be labelled REAL. */
export type DatasetKind = "REAL" | "SYNTHETIC" | "INCOMPLETE" | "UNVERIFIED";

export type DatasetProvenance = {
  id: string;
  /** declared truth about the data */
  kind: DatasetKind;
  /** instrument or synthetic-series identifier */
  instrument: string;
  /** "1m" | "5m" | "1d" ... */
  timeframe: string;
  /** where it came from, verbatim (e.g. "synthetic GBM seed=42, scripts/generate_synthetic_fixtures.js") */
  source: string;
  /** ISO date the data was fetched (REAL) or generated (SYNTHETIC) */
  retrievedOrGeneratedAt: string;
  /** IANA zone the timestamps are interpreted in */
  timezone: string;
  /** corporate-action adjustments applied, if any */
  adjustments: string;
  /** known limitations, stated up front rather than discovered later */
  limitations: string[];
};

export type DatasetChecksum = { algorithm: "SHA-256" | "FNV1A-64"; value: string; rows: number };

export type ExtendedAnomalyType =
  | DataAnomaly["type"]
  | "STALE_REPEAT"
  | "OUTSIDE_SESSION"
  | "EXCHANGE_HOLIDAY"
  | "ZERO_VOLUME"
  | "INSUFFICIENT_HISTORY";

export type ExtendedAnomaly = {
  index: number;
  timestamp: number | null;
  type: ExtendedAnomalyType;
  message: string;
};

export type DatasetAudit = {
  provenance: DatasetProvenance;
  checksum: DatasetChecksum;
  rows: number;
  validRows: number;
  invalidRows: number;
  dateRange: { startMs: number | null; endMs: number | null; startIst: string | null; endIst: string | null };
  sessions: number;
  qualityScorePct: number;
  grade: "A" | "B" | "C" | "D" | "F";
  stats: {
    missingCandlePct: number;
    sessionsIncomplete: number;
    zeroVolumePct: number;
    staleRepeatPct: number;
    outsideSessionBars: number;
    holidayBars: number;
    duplicateBars: number;
    unorderedBars: number;
    invalidOhlcBars: number;
  };
  anomalies: ExtendedAnomaly[];
  /** may this dataset be used for research conclusions? */
  researchUsable: boolean;
  /** checks that were deliberately relaxed, with the reason — never silent */
  relaxations: string[];
  /**
   * Holiday validation only covers years the calendar knows about. For any other year the audit
   * reports UNCHECKED rather than implying "no holiday bars were found".
   */
  holidayCoverage: { checkedYears: number[]; uncheckedYears: number[]; status: "CHECKED" | "PARTIAL" | "UNCHECKED" };
  /** may this dataset be used for a profitability claim? */
  profitClaimAllowed: boolean;
  blockers: string[];
  baseSanitizerReport: DataQualityReport;
};

const SESSION_START_MIN = 9 * 60 + 15; // 09:15 IST
const SESSION_END_MIN = 15 * 60 + 30; // 15:30 IST
export const MIN_BARS_FOR_RESEARCH = 200;

/* ------------------------------- checksums ------------------------------- */

function fnv1a64(input: string): string {
  // Deterministic, dependency-free fallback. Non-cryptographic: adequate for versioning,
  // NOT for security. SHA-256 is used when WebCrypto is available.
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < input.length; i++) {
    const c = input.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193) >>> 0;
    h2 = (h2 + c * 31) >>> 0;
    h2 = Math.imul(h2, 0x85ebca6b) >>> 0;
  }
  return (h1 >>> 0).toString(16).padStart(8, "0") + (h2 >>> 0).toString(16).padStart(8, "0");
}

/** Canonical row serialisation — stable across runs, independent of key order. */
function canonicalise(candles: Candle[]): string {
  let out = "";
  for (const c of candles) out += `${c.t},${c.o},${c.h},${c.l},${c.c},${c.v}\n`;
  return out;
}

export async function fingerprintCandles(candles: Candle[]): Promise<DatasetChecksum> {
  const payload = canonicalise(candles);
  const subtle = (globalThis as unknown as { crypto?: { subtle?: CryptoSubtleLike } }).crypto?.subtle;
  if (subtle) {
    const bytes = new TextEncoder().encode(payload);
    const digest = await subtle.digest("SHA-256", bytes);
    const hex = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return { algorithm: "SHA-256", value: hex, rows: candles.length };
  }
  return { algorithm: "FNV1A-64", value: fnv1a64(payload), rows: candles.length };
}

type CryptoSubtleLike = { digest: (alg: string, data: Uint8Array) => Promise<ArrayBuffer> };

/* --------------------------- kind contract ------------------------------- */

/**
 * DATA-001 guard: refuse to treat synthetic data as real market data, and refuse to let a
 * dataset with no provenance be used for a profitability claim.
 */
export function assertProvenanceConsistent(p: DatasetProvenance): void {
  const missing: string[] = [];
  if (!p.id) missing.push("id");
  if (!p.instrument) missing.push("instrument");
  if (!p.timeframe) missing.push("timeframe");
  if (!p.source) missing.push("source");
  if (!p.retrievedOrGeneratedAt) missing.push("retrievedOrGeneratedAt");
  if (!p.timezone) missing.push("timezone");
  if (missing.length) throw new Error(`Dataset provenance incomplete (${p.id || "unnamed"}): missing ${missing.join(", ")}`);

  const src = p.source.toLowerCase();
  const looksSynthetic = /synthetic|generated|simulated|fixture|gbm|seed=/.test(src);

  if (p.kind === "REAL" && looksSynthetic) {
    throw new Error(`Dataset ${p.id} declares kind=REAL but its source reads as synthetic: "${p.source}"`);
  }
  if (p.kind === "REAL" && p.adjustments === "") {
    throw new Error(`Dataset ${p.id} declares kind=REAL but does not state whether adjustments were applied`);
  }
  if (p.kind !== "REAL" && /real market|nse official|exchange data/i.test(p.source) && !looksSynthetic) {
    throw new Error(`Dataset ${p.id} declares kind=${p.kind} yet claims an official real source`);
  }
}

/* ------------------------------ the audit -------------------------------- */

export async function auditDataset(
  candles: Candle[],
  provenance: DatasetProvenance,
  opts: {
    expectedIntervalMs?: number;
    maxSpikePct?: number;
    minBarsForResearch?: number;
    /** index series publish no volume; their zero volume is genuine, not missing */
    allowZeroVolume?: boolean;
    /** muhurat / special sessions run outside the standard window by design */
    allowSpecialSessions?: boolean;
    /** time-series research needs SESSIONS, not just rows; 0 disables the check */
    minSessionsForResearch?: number;
  } = {},
): Promise<DatasetAudit> {
  assertProvenanceConsistent(provenance);

  const intervalMs = opts.expectedIntervalMs ?? 60_000;
  const minBars = opts.minBarsForResearch ?? MIN_BARS_FOR_RESEARCH;
  const { report } = validateAndSanitizeCandles(candles, {
    expectedIntervalMs: intervalMs,
    maxSpikePct: opts.maxSpikePct ?? 10,
  });

  const relaxations: string[] = [];
  if (opts.allowZeroVolume) relaxations.push("zero-volume: instrument publishes no volume (index series)");
  if (opts.allowSpecialSessions) relaxations.push("session window: special/muhurat sessions run outside 09:15-15:30 IST");

  const anomalies: ExtendedAnomaly[] = report.anomalies.map((a) => ({
    index: a.index,
    timestamp: a.timestamp,
    type: a.type,
    message: a.message,
  }));

  /* staleness: identical OHLC repeated bar-to-bar WITHIN a session. Across a day boundary an
     identical OHLC is legitimate (e.g. previous close equals next open on a flat tape). */
  let stale = 0;
  for (let i = 1; i < candles.length; i++) {
    const a = candles[i - 1];
    const b = candles[i];
    if (getIstComponents(a.t).dateStr === getIstComponents(b.t).dateStr &&
        a.o === b.o && a.h === b.h && a.l === b.l && a.c === b.c) {
      stale++;
      if (stale <= 5) anomalies.push({ index: i, timestamp: b.t, type: "STALE_REPEAT", message: "Identical OHLC to previous bar" });
    }
  }

  /* zero volume */
  let zeroVol = 0;
  for (let i = 0; i < candles.length; i++) {
    if (!(candles[i].v > 0)) {
      zeroVol++;
      if (zeroVol <= 5) anomalies.push({ index: i, timestamp: candles[i].t, type: "ZERO_VOLUME", message: "Zero or negative volume" });
    }
  }

  /* session boundaries + exchange holidays (IST) */
  let outside = 0;
  let holiday = 0;
  const sessions = new Set<string>();
  const dataYears = new Set<number>();
  for (let i = 0; i < candles.length; i++) {
    const c = candles[i];
    const ist = getIstComponents(c.t);
    dataYears.add(ist.year);
    const mins = ist.hours * 60 + ist.minutes;
    sessions.add(ist.dateStr ?? `${ist.year}-${ist.month}-${ist.day}`);
    if (mins < SESSION_START_MIN || mins > SESSION_END_MIN) {
      outside++;
      if (outside <= 5) anomalies.push({ index: i, timestamp: c.t, type: "OUTSIDE_SESSION", message: `Bar at ${ist.hours}:${String(ist.minutes).padStart(2, "0")} IST is outside 09:15-15:30` });
    }
    if (isExchangeHoliday(ist.dateStr)) {
      holiday++;
      if (holiday <= 5) anomalies.push({ index: i, timestamp: c.t, type: "EXCHANGE_HOLIDAY", message: `Bar falls on a declared exchange holiday (${ist.dateStr})` });
    }
  }

  const checkedYears = [...dataYears].filter((y) => getHolidaysForYear(y).length > 0).sort();
  const uncheckedYears = [...dataYears].filter((y) => getHolidaysForYear(y).length === 0).sort();
  const holidayCoverage = {
    checkedYears,
    uncheckedYears,
    status: (checkedYears.length === 0 ? "UNCHECKED" : uncheckedYears.length ? "PARTIAL" : "CHECKED") as
      | "CHECKED"
      | "PARTIAL"
      | "UNCHECKED",
  };

  const rows = candles.length;
  const pct = (n: number) => (rows ? Number(((n / rows) * 100).toFixed(3)) : 0);
  const sessionsCount = sessions.size;

  /* Expected candles per session: a full NSE equity session is 375 one-minute bars.
     Coverage is measured PER SESSION. A row/session average hides the case that matters — one
     complete session plus one heavily truncated session averages out to "fine" while being unusable. */
  // 09:15 .. 15:29 on a one-minute grid = 375 bars. The 15:30 stamp is the session CLOSE, not a
  // bar in its own right, so the interval is end-exclusive (the previous +1 counted 376 and made
  // every complete session report 0.27% "missing").
  const expectedBarsPerSession = Math.round((SESSION_END_MIN - SESSION_START_MIN) / (intervalMs / 60000));
  const perSessionCounts = new Map<string, number>();
  for (const c of candles) {
    const d = getIstComponents(c.t).dateStr;
    perSessionCounts.set(d, (perSessionCounts.get(d) ?? 0) + 1);
  }
  const coverages = [...perSessionCounts.values()].map((n) =>
    expectedBarsPerSession > 0 ? Math.min(1, n / expectedBarsPerSession) : 1,
  );
  const coverage = coverages.length ? coverages.reduce((a, b) => a + b, 0) / coverages.length : 1;
  const missingCandlePct = Number(((1 - coverage) * 100).toFixed(2));
  const sessionsIncomplete = coverages.filter((c) => c < 0.8).length;

  const stats = {
    missingCandlePct,
    sessionsIncomplete,
    zeroVolumePct: pct(zeroVol),
    staleRepeatPct: pct(stale),
    outsideSessionBars: outside,
    holidayBars: holiday,
    duplicateBars: anonCount(report, "DUPLICATE_TIMESTAMP"),
    unorderedBars: anonCount(report, "UNORDERED_TIMESTAMP"),
    invalidOhlcBars: anonCount(report, "INVALID_OHLC") + anonCount(report, "NEGATIVE_PRICE"),
  };

  /* quality score: start from the sanitizer score and penalise the new dimensions too */
  const penalty =
    Math.min(35, missingCandlePct * 0.5) +
    (opts.allowZeroVolume ? 0 : Math.min(25, stats.zeroVolumePct * 0.5)) +
    Math.min(25, stats.staleRepeatPct * 1.0) +
    (opts.allowSpecialSessions ? 0 : Math.min(30, outside * 2)) +
    Math.min(30, holiday * 5);
  const qualityScorePct = Number(Math.max(0, Math.min(100, report.qualityScorePct - penalty)).toFixed(1));
  const grade: DatasetAudit["grade"] =
    qualityScorePct >= 95 ? "A" : qualityScorePct >= 85 ? "B" : qualityScorePct >= 70 ? "C" : qualityScorePct >= 50 ? "D" : "F";

  const blockers: string[] = [];
  if (rows < minBars) blockers.push(`rows ${rows} < minimum ${minBars} for research`);
  if (holiday > 0) blockers.push(`${holiday} bar(s) on exchange holidays`);
  if (outside > 0 && !opts.allowSpecialSessions) blockers.push(`${outside} bar(s) outside the 09:15-15:30 IST session`);
  if (stats.duplicateBars > 0) blockers.push(`${stats.duplicateBars} duplicate timestamp(s)`);
  if (stats.unorderedBars > 0) blockers.push(`${stats.unorderedBars} unordered timestamp(s)`);
  if (missingCandlePct > 10) blockers.push(`candle coverage missing ${missingCandlePct}% (${sessionsIncomplete} session(s) under 80% complete)`);
  if (qualityScorePct < 70) blockers.push(`quality score ${qualityScorePct}% below 70% threshold`);

  const minSessions = opts.minSessionsForResearch ?? 0;
  if (minSessions > 0 && sessionsCount < minSessions) {
    blockers.push(`sessions ${sessionsCount} < minimum ${minSessions} for time-series research`);
  }

  const researchUsable = blockers.length === 0;
  // A profitability claim additionally requires genuinely real data with complete provenance.
  const profitClaimAllowed = researchUsable && provenance.kind === "REAL";

  const startMs = rows ? candles[0].t : null;
  const endMs = rows ? candles[rows - 1].t : null;
  const checksum = await fingerprintCandles(candles);

  return {
    provenance,
    checksum,
    rows,
    validRows: report.validBars,
    invalidRows: report.invalidBars,
    dateRange: {
      startMs,
      endMs,
      startIst: startMs !== null ? istString(startMs) : null,
      endIst: endMs !== null ? istString(endMs) : null,
    },
    sessions: sessionsCount,
    qualityScorePct,
    grade,
    stats,
    anomalies,
    researchUsable,
    profitClaimAllowed,
    relaxations,
    holidayCoverage,
    blockers,
    baseSanitizerReport: report,
  };
}

function anonCount(report: DataQualityReport, type: DataAnomaly["type"]): number {
  return report.anomalies.filter((a) => a.type === type).length;
}

function istString(ms: number): string {
  const c = getIstComponents(ms);
  return `${c.dateStr} ${String(c.hours).padStart(2, "0")}:${String(c.minutes).padStart(2, "0")} IST`;
}
