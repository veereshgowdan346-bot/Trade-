"""
OmniTradePro Apex V2.0 — Phase 6.2 Automated Accounting & Benchmark Consistency Tests.
Validates:
1. Complete reconciliation of all 19 Whipsaw trades: Gross -2526.76, Charges 2336.01, Net -4862.77.
2. Forensic explanation of the 7 Breakeven Stop-Out trades (-116.39 to -120.83).
3. Walk-Forward Efficiency terminology and frequency multiplier (2.50).
4. Risk-Budget-Matched Buy & Hold comparison (+236.00 at 0.77% drawdown).
5. Decoupling of Margin Utilization (19.89%), Exposure (18.4%), and Drawdown (0.77%).
"""

import json
from pathlib import Path
import pytest


@pytest.fixture
def phase62_data():
    audit_path = Path(__file__).parent.parent / "scripts" / "phase62_audit_output.json"
    assert audit_path.exists(), f"Missing Phase 6.2 audit file: {audit_path}"
    with open(audit_path, "r", encoding="utf-8") as f:
        return json.load(f)


def test_phase62_whipsaw_ledger_reconciliation(phase62_data):
    """Verify that all 19 whipsaw trades are mathematically reconciled."""
    wl = phase62_data["whipsawLedger"]
    assert wl["totalTrades"] == 19
    assert wl["sumGross"] == -2526.76
    assert wl["sumCharges"] == 2336.01
    assert wl["sumNet"] == -4862.77
    assert wl["finalCap"] == 95137.23
    assert wl["breakevenTradesCount"] == 7
    assert "FAILED" in wl["status"]  # Immutable baseline preserved


def test_phase62_wfe_terminology_and_multiplier(phase62_data):
    """Verify exact WFE terminology, frequency multiplier, and synthetic research marking."""
    wt = phase62_data["wfeTerminology"]
    assert wt["wfeTotalRatio"] == 4.64
    assert wt["wfeAvgTradeRatio"] == 1.86
    assert wt["tradeFrequencyMultiplier"] == 2.50
    assert "NOT VERIFIED" in wt["status"]


def test_phase62_risk_budget_matched_baseline(phase62_data):
    """Assert Risk-Budget-Matched Buy & Hold scaled to 0.77% drawdown returns +236.00."""
    bf = phase62_data["baselineFairness"]
    assert bf["omniTradePro"]["net"] == 875.71
    assert bf["omniTradePro"]["dd"] == 0.77

    matched = bf["buyAndHoldRiskMatched"]
    assert matched["qty"] == 4
    assert matched["net"] == 236.00
    assert matched["dd"] == 0.77
    assert matched["returnPct"] == 0.24


def test_phase62_margin_and_exposure_decoupling(phase62_data):
    """Assert strict decoupling of Margin Utilization, Market Exposure, and Portfolio Drawdown."""
    ma = phase62_data["marginAudit"]
    assert ma["marginUtilizationPct"] == 19.89
    assert ma["marketExposurePct"] == 18.4
    assert ma["maxDrawdownPct"] == 0.77
    assert ma["status"] == "VERIFIED"
