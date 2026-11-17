import type { Instrument } from "./instruments";
import { roundTripCharges } from "./tax";

export type BrokerId = "angel" | "shoonya" | "groww";

export type TradingMode = "PAPER" | "LIVE";

export const STATUTORY_HURDLE_SHOONYA = 25; // 2026 update: ₹10 round-trip brokerage + STT + Exch fees
export const STATUTORY_HURDLE_ANGEL = 70; // ₹40 round-trip brokerage + STT + Exch fees

export type RiskConfig = {
  tradingMode: TradingMode; // PAPER (local simulation) vs LIVE (real broker execution)
  capital: number; // user-allocated capital (default Rs 1,000)
  riskPct: number; // % of capital risked per trade -> maxSL
  maxSL: number; // calculated: capital * riskPct / 100 (default Rs 80)
  drawdownFloor: number; // daily loss floor -> circuit breaker (default 2.5 x maxSL)
  hurdle: number; // statutory net profit hurdle (Rs 25 for Shoonya, Rs 70 for Angel One)
  rewardRisk: number; // target distance as multiple of SL distance
  leverage: number; // MIS leverage applied to allocated capital for sizing (1 = none)
  quorumPct: number; // >= 75
  gbmMin: number; // >= 65
  maxOpenPositions: number; // max concurrent open positions allowed
  enforceSessions: boolean;
  autoTrade: boolean; // autonomous scanner enabled
  primaryBroker: BrokerId;
  secondaryBroker: BrokerId;
  tertiaryBroker: BrokerId;
  simulateDrop: Record<BrokerId, boolean>; // paper-mode failover drill
  webhookSecret: string;
  // Smart Recovery (The 200/800 Rule) & Crash Protection:
  recoveryWatchMode?: boolean;
  recoveryThreshold?: number; // e.g. ₹200 drawdown triggers recovery mode
  recoveryMaxCapital?: number; // e.g. ₹800 remaining capital deployed
  ultraQuorumMin?: number; // >= 90% quorum required in recovery mode
  ultraGbmMin?: number; // >= 85% GBM required in recovery mode
  crashProtectionActive?: boolean;
  crashProtectionReason?: string | null;
  entrySlippageBps?: number; // e.g. 8.0 bps
  exitSlippageBps?: number; // e.g. 8.0 bps
};

export const DEFAULT_RISK: RiskConfig = {
  tradingMode: "PAPER",
  capital: 1000,
  riskPct: 1, // Institutional 1% Risk Rule
  maxSL: 10, // calculated: capital * 0.01 (Rs 10 default on Rs 1,000)
  drawdownFloor: 25, // daily loss floor -> circuit breaker (default 2.5 x maxSL)
  hurdle: 25, // Lowered to ₹25 specifically for Shoonya's ₹10 round-trip drag
  rewardRisk: 3, // Dynamic 1:3+ Risk-Reward Minimum
  leverage: 1,
  quorumPct: 75,
  gbmMin: 65,
  maxOpenPositions: 5,
  enforceSessions: false,
  autoTrade: false,
  primaryBroker: "shoonya", // Execution Layer (Flat ₹5/leg)
  secondaryBroker: "angel", // High-Speed Data Layer & Fallback
  tertiaryBroker: "groww",
  simulateDrop: { angel: false, shoonya: false, groww: false },
  webhookSecret: "",
  recoveryWatchMode: false,
  recoveryThreshold: 200,
  recoveryMaxCapital: 800,
  ultraQuorumMin: 90,
  ultraGbmMin: 85,
  crashProtectionActive: false,
  crashProtectionReason: null,
  entrySlippageBps: 8,
  exitSlippageBps: 8,
};

/**
 * CRITICAL SAFETY MANDATE (Phase 6.9):
 * Real broker order placement and live execution are permanently disabled.
 * The system operates strictly as an offline research & paper simulation engine.
 */
export const LIVE_BROKER_EXECUTION_DISABLED = true;

export function normaliseRisk(input: Partial<RiskConfig>): RiskConfig {
  const m = { ...DEFAULT_RISK, ...input, simulateDrop: { ...DEFAULT_RISK.simulateDrop, ...(input.simulateDrop ?? {}) } };
  
  // Permanent Safety Interlock: Force tradingMode strictly to "PAPER"
  // Rejects any attempt to set LIVE execution via API, config, or environment variables
  m.tradingMode = "PAPER";
  
  m.capital = Math.max(100, Number(m.capital) || DEFAULT_RISK.capital);
  m.riskPct = Math.min(25, Math.max(0.1, Number(m.riskPct) || DEFAULT_RISK.riskPct));
  m.maxSL = Math.round(m.capital * m.riskPct) / 100;
  m.drawdownFloor = Math.max(m.maxSL, Number(m.drawdownFloor) || m.maxSL * 2.5);
  m.primaryBroker = m.primaryBroker || "shoonya";
  m.secondaryBroker = m.secondaryBroker || "angel";
  m.tertiaryBroker = m.tertiaryBroker || "groww";
  m.hurdle = Math.max(0, Number(m.hurdle) || (m.primaryBroker === "shoonya" ? STATUTORY_HURDLE_SHOONYA : STATUTORY_HURDLE_ANGEL));
  m.rewardRisk = Math.min(10, Math.max(3, Number(m.rewardRisk) || 3)); // Dynamic 1:3 Minimum RR
  m.leverage = Math.min(20, Math.max(1, Number(m.leverage) || 1));
  m.quorumPct = Math.max(75, Number(m.quorumPct) || 75);
  m.gbmMin = Math.max(65, Number(m.gbmMin) || 65);
  m.maxOpenPositions = Math.min(25, Math.max(1, Math.floor(Number(m.maxOpenPositions) || 5)));
  m.recoveryWatchMode = Boolean(input.recoveryWatchMode ?? DEFAULT_RISK.recoveryWatchMode);
  m.recoveryThreshold = Math.max(10, Number(input.recoveryThreshold) || DEFAULT_RISK.recoveryThreshold!);
  m.recoveryMaxCapital = Math.max(10, Number(input.recoveryMaxCapital) || DEFAULT_RISK.recoveryMaxCapital!);
  m.ultraQuorumMin = Math.max(75, Math.min(100, Number(input.ultraQuorumMin) || DEFAULT_RISK.ultraQuorumMin!));
  m.ultraGbmMin = Math.max(50, Math.min(100, Number(input.ultraGbmMin) || DEFAULT_RISK.ultraGbmMin!));
  m.crashProtectionActive = Boolean(input.crashProtectionActive ?? DEFAULT_RISK.crashProtectionActive);
  m.crashProtectionReason = input.crashProtectionReason ?? DEFAULT_RISK.crashProtectionReason;
  m.entrySlippageBps = Number(input.entrySlippageBps !== undefined ? input.entrySlippageBps : DEFAULT_RISK.entrySlippageBps);
  m.exitSlippageBps = Number(input.exitSlippageBps !== undefined ? input.exitSlippageBps : (m.entrySlippageBps ?? DEFAULT_RISK.exitSlippageBps));
  return m;
}

/** Confidence multiplier derived from the GBM probability (p=0.5 -> 0.5, p>=0.75 -> 1.0). */
export function confidenceMultiplier(gbmProb: number): number {
  const p = Math.min(1, Math.max(0, gbmProb));
  return Math.min(1, Math.max(0.25, 0.5 + (p - 0.5) * 2));
}

export type Sizing = {
  qty: number;
  capitalCap: number; // floor(min(freeCapital, maxExposureCap) * conf / entry)
  riskCap: number; // floor(maxRiskAmount / slDistance)
  limitedBy: "CAPITAL" | "ATR_RISK" | "LOT_SIZE" | "NONE";
  slDistance: number;
  slPrice: number;
  targetPrice: number;
  targetDistance: number;
  rewardRiskRatio: number;
  riskAtStop: number;
  maxRiskAmount: number;
  maxExposureCap: number;
  expectedGross: number;
  expectedCharges: number;
  expectedNetYield: number;
};

const floorTo = (v: number, step: number) => Math.floor(v / step) * step;
const roundTick = (v: number, tick: number) => Math.round(v / tick) * tick;

/**
 * Institutional Auto-Position Sizing (1% Risk Rule) & 20% Exposure Capping:
 *   Max Risk Amount = Allocated Capital * 0.01
 *   StopLoss Distance = max(ATR14 * 1.5, tick * 2)
 *   Calculated Quantity = floor(Max Risk Amount / StopLoss_Distance)
 *   Max Exposure Cap = (Allocated Capital * Leverage) * 0.20
 *   Capital Cap = floor(min(freeCapital, Max Exposure Cap) * conf / entry)
 *   Quantity = floorTo(min(Capital Cap, Calculated Quantity), lotSize)
 *
 * Guaranteed bracket stop: risk-at-stop <= Max Risk Amount.
 */
export function sizePosition(args: {
  inst: Instrument;
  side: "BUY" | "SELL";
  entry: number;
  atr: number;
  conf: number;
  cfg: RiskConfig;
  freeCapital?: number;
}): Sizing {
  const { inst, side, entry, atr, conf, cfg, freeCapital } = args;

  // 1% Risk Rule: Max Risk Amount = Allocated Capital * 0.01 (or user-defined riskPct)
  const riskPercent = cfg.riskPct && cfg.riskPct > 0 ? cfg.riskPct : 1;
  const maxRiskAmount = Math.max(1, round(cfg.capital * (riskPercent / 100), 2));

  // Max Exposure Cap: No single trade can ever utilize > 20% of total available buying power
  const totalBuyingPower = cfg.capital * (cfg.leverage || 1);
  const maxExposureCap = round(totalBuyingPower * 0.20, 2);
  const effectiveCapital = freeCapital !== undefined ? Math.max(0, Math.min(freeCapital, maxExposureCap)) : maxExposureCap;

  // StopLoss Distance derived from ATR (default 1.5 * ATR clamped to at least 2 ticks)
  let slDistance = Math.max(inst.tick * 2, roundTick(atr * 1.5, inst.tick));

  // Calculated Quantity based strictly on 1% maximum risk per trade
  const riskCap = Math.floor(maxRiskAmount / slDistance);

  // Capital Cap based on 20% buying power cap and confidence factor
  // FIX (APEX-V2 AUDIT RISK-001): clamp conf to [0,1] — callers could inflate sizing above
  // the intended confidence multiplier contract.
  const safeConf = Math.min(1, Math.max(0, Number(conf) || 0));
  const capitalCap = Math.floor((effectiveCapital * safeConf) / entry);

  let raw = Math.min(capitalCap, riskCap);
  const limitedBy: Sizing["limitedBy"] = capitalCap <= riskCap ? "CAPITAL" : "ATR_RISK";
  let qty = floorTo(raw, inst.lotSize);
  let lim: Sizing["limitedBy"] = limitedBy;
  if (qty <= 0) {
    lim = raw >= 1 ? "LOT_SIZE" : limitedBy;
    qty = 0;
  }

  // Guaranteed bracket SL: per-trade risk must never exceed maxRiskAmount
  if (qty > 0 && qty * slDistance > maxRiskAmount) {
    slDistance = Math.max(inst.tick, floorTo(maxRiskAmount / qty, inst.tick));
  }
  slDistance = Math.max(inst.tick, roundTick(slDistance, inst.tick));
  if (qty > 0 && qty * slDistance > maxRiskAmount) {
    slDistance = Math.max(inst.tick, floorTo(maxRiskAmount / qty, inst.tick));
  }

  const dir = side === "BUY" ? 1 : -1;
  const slPrice = roundTick(entry - dir * slDistance, inst.tick);

  // Dynamic 1:3+ Risk:Reward Auto-Targeting (Minimum 3.0R Target Distance)
  const rrRatio = Math.max(3.0, Number(cfg.rewardRisk) || 3.0);
  const targetDistance = Math.max(roundTick(slDistance * 3.0, inst.tick), roundTick(slDistance * rrRatio, inst.tick));
  const targetPrice = roundTick(entry + dir * targetDistance, inst.tick);

  const targetBroker = cfg.primaryBroker || "shoonya";
  const estCharges = qty > 0 ? roundTripCharges({
    exchange: inst.exchange,
    kind: inst.kind,
    broker: targetBroker,
    qty,
    entry,
    exit: targetPrice,
    side,
    entrySlippageBps: cfg.entrySlippageBps ?? 8.0,
    exitSlippageBps: cfg.exitSlippageBps ?? (cfg.entrySlippageBps ?? 8.0),
  }) : null;
  const expectedGross = qty > 0 ? round(qty * targetDistance, 2) : 0;
  const expectedCharges = estCharges ? estCharges.total : 0;
  const expectedNetYield = qty > 0 ? round(expectedGross - expectedCharges, 2) : 0;

  return {
    qty,
    capitalCap,
    riskCap,
    limitedBy: qty > 0 ? limitedBy : lim,
    slDistance: round(slDistance, 4),
    slPrice: round(slPrice, 2),
    targetPrice: round(targetPrice, 2),
    targetDistance: round(targetDistance, 4),
    rewardRiskRatio: round(targetDistance / Math.max(inst.tick, slDistance), 2),
    riskAtStop: round(qty * slDistance, 2),
    maxRiskAmount,
    maxExposureCap,
    expectedGross,
    expectedCharges,
    expectedNetYield,
  };
}

function round(v: number, d: number) {
  return Math.round(v * 10 ** d) / 10 ** d;
}

/** Circuit breaker: cumulative daily loss >= drawdown floor (default 2.5 x maxSL). */
export function breachesCircuit(dailyNetPnl: number, cfg: RiskConfig): boolean {
  return dailyNetPnl <= -Math.abs(cfg.drawdownFloor);
}
