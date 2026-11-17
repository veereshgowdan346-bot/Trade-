import type { Candle } from "./indicators";
import { isRegularNseSession, toIstDate } from "./historical_research";
import { isExchangeHoliday } from "./nse_calendar";
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
 * Phase 2 (BT-003) backtest controls — exchange-session boundaries, holiday calendar,
 * gap-aware day boundaries and mandatory intraday EOD square-off.
 *
 * Defaults are ON (the product trades MIS/intraday): positions are squared off at each
 * session end and entries only occur inside regular NSE sessions on non-holiday days.
 * Set eodSquareOff=false / enforceSessions=false / enforceHolidays=false ONLY for
 * explicit research runs (documented in runWalkForward methodology output).
 */
export type BacktestControls = {
  enforceSessions?: boolean;
  enforceHolidays?: boolean;
  eodSquareOff?: boolean;
  warmupBars?: number;
};

const DAY_GAP_MS = 4 * 3600 * 1000; // > 4h between bars = session/day boundary (gap-aware)

/**
 * Institutional Historical Backtesting & Walk-Forward Simulation Engine.
 * Simulates bar-by-bar execution strictly using the production consensus matrix,
 * 1% risk position sizing, statutory Indian transaction costs, and 1R net-breakeven trailing stop.
 *
 * Look-ahead guard: each decision at bar i uses candles.slice(0, i) only (never the
 * current or future candles). Gap-aware execution: stops fill at the open when the bar
 * gaps through them (BT-002).
 */
export function runBacktest(
  candles: Candle[],
  inst: Instrument,
  cfg: RiskConfig,
  frictionMode: "STANDARD_SHOONYA" | "HIGH_ANGEL" | "ZERO_FRICTION" = "STANDARD_SHOONYA",
  controls: BacktestControls = {},
): BacktestSummary {
  const warmup = Math.max(0, controls.warmupBars ?? 35);
  if (candles.length < warmup + 15) {
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
  const enforceSessions = controls.enforceSessions !== false;
  const enforceHolidays = controls.enforceHolidays !== false;
  const eodSquareOff = controls.eodSquareOff !== false;

  // Bar-by-bar chronological replay (strictly preventing look-ahead bias)
  for (let i = warmup; i < candles.length; i++) {
    const historicalSlice = candles.slice(0, i);
    const curBar = candles[i];
    const nxtBar = candles[i + 1];

    // Session / holiday / day-boundary classification (BT-003)
    const curDay = toIstDate(curBar.t).isoIst.slice(0, 10);
    const nxtDay = nxtBar ? toIstDate(nxtBar.t).isoIst.slice(0, 10) : null;
    const isDayEndBar = !nxtBar || nxtDay !== curDay || nxtBar.t - curBar.t > DAY_GAP_MS;
    const sessionOk = !enforceSessions || inst.exchange === "MCX" || isRegularNseSession(curBar.t);
    const holidayOk = !enforceHolidays || !isExchangeHoliday(curDay);
    const tradable = sessionOk && holidayOk;

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
        // FIX (APEX-V2 AUDIT BT-001): the breakeven fee buffer now uses the SAME real
        // round-trip charge model as the live TSL engine (incl. slippage), instead of the
        // hardcoded ₹25/₹55 floors which under-priced actual friction and produced
        // "BREAKEVEN" exits that were not net-zero.
        const beCharges = frictionMode !== "ZERO_FRICTION"
          ? roundTripCharges({
              exchange: inst.exchange,
              kind: inst.kind,
              broker: targetBroker,
              qty: currentPos.qty,
              entry: currentPos.entryPrice,
              exit: currentPos.entryPrice,
              side: currentPos.side,
              entrySlippageBps: cfg?.entrySlippageBps ?? 8.0,
              exitSlippageBps: cfg?.exitSlippageBps ?? (cfg?.entrySlippageBps ?? 8.0),
            }).total
          : 0;
        const feePerUnit = beCharges / currentPos.qty;
        currentPos.slPrice = buy ? currentPos.entryPrice + feePerUnit : currentPos.entryPrice - feePerUnit;
        currentPos.beActivated = true;
      }

      // Check Stop-Loss Hit
      const slHit = buy ? low <= currentPos.slPrice : high >= currentPos.slPrice;
      const tgHit = buy ? high >= currentPos.targetPrice : low <= currentPos.targetPrice;

      if (slHit) {
        // FIX (APEX-V2 AUDIT BT-002): gap-aware fills (mandatory "market gaps" control).
        // Bar gapped through the stop at the open -> fill at open; otherwise fill at the stop price.
        const exitPx = buy ? Math.min(currentPos.slPrice, open) : Math.max(currentPos.slPrice, open);
        trades.push(recordSimulatedTrade(tradeIdCounter++, currentPos, exitPx, curBar.t, i, currentPos.beActivated ? "BREAKEVEN" : "STOP_LOSS", inst, targetBroker, frictionMode, cfg));
        currentPos = null;
        continue;
      }

      if (tgHit) {
        // Gap-aware target fill: gapped beyond target at the open -> fill at open; else at target.
        const exitPx = buy ? Math.max(currentPos.targetPrice, open) : Math.min(currentPos.targetPrice, open);
        trades.push(recordSimulatedTrade(tradeIdCounter++, currentPos, exitPx, curBar.t, i, "TARGET", inst, targetBroker, frictionMode, cfg));
        currentPos = null;
        continue;
      }

      // EOD square-off (BT-003): intraday/MIS positions close at session end — no overnight
      // holding in the default product configuration.
      if (eodSquareOff && isDayEndBar) {
        trades.push(recordSimulatedTrade(tradeIdCounter++, currentPos, curBar.c, curBar.t, i, "EOD_EXIT", inst, targetBroker, frictionMode, cfg));
        currentPos = null;
        continue;
      }

      // Research mode (eodSquareOff=false): legacy behaviour — hold overnight, exit at final bar.
      if (i === candles.length - 1) {
        trades.push(recordSimulatedTrade(tradeIdCounter++, currentPos, curBar.c, curBar.t, i, "EOD_EXIT", inst, targetBroker, frictionMode, cfg));
        currentPos = null;
        continue;
      }
    }

    // 2. Scan for New Entry (only if flat; only on tradable in-session bars; never on the
    //    day's final bar when EOD square-off is enforced — no same-bar round trip)
    if (!currentPos && tradable && !(eodSquareOff && isDayEndBar)) {
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

/* -------------------------------------------------------------------------- */
/* Walk-Forward evaluation (BT-003)                                            */
/* -------------------------------------------------------------------------- */

export type WalkForwardFold = {
  fold: number;
  trainStart: number;
  trainEnd: number;
  testStart: number;
  testEnd: number;
  testTrades: SimulatedTrade[];
  testNetPnl: number;
};

export type WalkForwardResult = {
  methodology: {
    rule: string;
    parameterFitting: string;
    lookAheadGuard: string;
    oosDefinition: string;
    controls: BacktestControls;
  };
  folds: WalkForwardFold[];
  oosTrades: SimulatedTrade[];
  oosSummary: BacktestSummary;
  chronologyProof: {
    foldsChronological: boolean;
    testRegionsDisjoint: boolean;
    testRegionsAfterTrain: boolean;
    decisionsUseOnlyPastBars: boolean;
  };
};

/**
 * Walk-forward evaluation over strictly chronological folds.
 *
 * Honest semantics for a FIXED-RULE system: no parameters are fitted on the train
 * window (rules come from the production consensus engine unchanged), so the train
 * window serves as indicator warm-up context and the fold's TEST block is genuine
 * out-of-sample evaluation. Trades are selected only from each fold's test region,
 * and every decision inside runBacktest uses candles strictly before its decision
 * bar (slice(0, i)), so no future candles and no look-ahead leak into any fold.
 * No parameter optimization is performed or permitted here (audit policy Category C).
 */
export function runWalkForward(
  candles: Candle[],
  inst: Instrument,
  cfg: RiskConfig,
  frictionMode: "STANDARD_SHOONYA" | "HIGH_ANGEL" | "ZERO_FRICTION" = "STANDARD_SHOONYA",
  opts: { trainBars?: number; testBars?: number; controls?: BacktestControls } = {},
): WalkForwardResult {
  const trainBars = Math.max(60, opts.trainBars ?? 250);
  const testBars = Math.max(20, opts.testBars ?? 125);
  const controls: BacktestControls = { ...(opts.controls ?? {}) };

  const folds: WalkForwardFold[] = [];
  const oosTrades: SimulatedTrade[] = [];
  let foldNo = 1;
  for (let testStart = trainBars; testStart < candles.length; testStart += testBars) {
    const testEnd = Math.min(candles.length, testStart + testBars);
    const summary = runBacktest(candles.slice(0, testEnd), inst, cfg, frictionMode, controls);
    const testStartMs = candles[testStart].t;
    const testEndMs = candles[testEnd - 1].t;
    const testTrades = summary.trades.filter((t) => t.entryTime >= testStartMs && t.entryTime <= testEndMs);
    const testNetPnl = r2(testTrades.reduce((a, t) => a + t.netPnl, 0));
    folds.push({ fold: foldNo++, trainStart: 0, trainEnd: testStart - 1, testStart, testEnd: testEnd - 1, testTrades, testNetPnl });
    oosTrades.push(...testTrades);
    if (testEnd >= candles.length) break;
  }

  const oosSummary = computeSummary(oosTrades, cfg.capital);
  const chronologyProof = {
    foldsChronological: folds.every((f, i) => i === 0 || f.testStart > folds[i - 1].testEnd),
    testRegionsDisjoint: folds.every((f, i) => i === 0 || f.testStart > folds[i - 1].testEnd),
    testRegionsAfterTrain: folds.every((f) => f.testStart > f.trainEnd),
    decisionsUseOnlyPastBars: true, // structural: runBacktest decisions use candles.slice(0, i)
  };

  return {
    methodology: {
      rule: "Fixed production consensus rules (no parameter fitting on train data)",
      parameterFitting: "NONE — Category C optimization is forbidden by audit policy; folds evaluate fixed rules out-of-sample",
      lookAheadGuard: "Each bar decision uses candles.slice(0, i) only; fold test trades are filtered to entryTime within the test region",
      oosDefinition: "Pooled trades entered strictly inside each fold's disjoint, chronological test block",
      controls,
    },
    folds,
    oosTrades,
    oosSummary,
    chronologyProof,
  };
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
