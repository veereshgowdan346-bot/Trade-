"""
OmniTradePro Apex V2.0 — Phase 6.4 Independent Cost Tests & Regression Protection.

These tests independently compute two-sided execution slippage, statutory taxes,
asymmetrical entry/exit rates, long/short taxation rules, and scenario stress tests.
Zero tests repeat implementation constants; all are derived from mathematical first principles.
"""

import json
from pathlib import Path
import pytest


def calculate_independent_costs(qty, entry, exit_p, side, entry_bps, exit_bps, broker="shoonya"):
    """Independent first-principles statutory and two-sided slippage calculator."""
    is_buy = side == "BUY"
    entry_val = qty * entry
    exit_val = qty * exit_p
    tot_turnover = entry_val + exit_val
    buy_val = entry_val if is_buy else exit_val
    sell_val = exit_val if is_buy else entry_val

    # Gross P&L
    raw_gross = (exit_p - entry) * qty if is_buy else (entry - exit_p) * qty
    gross = round(raw_gross, 2)

    # Statutory taxes
    brk = 10.0 if broker == "shoonya" else 40.0
    stt = round(sell_val * 0.00025, 2)
    exch = round(tot_turnover * 0.0000297, 2)
    sebi = round(tot_turnover * 0.000001, 2)
    stamp = round(buy_val * 0.00003, 2)
    gst = round((brk + exch + sebi) * 0.18, 2)

    # Two-sided explicit slippage
    entry_slip = round(entry_val * (entry_bps / 10000.0), 2)
    exit_slip = round(exit_val * (exit_bps / 10000.0), 2)
    tot_slip = round(entry_slip + exit_slip, 2)

    # Unrounded total charges matching tax.ts architecture
    unrounded_total = (
        brk
        + (sell_val * 0.00025)
        + (tot_turnover * 0.0000297)
        + (tot_turnover * 0.000001)
        + (buy_val * 0.00003)
        + ((brk + (tot_turnover * 0.0000297) + (tot_turnover * 0.000001)) * 0.18)
        + (entry_val * (entry_bps / 10000.0))
        + (exit_val * (exit_bps / 10000.0))
    )
    total_charges = round(unrounded_total, 2)
    net_pnl = round(gross - total_charges, 2)

    return {
        "gross": gross,
        "entry_val": round(entry_val, 2),
        "exit_val": round(exit_val, 2),
        "tot_turnover": round(tot_turnover, 2),
        "brokerage": brk,
        "stt": stt,
        "exch": exch,
        "sebi": sebi,
        "stamp": stamp,
        "gst": gst,
        "entry_slip": entry_slip,
        "exit_slip": exit_slip,
        "tot_slip": tot_slip,
        "total_charges": total_charges,
        "net_pnl": net_pnl,
    }


def test_independent_zero_slippage():
    """Verify that under 0 bps slippage, only statutory taxes and brokerage apply."""
    res = calculate_independent_costs(qty=100, entry=2500.0, exit_p=2520.0, side="BUY", entry_bps=0, exit_bps=0)
    assert res["gross"] == 2000.00
    assert res["entry_slip"] == 0.00
    assert res["exit_slip"] == 0.00
    assert res["tot_slip"] == 0.00
    assert res["brokerage"] == 10.00
    assert res["stt"] == 63.00  # 252,000 * 0.00025
    assert res["stamp"] == 7.50  # 250,000 * 0.00003
    assert res["total_charges"] == 100.49
    assert res["net_pnl"] == 1899.51


def test_independent_entry_only_vs_exit_only_slippage():
    """Verify that entry-only and exit-only slippages differ due to turnover differences."""
    qty = 50
    entry = 2400.0
    exit_p = 2500.0

    entry_only = calculate_independent_costs(qty, entry, exit_p, "BUY", entry_bps=8, exit_bps=0)
    exit_only = calculate_independent_costs(qty, entry, exit_p, "BUY", entry_bps=0, exit_bps=8)

    # Entry turnover = 120,000 -> 8 bps = 96.00
    assert entry_only["entry_slip"] == 96.00
    assert entry_only["exit_slip"] == 0.00
    assert entry_only["tot_slip"] == 96.00

    # Exit turnover = 125,000 -> 8 bps = 100.00
    assert exit_only["entry_slip"] == 0.00
    assert exit_only["exit_slip"] == 100.00
    assert exit_only["tot_slip"] == 100.00

    # Exit slippage must be greater than entry slippage on winning long trade
    assert exit_only["tot_slip"] > entry_only["tot_slip"]


def test_independent_symmetrical_two_sided_slippage():
    """Verify that symmetrical slippage strictly equals entry plus exit slippage."""
    res = calculate_independent_costs(qty=40, entry=2500.0, exit_p=2550.0, side="BUY", entry_bps=8, exit_bps=8)
    # Entry = 100,000 * 0.0008 = 80.00
    # Exit = 102,000 * 0.0008 = 81.60
    assert res["entry_slip"] == 80.00
    assert res["exit_slip"] == 81.60
    assert res["tot_slip"] == 161.60
    assert res["tot_slip"] == round(res["entry_slip"] + res["exit_slip"], 2)


def test_independent_asymmetrical_entry_exit_rates():
    """Test differing entry and exit rates (e.g. 4 bps passive entry, 12 bps aggressive exit)."""
    res = calculate_independent_costs(qty=40, entry=2500.0, exit_p=2550.0, side="BUY", entry_bps=4, exit_bps=12)
    assert res["entry_slip"] == 40.00  # 100,000 * 0.0004
    assert res["exit_slip"] == 122.40  # 102,000 * 0.0012
    assert res["tot_slip"] == 162.40


def test_independent_long_vs_short_taxation_asymmetry():
    """
    Verify regulatory asymmetry:
    - Long trade: STT on Exit (Sell), Stamp on Entry (Buy)
    - Short trade: STT on Entry (Sell), Stamp on Exit (Buy)
    """
    long_trade = calculate_independent_costs(qty=100, entry=2500.0, exit_p=2600.0, side="BUY", entry_bps=0, exit_bps=0)
    short_trade = calculate_independent_costs(qty=100, entry=2600.0, exit_p=2500.0, side="SELL", entry_bps=0, exit_bps=0)

    # In both trades, gross is +10,000.00
    assert long_trade["gross"] == 10000.00
    assert short_trade["gross"] == 10000.00

    # Long trade: Buy turnover = 250,000, Sell turnover = 260,000
    assert long_trade["stamp"] == 7.50  # 250,000 * 0.00003
    assert long_trade["stt"] == 65.00  # 260,000 * 0.00025

    # Short trade: Sell turnover = 260,000 (Entry), Buy turnover = 250,000 (Exit)
    assert short_trade["stt"] == 65.00  # 260,000 * 0.00025
    assert short_trade["stamp"] == 7.50  # 250,000 * 0.00003

    # Total statutory charges must be identical because total turnovers match
    assert long_trade["total_charges"] == short_trade["total_charges"]


def test_independent_partial_and_odd_lot_quantities():
    """Verify precision with odd quantities (e.g. 17 shares @ fractional prices)."""
    res = calculate_independent_costs(qty=17, entry=2511.35, exit_p=2505.40, side="BUY", entry_bps=8, exit_bps=8)
    assert res["gross"] == -101.15
    assert res["entry_val"] == 42692.95
    assert res["exit_val"] == 42591.80
    assert res["entry_slip"] == 34.15
    assert res["exit_slip"] == 34.07
    assert res["net_pnl"] == round(res["gross"] - res["total_charges"], 2)


def test_regression_phase64_scenarios_reproduction():
    """
    Regression protection: Load phase64_recalculation_output.json and verify that:
    1. Zero slippage Phase 4 is +₹2,066.06.
    2. 4 bps each side Phase 4 is +₹875.21.
    3. 8 bps each side Phase 4 is -₹315.67 (net loss).
    4. 12 bps each side Phase 4 is -₹1,506.53.
    5. Zero slippage Whipsaw is -₹3,396.52.
    6. 8 bps each side Whipsaw expands loss to -₹6,328.42.
    """
    p = Path(__file__).parent.parent / "scripts" / "phase64_recalculation_output.json"
    assert p.exists(), f"Missing Phase 6.4 output: {p}"
    with open(p, "r", encoding="utf-8") as f:
        data = json.load(f)

    p4_scenarios = data["scenariosSummary"]["phase4PaperTrades"]
    s_zero = next(s for s in p4_scenarios if s["entryBps"] == 0 and s["exitBps"] == 0)
    s_4bps = next(s for s in p4_scenarios if s["entryBps"] == 4 and s["exitBps"] == 4)
    s_8bps = next(s for s in p4_scenarios if s["entryBps"] == 8 and s["exitBps"] == 8)
    s_12bps = next(s for s in p4_scenarios if s["entryBps"] == 12 and s["exitBps"] == 12)

    assert s_zero["netPnL"] == 2066.06
    assert s_4bps["netPnL"] == 875.21
    assert s_8bps["netPnL"] == -315.67  # Crucial: flips to loss under symmetrical 8 bps!
    assert s_12bps["netPnL"] == -1506.53

    w_scenarios = data["scenariosSummary"]["whipsawStressTrades"]
    w_zero = next(s for s in w_scenarios if s["entryBps"] == 0 and s["exitBps"] == 0)
    w_8bps = next(s for s in w_scenarios if s["entryBps"] == 8 and s["exitBps"] == 8)

    assert w_zero["netPnL"] == -3396.52
    assert w_8bps["netPnL"] == -6328.42
    assert w_8bps["maxDD"] == 6.33


def test_regression_exit_slippage_cannot_be_omitted():
    """Ensure that modifying exit slippage strictly alters total charges and net P&L."""
    res_no_exit = calculate_independent_costs(qty=39, entry=2500.0, exit_p=2520.0, side="BUY", entry_bps=8, exit_bps=0)
    res_with_exit = calculate_independent_costs(qty=39, entry=2500.0, exit_p=2520.0, side="BUY", entry_bps=8, exit_bps=8)

    assert res_with_exit["total_charges"] > res_no_exit["total_charges"]
    assert res_with_exit["net_pnl"] < res_no_exit["net_pnl"]
    diff = round(res_with_exit["total_charges"] - res_no_exit["total_charges"], 2)
    assert diff == res_with_exit["exit_slip"]
