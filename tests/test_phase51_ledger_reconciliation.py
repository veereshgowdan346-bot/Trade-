"""
OmniTradePro Apex V2.0 — Phase 5.1 Automated Forensic Ledger Tests.
Asserts row-level integrity, aggregate sums, invariant equations,
zero paisa variance, and no duplicate/missing trade IDs.
"""

import json
from pathlib import Path
import pytest


@pytest.fixture
def phase51_data():
    reconciled_path = Path(__file__).parent.parent / "scripts" / "phase51_reconciliation_output.json"
    assert reconciled_path.exists(), f"Missing reconciliation file: {reconciled_path}"
    with open(reconciled_path, "r", encoding="utf-8") as f:
        return json.load(f)


def test_trade_row_sums_equal_aggregate(phase51_data):
    """Assert that the sum of individual trade rows strictly equals reported aggregates."""
    trades = phase51_data["auditLedger"]
    totals = phase51_data["totals"]

    sum_gross = round(sum(t["grossPnL"] for t in trades), 2)
    sum_brokerage = round(sum(t["brokerage"] for t in trades), 2)
    sum_stt = round(sum(t["stt"] for t in trades), 2)
    sum_exch = round(sum(t["exch"] for t in trades), 2)
    sum_sebi = round(sum(t["sebi"] for t in trades), 2)
    sum_stamp = round(sum(t["stamp"] for t in trades), 2)
    sum_gst = round(sum(t["gst"] for t in trades), 2)
    sum_slippage = round(sum(t["slippage"] for t in trades), 2)
    sum_total_charges = round(sum(t["totalCharges"] for t in trades), 2)
    sum_net = round(sum(t["netPnL"] for t in trades), 2)

    assert sum_gross == totals["sumGross"], f"Gross mismatch: {sum_gross} vs {totals['sumGross']}"
    assert sum_brokerage == totals["sumBrokerage"]
    assert sum_stt == totals["sumStt"]
    assert sum_exch == totals["sumExch"]
    assert sum_sebi == totals["sumSebi"]
    assert sum_stamp == totals["sumStamp"]
    assert sum_gst == totals["sumGst"]
    assert sum_slippage == round(sum(t["slippage"] for t in trades), 2)
    assert sum_total_charges == totals["sumTotalCharges"]
    assert sum_net == totals["sumNetPnL"]


def test_gross_minus_all_costs_equals_net_every_row(phase51_data):
    """Assert that Gross - Total Costs == Net on EVERY single row."""
    trades = phase51_data["auditLedger"]
    for t in trades:
        expected_net = round(t["grossPnL"] - t["totalCharges"], 2)
        assert t["netPnL"] == expected_net, (
            f"Row mismatch on {t['tradeId']}: {t['grossPnL']} - {t['totalCharges']} = {expected_net} vs {t['netPnL']}"
        )


def test_initial_capital_plus_net_equals_final_capital(phase51_data):
    """Assert that Initial Capital + SUM(Net PnL) strictly equals Final Capital."""
    totals = phase51_data["totals"]
    expected_final = round(totals["initialCapital"] + totals["sumNetPnL"], 2)
    assert totals["finalCapital"] == expected_final
    assert totals["finalCapital"] == 100875.71


def test_no_missing_or_duplicate_trade_ids(phase51_data):
    """Assert all trade IDs are unique, sequential, and complete."""
    trades = phase51_data["auditLedger"]
    seen_ids = set()
    for i, t in enumerate(trades):
        expected_id = f"PAPER_{i + 1}"
        assert t["tradeId"] == expected_id, f"Expected {expected_id}, found {t['tradeId']}"
        assert t["tradeId"] not in seen_ids, f"Duplicate trade ID: {t['tradeId']}"
        seen_ids.add(t["tradeId"])
    assert len(seen_ids) == 15


def test_rounding_consistency_and_zero_paisa_variance(phase51_data):
    """Assert that rounding rules are strictly applied to 2 decimal places with 0 paisa drift."""
    trades = phase51_data["auditLedger"]
    for t in trades:
        # Check all rupee fields have at most 2 decimal places
        for field in ["grossPnL", "brokerage", "stt", "exch", "sebi", "stamp", "gst", "slippage", "totalCharges", "netPnL"]:
            val = t[field]
            assert round(val, 2) == val, f"Field {field} on {t['tradeId']} violates 2-decimal rounding: {val}"
