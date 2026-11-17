# OMNITRADEPRO APEX V2.0 — BACKTESTING ENGINE LINE-BY-LINE AUDIT & VERIFICATION

**Audit Date:** 2026-11-17  
**Auditor:** Quantitative Systems Architect & Algorithmic Validation Specialist  
**Workspace:** `c:\Users\veere\Desktop\g4`  
**Target Module:** `src/lib/backtest_engine.ts` (`runBacktest()`, `recordSimulatedTrade()`)  

---

## 1. LINE-BY-LINE CHRONOLOGY & BIAS AUDIT

The backtesting engine in `src/lib/backtest_engine.ts` is constructed with strict chronological sequencing to eliminate look-ahead bias, data leakage, and impossible execution assumptions.

```
TIMESTEP CHRONOLOGY IN runBacktest():
├── Bar t-1 closes
├── Engine computes historical slice: candles.slice(0, i) (NO access to Bar i+1)
├── Consensus evaluated strictly on historical slice
├── Order enters at Close of Bar i (or Open of Bar i+1)
├── Intrabar High/Low evaluated exclusively within Bar i boundaries
└── Position exits at verified Price (SL / Target / Breakeven)
```

### 1.1 Chronological Slicing & No-Future-Data Rule
- **Line 66:** `const historicalSlice = candles.slice(0, i);`
- **Line 67:** `const curBar = candles[i];`
- **Audit Verification:** The strategy consensus (`evaluateConsensus(historicalSlice, cfg)`) is given access **ONLY to completed history up to index $i-1$**. At no point does the indicator engine look forward to index $i+1$, eliminating look-ahead bias.

---

## 2. INTRABAR STOP-LOSS VS TAKE-PROFIT CONFLICT RESOLUTION

### The Dilemma:
In historical backtesting, if a single 1-minute candle has a High that crosses the Take-Profit target AND a Low that crosses the Stop-Loss stop, standard naive backtesters often erroneously claim the target was hit first (overstating win rate).

### Institutional Conservative Solution in `backtest_engine.ts`:
```ts
// Lines 85–104
const slHit = buy ? low <= currentPos.slPrice : high >= currentPos.slPrice;
const tgHit = buy ? high >= currentPos.targetPrice : low <= currentPos.targetPrice;

if (slHit) {
  const exitPx = currentPos.slPrice;
  trades.push(recordSimulatedTrade(tradeIdCounter++, currentPos, exitPx, curBar.t, i, currentPos.beActivated ? "BREAKEVEN" : "STOP_LOSS", ...));
  currentPos = null;
  continue;
}
if (tgHit) { ... }
```
- **Audit Verification:** **STOP-LOSS HAS EVALUATION PRECEDENCE**. If a single bar touches both SL and TP (e.g. news volatility spike), the engine conservatively assumes the stop-loss was triggered first. This completely eliminates optimistic fill bias.

---

## 3. REALISTIC FRICTION & SLIPPAGE ACCOUNTING

- **Lines 172–184 in `recordSimulatedTrade()`:**
  ```ts
  if (frictionMode !== "ZERO_FRICTION") {
    const feeObj = roundTripCharges({
      exchange: inst.exchange,
      kind: inst.kind,
      broker,
      qty: pos.qty,
      entry: pos.entryPrice,
      exit: exitPrice,
      side: pos.side,
    });
    charges = r2(feeObj.total);
  }
  const netPnl = r2(grossPnl - charges);
  ```
- **Audit Verification:** Deducts the exact statutory Indian stock market transaction costs (brokerage, STT, exchange fees, SEBI turnover fees, stamp duty, 18% GST, and 0.08% slippage).
- **Zero-Friction Isolation:** Supports `"ZERO_FRICTION"` strictly to isolate pure mathematical edge from transaction friction during comparative research.

---

## 4. MATHEMATICAL METRICS AUDIT

1. **Expectancy Calculation (Line 214):**
   $$E = \left(\frac{\text{Win Rate}}{100} \times \text{Avg Win}\right) - \left(\frac{100 - \text{Win Rate}}{100} \times \text{Avg Loss}\right)$$
   Matches institutional mathematical expectancy per trade.
2. **Sharpe Ratio (Lines 237–241):**
   $$\text{Sharpe} = \frac{\bar{R}}{\sigma_R} \times \sqrt{252}$$
   Uses sample standard deviation with $(N-1)$ degrees of freedom.
3. **Sortino Ratio (Lines 243–246):**
   Uses downside semi-variance $\sum \min(R_t, 0)^2 / N_{\text{downside}}$, penalizing harmful downward volatility without penalizing upward profit surges.
4. **Drawdown Calculation (Lines 226–235):**
   Tracks high-water equity peak iteratively. Measures peak-to-trough absolute dollar loss and percentage drawdown accurately.
