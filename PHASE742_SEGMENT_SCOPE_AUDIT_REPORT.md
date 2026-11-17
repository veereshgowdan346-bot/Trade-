# OmniTradePro Apex V2.0 — Phase 7.4.2 Deliverable Report
## Segment Scope, Muhurat Microstructure & Session Fixture Audit

**Date of Execution:** 2026-11-17  
**Operating Mode:** STRICT OFFLINE RESEARCH ONLY  
**Live Broker Execution:** PERMANENTLY DISABLED  
**Authentication & Account Status:** Credential rotation status remains `PENDING ACCOUNT OWNER CONFIRMATION`. Real orders, broker account connections, and live funds are completely blocked.

---

### Executive Summary

Phase 7.4.2 enforces strict segment boundary demarcation, microstructural phase tracking, and dataset fixture provenance across OmniTradePro Apex V2.0. Key accomplishments include:
1. **Explicit Exchange Segment Scope:** The core calendar engine is officially scoped to the **Capital Market (Equity) Segment** (`CAPITAL_MARKET` / `EQUITY`).
2. **Investigation of NSE Holiday Webpage Discrepancies:** Clarified and resolved the discrepancy between **Exchange Trading Holidays** (where markets are closed) and **Clearing & Settlement Holidays** (where banks/depositories are closed under the Negotiable Instruments Act, but equity trading operates normally).
3. **Regulatory Addendum Reconciliation:** Reconciled the 16 weekday Capital Market holidays under primary circular `NSE/CMTR/71775` (published 2025-12-12) and amendment circular `NSE/CMTR/72260` (Ref: 05/2026, published 2026-01-12; also notified under `NSE/CMTR/72890`).
4. **Muhurat Microstructural Phases:** Decomposed the Diwali Muhurat session on 8 November 2026 into 11 distinct microstructural states per `NSE/CMTR/76941`, explicitly defining the 15:50–16:00 window as the official **Closing Session** (executing at the determined closing price).
5. **DR Session Boundary & Fixture Scope:** Verified full regular trading hours (09:15–15:30 IST) for Disaster Recovery site trading on both 5 and 6 March 2026 under `NSE/MSD/73126`. Explicitly documented that the 45 DR bars in `special_sessions_1m.csv` represent a **PARTIAL SYNTHETIC FIXTURE** (12.0% coverage), preventing partial data from ever being mislabeled as complete.
6. **Fixture Provenance Registry:** Classified all 4 benchmark test fixtures as strictly `SYNTHETIC`, documented their exact expected bar counts and coverage, and verified bit-for-bit SHA-256 integrity.

---

### 1. Holiday Segment Scope & Webpage Reconciliation

#### 1.1 Segment Isolation
The trading engine's primary execution boundary is the **NSE Capital Market (Equity) Segment**. Exchange segments have distinct operational rules and must never be conflated:
- **Capital Market (`CAPITAL_MARKET`):** Regular equity trading (09:15–15:30 IST).
- **Equity Derivatives (`EQUITY_DERIVATIVES`):** Futures & Options (F&O).
- **Currency Derivatives (`CURRENCY_DERIVATIVES`):** Forex derivatives (09:00–17:00 IST), aligned with RBI inter-bank Forex market closures.
- **Commodity Derivatives (`COMMODITY_DERIVATIVES`):** Trades evening sessions (17:00–23:30/23:55 IST) on several equity holidays.
- **Clearing & Settlement (`CLEARING_SETTLEMENT`):** Back-office funds and securities clearing by NSE Clearing Limited (NSCCL) and depositories (NSDL/CDSL).

#### 1.2 Webpage Entry Investigation: Trading vs. Clearing Holidays
A common source of confusion in automated scrapers is that the official NSE website displays multiple tabs:
- **Trading Holidays:** Days when the exchange order matching engine is offline.
- **Clearing Holidays:** Days when banks or clearing corporations are closed under the Negotiable Instruments (NI) Act.

On **Clearing & Settlement Holidays that are NOT Trading Holidays**, normal equity trading proceeds without interruption from 09:15 to 15:30 IST. Settlement (pay-in and pay-out of funds and securities) is deferred to T+1:

| Date | Day | Clearing Holiday Description | Equity Trading Status | Clearing Status | Regulatory Authority |
| :---: | :---: | :--- | :---: | :---: | :--- |
| **2026-02-19** | Thursday | Chhatrapati Shivaji Maharaj Jayanti | **OPEN (09:15–15:30)** | CLOSED | NSE Clearing / State Govt |
| **2026-03-19** | Thursday | Gudhi Padwa | **OPEN (09:15–15:30)** | CLOSED | NSE Clearing / State Govt |
| **2026-04-01** | Wednesday | Annual Bank Closing | **OPEN (09:15–15:30)** | CLOSED | Reserve Bank of India / NI Act |
| **2026-08-26** | Wednesday | Id-E-Milad | **OPEN (09:15–15:30)** | CLOSED | NSE Clearing / Central Govt |

> [!CRITICAL]
> **Trading Invariant:** On 2026-04-01 (Annual Bank Closing), algorithmic execution engines MUST NOT halt trading. The engine correctly flags `is_holiday(2026-04-01) == False`, `is_clearing_holiday(2026-04-01) == True`, and `get_session_type(2026-04-01 10:00) == REGULAR`.

#### 1.3 Addendum Circular Reconciliation
- Primary Holiday Schedule: **`NSE/CMTR/71775`** (Circular Ref: 172/2025, dated 2025-12-12) established the 15 standard annual weekday holidays and 4 weekend holidays.
- Municipal Elections Addendum: **`NSE/CMTR/72260`** (Circular Ref: 05/2026, dated 2026-01-12) officially declared Thursday, 15 January 2026 a full trading holiday across Capital Market, F&O, and Commodity segments on account of Maharashtra Municipal Corporation elections (notified under state gazette notification `NSE/CMTR/72890`).
- Total Weekday Trading Holidays: **Exactly 16 Days**.

---

### 2. Muhurat Session Microstructure (NSE/CMTR/76941)

The Diwali Muhurat session on Sunday, 8 November 2026 is modeled with sub-second precision into 11 distinct microstructural phases:

| Phase Enum | Window (IST) | Order Actions Permitted | Engine Trading Status | Session Type |
| :--- | :---: | :--- | :---: | :---: |
| `CLOSED` | 00:00:00–14:04:59 | None (Market closed) | `False` | `CLOSED` |
| `PRE_OPEN_ENTRY` | 14:05:00–14:09:59 | Limit & Market order entry/modification (Random stop last 2m) | `False` | `PRE_OPEN` |
| `PRE_OPEN_LIMIT_ONLY` | 14:10:00–14:14:59 | Limit orders only; market orders cannot be cancelled/modified | `False` | `PRE_OPEN` |
| `PRE_OPEN_MATCHING` | 14:15:00–14:16:59 | Order matching & trade confirmation | `False` | `PRE_OPEN` |
| `PRE_OPEN_BUFFER` | 14:17:00–14:19:59 | System transition buffer to continuous trading | `False` | `PRE_OPEN` |
| `CONTINUOUS_TRADING` | 14:20:00–15:14:59 | Continuous order matching for all securities | `True` | `SPECIAL_MUHURAT` |
| `CAS_TRANSITION` | 15:15:00–15:19:59 | Reference price calculation for CAS; continuous for non-CAS | `True` | `SPECIAL_MUHURAT` |
| `CLOSING_AUCTION_ENTRY` | 15:20:00–15:29:59 | CAS order entry (15:20-15:25 Limit/Market, 15:25-15:30 Limit only) | `True` | `SPECIAL_MUHURAT` |
| `CLOSING_AUCTION_MATCHING`| 15:30:00–15:34:59 | CAS matching & execution; non-CAS continuous trading closed | `False` | `SPECIAL_MUHURAT` |
| `CAS_TRANSITION_BUFFER` | 15:35:00–15:49:59 | Post-auction reconciliation & post-close buffer | `False` | `CLOSED` |
| `CLOSING_SESSION` | 15:50:00–16:00:00 | **Official Closing Session**: Execution strictly at closing price | `False` | `POST_CLOSE` |
| `CLOSED` | 16:00:01–23:59:59 | Market closed (Trade modification allowed until 16:30) | `False` | `CLOSED` |

> [!NOTE]
> **Microstructural Meaning of the 15:50–16:00 Window:**
> In SEBI and NSE market microstructure, this window is officially designated as the **Closing Session** (or Post-Closing Session). Orders entered during this phase are executed strictly at the determined closing price (computed via the volume-weighted average price of the last 30 minutes or the closing auction). It is NOT an idle or arbitrary buffer period. Regular trading strategies that place non-closing limit or market orders cannot participate in this session (`is_valid_trading_time == False`).

---

### 3. Disaster Recovery (DR) Session & Fixture Scope (NSE/MSD/73126)

#### 3.1 DR Session Schedule
Under circular **`NSE/MSD/73126`** (Circular Ref: 11/2026, dated 2026-03-05):
- **Thursday, 5 March 2026:** Live trading from DR Site during regular market hours (**09:15 to 15:30 IST**).
- **Friday, 6 March 2026:** Live trading from DR Site during regular market hours (**09:15 to 15:30 IST**).
- **Saturday, 7 March 2026:** Standard weekend closure (**CLOSED**, no trading scheduled or held).
- **Monday, 9 March 2026:** Live trading resumed from Primary site during regular market hours (**09:15 to 15:30 IST**).

#### 3.2 Fixture Scope Transparency
In `data/fixtures/special_sessions_1m.csv`, the dataset contains 115 total bars:
- **Disaster Recovery Component:** Exactly **45 bars** (2026-03-05 09:15 to 09:59 IST).
  - A full regular trading session on NSE contains 375 bars (09:15 to 15:29 inclusive).
  - Therefore, the 45 DR bars represent a **PARTIAL SYNTHETIC FIXTURE** (12.0% session coverage).
  - It is designed specifically to test multi-session boundary transitions, date jumps, and DR session tagging.
  - **Audit Invariant:** The system strictly labels this fixture as `coverage_type: "PARTIAL"` and NEVER misrepresents it as a complete trading day.
- **Muhurat Component:** Exactly **70 bars** (2026-11-08 14:20 to 15:29 IST).
  - The continuous trading window on Muhurat day is 70 minutes (14:20 to 15:30).
  - Therefore, these 70 bars represent a **COMPLETE CONTINUOUS TRADING SESSION FIXTURE** (100.0% coverage).

---

### 4. Fixture Provenance Registry

All test fixtures residing in `data/fixtures/` are strictly registered, classified as `SYNTHETIC`, and protected against silent byte corruption:

| Fixture File | Provenance | Bars | Date Range | Coverage Type | Coverage Description | SHA-256 Checksum |
| :--- | :---: | :---: | :---: | :---: | :--- | :--- |
| `sample_nifty50_1m.csv` | `SYNTHETIC` | 375 | 2026-02-18 | `FULL` | Complete single trading day regular equity session (09:15–15:29 IST, 375 bars) | `a785f1af9aecfc1f69a15536350e3adf9232d81a141bd8592c2091b7f85c3280` |
| `multiday_overnight_1m.csv` | `SYNTHETIC` | 750 | 2026-02-18 to 2026-02-19 | `FULL` | Complete two consecutive regular trading days (375 bars each, 1 overnight gap) | `b96ec03a8018976dedf3890c1bedd52fe66033ed82d06fc05ad9966c438b244f` |
| `corrupted_anomalies_1m.csv` | `SYNTHETIC` | 100 | 2026-02-18 | `PARTIAL` | Partial session with injected synthetic anomalies: 3 dups, 11 missing, 1 split, 1 pre-market | `5f3eb779a1aae1e52e515816e8cb0be82d8564189a03e076a2e0463127dbb1c8` |
| `special_sessions_1m.csv` | `SYNTHETIC` | 115 | 2026-03-05 to 2026-11-08 | `PARTIAL` | Multi-session fixture: 45 DR bars (partial 12% day) + 70 Muhurat bars (full continuous) | `a5fbf77cc061a7b2bffb785281f442e68985aacecd42eff87e58e71b2c8b1f79` |

---

### 5. Verification & Parity Results

#### 5.1 Test Execution Matrix

| Test Suite | Command | Exit Code | Tests Passed | Status |
| :--- | :--- | :---: | :---: | :---: |
| **TypeScript Test Suite** | `npm test` | `0` | **123 / 123 Passed** | **PASS** |
| **TypeScript Typecheck** | `npm run typecheck` | `0` | **0 Errors (`tsc --noEmit`)** | **PASS** |
| **Cross-Language Parity** | `python scripts/verify_cross_language_parity.py` | `0` | **100% Bit-for-bit match** | **PASS** |
| **Phase 7.4.2 Python Suite** | `pytest tests/test_phase742_segment_session_audit.py` | `0` | **18 / 18 Passed** | **PASS** |
| **Full Python Test Suite** | `pytest -q` | `0` | **225 / 225 Passed** | **PASS** |

#### 5.2 Parity Audit Details
- `getCalendarSegment()` returns `"CAPITAL_MARKET"` identically in Python and TypeScript.
- All 11 microstructural Muhurat phases evaluate with second-level precision identically across languages.
- Boundary conditions for DR sessions (09:14:59 false, 09:15:00 true, 15:30:00 true, 15:30:01 false) match 100%.
- Clearing holiday detection (`is_clearing_holiday`, `is_trading_day_on_clearing_holiday`) produces identical boolean truth tables in Python and TypeScript.

---

### 6. Unverified Entries & Operational Boundaries

1. **Non-Equity Segment Calendars:** Tentative non-equity settlement dates (e.g., Currency Derivatives quarter-end reconciliation on 2026-09-30) are preserved in `UNVERIFIED_SEGMENT_HOLIDAYS_2026` with status `UNVERIFIED`.
2. **Offline Research Mode:** The system operates strictly offline using synthetic fixtures and static regulatory tables.
3. **No Certification Claims:** No claim of third-party exchange certification, production readiness, or trading profitability is made.

---
*Report Author: Institutional Verification Agent (DeepMind Antigravity)*  
*Verification Date: 2026-11-17*
