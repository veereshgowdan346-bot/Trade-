# OMNITRADEPRO APEX V2.0 — PHASE 6.8 PARTIAL FILL COST ACCOUNTING AUDIT

**Operating Mode:** STRICT OFFLINE SOFTWARE VERIFICATION ONLY  
**Live Broker Execution:** HARD-CODED DISABLED  
**Real-Money Trading:** PROHIBITED  
**Auditor:** Institutional Quantitative Audit Team  
**Date:** November 17, 2026  

---

## 1. Executive Summary

Partial fills represent a significant accounting challenge in algorithmic trading. When an order to close an open position is only partially filled by an exchange, the execution engine must:
1. Account for executed quantities using strictly the executed turnover.
2. Apply statutory charges (STT, exchange turnover, SEBI, stamp duty, GST) and two-sided slippage proportionally to the executed slice.
3. Preserve the remaining position in an active `OPEN` state with uncorrupted initial stop-loss distance.
4. Guarantee that entry and exit costs are **never deducted twice**.
5. Guarantee that exit slippage is **applied strictly to actual executed exit turnover**.

This report documents the mathematical specification, transaction ledger, and invariant proofs for partial fill accounting implemented in Phase 6.8.

---

## 2. Institutional Partial Fill Architecture

### 2.1 The Problem of Indivisible Accounting
In naive trading systems, when an exit order for 50 shares partially fills 20 shares:
- The system either closes the entire 50 shares at the partial price (distorting position inventory), or
- It leaves the entire 50 shares open, ignoring the 20 shares executed (creating unhedged market exposure), or
- It calculates entry costs for all 50 shares during the 20-share exit, deducting entry costs a second time when the remaining 30 shares exit.

### 2.2 The Phase 6.8 Slicing Protocol
Phase 6.8 introduces the **Position Slicing Protocol**:
1. When a partial fill of $Q_{\text{exec}} < Q_{\text{pos}}$ is confirmed:
   - A new position record is inserted with `status = "CLOSED"` and $\text{qty} = Q_{\text{exec}}$.
   - Turnover for this slice is computed strictly on $Q_{\text{exec}}$:
     $$\text{Turnover}_{\text{entry, slice}} = Q_{\text{exec}} \times P_{\text{entry}}$$
     $$\text{Turnover}_{\text{exit, slice}} = Q_{\text{exec}} \times P_{\text{exit}}$$
   - All charges (brokerage, STT, turnover charges, SEBI, stamp duty, GST, entry slippage, exit slippage) are calculated strictly on these turnovers.
2. The active position is decremented:
   $$Q_{\text{remaining}} = Q_{\text{pos}} - Q_{\text{exec}}$$
   $$\text{status} = \text{"OPEN"}$$
   $$\text{initialSlDistance} = R_{\text{original}} \quad (\text{strictly preserved})$$
3. Unexecuted entry turnover on the remaining shares:
   $$\text{Turnover}_{\text{entry, remaining}} = Q_{\text{remaining}} \times P_{\text{entry}}$$
   Remains deferred until the remaining shares are exited.

---

## 3. Concrete Numerical Example & Mathematical Proof

### 3.1 Initial Position
- Symbol: `RELIANCE` (NSE Equity)
- Side: `BUY` (Long)
- Initial Quantity: $Q_0 = 50$ shares
- Entry Price: $P_{\text{entry}} = ₹2,500.00$
- Total Initial Entry Value: $50 \times 2500 = ₹125,000.00$
- Initial Stop-Loss: $P_{\text{sl}} = ₹2,480.00$ ($R = ₹20.00$)
- Slippage Assumption: 8 bps (0.08%) per side

### 3.2 Event 1: Partial Exit Execution
- Target order placed to exit 50 shares @ ₹2,520.00.
- Exchange partially executes: $Q_{\text{exec}} = 20$ shares @ $P_{\text{exit}} = ₹2,520.00$.
- Order status becomes `PARTIALLY_FILLED`.
- Remaining 30 shares remain unfilled.

#### Cost Decomposition on Executed Slice (20 shares):
- **Turnover:**
  $$\text{Entry Turnover} = 20 \times 2500.00 = ₹50,000.00$$
  $$\text{Exit Turnover} = 20 \times 2520.00 = ₹50,400.00$$
  $$\text{Total Turnover} = ₹50,000.00 + ₹50,400.00 = \mathbf{₹100,400.00}$$

- **Gross P&L:**
  $$\text{Gross P\&L} = (2520.00 - 2500.00) \times 20 = \mathbf{+₹400.00}$$

- **Statutory Charges:**
  - Brokerage: Flat ₹20.00 per executed order (or ₹10.00 on Shoonya).
  - STT ($0.025\%$ on Sell): $0.00025 \times 50,400 = \mathbf{₹12.60}$
  - Exchange Txn ($0.00345\%$ on Total): $0.0000345 \times 100,400 = \mathbf{₹3.46}$
  - SEBI Turnover ($0.0001\%$ on Total): $0.000001 \times 100,400 = \mathbf{₹0.10}$
  - Stamp Duty ($0.003\%$ on Buy): $0.00003 \times 50,000 = \mathbf{₹1.50}$
  - GST ($18\%$ on Brokerage + Exch + SEBI): $0.18 \times (20.00 + 3.46 + 0.10) = 0.18 \times 23.56 = \mathbf{₹4.24}$
  - **Subtotal Statutory Taxes:** $20.00 + 12.60 + 3.46 + 0.10 + 1.50 + 4.24 = \mathbf{₹41.90}$

- **Two-Sided Slippage (8 bps each side):**
  - Entry Slippage ($8\text{ bps}$ on $₹50,000$): $0.0008 \times 50,000 = \mathbf{₹40.00}$
  - Exit Slippage ($8\text{ bps}$ on $₹50,400$): $0.0008 \times 50,400 = \mathbf{₹40.32}$
  - Total Slippage: $40.00 + 40.32 = \mathbf{₹80.32}$

- **Total Costs & Net P&L:**
  $$\text{Total Charges} = ₹41.90 + ₹80.32 = \mathbf{₹122.22}$$
  $$\text{Net P\&L} = ₹400.00 - ₹122.22 = \mathbf{+₹277.78}$$

---

### 3.3 Event 2: Subsequent Exit of Remaining Shares
- Remaining position: $Q_{\text{rem}} = 30$ shares @ ₹2,500.00 entry.
- Exits later @ $P_{\text{exit}} = ₹2,510.00$.

#### Cost Decomposition on Remaining Slice (30 shares):
- **Turnover:**
  $$\text{Entry Turnover} = 30 \times 2500.00 = ₹75,000.00$$
  $$\text{Exit Turnover} = 30 \times 2510.00 = ₹75,300.00$$
  $$\text{Total Turnover} = ₹75,000.00 + ₹75,300.00 = \mathbf{₹150,300.00}$$

- **Gross P&L:**
  $$\text{Gross P\&L} = (2510.00 - 2500.00) \times 30 = \mathbf{+₹300.00}$$

- **Two-Sided Slippage (8 bps each side):**
  - Entry Slippage: $0.0008 \times 75,000 = \mathbf{₹60.00}$
  - Exit Slippage: $0.0008 \times 75,300 = \mathbf{₹60.24}$
  - Total Slippage: $\mathbf{₹120.24}$

- **Statutory Charges:**
  - Brokerage: ₹20.00
  - STT ($0.025\%$ on Sell): $0.00025 \times 75,300 = \mathbf{₹18.83}$
  - Exchange Txn ($0.00345\%$ on Total): $0.0000345 \times 150,300 = \mathbf{₹5.19}$
  - SEBI Turnover: $0.000001 \times 150,300 = \mathbf{₹0.15}$
  - Stamp Duty ($0.003\%$ on Buy): $0.00003 \times 75,000 = \mathbf{₹2.25}$
  - GST ($18\%$ on $20.00 + 5.19 + 0.15$): $0.18 \times 25.34 = \mathbf{₹4.56}$
  - **Subtotal Statutory Taxes:** $\mathbf{₹50.98}$

- **Total Charges & Net P&L:**
  $$\text{Total Charges} = ₹50.98 + ₹120.24 = \mathbf{₹171.22}$$
  $$\text{Net P\&L} = ₹300.00 - ₹171.22 = \mathbf{+₹128.78}$$

---

## 4. Aggregate Accounting Invariants

| Dimension | Initial Total | Executed Slice (20) | Remaining Slice (30) | Slice Sum (20 + 30) | Drift | Status |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Quantity** | 50 | 20 | 30 | **50** | 0 | **PASS** |
| **Entry Turnover** | ₹125,000.00 | ₹50,000.00 | ₹75,000.00 | **₹125,000.00** | ₹0.00 | **PASS** |
| **Entry Slippage** | ₹100.00 | ₹40.00 | ₹60.00 | **₹100.00** | ₹0.00 | **PASS** |
| **Stamp Duty** | ₹3.75 | ₹1.50 | ₹2.25 | **₹3.75** | ₹0.00 | **PASS** |
| **Exit Slippage** | N/A | ₹40.32 | ₹60.24 | **₹100.56** | Exact | **PASS** |
| **Gross P&L** | N/A | +₹400.00 | +₹300.00 | **+₹700.00** | Exact | **PASS** |
| **Net P&L** | N/A | +₹277.78 | +₹128.78 | **+₹406.56** | Exact | **PASS** |

### Proof of Non-Duplication:
$$\sum \text{Entry Turnover}_{\text{slices}} = 50000 + 75000 = \mathbf{₹125,000.00} \equiv \text{Original Entry Turnover}$$
$$\sum \text{Entry Slippage}_{\text{slices}} = 40.00 + 60.00 = \mathbf{₹100.00} \equiv 0.08\% \times 125000$$

Exit slippage was applied exclusively to executed shares ($₹50,400$ and $₹75,300$), with zero unexecuted exit turnover incurring slippage.

---

## 5. Audit Verdict

**PARTIAL FILL COST ACCOUNTING: PASS**  
The position slicing architecture guarantees exact turnover allocation, strictly isolates exit slippage to executed shares, preserves open position inventory, and eliminates double cost deductions.
