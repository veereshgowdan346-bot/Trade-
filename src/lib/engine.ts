import { and, desc, eq, gte, isNull, lt, ne, or } from "drizzle-orm";
import { db } from "@/db";
import { orders, positions } from "@/db/schema";
import { getWsStatus } from "./angelWs";
import { cancelBrokerOrder, getBrokerStatuses } from "./brokers";
import { routeOrder } from "./gateway";
import { buildBrokerPayload, growwSegment, sessionOf, type BrokerKey, type Instrument } from "./instruments";
import { analysisCandles, isLiveTickReady, ltpOf, marketFeedMode, marketStatusText, snapshot } from "./market";
import { sendAlert } from "./notifier";
import { breachesCircuit, confidenceMultiplier, sizePosition, type RiskConfig } from "./risk";
import { audit, getRisk, getSetting, istDayStartDate, istParts, recentAudit, setSetting } from "./settings";
import { getAutoTraderStatus } from "./scheduler";
import { discoverPlugins, evaluateConsensus, type Consensus } from "./strategies";
import { calculateNetPnL, roundTripCharges, type Charges } from "./tax";
import { resolveAll, resolveInstrument } from "./tokenMaster";
import { vaultSummary, vaultUsingFallbackKey } from "./vault";

export type OrderRequest = {
  symbol: string;
  side?: "BUY" | "SELL";
  qty?: number;
  orderType?: "MARKET" | "LIMIT";
  price?: number;
  source: "MANUAL" | "AUTO" | "WEBHOOK" | "FLASH_TEST";
  strategy?: string;
  externalVote?: boolean;
  broker?: BrokerKey;
  flashTest?: boolean;
};

export type OrderOutcome = {
  ok: boolean;
  status: string;
  reason?: string;
  orderId?: number;
  positionId?: number;
  execMs?: number;
  details?: Record<string, unknown>;
};

export type Circuit = {
  tripped: boolean;
  date: string;
  ts: string | null;
  reason: string | null;
  baselinePnl?: number;
  recoveryMode?: boolean;
};

export type RecoveryWatchState = {
  active: boolean;
  enteredAt: string | null;
  deficit: number;
  remainingCapital: number;
  reason: string | null;
};

export type PreFlightResult = {
  ok: boolean;
  code?: string;
  reason?: string;
  details?: Record<string, unknown>;
};

const r2 = (n: number) => Math.round(n * 100) / 100;
const roundTick = (v: number, tick: number) => Math.round(v / tick) * tick;
const round = (v: number, d: number) => Math.round(v * 10 ** d) / 10 ** d;

type G = typeof globalThis & {
  __omniOpenSymbols?: Set<string> | null;
  __omniPendingSymbols?: Set<string> | null;
  __omniTickLocks?: Set<string>;
  __omniInitialSlDist?: Map<number, number>;
};
const g = globalThis as G;

async function refreshOpenSymbolSet(): Promise<Set<string>> {
  const rows = await db.select({ symbol: positions.symbol }).from(positions).where(eq(positions.status, "OPEN"));
  const s = new Set(rows.map((r) => r.symbol));
  g.__omniOpenSymbols = s;
  return s;
}

async function refreshPendingOrderSet(): Promise<Set<string>> {
  const rows = await db.select({ symbol: orders.symbol }).from(orders).where(eq(orders.status, "OPEN"));
  const s = new Set(rows.map((r) => r.symbol));
  g.__omniPendingSymbols = s;
  return s;
}

/* ------------------------------ sessions --------------------------------- */

export function sessionStatus(now = Date.now()) {
  const p = istParts(now);
  const weekday = p.dow >= 1 && p.dow <= 5;
  return {
    equityOpen: weekday && p.minutes >= 9 * 60 + 15 && p.minutes < 15 * 60 + 30,
    mcxOpen: weekday && p.minutes >= 9 * 60 && p.minutes < 23 * 60 + 30,
    istTime: `${String(p.hh).padStart(2, "0")}:${String(p.mm).padStart(2, "0")}`,
    istDate: p.date,
    weekday,
  };
}

/* ------------------------------ circuit ---------------------------------- */

export async function getCircuit(): Promise<Circuit> {
  const c = await getSetting<Circuit>("circuit", { tripped: false, date: "", ts: null, reason: null, baselinePnl: 0 });
  if (c.tripped && c.date !== istParts().date) return { tripped: false, date: "", ts: null, reason: null, baselinePnl: 0 };
  return c;
}

export async function resetCircuit() {
  const pnl = await dailyPnl();
  await setSetting("circuit", { tripped: false, date: "", ts: null, reason: null, baselinePnl: pnl.total });
  await setRecoveryState({ active: false, enteredAt: null, deficit: 0, remainingCapital: 0, reason: null });
  await audit("WARN", "CIRCUIT", `Circuit breaker manually reset by operator (Session baseline P&L: ₹${pnl.total})`);
}

/* ------------------------ crash protection ------------------------------ */

export function getCrashProtectionStatus(): { active: boolean; reason: string | null } {
  const ws = getWsStatus();
  if (!ws.connected) {
    return {
      active: true,
      reason: "SmartWebSocketV2 disconnected or feed unavailable. Crash Protection Lock active.",
    };
  }
  return { active: false, reason: null };
}

/* ------------------------ recovery watch mode --------------------------- */

export async function getRecoveryState(): Promise<RecoveryWatchState> {
  return getSetting<RecoveryWatchState>("recoveryWatch", {
    active: false,
    enteredAt: null,
    deficit: 0,
    remainingCapital: 0,
    reason: null,
  });
}

export async function setRecoveryState(st: RecoveryWatchState) {
  await setSetting("recoveryWatch", st);
}

/* ------------------------ daily reset & zero state ---------------------- */

export async function enforceDailyReset(): Promise<{ resetPerformed: boolean; date: string; archivedOrders: number }> {
  const today = istParts().date;
  const lastReset = await getSetting<string>("lastDailyResetDate", "");
  if (lastReset === today) {
    return { resetPerformed: false, date: today, archivedOrders: 0 };
  }

  const startOfToday = istDayStartDate();
  // Strict Daily Wipe: Archive all prior-day OPEN orders so they never leak into today's active dashboard.
  // SAFETY FIX (APEX-V2 R-001): LIVE orders with a broker_requested ID are excluded — they represent
  // resting orders still active at the OMS. Archiving them locally would orphan the live position.
  // Only PAPER orders or LIVE orders that never reached the broker (no broker_requested) are archived.
  const staleOrders = await db
    .update(orders)
    .set({
      status: "ARCHIVED_STALE",
      reason: `Archived on daily reset (${today}) - stale resting order from prior session`,
    })
    .where(
      and(
        eq(orders.status, "OPEN"),
        lt(orders.ts, startOfToday),
        // Preserve live orders that have a confirmed broker order ID
        or(ne(orders.mode, "LIVE"), isNull(orders.brokerRequested)),
      ),
    )
    .returning({ id: orders.id });

  g.__omniPendingSymbols = new Set();

  // Reset circuit breaker baseline if from previous date
  const circuit = await getCircuit();
  if (circuit.tripped && circuit.date !== today) {
    await setSetting("circuit", { tripped: false, date: today, ts: null, reason: null, baselinePnl: 0 });
  }

  // Reset recovery mode state on new calendar day
  await setRecoveryState({
    active: false,
    enteredAt: null,
    deficit: 0,
    remainingCapital: 0,
    reason: null,
  });

  await setSetting("lastDailyResetDate", today);
  await audit("INFO", "DAILY_RESET", `Daily reset enforced for ${today}. Archived ${staleOrders.length} stale PAPER/unconfirmed order(s). LIVE orders with broker IDs preserved for manual reconciliation. Today initialized to strict zero-state.`);
  return { resetPerformed: true, date: today, archivedOrders: staleOrders.length };
}

/* ------------------------------ positions -------------------------------- */

type PositionRow = typeof positions.$inferSelect;

export async function openPositionsLive() {
  await reconcileClosingPositions();
  const rows = await db.select().from(positions).where(eq(positions.status, "OPEN")).orderBy(desc(positions.id));
  g.__omniOpenSymbols = new Set(rows.map((r) => r.symbol));
  const out = [];
  for (const p of rows) {
    const inst = await resolveInstrument(p.symbol);
    const liveLtp = inst ? ltpOf(inst) : null;
    const ltp = liveLtp ?? p.entryPrice;
    const dir = p.side === "BUY" ? 1 : -1;
    out.push({ ...p, ltp, mtm: liveLtp !== null ? r2((liveLtp - p.entryPrice) * p.qty * dir) : 0, priceLive: liveLtp !== null });
  }
  return out;
}

/**
 * Reconciles any positions left in 'CLOSING' state due to an unexpected process restart.
 * Safe reconciliation guarantees that:
 * 1. Fully filled exit orders close the position with exact fill price, turnover, and charges.
 * 2. Partially filled exit orders slice the filled portion into a closed position record with exact costs,
 *    decrementing the active position quantity and safely restoring the remainder to 'OPEN'.
 * 3. Cancelled and rejected exit orders restore the position to 'OPEN' for active risk management.
 * 4. Pending, submitted, or uncertain exit orders retain 'CLOSING' state to prevent duplicate orders or accidental open exposures.
 * 5. LIVE positions with missing exit order records retain 'CLOSING' state and trigger critical alerts.
 * 6. Multiple exit orders for a single position are aggregated with volume-weighted average price.
 * 7. Duplicate reconciliation invocations are strictly idempotent.
 * 8. Zero duplicate closures and zero double-deducted costs.
 */
export async function reconcileClosingPositions(): Promise<number> {
  const stuck = await db.select().from(positions).where(eq(positions.status, "CLOSING"));
  if (!stuck.length) return 0;

  let reconciledCount = 0;
  for (const p of stuck) {
    // Find candidate exit orders matching this symbol and reverse side
    const exitSide = p.side === "BUY" ? "SELL" : "BUY";
    const candidateOrders = await db
      .select()
      .from(orders)
      .where(and(eq(orders.symbol, p.symbol), eq(orders.side, exitSide)))
      .orderBy(desc(orders.id))
      .limit(10);

    // Filter matching orders by positionId or reason/timestamp
    const matchingOrders = candidateOrders.filter((o) => {
      const payload = o.payload as { positionId?: number; filledQty?: number } | null;
      if (payload?.positionId === p.id) return true;
      if (o.reason && o.reason.includes("Exit") && o.ts >= p.openedAt) return true;
      return false;
    });

    const filledOrders = matchingOrders.filter((o) => o.status === "FILLED" || o.status === "PARTIALLY_FILLED");
    const pendingOrders = matchingOrders.filter((o) => ["PENDING", "SUBMITTED", "TRIGGER_PENDING", "UNCERTAIN"].includes(o.status));
    const cancelledOrRejected = matchingOrders.filter((o) => ["CANCELLED", "REJECTED", "REJECTED_EXIT"].includes(o.status));

    // Case 1 & 6: Filled order(s) exist
    if (filledOrders.length > 0) {
      let totalFilledQty = 0;
      let totalExecutedTurnover = 0;
      for (const fo of filledOrders) {
        const payload = fo.payload as { filledQty?: number } | null;
        const execQty = payload?.filledQty && payload.filledQty > 0 ? payload.filledQty : fo.qty;
        totalFilledQty += execQty;
        totalExecutedTurnover += execQty * fo.price;
      }

      if (totalFilledQty > 0) {
        const avgExitPrice = r2(totalExecutedTurnover / totalFilledQty);
        const inst = await resolveInstrument(p.symbol);
        const cfg = await getRisk();
        const entrySlip = cfg.entrySlippageBps ?? 8.0;
        const exitSlip = cfg.exitSlippageBps ?? entrySlip;
        const dir = p.side === "BUY" ? 1 : -1;

        if (totalFilledQty >= p.qty) {
          // Fully filled (Scenario 1 & Scenario 6)
          const gross = r2((avgExitPrice - p.entryPrice) * p.qty * dir);
          const charges = inst
            ? roundTripCharges({
                exchange: inst.exchange,
                kind: inst.kind,
                broker: p.broker as BrokerKey,
                qty: p.qty,
                entry: p.entryPrice,
                exit: avgExitPrice,
                side: p.side as "BUY" | "SELL",
                entrySlippageBps: entrySlip,
                exitSlippageBps: exitSlip,
              })
            : { total: 0, brokerage: 0, stt: 0, exchange: 0, sebi: 0, stampDuty: 0, gst: 0, entrySlippage: 0, exitSlippage: 0, totalSlippage: 0 };

          const net = r2(gross - charges.total);
          await db
            .update(positions)
            .set({
              status: "CLOSED",
              closedAt: new Date(),
              exitPrice: avgExitPrice,
              exitReason: filledOrders.length > 1 ? "RESTART_RECONCILED_MULTI_CLOSE" : "RESTART_RECONCILED_CLOSE",
              grossPnl: gross,
              charges,
              totalCharges: charges.total,
              netPnl: net,
            })
            .where(eq(positions.id, p.id));

          await audit("WARN", "RESTART_RECOVERY", `Reconciled stuck CLOSING position #${p.id} to CLOSED via confirmed fill(s) (qty: ${p.qty}, avg exit: ₹${avgExitPrice})`);
          reconciledCount++;
          continue;
        } else {
          // Partial fill (Scenario 2)
          const remainingQty = p.qty - totalFilledQty;
          const gross = r2((avgExitPrice - p.entryPrice) * totalFilledQty * dir);
          const charges = inst
            ? roundTripCharges({
                exchange: inst.exchange,
                kind: inst.kind,
                broker: p.broker as BrokerKey,
                qty: totalFilledQty,
                entry: p.entryPrice,
                exit: avgExitPrice,
                side: p.side as "BUY" | "SELL",
                entrySlippageBps: entrySlip,
                exitSlippageBps: exitSlip,
              })
            : { total: 0, brokerage: 0, stt: 0, exchange: 0, sebi: 0, stampDuty: 0, gst: 0, entrySlippage: 0, exitSlippage: 0, totalSlippage: 0 };
          const net = r2(gross - charges.total);

          // Insert closed slice for executed quantity
          await db.insert(positions).values({
            orderId: p.orderId,
            symbol: p.symbol,
            exchange: p.exchange,
            side: p.side,
            qty: totalFilledQty,
            entryPrice: p.entryPrice,
            slPrice: p.slPrice,
            targetPrice: p.targetPrice,
            initialSlDistance: p.initialSlDistance,
            strategy: p.strategy,
            broker: p.broker,
            mode: p.mode,
            status: "CLOSED",
            openedAt: p.openedAt,
            closedAt: new Date(),
            exitPrice: avgExitPrice,
            exitReason: "PARTIAL_FILL_RECONCILED",
            grossPnl: gross,
            charges,
            totalCharges: charges.total,
            netPnl: net,
          });

          // Update remaining quantity on active position and restore to OPEN
          await db
            .update(positions)
            .set({ qty: remainingQty, status: "OPEN" })
            .where(and(eq(positions.id, p.id), eq(positions.status, "CLOSING")));

          await audit("WARN", "RESTART_RECOVERY", `Reconciled partial fill for CLOSING position #${p.id}: closed ${totalFilledQty} @ ₹${avgExitPrice}, remaining ${remainingQty} restored to OPEN`);
          reconciledCount++;
          continue;
        }
      }
    }

    // Case 8: Uncertain / Pending orders exist
    if (pendingOrders.length > 0) {
      // Do NOT revert to OPEN; leave in CLOSING and alert
      await audit("CRITICAL", "RECONCILIATION_UNCERTAIN", `Position #${p.id} has unconfirmed exit order #${pendingOrders[0].id} (${pendingOrders[0].status}). Retaining CLOSING state pending broker confirmation.`);
      await sendAlert("UNCERTAIN_EXIT_ORDER", `Uncertain Exit Order for ${p.symbol}`, `<p>Position #${p.id} has unconfirmed exit order #${pendingOrders[0].id} (${pendingOrders[0].status}). Retaining CLOSING state.</p>`);
      continue;
    }

    // Case 3 & 4: Cancelled or Rejected exit orders
    if (cancelledOrRejected.length > 0) {
      await db
        .update(positions)
        .set({ status: "OPEN" })
        .where(and(eq(positions.id, p.id), eq(positions.status, "CLOSING")));
      await audit("WARN", "RESTART_RECOVERY", `Reconciled position #${p.id} back to OPEN after cancelled/rejected exit order #${cancelledOrRejected[0].id} (${cancelledOrRejected[0].status})`);
      reconciledCount++;
      continue;
    }

    // Case 5: Missing order record
    if (p.mode === "LIVE") {
      // Never assume an absent fill record proves no execution occurred in LIVE mode!
      await audit("CRITICAL", "ORDER_RECORD_MISSING", `LIVE position #${p.id} stuck in CLOSING with no exit order record found. Retaining CLOSING state; manual tradebook verification required.`);
      await sendAlert("MISSING_EXIT_ORDER_RECORD", `Missing Exit Order Record for ${p.symbol}`, `<p>LIVE position #${p.id} stuck in CLOSING with no exit order record found. Manual verification required.</p>`);
      continue;
    } else {
      // PAPER mode: Safe to revert to OPEN
      await db
        .update(positions)
        .set({ status: "OPEN" })
        .where(and(eq(positions.id, p.id), eq(positions.status, "CLOSING")));
      await audit("WARN", "RESTART_RECOVERY", `Reconciled unconfirmed PAPER position #${p.id} back to OPEN for active tracking`);
      reconciledCount++;
    }
  }

  return reconciledCount;
}

export async function closePosition(p: PositionRow, exitPrice: number, reason: string) {
  const inst = await resolveInstrument(p.symbol);
  if (!inst) return null;

  const claimed = await db
    .update(positions)
    .set({ status: "CLOSING" })
    .where(and(eq(positions.id, p.id), eq(positions.status, "OPEN")))
    .returning({ id: positions.id });
  if (!claimed.length) return null;

  const exitSide: "BUY" | "SELL" = p.side === "BUY" ? "SELL" : "BUY";
  const isLive = p.mode === "LIVE";

  if (isLive) {
    // Phase 6.9 Safety Interlock: Real broker order placement is permanently disabled.
    // Prevent routing to external broker APIs; record simulated exit closure.
    await audit("WARN", "SAFETY_INTERLOCK", `Simulating closure for legacy LIVE position #${p.id}; real broker orders are permanently disabled.`);
  }

  const dir = p.side === "BUY" ? 1 : -1;
  const gross = r2((exitPrice - p.entryPrice) * p.qty * dir);
  const cfg = await getRisk();
  const entrySlip = cfg.entrySlippageBps ?? 8.0;
  const exitSlip = cfg.exitSlippageBps ?? entrySlip;
  const charges = roundTripCharges({
    exchange: inst.exchange,
    kind: inst.kind,
    broker: p.broker as BrokerKey,
    qty: p.qty,
    entry: p.entryPrice,
    exit: exitPrice,
    side: p.side as "BUY" | "SELL",
    entrySlippageBps: entrySlip,
    exitSlippageBps: exitSlip,
  });
  const net = r2(gross - charges.total);
  await db
    .update(positions)
    .set({ status: "CLOSED", closedAt: new Date(), exitPrice, exitReason: reason, grossPnl: gross, charges, totalCharges: charges.total, netPnl: net })
    .where(eq(positions.id, p.id));

  await refreshOpenSymbolSet();
  g.__omniInitialSlDist?.delete(p.id);
  await audit(net >= 0 ? "INFO" : "WARN", "TRADE", `[${p.mode}] ${p.symbol} ${p.side} closed (${reason}) net ${net >= 0 ? "+" : ""}₹${net}`, {
    id: p.id, entry: p.entryPrice, exit: exitPrice, gross, charges: charges.total, net, broker: p.broker, mode: p.mode,
  });
  return net;
}

export async function squareOffAll(reason: string, session?: "EQUITY" | "MCX") {
  const open = await db.select().from(positions).where(eq(positions.status, "OPEN"));
  let n = 0;
  for (const p of open) {
    const inst = await resolveInstrument(p.symbol);
    if (!inst) continue;
    if (session && sessionOf(inst.exchange) !== session) continue;
    const ltp = ltpOf(inst) ?? p.entryPrice;
    if ((await closePosition(p, ltp, reason)) !== null) n++;
  }
  if (n) await audit("WARN", "SQUARE_OFF", `${reason}: squared off ${n} position(s)${session ? ` [${session}]` : ""}`);
  return n;
}

function checkLivePriceAgainstBracket(p: PositionRow, ltp: number): { price: number; reason: string } | null {
  const buy = p.side === "BUY";
  if (buy ? ltp <= p.slPrice : ltp >= p.slPrice) {
    return { price: ltp, reason: "BRACKET_STOP_LOSS" };
  }
  if (buy ? ltp >= p.targetPrice : ltp <= p.targetPrice) {
    // Rigid verification: Take-Profit triggers only when net profit is guaranteed positive after all statutory fees & brokerage!
    const dir = buy ? 1 : -1;
    const gross = r2((ltp - p.entryPrice) * p.qty * dir);
    const netEval = calculateNetPnL({
      grossPnL: gross,
      broker: p.broker,
      qty: p.qty,
      entry: p.entryPrice,
      exit: ltp,
      exchange: p.exchange as any,
      side: p.side as "BUY" | "SELL",
    });
    if (netEval.netPnL > 0) {
      return { price: ltp, reason: "BRACKET_TARGET" };
    }
  }
  return null;
}

/** Resolves the initial 1R StopLoss distance for an open position (persisted or recovered from order). */
export async function getInitialSlDistance(p: PositionRow): Promise<number | null> {
  g.__omniInitialSlDist ??= new Map();
  const cached = g.__omniInitialSlDist.get(p.id);
  if (cached && cached > 0) return cached;

  // 1. Direct persistence on position row (Phase 6.7 fix)
  if (p.initialSlDistance !== null && p.initialSlDistance !== undefined && p.initialSlDistance > 0 && !isNaN(p.initialSlDistance) && isFinite(p.initialSlDistance)) {
    g.__omniInitialSlDist.set(p.id, p.initialSlDistance);
    return p.initialSlDistance;
  }

  // 2. Recover from the linked order record
  if (p.orderId) {
    const ords = await db.select({ slPrice: orders.slPrice, price: orders.price }).from(orders).where(eq(orders.id, p.orderId)).limit(1);
    if (ords.length && ords[0].slPrice) {
      const dist = Math.abs(p.entryPrice - ords[0].slPrice);
      if (dist > 0 && !isNaN(dist) && isFinite(dist)) {
        g.__omniInitialSlDist.set(p.id, dist);
        try {
          await db.update(positions).set({ initialSlDistance: dist }).where(eq(positions.id, p.id));
        } catch {
          // ignore error if read-only or during concurrent migration
        }
        return dist;
      }
    }
  }

  // 3. Fallback: If distance cannot be validated, DO NOT return an arbitrary tiny tick (like 0.10)
  // which would collapse 1R and cause false ratcheting.
  // Returning null allows callers (e.g. updateTrailingStopLoss) to safely disable trailing.
  return null;
}

/**
 * Dynamic Trailing Stop-Loss (TSL) Engine:
 * - 1R Net Breakeven Shift: When LTP moves in profit by initial SL distance (1R), immediately move active SL to Net Breakeven (Entry + Fees, guaranteeing ₹0.00 net).
 * - 2R+ Trailing Shift: For every additional 1R of profit, trail the SL closely behind it by 1R.
 * - Guaranteed ratchet: SL moves strictly in favor of the position (never loosens).
 */
async function updateTrailingStopLoss(p: PositionRow, inst: Instrument, ltp: number): Promise<boolean> {
  if (!(ltp > 0)) return false;
  const initialDist = await getInitialSlDistance(p);
  if (!initialDist || !(initialDist > 0)) {
    // Legacy row with null/missing distance or unrecoverable order: safely disable trailing stop
    return false;
  }

  const R = initialDist;
  const buy = p.side === "BUY";
  const profit = buy ? ltp - p.entryPrice : p.entryPrice - ltp;

  // Not yet at 1R profit milestone
  if (profit < R) return false;

  const k = Math.floor(profit / R);
  if (k < 1) return false;

  // Real-world net breakeven: offset entry price by exact round-trip fees per unit so breakeven exit is NET ZERO
  const cfg = await getRisk();
  const entrySlip = cfg.entrySlippageBps ?? 8.0;
  const exitSlip = cfg.exitSlippageBps ?? entrySlip;
  const chargesAtBe = roundTripCharges({
    exchange: inst.exchange,
    kind: inst.kind,
    broker: p.broker as BrokerKey,
    qty: p.qty,
    entry: p.entryPrice,
    exit: p.entryPrice,
    side: p.side as "BUY" | "SELL",
    entrySlippageBps: entrySlip,
    exitSlippageBps: exitSlip,
  });
  const feeBufferPerUnit = roundTick(chargesAtBe.total / p.qty, inst.tick);
  const netBreakevenPrice = buy
    ? roundTick(p.entryPrice + feeBufferPerUnit, inst.tick)
    : roundTick(p.entryPrice - feeBufferPerUnit, inst.tick);

  // At 1R (k=1): newSl = netBreakevenPrice (True Net Breakeven covering all ₹25/₹55 taxes & brokerage)
  // At 2R+ (k>=2): newSl = netBreakevenPrice +/- (k - 1) * R (trailed 1R behind the milestone)
  const shift = (k - 1) * R;
  let newSl = buy ? roundTick(netBreakevenPrice + shift, inst.tick) : roundTick(netBreakevenPrice - shift, inst.tick);
  newSl = round(newSl, 2);

  // Ratchet check: Long SL can only increase; Short SL can only decrease
  const isBetter = buy ? newSl > p.slPrice + 1e-4 : newSl < p.slPrice - 1e-4;
  if (!isBetter) return false;

  const oldSl = p.slPrice;
  p.slPrice = newSl;

  await db.update(positions).set({ slPrice: newSl }).where(eq(positions.id, p.id));

  if (k === 1 || Math.abs(newSl - netBreakevenPrice) < 1e-4) {
    const msg = `[TSL UPDATED] SL moved to Net Breakeven @ ₹${r2(newSl)} (${p.symbol} ${p.side} #${p.id}, Entry ₹${r2(p.entryPrice)}, FeeBuffer ₹${r2(feeBufferPerUnit)}, LTP ₹${r2(ltp)})`;
    await audit("INFO", "TSL", msg, {
      positionId: p.id,
      symbol: p.symbol,
      side: p.side,
      entry: p.entryPrice,
      oldSl,
      newSl,
      feeBufferPerUnit,
      ltp,
      rMultiple: "1R Net Breakeven",
      profit: r2(profit),
    });
  } else {
    const msg = `[TSL UPDATED] SL trailed to ₹${r2(newSl)} (${p.symbol} ${p.side} #${p.id}, +${k - 1}R locked, Entry ₹${r2(p.entryPrice)}, LTP ₹${r2(ltp)})`;
    await audit("INFO", "TSL", msg, {
      positionId: p.id,
      symbol: p.symbol,
      side: p.side,
      entry: p.entryPrice,
      oldSl,
      newSl,
      ltp,
      rMultiple: `${k}R (+${k - 1}R locked)`,
      profit: r2(profit),
    });
  }

  return true;
}

/**
 * Real-feed bracket evaluation:
 * Only evaluates when genuine exchange prices exist (never triggers on missing/disconnected data).
 */
async function evaluatePositionBracket(p: PositionRow, inst: Instrument, liveLtp?: number): Promise<boolean> {
  const currentLtp = liveLtp ?? ltpOf(inst);
  if (currentLtp === null || currentLtp <= 0) return false;

  const immediate = checkLivePriceAgainstBracket(p, currentLtp);
  if (immediate) {
    return (await closePosition(p, immediate.price, immediate.reason)) !== null;
  }

  // Autonomous dynamic trailing stop-loss update (1R Breakeven, 2R+ Trailing)
  await updateTrailingStopLoss(p, inst, currentLtp);

  const entryMinute = Math.floor(p.openedAt.getTime() / 60_000) * 60_000;
  const postEntryCandles = snapshot(inst, 200).candles.filter((c) => c.t > entryMinute);
  const buy = p.side === "BUY";
  for (const c of postEntryCandles) {
    const slHit = buy ? c.l <= p.slPrice : c.h >= p.slPrice;
    const tgHit = buy ? c.h >= p.targetPrice : c.l <= p.targetPrice;
    if (slHit) {
      return (await closePosition(p, currentLtp, "BRACKET_STOP_LOSS")) !== null;
    }
    if (tgHit) {
      return (await closePosition(p, currentLtp, "BRACKET_TARGET")) !== null;
    }
  }
  return false;
}

/** Fills resting PAPER LIMIT orders instantaneously when a live SmartWebSocketV2 tick crosses their limit price. */
async function fillPendingOrdersForSymbol(symbol: string, ltp: number) {
  const pendingSymbols = g.__omniPendingSymbols ?? (await refreshPendingOrderSet());
  if (!pendingSymbols.has(symbol)) return;

  const openOrders = await db.select().from(orders).where(and(eq(orders.symbol, symbol), eq(orders.status, "OPEN")));
  if (!openOrders.length) {
    pendingSymbols.delete(symbol);
    return;
  }
  const inst = await resolveInstrument(symbol);
  if (!inst) return;
  const cfg = await getRisk();

  for (const o of openOrders) {
    if (o.mode !== "PAPER") continue;
    const cross = o.side === "BUY" ? ltp <= o.price : ltp >= o.price;
    if (!cross) continue;

    const claimed = await db
      .update(orders)
      .set({ status: "FILLING" })
      .where(and(eq(orders.id, o.id), eq(orders.status, "OPEN")))
      .returning({ id: orders.id });
    if (!claimed.length) continue;

    const route = await routeOrder(
      { inst, side: o.side as "BUY" | "SELL", qty: o.qty, price: ltp, orderType: "LIMIT", tag: `LIM${o.id}` },
      { ...cfg, tradingMode: "PAPER" },
      (o.brokerRequested as BrokerKey | null) ?? cfg.primaryBroker,
    );
    if (!route.ok || !route.result || !route.used) {
      await db.update(orders).set({ status: "REJECTED_ROUTING", reason: "Working limit order routing failed" }).where(eq(orders.id, o.id));
      continue;
    }
    await db
      .update(orders)
      .set({
        status: "FILLED",
        price: ltp,
        brokerUsed: route.used,
        failover: route.failover,
        latencyMs: route.attempts.reduce((a, x) => a + x.ms, 0),
        reason: `Limit filled on live tick @ ₹${ltp} via ${route.used.toUpperCase()}`,
      })
      .where(eq(orders.id, o.id));

    const [pos] = await db
      .insert(positions)
      .values({
        orderId: o.id,
        symbol: inst.symbol,
        exchange: inst.exchange,
        side: o.side,
        qty: o.qty,
        entryPrice: ltp,
        slPrice: o.slPrice ?? ltp,
        targetPrice: o.targetPrice ?? ltp,
        initialSlDistance: o.slPrice ? Math.abs(ltp - o.slPrice) : null,
        strategy: o.strategy,
        broker: route.used,
        mode: "PAPER",
      })
      .returning({ id: positions.id });
    if (pos && o.slPrice) {
      g.__omniInitialSlDist ??= new Map();
      g.__omniInitialSlDist.set(pos.id, Math.abs(ltp - o.slPrice));
    }
    g.__omniOpenSymbols ??= new Set();
    g.__omniOpenSymbols.add(inst.symbol);
    await audit("INFO", "ORDER", `[PAPER] Limit order #${o.id} ${inst.symbol} ${o.side} filled on live tick @ ₹${ltp}`);
  }
  await refreshPendingOrderSet();
}

/** Instantaneous tick-level handler invoked directly by SmartWebSocketV2 ticks. */
export async function processLiveTick(symbol: string, ltp: number) {
  if (!(ltp > 0)) return;
  g.__omniTickLocks ??= new Set();
  if (g.__omniTickLocks.has(symbol)) return;
  g.__omniTickLocks.add(symbol);
  try {
    await fillPendingOrdersForSymbol(symbol, ltp);

    const openSymbols = g.__omniOpenSymbols ?? (await refreshOpenSymbolSet());
    if (!openSymbols.has(symbol)) return;
    const open = await db.select().from(positions).where(and(eq(positions.symbol, symbol), eq(positions.status, "OPEN")));
    if (!open.length) {
      openSymbols.delete(symbol);
      return;
    }
    const inst = await resolveInstrument(symbol);
    if (!inst) return;
    for (const p of open) {
      await evaluatePositionBracket(p, inst, ltp);
    }
  } finally {
    g.__omniTickLocks.delete(symbol);
  }
}

export async function checkBrackets() {
  // Crash Asset Protection: If WebSocket is disconnected or feed drops, DO NOT dump assets or fire blind SLs
  const crash = getCrashProtectionStatus();
  if (crash.active) {
    return 0;
  }

  const open = await db.select().from(positions).where(eq(positions.status, "OPEN"));
  g.__omniOpenSymbols = new Set(open.map((p) => p.symbol));
  let closed = 0;
  for (const p of open) {
    const inst = await resolveInstrument(p.symbol);
    if (!inst) continue;
    if (await evaluatePositionBracket(p, inst)) closed++;
  }
  return closed;
}

export async function dailyPnl() {
  await enforceDailyReset();
  const start = istDayStartDate();
  // Strict Daily Reset: only fetch positions closed TODAY (00:00:00 IST onward)
  const realizedRows = await db
    .select()
    .from(positions)
    .where(and(eq(positions.status, "CLOSED"), gte(positions.closedAt, start)));

  const open = await openPositionsLive();

  const calcSegregated = (rows: typeof realizedRows, openRows: typeof open) => {
    const realized = r2(rows.reduce((a, r) => a + (r.netPnl ?? 0), 0));
    const unrealized = r2(openRows.reduce((a, p) => a + p.mtm, 0));
    const charges = r2(rows.reduce((a, r) => a + (r.totalCharges ?? 0), 0));
    const wins = rows.filter((r) => (r.netPnl ?? 0) > 0).length;
    return {
      realized,
      unrealized,
      total: r2(realized + unrealized),
      charges,
      trades: rows.length,
      wins,
    };
  };

  const paperRows = realizedRows.filter((r) => (r.mode ?? "PAPER") === "PAPER");
  const paperOpen = open.filter((p) => (p.mode ?? "PAPER") === "PAPER");
  const paper = calcSegregated(paperRows, paperOpen);

  const liveRows = realizedRows.filter((r) => r.mode === "LIVE");
  const liveOpen = open.filter((p) => p.mode === "LIVE");
  const live = calcSegregated(liveRows, liveOpen);

  const cfg = await getRisk();
  const activeMode: "PAPER" | "LIVE" = cfg?.tradingMode === "LIVE" ? "LIVE" : "PAPER";
  const activePnl = activeMode === "LIVE" ? live : paper;

  return {
    ...activePnl,
    paper,
    live,
    activeMode,
  };
}

/**
 * Intraday Circuit Breaker & Smart Recovery (The 200/800 Rule):
 * - When daily drawdown reaches floor (e.g. ₹200 on ₹1,000 capital), halt standard HFT and enter Recovery_Watch_Mode.
 * - In Recovery_Watch_Mode, capital is capped to the remaining ₹800, and only ultra-high consensus setups (Quorum ≥90%, GBM ≥85%) are deployed.
 * - Once PnL recovers, normal trading resumes.
 * - If catastrophic drawdown breaches hard stop, the hard circuit breaker trips.
 */
export async function checkCircuit(cfg?: RiskConfig) {
  const risk = cfg ?? (await getRisk());
  const cur = await getCircuit();
  if (cur.tripped) return cur;
  const pnl = await dailyPnl();
  const sessionPnl = r2(pnl.total - (cur.baselinePnl ?? 0));
  const floor = Math.abs(risk.drawdownFloor);

  const recovery = await getRecoveryState();
  if (sessionPnl <= -floor) {
    if (!recovery.active) {
      const deficit = Math.abs(sessionPnl);
      const remainingCapital = Math.max(0, risk.capital - deficit);
      const recState: RecoveryWatchState = {
        active: true,
        enteredAt: new Date().toISOString(),
        deficit,
        remainingCapital,
        reason: `Drawdown ₹${deficit} reached floor ₹${floor}. Halting standard HFT and entering Recovery_Watch_Mode (200/800 Rule).`,
      };
      await setRecoveryState(recState);
      await audit(
        "WARN",
        "RECOVERY_WATCH",
        `RECOVERY_WATCH_MODE ACTIVATED (The 200/800 Rule) - Deficit: ₹${deficit}, Remaining Capital: ₹${remainingCapital}. Watching for ultra-consensus (Quorum ≥90%, GBM ≥85%) setups.`,
        { deficit, remainingCapital, floor },
      );
      await sendAlert(
        "RECOVERY_WATCH",
        "Smart Recovery Watch Mode Activated",
        `<p>${recState.reason}</p><p>Remaining capital: ₹${remainingCapital}. Only ultra-high quorum (≥90%) and GBM (≥85%) trades will be deployed to recover deficit.</p>`,
      );
    }
  } else if (recovery.active && sessionPnl > -floor * 0.5) {
    await setRecoveryState({ active: false, enteredAt: null, deficit: 0, remainingCapital: risk.capital, reason: null });
    await audit("INFO", "RECOVERY_WATCH", `RECOVERY_WATCH_MODE RESOLVED: Account recovered to session P&L ₹${sessionPnl}. Resuming standard trading.`);
  }

  // Hard catastrophic capital protection stop
  const hardStop = Math.max(floor * 3, risk.capital * 0.9);
  if (sessionPnl <= -hardStop) {
    const reason = `Catastrophic drawdown ₹${sessionPnl} breached hard capital stop -₹${hardStop}`;
    const next: Circuit = { tripped: true, date: istParts().date, ts: new Date().toISOString(), reason, baselinePnl: cur.baselinePnl ?? 0 };
    await setSetting("circuit", next);
    await audit("CRITICAL", "CIRCUIT", `HARD CIRCUIT BREAKER TRIPPED - ${reason}`, { ...pnl, sessionPnl });
    const n = await squareOffAll("HARD_CIRCUIT_BREAKER");
    await sendAlert(
      "CIRCUIT_BREAKER",
      "Hard Circuit Breaker TRIPPED",
      `<p>${reason}.</p><p>${n} open position(s) squared off. Trading is hard-locked until next IST session or admin reset.</p>`,
    );
    return next;
  }
  return cur;
}

/* ------------------------------ analysis --------------------------------- */

export async function analyse(inst: Instrument, cfg: RiskConfig, externalVote?: 1 | -1 | 0): Promise<Consensus> {
  const plugins = await discoverPlugins();
  return evaluateConsensus(analysisCandles(inst), cfg, externalVote, plugins);
}

/* ------------------------------ order pipeline --------------------------- */

async function recordOrder(v: Partial<typeof orders.$inferInsert> & { symbol: string; exchange: string; side: string; status: string }) {
  const [row] = await db.insert(orders).values(v).returning({ id: orders.id });
  return row.id;
}

export async function cancelOrder(orderId: number): Promise<{ ok: boolean; status: string; reason?: string }> {
  const rows = await db.select().from(orders).where(eq(orders.id, orderId));
  const o = rows[0];
  if (!o) return { ok: false, status: "NOT_FOUND", reason: "Order not found" };
  if (o.status !== "OPEN") return { ok: false, status: o.status, reason: `Order status is ${o.status}, cannot cancel` };

  if (o.mode === "LIVE") {
    const broker = (o.brokerUsed || o.brokerRequested) as BrokerKey | null;
    const pl = (o.payload ?? {}) as { brokerOrderId?: string };
    if (broker && pl.brokerOrderId) {
      const inst = await resolveInstrument(o.symbol);
      const seg = inst ? growwSegment(inst) : "CASH";
      const res = await cancelBrokerOrder(broker, pl.brokerOrderId, seg);
      if (!res.ok) {
        await audit("WARN", "ORDER", `Live cancel failed for #${o.id} (${broker}): ${res.error}`);
        return { ok: false, status: o.status, reason: res.error };
      }
    }
  }

  await db.update(orders).set({ status: "CANCELLED", reason: "Cancelled by operator" }).where(and(eq(orders.id, o.id), eq(orders.status, "OPEN")));
  await refreshPendingOrderSet();
  await audit("INFO", "ORDER", `[${o.mode}] Order #${o.id} (${o.symbol} ${o.side}) cancelled`);
  return { ok: true, status: "CANCELLED" };
}

/**
 * Pre-Execution Double-Check Engine (PreFlightCheck):
 * Evaluates available capital, maximum position count, and confirms mathematical feasibility
 * of net profit hurdle (Shoonya ₹25, Angel One ₹55/₹70) against current ATR before allowing any automated trade.
 */
export async function preFlightCheck(args: {
  inst: Instrument;
  side: "BUY" | "SELL";
  entry: number;
  atr: number;
  cfg: RiskConfig;
  openPositions: PositionRow[];
  broker: BrokerKey;
  source: string;
  qty?: number;
}): Promise<PreFlightResult> {
  const { inst, side, entry, atr, cfg, openPositions, broker, source, qty: requestedQty } = args;

  // 1. Max Open Positions Cap
  if (source !== "FLASH_TEST" && openPositions.length >= cfg.maxOpenPositions) {
    return {
      ok: false,
      code: "MAX_POSITIONS",
      reason: `PreFlight: Open positions (${openPositions.length}) reached max cap (${cfg.maxOpenPositions})`,
      details: { openCount: openPositions.length, maxOpenPositions: cfg.maxOpenPositions },
    };
  }

  // 2. Check Available Free Capital
  const deployed = openPositions.reduce((a, p) => a + p.entryPrice * p.qty, 0);
  const totalCap = cfg.capital * (cfg.leverage || 1);
  const freeCapital = Math.max(0, totalCap - deployed);
  const minRequiredForLot = entry * inst.lotSize;

  if (source !== "FLASH_TEST" && freeCapital < minRequiredForLot) {
    return {
      ok: false,
      code: "CAPITAL_EXHAUSTED",
      reason: `PreFlight: Free capital ₹${r2(freeCapital)} is insufficient for 1 lot (${inst.lotSize} @ ₹${entry} = ₹${r2(minRequiredForLot)})`,
      details: { freeCapital: r2(freeCapital), minRequired: r2(minRequiredForLot), deployed: r2(deployed), totalCap },
    };
  }

  // 3. Mathematical Feasibility of Net Profit Hurdle vs ATR Target Distance
  const slDist = Math.max(inst.tick * 2, roundTick(atr * 1.5, inst.tick));
  const rrRatio = Math.max(3.0, Number(cfg.rewardRisk) || 3.0);
  const targetDist = Math.max(roundTick(slDist * 3.0, inst.tick), roundTick(slDist * rrRatio, inst.tick));
  const targetPrice = side === "BUY" ? entry + targetDist : entry - targetDist;

  const effectiveQty = requestedQty && requestedQty > 0
    ? Math.max(inst.lotSize, Math.floor(requestedQty / inst.lotSize) * inst.lotSize)
    : inst.lotSize;

  const grossExpected = r2(effectiveQty * targetDist);
  const netCalc = calculateNetPnL({
    grossPnL: grossExpected,
    broker,
    qty: effectiveQty,
    entry,
    exit: targetPrice,
    exchange: inst.exchange,
    kind: inst.kind,
    side,
  });

  const minBrokerFloor = broker === "shoonya" ? 25 : 55;
  const configuredHurdle = Number(cfg.hurdle) || minBrokerFloor;
  const hurdleTarget = Math.max(minBrokerFloor, configuredHurdle);
  const isMicroCapital = cfg.capital <= 2000;
  const effectiveHurdle = isMicroCapital ? -50 : hurdleTarget;

  if (source !== "FLASH_TEST" && (netCalc.netPnL <= 0 || netCalc.netPnL < effectiveHurdle)) {
    return {
      ok: false,
      code: "PREFLIGHT_LOW_YIELD",
      reason: `PreFlight: Expected net profit ₹${netCalc.netPnL} < hurdle ₹${effectiveHurdle} (ATR ${r2(atr)}, target dist ${r2(targetDist)}, gross ₹${grossExpected}, friction ₹${netCalc.totalCharges} incl. ₹${netCalc.charges.brokerage} brokerage)`,
      details: { grossExpected, netExpected: netCalc.netPnL, hurdleTarget: effectiveHurdle, charges: netCalc.charges, atr, targetDist },
    };
  }

  return {
    ok: true,
    details: {
      freeCapital: r2(freeCapital),
      effectiveQty,
      slDist,
      targetDist,
      grossExpected,
      netExpected: netCalc.netPnL,
      charges: netCalc.charges,
      effectiveHurdle,
    },
  };
}

export async function placeOrder(req: OrderRequest): Promise<OrderOutcome> {
  const execT0 = performance.now();
  const rawCfg = await getRisk();
  const isFlash = Boolean(req.flashTest || req.source === "FLASH_TEST");
  const cfg: RiskConfig = isFlash ? { ...rawCfg, tradingMode: "PAPER" } : rawCfg;
  const inst = await resolveInstrument(req.symbol);
  const strategy = req.strategy ?? (isFlash ? "FLASH_TEST" : req.source === "MANUAL" ? "MANUAL" : req.source === "WEBHOOK" ? "WEBHOOK" : "QUORUM");
  if (!inst) return { ok: false, status: "REJECTED", reason: `Unknown symbol ${req.symbol}`, execMs: Math.round(performance.now() - execT0) };

  const orderType = req.orderType === "LIMIT" ? "LIMIT" : "MARKET";
  // Smart Multi-Broker Routing: Route autonomous orders explicitly to Shoonya (Zero Brokerage)
  // Fallback: If Shoonya is unresponsive, gateway automatically hops to Angel One
  const preferredBroker: BrokerKey = req.broker ?? (req.source === "AUTO" ? "shoonya" : cfg.primaryBroker);
  const base = {
    symbol: inst.symbol,
    exchange: inst.exchange,
    orderType,
    mode: cfg.tradingMode,
    source: isFlash ? "FLASH_TEST" : req.source,
    strategy,
    brokerRequested: preferredBroker,
  };
  const reject = async (code: string, reason: string, extra: Record<string, unknown> = {}, side: string = req.side ?? "—") => {
    const id = await recordOrder({ ...base, side, status: `REJECTED_${code}`, reason, payload: extra });
    await audit("WARN", "ORDER_REJECT", `[${cfg.tradingMode}] ${inst.symbol} ${side} rejected [${code}] ${reason}`, { source: base.source, ...extra });
    return { ok: false, status: `REJECTED_${code}`, reason, orderId: id, execMs: Math.round(performance.now() - execT0), details: extra } as OrderOutcome;
  };

  // 0. CRITICAL SAFETY INTERLOCK (Phase 6.9): Reject live-order requests under every possible configuration
  const requestedMode = (req as Record<string, unknown>).mode ?? cfg.tradingMode;
  if (requestedMode === "LIVE" || cfg.tradingMode === "LIVE" || process.env.TRADING_MODE === "LIVE") {
    return reject(
      "LIVE_EXECUTION_BLOCKED",
      "CRITICAL SAFETY INTERLOCK: Live broker execution is permanently disabled by security mandate. All real-money orders are rejected."
    );
  }

  // 0a. Spot indices are reference feeds, not directly executable contracts
  if (inst.kind === "IDX") {
    return reject("INDEX_SPOT", `${inst.symbol} is a spot index — route orders via NIFTY / BANKNIFTY NFO futures`);
  }

  // 0b. Strict Real-Feed Gate (Zero fake prices in PAPER or LIVE mode)
  const snap = snapshot(inst, 200);
  if (!isLiveTickReady(inst) || snap.ltp === null || snap.ltp <= 0) {
    return reject(
      "NO_LIVE_FEED",
      `MARKET CLOSED / WS DISCONNECTED — No live SmartWebSocketV2 tick for ${inst.symbol}. Connect Angel One in Settings (11) during market hours.`,
      { feedSource: snap.source, statusLabel: snap.statusLabel },
    );
  }

  // 0c. Live token safety wall (defense-in-depth)
  if ((cfg.tradingMode as string) === "LIVE" && (!inst.resolved || inst.token === "PENDING_MASTER")) {
    return reject("UNRESOLVED_TOKEN", `${inst.symbol} derivative token is PENDING_MASTER — ingest Token Master before live execution`);
  }

  // 0d. Crash Asset Protection Lock: Halt new entries when WebSocket drops
  const crash = getCrashProtectionStatus();
  if (crash.active && !isFlash) {
    return reject(
      "CRASH_PROTECTION",
      `CRASH_PROTECTION_MODE active: ${crash.reason}. New entries halted and asset brackets locked.`,
    );
  }

  // 1. circuit breaker hard-lock
  const circuit = await checkCircuit(cfg);
  if (circuit.tripped) return reject("CIRCUIT_LOCK", `Circuit breaker active: ${circuit.reason}`);

  // 2. session gate
  const ss = sessionStatus();
  if (!isFlash && cfg.enforceSessions && !(inst.exchange === "MCX" ? ss.mcxOpen : ss.equityOpen)) {
    return reject("MARKET_CLOSED", `${inst.exchange} session is closed (IST ${ss.istTime})`);
  }

  // 3. duplicate exposure & max open positions cap (auto-clear prior FLASH_TEST probe on same symbol)
  let open = await db.select().from(positions).where(eq(positions.status, "OPEN"));
  if (isFlash) {
    for (const prev of open.filter((p) => p.symbol === inst.symbol && p.strategy === "FLASH_TEST")) {
      await closePosition(prev, snap.ltp, "FLASH_TEST_ROTATE");
    }
    open = await db.select().from(positions).where(eq(positions.status, "OPEN"));
  }
  if (open.some((p) => p.symbol === inst.symbol)) {
    return reject("DUPLICATE_POSITION", `Open position already exists in ${inst.symbol}`);
  }
  if (!isFlash && open.length >= cfg.maxOpenPositions) {
    return reject("MAX_POSITIONS", `Open positions (${open.length}) reached max cap (${cfg.maxOpenPositions})`);
  }

  // 4. consensus (quorum >= 75%, GBM >= 65%, regime gate)
  const extra = req.externalVote && req.side ? (req.side === "BUY" ? 1 : -1) : undefined;
  const cons = await analyse(inst, cfg, extra);
  let side = req.side;
  if (req.source === "MANUAL" || isFlash) {
    side = req.side ?? (cons.direction === "NONE" ? "BUY" : cons.direction);
    if (!side) return reject("NO_SIDE", "Manual order requires a side");
  } else {
    side = req.side ?? (cons.direction === "NONE" ? undefined : cons.direction);
    if (!side) return reject("NO_CONSENSUS", `No directional consensus (${cons.buyVotes}B / ${cons.sellVotes}S)`);
    if (cons.direction !== side) return reject("NO_CONSENSUS", `Quorum direction ${cons.direction} conflicts with ${side}`, { quorum: cons.quorumPct }, side);
    if (cons.quorumPct < cfg.quorumPct) return reject("QUORUM", `Quorum ${cons.quorumPct}% < ${cfg.quorumPct}%`, { regime: cons.regime.regime }, side);
    if (cons.gbm.forDirection < cfg.gbmMin) return reject("GBM_GATE", `GBM probability ${cons.gbm.forDirection}% < ${cfg.gbmMin}%`, {}, side);
  }

  // 4b. Dynamic Market Wave Detection Gate:
  // Pause trading during sideways consolidation / accumulation. Only fire when a high-momentum trend wave is detected.
  if (!isFlash && cons.waveGate && !cons.waveGate.active) {
    return reject(
      "CONSOLIDATION_PAUSED",
      `WAVE GATE PAUSED — ${cons.waveGate.reason}. Trading paused during sideways consolidation to prevent whipsaws.`,
      { waveGate: cons.waveGate, regime: cons.regime.regime },
      side,
    );
  }

  // 4c. Smart Recovery (The 200/800 Rule):
  // When in Recovery Watch Mode, only permit entry if ultra-consensus is achieved (Quorum >= 90%, GBM >= 85%)
  const recovery = await getRecoveryState();
  if (recovery.active && !isFlash) {
    const minQuorum = cfg.ultraQuorumMin ?? 90;
    const minGbm = cfg.ultraGbmMin ?? 85;
    if (cons.quorumPct < minQuorum || cons.gbm.forDirection < minGbm) {
      return reject(
        "RECOVERY_FILTER",
        `RECOVERY_WATCH_MODE active (Deficit ₹${recovery.deficit}). Quorum ${cons.quorumPct}% < ${minQuorum}% or GBM ${cons.gbm.forDirection}% < ${minGbm}%. Preserving ₹${recovery.remainingCapital} remaining capital.`,
        { recovery, quorum: cons.quorumPct, gbm: cons.gbm.forDirection },
        side,
      );
    }
  }

  // 4d. Pre-Execution Double-Check Engine (PreFlightCheck)
  const executionBroker: BrokerKey = preferredBroker === "shoonya" ? "shoonya" : cfg.primaryBroker;
  const liveLtp = snap.ltp;
  const entry = orderType === "LIMIT" && req.price && req.price > 0 ? req.price : liveLtp;

  const preflightRes = await preFlightCheck({
    inst,
    side,
    entry,
    atr: cons.atr,
    cfg,
    openPositions: open,
    broker: executionBroker,
    source: base.source,
    qty: req.qty,
  });
  if (!isFlash && !preflightRes.ok) {
    return reject(
      preflightRes.code || "PREFLIGHT_FAILED",
      preflightRes.reason || "PreFlight checks failed",
      preflightRes.details || {},
      side,
    );
  }

  // 5. Institutional Auto-Position Sizing (1% Risk Rule) + 20% Exposure Capping
  const gbmFor = side === "BUY" ? cons.gbm.up : cons.gbm.down;
  const conf = confidenceMultiplier(gbmFor / 100);
  const deployed = open.reduce((a, p) => a + p.entryPrice * p.qty, 0);
  const totalAvailableCap = recovery.active
    ? Math.min(cfg.capital * (cfg.leverage || 1), recovery.remainingCapital)
    : cfg.capital * (cfg.leverage || 1);
  const freeCapital = Math.max(0, totalAvailableCap - deployed);
  const size = sizePosition({ inst, side, entry, atr: cons.atr, conf, cfg, freeCapital });
  let qty = isFlash ? Math.max(1, req.qty ?? 1) : size.qty;
  if (!isFlash && req.qty && req.qty > 0) qty = Math.min(qty, Math.floor(req.qty / inst.lotSize) * inst.lotSize);
  if (qty <= 0) {
    return reject(
      "SIZE_ZERO",
      `Position size 0 (capital cap ${size.capitalCap}, ATR-risk cap ${size.riskCap}, lot ${inst.lotSize}) - free allocated capital ₹${r2(freeCapital)} cannot fund one ${inst.lotSize > 1 ? "lot" : "unit"} at ₹${entry}`,
      { size, conf, freeCapital: r2(freeCapital) },
      side,
    );
  }

  // 6. never exceed allocated capital across open positions
  const notional = entry * qty;
  if (!isFlash && deployed + notional > totalAvailableCap + 1e-6) {
    return reject("CAPITAL_EXHAUSTED", `Deployed ₹${r2(deployed)} + ₹${r2(notional)} exceeds allocated ₹${totalAvailableCap}`, { size }, side);
  }

  // 7. Dynamic Expected Net Profit Calculator (Shoonya ₹10 flat round-trip brokerage vs Angel One ₹40)
  const targetDist = Math.abs(size.targetPrice - entry);
  const netCalc = calculateNetPnL({
    grossPnL: r2(qty * targetDist),
    broker: executionBroker,
    qty,
    entry,
    exit: size.targetPrice,
    exchange: inst.exchange,
    kind: inst.kind,
    side,
  });
  const expectedGross = netCalc.grossPnL;
  const charges = netCalc.charges;
  const expectedNet = netCalc.netPnL;

  const isMicroCapital = cfg.capital <= 2000;
  // Lowered statutory hurdle: ₹25 specifically for Shoonya routed orders (₹10 brokerage + STT + Exch fees); ₹70 for Angel One
  const brokerHurdle = executionBroker === "shoonya" ? 25 : (cfg.hurdle && cfg.hurdle !== 25 ? cfg.hurdle : 70);
  const effectiveHurdle = isMicroCapital ? -50 : brokerHurdle;
  if (!isFlash && (expectedNet <= 0 || expectedNet < effectiveHurdle)) {
    await sendAlert(
      `HURDLE_${inst.symbol}`,
      `Insufficient Net Yield on ${inst.symbol} ${side}`,
      `<p>Expected net profit <b>₹${expectedNet}</b> &lt; hurdle ₹${effectiveHurdle} (qty ${qty}, entry ₹${entry}, 3R target ₹${size.targetPrice}, ${executionBroker.toUpperCase()} friction ₹${charges.total} incl. ₹${charges.brokerage} brokerage).</p>`,
    );
    return reject(
      "LOW_YIELD",
      `Expected net yield ₹${expectedNet} < ₹${effectiveHurdle} hurdle (Gross ₹${expectedGross}, ${executionBroker.toUpperCase()} friction ₹${charges.total} incl. ₹${charges.brokerage} brokerage)`,
      { expectedGross, expectedNet, charges, size, hurdle: effectiveHurdle },
      side,
    );
  }

  // 8a. Resting PAPER LIMIT order (if live LTP has not reached limit price yet)
  const isMarketable = orderType === "MARKET" || (side === "BUY" ? liveLtp <= entry : liveLtp >= entry);
  if (cfg.tradingMode === "PAPER" && orderType === "LIMIT" && !isMarketable) {
    const orderId = await recordOrder({
      ...base,
      side,
      qty,
      price: entry,
      status: "OPEN",
      mode: "PAPER",
      slPrice: size.slPrice,
      targetPrice: size.targetPrice,
      expectedNet,
      reason: `Working LIMIT ${side} @ ₹${entry} (current live LTP ₹${liveLtp})`,
      payload: { size, regime: cons.regime.regime },
    });
    g.__omniPendingSymbols ??= new Set();
    g.__omniPendingSymbols.add(inst.symbol);
    await audit("INFO", "ORDER", `[PAPER] Working LIMIT order #${orderId} queued: ${inst.symbol} ${side} ${qty} @ ₹${entry}`);
    return {
      ok: true,
      status: "OPEN",
      orderId,
      execMs: Math.round(performance.now() - execT0),
      details: { qty, entry, size, expectedNet, charges, mode: "PAPER" },
    };
  }

  // 8b. Route through the 3-broker failover gateway (fill price for PAPER is actual live tick LTP)
  const fillPrice = orderType === "MARKET" ? liveLtp : isMarketable && cfg.tradingMode === "PAPER" ? liveLtp : entry;
  const tag = isFlash ? `FLS${Date.now().toString(36)}` : `OTP${Date.now().toString(36)}`;
  const route = await routeOrder(
    { inst, side, qty, price: fillPrice, orderType, tag, slPrice: size.slPrice, targetPrice: size.targetPrice },
    cfg,
    preferredBroker,
  );
  if (!route.ok || !route.result || !route.used) {
    return reject("ROUTING_FAILED", `All brokers failed (${route.attempts.map((a) => `${a.broker}: ${a.error}`).join(" | ")})`, { attempts: route.attempts }, side);
  }
  const latency = route.attempts.reduce((a, x) => a + x.ms, 0);
  const liveResting = (cfg.tradingMode as string) === "LIVE" && orderType === "LIMIT" && !isMarketable;
  const orderId = await recordOrder({
    ...base,
    side,
    qty,
    price: fillPrice,
    status: liveResting ? "OPEN" : "FILLED",
    mode: route.result.mode,
    brokerRequested: route.requested,
    brokerUsed: route.used,
    failover: route.failover,
    latencyMs: latency,
    slPrice: size.slPrice,
    targetPrice: size.targetPrice,
    expectedNet,
    reason: isFlash
      ? `Flash Test Order filled @ ₹${fillPrice} (${route.result.mode})`
      : route.failover
        ? `Failover ${route.requested} -> ${route.used} in ${route.failoverMs}ms`
        : `Routed on ${route.used} (${route.result.mode})`,
    payload: { brokerPayload: route.result.payload, brokerOrderId: route.result.orderId, attempts: route.attempts, size, regime: cons.regime.regime },
  });

  if (liveResting) {
    await audit("INFO", "ORDER", `[LIVE] Limit order #${orderId} placed at ${route.used.toUpperCase()} (${route.result.orderId}) @ ₹${fillPrice}`);
    return {
      ok: true,
      status: "OPEN",
      orderId,
      execMs: Math.round(performance.now() - execT0),
      details: { qty, entry: fillPrice, size, expectedNet, charges, broker: route.used, brokerOrderId: route.result.orderId, mode: route.result.mode },
    };
  }

  const [pos] = await db
    .insert(positions)
    .values({
      orderId,
      symbol: inst.symbol,
      exchange: inst.exchange,
      side,
      qty,
      entryPrice: fillPrice,
      slPrice: size.slPrice,
      targetPrice: size.targetPrice,
      initialSlDistance: size.slDistance,
      strategy,
      broker: route.used,
      mode: route.result.mode,
    })
    .returning({ id: positions.id });
  if (pos) {
    g.__omniInitialSlDist ??= new Map();
    g.__omniInitialSlDist.set(pos.id, size.slDistance);
  }
  g.__omniOpenSymbols ??= new Set();
  g.__omniOpenSymbols.add(inst.symbol);

  const execMs = Math.round(performance.now() - execT0);
  await audit("INFO", "ORDER", `[${route.result.mode}] ${inst.symbol} ${side} ${qty} @ ₹${fillPrice} via ${route.used.toUpperCase()} (${route.result.orderId}) SL ₹${size.slPrice} TGT ₹${size.targetPrice} [${execMs}ms]`, {
    orderId, brokerOrderId: route.result.orderId, expectedNet, regime: cons.regime.regime, quorum: cons.quorumPct, gbm: gbmFor, failover: route.failover, mode: route.result.mode, execMs,
  });
  return {
    ok: true,
    status: "FILLED",
    orderId,
    positionId: pos.id,
    execMs,
    details: { qty, entry: fillPrice, size, expectedNet, charges, broker: route.used, brokerOrderId: route.result.orderId, mode: route.result.mode, failover: route.failover, regime: cons.regime.regime, execMs },
  };
}

/** Pre-flight: runs sizing / SL / hurdle math using only genuine exchange price (requires live/historical feed). */
export async function preflight(symbol: string, side: "BUY" | "SELL") {
  const cfg = await getRisk();
  const inst = await resolveInstrument(symbol);
  if (!inst) return { ok: false, error: `Unknown symbol ${symbol}` };
  const snap = snapshot(inst, 200);
  if (snap.ltp === null || snap.ltp <= 0) {
    return { ok: false, error: `MARKET CLOSED / WS DISCONNECTED — No genuine Angel One price available for ${symbol}. Connect Angel One in Settings (11) first.` };
  }
  const cons = await analyse(inst, cfg);
  const entry = snap.ltp;
  const gbmFor = side === "BUY" ? cons.gbm.up : cons.gbm.down;
  const conf = confidenceMultiplier(gbmFor / 100);
  const size = sizePosition({ inst, side, entry, atr: cons.atr, conf, cfg });
  const testQty = size.qty > 0 ? size.qty : inst.lotSize;
  const brokers = (["angel", "shoonya", "groww"] as BrokerKey[]).map((b) => {
    const charges: Charges = roundTripCharges({
      exchange: inst.exchange,
      kind: inst.kind,
      broker: b,
      qty: testQty,
      entry,
      exit: size.targetPrice,
      side,
      entrySlippageBps: cfg.entrySlippageBps ?? 8.0,
      exitSlippageBps: cfg.exitSlippageBps ?? (cfg.entrySlippageBps ?? 8.0),
    });
    return {
      broker: b,
      payload: buildBrokerPayload(b, { inst, side, qty: testQty, price: entry, orderType: "MARKET", tag: "PREFLIGHT" }),
      charges,
      expectedNet: r2(testQty * Math.abs(size.targetPrice - entry) - charges.total),
    };
  });
  const result = {
    ok: true,
    symbol: inst.symbol,
    exchange: inst.exchange,
    token: inst.token,
    tradingSymbol: inst.tradingSymbol,
    tokenResolved: inst.resolved,
    side,
    entry,
    atr: cons.atr,
    conf,
    size,
    sizedQty: size.qty,
    testQty,
    riskAtStop: r2(testQty * size.slDistance),
    maxSL: cfg.maxSL,
    slWithinBudget: r2(testQty * size.slDistance) <= cfg.maxSL || size.qty === 0,
    hurdle: cfg.hurdle,
    regime: cons.regime.regime,
    brokers,
    chain: [cfg.primaryBroker, cfg.secondaryBroker, cfg.tertiaryBroker],
    note: size.qty === 0 ? "Sizing returned 0 under current capital; routing parameters shown for 1 lot/unit." : "Sizing within allocated capital.",
  };
  await recordOrder({
    symbol: inst.symbol, exchange: inst.exchange, side, qty: testQty, price: entry, status: "PREFLIGHT_OK", source: "PREFLIGHT", strategy: "PREFLIGHT",
    slPrice: size.slPrice, targetPrice: size.targetPrice, reason: "3-broker routing parameter verification (real feed)", payload: result,
  });
  await audit("INFO", "PREFLIGHT", `Pre-flight ${inst.symbol} ${side}: 3 broker payloads built @ ₹${entry}, SL ₹${size.slPrice}, risk ₹${result.riskAtStop}/₹${cfg.maxSL}`);
  return result;
}

/** Autonomous scan: only scans tradable instruments with genuine live ticks and >=30 real candles. */
export async function scanAndTrade() {
  const cfg = await getRisk();
  if ((await getCircuit()).tripped) return { scanned: 0, fired: 0, results: [] as { symbol: string; status: string }[] };

  // Crash Asset Protection: If WebSocket is disconnected, halt scan-and-trade immediately
  const crash = getCrashProtectionStatus();
  if (crash.active) {
    return { scanned: 0, fired: 0, results: [] as { symbol: string; status: string }[] };
  }

  const recovery = await getRecoveryState();
  const results: { symbol: string; status: string }[] = [];
  let scanned = 0;
  for (const inst of await resolveAll()) {
    if (inst.kind === "IDX" || !isLiveTickReady(inst)) continue;
    scanned++;
    const cons = await analyse(inst, cfg);
    // Dynamic Wave Gate: Autonomously pause trading during sideways consolidation; unlock on high-momentum wave
    if (!cons.qualifies || cons.direction === "NONE" || !cons.waveGate?.active) continue;

    // Pillar 5: Smart Recovery (The 200/800 Rule)
    // If in Recovery Watch Mode, only permit execution if ultra-consensus criteria are satisfied:
    // Quorum >= 90% (ultraQuorumMin) AND GBM >= 85% (ultraGbmMin)
    if (recovery.active) {
      const minQuorum = cfg.ultraQuorumMin ?? 90;
      const minGbm = cfg.ultraGbmMin ?? 85;
      if (cons.quorumPct < minQuorum || cons.gbm.forDirection < minGbm) {
        continue;
      }
    }

    // Smart Multi-Broker Routing: Route auto orders explicitly to Shoonya (Zero Brokerage) with Angel One failover
    const r = await placeOrder({ symbol: inst.symbol, side: cons.direction, source: "AUTO", broker: "shoonya" });
    results.push({ symbol: inst.symbol, status: r.status });
  }
  return { scanned, fired: results.filter((r) => r.status === "FILLED").length, results };
}

/* ------------------------------ state ------------------------------------ */

export async function getState() {
  await enforceDailyReset();
  await checkBrackets();
  const cfg = await getRisk();
  await checkCircuit(cfg);
  const startOfToday = istDayStartDate();
  const [circuit, pnl, open, brokers, vault, logs, tm, recovery] = await Promise.all([
    getCircuit(),
    dailyPnl(),
    openPositionsLive(),
    getBrokerStatuses(),
    vaultSummary(),
    recentAudit(80),
    getSetting<{ at: string; rows: number; source: string } | null>("tokenMaster", null),
    getRecoveryState(),
  ]);
  const crashProtection = getCrashProtectionStatus();
  // Pillar 1: Zero Stale Data & Strict Daily Wipe - strictly fetch today's orders & trades
  const orderRows = await db
    .select()
    .from(orders)
    .where(gte(orders.ts, startOfToday))
    .orderBy(desc(orders.id))
    .limit(80);
  const tradeRows = await db
    .select()
    .from(positions)
    .where(and(eq(positions.status, "CLOSED"), gte(positions.closedAt, startOfToday)))
    .orderBy(desc(positions.closedAt))
    .limit(80);
  const failures = await getSetting<Record<string, number>>("brokerFailures", {});
  return {
    now: Date.now(),
    risk: cfg,
    circuit: { ...circuit, recoveryMode: recovery.active },
    recovery,
    crashProtection,
    pnl,
    session: sessionStatus(),
    positions: open,
    orders: orderRows,
    trades: tradeRows,
    brokers,
    failures,
    vault: { summary: vault, fallbackKey: vaultUsingFallbackKey() },
    audit: logs,
    tokenMaster: tm,
    ws: getWsStatus(),
    feed: marketFeedMode(),
    feedStatus: marketStatusText(),
    autoTrader: getAutoTraderStatus(),
  };
}
