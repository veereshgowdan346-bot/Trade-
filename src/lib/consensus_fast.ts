/**
 * PERF-001 — O(n) consensus evaluation for the backtester.
 *
 * WHY THIS IS EXACT (and not an approximation)
 * --------------------------------------------
 * `runBacktest` used to call `evaluateConsensus(candles.slice(0, i + 1), cfg)` at every bar.
 * That rebuilds the prefix array and recomputes ~10 indicator arrays over it, so a run costs
 * O(n^2). Every indicator and every voter, however, is *causal*: `ema(closes, p)[i]` depends
 * only on bars <= i, `vwap` accumulates from bar 0, `bollinger` reads a 20-bar window ending
 * at i, `superTrend`/`adx`/`rsi`/`atr` are recursive from the start. Therefore
 *
 *     last(indicator(candles.slice(0, i + 1)))  ===  indicator(candles)[i]
 *
 * bit-for-bit: same function, same inputs, same operations, same order. This module computes
 * each array ONCE over the full series (O(n)) and then reads index `i` per bar, reproducing
 * the identical values with O(1) work per bar. Bounded look-back windows (SMC's last-26..-3,
 * GBM's last 60, regime's last-50 means, plugin Donchian windows) are reproduced by slicing
 * the same suffix of the same data.
 *
 * Two deliberate behaviours are preserved EXACTLY, even though they look odd:
 *  1. `orbVwapMomentum` sizes its opening-range window from `floor(prefixLength * 0.35)`
 *     (clamped to 10..20). The window therefore depends on the PREFIX LENGTH, not the final
 *     array length — this module passes the prefix length in explicitly.
 *  2. `classifyRegime` returns rounded fields (2 or 4 dp) and the wave gate consumes those
 *     rounded values. The rounding is replicated, not the raw numbers.
 *
 * Everything here is verified bar-for-bar against `evaluateConsensus` by
 * `scripts/perf_equivalence.js`. If that check ever fails, the fast path must be disabled.
 */

import type { Candle } from "./indicators";
import { adx, atr, bollinger, ema, rsi, superTrend, vwap } from "./indicators";
import type { Consensus, PluginDef, PluginReading, StrategyReading, Vote } from "./strategies";
import { getCachedPlugins, gbmProbability } from "./strategies";
import type { Regime, RegimeReading } from "./intelligence";
import type { RiskConfig } from "./risk";

const clamp = (v: number, a = 0, b = 100) => Math.min(b, Math.max(a, v));
const round = (v: number, d = 2) => (Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : 0);

export type Snapshot = {
  n: number;
  close: Float64Array;
  ema9: Float64Array;
  ema21: Float64Array;
  rsi14: Float64Array;
  atr14: Float64Array;
  bbMid: Float64Array;
  bbUpper: Float64Array;
  bbLower: Float64Array;
  bbWidth: Float64Array;
  vwapArr: Float64Array;
  stDir: Float64Array;
  stLine: Float64Array;
  adxArr: Float64Array;
  plusDI: Float64Array;
  minusDI: Float64Array;
  /** lazily-built EMA/RSI arrays for plugin periods (a handful of distinct periods) */
  emaByPeriod: Map<number, Float64Array>;
  rsiByPeriod: Map<number, Float64Array>;
};

const toF64 = (a: number[]) => {
  const out = new Float64Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i];
  return out;
};

/** Precompute every indicator the decision layer needs, once, in O(n). */
export function buildSnapshot(c: Candle[]): Snapshot {
  const closes = c.map((x) => x.c);
  const bb = bollinger(closes, 20, 2);
  const st = superTrend(c, 10, 3);
  const ad = adx(c, 14);
  return {
    n: c.length,
    close: toF64(closes),
    ema9: toF64(ema(closes, 9)),
    ema21: toF64(ema(closes, 21)),
    rsi14: toF64(rsi(closes, 14)),
    atr14: toF64(atr(c, 14)),
    bbMid: toF64(bb.mid),
    bbUpper: toF64(bb.upper),
    bbLower: toF64(bb.lower),
    bbWidth: toF64(bb.width),
    vwapArr: toF64(vwap(c)),
    stDir: toF64(st.dir),
    stLine: toF64(st.line),
    adxArr: toF64(ad.adx),
    plusDI: toF64(ad.plusDI),
    minusDI: toF64(ad.minusDI),
    emaByPeriod: new Map(),
    rsiByPeriod: new Map(),
  };
}

function emaAt(snap: Snapshot, c: Candle[], period: number, i: number): number {
  let arr = snap.emaByPeriod.get(period);
  if (!arr) {
    arr = toF64(ema(c.map((x) => x.c), period));
    snap.emaByPeriod.set(period, arr);
  }
  return arr[i];
}

function rsiAt(snap: Snapshot, c: Candle[], period: number, i: number): number {
  let arr = snap.rsiByPeriod.get(period);
  if (!arr) {
    arr = toF64(rsi(c.map((x) => x.c), period));
    snap.rsiByPeriod.set(period, arr);
  }
  return arr[i];
}

/* --------------------------- regime (mirrored) --------------------------- */

function regimeAt(snap: Snapshot, i: number): RegimeReading {
  if (i + 1 < 30) {
    return {
      regime: "CHOPPY_RANGING",
      adx: 0,
      plusDI: 0,
      minusDI: 0,
      atr: 0,
      atrRatio: 1,
      bbWidth: 0,
      bbWidthRatio: 1,
      trendFollowingAllowed: false,
      meanReversionActive: false,
    };
  }
  const atrNow = snap.atr14[i];
  // prefix.slice(-50) === indices [max(0, i-49) .. i]
  let sumA = 0;
  let cntA = 0;
  for (let k = Math.max(0, i - 49); k <= i; k++) {
    const v = snap.atr14[k];
    if (!Number.isNaN(v)) {
      sumA += v;
      cntA++;
    }
  }
  const atrMean = cntA ? sumA / cntA : atrNow;
  const atrRatio = atrMean ? atrNow / atrMean : 1;

  const bwNow = snap.bbWidth[i];
  let sumB = 0;
  let cntB = 0;
  for (let k = Math.max(0, i - 49); k <= i; k++) {
    const v = snap.bbWidth[k];
    if (!Number.isNaN(v)) {
      sumB += v;
      cntB++;
    }
  }
  const bwMean = cntB ? sumB / cntB : bwNow;
  const bwRatio = bwMean ? bwNow / bwMean : 1;

  const adxNow = snap.adxArr[i] || 0;
  const pDI = snap.plusDI[i] || 0;
  const mDI = snap.minusDI[i] || 0;

  let regime: Regime;
  if (atrRatio >= 1.5 || (bwRatio >= 1.6 && atrRatio >= 1.2)) regime = "VOLATILITY_EXPANSION";
  else if (adxNow >= 25) regime = pDI >= mDI ? "TRENDING_BULL" : "TRENDING_BEAR";
  else if (adxNow >= 20 && Math.abs(pDI - mDI) >= 10) regime = pDI > mDI ? "TRENDING_BULL" : "TRENDING_BEAR";
  else regime = "CHOPPY_RANGING";

  return {
    regime,
    adx: round(adxNow),
    plusDI: round(pDI),
    minusDI: round(mDI),
    atr: round(atrNow, 4),
    atrRatio: round(atrRatio),
    bbWidth: round(bwNow),
    bbWidthRatio: round(bwRatio),
    trendFollowingAllowed: regime !== "CHOPPY_RANGING",
    meanReversionActive: regime === "CHOPPY_RANGING",
  };
}

/* --------------------------- voters (mirrored) --------------------------- */
// Each mirrors its counterpart in strategies.ts exactly, reading precomputed arrays at `i`.

const BASE_SMC = { id: "smc_liquidity_grab", name: "SMC Liquidity Grab", family: "STRUCTURE" as const, suppressed: false };
const BASE_VW = { id: "institutional_vwap", name: "Institutional VWAP", family: "STRUCTURE" as const, suppressed: false };
const BASE_EM = { id: "dual_ema_9_21", name: "Dual EMA (9/21)", family: "TREND" as const, suppressed: false };
const BASE_ST = { id: "supertrend_10_3", name: "SuperTrend (10,3)", family: "TREND" as const, suppressed: false };
const BASE_ORB = { id: "orb_vwap_momentum", name: "ORB & VWAP Momentum", family: "STRUCTURE" as const, suppressed: false };
const BASE_BB = { id: "bb_mean_reversion", name: "Bollinger Mean-Reversion", family: "MEAN_REVERSION" as const, suppressed: false };
const BASE_RS = { id: "rsi_mean_reversion", name: "RSI Mean-Reversion", family: "MEAN_REVERSION" as const, suppressed: false };

/** suffix window over the prefix ending at `i`: prefix.slice(a, b) with negative indices */
function prefixSlice(c: Candle[], i: number, a: number, b: number): Candle[] {
  const len = i + 1;
  const start = a < 0 ? Math.max(0, len + a) : Math.min(a, len);
  const end = b === undefined ? len : b < 0 ? Math.max(0, len + b) : Math.min(b, len);
  return c.slice(start, Math.max(start, end));
}

function smcAt(c: Candle[], _snap: Snapshot, i: number): StrategyReading {
  const look = prefixSlice(c, i, -26, -3);
  const swingHigh = Math.max(...look.map((x) => x.h));
  const swingLow = Math.min(...look.map((x) => x.l));
  const recent = prefixSlice(c, i, -3, len0(i));
  for (let k = recent.length - 1; k >= 0; k--) {
    const x = recent[k];
    if (x.l < swingLow && x.c > swingLow && x.c > x.o)
      return { ...BASE_SMC, vote: 1, strength: 85, detail: `Sell-side sweep below ${swingLow.toFixed(2)} reclaimed (Bull)` };
    if (x.h > swingHigh && x.c < swingHigh && x.c < x.o)
      return { ...BASE_SMC, vote: -1, strength: 85, detail: `Buy-side sweep above ${swingHigh.toFixed(2)} rejected (Bear)` };
  }
  const cur = c[i];
  if (cur.c < swingLow) {
    return { ...BASE_SMC, vote: -1, strength: 75, detail: `Bearish structure: breakdown below ${swingLow.toFixed(2)}` };
  }
  if (cur.c > swingHigh) {
    return { ...BASE_SMC, vote: 1, strength: 75, detail: `Bullish structure: expansion above ${swingHigh.toFixed(2)}` };
  }
  return { ...BASE_SMC, vote: 0, strength: 20, detail: `Inside structure ${swingLow.toFixed(2)} - ${swingHigh.toFixed(2)}` };
}
const len0 = (i: number) => i + 1; // helper: explicit end-of-prefix marker for prefixSlice

function vwapAt(_c: Candle[], snap: Snapshot, i: number): StrategyReading {
  const v = snap.vwapArr[i];
  const px = snap.close[i];
  const dev = ((px - v) / v) * 100;
  if (Math.abs(dev) < 0.02) return { ...BASE_VW, vote: 0, strength: 15, detail: `Price on VWAP ${v.toFixed(2)}` };
  return {
    ...BASE_VW,
    vote: dev > 0 ? 1 : -1,
    strength: clamp(45 + Math.abs(dev) * 200),
    detail: `${dev > 0 ? "Bullish >" : "Bearish <"} VWAP ${v.toFixed(2)} (${dev > 0 ? "+" : ""}${dev.toFixed(2)}%)`,
  };
}

function dualEmaAt(snap: Snapshot, i: number): StrategyReading {
  const f = snap.ema9;
  const s = snap.ema21;
  const fLast = f[i];
  const sLast = s[i];
  const gap = ((fLast - sLast) / sLast) * 100;
  const crossed = Math.sign(f[i - 1] - s[i - 1]) !== Math.sign(fLast - sLast);
  if (Math.abs(gap) < 0.01) return { ...BASE_EM, vote: 0, strength: 10, detail: "EMAs flat" };
  return {
    ...BASE_EM,
    vote: gap > 0 ? 1 : -1,
    strength: clamp(45 + Math.abs(gap) * 250 + (crossed ? 20 : 0)),
    detail: `EMA9 ${gap > 0 ? ">" : "<"} EMA21 (${gap.toFixed(2)}%)${crossed ? " fresh cross" : ""}`,
  };
}

function superTrendAt(snap: Snapshot, i: number): StrategyReading {
  const d = snap.stDir[i];
  const line = snap.stLine[i];
  const px = snap.close[i];
  const dist = (Math.abs(px - line) / px) * 100;
  return {
    ...BASE_ST,
    vote: d === 1 ? 1 : -1,
    strength: clamp(50 + dist * 120),
    detail: `${d === 1 ? "Bullish (Green)" : "Bearish (Red)"} @ ${line.toFixed(2)}`,
  };
}

function orbAt(c: Candle[], snap: Snapshot, i: number): StrategyReading {
  const prefixLen = i + 1;
  if (prefixLen < 15) {
    return { ...BASE_ORB, vote: 0, strength: 10, detail: "Awaiting 15 opening bars" };
  }
  // EXACT parity with the legacy voter: window length depends on the PREFIX length.
  const orbLen = Math.min(20, Math.max(10, Math.floor(prefixLen * 0.35)));
  let orbHigh = -Infinity;
  let orbLow = Infinity;
  for (let k = 0; k < orbLen && k < prefixLen; k++) {
    if (c[k].h > orbHigh) orbHigh = c[k].h;
    if (c[k].l < orbLow) orbLow = c[k].l;
  }
  const cur = c[i];
  const px = cur.c;
  const v = snap.vwapArr[i];
  const dev = ((px - v) / v) * 100;
  const mom3 = prefixLen >= 3 ? ((cur.c - c[i - 2].c) / c[i - 2].c) * 100 : 0;

  if (px < orbLow && px < v) {
    return {
      ...BASE_ORB,
      vote: -1,
      strength: clamp(80 + Math.abs(dev) * 150 + (mom3 < 0 ? 15 : 0)),
      detail: `ORB breakdown < ${orbLow.toFixed(2)} & < VWAP ${v.toFixed(2)} (-${Math.abs(dev).toFixed(2)}%)`,
    };
  }
  if (px > orbHigh && px > v) {
    return {
      ...BASE_ORB,
      vote: 1,
      strength: clamp(80 + dev * 150 + (mom3 > 0 ? 15 : 0)),
      detail: `ORB breakout > ${orbHigh.toFixed(2)} & > VWAP ${v.toFixed(2)} (+${dev.toFixed(2)}%)`,
    };
  }
  // Remaining branches mirror the legacy implementation verbatim.
  return orbFallback(c, snap, i, v, dev, mom3, orbHigh, orbLow);
}

/* The legacy voter's later branches, reproduced verbatim (same thresholds, strengths, text). */
function orbFallback(
  c: Candle[],
  snap: Snapshot,
  i: number,
  v: number,
  dev: number,
  mom3: number,
  orbHigh: number,
  orbLow: number,
): StrategyReading {
  const px = c[i].c;
  // Bearish Case 2: VWAP rejection with downward velocity
  if (px < v && mom3 < -0.15) {
    return {
      ...BASE_ORB,
      vote: -1,
      strength: clamp(65 + Math.abs(mom3) * 100),
      detail: `Bearish VWAP rejection @ ${v.toFixed(2)} (mom ${mom3.toFixed(2)}%)`,
    };
  }
  // Bullish Case 2: VWAP bounce with upward velocity
  if (px > v && mom3 > 0.15) {
    return {
      ...BASE_ORB,
      vote: 1,
      strength: clamp(65 + mom3 * 100),
      detail: `Bullish VWAP bounce @ ${v.toFixed(2)} (mom +${mom3.toFixed(2)}%)`,
    };
  }
  // Range evaluation within ORB
  const orbRange = orbHigh - orbLow;
  if (orbRange > 0) {
    const relPos = (px - orbLow) / orbRange;
    if (relPos < 0.35 && px < v) {
      return { ...BASE_ORB, vote: -1, strength: 55, detail: `Trading in lower 35% of ORB below VWAP` };
    }
    if (relPos > 0.65 && px > v) {
      return { ...BASE_ORB, vote: 1, strength: 55, detail: `Trading in upper 35% of ORB above VWAP` };
    }
  }
  void snap;
  void dev;
  return { ...BASE_ORB, vote: 0, strength: 20, detail: `Consolidating within ORB [${orbLow.toFixed(2)} - ${orbHigh.toFixed(2)}]` };
}

function bbAt(snap: Snapshot, i: number): StrategyReading {
  const px = snap.close[i];
  const u = snap.bbUpper[i];
  const l = snap.bbLower[i];
  const mid = snap.bbMid[i];
  if (px <= l) return { ...BASE_BB, vote: 1, strength: 85, detail: `Oversold: close under lower band ${l.toFixed(2)} (BUY)` };
  if (px >= u) return { ...BASE_BB, vote: -1, strength: 85, detail: `Overbought: close over upper band ${u.toFixed(2)} (SELL)` };
  const half = (u - l) / 2;
  const pos = half > 0 ? (px - mid) / half : 0;
  if (pos > 0.6) return { ...BASE_BB, vote: -1, strength: 65, detail: `Upper band stretched +${(pos * 100).toFixed(0)}% (SELL tilt)` };
  if (pos < -0.6) return { ...BASE_BB, vote: 1, strength: 65, detail: `Lower band stretched ${(pos * 100).toFixed(0)}% (BUY tilt)` };
  return { ...BASE_BB, vote: 0, strength: 10, detail: `Inside band around ${mid.toFixed(2)}` };
}

function rsiAtVoter(snap: Snapshot, i: number): StrategyReading {
  const r = snap.rsi14[i];
  if (r <= 30) return { ...BASE_RS, vote: 1, strength: 90, detail: `RSI ${r.toFixed(1)} deeply oversold (BUY)` };
  if (r >= 70) return { ...BASE_RS, vote: -1, strength: 90, detail: `RSI ${r.toFixed(1)} deeply overbought (SELL Short)` };
  if (r <= 40) return { ...BASE_RS, vote: 1, strength: 65, detail: `RSI ${r.toFixed(1)} oversold tilt (BUY)` };
  if (r >= 60) return { ...BASE_RS, vote: -1, strength: 65, detail: `RSI ${r.toFixed(1)} overbought tilt (SELL Short)` };
  return { ...BASE_RS, vote: 0, strength: 15, detail: `RSI ${r.toFixed(1)} neutral range` };
}

/* ---------------------------- plugins (mirrored) ------------------------- */

function pluginAt(def: PluginDef, file: string, c: Candle[], snap: Snapshot, i: number): PluginReading {
  const p = def.params ?? {};
  const mk = (vote: Vote, detail: string): PluginReading => ({ id: def.id, name: def.name, type: def.type, vote, detail, file });
  if (def.type === "ema_cross") {
    const fastP = p.fast ?? 5;
    const slowP = p.slow ?? 13;
    const f = emaAt(snap, c, fastP, i);
    const s = emaAt(snap, c, slowP, i);
    return mk(f > s ? 1 : f < s ? -1 : 0, `EMA${fastP}/${slowP}`);
  }
  if (def.type === "rsi_reversion") {
    const period = p.period ?? 14;
    const r = rsiAt(snap, c, period, i);
    const lo = p.low ?? 30;
    const hi = p.high ?? 70;
    return mk(r <= lo ? 1 : r >= hi ? -1 : 0, `RSI ${r.toFixed(1)}`);
  }
  const lb = p.lookback ?? 20;
  const win = prefixSlice(c, i, -lb - 1, -1);
  const hh = Math.max(...win.map((x) => x.h));
  const ll = Math.min(...win.map((x) => x.l));
  const px = c[i].c;
  return mk(px > hh ? 1 : px < ll ? -1 : 0, `Donchian ${lb} [${ll.toFixed(2)} - ${hh.toFixed(2)}]`);
}

/* ----------------------------- the evaluator ----------------------------- */

/**
 * Equivalent of `evaluateConsensus(candles.slice(0, i + 1), cfg, externalVote, pluginDefs)`.
 * Verified bar-for-bar by scripts/perf_equivalence.js.
 */
export function evaluateConsensusAt(
  c: Candle[],
  i: number,
  snap: Snapshot,
  cfg: RiskConfig,
  externalVote?: Vote,
  pluginDefs?: { def: PluginDef; file: string }[],
): Consensus {
  const regime = regimeAt(snap, i);
  const prefixLen = i + 1;

  if (prefixLen < 30) {
    return {
      regime,
      waveGate: {
        active: false,
        waveType: "CONSOLIDATION_PAUSED",
        adx: 0,
        bbWidthRatio: 1,
        atrRatio: 1,
        reason: "Awaiting 30 real candles for wave momentum evaluation",
      },
      strategies: [],
      suppressed: [],
      buyVotes: 0,
      sellVotes: 0,
      voters: 5,
      quorumPct: 0,
      direction: "NONE",
      gbm: { up: 50, down: 50, forDirection: 50, horizon: 15 },
      qualifies: false,
      atr: 0,
      plugins: [],
      lastPrice: c[i]?.c ?? 0,
    };
  }

  const isDirectionalWave = regime.adx >= 20;
  const isExpansionWave = regime.bbWidthRatio >= 1.2 || regime.atrRatio >= 1.15;
  const isConsolidation = regime.regime === "CHOPPY_RANGING" || (!isDirectionalWave && !isExpansionWave);
  const waveActive = !isConsolidation;

  const waveGate = {
    active: waveActive,
    waveType: isDirectionalWave
      ? ("DIRECTIONAL_WAVE" as const)
      : isExpansionWave
        ? ("VOLATILITY_EXPANSION_WAVE" as const)
        : ("CONSOLIDATION_PAUSED" as const),
    adx: regime.adx,
    bbWidthRatio: regime.bbWidthRatio,
    atrRatio: regime.atrRatio,
    reason: waveActive
      ? `High-momentum wave active (${isDirectionalWave ? `ADX ${regime.adx} >= 20` : `BB expansion ${regime.bbWidthRatio}x`})`
      : `Choppy Consolidation Paused: ADX ${regime.adx} < 20 & BB Width ${regime.bbWidthRatio}x (Market in sideways accumulation phase)`,
  };

  const smc = smcAt(c, snap, i);
  const vw = vwapAt(c, snap, i);
  const em = dualEmaAt(snap, i);
  const st = superTrendAt(snap, i);
  const orb = orbAt(c, snap, i);
  const bb = bbAt(snap, i);
  const rs = rsiAtVoter(snap, i);

  let active: StrategyReading[];
  let suppressed: StrategyReading[] = [];
  if (regime.regime === "CHOPPY_RANGING") {
    suppressed = [
      { ...em, suppressed: true, vote: 0, detail: `SUPPRESSED (choppy) — ${em.detail}` },
      { ...st, suppressed: true, vote: 0, detail: `SUPPRESSED (choppy) — ${st.detail}` },
    ];
    active = [smc, vw, orb, bb, rs];
  } else {
    active = [smc, vw, em, st, orb];
  }

  let buy = active.filter((s) => s.vote === 1).length;
  let sell = active.filter((s) => s.vote === -1).length;
  let voters = active.length;
  if (externalVote !== undefined) {
    voters += 1;
    if (externalVote === 1) buy += 1;
    if (externalVote === -1) sell += 1;
  }
  const direction: Consensus["direction"] = buy > sell ? "BUY" : sell > buy ? "SELL" : "NONE";
  const agree = Math.max(buy, sell);
  const quorumPct = Math.round((agree / voters) * 100);

  // gbmProbability uses prefix.slice(-60) — reproduce the identical suffix.
  const g = gbmProbability(prefixSlice(c, i, -60, len0(i)), 15);
  const forDirection = direction === "BUY" ? g.up : direction === "SELL" ? g.down : Math.max(g.up, g.down);
  const qualifies = direction !== "NONE" && quorumPct >= cfg.quorumPct && forDirection >= cfg.gbmMin && waveActive;

  const defs: { def: PluginDef; file: string }[] = pluginDefs ?? getCachedPlugins();
  const plugins = defs.map(({ def, file }) => pluginAt(def, file, c, snap, i));
  const a = snap.atr14[i];

  return {
    regime,
    waveGate,
    strategies: active,
    suppressed,
    buyVotes: buy,
    sellVotes: sell,
    voters,
    quorumPct,
    direction,
    gbm: { up: g.up, down: g.down, forDirection, horizon: g.horizon },
    qualifies,
    atr: Number.isFinite(a) ? a : 0,
    plugins,
    lastPrice: c[i].c,
  };
}
