export type Exchange = "NSE" | "NFO" | "MCX";
export type InstrumentKind = "EQ" | "FUT" | "OPT" | "IDX";
export type BrokerKey = "angel" | "shoonya" | "groww";

export type Instrument = {
  symbol: string; // human ticker (NIFTY, RELIANCE, CRUDEOIL, GOLD ...)
  name: string;
  exchange: Exchange;
  kind: InstrumentKind;
  token: string; // exchange token (NSE cash/index tokens are static; derivatives resolve from the daily master)
  legacyToken?: string; // optional legacy Angel token alias (e.g. 26000 / 26009)
  tradingSymbol: string;
  lotSize: number; // minimum tradable quantity step
  tick: number;
  basePrice: number; // nominal reference (never used for fake pricing)
  vol: number;
  resolved: boolean;
};

const idx = (symbol: string, name: string, token: string, legacyToken: string, tradingSymbol: string, basePrice: number): Instrument => ({
  symbol,
  name,
  exchange: "NSE",
  kind: "IDX",
  token,
  legacyToken,
  tradingSymbol,
  lotSize: 1,
  tick: 0.05,
  basePrice,
  vol: 0.0004,
  resolved: true,
});

const eq = (symbol: string, name: string, token: string, basePrice: number, vol = 0.0006): Instrument => ({
  symbol,
  name,
  exchange: "NSE",
  kind: "EQ",
  token,
  tradingSymbol: `${symbol}-EQ`,
  lotSize: 1,
  tick: 0.05,
  basePrice,
  vol,
  resolved: true,
});

const fut = (
  symbol: string,
  name: string,
  exchange: "NFO" | "MCX",
  lotSize: number,
  basePrice: number,
  vol: number,
  tick: number,
): Instrument => ({
  symbol,
  name,
  exchange,
  kind: "FUT",
  token: "PENDING_MASTER",
  tradingSymbol: `${symbol}FUT`,
  lotSize,
  tick,
  basePrice,
  vol,
  resolved: false,
});

/**
 * Core tracked watchlist: NSE Spot Indices, Liquid NSE Equities, NFO Index Futures, and MCX Commodities.
 * Daily scrip ingestion (tokenMaster) overlays live NFO / MCX nearest-expiry contract tokens.
 */
export const INSTRUMENTS: Instrument[] = [
  idx("NIFTY50", "NIFTY 50 Index", "99926000", "26000", "Nifty 50", 24500),
  idx("BANKNIFTY50", "BANK NIFTY Index", "99926009", "26009", "Nifty Bank", 53000),
  eq("SBIN", "State Bank of India", "3045", 820, 0.0007),
  eq("RELIANCE", "Reliance Industries", "2885", 1400),
  eq("HDFCBANK", "HDFC Bank", "1333", 950),
  eq("TCS", "Tata Consultancy", "11536", 3200, 0.0005),
  eq("INFY", "Infosys", "1594", 1500),
  fut("NIFTY", "Nifty 50 Futures", "NFO", 75, 24500, 0.00035, 0.05),
  fut("BANKNIFTY", "Bank Nifty Futures", "NFO", 30, 53000, 0.0005, 0.05),
  fut("GOLD", "Gold Futures (1 kg)", "MCX", 1, 80000, 0.0004, 1),
  fut("SILVER", "Silver Futures (30 kg)", "MCX", 1, 95000, 0.0007, 1),
  fut("CRUDEOIL", "Crude Oil (per bbl)", "MCX", 100, 5500, 0.0009, 1),
  fut("GOLDM", "Gold Mini (per 10g)", "MCX", 10, 140000, 0.0004, 1),
  fut("SILVERM", "Silver Mini (per kg)", "MCX", 5, 250000, 0.0007, 1),
  eq("ICICIBANK", "ICICI Bank", "4963", 1400),
  eq("ITC", "ITC Ltd", "1660", 420, 0.0005),
  eq("LT", "Larsen & Toubro", "11483", 3600),
  eq("AXISBANK", "Axis Bank", "5900", 1150),
  eq("BHARTIARTL", "Bharti Airtel", "10604", 1900),
  eq("KOTAKBANK", "Kotak Mahindra Bank", "1922", 2100),
  eq("TATASTEEL", "Tata Steel", "3499", 160, 0.0008),
  eq("NTPC", "NTPC Ltd", "11630", 340, 0.0006),
  eq("ONGC", "ONGC", "2475", 240, 0.0007),
  eq("POWERGRID", "Power Grid Corp", "14977", 300, 0.0006),
  eq("COALINDIA", "Coal India", "20374", 400, 0.0006),
  eq("WIPRO", "Wipro", "3787", 260, 0.0007),
  eq("HINDUNILVR", "Hindustan Unilever", "1394", 2400, 0.0005),
  eq("MARUTI", "Maruti Suzuki", "10999", 12500, 0.0006),
  eq("SUNPHARMA", "Sun Pharma", "3351", 1700),
];

export function getInstrument(symbol: string): Instrument | undefined {
  const s = symbol.trim().toUpperCase().replace(/-EQ$/, "").replace(/\s+/g, "");
  if (s === "NIFTY50INDEX" || s === "NIFTY 50") return INSTRUMENTS.find((i) => i.symbol === "NIFTY50");
  if (s === "BANKNIFTYINDEX" || s === "BANKNIFTY 50") return INSTRUMENTS.find((i) => i.symbol === "BANKNIFTY50");
  return INSTRUMENTS.find((i) => i.symbol === s);
}

export type ScripOverride = {
  tradingSymbol: string;
  token: string;
  lotSize?: number;
  expiry?: string | null;
};

export function applyOverride(inst: Instrument, o?: ScripOverride): Instrument {
  if (!o) return inst;
  return {
    ...inst,
    tradingSymbol: o.tradingSymbol,
    token: o.token,
    lotSize: o.lotSize && o.lotSize > 0 ? o.lotSize : inst.lotSize,
    resolved: true,
  };
}

/** Which session a given exchange trades in (for square-off scheduling). */
export function sessionOf(exchange: Exchange): "EQUITY" | "MCX" {
  return exchange === "MCX" ? "MCX" : "EQUITY";
}

/* ------------------------------------------------------------------------- *
 * Cross-broker symbol normalisation: one human ticker -> broker-specific
 * order payload shapes (Angel One SmartAPI / Shoonya NorenAPI / Groww API).
 * ------------------------------------------------------------------------- */

export type OrderParams = {
  inst: Instrument;
  side: "BUY" | "SELL";
  qty: number;
  price: number;
  orderType: "MARKET" | "LIMIT";
  tag: string;
  productType?: "INTRADAY" | "MIS" | "CNC";
  slPrice?: number;
  targetPrice?: number;
  userId?: string;
};

export function growwSegment(inst: Instrument): string {
  if (inst.exchange === "MCX") return "COMMODITY";
  return inst.kind === "EQ" ? "CASH" : "FNO";
}

/** Groww API only carries NSE/BSE cash + FNO + MCX commodity segments. */
export function growwExchange(inst: Instrument): string {
  return inst.exchange === "NFO" ? "NSE" : inst.exchange;
}

export function buildBrokerPayload(broker: BrokerKey, p: OrderParams): Record<string, unknown> {
  const { inst, side, qty, price, orderType, tag, productType, userId } = p;
  if (broker === "angel") {
    return {
      variety: "NORMAL",
      tradingsymbol: inst.tradingSymbol,
      symboltoken: inst.token,
      transactiontype: side,
      exchange: inst.exchange,
      ordertype: orderType,
      producttype: productType === "CNC" ? "DELIVERY" : "INTRADAY",
      duration: "DAY",
      price: orderType === "LIMIT" ? price.toFixed(2) : "0",
      squareoff: "0",
      stoploss: "0",
      quantity: String(qty),
      ordertag: tag.slice(0, 20),
    };
  }
  if (broker === "shoonya") {
    const uid = userId || "<vault:userId>";
    return {
      uid,
      actid: uid,
      exch: inst.exchange,
      tsym: inst.tradingSymbol,
      qty: String(qty),
      dscqty: "0",
      prc: orderType === "LIMIT" ? price.toFixed(2) : "0",
      prd: productType === "CNC" ? "C" : "I",
      trantype: side === "BUY" ? "B" : "S",
      prctyp: orderType === "LIMIT" ? "LMT" : "MKT",
      ret: "DAY",
      ordersource: "API",
      remarks: tag.slice(0, 20),
    };
  }
  const refId = tag.replace(/[^A-Za-z0-9-]/g, "").slice(0, 20).padEnd(8, "0");
  return {
    trading_symbol: inst.tradingSymbol.replace(/-EQ$/, ""),
    quantity: qty,
    price: orderType === "LIMIT" ? Number(price.toFixed(2)) : 0,
    validity: "DAY",
    exchange: growwExchange(inst),
    segment: growwSegment(inst),
    product: productType === "CNC" ? "CNC" : "MIS",
    order_type: orderType,
    transaction_type: side,
    order_reference_id: refId,
  };
}
