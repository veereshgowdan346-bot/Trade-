# PHASE 5.1 — CAPITAL & PORTFOLIO RECONCILIATION REPORT
**Project:** OmniTradePro Apex V2.0  
**Audit Mode:** Balance Sheet Equity Ledger & Capital Path Forensic Audit  
**Execution Guardrail:** REAL-MONEY BROKER EXECUTION STRICTLY DISABLED  
**Audit Date:** 2026-11-17  
**Artifact Path:** `c:\Users\veere\Desktop\g4\PHASE51_CAPITAL_RECONCILIATION.md`  

---

## 1. Executive Summary & Balance Sheet Invariants

The fundamental accounting integrity of any automated trading system requires that the portfolio equity curve be an exact, closed-form summation of starting capital and individual trade net P&L settlements.

This report independently verifies the balance sheet invariants for the Phase 4 paper-trading execution:
1. **Capital Invariant:**
   $$\text{Final Equity} = \text{Initial Capital} + \sum_{i=1}^{N} \text{Net P\&L}_i$$
   $$\mathbf{₹100,000.00} + \mathbf{₹875.71} = \mathbf{₹100,875.71} \quad (\text{Variance} = \mathbf{₹0.00})$$

2. **PnL Invariant:**
   $$\sum_{i=1}^{N} \text{Net P\&L}_i = \sum_{i=1}^{N} \text{Gross P\&L}_i - \sum_{i=1}^{N} \text{Total Charges}_i$$
   $$\mathbf{₹875.71} = \mathbf{₹2,768.03} - \mathbf{₹1,892.32} \quad (\text{Variance} = \mathbf{₹0.00})$$

---

## 2. Complete Equity Path Ledger (All 15 Trades)

The sequential equity curve traces the portfolio balance after every executed trade. High-water marks (peaks) and drawdowns are tracked in real time.

| Trade # | Trade ID | Gross P&L (₹) | Total Charges (₹) | Net P&L (₹) | Portfolio Equity (₹) | High-Water Mark (₹) | Current Drawdown (₹) | Drawdown % |
|---------|----------|---------------|-------------------|-------------|----------------------|---------------------|----------------------|------------|
| 0 | *START* | — | — | — | 100,000.00 | 100,000.00 | 0.00 | 0.00% |
| 1 | `PAPER_1` | +317.85 | 125.60 | +192.25 | 100,192.25 | 100,192.25 | 0.00 | 0.00% |
| 2 | `PAPER_2` | +320.97 | 127.11 | +193.86 | 100,386.11 | 100,386.11 | 0.00 | 0.00% |
| 3 | `PAPER_3` | -129.20 | 125.07 | -254.27 | 100,131.84 | 100,386.11 | 254.27 | 0.25% |
| 4 | `PAPER_4` | -133.38 | 125.03 | -258.41 | 99,873.43 | 100,386.11 | 512.68 | 0.51% |
| 5 | `PAPER_5` | -132.60 | 126.26 | -258.86 | 99,614.57 | 100,386.11 | **771.54** | **0.77% (Max DD)** |
| 6 | `PAPER_6` | +343.98 | 126.40 | +217.58 | 99,832.15 | 100,386.11 | 553.96 | 0.55% |
| 7 | `PAPER_7` | +503.10 | 126.82 | +376.28 | 100,208.43 | 100,386.11 | 177.68 | 0.18% |
| 8 | `PAPER_8` | +560.82 | 127.45 | +433.37 | 100,641.80 | 100,641.80 | 0.00 | 0.00% |
| 9 | `PAPER_9` | +474.24 | 125.07 | +349.17 | 100,990.97 | 100,990.97 | 0.00 | 0.00% |
| 10 | `PAPER_10` | -222.68 | 125.44 | -348.12 | 100,642.85 | 100,990.97 | 348.12 | 0.34% |
| 11 | `PAPER_11` | -231.04 | 125.30 | -356.34 | 100,286.51 | 100,990.97 | 704.46 | 0.70% |
| 12 | `PAPER_12` | +462.15 | 126.32 | +335.83 | 100,622.34 | 100,990.97 | 368.63 | 0.37% |
| 13 | `PAPER_13` | +521.82 | 125.75 | +396.07 | **101,018.41** | **101,018.41** | 0.00 | 0.00% (Peak) |
| 14 | `PAPER_14` | -231.20 | 128.07 | -359.27 | 100,659.14 | 101,018.41 | 359.27 | 0.36% |
| 15 | `PAPER_15` | +343.20 | 126.63 | +216.57 | **100,875.71** | 101,018.41 | 142.70 | 0.14% |
| **TOTAL** | — | **+2,768.03** | **1,892.32** | **+875.71** | **100,875.71** | — | **771.54** | **0.77%** |

---

## 3. Drawdown & Risk Analysis

### 3.1 Peak-to-Trough Drawdown Cycles
The portfolio experienced three distinct drawdown episodes:
1. **Drawdown Episode 1 (Trades 3 to 5):**
   - Peak: ₹100,386.11 (After Trade 2)
   - Trough: ₹99,614.57 (After Trade 5)
   - Absolute Drawdown: $100,386.11 - 99,614.57 = \mathbf{₹771.54}$
   - Percentage Drawdown: $\frac{771.54}{100,386.11} = \mathbf{0.7686\% \approx 0.77\%}$
   - Duration: 3 consecutive losing trades (`PAPER_3`, `PAPER_4`, `PAPER_5`).
   - Recovery: Recovered at Trade 8 (₹100,641.80).
   - **This constitutes the Maximum Drawdown (MDD) of the run.**

2. **Drawdown Episode 2 (Trades 10 to 11):**
   - Peak: ₹100,990.97 (After Trade 9)
   - Trough: ₹100,286.51 (After Trade 11)
   - Absolute Drawdown: $100,990.97 - 100,286.51 = \mathbf{₹704.46}$
   - Percentage Drawdown: $\frac{704.46}{100,990.97} = \mathbf{0.6975\% \approx 0.70\%}$
   - Recovery: Recovered at Trade 13 (₹101,018.41).

3. **Drawdown Episode 3 (Trade 14):**
   - Peak: ₹101,018.41 (Global Peak after Trade 13)
   - Trough: ₹100,659.14 (After Trade 14)
   - Absolute Drawdown: $101,018.41 - 100,659.14 = \mathbf{₹359.27}$
   - Percentage Drawdown: $\mathbf{0.3556\% \approx 0.36\%}$
   - Final Equity: ₹100,875.71 (Drawdown from peak: ₹142.70 or 0.14%).

---

## 4. Capital Efficiency & Performance Metrics

| Metric | Certified Mathematical Value | Calculation Formula |
|--------|------------------------------|---------------------|
| Starting Capital | ₹100,000.00 | Initial allocation |
| Ending Capital | ₹100,875.71 | Final settled equity |
| Absolute Return | +₹875.71 | Ending - Starting |
| Percentage Return | +0.8757% | Absolute / Starting |
| Peak Portfolio Value | ₹101,018.41 | Maximum High-Water Mark |
| Trough Portfolio Value | ₹99,614.57 | Minimum Equity Point |
| Maximum Drawdown (₹) | ₹771.54 | Peak - Trough (Episode 1) |
| Maximum Drawdown (%) | 0.7686% (0.77%) | Max DD (₹) / Peak Equity |
| Calmar Ratio (Return / MDD) | 1.139 | 0.8757% / 0.7686% |
| Total Turnover Generated | ₹2,976,961.23 | Sum of buy + sell turnover |
| Capital Turnover Multiple | 29.77x | Total Turnover / Starting Capital |

---

## 5. Audit Attestation
The portfolio reconciliation proves zero discrepancies:
- $\text{Sum}(\text{Net P\&L}) = \mathbf{+₹875.71}$
- $\text{Initial Capital} + \text{Sum}(\text{Net P\&L}) = \mathbf{₹100,875.71}$
- $\text{Final Capital recorded in JSON} = \mathbf{₹100,875.71}$
- **Accounting Variance = ₹0.00**
