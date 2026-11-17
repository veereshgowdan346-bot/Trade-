# OMNITRADEPRO APEX V2.0 — PHASE 6.8 ORDER RECONCILIATION AUDIT

**Operating Mode:** STRICT OFFLINE SOFTWARE VERIFICATION ONLY  
**Live Broker Execution:** HARD-CODED DISABLED  
**Real-Money Trading:** PROHIBITED  
**Auditor:** Institutional Quantitative Audit Team  
**Date:** November 17, 2026  

---

## 1. Executive Summary

During system startup, recovery, or post-crash initialization, positions may remain trapped in the transitional state `CLOSING`. An institutional execution engine must reconcile these positions against historical orders, live broker states, and partial execution records.

A cardinal rule of institutional risk management governs this process:
> **"Never assume that an absent fill record proves no execution occurred."**

This report audits the implementation of `reconcileClosingPositions()` in `src/lib/engine.ts` across all **8 mandatory order reconciliation scenarios**.

---

## 2. Order Reconciliation State Matrix

| # | Scenario | Order State in DB / Broker | Position Action Taken | Risk & Cost Invariant | Verdict |
| :-: | :--- | :--- | :--- | :--- | :-: |
| **1** | **Fully Filled Exit** | `status = "FILLED"`, $\text{qty}_{\text{fill}} = \text{qty}_{\text{pos}}$ | Transition to `CLOSED`; record `exitPrice`, `grossPnl`, `charges`, `netPnl`. | Exact round-trip fees applied; position terminated. | **PASS** |
| **2** | **Partially Filled Exit** | `status = "PARTIALLY_FILLED"`, $\text{qty}_{\text{fill}} < \text{qty}_{\text{pos}}$ | Slices filled shares to new `CLOSED` record with exact costs; decrements active position to remaining qty and restores to `OPEN`. | Exit slippage and taxes charged strictly on executed shares; zero cost duplication. | **PASS** |
| **3** | **Cancelled Exit Order** | `status = "CANCELLED"` | Safely restored to `OPEN` for ongoing active stop/target monitoring. | Zero shares executed; zero charges booked. | **PASS** |
| **4** | **Rejected Exit Order** | `status = "REJECTED"` or `"REJECTED_EXIT"` | Safely restored to `OPEN` for retry or strategy intervention. | Zero shares executed; zero charges booked. | **PASS** |
| **5** | **Missing Order Record** | Position `CLOSING`, zero order records found in DB | **LIVE mode:** Retain `CLOSING`, emit `CRITICAL` alert for manual broker verification.<br>**PAPER mode:** Safe to restore to `OPEN`. | Prevents catastrophic orphan exposure or double-close in LIVE mode. | **PASS** |
| **6** | **Multiple Exit Orders** | Multiple `FILLED` orders for one position ID (e.g. 2 partial fills) | Aggregate filled qty; calculate volume-weighted average price (VWAP); close once. | Prevents duplicate closures; single aggregate turnover calculation. | **PASS** |
| **7** | **Duplicate Invocation** | Consecutive calls to `reconcileClosingPositions()` | First call reconciles stuck positions; second call returns 0. | Strict idempotency; zero duplicate rows; zero double charges. | **PASS** |
| **8** | **Uncertain Order Status** | `status \in \{\text{PENDING, SUBMITTED, UNCERTAIN}\}` | Retain `CLOSING` state; emit high-priority alert; do NOT restore to `OPEN`. | Prevents opening new positions while an exit is live at exchange. | **PASS** |

---

## 3. Deep Dive into Specific Scenarios

### Scenario 1: Fully Filled Exit Order
When a position is marked `CLOSING` and a matching order exists with `status === "FILLED"` and $\text{qty} = \text{position.qty}$:
- Average exit price is set directly to order fill price: $P_{\text{exit}} = P_{\text{fill}}$.
- Directional gross P&L is computed:
  $$\text{Gross P\&L} = (P_{\text{exit}} - P_{\text{entry}}) \times \text{qty} \times \text{dir}$$
- Full round-trip statutory costs and two-sided slippage are computed:
  $$\text{Total Costs} = \text{Brokerage} + \text{STT} + \text{Exch} + \text{SEBI} + \text{Stamp} + \text{GST} + \text{Slip}_{\text{entry}} + \text{Slip}_{\text{exit}}$$
- Position status transitions atomically to `CLOSED`.

### Scenario 2: Partially Filled Exit Order (Quantity Slicing)
Consider an active position of 50 shares @ ₹2,500.00 entry ($₹125,000$ initial turnover).
An exit order is placed, but only 20 shares fill @ ₹2,520.00 before the process is interrupted:
1. **Executed Slice (20 shares):**
   - Sliced into a new row with `status = "CLOSED"`, `qty = 20`, `entryPrice = 2500`, `exitPrice = 2520`.
   - Executed entry turnover: $20 \times 2500 = ₹50,000.00$.
   - Executed exit turnover: $20 \times 2520 = ₹50,400.00$.
   - Two-sided slippage (8 bps): Entry $₹40.00$ + Exit $₹40.32 = ₹80.32$.
   - Gross P&L: $+₹400.00$; Net P&L: $+₹277.78$.
2. **Remaining Active Position (30 shares):**
   - Active position quantity updated: $\text{qty} = 30$.
   - Status updated: $\text{status} = \text{"OPEN"}$.
   - Initial stop distance preserved ($R = ₹20.00$).
   - Remaining entry turnover: $30 \times 2500 = ₹75,000.00$.
   - Exit slippage for remaining 30 shares will only be calculated upon actual future execution. Zero double deduction!

### Scenario 5: Missing Order Record ("Never Assume Absent Fill Record Proves No Execution")
If a position is in `CLOSING` state but no matching exit order exists in the local database:
- **Flawed Assumption:** Assume no execution occurred and revert to `OPEN`.
- **Real-World Catastrophe in LIVE Mode:** If the process dispatched a market exit order to the broker and crashed prior to committing the order row to Postgres, the broker and exchange filled the order. Reverting the position to `OPEN` in the trading engine causes the engine to believe it still holds 50 shares long. When the strategy triggers another exit later, it sells another 50 shares, creating an **unintended naked short position** in live markets!
- **Phase 6.8 Institutional Guardrail:**
  ```typescript
  if (p.mode === "LIVE") {
    await audit("CRITICAL", "ORDER_RECORD_MISSING", `LIVE position #${p.id} stuck in CLOSING with no exit order record found. Retaining CLOSING state; manual tradebook verification required.`);
    await sendAlert("MISSING_EXIT_ORDER_RECORD", ...);
    continue; // Retain CLOSING, do NOT revert to OPEN!
  } else {
    // PAPER mode: Safe to revert to OPEN
    await db.update(positions).set({ status: "OPEN" }).where(...);
  }
  ```

### Scenario 6: Multiple Exit Orders (Multi-Fill Aggregation)
When an order is executed in multiple tranches (e.g. 20 shares @ ₹2,520 and 30 shares @ ₹2,525):
- Volume-weighted average exit price (VWAP) is computed:
  $$P_{\text{exit, avg}} = \frac{20 \times 2520 + 30 \times 2525}{20 + 30} = \frac{50400 + 75750}{50} = \mathbf{₹2523.00}$$
- The position is closed once with $P_{\text{exit}} = ₹2523.00$.
- Zero duplicate closures, zero orphaned records.

### Scenario 8: Uncertain Order Status (In-Flight / Pending)
When an exit order exists with status `SUBMITTED`, `PENDING`, `TRIGGER_PENDING`, or `UNCERTAIN`:
- The order may execute at the exchange at any sub-millisecond.
- The engine retains the position in `CLOSING` status, issues a high-priority alert, and refuses to revert to `OPEN`.
- This prevents the consensus engine from evaluating new entry signals for the symbol or placing duplicate exits.

---

## 4. Test Evidence Summary

All 8 scenarios were executed and verified in both Python (`tests/test_phase68_order_reconciliation_failure_injection.py`) and TypeScript (`scripts/run_comprehensive_tests.js` Section 18):

- `test_reconciliation_scenario_1_fully_filled_exit`: **PASSED**
- `test_reconciliation_scenario_2_partially_filled_exit`: **PASSED**
- `test_reconciliation_scenario_3_cancelled_exit`: **PASSED**
- `test_reconciliation_scenario_4_rejected_exit`: **PASSED**
- `test_reconciliation_scenario_5_missing_order_record`: **PASSED**
- `test_reconciliation_scenario_6_multiple_exit_orders`: **PASSED**
- `test_reconciliation_scenario_7_duplicate_reconciliation_idempotency`: **PASSED**
- `test_reconciliation_scenario_8_uncertain_order_status`: **PASSED**

---

## 5. Audit Verdict

**ORDER RECONCILIATION INTEGRITY: PASS**  
The engine cleanly reconciles all 8 states, guards against unconfirmed execution in LIVE mode, correctly slices partial fills, and enforces strict idempotency.
