"""
OmniTradePro Apex V2.0 — Authoritative Statutory & Brokerage Cost Engine (Python).

Phase 2 (TAX-006 / ARCH-001): the single authoritative Python implementation of the
cost model defined in config/statutory_rates.json. Semantics are an EXACT mirror of
src/lib/tax.ts:
  - per-leg brokerage with round-trip brokerage floor
  - STT/CTT on sell turnover (or both sides where the spec says "both")
  - exchange transaction charges on total turnover
  - SEBI turnover fee on total turnover (INR 10 / crore)
  - stamp duty on buy turnover
  - GST on (brokerage + exchange + SEBI)
  - two-sided slippage (entry + exit), default 8.0 bps entry, exit mirrors entry
  - modeled minimum round-trip deduction floor
  - output rounding to paise (round-half-away-from-zero like JS Math.round for positives)
  - unsupported segments (delivery/CNC, currency derivatives, unknown pairs) FAIL CLOSED

Cross-language parity is enforced by tests/test_cost_parity.py.
"""

from dataclasses import dataclass, asdict
from typing import Any, Dict, Optional

from risk.rate_spec import load_rate_spec


class UnsupportedSegmentError(ValueError):
    """Raised when a product type / segment has no evidenced rate table (fail closed)."""


def r2(n: float) -> float:
    """Round to paise. BIT-IDENTICAL to JS `Math.round(n * 100) / 100` (IEEE doubles):
    JS Math.round(x) == floor(x + 0.5) for non-negative x, including exact ties."""
    import math

    return math.floor(n * 100 + 0.5) / 100


@dataclass
class ChargeBreakdown:
    """Mirror of TS Charges."""

    brokerage: float
    stt: float
    stt_label: str
    exchange_fees: float
    sebi: float
    stamp: float
    gst: float
    entry_slippage: float
    exit_slippage: float
    slippage: float
    entry_turnover: float
    exit_turnover: float
    total_turnover: float
    total: float
    basis: str
    rate_spec_version: str

    def to_dict(self) -> Dict[str, Any]:
        d = asdict(self)
        # Match the TS field names for parity comparison.
        return {
            "brokerage": d["brokerage"],
            "stt": d["stt"],
            "sttLabel": d["stt_label"],
            "exchangeFees": d["exchange_fees"],
            "sebi": d["sebi"],
            "stamp": d["stamp"],
            "gst": d["gst"],
            "entrySlippage": d["entry_slippage"],
            "exitSlippage": d["exit_slippage"],
            "slippage": d["slippage"],
            "entryTurnover": d["entry_turnover"],
            "exitTurnover": d["exit_turnover"],
            "totalTurnover": d["total_turnover"],
            "total": d["total"],
            "basis": d["basis"],
            "rateSpecVersion": d["rate_spec_version"],
        }


def _broker_spec(broker: str) -> Dict[str, Any]:
    spec = load_rate_spec()
    b = spec["brokers"].get(str(broker).lower())
    if not b:
        raise UnsupportedSegmentError(f"Unknown broker '{broker}' in rate spec")
    return b


def segment_key(exchange: str, kind: str, product_type: str = "INTRADAY") -> str:
    """Map (exchange, kind, productType) to the authoritative segment key. Fails closed."""
    pt = (product_type or "INTRADAY").upper()
    if pt in ("DELIVERY", "CNC"):
        seg = load_rate_spec()["segments"].get("NSE_EQ_DELIVERY", {})
        raise UnsupportedSegmentError(
            f"Delivery/CNC statutory costing is UNSUPPORTED (status {seg.get('status', 'UNSUPPORTED_NO_EVIDENCE')}): "
            "no locally-supplied official delivery-rate evidence (delivery STT both sides, delivery stamp duty, "
            "DP charges). Refusing to compute with intraday rates (Phase 1 defect TAX-001)."
        )
    ex, kd = str(exchange).upper(), str(kind).upper()
    if ex == "MCX":
        key = "MCX_ANY"
    elif ex == "NFO" and kd == "OPT":
        key = "NSE_OPT"
    elif ex == "NFO" and kd == "FUT":
        key = "NSE_FUT"
    elif ex == "NSE" and kd in ("EQ", "IDX"):
        key = "NSE_EQ_INTRADAY"
    else:
        raise UnsupportedSegmentError(f"No evidenced rate table for exchange={ex} kind={kd} (fail closed).")
    seg = load_rate_spec()["segments"].get(key)
    if not seg or not seg.get("supported"):
        raise UnsupportedSegmentError(f"Segment {key} is UNSUPPORTED (status {seg.get('status', 'UNKNOWN')}) — fail closed.")
    return key


def brokerage_for(broker: str, turnover: float, product_type: str = "INTRADAY") -> float:
    """Brokerage for ONE executed order leg (mirrors TS brokerageFor)."""
    b = _broker_spec(broker)
    pt = (product_type or "INTRADAY").upper()
    if pt in ("DELIVERY", "CNC"):
        return float(b.get("deliveryPerLeg", 0.0))
    if b.get("brokerageModel") == "FLAT_PER_LEG":
        return float(b.get("intradayPerLeg", 0.0))
    cap = float(b.get("perLegCap", 20.0))
    rate = float(b.get("perLegRate", 0.001))
    return min(cap, turnover * rate)


def round_trip_charges(
    exchange: str,
    kind: str,
    broker: str,
    qty: float,
    entry: float,
    exit: float,
    side: str = "BUY",
    product_type: str = "INTRADAY",
    entry_slippage_bps: Optional[float] = None,
    exit_slippage_bps: Optional[float] = None,
) -> ChargeBreakdown:
    """Round-trip statutory cost (mirrors TS roundTripCharges exactly)."""
    spec = load_rate_spec()
    b = _broker_spec(broker)
    seg = load_rate_spec()["segments"][segment_key(exchange, kind, product_type)]

    entry_val = qty * entry
    exit_val = qty * exit
    buy_val = entry_val if side.upper() == "BUY" else exit_val
    sell_val = exit_val if side.upper() == "BUY" else entry_val
    turnover = buy_val + sell_val

    brokerage = brokerage_for(broker, entry_val, product_type) + brokerage_for(broker, exit_val, product_type)
    brokerage = max(float(b["roundTripBrokerageFloor"]), brokerage)

    stt_rate = float(seg["stt"]["rate"])
    stt_side = seg["stt"]["side"]
    stt = (turnover if stt_side == "both" else sell_val) * stt_rate
    exch = turnover * float(seg["exchangeTxn"]["rate"])
    sebi = turnover * float(spec["sebiTurnoverFee"]["ratePerRupee"])
    stamp = buy_val * float(seg["stampDuty"]["rate"])
    gst = (brokerage + exch + sebi) * float(spec["gst"]["rate"])

    entry_bps = float(spec["slippageDefaults"]["entryBps"]) if entry_slippage_bps is None else float(entry_slippage_bps)
    exit_bps = entry_bps if exit_slippage_bps is None else float(exit_slippage_bps)
    entry_slip = entry_val * (entry_bps / 10000.0)
    exit_slip = exit_val * (exit_bps / 10000.0)
    total_slip = entry_slip + exit_slip

    total = brokerage + stt + exch + sebi + stamp + gst + total_slip
    total = max(float(b["minimumRoundTripDeduction"]), total)

    stt_label = "CTT" if seg["stt"].get("label") == "CTT" else "STT"
    return ChargeBreakdown(
        brokerage=r2(brokerage),
        stt=r2(stt),
        stt_label=stt_label,
        exchange_fees=r2(exch),
        sebi=r2(sebi),
        stamp=r2(stamp),
        gst=r2(gst),
        entry_slippage=r2(entry_slip),
        exit_slippage=r2(exit_slip),
        slippage=r2(total_slip),
        entry_turnover=r2(entry_val),
        exit_turnover=r2(exit_val),
        total_turnover=r2(turnover),
        total=r2(total),
        basis="FULL_ROUND_TRIP",
        rate_spec_version=spec["specVersion"],
    )


def leg_charges(
    exchange: str,
    kind: str,
    broker: str,
    qty: float,
    price: float,
    side: str,
    product_type: str = "INTRADAY",
    slippage_bps: Optional[float] = None,
    order_qty: Optional[float] = None,
) -> ChargeBreakdown:
    """
    One executed leg of a round trip. BUY legs carry stamp duty; SELL legs carry STT/CTT.

    `order_qty` makes partial fills exact: brokerage is charged PER ORDER (flat per leg
    models make this material), so a fill of `qty` of an `order_qty`-share order carries
    the proportional share of that order's leg brokerage. With order_qty=None (default),
    qty is the whole order. Summing all fills of an order reproduces one full leg;
    entry leg + exit leg then equals round_trip_charges() on the same inputs BEFORE the
    round-trip brokerage floor and minimum-deduction floor (enforced at round-trip level).
    """
    spec = load_rate_spec()
    seg = load_rate_spec()["segments"][segment_key(exchange, kind, product_type)]
    is_buy = side.upper() == "BUY"
    turnover = qty * price

    oq = float(order_qty) if order_qty else float(qty)
    full_brokerage = brokerage_for(broker, oq * price, product_type)
    brokerage = full_brokerage * (float(qty) / oq) if oq else full_brokerage
    stt = 0.0 if is_buy else turnover * float(seg["stt"]["rate"])
    exch = turnover * float(seg["exchangeTxn"]["rate"])
    sebi = turnover * float(spec["sebiTurnoverFee"]["ratePerRupee"])
    stamp = turnover * float(seg["stampDuty"]["rate"]) if is_buy else 0.0
    gst = (brokerage + exch + sebi) * float(spec["gst"]["rate"])

    bps = float(spec["slippageDefaults"]["entryBps"]) if slippage_bps is None else float(slippage_bps)
    slip = turnover * (bps / 10000.0)
    total = brokerage + stt + exch + sebi + stamp + gst + slip

    stt_label = "CTT" if seg["stt"].get("label") == "CTT" else "STT"
    return ChargeBreakdown(
        brokerage=r2(brokerage),
        stt=r2(stt),
        stt_label=stt_label,
        exchange_fees=r2(exch),
        sebi=r2(sebi),
        stamp=r2(stamp),
        gst=r2(gst),
        entry_slippage=0.0,
        exit_slippage=0.0,
        slippage=r2(slip),
        entry_turnover=r2(turnover) if is_buy else 0.0,
        exit_turnover=0.0 if is_buy else r2(turnover),
        total_turnover=r2(turnover),
        total=r2(total),
        basis="FULL_ROUND_TRIP",
        rate_spec_version=spec["specVersion"],
    )


def calculate_net_pnl(
    gross_pnl: float,
    broker: str,
    qty: Optional[float] = None,
    entry: Optional[float] = None,
    exit: Optional[float] = None,
    exchange: Optional[str] = None,
    kind: Optional[str] = None,
    side: str = "BUY",
    product_type: str = "INTRADAY",
    entry_slippage_bps: Optional[float] = None,
    exit_slippage_bps: Optional[float] = None,
) -> Dict[str, Any]:
    """
    Net P&L (mirrors TS calculateNetPnL). Full parameters -> FULL_ROUND_TRIP;
    otherwise MINIMUM_FLOOR_ESTIMATE with zeroed component heads (TAX-002:
    never fabricate a component breakdown).
    """
    spec = load_rate_spec()
    gross = r2(gross_pnl)
    if qty and entry and exit and exchange and kind:
        charges = round_trip_charges(
            exchange, kind, broker, qty, entry, exit,
            side=side, product_type=product_type,
            entry_slippage_bps=entry_slippage_bps, exit_slippage_bps=exit_slippage_bps,
        )
    else:
        b = _broker_spec(broker)
        charges = ChargeBreakdown(
            brokerage=0.0, stt=0.0, stt_label="STT", exchange_fees=0.0, sebi=0.0, stamp=0.0, gst=0.0,
            entry_slippage=0.0, exit_slippage=0.0, slippage=0.0,
            entry_turnover=0.0, exit_turnover=0.0, total_turnover=0.0,
            total=r2(float(b["minimumRoundTripDeduction"])),
            basis="MINIMUM_FLOOR_ESTIMATE",
            rate_spec_version=spec["specVersion"],
        )
    total_charges = r2(charges.total)
    return {
        "grossPnL": gross,
        "netPnL": r2(gross - total_charges),
        "charges": charges,
        "totalCharges": total_charges,
    }


def hurdle_floor_for(broker: str) -> float:
    """Consolidated policy hurdle floor (TAX-005): strictest previously-implemented value."""
    h = load_rate_spec()["hurdles"]
    return float(h.get(str(broker).lower(), h["shoonya"]))
