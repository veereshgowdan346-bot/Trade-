"""
OmniTradePro Apex V2.0 — Single Authoritative Rate Specification loader (Python).

Phase 2 (TAX-006 / ARCH-001): loads config/statutory_rates.json — the SAME file the
TypeScript engine loads. risk/statutory_cost.py mirrors src/lib/tax.ts semantics;
tests/test_cost_parity.py proves both engines agree on identical inputs.

Verification policy: rates without locally-supplied dated official documents carry
status UNVERIFIED (or UNSUPPORTED_NO_EVIDENCE for excluded segments). Changing any
rate value without attaching dated evidence violates audit policy.
"""

import json
from pathlib import Path
from typing import Any, Dict, Optional

_SPEC_CACHE: Optional[Dict[str, Any]] = None

SPEC_RELATIVE = Path("config") / "statutory_rates.json"


def _resolve_spec_path() -> Path:
    candidates = [
        Path.cwd() / SPEC_RELATIVE,
        Path(__file__).resolve().parent.parent / SPEC_RELATIVE,
        Path(__file__).resolve().parent.parent.parent / SPEC_RELATIVE,
    ]
    for p in candidates:
        if p.exists():
            return p
    raise FileNotFoundError(f"statutory rate spec not found (looked in: {candidates})")


def load_rate_spec() -> Dict[str, Any]:
    """Load and structurally validate the authoritative rate spec (cached)."""
    global _SPEC_CACHE
    if _SPEC_CACHE is not None:
        return _SPEC_CACHE
    raw = json.loads(_resolve_spec_path().read_text(encoding="utf-8"))
    if not isinstance(raw, dict) or not all(k in raw for k in ("segments", "brokers", "gst", "sebiTurnoverFee")):
        raise ValueError("rate spec: missing required sections (segments/brokers/gst/sebiTurnoverFee)")

    def _finite(name: str, v: Any) -> float:
        f = float(v)
        if f != f or f in (float("inf"), float("-inf")):
            raise ValueError(f"rate spec: {name} is not a finite number")
        return f

    _finite("gst.rate", raw["gst"]["rate"])
    _finite("sebiTurnoverFee.ratePerRupee", raw["sebiTurnoverFee"]["ratePerRupee"])
    _finite("slippageDefaults.entryBps", raw["slippageDefaults"]["entryBps"])
    for key, seg in raw["segments"].items():
        if seg.get("supported"):
            _finite(f"segments.{key}.stt.rate", seg["stt"]["rate"])
            _finite(f"segments.{key}.exchangeTxn.rate", seg["exchangeTxn"]["rate"])
            _finite(f"segments.{key}.stampDuty.rate", seg["stampDuty"]["rate"])
    for key, b in raw["brokers"].items():
        _finite(f"brokers.{key}.roundTripBrokerageFloor", b["roundTripBrokerageFloor"])
        _finite(f"brokers.{key}.minimumRoundTripDeduction", b["minimumRoundTripDeduction"])
    _SPEC_CACHE = raw
    return raw


def reset_rate_spec_cache() -> None:
    """Test helper: drop the cached spec after editing the JSON."""
    global _SPEC_CACHE
    _SPEC_CACHE = None
