import { adx, atr, bollinger, last, type Candle } from "./indicators";

export type Regime = "TRENDING_BULL" | "TRENDING_BEAR" | "CHOPPY_RANGING" | "VOLATILITY_EXPANSION";

export type RegimeReading = {
  regime: Regime;
  adx: number;
  plusDI: number;
  minusDI: number;
  atr: number;
  atrRatio: number;
  bbWidth: number;
  bbWidthRatio: number;
  trendFollowingAllowed: boolean;
  meanReversionActive: boolean;
};

/**
 * Market regime classifier: 14-period ADX, ATR volatility ratio (ATR14 vs its own
 * trailing mean) and Bollinger Band width expansion.
 */
export function classifyRegime(c: Candle[]): RegimeReading {
  if (c.length < 30) {
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
  const closes = c.map((x) => x.c);
  const a = atr(c, 14);
  const { adx: adxArr, plusDI, minusDI } = adx(c, 14);
  const bb = bollinger(closes, 20, 2);

  const atrNow = last(a);
  const atrWindow = a.slice(-50).filter((v) => !Number.isNaN(v));
  const atrMean = atrWindow.length ? atrWindow.reduce((x, y) => x + y, 0) / atrWindow.length : atrNow;
  const atrRatio = atrMean ? atrNow / atrMean : 1;

  const bwNow = last(bb.width);
  const bwWindow = bb.width.slice(-50).filter((v) => !Number.isNaN(v));
  const bwMean = bwWindow.length ? bwWindow.reduce((x, y) => x + y, 0) / bwWindow.length : bwNow;
  const bwRatio = bwMean ? bwNow / bwMean : 1;

  const adxNow = last(adxArr) || 0;
  const pDI = last(plusDI) || 0;
  const mDI = last(minusDI) || 0;

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
    // Gate rule: suppress trend-following during CHOPPY_RANGING, activate mean-reversion filters.
    trendFollowingAllowed: regime !== "CHOPPY_RANGING",
    meanReversionActive: regime === "CHOPPY_RANGING",
  };
}

function round(v: number, d = 2) {
  return Number.isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : 0;
}
