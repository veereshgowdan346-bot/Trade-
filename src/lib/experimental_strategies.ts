/**
 * EXPERIMENTAL STRATEGY REGISTRY (research only)
 *
 * Wraps the ten research implementations in `strategies_extended.ts` with explicit metadata:
 * identity, version, required data, indicators, entry/exit semantics, risk and cost
 * assumptions, supported regimes, known limitations, configuration schema and status.
 *
 * HARD ISOLATION RULES
 * --------------------
 * 1. Every entry is `enabled: false` and `status: "EXPERIMENTAL"`. `validateRegistry()`
 *    throws if anything is enabled — a new strategy can never be switched on silently.
 * 2. Nothing here is imported by `strategies.ts`, `engine.ts` or `backtest_engine.ts`.
 *    These strategies do NOT participate in the production quorum.
 * 3. Promotion to the quorum requires independent out-of-sample evidence plus explicit
 *    authorisation; that path does not exist in code on purpose.
 *
 * Research status legend:
 *   EXPLORATORY      — implemented, unit-checked, not evaluated out-of-sample
 *   NEGATIVE         — evaluated; no edge after costs
 *   INCONCLUSIVE     — sample too small / unstable to judge
 *   PROMISING        — evaluated with positive OOS evidence (requires authorisation to promote)
 */

import type { Candle } from "./indicators";
import type { Regime } from "./intelligence";
import {
  choppinessIndex,
  DEFAULT_CHOPPINESS_CFG,
  DEFAULT_DONCHIAN_CFG,
  DEFAULT_FIB_CFG,
  DEFAULT_ICHIMOKU_CFG,
  DEFAULT_KELTNER_CFG,
  DEFAULT_MACD_CFG,
  DEFAULT_MTF_CFG,
  DEFAULT_OBV_CFG,
  DEFAULT_PSAR_CFG,
  DEFAULT_VP_CFG,
  donchianTrendFollowing,
  fibonacciRetracement,
  ichimokuCloud,
  keltnerChannel,
  macdMomentum,
  multiTimeframeTrend,
  obvConfirmation,
  parabolicSar,
  volumeProfile,
  type ResearchStrategyOutput,
} from "./strategies_extended";

export type ResearchStatus = "EXPLORATORY" | "NEGATIVE" | "INCONCLUSIVE" | "PROMISING";

export type ExperimentalStrategy = {
  id: string;
  version: string;
  name: string;
  /** research family from the audit brief */
  family:
    | "TREND_FOLLOWING"
    | "MEAN_REVERSION"
    | "MOMENTUM"
    | "VOLATILITY_REGIME"
    | "BREAKOUT"
    | "VOLUME_CONFIRMATION"
    | "TREND_STRENGTH"
    | "MULTI_TIMEFRAME"
    | "ADAPTIVE_VOLATILITY"
    | "REGIME_CONDITIONED";
  description: string;
  hypothesis: string;
  requiredData: string[];
  indicators: string[];
  entryConditions: string;
  exitConditions: string;
  riskAssumptions: string;
  costAssumptions: string;
  supportedRegimes: Regime[];
  limitations: string[];
  configSchema: Record<string, string>;
  enabled: false; // structurally locked
  status: ResearchStatus;
  run: (c: Candle[]) => ResearchStrategyOutput;
};

const RISK_NOTE = "Indicative research sizing only; no leverage; ATR-based stop/target in the research harness.";
const COST_NOTE = "Evaluated with the repository's statutory round-trip cost model (Shoonya defaults) plus slippage; rates are UNVERIFIED against official tariffs.";

export const EXPERIMENTAL_REGISTRY: ExperimentalStrategy[] = [
  {
    id: "x_macd_momentum",
    version: "1.0.0",
    name: "MACD Momentum (12,26,9)",
    family: "MOMENTUM",
    description: "MACD histogram sign and slope as a directional momentum vote.",
    hypothesis: "Sustained positive MACD histogram expansion indicates trend continuation that outlasts round-trip costs.",
    requiredData: ["OHLCV 1-minute or higher"],
    indicators: ["EMA(12)", "EMA(26)", "MACD signal EMA(9)"],
    entryConditions: "signal = +1 (histogram > 0 and rising) / -1 (histogram < 0 and falling), confidence >= 55",
    exitConditions: "opposite signal, ATR stop (2x), ATR target (3x), or session end",
    riskAssumptions: RISK_NOTE,
    costAssumptions: COST_NOTE,
    supportedRegimes: ["TRENDING_BULL", "TRENDING_BEAR"],
    limitations: ["Whipsaws in CHOPPY_RANGING", "Lags turning points", "Same family as the production dual-EMA voter"],
    configSchema: { fast: "number (default 12)", slow: "number (default 26)", signal: "number (default 9)" },
    enabled: false,
    status: "EXPLORATORY",
    run: (c) => macdMomentum(c, DEFAULT_MACD_CFG),
  },
  {
    id: "x_ichimoku_cloud",
    version: "1.0.0",
    name: "Ichimoku Cloud (9,26,52)",
    family: "TREND_FOLLOWING",
    description: "Price position relative to the Ichimoku cloud and conversion/base line cross.",
    hypothesis: "Cloud-based support/resistance filters trend entries better than moving-average crosses alone.",
    requiredData: ["OHLCV, >= 78 bars warm-up"],
    indicators: ["Tenkan(9)", "Kijun(26)", "Senkou B(52)"],
    entryConditions: "signal = +1 above cloud with Tenkan > Kijun / -1 below cloud with Tenkan < Kijun",
    exitConditions: "cloud flip, ATR stop/target, session end",
    riskAssumptions: RISK_NOTE,
    costAssumptions: COST_NOTE,
    supportedRegimes: ["TRENDING_BULL", "TRENDING_BEAR"],
    limitations: ["Long warm-up (52+ bars)", "Very lagging", "Poor in range-bound tape"],
    configSchema: { tenkan: "number (9)", kijun: "number (26)", senkouB: "number (52)" },
    enabled: false,
    status: "EXPLORATORY",
    run: (c) => ichimokuCloud(c, DEFAULT_ICHIMOKU_CFG),
  },
  {
    id: "x_keltner_channel",
    version: "1.0.0",
    name: "Keltner Channel (20, 1.5 ATR)",
    family: "VOLATILITY_REGIME",
    description: "ATR-scaled channel breakout/reversion.",
    hypothesis: "Volatility-normalised channels adapt to regime shifts better than fixed-percentage bands.",
    requiredData: ["OHLCV, >= 21 bars"],
    indicators: ["EMA(20)", "ATR(20)"],
    entryConditions: "close outside channel -> continuation or reversion per implementation",
    exitConditions: "midline reversion, ATR stop/target, session end",
    riskAssumptions: RISK_NOTE,
    costAssumptions: COST_NOTE,
    supportedRegimes: ["TRENDING_BULL", "TRENDING_BEAR", "VOLATILITY_EXPANSION"],
    limitations: ["Parameter-sensitive multiplier", "Overlaps with the production Bollinger voter"],
    configSchema: { period: "number (20)", multiplier: "number (1.5)" },
    enabled: false,
    status: "EXPLORATORY",
    run: (c) => keltnerChannel(c, DEFAULT_KELTNER_CFG),
  },
  {
    id: "x_choppiness_index",
    version: "1.0.0",
    name: "Choppiness Index Filter",
    family: "REGIME_CONDITIONED",
    description: "Regime filter that reports trend vs chop; used as a veto rather than an entry signal.",
    hypothesis: "Vetoing entries when choppiness is high reduces whipsaw cost drag.",
    requiredData: ["OHLCV, >= 15 bars"],
    indicators: ["ATR(1)", "ATR(14)"],
    entryConditions: "acts as a filter (signal 0 in chop); combined with a directional voter",
    exitConditions: "not a standalone exit; filter relaxation",
    riskAssumptions: "Filter only — never generates exposure on its own.",
    costAssumptions: COST_NOTE,
    supportedRegimes: ["CHOPPY_RANGING", "TRENDING_BULL", "TRENDING_BEAR"],
    limitations: ["Not tradeable standalone", "Threshold choice is judgemental"],
    configSchema: { period: "number (14)" },
    enabled: false,
    status: "EXPLORATORY",
    run: (c) => choppinessIndex(c, DEFAULT_CHOPPINESS_CFG),
  },
  {
    id: "x_obv_confirmation",
    version: "1.0.0",
    name: "OBV Volume Confirmation",
    family: "VOLUME_CONFIRMATION",
    description: "On-balance-volume slope confirming price direction.",
    hypothesis: "Volume-confirmed moves persist longer than price-only moves.",
    requiredData: ["OHLCV including volume"],
    indicators: ["OBV", "OBV EMA(20)"],
    entryConditions: "signal = +1 price and OBV both rising / -1 both falling",
    exitConditions: "divergence, ATR stop/target, session end",
    riskAssumptions: RISK_NOTE,
    costAssumptions: COST_NOTE,
    supportedRegimes: ["TRENDING_BULL", "TRENDING_BEAR"],
    limitations: ["Sensitive to synthetic flat volume in fixtures", "No volume data in some feeds"],
    configSchema: { period: "number (20)" },
    enabled: false,
    status: "EXPLORATORY",
    run: (c) => obvConfirmation(c, DEFAULT_OBV_CFG),
  },
  {
    id: "x_parabolic_sar",
    version: "1.0.0",
    name: "Parabolic SAR",
    family: "TREND_FOLLOWING",
    description: "Trailing stop-and-reverse trend indicator.",
    hypothesis: "SAR flips capture medium-term reversals with defined risk.",
    requiredData: ["OHLCV, >= 20 bars"],
    indicators: ["SAR (step 0.02, max 0.2)"],
    entryConditions: "SAR flip below price -> +1, above price -> -1",
    exitConditions: "SAR flip, session end",
    riskAssumptions: RISK_NOTE,
    costAssumptions: COST_NOTE,
    supportedRegimes: ["TRENDING_BULL", "TRENDING_BEAR"],
    limitations: ["Frequent flips in chop -> high cost drag", "Highly sensitive to step/max"],
    configSchema: { step: "number (0.02)", max: "number (0.2)" },
    enabled: false,
    status: "EXPLORATORY",
    run: (c) => parabolicSar(c, DEFAULT_PSAR_CFG),
  },
  {
    id: "x_fibonacci_retracement",
    version: "1.0.0",
    name: "Fibonacci Retracement Pullback",
    family: "MEAN_REVERSION",
    description: "Pullback entries into 38.2-61.8% retracement of the recent swing.",
    hypothesis: "Trend pullbacks into Fibonacci zones offer better risk/reward than breakouts.",
    requiredData: ["OHLCV, >= 50 bars"],
    indicators: ["Swing high/low", "Fibonacci ratios"],
    entryConditions: "price inside retracement zone with trend alignment",
    exitConditions: "zone failure, ATR stop/target, session end",
    riskAssumptions: RISK_NOTE,
    costAssumptions: COST_NOTE,
    supportedRegimes: ["TRENDING_BULL", "TRENDING_BEAR"],
    limitations: ["Swing detection is parameter-dependent", "Subjective zone boundaries"],
    configSchema: { lookback: "number (50)", lowRatio: "number (0.382)", highRatio: "number (0.618)" },
    enabled: false,
    status: "EXPLORATORY",
    run: (c) => fibonacciRetracement(c, DEFAULT_FIB_CFG),
  },
  {
    id: "x_volume_profile",
    version: "1.0.0",
    name: "Volume Profile (POC/Value Area)",
    family: "MOMENTUM",
    description: "Position relative to the point of control and value area.",
    hypothesis: "Acceptance above/below the value area predicts continuation.",
    requiredData: ["OHLCV with volume"],
    indicators: ["POC", "Value area (70%)"],
    entryConditions: "acceptance above POC -> +1, below -> -1",
    exitConditions: "return into value area, ATR stop/target, session end",
    riskAssumptions: RISK_NOTE,
    costAssumptions: COST_NOTE,
    supportedRegimes: ["TRENDING_BULL", "TRENDING_BEAR", "VOLATILITY_EXPANSION"],
    limitations: ["Needs meaningful volume", "Bucket sizing is arbitrary"],
    configSchema: { buckets: "number (24)", valueAreaPct: "number (0.7)" },
    enabled: false,
    status: "EXPLORATORY",
    run: (c) => volumeProfile(c, DEFAULT_VP_CFG),
  },
  {
    id: "x_donchian_trend_50",
    version: "1.0.0",
    name: "Donchian Trend (50)",
    family: "BREAKOUT",
    description: "50-bar channel breakout trend following.",
    hypothesis: "Multi-week range breakouts capture persistent trends.",
    requiredData: ["OHLCV, >= 51 bars"],
    indicators: ["Donchian(50)"],
    entryConditions: "close > upper channel -> +1, < lower -> -1",
    exitConditions: "opposite channel or ATR stop, session end",
    riskAssumptions: RISK_NOTE,
    costAssumptions: COST_NOTE,
    supportedRegimes: ["TRENDING_BULL", "TRENDING_BEAR", "VOLATILITY_EXPANSION"],
    limitations: ["Few signals on intraday fixtures", "Whipsaw in ranges", "Overlaps the production donchian_breakout_20 plugin"],
    configSchema: { period: "number (50)" },
    enabled: false,
    status: "EXPLORATORY",
    run: (c) => donchianTrendFollowing(c, DEFAULT_DONCHIAN_CFG),
  },
  {
    id: "x_mtf_trend_confirmation",
    version: "1.0.0",
    name: "Multi-Timeframe Trend Confirmation",
    family: "MULTI_TIMEFRAME",
    description: "Requires fast and slow timeframe trends to agree.",
    hypothesis: "Alignment across horizons filters counter-trend noise and improves win rate.",
    requiredData: ["OHLCV sufficient for both horizons"],
    indicators: ["EMA fast horizon", "EMA slow horizon"],
    entryConditions: "both horizons aligned -> directional signal",
    exitConditions: "alignment break, ATR stop/target, session end",
    riskAssumptions: RISK_NOTE,
    costAssumptions: COST_NOTE,
    supportedRegimes: ["TRENDING_BULL", "TRENDING_BEAR"],
    limitations: ["Fewer trades -> small samples", "Slow to react"],
    configSchema: { fastPeriod: "number", slowPeriod: "number", factor: "number (5)" },
    enabled: false,
    status: "EXPLORATORY",
    run: (c) => multiTimeframeTrend(c, DEFAULT_MTF_CFG),
  },
];

/** Fails loudly if any experimental strategy has been switched on. */
export function validateRegistry(reg: ExperimentalStrategy[] = EXPERIMENTAL_REGISTRY): { ok: true; count: number } {
  const ids = new Set<string>();
  for (const s of reg) {
    if (s.enabled !== false) {
      throw new Error(`Experimental strategy ${s.id} is enabled — experimental strategies must stay disabled`);
    }
    if (s.status !== "EXPLORATORY" && s.status !== "NEGATIVE" && s.status !== "INCONCLUSIVE" && s.status !== "PROMISING") {
      throw new Error(`Experimental strategy ${s.id} has an invalid status`);
    }
    if (ids.has(s.id)) throw new Error(`Duplicate experimental strategy id: ${s.id}`);
    ids.add(s.id);
    const requiredStrings = ["version", "description", "hypothesis", "entryConditions", "exitConditions"] as const;
    for (const k of requiredStrings) {
      const v = s[k];
      if (typeof v !== "string" || v.length === 0) throw new Error(`Experimental strategy ${s.id} missing ${k}`);
    }
    if (!Array.isArray(s.supportedRegimes) || s.supportedRegimes.length === 0) {
      throw new Error(`Experimental strategy ${s.id} must declare supportedRegimes`);
    }
  }
  return { ok: true, count: reg.length };
}

export function getExperimental(id: string): ExperimentalStrategy {
  const s = EXPERIMENTAL_REGISTRY.find((x) => x.id === id);
  if (!s) throw new Error(`Unknown experimental strategy: ${id}`);
  return s;
}

/** Run one experimental strategy. Throws if it is somehow enabled (isolation guard). */
export function runExperimental(id: string, c: Candle[]): ResearchStrategyOutput {
  const s = getExperimental(id);
  if (s.enabled !== false) throw new Error(`Refusing to run enabled experimental strategy ${id}`);
  const out = s.run(c);
  // Defensive: the underlying implementation must also report enabled=false.
  if (out.enabled !== false) throw new Error(`Experimental implementation ${id} reported enabled=true`);
  return out;
}

export const EXPERIMENTAL_IDS = EXPERIMENTAL_REGISTRY.map((s) => s.id);
