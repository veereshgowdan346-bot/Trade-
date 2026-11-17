# OMNITRADEPRO APEX V2.0 — RISK BUDGETING & TRANSACTION COST SENSITIVITY REPORT

**Audit Date:** 2026-11-17  
**Auditor:** Quantitative Risk Engineer & Transaction Cost Auditor  
**Workspace:** `c:\Users\veere\Desktop\g4`  
**Target Modules:** `src/lib/risk.ts`, `src/lib/tax.ts`  

---

## 1. THE 1% RISK BUDGET & REALIZED LOSS DISCLOSURE

> [!CAUTION]
> **MANDATORY FINANCIAL REALITY DISCLOSURE:**
> In `src/lib/risk.ts`, the Institutional 1% Risk Rule calculates:
> $$\text{Max Risk Amount} = \text{Capital} \times 0.01 = \mathbf{₹10.00} \quad (\text{on ₹1,000 capital})$$
> This figure represents the **THEORETICAL MODEL RISK AT PLANNED STOP-LOSS DISTANCE**.
> Under NO circumstances should this be represented to an operator or user as a **guaranteed maximum realized loss**.

### Why Realized Loss Can Exceed ₹10.00:
1. **Overnight / Intraday Gap Risk:** If a sudden exchange circuit halt or global event occurs, the next traded price can open significantly below the stop-loss price. A market stop executes at the prevailing exchange bid, incurring gap slippage.
2. **Order Execution Slippage:** In illiquid contracts or volatile index options, the spread between bid and ask can widen from 0.05 to 5.00 points instantly.
3. **Statutory Friction & STT Drag:** Round-trip statutory fees (STT, exchange fees, SEBI, GST) are deducted regardless of whether the trade is a win or a loss.

---

## 2. TRANSACTION COST SENSITIVITY TABLE

The table below illustrates the sensitivity of net returns across 4 distinct friction regimes for an intraday trade on Nifty Futures (Lot size = 25, Entry = ₹25,000, 1R Stop = 20 pts, 3R Target = 60 pts):

| Metric | 1. Zero Friction (Academic) | 2. Shoonya (Flat ₹10 Base) | 3. Angel One (₹40 Base) | 4. High Volatility Spike (Angel + 0.2% Slip) |
| :--- | :---: | :---: | :---: | :---: |
| **Brokerage (Round Trip)** | ₹0.00 | ₹10.00 | ₹40.00 | ₹40.00 |
| **Statutory Taxes (STT+Exch+GST+Stamp)** | ₹0.00 | ₹84.35 | ₹89.75 | ₹89.75 |
| **Slippage Buffer (Entry)** | ₹0.00 | ₹50.00 (0.08%) | ₹50.00 (0.08%) | ₹125.00 (0.20%) |
| **Total Friction Cost** | **₹0.00** | **₹144.35** | **₹179.75** | **₹254.75** |
| **Gross Profit at 3R (+60 pts)** | +₹1,500.00 | +₹1,500.00 | +₹1,500.00 | +₹1,500.00 |
| **Realized Net Profit** | **+₹1,500.00** | **+₹1,355.65** | **+₹1,320.25** | **+₹1,245.25** |
| **Friction Drag on 3R Gain** | **0.0%** | **9.6%** | **12.0%** | **17.0%** |
| **Gross Loss at 1R Stop (-20 pts)** | -₹500.00 | -₹500.00 | -₹500.00 | -₹500.00 |
| **Realized Net Loss at Stop** | **-₹500.00** | **-₹644.35** | **-₹679.75** | **-₹754.75** |
| **Total Drag on 1R Stop** | **0.0%** | **+28.9%** | **+35.9%** | **+50.9%** |

### Key Quantitative Insight:
On a losing trade, transaction costs expand the net loss by **$+28.9\%$ to $+50.9\%$** beyond the raw price stop! This is why the **Statutory Net Yield Hurdle Gate** in `placeOrder()` is mathematically vital: it rejects any trade where the anticipated target profit cannot comfortably overcome this overhead.

---

## 3. CAPITAL CAPACITY & SCALING ANALYSIS

| Allocated Capital | 1% Max Risk Amount | Max 20% Single Trade Exposure | Compatible Instrument Types |
| :---: | :---: | :---: | :--- |
| **₹1,000** | ₹10.00 | ₹200.00 | Micro equities (priced $\le ₹200$), fractional paper simulation. |
| **₹10,000** | ₹100.00 | ₹2,000.00 | Small-cap liquid equities (1–5 shares of ₹400 stock). |
| **₹1,00,000** | ₹1,000.00 | ₹20,000.00 | Large-cap equities (SBIN, RELIANCE, INFY) with 20–50 shares. |
| **₹5,00,000** | ₹5,000.00 | ₹1,00,000.00 | 1 Lot of Nifty / BankNifty Futures with full ATR stop-loss buffer. |
