"""
OmniTradePro Apex V2.0 — Phase 7.4.4
Independent Test Suite: Regulatory Evidence & Session Boundary Independent Audit

MODE: STRICT OFFLINE RESEARCH ONLY
No live broker connectivity, credentials, real orders, or real-money execution.

Scope & Authoritative Regulatory Sources of Truth:
1. CAS_ELIGIBLE:
   - SEBI Circular: CIR/MRD/DP/21/2010 (Introduction of Call Auction)
   - NSE Circular: NSE/CMTR/76941 (Muhurat CAS continuous trading close at 15:15:00)
2. NON_CAS:
   - NSE Circular: NSE/CMTR/13444 (Regular continuous market hours 09:15-15:30)
   - NSE Circular: NSE/CMTR/76941 (Continuous trading until 15:30:00 without early close)
3. SPECIAL_PREOPEN_IPO:
   - SEBI Circular: CIR/MRD/DP/01/2012 (Special Pre-Open Session for IPOs & Relisted)
4. ILLIQUID_CALL_AUCTION:
   - SEBI Circular: CIR/MRD/DP/6/2013 & CIR/MRD/DP/38/2013 (Periodic Call Auction)
5. BLOCK_DEAL:
   - SEBI Circular: SEBI/HO/MRD/DOS2/CIR/P/2017/110 & NSE/CMTR/76941 (13:50-14:05 window)
6. MUHURAT_SESSION:
   - NSE Circular: NSE/CMTR/76941 (Diwali Muhurat Trading Session, 2026-11-08)
7. POST_CLOSE:
   - NSE Circular: NSE/CMTR/13444 (Regular 15:40-16:00) & NSE/CMTR/76941 (Muhurat 15:50-16:00)
"""

import sys
from pathlib import Path

REPO_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(REPO_ROOT))

import pytest
from datetime import datetime, date, time, timezone, timedelta

from core.nse_calendar import (
    NseCalendar,
    SessionType,
    SecurityCategory,
    MuhuratSessionPhase,
    RandomClosureWindow,
    OrderEntryPermission,
    SecuritySessionEvaluation,
    RegulatoryRuleEvidence,
    REGULATORY_RULES_EVIDENCE_2026,
    RANDOM_CLOSURE_WINDOWS,
    MUHURAT_SESSION_2026,
    IST
)


# ============================================================================
# TASK 1: REGULATORY EVIDENCE AUDIT
# ============================================================================

class TestTask1RegulatoryEvidenceAudit:
    """
    Task 1: Audit official circular numbers, publication dates, source URLs,
    market segments, security categories, effective dates, and implementation match status.
    """

    REQUIRED_RULES = [
        "CAS_ELIGIBLE",
        "NON_CAS",
        "SPECIAL_PREOPEN_IPO",
        "ILLIQUID_CALL_AUCTION",
        "BLOCK_DEAL",
        "MUHURAT_SESSION",
        "POST_CLOSE"
    ]

    def test_all_seven_required_rules_registered_and_verified(self):
        """Every required regulatory rule must be registered with VERIFIED status."""
        for rule_id in self.REQUIRED_RULES:
            evidence = NseCalendar.get_regulatory_rule_evidence(rule_id)
            assert evidence is not None, f"Rule {rule_id} is missing from evidence registry"
            assert evidence.rule_id == rule_id
            assert evidence.verification_status == "VERIFIED"
            assert evidence.implementation_matches is True
            assert evidence.market_segment == "CAPITAL_MARKET"
            assert len(evidence.circular_ref) > 0
            assert len(evidence.circular_date) == 10  # YYYY-MM-DD
            assert len(evidence.effective_date) == 10
            assert len(evidence.source_url_or_ref) > 0
            assert len(evidence.notes) > 0

    def test_cas_eligible_evidence_provenance(self):
        """Verify regulatory evidence for CAS_ELIGIBLE."""
        ev = NseCalendar.get_regulatory_rule_evidence("CAS_ELIGIBLE")
        assert ev.circular_ref == "CIR/MRD/DP/21/2010"
        assert ev.circular_date == "2010-07-15"
        assert "sebi.gov.in" in ev.source_url_or_ref
        assert ev.security_category == "CAS_ELIGIBLE"
        assert "15:15:00" in ev.notes
        assert ev.implementation_matches is True

    def test_non_cas_evidence_provenance(self):
        """Verify regulatory evidence for NON_CAS."""
        ev = NseCalendar.get_regulatory_rule_evidence("NON_CAS")
        assert ev.circular_ref == "NSE/CMTR/13444"
        assert ev.circular_date == "2009-12-16"
        assert "nseindia.com" in ev.source_url_or_ref
        assert ev.security_category == "NON_CAS"
        assert "15:30:00" in ev.notes
        assert ev.implementation_matches is True

    def test_spos_ipo_evidence_provenance(self):
        """Verify regulatory evidence for SPECIAL_PREOPEN_IPO."""
        ev = NseCalendar.get_regulatory_rule_evidence("SPECIAL_PREOPEN_IPO")
        assert ev.circular_ref == "CIR/MRD/DP/01/2012"
        assert ev.circular_date == "2012-01-20"
        assert "sebi.gov.in" in ev.source_url_or_ref
        assert "10:00:00" in ev.notes
        assert ev.implementation_matches is True

    def test_pcais_illiquid_evidence_provenance(self):
        """Verify regulatory evidence for ILLIQUID_CALL_AUCTION."""
        ev = NseCalendar.get_regulatory_rule_evidence("ILLIQUID_CALL_AUCTION")
        assert ev.circular_ref == "CIR/MRD/DP/6/2013"
        assert ev.circular_date == "2013-01-24"
        assert "sebi.gov.in" in ev.source_url_or_ref
        assert "6 one-hour cycles" in ev.notes
        assert ev.implementation_matches is True

    def test_block_deal_evidence_provenance(self):
        """Verify regulatory evidence for BLOCK_DEAL."""
        ev = NseCalendar.get_regulatory_rule_evidence("BLOCK_DEAL")
        assert ev.circular_ref == "SEBI/HO/MRD/DOS2/CIR/P/2017/110"
        assert ev.circular_date == "2017-10-26"
        assert "13:50:00" in ev.notes
        assert ev.implementation_matches is True

    def test_muhurat_session_evidence_provenance(self):
        """Verify regulatory evidence for MUHURAT_SESSION."""
        ev = NseCalendar.get_regulatory_rule_evidence("MUHURAT_SESSION")
        assert ev.circular_ref == "NSE/CMTR/76941"
        assert ev.circular_date == "2026-10-19"
        assert ev.effective_date == "2026-11-08"
        assert "Diwali" in ev.notes
        assert ev.implementation_matches is True

    def test_post_close_evidence_provenance(self):
        """Verify regulatory evidence for POST_CLOSE."""
        ev = NseCalendar.get_regulatory_rule_evidence("POST_CLOSE")
        assert ev.circular_ref == "NSE/CMTR/13444"
        assert ev.circular_date == "2009-12-16"
        assert "closing price" in ev.notes
        assert ev.implementation_matches is True

    def test_unverified_rules_explicitly_flagged(self):
        """Unsupported or refuted claims must be explicitly marked UNVERIFIED with implementation_matches=False."""
        sat_dr = NseCalendar.get_regulatory_rule_evidence("UNVERIFIED_SATURDAY_DR")
        assert sat_dr is not None
        assert sat_dr.verification_status == "UNVERIFIED"
        assert sat_dr.implementation_matches is False
        assert "zero trading" in sat_dr.notes

        eve_muh = NseCalendar.get_regulatory_rule_evidence("UNVERIFIED_EVENING_MUHURAT")
        assert eve_muh is not None
        assert eve_muh.verification_status == "UNVERIFIED"
        assert eve_muh.implementation_matches is False
        assert "refutes" in eve_muh.notes

    def test_helper_get_all_rules_and_case_insensitivity(self):
        """Verify get_all_regulatory_rules dictionary and case-insensitive retrieval."""
        all_rules = NseCalendar.get_all_regulatory_rules()
        assert len(all_rules) >= 9
        for r_id in self.REQUIRED_RULES:
            assert r_id in all_rules

        assert NseCalendar.get_regulatory_rule_evidence("cas_eligible") == all_rules["CAS_ELIGIBLE"]
        assert NseCalendar.get_regulatory_rule_evidence("  non_cas  ") == all_rules["NON_CAS"]
        assert NseCalendar.get_regulatory_rule_evidence("UNKNOWN_RULE_XYZ") is None
        assert NseCalendar.get_regulatory_rule_evidence(None) is None
        assert NseCalendar.get_regulatory_rule_evidence("") is None


# ============================================================================
# TASK 2: 6-POINT BOUNDARY TESTING ACROSS EVERY SESSION PHASE
# ============================================================================

class TestTask2SixPointBoundaryVerification:
    """
    Task 2: Systematic 6-point boundary testing for every session phase:
    1. t_start - 1s
    2. t_start (exact start)
    3. t_start + 1s
    4. t_end - 1s
    5. t_end (exact end)
    6. t_end + 1s
    Documents and verifies interval inclusiveness/exclusiveness ([start, end) vs [start, end]).
    """

    def _eval(self, dt: datetime, cat: SecurityCategory = SecurityCategory.CAS_ELIGIBLE):
        return NseCalendar.evaluate_security_session(dt, cat)

    # ------------------------------------------------------------------------
    # Schedule 1: Diwali Muhurat (Sunday 2026-11-08)
    # ------------------------------------------------------------------------

    def test_muhurat_phase1_block_deal_boundary_6point(self):
        """
        Muhurat Block Deal Window: 13:50:00 to 14:05:00 IST [13:50:00, 14:05:00)
        - Start: 13:50:00 (Inclusive)
        - End: 14:05:00 (Exclusive — hands over to Pre-Open Order Entry)
        """
        p1 = datetime(2026, 11, 8, 13, 49, 59, tzinfo=IST)
        p2 = datetime(2026, 11, 8, 13, 50, 0, tzinfo=IST)
        p3 = datetime(2026, 11, 8, 13, 50, 1, tzinfo=IST)
        p4 = datetime(2026, 11, 8, 14, 4, 59, tzinfo=IST)
        p5 = datetime(2026, 11, 8, 14, 5, 0, tzinfo=IST)
        p6 = datetime(2026, 11, 8, 14, 5, 1, tzinfo=IST)

        assert self._eval(p1).granular_phase == "CLOSED"
        assert self._eval(p2).granular_phase == "BLOCK_DEAL"
        assert self._eval(p3).granular_phase == "BLOCK_DEAL"
        assert self._eval(p4).granular_phase == "BLOCK_DEAL"
        assert self._eval(p5).granular_phase == "PRE_OPEN_ENTRY"
        assert self._eval(p6).granular_phase == "PRE_OPEN_ENTRY"

    def test_muhurat_phase2_pre_open_entry_boundary_6point(self):
        """
        Muhurat Pre-Open Order Entry: 14:05:00 to 14:10:00 IST [14:05:00, 14:10:00)
        - Start: 14:05:00 (Inclusive)
        - End: 14:10:00 (Exclusive — hands over to Limit-Only Entry)
        """
        p1 = datetime(2026, 11, 8, 14, 4, 59, tzinfo=IST)
        p2 = datetime(2026, 11, 8, 14, 5, 0, tzinfo=IST)
        p3 = datetime(2026, 11, 8, 14, 5, 1, tzinfo=IST)
        p4 = datetime(2026, 11, 8, 14, 9, 59, tzinfo=IST)
        p5 = datetime(2026, 11, 8, 14, 10, 0, tzinfo=IST)
        p6 = datetime(2026, 11, 8, 14, 10, 1, tzinfo=IST)

        assert self._eval(p1).granular_phase == "BLOCK_DEAL"
        assert self._eval(p2).granular_phase == "PRE_OPEN_ENTRY"
        assert self._eval(p2).order_type_allowed == "ALL"
        assert self._eval(p3).granular_phase == "PRE_OPEN_ENTRY"
        assert self._eval(p4).granular_phase == "PRE_OPEN_ENTRY"
        assert self._eval(p5).granular_phase == "PRE_OPEN_LIMIT_ONLY"
        assert self._eval(p5).order_type_allowed == "LIMIT_ONLY"
        assert self._eval(p6).granular_phase == "PRE_OPEN_LIMIT_ONLY"

    def test_muhurat_phase3_pre_open_limit_only_and_random_closure_6point(self):
        """
        Muhurat Pre-Open Limit-Only: 14:10:00 to 14:15:00 IST [14:10:00, 14:15:00)
        Random closure window: 14:13:00 to 14:15:00 IST [14:13:00, 14:15:00)
        """
        # Outer Phase Boundaries
        p1 = datetime(2026, 11, 8, 14, 9, 59, tzinfo=IST)
        p2 = datetime(2026, 11, 8, 14, 10, 0, tzinfo=IST)
        p3 = datetime(2026, 11, 8, 14, 10, 1, tzinfo=IST)
        p4 = datetime(2026, 11, 8, 14, 14, 59, tzinfo=IST)
        p5 = datetime(2026, 11, 8, 14, 15, 0, tzinfo=IST)
        p6 = datetime(2026, 11, 8, 14, 15, 1, tzinfo=IST)

        assert self._eval(p1).granular_phase == "PRE_OPEN_ENTRY"
        assert self._eval(p2).granular_phase == "PRE_OPEN_LIMIT_ONLY"
        assert self._eval(p2).is_random_closure_interval is False
        assert self._eval(p3).granular_phase == "PRE_OPEN_LIMIT_ONLY"
        assert self._eval(p4).granular_phase == "PRE_OPEN_LIMIT_ONLY"
        assert self._eval(p4).is_random_closure_interval is True
        assert self._eval(p5).granular_phase == "PRE_OPEN_MATCHING"
        assert self._eval(p5).is_random_closure_interval is False
        assert self._eval(p6).granular_phase == "PRE_OPEN_MATCHING"

        # Internal Random Closure Window Boundaries (14:13:00 to 14:15:00)
        rw1 = datetime(2026, 11, 8, 14, 12, 59, tzinfo=IST)
        rw2 = datetime(2026, 11, 8, 14, 13, 0, tzinfo=IST)
        rw3 = datetime(2026, 11, 8, 14, 13, 1, tzinfo=IST)
        rw4 = datetime(2026, 11, 8, 14, 14, 59, tzinfo=IST)
        rw5 = datetime(2026, 11, 8, 14, 15, 0, tzinfo=IST)

        assert self._eval(rw1).is_random_closure_interval is False
        assert self._eval(rw2).is_random_closure_interval is True
        assert self._eval(rw3).is_random_closure_interval is True
        assert self._eval(rw4).is_random_closure_interval is True
        assert self._eval(rw5).is_random_closure_interval is False

    def test_muhurat_phase4_pre_open_matching_boundary_6point(self):
        """
        Muhurat Pre-Open Matching: 14:15:00 to 14:17:00 IST [14:15:00, 14:17:00)
        - Start: 14:15:00 (Inclusive)
        - End: 14:17:00 (Exclusive — hands over to Buffer)
        """
        p1 = datetime(2026, 11, 8, 14, 14, 59, tzinfo=IST)
        p2 = datetime(2026, 11, 8, 14, 15, 0, tzinfo=IST)
        p3 = datetime(2026, 11, 8, 14, 15, 1, tzinfo=IST)
        p4 = datetime(2026, 11, 8, 14, 16, 59, tzinfo=IST)
        p5 = datetime(2026, 11, 8, 14, 17, 0, tzinfo=IST)
        p6 = datetime(2026, 11, 8, 14, 17, 1, tzinfo=IST)

        assert self._eval(p1).granular_phase == "PRE_OPEN_LIMIT_ONLY"
        assert self._eval(p2).granular_phase == "PRE_OPEN_MATCHING"
        assert self._eval(p2).is_order_entry_allowed is False
        assert self._eval(p3).granular_phase == "PRE_OPEN_MATCHING"
        assert self._eval(p4).granular_phase == "PRE_OPEN_MATCHING"
        assert self._eval(p5).granular_phase == "PRE_OPEN_BUFFER"
        assert self._eval(p6).granular_phase == "PRE_OPEN_BUFFER"

    def test_muhurat_phase5_pre_open_buffer_boundary_6point(self):
        """
        Muhurat Pre-Open Buffer: 14:17:00 to 14:20:00 IST [14:17:00, 14:20:00)
        - Start: 14:17:00 (Inclusive)
        - End: 14:20:00 (Exclusive — hands over to Continuous Trading)
        """
        p1 = datetime(2026, 11, 8, 14, 16, 59, tzinfo=IST)
        p2 = datetime(2026, 11, 8, 14, 17, 0, tzinfo=IST)
        p3 = datetime(2026, 11, 8, 14, 17, 1, tzinfo=IST)
        p4 = datetime(2026, 11, 8, 14, 19, 59, tzinfo=IST)
        p5 = datetime(2026, 11, 8, 14, 20, 0, tzinfo=IST)
        p6 = datetime(2026, 11, 8, 14, 20, 1, tzinfo=IST)

        assert self._eval(p1).granular_phase == "PRE_OPEN_MATCHING"
        assert self._eval(p2).granular_phase == "PRE_OPEN_BUFFER"
        assert self._eval(p2).is_continuous_trading is False
        assert self._eval(p3).granular_phase == "PRE_OPEN_BUFFER"
        assert self._eval(p4).granular_phase == "PRE_OPEN_BUFFER"
        assert self._eval(p5).granular_phase == "CONTINUOUS_TRADING"
        assert self._eval(p5).is_continuous_trading is True
        assert self._eval(p6).granular_phase == "CONTINUOUS_TRADING"

    def test_muhurat_phase6_continuous_trading_cas_eligible_6point(self):
        """
        CAS_ELIGIBLE Continuous Trading: 14:20:00 to 15:15:00 IST [14:20:00, 15:15:00)
        - Start: 14:20:00 (Inclusive)
        - End: 15:15:00 (Exclusive — closes continuous trading and hands over to CAS_TRANSITION)
        """
        p1 = datetime(2026, 11, 8, 14, 19, 59, tzinfo=IST)
        p2 = datetime(2026, 11, 8, 14, 20, 0, tzinfo=IST)
        p3 = datetime(2026, 11, 8, 14, 20, 1, tzinfo=IST)
        p4 = datetime(2026, 11, 8, 15, 14, 59, tzinfo=IST)
        p5 = datetime(2026, 11, 8, 15, 15, 0, tzinfo=IST)
        p6 = datetime(2026, 11, 8, 15, 15, 1, tzinfo=IST)

        assert self._eval(p1, SecurityCategory.CAS_ELIGIBLE).is_continuous_trading is False
        assert self._eval(p2, SecurityCategory.CAS_ELIGIBLE).is_continuous_trading is True
        assert self._eval(p3, SecurityCategory.CAS_ELIGIBLE).is_continuous_trading is True
        assert self._eval(p4, SecurityCategory.CAS_ELIGIBLE).is_continuous_trading is True
        assert self._eval(p5, SecurityCategory.CAS_ELIGIBLE).is_continuous_trading is False
        assert self._eval(p5, SecurityCategory.CAS_ELIGIBLE).granular_phase == "CAS_TRANSITION"
        assert self._eval(p6, SecurityCategory.CAS_ELIGIBLE).granular_phase == "CAS_TRANSITION"

    def test_muhurat_phase6_continuous_trading_non_cas_6point(self):
        """
        NON_CAS Continuous Trading: 14:20:00 to 15:30:00 IST [14:20:00, 15:30:00)
        - Start: 14:20:00 (Inclusive)
        - End: 15:30:00 (Normal continuous market closes at 15:30:00)
        """
        p1 = datetime(2026, 11, 8, 14, 19, 59, tzinfo=IST)
        p2 = datetime(2026, 11, 8, 14, 20, 0, tzinfo=IST)
        p3 = datetime(2026, 11, 8, 14, 20, 1, tzinfo=IST)
        p4 = datetime(2026, 11, 8, 15, 29, 59, tzinfo=IST)
        p5 = datetime(2026, 11, 8, 15, 30, 0, tzinfo=IST)
        p6 = datetime(2026, 11, 8, 15, 30, 1, tzinfo=IST)

        assert self._eval(p1, SecurityCategory.NON_CAS).is_continuous_trading is False
        assert self._eval(p2, SecurityCategory.NON_CAS).is_continuous_trading is True
        assert self._eval(p3, SecurityCategory.NON_CAS).is_continuous_trading is True
        assert self._eval(p4, SecurityCategory.NON_CAS).is_continuous_trading is True
        assert self._eval(p5, SecurityCategory.NON_CAS).is_continuous_trading is False
        assert self._eval(p5, SecurityCategory.NON_CAS).granular_phase == "CLOSED"
        assert self._eval(p6, SecurityCategory.NON_CAS).granular_phase == "CLOSED"

    def test_muhurat_phase7_cas_transition_boundary_6point(self):
        """
        Muhurat CAS Reference Transition: 15:15:00 to 15:20:00 IST [15:15:00, 15:20:00)
        """
        p1 = datetime(2026, 11, 8, 15, 14, 59, tzinfo=IST)
        p2 = datetime(2026, 11, 8, 15, 15, 0, tzinfo=IST)
        p3 = datetime(2026, 11, 8, 15, 15, 1, tzinfo=IST)
        p4 = datetime(2026, 11, 8, 15, 19, 59, tzinfo=IST)
        p5 = datetime(2026, 11, 8, 15, 20, 0, tzinfo=IST)
        p6 = datetime(2026, 11, 8, 15, 20, 1, tzinfo=IST)

        assert self._eval(p1).granular_phase == "CONTINUOUS_TRADING"
        assert self._eval(p2).granular_phase == "CAS_TRANSITION"
        assert self._eval(p2).is_order_entry_allowed is False
        assert self._eval(p3).granular_phase == "CAS_TRANSITION"
        assert self._eval(p4).granular_phase == "CAS_TRANSITION"
        assert self._eval(p5).granular_phase == "CLOSING_AUCTION_ENTRY"
        assert self._eval(p6).granular_phase == "CLOSING_AUCTION_ENTRY"

    def test_muhurat_phase8_closing_auction_entry_boundary_6point(self):
        """
        Muhurat Closing Auction Entry: 15:20:00 to 15:25:00 IST [15:20:00, 15:25:00)
        """
        p1 = datetime(2026, 11, 8, 15, 19, 59, tzinfo=IST)
        p2 = datetime(2026, 11, 8, 15, 20, 0, tzinfo=IST)
        p3 = datetime(2026, 11, 8, 15, 20, 1, tzinfo=IST)
        p4 = datetime(2026, 11, 8, 15, 24, 59, tzinfo=IST)
        p5 = datetime(2026, 11, 8, 15, 25, 0, tzinfo=IST)
        p6 = datetime(2026, 11, 8, 15, 25, 1, tzinfo=IST)

        assert self._eval(p1).granular_phase == "CAS_TRANSITION"
        assert self._eval(p2).granular_phase == "CLOSING_AUCTION_ENTRY"
        assert self._eval(p2).order_type_allowed == "ALL"
        assert self._eval(p3).granular_phase == "CLOSING_AUCTION_ENTRY"
        assert self._eval(p4).granular_phase == "CLOSING_AUCTION_ENTRY"
        assert self._eval(p5).granular_phase == "CAS_LIMIT_ONLY"
        assert self._eval(p5).order_type_allowed == "LIMIT_ONLY"
        assert self._eval(p6).granular_phase == "CAS_LIMIT_ONLY"

    def test_muhurat_phase9_cas_limit_only_and_random_closure_6point(self):
        """
        Muhurat CAS Limit-Only Entry: 15:25:00 to 15:30:00 IST [15:25:00, 15:30:00)
        Random closure window: 15:28:00 to 15:30:00 IST [15:28:00, 15:30:00)
        """
        p1 = datetime(2026, 11, 8, 15, 24, 59, tzinfo=IST)
        p2 = datetime(2026, 11, 8, 15, 25, 0, tzinfo=IST)
        p3 = datetime(2026, 11, 8, 15, 25, 1, tzinfo=IST)
        p4 = datetime(2026, 11, 8, 15, 29, 59, tzinfo=IST)
        p5 = datetime(2026, 11, 8, 15, 30, 0, tzinfo=IST)
        p6 = datetime(2026, 11, 8, 15, 30, 1, tzinfo=IST)

        assert self._eval(p1).granular_phase == "CLOSING_AUCTION_ENTRY"
        assert self._eval(p2).granular_phase == "CAS_LIMIT_ONLY"
        assert self._eval(p2).is_random_closure_interval is False
        assert self._eval(p3).granular_phase == "CAS_LIMIT_ONLY"
        assert self._eval(p4).granular_phase == "CAS_LIMIT_ONLY"
        assert self._eval(p4).is_random_closure_interval is True
        assert self._eval(p5).granular_phase == "CLOSING_AUCTION_MATCHING"
        assert self._eval(p5).is_random_closure_interval is False
        assert self._eval(p6).granular_phase == "CLOSING_AUCTION_MATCHING"

        # Internal Random Closure Window Boundaries (15:28:00 to 15:30:00)
        rw1 = datetime(2026, 11, 8, 15, 27, 59, tzinfo=IST)
        rw2 = datetime(2026, 11, 8, 15, 28, 0, tzinfo=IST)
        rw3 = datetime(2026, 11, 8, 15, 28, 1, tzinfo=IST)
        rw4 = datetime(2026, 11, 8, 15, 29, 59, tzinfo=IST)
        rw5 = datetime(2026, 11, 8, 15, 30, 0, tzinfo=IST)

        assert self._eval(rw1).is_random_closure_interval is False
        assert self._eval(rw2).is_random_closure_interval is True
        assert self._eval(rw3).is_random_closure_interval is True
        assert self._eval(rw4).is_random_closure_interval is True
        assert self._eval(rw5).is_random_closure_interval is False

    def test_muhurat_phase10_cas_matching_boundary_6point(self):
        """
        Muhurat CAS Order Matching: 15:30:00 to 15:35:00 IST [15:30:00, 15:35:00)
        """
        p1 = datetime(2026, 11, 8, 15, 29, 59, tzinfo=IST)
        p2 = datetime(2026, 11, 8, 15, 30, 0, tzinfo=IST)
        p3 = datetime(2026, 11, 8, 15, 30, 1, tzinfo=IST)
        p4 = datetime(2026, 11, 8, 15, 34, 59, tzinfo=IST)
        p5 = datetime(2026, 11, 8, 15, 35, 0, tzinfo=IST)
        p6 = datetime(2026, 11, 8, 15, 35, 1, tzinfo=IST)

        assert self._eval(p1).granular_phase == "CAS_LIMIT_ONLY"
        assert self._eval(p2).granular_phase == "CLOSING_AUCTION_MATCHING"
        assert self._eval(p2).is_order_entry_allowed is False
        assert self._eval(p3).granular_phase == "CLOSING_AUCTION_MATCHING"
        assert self._eval(p4).granular_phase == "CLOSING_AUCTION_MATCHING"
        assert self._eval(p5).granular_phase == "CAS_TRANSITION_BUFFER"
        assert self._eval(p6).granular_phase == "CAS_TRANSITION_BUFFER"

    def test_muhurat_phase11_cas_transition_buffer_boundary_6point(self):
        """
        Muhurat CAS Transition Buffer: 15:35:00 to 15:50:00 IST [15:35:00, 15:50:00)
        """
        p1 = datetime(2026, 11, 8, 15, 34, 59, tzinfo=IST)
        p2 = datetime(2026, 11, 8, 15, 35, 0, tzinfo=IST)
        p3 = datetime(2026, 11, 8, 15, 35, 1, tzinfo=IST)
        p4 = datetime(2026, 11, 8, 15, 49, 59, tzinfo=IST)
        p5 = datetime(2026, 11, 8, 15, 50, 0, tzinfo=IST)
        p6 = datetime(2026, 11, 8, 15, 50, 1, tzinfo=IST)

        assert self._eval(p1).granular_phase == "CLOSING_AUCTION_MATCHING"
        assert self._eval(p2).granular_phase == "CAS_TRANSITION_BUFFER"
        assert self._eval(p2).is_order_entry_allowed is False
        assert self._eval(p3).granular_phase == "CAS_TRANSITION_BUFFER"
        assert self._eval(p4).granular_phase == "CAS_TRANSITION_BUFFER"
        assert self._eval(p5).granular_phase == "CLOSING_SESSION"
        assert self._eval(p6).granular_phase == "CLOSING_SESSION"

    def test_muhurat_phase12_closing_session_boundary_6point(self):
        """
        Muhurat Closing Session: 15:50:00 to 16:00:00 IST [15:50:00, 16:00:00] (Both boundaries inclusive)
        At 16:00:00, it is CLOSING_SESSION. At 16:00:01, CLOSED.
        """
        p1 = datetime(2026, 11, 8, 15, 49, 59, tzinfo=IST)
        p2 = datetime(2026, 11, 8, 15, 50, 0, tzinfo=IST)
        p3 = datetime(2026, 11, 8, 15, 50, 1, tzinfo=IST)
        p4 = datetime(2026, 11, 8, 15, 59, 59, tzinfo=IST)
        p5 = datetime(2026, 11, 8, 16, 0, 0, tzinfo=IST)
        p6 = datetime(2026, 11, 8, 16, 0, 1, tzinfo=IST)

        assert self._eval(p1).granular_phase == "CAS_TRANSITION_BUFFER"
        assert self._eval(p2).granular_phase == "CLOSING_SESSION"
        assert self._eval(p2).session_type == SessionType.POST_CLOSE
        assert self._eval(p2).is_order_entry_allowed is True
        assert self._eval(p2).order_type_allowed == "LIMIT_ONLY"
        assert self._eval(p3).granular_phase == "CLOSING_SESSION"
        assert self._eval(p4).granular_phase == "CLOSING_SESSION"
        assert self._eval(p5).granular_phase == "CLOSING_SESSION"
        assert self._eval(p5).session_type == SessionType.POST_CLOSE
        assert self._eval(p6).granular_phase == "CLOSED"
        assert self._eval(p6).session_type == SessionType.CLOSED

    # ------------------------------------------------------------------------
    # Schedule 2: Special Pre-Open Session (SPOS) for IPO / Relisted
    # ------------------------------------------------------------------------

    def test_spos_ipo_boundaries_6point(self):
        """
        Regular Wednesday (2026-02-18) SPOS for Day-1 IPO:
        - 09:00:00 to 09:45:00: SPOS Order Entry (random closure 09:35 to 09:45)
        - 09:45:00 to 09:55:00: SPOS Matching
        - 09:55:00 to 10:00:00: SPOS Buffer
        - 10:00:00 to 15:30:00: Continuous Trading
        """
        cat = SecurityCategory.SPECIAL_PREOPEN_IPO

        # 09:00:00 start of SPOS
        assert self._eval(datetime(2026, 2, 18, 8, 59, 59, tzinfo=IST), cat).granular_phase == "CLOSED"
        assert self._eval(datetime(2026, 2, 18, 9, 0, 0, tzinfo=IST), cat).granular_phase == "SPOS_ORDER_ENTRY"
        assert self._eval(datetime(2026, 2, 18, 9, 0, 1, tzinfo=IST), cat).granular_phase == "SPOS_ORDER_ENTRY"

        # 09:35:00 start of Random Closure Window
        assert self._eval(datetime(2026, 2, 18, 9, 34, 59, tzinfo=IST), cat).is_random_closure_interval is False
        assert self._eval(datetime(2026, 2, 18, 9, 35, 0, tzinfo=IST), cat).is_random_closure_interval is True
        assert self._eval(datetime(2026, 2, 18, 9, 35, 1, tzinfo=IST), cat).is_random_closure_interval is True
        assert self._eval(datetime(2026, 2, 18, 9, 44, 59, tzinfo=IST), cat).is_random_closure_interval is True

        # 09:45:00 transition to SPOS Matching
        assert self._eval(datetime(2026, 2, 18, 9, 45, 0, tzinfo=IST), cat).granular_phase == "SPOS_MATCHING"
        assert self._eval(datetime(2026, 2, 18, 9, 45, 0, tzinfo=IST), cat).is_random_closure_interval is False
        assert self._eval(datetime(2026, 2, 18, 9, 45, 1, tzinfo=IST), cat).granular_phase == "SPOS_MATCHING"

        # 09:55:00 transition to SPOS Buffer
        assert self._eval(datetime(2026, 2, 18, 9, 54, 59, tzinfo=IST), cat).granular_phase == "SPOS_MATCHING"
        assert self._eval(datetime(2026, 2, 18, 9, 55, 0, tzinfo=IST), cat).granular_phase == "SPOS_BUFFER"
        assert self._eval(datetime(2026, 2, 18, 9, 55, 1, tzinfo=IST), cat).granular_phase == "SPOS_BUFFER"

        # 10:00:00 continuous trading open
        assert self._eval(datetime(2026, 2, 18, 9, 59, 59, tzinfo=IST), cat).is_continuous_trading is False
        assert self._eval(datetime(2026, 2, 18, 10, 0, 0, tzinfo=IST), cat).is_continuous_trading is True
        assert self._eval(datetime(2026, 2, 18, 10, 0, 0, tzinfo=IST), cat).granular_phase == "CONTINUOUS_TRADING"
        assert self._eval(datetime(2026, 2, 18, 10, 0, 1, tzinfo=IST), cat).is_continuous_trading is True

        # 15:30:00 continuous trading close
        assert self._eval(datetime(2026, 2, 18, 15, 29, 59, tzinfo=IST), cat).is_continuous_trading is True
        assert self._eval(datetime(2026, 2, 18, 15, 30, 0, tzinfo=IST), cat).is_continuous_trading is True
        assert self._eval(datetime(2026, 2, 18, 15, 30, 1, tzinfo=IST), cat).is_continuous_trading is False
        assert self._eval(datetime(2026, 2, 18, 15, 30, 1, tzinfo=IST), cat).granular_phase == "BUFFER"

    # ------------------------------------------------------------------------
    # Schedule 3: Periodic Call Auction for Illiquid Securities (PCAIS)
    # ------------------------------------------------------------------------

    def test_pcais_illiquid_boundaries_6point(self):
        """
        Regular Wednesday (2026-02-18) PCAIS Cycle 1 & Cycle 6 Boundaries:
        Cycle 1: 09:30:00 to 10:30:00 (Entry 09:30-10:15, Rand 10:14-10:15, Match 10:15-10:23, Buf 10:23-10:30)
        Cycle 6 End: 15:30:00 (Market close)
        """
        cat = SecurityCategory.ILLIQUID_CALL_AUCTION

        # Before Cycle 1
        assert self._eval(datetime(2026, 2, 18, 9, 29, 59, tzinfo=IST), cat).granular_phase == "CLOSED"

        # Cycle 1 Order Entry Start
        assert self._eval(datetime(2026, 2, 18, 9, 30, 0, tzinfo=IST), cat).granular_phase == "CALL_AUCTION_ORDER_ENTRY_CYCLE_1"
        assert self._eval(datetime(2026, 2, 18, 9, 30, 1, tzinfo=IST), cat).granular_phase == "CALL_AUCTION_ORDER_ENTRY_CYCLE_1"

        # Cycle 1 Random Closure Window Start (10:14:00)
        assert self._eval(datetime(2026, 2, 18, 10, 13, 59, tzinfo=IST), cat).is_random_closure_interval is False
        assert self._eval(datetime(2026, 2, 18, 10, 14, 0, tzinfo=IST), cat).is_random_closure_interval is True
        assert self._eval(datetime(2026, 2, 18, 10, 14, 1, tzinfo=IST), cat).is_random_closure_interval is True
        assert self._eval(datetime(2026, 2, 18, 10, 14, 59, tzinfo=IST), cat).is_random_closure_interval is True

        # Cycle 1 Matching Start (10:15:00)
        assert self._eval(datetime(2026, 2, 18, 10, 15, 0, tzinfo=IST), cat).granular_phase == "CALL_AUCTION_MATCHING_CYCLE_1"
        assert self._eval(datetime(2026, 2, 18, 10, 15, 0, tzinfo=IST), cat).is_random_closure_interval is False
        assert self._eval(datetime(2026, 2, 18, 10, 15, 1, tzinfo=IST), cat).granular_phase == "CALL_AUCTION_MATCHING_CYCLE_1"

        # Cycle 1 Buffer Start (10:23:00)
        assert self._eval(datetime(2026, 2, 18, 10, 22, 59, tzinfo=IST), cat).granular_phase == "CALL_AUCTION_MATCHING_CYCLE_1"
        assert self._eval(datetime(2026, 2, 18, 10, 23, 0, tzinfo=IST), cat).granular_phase == "CALL_AUCTION_BUFFER_CYCLE_1"
        assert self._eval(datetime(2026, 2, 18, 10, 23, 1, tzinfo=IST), cat).granular_phase == "CALL_AUCTION_BUFFER_CYCLE_1"

        # Cycle 2 Order Entry Start (10:30:00)
        assert self._eval(datetime(2026, 2, 18, 10, 29, 59, tzinfo=IST), cat).granular_phase == "CALL_AUCTION_BUFFER_CYCLE_1"
        assert self._eval(datetime(2026, 2, 18, 10, 30, 0, tzinfo=IST), cat).granular_phase == "CALL_AUCTION_ORDER_ENTRY_CYCLE_2"
        assert self._eval(datetime(2026, 2, 18, 10, 30, 1, tzinfo=IST), cat).granular_phase == "CALL_AUCTION_ORDER_ENTRY_CYCLE_2"

        # Cycle 6 Buffer End and Day Close (15:30:00)
        assert self._eval(datetime(2026, 2, 18, 15, 29, 59, tzinfo=IST), cat).granular_phase == "CALL_AUCTION_BUFFER_CYCLE_6"
        assert self._eval(datetime(2026, 2, 18, 15, 30, 0, tzinfo=IST), cat).granular_phase == "CLOSED"
        assert self._eval(datetime(2026, 2, 18, 15, 30, 1, tzinfo=IST), cat).granular_phase == "CLOSED"


# ============================================================================
# TASK 3: RANDOM CLOSURE AUDIT & ORDER PERMISSION VALIDATION
# ============================================================================

class TestTask3RandomClosureAudit:
    """
    Task 3: Random closure audit verifying exchange-controlled intervals,
    absence of falsely claimed deterministic closure seconds, explicit SIMULATED labeling,
    and market vs limit permission separation.
    """

    def test_random_closure_windows_are_intervals_not_singletons(self):
        """Random closure is an interval [start, end], not a single deterministic second."""
        for name, win in RANDOM_CLOSURE_WINDOWS.items():
            assert isinstance(win, RandomClosureWindow)
            assert win.window_start < win.window_end
            start_sec = win.window_start.hour * 3600 + win.window_start.minute * 60 + win.window_start.second
            end_sec = win.window_end.hour * 3600 + win.window_end.minute * 60 + win.window_end.second
            delta_sec = end_sec - start_sec
            assert delta_sec >= 60, f"Window {name} must span at least 60 seconds (got {delta_sec}s)"

    def test_simulated_exchange_closure_labeling(self):
        """Simulated exchange closure events must be explicitly labeled [SIMULATED]."""
        t_cur = datetime(2026, 11, 8, 14, 13, 45, tzinfo=IST)
        t_closure = datetime(2026, 11, 8, 14, 13, 30, tzinfo=IST)

        perm = NseCalendar.check_order_entry_permission(
            t_cur,
            security_category=SecurityCategory.CAS_ELIGIBLE,
            order_type="LIMIT",
            exchange_closure_time=t_closure
        )
        assert perm.is_allowed is False
        assert "[SIMULATED]" in perm.reason
        assert "Exchange random closure event already triggered" in perm.reason

    def test_multiple_simulated_closure_seconds_within_window(self):
        """
        Verify that any exchange-controlled timestamp within the random closure window
        is supported in simulation tests without treating it as an immutable official rule.
        """
        test_closure_seconds = [
            datetime(2026, 11, 8, 14, 13, 10, tzinfo=IST),
            datetime(2026, 11, 8, 14, 13, 42, tzinfo=IST),
            datetime(2026, 11, 8, 14, 14, 25, tzinfo=IST),
            datetime(2026, 11, 8, 14, 14, 58, tzinfo=IST),
        ]

        for closure_ts in test_closure_seconds:
            # 1 second before closure: order allowed
            t_before = closure_ts - timedelta(seconds=1)
            perm_before = NseCalendar.check_order_entry_permission(
                t_before,
                security_category=SecurityCategory.CAS_ELIGIBLE,
                order_type="LIMIT",
                exchange_closure_time=closure_ts
            )
            assert perm_before.is_allowed is True
            assert perm_before.is_random_closure_window is True

            # Exact closure second: order rejected
            perm_at = NseCalendar.check_order_entry_permission(
                closure_ts,
                security_category=SecurityCategory.CAS_ELIGIBLE,
                order_type="LIMIT",
                exchange_closure_time=closure_ts
            )
            assert perm_at.is_allowed is False
            assert "[SIMULATED]" in perm_at.reason

            # 1 second after closure: order rejected
            t_after = closure_ts + timedelta(seconds=1)
            perm_after = NseCalendar.check_order_entry_permission(
                t_after,
                security_category=SecurityCategory.CAS_ELIGIBLE,
                order_type="LIMIT",
                exchange_closure_time=closure_ts
            )
            assert perm_after.is_allowed is False
            assert "[SIMULATED]" in perm_after.reason

    def test_market_vs_limit_independent_permission_checks(self):
        """
        Verify that order type restrictions (e.g. LIMIT-only in 14:10-14:15)
        are enforced independently of session state classification.
        """
        t_limit_phase = datetime(2026, 11, 8, 14, 11, 30, tzinfo=IST)

        # Session state is PRE_OPEN, order entry allowed, but order_type_allowed is LIMIT_ONLY
        eval_res = NseCalendar.evaluate_security_session(t_limit_phase, SecurityCategory.CAS_ELIGIBLE)
        assert eval_res.session_type == SessionType.PRE_OPEN
        assert eval_res.is_order_entry_allowed is True
        assert eval_res.order_type_allowed == "LIMIT_ONLY"

        # LIMIT orders succeed
        perm_limit = NseCalendar.check_order_entry_permission(
            t_limit_phase,
            security_category=SecurityCategory.CAS_ELIGIBLE,
            order_type="LIMIT"
        )
        assert perm_limit.is_allowed is True

        # MARKET orders fail with clear reason
        perm_mkt = NseCalendar.check_order_entry_permission(
            t_limit_phase,
            security_category=SecurityCategory.CAS_ELIGIBLE,
            order_type="MARKET"
        )
        assert perm_mkt.is_allowed is False
        assert "Only LIMIT orders are permitted" in perm_mkt.reason
        assert "Rejected order type: MARKET" in perm_mkt.reason


# ============================================================================
# TASK 4: SECURITY CATEGORY METADATA VALIDATION
# ============================================================================

class TestTask4SecurityCategoryValidation:
    """
    Task 4: Ensure missing, invalid, or conflicting security category metadata
    is strictly rejected and never defaults to unsupported assumptions.
    """

    def test_missing_category_rejection(self):
        """None, empty string, or whitespace must raise ValueError."""
        with pytest.raises(ValueError, match="cannot be None"):
            NseCalendar.validate_security_category(None)

        with pytest.raises(ValueError, match="Invalid security category"):
            NseCalendar.validate_security_category("")

        with pytest.raises(ValueError, match="Invalid security category"):
            NseCalendar.validate_security_category("   ")

    def test_invalid_category_string_rejection(self):
        """Unsupported strings must raise ValueError."""
        invalid_names = [
            "FUTURES",
            "OPTIONS",
            "COMMODITY",
            "CRYPTO",
            "UNKNOWN",
            "INVALID_CAT",
            "REGULAR",
        ]
        for inv in invalid_names:
            with pytest.raises(ValueError, match="Invalid security category"):
                NseCalendar.validate_security_category(inv)

    def test_invalid_type_rejection(self):
        """Non-string, non-SecurityCategory types must raise ValueError."""
        with pytest.raises(ValueError, match="Invalid security category"):
            NseCalendar.validate_security_category(12345)

        with pytest.raises(ValueError, match="Invalid security category"):
            NseCalendar.validate_security_category({"category": "NON_CAS"})

    def test_evaluate_security_session_rejects_invalid_categories(self):
        """evaluate_security_session strictly enforces validation."""
        t_valid = datetime(2026, 11, 8, 14, 30, tzinfo=IST)
        with pytest.raises(ValueError):
            NseCalendar.evaluate_security_session(t_valid, None)

        with pytest.raises(ValueError):
            NseCalendar.evaluate_security_session(t_valid, "INVALID_CATEGORY")

    def test_all_four_categories_have_distinct_schedules(self):
        """Verify that all 4 security categories evaluate to distinct schedules."""
        # 1. On Regular Trading Day (Wednesday 2026-02-18 at 09:45:00 IST):
        # - CAS_ELIGIBLE: Continuous trading (09:15-15:30)
        # - NON_CAS: Continuous trading (09:15-15:30)
        # - SPECIAL_PREOPEN_IPO: SPOS Matching (09:45-09:55)
        # - ILLIQUID_CALL_AUCTION: PCAIS Order Entry (Cycle 1, 09:30-10:15)
        t_reg = datetime(2026, 2, 18, 9, 45, 0, tzinfo=IST)
        e_cas_reg = NseCalendar.evaluate_security_session(t_reg, SecurityCategory.CAS_ELIGIBLE)
        e_non_reg = NseCalendar.evaluate_security_session(t_reg, SecurityCategory.NON_CAS)
        e_spos_reg = NseCalendar.evaluate_security_session(t_reg, SecurityCategory.SPECIAL_PREOPEN_IPO)
        e_ill_reg = NseCalendar.evaluate_security_session(t_reg, SecurityCategory.ILLIQUID_CALL_AUCTION)

        assert e_cas_reg.is_continuous_trading is True
        assert e_cas_reg.granular_phase == "CONTINUOUS_TRADING"

        assert e_non_reg.is_continuous_trading is True
        assert e_non_reg.granular_phase == "CONTINUOUS_TRADING"

        assert e_spos_reg.is_continuous_trading is False
        assert e_spos_reg.granular_phase == "SPOS_MATCHING"

        assert e_ill_reg.is_continuous_trading is False
        assert e_ill_reg.granular_phase == "CALL_AUCTION_ORDER_ENTRY_CYCLE_1"

        # 2. On Muhurat Day (Sunday 2026-11-08 at 15:18:00 IST):
        # CAS diverges from NON_CAS (CAS in reference transition, NON_CAS in continuous trading)
        t_muh = datetime(2026, 11, 8, 15, 18, 0, tzinfo=IST)
        e_cas_muh = NseCalendar.evaluate_security_session(t_muh, SecurityCategory.CAS_ELIGIBLE)
        e_non_muh = NseCalendar.evaluate_security_session(t_muh, SecurityCategory.NON_CAS)
        e_spos_muh = NseCalendar.evaluate_security_session(t_muh, SecurityCategory.SPECIAL_PREOPEN_IPO)
        e_ill_muh = NseCalendar.evaluate_security_session(t_muh, SecurityCategory.ILLIQUID_CALL_AUCTION)

        assert e_cas_muh.granular_phase == "CAS_TRANSITION"
        assert e_cas_muh.is_continuous_trading is False

        assert e_non_muh.granular_phase == "CONTINUOUS_TRADING"
        assert e_non_muh.is_continuous_trading is True

        # SPOS and Illiquid have zero continuous trading at 15:18 on Muhurat Sunday
        assert e_spos_muh.granular_phase == "CLOSED"
        assert e_ill_muh.granular_phase == "CLOSED"
        assert e_ill_muh.is_continuous_trading is False


# ============================================================================
# TASK 6: SAFETY REGRESSION & LIVE EXECUTION INTERLOCK AUDIT
# ============================================================================

class TestTask6SafetyRegressionAndLiveInterlock:
    """
    Task 6: Audit safety interlock ensuring live broker execution remains permanently
    blocked across all entry points, and credential zero-exposure holds.
    """

    def test_live_execution_permanently_blocked(self):
        """Verify that live execution is permanently disabled by safety interlock."""
        from core.broker_adapter import BrokerAdapter, Order, OrderType
        from core.engine import TradingEngine

        adapter = BrokerAdapter()
        order = Order(
            symbol="RELIANCE",
            transaction_type="BUY",
            quantity=10,
            order_type=OrderType.LIMIT,
            price=2500.0
        )
        res = adapter.place_order(order)
        assert res is None, "BrokerAdapter must refuse live order placement"
        assert order.status == "REJECTED"
        assert "Live broker execution permanently disabled" in order.reject_reason

        # Trading engine rejects non-test fixture brokers
        class LiveBrokerSimulator:
            IS_TEST_FIXTURE = False
            def place_order(self, o):
                return "UNAUTHORIZED_LIVE_ORDER"

        engine = TradingEngine(broker=LiveBrokerSimulator())
        assert engine.place_order(order) is False

    def test_no_credentials_in_tracked_git_files(self):
        """Verify no sensitive API keys or credential files are tracked."""
        import subprocess
        res = subprocess.run(["git", "ls-files"], capture_output=True, text=True, cwd=str(REPO_ROOT))
        assert res.returncode == 0
        tracked_files = res.stdout.splitlines()
        forbidden_patterns = [".env", "credentials.json", "secrets.json", "private_key.pem"]
        for f in tracked_files:
            for pat in forbidden_patterns:
                assert not f.endswith(pat), f"Forbidden sensitive file tracked in git: {f}"
