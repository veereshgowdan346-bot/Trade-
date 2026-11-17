# PHASE 6.4 — TWO-SIDED EXECUTION-COST MODEL DESIGN & ARCHITECTURE

**Document Title:** OMNITRADEPRO APEX V2.0 — EXECUTION COST MODEL SPECIFICATION  
**Lead Auditor:** Senior Quantitative Software Architect & Financial Mathematics Auditor  
**Operating Mode:** STRICT OFFLINE FORENSIC RESEARCH ONLY  
**Live Brokerage Execution:** STRICTLY DISABLED  
**Source Code Reference:** `src/lib/tax.ts`  
**Artifact References:** `scripts/phase64_recalculation_output.json`, `tests/test_phase64_execution_cost_model.py`

---

## 1. Executive Summary & Design Mandate

In quantitative algorithmic trading systems, execution costs consist of two distinct categories:
1. **Statutory & Brokerage Charges:** Fixed, regulatory, and legally mandated fees (brokerage, exchange charges, STT, SEBI fees, stamp duty, and GST).
2. **Market Execution Friction (Slippage & Impact):** The adverse price difference between the theoretical decision price and the actual execution fill price.

In earlier versions of OmniTradePro (Phases 1–6.2), slippage was computed via a single asymmetric formula:
$$\text{Slippage} = \text{Entry Turnover} \times 0.0008 \quad (\text{8 bps on entry only})$$
This created a severe modeling blind spot: **exit orders (limit, take-profit, trailing stop, and stop-loss) were assumed to incur zero slippage**.

The mandate of Phase 6.4 is to redesign the execution cost model in `src/lib/tax.ts` to implement **fully explicit, configurable, two-sided execution-cost accounting** without modifying strategy trading parameters.

---

## 2. Mathematical Formalization of the Two-Sided Cost Model

### 2.1 Turnover Primitives
For any trade with quantity $Q$, entry price $P_{\text{entry}}$, exit price $P_{\text{exit}}$, and direction $\text{Side} \in \{\text{BUY}, \text{SELL}\}$:

$$\begin{aligned}
\text{Turnover}_{\text{entry}} &= Q \times P_{\text{entry}} \\
\text{Turnover}_{\text{exit}} &= Q \times P_{\text{exit}} \\
\text{Turnover}_{\text{total}} &= \text{Turnover}_{\text{entry}} + \text{Turnover}_{\text{exit}} \\
\text{Turnover}_{\text{buy}} &= \begin{cases} \text{Turnover}_{\text{entry}} & \text{if } \text{Side} = \text{BUY} \\ \text{Turnover}_{\text{exit}} & \text{if } \text{Side} = \text{SELL} \end{cases} \\
\text{Turnover}_{\text{sell}} &= \begin{cases} \text{Turnover}_{\text{exit}} & \text{if } \text{Side} = \text{BUY} \\ \text{Turnover}_{\text{entry}} & \text{if } \text{Side} = \text{SELL} \end{cases}
\end{aligned}$$

---

### 2.2 Explicit Two-Sided Slippage Formulas
Let $\beta_{\text{entry}}$ represent the entry slippage rate (in basis points) and $\beta_{\text{exit}}$ represent the exit slippage rate (in basis points):

$$\begin{aligned}
r_{\text{entry}} &= \frac{\beta_{\text{entry}}}{10,000} \\
r_{\text{exit}} &= \frac{\beta_{\text{exit}}}{10,000} \\
\text{Entry Slippage} &= \text{Turnover}_{\text{entry}} \times r_{\text{entry}} \\
\text{Exit Slippage} &= \text{Turnover}_{\text{exit}} \times r_{\text{exit}} \\
\text{Total Slippage} &= \text{Entry Slippage} + \text{Exit Slippage}
\end{aligned}$$

#### Non-Symmetrical Rate Rationale:
In real-world microstructure, entry and exit execution friction are rarely identical:
* **Passive Entry vs Aggressive Exit:** A trade may enter via a resting limit order (0 to 4 bps friction), but exit via an urgent stop-loss market order in a falling order book (8 to 16 bps friction).
* **Take-Profit Limit vs Stop-Loss Market:** A target limit exit incurs negative or zero spread crossing, whereas an emergency stop-loss crosses the spread and sweeps depth.
* **Architecture Requirement:** The engine must never silently assume $\beta_{\text{entry}} = \beta_{\text{exit}}$. Both parameters must be independently configurable.

---

### 2.3 Indian Statutory Tax Schedule (NSE Equity Intraday MIS)

All statutory formulas implemented in `src/lib/tax.ts` adhere strictly to exchange circulars:

1. **Brokerage (Shoonya / Finvasia Intraday):**
   * Flat ₹5.00 per executed order leg $\implies$ **Flat ₹10.00 per round trip**.
   * Formula: $\text{Brokerage} = \max(10.00, \text{Brokerage}_{\text{legs}})$
2. **Securities Transaction Tax (STT):**
   * Statutory Rate: **0.025% (0.00025) on Sell Turnover only**.
   * Formula: $\text{STT} = \text{Turnover}_{\text{sell}} \times 0.00025$
3. **Exchange Transaction Charges (NSE Equity):**
   * Statutory Rate: **0.00297% (0.0000297) on Total Turnover**.
   * Formula: $\text{Exch} = \text{Turnover}_{\text{total}} \times 0.0000297$
4. **SEBI Turnover Fee:**
   * Statutory Rate: **0.0001% (0.000001, or ₹10 per crore) on Total Turnover**.
   * Formula: $\text{SEBI} = \text{Turnover}_{\text{total}} \times 0.000001$
5. **Stamp Duty (State Stamp Duty Act):**
   * Statutory Rate: **0.003% (0.00003) on Buy Turnover only**.
   * Formula: $\text{Stamp} = \text{Turnover}_{\text{buy}} \times 0.00003$
6. **Goods & Services Tax (GST):**
   * Statutory Rate: **18.0% on Service Charges** ($\text{Brokerage} + \text{Exchange Fees} + \text{SEBI Fees}$).
   * Formula: $\text{GST} = (\text{Brokerage} + \text{Exch} + \text{SEBI}) \times 0.18$

---

### 2.4 Total Charges & Net Realized P&L
$$\begin{aligned}
\text{Total Charges} &= \text{round}_2\Big(\text{Brokerage} + \text{STT} + \text{Exch} + \text{SEBI} + \text{Stamp} + \text{GST} + \text{Total Slippage}\Big) \\
\text{Gross P\&L} &= \text{round}_2\Big(\text{Raw Gross}\Big) \\
\text{Net Realized P\&L} &= \text{round}_2\Big(\text{Gross P\&L} - \text{Total Charges}\Big)
\end{aligned}$$

---

## 3. TypeScript Interface & Implementation

The updated `Charges` type definition and `roundTripCharges()` function signature in `src/lib/tax.ts`:

```typescript
export type Charges = {
  brokerage: number;
  stt: number;
  sttLabel: "STT" | "CTT";
  exchangeFees: number;
  sebi: number;
  stamp: number;
  gst: number;
  entrySlippage: number;
  exitSlippage: number;
  slippage: number;        // Total slippage = entrySlippage + exitSlippage
  entryTurnover: number;
  exitTurnover: number;
  totalTurnover: number;
  total: number;
};

export function roundTripCharges(args: {
  exchange: Exchange;
  kind: InstrumentKind;
  broker: BrokerId;
  qty: number;
  entry: number;
  exit: number;
  side: "BUY" | "SELL";
  productType?: "INTRADAY" | "DELIVERY" | "MIS" | "CNC";
  entrySlippageBps?: number;
  exitSlippageBps?: number;
}): Charges;
```

### Backwards Compatibility & Fallback Rule:
* If `entrySlippageBps` is omitted, it defaults to **8.0 bps** (retaining historical Phase 4/6 parity).
* If `exitSlippageBps` is omitted, it defaults to **0.0 bps** (explicitly logging the legacy one-sided assumption).
* When both are specified (e.g. `entrySlippageBps: 8, exitSlippageBps: 8`), the engine executes symmetrical two-sided accounting.

---

## 4. Precision & Rounding Rules

1. **Unrounded Intermediate Float Summation:**
   To eliminate cumulative floating-point rounding drift, `roundTripCharges()` sums unrounded intermediate floats and rounds the total once at the final step.
2. **Display Serialization:**
   Component fields (`brokerage`, `stt`, `entrySlippage`, etc.) are rounded to 2 decimal places for JSON serialization and user reporting.
3. **Paisa Conservation Invariant:**
   For every executed trade:
   $$|\text{Gross P\&L} - \text{Total Charges} - \text{Net P\&L}| \equiv 0.00$$

---

## 5. Audit Attestation

- **Lead Auditor:** Senior Quantitative Software Architect & Financial Mathematics Auditor
- **Audit Date:** 2026-11-17
- **Verification Status:** **ARCHITECTURE VERIFIED & CODE IMPLEMENTED IN `src/lib/tax.ts`**.
