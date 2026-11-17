import type { Exchange, InstrumentKind } from "./instruments";
import { loadRateSpec, type BrokerSpec, type RateEntry, type SegmentSpec } from "./rateSpec";

export type BrokerId = "angel" | "shoonya" | "groww";

export type ChargeBasis = "FULL_ROUND_TRIP" | "MINIMUM_FLOOR_ESTIMATE";

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
  /** Phase 2 (TAX-002): FULL_ROUND_TRIP = computed from the authoritative rate spec;
   *  MINIMUM_FLOOR_ESTIMATE = total-only broker minimum-deduction estimate whose
   *  component heads are NOT computed (all zero) and must not be presented as facts. */
  basis: ChargeBasis;
  /** Version of config/statutory_rates.json used (all rates UNVERIFIED until dated evidence exists). */
  rateSpecVersion: string;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Raised when a product type / segment has no evidenced rate table (must fail closed). */
export class UnsupportedSegmentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "UnsupportedSegmentError";
  }
}

type Rates = { stt: number; sttSide: "sell" | "both"; sttLabel: "STT" | "CTT"; exch: number; stamp: number };

function brokerSpec(broker: BrokerId | string): BrokerSpec {
  const spec = loadRateSpec();
  const b = spec.brokers[String(broker).toLowerCase()];
  if (!b) throw new UnsupportedSegmentError(`Unknown broker '${broker}' in rate spec`);
  return b;
}

/**
 * Resolve the authoritative segment row for (exchange, kind, productType).
 * Phase 2 (TAX-001): unsupported combinations (delivery/CNC, currency derivatives,
 * unknown pairs) now fail closed with a clear error instead of silently inheriting
 * NSE equity intraday rates.
 */
function segmentFor(exchange: Exchange, kind: InstrumentKind, productType: string): { key: string; seg: SegmentSpec } {
  const spec = loadRateSpec();
  const pt = (productType || "INTRADAY").toUpperCase();
  if (pt === "DELIVERY" || pt === "CNC") {
    const seg = spec.segments["NSE_EQ_DELIVERY"];
    throw new UnsupportedSegmentError(
      `Delivery/CNC statutory costing is UNSUPPORTED (status ${seg?.status ?? "UNSUPPORTED_NO_EVIDENCE"}): no locally-supplied official delivery-rate evidence (delivery STT both sides, delivery stamp duty, DP charges). Refusing to compute with intraday rates (Phase 1 defect TAX-001).`,
    );
  }
  const key =
    exchange === "MCX"
      ? "MCX_ANY"
      : exchange === "NFO" && kind === "OPT"
        ? "NSE_OPT"
        : exchange === "NFO" && kind === "FUT"
          ? "NSE_FUT"
          : exchange === "NSE" && (kind === "EQ" || kind === "IDX")
            ? "NSE_EQ_INTRADAY"
            : null;
  if (!key) {
    throw new UnsupportedSegmentError(`No evidenced rate table for exchange=${exchange} kind=${kind} (fail closed).`);
  }
  const seg = spec.segments[key];
  if (!seg || !seg.supported) {
    throw new UnsupportedSegmentError(`Segment ${key} is UNSUPPORTED (status ${seg?.status ?? "UNKNOWN"}) — fail closed.`);
  }
  return { key, seg };
}

function ratesFor(exchange: Exchange, kind: InstrumentKind, productType = "INTRADAY"): Rates {
  const { seg } = segmentFor(exchange, kind, productType);
  const stt: RateEntry = seg.stt as RateEntry;
  const exch: RateEntry = seg.exchangeTxn as RateEntry;
  const stamp: RateEntry = seg.stampDuty as RateEntry;
  return {
    stt: stt.rate,
    sttSide: stt.side === "both" ? "both" : "sell",
    sttLabel: stt.label === "CTT" ? "CTT" : "STT",
    exch: exch.rate,
    stamp: stamp.rate,
  };
}

/**
 * Brokerage per executed order leg by broker (authoritative spec).
 * Shoonya: flat ₹5 per executed order leg (₹10 round trip); equity delivery ₹0.
 * Angel One & Groww: lower of ₹20 or 0.1% per leg — with the implemented ₹40
 * round-trip floor applied in roundTripCharges (spec note: TAX-004).
 */
export function brokerageFor(
  broker: BrokerId,
  turnover: number,
  productType: "INTRADAY" | "DELIVERY" | "MIS" | "CNC" = "INTRADAY",
): number {
  const b = brokerSpec(broker);
  const pt = (productType || "INTRADAY").toUpperCase();
  if (pt === "DELIVERY" || pt === "CNC") {
    return b.deliveryPerLeg ?? 0;
  }
  if (b.brokerageModel === "FLAT_PER_LEG") {
    return b.intradayPerLeg ?? 0;
  }
  // MIN_PER_LEG_WITH_RT_FLOOR: min(cap, rate × turnover) per leg.
  const cap = b.perLegCap ?? 20;
  const rate = b.perLegRate ?? 0.001;
  return Math.min(cap, turnover * rate);
}

/**
 * Real-time round-trip statutory cost calculator (intraday / MIS).
 * All rates come from config/statutory_rates.json (single authoritative spec shared
 * with the Python engine — see risk/statutory_cost.py). Statutory totals:
 * STT/CTT, exchange turnover, SEBI turnover fee (₹10 / crore), stamp duty (buy side),
 * 18% GST on (brokerage + exchange + SEBI), and explicit two-sided slippage accounting.
 *
 * Phase 2 changes: unsupported product types/segments fail closed (TAX-001);
 * component fabrication removed from the estimate path (TAX-002); rate values
 * unchanged from Phase 1 (no silent financial changes).
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
  const spec = loadRateSpec();
  const b = brokerSpec(broker);
  const rates = ratesFor(exchange, kind, productType); // throws for unsupported segments

  const entryVal = qty * entry;
  const exitVal = qty * exit;
  const buyVal = side === "BUY" ? entryVal : exitVal;
  const sellVal = side === "BUY" ? exitVal : entryVal;
  const turnover = buyVal + sellVal;

  let brokerage = brokerageFor(broker, entryVal, productType) + brokerageFor(broker, exitVal, productType);
  brokerage = Math.max(b.roundTripBrokerageFloor, brokerage);

  const stt = (rates.sttSide === "both" ? turnover : sellVal) * rates.stt;
  const exchangeFees = turnover * rates.exch;
  const sebi = turnover * spec.sebiTurnoverFee.ratePerRupee;
  const stamp = buyVal * rates.stamp;
  const gst = (brokerage + exchangeFees + sebi) * spec.gst.rate;

  // Two-sided explicit slippage enforcement (spec defaults: entry 8.0 bps; exit mirrors entry).
  const resolvedEntryBps = entrySlippageBps !== undefined ? entrySlippageBps : spec.slippageDefaults.entryBps;
  const resolvedExitBps = exitSlippageBps !== undefined ? exitSlippageBps : resolvedEntryBps;
  const entrySlipRate = resolvedEntryBps / 10000;
  const exitSlipRate = resolvedExitBps / 10000;

  const entrySlippage = entryVal * entrySlipRate;
  const exitSlippage = exitVal * exitSlipRate;
  const totalSlippage = entrySlippage + exitSlippage;

  let total = brokerage + stt + exchangeFees + sebi + stamp + gst + totalSlippage;

  // Modeled minimum-round-trip-deduction floors (spec, status UNVERIFIED — unchanged from Phase 1).
  total = Math.max(b.minimumRoundTripDeduction, total);

  return {
    brokerage: r2(brokerage),
    stt: r2(stt),
    sttLabel: rates.sttLabel,
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
    basis: "FULL_ROUND_TRIP",
    rateSpecVersion: spec.specVersion,
  };
}

/**
 * Net P&L calculator.
 * With full trade parameters: exact statutory round trip from the authoritative spec.
 * Without them: MINIMUM_FLOOR_ESTIMATE only — the broker's modeled minimum deduction
 * as the total, with ZEROED component heads (Phase 2 TAX-002 removes the Phase 1
 * fabricated component breakdown). Never present estimate components as computed facts.
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
  productType?: "INTRADAY" | "DELIVERY" | "MIS" | "CNC";
  entrySlippageBps?: number;
  exitSlippageBps?: number;
}): { grossPnL: number; netPnL: number; charges: Charges; totalCharges: number } {
  const spec = loadRateSpec();
  const bKey = String(args.broker || "shoonya").toLowerCase() as BrokerId;
  const b = brokerSpec(bKey);
  const gross = r2(args.grossPnL);

  let charges: Charges;
  if (args.qty && args.entry && args.exit && args.exchange && args.kind) {
    charges = roundTripCharges({
      exchange: args.exchange,
      kind: args.kind,
      broker: bKey,
      qty: args.qty,
      entry: args.entry,
      exit: args.exit,
      side: args.side || "BUY",
      productType: args.productType,
      entrySlippageBps: args.entrySlippageBps,
      exitSlippageBps: args.exitSlippageBps,
    });
  } else {
    // MINIMUM_FLOOR_ESTIMATE: total-only. Component heads are zero because they are
    // NOT derivable without trade parameters (TAX-002: no fabricated breakdown).
    const floor = b.minimumRoundTripDeduction;
    charges = {
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
      total: r2(floor),
      basis: "MINIMUM_FLOOR_ESTIMATE",
      rateSpecVersion: spec.specVersion,
    };
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
  const spec = loadRateSpec();
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
    basis: "FULL_ROUND_TRIP",
    rateSpecVersion: spec.specVersion,
  };
  let sawEstimate = false;
  for (const c of list) {
    if (!c) continue;
    if (c.basis === "MINIMUM_FLOOR_ESTIMATE") sawEstimate = true;
    base.brokerage += c.brokerage;
    base.stt += c.stt;
    base.exchangeFees += c.exchangeFees;
    base.sebi += c.sebi;
    base.stamp += c.stamp;
    base.gst += c.gst;
    base.entrySlippage += c.entrySlippage || 0;
    base.exitSlippage += c.exitSlippage || 0;
    base.slippage += c.slippage;
    base.entryTurnover += c.entryTurnover || 0;
    base.exitTurnover += c.exitTurnover || 0;
    base.totalTurnover += c.totalTurnover || 0;
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
  base.basis = sawEstimate ? "MINIMUM_FLOOR_ESTIMATE" : "FULL_ROUND_TRIP";
  return base;
}
