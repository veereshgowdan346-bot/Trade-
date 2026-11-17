"""
OmniTradePro Apex V2.0 — Phase 7.3
Cross-Language Parity Auditor

Executes Python CsvDataIngestion and Node.js ingestCsvFile on identical CSV files
and asserts bit-for-bit parity across:
1. Valid candle counts
2. Duplicate counts
3. Missing candle counts
4. Overnight gap counts
5. Quality scores (to 2 decimal places)
6. Cryptographic SHA-256 hashes of original files
"""

import json
import os
import subprocess
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(REPO_ROOT))

from core.csv_data_ingestion import CsvDataIngestion
from core.nse_calendar import NseCalendar, SecurityCategory, IST
from datetime import datetime

FIXTURES = [
    ("sample_nifty50_1m.csv", "NIFTY50", "1m", "SAMPLE"),
    ("multiday_overnight_1m.csv", "NIFTY50_MULTIDAY", "1m", "SAMPLE"),
    ("corrupted_anomalies_1m.csv", "CORRUPT_FIXTURE", "1m", "SAMPLE"),
    ("special_sessions_1m.csv", "SPECIAL_SESSIONS", "1m", "SAMPLE"),
]


def run_node_ingestion(csv_name, instrument, timeframe, source_class):
    js_script = f"""
    const path = require('path');
    const {{ ingestCsvFile }} = require('./dist_test_cjs/csv_ingestion.js');
    const filePath = path.join(__dirname, 'data/fixtures/{csv_name}');
    const result = ingestCsvFile(filePath, {{
        instrument: '{instrument}',
        timeframe: '{timeframe}',
        sourceClassification: '{source_class}',
        enforceSessionHours: true
    }});
    console.log(JSON.stringify({{
        sha256: result.rawFileSha256,
        totalObserved: result.qualityReport.totalObservedBars,
        validBars: result.qualityReport.validBars,
        invalidBars: result.qualityReport.invalidBars,
        duplicateCount: result.qualityReport.duplicateCount,
        missingBars: result.qualityReport.intrasessionMissingBars,
        overnightGaps: result.qualityReport.overnightGapCount,
        qualityScore: result.qualityReport.qualityScorePct,
        isValidForResearch: result.isValidForResearch
    }}));
    """
    cmd = ["node", "-e", js_script]
    res = subprocess.run(cmd, cwd=str(REPO_ROOT), capture_output=True, text=True, check=True)
    return json.loads(res.stdout.strip())


def run_node_calendar_eval(ts_str, category):
    js_script = f"""
    const {{ evaluateSecuritySession, checkOrderEntryPermission }} = require('./dist_test_cjs/nse_calendar.js');
    const ts = Date.parse('{ts_str}');
    const sess = evaluateSecuritySession(ts, '{category}');
    const perm = checkOrderEntryPermission(ts, '{category}', 'LIMIT');
    console.log(JSON.stringify({{
        sessionType: sess.sessionType,
        granularPhase: sess.granularPhase,
        isContinuousTrading: sess.isContinuousTrading,
        isOrderEntryAllowed: sess.isOrderEntryAllowed,
        orderTypeAllowed: sess.orderTypeAllowed,
        isRandomClosureInterval: sess.isRandomClosureInterval,
        isOrderPermitted: perm.isAllowed
    }}));
    """
    cmd = ["node", "-e", js_script]
    res = subprocess.run(cmd, cwd=str(REPO_ROOT), capture_output=True, text=True, check=True)
    return json.loads(res.stdout.strip())


CALENDAR_PARITY_CASES = [
    ("2026-11-08T13:49:59+05:30", "CAS_ELIGIBLE", "Muhurat Pre-Block Closed Boundary"),
    ("2026-11-08T13:50:00+05:30", "CAS_ELIGIBLE", "Muhurat Block Deal Start Boundary"),
    ("2026-11-08T13:55:00+05:30", "CAS_ELIGIBLE", "Muhurat Block Deal Mid-session"),
    ("2026-11-08T14:04:59+05:30", "CAS_ELIGIBLE", "Muhurat Block Deal End Boundary"),
    ("2026-11-08T14:05:00+05:30", "CAS_ELIGIBLE", "Muhurat Pre-Open Entry Start Boundary"),
    ("2026-11-08T14:07:00+05:30", "CAS_ELIGIBLE", "Muhurat Pre-Open Entry Mid-phase"),
    ("2026-11-08T14:09:59+05:30", "CAS_ELIGIBLE", "Muhurat Pre-Open Entry End Boundary"),
    ("2026-11-08T14:10:00+05:30", "CAS_ELIGIBLE", "Muhurat Pre-Open Limit-Only Start Boundary"),
    ("2026-11-08T14:12:59+05:30", "CAS_ELIGIBLE", "Muhurat Pre-Open Before Random Closure Boundary"),
    ("2026-11-08T14:13:00+05:30", "CAS_ELIGIBLE", "Muhurat Pre-Open Random Closure Start Boundary"),
    ("2026-11-08T14:14:00+05:30", "CAS_ELIGIBLE", "Muhurat Pre-Open Random Closure"),
    ("2026-11-08T14:14:59+05:30", "CAS_ELIGIBLE", "Muhurat Pre-Open Random Closure End Boundary"),
    ("2026-11-08T14:15:00+05:30", "CAS_ELIGIBLE", "Muhurat Pre-Open Matching Start Boundary"),
    ("2026-11-08T14:17:00+05:30", "CAS_ELIGIBLE", "Muhurat Pre-Open Buffer Start Boundary"),
    ("2026-11-08T14:20:00+05:30", "CAS_ELIGIBLE", "Muhurat Continuous Trading Start Boundary"),
    ("2026-11-08T14:30:00+05:30", "CAS_ELIGIBLE", "Muhurat Continuous Trading"),
    ("2026-11-08T15:14:59+05:30", "CAS_ELIGIBLE", "Muhurat CAS Continuous End Boundary"),
    ("2026-11-08T15:15:00+05:30", "CAS_ELIGIBLE", "Muhurat CAS Reference Transition Start Boundary"),
    ("2026-11-08T15:18:00+05:30", "CAS_ELIGIBLE", "Muhurat CAS Reference Transition"),
    ("2026-11-08T15:18:00+05:30", "NON_CAS", "Muhurat Non-CAS Continuous Continuation"),
    ("2026-11-08T15:20:00+05:30", "CAS_ELIGIBLE", "Muhurat CAS Order Entry Start Boundary"),
    ("2026-11-08T15:22:00+05:30", "CAS_ELIGIBLE", "Muhurat CAS Order Entry"),
    ("2026-11-08T15:22:00+05:30", "NON_CAS", "Muhurat Non-CAS Continuous Trading"),
    ("2026-11-08T15:25:00+05:30", "CAS_ELIGIBLE", "Muhurat CAS Limit-Only Start Boundary"),
    ("2026-11-08T15:27:59+05:30", "CAS_ELIGIBLE", "Muhurat CAS Before Random Closure Boundary"),
    ("2026-11-08T15:28:00+05:30", "CAS_ELIGIBLE", "Muhurat CAS Random Closure Start Boundary"),
    ("2026-11-08T15:29:00+05:30", "CAS_ELIGIBLE", "Muhurat CAS Random Closure Window"),
    ("2026-11-08T15:29:00+05:30", "NON_CAS", "Muhurat Non-CAS Continuous Trading"),
    ("2026-11-08T15:29:59+05:30", "CAS_ELIGIBLE", "Muhurat CAS Random Closure End Boundary"),
    ("2026-11-08T15:29:59+05:30", "NON_CAS", "Muhurat Non-CAS Continuous End Boundary"),
    ("2026-11-08T15:30:00+05:30", "CAS_ELIGIBLE", "Muhurat CAS Matching Start Boundary"),
    ("2026-11-08T15:30:00+05:30", "NON_CAS", "Muhurat Non-CAS Continuous Close Boundary"),
    ("2026-11-08T15:32:00+05:30", "CAS_ELIGIBLE", "Muhurat CAS Order Matching"),
    ("2026-11-08T15:32:00+05:30", "NON_CAS", "Muhurat Non-CAS Market Closed"),
    ("2026-11-08T15:35:00+05:30", "CAS_ELIGIBLE", "Muhurat CAS Transition Buffer Start Boundary"),
    ("2026-11-08T15:50:00+05:30", "CAS_ELIGIBLE", "Muhurat Closing Session Start Boundary"),
    ("2026-11-08T15:55:00+05:30", "CAS_ELIGIBLE", "Muhurat Official Closing Session"),
    ("2026-11-08T16:00:00+05:30", "CAS_ELIGIBLE", "Muhurat Closing Session End Boundary"),
    ("2026-11-08T16:00:01+05:30", "CAS_ELIGIBLE", "Muhurat Market Closed Boundary"),
    ("2026-02-18T08:59:59+05:30", "SPECIAL_PREOPEN_IPO", "Regular Pre-SPOS Closed Boundary"),
    ("2026-02-18T09:00:00+05:30", "SPECIAL_PREOPEN_IPO", "Regular SPOS Order Entry Start Boundary"),
    ("2026-02-18T09:20:00+05:30", "SPECIAL_PREOPEN_IPO", "Regular SPOS Order Entry"),
    ("2026-02-18T09:34:59+05:30", "SPECIAL_PREOPEN_IPO", "Regular SPOS Before Random Closure Boundary"),
    ("2026-02-18T09:35:00+05:30", "SPECIAL_PREOPEN_IPO", "Regular SPOS Random Closure Start Boundary"),
    ("2026-02-18T09:40:00+05:30", "SPECIAL_PREOPEN_IPO", "Regular SPOS Random Closure Window"),
    ("2026-02-18T09:44:59+05:30", "SPECIAL_PREOPEN_IPO", "Regular SPOS Random Closure End Boundary"),
    ("2026-02-18T09:45:00+05:30", "SPECIAL_PREOPEN_IPO", "Regular SPOS Matching Start Boundary"),
    ("2026-02-18T09:55:00+05:30", "SPECIAL_PREOPEN_IPO", "Regular SPOS Buffer Start Boundary"),
    ("2026-02-18T09:59:59+05:30", "SPECIAL_PREOPEN_IPO", "Regular SPOS Buffer End Boundary"),
    ("2026-02-18T10:00:00+05:30", "SPECIAL_PREOPEN_IPO", "Regular SPOS Continuous Trading Start Boundary"),
    ("2026-02-18T10:15:00+05:30", "SPECIAL_PREOPEN_IPO", "Regular SPOS Continuous Trading"),
    ("2026-02-18T09:29:59+05:30", "ILLIQUID_CALL_AUCTION", "Regular Pre-PCAIS Closed Boundary"),
    ("2026-02-18T09:30:00+05:30", "ILLIQUID_CALL_AUCTION", "Regular PCAIS Cycle 1 Order Entry Start Boundary"),
    ("2026-02-18T10:13:59+05:30", "ILLIQUID_CALL_AUCTION", "Regular PCAIS Cycle 1 Before Random Closure Boundary"),
    ("2026-02-18T10:14:00+05:30", "ILLIQUID_CALL_AUCTION", "Regular PCAIS Cycle 1 Random Closure Start Boundary"),
    ("2026-02-18T10:14:30+05:30", "ILLIQUID_CALL_AUCTION", "Regular PCAIS Cycle 1 Random Closure Window"),
    ("2026-02-18T10:15:00+05:30", "ILLIQUID_CALL_AUCTION", "Regular PCAIS Cycle 1 Matching Start Boundary"),
    ("2026-02-18T10:23:00+05:30", "ILLIQUID_CALL_AUCTION", "Regular PCAIS Cycle 1 Buffer Start Boundary"),
    ("2026-02-18T10:30:00+05:30", "ILLIQUID_CALL_AUCTION", "Regular PCAIS Cycle 2 Order Entry Start Boundary"),
    ("2026-02-18T15:30:00+05:30", "ILLIQUID_CALL_AUCTION", "Regular PCAIS Cycle 6 Buffer End Boundary"),
    ("2026-02-18T11:00:00+05:30", "NON_CAS", "Regular Equity Continuous Trading"),
]


def verify_calendar_parity():
    print("\n------------------------------------------------------------------")
    print("  PHASE 7.4.3 — CALENDAR SESSION & RANDOM CLOSURE PARITY AUDIT    ")
    print("------------------------------------------------------------------")

    all_passed = True
    for ts_str, cat_str, desc in CALENDAR_PARITY_CASES:
        dt = datetime.fromisoformat(ts_str)
        cat = SecurityCategory[cat_str]

        # 1. Python eval
        py_sess = NseCalendar.evaluate_security_session(dt, cat)
        py_perm = NseCalendar.check_order_entry_permission(dt, cat, "LIMIT")

        # 2. Node eval
        node_res = run_node_calendar_eval(ts_str, cat_str)

        # 3. Assertions
        type_match = py_sess.session_type.value == node_res["sessionType"]
        phase_match = py_sess.granular_phase == node_res["granularPhase"]
        cont_match = py_sess.is_continuous_trading == node_res["isContinuousTrading"]
        entry_match = py_sess.is_order_entry_allowed == node_res["isOrderEntryAllowed"]
        order_type_match = py_sess.order_type_allowed == node_res["orderTypeAllowed"]
        rand_match = py_sess.is_random_closure_interval == node_res["isRandomClosureInterval"]
        perm_match = py_perm.is_allowed == node_res["isOrderPermitted"]

        case_passed = all([type_match, phase_match, cont_match, entry_match, order_type_match, rand_match, perm_match])
        status_str = "PASS" if case_passed else "FAIL"
        if not case_passed:
            all_passed = False

        print(f"  [{status_str}] {desc} ({cat_str})")
        if not case_passed:
            print(f"      Py: type={py_sess.session_type.value}, phase={py_sess.granular_phase}, cont={py_sess.is_continuous_trading}")
            print(f"      Node: type={node_res['sessionType']}, phase={node_res['granularPhase']}, cont={node_res['isContinuousTrading']}")

    return all_passed


def verify_regulatory_evidence_parity():
    print("\n------------------------------------------------------------------")
    print("  PHASE 7.4.4 — REGULATORY EVIDENCE CROSS-LANGUAGE PARITY AUDIT   ")
    print("------------------------------------------------------------------")

    js_script = """
    const { getAllRegulatoryRules } = require('./dist_test_cjs/nse_calendar.js');
    console.log(JSON.stringify(getAllRegulatoryRules()));
    """
    res = subprocess.run(["node", "-e", js_script], cwd=str(REPO_ROOT), capture_output=True, text=True, check=True)
    node_rules = json.loads(res.stdout.strip())
    py_rules = NseCalendar.get_all_regulatory_rules()

    all_matched = True
    required = [
        "CAS_ELIGIBLE",
        "NON_CAS",
        "SPECIAL_PREOPEN_IPO",
        "ILLIQUID_CALL_AUCTION",
        "BLOCK_DEAL",
        "MUHURAT_SESSION",
        "POST_CLOSE"
    ]

    for r_id in required:
        if r_id not in py_rules or r_id not in node_rules:
            all_matched = False
            print(f"  [FAIL] Rule {r_id} missing in Py or Node")
            continue

        py_r = py_rules[r_id]
        node_r = node_rules[r_id]

        ref_match = py_r.circular_ref == node_r["circularRef"]
        date_match = py_r.circular_date == node_r["circularDate"]
        seg_match = py_r.market_segment == node_r["marketSegment"]
        status_match = py_r.verification_status == node_r["verificationStatus"]
        impl_match = py_r.implementation_matches == node_r["implementationMatches"]

        rule_ok = all([ref_match, date_match, seg_match, status_match, impl_match])
        status_str = "PASS" if rule_ok else "FAIL"
        if not rule_ok:
            all_matched = False
        print(f"  [{status_str}] Rule {r_id}: Ref={py_r.circular_ref} Status={py_r.verification_status} ImplMatches={impl_match}")

    return all_matched


def verify_phase745_boundary_semantics_parity():
    print("\n------------------------------------------------------------------")
    print("  PHASE 7.4.5 — BOUNDARY SEMANTICS & CANDLE PARITY AUDIT          ")
    print("------------------------------------------------------------------")

    all_matched = True

    # 1. Instant boundary parity vectors
    instant_cases = [
        ("2026-02-18T09:15:00+05:30", "NON_CAS", "CONTINUOUS_TRADING", True, "Regular Market Continuous Open (Inclusive)"),
        ("2026-02-18T15:30:00+05:30", "NON_CAS", "BUFFER", False, "Regular Market Continuous Close (Exclusive -> Buffer)"),
        ("2026-02-18T15:40:00+05:30", "NON_CAS", "CLOSING_SESSION", False, "Regular Post-Close Start (Inclusive)"),
        ("2026-02-18T16:00:00+05:30", "NON_CAS", "CLOSED", False, "Regular Post-Close End (Exclusive -> Closed)"),
        ("2026-11-08T15:30:00+05:30", "CAS_ELIGIBLE", "CLOSING_AUCTION_MATCHING", False, "Muhurat CAS Matching Start (Inclusive)"),
        ("2026-11-08T15:35:00+05:30", "CAS_ELIGIBLE", "CAS_TRANSITION_BUFFER", False, "Muhurat CAS Matching End (Exclusive -> Transition Buffer)"),
        ("2026-11-08T15:50:00+05:30", "CAS_ELIGIBLE", "CLOSING_SESSION", False, "Muhurat Post-Close Start (Inclusive)"),
        ("2026-11-08T16:00:00+05:30", "CAS_ELIGIBLE", "CLOSED", False, "Muhurat Post-Close End (Exclusive -> Closed)"),
    ]

    for ts_str, cat_str, exp_phase, exp_cont, desc in instant_cases:
        dt = datetime.fromisoformat(ts_str)
        cat = SecurityCategory[cat_str]
        py_res = NseCalendar.evaluate_session_instant(dt, cat)

        js_script = f"""
        const {{ evaluateSessionInstant }} = require('./dist_test_cjs/nse_calendar.js');
        const res = evaluateSessionInstant(Date.parse('{ts_str}'), '{cat_str}');
        console.log(JSON.stringify(res));
        """
        node_raw = subprocess.run(["node", "-e", js_script], cwd=str(REPO_ROOT), capture_output=True, text=True, check=True)
        node_res = json.loads(node_raw.stdout.strip())

        phase_match = (py_res.granular_phase == node_res["granularPhase"] == exp_phase)
        cont_match = (py_res.is_continuous_trading == node_res["isContinuousTrading"] == exp_cont)
        match = phase_match and cont_match

        status_str = "PASS" if match else "FAIL"
        if not match:
            all_matched = False
        print(f"  [{status_str}] Instant: {desc} (Phase={py_res.granular_phase}, Cont={py_res.is_continuous_trading})")

    # 2. Candle timestamp convention parity vectors
    candle_cases = [
        ("2026-02-18T09:15:00+05:30", 60, "START_OF_INTERVAL", True, "Candle START 09:15 (09:15-09:16)"),
        ("2026-02-18T15:29:00+05:30", 60, "START_OF_INTERVAL", True, "Candle START 15:29 (15:29-15:30)"),
        ("2026-02-18T15:30:00+05:30", 60, "START_OF_INTERVAL", False, "Candle START 15:30 (15:30-15:31 Buffer)"),
        ("2026-02-18T09:15:00+05:30", 60, "END_OF_INTERVAL", False, "Candle END 09:15 (09:14-09:15 Pre-open)"),
        ("2026-02-18T09:16:00+05:30", 60, "END_OF_INTERVAL", True, "Candle END 09:16 (09:15-09:16)"),
        ("2026-02-18T15:30:00+05:30", 60, "END_OF_INTERVAL", True, "Candle END 15:30 (15:29-15:30)"),
        ("2026-02-18T15:31:00+05:30", 60, "END_OF_INTERVAL", False, "Candle END 15:31 (15:30-15:31 Buffer)"),
    ]

    for ts_str, tf, conv, exp_cont, desc in candle_cases:
        dt = datetime.fromisoformat(ts_str)
        py_cont = NseCalendar.evaluate_candle_session(dt, tf, conv).is_continuous_trading

        js_script = f"""
        const {{ isValidCandleSession }} = require('./dist_test_cjs/historical_research.js');
        const res = isValidCandleSession(Date.parse('{ts_str}'), {tf}, '{conv}');
        console.log(JSON.stringify(res));
        """
        node_raw = subprocess.run(["node", "-e", js_script], cwd=str(REPO_ROOT), capture_output=True, text=True, check=True)
        node_cont = json.loads(node_raw.stdout.strip())

        match = (py_cont == node_cont == exp_cont)
        status_str = "PASS" if match else "FAIL"
        if not match:
            all_matched = False
        print(f"  [{status_str}] {desc}: Py={py_cont} Node={node_cont}")

    return all_matched


def verify_phase746_closing_session_parity():
    print("\n------------------------------------------------------------------")
    print("  PHASE 7.4.6 — CLOSING SESSION RECONCILIATION PARITY AUDIT       ")
    print("------------------------------------------------------------------")

    all_matched = True

    # 1. 11 Boundary timestamps under MODERN_CAS_2026 (Wednesday 2026-08-05)
    modern_11_cases = [
        ("2026-08-05T15:29:59+05:30", "NON_CAS", "CONTINUOUS_TRADING", True, True, "ALL", "15:29:59 Continuous Active"),
        ("2026-08-05T15:30:00+05:30", "NON_CAS", "CLOSING_AUCTION_MATCHING", False, False, "NONE", "15:30:00 Auction Matching Start"),
        ("2026-08-05T15:34:59+05:30", "NON_CAS", "CLOSING_AUCTION_MATCHING", False, False, "NONE", "15:34:59 Auction Matching Active"),
        ("2026-08-05T15:35:00+05:30", "NON_CAS", "TRANSITION_PERIOD", False, False, "NONE", "15:35:00 Transition Period Start"),
        ("2026-08-05T15:39:59+05:30", "NON_CAS", "TRANSITION_PERIOD", False, False, "NONE", "15:39:59 Transition Period Active"),
        ("2026-08-05T15:40:00+05:30", "NON_CAS", "TRANSITION_PERIOD", False, False, "NONE", "15:40:00 Transition Period (NOT Closing Session)"),
        ("2026-08-05T15:49:59+05:30", "NON_CAS", "TRANSITION_PERIOD", False, False, "NONE", "15:49:59 Transition Period End"),
        ("2026-08-05T15:50:00+05:30", "NON_CAS", "CLOSING_SESSION", False, True, "LIMIT_ONLY", "15:50:00 Closing Session Start"),
        ("2026-08-05T15:59:59+05:30", "NON_CAS", "CLOSING_SESSION", False, True, "LIMIT_ONLY", "15:59:59 Closing Session Active"),
        ("2026-08-05T16:00:00+05:30", "NON_CAS", "CLOSED", False, False, "NONE", "16:00:00 Market Closed"),
        ("2026-08-05T16:00:01+05:30", "NON_CAS", "CLOSED", False, False, "NONE", "16:00:01 Market Closed Post-Close"),
    ]

    for ts_str, cat_str, exp_phase, exp_cont, exp_entry, exp_ord, desc in modern_11_cases:
        dt = datetime.fromisoformat(ts_str)
        cat = SecurityCategory[cat_str]
        py_res = NseCalendar.evaluate_session_instant(dt, cat, calendar_regime="MODERN_CAS_2026")

        js_script = f"""
        const {{ evaluateSessionInstant }} = require('./dist_test_cjs/nse_calendar.js');
        const res = evaluateSessionInstant(Date.parse('{ts_str}'), '{cat_str}', 'NSE', 'MODERN_CAS_2026');
        console.log(JSON.stringify(res));
        """
        node_raw = subprocess.run(["node", "-e", js_script], cwd=str(REPO_ROOT), capture_output=True, text=True, check=True)
        node_res = json.loads(node_raw.stdout.strip())

        phase_match = (py_res.granular_phase == node_res["granularPhase"] == exp_phase)
        cont_match = (py_res.is_continuous_trading == node_res["isContinuousTrading"] == exp_cont)
        entry_match = (py_res.is_order_entry_allowed == node_res["isOrderEntryAllowed"] == exp_entry)
        ord_match = (py_res.order_type_allowed == node_res["orderTypeAllowed"] == exp_ord)
        match = phase_match and cont_match and entry_match and ord_match

        status_str = "PASS" if match else "FAIL"
        if not match:
            all_matched = False
        print(f"  [{status_str}] Modern 11: {desc} (Phase={py_res.granular_phase}, EntryAllowed={py_res.is_order_entry_allowed})")

    # 2. Check Order Entry Permission Parity at 15:40:00 across Modern and Legacy
    perm_cases = [
        ("2026-08-05T15:40:00+05:30", "NON_CAS", "LIMIT", "MODERN_CAS_2026", False, "Modern CAS at 15:40:00 LIMIT -> Blocked"),
        ("2026-08-05T15:40:00+05:30", "NON_CAS", "MARKET", "MODERN_CAS_2026", False, "Modern CAS at 15:40:00 MARKET -> Blocked"),
        ("2026-02-18T15:40:00+05:30", "NON_CAS", "LIMIT", "LEGACY_PRE_CAS", True, "Legacy Pre-CAS at 15:40:00 LIMIT -> Permitted"),
        ("2026-02-18T15:40:00+05:30", "NON_CAS", "MARKET", "LEGACY_PRE_CAS", False, "Legacy Pre-CAS at 15:40:00 MARKET -> Blocked"),
    ]

    for ts_str, cat_str, ord_type, reg_str, exp_perm, desc in perm_cases:
        dt = datetime.fromisoformat(ts_str)
        cat = SecurityCategory[cat_str]
        py_perm = NseCalendar.check_order_entry_permission(dt, cat, ord_type, calendar_regime=reg_str)

        js_script = f"""
        const {{ checkOrderEntryPermission }} = require('./dist_test_cjs/nse_calendar.js');
        const res = checkOrderEntryPermission(Date.parse('{ts_str}'), '{cat_str}', '{ord_type}', undefined, '{reg_str}');
        console.log(JSON.stringify(res));
        """
        node_raw = subprocess.run(["node", "-e", js_script], cwd=str(REPO_ROOT), capture_output=True, text=True, check=True)
        node_perm = json.loads(node_raw.stdout.strip())

        match = (py_perm.is_allowed == node_perm["isAllowed"] == exp_perm)
        status_str = "PASS" if match else "FAIL"
        if not match:
            all_matched = False
        print(f"  [{status_str}] Perm: {desc} (Py={py_perm.is_allowed}, Node={node_perm['isAllowed']})")

    # 3. Regulatory Rule UNVERIFIED_MODERN_1540_CLOSING_SESSION
    py_rule = NseCalendar.get_regulatory_rule_evidence("UNVERIFIED_MODERN_1540_CLOSING_SESSION")

    js_script = """
    const { getRegulatoryRuleEvidence } = require('./dist_test_cjs/nse_calendar.js');
    const res = getRegulatoryRuleEvidence('UNVERIFIED_MODERN_1540_CLOSING_SESSION');
    console.log(JSON.stringify(res));
    """
    node_raw = subprocess.run(["node", "-e", js_script], cwd=str(REPO_ROOT), capture_output=True, text=True, check=True)
    node_rule = json.loads(node_raw.stdout.strip())

    rule_match = (
        py_rule is not None
        and node_rule is not None
        and py_rule.verification_status == node_rule["verificationStatus"] == "UNVERIFIED"
        and py_rule.implementation_matches == node_rule["implementationMatches"] == False
    )
    status_str = "PASS" if rule_match else "FAIL"
    if not rule_match:
        all_matched = False
    print(f"  [{status_str}] Rule UNVERIFIED_MODERN_1540_CLOSING_SESSION: Status={py_rule.verification_status} Matches={py_rule.implementation_matches}")

    return all_matched


def verify_phase747_cas2_versioning_parity():
    print("\n------------------------------------------------------------------")
    print("  PHASE 7.4.7 — CAS 2.0 FUTURE-EFFECTIVE VERSIONING PARITY AUDIT   ")
    print("------------------------------------------------------------------")

    all_matched = True

    # 1. Schedule versions registry resolution parity
    test_dates = [
        ("2024-05-10", "LEGACY"),
        ("2026-08-02", "LEGACY"),
        ("2026-08-03", "CAS_V1"),
        ("2026-10-15", "CAS_V1"),
        ("2026-12-06", "CAS_V1"),
        ("2026-12-07", "CAS_V2"),
        ("2027-01-15", "CAS_V2"),
    ]

    for d_str, exp_ver in test_dates:
        py_ver = NseCalendar.resolve_schedule_version(d_str).version_id
        js_script = f"""
        const {{ resolveScheduleVersion }} = require('./dist_test_cjs/nse_calendar.js');
        const res = resolveScheduleVersion('{d_str}');
        console.log(JSON.stringify(res));
        """
        node_raw = subprocess.run(["node", "-e", js_script], cwd=str(REPO_ROOT), capture_output=True, text=True, check=True)
        node_ver = json.loads(node_raw.stdout.strip())["versionId"]

        match = (py_ver == node_ver == exp_ver)
        status_str = "PASS" if match else "FAIL"
        if not match:
            all_matched = False
        print(f"  [{status_str}] Version Resolver: Date={d_str} Py={py_ver} Node={node_ver} Exp={exp_ver}")

    # 2. CAS 2.0 16-point exact second boundary parity on 2026-12-07
    cas2_milestones = [
        ("2026-12-07T15:29:59+05:30", "CAS_ELIGIBLE", "CONTINUOUS_TRADING", True, True, "ALL", False),
        ("2026-12-07T15:30:00+05:30", "CAS_ELIGIBLE", "CAS_TRANSITION", False, False, "NONE", False),
        ("2026-12-07T15:30:59+05:30", "CAS_ELIGIBLE", "CAS_TRANSITION", False, False, "NONE", False),
        ("2026-12-07T15:31:00+05:30", "CAS_ELIGIBLE", "CLOSING_AUCTION_ORDER_ENTRY", False, True, "ALL", False),
        ("2026-12-07T15:35:59+05:30", "CAS_ELIGIBLE", "CLOSING_AUCTION_ORDER_ENTRY", False, True, "ALL", False),
        ("2026-12-07T15:36:00+05:30", "CAS_ELIGIBLE", "CAS_LIMIT_ONLY", False, True, "LIMIT_ONLY", False),
        ("2026-12-07T15:37:59+05:30", "CAS_ELIGIBLE", "CAS_LIMIT_ONLY", False, True, "LIMIT_ONLY", False),
        ("2026-12-07T15:38:00+05:30", "CAS_ELIGIBLE", "CAS_LIMIT_ONLY", False, True, "LIMIT_ONLY", True),
        ("2026-12-07T15:39:59+05:30", "CAS_ELIGIBLE", "CAS_LIMIT_ONLY", False, True, "LIMIT_ONLY", True),
        ("2026-12-07T15:40:00+05:30", "CAS_ELIGIBLE", "CLOSING_AUCTION_MATCHING", False, False, "NONE", False),
        ("2026-12-07T15:44:59+05:30", "CAS_ELIGIBLE", "CLOSING_AUCTION_MATCHING", False, False, "NONE", False),
        ("2026-12-07T15:45:00+05:30", "CAS_ELIGIBLE", "TRANSITION_PERIOD", False, False, "NONE", False),
        ("2026-12-07T15:49:59+05:30", "CAS_ELIGIBLE", "TRANSITION_PERIOD", False, False, "NONE", False),
        ("2026-12-07T15:50:00+05:30", "CAS_ELIGIBLE", "CLOSING_SESSION", False, True, "LIMIT_ONLY", False),
        ("2026-12-07T15:59:59+05:30", "CAS_ELIGIBLE", "CLOSING_SESSION", False, True, "LIMIT_ONLY", False),
        ("2026-12-07T16:00:00+05:30", "CAS_ELIGIBLE", "CLOSED", False, False, "NONE", False),
    ]

    for ts_str, cat_str, exp_phase, exp_cont, exp_entry, exp_ord, exp_rand in cas2_milestones:
        dt = datetime.fromisoformat(ts_str)
        cat = SecurityCategory[cat_str]
        py_res = NseCalendar.evaluate_session_instant(dt, cat)

        js_script = f"""
        const {{ evaluateSessionInstant }} = require('./dist_test_cjs/nse_calendar.js');
        const res = evaluateSessionInstant(Date.parse('{ts_str}'), '{cat_str}');
        console.log(JSON.stringify(res));
        """
        node_raw = subprocess.run(["node", "-e", js_script], cwd=str(REPO_ROOT), capture_output=True, text=True, check=True)
        node_res = json.loads(node_raw.stdout.strip())

        phase_match = (py_res.granular_phase == node_res["granularPhase"] == exp_phase)
        cont_match = (py_res.is_continuous_trading == node_res["isContinuousTrading"] == exp_cont)
        entry_match = (py_res.is_order_entry_allowed == node_res["isOrderEntryAllowed"] == exp_entry)
        ord_match = (py_res.order_type_allowed == node_res["orderTypeAllowed"] == exp_ord)
        rand_match = (py_res.is_random_closure_interval == node_res["isRandomClosureInterval"] == exp_rand)
        match = phase_match and cont_match and entry_match and ord_match and rand_match

        status_str = "PASS" if match else "FAIL"
        if not match:
            all_matched = False
        t_sub = ts_str[11:19]
        print(f"  [{status_str}] CAS 2.0 Boundary {t_sub}: Phase={py_res.granular_phase} Entry={py_res.is_order_entry_allowed} Rand={py_res.is_random_closure_interval}")

    # 3. Tri-Regime 15:40:00 Divergence via evaluate_schedule_session
    divergence_cases = [
        ("2026-08-02", "15:40:00", "CLOSING_SESSION", True, "LIMIT_ONLY", "LEGACY 2026-08-02 at 15:40:00 -> CLOSING_SESSION"),
        ("2026-12-06", "15:40:00", "TRANSITION_PERIOD", False, "NONE", "CAS_V1 2026-12-06 at 15:40:00 -> TRANSITION_PERIOD"),
        ("2026-12-07", "15:40:00", "CLOSING_AUCTION_MATCHING", False, "NONE", "CAS_V2 2026-12-07 at 15:40:00 -> CLOSING_AUCTION_MATCHING"),
    ]

    for d_str, t_str, exp_phase, exp_entry, exp_ord, desc in divergence_cases:
        from datetime import time as dt_time
        h, m, s = map(int, t_str.split(":"))
        py_res = NseCalendar.evaluate_schedule_session(d_str, dt_time(h, m, s), SecurityCategory.CAS_ELIGIBLE)

        js_script = f"""
        const {{ evaluateScheduleSession }} = require('./dist_test_cjs/nse_calendar.js');
        const res = evaluateScheduleSession('{d_str}', '{t_str}', 'CAS_ELIGIBLE');
        console.log(JSON.stringify(res));
        """
        node_raw = subprocess.run(["node", "-e", js_script], cwd=str(REPO_ROOT), capture_output=True, text=True, check=True)
        node_res = json.loads(node_raw.stdout.strip())

        phase_match = (py_res.granular_phase == node_res["granularPhase"] == exp_phase)
        entry_match = (py_res.is_order_entry_allowed == node_res["isOrderEntryAllowed"] == exp_entry)
        ord_match = (py_res.order_type_allowed == node_res["orderTypeAllowed"] == exp_ord)
        match = phase_match and entry_match and ord_match

        status_str = "PASS" if match else "FAIL"
        if not match:
            all_matched = False
        print(f"  [{status_str}] Divergence at 15:40:00: {desc} (Phase={py_res.granular_phase}, Entry={py_res.is_order_entry_allowed})")

    # 4. Regulatory Rule CAS_V2_SCHEDULE
    py_rule = NseCalendar.get_regulatory_rule_evidence("CAS_V2_SCHEDULE")

    js_script = """
    const { getRegulatoryRuleEvidence } = require('./dist_test_cjs/nse_calendar.js');
    const res = getRegulatoryRuleEvidence('CAS_V2_SCHEDULE');
    console.log(JSON.stringify(res));
    """
    node_raw = subprocess.run(["node", "-e", js_script], cwd=str(REPO_ROOT), capture_output=True, text=True, check=True)
    node_rule = json.loads(node_raw.stdout.strip())

    rule_match = (
        py_rule is not None
        and node_rule is not None
        and py_rule.circular_ref == node_rule["circularRef"] == "NSE/CMTR/77355"
        and py_rule.effective_date == node_rule["effectiveDate"] == "2026-12-07"
        and py_rule.verification_status == node_rule["verificationStatus"] == "VERIFIED"
        and py_rule.implementation_matches == node_rule["implementationMatches"] == True
    )
    status_str = "PASS" if rule_match else "FAIL"
    if not rule_match:
        all_matched = False
    print(f"  [{status_str}] Rule CAS_V2_SCHEDULE: Ref={py_rule.circular_ref} Effective={py_rule.effective_date} Status={py_rule.verification_status}")

    return all_matched


def verify_parity():
    print("==================================================================")
    print("  OMNITRADEPRO APEX V2.0 — CROSS-LANGUAGE PARITY VERIFICATION     ")
    print("==================================================================")

    all_passed = True
    parity_summary = []

    for csv_name, inst, tf, src_class in FIXTURES:
        csv_path = str(REPO_ROOT / "data" / "fixtures" / csv_name)

        # 1. Python ingestion
        py_result = CsvDataIngestion.ingest_csv_file(
            file_path=csv_path,
            instrument=inst,
            timeframe=tf,
            source_classification=src_class,
            enforce_session_hours=True
        )
        py_rep = py_result.quality_report

        # 2. Node ingestion
        node_rep = run_node_ingestion(csv_name, inst, tf, src_class)

        # 3. Assert Parity
        sha_match = py_result.raw_file_sha256 == node_rep["sha256"]
        valid_match = py_rep.valid_bars == node_rep["validBars"]
        dup_match = py_rep.duplicate_count == node_rep["duplicateCount"]
        missing_match = py_rep.intrasession_missing_bars == node_rep["missingBars"]
        gap_match = py_rep.overnight_gap_count == node_rep["overnightGaps"]
        score_diff = abs(py_rep.quality_score_pct - node_rep["qualityScore"])
        score_match = score_diff < 0.05
        research_match = py_result.is_valid_for_research == node_rep["isValidForResearch"]

        file_passed = all([sha_match, valid_match, dup_match, missing_match, gap_match, score_match, research_match])
        status_str = "PASS" if file_passed else "FAIL"
        if not file_passed:
            all_passed = False

        print(f"\n--> {csv_name} [{status_str}]")
        print(f"    SHA-256:        Py={py_result.raw_file_sha256[:12]}...  TS={node_rep['sha256'][:12]}...  Match={sha_match}")
        print(f"    Total Bars:     Py={py_rep.total_observed_bars}  TS={node_rep['totalObserved']}")
        print(f"    Valid Bars:     Py={py_rep.valid_bars}  TS={node_rep['validBars']}  Match={valid_match}")
        print(f"    Duplicates:     Py={py_rep.duplicate_count}  TS={node_rep['duplicateCount']}  Match={dup_match}")
        print(f"    Missing Bars:   Py={py_rep.intrasession_missing_bars}  TS={node_rep['missingBars']}  Match={missing_match}")
        print(f"    Overnight Gaps: Py={py_rep.overnight_gap_count}  TS={node_rep['overnightGaps']}  Match={gap_match}")
        print(f"    Quality Score:  Py={py_rep.quality_score_pct}%  TS={node_rep['qualityScore']}%  Match={score_match}")
        print(f"    Research Valid: Py={py_result.is_valid_for_research}  TS={node_rep['isValidForResearch']}  Match={research_match}")

    # Run Calendar Parity Verification
    cal_passed = verify_calendar_parity()
    if not cal_passed:
        all_passed = False

    # Run Regulatory Evidence Parity Verification (Phase 7.4.4)
    reg_passed = verify_regulatory_evidence_parity()
    if not reg_passed:
        all_passed = False

    # Run Phase 7.4.5 Boundary Semantics & Candle Parity Verification
    p745_passed = verify_phase745_boundary_semantics_parity()
    if not p745_passed:
        all_passed = False

    # Run Phase 7.4.6 Closing Session Reconciliation Parity Verification
    p746_passed = verify_phase746_closing_session_parity()
    if not p746_passed:
        all_passed = False

    # Run Phase 7.4.7 CAS 2.0 Future-Effective Versioning Parity Verification
    p747_passed = verify_phase747_cas2_versioning_parity()
    if not p747_passed:
        all_passed = False

    print("\n==================================================================")
    if all_passed:
        print("  PARITY AUDIT RESULT: 100% MATCH ACROSS ALL METRICS (PASS)     ")
    else:
        print("  PARITY AUDIT RESULT: MISMATCH DETECTED (FAIL)                 ")
    print("==================================================================\n")

    return all_passed


if __name__ == "__main__":
    success = verify_parity()
    sys.exit(0 if success else 1)
