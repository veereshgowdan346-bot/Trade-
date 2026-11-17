# OMNITRADEPRO APEX V2.0 — PHASE 6.6
# DATA INTEGRITY & SYNTHETIC PROVENANCE AUDIT REPORT

**Audit Mode:** STRICT OFFLINE FORENSIC AUDIT ONLY  
**Live Trading:** PERMANENTLY DISABLED  
**Target:** Raw Ledger Cross-Verification, Chronological Ordering, Quantity Invariance, and Provenance Demarcation  

---

## 1. Executive Summary

This forensic data integrity audit performs an exhaustive row-by-row reconciliation of all 15 Phase 4 forward paper trades and all 19 high-volatility whipsaw stress trades against their raw underlying JSON files:
- `scripts/phase4_simulation_output.json`
- `scripts/phase62_whipsaw_output.json`

### Primary Audit Findings:
1. **Zero Row-Level Drift:** 100% of trade IDs, entry prices, exit prices, traded quantities, and timestamps match their raw source records with zero discrepancies.
2. **Sequential & Monotonic Order:** Both datasets exhibit strictly monotonic timestamp and bar ordering with **zero temporal inversions or lookahead leakage**.
3. **Quantity Invariance:** Fluctuations in position sizing (37 to 39 shares) are 100% explained by the 1% risk-sizing rule against dynamic ATR stop-loss distances.
4. **Synthetic Provenance Confirmation:** **Both datasets are 100% synthetic.** They were generated via deterministic Linear Congruential Generators (LCG) with pseudo-random seeds (`seed = 42` and `seed = 999`). There is **zero genuine historical exchange data** in these records.

---

## 2. Phase 4 Forward Paper Trades Audit (15 Trades)

### 2.1 Raw Record Verification Matrix
Source: `scripts/phase4_simulation_output.json` | Symbol: RELIANCE EQ

| Trade ID | Side | Entry Bar | Exit Bar | Entry Time (UTC) | Exit Time (UTC) | Entry Price | Exit Price | Qty | Gross P&L | Total Turnover | Status |
| :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **PAPER_1** | BUY | 64 | 85 | 2026-11-17T04:49:00Z | 2026-11-17T05:10:00Z | ₹2,529.94 | ₹2,538.09 | 39 | +₹317.85 | ₹197,653.17 | **VERIFIED** |
| **PAPER_2** | BUY | 100 | 121 | 2026-11-17T05:25:00Z | 2026-11-17T05:46:00Z | ₹2,563.49 | ₹2,571.72 | 39 | +₹320.97 | ₹200,273.19 | **VERIFIED** |
| **PAPER_3** | BUY | 136 | 148 | 2026-11-17T06:01:00Z | 2026-11-17T06:13:00Z | ₹2,587.35 | ₹2,583.95 | 38 | -₹129.20 | ₹196,509.40 | **VERIFIED** |
| **PAPER_4** | BUY | 155 | 167 | 2026-11-17T06:20:00Z | 2026-11-17T06:32:00Z | ₹2,586.42 | ₹2,582.91 | 38 | -₹133.38 | ₹196,434.54 | **VERIFIED** |
| **PAPER_5** | BUY | 179 | 200 | 2026-11-17T06:44:00Z | 2026-11-17T07:05:00Z | ₹2,607.12 | ₹2,615.46 | 38 | +₹316.92 | ₹198,458.04 | **VERIFIED** |
| **PAPER_6** | BUY | 215 | 236 | 2026-11-17T07:20:00Z | 2026-11-17T07:41:00Z | ₹2,624.88 | ₹2,633.28 | 38 | +₹319.20 | ₹199,810.08 | **VERIFIED** |
| **PAPER_7** | BUY | 251 | 263 | 2026-11-17T07:56:00Z | 2026-11-17T08:08:00Z | ₹2,628.75 | ₹2,625.33 | 38 | -₹129.96 | ₹199,655.04 | **VERIFIED** |
| **PAPER_8** | BUY | 270 | 291 | 2026-11-17T08:15:00Z | 2026-11-17T08:36:00Z | ₹2,627.91 | ₹2,636.32 | 38 | +₹319.58 | ₹200,040.74 | **VERIFIED** |
| **PAPER_9** | BUY | 305 | 326 | 2026-11-17T08:50:00Z | 2026-11-17T09:11:00Z | ₹2,641.50 | ₹2,649.95 | 38 | +₹321.10 | ₹201,075.10 | **VERIFIED** |
| **PAPER_10** | BUY | 506 | 518 | 2026-11-18T05:11:00Z | 2026-11-18T05:23:00Z | ₹2,674.20 | ₹2,670.72 | 37 | -₹128.76 | ₹197,762.04 | **VERIFIED** |
| **PAPER_11** | BUY | 525 | 546 | 2026-11-18T05:30:00Z | 2026-11-18T05:51:00Z | ₹2,658.15 | ₹2,666.66 | 38 | +₹323.38 | ₹200,342.78 | **VERIFIED** |
| **PAPER_12** | BUY | 560 | 581 | 2026-11-18T06:05:00Z | 2026-11-18T06:26:00Z | ₹2,682.40 | ₹2,690.98 | 37 | +₹317.46 | ₹198,815.06 | **VERIFIED** |
| **PAPER_13** | BUY | 596 | 608 | 2026-11-18T06:41:00Z | 2026-11-18T06:53:00Z | ₹2,688.10 | ₹2,684.61 | 37 | -₹129.13 | ₹198,790.27 | **VERIFIED** |
| **PAPER_14** | BUY | 615 | 627 | 2026-11-18T07:00:00Z | 2026-11-18T07:12:00Z | ₹2,686.95 | ₹2,683.46 | 37 | -₹129.13 | ₹198,705.17 | **VERIFIED** |
| **PAPER_15** | BUY | 1205 | 1226 | 2026-11-20T08:15:00Z | 2026-11-20T08:36:00Z | ₹2,718.35 | ₹2,727.05 | 37 | +₹321.90 | ₹201,479.80 | **VERIFIED** |

### 2.2 Data Integrity Checklist (Phase 4)
- **Duplicate IDs:** 0 duplicates. All 15 IDs are sequential (`PAPER_1` to `PAPER_15`).
- **Missing Rows:** 0 missing rows.
- **Timestamp Monotonicity:** Strictly increasing ($\text{Exit}_i \le \text{Entry}_{i+1}$). No temporal overlapping or lookahead.
- **Turnover Conservation:**
  $$\sum T_{\text{entry}} = ₹1,487,995.92, \quad \sum T_{\text{exit}} = ₹1,489,165.71, \quad T_{\text{tot}} = ₹2,977,161.63$$
- **Quantity Explanation:** Sized quantity varies between 37 and 39 shares strictly due to $Q = \lfloor 1000 / \text{slDistance} \rfloor$ under the 1% risk rule as RELIANCE price rises from ₹2,529 to ₹2,718. Zero unexplained quantity jumps.

---

## 3. High-Volatility Whipsaw Stress Audit (19 Trades)

### 3.1 Raw Record Verification Summary
Source: `scripts/phase62_whipsaw_output.json` | Symbol: RELIANCE EQ

- **Total Trades:** 19
- **Bar Range:** Bar 24 through Bar 712.
- **Duplicate IDs:** 0 duplicates (IDs 1 through 19).
- **Traded Sides:** 13 BUY trades, 6 SELL trades.
- **Quantities:** 39 shares for trades 1–13, 37 shares for trades 14–19.
- **Exit Types:** 12 Stop Losses (Hard SL) and 7 Breakeven Stop Losses (BE_SL).
- **Turnover Conservation:**
  $$\sum T_{\text{entry}} = ₹1,833,701.21, \quad \sum T_{\text{exit}} = ₹1,831,174.45, \quad T_{\text{tot}} = ₹3,664,875.66$$
- **Gross P&L:** Exactly **-₹2,526.76**.
- **Net P&L (8 bps entry slip legacy):** Exactly **-₹4,862.77**.
- **Net P&L (4 bps two-sided slip):** Exactly **-₹4,862.47**.
- **Net P&L (8 bps two-sided slip):** Exactly **-₹6,328.42**.

---

## 4. Synthetic Provenance Confirmation

A foundational rule of quantitative financial auditing is the strict separation of **synthetic simulation** from **empirical market evidence**.

### 4.1 Proof of Synthetic Origin
Inspection of `scripts/run_phase4_simulation.js` lines 39–65 reveals the exact generator used:
```javascript
function generateSampleMarketFeed(days = 4, basePrice = 2500, seed = 42) {
  let rng = seed;
  const nextRand = () => {
    rng = (rng * 1664525 + 1013904223) % 4294967296;
    return rng / 4294967296;
  };
  ...
```
**Audit Finding:**
1. The price series was created using a standard **Linear Congruential Generator (LCG)** with `seed = 42`.
2. Volatility, drift, and candle high/low distributions were mathematically synthesized.
3. The dataset timestamp extends from `2026-11-17` to `2026-11-20`.
4. The whipsaw dataset in `scripts/verify_phase62.js` was similarly generated using `seed = 999` with injected sinusoidal chop.

### 4.2 Mandatory Research Demarcation
- **Synthetic Data Status:** Valid for deterministic unit testing, execution engine debugging, and stress-testing logic.
- **Historical Evidence Status:** **COMPLETELY INVALID AS HISTORICAL EVIDENCE.**
- **Compliance Certification:** This audit confirms that synthetic datasets are **NEVER** cited as real-world evidence of strategy alpha, profitability, or institutional edge.

---

## 5. Audit Verdict

- **Ledger Verification:** 100% row-level and aggregate match against raw JSON files.
- **Data Integrity:** Zero duplicate IDs, zero missing rows, zero timestamp anomalies.
- **Provenance Transparency:** 100% synthetic origin documented with zero false claims of exchange feed data.

**Category Final Verdict:** **PASS**
