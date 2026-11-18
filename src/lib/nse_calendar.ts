/**
 * OmniTradePro Apex V2.0 — Phase 7.4.1
 * NSE & Indian Exchanges Evidence-Based Versioned Calendar & Session Engine (TypeScript)
 *
 * Version: 2026.2 (Evidence-Audited)
 * Auditable specifications for regular sessions, exchange holidays,
 * special sessions (Diwali Muhurat trading, DR live trading), and segment-specific schedules.
 *
 * Regulatory References:
 * 1. Annual Holidays:
 *    - NSE/CMTR/71775 (Circular Ref: 172/2025, Date: 2025-12-12)
 *    - NSE/CMTR/72890 (Maharashtra Civic Election, Date: 2026-01-05)
 * 2. Diwali Muhurat Trading 2026:
 *    - NSE/CMTR/76941 (Download Ref: 149/2026, Date: 2026-10-19)
 * 3. Disaster Recovery (DR) Live Trading:
 *    - NSE/MSD/73126 (Circular Ref: 11/2026, Date: 2026-03-05)
 */

export const NSE_CALENDAR_VERSION = "2026.2";

export type SessionType =
  | "REGULAR"
  | "PRE_OPEN"
  | "POST_CLOSE"
  | "SPECIAL_MUHURAT"
  | "SPECIAL_DR"
  | "COMMODITY_REGULAR"
  | "CLOSED"
  | "BLOCK_DEAL"
  | "SPECIAL_CAS"
  | "SPECIAL_PREOPEN"
  | "CALL_AUCTION";

export type CalendarRegime =
  | "LEGACY"
  | "LEGACY_PRE_CAS"
  | "CAS_V1"
  | "MODERN_CAS_2026"
  | "CAS_V2";

export const LEGACY_SUNSET_DATE = "2026-08-02";
export const CAS_V1_GO_LIVE_DATE = "2026-08-03";
export const CAS_V1_SUNSET_DATE = "2026-12-06";
export const CAS_V2_GO_LIVE_DATE = "2026-12-07";

// Backward-compatible alias
export const CAS_GO_LIVE_DATE_2026 = CAS_V1_GO_LIVE_DATE;

export interface ScheduleVersionSpec {
  versionId: string;
  versionName: string;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  governingCirculars: string[];
  description: string;
}

export const SCHEDULE_VERSIONS_REGISTRY: Record<string, ScheduleVersionSpec> = {
  LEGACY: {
    versionId: "LEGACY",
    versionName: "Pre-CAS Legacy Schedule",
    effectiveFrom: "2010-01-04",
    effectiveTo: "2026-08-02",
    governingCirculars: ["NSE/CMTR/13444"],
    description: "Historical schedule prior to CAS introduction with VWAP calculation buffer (15:30-15:40) and closing session (15:40-16:00).",
  },
  CAS_V1: {
    versionId: "CAS_V1",
    versionName: "CAS 1.0 Initial Schedule",
    effectiveFrom: "2026-08-03",
    effectiveTo: "2026-12-06",
    governingCirculars: [
      "SEBI/HO/47/11/11(3)2025-MRD-POD2/I/2765/2026",
      "NSE/CMTR/73362",
      "NSE/CMTR/74466",
      "NSE/CMTR/76941",
    ],
    description: "First-generation Call Auction at Close (CAS 1.0) with auction matching at 15:30-15:35, transition buffer at 15:35-15:50, and closing session at 15:50-16:00.",
  },
  CAS_V2: {
    versionId: "CAS_V2",
    versionName: "CAS 2.0 Enhanced Schedule",
    effectiveFrom: "2026-12-07",
    effectiveTo: null,
    governingCirculars: [
      "SEBI/HO/47/11/11(3)2025-MRD-POD2/I/23843/2026",
      "NSE/CMTR/77355",
      "NSE_CAS2_FAQ_20261106",
    ],
    description: "Second-generation Call Auction at Close (CAS 2.0) with transition at 15:30-15:31, order entry at 15:31-15:40 (random closure 15:38-15:40), order matching at 15:40-15:45, transition buffer at 15:45-15:50, and closing session at 15:50-16:00.",
  },
};

export type SecurityCategory =
  | "CAS_ELIGIBLE"
  | "NON_CAS"
  | "SPECIAL_PREOPEN_IPO"
  | "ILLIQUID_CALL_AUCTION";

export type ExchangeSegment =
  | "CAPITAL_MARKET"
  | "EQUITY_DERIVATIVES"
  | "CURRENCY_DERIVATIVES"
  | "COMMODITY_DERIVATIVES"
  | "CLEARING_SETTLEMENT";

export type MuhuratSessionPhase =
  | "CLOSED"
  | "BLOCK_DEAL"
  | "PRE_OPEN_ENTRY"
  | "PRE_OPEN_LIMIT_ONLY"
  | "PRE_OPEN_MATCHING"
  | "PRE_OPEN_BUFFER"
  | "CONTINUOUS_TRADING"
  | "CAS_TRANSITION"
  | "CLOSING_AUCTION_ENTRY"
  | "CAS_LIMIT_ONLY"
  | "CLOSING_AUCTION_MATCHING"
  | "CAS_TRANSITION_BUFFER"
  | "CLOSING_SESSION";

export interface RandomClosureWindow {
  windowStart: string; // HH:MM:SS
  windowEnd: string;   // HH:MM:SS
  description: string;
}

export interface OrderEntryPermission {
  isAllowed: boolean;
  orderTypeAllowed: "ALL" | "LIMIT_ONLY" | "NONE";
  isRandomClosureWindow: boolean;
  randomClosureWindow?: RandomClosureWindow;
  reason: string;
}

export interface SecuritySessionEvaluation {
  datetimeIst: string; // ISO string with +05:30
  securityCategory: SecurityCategory;
  sessionType: SessionType;
  granularPhase: string;
  isContinuousTrading: boolean;
  isOrderEntryAllowed: boolean;
  orderTypeAllowed: "ALL" | "LIMIT_ONLY" | "NONE";
  isRandomClosureInterval: boolean;
  randomClosureWindow?: RandomClosureWindow;
  description: string;
}

export const RANDOM_CLOSURE_WINDOWS: Record<string, RandomClosureWindow> = {
  MUHURAT_PRE_OPEN: {
    windowStart: "14:13:00",
    windowEnd: "14:15:00",
    description: "Diwali Muhurat Pre-Open random order entry closure (final 2 mins)",
  },
  MUHURAT_CAS: {
    windowStart: "15:28:00",
    windowEnd: "15:30:00",
    description: "Diwali Muhurat CAS random order entry closure (final 2 mins)",
  },
  REGULAR_PRE_OPEN: {
    windowStart: "09:07:00",
    windowEnd: "09:08:00",
    description: "Regular Equity Pre-Open random order entry closure (final 1 min)",
  },
  REGULAR_CAS: {
    windowStart: "15:43:00",
    windowEnd: "15:45:00",
    description: "Regular Closing Auction Session random closure (final 2 mins)",
  },
  MODERN_CAS_REGULAR: {
    windowStart: "15:28:00",
    windowEnd: "15:30:00",
    description: "Regular Modern CAS random order entry closure (final 2 mins)",
  },
  CAS_V2_REGULAR: {
    windowStart: "15:38:00",
    windowEnd: "15:40:00",
    description: "CAS 2.0 Regular random order entry closure window (final 2 mins of order entry 15:38-15:40)",
  },
  SPOS_IPO: {
    windowStart: "09:35:00",
    windowEnd: "09:45:00",
    description: "Special Pre-Open Session (SPOS) random order entry closure (final 10 mins)",
  },
};

export type CandleTimestampConvention = "START_OF_INTERVAL" | "END_OF_INTERVAL";

export interface PcaCycleSchedule {
  cycleNumber: number;
  cycleStart: string;
  cycleEnd: string;
  orderEntryStart: string;
  orderEntryEnd: string;
  randomClosureStart: string;
  randomClosureEnd: string;
  matchingStart: string;
  matchingEnd: string;
  bufferStart: string;
  bufferEnd: string;
  sourceCircular: string;
  verificationStatus: "VERIFIED" | "UNVERIFIED";
}

export const PCAIS_OPERATIONAL_CYCLES: PcaCycleSchedule[] = [
  {
    cycleNumber: 1,
    cycleStart: "09:30:00",
    cycleEnd: "10:30:00",
    orderEntryStart: "09:30:00",
    orderEntryEnd: "10:15:00",
    randomClosureStart: "10:14:00",
    randomClosureEnd: "10:15:00",
    matchingStart: "10:15:00",
    matchingEnd: "10:23:00",
    bufferStart: "10:23:00",
    bufferEnd: "10:30:00",
    sourceCircular: "NSE/CMTR/23114",
    verificationStatus: "VERIFIED",
  },
  {
    cycleNumber: 2,
    cycleStart: "10:30:00",
    cycleEnd: "11:30:00",
    orderEntryStart: "10:30:00",
    orderEntryEnd: "11:15:00",
    randomClosureStart: "11:14:00",
    randomClosureEnd: "11:15:00",
    matchingStart: "11:15:00",
    matchingEnd: "11:23:00",
    bufferStart: "11:23:00",
    bufferEnd: "11:30:00",
    sourceCircular: "NSE/CMTR/23114",
    verificationStatus: "VERIFIED",
  },
  {
    cycleNumber: 3,
    cycleStart: "11:30:00",
    cycleEnd: "12:30:00",
    orderEntryStart: "11:30:00",
    orderEntryEnd: "12:15:00",
    randomClosureStart: "12:14:00",
    randomClosureEnd: "12:15:00",
    matchingStart: "12:15:00",
    matchingEnd: "12:23:00",
    bufferStart: "12:23:00",
    bufferEnd: "12:30:00",
    sourceCircular: "NSE/CMTR/23114",
    verificationStatus: "VERIFIED",
  },
  {
    cycleNumber: 4,
    cycleStart: "12:30:00",
    cycleEnd: "13:30:00",
    orderEntryStart: "12:30:00",
    orderEntryEnd: "13:15:00",
    randomClosureStart: "13:14:00",
    randomClosureEnd: "13:15:00",
    matchingStart: "13:15:00",
    matchingEnd: "13:23:00",
    bufferStart: "13:23:00",
    bufferEnd: "13:30:00",
    sourceCircular: "NSE/CMTR/23114",
    verificationStatus: "VERIFIED",
  },
  {
    cycleNumber: 5,
    cycleStart: "13:30:00",
    cycleEnd: "14:30:00",
    orderEntryStart: "13:30:00",
    orderEntryEnd: "14:15:00",
    randomClosureStart: "14:14:00",
    randomClosureEnd: "14:15:00",
    matchingStart: "14:15:00",
    matchingEnd: "14:23:00",
    bufferStart: "14:23:00",
    bufferEnd: "14:30:00",
    sourceCircular: "NSE/CMTR/23114",
    verificationStatus: "VERIFIED",
  },
  {
    cycleNumber: 6,
    cycleStart: "14:30:00",
    cycleEnd: "15:30:00",
    orderEntryStart: "14:30:00",
    orderEntryEnd: "15:15:00",
    randomClosureStart: "15:14:00",
    randomClosureEnd: "15:15:00",
    matchingStart: "15:15:00",
    matchingEnd: "15:23:00",
    bufferStart: "15:23:00",
    bufferEnd: "15:30:00",
    sourceCircular: "NSE/CMTR/23114",
    verificationStatus: "VERIFIED",
  },
];

export const SPOS_SCHEDULE_SPEC = {
  orderEntry: {
    start: "09:00:00",
    end: "09:45:00",
    orderTypesAllowed: ["LIMIT", "MARKET"],
    randomClosureWindow: ["09:35:00", "09:45:00"],
    circularRef: "CIR/MRD/DP/01/2012",
    verificationStatus: "VERIFIED",
  },
  deterministicLimitOnlySubphase: {
    claim: "09:40-09:45 Limit orders only",
    circularRef: "NONE",
    verificationStatus: "UNVERIFIED",
    notes: "SEBI CIR/MRD/DP/01/2012 paragraph 3(f) permits both market and limit orders throughout the 45-minute order entry phase. Any claim of a distinct deterministic limit-only window is UNVERIFIED.",
  },
  orderMatching: {
    start: "09:45:00",
    end: "09:55:00",
    circularRef: "CIR/MRD/DP/01/2012",
    verificationStatus: "VERIFIED",
  },
  buffer: {
    start: "09:55:00",
    end: "10:00:00",
    circularRef: "CIR/MRD/DP/01/2012",
    verificationStatus: "VERIFIED",
  },
  continuousTradingStart: {
    time: "10:00:00",
    circularRef: "CIR/MRD/DP/01/2012",
    verificationStatus: "VERIFIED",
  },
};

export const PCAIS_THREE_TIER_SPEC = {
  tier1RegulatoryFramework: {
    circularRefs: ["CIR/MRD/DP/6/2013", "CIR/MRD/DP/38/2013"],
    cycleDurationMinutes: 60,
    orderEntryMinutes: 45,
    randomClosureWindow: "45th minute (last 1 min of order entry: 44:00-45:00)",
    orderMatchingMinutes: 8,
    bufferMinutes: 7,
    continuousTradingMinutes: 0,
    verificationStatus: "VERIFIED",
  },
  tier2OperationalSchedule: {
    circularRef: "NSE/CMTR/23114",
    cyclesPerDay: 6,
    overallWindow: "09:30:00 to 15:30:00 IST",
    verificationStatus: "VERIFIED",
  },
  tier3LocalSimulatedSchedule: {
    circularRef: "NONE (LOCAL TEST HARNESS)",
    notes: "Simulated mock closure timestamps (e.g. 10:14:30) are test parameters for exercising rejection branches; NOT exchange rules.",
    verificationStatus: "UNVERIFIED",
  },
};

export interface HolidayEvidence {
  date: string; // YYYY-MM-DD
  name: string;
  dayOfWeek: string;
  isWeekday: boolean;
  segment: string;
  circularRef: string;
  publicationDate: string;
  verificationStatus: "VERIFIED" | "UNVERIFIED";
  lastVerifiedDate: string;
  notes?: string;
}

export interface SpecialSessionEvidence {
  sessionId: string;
  segment: string;
  date: string;
  sessionType: SessionType;
  site: "PRIMARY" | "DR_SITE";
  blockDealStartMinutes?: number;
  blockDealEndMinutes?: number;
  tradingStartMinutes: number;
  tradingEndMinutes: number;
  circularRef: string;
  publicationDate: string;
  verificationStatus: "VERIFIED" | "UNVERIFIED";
  lastVerifiedDate: string;
  description: string;
}

export interface RegulatoryRuleEvidence {
  ruleId: string;
  ruleName: string;
  circularRef: string;
  circularDate: string;
  sourceUrlOrRef: string;
  marketSegment: string;
  securityCategory: string;
  effectiveDate: string;
  verificationStatus: "VERIFIED" | "UNVERIFIED";
  implementationMatches: boolean;
  notes: string;
}

export const REGULATORY_RULES_EVIDENCE_2026: Record<string, RegulatoryRuleEvidence> = {
  CAS_ELIGIBLE: {
    ruleId: "CAS_ELIGIBLE",
    ruleName: "Closing Auction Session Eligibility Framework",
    circularRef: "CIR/MRD/DP/21/2010",
    circularDate: "2010-07-15",
    sourceUrlOrRef: "https://www.sebi.gov.in/legal/circulars/jul-2010/call-auction-in-pre-open-session_1739.html",
    marketSegment: "CAPITAL_MARKET",
    securityCategory: "CAS_ELIGIBLE",
    effectiveDate: "2010-10-18",
    verificationStatus: "VERIFIED",
    implementationMatches: true,
    notes: "Governs call auction mechanics; supplemented by NSE/CMTR/76941 for Diwali Muhurat session specifying CAS continuous trading close at 15:15:00 and auction matching at 15:30:00.",
  },
  NON_CAS: {
    ruleId: "NON_CAS",
    ruleName: "Normal Continuous Market Schedule for Non-CAS Securities",
    circularRef: "NSE/CMTR/13444",
    circularDate: "2009-12-16",
    sourceUrlOrRef: "https://www.nseindia.com/resources/exchange-communication-circulars",
    marketSegment: "CAPITAL_MARKET",
    securityCategory: "NON_CAS",
    effectiveDate: "2010-01-04",
    verificationStatus: "VERIFIED",
    implementationMatches: true,
    notes: "Continuous equity market trading until 15:30:00 IST; verified against circular NSE/CMTR/76941 where Non-CAS continuous trading runs uninterrupted until 15:30:00 without early 15:15:00 close.",
  },
  SPECIAL_PREOPEN_IPO: {
    ruleId: "SPECIAL_PREOPEN_IPO",
    ruleName: "Special Pre-Open Session for IPOs and Relisted Securities (SPOS)",
    circularRef: "CIR/MRD/DP/01/2012",
    circularDate: "2012-01-20",
    sourceUrlOrRef: "https://www.sebi.gov.in/legal/circulars/jan-2012/call-auction-in-pre-open-session-for-initial-public-offerings-ipos-and-relisted-scrips_22107.html",
    marketSegment: "CAPITAL_MARKET",
    securityCategory: "SPECIAL_PREOPEN_IPO",
    effectiveDate: "2012-01-20",
    verificationStatus: "VERIFIED",
    implementationMatches: true,
    notes: "60-minute duration: 45m order entry (09:00-09:45, random closure 09:35-09:45), 10m order matching (09:45-09:55), 5m buffer (09:55-10:00). Continuous trading commences at 10:00:00 IST.",
  },
  ILLIQUID_CALL_AUCTION: {
    ruleId: "ILLIQUID_CALL_AUCTION",
    ruleName: "Periodic Call Auction for Illiquid Securities (PCAIS)",
    circularRef: "CIR/MRD/DP/6/2013",
    circularDate: "2013-01-24",
    sourceUrlOrRef: "https://www.sebi.gov.in/legal/circulars/jan-2013/periodic-call-auction-for-illiquid-scrips_24235.html",
    marketSegment: "CAPITAL_MARKET",
    securityCategory: "ILLIQUID_CALL_AUCTION",
    effectiveDate: "2013-04-08",
    verificationStatus: "VERIFIED",
    implementationMatches: true,
    notes: "Re-structured per CIR/MRD/DP/38/2013 (2013-12-19). 6 one-hour cycles (09:30-15:30 IST): 45m order entry (random stop in 45th minute, e.g. 10:14-10:15), 8m matching, 7m buffer. Zero continuous trading.",
  },
  BLOCK_DEAL: {
    ruleId: "BLOCK_DEAL",
    ruleName: "Block Deal Trading Window Framework",
    circularRef: "SEBI/HO/MRD/DOS2/CIR/P/2017/110",
    circularDate: "2017-10-26",
    sourceUrlOrRef: "https://www.sebi.gov.in/legal/circulars/oct-2017/revision-of-the-framework-for-block-deal-window_36357.html",
    marketSegment: "CAPITAL_MARKET",
    securityCategory: "ALL",
    effectiveDate: "2018-01-01",
    verificationStatus: "VERIFIED",
    implementationMatches: true,
    notes: "Establishes morning (08:45-09:00) and afternoon (14:05-14:20) windows; on Muhurat 2026, NSE circular NSE/CMTR/76941 designates 13:50:00 to 14:05:00 as the dedicated block deal window.",
  },
  MUHURAT_SESSION: {
    ruleId: "MUHURAT_SESSION",
    ruleName: "Diwali Muhurat Trading Session Framework (Samvat 2083)",
    circularRef: "NSE/CMTR/76941",
    circularDate: "2026-10-19",
    sourceUrlOrRef: "NSE Circular Ref: 149/2026 (Circulars Archive / Member Service Portal)",
    marketSegment: "CAPITAL_MARKET",
    securityCategory: "ALL",
    effectiveDate: "2026-11-08",
    verificationStatus: "VERIFIED",
    implementationMatches: true,
    notes: "Official schedule for Diwali Laxmi Pujan 2026: Block Deal 13:50-14:05, Pre-Open 14:05-14:20, Continuous Trading 14:20-15:30 (CAS closes 15:15), CAS 15:20-15:35, Closing Session 15:50-16:00.",
  },
  POST_CLOSE: {
    ruleId: "POST_CLOSE",
    ruleName: "Closing Session / Post-Close Trading Window",
    circularRef: "NSE/CMTR/13444",
    circularDate: "2009-12-16",
    sourceUrlOrRef: "https://www.nseindia.com/resources/exchange-communication-circulars",
    marketSegment: "CAPITAL_MARKET",
    securityCategory: "ALL",
    effectiveDate: "2010-01-04",
    verificationStatus: "VERIFIED",
    implementationMatches: true,
    notes: "Legacy regular trading days (prior to 2026-08-03): 15:40:00 to 16:00:00 IST per NSE/CMTR/13444. Modern CAS (effective 2026-08-03 per SEBI HO/47/11/11(3)2025-MRD-POD2/I/2765/2026, NSE/CMTR/73362, NSE/CMTR/74466, NSE/CMTR/76941): 15:50:00 to 16:00:00 IST. Orders accepted only as LIMIT orders and matched strictly at the determined closing price.",
  },
  UNVERIFIED_SATURDAY_DR: {
    ruleId: "UNVERIFIED_SATURDAY_DR",
    ruleName: "Purported Saturday Disaster Recovery Live Trading Session",
    circularRef: "NONE",
    circularDate: "NONE",
    sourceUrlOrRef: "UNVERIFIED",
    marketSegment: "CAPITAL_MARKET",
    securityCategory: "ALL",
    effectiveDate: "2026-03-07",
    verificationStatus: "UNVERIFIED",
    implementationMatches: false,
    notes: "Circular NSE/MSD/73126 restricts DR live trading to 2026-03-05 and 2026-03-06. Saturday 2026-03-07 is strictly a closed weekend with zero trading.",
  },
  UNVERIFIED_EVENING_MUHURAT: {
    ruleId: "UNVERIFIED_EVENING_MUHURAT",
    ruleName: "Purported 18:15-19:15 Evening Muhurat Session",
    circularRef: "NONE",
    circularDate: "NONE",
    sourceUrlOrRef: "UNVERIFIED",
    marketSegment: "CAPITAL_MARKET",
    securityCategory: "ALL",
    effectiveDate: "2026-11-08",
    verificationStatus: "UNVERIFIED",
    implementationMatches: false,
    notes: "Circular NSE/CMTR/76941 refutes obsolete 18:15-19:15 timing and defines afternoon session: Block Deal 13:50-14:05, Continuous 14:20-15:30.",
  },
  UNVERIFIED_MODERN_1540_CLOSING_SESSION: {
    ruleId: "UNVERIFIED_MODERN_1540_CLOSING_SESSION",
    ruleName: "Purported 15:40 Closing Session Start under Modern CAS",
    circularRef: "NONE",
    circularDate: "NONE",
    sourceUrlOrRef: "UNVERIFIED",
    marketSegment: "CAPITAL_MARKET",
    securityCategory: "ALL",
    effectiveDate: "2026-08-03",
    verificationStatus: "UNVERIFIED",
    implementationMatches: false,
    notes: "Under Modern CAS (effective 2026-08-03 per NSE/CMTR/73362, 74466, 76941), 15:40:00 falls strictly inside the mandatory TRANSITION_PERIOD (15:35-15:50). The official modern closing session starts at 15:50:00. Any claim that 15:40 is the closing session start on modern CAS dates is UNVERIFIED.",
  },
  CAS_V2_SCHEDULE: {
    ruleId: "CAS_V2_SCHEDULE",
    ruleName: "NSE Call Auction at Close (CAS) 2.0 Schedule",
    circularRef: "NSE/CMTR/77355",
    circularDate: "2026-11-06",
    sourceUrlOrRef: "https://www.nseindia.com/resources/exchange-communication-circulars",
    marketSegment: "CAPITAL_MARKET",
    securityCategory: "ALL",
    effectiveDate: "2026-12-07",
    verificationStatus: "VERIFIED",
    implementationMatches: true,
    notes: "SEBI circular HO/47/11/11(3)2025-MRD-POD2/I/23843/2026 dated 2026-10-15 and NSE circular NSE/CMTR/77355 dated 2026-11-06 establishing CAS 2.0 effective 2026-12-07: Transition 15:30-15:31, Order Entry 15:31-15:36 (Market & Limit), Limit-only Entry 15:36-15:40 with random closure 15:38-15:40, Order Matching 15:40-15:45, Transition Buffer 15:45-15:50, Post-Close 15:50-16:00.",
  },
};

// Cross-language registry alias
export const SESSION_RULES_REGISTRY = REGULATORY_RULES_EVIDENCE_2026;

export const CLOSING_SESSION_RECONCILIATION_EVIDENCE_2026 = {
  CAS_V2_REGIME: {
    regulatoryCirculars: [
      "SEBI/HO/47/11/11(3)2025-MRD-POD2/I/23843/2026",
      "NSE/CMTR/77355",
      "NSE_CAS2_FAQ_20261106",
    ],
    effectiveFrom: "2026-12-07",
    effectiveTo: null,
    effectiveDate: "2026-12-07",
    marketSegment: "CAPITAL_MARKET",
    continuousTradingEnd: "15:30:00",
    referenceTransition: "15:30:00 - 15:31:00",
    closingAuctionEntry: "15:31:00 - 15:36:00",
    closingAuctionLimitOnly: "15:36:00 - 15:40:00",
    randomClosureWindow: "15:38:00 - 15:40:00",
    closingAuctionMatching: "15:40:00 - 15:45:00",
    transitionPeriod: "15:45:00 - 15:50:00",
    closingSession: "15:50:00 - 16:00:00",
    marketClosed: "16:00:00",
    verificationStatus: "VERIFIED",
    reconciliationSummary:
      "CAS 2.0 framework effective 2026-12-07 introduces streamlined 1-minute reference transition (15:30-15:31), order entry (15:31-15:40) with random closure (15:38-15:40), order matching (15:40-15:45), transition buffer (15:45-15:50), and closing session (15:50-16:00). At 15:40:00, CAS 2.0 enters CLOSING_AUCTION_MATCHING.",
  },
  CAS_V1_REGIME: {
    regulatoryCirculars: [
      "SEBI/HO/47/11/11(3)2025-MRD-POD2/I/2765/2026",
      "NSE/CMTR/73362",
      "NSE/CMTR/74466",
      "NSE/CMTR/76941",
    ],
    effectiveFrom: "2026-08-03",
    effectiveTo: "2026-12-06",
    effectiveDate: "2026-08-03",
    marketSegment: "CAPITAL_MARKET",
    continuousTradingEnd: "15:30:00",
    closingAuctionEntry: "15:20:00 - 15:30:00",
    closingAuctionMatching: "15:30:00 - 15:35:00",
    transitionPeriod: "15:35:00 - 15:50:00",
    closingSession: "15:50:00 - 16:00:00",
    marketClosed: "16:00:00",
    verificationStatus: "VERIFIED",
    reconciliationSummary:
      "Modern CAS architecture introduces 5-minute auction matching (15:30-15:35) and 15-minute transition/reconciliation buffer (15:35-15:50), shifting closing session opening from legacy 15:40 to 15:50:00 IST. The timestamp 15:40:00 falls inside the TRANSITION_PERIOD where order entry is strictly prohibited.",
  },
  MODERN_CAS_REGIME: {
    regulatoryCirculars: [
      "SEBI/HO/47/11/11(3)2025-MRD-POD2/I/2765/2026",
      "NSE/CMTR/73362",
      "NSE/CMTR/74466",
      "NSE/CMTR/76941",
    ],
    effectiveFrom: "2026-08-03",
    effectiveTo: "2026-12-06",
    effectiveDate: "2026-08-03",
    marketSegment: "CAPITAL_MARKET",
    continuousTradingEnd: "15:30:00",
    closingAuctionEntry: "15:20:00 - 15:30:00",
    closingAuctionMatching: "15:30:00 - 15:35:00",
    transitionPeriod: "15:35:00 - 15:50:00",
    closingSession: "15:50:00 - 16:00:00",
    marketClosed: "16:00:00",
    verificationStatus: "VERIFIED",
    reconciliationSummary:
      "Modern CAS architecture introduces 5-minute auction matching (15:30-15:35) and 15-minute transition/reconciliation buffer (15:35-15:50), shifting closing session opening from legacy 15:40 to 15:50:00 IST. The timestamp 15:40:00 falls inside the TRANSITION_PERIOD where order entry is strictly prohibited.",
  },
  LEGACY_PRE_CAS_REGIME: {
    regulatoryCirculars: ["NSE/CMTR/13444"],
    publicationDate: "2009-12-16",
    effectiveDate: "2010-01-04",
    sunsetDate: "2026-08-02",
    marketSegment: "CAPITAL_MARKET",
    continuousTradingEnd: "15:30:00",
    bufferPeriod: "15:30:00 - 15:40:00",
    closingSession: "15:40:00 - 16:00:00",
    marketClosed: "16:00:00",
    verificationStatus: "VERIFIED",
    reconciliationSummary:
      "Historical pre-CAS schedule established in 2010 under NSE/CMTR/13444 with 10-minute VWAP buffer (15:30-15:40) followed by post-close session (15:40-16:00).",
  },
  CONFLICT_RESOLUTION_1540_VS_1550: {
    status: "RESOLVED_DATE_AND_REGIME_DEPENDENT",
    legacy1540Status: "SUPERSEDED_BY_MODERN_CAS",
    modern1540AsClosingSessionStatus: "UNVERIFIED",
    verifiedModernClosingSessionStart: "15:50:00",
    resolutionFinding:
      "The 15:40 start time applies exclusively to the LEGACY_PRE_CAS regime (dates prior to 2026-08-03). Under MODERN_CAS_2026 (dates on or after 2026-08-03, including Muhurat 2026-11-08), 15:40 is strictly inside TRANSITION_PERIOD. Modern closing session starts at 15:50.",
  },
};

export function getRegulatoryRuleEvidence(ruleId: string): RegulatoryRuleEvidence | undefined {
  if (!ruleId || typeof ruleId !== "string") return undefined;
  return REGULATORY_RULES_EVIDENCE_2026[ruleId.trim().toUpperCase()];
}

export function getAllRegulatoryRules(): Record<string, RegulatoryRuleEvidence> {
  return { ...REGULATORY_RULES_EVIDENCE_2026 };
}

// ============================================================================
// OFFICIAL 2026 NSE EQUITY HOLIDAY RECORDS (16 Weekday Holidays + 4 Weekend)
// ============================================================================

export const WEEKDAY_HOLIDAYS_EVIDENCE_2026: HolidayEvidence[] = [
  {
    date: "2026-01-15",
    name: "Municipal Corporation Election - Maharashtra",
    dayOfWeek: "Thursday",
    isWeekday: true,
    segment: "EQUITY",
    circularRef: "NSE/CMTR/72260",
    publicationDate: "2026-01-12",
    verificationStatus: "VERIFIED",
    lastVerifiedDate: "2026-11-17",
    notes: "Official amendment circular NSE/CMTR/72260 (Ref: 05/2026) declaring full trading holiday; also notified under NSE/CMTR/72890",
  },
  {
    date: "2026-01-26",
    name: "Republic Day",
    dayOfWeek: "Monday",
    isWeekday: true,
    segment: "EQUITY",
    circularRef: "NSE/CMTR/71775",
    publicationDate: "2025-12-12",
    verificationStatus: "VERIFIED",
    lastVerifiedDate: "2026-11-17",
  },
  {
    date: "2026-03-03",
    name: "Holi",
    dayOfWeek: "Tuesday",
    isWeekday: true,
    segment: "EQUITY",
    circularRef: "NSE/CMTR/71775",
    publicationDate: "2025-12-12",
    verificationStatus: "VERIFIED",
    lastVerifiedDate: "2026-11-17",
  },
  {
    date: "2026-03-26",
    name: "Shri Ram Navami",
    dayOfWeek: "Thursday",
    isWeekday: true,
    segment: "EQUITY",
    circularRef: "NSE/CMTR/71775",
    publicationDate: "2025-12-12",
    verificationStatus: "VERIFIED",
    lastVerifiedDate: "2026-11-17",
  },
  {
    date: "2026-03-31",
    name: "Shri Mahavir Jayanti",
    dayOfWeek: "Tuesday",
    isWeekday: true,
    segment: "EQUITY",
    circularRef: "NSE/CMTR/71775",
    publicationDate: "2025-12-12",
    verificationStatus: "VERIFIED",
    lastVerifiedDate: "2026-11-17",
  },
  {
    date: "2026-04-03",
    name: "Good Friday",
    dayOfWeek: "Friday",
    isWeekday: true,
    segment: "EQUITY",
    circularRef: "NSE/CMTR/71775",
    publicationDate: "2025-12-12",
    verificationStatus: "VERIFIED",
    lastVerifiedDate: "2026-11-17",
  },
  {
    date: "2026-04-14",
    name: "Dr. Baba Saheb Ambedkar Jayanti",
    dayOfWeek: "Tuesday",
    isWeekday: true,
    segment: "EQUITY",
    circularRef: "NSE/CMTR/71775",
    publicationDate: "2025-12-12",
    verificationStatus: "VERIFIED",
    lastVerifiedDate: "2026-11-17",
  },
  {
    date: "2026-05-01",
    name: "Maharashtra Day",
    dayOfWeek: "Friday",
    isWeekday: true,
    segment: "EQUITY",
    circularRef: "NSE/CMTR/71775",
    publicationDate: "2025-12-12",
    verificationStatus: "VERIFIED",
    lastVerifiedDate: "2026-11-17",
  },
  {
    date: "2026-05-28",
    name: "Bakri Id",
    dayOfWeek: "Thursday",
    isWeekday: true,
    segment: "EQUITY",
    circularRef: "NSE/CMTR/71775",
    publicationDate: "2025-12-12",
    verificationStatus: "VERIFIED",
    lastVerifiedDate: "2026-11-17",
  },
  {
    date: "2026-06-26",
    name: "Muharram",
    dayOfWeek: "Friday",
    isWeekday: true,
    segment: "EQUITY",
    circularRef: "NSE/CMTR/71775",
    publicationDate: "2025-12-12",
    verificationStatus: "VERIFIED",
    lastVerifiedDate: "2026-11-17",
  },
  {
    date: "2026-09-14",
    name: "Ganesh Chaturthi",
    dayOfWeek: "Monday",
    isWeekday: true,
    segment: "EQUITY",
    circularRef: "NSE/CMTR/71775",
    publicationDate: "2025-12-12",
    verificationStatus: "VERIFIED",
    lastVerifiedDate: "2026-11-17",
  },
  {
    date: "2026-10-02",
    name: "Mahatma Gandhi Jayanti",
    dayOfWeek: "Friday",
    isWeekday: true,
    segment: "EQUITY",
    circularRef: "NSE/CMTR/71775",
    publicationDate: "2025-12-12",
    verificationStatus: "VERIFIED",
    lastVerifiedDate: "2026-11-17",
  },
  {
    date: "2026-10-20",
    name: "Dussehra",
    dayOfWeek: "Tuesday",
    isWeekday: true,
    segment: "EQUITY",
    circularRef: "NSE/CMTR/71775",
    publicationDate: "2025-12-12",
    verificationStatus: "VERIFIED",
    lastVerifiedDate: "2026-11-17",
  },
  {
    date: "2026-11-10",
    name: "Diwali-Balipratipada",
    dayOfWeek: "Tuesday",
    isWeekday: true,
    segment: "EQUITY",
    circularRef: "NSE/CMTR/71775",
    publicationDate: "2025-12-12",
    verificationStatus: "VERIFIED",
    lastVerifiedDate: "2026-11-17",
  },
  {
    date: "2026-11-24",
    name: "Prakash Gurpurb Sri Guru Nanak Dev",
    dayOfWeek: "Tuesday",
    isWeekday: true,
    segment: "EQUITY",
    circularRef: "NSE/CMTR/71775",
    publicationDate: "2025-12-12",
    verificationStatus: "VERIFIED",
    lastVerifiedDate: "2026-11-17",
  },
  {
    date: "2026-12-25",
    name: "Christmas",
    dayOfWeek: "Friday",
    isWeekday: true,
    segment: "EQUITY",
    circularRef: "NSE/CMTR/71775",
    publicationDate: "2025-12-12",
    verificationStatus: "VERIFIED",
    lastVerifiedDate: "2026-11-17",
  },
];

export const WEEKEND_HOLIDAYS_EVIDENCE_2026: HolidayEvidence[] = [
  {
    date: "2026-02-15",
    name: "Mahashivratri",
    dayOfWeek: "Sunday",
    isWeekday: false,
    segment: "EQUITY",
    circularRef: "NSE/CMTR/71775",
    publicationDate: "2025-12-12",
    verificationStatus: "VERIFIED",
    lastVerifiedDate: "2026-11-17",
    notes: "Falls on Sunday; regular weekend closure",
  },
  {
    date: "2026-03-21",
    name: "Id-Ul-Fitr (Ramadan Eid)",
    dayOfWeek: "Saturday",
    isWeekday: false,
    segment: "EQUITY",
    circularRef: "NSE/CMTR/71775",
    publicationDate: "2025-12-12",
    verificationStatus: "VERIFIED",
    lastVerifiedDate: "2026-11-17",
    notes: "Falls on Saturday; regular weekend closure",
  },
  {
    date: "2026-08-15",
    name: "Independence Day",
    dayOfWeek: "Saturday",
    isWeekday: false,
    segment: "EQUITY",
    circularRef: "NSE/CMTR/71775",
    publicationDate: "2025-12-12",
    verificationStatus: "VERIFIED",
    lastVerifiedDate: "2026-11-17",
    notes: "Falls on Saturday; national holiday coinciding with weekend",
  },
  {
    date: "2026-11-08",
    name: "Diwali Laxmi Pujan",
    dayOfWeek: "Sunday",
    isWeekday: false,
    segment: "EQUITY",
    circularRef: "NSE/CMTR/71775",
    publicationDate: "2025-12-12",
    verificationStatus: "VERIFIED",
    lastVerifiedDate: "2026-11-17",
    notes: "Falls on Sunday; daytime closed; special Muhurat trading session held",
  },
];

// Dictionaries for fast lookup
export const TRADING_HOLIDAYS_2026: Record<string, string> = Object.fromEntries(
  WEEKDAY_HOLIDAYS_EVIDENCE_2026.map((h) => [h.date, h.name])
);

export const WEEKEND_HOLIDAYS_2026: Record<string, string> = Object.fromEntries(
  WEEKEND_HOLIDAYS_EVIDENCE_2026.map((h) => [h.date, h.name])
);

export const ALL_HOLIDAYS_2026: Record<string, string> = {
  ...TRADING_HOLIDAYS_2026,
  ...WEEKEND_HOLIDAYS_2026,
};

// ============================================================================
// SPECIAL SESSIONS EVIDENCE (Diwali Muhurat & Disaster Recovery)
// ============================================================================

// Official Diwali Muhurat Trading Session (Sunday, 8 November 2026)
// Evidence Reference: NSE Circular NSE/CMTR/76941 (Download Ref: 149/2026, Date: 2026-10-19)
export const MUHURAT_SESSION_2026 = {
  date: "2026-11-08",
  segment: "EQUITY",
  blockDealStartMinutes: 13 * 60 + 50,  // 13:50 IST (Block deal window per NSE/CMTR/76941)
  blockDealEndMinutes: 14 * 60 + 5,     // 14:05 IST
  preOpenStartMinutes: 14 * 60 + 5,      // 14:05 IST
  preOpenLimitStartMinutes: 14 * 60 + 10,// 14:10 IST
  preOpenMatchStartMinutes: 14 * 60 + 15,// 14:15 IST
  preOpenBufferStartMinutes: 14 * 60 + 17,// 14:17 IST
  preOpenEndMinutes: 14 * 60 + 20,       // 14:20 IST (order entry, matching & buffer)
  tradingStartMinutes: 14 * 60 + 20,     // 14:20 IST (Continuous Trading Session open)
  tradingEndMinutes: 15 * 60 + 30,       // 15:30 IST (Normal Market close; CAS closes at 15:15)
  casContinuousEndMinutes: 15 * 60 + 15, // 15:15 IST (Continuous Trading closes for CAS securities)
  casTransitionStartMinutes: 15 * 60 + 15,
  casTransitionEndMinutes: 15 * 60 + 20,
  casStartMinutes: 15 * 60 + 20,         // 15:20 IST (CAS order entry)
  casLimitOnlyStartMinutes: 15 * 60 + 25,// 15:25 IST (CAS limit orders only)
  casLimitOnlyEndMinutes: 15 * 60 + 30,  // 15:30 IST
  casEndMinutes: 15 * 60 + 35,           // 15:35 IST
  casBufferStartMinutes: 15 * 60 + 35,
  casBufferEndMinutes: 15 * 60 + 50,
  postCloseStartMinutes: 15 * 60 + 50,   // 15:50 IST
  postCloseEndMinutes: 16 * 60 + 0,      // 16:00 IST
  circularRef: "NSE/CMTR/76941",
  publicationDate: "2026-10-19",
  verificationStatus: "VERIFIED" as const,
  lastVerifiedDate: "2026-11-17",
  description: "Diwali Muhurat Trading Session for Samvat 2083",
};

// Official Disaster Recovery (DR) Site Live Trading Sessions
// Evidence Reference: NSE Circular NSE/MSD/73126 (Circular Ref: 11/2026, Date: 2026-03-05)
export const DR_SESSIONS_2026: SpecialSessionEvidence[] = [
  {
    sessionId: "DR-2026-03-05",
    date: "2026-03-05",
    segment: "EQUITY",
    sessionType: "SPECIAL_DR",
    site: "DR_SITE",
    tradingStartMinutes: 9 * 60 + 15,    // 09:15 IST
    tradingEndMinutes: 15 * 60 + 30,     // 15:30 IST
    circularRef: "NSE/MSD/73126",
    publicationDate: "2026-03-05",
    verificationStatus: "VERIFIED",
    lastVerifiedDate: "2026-11-17",
    description: "Live Trading Session from Disaster Recovery (DR) Site - Day 1",
  },
  {
    sessionId: "DR-2026-03-06",
    date: "2026-03-06",
    segment: "EQUITY",
    sessionType: "SPECIAL_DR",
    site: "DR_SITE",
    tradingStartMinutes: 9 * 60 + 15,    // 09:15 IST
    tradingEndMinutes: 15 * 60 + 30,     // 15:30 IST
    circularRef: "NSE/MSD/73126",
    publicationDate: "2026-03-05",
    verificationStatus: "VERIFIED",
    lastVerifiedDate: "2026-11-17",
    description: "Live Trading Session from Disaster Recovery (DR) Site - Day 2",
  },
  {
    sessionId: "PRIMARY-2026-03-09",
    date: "2026-03-09",
    segment: "EQUITY",
    sessionType: "REGULAR",
    site: "PRIMARY",
    tradingStartMinutes: 9 * 60 + 15,    // 09:15 IST
    tradingEndMinutes: 15 * 60 + 30,     // 15:30 IST
    circularRef: "NSE/MSD/73126",
    publicationDate: "2026-03-05",
    verificationStatus: "VERIFIED",
    lastVerifiedDate: "2026-11-17",
    description: "Live Trading Resumed from Primary Site",
  },
];

// ============================================================================
// CLEARING & SETTLEMENT HOLIDAYS (Where Capital Market Trades Normally)
// ============================================================================

export const CLEARING_ONLY_HOLIDAYS_EVIDENCE_2026: HolidayEvidence[] = [
  {
    date: "2026-02-19",
    name: "Chhatrapati Shivaji Maharaj Jayanti",
    dayOfWeek: "Thursday",
    isWeekday: true,
    segment: "CLEARING_SETTLEMENT",
    circularRef: "NSE/CPLY/CLEARING/2026",
    publicationDate: "2025-12-15",
    verificationStatus: "VERIFIED",
    lastVerifiedDate: "2026-11-17",
    notes: "Clearing & Settlement holiday; Capital Market is OPEN for normal trading (09:15-15:30 IST)",
  },
  {
    date: "2026-03-19",
    name: "Gudhi Padwa",
    dayOfWeek: "Thursday",
    isWeekday: true,
    segment: "CLEARING_SETTLEMENT",
    circularRef: "NSE/CPLY/CLEARING/2026",
    publicationDate: "2025-12-15",
    verificationStatus: "VERIFIED",
    lastVerifiedDate: "2026-11-17",
    notes: "Clearing & Settlement holiday; Capital Market is OPEN for normal trading (09:15-15:30 IST)",
  },
  {
    date: "2026-04-01",
    name: "Annual Bank Closing",
    dayOfWeek: "Wednesday",
    isWeekday: true,
    segment: "CLEARING_SETTLEMENT",
    circularRef: "RBI/2025-26/BANK-HOLIDAYS",
    publicationDate: "2025-12-15",
    verificationStatus: "VERIFIED",
    lastVerifiedDate: "2026-11-17",
    notes: "Annual bank accounts closing under NI Act; Capital Market is OPEN for normal trading (09:15-15:30 IST)",
  },
  {
    date: "2026-08-26",
    name: "Id-E-Milad",
    dayOfWeek: "Wednesday",
    isWeekday: true,
    segment: "CLEARING_SETTLEMENT",
    circularRef: "NSE/CPLY/CLEARING/2026",
    publicationDate: "2025-12-15",
    verificationStatus: "VERIFIED",
    lastVerifiedDate: "2026-11-17",
    notes: "Clearing & Settlement holiday; Capital Market is OPEN for normal trading (09:15-15:30 IST)",
  },
];

export const CLEARING_ONLY_HOLIDAYS_2026: Record<string, string> = Object.fromEntries(
  CLEARING_ONLY_HOLIDAYS_EVIDENCE_2026.map((h) => [h.date, h.name])
);

export const CLEARING_HOLIDAYS_2026: Record<string, string> = {
  ...TRADING_HOLIDAYS_2026,
  ...CLEARING_ONLY_HOLIDAYS_2026,
};

export const UNVERIFIED_SEGMENT_HOLIDAYS_2026: HolidayEvidence[] = [
  {
    date: "2026-09-30",
    name: "Quarter-End Forex Reconciliation",
    dayOfWeek: "Wednesday",
    isWeekday: true,
    segment: "CURRENCY_DERIVATIVES",
    circularRef: "RBI/FOREX/UNVERIFIED",
    publicationDate: "2026-01-01",
    verificationStatus: "UNVERIFIED",
    lastVerifiedDate: "2026-11-17",
    notes: "Tentative forex bank reconciliation; requires official RBI circular before promotion",
  },
];

// ============================================================================
// FIXTURE PROVENANCE REGISTRY (Strict Synthetic vs Genuine Classification)
// ============================================================================

export interface FixtureProvenanceRecord {
  filename: string;
  provenance: "SYNTHETIC" | "GENUINE_HISTORICAL" | "SAMPLE";
  expectedBarCount: number;
  expectedSha256: string;
  coverageType: "FULL" | "PARTIAL";
  coverageDescription: string;
  timeframe: string;
  dateRange: string;
  instrument: string;
}

export const FIXTURE_REGISTRY_2026: Record<string, FixtureProvenanceRecord> = {
  "sample_nifty50_1m.csv": {
    filename: "sample_nifty50_1m.csv",
    provenance: "SYNTHETIC",
    expectedBarCount: 375,
    expectedSha256: "a785f1af9aecfc1f69a15536350e3adf9232d81a141bd8592c2091b7f85c3280",
    coverageType: "FULL",
    coverageDescription: "Complete single trading day regular equity session (09:15 to 15:29 IST, 375 bars)",
    timeframe: "1m",
    dateRange: "2026-02-18",
    instrument: "NIFTY50",
  },
  "multiday_overnight_1m.csv": {
    filename: "multiday_overnight_1m.csv",
    provenance: "SYNTHETIC",
    expectedBarCount: 750,
    expectedSha256: "b96ec03a8018976dedf3890c1bedd52fe66033ed82d06fc05ad9966c438b244f",
    coverageType: "FULL",
    coverageDescription: "Complete two consecutive trading days (2026-02-18 and 2026-02-19, 375 bars each, 1 overnight gap)",
    timeframe: "1m",
    dateRange: "2026-02-18 to 2026-02-19",
    instrument: "NIFTY50",
  },
  "corrupted_anomalies_1m.csv": {
    filename: "corrupted_anomalies_1m.csv",
    provenance: "SYNTHETIC",
    expectedBarCount: 100,
    expectedSha256: "5f3eb779a1aae1e52e515816e8cb0be82d8564189a03e076a2e0463127dbb1c8",
    coverageType: "PARTIAL",
    coverageDescription: "Partial session (100 bars) with deliberately injected synthetic defects: 3 duplicates, 11 missing bars, 1 unadjusted split, 1 pre-market bar",
    timeframe: "1m",
    dateRange: "2026-02-18",
    instrument: "NIFTY50",
  },
  "special_sessions_1m.csv": {
    filename: "special_sessions_1m.csv",
    provenance: "SYNTHETIC",
    expectedBarCount: 115,
    expectedSha256: "a5fbf77cc061a7b2bffb785281f442e68985aacecd42eff87e58e71b2c8b1f79",
    coverageType: "PARTIAL",
    coverageDescription: "Partial multi-session synthetic fixture: 45 bars DR session (2026-03-05 09:15-09:59 IST, partial 12% of 375-bar session) + 70 bars Muhurat session (2026-11-08 14:20-15:29 IST, full 100% of continuous trading)",
    timeframe: "1m",
    dateRange: "2026-03-05 to 2026-11-08",
    instrument: "NIFTY50",
  },
};

export interface IstTimeComponents {
  year: number;
  month: number; // 1-12
  day: number;   // 1-31
  dateStr: string; // YYYY-MM-DD
  hours: number;
  minutes: number;
  seconds: number;
  dayOfWeek: number; // 0=Sun, 1=Mon, ..., 6=Sat
  totalMinutes: number;
}

/** Convert Unix millisecond timestamp to detailed IST components (+05:30) */
export function getIstComponents(timestampMs: number): IstTimeComponents {
  const istOffsetMs = 5.5 * 60 * 60 * 1000;
  const d = new Date(timestampMs + istOffsetMs);

  const year = d.getUTCFullYear();
  const month = d.getUTCMonth() + 1;
  const day = d.getUTCDate();
  const hours = d.getUTCHours();
  const minutes = d.getUTCMinutes();
  const seconds = d.getUTCSeconds();
  const dayOfWeek = d.getUTCDay();

  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  const dateStr = `${year}-${pad(month)}-${pad(day)}`;

  return {
    year,
    month,
    day,
    dateStr,
    hours,
    minutes,
    seconds,
    dayOfWeek,
    totalMinutes: hours * 60 + minutes,
  };
}

/** Return list of official weekday trading holiday dates for the given year (16 for 2026) */
export function getWeekdayHolidays(year: number): string[] {
  if (year === 2026) {
    return Object.keys(TRADING_HOLIDAYS_2026).sort();
  }
  return [];
}

/** Return list of holidays falling on weekends (4 for 2026) */
export function getWeekendHolidays(year: number): string[] {
  if (year === 2026) {
    return Object.keys(WEEKEND_HOLIDAYS_2026).sort();
  }
  return [];
}

/** Backward-compatible helper returning official weekday trading holiday dates (16 for 2026) */
export function getHolidaysForYear(year: number): string[] {
  return getWeekdayHolidays(year);
}

/** Return complete evidence records for all holidays (both weekday and weekend, 20 total for 2026) */
export function getAllHolidayEvidence(year: number = 2026): HolidayEvidence[] {
  if (year === 2026) {
    return [...WEEKDAY_HOLIDAYS_EVIDENCE_2026, ...WEEKEND_HOLIDAYS_EVIDENCE_2026].sort((a, b) =>
      a.date.localeCompare(b.date)
    );
  }
  return [];
}

/** Check if a date string YYYY-MM-DD is an official weekday trading holiday */
export function isExchangeHoliday(dateStr: string): boolean {
  return dateStr in TRADING_HOLIDAYS_2026;
}

/** Check if a date string YYYY-MM-DD is a festival/holiday falling on a weekend */
export function isWeekendHoliday(dateStr: string): boolean {
  return dateStr in WEEKEND_HOLIDAYS_2026;
}

/** Check if timestamp falls within the 2026 Muhurat block deal window (13:50 to 14:05 IST) */
export function isMuhuratBlockDeal(timestampMs: number): boolean {
  const ist = getIstComponents(timestampMs);
  if (ist.dateStr === MUHURAT_SESSION_2026.date) {
    const totalSec = ist.hours * 3600 + ist.minutes * 60 + ist.seconds;
    const startSec = MUHURAT_SESSION_2026.blockDealStartMinutes * 60;
    const endSec = MUHURAT_SESSION_2026.blockDealEndMinutes * 60;
    return totalSec >= startSec && totalSec < endSec;
  }
  return false;
}

/**
 * Check if timestamp is within the official Muhurat continuous trading window.
 * Governed by NSE Circular NSE/CMTR/76941:
 * - For CAS securities: 14:20 to 15:15 IST.
 * - For Non-CAS securities (and default): 14:20 to 15:30 IST.
 */
export function isMuhuratSession(
  timestampMs: number,
  securityCategory?: SecurityCategory | string
): boolean {
  const ist = getIstComponents(timestampMs);
  if (ist.dateStr === MUHURAT_SESSION_2026.date) {
    const totalSec = ist.hours * 3600 + ist.minutes * 60 + ist.seconds;
    const startSec = MUHURAT_SESSION_2026.tradingStartMinutes * 60;
    if (securityCategory !== undefined && securityCategory !== null) {
      const cat = validateSecurityCategory(securityCategory);
      if (cat === "CAS_ELIGIBLE") {
        const endSec = MUHURAT_SESSION_2026.casContinuousEndMinutes * 60;
        return totalSec >= startSec && totalSec < endSec;
      } else if (cat === "NON_CAS") {
        const endSec = MUHURAT_SESSION_2026.tradingEndMinutes * 60;
        return totalSec >= startSec && totalSec <= endSec;
      } else {
        return false;
      }
    }
    const endSec = MUHURAT_SESSION_2026.tradingEndMinutes * 60;
    return totalSec >= startSec && totalSec <= endSec;
  }
  return false;
}

/** Check if timestamp is within Muhurat pre-open (14:05 to 14:20 IST) */
export function isMuhuratPreOpen(timestampMs: number): boolean {
  const ist = getIstComponents(timestampMs);
  if (ist.dateStr === MUHURAT_SESSION_2026.date) {
    const totalSec = ist.hours * 3600 + ist.minutes * 60 + ist.seconds;
    const startSec = MUHURAT_SESSION_2026.preOpenStartMinutes * 60;
    const endSec = MUHURAT_SESSION_2026.preOpenEndMinutes * 60;
    return totalSec >= startSec && totalSec < endSec;
  }
  return false;
}

/** Check if timestamp is within Muhurat post-close (15:50 to 16:00 IST) */
export function isMuhuratPostClose(timestampMs: number): boolean {
  const ist = getIstComponents(timestampMs);
  if (ist.dateStr === MUHURAT_SESSION_2026.date) {
    const totalSec = ist.hours * 3600 + ist.minutes * 60 + ist.seconds;
    const startSec = MUHURAT_SESSION_2026.postCloseStartMinutes * 60;
    const endSec = MUHURAT_SESSION_2026.postCloseEndMinutes * 60;
    return totalSec >= startSec && totalSec <= endSec;
  }
  return false;
}

/** Explicitly declare the exchange segment scope for this calendar (CAPITAL_MARKET) */
export function getCalendarSegment(): string {
  return "CAPITAL_MARKET";
}

/**
 * Evaluate exact microstructural phase of Diwali Muhurat Trading Session (Sunday 2026-11-08)
 * per official circular NSE/CMTR/76941.
 * By default, maintains 100% backward compatibility with Phase 7.4.2.
 * When includeBlockDeal=true, identifies BLOCK_DEAL (13:50-14:05).
 * When granularCas=true, distinguishes CAS_LIMIT_ONLY (15:25-15:30) from CLOSING_AUCTION_ENTRY (15:20-15:25).
 */
export function getMuhuratPhase(
  timestampMs: number,
  includeBlockDeal = false,
  granularCas = false
): MuhuratSessionPhase {
  const ist = getIstComponents(timestampMs);
  if (ist.dateStr !== MUHURAT_SESSION_2026.date) {
    return "CLOSED";
  }

  const totalSec = ist.hours * 3600 + ist.minutes * 60 + ist.seconds;
  const t1350 = 13 * 3600 + 50 * 60;
  const t1405 = 14 * 3600 + 5 * 60;
  const t1410 = 14 * 3600 + 10 * 60;
  const t1415 = 14 * 3600 + 15 * 60;
  const t1417 = 14 * 3600 + 17 * 60;
  const t1420 = 14 * 3600 + 20 * 60;
  const t1515 = 15 * 3600 + 15 * 60;
  const t1520 = 15 * 3600 + 20 * 60;
  const t1525 = 15 * 3600 + 25 * 60;
  const t1530 = 15 * 3600 + 30 * 60;
  const t1535 = 15 * 3600 + 35 * 60;
  const t1550 = 15 * 3600 + 50 * 60;
  const t1600 = 16 * 3600;

  if (totalSec < t1350) return "CLOSED";
  if (totalSec < t1405) return includeBlockDeal ? "BLOCK_DEAL" : "CLOSED";
  if (totalSec < t1410) return "PRE_OPEN_ENTRY";
  if (totalSec < t1415) return "PRE_OPEN_LIMIT_ONLY";
  if (totalSec < t1417) return "PRE_OPEN_MATCHING";
  if (totalSec < t1420) return "PRE_OPEN_BUFFER";
  if (totalSec < t1515) return "CONTINUOUS_TRADING";
  if (totalSec < t1520) return "CAS_TRANSITION";
  if (totalSec < t1525) return "CLOSING_AUCTION_ENTRY";
  if (totalSec < t1530) return granularCas ? "CAS_LIMIT_ONLY" : "CLOSING_AUCTION_ENTRY";
  if (totalSec < t1535) return "CLOSING_AUCTION_MATCHING";
  if (totalSec < t1550) return "CAS_TRANSITION_BUFFER";
  if (totalSec <= t1600) return "CLOSING_SESSION";
  return "CLOSED";
}

/** Check if a date string YYYY-MM-DD is a clearing/settlement holiday */
export function isClearingHoliday(dateStr: string): boolean {
  return dateStr in CLEARING_HOLIDAYS_2026;
}

/** Check if a date string YYYY-MM-DD is open for trading despite being a clearing holiday */
export function isTradingDayOnClearingHoliday(dateStr: string): boolean {
  return dateStr in CLEARING_ONLY_HOLIDAYS_2026;
}

/** Return all clearing holiday dates for the given year */
export function getClearingHolidays(year: number): string[] {
  if (year === 2026) {
    return Object.keys(CLEARING_HOLIDAYS_2026).sort();
  }
  return [];
}

/** Return the 4 clearing-only holidays that trade normally */
export function getClearingOnlyHolidays(year: number): string[] {
  if (year === 2026) {
    return Object.keys(CLEARING_ONLY_HOLIDAYS_2026).sort();
  }
  return [];
}

/** Return verified provenance evidence for all clearing holidays */
export function getClearingHolidayEvidence(year = 2026): HolidayEvidence[] {
  if (year === 2026) {
    return [
      ...WEEKDAY_HOLIDAYS_EVIDENCE_2026,
      ...CLEARING_ONLY_HOLIDAYS_EVIDENCE_2026,
    ].sort((a, b) => a.date.localeCompare(b.date));
  }
  return [];
}

/** Return evidence records marked UNVERIFIED pending official circulars */
export function getUnverifiedSegmentEvidence(year = 2026): HolidayEvidence[] {
  if (year === 2026) {
    return UNVERIFIED_SEGMENT_HOLIDAYS_2026;
  }
  return [];
}

/** Retrieve explicit fixture provenance record by filename */
export function getFixtureProvenance(
  filename: string
): FixtureProvenanceRecord | undefined {
  return FIXTURE_REGISTRY_2026[filename];
}

/** Return complete fixture registry */
export function getAllFixtureProvenance(): Record<string, FixtureProvenanceRecord> {
  return FIXTURE_REGISTRY_2026;
}

/**
 * Check if timestamp is within an official DR site live trading session.
 * Governed by NSE Circular NSE/MSD/73126:
 * - 2026-03-05 and 2026-03-06 (Thursday & Friday) from 09:15 to 15:30 IST.
 * - Saturday 2026-03-07 has NO trading (strictly false).
 */
export function isDrSession(timestampMs: number): boolean {
  const ist = getIstComponents(timestampMs);
  const totalSec = ist.hours * 3600 + ist.minutes * 60 + ist.seconds;
  for (const dr of DR_SESSIONS_2026) {
    if (ist.dateStr === dr.date && dr.site === "DR_SITE") {
      const startSec = dr.tradingStartMinutes * 60;
      const endSec = dr.tradingEndMinutes * 60;
      if (totalSec >= startSec && totalSec <= endSec) {
        return true;
      }
    }
  }
  return false;
}

/** Validate and return SecurityCategory type. Throws Error on invalid/missing input. */
export function validateSecurityCategory(category: any): SecurityCategory {
  if (category === undefined || category === null) {
    throw new Error("Security category cannot be null or undefined. Must specify a valid SecurityCategory.");
  }
  const validCategories: SecurityCategory[] = [
    "CAS_ELIGIBLE",
    "NON_CAS",
    "SPECIAL_PREOPEN_IPO",
    "ILLIQUID_CALL_AUCTION",
  ];
  if (typeof category === "string") {
    const catUpper = category.trim().toUpperCase() as SecurityCategory;
    if (validCategories.includes(catUpper)) {
      return catUpper;
    }
  }
  throw new Error(`Invalid security category: '${category}'. Valid categories are: ${validCategories.join(", ")}`);
}

/**
 * Resolve the date-effective regulatory schedule version for a given trading date,
 * market segment, and security category.
 * - LEGACY: Before 2026-08-03 (effectiveFrom = "2010-01-04", effectiveTo = "2026-08-02")
 * - CAS_V1: 2026-08-03 through 2026-12-06 (effectiveFrom = "2026-08-03", effectiveTo = "2026-12-06")
 * - CAS_V2: Effective from 2026-12-07 onwards (effectiveFrom = "2026-12-07", effectiveTo = null)
 */
export function resolveScheduleVersion(
  targetDate: Date | string | number,
  _segment = "CAPITAL_MARKET",
  _securityCategory?: SecurityCategory | string
): ScheduleVersionSpec {
  let dateStr: string;
  if (targetDate instanceof Date) {
    dateStr = getIstComponents(targetDate.getTime()).dateStr;
  } else if (typeof targetDate === "number") {
    dateStr = getIstComponents(targetDate).dateStr;
  } else {
    dateStr = String(targetDate).slice(0, 10);
  }

  if (dateStr < CAS_V1_GO_LIVE_DATE) {
    return SCHEDULE_VERSIONS_REGISTRY.LEGACY;
  } else if (dateStr <= CAS_V1_SUNSET_DATE) {
    return SCHEDULE_VERSIONS_REGISTRY.CAS_V1;
  } else {
    return SCHEDULE_VERSIONS_REGISTRY.CAS_V2;
  }
}

/** Alias for resolveScheduleVersion */
export function getScheduleVersion(
  targetDate: Date | string | number,
  segment = "CAPITAL_MARKET",
  securityCategory?: SecurityCategory | string
): ScheduleVersionSpec {
  return resolveScheduleVersion(targetDate, segment, securityCategory);
}

/**
 * Evaluate the intraday session state defined by the date-effective schedule version,
 * independent of exchange weekend/holiday calendar closure.
 */
export function evaluateScheduleSession(
  targetDate: Date | string | number,
  sessionTime: { hour: number; minute: number; second?: number } | string,
  securityCategory: SecurityCategory | string = "NON_CAS",
  exchange = "NSE"
): SecuritySessionEvaluation {
  let dateStr: string;
  if (targetDate instanceof Date) {
    const ist = getIstComponents(targetDate.getTime());
    dateStr = ist.dateStr;
  } else if (typeof targetDate === "number") {
    const ist = getIstComponents(targetDate);
    dateStr = ist.dateStr;
  } else {
    dateStr = targetDate.slice(0, 10);
  }

  let h: number, m: number, s: number;
  if (typeof sessionTime === "string") {
    const parts = sessionTime.split(":").map(Number);
    h = parts[0] || 0;
    m = parts[1] || 0;
    s = parts[2] || 0;
  } else {
    h = sessionTime.hour;
    m = sessionTime.minute;
    s = sessionTime.second || 0;
  }

  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  const isoStr = `${dateStr}T${pad(h)}:${pad(m)}:${pad(s)}+05:30`;
  const tsMs = new Date(isoStr).getTime();
  return evaluateSessionInstant(tsMs, securityCategory, exchange, undefined, true);
}

/**
 * Evaluate exact microstructural session state at a precise instant in time,
 * enforcing strictly half-open interval semantics [T_start, T_end).
 *
 * Rule: A session's closing timestamp is EXCLUSIVE and is NOT a valid trading instant
 * for the terminating session.
 * - Regular Market Continuous: [09:15:00, 15:30:00) -> at 15:30:00, continuous has ended; state is BUFFER.
 * - Regular Closing Session:   [15:40:00, 16:00:00) -> at 16:00:00, market has closed; state is CLOSED.
 * - Muhurat CAS Matching:     [15:30:00, 15:35:00) -> at 15:35:00, matching has ended; state is CAS_TRANSITION_BUFFER.
 * - Muhurat Post-Close:       [15:50:00, 16:00:00) -> at 16:00:00, market has closed; state is CLOSED.
 */
export function evaluateSessionInstant(
  timestampMs: number,
  securityCategory: SecurityCategory | string = "NON_CAS",
  exchange = "NSE",
  calendarRegime?: CalendarRegime | string,
  ignoreHolidays = false
): SecuritySessionEvaluation {
  const cat = validateSecurityCategory(securityCategory);
  const ist = getIstComponents(timestampMs);
  const totalSec = ist.hours * 3600 + ist.minutes * 60 + ist.seconds;
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  const datetimeIst = `${ist.dateStr}T${pad(ist.hours)}:${pad(ist.minutes)}:${pad(ist.seconds)}+05:30`;

  // 1. Diwali Muhurat Session (Sunday 2026-11-08)
  if (ist.dateStr === MUHURAT_SESSION_2026.date) {
    const tBlockStart = 13 * 3600 + 50 * 60;   // 13:50:00
    const tBlockEnd = 14 * 3600 + 5 * 60;      // 14:05:00
    const tPreLimit = 14 * 3600 + 10 * 60;     // 14:10:00
    const tPreMatch = 14 * 3600 + 15 * 60;     // 14:15:00
    const tPreBuf = 14 * 3600 + 17 * 60;       // 14:17:00
    const tContOpen = 14 * 3600 + 20 * 60;     // 14:20:00
    const tCasContEnd = 15 * 3600 + 15 * 60;  // 15:15:00
    const tCasTransEnd = 15 * 3600 + 20 * 60; // 15:20:00
    const tCasEntryEnd = 15 * 3600 + 25 * 60; // 15:25:00
    const tCasLimitEnd = 15 * 3600 + 30 * 60; // 15:30:00
    const tCasMatchEnd = 15 * 3600 + 35 * 60; // 15:35:00
    const tCasBufEnd = 15 * 3600 + 50 * 60;   // 15:50:00
    const tPostEnd = 16 * 3600;                // 16:00:00

    if (totalSec < tBlockStart) {
      return {
        datetimeIst,
        securityCategory: cat,
        sessionType: "CLOSED",
        granularPhase: "CLOSED",
        isContinuousTrading: false,
        isOrderEntryAllowed: false,
        orderTypeAllowed: "NONE",
        isRandomClosureInterval: false,
        description: "Market closed before Muhurat session",
      };
    } else if (totalSec < tBlockEnd) {
      return {
        datetimeIst,
        securityCategory: cat,
        sessionType: "BLOCK_DEAL",
        granularPhase: "BLOCK_DEAL",
        isContinuousTrading: false,
        isOrderEntryAllowed: false,
        orderTypeAllowed: "NONE",
        isRandomClosureInterval: false,
        description: "Bilateral block deal session window per circular NSE/CMTR/76941",
      };
    } else if (totalSec < tPreLimit) {
      return {
        datetimeIst,
        securityCategory: cat,
        sessionType: "PRE_OPEN",
        granularPhase: "PRE_OPEN_ENTRY",
        isContinuousTrading: false,
        isOrderEntryAllowed: true,
        orderTypeAllowed: "ALL",
        isRandomClosureInterval: false,
        description: "Muhurat Pre-Open Order Entry (Market & Limit orders)",
      };
    } else if (totalSec < tPreMatch) {
      const isRand = totalSec >= (14 * 3600 + 13 * 60);
      return {
        datetimeIst,
        securityCategory: cat,
        sessionType: "PRE_OPEN",
        granularPhase: "PRE_OPEN_LIMIT_ONLY",
        isContinuousTrading: false,
        isOrderEntryAllowed: true,
        orderTypeAllowed: "LIMIT_ONLY",
        isRandomClosureInterval: isRand,
        randomClosureWindow: isRand ? RANDOM_CLOSURE_WINDOWS.MUHURAT_PRE_OPEN : undefined,
        description: "Muhurat Pre-Open Limit-Only Order Entry (Random closure window 14:13-14:15)",
      };
    } else if (totalSec < tPreBuf) {
      return {
        datetimeIst,
        securityCategory: cat,
        sessionType: "PRE_OPEN",
        granularPhase: "PRE_OPEN_MATCHING",
        isContinuousTrading: false,
        isOrderEntryAllowed: false,
        orderTypeAllowed: "NONE",
        isRandomClosureInterval: false,
        description: "Muhurat Pre-Open Order Matching & Trade Confirmation",
      };
    } else if (totalSec < tContOpen) {
      return {
        datetimeIst,
        securityCategory: cat,
        sessionType: "PRE_OPEN",
        granularPhase: "PRE_OPEN_BUFFER",
        isContinuousTrading: false,
        isOrderEntryAllowed: false,
        orderTypeAllowed: "NONE",
        isRandomClosureInterval: false,
        description: "Muhurat Pre-Open Transition Buffer",
      };
    } else if (totalSec < tCasContEnd) {
      if (cat === "ILLIQUID_CALL_AUCTION") {
        return {
          datetimeIst,
          securityCategory: cat,
          sessionType: "CLOSED",
          granularPhase: "CLOSED",
          isContinuousTrading: false,
          isOrderEntryAllowed: false,
          orderTypeAllowed: "NONE",
          isRandomClosureInterval: false,
          description: "Illiquid securities have zero continuous trading",
        };
      }
      return {
        datetimeIst,
        securityCategory: cat,
        sessionType: "SPECIAL_MUHURAT",
        granularPhase: "CONTINUOUS_TRADING",
        isContinuousTrading: true,
        isOrderEntryAllowed: true,
        orderTypeAllowed: "ALL",
        isRandomClosureInterval: false,
        description: "Diwali Muhurat Continuous Trading Session",
      };
    } else if (totalSec < tCasTransEnd) {
      if (cat === "CAS_ELIGIBLE") {
        return {
          datetimeIst,
          securityCategory: cat,
          sessionType: "SPECIAL_CAS",
          granularPhase: "CAS_TRANSITION",
          isContinuousTrading: false,
          isOrderEntryAllowed: false,
          orderTypeAllowed: "NONE",
          isRandomClosureInterval: false,
          description: "Muhurat CAS Reference Price Calculation / Transition",
        };
      } else if (cat === "NON_CAS") {
        return {
          datetimeIst,
          securityCategory: cat,
          sessionType: "SPECIAL_MUHURAT",
          granularPhase: "CONTINUOUS_TRADING",
          isContinuousTrading: true,
          isOrderEntryAllowed: true,
          orderTypeAllowed: "ALL",
          isRandomClosureInterval: false,
          description: "Muhurat Continuous Trading Session (Non-CAS continues to 15:30)",
        };
      } else {
        return {
          datetimeIst,
          securityCategory: cat,
          sessionType: "CLOSED",
          granularPhase: "CLOSED",
          isContinuousTrading: false,
          isOrderEntryAllowed: false,
          orderTypeAllowed: "NONE",
          isRandomClosureInterval: false,
          description: "Closed",
        };
      }
    } else if (totalSec < tCasEntryEnd) {
      if (cat === "CAS_ELIGIBLE") {
        return {
          datetimeIst,
          securityCategory: cat,
          sessionType: "SPECIAL_CAS",
          granularPhase: "CLOSING_AUCTION_ENTRY",
          isContinuousTrading: false,
          isOrderEntryAllowed: true,
          orderTypeAllowed: "ALL",
          isRandomClosureInterval: false,
          description: "Muhurat CAS Order Entry (Market & Limit orders)",
        };
      } else if (cat === "NON_CAS") {
        return {
          datetimeIst,
          securityCategory: cat,
          sessionType: "SPECIAL_MUHURAT",
          granularPhase: "CONTINUOUS_TRADING",
          isContinuousTrading: true,
          isOrderEntryAllowed: true,
          orderTypeAllowed: "ALL",
          isRandomClosureInterval: false,
          description: "Muhurat Continuous Trading Session (Non-CAS continues to 15:30)",
        };
      } else {
        return {
          datetimeIst,
          securityCategory: cat,
          sessionType: "CLOSED",
          granularPhase: "CLOSED",
          isContinuousTrading: false,
          isOrderEntryAllowed: false,
          orderTypeAllowed: "NONE",
          isRandomClosureInterval: false,
          description: "Closed",
        };
      }
    } else if (totalSec < tCasLimitEnd) {
      if (cat === "CAS_ELIGIBLE") {
        const isRand = totalSec >= (15 * 3600 + 28 * 60);
        return {
          datetimeIst,
          securityCategory: cat,
          sessionType: "SPECIAL_CAS",
          granularPhase: "CAS_LIMIT_ONLY",
          isContinuousTrading: false,
          isOrderEntryAllowed: true,
          orderTypeAllowed: "LIMIT_ONLY",
          isRandomClosureInterval: isRand,
          randomClosureWindow: isRand ? RANDOM_CLOSURE_WINDOWS.MUHURAT_CAS : undefined,
          description: "Muhurat CAS Limit-Only Entry (Random closure window 15:28-15:30)",
        };
      } else if (cat === "NON_CAS") {
        return {
          datetimeIst,
          securityCategory: cat,
          sessionType: "SPECIAL_MUHURAT",
          granularPhase: "CONTINUOUS_TRADING",
          isContinuousTrading: true,
          isOrderEntryAllowed: true,
          orderTypeAllowed: "ALL",
          isRandomClosureInterval: false,
          description: "Muhurat Continuous Trading Session (Non-CAS continues to 15:30)",
        };
      } else {
        return {
          datetimeIst,
          securityCategory: cat,
          sessionType: "CLOSED",
          granularPhase: "CLOSED",
          isContinuousTrading: false,
          isOrderEntryAllowed: false,
          orderTypeAllowed: "NONE",
          isRandomClosureInterval: false,
          description: "Closed",
        };
      }
    } else if (totalSec < tCasMatchEnd) {
      if (cat === "CAS_ELIGIBLE") {
        return {
          datetimeIst,
          securityCategory: cat,
          sessionType: "SPECIAL_CAS",
          granularPhase: "CLOSING_AUCTION_MATCHING",
          isContinuousTrading: false,
          isOrderEntryAllowed: false,
          orderTypeAllowed: "NONE",
          isRandomClosureInterval: false,
          description: "Muhurat CAS Order Matching & Price Discovery",
        };
      } else {
        return {
          datetimeIst,
          securityCategory: cat,
          sessionType: "CLOSED",
          granularPhase: "CLOSED",
          isContinuousTrading: false,
          isOrderEntryAllowed: false,
          orderTypeAllowed: "NONE",
          isRandomClosureInterval: false,
          description: "Normal market closed at 15:30",
        };
      }
    } else if (totalSec < tCasBufEnd) {
      if (cat === "CAS_ELIGIBLE") {
        return {
          datetimeIst,
          securityCategory: cat,
          sessionType: "SPECIAL_CAS",
          granularPhase: "CAS_TRANSITION_BUFFER",
          isContinuousTrading: false,
          isOrderEntryAllowed: false,
          orderTypeAllowed: "NONE",
          isRandomClosureInterval: false,
          description: "Muhurat CAS Post-Auction Buffer & Reconciliation",
        };
      } else {
        return {
          datetimeIst,
          securityCategory: cat,
          sessionType: "CLOSED",
          granularPhase: "CLOSED",
          isContinuousTrading: false,
          isOrderEntryAllowed: false,
          orderTypeAllowed: "NONE",
          isRandomClosureInterval: false,
          description: "Normal market closed at 15:30",
        };
      }
    } else if (totalSec < tPostEnd) {
      return {
        datetimeIst,
        securityCategory: cat,
        sessionType: "POST_CLOSE",
        granularPhase: "CLOSING_SESSION",
        isContinuousTrading: false,
        isOrderEntryAllowed: true,
        orderTypeAllowed: "LIMIT_ONLY",
        isRandomClosureInterval: false,
        description: "Official Closing Session / Post-Close Trading at determined closing price",
      };
    } else {
      return {
        datetimeIst,
        securityCategory: cat,
        sessionType: "CLOSED",
        granularPhase: "CLOSED",
        isContinuousTrading: false,
        isOrderEntryAllowed: false,
        orderTypeAllowed: "NONE",
        isRandomClosureInterval: false,
        description: "Market closed",
      };
    }
  }

  // 2. Weekends & Official Holidays
  if (!ignoreHolidays && !calendarRegime && (ist.dayOfWeek === 0 || ist.dayOfWeek === 6 || isExchangeHoliday(ist.dateStr))) {
    return {
      datetimeIst,
      securityCategory: cat,
      sessionType: "CLOSED",
      granularPhase: "CLOSED",
      isContinuousTrading: false,
      isOrderEntryAllowed: false,
      orderTypeAllowed: "NONE",
      isRandomClosureInterval: false,
      description: "Market closed (Weekend or Exchange Holiday)",
    };
  }

  const baseRegType: SessionType = isDrSession(timestampMs) ? "SPECIAL_DR" : "REGULAR";

  // 3. Special Pre-Open Session (SPOS) for IPO / Relisted Securities
  if (cat === "SPECIAL_PREOPEN_IPO") {
    let sposRegime: CalendarRegime;
    if (calendarRegime) {
      if (calendarRegime === "CAS_V2") {
        sposRegime = "CAS_V2";
      } else if (calendarRegime === "CAS_V1" || calendarRegime === "MODERN_CAS_2026") {
        sposRegime = "CAS_V1";
      } else {
        sposRegime = "LEGACY_PRE_CAS";
      }
    } else {
      if (ist.dateStr < CAS_V1_GO_LIVE_DATE) {
        sposRegime = "LEGACY_PRE_CAS";
      } else if (ist.dateStr <= CAS_V1_SUNSET_DATE) {
        sposRegime = "CAS_V1";
      } else {
        sposRegime = "CAS_V2";
      }
    }

    const tSposStart = 9 * 3600;
    const tSposRandStart = 9 * 3600 + 35 * 60;
    const tSposEntryEnd = 9 * 3600 + 45 * 60;
    const tSposMatchEnd = 9 * 3600 + 55 * 60;
    const tSposContOpen = 10 * 3600;
    const tMktClose = 15 * 3600 + 30 * 60;
    const tCasMatchEnd = sposRegime === "CAS_V1" ? 15 * 3600 + 35 * 60 : (sposRegime === "CAS_V2" ? 15 * 3600 + 45 * 60 : 15 * 3600 + 40 * 60);
    const tPostStart = (sposRegime === "CAS_V1" || sposRegime === "CAS_V2") ? 15 * 3600 + 50 * 60 : 15 * 3600 + 40 * 60;
    const tPostEnd = 16 * 3600;

    if (totalSec < tSposStart) {
      return {
        datetimeIst,
        securityCategory: cat,
        sessionType: "CLOSED",
        granularPhase: "CLOSED",
        isContinuousTrading: false,
        isOrderEntryAllowed: false,
        orderTypeAllowed: "NONE",
        isRandomClosureInterval: false,
        description: "Pre-market closed before SPOS",
      };
    } else if (totalSec < tSposRandStart) {
      return {
        datetimeIst,
        securityCategory: cat,
        sessionType: "SPECIAL_PREOPEN",
        granularPhase: "SPOS_ORDER_ENTRY",
        isContinuousTrading: false,
        isOrderEntryAllowed: true,
        orderTypeAllowed: "ALL",
        isRandomClosureInterval: false,
        description: "Special Pre-Open Session Order Entry (Market & Limit orders)",
      };
    } else if (totalSec < tSposEntryEnd) {
      return {
        datetimeIst,
        securityCategory: cat,
        sessionType: "SPECIAL_PREOPEN",
        granularPhase: "SPOS_ORDER_ENTRY",
        isContinuousTrading: false,
        isOrderEntryAllowed: true,
        orderTypeAllowed: "ALL",
        isRandomClosureInterval: true,
        randomClosureWindow: RANDOM_CLOSURE_WINDOWS.SPOS_IPO,
        description: "Special Pre-Open Session Order Entry (Random closure window 09:35-09:45)",
      };
    } else if (totalSec < tSposMatchEnd) {
      return {
        datetimeIst,
        securityCategory: cat,
        sessionType: "SPECIAL_PREOPEN",
        granularPhase: "SPOS_MATCHING",
        isContinuousTrading: false,
        isOrderEntryAllowed: false,
        orderTypeAllowed: "NONE",
        isRandomClosureInterval: false,
        description: "Special Pre-Open Session Order Matching & Price Discovery",
      };
    } else if (totalSec < tSposContOpen) {
      return {
        datetimeIst,
        securityCategory: cat,
        sessionType: "SPECIAL_PREOPEN",
        granularPhase: "SPOS_BUFFER",
        isContinuousTrading: false,
        isOrderEntryAllowed: false,
        orderTypeAllowed: "NONE",
        isRandomClosureInterval: false,
        description: "Special Pre-Open Session Buffer Period before Continuous Trading",
      };
    } else if (totalSec < tMktClose) {
      return {
        datetimeIst,
        securityCategory: cat,
        sessionType: baseRegType,
        granularPhase: "CONTINUOUS_TRADING",
        isContinuousTrading: true,
        isOrderEntryAllowed: true,
        orderTypeAllowed: "ALL",
        isRandomClosureInterval: false,
        description: "Continuous Trading Session for IPO/Relisted Security (10:00-15:30 IST)",
      };
    } else if (totalSec < tPostStart) {
      if (sposRegime === "CAS_V2") {
        if (totalSec < 15 * 3600 + 40 * 60) {
          return {
            datetimeIst,
            securityCategory: cat,
            sessionType: "SPECIAL_CAS",
            granularPhase: "BUFFER",
            isContinuousTrading: false,
            isOrderEntryAllowed: false,
            orderTypeAllowed: "NONE",
            isRandomClosureInterval: false,
            description: "SPOS scrip post-continuous buffer before CAS 2.0 matching",
          };
        } else if (totalSec < 15 * 3600 + 45 * 60) {
          return {
            datetimeIst,
            securityCategory: cat,
            sessionType: "SPECIAL_CAS",
            granularPhase: "CLOSING_AUCTION_MATCHING",
            isContinuousTrading: false,
            isOrderEntryAllowed: false,
            orderTypeAllowed: "NONE",
            isRandomClosureInterval: false,
            description: "SPOS scrip closing auction matching period",
          };
        } else {
          return {
            datetimeIst,
            securityCategory: cat,
            sessionType: "SPECIAL_CAS",
            granularPhase: "TRANSITION_PERIOD",
            isContinuousTrading: false,
            isOrderEntryAllowed: false,
            orderTypeAllowed: "NONE",
            isRandomClosureInterval: false,
            description: "SPOS scrip post-auction transition period buffer",
          };
        }
      } else if (sposRegime === "CAS_V1") {
        if (totalSec < tCasMatchEnd) {
          return {
            datetimeIst,
            securityCategory: cat,
            sessionType: "SPECIAL_CAS",
            granularPhase: "CLOSING_AUCTION_MATCHING",
            isContinuousTrading: false,
            isOrderEntryAllowed: false,
            orderTypeAllowed: "NONE",
            isRandomClosureInterval: false,
            description: "SPOS scrip closing auction matching period",
          };
        } else {
          return {
            datetimeIst,
            securityCategory: cat,
            sessionType: "SPECIAL_CAS",
            granularPhase: "TRANSITION_PERIOD",
            isContinuousTrading: false,
            isOrderEntryAllowed: false,
            orderTypeAllowed: "NONE",
            isRandomClosureInterval: false,
            description: "SPOS scrip post-auction transition period buffer",
          };
        }
      } else {
        return {
          datetimeIst,
          securityCategory: cat,
          sessionType: "CLOSED",
          granularPhase: "BUFFER",
          isContinuousTrading: false,
          isOrderEntryAllowed: false,
          orderTypeAllowed: "NONE",
          isRandomClosureInterval: false,
          description: "Post-market buffer",
        };
      }
    } else if (totalSec < tPostEnd) {
      return {
        datetimeIst,
        securityCategory: cat,
        sessionType: "POST_CLOSE",
        granularPhase: "CLOSING_SESSION",
        isContinuousTrading: false,
        isOrderEntryAllowed: true,
        orderTypeAllowed: "LIMIT_ONLY",
        isRandomClosureInterval: false,
        description: "Closing Session / Post-Close Trading at determined closing price",
      };
    } else {
      return {
        datetimeIst,
        securityCategory: cat,
        sessionType: "CLOSED",
        granularPhase: "CLOSED",
        isContinuousTrading: false,
        isOrderEntryAllowed: false,
        orderTypeAllowed: "NONE",
        isRandomClosureInterval: false,
        description: "Market closed",
      };
    }
  }

  // 4. Periodic Call Auction for Illiquid Securities (PCAIS)
  if (cat === "ILLIQUID_CALL_AUCTION") {
    const tPcaisOpen = 9 * 3600 + 30 * 60;   // 09:30:00
    const tPcaisClose = 15 * 3600 + 30 * 60; // 15:30:00

    if (totalSec < tPcaisOpen || totalSec >= tPcaisClose) {
      return {
        datetimeIst,
        securityCategory: cat,
        sessionType: "CLOSED",
        granularPhase: "CLOSED",
        isContinuousTrading: false,
        isOrderEntryAllowed: false,
        orderTypeAllowed: "NONE",
        isRandomClosureInterval: false,
        description: "Closed (Periodic Call Auction active only 09:30 to 15:30)",
      };
    }

    const cycleIdx = Math.floor((totalSec - tPcaisOpen) / 3600);
    const cycleStart = tPcaisOpen + cycleIdx * 3600;
    const secInCycle = totalSec - cycleStart;
    const cycleNum = cycleIdx + 1;

    if (secInCycle < 45 * 60) {
      const isRand = secInCycle >= 44 * 60;
      const randStartSec = cycleStart + 44 * 60;
      const randEndSec = cycleStart + 45 * 60;
      const randStartH = Math.floor(randStartSec / 3600);
      const randStartM = Math.floor((randStartSec % 3600) / 60);
      const randEndH = Math.floor(randEndSec / 3600);
      const randEndM = Math.floor((randEndSec % 3600) / 60);
      const randWin: RandomClosureWindow = {
        windowStart: `${pad(randStartH)}:${pad(randStartM)}:00`,
        windowEnd: `${pad(randEndH)}:${pad(randEndM)}:00`,
        description: `PCAIS Cycle ${cycleNum} Random Order Closure Window (final 1 min)`,
      };

      return {
        datetimeIst,
        securityCategory: cat,
        sessionType: "CALL_AUCTION",
        granularPhase: `CALL_AUCTION_ORDER_ENTRY_CYCLE_${cycleNum}`,
        isContinuousTrading: false,
        isOrderEntryAllowed: true,
        orderTypeAllowed: "ALL",
        isRandomClosureInterval: isRand,
        randomClosureWindow: isRand ? randWin : undefined,
        description: `Periodic Call Auction Cycle ${cycleNum} Order Entry (45 mins)`,
      };
    } else if (secInCycle < 53 * 60) {
      return {
        datetimeIst,
        securityCategory: cat,
        sessionType: "CALL_AUCTION",
        granularPhase: `CALL_AUCTION_MATCHING_CYCLE_${cycleNum}`,
        isContinuousTrading: false,
        isOrderEntryAllowed: false,
        orderTypeAllowed: "NONE",
        isRandomClosureInterval: false,
        description: `Periodic Call Auction Cycle ${cycleNum} Order Matching (8 mins)`,
      };
    } else {
      return {
        datetimeIst,
        securityCategory: cat,
        sessionType: "CALL_AUCTION",
        granularPhase: `CALL_AUCTION_BUFFER_CYCLE_${cycleNum}`,
        isContinuousTrading: false,
        isOrderEntryAllowed: false,
        orderTypeAllowed: "NONE",
        isRandomClosureInterval: false,
        description: `Periodic Call Auction Cycle ${cycleNum} Buffer (7 mins)`,
      };
    }
  }

  // 5. CAS_ELIGIBLE and NON_CAS on Regular Trading Days
  let regime: CalendarRegime;
  if (calendarRegime) {
    if (calendarRegime === "CAS_V2") {
      regime = "CAS_V2";
    } else if (calendarRegime === "CAS_V1" || calendarRegime === "MODERN_CAS_2026") {
      regime = "CAS_V1";
    } else {
      regime = "LEGACY";
    }
  } else {
    const schedVer = resolveScheduleVersion(ist.dateStr, exchange, cat);
    if (schedVer.versionId === "CAS_V2") {
      regime = "CAS_V2";
    } else if (schedVer.versionId === "CAS_V1") {
      regime = "CAS_V1";
    } else {
      regime = "LEGACY";
    }
  }

  const tPreStart = 9 * 3600;
  const tPreLimit = 9 * 3600 + 7 * 60;
  const tPreMatch = 9 * 3600 + 8 * 60;
  const tPreBuf = 9 * 3600 + 12 * 60;
  const tContOpen = 9 * 3600 + 15 * 60;

  if (totalSec < tPreStart) {
    return {
      datetimeIst,
      securityCategory: cat,
      sessionType: "CLOSED",
      granularPhase: "CLOSED",
      isContinuousTrading: false,
      isOrderEntryAllowed: false,
      orderTypeAllowed: "NONE",
      isRandomClosureInterval: false,
      description: "Market closed before pre-open",
    };
  } else if (totalSec < tPreLimit) {
    return {
      datetimeIst,
      securityCategory: cat,
      sessionType: "PRE_OPEN",
      granularPhase: "PRE_OPEN_ENTRY",
      isContinuousTrading: false,
      isOrderEntryAllowed: true,
      orderTypeAllowed: "ALL",
      isRandomClosureInterval: false,
      description: "Pre-Open Order Entry (Market & Limit orders)",
    };
  } else if (totalSec < tPreMatch) {
    return {
      datetimeIst,
      securityCategory: cat,
      sessionType: "PRE_OPEN",
      granularPhase: "PRE_OPEN_LIMIT_ONLY",
      isContinuousTrading: false,
      isOrderEntryAllowed: true,
      orderTypeAllowed: "LIMIT_ONLY",
      isRandomClosureInterval: true,
      randomClosureWindow: RANDOM_CLOSURE_WINDOWS.REGULAR_PRE_OPEN,
      description: "Pre-Open Limit-Only Order Entry (Random closure window 09:07-09:08)",
    };
  } else if (totalSec < tPreBuf) {
    return {
      datetimeIst,
      securityCategory: cat,
      sessionType: "PRE_OPEN",
      granularPhase: "PRE_OPEN_MATCHING",
      isContinuousTrading: false,
      isOrderEntryAllowed: false,
      orderTypeAllowed: "NONE",
      isRandomClosureInterval: false,
      description: "Pre-Open Order Matching & Trade Confirmation",
    };
  } else if (totalSec < tContOpen) {
    return {
      datetimeIst,
      securityCategory: cat,
      sessionType: "PRE_OPEN",
      granularPhase: "PRE_OPEN_BUFFER",
      isContinuousTrading: false,
      isOrderEntryAllowed: false,
      orderTypeAllowed: "NONE",
      isRandomClosureInterval: false,
      description: "Pre-Open Transition Buffer",
    };
  } else {
    if (regime === "CAS_V2") {
      const tContClose = 15 * 3600 + 30 * 60;     // 15:30:00
      const tCas2TransEnd = 15 * 3600 + 31 * 60; // 15:31:00
      const tCas2EntryEnd = 15 * 3600 + 36 * 60; // 15:36:00
      const tCas2LimitEnd = 15 * 3600 + 40 * 60; // 15:40:00
      const tCas2MatchEnd = 15 * 3600 + 45 * 60; // 15:45:00
      const tCas2BufEnd = 15 * 3600 + 50 * 60;   // 15:50:00
      const tPostEnd = 16 * 3600;                 // 16:00:00

      if (cat === "CAS_ELIGIBLE") {
        if (totalSec < tContClose) {
          return {
            datetimeIst,
            securityCategory: cat,
            sessionType: baseRegType,
            granularPhase: "CONTINUOUS_TRADING",
            isContinuousTrading: true,
            isOrderEntryAllowed: true,
            orderTypeAllowed: "ALL",
            isRandomClosureInterval: false,
            description: "Continuous Trading Session for CAS scrip under CAS 2.0 (09:15-15:30 IST)",
          };
        } else if (totalSec < tCas2TransEnd) {
          return {
            datetimeIst,
            securityCategory: cat,
            sessionType: "SPECIAL_CAS",
            granularPhase: "CAS_TRANSITION",
            isContinuousTrading: false,
            isOrderEntryAllowed: false,
            orderTypeAllowed: "NONE",
            isRandomClosureInterval: false,
            description: "CAS 2.0 Reference Price Calculation / Transition Buffer (15:30-15:31 IST)",
          };
        } else if (totalSec < tCas2EntryEnd) {
          return {
            datetimeIst,
            securityCategory: cat,
            sessionType: "SPECIAL_CAS",
            granularPhase: "CLOSING_AUCTION_ORDER_ENTRY",
            isContinuousTrading: false,
            isOrderEntryAllowed: true,
            orderTypeAllowed: "ALL",
            isRandomClosureInterval: false,
            description: "CAS 2.0 Closing Auction Session Order Entry (Market & Limit orders, 15:31-15:36 IST)",
          };
        } else if (totalSec < tCas2LimitEnd) {
          const isRand = totalSec >= (15 * 3600 + 38 * 60);
          return {
            datetimeIst,
            securityCategory: cat,
            sessionType: "SPECIAL_CAS",
            granularPhase: "CAS_LIMIT_ONLY",
            isContinuousTrading: false,
            isOrderEntryAllowed: true,
            orderTypeAllowed: "LIMIT_ONLY",
            isRandomClosureInterval: isRand,
            randomClosureWindow: isRand ? RANDOM_CLOSURE_WINDOWS.CAS_V2_REGULAR : undefined,
            description: "CAS 2.0 Closing Auction Limit-Only Order Entry (Random closure window 15:38-15:40 IST)",
          };
        } else if (totalSec < tCas2MatchEnd) {
          return {
            datetimeIst,
            securityCategory: cat,
            sessionType: "SPECIAL_CAS",
            granularPhase: "CLOSING_AUCTION_MATCHING",
            isContinuousTrading: false,
            isOrderEntryAllowed: false,
            orderTypeAllowed: "NONE",
            isRandomClosureInterval: false,
            description: "CAS 2.0 Closing Auction Order Matching & Equilibrium Price Discovery (15:40-15:45 IST)",
          };
        } else if (totalSec < tCas2BufEnd) {
          return {
            datetimeIst,
            securityCategory: cat,
            sessionType: "SPECIAL_CAS",
            granularPhase: "TRANSITION_PERIOD",
            isContinuousTrading: false,
            isOrderEntryAllowed: false,
            orderTypeAllowed: "NONE",
            isRandomClosureInterval: false,
            description: "CAS 2.0 Post-Auction Transition Period & Trade Confirmation Buffer (15:45-15:50 IST)",
          };
        } else if (totalSec < tPostEnd) {
          return {
            datetimeIst,
            securityCategory: cat,
            sessionType: "POST_CLOSE",
            granularPhase: "CLOSING_SESSION",
            isContinuousTrading: false,
            isOrderEntryAllowed: true,
            orderTypeAllowed: "LIMIT_ONLY",
            isRandomClosureInterval: false,
            description: "Closing Session / Post-Close Trading at determined closing price (15:50-16:00 IST)",
          };
        } else {
          return {
            datetimeIst,
            securityCategory: cat,
            sessionType: "CLOSED",
            granularPhase: "CLOSED",
            isContinuousTrading: false,
            isOrderEntryAllowed: false,
            orderTypeAllowed: "NONE",
            isRandomClosureInterval: false,
            description: "Market closed",
          };
        }
      } else {
        // NON_CAS under CAS_V2
        if (totalSec < tContClose) {
          return {
            datetimeIst,
            securityCategory: cat,
            sessionType: baseRegType,
            granularPhase: "CONTINUOUS_TRADING",
            isContinuousTrading: true,
            isOrderEntryAllowed: true,
            orderTypeAllowed: "ALL",
            isRandomClosureInterval: false,
            description: "Continuous Trading Session (09:15-15:30 IST)",
          };
        } else if (totalSec < tCas2LimitEnd) {
          return {
            datetimeIst,
            securityCategory: cat,
            sessionType: "SPECIAL_CAS",
            granularPhase: "BUFFER",
            isContinuousTrading: false,
            isOrderEntryAllowed: false,
            orderTypeAllowed: "NONE",
            isRandomClosureInterval: false,
            description: "Post-continuous buffer before closing price determination (15:30-15:40 IST)",
          };
        } else if (totalSec < tCas2MatchEnd) {
          return {
            datetimeIst,
            securityCategory: cat,
            sessionType: "SPECIAL_CAS",
            granularPhase: "CLOSING_AUCTION_MATCHING",
            isContinuousTrading: false,
            isOrderEntryAllowed: false,
            orderTypeAllowed: "NONE",
            isRandomClosureInterval: false,
            description: "Closing Auction Order Matching Period (15:40-15:45 IST)",
          };
        } else if (totalSec < tCas2BufEnd) {
          return {
            datetimeIst,
            securityCategory: cat,
            sessionType: "SPECIAL_CAS",
            granularPhase: "TRANSITION_PERIOD",
            isContinuousTrading: false,
            isOrderEntryAllowed: false,
            orderTypeAllowed: "NONE",
            isRandomClosureInterval: false,
            description: "Post-Auction Transition Period & Trade Confirmation Buffer (15:45-15:50 IST)",
          };
        } else if (totalSec < tPostEnd) {
          return {
            datetimeIst,
            securityCategory: cat,
            sessionType: "POST_CLOSE",
            granularPhase: "CLOSING_SESSION",
            isContinuousTrading: false,
            isOrderEntryAllowed: true,
            orderTypeAllowed: "LIMIT_ONLY",
            isRandomClosureInterval: false,
            description: "Closing Session / Post-Close Trading at determined closing price (15:50-16:00 IST)",
          };
        } else {
          return {
            datetimeIst,
            securityCategory: cat,
            sessionType: "CLOSED",
            granularPhase: "CLOSED",
            isContinuousTrading: false,
            isOrderEntryAllowed: false,
            orderTypeAllowed: "NONE",
            isRandomClosureInterval: false,
            description: "Market closed",
          };
        }
      }
    } else if (regime === "CAS_V1") {
      const tCasContEnd = 15 * 3600 + 15 * 60;   // 15:15:00
      const tCasTransEnd = 15 * 3600 + 20 * 60;  // 15:20:00
      const tCasEntryEnd = 15 * 3600 + 28 * 60;  // 15:28:00
      const tContClose = 15 * 3600 + 30 * 60;     // 15:30:00
      const tCasMatchEnd = 15 * 3600 + 35 * 60;  // 15:35:00
      const tCasBufEnd = 15 * 3600 + 50 * 60;    // 15:50:00
      const tPostEnd = 16 * 3600;                 // 16:00:00

      if (cat === "CAS_ELIGIBLE") {
        if (totalSec < tCasContEnd) {
          return {
            datetimeIst,
            securityCategory: cat,
            sessionType: baseRegType,
            granularPhase: "CONTINUOUS_TRADING",
            isContinuousTrading: true,
            isOrderEntryAllowed: true,
            orderTypeAllowed: "ALL",
            isRandomClosureInterval: false,
            description: "Continuous Trading Session for CAS scrip (09:15-15:15 IST)",
          };
        } else if (totalSec < tCasTransEnd) {
          return {
            datetimeIst,
            securityCategory: cat,
            sessionType: "SPECIAL_CAS",
            granularPhase: "CAS_TRANSITION",
            isContinuousTrading: false,
            isOrderEntryAllowed: false,
            orderTypeAllowed: "NONE",
            isRandomClosureInterval: false,
            description: "CAS Reference Price Calculation / Transition Buffer",
          };
        } else if (totalSec < tCasEntryEnd) {
          return {
            datetimeIst,
            securityCategory: cat,
            sessionType: "SPECIAL_CAS",
            granularPhase: "CLOSING_AUCTION_ORDER_ENTRY",
            isContinuousTrading: false,
            isOrderEntryAllowed: true,
            orderTypeAllowed: "ALL",
            isRandomClosureInterval: false,
            description: "Closing Auction Session Order Entry (Market & Limit orders)",
          };
        } else if (totalSec < tContClose) {
          const isRand = totalSec >= (15 * 3600 + 28 * 60);
          return {
            datetimeIst,
            securityCategory: cat,
            sessionType: "SPECIAL_CAS",
            granularPhase: "CAS_LIMIT_ONLY",
            isContinuousTrading: false,
            isOrderEntryAllowed: true,
            orderTypeAllowed: "LIMIT_ONLY",
            isRandomClosureInterval: isRand,
            randomClosureWindow: isRand ? RANDOM_CLOSURE_WINDOWS.MODERN_CAS_REGULAR : undefined,
            description: "Closing Auction Limit-Only Order Entry (Random closure window 15:28-15:30)",
          };
        } else if (totalSec < tCasMatchEnd) {
          return {
            datetimeIst,
            securityCategory: cat,
            sessionType: "SPECIAL_CAS",
            granularPhase: "CLOSING_AUCTION_MATCHING",
            isContinuousTrading: false,
            isOrderEntryAllowed: false,
            orderTypeAllowed: "NONE",
            isRandomClosureInterval: false,
            description: "Closing Auction Order Matching & Equilibrium Price Discovery",
          };
        } else if (totalSec < tCasBufEnd) {
          return {
            datetimeIst,
            securityCategory: cat,
            sessionType: "SPECIAL_CAS",
            granularPhase: "TRANSITION_PERIOD",
            isContinuousTrading: false,
            isOrderEntryAllowed: false,
            orderTypeAllowed: "NONE",
            isRandomClosureInterval: false,
            description: "Post-Auction Transition Period & Trade Confirmation Buffer",
          };
        } else if (totalSec < tPostEnd) {
          return {
            datetimeIst,
            securityCategory: cat,
            sessionType: "POST_CLOSE",
            granularPhase: "CLOSING_SESSION",
            isContinuousTrading: false,
            isOrderEntryAllowed: true,
            orderTypeAllowed: "LIMIT_ONLY",
            isRandomClosureInterval: false,
            description: "Closing Session / Post-Close Trading at determined closing price",
          };
        } else {
          return {
            datetimeIst,
            securityCategory: cat,
            sessionType: "CLOSED",
            granularPhase: "CLOSED",
            isContinuousTrading: false,
            isOrderEntryAllowed: false,
            orderTypeAllowed: "NONE",
            isRandomClosureInterval: false,
            description: "Market closed",
          };
        }
      } else {
        // NON_CAS
        if (totalSec < tContClose) {
          return {
            datetimeIst,
            securityCategory: cat,
            sessionType: baseRegType,
            granularPhase: "CONTINUOUS_TRADING",
            isContinuousTrading: true,
            isOrderEntryAllowed: true,
            orderTypeAllowed: "ALL",
            isRandomClosureInterval: false,
            description: "Continuous Trading Session (09:15-15:30 IST)",
          };
        } else if (totalSec < tCasMatchEnd) {
          return {
            datetimeIst,
            securityCategory: cat,
            sessionType: "SPECIAL_CAS",
            granularPhase: "CLOSING_AUCTION_MATCHING",
            isContinuousTrading: false,
            isOrderEntryAllowed: false,
            orderTypeAllowed: "NONE",
            isRandomClosureInterval: false,
            description: "Closing Auction Order Matching Period",
          };
        } else if (totalSec < tCasBufEnd) {
          return {
            datetimeIst,
            securityCategory: cat,
            sessionType: "SPECIAL_CAS",
            granularPhase: "TRANSITION_PERIOD",
            isContinuousTrading: false,
            isOrderEntryAllowed: false,
            orderTypeAllowed: "NONE",
            isRandomClosureInterval: false,
            description: "Post-Auction Transition Period & Trade Confirmation Buffer",
          };
        } else if (totalSec < tPostEnd) {
          return {
            datetimeIst,
            securityCategory: cat,
            sessionType: "POST_CLOSE",
            granularPhase: "CLOSING_SESSION",
            isContinuousTrading: false,
            isOrderEntryAllowed: true,
            orderTypeAllowed: "LIMIT_ONLY",
            isRandomClosureInterval: false,
            description: "Closing Session / Post-Close Trading at determined closing price",
          };
        } else {
          return {
            datetimeIst,
            securityCategory: cat,
            sessionType: "CLOSED",
            granularPhase: "CLOSED",
            isContinuousTrading: false,
            isOrderEntryAllowed: false,
            orderTypeAllowed: "NONE",
            isRandomClosureInterval: false,
            description: "Market closed",
          };
        }
      }
    } else {
      // LEGACY_PRE_CAS
      const tContClose = 15 * 3600 + 30 * 60;
      const tPostStart = 15 * 3600 + 40 * 60;
      const tPostEnd = 16 * 3600;

      if (totalSec < tContClose) {
        return {
          datetimeIst,
          securityCategory: cat,
          sessionType: baseRegType,
          granularPhase: "CONTINUOUS_TRADING",
          isContinuousTrading: true,
          isOrderEntryAllowed: true,
          orderTypeAllowed: "ALL",
          isRandomClosureInterval: false,
          description: "Continuous Trading Session (09:15-15:30 IST)",
        };
      } else if (totalSec < tPostStart) {
        return {
          datetimeIst,
          securityCategory: cat,
          sessionType: "CLOSED",
          granularPhase: "BUFFER",
          isContinuousTrading: false,
          isOrderEntryAllowed: false,
          orderTypeAllowed: "NONE",
          isRandomClosureInterval: false,
          description: "Closing price calculation buffer",
        };
      } else if (totalSec < tPostEnd) {
        return {
          datetimeIst,
          securityCategory: cat,
          sessionType: "POST_CLOSE",
          granularPhase: "CLOSING_SESSION",
          isContinuousTrading: false,
          isOrderEntryAllowed: true,
          orderTypeAllowed: "LIMIT_ONLY",
          isRandomClosureInterval: false,
          description: "Closing Session / Post-Close Trading at determined closing price",
        };
      } else {
        return {
          datetimeIst,
          securityCategory: cat,
          sessionType: "CLOSED",
          granularPhase: "CLOSED",
          isContinuousTrading: false,
          isOrderEntryAllowed: false,
          orderTypeAllowed: "NONE",
          isRandomClosureInterval: false,
          description: "Market closed",
        };
      }
    }
  }
}

/**
 * Evaluate session state for an OHLC candle bar, respecting candle duration and timestamp convention.
 */
export function evaluateCandleSession(
  timestampMs: number,
  timeframeSec = 60,
  convention: CandleTimestampConvention = "START_OF_INTERVAL",
  securityCategory: SecurityCategory | string = "NON_CAS",
  exchange = "NSE",
  calendarRegime?: CalendarRegime | string,
  ignoreHolidays = false
): SecuritySessionEvaluation {
  const durationMs = timeframeSec * 1000;
  let barStartMs: number;
  let barEndMs: number;

  if (convention === "START_OF_INTERVAL") {
    barStartMs = timestampMs;
    barEndMs = timestampMs + durationMs;
  } else {
    barStartMs = timestampMs - durationMs;
    barEndMs = timestampMs;
  }

  const evalStart = evaluateSessionInstant(barStartMs, securityCategory, exchange, calendarRegime, ignoreHolidays);
  if (!evalStart.isContinuousTrading) {
    return evalStart;
  }

  // Check instant immediately preceding bar end (1 millisecond before)
  const evalEnd = evaluateSessionInstant(barEndMs - 1, securityCategory, exchange, calendarRegime, ignoreHolidays);
  if (!evalEnd.isContinuousTrading) {
    const ist = getIstComponents(timestampMs);
    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    const datetimeIst = `${ist.dateStr}T${pad(ist.hours)}:${pad(ist.minutes)}:${pad(ist.seconds)}+05:30`;
    return {
      datetimeIst,
      securityCategory: evalStart.securityCategory,
      sessionType: evalEnd.sessionType,
      granularPhase: evalEnd.granularPhase,
      isContinuousTrading: false,
      isOrderEntryAllowed: false,
      orderTypeAllowed: "NONE",
      isRandomClosureInterval: false,
      description: `Candle spans beyond continuous trading close (${evalStart.granularPhase} to ${evalEnd.granularPhase})`,
    };
  }

  return evalStart;
}

/** Alias for evaluateCandleSession */
export const evaluateCandleBar = evaluateCandleSession;

/**
 * Evaluate complete security-specific session state, continuous trading availability,
 * order-entry permissions, and random closure intervals.
 */
export function evaluateSecuritySession(
  timestampMs: number,
  securityCategory: SecurityCategory | string,
  exchange = "NSE",
  endpointInclusive = true,
  calendarRegime?: CalendarRegime | string,
  ignoreHolidays = false
): SecuritySessionEvaluation {
  if (!endpointInclusive) {
    return evaluateSessionInstant(timestampMs, securityCategory, exchange, calendarRegime, ignoreHolidays);
  }
  const cat = validateSecurityCategory(securityCategory);
  const ist = getIstComponents(timestampMs);
  const totalSec = ist.hours * 3600 + ist.minutes * 60 + ist.seconds;
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  const datetimeIst = `${ist.dateStr}T${pad(ist.hours)}:${pad(ist.minutes)}:${pad(ist.seconds)}+05:30`;

  // 1. Diwali Muhurat Session (Sunday 2026-11-08)
  if (ist.dateStr === MUHURAT_SESSION_2026.date) {
    const tBlockStart = 13 * 3600 + 50 * 60;   // 13:50:00
    const tBlockEnd = 14 * 3600 + 5 * 60;      // 14:05:00
    const tPreLimit = 14 * 3600 + 10 * 60;     // 14:10:00
    const tPreMatch = 14 * 3600 + 15 * 60;     // 14:15:00
    const tPreBuf = 14 * 3600 + 17 * 60;       // 14:17:00
    const tContOpen = 14 * 3600 + 20 * 60;     // 14:20:00
    const tCasContEnd = 15 * 3600 + 15 * 60;  // 15:15:00
    const tCasTransEnd = 15 * 3600 + 20 * 60; // 15:20:00
    const tCasEntryEnd = 15 * 3600 + 25 * 60; // 15:25:00
    const tCasLimitEnd = 15 * 3600 + 30 * 60; // 15:30:00
    const tCasMatchEnd = 15 * 3600 + 35 * 60; // 15:35:00
    const tCasBufEnd = 15 * 3600 + 50 * 60;   // 15:50:00
    const tPostEnd = 16 * 3600;                // 16:00:00

    if (totalSec < tBlockStart) {
      return {
        datetimeIst,
        securityCategory: cat,
        sessionType: "CLOSED",
        granularPhase: "CLOSED",
        isContinuousTrading: false,
        isOrderEntryAllowed: false,
        orderTypeAllowed: "NONE",
        isRandomClosureInterval: false,
        description: "Market closed before Muhurat session",
      };
    } else if (totalSec < tBlockEnd) {
      return {
        datetimeIst,
        securityCategory: cat,
        sessionType: "BLOCK_DEAL",
        granularPhase: "BLOCK_DEAL",
        isContinuousTrading: false,
        isOrderEntryAllowed: false,
        orderTypeAllowed: "NONE",
        isRandomClosureInterval: false,
        description: "Bilateral block deal session window per circular NSE/CMTR/76941",
      };
    } else if (totalSec < tPreLimit) {
      return {
        datetimeIst,
        securityCategory: cat,
        sessionType: "PRE_OPEN",
        granularPhase: "PRE_OPEN_ENTRY",
        isContinuousTrading: false,
        isOrderEntryAllowed: true,
        orderTypeAllowed: "ALL",
        isRandomClosureInterval: false,
        description: "Muhurat Pre-Open Order Entry (Market & Limit orders)",
      };
    } else if (totalSec < tPreMatch) {
      const isRand = totalSec >= (14 * 3600 + 13 * 60);
      return {
        datetimeIst,
        securityCategory: cat,
        sessionType: "PRE_OPEN",
        granularPhase: "PRE_OPEN_LIMIT_ONLY",
        isContinuousTrading: false,
        isOrderEntryAllowed: true,
        orderTypeAllowed: "LIMIT_ONLY",
        isRandomClosureInterval: isRand,
        randomClosureWindow: isRand ? RANDOM_CLOSURE_WINDOWS.MUHURAT_PRE_OPEN : undefined,
        description: "Muhurat Pre-Open Limit-Only Order Entry (Random closure window 14:13-14:15)",
      };
    } else if (totalSec < tPreBuf) {
      return {
        datetimeIst,
        securityCategory: cat,
        sessionType: "PRE_OPEN",
        granularPhase: "PRE_OPEN_MATCHING",
        isContinuousTrading: false,
        isOrderEntryAllowed: false,
        orderTypeAllowed: "NONE",
        isRandomClosureInterval: false,
        description: "Muhurat Pre-Open Order Matching & Trade Confirmation",
      };
    } else if (totalSec < tContOpen) {
      return {
        datetimeIst,
        securityCategory: cat,
        sessionType: "PRE_OPEN",
        granularPhase: "PRE_OPEN_BUFFER",
        isContinuousTrading: false,
        isOrderEntryAllowed: false,
        orderTypeAllowed: "NONE",
        isRandomClosureInterval: false,
        description: "Muhurat Pre-Open Transition Buffer",
      };
    } else if (totalSec < tCasContEnd) {
      if (cat === "ILLIQUID_CALL_AUCTION") {
        return {
          datetimeIst,
          securityCategory: cat,
          sessionType: "CLOSED",
          granularPhase: "CLOSED",
          isContinuousTrading: false,
          isOrderEntryAllowed: false,
          orderTypeAllowed: "NONE",
          isRandomClosureInterval: false,
          description: "Illiquid securities have zero continuous trading",
        };
      }
      return {
        datetimeIst,
        securityCategory: cat,
        sessionType: "SPECIAL_MUHURAT",
        granularPhase: "CONTINUOUS_TRADING",
        isContinuousTrading: true,
        isOrderEntryAllowed: true,
        orderTypeAllowed: "ALL",
        isRandomClosureInterval: false,
        description: "Diwali Muhurat Continuous Trading Session",
      };
    } else if (totalSec < tCasTransEnd) {
      if (cat === "CAS_ELIGIBLE") {
        return {
          datetimeIst,
          securityCategory: cat,
          sessionType: "SPECIAL_CAS",
          granularPhase: "CAS_TRANSITION",
          isContinuousTrading: false,
          isOrderEntryAllowed: false,
          orderTypeAllowed: "NONE",
          isRandomClosureInterval: false,
          description: "Muhurat CAS Reference Price Calculation / Transition",
        };
      } else if (cat === "NON_CAS") {
        return {
          datetimeIst,
          securityCategory: cat,
          sessionType: "SPECIAL_MUHURAT",
          granularPhase: "CONTINUOUS_TRADING",
          isContinuousTrading: true,
          isOrderEntryAllowed: true,
          orderTypeAllowed: "ALL",
          isRandomClosureInterval: false,
          description: "Muhurat Continuous Trading Session (Non-CAS continues to 15:30)",
        };
      } else {
        return {
          datetimeIst,
          securityCategory: cat,
          sessionType: "CLOSED",
          granularPhase: "CLOSED",
          isContinuousTrading: false,
          isOrderEntryAllowed: false,
          orderTypeAllowed: "NONE",
          isRandomClosureInterval: false,
          description: "Closed",
        };
      }
    } else if (totalSec < tCasEntryEnd) {
      if (cat === "CAS_ELIGIBLE") {
        return {
          datetimeIst,
          securityCategory: cat,
          sessionType: "SPECIAL_CAS",
          granularPhase: "CLOSING_AUCTION_ENTRY",
          isContinuousTrading: false,
          isOrderEntryAllowed: true,
          orderTypeAllowed: "ALL",
          isRandomClosureInterval: false,
          description: "Muhurat CAS Order Entry (Market & Limit orders)",
        };
      } else if (cat === "NON_CAS") {
        return {
          datetimeIst,
          securityCategory: cat,
          sessionType: "SPECIAL_MUHURAT",
          granularPhase: "CONTINUOUS_TRADING",
          isContinuousTrading: true,
          isOrderEntryAllowed: true,
          orderTypeAllowed: "ALL",
          isRandomClosureInterval: false,
          description: "Muhurat Continuous Trading Session (Non-CAS continues to 15:30)",
        };
      } else {
        return {
          datetimeIst,
          securityCategory: cat,
          sessionType: "CLOSED",
          granularPhase: "CLOSED",
          isContinuousTrading: false,
          isOrderEntryAllowed: false,
          orderTypeAllowed: "NONE",
          isRandomClosureInterval: false,
          description: "Closed",
        };
      }
    } else if (totalSec < tCasLimitEnd) {
      if (cat === "CAS_ELIGIBLE") {
        const isRand = totalSec >= (15 * 3600 + 28 * 60);
        return {
          datetimeIst,
          securityCategory: cat,
          sessionType: "SPECIAL_CAS",
          granularPhase: "CAS_LIMIT_ONLY",
          isContinuousTrading: false,
          isOrderEntryAllowed: true,
          orderTypeAllowed: "LIMIT_ONLY",
          isRandomClosureInterval: isRand,
          randomClosureWindow: isRand ? RANDOM_CLOSURE_WINDOWS.MUHURAT_CAS : undefined,
          description: "Muhurat CAS Limit-Only Entry (Random closure window 15:28-15:30)",
        };
      } else if (cat === "NON_CAS") {
        return {
          datetimeIst,
          securityCategory: cat,
          sessionType: "SPECIAL_MUHURAT",
          granularPhase: "CONTINUOUS_TRADING",
          isContinuousTrading: true,
          isOrderEntryAllowed: true,
          orderTypeAllowed: "ALL",
          isRandomClosureInterval: false,
          description: "Muhurat Continuous Trading Session (Non-CAS continues to 15:30)",
        };
      } else {
        return {
          datetimeIst,
          securityCategory: cat,
          sessionType: "CLOSED",
          granularPhase: "CLOSED",
          isContinuousTrading: false,
          isOrderEntryAllowed: false,
          orderTypeAllowed: "NONE",
          isRandomClosureInterval: false,
          description: "Closed",
        };
      }
    } else if (totalSec < tCasMatchEnd) {
      if (cat === "CAS_ELIGIBLE") {
        return {
          datetimeIst,
          securityCategory: cat,
          sessionType: "SPECIAL_CAS",
          granularPhase: "CLOSING_AUCTION_MATCHING",
          isContinuousTrading: false,
          isOrderEntryAllowed: false,
          orderTypeAllowed: "NONE",
          isRandomClosureInterval: false,
          description: "Muhurat CAS Order Matching & Price Discovery",
        };
      } else {
        return {
          datetimeIst,
          securityCategory: cat,
          sessionType: "CLOSED",
          granularPhase: "CLOSED",
          isContinuousTrading: false,
          isOrderEntryAllowed: false,
          orderTypeAllowed: "NONE",
          isRandomClosureInterval: false,
          description: "Normal market closed at 15:30",
        };
      }
    } else if (totalSec < tCasBufEnd) {
      if (cat === "CAS_ELIGIBLE") {
        return {
          datetimeIst,
          securityCategory: cat,
          sessionType: "SPECIAL_CAS",
          granularPhase: "CAS_TRANSITION_BUFFER",
          isContinuousTrading: false,
          isOrderEntryAllowed: false,
          orderTypeAllowed: "NONE",
          isRandomClosureInterval: false,
          description: "Muhurat CAS Post-Auction Buffer & Reconciliation",
        };
      } else {
        return {
          datetimeIst,
          securityCategory: cat,
          sessionType: "CLOSED",
          granularPhase: "CLOSED",
          isContinuousTrading: false,
          isOrderEntryAllowed: false,
          orderTypeAllowed: "NONE",
          isRandomClosureInterval: false,
          description: "Normal market closed at 15:30",
        };
      }
    } else if (totalSec <= tPostEnd) {
      return {
        datetimeIst,
        securityCategory: cat,
        sessionType: "POST_CLOSE",
        granularPhase: "CLOSING_SESSION",
        isContinuousTrading: false,
        isOrderEntryAllowed: true,
        orderTypeAllowed: "LIMIT_ONLY",
        isRandomClosureInterval: false,
        description: "Official Closing Session / Post-Close Trading at determined closing price",
      };
    } else {
      return {
        datetimeIst,
        securityCategory: cat,
        sessionType: "CLOSED",
        granularPhase: "CLOSED",
        isContinuousTrading: false,
        isOrderEntryAllowed: false,
        orderTypeAllowed: "NONE",
        isRandomClosureInterval: false,
        description: "Market closed",
      };
    }
  }

  // 2. Weekends & Official Holidays
  if (!ignoreHolidays && !calendarRegime && (ist.dayOfWeek === 0 || ist.dayOfWeek === 6 || isExchangeHoliday(ist.dateStr))) {
    return {
      datetimeIst,
      securityCategory: cat,
      sessionType: "CLOSED",
      granularPhase: "CLOSED",
      isContinuousTrading: false,
      isOrderEntryAllowed: false,
      orderTypeAllowed: "NONE",
      isRandomClosureInterval: false,
      description: "Market closed (Weekend or Exchange Holiday)",
    };
  }

  const baseRegType: SessionType = isDrSession(timestampMs) ? "SPECIAL_DR" : "REGULAR";

  // 3. Special Pre-Open Session (SPOS) for IPO / Relisted Securities
  if (cat === "SPECIAL_PREOPEN_IPO") {
    let sposRegime: CalendarRegime;
    if (calendarRegime !== undefined && calendarRegime !== null) {
      if (calendarRegime === "CAS_V2") {
        sposRegime = "CAS_V2";
      } else if (calendarRegime === "CAS_V1" || calendarRegime === "MODERN_CAS_2026") {
        sposRegime = "CAS_V1";
      } else {
        sposRegime = "LEGACY_PRE_CAS";
      }
    } else {
      if (ist.dateStr < CAS_V1_GO_LIVE_DATE) {
        sposRegime = "LEGACY_PRE_CAS";
      } else if (ist.dateStr <= CAS_V1_SUNSET_DATE) {
        sposRegime = "CAS_V1";
      } else {
        sposRegime = "CAS_V2";
      }
    }

    const tSposStart = 9 * 3600;
    const tSposRandStart = 9 * 3600 + 35 * 60;
    const tSposEntryEnd = 9 * 3600 + 45 * 60;
    const tSposMatchEnd = 9 * 3600 + 55 * 60;
    const tSposContOpen = 10 * 3600;
    const tMktClose = 15 * 3600 + 30 * 60;
    const tCasMatchEnd = sposRegime === "CAS_V1" ? 15 * 3600 + 35 * 60 : (sposRegime === "CAS_V2" ? 15 * 3600 + 45 * 60 : 15 * 3600 + 40 * 60);
    const tPostStart = (sposRegime === "CAS_V1" || sposRegime === "CAS_V2") ? 15 * 3600 + 50 * 60 : 15 * 3600 + 40 * 60;
    const tPostEnd = 16 * 3600;

    if (totalSec < tSposStart) {
      return {
        datetimeIst,
        securityCategory: cat,
        sessionType: "CLOSED",
        granularPhase: "CLOSED",
        isContinuousTrading: false,
        isOrderEntryAllowed: false,
        orderTypeAllowed: "NONE",
        isRandomClosureInterval: false,
        description: "Pre-market closed before SPOS",
      };
    } else if (totalSec < tSposRandStart) {
      return {
        datetimeIst,
        securityCategory: cat,
        sessionType: "SPECIAL_PREOPEN",
        granularPhase: "SPOS_ORDER_ENTRY",
        isContinuousTrading: false,
        isOrderEntryAllowed: true,
        orderTypeAllowed: "ALL",
        isRandomClosureInterval: false,
        description: "Special Pre-Open Session Order Entry (Market & Limit orders)",
      };
    } else if (totalSec < tSposEntryEnd) {
      return {
        datetimeIst,
        securityCategory: cat,
        sessionType: "SPECIAL_PREOPEN",
        granularPhase: "SPOS_ORDER_ENTRY",
        isContinuousTrading: false,
        isOrderEntryAllowed: true,
        orderTypeAllowed: "ALL",
        isRandomClosureInterval: true,
        randomClosureWindow: RANDOM_CLOSURE_WINDOWS.SPOS_IPO,
        description: "Special Pre-Open Session Order Entry (Random closure window 09:35-09:45)",
      };
    } else if (totalSec < tSposMatchEnd) {
      return {
        datetimeIst,
        securityCategory: cat,
        sessionType: "SPECIAL_PREOPEN",
        granularPhase: "SPOS_MATCHING",
        isContinuousTrading: false,
        isOrderEntryAllowed: false,
        orderTypeAllowed: "NONE",
        isRandomClosureInterval: false,
        description: "Special Pre-Open Session Order Matching & Price Discovery",
      };
    } else if (totalSec < tSposContOpen) {
      return {
        datetimeIst,
        securityCategory: cat,
        sessionType: "SPECIAL_PREOPEN",
        granularPhase: "SPOS_BUFFER",
        isContinuousTrading: false,
        isOrderEntryAllowed: false,
        orderTypeAllowed: "NONE",
        isRandomClosureInterval: false,
        description: "Special Pre-Open Session Buffer Period before Continuous Trading",
      };
    } else if (totalSec <= tMktClose) {
      return {
        datetimeIst,
        securityCategory: cat,
        sessionType: baseRegType,
        granularPhase: "CONTINUOUS_TRADING",
        isContinuousTrading: true,
        isOrderEntryAllowed: true,
        orderTypeAllowed: "ALL",
        isRandomClosureInterval: false,
        description: "Continuous Trading for IPO/Relisted Security (10:00-15:30 IST)",
      };
    } else if (totalSec < tPostStart) {
      if (sposRegime === "CAS_V2") {
        if (totalSec < 15 * 3600 + 40 * 60) {
          return {
            datetimeIst,
            securityCategory: cat,
            sessionType: "SPECIAL_CAS",
            granularPhase: "BUFFER",
            isContinuousTrading: false,
            isOrderEntryAllowed: false,
            orderTypeAllowed: "NONE",
            isRandomClosureInterval: false,
            description: "SPOS scrip post-continuous buffer before CAS 2.0 matching",
          };
        } else if (totalSec < 15 * 3600 + 45 * 60) {
          return {
            datetimeIst,
            securityCategory: cat,
            sessionType: "SPECIAL_CAS",
            granularPhase: "CLOSING_AUCTION_MATCHING",
            isContinuousTrading: false,
            isOrderEntryAllowed: false,
            orderTypeAllowed: "NONE",
            isRandomClosureInterval: false,
            description: "SPOS scrip closing auction matching period",
          };
        } else {
          return {
            datetimeIst,
            securityCategory: cat,
            sessionType: "SPECIAL_CAS",
            granularPhase: "TRANSITION_PERIOD",
            isContinuousTrading: false,
            isOrderEntryAllowed: false,
            orderTypeAllowed: "NONE",
            isRandomClosureInterval: false,
            description: "SPOS scrip post-auction transition period buffer",
          };
        }
      } else if (sposRegime === "CAS_V1") {
        if (totalSec < tCasMatchEnd) {
          return {
            datetimeIst,
            securityCategory: cat,
            sessionType: "SPECIAL_CAS",
            granularPhase: "CLOSING_AUCTION_MATCHING",
            isContinuousTrading: false,
            isOrderEntryAllowed: false,
            orderTypeAllowed: "NONE",
            isRandomClosureInterval: false,
            description: "SPOS scrip closing auction matching period",
          };
        } else {
          return {
            datetimeIst,
            securityCategory: cat,
            sessionType: "SPECIAL_CAS",
            granularPhase: "TRANSITION_PERIOD",
            isContinuousTrading: false,
            isOrderEntryAllowed: false,
            orderTypeAllowed: "NONE",
            isRandomClosureInterval: false,
            description: "SPOS scrip post-auction transition period buffer",
          };
        }
      } else {
        return {
          datetimeIst,
          securityCategory: cat,
          sessionType: "CLOSED",
          granularPhase: "BUFFER",
          isContinuousTrading: false,
          isOrderEntryAllowed: false,
          orderTypeAllowed: "NONE",
          isRandomClosureInterval: false,
          description: "Post-market buffer",
        };
      }
    } else if (totalSec <= tPostEnd) {
      return {
        datetimeIst,
        securityCategory: cat,
        sessionType: "POST_CLOSE",
        granularPhase: "CLOSING_SESSION",
        isContinuousTrading: false,
        isOrderEntryAllowed: true,
        orderTypeAllowed: "LIMIT_ONLY",
        isRandomClosureInterval: false,
        description: "Closing Session / Post-Close Trading at determined closing price",
      };
    } else {
      return {
        datetimeIst,
        securityCategory: cat,
        sessionType: "CLOSED",
        granularPhase: "CLOSED",
        isContinuousTrading: false,
        isOrderEntryAllowed: false,
        orderTypeAllowed: "NONE",
        isRandomClosureInterval: false,
        description: "Market closed",
      };
    }
  }

  // 4. Periodic Call Auction for Illiquid Securities (PCAIS)
  if (cat === "ILLIQUID_CALL_AUCTION") {
    const tPcaisOpen = 9 * 3600 + 30 * 60;   // 09:30:00
    const tPcaisClose = 15 * 3600 + 30 * 60; // 15:30:00

    if (totalSec < tPcaisOpen || totalSec >= tPcaisClose) {
      return {
        datetimeIst,
        securityCategory: cat,
        sessionType: "CLOSED",
        granularPhase: "CLOSED",
        isContinuousTrading: false,
        isOrderEntryAllowed: false,
        orderTypeAllowed: "NONE",
        isRandomClosureInterval: false,
        description: "Closed (Periodic Call Auction active only 09:30 to 15:30)",
      };
    }

    const cycleIdx = Math.floor((totalSec - tPcaisOpen) / 3600);
    const cycleStart = tPcaisOpen + cycleIdx * 3600;
    const secInCycle = totalSec - cycleStart;
    const cycleNum = cycleIdx + 1;

    if (secInCycle < 45 * 60) {
      const isRand = secInCycle >= 44 * 60;
      const randStartSec = cycleStart + 44 * 60;
      const randEndSec = cycleStart + 45 * 60;
      const fmtTime = (s: number) => {
        const hh = Math.floor(s / 3600);
        const mm = Math.floor((s % 3600) / 60);
        return `${pad(hh)}:${pad(mm)}:00`;
      };
      const randWin: RandomClosureWindow = {
        windowStart: fmtTime(randStartSec),
        windowEnd: fmtTime(randEndSec),
        description: `PCAIS Cycle ${cycleNum} Random Order Closure Window (final 1 min)`,
      };

      return {
        datetimeIst,
        securityCategory: cat,
        sessionType: "CALL_AUCTION",
        granularPhase: `CALL_AUCTION_ORDER_ENTRY_CYCLE_${cycleNum}`,
        isContinuousTrading: false,
        isOrderEntryAllowed: true,
        orderTypeAllowed: "ALL",
        isRandomClosureInterval: isRand,
        randomClosureWindow: isRand ? randWin : undefined,
        description: `Periodic Call Auction Cycle ${cycleNum} Order Entry (45 mins)`,
      };
    } else if (secInCycle < 53 * 60) {
      return {
        datetimeIst,
        securityCategory: cat,
        sessionType: "CALL_AUCTION",
        granularPhase: `CALL_AUCTION_MATCHING_CYCLE_${cycleNum}`,
        isContinuousTrading: false,
        isOrderEntryAllowed: false,
        orderTypeAllowed: "NONE",
        isRandomClosureInterval: false,
        description: `Periodic Call Auction Cycle ${cycleNum} Order Matching (8 mins)`,
      };
    } else {
      return {
        datetimeIst,
        securityCategory: cat,
        sessionType: "CALL_AUCTION",
        granularPhase: `CALL_AUCTION_BUFFER_CYCLE_${cycleNum}`,
        isContinuousTrading: false,
        isOrderEntryAllowed: false,
        orderTypeAllowed: "NONE",
        isRandomClosureInterval: false,
        description: `Periodic Call Auction Cycle ${cycleNum} Buffer (7 mins)`,
      };
    }
  }

  // 5. CAS_ELIGIBLE and NON_CAS on Regular Trading Days
  let regime: CalendarRegime;
  if (calendarRegime !== undefined && calendarRegime !== null) {
    if (calendarRegime === "CAS_V2") {
      regime = "CAS_V2";
    } else if (calendarRegime === "CAS_V1" || calendarRegime === "MODERN_CAS_2026") {
      regime = "CAS_V1";
    } else {
      regime = "LEGACY";
    }
  } else {
    const schedVer = resolveScheduleVersion(ist.dateStr, exchange, cat);
    if (schedVer.versionId === "CAS_V2") {
      regime = "CAS_V2";
    } else if (schedVer.versionId === "CAS_V1") {
      regime = "CAS_V1";
    } else {
      regime = "LEGACY";
    }
  }

  const tPreStart = 9 * 3600;
  const tPreLimit = 9 * 3600 + 7 * 60;
  const tPreMatch = 9 * 3600 + 8 * 60;
  const tPreBuf = 9 * 3600 + 12 * 60;
  const tContOpen = 9 * 3600 + 15 * 60;

  if (totalSec < tPreStart) {
    return {
      datetimeIst,
      securityCategory: cat,
      sessionType: "CLOSED",
      granularPhase: "CLOSED",
      isContinuousTrading: false,
      isOrderEntryAllowed: false,
      orderTypeAllowed: "NONE",
      isRandomClosureInterval: false,
      description: "Market closed before pre-open",
    };
  } else if (totalSec < tPreLimit) {
    return {
      datetimeIst,
      securityCategory: cat,
      sessionType: "PRE_OPEN",
      granularPhase: "PRE_OPEN_ENTRY",
      isContinuousTrading: false,
      isOrderEntryAllowed: true,
      orderTypeAllowed: "ALL",
      isRandomClosureInterval: false,
      description: "Pre-Open Order Entry (Market & Limit orders)",
    };
  } else if (totalSec < tPreMatch) {
    return {
      datetimeIst,
      securityCategory: cat,
      sessionType: "PRE_OPEN",
      granularPhase: "PRE_OPEN_LIMIT_ONLY",
      isContinuousTrading: false,
      isOrderEntryAllowed: true,
      orderTypeAllowed: "LIMIT_ONLY",
      isRandomClosureInterval: true,
      randomClosureWindow: RANDOM_CLOSURE_WINDOWS.REGULAR_PRE_OPEN,
      description: "Pre-Open Limit-Only Order Entry (Random closure window 09:07-09:08)",
    };
  } else if (totalSec < tPreBuf) {
    return {
      datetimeIst,
      securityCategory: cat,
      sessionType: "PRE_OPEN",
      granularPhase: "PRE_OPEN_MATCHING",
      isContinuousTrading: false,
      isOrderEntryAllowed: false,
      orderTypeAllowed: "NONE",
      isRandomClosureInterval: false,
      description: "Pre-Open Order Matching & Trade Confirmation",
    };
  } else if (totalSec < tContOpen) {
    return {
      datetimeIst,
      securityCategory: cat,
      sessionType: "PRE_OPEN",
      granularPhase: "PRE_OPEN_BUFFER",
      isContinuousTrading: false,
      isOrderEntryAllowed: false,
      orderTypeAllowed: "NONE",
      isRandomClosureInterval: false,
      description: "Pre-Open Transition Buffer",
    };
  } else {
    if (regime === "CAS_V2") {
      const tContClose = 15 * 3600 + 30 * 60;     // 15:30:00
      const tCas2TransEnd = 15 * 3600 + 31 * 60; // 15:31:00
      const tCas2EntryEnd = 15 * 3600 + 36 * 60; // 15:36:00
      const tCas2LimitEnd = 15 * 3600 + 40 * 60; // 15:40:00
      const tCas2MatchEnd = 15 * 3600 + 45 * 60; // 15:45:00
      const tCas2BufEnd = 15 * 3600 + 50 * 60;   // 15:50:00
      const tPostEnd = 16 * 3600;                 // 16:00:00

      if (cat === "CAS_ELIGIBLE") {
        if (totalSec <= tContClose) {
          return {
            datetimeIst,
            securityCategory: cat,
            sessionType: baseRegType,
            granularPhase: "CONTINUOUS_TRADING",
            isContinuousTrading: true,
            isOrderEntryAllowed: true,
            orderTypeAllowed: "ALL",
            isRandomClosureInterval: false,
            description: "Continuous Trading Session for CAS scrip under CAS 2.0 (09:15-15:30 IST)",
          };
        } else if (totalSec < tCas2TransEnd) {
          return {
            datetimeIst,
            securityCategory: cat,
            sessionType: "SPECIAL_CAS",
            granularPhase: "CAS_TRANSITION",
            isContinuousTrading: false,
            isOrderEntryAllowed: false,
            orderTypeAllowed: "NONE",
            isRandomClosureInterval: false,
            description: "CAS 2.0 Reference Price Calculation / Transition Buffer (15:30-15:31 IST)",
          };
        } else if (totalSec < tCas2EntryEnd) {
          return {
            datetimeIst,
            securityCategory: cat,
            sessionType: "SPECIAL_CAS",
            granularPhase: "CLOSING_AUCTION_ORDER_ENTRY",
            isContinuousTrading: false,
            isOrderEntryAllowed: true,
            orderTypeAllowed: "ALL",
            isRandomClosureInterval: false,
            description: "CAS 2.0 Closing Auction Session Order Entry (Market & Limit orders, 15:31-15:36 IST)",
          };
        } else if (totalSec < tCas2LimitEnd) {
          const isRand = totalSec >= (15 * 3600 + 38 * 60);
          return {
            datetimeIst,
            securityCategory: cat,
            sessionType: "SPECIAL_CAS",
            granularPhase: "CAS_LIMIT_ONLY",
            isContinuousTrading: false,
            isOrderEntryAllowed: true,
            orderTypeAllowed: "LIMIT_ONLY",
            isRandomClosureInterval: isRand,
            randomClosureWindow: isRand ? RANDOM_CLOSURE_WINDOWS.CAS_V2_REGULAR : undefined,
            description: "CAS 2.0 Closing Auction Limit-Only Order Entry (Random closure window 15:38-15:40 IST)",
          };
        } else if (totalSec < tCas2MatchEnd) {
          return {
            datetimeIst,
            securityCategory: cat,
            sessionType: "SPECIAL_CAS",
            granularPhase: "CLOSING_AUCTION_MATCHING",
            isContinuousTrading: false,
            isOrderEntryAllowed: false,
            orderTypeAllowed: "NONE",
            isRandomClosureInterval: false,
            description: "CAS 2.0 Closing Auction Order Matching & Equilibrium Price Discovery (15:40-15:45 IST)",
          };
        } else if (totalSec < tCas2BufEnd) {
          return {
            datetimeIst,
            securityCategory: cat,
            sessionType: "SPECIAL_CAS",
            granularPhase: "TRANSITION_PERIOD",
            isContinuousTrading: false,
            isOrderEntryAllowed: false,
            orderTypeAllowed: "NONE",
            isRandomClosureInterval: false,
            description: "CAS 2.0 Post-Auction Transition Period & Trade Confirmation Buffer (15:45-15:50 IST)",
          };
        } else if (totalSec <= tPostEnd) {
          return {
            datetimeIst,
            securityCategory: cat,
            sessionType: "POST_CLOSE",
            granularPhase: "CLOSING_SESSION",
            isContinuousTrading: false,
            isOrderEntryAllowed: true,
            orderTypeAllowed: "LIMIT_ONLY",
            isRandomClosureInterval: false,
            description: "Closing Session / Post-Close Trading at determined closing price (15:50-16:00 IST)",
          };
        } else {
          return {
            datetimeIst,
            securityCategory: cat,
            sessionType: "CLOSED",
            granularPhase: "CLOSED",
            isContinuousTrading: false,
            isOrderEntryAllowed: false,
            orderTypeAllowed: "NONE",
            isRandomClosureInterval: false,
            description: "Market closed",
          };
        }
      } else {
        // NON_CAS under CAS_V2
        if (totalSec <= tContClose) {
          return {
            datetimeIst,
            securityCategory: cat,
            sessionType: baseRegType,
            granularPhase: "CONTINUOUS_TRADING",
            isContinuousTrading: true,
            isOrderEntryAllowed: true,
            orderTypeAllowed: "ALL",
            isRandomClosureInterval: false,
            description: "Continuous Trading Session (09:15-15:30 IST)",
          };
        } else if (totalSec < tCas2LimitEnd) {
          return {
            datetimeIst,
            securityCategory: cat,
            sessionType: "SPECIAL_CAS",
            granularPhase: "BUFFER",
            isContinuousTrading: false,
            isOrderEntryAllowed: false,
            orderTypeAllowed: "NONE",
            isRandomClosureInterval: false,
            description: "Post-continuous buffer before closing price determination (15:30-15:40 IST)",
          };
        } else if (totalSec < tCas2MatchEnd) {
          return {
            datetimeIst,
            securityCategory: cat,
            sessionType: "SPECIAL_CAS",
            granularPhase: "CLOSING_AUCTION_MATCHING",
            isContinuousTrading: false,
            isOrderEntryAllowed: false,
            orderTypeAllowed: "NONE",
            isRandomClosureInterval: false,
            description: "Closing Auction Order Matching Period (15:40-15:45 IST)",
          };
        } else if (totalSec < tCas2BufEnd) {
          return {
            datetimeIst,
            securityCategory: cat,
            sessionType: "SPECIAL_CAS",
            granularPhase: "TRANSITION_PERIOD",
            isContinuousTrading: false,
            isOrderEntryAllowed: false,
            orderTypeAllowed: "NONE",
            isRandomClosureInterval: false,
            description: "Post-Auction Transition Period & Trade Confirmation Buffer (15:45-15:50 IST)",
          };
        } else if (totalSec <= tPostEnd) {
          return {
            datetimeIst,
            securityCategory: cat,
            sessionType: "POST_CLOSE",
            granularPhase: "CLOSING_SESSION",
            isContinuousTrading: false,
            isOrderEntryAllowed: true,
            orderTypeAllowed: "LIMIT_ONLY",
            isRandomClosureInterval: false,
            description: "Closing Session / Post-Close Trading at determined closing price (15:50-16:00 IST)",
          };
        } else {
          return {
            datetimeIst,
            securityCategory: cat,
            sessionType: "CLOSED",
            granularPhase: "CLOSED",
            isContinuousTrading: false,
            isOrderEntryAllowed: false,
            orderTypeAllowed: "NONE",
            isRandomClosureInterval: false,
            description: "Market closed",
          };
        }
      }
    } else if (regime === "CAS_V1") {
      const tCasContEnd = 15 * 3600 + 15 * 60;  // 15:15:00
      const tCasTransEnd = 15 * 3600 + 20 * 60; // 15:20:00
      const tCasEntryEnd = 15 * 3600 + 28 * 60; // 15:28:00
      const tContClose = 15 * 3600 + 30 * 60;   // 15:30:00
      const tCasMatchEnd = 15 * 3600 + 35 * 60; // 15:35:00
      const tCasBufEnd = 15 * 3600 + 50 * 60;   // 15:50:00
      const tPostEnd = 16 * 3600;               // 16:00:00

      if (cat === "CAS_ELIGIBLE") {
        if (totalSec <= tCasContEnd) {
          return {
            datetimeIst,
            securityCategory: cat,
            sessionType: baseRegType,
            granularPhase: "CONTINUOUS_TRADING",
            isContinuousTrading: true,
            isOrderEntryAllowed: true,
            orderTypeAllowed: "ALL",
            isRandomClosureInterval: false,
            description: "Continuous Trading Session for CAS scrip (09:15-15:15 IST)",
          };
        } else if (totalSec < tCasTransEnd) {
          return {
            datetimeIst,
            securityCategory: cat,
            sessionType: "SPECIAL_CAS",
            granularPhase: "CAS_TRANSITION",
            isContinuousTrading: false,
            isOrderEntryAllowed: false,
            orderTypeAllowed: "NONE",
            isRandomClosureInterval: false,
            description: "CAS Reference Price Calculation / Transition Buffer",
          };
        } else if (totalSec < tCasEntryEnd) {
          return {
            datetimeIst,
            securityCategory: cat,
            sessionType: "SPECIAL_CAS",
            granularPhase: "CLOSING_AUCTION_ORDER_ENTRY",
            isContinuousTrading: false,
            isOrderEntryAllowed: true,
            orderTypeAllowed: "ALL",
            isRandomClosureInterval: false,
            description: "Closing Auction Session Order Entry (Market & Limit orders)",
          };
        } else if (totalSec <= tContClose) {
          const isRand = totalSec >= 15 * 3600 + 28 * 60;
          return {
            datetimeIst,
            securityCategory: cat,
            sessionType: "SPECIAL_CAS",
            granularPhase: "CAS_LIMIT_ONLY",
            isContinuousTrading: false,
            isOrderEntryAllowed: true,
            orderTypeAllowed: "LIMIT_ONLY",
            isRandomClosureInterval: isRand,
            randomClosureWindow: isRand ? RANDOM_CLOSURE_WINDOWS.MODERN_CAS_REGULAR : undefined,
            description: "Closing Auction Limit-Only Order Entry (Random closure window 15:28-15:30)",
          };
        } else if (totalSec < tCasMatchEnd) {
          return {
            datetimeIst,
            securityCategory: cat,
            sessionType: "SPECIAL_CAS",
            granularPhase: "CLOSING_AUCTION_MATCHING",
            isContinuousTrading: false,
            isOrderEntryAllowed: false,
            orderTypeAllowed: "NONE",
            isRandomClosureInterval: false,
            description: "Closing Auction Order Matching & Equilibrium Price Discovery",
          };
        } else if (totalSec < tCasBufEnd) {
          return {
            datetimeIst,
            securityCategory: cat,
            sessionType: "SPECIAL_CAS",
            granularPhase: "TRANSITION_PERIOD",
            isContinuousTrading: false,
            isOrderEntryAllowed: false,
            orderTypeAllowed: "NONE",
            isRandomClosureInterval: false,
            description: "Post-Auction Transition Period & Trade Confirmation Buffer",
          };
        } else if (totalSec <= tPostEnd) {
          return {
            datetimeIst,
            securityCategory: cat,
            sessionType: "POST_CLOSE",
            granularPhase: "CLOSING_SESSION",
            isContinuousTrading: false,
            isOrderEntryAllowed: true,
            orderTypeAllowed: "LIMIT_ONLY",
            isRandomClosureInterval: false,
            description: "Closing Session / Post-Close Trading at determined closing price",
          };
        } else {
          return {
            datetimeIst,
            securityCategory: cat,
            sessionType: "CLOSED",
            granularPhase: "CLOSED",
            isContinuousTrading: false,
            isOrderEntryAllowed: false,
            orderTypeAllowed: "NONE",
            isRandomClosureInterval: false,
            description: "Market closed",
          };
        }
      } else {
        // NON_CAS
        if (totalSec <= tContClose) {
          return {
            datetimeIst,
            securityCategory: cat,
            sessionType: baseRegType,
            granularPhase: "CONTINUOUS_TRADING",
            isContinuousTrading: true,
            isOrderEntryAllowed: true,
            orderTypeAllowed: "ALL",
            isRandomClosureInterval: false,
            description: "Continuous Trading Session (09:15-15:30 IST)",
          };
        } else if (totalSec < tCasMatchEnd) {
          return {
            datetimeIst,
            securityCategory: cat,
            sessionType: "SPECIAL_CAS",
            granularPhase: "CLOSING_AUCTION_MATCHING",
            isContinuousTrading: false,
            isOrderEntryAllowed: false,
            orderTypeAllowed: "NONE",
            isRandomClosureInterval: false,
            description: "Closing Auction Order Matching Period",
          };
        } else if (totalSec < tCasBufEnd) {
          return {
            datetimeIst,
            securityCategory: cat,
            sessionType: "SPECIAL_CAS",
            granularPhase: "TRANSITION_PERIOD",
            isContinuousTrading: false,
            isOrderEntryAllowed: false,
            orderTypeAllowed: "NONE",
            isRandomClosureInterval: false,
            description: "Post-Auction Transition Period & Trade Confirmation Buffer",
          };
        } else if (totalSec <= tPostEnd) {
          return {
            datetimeIst,
            securityCategory: cat,
            sessionType: "POST_CLOSE",
            granularPhase: "CLOSING_SESSION",
            isContinuousTrading: false,
            isOrderEntryAllowed: true,
            orderTypeAllowed: "LIMIT_ONLY",
            isRandomClosureInterval: false,
            description: "Closing Session / Post-Close Trading at determined closing price",
          };
        } else {
          return {
            datetimeIst,
            securityCategory: cat,
            sessionType: "CLOSED",
            granularPhase: "CLOSED",
            isContinuousTrading: false,
            isOrderEntryAllowed: false,
            orderTypeAllowed: "NONE",
            isRandomClosureInterval: false,
            description: "Market closed",
          };
        }
      }
    } else {
      // LEGACY_PRE_CAS
      const tContClose = 15 * 3600 + 30 * 60;  // 15:30:00
      const tPostStart = 15 * 3600 + 40 * 60;  // 15:40:00
      const tPostEnd = 16 * 3600;              // 16:00:00

      if (totalSec <= tContClose) {
        return {
          datetimeIst,
          securityCategory: cat,
          sessionType: baseRegType,
          granularPhase: "CONTINUOUS_TRADING",
          isContinuousTrading: true,
          isOrderEntryAllowed: true,
          orderTypeAllowed: "ALL",
          isRandomClosureInterval: false,
          description: "Continuous Trading Session (09:15-15:30 IST)",
        };
      } else if (totalSec < tPostStart) {
        return {
          datetimeIst,
          securityCategory: cat,
          sessionType: "CLOSED",
          granularPhase: "BUFFER",
          isContinuousTrading: false,
          isOrderEntryAllowed: false,
          orderTypeAllowed: "NONE",
          isRandomClosureInterval: false,
          description: "Closing price calculation buffer",
        };
      } else if (totalSec <= tPostEnd) {
        return {
          datetimeIst,
          securityCategory: cat,
          sessionType: "POST_CLOSE",
          granularPhase: "CLOSING_SESSION",
          isContinuousTrading: false,
          isOrderEntryAllowed: true,
          orderTypeAllowed: "LIMIT_ONLY",
          isRandomClosureInterval: false,
          description: "Closing Session / Post-Close Trading at determined closing price",
        };
      } else {
        return {
          datetimeIst,
          securityCategory: cat,
          sessionType: "CLOSED",
          granularPhase: "CLOSED",
          isContinuousTrading: false,
          isOrderEntryAllowed: false,
          orderTypeAllowed: "NONE",
          isRandomClosureInterval: false,
          description: "Market closed",
        };
      }
    }
  }

  return {
    datetimeIst,
    securityCategory: cat,
    sessionType: "CLOSED",
    granularPhase: "CLOSED",
    isContinuousTrading: false,
    isOrderEntryAllowed: false,
    orderTypeAllowed: "NONE",
    isRandomClosureInterval: false,
    description: "Market closed",
  };
}

/**
 * Evaluate whether an order entry/modification is permitted at a given timestamp.
 * Distinguishes order-entry permissions from session state classification.
 */
export function checkOrderEntryPermission(
  timestampMs: number,
  securityCategory: SecurityCategory | string = "NON_CAS",
  orderType = "LIMIT",
  exchangeClosureTimestampMs?: number,
  calendarRegime?: CalendarRegime | string
): OrderEntryPermission {
  const evalRes = evaluateSecuritySession(timestampMs, securityCategory, "NSE", true, calendarRegime);
  const orderTypeUpper = orderType.toUpperCase();

  if (!evalRes.isOrderEntryAllowed) {
    return {
      isAllowed: false,
      orderTypeAllowed: "NONE",
      isRandomClosureWindow: false,
      reason: `Order entry not allowed during ${evalRes.granularPhase} (${evalRes.description})`,
    };
  }

  // Check order type restrictions (e.g. LIMIT_ONLY phases)
  if (evalRes.orderTypeAllowed === "LIMIT_ONLY" && orderTypeUpper !== "LIMIT") {
    return {
      isAllowed: false,
      orderTypeAllowed: "LIMIT_ONLY",
      isRandomClosureWindow: evalRes.isRandomClosureInterval,
      randomClosureWindow: evalRes.randomClosureWindow,
      reason: `Only LIMIT orders are permitted during ${evalRes.granularPhase}. Rejected order type: ${orderTypeUpper}`,
    };
  }

  // Check random closure window and simulated/actual exchange closure event
  if (evalRes.isRandomClosureInterval) {
    if (exchangeClosureTimestampMs !== undefined) {
      if (timestampMs >= exchangeClosureTimestampMs) {
        const ist = getIstComponents(exchangeClosureTimestampMs);
        const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
        return {
          isAllowed: false,
          orderTypeAllowed: "NONE",
          isRandomClosureWindow: true,
          randomClosureWindow: evalRes.randomClosureWindow,
          reason: `[SIMULATED] Exchange random closure event already triggered at ${pad(ist.hours)}:${pad(ist.minutes)}:${pad(ist.seconds)} IST`,
        };
      }
    }
  }

  return {
    isAllowed: true,
    orderTypeAllowed: evalRes.orderTypeAllowed,
    isRandomClosureWindow: evalRes.isRandomClosureInterval,
    randomClosureWindow: evalRes.randomClosureWindow,
    reason: `Order entry permitted as ${evalRes.orderTypeAllowed} during ${evalRes.granularPhase}`,
  };
}

/**
 * Evaluate exact session type for a timestamp.
 * Precedence:
 * 1. Muhurat Special Session (2026-11-08)
 * 2. DR Live Trading Session (2026-03-05 & 2026-03-06)
 * 3. Weekend Closures (Saturday & Sunday — Saturday 2026-03-07 is strictly CLOSED)
 * 4. Official Weekday Holidays (16 verified holidays in 2026)
 * 5. Regular Market Hours
 */
export function getNseSessionType(
  timestampMs: number,
  exchange = "NSE",
  instrumentType = "EQ",
  securityCategory?: SecurityCategory | string,
  calendarRegime?: CalendarRegime | string
): SessionType {
  if (securityCategory !== undefined && securityCategory !== null) {
    const evalRes = evaluateSecuritySession(timestampMs, securityCategory, exchange, true, calendarRegime);
    return evalRes.sessionType;
  }

  const ist = getIstComponents(timestampMs);
  const exch = exchange.toUpperCase();
  const inst = instrumentType.toUpperCase();

  // 1. Special Muhurat session on Sunday 2026-11-08 (Circular NSE/CMTR/76941)
  if (ist.dateStr === MUHURAT_SESSION_2026.date) {
    if (isMuhuratPreOpen(timestampMs)) return "PRE_OPEN";
    if (isMuhuratSession(timestampMs)) return "SPECIAL_MUHURAT";
    if (isMuhuratPostClose(timestampMs)) return "POST_CLOSE";
    return "CLOSED";
  }

  // 2. Disaster Recovery (DR) Live Trading Days (Circular NSE/MSD/73126)
  if (isDrSession(timestampMs)) return "SPECIAL_DR";

  // 3. Weekends (Saturday=6, Sunday=0) — Saturday 2026-03-07 is strictly CLOSED
  if (ist.dayOfWeek === 0 || ist.dayOfWeek === 6) return "CLOSED";

  // 4. Official Weekday Holidays (16 verified holidays in 2026)
  if (isExchangeHoliday(ist.dateStr)) return "CLOSED";

  // 5. MCX Commodity Hours (09:00 - 23:30 IST)
  if (exch === "MCX" || exch === "COMMODITY") {
    if (ist.totalMinutes >= 540 && ist.totalMinutes <= 1410) {
      return "COMMODITY_REGULAR";
    }
    return "CLOSED";
  }

  // 6. Currency Derivatives Hours (09:00 - 17:00 IST)
  if (inst === "CUR" || inst === "CURRENCY" || inst === "CDS") {
    if (ist.totalMinutes >= 540 && ist.totalMinutes <= 1020) {
      return "REGULAR";
    }
    return "CLOSED";
  }

  // 7. NSE/BSE Equity & Equity Derivatives (09:15 - 15:30 IST)
  const totalSec = ist.hours * 3600 + ist.minutes * 60 + ist.seconds;
  const startSec = 9 * 3600 + 15 * 60; // 09:15:00 = 33300
  const endSec = 15 * 3600 + 30 * 60;  // 15:30:00 = 55800
  const preSec = 9 * 3600;             // 09:00:00 = 32400

  if (totalSec >= preSec && totalSec < startSec) {
    return "PRE_OPEN";
  } else if (totalSec >= startSec && totalSec <= endSec) {
    return "REGULAR";
  } else if (totalSec > endSec && totalSec <= 16 * 3600) {
    return "POST_CLOSE";
  }

  return "CLOSED";
}

/** Check if timestamp is an authorized continuous trading bar */
export function isValidTradingTime(
  timestampMs: number,
  exchange = "NSE",
  instrumentType = "EQ",
  allowSpecialSessions = true,
  securityCategory?: SecurityCategory | string,
  calendarRegime?: CalendarRegime | string
): boolean {
  if (securityCategory !== undefined && securityCategory !== null) {
    const evalRes = evaluateSecuritySession(timestampMs, securityCategory, exchange, true, calendarRegime);
    if (!allowSpecialSessions && (evalRes.sessionType === "SPECIAL_MUHURAT" || evalRes.sessionType === "SPECIAL_DR")) {
      return false;
    }
    return evalRes.isContinuousTrading;
  }

  const s = getNseSessionType(timestampMs, exchange, instrumentType);
  if (s === "REGULAR" || s === "COMMODITY_REGULAR") return true;
  if (allowSpecialSessions && (s === "SPECIAL_MUHURAT" || s === "SPECIAL_DR")) return true;
  return false;
}
