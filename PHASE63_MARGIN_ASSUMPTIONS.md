# PHASE 6.3 — MARGIN ARCHITECTURE, EXPOSURE & REGULATORY LEVERAGE AUDIT

**Document Title:** OMNITRADEPRO APEX V2.0 — MARGIN & LEVERAGE AUDIT  
**Lead Auditor:** Senior Quantitative Systems Auditor & Regulatory Compliance Auditor  
**Operating Mode:** STRICT OFFLINE FORENSIC RESEARCH ONLY  
**Live Brokerage Execution:** STRICTLY DISABLED  
**Regulatory Standards:** SEBI Peak Margin Framework, NSE Clearing Corporation Bylaws  
**Script Reference:** `scripts/recompute_phase63.js`

---

## 1. Executive Summary & Audit Mandate

In quantitative strategy evaluation, assumptions regarding leverage, margin requirements, and collateral availability can distort risk and return profiles. 

In earlier audit notes, two dangerous claims surfaced:
1. *Erroneous Claim 1:* "A 0.77% drawdown breaches broker intraday margin limits." (Proven false in Phase 6.2).
2. *Unverified Assumption 2:* "5x leverage (20% margin) is universally available and guaranteed across all instruments and market regimes."

The mandate of Phase 6.3 is to establish an unassailable mathematical and regulatory audit of margin mechanics:
* Formally decouple **Margin Blocked, Free Collateral, Market Exposure, and Portfolio Drawdown**.
* Identify the actual regulatory framework established by the Securities and Exchange Board of India (SEBI) and clearing corporations.
* Document real-world broker risk policies, demonstrating why universal 5x leverage cannot be assumed.

---

## 2. Decoupling the Four Core Risk & Collateral Metrics

To prevent future conceptual confusion, the four metrics are formally defined and quantified based on the Phase 4/6 simulation data:

```
+----------------------------------------------------------------------------------------------------------+
|                                    COLLATERAL & RISK DECOUPLING MATRIX                                   |
+----------------------------------------------------------------------------------------------------------+
|  1. MARGIN BLOCKED (COLLATERAL COMMITTED): ₹19,890.00 (19.89% UTILIZATION)                               |
|     - Notional position size: 39 shares of RELIANCE @ ₹2,550.00 = ₹99,450.00.                            |
|     - Statutory minimum intraday margin rate (20%): ₹99,450.00 * 0.20 = ₹19,890.00.                      |
|     - Peak margin utilization ratio on ₹100,000 equity: 19.89%.                                          |
+----------------------------------------------------------------------------------------------------------+
|  2. FREE COLLATERAL (UNENCUMBERED CAPITAL): ₹80,110.00 (80.11% RESERVE)                                  |
|     - Capital available to absorb adverse price movements and intraday volatility:                       |
|       ₹100,000.00 - ₹19,890.00 = ₹80,110.00 (80.11%).                                                    |
|     - Collateral invariant: Margin Blocked (19.89%) + Free Collateral (80.11%) === 100.00%.              |
+----------------------------------------------------------------------------------------------------------+
|  3. MARKET EXPOSURE (TIME-IN-MARKET): 18.40%                                                             |
|     - Total session duration: 1,500 1-minute bars across 4 trading days.                                 |
|     - Total minutes with active open positions: 276 minutes across 15 trades.                            |
|     - Minutes 100% in cash (zero market risk): 1,224 minutes (81.60%).                                   |
+----------------------------------------------------------------------------------------------------------+
|  4. MAXIMUM PORTFOLIO DRAWDOWN: 0.77%                                                                    |
|     - Peak equity: ₹100,000.00.                                                                          |
|     - Maximum realized peak-to-trough decline: -₹771.54 (down to ₹99,228.46).                            |
|     - Drawdown expressed as a percentage of capital: 0.77%.                                              |
+----------------------------------------------------------------------------------------------------------+
```

---

## 3. Regulatory Reality: SEBI Peak Margin Framework

### 3.1 Statutory Framework
Under SEBI Circular `SEBI/HO/MRD2/DCAP/CIR/P/2020/127` and clearing corporation rules:
* Brokers are mandated to collect **100% of the minimum margin (VaR + Extreme Loss Margin)** on an upfront, intraday snapshot basis.
* For Group 1 (Nifty 50 Tier-1) liquid equities, the minimum VaR + ELM typically sits between **$18.5\%$ and $21.5\%$**.
* This effectively caps maximum statutory intraday equity leverage at approximately **$5\times$** ($1 / 0.20 = 5.0$).

---

### 3.2 The Fallacy of "Universal 5x Leverage"
While $5\times$ leverage is theoretically available for RELIANCE under normal conditions, an algorithmic trading system must never assume universal or guaranteed $5\times$ leverage:

1. **Broker-Discretionary Surcharges:**  
   Brokers (including Shoonya, Angel One, and Zerodha) retain unilateral authority under client agreements to increase margin requirements at any time. During major risk events (Union Budget announcements, RBI policy rate decisions, general election counting, corporate earnings releases), brokers routinely raise intraday MIS margins to **$25\%$, $33\%$, or $50\%$ ($4\times, 3\times, \text{or } 2\times$ leverage)**.
2. **Stock Categorization & Cap-Tier Variations:**  
   * **Tier-1 Large-Cap (Nifty 50):** Typically ~20% margin ($5\times$ leverage).
   * **Mid-Cap / High-Beta Equities:** Typically require 25% to 40% margin ($2.5\times$ to $4\times$ leverage).
   * **Small-Cap / Illiquid Equities:** Many stocks are entirely barred from intraday MIS orders, requiring 100% Cash-and-Carry (CNC) margin ($1\times$ leverage).
3. **Overnight Carry Ban for MIS:**  
   MIS positions cannot be carried overnight. Attempting to convert an MIS position to CNC delivery requires depositing the full 100% cash value ($₹99,450.00$) before the 15:15 IST auto-square-off deadline.

---

## 4. Margin Calls vs Automated Square-Off: Legal Distinction

| Mechanism | Trigger Condition | Operational Mechanics | Applicable to OmniTradePro? |
|:----------|:------------------|:----------------------|:---------------------------:|
| **Regulatory Margin Call** | Account equity drops below maintenance margin requirement ($< ₹19,890$). | Occurs only if cumulative losses exceed **-₹80,110.00 (-80.11%)**. Client must deposit cash immediately or face forced liquidation. | **NO.** Peak drawdown was only **-0.77%**, leaving an enormous ₹79,340 safety buffer. |
| **Broker RMS Auto-Square-Off** | Scheduled clock time reached (typically **15:15 IST** or **15:20 IST**). | Order product-type constraint. RMS system automatically issues market orders to close all open MIS positions before cash settlement. | **YES.** Modeled via EOD square-off at bar 360 of each 375-bar session. |
| **Hard Stop-Loss Exit** | Market price touches the dynamic ATR stop-loss price. | Algorithmic order execution by strategy. | **YES.** 12 out of 19 whipsaw trades exited via hard stop-loss. |

---

## 5. Audit Conclusions & Prescribed Platform Guidelines

1. **Decoupling Certified:** The audit confirms that **drawdown (0.77%)**, **exposure (18.40%)**, and **margin utilization (19.89%)** are fully independent variables.
2. **Leverage Assumptions Restricted:** The OmniTradePro platform configuration must treat leverage as a **configurable parameter with a default assumption of $1\times$ to $3\times$**, rather than hardcoding an aggressive $5\times$ assumption.
3. **Dynamic Margin Adaptation Required:** Future versions must query the broker's real-time margin API (e.g. Shoonya `/GetSecurityInfo` or Angel One `/margin/api/v1`) to determine exact live margin requirements before position sizing.
