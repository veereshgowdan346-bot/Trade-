# PHASE 6.3 — TRANSACTION COST MODEL & SLIPPAGE ASYMMETRY AUDIT

**Document Title:** OMNITRADEPRO APEX V2.0 — TRANSACTION COST & SLIPPAGE AUDIT  
**Lead Auditor:** Senior Quantitative Systems Auditor & Financial Mathematics Auditor  
**Operating Mode:** STRICT OFFLINE FORENSIC RESEARCH ONLY  
**Live Brokerage Execution:** STRICTLY DISABLED  
**Source Code References:** `src/lib/tax.ts`, `scripts/run_phase4_simulation.js`, `scripts/recompute_phase63.js`

---

## 1. Executive Summary & Critical Audit Discovery

A rigorous audit of transaction costs and market friction is essential because algorithmic equity trading strategies frequently fail in live markets due to under-modeled transaction friction.

During this Phase 6.3 forensic audit, an **essential structural property** of the codebase was discovered:
> [!CRITICAL]
> In `src/lib/tax.ts` line 89, execution slippage is modeled as:  
> `const slippage = entryVal * 0.0008;`  
> **Slippage is charged ONLY on the entry notional value, NOT on the exit turnover.**  
> Furthermore, in the simulation execution engine (`scripts/run_phase4_simulation.js`), slippage is added solely to the entry price (`nextBar.o + slippageOffset`), while limit and stop-loss exits fill at the exact limit/stop trigger price without exit slippage penalty.

This document analyzes the mathematical consequences of this one-sided slippage model, quantifies what performance would be under a symmetrical two-way slippage model, audits all Indian statutory tax formulas, and documents the rounding rules at every step.

---

## 2. Granular Statutory Cost Component Breakdown

All fee calculations in `src/lib/tax.ts` adhere to the following definitions:

### 2.1 Turnover Definitions
* **Entry Turnover:** $\text{Turnover}_{\text{entry}} = \text{qty} \times \text{entryPrice}$
* **Exit Turnover:** $\text{Turnover}_{\text{exit}} = \text{qty} \times \text{exitPrice}$
* **Total Turnover:** $\text{Turnover}_{\text{total}} = \text{Turnover}_{\text{entry}} + \text{Turnover}_{\text{exit}}$
* **Buy Turnover:** $\text{Turnover}_{\text{entry}}$ if side is BUY; $\text{Turnover}_{\text{exit}}$ if side is SELL.
* **Sell Turnover:** $\text{Turnover}_{\text{exit}}$ if side is BUY; $\text{Turnover}_{\text{entry}}$ if side is SELL.

---

### 2.2 Statutory Rates & Formulas
1. **Brokerage (Shoonya / Finvasia Intraday MIS):**
   * Flat ₹5.00 per executed order leg $\implies$ **Flat ₹10.00 per round trip**.
   * Enforced via: `brokerage = Math.max(10, brokerage);`
2. **Securities Transaction Tax (STT):**
   * Rate: **0.025% (0.00025) on Sell Turnover only** (Statutory Indian equity intraday rate).
   * Formula: $\text{STT} = \text{Turnover}_{\text{sell}} \times 0.00025$
3. **Exchange Transaction Charges (NSE Equity):**
   * Rate: **0.00297% (0.0000297) on Total Turnover**.
   * Formula: $\text{Exch} = \text{Turnover}_{\text{total}} \times 0.0000297$
4. **SEBI Turnover Fee:**
   * Rate: **0.0001% (0.000001, or ₹10 per crore) on Total Turnover**.
   * Formula: $\text{SEBI} = \text{Turnover}_{\text{total}} \times 0.000001$
5. **Stamp Duty (State Stamp Duty Act):**
   * Rate: **0.003% (0.00003) on Buy Turnover only**.
   * Formula: $\text{Stamp} = \text{Turnover}_{\text{buy}} \times 0.00003$
6. **Goods & Services Tax (GST):**
   * Rate: **18.0% on Service Charges** ($\text{Brokerage} + \text{Exchange Fees} + \text{SEBI Fees}$).
   * Formula: $\text{GST} = (\text{Brokerage} + \text{Exch} + \text{SEBI}) \times 0.18$

---

## 3. The Slippage Model: One-Sided vs Two-Sided Analysis

### 3.1 Current Implementation: One-Sided 8 bps
* In `src/lib/tax.ts`, line 89:
  ```typescript
  const slippage = entryVal * 0.0008;
  ```
* Because `entryVal` represents only the entry leg ($\approx 50\%$ of total turnover), an 8 bps fee on entry corresponds to an **effective slippage rate of only 4.0 bps across the total round-trip turnover**:
  $$\text{Effective Two-Way Slippage} = \frac{\text{Slippage Charge}}{\text{Total Turnover}} \approx \frac{0.0008 \times \text{Entry}}{2 \times \text{Entry}} = 0.0004 \quad (\mathbf{4.0 \text{ bps}})$$

---

### 3.2 Impact on the 19 Whipsaw Stress-Test Trades
Across the 19 whipsaw trades:
* **Current One-Sided Slippage (8 bps on Entry):** $\mathbf{₹1,466.23}$
* **Total Current Charges:** $\mathbf{₹2,336.01}$
* **Current Net Realized P&L:** $\mathbf{-₹4,862.77}$

If slippage were charged symmetrically on **both entry and exit legs** (8 bps on total turnover):
* **Symmetrical Two-Sided Slippage:**
  $$\sum \text{Slippage}_{\text{two-way}} = \sum (\text{Entry} + \text{Exit}) \times 0.0008 = \mathbf{₹2,931.87}$$
* **Incremental Friction:** $2,931.87 - 1,466.23 = \mathbf{+₹1,465.64}$
* **Restated Total Charges:** $2,336.01 + 1,465.64 = \mathbf{₹3,801.65}$
* **Restated Net Loss:** $-2,526.76 - 3,801.65 = \mathbf{-₹6,328.41}$ (Regime loss worsens by **30.1%**).

---

### 3.3 Catastrophic Impact on Phase 4 Paper Trading (15 Trades)
In the Phase 4 forward paper trading simulation:
* Reported Gross P&L: $\mathbf{+₹2,768.03}$
* Reported Total Charges: $\mathbf{₹1,892.32}$ (incorporating ₹1,190.86 in one-sided slippage)
* Reported Net Realized P&L: $\mathbf{+₹875.71}$

If symmetrical two-sided slippage (8 bps on total turnover) were enforced:
* Additional Slippage Friction: $\mathbf{+₹1,190.86}$
* Restated Total Charges: $1,892.32 + 1,190.86 = \mathbf{₹3,083.18}$
* **Restated Net P&L:**
  $$\text{Net P\&L} = +2,768.03 - 3,083.18 = \mathbf{-₹315.15 \quad (\text{NET LOSS})}$$

> [!CAUTION]
> **CRITICAL QUANTITATIVE DISCOVERY:**  
> The Phase 4 positive net profit of **+₹875.71** exists **solely because slippage was applied to only one side of each trade**. If realistic two-way slippage (8 bps entry + 8 bps exit) is applied, the strategy's net return turns from **+₹875.71 profit to a -₹315.15 loss**.

---

## 4. Rounding Rules & Intermediate Precision Audit

### 4.1 Unrounded Accumulation vs Display Rounding
* **Engine Convention:** `roundTripCharges()` performs unrounded floating-point addition across all 7 statutory fields and rounds once at the end:
  $$\text{Total} = \text{round}_2\left(\sum \text{unrounded floats}\right)$$
* **Display Convention:** In user-facing reports and JSON serialization, each component is rounded individually to 2 decimals for human readability.
* **Paisa Accumulation Variance:**  
  Because floating-point numbers carry fractional paise (e.g. SEBI fee on ₹195,595 is ₹0.195595, which rounds to ₹0.20), the sum of rounded values deviates slightly from the rounded sum of floats:
  * Sum of rounded components across 19 trades: $\mathbf{₹2,336.05}$
  * Sum of engine row totals (`totalCharges`): $\mathbf{₹2,336.01}$
  * Variance: $\mathbf{+₹0.04 \text{ (4 paise across 19 trades)}}$
  
This 4-paisa variance is not a code defect, but a standard mathematical property of rounding before vs after summation.

---

## 5. Audit Conclusions & Prescribed Cost Adjustments

1. **Disclosure Requirement:** All future research documentation must explicitly state:  
   *`"Slippage is currently modeled as 8 bps on entry turnover only (effective 4 bps round-trip); two-sided 8 bps slippage reduces net P&L from +₹875.71 to -₹315.15."`*
2. **Break-Even Sensitivity:** As established in Phase 6.1, the exact break-even slippage threshold is **13.8854 bps of entry notional** (equivalent to **6.94 bps on two-way turnover**). Any execution environment with round-trip slippage exceeding 7 bps renders OmniTradePro unprofitable.
3. **Status:** **COST MODEL INDEPENDENTLY AUDITED & SLIPPAGE ASYMMETRY FULLY REVEALED**.
