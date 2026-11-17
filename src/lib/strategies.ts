import fs from "node:fs/promises";
import path from "node:path";
import { atr, bollinger, ema, last, rsi, superTrend, vwap, type Candle } from "./indicators";
import { classifyRegime, type RegimeReading } from "./intelligence";
import type { RiskConfig } from "./risk";

export type Vote = 1 | -1 | 0;

export type StrategyReading = {
  id: string;
  name: string;
  family: "TREND" | "MEAN_REVERSION" | "STRUCTURE";
  vote: Vote;
  strength: number; // 0..100
  detail: string;
  suppressed: boolean;
};

const clamp = (v: number, a = 0, b = 100) => Math.min(b, Math.max(a, v));

/* ------------------------------ built-ins -------------------------------- */

function smcLiquidityGrab(c: Candle[]): StrategyReading {
  const base = { id: "smc_liquidity_grab", name: "SMC Liquidity Grab", family: "STRUCTURE" as const, suppressed: false };
  const look = c.slice(-26, -3);
  const swingHigh = Math.max(...look.map((x) => x.h));
  const swingLow = Math.min(...look.map((x) => x.l));
  const recent = c.slice(-3);
  for (let i = recent.length - 1; i >= 0; i--) {
    const x = recent[i];
    if (x.l < swingLow && x.c > swingLow && x.c > x.o)
      return { ...base, vote: 1, strength: 85, detail: `Sell-side sweep below ${swingLow.toFixed(2)} reclaimed (Bull)` };
    if (x.h > swingHigh && x.c < swingHigh && x.c < x.o)
      return { ...base, vote: -1, strength: 85, detail: `Buy-side sweep above ${swingHigh.toFixed(2)} rejected (Bear)` };
  }
  const cur = c[c.length - 1];
  if (cur.c < swingLow) {
    return { ...base, vote: -1, strength: 75, detail: `Bearish structure: breakdown below ${swingLow.toFixed(2)}` };
  }
  if (cur.c > swingHigh) {
    return { ...base, vote: 1, strength: 75, detail: `Bullish structure: expansion above ${swingHigh.toFixed(2)}` };
  }
  return { ...base, vote: 0, strength: 20, detail: `Inside structure ${swingLow.toFixed(2)} - ${swingHigh.toFixed(2)}` };
}

function institutionalVwap(c: Candle[]): StrategyReading {
  const base = { id: "institutional_vwap", name: "Institutional VWAP", family: "STRUCTURE" as const, suppressed: false };
  const v = last(vwap(c));
  const px = last(c).c;
  const dev = ((px - v) / v) * 100;
  if (Math.abs(dev) < 0.02) return { ...base, vote: 0, strength: 15, detail: `Price on VWAP ${v.toFixed(2)}` };
  return {
    ...base,
    vote: dev > 0 ? 1 : -1,
    strength: clamp(45 + Math.abs(dev) * 200),
    detail: `${dev > 0 ? "Bullish >" : "Bearish <"} VWAP ${v.toFixed(2)} (${dev > 0 ? "+" : ""}${dev.toFixed(2)}%)`,
  };
}

function dualEma(c: Candle[]): StrategyReading {
  const base = { id: "dual_ema_9_21", name: "Dual EMA (9/21)", family: "TREND" as const, suppressed: false };
  const closes = c.map((x) => x.c);
  const f = ema(closes, 9);
  const s = ema(closes, 21);
  const gap = ((last(f) - last(s)) / last(s)) * 100;
  const crossed = Math.sign(f[f.length - 2] - s[s.length - 2]) !== Math.sign(last(f) - last(s));
  if (Math.abs(gap) < 0.01) return { ...base, vote: 0, strength: 10, detail: "EMAs flat" };
  return {
    ...base,
    vote: gap > 0 ? 1 : -1,
    strength: clamp(45 + Math.abs(gap) * 250 + (crossed ? 20 : 0)),
    detail: `EMA9 ${gap > 0 ? ">" : "<"} EMA21 (${gap.toFixed(2)}%)${crossed ? " fresh cross" : ""}`,
  };
}

function superTrendStrategy(c: Candle[]): StrategyReading {
  const base = { id: "supertrend_10_3", name: "SuperTrend (10,3)", family: "TREND" as const, suppressed: false };
  const st = superTrend(c, 10, 3);
  const d = last(st.dir);
  const dist = (Math.abs(last(c).c - last(st.line)) / last(c).c) * 100;
  return {
    ...base,
    vote: d === 1 ? 1 : -1,
    strength: clamp(50 + dist * 120),
    detail: `${d === 1 ? "Bullish (Green)" : "Bearish (Red)"} @ ${last(st.line).toFixed(2)}`,
  };
}

/**
 * 5th High-Conviction Strategy Voter: Opening Range Breakout/Breakdown & VWAP Momentum
 * Specifically tuned to catch sharp market sell-offs and trend reversals in both Bull and Bear regimes.
 */
function orbVwapMomentum(c: Candle[]): StrategyReading {
  const base = { id: "orb_vwap_momentum", name: "ORB & VWAP Momentum", family: "STRUCTURE" as const, suppressed: false };
  if (c.length < 15) {
    return { ...base, vote: 0, strength: 10, detail: "Awaiting 15 opening bars" };
  }
  const orbWindow = c.slice(0, Math.min(20, Math.max(10, Math.floor(c.length * 0.35))));
  const orbHigh = Math.max(...orbWindow.map((x) => x.h));
  const orbLow = Math.min(...orbWindow.map((x) => x.l));
  const cur = last(c);
  const px = cur.c;
  const v = last(vwap(c));
  const dev = ((px - v) / v) * 100;
  const mom3 = c.length >= 3 ? ((cur.c - c[c.length - 3].c) / c[c.length - 3].c) * 100 : 0;

  // Bearish Case 1: Breakdown below ORB low AND below VWAP
  if (px < orbLow && px < v) {
    return {
      ...base,
      vote: -1,
      strength: clamp(80 + Math.abs(dev) * 150 + (mom3 < 0 ? 15 : 0)),
      detail: `ORB breakdown < ${orbLow.toFixed(2)} & < VWAP ${v.toFixed(2)} (-${Math.abs(dev).toFixed(2)}%)`,
    };
  }

  // Bullish Case 1: Breakout above ORB high AND above VWAP
  if (px > orbHigh && px > v) {
    return {
      ...base,
      vote: 1,
      strength: clamp(80 + dev * 150 + (mom3 > 0 ? 15 : 0)),
      detail: `ORB breakout > ${orbHigh.toFixed(2)} & > VWAP ${v.toFixed(2)} (+${dev.toFixed(2)}%)`,
    };
  }

  // Bearish Case 2: VWAP rejection with downward velocity
  if (px < v && mom3 < -0.15) {
    return {
      ...base,
      vote: -1,
      strength: clamp(65 + Math.abs(mom3) * 100),
      detail: `Bearish VWAP rejection @ ${v.toFixed(2)} (mom ${mom3.toFixed(2)}%)`,
    };
  }

  // Bullish Case 2: VWAP bounce with upward velocity
  if (px > v && mom3 > 0.15) {
    return {
      ...base,
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
      return { ...base, vote: -1, strength: 55, detail: `Trading in lower 35% of ORB below VWAP` };
    }
    if (relPos > 0.65 && px > v) {
      return { ...base, vote: 1, strength: 55, detail: `Trading in upper 35% of ORB above VWAP` };
    }
  }

  return { ...base, vote: 0, strength: 20, detail: `Consolidating within ORB [${orbLow.toFixed(2)} - ${orbHigh.toFixed(2)}]` };
}

function bbReversion(c: Candle[]): StrategyReading {
  const base = { id: "bb_mean_reversion", name: "Bollinger Mean-Reversion", family: "MEAN_REVERSION" as const, suppressed: false };
  const closes = c.map((x) => x.c);
  const bb = bollinger(closes, 20, 2);
  const px = last(closes);
  const u = last(bb.upper);
  const l = last(bb.lower);
  const mid = last(bb.mid);
  if (px <= l) return { ...base, vote: 1, strength: 85, detail: `Oversold: close under lower band ${l.toFixed(2)} (BUY)` };
  if (px >= u) return { ...base, vote: -1, strength: 85, detail: `Overbought: close over upper band ${u.toFixed(2)} (SELL)` };
  const half = (u - l) / 2;
  const pos = half > 0 ? (px - mid) / half : 0;
  if (pos > 0.6) return { ...base, vote: -1, strength: 65, detail: `Upper band stretched +${(pos * 100).toFixed(0)}% (SELL tilt)` };
  if (pos < -0.6) return { ...base, vote: 1, strength: 65, detail: `Lower band stretched ${(pos * 100).toFixed(0)}% (BUY tilt)` };
  return { ...base, vote: 0, strength: 10, detail: `Inside band around ${mid.toFixed(2)}` };
}

function rsiReversion(c: Candle[]): StrategyReading {
  const base = { id: "rsi_mean_reversion", name: "RSI Mean-Reversion", family: "MEAN_REVERSION" as const, suppressed: false };
  const r = last(rsi(c.map((x) => x.c), 14));
  if (r <= 30) return { ...base, vote: 1, strength: 90, detail: `RSI ${r.toFixed(1)} deeply oversold (BUY)` };
  if (r >= 70) return { ...base, vote: -1, strength: 90, detail: `RSI ${r.toFixed(1)} deeply overbought (SELL Short)` };
  if (r <= 40) return { ...base, vote: 1, strength: 65, detail: `RSI ${r.toFixed(1)} oversold tilt (BUY)` };
  if (r >= 60) return { ...base, vote: -1, strength: 65, detail: `RSI ${r.toFixed(1)} overbought tilt (SELL Short)` };
  return { ...base, vote: 0, strength: 15, detail: `RSI ${r.toFixed(1)} neutral range` };
}

/* ------------------------------ GBM gate --------------------------------- */

function normCdf(x: number) {
  // Abramowitz-Stegun
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

/** Geometric Brownian Motion probability that price is higher after `horizon` minutes. */
export function gbmProbability(c: Candle[], horizon = 15) {
  const rets: number[] = [];
  const win = c.slice(-60);
  for (let i = 1; i < win.length; i++) rets.push(Math.log(win[i].c / win[i - 1].c));
  const mu = rets.reduce((a, b) => a + b, 0) / rets.length;
  const sd = Math.sqrt(rets.reduce((a, b) => a + (b - mu) ** 2, 0) / Math.max(1, rets.length - 1)) || 1e-9;
  const drift = mu + (sd * sd) / 2; // mu estimated on log-returns already = (m - s^2/2)
  void drift;
  const z = (mu * horizon) / (sd * Math.sqrt(horizon));
  const up = normCdf(z);
  return { up: Math.round(up * 1000) / 10, down: Math.round((1 - up) * 1000) / 10, mu, sigma: sd, horizon };
}

/* ------------------------------ plugins ---------------------------------- */

export type PluginDef = {
  id: string;
  name: string;
  type: "ema_cross" | "rsi_reversion" | "breakout";
  params?: Record<string, number>;
};

export type PluginReading = { id: string; name: string; type: string; vote: Vote; detail: string; file: string };

const PLUGIN_DIR = path.join(process.cwd(), "strategies");
const PLUGIN_TTL_MS = 10_000;

type PluginEntry = { def: PluginDef; file: string };
let pluginCache: { at: number; items: PluginEntry[] } | null = null;
let pluginInflight: Promise<PluginEntry[]> | null = null;

/** Non-blocking async discovery of declarative strategy plugins (strategies/*.json) with caching. */
export async function discoverPlugins(force = false): Promise<PluginEntry[]> {
  if (!force && pluginCache && Date.now() - pluginCache.at < PLUGIN_TTL_MS) {
    return pluginCache.items;
  }
  if (pluginInflight && !force) return pluginInflight;

  pluginInflight = (async () => {
    try {
      const files = (await fs.readdir(PLUGIN_DIR)).filter((f) => f.endsWith(".json"));
      const out: PluginEntry[] = [];
      await Promise.all(
        files.map(async (f) => {
          try {
            const raw = await fs.readFile(path.join(PLUGIN_DIR, f), "utf8");
            const def = JSON.parse(raw) as PluginDef;
            if (def.id && def.name && ["ema_cross", "rsi_reversion", "breakout"].includes(def.type)) {
              out.push({ def, file: f });
            }
          } catch {
            /* skip malformed plugin */
          }
        }),
      );
      out.sort((a, b) => a.file.localeCompare(b.file));
      pluginCache = { at: Date.now(), items: out };
      return out;
    } catch {
      return pluginCache?.items ?? [];
    } finally {
      pluginInflight = null;
    }
  })();

  return pluginInflight;
}

export function getCachedPlugins(): PluginEntry[] {
  return pluginCache?.items ?? [];
}

export function runPlugin(def: PluginDef, file: string, c: Candle[]): PluginReading {
  const p = def.params ?? {};
  const closes = c.map((x) => x.c);
  const mk = (vote: Vote, detail: string): PluginReading => ({ id: def.id, name: def.name, type: def.type, vote, detail, file });
  if (def.type === "ema_cross") {
    const f = last(ema(closes, p.fast ?? 5));
    const s = last(ema(closes, p.slow ?? 13));
    return mk(f > s ? 1 : f < s ? -1 : 0, `EMA${p.fast ?? 5}/${p.slow ?? 13}`);
  }
  if (def.type === "rsi_reversion") {
    const r = last(rsi(closes, p.period ?? 14));
    const lo = p.low ?? 30;
    const hi = p.high ?? 70;
    return mk(r <= lo ? 1 : r >= hi ? -1 : 0, `RSI ${r.toFixed(1)}`);
  }
  const lb = p.lookback ?? 20;
  const win = c.slice(-lb - 1, -1);
  const hh = Math.max(...win.map((x) => x.h));
  const ll = Math.min(...win.map((x) => x.l));
  const px = last(c).c;
  return mk(px > hh ? 1 : px < ll ? -1 : 0, `Donchian ${lb} [${ll.toFixed(2)} - ${hh.toFixed(2)}]`);
}

/* ------------------------------ consensus -------------------------------- */

export type WaveGateReading = {
  active: boolean; // true if high-momentum wave unlocked; false if choppy sideways consolidation
  waveType: "DIRECTIONAL_WAVE" | "VOLATILITY_EXPANSION_WAVE" | "CONSOLIDATION_PAUSED";
  adx: number;
  bbWidthRatio: number;
  atrRatio: number;
  reason: string;
};

export type Consensus = {
  regime: RegimeReading;
  waveGate: WaveGateReading; // Dynamic Volatility / Momentum Wave Gate
  strategies: StrategyReading[]; // the 4 active quorum voters
  suppressed: StrategyReading[]; // gated out by the regime
  buyVotes: number;
  sellVotes: number;
  voters: number;
  quorumPct: number;
  direction: "BUY" | "SELL" | "NONE";
  gbm: { up: number; down: number; forDirection: number; horizon: number };
  qualifies: boolean;
  atr: number;
  plugins: PluginReading[];
  lastPrice: number;
};

/**
 * Quorum engine with Dynamic Market Wave Detection.
 * Filters out sideways consolidation / accumulation chop and only unlocks when
 * a high-momentum directional wave (ADX >= 20) or volatility expansion (BB Width >= 1.2x) is detected.
 */
export function evaluateConsensus(
  c: Candle[],
  cfg: RiskConfig,
  externalVote?: Vote,
  pluginDefs?: { def: PluginDef; file: string }[],
): Consensus {
  const regime = classifyRegime(c);
  if (c.length < 30) {
    const px = c[c.length - 1]?.c ?? 0;
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
      lastPrice: px,
    };
  }

  // Dynamic Market Wave Detection (Volatility & Momentum Wave Gate)
  // High-momentum trend wave requires:
  // 1. Directional strength: ADX >= 20
  // 2. OR Volatility expansion: Bollinger Band width ratio >= 1.20 or ATR ratio >= 1.15
  // If in accumulation / sideways consolidation (regime === CHOPPY_RANGING or no wave momentum),
  // the engine AUTONOMOUSLY PAUSES signal generation to prevent whipsaws.
  const isDirectionalWave = regime.adx >= 20;
  const isExpansionWave = regime.bbWidthRatio >= 1.20 || regime.atrRatio >= 1.15;
  const isConsolidation = regime.regime === "CHOPPY_RANGING" || (!isDirectionalWave && !isExpansionWave);
  const waveActive = !isConsolidation;

  const waveGate: WaveGateReading = {
    active: waveActive,
    waveType: isDirectionalWave
      ? "DIRECTIONAL_WAVE"
      : isExpansionWave
        ? "VOLATILITY_EXPANSION_WAVE"
        : "CONSOLIDATION_PAUSED",
    adx: regime.adx,
    bbWidthRatio: regime.bbWidthRatio,
    atrRatio: regime.atrRatio,
    reason: waveActive
      ? `High-momentum wave active (${isDirectionalWave ? `ADX ${regime.adx} >= 20` : `BB expansion ${regime.bbWidthRatio}x`})`
      : `Choppy Consolidation Paused: ADX ${regime.adx} < 20 & BB Width ${regime.bbWidthRatio}x (Market in sideways accumulation phase)`,
  };

  const smc = smcLiquidityGrab(c);
  const vw = institutionalVwap(c);
  const em = dualEma(c);
  const st = superTrendStrategy(c);
  const orb = orbVwapMomentum(c);
  const bb = bbReversion(c);
  const rs = rsiReversion(c);

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
  const g = gbmProbability(c, 15);
  const forDirection = direction === "BUY" ? g.up : direction === "SELL" ? g.down : Math.max(g.up, g.down);
  const qualifies = direction !== "NONE" && quorumPct >= cfg.quorumPct && forDirection >= cfg.gbmMin && waveActive;

  const plugins = (pluginDefs ?? getCachedPlugins()).map(({ def, file }) => runPlugin(def, file, c));
  const a = last(atr(c, 14));

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
    lastPrice: last(c).c,
  };
}

export const BUILTIN_STRATEGIES = [
  { id: "smc_liquidity_grab", name: "SMC Liquidity Grab", note: "Swing high/low sweep, liquidity reclaim, and breakdown/breakout structure" },
  { id: "institutional_vwap", name: "Institutional VWAP", note: "Price location versus session VWAP (Bull > VWAP / Bear < VWAP)" },
  { id: "dual_ema_9_21", name: "Dual EMA (9/21)", note: "9/21 EMA trend alignment and fresh crossover filter" },
  { id: "supertrend_10_3", name: "SuperTrend (10,3)", note: "ATR trailing trend (Green Bull / Red Bear)" },
  { id: "orb_vwap_momentum", name: "ORB & VWAP Momentum", note: "Opening range breakout / breakdown and VWAP momentum acceleration" },
  { id: "bb_mean_reversion", name: "Bollinger Mean-Reversion", note: "Band envelope mean-reversion active in choppy regimes" },
  { id: "rsi_mean_reversion", name: "RSI Mean-Reversion", note: "Overbought (>70 SELL) & Oversold (<30 BUY) reversal filter" },
  { id: "gbm_gate", name: "GBM Predictive Gate (>= 65%)", note: "Geometric Brownian Motion 15-min directional probability" },
];
