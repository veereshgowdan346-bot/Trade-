# OmniTradePro Apex V2.0 — Phase 7.4.6
# Closing Session Timing Reconciliation & Final Calendar Consistency Audit Report

**Audit Mode**: STRICT OFFLINE SOFTWARE RESEARCH ONLY  
**Execution Safety Interlocks**: PERMANENTLY DISABLED (Simulated Mock Interfaces Only, Zero Live Broker Connectivity, Zero Capital at Risk)  
**Verification Date**: 2026-11-17  
**Software Target**: `core/nse_calendar.py`, `src/lib/nse_calendar.ts`, `core/historical_data_framework.py`, `src/lib/historical_research.ts`  
**Test Suites**: `tests/test_phase746_closing_session_reconciliation.py`, `scripts/run_comprehensive_tests.js`, `scripts/verify_cross_language_parity.py`  

---

## 1. Executive Summary & Safety Declaration

Phase 7.4.6 resolves the critical discrepancy between conflicting NSE market timing references—specifically the historical **15:40:00 IST** post-close trading opening vs the modern **15:50:00 IST** closing session opening under the Call Auction at Close (CAS) architecture.

### Non-Negotiable Safety Interlock Status
- **Live Execution**: Hardcoded to `DISABLED` (`LIVE_BROKER_EXECUTION_DISABLED = True / true`).
- **Mock Broker Invariants**: Order routing through `BrokerAdapter` or `gateway.ts` raises immediate exceptions or returns permanent rejection codes (`REJECTED_LIVE_EXECUTION_BLOCKED`).
- **Offline Environment**: Zero outbound API network requests, credentials purged from repository, and zero real capital at risk.

### Audit Verdict Summary
| Scope / Dimension | Previous State | Phase 7.4.6 Verified State | Verification Status |
| :--- | :--- | :--- | :--- |
| **15:40 vs 15:50 Reconciliation** | Conflicting documentation across circulars | Date- and regime-dependent schedule rigorously separated into `MODERN_CAS_2026` vs `LEGACY_PRE_CAS` | **VERIFIED & RESOLVED** |
| **Microstructural State at 15:40 (Modern)** | Ambiguous | `TRANSITION_PERIOD` (15:35:00 to 15:50:00 IST). Order entry is strictly prohibited | **VERIFIED** |
| **Purported Modern 15:40 Closing Session** | Unverified assertion | Refuted as unverified in `SESSION_RULES_REGISTRY` | **UNVERIFIED_REFUTED** |
| **Session States Mapped** | 3 coarse states | 6 distinct states (`CONTINUOUS_TRADING`, `CLOSING_AUCTION_ORDER_ENTRY`, `CLOSING_AUCTION_MATCHING`, `TRANSITION_PERIOD`, `CLOSING_SESSION`, `CLOSED`) | **VERIFIED** |
| **11-Point Microsecond Boundaries** | Boundary overlap ambiguity | Enforces strictly half-open interval semantics $[T_{\text{start}}, T_{\text{end}})$ across all 11 exact seconds | **VERIFIED** |
| **Candle Timestamp Semantics** | Mixed conventions | Duration-aware boundary checks supporting both `START_OF_INTERVAL` and `END_OF_INTERVAL` | **VERIFIED** |
| **Cross-Language Parity** | TypeScript partial parity | 100% bit-for-bit parity across Python and TypeScript across all test vectors | **VERIFIED** |

---

## 2. TASK 1 — Resolution of 15:40 vs 15:50 Closing Session Timings

### 2.1 The Regulatory & Historical Root Cause

The apparent conflict between **15:40 IST** and **15:50 IST** stems from two different historical regulatory regimes governing the NSE Capital Market segment:

```mermaid
flowchart TD
    subgraph LegacyPreCas["Legacy Pre-CAS Architecture (Effective: 2010-01-04 to 2026-08-02)"]
        L1["Continuous Trading<br>09:15:00 – 15:30:00"] -->|15:30:00 Close| L2["VWAP Calculation Buffer<br>15:30:00 – 15:40:00<br>(Closed / No Orders)"]
        L2 -->|15:40:00 Open| L3["Legacy Closing Session<br>15:40:00 – 16:00:00<br>(Post-Close Trading)"]
        L3 -->|16:00:00 Close| L4["Market Closed<br>16:00:00+"]
    end

    subgraph ModernCas["Modern CAS Architecture (Effective: 2026-08-03 Onwards)"]
        M1["Continuous Trading<br>09:15:00 – 15:30:00<br>(CAS Scrips close 15:15)"] -->|15:30:00 Close| M2["Closing Auction Matching<br>15:30:00 – 15:35:00<br>(Equilibrium Discovery)"]
        M2 -->|15:35:00| M3["Transition Period<br>15:35:00 – 15:50:00<br>(Reconciliation Buffer)"]
        M3 -->|15:50:00 Open| M4["Modern Closing Session<br>15:50:00 – 16:00:00<br>(Closing Price Trading)"]
        M4 -->|16:00:00 Close| M5["Market Closed<br>16:00:00+"]
    end
```

### 2.2 Regulatory Authority Matrix

1. **Legacy Pre-CAS Regime**:
   - **Governing Circular**: NSE Circular `NSE/CMTR/13444` dated December 16, 2009.
   - **Effective Window**: January 4, 2010 through August 2, 2026.
   - **Schedule**: Continuous trading ended at 15:30:00. A 10-minute buffer (15:30:00–15:40:00) calculated the volume-weighted average price (VWAP). The closing session operated from **15:40:00 to 16:00:00**.

2. **Modern CAS Regime**:
   - **Governing Policy Circular**: SEBI Circular `SEBI/HO/47/11/11(3)2025-MRD-POD2/I/2765/2026` dated June 15, 2026.
   - **Exchange Implementation Circular**: NSE Circular `NSE/CMTR/73362` dated July 10, 2026.
   - **Operational Guidelines Circular**: NSE Circular `NSE/CMTR/74466` dated August 1, 2026.
   - **Diwali Muhurat Confirmation Circular**: NSE Circular `NSE/CMTR/76941` dated October 19, 2026.
   - **Go-Live Date**: **August 3, 2026** (`CAS_GO_LIVE_DATE_2026 = 2026-08-03`).
   - **Schedule**: Continuous trading closes at 15:30:00 (15:15:00 for CAS scrips). Closing auction order entry runs 15:20:00–15:30:00. Closing auction matching runs 15:30:00–15:35:00. Transition period runs 15:35:00–15:50:00. The official closing session opens strictly at **15:50:00 IST** and concludes at **16:00:00 IST**.

### 2.3 Refutation of the Purported Modern 15:40 Timing

> [!WARNING]
> Any claim that the closing session opens at 15:40:00 IST on dates on or after August 3, 2026 is **UNVERIFIED and REFUTED**. Under the modern CAS architecture, the timestamp `15:40:00 IST` falls squarely inside the mandatory 15-minute `TRANSITION_PERIOD` (15:35:00 to 15:50:00 IST). During this window:
> - Order entry is strictly prohibited (`is_order_entry_allowed = False`).
> - Continuous trading is inactive (`is_continuous_trading = False`).
> - Exchange trade reconciliation and post-auction trade processing take place.

This has been formally registered in `SESSION_RULES_REGISTRY["UNVERIFIED_MODERN_1540_CLOSING_SESSION"]` with `verification_status = "UNVERIFIED"` and `implementation_matches = False`.

---

## 3. TASK 2 — Six Distinct Session States Representation

The calendar evaluation engine now distinguishes 6 explicit microstructural states without conflating transition periods, matching windows, or post-close trading:

| # | Session State | Granular Phase Identifier | Continuous Trading | Order Entry Allowed | Allowed Order Types | Description & Operational Purpose |
| :-: | :--- | :--- | :-: | :-: | :-: | :--- |
| **1** | **Regular Continuous Market** | `CONTINUOUS_TRADING` | `True` | `True` | `ALL` (Limit & Market) | Standard continuous two-sided limit order book matching |
| **2** | **Closing Auction Order Entry** | `CLOSING_AUCTION_ORDER_ENTRY`<br>*(or `CAS_LIMIT_ONLY`)* | `False` | `True` | `ALL` (15:20–15:28)<br>`LIMIT_ONLY` (15:28–15:30) | Order entry/modification for equilibrium closing price discovery (random closure window 15:28–15:30) |
| **3** | **Closing Auction Matching** | `CLOSING_AUCTION_MATCHING` | `False` | `False` | `NONE` | Multilateral trade matching and equilibrium closing price determination (15:30:00–15:35:00) |
| **4** | **Transition Period** | `TRANSITION_PERIOD`<br>*(or `CAS_TRANSITION`)* | `False` | `False` | `NONE` | Post-auction trade confirmation and clearing reconciliation buffer (15:35:00–15:50:00) |
| **5** | **Closing Session** | `CLOSING_SESSION` | `False` | `True` | `LIMIT_ONLY` | Post-close trading strictly at determined closing price; market orders prohibited (15:50:00–16:00:00) |
| **6** | **Post-Close Closed State** | `CLOSED` | `False` | `False` | `NONE` | Market closed; all order submission, modification, and execution blocked (16:00:00+) |

---

## 4. TASK 3 — Microstructural Boundary Testing Across 11 Exact Seconds

Following strictly half-open interval semantics $[T_{\text{start}}, T_{\text{end}})$, every session boundary is evaluated at 1-second precision. A session's closing timestamp is **exclusive** and terminates participation in that phase.

### Modern CAS Regime Evaluation (Wednesday 2026-08-05)
Evaluated via `NseCalendar.evaluate_session_instant(dt, SecurityCategory.NON_CAS, calendar_regime=CalendarRegime.MODERN_CAS_2026)`:

| Timestamp (IST) | Granular Phase | Continuous Trading | Order Entry Allowed | Allowed Order Type | Microstructural Justification |
| :---: | :--- | :---: | :---: | :---: | :--- |
| **15:29:59** | `CONTINUOUS_TRADING` | `True` | `True` | `ALL` | Final second of continuous trading session |
| **15:30:00** | `CLOSING_AUCTION_MATCHING` | `False` | `False` | `NONE` | 15:30:00 continuous ends; auction matching begins |
| **15:34:59** | `CLOSING_AUCTION_MATCHING` | `False` | `False` | `NONE` | Final second of closing auction matching window |
| **15:35:00** | `TRANSITION_PERIOD` | `False` | `False` | `NONE` | Matching ends; 15-minute reconciliation buffer begins |
| **15:39:59** | `TRANSITION_PERIOD` | `False` | `False` | `NONE` | Mid-transition reconciliation window |
| **15:40:00** | `TRANSITION_PERIOD` | `False` | `False` | `NONE` | **CRITICAL TEST**: 15:40 is NOT closing session under Modern CAS |
| **15:49:59** | `TRANSITION_PERIOD` | `False` | `False` | `NONE` | Final second of transition buffer |
| **15:50:00** | `CLOSING_SESSION` | `False` | `True` | `LIMIT_ONLY` | **CRITICAL TEST**: Official Modern Closing Session opens |
| **15:59:59** | `CLOSING_SESSION` | `False` | `True` | `LIMIT_ONLY` | Final second of post-close trading session |
| **16:00:00** | `CLOSED` | `False` | `False` | `NONE` | Closing session terminates; market is closed |
| **16:00:01** | `CLOSED` | `False` | `False` | `NONE` | Post-close closed state |

### Legacy Pre-CAS Regime Evaluation (Wednesday 2026-02-18)
Evaluated via `NseCalendar.evaluate_session_instant(dt, SecurityCategory.NON_CAS, calendar_regime=CalendarRegime.LEGACY_PRE_CAS)`:

| Timestamp (IST) | Granular Phase | Continuous Trading | Order Entry Allowed | Allowed Order Type | Microstructural Justification |
| :---: | :--- | :---: | :---: | :---: | :--- |
| **15:29:59** | `CONTINUOUS_TRADING` | `True` | `True` | `ALL` | Final second of continuous trading |
| **15:30:00** | `BUFFER` | `False` | `False` | `NONE` | Continuous closes; 10-minute VWAP calculation buffer begins |
| **15:34:59** | `BUFFER` | `False` | `False` | `NONE` | Mid-VWAP buffer period |
| **15:35:00** | `BUFFER` | `False` | `False` | `NONE` | Mid-VWAP buffer period |
| **15:39:59** | `BUFFER` | `False` | `False` | `NONE` | Final second of VWAP calculation buffer |
| **15:40:00** | `CLOSING_SESSION` | `False` | `True` | `LIMIT_ONLY` | **LEGACY SCHEDULE**: Legacy Closing session opens at 15:40 |
| **15:49:59** | `CLOSING_SESSION` | `False` | `True` | `LIMIT_ONLY` | Legacy Closing session active |
| **15:50:00** | `CLOSING_SESSION` | `False` | `True` | `LIMIT_ONLY` | Legacy Closing session active |
| **15:59:59** | `CLOSING_SESSION` | `False` | `True` | `LIMIT_ONLY` | Final second of legacy closing session |
| **16:00:00** | `CLOSED` | `False` | `False` | `NONE` | Market closed |
| **16:00:01** | `CLOSED` | `False` | `False` | `NONE` | Market closed |

---

## 5. TASK 4 — Candle Timestamp Conventions & Duration Semantics

To eliminate lookahead bias and misclassification, candle intervals $[t_{\text{candle\_start}}, t_{\text{candle\_end}})$ are evaluated taking into account both the candle duration and timestamp labeling convention.

### 5.1 One-Minute Candle Boundary Behavior

```mermaid
timeline
    title 1-Minute Candle Boundary Semantics at 15:30:00 Continuous Close
    15:29:00 : START_OF_INTERVAL candle covers [15:29, 15:30) (VALID CONTINUOUS)
    15:30:00 : END_OF_INTERVAL candle covers [15:29, 15:30) (VALID CONTINUOUS)
             : START_OF_INTERVAL candle covers [15:30, 15:31) (INVALID - IN AUCTION/BUFFER)
    15:31:00 : END_OF_INTERVAL candle covers [15:30, 15:31) (INVALID - IN AUCTION/BUFFER)
```

1. **`START_OF_INTERVAL` (`[t, t + \Delta t)`)**:
   - Candle at `15:29:00` covers `[15:29:00, 15:30:00)` $\rightarrow$ `is_continuous_trading = True`.
   - Candle at `15:30:00` covers `[15:30:00, 15:31:00)` $\rightarrow$ `is_continuous_trading = False` (falls into auction matching).

2. **`END_OF_INTERVAL` (`[t - \Delta t, t)`)**:
   - Candle at `15:30:00` covers `[15:29:00, 15:30:00)` $\rightarrow$ `is_continuous_trading = True`.
   - Candle at `15:31:00` covers `[15:30:00, 15:31:00)` $\rightarrow$ `is_continuous_trading = False`.

### 5.2 Multi-Minute Duration Boundary Crossing Checks
- **5-Minute Candle at `15:25:00` (`START_OF_INTERVAL`)**: Spans `[15:25:00, 15:30:00)`. Entirely within continuous trading $\rightarrow$ `is_continuous_trading = True`.
- **5-Minute Candle at `15:26:00` (`START_OF_INTERVAL`)**: Spans `[15:26:00, 15:31:00)`. Straddles the 15:30:00 close $\rightarrow$ `is_continuous_trading = False`.
- **15-Minute Candle at `15:15:00` (`START_OF_INTERVAL`)**: Spans `[15:15:00, 15:30:00)`. Entirely within continuous trading $\rightarrow$ `is_continuous_trading = True`.

---

## 6. TASK 5 — Cross-Language Verification & Test Results

The dual-language architecture (Python in `core/` and TypeScript in `src/lib/`) maintains exact algorithmic and bit-for-bit parity across all session evaluations, holiday rules, order entry permissions, and regulatory registries.

### Test Execution Metrics

| Environment | Test Command | Tests Run | Passed | Failed | Status |
| :--- | :--- | :---: | :---: | :---: | :---: |
| **Python Unit & Regression** | `pytest tests/test_phase746_closing_session_reconciliation.py` | 36 | 36 | 0 | **PASS** |
| **Python Full Repository Suite** | `pytest` | 328 | 328 | 0 | **PASS** |
| **TypeScript Typecheck** | `npm run typecheck` (`tsc --noEmit`) | Full codebase | 0 errors | 0 errors | **PASS** |
| **TypeScript Test Suite** | `npm test` (`run_comprehensive_tests.js`) | 145 | 145 | 0 | **PASS** |
| **Cross-Language Parity Auditor** | `python scripts/verify_cross_language_parity.py` | 86 vectors | 86 | 0 | **100% PARITY** |

---

## 7. Audit Sign-Off & Verification Signatures

The Phase 7.4.6 investigation confirms that:
1. The 15:40 vs 15:50 controversy is completely resolved through clear regulatory separation: 15:40 belongs to the legacy pre-CAS era (`NSE/CMTR/13444`), while 15:50 is the verified closing session start under Modern CAS (`SEBI/HO/47/11/11(3)2025-MRD-POD2/I/2765/2026` and `NSE/CMTR/73362`).
2. The 6-state session architecture accurately isolates auction order entry, auction matching, post-auction transition, and closing session phases.
3. Live execution interlocks remain permanently active, enforcing strict offline research safety.

**Audit Status**: CLOSED & VERIFIED  
**Phase Completed**: Phase 7.4.6
