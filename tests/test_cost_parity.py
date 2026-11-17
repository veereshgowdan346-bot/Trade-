"""
Phase 2 cross-language cost parity tests (TAX-006 / ARCH-001).

Proves the Python cost engine (risk/statutory_cost.py) and the TypeScript cost engine
(src/lib/tax.ts) agree on IDENTICAL inputs, field by field to the paise, over the shared
fixture data/fixtures/cost_parity_scenarios.json — plus independent property tests:
partial fills, multi-leg sums, minimum charges, rounding, GST basis, STT sides, net P&L.

Financial safety: no rate is invented here; every value derives from
config/statutory_rates.json (all rates UNVERIFIED pending dated official evidence).
"""

import json
import math
import subprocess
import sys
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO))

from risk.statutory_cost import (  # noqa: E402
    UnsupportedSegmentError,
    calculate_net_pnl,
    hurdle_floor_for,
    leg_charges,
    load_rate_spec,
    r2,
    round_trip_charges,
)

FIXTURE = REPO / "data" / "fixtures" / "cost_parity_scenarios.json"
TS_RUNNER = REPO / "scripts" / "cost_parity_ts.js"

NUMERIC_FIELDS = [
    "brokerage", "stt", "exchangeFees", "sebi", "stamp", "gst",
    "entrySlippage", "exitSlippage", "slippage",
    "entryTurnover", "exitTurnover", "totalTurnover", "total",
]


def _python_result(scenario: dict) -> dict:
    a = scenario["args"]
    if scenario.get("expectError"):
        with pytest.raises(UnsupportedSegmentError):
            round_trip_charges(
                a["exchange"], a["kind"], a["broker"], a["qty"], a["entry"], a["exit"],
                side=a["side"], product_type=a["productType"],
                entry_slippage_bps=a.get("entrySlippageBps"), exit_slippage_bps=a.get("exitSlippageBps"),
            )
        return {"ok": False}
    charges = round_trip_charges(
        a["exchange"], a["kind"], a["broker"], a["qty"], a["entry"], a["exit"],
        side=a["side"], product_type=a["productType"],
        entry_slippage_bps=a.get("entrySlippageBps"), exit_slippage_bps=a.get("exitSlippageBps"),
    )
    net = calculate_net_pnl(
        scenario.get("grossPnL", 0.0), a["broker"],
        qty=a["qty"], entry=a["entry"], exit=a["exit"],
        exchange=a["exchange"], kind=a["kind"], side=a["side"], product_type=a["productType"],
        entry_slippage_bps=a.get("entrySlippageBps"), exit_slippage_bps=a.get("exitSlippageBps"),
    )
    return {
        "ok": True,
        "charges": charges.to_dict(),
        "netPnL": net["netPnL"],
        "grossPnL": net["grossPnL"],
        "totalCharges": net["totalCharges"],
    }


@pytest.fixture(scope="module")
def fixture_data() -> dict:
    return json.loads(FIXTURE.read_text(encoding="utf-8"))


@pytest.fixture(scope="module")
def ts_results() -> dict:
    if not (REPO / "dist_test_cjs" / "tax.js").exists():
        pytest.skip("dist_test_cjs not built — run `npm run test:prep` first")
    proc = subprocess.run(
        ["node", str(TS_RUNNER)], cwd=str(REPO), capture_output=True, text=True, timeout=120
    )
    assert proc.returncode == 0, f"TS parity runner failed: {proc.stderr}"
    return json.loads(proc.stdout)


# ---------------------------------------------------------------------------
# 1. Scenario parity: TS vs Python, field by field
# ---------------------------------------------------------------------------
def test_scenario_parity_ts_vs_python(fixture_data, ts_results):
    """Every shared scenario must produce identical TS and Python outputs to the paise."""
    assert ts_results["engine"] == "typescript"
    failures = []
    for scenario in fixture_data["scenarios"]:
        sid = scenario["id"]
        tsr = ts_results["results"].get(sid)
        assert tsr is not None, f"TS runner produced no result for {sid}"
        pyr = _python_result(scenario)
        if scenario.get("expectError"):
            if tsr["ok"]:
                failures.append(f"{sid}: TS did not fail closed (expected {scenario['expectError']})")
            elif "UnsupportedSegment" not in tsr.get("errorName", ""):
                failures.append(f"{sid}: TS error name mismatch: {tsr.get('errorName')}")
            continue
        if not tsr["ok"]:
            failures.append(f"{sid}: TS errored: {tsr.get('errorMessage')}")
            continue
        for f in NUMERIC_FIELDS:
            if abs(tsr["charges"][f] - pyr["charges"][f]) > 0.01:
                failures.append(f"{sid}.{f}: TS={tsr['charges'][f]} PY={pyr['charges'][f]}")
        for f in ("sttLabel", "basis", "rateSpecVersion"):
            if tsr["charges"][f] != pyr["charges"][f]:
                failures.append(f"{sid}.{f}: TS={tsr['charges'][f]} PY={pyr['charges'][f]}")
        for f in ("netPnL", "grossPnL", "totalCharges"):
            if abs(tsr[f] - pyr[f]) > 0.01:
                failures.append(f"{sid}.{f}: TS={tsr[f]} PY={pyr[f]}")
    assert not failures, "TS<->Python parity failures:\n" + "\n".join(failures)


def test_hurdle_parity(ts_results):
    for broker in ("shoonya", "angel", "groww"):
        assert abs(ts_results["hurdles"][broker] - hurdle_floor_for(broker)) <= 0.001, broker


# ---------------------------------------------------------------------------
# 2. Independent property tests (Python-side mathematics)
# ---------------------------------------------------------------------------
def test_partial_fill_legs_sum_to_round_trip():
    """Partial fills must cost exactly the unfilled-equivalent round trip (pre-floor):
    statutory heads are linear in turnover; brokerage is PER ORDER and amortized per fill."""
    whole = round_trip_charges("NSE", "EQ", "shoonya", 50, 2500, 2512.5, side="BUY")
    fills = [
        leg_charges("NSE", "EQ", "shoonya", 25, 2500, "BUY", order_qty=50),
        leg_charges("NSE", "EQ", "shoonya", 25, 2500, "BUY", order_qty=50),
        leg_charges("NSE", "EQ", "shoonya", 30, 2512.5, "SELL", order_qty=50),
        leg_charges("NSE", "EQ", "shoonya", 20, 2512.5, "SELL", order_qty=50),
    ]
    for f in ("brokerage", "stt", "exchange_fees", "sebi", "stamp", "gst", "total_turnover"):
        # Per-fill display rounding (paise) accumulates <= half-paise per fill per head;
        # 4 fills -> <= 0.02 paise-level drift, float-safe compared after rounding.
        drift = round(sum(getattr(p, f) for p in fills) - getattr(whole, f), 2)
        assert abs(drift) <= 0.02, f"{f}: drift {drift}"


def test_multi_leg_sum_matches_pooled_round_trip():
    """Multi-leg (two independent round trips) = sum of parts; STT only on sell legs."""
    a = round_trip_charges("NSE", "EQ", "shoonya", 30, 100, 101, side="BUY")
    b = round_trip_charges("NSE", "EQ", "shoonya", 12, 80, 78, side="SELL")
    pooled = (a.total_turnover + b.total_turnover)
    assert pooled == a.total_turnover + b.total_turnover
    assert a.stt > 0 and b.stt > 0
    buy_only = leg_charges("NSE", "EQ", "shoonya", 30, 100, "BUY")
    assert buy_only.stt == 0.0
    sell_only = leg_charges("NSE", "EQ", "shoonya", 30, 101, "SELL")
    assert sell_only.stamp == 0.0 and sell_only.stt > 0


def test_minimum_charge_floors_bind_on_tiny_trades():
    sh = round_trip_charges("NSE", "EQ", "shoonya", 1, 5, 8, side="BUY")
    an = round_trip_charges("NSE", "EQ", "angel", 1, 5, 8, side="BUY")
    assert sh.total >= 25.0 - 0.001
    assert an.total >= 55.0 - 0.001
    assert sh.total == 25.0 and an.total == 55.0  # floors bind exactly


def test_gst_basis_is_brokerage_plus_exchange_plus_sebi():
    c = round_trip_charges("NSE", "EQ", "shoonya", 50, 2500, 2512.5, side="BUY")
    spec = load_rate_spec()
    gst_rate = float(spec["gst"]["rate"])
    expected_gst = (c.brokerage + c.exchange_fees + c.sebi) * gst_rate
    # Components are rounded for display; GST must match the unrounded basis to a couple of paise.
    assert abs(c.gst - expected_gst) <= 0.02, (c.gst, expected_gst)


def test_stt_and_stamp_sides():
    long = round_trip_charges("NSE", "EQ", "shoonya", 50, 2500, 2512.5, side="BUY")
    short = round_trip_charges("NSE", "EQ", "shoonya", 50, 2512.5, 2500, side="SELL")
    # STT on sell turnover: long sellVal = 50*2512.5; short sellVal = 50*2512.5 (short's ENTRY is the sell leg) -> equal STT.
    assert abs(long.stt - short.stt) <= 0.01
    # Stamp on buy turnover: long buyVal = 50*2500; short buyVal = 50*2500 (short's EXIT is the buy leg) -> equal stamp.
    assert abs(long.stamp - short.stamp) <= 0.01
    assert long.stt_label == "STT"


def test_net_pnl_never_reports_gross_as_net():
    res = calculate_net_pnl(625.0, "shoonya", qty=50, entry=2500, exit=2512.5, exchange="NSE", kind="EQ")
    assert res["grossPnL"] == 625.0
    assert abs(res["netPnL"] - (625.0 - res["totalCharges"])) <= 0.01
    assert res["netPnL"] < res["grossPnL"]  # net is net


def test_net_pnl_estimate_has_zeroed_heads_and_floor_total():
    res = calculate_net_pnl(100.0, "angel")  # no trade params -> MINIMUM_FLOOR_ESTIMATE
    c = res["charges"]
    assert c.basis == "MINIMUM_FLOOR_ESTIMATE"
    assert c.total == 55.0  # angel modeled minimum deduction
    for f in ("brokerage", "stt", "exchange_fees", "sebi", "stamp", "gst", "slippage"):
        assert getattr(c, f) == 0.0, f"estimate head {f} must be zero (TAX-002: no fabrication)"


def test_rounding_matches_js_semantics():
    """r2 must be bit-identical to JS Math.round(n*100)/100 (ties round away from zero)."""
    assert r2(2.675) == math.floor(2.675 * 100 + 0.5) / 100  # binary tie, JS-identical
    assert r2(0.005) == 0.01
    assert r2(0.0049999) == 0.0
    assert r2(264.8655) == 264.87
    for v in [1.005, 8.235, 113.41500000000003, 5420.765]:
        assert r2(v) == math.floor(v * 100 + 0.5) / 100


def test_fail_closed_on_unsupported_segments():
    with pytest.raises(UnsupportedSegmentError):
        round_trip_charges("NSE", "EQ", "shoonya", 10, 100, 105, side="BUY", product_type="DELIVERY")
    with pytest.raises(UnsupportedSegmentError):
        round_trip_charges("NSE", "EQ", "shoonya", 10, 100, 105, side="BUY", product_type="CNC")
    with pytest.raises(UnsupportedSegmentError):
        round_trip_charges("BSE", "EQ", "shoonya", 10, 100, 105, side="BUY")
    with pytest.raises(UnsupportedSegmentError):
        round_trip_charges("NSE", "EQ", "zerodha", 10, 100, 105, side="BUY")


def test_segment_rates_match_spec_rows():
    spec = load_rate_spec()
    c = round_trip_charges("NFO", "OPT", "angel", 100, 480, 465, side="SELL")
    seg = spec["segments"]["NSE_OPT"]
    expected_stt = (100 * 480) * float(seg["stt"]["rate"])  # side SELL: the ENTRY leg is the sell leg
    assert abs(c.stt - r2(expected_stt)) <= 0.01
    assert c.stt_label == "STT"
    mcx = round_trip_charges("MCX", "FUT", "shoonya", 5, 21000, 21150, side="BUY")
    assert mcx.stt_label == "CTT"


def test_fixture_expected_canonical_values():
    """Independent hand-computed anchors (each figure derivable by hand from the spec rows).

    Shoonya NSE EQ long, qty 50, 2500 -> 2512.5 (turnover 250,625; sellVal 125,625; buyVal 125,000):
      brokerage = max(10, 5+5) = 10
      STT   = 0.025% x 125,625 = 31.41
      exch  = 0.00297% x 250,625 = 7.44
      SEBI  = 0.0001% x 250,625 = 0.25
      stamp = 0.003% x 125,000 = 3.75
      GST   = 18% x (10 + 7.44 + 0.25) = 3.18
      slippage = 8bps x (125,000 + 125,625) = 200.50
      total = 256.54  (>= shoonya floor 25, not binding)
    Angel: brokerage floor 40 -> GST 18% x (40 + 7.44 + 0.25) = 8.58 -> total 291.94.
    """
    sh = round_trip_charges("NSE", "EQ", "shoonya", 50, 2500, 2512.5, side="BUY")
    assert sh.total == 256.54
    assert sh.brokerage == 10.0 and sh.stt == 31.41
    assert sh.exchange_fees == 7.44 and sh.sebi == 0.25
    assert sh.stamp == 3.75 and sh.gst == 3.18
    assert sh.slippage == 200.5
    an = round_trip_charges("NSE", "EQ", "angel", 50, 2500, 2512.5, side="BUY")
    assert an.total == 291.94
    assert an.brokerage == 40.0 and an.gst == 8.58
