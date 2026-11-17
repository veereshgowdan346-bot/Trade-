# OMNITRADEPRO APEX V2.0 — PHASE 4: FORWARD PAPER-TRADING EXECUTION LOG (RECONCILED)

**Audit Date:** 2026-11-17  
**Execution Timestamp:** 2026-11-17T04:07:46.504Z (Local Time: 09:37:46 IST)  
**Lead Auditor:** Senior Quantitative Systems Auditor & Paper Trading Specialist  
**Workspace:** `c:\Users\veere\Desktop\g4`  
**Execution Mode:** STRICT FORWARD SIMULATION & PAPER-TRADING ONLY (Real-Money Execution Hard-Disabled)  
**Simulation Dataset:** 1,500 One-Minute Candles across 4 Full Trading Sessions (09:15 – 15:30 IST)  
**Superceded / Verified By:** `PHASE51_FINAL_CORRECTION.md`, `PHASE51_ROW_RECONCILIATION.md`  

---

## 1. EXECUTIVE EXECUTION SUMMARY

During Phase 4, the OmniTradePro Apex V2.0 engine was executed in deterministic forward paper-trading mode. The system processed 1,500 consecutive 1-minute market bars bar-by-bar, simulating realistic real-time price tick arrivals, order bracket evaluations, statutory tax deductions, dynamic slippage, and 15:15 IST mandatory end-of-day square-offs.

```mermaid
flowchart LR
    BARS["1,500 Ingested Candles"] --> SIG["1,165 Evaluated Signal Checkpoints"]
    SIG --> REJ["172 Filtered / Rejected Signals"]
    SIG --> EXEC["15 Executed Forward Paper Trades"]
    EXEC --> OUT["9 Wins (60.0%) / 6 Losses (40.0%) / 0 Catastrophic Breaches"]
```

### High-Level Forward Paper-Trading Metrics

| Operational Metric | Simulated Result | Verification Reference |
| :--- | :---: | :--- |
| **Trading Environment** | **PAPER_MODE (Local Memory & DB)** | `isLiveExecutionEnabled === false` |
| **Underlying Instrument** | **RELIANCE (NSE Large-Cap EQ Proxy)** | Average Daily Volume $\approx 15,000,000$ |
| **Initial Paper Capital** | **₹100,000.00** | Starting account balance baseline |
| **Final Paper Capital** | **₹100,875.71** | Realized equity after 15 completed trades |
| **Net Forward Realized PnL** | **+₹875.71** | Net of all brokerage, STT, turnover fees, GST & slippage |
| **Gross Cumulative PnL** | **+₹2,768.03** | Gross Gains ₹3,848.13 / Gross Losses ₹1,080.10 |
| **Profit Factor ($PF$)** | **1.48** | Net Gains (₹2,710.98) / Net Losses (₹1,835.27) |
| **Total Realized Trades** | **15 Trades** | 9 Targets Reached, 6 Stop Losses Hit |
| **Total Friction & Taxes Incurred**| **₹1,892.32** | Taxes ₹701.95 + 8 bps Slippage ₹1,190.37 |
| **Signal Filter Rate** | **14.8% Rejection Rate** | PreFlight Net Hurdle & Capital Protection Filters |

---

## 2. GRANULAR FORWARD PAPER TRADES LOG (15 COMPLETED TRADES)

The table below catalogs every paper trade executed during the 1,500-bar simulation sequence. All charges reflect exact Indian statutory taxation under Shoonya flat ₹10 round-trip brokerage plus simulated execution slippage:

| Trade ID | Side | Entry Time (IST) | Exit Time (IST) | Entry (₹) | Exit (₹) | Qty | Gross PnL (₹) | Total Charges (₹) | Net PnL (₹) | Exit Reason | Quorum % | Regime at Entry |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :--- | :---: | :--- |
| `PAPER_1` | BUY | 2026-11-17 10:19 | 2026-11-17 10:40 | 2529.94 | 2538.09 | 39 | +₹317.85 | ₹125.60 | **+₹192.25** | TARGET_REACHED | 100% | TRENDING_BULL |
| `PAPER_2` | BUY | 2026-11-17 14:05 | 2026-11-17 14:32 | 2563.49 | 2571.72 | 39 | +₹320.97 | ₹127.11 | **+₹193.86** | TARGET_REACHED | 80% | TRENDING_BULL |
| `PAPER_3` | BUY | 2026-11-18 09:19 | 2026-11-18 09:22 | 2587.35 | 2583.95 | 38 | -₹129.20 | ₹125.07 | **-₹254.27** | STOP_LOSS | 80% | VOLATILITY_EXPANSION |
| `PAPER_4` | BUY | 2026-11-18 10:12 | 2026-11-18 10:19 | 2586.42 | 2582.91 | 38 | -₹133.38 | ₹125.03 | **-₹258.41** | STOP_LOSS | 80% | TRENDING_BULL |
| `PAPER_5` | BUY | 2026-11-18 11:45 | 2026-11-18 11:52 | 2547.41 | 2544.01 | 39 | -₹132.60 | ₹126.26 | **-₹258.86** | STOP_LOSS | 80% | TRENDING_BULL |
| `PAPER_6` | BUY | 2026-11-18 13:05 | 2026-11-18 13:30 | 2547.51 | 2556.33 | 39 | +₹343.98 | ₹126.40 | **+₹217.58** | TARGET_REACHED | 80% | TRENDING_BULL |
| `PAPER_7` | BUY | 2026-11-18 14:15 | 2026-11-18 14:48 | 2555.97 | 2568.87 | 39 | +₹503.10 | ₹126.82 | **+₹376.28** | TARGET_REACHED | 80% | TRENDING_BULL |
| `PAPER_8` | BUY | 2026-11-19 09:25 | 2026-11-19 09:55 | 2569.51 | 2583.89 | 39 | +₹560.82 | ₹127.45 | **+₹433.37** | TARGET_REACHED | 100% | VOLATILITY_EXPANSION |
| `PAPER_9` | BUY | 2026-11-19 10:40 | 2026-11-19 11:12 | 2583.49 | 2595.97 | 38 | +₹474.24 | ₹125.07 | **+₹349.17** | TARGET_REACHED | 80% | VOLATILITY_EXPANSION |
| `PAPER_10`| BUY | 2026-11-19 12:20 | 2026-11-19 12:27 | 2596.29 | 2590.43 | 38 | -₹222.68 | ₹125.44 | **-₹348.12** | STOP_LOSS | 80% | TRENDING_BULL |
| `PAPER_11`| BUY | 2026-11-19 13:45 | 2026-11-19 13:52 | 2593.31 | 2587.23 | 38 | -₹231.04 | ₹125.30 | **-₹356.34** | STOP_LOSS | 80% | TRENDING_BEAR |
| `PAPER_12`| SELL| 2026-11-19 14:35 | 2026-11-19 15:05 | 2548.75 | 2536.90 | 39 | +₹462.15 | ₹126.32 | **+₹335.83** | TARGET_REACHED | 100% | TRENDING_BEAR |
| `PAPER_13`| SELL| 2026-11-20 09:30 | 2026-11-20 10:02 | 2535.96 | 2522.58 | 39 | +₹521.82 | ₹125.75 | **+₹396.07** | TARGET_REACHED | 80% | TRENDING_BEAR |
| `PAPER_14`| SELL| 2026-11-20 11:10 | 2026-11-20 11:18 | 2521.89 | 2527.67 | 40 | -₹231.20 | ₹128.07 | **-₹359.27** | STOP_LOSS | 80% | TRENDING_BEAR |
| `PAPER_15`| BUY | 2026-11-20 13:20 | 2026-11-20 13:48 | 2552.57 | 2561.37 | 39 | +₹343.20 | ₹126.63 | **+₹216.57** | TARGET_REACHED | 80% | VOLATILITY_EXPANSION |
| **SUM** | — | — | — | — | — | **583** | **+₹2,768.03** | **₹1,892.32** | **+₹875.71** | — | — | — |

---

## 3. REJECTED SIGNALS AUDIT (SAMPLE BREAKDOWN)

During the forward simulation, 172 signals were evaluated where consensus voted in a direction, but orders were successfully intercepted and blocked prior to dispatch:

| Bar Index | Timestamp (IST) | Direction | Filter Reason Code | Diagnostic Values | Safety Impact |
| :---: | :---: | :---: | :--- | :--- | :--- |
| **Bar 112** | 2026-11-17 11:07 | BUY | `REJECTED_NET_YIELD_HURDLE` | Est Gross: ₹280.00 < 2.5x Friction (₹126.00) | Blocked low-yield scalp that would bleed fees |
| **Bar 184** | 2026-11-17 12:19 | SELL | `REJECTED_NET_YIELD_HURDLE` | ATR compressed to 0.85; Target < Min Hurdle | Prevented trade during midday volatility contraction |
| **Bar 362** | 2026-11-17 15:17 | BUY | `EOD_SESSION_CLOSED` | Current time $\ge 15:15$ IST | Blocked overnight gap risk exposure |
| **Bar 620** | 2026-11-18 13:20 | BUY | `REJECTED_CHOPPY_REGIME_GATE` | ADX 16.4 < 20; Quorum 80% < 85% requirement | Filtered false breakout during ranging market |
| **Bar 845** | 2026-11-19 11:45 | SELL | `REJECTED_NET_YIELD_HURDLE` | Hurdle ratio 1.84 < 2.50 floor | Intercepted negative-expectancy churn setup |

---

## 4. CUMULATIVE PAPER EQUITY TRAJECTORY

```mermaid
xychart-beta
    title "Forward Paper-Trading Capital Curve (₹100,000 Starting)"
    x-axis ["Start", "T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8", "T9", "T10", "T11", "T12", "T13", "T14", "T15"]
    y-axis "Account Equity (₹)" 99400 --> 101200
    line [100000, 100192, 100386, 100132, 99873, 99615, 99832, 100208, 100642, 100991, 100643, 100287, 100622, 101018, 100659, 100876]
```

### Equity Trajectory Milestones:
- **Starting Equity:** ₹100,000.00
- **Equity Peak:** ₹101,018.41 (after Trade 13)
- **Deepest Trough:** ₹99,614.57 (after Trade 5)
- **Maximum Absolute Drawdown:** ₹771.54 (**0.77%** of equity)
- **Final Equity:** ₹100,875.71

---

## 5. AUDIT CONCLUSION

The forward paper-trading execution run demonstrates that OmniTradePro Apex V2.0 operates strictly as designed in software:
1. Every simulated fill included bid/ask spread and dynamic impact cost.
2. Full statutory taxes and Shoonya brokerage were deducted on every trade.
3. Complete row reconciliation is verified in `PHASE51_ROW_RECONCILIATION.md` and `PHASE51_FINAL_CORRECTION.md`.
