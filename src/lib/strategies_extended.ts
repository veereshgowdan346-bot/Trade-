import { atr, ema, last, trueRange, type Candle } from "./indicators";
import type { Regime } from "./intelligence";

export type ResearchSignal = 1 | -1 | 0;

export type ResearchStrategyOutput = {
  id: string;
  name: string;
  enabled: boolean; // MUST be false by default
  signal: ResearchSignal;
  confidence: number; // 0..100
  detail: string;
  supportedRegimes: Regime[];
  metrics: Record<string, number>;
};

/* -------------------------------------------------------------------------- */
/* 1. MACD Momentum (12, 26, 9)                                               */
/* -------------------------------------------------------------------------- */
export type MacdConfig = { fast: number; slow: number; signal: number; enabled: boolean };
export const DEFAULT_MACD_CFG: MacdConfig = { fast: 12, slow: 26, signal: 9, enabled: false };

export function macdMomentum(c: Candle[], cfg: MacdConfig = DEFAULT_MACD_CFG): ResearchStrategyOutput {
  const base = {
    id: "macd_momentum",
    name: "MACD Momentum (12/26/9)",
    enabled: cfg.enabled,
    supportedRegimes: ["TRENDING_BULL" as Regime, "TRENDING_BEAR" as Regime, "VOLATILITY_EXPANSION" as Regime],
  };
  if (c.length < cfg.slow + cfg.signal) {
    return { ...base, signal: 0, confidence: 10, detail: "Insufficient bars for MACD warm-up", metrics: {} };
  }
  const closes = c.map((x) => x.c);
  const fastEma = ema(closes, cfg.fast);
  const slowEma = ema(closes, cfg.slow);
  const macdLine = fastEma.map((f, i) => f - slowEma[i]);
  const signalLine = ema(macdLine, cfg.signal);

  const curMacd = last(macdLine);
  const curSig = last(signalLine);
  const prevMacd = macdLine[macdLine.length - 2] ?? curMacd;
  const prevSig = signalLine[signalLine.length - 2] ?? curSig;
  const hist = curMacd - curSig;

  const crossedUp = prevMacd <= prevSig && curMacd > curSig;
  const crossedDown = prevMacd >= prevSig && curMacd < curSig;

  if (crossedUp || (curMacd > curSig && hist > 0)) {
    return {
      ...base,
      signal: 1,
      confidence: crossedUp ? 85 : 65,
      detail: `MACD Line (${curMacd.toFixed(2)}) > Signal (${curSig.toFixed(2)})${crossedUp ? " [Bullish Crossover]" : ""}`,
      metrics: { macd: curMacd, signal: curSig, hist },
    };
  }
  if (crossedDown || (curMacd < curSig && hist < 0)) {
    return {
      ...base,
      signal: -1,
      confidence: crossedDown ? 85 : 65,
      detail: `MACD Line (${curMacd.toFixed(2)}) < Signal (${curSig.toFixed(2)})${crossedDown ? " [Bearish Crossover]" : ""}`,
      metrics: { macd: curMacd, signal: curSig, hist },
    };
  }
  return { ...base, signal: 0, confidence: 20, detail: "MACD neutral", metrics: { macd: curMacd, signal: curSig, hist } };
}

/* -------------------------------------------------------------------------- */
/* 2. Ichimoku Cloud (9, 26, 52)                                              */
/* -------------------------------------------------------------------------- */
export type IchimokuConfig = { tenkan: number; kijun: number; senkouB: number; enabled: boolean };
export const DEFAULT_ICHIMOKU_CFG: IchimokuConfig = { tenkan: 9, kijun: 26, senkouB: 52, enabled: false };

export function ichimokuCloud(c: Candle[], cfg: IchimokuConfig = DEFAULT_ICHIMOKU_CFG): ResearchStrategyOutput {
  const base = {
    id: "ichimoku_cloud",
    name: "Ichimoku Cloud (9/26/52)",
    enabled: cfg.enabled,
    supportedRegimes: ["TRENDING_BULL" as Regime, "TRENDING_BEAR" as Regime],
  };
  if (c.length < cfg.senkouB) {
    return { ...base, signal: 0, confidence: 10, detail: "Awaiting 52 bars for Ichimoku Kumo Cloud", metrics: {} };
  }
  const hl = (window: Candle[]) => {
    const hh = Math.max(...window.map((x) => x.h));
    const ll = Math.min(...window.map((x) => x.l));
    return (hh + ll) / 2;
  };
  const tenkan = hl(c.slice(-cfg.tenkan));
  const kijun = hl(c.slice(-cfg.kijun));
  const senkouA = (tenkan + kijun) / 2;
  const senkouB = hl(c.slice(-cfg.senkouB));
  const curPx = last(c).c;

  const cloudTop = Math.max(senkouA, senkouB);
  const cloudBottom = Math.min(senkouA, senkouB);

  if (curPx > cloudTop && tenkan > kijun) {
    return {
      ...base,
      signal: 1,
      confidence: 80,
      detail: `Price (${curPx.toFixed(2)}) above Kumo Cloud [${cloudBottom.toFixed(2)} - ${cloudTop.toFixed(2)}] & Tenkan > Kijun`,
      metrics: { tenkan, kijun, senkouA, senkouB, cloudTop, cloudBottom },
    };
  }
  if (curPx < cloudBottom && tenkan < kijun) {
    return {
      ...base,
      signal: -1,
      confidence: 80,
      detail: `Price (${curPx.toFixed(2)}) below Kumo Cloud [${cloudBottom.toFixed(2)} - ${cloudTop.toFixed(2)}] & Tenkan < Kijun`,
      metrics: { tenkan, kijun, senkouA, senkouB, cloudTop, cloudBottom },
    };
  }
  return {
    ...base,
    signal: 0,
    confidence: 25,
    detail: `Price inside or conflicting with Kumo Cloud [${cloudBottom.toFixed(2)} - ${cloudTop.toFixed(2)}]`,
    metrics: { tenkan, kijun, senkouA, senkouB, cloudTop, cloudBottom },
  };
}

/* -------------------------------------------------------------------------- */
/* 3. Keltner Channel (20, 1.5 ATR)                                           */
/* -------------------------------------------------------------------------- */
export type KeltnerConfig = { period: number; multiplier: number; enabled: boolean };
export const DEFAULT_KELTNER_CFG: KeltnerConfig = { period: 20, multiplier: 1.5, enabled: false };

export function keltnerChannel(c: Candle[], cfg: KeltnerConfig = DEFAULT_KELTNER_CFG): ResearchStrategyOutput {
  const base = {
    id: "keltner_channel",
    name: "Keltner Channel (20/1.5)",
    enabled: cfg.enabled,
    supportedRegimes: ["TRENDING_BULL" as Regime, "TRENDING_BEAR" as Regime, "VOLATILITY_EXPANSION" as Regime],
  };
  if (c.length < cfg.period) {
    return { ...base, signal: 0, confidence: 10, detail: "Awaiting 20 bars for Keltner Channel", metrics: {} };
  }
  const closes = c.map((x) => x.c);
  const midEma = last(ema(closes, cfg.period));
  const atrVal = last(atr(c, cfg.period));
  const upper = midEma + cfg.multiplier * atrVal;
  const lower = midEma - cfg.multiplier * atrVal;
  const curPx = last(c).c;

  if (curPx > upper) {
    return {
      ...base,
      signal: 1,
      confidence: 75,
      detail: `Breakout above Upper Keltner Channel (${upper.toFixed(2)})`,
      metrics: { midEma, upper, lower, atr: atrVal },
    };
  }
  if (curPx < lower) {
    return {
      ...base,
      signal: -1,
      confidence: 75,
      detail: `Breakdown below Lower Keltner Channel (${lower.toFixed(2)})`,
      metrics: { midEma, upper, lower, atr: atrVal },
    };
  }
  return {
    ...base,
    signal: 0,
    confidence: 20,
    detail: `Inside Keltner Channel [${lower.toFixed(2)} - ${upper.toFixed(2)}]`,
    metrics: { midEma, upper, lower, atr: atrVal },
  };
}

/* -------------------------------------------------------------------------- */
/* 4. Choppiness Index (14)                                                   */
/* -------------------------------------------------------------------------- */
export type ChoppinessConfig = { period: number; enabled: boolean };
export const DEFAULT_CHOPPINESS_CFG: ChoppinessConfig = { period: 14, enabled: false };

export function choppinessIndex(c: Candle[], cfg: ChoppinessConfig = DEFAULT_CHOPPINESS_CFG): ResearchStrategyOutput {
  const base = {
    id: "choppiness_index",
    name: "Choppiness Index (14)",
    enabled: cfg.enabled,
    supportedRegimes: ["CHOPPY_RANGING" as Regime, "TRENDING_BULL" as Regime, "TRENDING_BEAR" as Regime],
  };
  if (c.length < cfg.period + 1) {
    return { ...base, signal: 0, confidence: 10, detail: "Awaiting bars for Choppiness Index", metrics: {} };
  }
  const tr = trueRange(c);
  const winTr = tr.slice(-cfg.period);
  const sumTr = winTr.reduce((a, b) => a + b, 0);
  const winCandles = c.slice(-cfg.period);
  const hh = Math.max(...winCandles.map((x) => x.h));
  const ll = Math.min(...winCandles.map((x) => x.l));
  const diff = hh - ll;

  const chop = diff > 0 ? (100 * Math.log10(sumTr / diff)) / Math.log10(cfg.period) : 100;

  // CHOP > 61.8 indicates extreme chop (consolidation); CHOP < 38.2 indicates strong trend
  if (chop < 38.2) {
    const dir = last(c).c > winCandles[0].c ? 1 : -1;
    return {
      ...base,
      signal: dir,
      confidence: 70,
      detail: `Strong Directional Trend (CHOP ${chop.toFixed(1)} < 38.2)`,
      metrics: { chop },
    };
  }
  if (chop > 61.8) {
    return {
      ...base,
      signal: 0,
      confidence: 85,
      detail: `Extreme Choppiness / Sideways Consolidation (CHOP ${chop.toFixed(1)} > 61.8)`,
      metrics: { chop },
    };
  }
  return { ...base, signal: 0, confidence: 30, detail: `Moderate Choppiness (CHOP ${chop.toFixed(1)})`, metrics: { chop } };
}

/* -------------------------------------------------------------------------- */
/* 5. On-Balance Volume (OBV) Confirmation                                    */
/* -------------------------------------------------------------------------- */
export type ObvConfig = { period: number; enabled: boolean };
export const DEFAULT_OBV_CFG: ObvConfig = { period: 20, enabled: false };

export function obvConfirmation(c: Candle[], cfg: ObvConfig = DEFAULT_OBV_CFG): ResearchStrategyOutput {
  const base = {
    id: "obv_volume_confirmation",
    name: "On-Balance Volume (OBV)",
    enabled: cfg.enabled,
    supportedRegimes: ["TRENDING_BULL" as Regime, "TRENDING_BEAR" as Regime, "VOLATILITY_EXPANSION" as Regime],
  };
  if (c.length < cfg.period) {
    return { ...base, signal: 0, confidence: 10, detail: "Awaiting bars for OBV calculation", metrics: {} };
  }
  const obvArr: number[] = [0];
  for (let i = 1; i < c.length; i++) {
    const prev = obvArr[i - 1];
    if (c[i].c > c[i - 1].c) obvArr.push(prev + c[i].v);
    else if (c[i].c < c[i - 1].c) obvArr.push(prev - c[i].v);
    else obvArr.push(prev);
  }
  const obvEma = last(ema(obvArr, cfg.period));
  const curObv = last(obvArr);
  const diffPct = obvEma !== 0 ? ((curObv - obvEma) / Math.abs(obvEma)) * 100 : 0;

  if (curObv > obvEma && diffPct > 1.0) {
    return {
      ...base,
      signal: 1,
      confidence: 75,
      detail: `Bullish Volume Flow: OBV above 20 EMA (+${diffPct.toFixed(1)}%)`,
      metrics: { obv: curObv, obvEma, diffPct },
    };
  }
  if (curObv < obvEma && diffPct < -1.0) {
    return {
      ...base,
      signal: -1,
      confidence: 75,
      detail: `Bearish Volume Flow: OBV below 20 EMA (${diffPct.toFixed(1)}%)`,
      metrics: { obv: curObv, obvEma, diffPct },
    };
  }
  return { ...base, signal: 0, confidence: 20, detail: "OBV in equilibrium with volume trend", metrics: { obv: curObv, obvEma, diffPct } };
}

/* -------------------------------------------------------------------------- */
/* 6. Parabolic SAR (0.02, 0.20)                                              */
/* -------------------------------------------------------------------------- */
export type PsarConfig = { step: number; maxStep: number; enabled: boolean };
export const DEFAULT_PSAR_CFG: PsarConfig = { step: 0.02, maxStep: 0.2, enabled: false };

export function parabolicSar(c: Candle[], cfg: PsarConfig = DEFAULT_PSAR_CFG): ResearchStrategyOutput {
  const base = {
    id: "parabolic_sar",
    name: "Parabolic SAR (0.02/0.20)",
    enabled: cfg.enabled,
    supportedRegimes: ["TRENDING_BULL" as Regime, "TRENDING_BEAR" as Regime],
  };
  if (c.length < 5) {
    return { ...base, signal: 0, confidence: 10, detail: "Awaiting bars for PSAR", metrics: {} };
  }
  let isLong = c[1].c > c[0].c;
  let af = cfg.step;
  let ep = isLong ? c[0].h : c[0].l;
  let sar = isLong ? c[0].l : c[0].h;

  for (let i = 1; i < c.length; i++) {
    sar = sar + af * (ep - sar);
    if (isLong) {
      if (c[i].l < sar) {
        isLong = false;
        sar = ep;
        af = cfg.step;
        ep = c[i].l;
      } else {
        if (c[i].h > ep) {
          ep = c[i].h;
          af = Math.min(af + cfg.step, cfg.maxStep);
        }
      }
    } else {
      if (c[i].h > sar) {
        isLong = true;
        sar = ep;
        af = cfg.step;
        ep = c[i].h;
      } else {
        if (c[i].l < ep) {
          ep = c[i].l;
          af = Math.min(af + cfg.step, cfg.maxStep);
        }
      }
    }
  }
  const curPx = last(c).c;
  return {
    ...base,
    signal: isLong ? 1 : -1,
    confidence: 70,
    detail: isLong ? `Bullish PSAR support at ${sar.toFixed(2)} (LTP ${curPx.toFixed(2)})` : `Bearish PSAR resistance at ${sar.toFixed(2)} (LTP ${curPx.toFixed(2)})`,
    metrics: { sar, af, ep, isLong: isLong ? 1 : 0 },
  };
}

/* -------------------------------------------------------------------------- */
/* 7. Fibonacci Retracement Levels                                            */
/* -------------------------------------------------------------------------- */
export type FibConfig = { lookback: number; enabled: boolean };
export const DEFAULT_FIB_CFG: FibConfig = { lookback: 50, enabled: false };

export function fibonacciRetracement(c: Candle[], cfg: FibConfig = DEFAULT_FIB_CFG): ResearchStrategyOutput {
  const base = {
    id: "fibonacci_retracement",
    name: "Fibonacci Retracement (0.382 / 0.618)",
    enabled: cfg.enabled,
    supportedRegimes: ["TRENDING_BULL" as Regime, "TRENDING_BEAR" as Regime, "CHOPPY_RANGING" as Regime],
  };
  if (c.length < cfg.lookback) {
    return { ...base, signal: 0, confidence: 10, detail: "Awaiting bars for Fibonacci swing", metrics: {} };
  }
  const win = c.slice(-cfg.lookback);
  const hh = Math.max(...win.map((x) => x.h));
  const ll = Math.min(...win.map((x) => x.l));
  const diff = hh - ll;
  const fib382 = hh - diff * 0.382;
  const fib500 = hh - diff * 0.500;
  const fib618 = hh - diff * 0.618;
  const curPx = last(c).c;

  // Golden Pocket Reversal: Price near 0.618 support in an uptrend
  const nearFib618 = Math.abs(curPx - fib618) / curPx < 0.003;
  const nearFib382 = Math.abs(curPx - fib382) / curPx < 0.003;

  if (nearFib618 && curPx >= fib618) {
    return {
      ...base,
      signal: 1,
      confidence: 75,
      detail: `Golden Pocket Support: Testing 61.8% Fibonacci retracement @ ${fib618.toFixed(2)}`,
      metrics: { hh, ll, fib382, fib500, fib618 },
    };
  }
  if (nearFib382 && curPx <= fib382) {
    return {
      ...base,
      signal: -1,
      confidence: 75,
      detail: `Shallow Retracement Resistance: Testing 38.2% Fibonacci level @ ${fib382.toFixed(2)}`,
      metrics: { hh, ll, fib382, fib500, fib618 },
    };
  }
  return {
    ...base,
    signal: 0,
    confidence: 15,
    detail: `Price @ ${curPx.toFixed(2)} between Fibonacci levels [${fib618.toFixed(2)} - ${fib382.toFixed(2)}]`,
    metrics: { hh, ll, fib382, fib500, fib618 },
  };
}

/* -------------------------------------------------------------------------- */
/* 8. Volume Profile & Value Area High/Low                                    */
/* -------------------------------------------------------------------------- */
export type VolumeProfileConfig = { lookback: number; bins: number; enabled: boolean };
export const DEFAULT_VP_CFG: VolumeProfileConfig = { lookback: 60, bins: 20, enabled: false };

export function volumeProfile(c: Candle[], cfg: VolumeProfileConfig = DEFAULT_VP_CFG): ResearchStrategyOutput {
  const base = {
    id: "volume_profile",
    name: "Volume Profile (POC & Value Area)",
    enabled: cfg.enabled,
    supportedRegimes: ["CHOPPY_RANGING" as Regime, "TRENDING_BULL" as Regime, "TRENDING_BEAR" as Regime],
  };
  if (c.length < cfg.lookback) {
    return { ...base, signal: 0, confidence: 10, detail: "Awaiting bars for Volume Profile", metrics: {} };
  }
  const win = c.slice(-cfg.lookback);
  const hh = Math.max(...win.map((x) => x.h));
  const ll = Math.min(...win.map((x) => x.l));
  const step = (hh - ll) / cfg.bins || 1;

  const binVols = new Array(cfg.bins).fill(0);
  for (const bar of win) {
    const idx = Math.min(cfg.bins - 1, Math.max(0, Math.floor((bar.c - ll) / step)));
    binVols[idx] += bar.v;
  }
  let maxIdx = 0;
  for (let i = 1; i < cfg.bins; i++) {
    if (binVols[i] > binVols[maxIdx]) maxIdx = i;
  }
  const poc = ll + (maxIdx + 0.5) * step;
  const curPx = last(c).c;

  // Value Area ~70% of total volume around POC
  const vah = Math.min(hh, poc + 3 * step);
  const val = Math.max(ll, poc - 3 * step);

  if (curPx < val) {
    return {
      ...base,
      signal: 1,
      confidence: 70,
      detail: `Value Area Discount: Price (${curPx.toFixed(2)}) below VAL (${val.toFixed(2)}), POC at ${poc.toFixed(2)}`,
      metrics: { poc, vah, val },
    };
  }
  if (curPx > vah) {
    return {
      ...base,
      signal: -1,
      confidence: 70,
      detail: `Value Area Premium: Price (${curPx.toFixed(2)}) above VAH (${vah.toFixed(2)}), POC at ${poc.toFixed(2)}`,
      metrics: { poc, vah, val },
    };
  }
  return {
    ...base,
    signal: 0,
    confidence: 25,
    detail: `Price inside Value Area [${val.toFixed(2)} - ${vah.toFixed(2)}] near POC ${poc.toFixed(2)}`,
    metrics: { poc, vah, val },
  };
}

/* -------------------------------------------------------------------------- */
/* 9. Donchian Trend Following (50-bar)                                       */
/* -------------------------------------------------------------------------- */
export type DonchianTrendConfig = { lookback: number; enabled: boolean };
export const DEFAULT_DONCHIAN_CFG: DonchianTrendConfig = { lookback: 50, enabled: false };

export function donchianTrendFollowing(c: Candle[], cfg: DonchianTrendConfig = DEFAULT_DONCHIAN_CFG): ResearchStrategyOutput {
  const base = {
    id: "donchian_trend_50",
    name: "Donchian Trend Following (50)",
    enabled: cfg.enabled,
    supportedRegimes: ["TRENDING_BULL" as Regime, "TRENDING_BEAR" as Regime, "VOLATILITY_EXPANSION" as Regime],
  };
  if (c.length < cfg.lookback + 1) {
    return { ...base, signal: 0, confidence: 10, detail: "Awaiting 50 bars for Donchian Channel", metrics: {} };
  }
  const win = c.slice(-cfg.lookback - 1, -1);
  const hh = Math.max(...win.map((x) => x.h));
  const ll = Math.min(...win.map((x) => x.l));
  const mid = (hh + ll) / 2;
  const curPx = last(c).c;

  if (curPx > hh) {
    return {
      ...base,
      signal: 1,
      confidence: 85,
      detail: `50-Bar Donchian Breakout: Close (${curPx.toFixed(2)}) > Upper Channel (${hh.toFixed(2)})`,
      metrics: { hh, ll, mid },
    };
  }
  if (curPx < ll) {
    return {
      ...base,
      signal: -1,
      confidence: 85,
      detail: `50-Bar Donchian Breakdown: Close (${curPx.toFixed(2)}) < Lower Channel (${ll.toFixed(2)})`,
      metrics: { hh, ll, mid },
    };
  }
  return {
    ...base,
    signal: 0,
    confidence: 15,
    detail: `Inside 50-bar Donchian Range [${ll.toFixed(2)} - ${hh.toFixed(2)}]`,
    metrics: { hh, ll, mid },
  };
}

/* -------------------------------------------------------------------------- */
/* 10. Multi-Timeframe Trend Confirmation (Synthesized 5-min from 1-min)       */
/* -------------------------------------------------------------------------- */
export type MtfConfig = { factor: number; emaPeriod: number; enabled: boolean };
export const DEFAULT_MTF_CFG: MtfConfig = { factor: 5, emaPeriod: 20, enabled: false };

export function multiTimeframeTrend(c: Candle[], cfg: MtfConfig = DEFAULT_MTF_CFG): ResearchStrategyOutput {
  const base = {
    id: "mtf_trend_confirmation",
    name: "Multi-Timeframe Trend (5m / 1m)",
    enabled: cfg.enabled,
    supportedRegimes: ["TRENDING_BULL" as Regime, "TRENDING_BEAR" as Regime],
  };
  if (c.length < cfg.factor * cfg.emaPeriod) {
    return { ...base, signal: 0, confidence: 10, detail: "Awaiting 100 bars for MTF 5-minute aggregation", metrics: {} };
  }
  // Synthesize 5-minute candles
  const mtfBars: Candle[] = [];
  for (let i = 0; i < c.length; i += cfg.factor) {
    const chunk = c.slice(i, i + cfg.factor);
    if (!chunk.length) continue;
    mtfBars.push({
      t: chunk[0].t,
      o: chunk[0].o,
      h: Math.max(...chunk.map((x) => x.h)),
      l: Math.min(...chunk.map((x) => x.l)),
      c: chunk[chunk.length - 1].c,
      v: chunk.reduce((a, x) => a + x.v, 0),
    });
  }
  const mtfCloses = mtfBars.map((x) => x.c);
  const mtfEma = last(ema(mtfCloses, cfg.emaPeriod));
  const curPx = last(c).c;
  const mtfLastClose = last(mtfBars).c;

  if (curPx > mtfEma && mtfLastClose > mtfEma) {
    return {
      ...base,
      signal: 1,
      confidence: 80,
      detail: `Higher Timeframe (5-min) Bullish Alignment: Close (${curPx.toFixed(2)}) > 5m EMA20 (${mtfEma.toFixed(2)})`,
      metrics: { mtfEma, mtfBarsCount: mtfBars.length },
    };
  }
  if (curPx < mtfEma && mtfLastClose < mtfEma) {
    return {
      ...base,
      signal: -1,
      confidence: 80,
      detail: `Higher Timeframe (5-min) Bearish Alignment: Close (${curPx.toFixed(2)}) < 5m EMA20 (${mtfEma.toFixed(2)})`,
      metrics: { mtfEma, mtfBarsCount: mtfBars.length },
    };
  }
  return {
    ...base,
    signal: 0,
    confidence: 20,
    detail: `MTF Trend Neutral around 5m EMA20 (${mtfEma.toFixed(2)})`,
    metrics: { mtfEma, mtfBarsCount: mtfBars.length },
  };
}

/* -------------------------------------------------------------------------- */
/* Registry of Research Extensions (All disabled by default)                  */
/* -------------------------------------------------------------------------- */
export const RESEARCH_STRATEGIES = [
  macdMomentum,
  ichimokuCloud,
  keltnerChannel,
  choppinessIndex,
  obvConfirmation,
  parabolicSar,
  fibonacciRetracement,
  volumeProfile,
  donchianTrendFollowing,
  multiTimeframeTrend,
] as const;
