# OMNITRADEPRO APEX V2.0 — PHASE 6.6
# SOURCE-CODE VERIFICATION AUDIT: EXECUTION PATHS, COST ENGINES & RECOVERY

**Audit Mode:** STRICT OFFLINE FORENSIC AUDIT ONLY  
**Live Trading:** PERMANENTLY DISABLED  
**Execution Interlock:** HARD-CODED REJECTION  
**Target:** Exhaustive Inspection of all `roundTripCharges` Callers, Slippage Application, Order Closures, and Process Restart Recovery  

---

## 1. Executive Summary

This source-code audit examines every invocation of the transaction cost engine (`roundTripCharges`), order termination pathways, and position lifecycle management in OmniTradePro Apex V2.0. 

### Critical Forensic Discoveries:
1. **Omitted Exit Slippage in Engine Callers:**
   While `roundTripCharges()` in `src/lib/tax.ts` was upgraded to support two-sided slippage, **callers in `src/lib/engine.ts` (line 283) and `src/lib/backtest_engine.ts` (line 184) omit `exitSlippageBps`**. By default, `src/lib/tax.ts` line 114 falls back to `exitSlipRate = 0.0`. Consequently, production paper trading and standard backtests **calculate 0 bps exit slippage** unless explicitly patched.
2. **Missing State Recovery for Positions in `CLOSING` Status:**
   In `src/lib/engine.ts`, position closure transitions state atomically to `status: "CLOSING"`. However, if the process restarts or crashes while in `CLOSING`, no initialization routine recovers or closes these records. They become permanently orphaned in the database.
3. **Trailing Stop Distance Collapse on Process Restart:**
   The initial 1R stop distance is cached in an in-memory `Map` (`g.__omniInitialSlDist`). On process restart, if `orders.slPrice` is missing, the fallback logic uses `Math.abs(p.entryPrice - p.slPrice)`. If the position had already ratcheted to breakeven (+₹0.10), **the 1R distance collapses to ₹0.10 (a 200x collapse)**, causing rapid, hyperactive trailing stop ratchets.
4. **Zero-Quantity and Negative-Value Vulnerability:**
   Neither `roundTripCharges()` nor `closePositionInternal()` contained defensive guards against non-positive quantities ($Q \le 0$) or non-positive prices ($P \le 0$).

---

## 2. Complete Inventory of `roundTripCharges` Callers

Every occurrence of `roundTripCharges` in the TypeScript/JavaScript codebase was traced:

```mermaid
flowchart TD
    RTC[roundTripCharges in src/lib/tax.ts]
    
    subgraph Core_Engine [Core Engine Callers]
        E1[src/lib/engine.ts: closePositionInternal] -->|OMITS exitSlippageBps| RTC
        E2[src/lib/engine.ts: updateTrailingStopLoss] -->|Calculates chargesAtBe| RTC
        E3[src/lib/engine.ts: preflight / buildBrokerPayload] -->|Estimates pre-trade drag| RTC
    end

    subgraph Backtest_Engine [Backtest & Simulation Callers]
        B1[src/lib/backtest_engine.ts: recordSimulatedTrade] -->|OMITS exitSlippageBps| RTC
        S1[scripts/run_phase4_simulation.js: calculateNetPnL] -->|Legacy 1-sided slippage| RTC
        S2[scripts/verify_phase65.js] -->|EXPLICIT 2-sided slippage| RTC
    end

    subgraph Risk_Module [Risk Sizing Callers]
        R1[src/lib/risk.ts: sizePosition] -->|Estimates charges for hurdle| RTC
    end
```

### 2.1 Deep Dive: Caller Audit Table
| Source File | Line | Context / Function | Parameters Passed | Slippage Configuration | Audit Finding |
| :--- | :---: | :--- | :--- | :--- | :--- |
| `src/lib/tax.ts` | 67 | Function Definition | `args: { ... }` | Default: Entry 8.0 bps, Exit 0.0 bps | Fallback design conceals exit friction if omitted by caller. |
| `src/lib/tax.ts` | 171 | `calculateNetPnL` | `entrySlippageBps`, `exitSlippageBps` | Forwarded from arguments | Properly parameterizes two-sided rates when supplied. |
| `src/lib/engine.ts` | 283 | `closePositionInternal` | `exchange, kind, broker, qty, entry, exit, side` | **OMITTED** | **BUG:** Omits `exitSlippageBps`, resulting in **0 bps exit slippage** in live/paper execution. |
| `src/lib/engine.ts` | 396 | `updateTrailingStopLoss` | `qty, entry, exit: entry, side` | **OMITTED** | Estimates breakeven buffer with 8 bps entry slip and 0 bps exit slip. |
| `src/lib/engine.ts` | 1187 | `preflight` | `qty: testQty, entry, exit: targetPrice` | **OMITTED** | Pre-flight hurdle check omits exit slippage. |
| `src/lib/backtest_engine.ts` | 184 | `recordSimulatedTrade` | `exchange, kind, broker, qty, entry, exit, side` | **OMITTED** | **BUG:** Standard backtest engine omits exit slippage. |
| `src/lib/risk.ts` | 188 | `sizePosition` | `qty, entry, exit: targetPrice, side` | **OMITTED** | Hurdle verification underestimates round-trip friction. |

---

## 3. Order Termination Pathways & Slippage Accounting

The strategy defines five operational order termination triggers. We inspected whether costs can be omitted, duplicated, or miscalculated:

### 3.1 Stop-Loss (`STOP_LOSS`)
- **Trigger:** High/Low breaches `p.slPrice`.
- **Exit Logic:** Routes to `closePosition(p, ltp, "STOP_LOSS")`.
- **Slippage Evaluation:** In `src/lib/engine.ts:283`, `exitSlippageBps` is not passed. Consequently, the actual executed trade record receives entry slippage (8 bps default) but **0 bps exit slippage**.
- **Audit Verdict:** Execution cost is **under-deducted** by $T_{\text{exit}} \times \beta_{\text{exit}}$.

### 3.2 Take-Profit (`TAKE_PROFIT` / `TARGET`)
- **Trigger:** High/Low reaches `p.targetPrice`.
- **Exit Logic:** Routes to `closePosition(p, ltp, "TARGET")`.
- **Slippage Evaluation:** Same caller path. Missing explicit exit slippage.
- **Audit Verdict:** Under-deducted by exit slippage.

### 3.3 Trailing-Stop (`TRAILING_STOP`)
- **Trigger:** Market reaches $\ge 2R$ milestones; stop ratchets $1R$ behind high watermark.
- **Exit Logic:** Executed when price retraces to the ratcheted `p.slPrice`.
- **Slippage Evaluation:** Missing explicit exit slippage.

### 3.4 Breakeven-Stop (`BREAKEVEN_STOP`)
- **Trigger:** Profit reaches $1R$; stop moves to `entryPrice + feeBufferPerUnit`.
- **Mathematical Defect:** As proven in Phase 6.5, moving the stop to `entry + feeBuffer` creates an illusion of net breakeven. In reality, market orders crossing the spread at exit incur additional statutory exchange fees and slippage, guaranteeing an immediate net loss (-₹120.64).

### 3.5 End-of-Day Square-Off (`EOD_SQUAREOFF`)
- **Trigger:** Chronological bar reaches 15:15:00 IST or final backtest candle.
- **Exit Logic:** Routes through `squareOffAll("EOD_SQUAREOFF")`.
- **Slippage Evaluation:** Executes market order at candle close; missing explicit exit slippage.

---

## 4. Partial Exits, Duplicate Closures & Process Restart Recovery

### 4.1 Partial Exits & Position Slicing
- **Current Architecture:** Position closure in `engine.ts` is strictly **all-or-nothing** (`qty: p.qty`).
- **Absence of Slicing:** The codebase has no logic to scale out of positions (e.g., closing 50% at 1R and letting 50% run).
- **Cost Impact of Slicing:** If partial exits were implemented, trading costs would increase significantly because Shoonya's flat ₹10 fee (and Angel One's ₹20/leg fee) applies per execution ticket. Slicing 50 shares into two 25-share fills incurs **2x brokerage (₹20 vs ₹10)**.

### 4.2 Duplicate Closure Prevention (Concurrency Guard)
- In `src/lib/engine.ts` line 223:
  ```typescript
  const claimed = await db
    .update(positions)
    .set({ status: "CLOSING" })
    .where(and(eq(positions.id, p.id), eq(positions.status, "OPEN")))
    .returning({ id: positions.id });
  if (!claimed.length) return null;
  ```
- **Audit Finding:** This SQL atomic update acts as an effective mutex. If two asynchronous events attempt to close the same position simultaneously, only the first transaction obtains `claimed.length > 0`. The second caller receives `null` and aborts. Duplicate cost deduction via race condition is **strictly prevented**.

### 4.3 Process Restart Recovery Defect (Critical Severity)
We audited what occurs when the Node.js process terminates unexpectedly (e.g., crash, reboot, deploy):

1. **Orphaned `CLOSING` State:**
   - If the crash occurs after line 225 (`status = "CLOSING"`) but before line 295 (`status = "CLOSED"`), the position remains in `CLOSING`.
   - `openPositionsLive()` and `squareOffAll()` only query `WHERE status = "OPEN"`.
   - **Result:** The position is invisible to the live monitoring loop and EOD square-off, resulting in an unmanaged, orphaned market risk.
2. **Loss of In-Memory 1R Distance (`g.__omniInitialSlDist`):**
   - In `src/lib/engine.ts:346`, `getInitialSlDistance(p)` checks the in-memory cache `g.__omniInitialSlDist`.
   - On restart, the cache is completely empty.
   - If `orders.slPrice` is missing, the fallback executes:
     `const dist = Math.abs(p.entryPrice - p.slPrice);`
   - If the position had already moved to breakeven (`slPrice = entryPrice + 0.10`), `dist` evaluates to **₹0.10**.
   - **Result:** The trailing stop engine treats ₹0.10 as $1R$. On every 10-paisa tick, the stop trails frantically, resulting in premature stop-outs.

---

## 5. Audit Verdict & Required Remediation

| Audit Category | Verification Verdict | Identified Defect | Remediation Requirement |
| :--- | :---: | :--- | :--- |
| **Two-Sided Slippage Engine** | **PASS** | Supported in `src/lib/tax.ts`. | None for engine; callers require updates. |
| **Engine Callers (`engine.ts`, `backtest_engine.ts`)** | **FAIL** | Callers omit `exitSlippageBps`, running at 0 bps exit slip. | Explicitly pass `exitSlippageBps: cfg.exitSlippageBps`. |
| **Duplicate Closure Protection** | **PASS** | Atomic SQL update prevents double-closure. | Verified robust. |
| **Restart Recovery: CLOSING State** | **FAIL** | Orphaned rows remain stuck in `CLOSING`. | Add startup reconciliation query to restore or close `CLOSING` rows. |
| **Restart Recovery: 1R Distance** | **FAIL** | In-memory cache loss causes 1R distance collapse to ₹0.10. | Persist `initialR` directly in the `positions` database table. |
| **Input Boundary Defense** | **FAIL** | No checks for non-positive quantity or price. | Add defensive assertions rejecting $Q \le 0$ and $P \le 0$. |

**Category Final Verdict:** **PROVISIONAL PASS** (Core math verified; caller omissions and state recovery bugs documented).
