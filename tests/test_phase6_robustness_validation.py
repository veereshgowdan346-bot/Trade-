"""
OmniTradePro Apex V2.0 — Phase 6 Automated Robustness & Validation Tests.
Asserts data integrity, causality, cost sensitivity break-even thresholds,
regime vulnerabilities, baseline fairness, and bootstrap statistical uncertainty.
"""

import json
from pathlib import Path
import pytest


@pytest.fixture
def phase6_data():
    audit_path = Path(__file__).parent.parent / "scripts" / "phase6_audit_output.json"
    assert audit_path.exists(), f"Missing Phase 6 audit file: {audit_path}"
    with open(audit_path, "r", encoding="utf-8") as f:
        return json.load(f)


def test_phase6_lookahead_and_causality(phase6_data):
    """Verify zero causality violations, zero indicator lookahead, and causal fill execution."""
    lb = phase6_data["lookaheadBias"]
    assert lb["causalityViolations"] == 0
    assert lb["indicatorLookaheadDetected"] is False
    assert lb["fillExecutionCausal"] is True
    assert lb["status"] == "VERIFIED"


def test_phase6_data_integrity_and_provenance(phase6_data):
    """Verify timestamp monotonicity, lack of duplicates, and synthetic provenance marking."""
    di = phase6_data["dataIntegrity"]
    assert di["totalBars"] == 1500
    assert di["duplicateTimestamps"] == 0
    assert di["unorderedTimestamps"] == 0
    assert di["overnightGapCount"] == 3
    assert di["genuineHistoricalDataAvailable"] is False
    assert "NOT VERIFIED" in di["status"]


def test_phase6_cost_sensitivity_and_breakeven(phase6_data):
    """Assert cost sensitivity thresholds: Shoonya break-even slippage is ~14 bps and full service is unprofitable."""
    cs = phase6_data["costSensitivity"]
    assert cs["shoonyaBaseNet"] == 875.71
    assert cs["angelOneNet"] == 342.72
    assert cs["fullServiceNet"] == -719.28
    assert cs["breakEvenSlippageShoonyaBps"] == 14.0
    assert cs["status"] == "VERIFIED"


def test_phase6_regime_stress_and_vulnerabilities(phase6_data):
    """Assert regime outcomes: Bull and Bear are profitable, Choppy is 100% filtered, and Whipsaw incurs severe loss."""
    results = phase6_data["regimeStressTest"]["results"]
    regime_map = {r["name"]: r["result"] for r in results}

    assert regime_map["Bull Trend (Dedicated)"]["netPnL"] > 0
    assert regime_map["Bear Trend (Dedicated)"]["netPnL"] > 0
    assert regime_map["Choppy Sideways (Dedicated)"]["trades"] == 0
    assert regime_map["High Vol Whipsaw (Dedicated)"]["netPnL"] < 0
    assert regime_map["High Vol Whipsaw (Dedicated)"]["winRate"] == 0.0


def test_phase6_baseline_fairness(phase6_data):
    """Assert OmniTradePro (+875.71) outperforms unoptimized Dual SMA and RSI under identical costs."""
    bf = phase6_data["baselineFairness"]
    assert bf["omniTradePro"]["netPnL"] == 875.71
    assert bf["dualSMA"]["netPnL"] < 0
    assert bf["rsiStandalone"]["netPnL"] < -5000.0
    assert bf["randomBenchmark"]["netPnL"] < 0
    assert bf["status"] == "VERIFIED"


def test_phase6_serial_correlation_and_block_bootstrap(phase6_data):
    """Assert Durbin-Watson statistic, serial correlation, and non-parametric bootstrap bounds spanning zero."""
    sa = phase6_data["statisticalAssumptions"]
    assert 1.4 < sa["durbinWatson"] < 2.2
    assert abs(sa["lag1Autocorrelation"]) < 0.25
    assert sa["blockBootstrapCI95"][0] < 0.0  # Lower bound spans negative
    assert sa["blockBootstrapCI95"][1] > 0.0  # Upper bound positive
    assert sa["iidBootstrapCI95"][0] == -102.45
    assert sa["iidBootstrapCI95"][1] == 205.63
