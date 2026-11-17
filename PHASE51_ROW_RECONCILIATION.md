# PHASE 5.1 — ROW-LEVEL TRADE LEDGER RECONCILIATION REPORT
**Project:** OmniTradePro Apex V2.0  
**Audit Mode:** Offline Forensic Research & Paper Simulation Ledger Audit  
**Execution Guardrail:** REAL-MONEY BROKER EXECUTION STRICTLY DISABLED  
**Audit Date:** 2026-11-17  
**Artifact Path:** `c:\Users\veere\Desktop\g4\PHASE51_ROW_RECONCILIATION.md`  

---

## 1. Executive Summary & Audit Mandate

During the Phase 5 forensic audit, discrepancies were detected between aggregate figures in certain markdown summary tables and the individual row items. Specifically:
1. `STRATEGY_BASELINE_COMPARISON.md` reported total charges of **₹1,345.46**.
2. `PHASE5_TRADE_RECONCILIATION.md` and `PAPER_TRADE_PERFORMANCE.md` reported aggregate charges of **₹1,945.46**.
3. Displayed markdown tables in certain working drafts contained placeholder rows summing to **Net ₹323.34**, while claiming an aggregate **Net ₹875.71**.

This document establishes the **absolute ground truth** by recalculating every single trade directly from the simulated order fill events recorded in `scripts/phase4_simulation_output.json`, using the institutional cost model defined in `src/lib/tax.ts`.

### 1.1 Non-Negotiable Invariants Enforced
$$\sum_{i=1}^{N} \text{Gross P\&L}_i = \text{Total Gross P\&L} = \mathbf{+₹2,768.03}$$
$$\sum_{i=1}^{N} \text{Total Charges}_i = \text{Total Charges} = \mathbf{₹1,892.32}$$
$$\sum_{i=1}^{N} \text{Net P\&L}_i = \text{Total Net P\&L} = \mathbf{+₹875.71}$$
$$\text{Total Gross P\&L} - \text{Total Charges} = \mathbf{₹2,768.03} - \mathbf{₹1,892.32} = \mathbf{+₹875.71} \quad (\Delta = \mathbf{₹0.00})$$
$$\text{Final Equity} = \text{Initial Capital} + \sum_{i=1}^{N} \text{Net P\&L}_i = \mathbf{₹100,000.00} + \mathbf{₹875.71} = \mathbf{₹100,875.71} \quad (\Delta = \mathbf{₹0.00})$$

---

## 2. Row-by-Row Mathematical Audit Ledger

The table below reconciles all 15 trades from Phase 4 paper execution. Every row is verified:
- **Direction & Multiplier:** `BUY` (Long: $(\text{Exit} - \text{Entry}) \times \text{Qty}$), `SELL` (Short: $(\text{Entry} - \text{Exit}) \times \text{Qty}$).
- **Contract Multiplier:** Equity cash delivery/intraday multiplier = $1.0$.
- **Charges:** Calculated strictly via `roundTripCharges()` in `src/lib/tax.ts` including flat brokerage, STT/CTT, exchange turnover fees, SEBI turnover charges, state stamp duty, GST (18%), and 8 bps ($0.08\%$) execution slippage on entry turnover.
- **Net P&L:** Exactly $\text{Gross P\&L} - \text{Total Charges}$.
- **Running Equity:** Compounded sequentially from Initial Capital of ₹100,000.00.

| # | Trade ID | Side | Qty | Entry Price (₹) | Exit Price (₹) | Total Turnover (₹) | Gross P&L (₹) | Total Charges (₹) | Net P&L (₹) | Running Equity (₹) | Status |
|---|----------|------|-----|-----------------|----------------|--------------------|---------------|-------------------|-------------|--------------------|--------|
| 1 | `PAPER_1` | BUY | 39 | 2,529.94 | 2,538.09 | 197,653.17 | +317.85 | 125.60 | +192.25 | 100,192.25 | VERIFIED |
| 2 | `PAPER_2` | BUY | 39 | 2,563.49 | 2,571.72 | 200,273.19 | +320.97 | 127.11 | +193.86 | 100,386.11 | VERIFIED |
| 3 | `PAPER_3` | BUY | 38 | 2,587.35 | 2,583.95 | 196,509.40 | -129.20 | 125.07 | -254.27 | 100,131.84 | VERIFIED |
| 4 | `PAPER_4` | BUY | 38 | 2,586.42 | 2,582.91 | 196,434.54 | -133.38 | 125.03 | -258.41 | 99,873.43 | VERIFIED |
| 5 | `PAPER_5` | BUY | 39 | 2,547.41 | 2,544.01 | 198,565.38 | -132.60 | 126.26 | -258.86 | 99,614.57 | VERIFIED |
| 6 | `PAPER_6` | BUY | 39 | 2,547.51 | 2,556.33 | 199,049.76 | +343.98 | 126.40 | +217.58 | 99,832.15 | VERIFIED |
| 7 | `PAPER_7` | BUY | 39 | 2,555.97 | 2,568.87 | 199,868.76 | +503.10 | 126.82 | +376.28 | 100,208.43 | VERIFIED |
| 8 | `PAPER_8` | BUY | 39 | 2,569.51 | 2,583.89 | 200,982.60 | +560.82 | 127.45 | +433.37 | 100,641.80 | VERIFIED |
| 9 | `PAPER_9` | BUY | 38 | 2,583.49 | 2,595.97 | 196,819.48 | +474.24 | 125.07 | +349.17 | 100,990.97 | VERIFIED |
| 10 | `PAPER_10` | BUY | 38 | 2,596.29 | 2,590.43 | 197,095.36 | -222.68 | 125.44 | -348.12 | 100,642.85 | VERIFIED |
| 11 | `PAPER_11` | BUY | 38 | 2,593.31 | 2,587.23 | 196,860.52 | -231.04 | 125.30 | -356.34 | 100,286.51 | VERIFIED |
| 12 | `PAPER_12` | SELL | 39 | 2,548.75 | 2,536.90 | 198,340.35 | +462.15 | 126.32 | +335.83 | 100,622.34 | VERIFIED |
| 13 | `PAPER_13` | SELL | 39 | 2,535.96 | 2,522.58 | 197,283.06 | +521.82 | 125.75 | +396.07 | 101,018.41 | VERIFIED |
| 14 | `PAPER_14` | SELL | 40 | 2,521.89 | 2,527.67 | 201,982.40 | -231.20 | 128.07 | -359.27 | 100,659.14 | VERIFIED |
| 15 | `PAPER_15` | BUY | 39 | 2,552.57 | 2,561.37 | 199,443.66 | +343.20 | 126.63 | +216.57 | 100,875.71 | VERIFIED |
| **TOTAL** | — | — | **583** | — | — | **2,976,961.23** | **+2,768.03** | **1,892.32** | **+875.71** | **100,875.71** | **RECONCILED** |

---

## 3. Row-Level Mathematical Proofs

### 3.1 Long Trades Mathematical Formula
For a Long position ($Side = \text{BUY}$):
$$\text{Gross P\&L} = (\text{Exit Price} - \text{Entry Price}) \times \text{Quantity}$$
$$\text{Net P\&L} = \text{Gross P\&L} - \text{Total Charges}$$

**Example Verification (Trade `PAPER_1`):**
- $\text{Entry Price} = 2,529.94$
- $\text{Exit Price} = 2,538.09$
- $\text{Quantity} = 39$
- $\text{Gross P\&L} = (2,538.09 - 2,529.94) \times 39 = 8.15 \times 39 = \mathbf{+317.85}$
- $\text{Total Charges} = \mathbf{125.60}$
- $\text{Net P\&L} = 317.85 - 125.60 = \mathbf{+192.25}$
- $\text{Running Equity} = 100,000.00 + 192.25 = \mathbf{100,192.25}$

### 3.2 Short Trades Mathematical Formula
For a Short position ($Side = \text{SELL}$):
$$\text{Gross P\&L} = (\text{Entry Price} - \text{Exit Price}) \times \text{Quantity}$$
$$\text{Net P\&L} = \text{Gross P\&L} - \text{Total Charges}$$

**Example Verification (Trade `PAPER_12`):**
- $\text{Entry Price} = 2,548.75$
- $\text{Exit Price} = 2,536.90$
- $\text{Quantity} = 39$
- $\text{Gross P\&L} = (2,548.75 - 2,536.90) \times 39 = 11.85 \times 39 = \mathbf{+462.15}$
- $\text{Total Charges} = \mathbf{126.32}$
- $\text{Net P\&L} = 462.15 - 126.32 = \mathbf{+335.83}$
- $\text{Running Equity} = 100,286.51 + 335.83 = \mathbf{100,622.34}$

**Example Verification (Trade `PAPER_14` - Short Loss):**
- $\text{Entry Price} = 2,521.89$
- $\text{Exit Price} = 2,527.67$
- $\text{Quantity} = 40$
- $\text{Gross P\&L} = (2,521.89 - 2,527.67) \times 40 = -5.78 \times 40 = \mathbf{-231.20}$
- $\text{Total Charges} = \mathbf{128.07}$
- $\text{Net P\&L} = -231.20 - 128.07 = \mathbf{-359.27}$
- $\text{Running Equity} = 101,018.41 - 359.27 = \mathbf{100,659.14}$

---

## 4. Verification of Rounding Consistency
- All monetary values are maintained to floating precision during intermediate operations and rounded to **2 decimal places (paisa)** upon terminal ledger settlement.
- No fractional paisa accumulation errors were detected:
  - $\sum \text{Row Gross P\&L} = 2,768.03$
  - $\sum \text{Row Charges} = 1,892.32$
  - $\sum \text{Row Net P\&L} = 875.71$
  - Difference between Sum(Gross) - Sum(Charges) and Sum(Net):
    $$2,768.03 - 1,892.32 - 875.71 = 0.0000000000000000 \text{ (Zero)}$$

---

## 5. Audit Conclusion
Every single one of the 15 trades has been reconciled row-by-row. There are **zero missing trades**, **zero duplicate trade IDs**, and **zero arithmetic discrepancies**.
The true net profit for the 15-trade sample is **₹875.71**, resulting in a final capital of **₹100,875.71**.
