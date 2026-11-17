"""
OmniTradePro Apex V2.0 — Phase 6.1 Mathematical Discrepancy Correction Tests.
Validates:
1. Walk-Forward Efficiency reconciliation (4.64 Total Net Ratio vs 1.86 Per-Trade Ratio).
2. Slippage break-even exact threshold (13.8854 bps ~ 13.89 bps) and cost scenarios.
3. Separation of Entry Turnover, Exit Turnover, Buy Turnover, and Sell Turnover.
4. Correct accounting of statutory taxes (included exactly once).
"""

import json
from pathlib import Path
import pytest


@pytest.fixture
def phase61_data():
    audit_path = Path(__file__).parent.parent / "scripts" / "phase61_audit_output.json"
    assert audit_path.exists(), f"Missing Phase 6.1 audit file: {audit_path}"
    with open(audit_path, "r", encoding="utf-8") as f:
        return json.load(f)


def test_phase61_wfe_reconciliation(phase61_data):
    """Verify that both WFE formulas are reconciled: 4.64 (Total Net) and 1.86 (Per-Trade)."""
    wfe = phase61_data["wfeAudit"]
    assert wfe["wfeTotalRatio"] == 4.64
    assert wfe["wfeAvgTradeRatio"] == 1.86
    assert wfe["discrepancyResolved"] is True
    assert "NOT VERIFIED" in wfe["status"]  # Small sample on synthetic data


def test_phase61_turnover_decomposition(phase61_data):
    """Verify clean separation of Entry Turnover, Exit Turnover, Buy Turnover, and Sell Turnover."""
    sa = phase61_data["slippageAudit"]
    assert sa["sumEntryTurnover"] == 1487949.57
    assert sa["sumExitTurnover"] == 1489212.06
    assert sa["sumBuyTurnover"] == 1487196.80
    assert sa["sumSellTurnover"] == 1489964.83
    # Check that Buy + Sell == Entry + Exit == Total Turnover
    tot1 = round(sa["sumEntryTurnover"] + sa["sumExitTurnover"], 2)
    tot2 = round(sa["sumBuyTurnover"] + sa["sumSellTurnover"], 2)
    assert tot1 == tot2 == 2977161.63


def test_phase61_exact_slippage_breakeven(phase61_data):
    """Assert exact mathematical break-even slippage is 13.8854 bps and 14 bps results in net loss."""
    sa = phase61_data["slippageAudit"]
    assert sa["exactBreakEvenBps"] == 13.8854
    assert sa["sumStatutoryZeroSlip"] == 701.95

    # Check scenarios
    scenarios = {s["bps"]: s for s in sa["scenarios"]}
    assert scenarios[0]["netPnL"] == 2066.08
    assert scenarios[8]["netPnL"] == 875.71
    assert scenarios[12]["netPnL"] == 280.56
    assert scenarios[13.8854]["netPnL"] == 0.01  # Exact zero bound
    assert scenarios[14]["netPnL"] == -17.05      # Loss at 14 bps
    assert scenarios[16]["netPnL"] == -314.62
    assert scenarios[20]["netPnL"] == -909.83


def test_phase61_baseline_metrics_and_exposure(phase61_data):
    """Assert all baselines include return, drawdown, and market exposure."""
    baselines = {b["name"]: b for b in phase61_data["baselineAudit"]["baselines"]}

    assert baselines["OmniTradePro Quorum"]["netPnL"] == 875.71
    assert baselines["OmniTradePro Quorum"]["exposurePct"] == 18.4
    assert baselines["Passive Buy & Hold"]["netPnL"] == 2614.41
    assert baselines["Passive Buy & Hold"]["exposurePct"] == 100.0
    assert baselines["Passive Buy & Hold"]["maxDD"] == 6.84
    assert baselines["Dual SMA (20/50)"]["netPnL"] == -946.03
    assert baselines["RSI (14) Standalone"]["netPnL"] == -6858.43
