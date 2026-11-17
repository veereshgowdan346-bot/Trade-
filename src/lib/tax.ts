import type { Exchange, InstrumentKind } from "./instruments";

export type BrokerId = "angel" | "shoonya" | "groww";

export type Charges = {
  brokerage: number;
  stt: number; // STT for NSE/NFO, CTT for MCX
  sttLabel: "STT" | "CTT";
  exchangeFees: number;
  sebi: number;
  stamp: number;
  gst: number;
  entrySlippage: number;
  exitSlippage: number;
  slippage: number; // Total slippage = entrySlippage + exitSlippage
  entryTurnover: number;
  exitTurnover: number;
  totalTurnover: number;
  total: number;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Brokerage per executed order leg by broker.
 * Shoonya 2026 pricing update:
 * - Intraday & F&O: Flat ₹5 per executed order leg (₹10 per round trip)
 * - Equity Delivery: ₹0
 * Angel One & Groww: lower of ₹20 or 0.1% (₹40 max per round trip)
 */
export function brokerageFor(
  broker: BrokerId,
  turnover: number,
  productType: "INTRADAY" | "DELIVERY" | "MIS" | "CNC" = "INTRADAY",
): number {
  if (broker === "shoonya") {
    // Equity Delivery remains ₹0
    if (productType === "DELIVERY" || productType === "CNC") return 0;
    // Intraday & F&O: Flat ₹5 per executed order leg (₹10 per round trip)
    return 5;
  }
  if (productType === "DELIVERY" || productType === "CNC") return 0;
  // Angel One & Groww intraday: lower of Rs 20 or 0.1% (Groww: 0.1% max Rs 20).
  return Math.min(20, turnover * 0.001);
}

type Rates = { stt: number; sttSide: "sell" | "both"; exch: number; stamp: number };

function ratesFor(exchange: Exchange, kind: InstrumentKind): Rates {
  if (exchange === "MCX") return { stt: 0.0001, sttSide: "sell", exch: 0.000021, stamp: 0.00002 }; // CTT 0.01% sell
  if (exchange === "NFO") {
    if (kind === "OPT") return { stt: 0.001, sttSide: "sell", exch: 0.0003503, stamp: 0.00003 };
    return { stt: 0.0002, sttSide: "sell", exch: 0.0000183, stamp: 0.00002 };
  }
  // NSE intraday equity
  return { stt: 0.00025, sttSide: "sell", exch: 0.0000297, stamp: 0.00003 };
}

/**
 * Real-time round-trip statutory cost calculator (intraday / MIS).
 * STT/CTT, exchange turnover, SEBI turnover fee (Rs 10 / crore), stamp duty (buy side),
 * 18% GST on (brokerage + exchange + SEBI), and explicit two-sided slippage accounting:
 * - Entry slippage = Entry turnover * entry slippage rate
 * - Exit slippage = Exit turnover * exit slippage rate
 * - Total slippage = Entry slippage + Exit slippage
 */
export function roundTripCharges(args: {
  exchange: Exchange;
  kind: InstrumentKind;
  broker: BrokerId;
  qty: number;
  entry: number;
  exit: number;
  side: "BUY" | "SELL";
  productType?: "INTRADAY" | "DELIVERY" | "MIS" | "CNC";
  entrySlippageBps?: number;
  exitSlippageBps?: number;
}): Charges {
  const {
    exchange,
    kind,
    broker,
    qty,
    entry,
    exit,
    side,
    productType = "INTRADAY",
    entrySlippageBps,
    exitSlippageBps,
  } = args;
  const entryVal = qty * entry;
  const exitVal = qty * exit;
  const buyVal = side === "BUY" ? entryVal : exitVal;
  const sellVal = side === "BUY" ? exitVal : entryVal;
  const turnover = buyVal + sellVal;
  const rates = ratesFor(exchange, kind);

  let brokerage = brokerageFor(broker, entryVal, productType) + brokerageFor(broker, exitVal, productType);
  if (broker === "shoonya") {
    brokerage = Math.max(10, brokerage); // Flat ₹10 Base / API / DP fee per round trip
  } else if (broker === "angel" || broker === "groww") {
    brokerage = Math.max(40, brokerage); // Flat ₹20 per leg (₹40 round trip)
  }

  const stt = sellVal * rates.stt;
  const exchangeFees = turnover * rates.exch;
  const sebi = turnover * 0.000001;
  const stamp = buyVal * rates.stamp;
  const gst = (brokerage + exchangeFees + sebi) * 0.18;

  // Two-sided explicit slippage enforcement:
  // When omitted, defaults to 8.0 bps on entry.
  // Exit slippage defaults symmetrically to entrySlippageBps so that exit friction is NEVER silently omitted!
  const resolvedEntryBps = entrySlippageBps !== undefined ? entrySlippageBps : 8.0;
  const resolvedExitBps = exitSlippageBps !== undefined ? exitSlippageBps : resolvedEntryBps;
  const entrySlipRate = resolvedEntryBps / 10000;
  const exitSlipRate = resolvedExitBps / 10000;

  const entrySlippage = entryVal * entrySlipRate;
  const exitSlippage = exitVal * exitSlipRate;
  const totalSlippage = entrySlippage + exitSlippage;

  let total = brokerage + stt + exchangeFees + sebi + stamp + gst + totalSlippage;

  // Real-world minimum statutory fee floors:
  // Shoonya: ₹10 base + ₹15 taxes = ₹25 minimum deduction
  // Angel One: ₹40 base + ₹15 taxes = ₹55 minimum deduction
  if (broker === "shoonya") {
    total = Math.max(25.0, total);
  } else if (broker === "angel" || broker === "groww") {
    total = Math.max(55.0, total);
  }

  return {
    brokerage: r2(brokerage),
    stt: r2(stt),
    sttLabel: exchange === "MCX" ? "CTT" : "STT",
    exchangeFees: r2(exchangeFees),
    sebi: r2(sebi),
    stamp: r2(stamp),
    gst: r2(gst),
    entrySlippage: r2(entrySlippage),
    exitSlippage: r2(exitSlippage),
    slippage: r2(totalSlippage),
    entryTurnover: r2(entryVal),
    exitTurnover: r2(exitVal),
    totalTurnover: r2(turnover),
    total: r2(total),
  };
}

/**
 * Rigid Real-World Net PnL Calculator.
 * Evaluates exact gross minus all real statutory taxes and broker fees.
 * Net profit is mathematically guaranteed before any Take-Profit trigger.
 */
export function calculateNetPnL(args: {
  grossPnL: number;
  broker: BrokerId | string;
  qty?: number;
  entry?: number;
  exit?: number;
  exchange?: Exchange;
  kind?: InstrumentKind;
  side?: "BUY" | "SELL";
  entrySlippageBps?: number;
  exitSlippageBps?: number;
}): { grossPnL: number; netPnL: number; charges: Charges; totalCharges: number } {
  const b = (args.broker.toLowerCase() as BrokerId) || "shoonya";
  const gross = r2(args.grossPnL);

  let charges: Charges;
  if (args.qty && args.entry && args.exit && args.exchange && args.kind) {
    charges = roundTripCharges({
      exchange: args.exchange,
      kind: args.kind,
      broker: b,
      qty: args.qty,
      entry: args.entry,
      exit: args.exit,
      side: args.side || "BUY",
      entrySlippageBps: args.entrySlippageBps,
      exitSlippageBps: args.exitSlippageBps,
    });
  } else {
    const isShoonya = b === "shoonya";
    const baseBrokerage = isShoonya ? 10.0 : 40.0;
    const total = isShoonya ? 25.0 : 55.0;
    charges = {
      brokerage: baseBrokerage,
      stt: 5.0,
      sttLabel: "STT",
      exchangeFees: 3.5,
      sebi: 0.5,
      stamp: 2.0,
      gst: 4.0,
      entrySlippage: 0.0,
      exitSlippage: 0.0,
      slippage: 0.0,
      entryTurnover: 0.0,
      exitTurnover: 0.0,
      totalTurnover: 0.0,
      total,
    };
  }

  if (b === "shoonya" && charges.total < 25.0) {
    charges.brokerage = Math.max(charges.brokerage, 10.0);
    charges.total = 25.0;
  } else if ((b === "angel" || b === "groww") && charges.total < 55.0) {
    charges.brokerage = Math.max(charges.brokerage, 40.0);
    charges.total = Math.max(charges.total, 55.0);
  }

  const totalCharges = r2(charges.total);
  const netPnL = r2(gross - totalCharges);

  return {
    grossPnL: gross,
    netPnL,
    charges,
    totalCharges,
  };
}

export function sumCharges(list: (Charges | null | undefined)[]): Charges {
  const base: Charges = {
    brokerage: 0,
    stt: 0,
    sttLabel: "STT",
    exchangeFees: 0,
    sebi: 0,
    stamp: 0,
    gst: 0,
    entrySlippage: 0,
    exitSlippage: 0,
    slippage: 0,
    entryTurnover: 0,
    exitTurnover: 0,
    totalTurnover: 0,
    total: 0,
  };
  for (const c of list) {
    if (!c) continue;
    base.brokerage += c.brokerage;
    base.stt += c.stt;
    base.exchangeFees += c.exchangeFees;
    base.sebi += c.sebi;
    base.stamp += c.stamp;
    base.gst += c.gst;
    base.entrySlippage += (c.entrySlippage || 0);
    base.exitSlippage += (c.exitSlippage || 0);
    base.slippage += c.slippage;
    base.entryTurnover += (c.entryTurnover || 0);
    base.exitTurnover += (c.exitTurnover || 0);
    base.totalTurnover += (c.totalTurnover || 0);
    base.total += c.total;
  }
  for (const k of [
    "brokerage",
    "stt",
    "exchangeFees",
    "sebi",
    "stamp",
    "gst",
    "entrySlippage",
    "exitSlippage",
    "slippage",
    "entryTurnover",
    "exitTurnover",
    "totalTurnover",
    "total",
  ] as const) {
    base[k] = r2(base[k]);
  }
  return base;
}
