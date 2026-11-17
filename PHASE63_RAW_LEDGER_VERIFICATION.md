# PHASE 6.3 — INDEPENDENT RAW LEDGER VERIFICATION & RECOMPUTATION AUDIT

**Document Title:** OMNITRADEPRO APEX V2.0 — PHASE 6.3 RAW LEDGER VERIFICATION  
**Lead Auditor:** Senior Quantitative Systems Auditor & Financial Mathematics Auditor  
**Operating Mode:** STRICT OFFLINE FORENSIC RESEARCH ONLY  
**Live Brokerage Execution:** STRICTLY DISABLED  
**Raw Source Data:** `scripts/phase62_whipsaw_output.json`  
**Execution Script:** `scripts/recompute_phase63.js`

---

## 1. Executive Summary & Audit Mandate

In Phase 6.2, the 19 trades generated during the High-Volatility Whipsaw regime stress test were analyzed to resolve an apparent prose discrepancy ("₹3.80 gross, ₹124.50 costs, -₹120.48 net"). 

Under the Phase 6.3 mandate, we do not rely on narrative summaries or secondary representations. We independently recompute every single trade directly from its raw ledger primitives (`id`, `side`, `qty`, `entryPrice`, `exitPrice`, `exitReason`) using exact statutory formulas, inspect rounding rules at each intermediate step, identify any paisa drift, and verify aggregate ledger invariants.

---

## 2. Mathematical First Principles & Calculation Rules

For each trade $i \in \{1, \dots, 19\}$, calculations are performed strictly from primitives:

1. **Turnover Calculations:**
   $$\begin{aligned}
   \text{Entry Turnover}_i &= \text{qty}_i \times \text{entryPrice}_i \\
   \text{Exit Turnover}_i &= \text{qty}_i \times \text{exitPrice}_i \\
   \text{Total Turnover}_i &= \text{Entry Turnover}_i + \text{Exit Turnover}_i \\
   \text{Buy Turnover}_i &= \begin{cases} \text{Entry Turnover}_i & \text{if } \text{side}_i = \text{BUY} \\ \text{Exit Turnover}_i & \text{if } \text{side}_i = \text{SELL} \end{cases} \\
   \text{Sell Turnover}_i &= \begin{cases} \text{Exit Turnover}_i & \text{if } \text{side}_i = \text{BUY} \\ \text{Entry Turnover}_i & \text{if } \text{side}_i = \text{SELL} \end{cases}
   \end{aligned}$$

2. **Gross P&L:**
   $$\text{Gross P\&L}_i = \begin{cases} (\text{exitPrice}_i - \text{entryPrice}_i) \times \text{qty}_i & \text{if } \text{side}_i = \text{BUY} \\ (\text{entryPrice}_i - \text{exitPrice}_i) \times \text{qty}_i & \text{if } \text{side}_i = \text{SELL} \end{cases}$$

3. **Statutory Cost Schedule (Shoonya Intraday MIS EQ):**
   * **Brokerage:** Flat ₹10.00 per executed round trip (₹5 per leg).
   * **STT (Securities Transaction Tax):** $0.025\%$ on Sell Turnover ($0.00025 \times \text{Sell Turnover}_i$).
   * **Exchange Transaction Fee:** $0.00297\%$ on Total Turnover ($0.0000297 \times \text{Total Turnover}_i$).
   * **SEBI Turnover Fee:** $0.0001\%$ on Total Turnover ($0.000001 \times \text{Total Turnover}_i$).
   * **Stamp Duty:** $0.003\%$ on Buy Turnover ($0.00003 \times \text{Buy Turnover}_i$).
   * **GST:** $18\%$ on $(\text{Brokerage} + \text{Exchange Fee} + \text{SEBI Fee})$.
   * **Slippage:** $8\text{ bps}$ ($0.0008$) on **Entry Turnover only**.

4. **Rounding Architecture in `src/lib/tax.ts`:**
   In the production code, `roundTripCharges()` calculates total charges by summing unrounded floating-point amounts and rounding the final total to 2 decimal places:
   $$\text{Total Charges}_i = \text{round}_2\left(\text{Brk} + \text{STT}_{\text{raw}} + \text{Exch}_{\text{raw}} + \text{SEBI}_{\text{raw}} + \text{Stamp}_{\text{raw}} + \text{GST}_{\text{raw}} + \text{Slip}_{\text{raw}}\right)$$
   $$\text{Net P\&L}_i = \text{round}_2\left(\text{round}_2(\text{Gross P\&L}_i) - \text{Total Charges}_i\right)$$

---

## 3. Row-by-Row Independent Recalculation Table

The table below compares the raw stored values from `scripts/phase62_whipsaw_output.json` against independent recomputations from first principles:

| ID | Side | Qty | Entry | Exit | Reason | Gross (JSON) | Gross (Recalc) | Diff Gross | Charges (JSON) | Charges (Recalc) | Diff Charges | Net (JSON) | Net (Recalc) | Diff Net | Audit Status |
|:--:|:----:|:---:|:-----:|:----:|:------:|-------------:|---------------:|:----------:|---------------:|-----------------:|:------------:|-----------:|-------------:|:--------:|:------------:|
| 1 | BUY | 39 | 2510.00 | 2505.26 | SL | -₹184.86 | -₹184.86 | ₹0.00 | ₹124.56 | ₹124.56 | ₹0.00 | -₹309.42 | -₹309.42 | ₹0.00 | **MATCH** |
| 2 | SELL | 39 | 2500.19 | 2505.79 | SL | -₹218.40 | -₹218.40 | ₹0.00 | ₹124.19 | ₹124.19 | ₹0.00 | -₹342.59 | -₹342.59 | ₹0.00 | **MATCH** |
| 3 | BUY | 39 | 2511.35 | 2511.45 | BE_SL | +₹3.90 | +₹3.90 | ₹0.00 | ₹124.68 | ₹124.68 | ₹0.00 | -₹120.78 | -₹120.78 | ₹0.00 | **MATCH** |
| 4 | SELL | 39 | 2502.49 | 2508.70 | SL | -₹242.19 | -₹242.19 | ₹0.00 | ₹124.29 | ₹124.29 | ₹0.00 | -₹366.48 | -₹366.48 | ₹0.00 | **MATCH** |
| 5 | BUY | 39 | 2512.67 | 2512.77 | BE_SL | +₹3.90 | +₹3.90 | ₹0.00 | ₹124.73 | ₹124.73 | ₹0.00 | -₹120.83 | -₹120.83 | ₹0.00 | **MATCH** |
| 6 | SELL | 39 | 2504.86 | 2504.76 | BE_SL | +₹3.90 | +₹3.90 | ₹0.00 | ₹124.38 | ₹124.38 | ₹0.00 | -₹120.48 | -₹120.48 | ₹0.00 | **MATCH** |
| 7 | SELL | 39 | 2502.34 | 2502.24 | BE_SL | +₹3.90 | +₹3.90 | ₹0.00 | ₹124.27 | ₹124.27 | ₹0.00 | -₹120.37 | -₹120.37 | ₹0.00 | **MATCH** |
| 8 | SELL | 39 | 2500.47 | 2506.35 | SL | -₹229.32 | -₹229.32 | ₹0.00 | ₹124.20 | ₹124.20 | ₹0.00 | -₹353.52 | -₹353.52 | ₹0.00 | **MATCH** |
| 9 | BUY | 39 | 2507.46 | 2501.78 | SL | -₹221.52 | -₹221.52 | ₹0.00 | ₹124.44 | ₹124.44 | ₹0.00 | -₹345.96 | -₹345.96 | ₹0.00 | **MATCH** |
| 10 | BUY | 38 | 2508.27 | 2502.73 | SL | -₹210.52 | -₹210.52 | ₹0.00 | ₹121.58 | ₹121.58 | ₹0.00 | -₹332.10 | -₹332.10 | ₹0.00 | **MATCH** |
| 11 | SELL | 39 | 2497.05 | 2502.73 | SL | -₹221.52 | -₹221.52 | ₹0.00 | ₹124.05 | ₹124.05 | ₹0.00 | -₹345.57 | -₹345.57 | ₹0.00 | **MATCH** |
| 12 | BUY | 38 | 2509.05 | 2503.27 | SL | -₹219.64 | -₹219.64 | ₹0.00 | ₹121.62 | ₹121.62 | ₹0.00 | -₹341.26 | -₹341.26 | ₹0.00 | **MATCH** |
| 13 | BUY | 38 | 2511.51 | 2505.91 | SL | -₹212.80 | -₹212.80 | ₹0.00 | ₹121.73 | ₹121.73 | ₹0.00 | -₹334.53 | -₹334.53 | ₹0.00 | **MATCH** |
| 14 | BUY | 38 | 2517.72 | 2517.82 | BE_SL | +₹3.80 | +₹3.80 | ₹0.00 | ₹122.06 | ₹122.06 | ₹0.00 | -₹118.26 | -₹118.26 | ₹0.00 | **MATCH** |
| 15 | BUY | 38 | 2529.28 | 2529.38 | BE_SL | +₹3.80 | +₹3.80 | ₹0.00 | ₹122.57 | ₹122.57 | ₹0.00 | -₹118.77 | -₹118.77 | ₹0.00 | **MATCH** |
| 16 | BUY | 38 | 2531.72 | 2526.76 | SL | -₹188.48 | -₹188.48 | ₹0.00 | ₹122.62 | ₹122.62 | ₹0.00 | -₹311.10 | -₹311.10 | ₹0.00 | **MATCH** |
| 17 | BUY | 37 | 2535.35 | 2529.66 | SL | -₹210.53 | -₹210.53 | ₹0.00 | ₹119.85 | ₹119.85 | ₹0.00 | -₹330.38 | -₹330.38 | ₹0.00 | **MATCH** |
| 18 | BUY | 37 | 2539.67 | 2539.77 | BE_SL | +₹3.70 | +₹3.70 | ₹0.00 | ₹120.09 | ₹120.09 | ₹0.00 | -₹116.39 | -₹116.39 | ₹0.00 | **MATCH** |
| 19 | BUY | 37 | 2541.18 | 2535.94 | SL | -₹193.88 | -₹193.88 | ₹0.00 | ₹120.10 | ₹120.10 | ₹0.00 | -₹313.98 | -₹313.98 | ₹0.00 | **MATCH** |

---

## 4. Aggregate Totals & Float Rounding Analysis

### 4.1 Independent Aggregate Reconciliation
$$\begin{aligned}
\sum_{i=1}^{19} \text{Gross P\&L}_i (\text{JSON}) &= \mathbf{-₹2,526.76} & \sum_{i=1}^{19} \text{Gross P\&L}_i (\text{Recalc}) &= \mathbf{-₹2,526.76} & \text{Diff} &= \mathbf{₹0.00} \\
\sum_{i=1}^{19} \text{Total Charges}_i (\text{JSON}) &= \mathbf{₹2,336.01} & \sum_{i=1}^{19} \text{Total Charges}_i (\text{Recalc}) &= \mathbf{₹2,336.01} & \text{Diff} &= \mathbf{₹0.00} \\
\sum_{i=1}^{19} \text{Net P\&L}_i (\text{JSON}) &= \mathbf{-₹4,862.77} & \sum_{i=1}^{19} \text{Net P\&L}_i (\text{Recalc}) &= \mathbf{-₹4,862.77} & \text{Diff} &= \mathbf{₹0.00} \\
\text{Initial Capital} &= \mathbf{₹100,000.00} & \text{Final Capital} &= \mathbf{₹95,137.23} & \text{Diff} &= \mathbf{₹0.00}
\end{aligned}$$

### 4.2 Component Rounding Analysis (The 4-Paisa Accumulation)
When summing the independently rounded statutory component fields:
* Sum of Brokerage ($19 \times ₹10.00$): **₹190.00**
* Sum of STT: **₹457.81**
* Sum of Exchange Fees: **₹108.85**
* Sum of SEBI Fees: **₹3.70**
* Sum of Stamp Duty: **₹55.01**
* Sum of GST: **₹54.45**
* Sum of Slippage: **₹1,466.23**
* **Sum of Individually Rounded Components:** $190 + 457.81 + 108.85 + 3.70 + 55.01 + 54.45 + 1466.23 = \mathbf{₹2,336.05}$
* **Sum of Unrounded Row Totals (`totalCharges`):** $\mathbf{₹2,336.01}$
* **Discrepancy:** $\mathbf{+₹0.04 \text{ (4 paise across 19 trades)}}$

**Technical Explanation:**  
This 4-paisa difference occurs because `roundTripCharges()` accumulates unrounded floating-point numbers and performs `Math.round(unroundedTotal * 100) / 100` once at the end. When individual components (which carry fractional paise like ₹0.1956 for SEBI or ₹2.8808 for GST) are rounded separately for visual display, the sum of rounded parts exceeds the rounded sum of parts by exactly 4 paise. Both approaches are mathematically understood; the ledger strictly adheres to unrounded float accumulation.

---

## 5. Audit Attestation

1. **Zero Mismatches:** There are zero discrepancies between the raw JSON records in `scripts/phase62_whipsaw_output.json` and the independent mathematical recomputation.
2. **No Data Modification:** Historical records were inspected in read-only mode and were not modified, overwritten, or retroactively tuned.
3. **Status:** **FULLY RECONCILED & INDEPENDENTLY VERIFIED**.
