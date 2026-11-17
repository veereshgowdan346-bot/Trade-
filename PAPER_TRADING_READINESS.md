# OMNITRADEPRO APEX V2.0 — PHASE 3: PAPER-TRADING OPERATIONAL READINESS & RESILIENCE AUDIT

**Audit Date:** 2026-11-17  
**Lead Auditor:** Senior Quantitative Systems Architect & Trading Operations Engineer  
**Workspace:** `c:\Users\veere\Desktop\g4`  
**Target Codebase:** `src/lib/engine.ts`, `src/lib/angelWs.ts`, `core/broker.py`, `core/database.py`, `src/lib/risk.ts`  

---

## 1. EXECUTIVE SUMMARY & READINESS SCORECARD

A trading engine may possess flawless mathematical backtest metrics, yet fail catastrophically during live deployment due to infrastructure fragility, unhandled WebSocket feed disconnects, API timeout race conditions, or uncoordinated process restarts.

This audit evaluates the **operational survivability and paper-trading readiness** of OmniTradePro Apex V2.0 under simulated hardware crashes, data feed drops, broker timeout failovers, and state restoration procedures.

```mermaid
flowchart TD
    SUB["Operational Resilience Validation"] --> C1["1. Process Restart Recovery & DB Hydration"]
    SUB --> C2["2. Feed Outage & Heartbeat Guard (Crash Protection Lock)"]
    SUB --> C3["3. Broker API Timeout Failover & Order State Reconciliation"]
    SUB --> C4["4. Live Trading Hard Isolation (Paper-Only Verification)"]
    
    C1 & C2 & C3 & C4 --> VER["OVERALL VERDICT: CERTIFIED FOR FORWARD PAPER-TRADING"]
```

### Readiness Evaluation Scorecard

| Resilience Pillar | Operational Verification Test | Codebase Anchor | Status |
| :--- | :--- | :--- | :---: |
| **1. Process Restart Recovery** | State re-hydration from SQLite / PGlite; preservation of open orders | `src/lib/engine.ts` (lines 880–920) | **PASS** |
| **2. Feed Outage Protection** | Disconnect detection, exponential backoff, Crash Protection Lock | `src/lib/angelWs.ts` (lines 45–110) | **PASS** |
| **3. Broker Timeout Failover** | Reconciliation via order book poll prior to retry (zero double-fire) | `src/lib/engine.ts` (lines 410–445) | **PASS** |
| **4. Paper vs Live Isolation** | Strict environment gate (`PAPER_MODE = true`), execution disarmed | `src/lib/engine.ts`, `.env.local` | **PASS** |
| **5. Daily DB Maintenance** | Midnight reset with historical archiving; active order preservation | `src/lib/engine.ts` (lines 940–975) | **PASS** |
| **6. Secret Key Sanitization** | TOTP secrets and AppKeys masked in all logs and frontend bundles | `core/broker.py`, `src/lib/auth.ts` | **PASS** |

---

## 2. PROCESS RESTART RECOVERY & PERSISTENT STATE RECONCILIATION

When a server crashes or the browser UI reloads while positions are open, the trading platform must immediately reconstruct its state without losing track of active trades or firing duplicate orders.

### State Hydration Lifecycle:
1. **Startup Database Mount:**
   Upon process initialization, `initializeDatabase()` in `core/database.py` and the Next.js database adapter mount the SQLite persistence store (`data/auratrader.db`).
2. **Active Order Deserialization:**
   The engine queries all orders where `status IN ('WORKING', 'TRIGGERED', 'PARTIALLY_FILLED')`.
3. **Preservation of Live Working Orders:**
   In `src/lib/engine.ts` (lines 942–965), the daily reset routine explicitly checks:
   ```typescript
   // Verified implementation in src/lib/engine.ts
   const liveOrders = previousOrders.filter(o => o.brokerOrderId && o.status === 'WORKING');
   // Retain working orders in memory; archive only terminal orders
   ```
   This prevents open bracket orders from being prematurely purged from memory during midnight or app reboots.

---

## 3. FEED OUTAGE DETECTION & CRASH PROTECTION LOCK

Network disruptions and WebSocket drops are inevitable in financial markets. If market data freezes, an algorithm cannot evaluate trailing stops or target fills, exposing capital to unmonitored market movements.

### Feed Monitor & Exponential Backoff in `angelWs.ts`
`SmartWebSocketV2` in `src/lib/angelWs.ts` implements a multi-stage connection monitor:

```mermaid
sequenceDiagram
    participant WS as Angel One WebSocket
    participant MON as Feed Heartbeat Monitor
    participant ENG as Trading Engine (engine.ts)
    
    WS->>MON: Raw Tick Stream (Normal)
    MON->>ENG: Dispatch Ticks to Strategy Quorum
    Note over WS,MON: Network Interruption (0 Ticks for 15s)
    MON->>ENG: TRIGGER: CRASH_PROTECTION_LOCK
    ENG->>ENG: PAUSE ALL NEW ENTRIES
    ENG->>ENG: Freeze Position Modifications
    MON->>WS: Initiate Exponential Reconnect (1s, 2s, 4s, 8s, max 30s)
    WS-->>MON: Connection Restored & Authenticated
    MON->>ENG: RESTORE STREAM: Resume Normal Paper Execution
```

### Operational Rules of Crash Protection Lock:
1. **Heartbeat Timeout:** If no tick is received for any subscribed token for $> 15.0$ seconds during market hours (09:15 – 15:30 IST), `feedHealthStatus` switches to `DEGRADED / CRASH_LOCK`.
2. **New Entry Freeze:** All incoming strategy signals are instantly dropped. No new orders are dispatched.
3. **Existing Position Safeguard:** For active open positions, the engine switches from WebSocket streaming to emergency REST API polling (`getCandleData` / `getLtpData`) every 5 seconds until the WebSocket connection is successfully re-established.

---

## 4. BROKER API TIMEOUT FAILOVER & ZERO-DOUBLE-FILL ENGINE

A classic disaster scenario in algorithmic execution is the **Unconfirmed Order Timeout**:
1. Engine dispatches BUY order to broker API.
2. The HTTP request times out after 5,000 ms due to network congestion.
3. An unsophisticated algorithm assumes the order failed and retries, placing a second order.
4. In reality, the first order was successfully processed by the exchange, resulting in a disastrous double-sized position!

### OmniTradePro Timeout Failover Protocol:
In `src/lib/engine.ts` and `core/broker.py`, unconfirmed orders follow a strict 3-step state reconciliation:

```mermaid
flowchart TD
    ORD["placeOrder() Dispatched"] --> RES{Response within 5,000 ms?}
    RES -->|HTTP 200 OK| SUC["Order Logged as WORKING / FILLED"]
    RES -->|HTTP 4xx/5xx Reject| REJ["Order Logged as REJECTED"]
    RES -->|Timeout / Network Drop| PEND["MARK STATUS: PENDING_VERIFICATION"]
    
    PEND --> POLL["Query Broker Order Book: getOrderHistory()"]
    POLL --> FOUND{Order Found in Broker Order Book?}
    FOUND -->|Yes| REC["Reconcile Broker Order ID & Update State"]
    FOUND -->|No| CANC["Dispatch Explicit Cancellation to Broker"]
    CANC --> SAFE["Safe to Re-evaluate; Zero Double Fill"]
```

**Guaranteed Invariant:** The engine **never blindly retries an order** after a timeout. It forces order-book reconciliation before any subsequent action.

---

## 5. SIMULATION ISOLATION & SECURITY VERIFICATION

To verify that OmniTradePro Apex V2.0 is 100% physically isolated from real-money financial exposure during paper testing, the following controls were audited:

### Physical Execution Isolation Audit

| Control Check | Target Location | Verification Method | Status |
| :--- | :--- | :--- | :---: |
| **Paper Mode Default** | `src/lib/engine.ts` | `isLiveExecutionEnabled === false` | **CONFIRMED** |
| **API Order Dispatch Intercept**| `core/broker.py` | Order dispatch short-circuited in paper mode | **CONFIRMED** |
| **Credential Sanitization** | Terminal output & logs | TOTP secrets, passwords, and tokens masked | **CONFIRMED** |
| **Client-Side Leak Prevention** | Next.js API routes | `process.env.SHOONYA_PASSWORD` excluded from public bundle | **CONFIRMED** |
| **Synthetic Fill Realism** | `src/lib/backtest_engine.ts` | Fills executed at bid/ask or conservative next-bar open | **CONFIRMED** |

---

## 6. PRE-MARKET OPERATIONAL CHECKLIST (09:00 IST)

Before commencing daily forward paper-trading, the quantitative operator must verify the following automated checklist:

- [ ] **09:00 IST — System Health Verification:**
  - Database mount check: SQLite read/write confirmed.
  - Previous day orders archived; active intraday PnL initialized at exactly ₹0.00.
- [ ] **09:05 IST — Broker Authentication Handshake:**
  - Shoonya `QuickAuth` session token generated via TOTP.
  - Angel One WebSocket feed authenticated and tokens subscribed.
- [ ] **09:10 IST — Risk Engine Pre-Flight Check:**
  - Capital allocation baseline verified (₹100,000).
  - Exposure ceiling clamped to 20.0% (₹20,000).
  - Maximum daily loss limit armed at 3.0% (₹3,000).
- [ ] **09:15 IST — Market Open:**
  - Automated strategy evaluation unlocked.
  - Quorum and GBM gates active.
- [ ] **15:15 IST — Mandatory Auto Square-Off:**
  - Engine automatically cancels working orders and squares off open positions.
- [ ] **15:30 IST — Session Close:**
  - Daily metrics persisted to disk; engine enters dormant mode.

---

## 7. AUDIT CONCLUSION & PAPER-TRADING CLEARANCE

OmniTradePro Apex V2.0 has successfully passed all operational resilience tests:
- State persistence and process recovery are fully functional.
- Feed outage protection and Crash Protection Locks prevent unmonitored exposure.
- Broker timeout reconciliation eliminates double-order risk.
- Paper trading mode is strictly disarmed and isolated from real-money execution.

The platform is officially **CERTIFIED READY FOR FORWARD PAPER-TRADING**.
