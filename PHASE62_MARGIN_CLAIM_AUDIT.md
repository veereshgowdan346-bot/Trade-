# PHASE 6.2 — SEBI MARGIN COMPLIANCE, EXPOSURE & DRAWDOWN DECOUPLING AUDIT

**Document Status:** REGULATORY & QUANTITATIVE AUDIT — COMPLETE  
**Execution Mode:** STRICT OFFLINE RESEARCH & PAPER TRADING ONLY  
**Live Brokerage Execution:** PERMANENTLY DISABLED  
**Artifact References:** `scripts/phase61_audit_output.json`, `scripts/phase62_audit_output.json`

---

## 1. Executive Summary & Audit Mandate

In previous audit discussions, an erroneous and technically unfounded claim was introduced into the risk analysis:
> *"The strategy suffered a 0.77% drawdown, which violates intraday MIS margin mandates and triggers broker risk management square-offs."*

This statement conflates three fundamentally independent financial concepts:
1. **Margin Utilization** (the ratio of broker-blocked collateral to account equity).
2. **Market Exposure** (the percentage of session time that positions are held in the market).
3. **Portfolio Drawdown** (the peak-to-trough percentage decline in cumulative equity).

The mandate of this audit is to inspect the actual regulatory margin requirements mandated by the Securities and Exchange Board of India (SEBI) and discount brokers (Shoonya / Finvasia), mathematically calculate the exact margin utilization of OmniTradePro Apex V2.0, formally decouple these three distinct metrics, and permanently retract the unsupported claim.

---

## 2. SEBI Peak Margin Framework & Intraday MIS Rules

### 2.1 Regulatory Context (SEBI Circulars)
Under SEBI's Peak Margin Regulations (effective September 2021), brokers are strictly prohibited from offering unlimited or discretionary intraday leverage.
- For equity cash segment intraday orders (Margin Intraday Square-off, or **MIS**):
  - The minimum statutory margin collection is set to **$100\%$ of the Value-at-Risk (VaR) + Extreme Loss Margin (ELM)**.
  - For Nifty 50 Tier-1 equities (such as RELIANCE), the combined VaR + ELM rate is capped at approximately **$20.00\%$**.
  - This establishes a statutory maximum leverage of **$5\times$** ($1 / 0.20 = 5.0$).

### 2.2 Mathematical Calculation of Margin Blocked
In the OmniTradePro Phase 4 paper simulation:
- **Capital:** $₹100,000.00$
- **Instrument:** RELIANCE (Synthetic Proxy)
- **Representative Price:** $\approx ₹2,550.00$
- **Position Size:** $39 \text{ shares}$
- **Gross Notional Exposure:**
  $$\text{Notional Value} = 39 \times ₹2,550.00 = \mathbf{₹99,450.00}$$
- **Required Margin Collateral Blocked (20%):**
  $$\text{Margin Blocked} = ₹99,450.00 \times 20\% = \mathbf{₹19,890.00}$$
- **Peak Margin Utilization Ratio:**
  $$\text{Margin Utilization} = \frac{\text{Margin Blocked}}{\text{Account Equity}} = \frac{₹19,890.00}{₹100,000.00} = \mathbf{19.89\%}$$
- **Available Free Cash Collateral:**
  $$\text{Free Cash} = ₹100,000.00 - ₹19,890.00 = \mathbf{₹80,110.00} \quad (80.11\%)$$

---

## 3. Decoupling the Three Core Metrics

To prevent future confusion, the three metrics are defined and contrasted below:

```
+-------------------------------------------------------------------------------------------------------+
|                                    OMNITRADEPRO RISK DECOUPLING                                       |
+-------------------------------------------------------------------------------------------------------+
|  1. PEAK MARGIN UTILIZATION: 19.89%                                                                   |
|     - Collateral blocked by broker RMS: ₹19,890 out of ₹100,000.                                      |
|     - Free cash reserve: ₹80,110 (80.11%).                                                            |
|     - Margin cushion: 400%+ above minimum maintenance requirement.                                    |
+-------------------------------------------------------------------------------------------------------+
|  2. MARKET EXPOSURE (TIME IN MARKET): 18.40%                                                          |
|     - Total session duration: 1,500 1-minute bars.                                                    |
|     - Time with open active positions: 276 minutes across 15 trades.                                  |
|     - Time 100% in cash (zero market risk): 1,224 minutes (81.60%).                                   |
+-------------------------------------------------------------------------------------------------------+
|  3. MAXIMUM PORTFOLIO DRAWDOWN: 0.77%                                                                 |
|     - Peak equity: ₹100,000.00.                                                                       |
|     - Maximum peak-to-trough equity decline: -₹770.00 (down to ₹99,230.00).                           |
|     - Distance to capital exhaustion: 99.23%.                                                         |
+-------------------------------------------------------------------------------------------------------+
```

---

## 4. Forensic Refutation of the "Margin Violation" Claim

### 4.1 What Actually Triggers a Margin Call or Square-Off?
Under Indian exchange bylaws and broker Risk Management System (RMS) rules:
1. **Intraday Margin Call:** Occurs if cumulative unrealized losses cause account equity to fall below the minimum required margin.  
   - For an open position requiring $₹19,890$ margin on a $₹100,000$ account, a margin call would only trigger if cumulative losses exceeded:
     $$\text{Loss Threshold} = ₹100,000 - ₹19,890 = \mathbf{-₹80,110.00 \quad (-80.11\%)}$$
   - The strategy's actual peak drawdown was **$-₹770.00$ ($-0.77\%$)**, leaving an overwhelming **₹79,340 safety buffer**.
   - Asserting that a $0.77\%$ drawdown violates margin limits is mathematically absurd.

2. **Broker RMS Square-Off (Auto-Square-Off at 15:15 IST):**  
   - In intraday MIS trading, brokers mandate that all open positions must be squared off by 15:15 IST (or 15:20 IST depending on the broker).
   - This mandatory exit is an **order product-type restriction** (MIS positions cannot be carried overnight into CNC delivery without full cash payment).
   - It is **not** a disciplinary liquidation triggered by drawdown or risk breach.

---

## 5. Formal Correction of Previous Records

| Previous Erroneous Claim | Forensic Audit Finding | Corrected Official Record |
|:-------------------------|:-----------------------|:--------------------------|
| *"0.77% drawdown breaches broker margin mandates"* | Factually incorrect. Free margin was 80.11%. Loss threshold is -80.11%. | **Drawdown was 0.77%, well within the 80.11% margin buffer.** |
| *"Market exposure was 100% like Buy & Hold"* | Factually incorrect. Capital was in cash 81.6% of the time. | **Market exposure was 18.4% (276 minutes in market).** |
| *"Broker RMS forced liquidation due to risk limit"* | Misinterpretation of scheduled EOD square-off. | **Positions exited via ATR target/stop or scheduled 15:15 EOD square-off.** |

---

## 6. Audit Attestation & Sign-Off

- **Lead Auditor:** Quantitative Systems & Algorithmic Trading Auditor
- **Audit Date:** 2026-11-17
- **Verification Status:** **VERIFIED & CORRECTED** (Margin utilization of 19.89%, market exposure of 18.4%, and maximum drawdown of 0.77% are strictly decoupled and verified).
