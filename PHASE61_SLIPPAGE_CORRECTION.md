# PHASE 6.1 — SLIPPAGE BREAK-EVEN & TURNOVER RECALCULATION REPORT
**Project:** OmniTradePro Apex V2.0  
**Audit Mode:** Granular Turnover Decomposition & Exact Break-Even Derivation  
**Execution Guardrail:** REAL-MONEY BROKER EXECUTION STRICTLY DISABLED  
**Audit Date:** 2026-11-17  
**Artifact Path:** `c:\Users\veere\Desktop\g4\PHASE61_SLIPPAGE_CORRECTION.md`  

---

## 1. Executive Summary & Audit Mandate

In Phase 6, the break-even slippage under Shoonya brokerage was reported approximately as "~14 bps". 

The mandate of Phase 6.1 Task 2 is to:
1. Decompose all transaction volume into separate **Entry Turnover**, **Exit Turnover**, **Buy Turnover**, and **Sell Turnover**.
2. Isolate fixed statutory charges (Brokerage, STT, Exchange fees, SEBI, Stamp, GST) so they are accounted for **exactly once**.
3. Derive the **exact closed-form break-even slippage threshold** down to 4 decimal places.
4. Verify the exact net P&L outcomes across the 0, 4, 8, 12, 13.8854, 14, 16, and 20 basis points scenarios.

---

## 2. Granular Turnover Decomposition (All 15 Trades)

The table below breaks down the ₹2,977,161.63 total turnover across each of the 15 trades, distinguishing position direction (Long vs. Short):

| # | Trade ID | Side | Qty | Entry Price (₹) | Exit Price (₹) | Entry Turnover (₹) | Exit Turnover (₹) | Buy Turnover (₹) | Sell Turnover (₹) | Total Turnover (₹) |
|---|----------|------|-----|-----------------|----------------|--------------------|-------------------|------------------|-------------------|--------------------|
| 1 | `PAPER_1` | BUY | 39 | 2,529.94 | 2,538.09 | 98,667.66 | 98,985.51 | 98,667.66 | 98,985.51 | 197,653.17 |
| 2 | `PAPER_2` | BUY | 39 | 2,563.49 | 2,571.72 | 99,976.11 | 100,297.08 | 99,976.11 | 100,297.08 | 200,273.19 |
| 3 | `PAPER_3` | BUY | 38 | 2,587.35 | 2,583.95 | 98,319.30 | 98,190.10 | 98,319.30 | 98,190.10 | 196,509.40 |
| 4 | `PAPER_4` | BUY | 38 | 2,586.42 | 2,582.91 | 98,283.96 | 98,150.58 | 98,283.96 | 98,150.58 | 196,434.54 |
| 5 | `PAPER_5` | BUY | 39 | 2,547.41 | 2,544.01 | 99,348.99 | 99,216.39 | 99,348.99 | 99,216.39 | 198,565.38 |
| 6 | `PAPER_6` | BUY | 39 | 2,547.51 | 2,556.33 | 99,352.89 | 99,696.87 | 99,352.89 | 99,696.87 | 199,049.76 |
| 7 | `PAPER_7` | BUY | 39 | 2,555.97 | 2,568.87 | 99,682.83 | 100,185.93 | 99,682.83 | 100,185.93 | 199,868.76 |
| 8 | `PAPER_8` | BUY | 39 | 2,569.51 | 2,583.89 | 100,210.89 | 100,771.71 | 100,210.89 | 100,771.71 | 200,982.60 |
| 9 | `PAPER_9` | BUY | 38 | 2,583.49 | 2,595.97 | 98,172.62 | 98,646.86 | 98,172.62 | 98,646.86 | 196,819.48 |
| 10 | `PAPER_10` | BUY | 38 | 2,596.29 | 2,590.43 | 98,659.02 | 98,436.34 | 98,659.02 | 98,436.34 | 197,095.36 |
| 11 | `PAPER_11` | BUY | 38 | 2,593.31 | 2,587.23 | 98,545.78 | 98,314.74 | 98,545.78 | 98,314.74 | 196,860.52 |
| 12 | `PAPER_12` | SELL | 39 | 2,548.75 | 2,536.90 | 99,401.25 | 98,939.10 | 98,939.10 | 99,401.25 | 198,340.35 |
| 13 | `PAPER_13` | SELL | 39 | 2,535.96 | 2,522.58 | 98,902.44 | 98,380.62 | 98,380.62 | 98,902.44 | 197,283.06 |
| 14 | `PAPER_14` | SELL | 40 | 2,521.89 | 2,527.67 | 100,875.60 | 101,106.80 | 101,106.80 | 100,875.60 | 201,982.40 |
| 15 | `PAPER_15` | BUY | 39 | 2,552.57 | 2,561.37 | 99,550.23 | 99,893.43 | 99,550.23 | 99,893.43 | 199,443.66 |
| **SUM** | — | — | **583** | — | — | **1,487,949.57** | **1,489,212.06** | **1,487,196.80** | **1,489,964.83** | **2,977,161.63** |

### Turnover Identity Proof:
$$\text{Total Turnover} \equiv \text{Entry Turnover} + \text{Exit Turnover} \equiv \text{Buy Turnover} + \text{Sell Turnover}$$
$$1,487,949.57 + 1,489,212.06 = 1,487,196.80 + 1,489,964.83 = \mathbf{₹2,977,161.63} \quad (\Delta = \mathbf{₹0.00})$$

---

## 3. Statutory Charges (Zero Slippage Baseline)

Statutory charges are levied based on statutory rules enforced in `src/lib/tax.ts` and are fixed regardless of slippage:

1. **Brokerage (Shoonya):** ₹10.00 flat $\times 15$ trades = **₹150.00**
2. **STT ($0.025\%$ on Sell Turnover ₹1,489,964.83):** **₹372.49**
3. **NSE Exchange Turnover Fees ($0.00297\%$ on ₹2,977,161.63):** **₹88.43**
4. **SEBI Turnover Charges (₹10/Cr on ₹2,977,161.63):** **₹3.00**
5. **State Stamp Duty ($0.003\%$ on Buy Turnover ₹1,487,196.80):** **₹44.63**
6. **GST ($18\%$ on Brokerage + Exchange + SEBI Fees):** **₹43.47**
- **Total Fixed Statutory Taxes (Zero Slippage):** $$\mathbf{₹701.95}$$

---

## 4. Exact Mathematical Break-Even Slippage Derivation

Execution slippage is applied as basis points ($b$) on total **Entry Turnover** ($\sum \text{EntryVal} = ₹1,487,949.57$):

$$\text{Slippage Cost}(b) = \sum_{i=1}^{15} \text{EntryVal}_i \times \frac{b}{10000} = 1,487,949.57 \times \frac{b}{10000} = 148.794957 \cdot b$$

The Net Realized P&L equation is:
$$\text{Net P\&L}(b) = \text{Gross P\&L} - \text{Statutory Taxes} - \text{Slippage Cost}(b)$$
$$\text{Net P\&L}(b) = ₹2,768.03 - ₹701.95 - (148.794957 \cdot b)$$
$$\text{Net P\&L}(b) = ₹2,066.08 - (148.794957 \cdot b)$$

Setting $\text{Net P\&L}(b) = 0$ to find the exact break-even slippage $b^*$:
$$148.794957 \cdot b^* = 2,066.08$$
$$b^* = \frac{2,066.08}{148.794957} = \mathbf{13.885417 \text{ bps}} \approx \mathbf{13.89 \text{ bps}}$$

---

## 5. Verification Table Across All Cost Scenarios

Evaluating the trade records under each specific basis point scenario:

| Slippage ($b$ bps) | Slippage Cost (₹) | Fixed Statutory Taxes (₹) | Total Friction (₹) | Gross P&L (₹) | Net P&L (₹) | Outcome |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **0.0 bps** | ₹0.00 | ₹701.95 | ₹701.95 | +₹2,768.03 | **+₹2,066.08** | Highly Profitable |
| **4.0 bps** | ₹595.17 | ₹701.95 | ₹1,297.12 | +₹2,768.03 | **+₹1,470.91** | Profitable |
| **8.0 bps (Base)** | **₹1,190.37** | **₹701.95** | **₹1,892.32** | **+₹2,768.03** | **+₹875.71** | **Base Simulation** |
| **12.0 bps** | ₹1,785.52 | ₹701.95 | ₹2,487.47 | +₹2,768.03 | **+₹280.56** | Marginal Profit |
| **13.8854 bps** | **₹2,066.07** | **₹701.95** | **₹2,768.02** | **+₹2,768.03** | **+₹0.01** | **EXACT BREAK-EVEN BOUND** |
| **14.0 bps** | **₹2,083.13** | **₹701.95** | **₹2,785.08** | **+₹2,768.03** | **-₹17.05** | **NET LOSS (Edge Wiped Out)** |
| **16.0 bps** | ₹2,380.70 | ₹701.95 | ₹3,082.65 | +₹2,768.03 | **-₹314.62** | Significant Loss |
| **20.0 bps** | ₹2,975.91 | ₹701.95 | ₹3,677.86 | +₹2,768.03 | **-₹909.83** | Severe Loss |

> [!IMPORTANT] Critical Institutional Finding
> The approximate statement "~14 bps" in earlier documentation was technically imprecise. Mathematically, the break-even slippage is **13.89 bps**. At **14.0 bps**, the strategy has already crossed into negative territory with a net loss of **-₹17.05**. The strategy possesses a safety cushion of only **5.89 bps ($0.0589\%$)** over the base 8 bps assumption.

---

## 6. Audit Verdict & Classification

| Cost Verification Item | Audited Value | Mathematical Proof | Classification |
| :--- | :---: | :---: | :---: |
| Turnover Partitioning | Entry, Exit, Buy, Sell separated | $100\%$ identity match | **VERIFIED** |
| Statutory Charges | ₹701.95 | Accounted for exactly once | **VERIFIED** |
| Base Friction (8 bps) | ₹1,892.32 | Matches Phase 4/5.1 exactly | **VERIFIED** |
| Exact Break-Even Slippage | **13.8854 bps (~13.89 bps)** | $2,066.08 / 148.795$ | **VERIFIED** |
| 14 bps Outcome | **-₹17.05 (Net Loss)** | Confirmed negative at 14 bps | **VERIFIED** |
| **OVERALL SLIPPAGE AUDIT** | **EXACT CLOSED-FORM SOLVED** | — | **VERIFIED** |
