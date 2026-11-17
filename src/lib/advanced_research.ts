import type { Candle } from "./indicators";

/**
 * Phase 10: Advanced Quantitative Research Suite.
 * Independent experimental modules designed for offline research and simulation.
 * ALL MODULES ARE DISABLED BY DEFAULT.
 */

/* -------------------------------------------------------------------------- */
/* 1. Market Regime Transition Detection (Markovian Transition Matrix)        */
/* -------------------------------------------------------------------------- */
export type RegimeTransitionMatrix = {
  states: string[];
  matrix: number[][]; // P[i][j] transition probabilities
  currentStabilityScore: number; // 0..100
};

export function detectRegimeTransitions(regimeHistory: string[]): RegimeTransitionMatrix {
  const states = ["TRENDING_BULL", "TRENDING_BEAR", "CHOPPY_RANGING", "VOLATILITY_EXPANSION"];
  const n = states.length;
  const counts = Array.from({ length: n }, () => new Array(n).fill(0));

  for (let t = 1; t < regimeHistory.length; t++) {
    const fromIdx = states.indexOf(regimeHistory[t - 1]);
    const toIdx = states.indexOf(regimeHistory[t]);
    if (fromIdx >= 0 && toIdx >= 0) {
      counts[fromIdx][toIdx]++;
    }
  }

  const matrix = counts.map((row) => {
    const sum = row.reduce((a, b) => a + b, 0);
    return sum > 0 ? row.map((c) => Math.round((c / sum) * 1000) / 1000) : new Array(n).fill(1 / n);
  });

  // Diagonal dominance indicates stability (tendency to persist in current regime)
  const diagSum = matrix.reduce((acc, row, i) => acc + row[i], 0);
  const currentStabilityScore = Math.round((diagSum / n) * 100);

  return { states, matrix, currentStabilityScore };
}

/* -------------------------------------------------------------------------- */
/* 2. Volatility Forecasting (Parkinson Extreme-Value Volatility)             */
/* -------------------------------------------------------------------------- */
export function forecastVolatilityParkinson(c: Candle[], period = 20): { parkinsonVolAnnualized: number; expectedRangeTicks: number } {
  if (c.length < period) return { parkinsonVolAnnualized: 0, expectedRangeTicks: 0 };
  const win = c.slice(-period);
  // Parkinson formula: sigma_P^2 = (1 / (4 * ln(2) * N)) * sum( (ln(H/L))^2 )
  const factor = 1 / (4 * Math.log(2) * period);
  const sumLnSq = win.reduce((acc, bar) => acc + Math.log(bar.h / bar.l) ** 2, 0);
  const varianceDaily = factor * sumLnSq;
  const volDaily = Math.sqrt(varianceDaily);
  const parkinsonVolAnnualized = Math.round(volDaily * Math.sqrt(252) * 10000) / 100; // in %
  const expectedRangeTicks = Math.round(c[c.length - 1].c * volDaily * 20) / 20;

  return { parkinsonVolAnnualized, expectedRangeTicks };
}

/* -------------------------------------------------------------------------- */
/* 3. Probability Calibration & Brier Score Analysis                          */
/* -------------------------------------------------------------------------- */
export function calculateBrierScore(predictions: { forecastProb: number; realizedOutcome: 1 | 0 }[]): {
  brierScore: number;
  reliability: "HIGH" | "MODERATE" | "POOR_CALIBRATION";
  sampleSize: number;
} {
  const n = predictions.length;
  if (!n) return { brierScore: 0.25, reliability: "POOR_CALIBRATION", sampleSize: 0 };

  const sumSqDiff = predictions.reduce((acc, p) => acc + (p.forecastProb - p.realizedOutcome) ** 2, 0);
  const brierScore = Math.round((sumSqDiff / n) * 1000) / 1000;

  // For binary classification, random guess has BS = 0.25. Perfect forecast has BS = 0.0.
  const reliability = brierScore <= 0.15 ? "HIGH" : brierScore <= 0.22 ? "MODERATE" : "POOR_CALIBRATION";
  return { brierScore, reliability, sampleSize: n };
}

/* -------------------------------------------------------------------------- */
/* 4. Trade Quality Scoring Engine (0..100 composite index)                  */
/* -------------------------------------------------------------------------- */
export function calculateTradeQualityScore(args: {
  quorumPct: number;
  gbmProb: number;
  rewardRiskRatio: number;
  atrRatio: number;
}): { qualityScore: number; tier: "PRIME_A+" | "STANDARD_A" | "SPECULATIVE_B" | "SUBPAR_REJECT" } {
  const { quorumPct, gbmProb, rewardRiskRatio, atrRatio } = args;

  // Weightings: Quorum (40%), GBM (25%), Reward:Risk (20%), Volatility expansion (15%)
  const qPart = (quorumPct / 100) * 40;
  const gPart = (gbmProb / 100) * 25;
  const rrPart = Math.min(20, (rewardRiskRatio / 3.0) * 20);
  const atrPart = Math.min(15, (atrRatio / 1.2) * 15);

  const qualityScore = Math.round(qPart + gPart + rrPart + atrPart);
  let tier: "PRIME_A+" | "STANDARD_A" | "SPECULATIVE_B" | "SUBPAR_REJECT";

  if (qualityScore >= 85) tier = "PRIME_A+";
  else if (qualityScore >= 75) tier = "STANDARD_A";
  else if (qualityScore >= 60) tier = "SPECULATIVE_B";
  else tier = "SUBPAR_REJECT";

  return { qualityScore, tier };
}

/* -------------------------------------------------------------------------- */
/* 5. Signal Correlation Analysis (Pearson & Spearman Rank Correlation)       */
/* -------------------------------------------------------------------------- */
export function calculateSignalCorrelation(sigA: number[], sigB: number[]): number {
  const n = Math.min(sigA.length, sigB.length);
  if (n < 5) return 0;
  const a = sigA.slice(-n);
  const b = sigB.slice(-n);
  const meanA = a.reduce((x, y) => x + y, 0) / n;
  const meanB = b.reduce((x, y) => x + y, 0) / n;

  let num = 0;
  let denA = 0;
  let denB = 0;
  for (let i = 0; i < n; i++) {
    const diffA = a[i] - meanA;
    const diffB = b[i] - meanB;
    num += diffA * diffB;
    denA += diffA ** 2;
    denB += diffB ** 2;
  }
  const den = Math.sqrt(denA * denB);
  return den > 0 ? Math.round((num / den) * 100) / 100 : 0;
}

export function calculateSpearmanCorrelation(sigA: number[], sigB: number[]): number {
  const n = Math.min(sigA.length, sigB.length);
  if (n < 5) return 0;
  const getRanks = (arr: number[]) => {
    const sorted = arr.map((v, i) => ({ v, i })).sort((x, y) => x.v - y.v);
    const ranks = new Array(arr.length);
    for (let r = 0; r < sorted.length; r++) {
      ranks[sorted[r].i] = r + 1;
    }
    return ranks;
  };
  const rankA = getRanks(sigA.slice(-n));
  const rankB = getRanks(sigB.slice(-n));
  return calculateSignalCorrelation(rankA, rankB);
}

export function calculateRollingCorrelation(sigA: number[], sigB: number[], window = 20): number[] {
  const out: number[] = [];
  const minLen = Math.min(sigA.length, sigB.length);
  for (let i = 0; i < minLen; i++) {
    if (i < window - 1) {
      out.push(NaN);
    } else {
      const subA = sigA.slice(i - window + 1, i + 1);
      const subB = sigB.slice(i - window + 1, i + 1);
      out.push(calculateSignalCorrelation(subA, subB));
    }
  }
  return out;
}

/* -------------------------------------------------------------------------- */
/* 5b. Cross-Entropy Log Loss Calculation                                     */
/* -------------------------------------------------------------------------- */
export function calculateLogLoss(predictions: { forecastProb: number; realizedOutcome: 1 | 0 }[]): number {
  const n = predictions.length;
  if (!n) return 0.693; // ln(2)
  const eps = 1e-15;
  const sumLoss = predictions.reduce((acc, p) => {
    const prob = Math.min(1 - eps, Math.max(eps, p.forecastProb));
    const loss = -(p.realizedOutcome * Math.log(prob) + (1 - p.realizedOutcome) * Math.log(1 - prob));
    return acc + loss;
  }, 0);
  return Math.round((sumLoss / n) * 1000) / 1000;
}

/* -------------------------------------------------------------------------- */
/* 6. Dynamic Slippage & Market Impact Model                                  */
/* -------------------------------------------------------------------------- */
export function calculateDynamicImpactCost(args: {
  orderNotional: number;
  averageDailyVolume: number;
  bidAskSpreadBps: number;
}): { slippageBps: number; expectedImpactFriction: number } {
  const { orderNotional, averageDailyVolume, bidAskSpreadBps } = args;
  const participationRate = averageDailyVolume > 0 ? orderNotional / averageDailyVolume : 0.01;
  // Square-root market impact law (Almgren-Chriss): Impact ~ spread / 2 + k * sqrt(participation)
  const impactBps = bidAskSpreadBps / 2 + 50 * Math.sqrt(Math.min(0.1, participationRate));
  const slippageBps = Math.round(impactBps * 100) / 100;
  const expectedImpactFriction = Math.round(orderNotional * (slippageBps / 10000) * 100) / 100;

  return { slippageBps, expectedImpactFriction };
}

/* -------------------------------------------------------------------------- */
/* 7. Walk-Forward Degradation Ratio & Robustness                             */
/* -------------------------------------------------------------------------- */
export function calculateWalkForwardRobustness(inSampleSharpe: number, outOfSampleSharpe: number): {
  robustnessRatio: number;
  overfitWarning: boolean;
  status: "ROBUST" | "DEGRADED" | "OVERFIT";
} {
  const ratio = inSampleSharpe > 0 ? Math.round((outOfSampleSharpe / inSampleSharpe) * 100) / 100 : 0;
  const overfitWarning = ratio < 0.50 || outOfSampleSharpe <= 0;
  const status = ratio >= 0.70 ? "ROBUST" : ratio >= 0.40 ? "DEGRADED" : "OVERFIT";
  return { robustnessRatio: ratio, overfitWarning, status };
}

/* -------------------------------------------------------------------------- */
/* 8. Monte Carlo Bootstrap & Drawdown Distribution Simulator                */
/* -------------------------------------------------------------------------- */
export type MonteCarloResults = {
  iterations: number;
  horizonTrades: number;
  expectancyMean: number;
  expectancyCI95: [number, number]; // [lower 2.5%, upper 97.5%]
  medianMaxDrawdown: number;
  maxDrawdown95thPct: number;
  maxLosingStreakMedian: number;
  maxLosingStreak95thPct: number;
  profitFactorCI95: [number, number];
  probOfDrawdownBreach20Pct: number; // Probability equity drops > 20%
};

export function runMonteCarloBootstrap(
  tradesNetPnl: number[],
  initialCapital = 1000,
  iterations = 1000,
  horizon = 100,
): MonteCarloResults {
  if (!tradesNetPnl || tradesNetPnl.length < 5) {
    return {
      iterations: 0,
      horizonTrades: horizon,
      expectancyMean: 0,
      expectancyCI95: [0, 0],
      medianMaxDrawdown: 0,
      maxDrawdown95thPct: 0,
      maxLosingStreakMedian: 0,
      maxLosingStreak95thPct: 0,
      profitFactorCI95: [0, 0],
      probOfDrawdownBreach20Pct: 0,
    };
  }

  const sampleSize = tradesNetPnl.length;
  const maxDrawdowns: number[] = [];
  const maxLosingStreaks: number[] = [];
  const expectancies: number[] = [];
  const profitFactors: number[] = [];
  let breachCount = 0;

  for (let iter = 0; iter < iterations; iter++) {
    let equity = initialCapital;
    let peak = equity;
    let maxDd = 0;
    let currentLosingStreak = 0;
    let maxStreak = 0;
    let sumWins = 0;
    let sumLosses = 0;

    for (let h = 0; h < horizon; h++) {
      // Uniform random sampling with replacement
      const randIdx = Math.floor(Math.random() * sampleSize);
      const pnl = tradesNetPnl[randIdx];

      equity += pnl;
      if (pnl > 0) {
        sumWins += pnl;
        currentLosingStreak = 0;
      } else {
        sumLosses += Math.abs(pnl);
        currentLosingStreak++;
        if (currentLosingStreak > maxStreak) maxStreak = currentLosingStreak;
      }

      if (equity > peak) peak = equity;
      const dd = peak - equity;
      if (dd > maxDd) maxDd = dd;
    }

    maxDrawdowns.push(maxDd);
    maxLosingStreaks.push(maxStreak);
    const exp = (equity - initialCapital) / horizon;
    expectancies.push(exp);
    const pf = sumLosses > 0 ? sumWins / sumLosses : sumWins > 0 ? 10 : 0;
    profitFactors.push(pf);

    if (maxDd / initialCapital >= 0.20) breachCount++;
  }

  // Quantiles
  maxDrawdowns.sort((a, b) => a - b);
  maxLosingStreaks.sort((a, b) => a - b);
  expectancies.sort((a, b) => a - b);
  profitFactors.sort((a, b) => a - b);

  const idx2_5 = Math.floor(iterations * 0.025);
  const idx50 = Math.floor(iterations * 0.50);
  const idx95 = Math.floor(iterations * 0.95);
  const idx97_5 = Math.floor(iterations * 0.975);

  const r2 = (v: number) => Math.round(v * 100) / 100;

  return {
    iterations,
    horizonTrades: horizon,
    expectancyMean: r2(expectancies.reduce((a, b) => a + b, 0) / iterations),
    expectancyCI95: [r2(expectancies[idx2_5]), r2(expectancies[idx97_5])],
    medianMaxDrawdown: r2(maxDrawdowns[idx50]),
    maxDrawdown95thPct: r2(maxDrawdowns[idx95]),
    maxLosingStreakMedian: maxLosingStreaks[idx50],
    maxLosingStreak95thPct: maxLosingStreaks[idx95],
    profitFactorCI95: [r2(profitFactors[idx2_5]), r2(profitFactors[idx97_5])],
    probOfDrawdownBreach20Pct: r2((breachCount / iterations) * 100),
  };
}

/* -------------------------------------------------------------------------- */
/* 9. Chronological Train / Validate / Test Data Splitter                     */
/* -------------------------------------------------------------------------- */
export function splitChronologicalCandles(
  candles: Candle[],
  trainPct = 0.70,
  valPct = 0.20,
): { train: Candle[]; validation: Candle[]; test: Candle[] } {
  const n = candles.length;
  const trainEnd = Math.floor(n * trainPct);
  const valEnd = Math.floor(n * (trainPct + valPct));

  return {
    train: candles.slice(0, trainEnd),
    validation: candles.slice(trainEnd, valEnd),
    test: candles.slice(valEnd),
  };
}
