import type { Candle } from "./indicators";
import { sizePosition, type RiskConfig } from "./risk";
import { evaluateConsensus } from "./strategies";
import { roundTripCharges } from "./tax";
import type { Instrument } from "./instruments";

export type SimulatedTrade = {
  id: number;
  entryTime: number;
  exitTime: number;
  symbol: string;
  side: "BUY" | "SELL";
  qty: number;
  entryPrice: number;
  exitPrice: number;
  exitReason: "STOP_LOSS" | "TARGET" | "BREAKEVEN" | "EOD_EXIT";
  grossPnl: number;
  charges: number;
  netPnl: number;
  rMultiple: number;
  barsHeld: number;
};

export type BacktestSummary = {
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRatePct: number;
  profitFactor: number;
  expectancy: number;
  avgWin: number;
  avgLoss: number;
  maxDrawdown: number;
  maxDrawdownPct: number;
  grossPnl: number;
  totalCharges: number;
  netPnl: number;
  sharpeRatio: number;
  sortinoRatio: number;
  recoveryFactor: number;
  trades: SimulatedTrade[];
};

const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Institutional Historical Backtesting & Walk-Forward Simulation Engine.
 * Simulates bar-by-bar execution strictly using the production consensus matrix,
 * 1% risk position sizing, statutory Indian transaction costs, and 1R net-breakeven trailing stop.
 */
export function runBacktest(
  candles: Candle[],
  inst: Instrument,
  cfg: RiskConfig,
  frictionMode: "STANDARD_SHOONYA" | "HIGH_ANGEL" | "ZERO_FRICTION" = "STANDARD_SHOONYA",
): BacktestSummary {
  if (candles.length < 50) {
    return emptySummary();
  }

  const trades: SimulatedTrade[] = [];
  let currentPos: {
    side: "BUY" | "SELL";
    qty: number;
    entryPrice: number;
    slPrice: number;
    targetPrice: number;
    slDistance: number;
    entryBar: number;
    entryTime: number;
    initialR: number;
    beActivated: boolean;
  } | null = null;

  let tradeIdCounter = 1;
  const targetBroker = frictionMode === "HIGH_ANGEL" ? "angel" : "shoonya";

  // Bar-by-bar chronological replay (strictly preventing look-ahead bias)
  for (let i = 35; i < candles.length; i++) {
    const historicalSlice = candles.slice(0, i);
    const curBar = candles[i];

    // 1. Manage Active Position
    if (currentPos) {
      const buy = currentPos.side === "BUY";
      const high = curBar.h;
      const low = curBar.l;
      const open = curBar.o;

      // Check 1R Net Breakeven Ratchet
      const curProfit = buy ? high - currentPos.entryPrice : currentPos.entryPrice - low;
      if (!currentPos.beActivated && curProfit >= currentPos.initialR) {
        // Move stop to net breakeven (entry + fee buffer)
        const feePerUnit = (targetBroker === "shoonya" ? 25 : 55) / currentPos.qty;
        currentPos.slPrice = buy ? currentPos.entryPrice + feePerUnit : currentPos.entryPrice - feePerUnit;
        currentPos.beActivated = true;
      }

      // Check Stop-Loss Hit
      const slHit = buy ? low <= currentPos.slPrice : high >= currentPos.slPrice;
      const tgHit = buy ? high >= currentPos.targetPrice : low <= currentPos.targetPrice;

      if (slHit) {
        const exitPx = currentPos.slPrice;
        trades.push(recordSimulatedTrade(tradeIdCounter++, currentPos, exitPx, curBar.t, i, currentPos.beActivated ? "BREAKEVEN" : "STOP_LOSS", inst, targetBroker, frictionMode, cfg));
        currentPos = null;
        continue;
      }

      if (tgHit) {
        const exitPx = currentPos.targetPrice;
        trades.push(recordSimulatedTrade(tradeIdCounter++, currentPos, exitPx, curBar.t, i, "TARGET", inst, targetBroker, frictionMode, cfg));
        currentPos = null;
        continue;
      }

      // Check EOD close at final candle
      if (i === candles.length - 1) {
        trades.push(recordSimulatedTrade(tradeIdCounter++, currentPos, curBar.c, curBar.t, i, "EOD_EXIT", inst, targetBroker, frictionMode, cfg));
        currentPos = null;
        continue;
      }
    }

    // 2. Scan for New Entry (Only if flat)
    if (!currentPos) {
      const consensus = evaluateConsensus(historicalSlice, cfg);
      if (consensus.qualifies && consensus.direction !== "NONE" && consensus.waveGate?.active) {
        const side = consensus.direction;
        const entryPx = curBar.c;
        const conf = consensus.quorumPct / 100;
        const sizing = sizePosition({ inst, side, entry: entryPx, atr: consensus.atr, conf, cfg });

        if (sizing.qty > 0) {
          currentPos = {
            side,
            qty: sizing.qty,
            entryPrice: entryPx,
            slPrice: sizing.slPrice,
            targetPrice: sizing.targetPrice,
            slDistance: sizing.slDistance,
            entryBar: i,
            entryTime: curBar.t,
            initialR: sizing.slDistance,
            beActivated: false,
          };
        }
      }
    }
  }

  return computeSummary(trades, cfg.capital);
}

type ActiveSimulatedPos = {
  side: "BUY" | "SELL";
  qty: number;
  entryPrice: number;
  slPrice: number;
  targetPrice: number;
  slDistance: number;
  entryBar: number;
  entryTime: number;
  initialR: number;
  beActivated: boolean;
};

function recordSimulatedTrade(
  id: number,
  pos: ActiveSimulatedPos,
  exitPrice: number,
  exitTime: number,
  exitBar: number,
  reason: SimulatedTrade["exitReason"],
  inst: Instrument,
  broker: "shoonya" | "angel",
  frictionMode: string,
  cfg?: RiskConfig,
): SimulatedTrade {
  const dir = pos.side === "BUY" ? 1 : -1;
  const grossPnl = r2((exitPrice - pos.entryPrice) * pos.qty * dir);
  let charges = 0;

  if (frictionMode !== "ZERO_FRICTION") {
    const feeObj = roundTripCharges({
      exchange: inst.exchange,
      kind: inst.kind,
      broker,
      qty: pos.qty,
      entry: pos.entryPrice,
      exit: exitPrice,
      side: pos.side,
      entrySlippageBps: cfg?.entrySlippageBps ?? 8.0,
      exitSlippageBps: cfg?.exitSlippageBps ?? (cfg?.entrySlippageBps ?? 8.0),
    });
    charges = r2(feeObj.total);
  }

  const netPnl = r2(grossPnl - charges);
  const rMultiple = pos.initialR > 0 ? r2((exitPrice - pos.entryPrice) * dir / pos.initialR) : 0;

  return {
    id,
    entryTime: pos.entryTime,
    exitTime,
    symbol: inst.symbol,
    side: pos.side,
    qty: pos.qty,
    entryPrice: pos.entryPrice,
    exitPrice,
    exitReason: reason,
    grossPnl,
    charges,
    netPnl,
    rMultiple,
    barsHeld: exitBar - pos.entryBar,
  };
}

function computeSummary(trades: SimulatedTrade[], initialCapital: number): BacktestSummary {
  const totalTrades = trades.length;
  if (!totalTrades) return emptySummary();

  const wins = trades.filter((t) => t.netPnl > 0);
  const losses = trades.filter((t) => t.netPnl <= 0);
  const winningTrades = wins.length;
  const losingTrades = losses.length;
  const winRatePct = r2((winningTrades / totalTrades) * 100);

  const sumWins = wins.reduce((a, t) => a + t.netPnl, 0);
  const sumLosses = Math.abs(losses.reduce((a, t) => a + t.netPnl, 0));
  const profitFactor = sumLosses > 0 ? r2(sumWins / sumLosses) : sumWins > 0 ? 999 : 0;

  const avgWin = winningTrades > 0 ? r2(sumWins / winningTrades) : 0;
  const avgLoss = losingTrades > 0 ? r2(sumLosses / losingTrades) : 0;
  const expectancy = r2((winRatePct / 100) * avgWin - ((100 - winRatePct) / 100) * avgLoss);

  const grossPnl = r2(trades.reduce((a, t) => a + t.grossPnl, 0));
  const totalCharges = r2(trades.reduce((a, t) => a + t.charges, 0));
  const netPnl = r2(trades.reduce((a, t) => a + t.netPnl, 0));

  // Equity Curve & Drawdown
  let equity = initialCapital;
  let peak = equity;
  let maxDrawdown = 0;
  let maxDrawdownPct = 0;
  const dailyReturns: number[] = [];

  for (const t of trades) {
    equity += t.netPnl;
    dailyReturns.push(t.netPnl / initialCapital);
    if (equity > peak) peak = equity;
    const dd = peak - equity;
    if (dd > maxDrawdown) {
      maxDrawdown = dd;
      maxDrawdownPct = peak > 0 ? (dd / peak) * 100 : 0;
    }
  }

  // Sharpe & Sortino
  const meanRet = dailyReturns.reduce((a, b) => a + b, 0) / Math.max(1, dailyReturns.length);
  const variance = dailyReturns.reduce((a, b) => a + (b - meanRet) ** 2, 0) / Math.max(1, dailyReturns.length - 1);
  const stdDev = Math.sqrt(variance) || 1e-9;
  const sharpeRatio = r2((meanRet / stdDev) * Math.sqrt(252));

  const downReturns = dailyReturns.filter((r) => r < 0);
  const downVariance = downReturns.length ? downReturns.reduce((a, b) => a + b ** 2, 0) / downReturns.length : 1e-9;
  const sortinoRatio = r2((meanRet / Math.sqrt(downVariance)) * Math.sqrt(252));

  const recoveryFactor = maxDrawdown > 0 ? r2(netPnl / maxDrawdown) : netPnl > 0 ? 999 : 0;

  return {
    totalTrades,
    winningTrades,
    losingTrades,
    winRatePct,
    profitFactor,
    expectancy,
    avgWin,
    avgLoss,
    maxDrawdown: r2(maxDrawdown),
    maxDrawdownPct: r2(maxDrawdownPct),
    grossPnl,
    totalCharges,
    netPnl,
    sharpeRatio,
    sortinoRatio,
    recoveryFactor,
    trades,
  };
}

function emptySummary(): BacktestSummary {
  return {
    totalTrades: 0,
    winningTrades: 0,
    losingTrades: 0,
    winRatePct: 0,
    profitFactor: 0,
    expectancy: 0,
    avgWin: 0,
    avgLoss: 0,
    maxDrawdown: 0,
    maxDrawdownPct: 0,
    grossPnl: 0,
    totalCharges: 0,
    netPnl: 0,
    sharpeRatio: 0,
    sortinoRatio: 0,
    recoveryFactor: 0,
    trades: [],
  };
}
