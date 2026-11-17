# OmniTradePro Apex V2.0 — Phase 7.4.1 Deliverable Report
## NSE Calendar Correction & Regulatory Evidence Audit

**Date of Execution:** 2026-11-17  
**Operating Mode:** STRICT OFFLINE RESEARCH ONLY  
**Live Broker Execution:** PERMANENTLY DISABLED  
**Authentication & Account Status:** Credential rotation status remains `PENDING ACCOUNT OWNER CONFIRMATION`. No real broker connections, real orders, or live funds.

---

### Executive Summary

In accordance with the Phase 7.4.1 directive, OmniTradePro Apex V2.0 underwent a strict, evidence-based regulatory calendar reconciliation. The prior calendar implementation (v2026.1) contained critical defects, including an unsupported hardcoded total of 15 holidays, incorrect calendar dates for major holidays (Holi, Mahashivratri, Id-ul-Fitr, Bakri Id), an erroneous evening timing for the 2026 Diwali Muhurat session, and an invented Saturday Disaster Recovery (DR) trading session.

All calendar definitions across Python (`core/nse_calendar.py`) and TypeScript (`src/lib/nse_calendar.ts`) have been upgraded to **Version 2026.2**. Every holiday and special trading session is now backed by a structured evidence record citing the official NSE circular reference, publication date, market segment, verification status (`VERIFIED`), and verification date (`2026-11-17`).

---

### 1. Identified Discrepancies & Forensic Audit

A comprehensive audit of the historical calendar logic against official regulatory circulars identified the following discrepancies in the legacy v2026.1 calendar:

| Item | Prior Implementation (v2026.1) | Official Regulatory Truth (v2026.2) | Regulatory Circular Reference | Status & Correction Applied |
| :--- | :--- | :--- | :--- | :--- |
| **Weekday Holiday Total** | Hardcoded minimum/expectation of 15 | Exactly **16 Weekday Holidays** | NSE/CMTR/71775 & NSE/CMTR/72890 | **CORRECTED**: Hardcoded 15 removed; 16 verified Mon-Fri closures enforced. |
| **Maharashtra Municipal Elections** | Omitted | **2026-01-15** (Thursday) | NSE/CMTR/72890 (Pub: 2026-01-05) | **ADDED**: Declared full trading holiday for Maharashtra Municipal Corporation elections. |
| **Holi** | 2026-03-04 (Wednesday) | **2026-03-03** (Tuesday) | NSE/CMTR/71775 (Pub: 2025-12-12) | **CORRECTED**: Date shifted to official Tuesday holiday; 4 March restored to regular trading. |
| **Mahashivratri** | 2026-02-17 (Tuesday) | **2026-02-15** (Sunday) | NSE/CMTR/71775 (Pub: 2025-12-12) | **CORRECTED**: Moved to Sunday weekend closure; 17 Feb restored to regular trading. |
| **Id-ul-Fitr (Ramzan Id)** | 2026-03-20 (Friday) | **2026-03-21** (Saturday) | NSE/CMTR/71775 (Pub: 2025-12-12) | **CORRECTED**: Moved to Saturday weekend closure; 20 March restored to regular trading. |
| **Ram Navami** | Omitted | **2026-03-26** (Thursday) | NSE/CMTR/71775 (Pub: 2025-12-12) | **ADDED**: Added official weekday holiday closure. |
| **Mahavir Jayanti** | Omitted | **2026-03-31** (Tuesday) | NSE/CMTR/71775 (Pub: 2025-12-12) | **ADDED**: Added official weekday holiday closure. |
| **Bakri Id** | 2026-05-27 (Wednesday) | **2026-05-28** (Thursday) | NSE/CMTR/71775 (Pub: 2025-12-12) | **CORRECTED**: Date shifted to official Thursday holiday; 27 May restored to regular trading. |
| **Ganesh Chaturthi** | Omitted | **2026-09-14** (Monday) | NSE/CMTR/71775 (Pub: 2025-12-12) | **ADDED**: Added official weekday holiday closure. |
| **Weekend Holidays** | Mixed into weekday closure counts | **4 Separate Weekend Holidays** | NSE/CMTR/71775 (Pub: 2025-12-12) | **CORRECTED**: Separated into dedicated weekend holiday tracking; not counted as weekday closures. |
| **Diwali Muhurat Timing** | 18:15–19:15 IST (Evening) | **14:20–15:30 IST** (Afternoon) | NSE/CMTR/76941 (Pub: 2026-10-19) | **CORRECTED**: Pre-open 14:05–14:20, continuous 14:20–15:30, post-close 15:50–16:00. Evening 18:15–19:15 strictly CLOSED. |
| **Disaster Recovery (DR) Session** | Invented Saturday 2026-03-07 session | **Thursday 2026-03-05 & Friday 2026-03-06** | NSE/MSD/73126 (Pub: 2026-03-05) | **CORRECTED**: Saturday 7 March strictly CLOSED. Live DR trading occurred 5–6 March (09:15–15:30); resumed primary 9 March. |

---

### 2. Official Circular References & Regulatory Evidence

All calendar entries are established using authoritative regulatory circulars issued by the National Stock Exchange of India (NSE):

1. **NSE Primary Trading Holidays Circular for Calendar Year 2026**
   - **Circular Reference:** `NSE/CMTR/71775` (Circular Ref No: 172/2025)
   - **Date of Publication:** 2025-12-12
   - **Market Segment:** Capital Market (Equity) Segment
   - **Verification Status:** `VERIFIED`
   - **Content:** Mandates 15 standard annual weekday holidays and explicitly identifies 4 holidays falling on Saturdays and Sundays.

2. **Maharashtra Municipal Corporation General Elections Trading Holiday Circular**
   - **Circular Reference:** `NSE/CMTR/72890`
   - **Date of Publication:** 2026-01-05
   - **Market Segment:** Capital Market (Equity) Segment
   - **Verification Status:** `VERIFIED`
   - **Content:** Declares Thursday, 15 January 2026 as a full trading holiday for all Capital Market and F&O segments under the Negotiable Instruments Act due to Maharashtra civic elections, bringing total weekday trading closures in 2026 to **16 days**.

3. **Diwali Muhurat Trading Session Circular**
   - **Circular Reference:** `NSE/CMTR/76941` (Download Ref No: 149/2026)
   - **Date of Publication:** 2026-10-19
   - **Market Segment:** Capital Market (Equity) Segment
   - **Verification Status:** `VERIFIED`
   - **Schedule for Sunday, 8 November 2026:**
     - Pre-Open Session: **14:05 to 14:20 IST** (Order entry, modification & matching)
     - Continuous Trading Session: **14:20 to 15:30 IST**
     - Closing Auction Session (CAS): **15:20 to 15:35 IST**
     - Post-Close Session: **15:50 to 16:00 IST**
     - Trade Modification Window: Closes at **16:30 IST**

4. **Live Trading from Disaster Recovery (DR) Site Circular**
   - **Circular Reference:** `NSE/MSD/73126` (Circular Ref No: 11/2026)
   - **Date of Publication:** 2026-03-05
   - **Market Segment:** All Exchange Segments (Capital Market & Derivatives)
   - **Verification Status:** `VERIFIED`
   - **Schedule:**
     - Thursday, 5 March 2026: Live trading from DR Site during regular market hours (**09:15 to 15:30 IST**).
     - Friday, 6 March 2026: Live trading from DR Site during regular market hours (**09:15 to 15:30 IST**).
     - Saturday, 7 March 2026: Standard weekend closure (**CLOSED**, no trading session scheduled or conducted).
     - Monday, 9 March 2026: Live trading resumed from Primary site during regular market hours (**09:15 to 15:30 IST**).

---

### 3. Architecture & Implementation (Version 2026.2)

The calendar engine was upgraded across both language codebases to ensure strict mathematical and deterministic parity:

#### Python Implementation (`core/nse_calendar.py`)
- Version identifier: `NSE_CALENDAR_VERSION = "2026.2"`
- Immutable dataclass `HolidayEvidence`:
  - `date: date`
  - `name: str`
  - `day_of_week: str`
  - `is_weekday: bool`
  - `segment: str`
  - `circular_ref: str`
  - `publication_date: str`
  - `verification_status: str`
  - `last_verified_date: str`
  - `notes: Optional[str]`
- Immutable dataclass `SpecialSessionEvidence`:
  - `session_id: str`
  - `segment: str`
  - `date: date`
  - `session_type: SessionType`
  - `trading_start: Optional[time]`, `trading_end: Optional[time]`
  - `pre_open_start: Optional[time]`, `pre_open_end: Optional[time]`
  - `post_close_start: Optional[time]`, `post_close_end: Optional[time]`
  - `site: str` (`"PRIMARY"` or `"DR_SITE"`)
  - `circular_ref: str`, `publication_date: str`, `verification_status: str`
- Core getter methods:
  - `NseCalendar.get_weekday_holidays(year=2026)` -> Returns 16 dates
  - `NseCalendar.get_weekend_holidays(year=2026)` -> Returns 4 dates
  - `NseCalendar.get_all_holiday_evidence(year=2026)` -> Returns all 20 `HolidayEvidence` objects
  - `NseCalendar.is_weekend_holiday(d)` -> Checks if date is a festival falling on weekend
  - `NseCalendar.is_muhurat_pre_open(dt)` -> Returns True for 14:05–14:20 IST on 2026-11-08
  - `NseCalendar.is_muhurat_post_close(dt)` -> Returns True for 15:50–16:00 IST on 2026-11-08
  - `NseCalendar.is_dr_session(dt)` -> Returns True during 09:15–15:30 IST on 2026-03-05 and 2026-03-06

#### TypeScript Implementation (`src/lib/nse_calendar.ts`)
- Version identifier: `export const NSE_CALENDAR_VERSION = "2026.2";`
- Interfaces `HolidayEvidence` and `SpecialSessionEvidence` mirroring Python.
- Exact array exports: `WEEKDAY_HOLIDAYS_EVIDENCE_2026`, `WEEKEND_HOLIDAYS_EVIDENCE_2026`, `SPECIAL_SESSIONS_EVIDENCE_2026`.
- Identical API: `getWeekdayHolidays`, `getWeekendHolidays`, `getAllHolidayEvidence`, `isExchangeHoliday`, `isWeekendHoliday`, `isMuhuratSession`, `isMuhuratPreOpen`, `isMuhuratPostClose`, `isDrSession`.

#### Supporting Framework Harmonization
- Synchronized `TRADING_HOLIDAYS_2026` in `core/historical_data_framework.py` and `core/indian_market_rules.py`.
- Updated test fixture generator `scripts/create_phase73_csv_fixtures.py` to produce special sessions matching the corrected schedule:
  - 45 bars of 2026-03-05 DR session (09:15 to 09:59 IST)
  - 70 bars of 2026-11-08 Muhurat session (14:20 to 15:29 IST)
  - Total: 115 valid bars in `data/fixtures/special_sessions_1m.csv` (SHA-256: `a5fbf77cc061c56cb33b666a4f15a63901b0b74070a273e89a54eeb356260e0a`).

---

### 4. Verification & Audit Results

Comprehensive verification was conducted across all unit, integration, cross-language, and static analysis suites:

#### 1. TypeScript Test Suite (`npm test`)
- **Execution Command:** `npm test` (`npm run test:prep && node scripts/run_comprehensive_tests.js`)
- **Exit Code:** `0` (SUCCESS)
- **Result:** **119 PASSED / 0 FAILED** (Total 119 tests across 24 sections)
- **Section 24 (Phase 7.4.1 Specific):**
  - Task 1: 16 official weekday holidays and 4 separate weekend holidays verified.
  - Task 4: Regulatory evidence metadata integrity verified for all 20 entries.
  - Task 2: Diwali Muhurat boundaries (14:05 pre-open, 14:20 open, 15:30 close, 15:50 post-close, 18:15 closed) verified.
  - Task 3: DR session live trading (5–6 March DR site, 7 March closed, 9 March primary) verified.
  - Task 5: Regular trading rejection across all 16 weekday holidays verified.

#### 2. TypeScript Static Typecheck (`npm run typecheck`)
- **Execution Command:** `npm run typecheck` (`tsc --noEmit`)
- **Exit Code:** `0` (SUCCESS, 0 errors)

#### 3. Cross-Language Parity Audit (`scripts/verify_cross_language_parity.py`)
- **Execution Command:** `python scripts/verify_cross_language_parity.py`
- **Exit Code:** `0` (SUCCESS)
- **Result:** **100% BIT-FOR-BIT MATCH** across all 4 benchmark CSV fixtures:
  - `sample_nifty50_1m.csv`: 375 bars, 100.0% score, 0 anomalies (Match=True)
  - `multiday_overnight_1m.csv`: 750 bars, 100.0% score, 1 overnight gap (Match=True)
  - `corrupted_anomalies_1m.csv`: 100 bars, 89.55% score, 3 dups, 11 missing (Match=True)
  - `special_sessions_1m.csv`: 115 bars, 100.0% score, 1 overnight gap (Match=True)

#### 4. Python Dedicated Phase 7.4.1 Test Suite (`tests/test_phase741_calendar_correction.py`)
- **Execution Command:** `pytest tests/test_phase741_calendar_correction.py`
- **Exit Code:** `0` (SUCCESS)
- **Result:** **19 PASSED / 0 FAILED** in 0.72s
  - All 16 weekday holidays verified individually against circular `NSE/CMTR/71775` and `NSE/CMTR/72890`.
  - Elimination of erroneous legacy dates (2026-02-17, 2026-03-04, 2026-03-20, 2026-05-27) verified.
  - Pre-open, continuous, post-close, and evening closure for Muhurat verified.
  - DR session live switch dates, Saturday closure, and Monday resumption verified.
  - IST timezone fixed offset (+05:30, 0 DST) verified across winter, summer, and monsoon.

---

### 5. Regulatory Traceability Matrix (Full 2026 Holiday Schedule)

#### Official Weekday Holidays (16 Days)

| No. | Date | Day | Holiday Name | Segment | Circular Ref | Pub Date | Verification Status |
| :---: | :---: | :---: | :--- | :---: | :---: | :---: | :---: |
| 1 | 2026-01-15 | Thursday | Maharashtra Municipal Corporation Elections | EQUITY | NSE/CMTR/72890 | 2026-01-05 | `VERIFIED` |
| 2 | 2026-01-26 | Monday | Republic Day | EQUITY | NSE/CMTR/71775 | 2025-12-12 | `VERIFIED` |
| 3 | 2026-03-03 | Tuesday | Holi | EQUITY | NSE/CMTR/71775 | 2025-12-12 | `VERIFIED` |
| 4 | 2026-03-26 | Thursday | Ram Navami | EQUITY | NSE/CMTR/71775 | 2025-12-12 | `VERIFIED` |
| 5 | 2026-03-31 | Tuesday | Mahavir Jayanti | EQUITY | NSE/CMTR/71775 | 2025-12-12 | `VERIFIED` |
| 6 | 2026-04-03 | Friday | Good Friday | EQUITY | NSE/CMTR/71775 | 2025-12-12 | `VERIFIED` |
| 7 | 2026-04-14 | Tuesday | Dr. Baba Saheb Ambedkar Jayanti | EQUITY | NSE/CMTR/71775 | 2025-12-12 | `VERIFIED` |
| 8 | 2026-05-01 | Friday | Maharashtra Day | EQUITY | NSE/CMTR/71775 | 2025-12-12 | `VERIFIED` |
| 9 | 2026-05-28 | Thursday | Bakri Id | EQUITY | NSE/CMTR/71775 | 2025-12-12 | `VERIFIED` |
| 10 | 2026-06-26 | Friday | Muharram | EQUITY | NSE/CMTR/71775 | 2025-12-12 | `VERIFIED` |
| 11 | 2026-09-14 | Monday | Ganesh Chaturthi | EQUITY | NSE/CMTR/71775 | 2025-12-12 | `VERIFIED` |
| 12 | 2026-10-02 | Friday | Mahatma Gandhi Jayanti | EQUITY | NSE/CMTR/71775 | 2025-12-12 | `VERIFIED` |
| 13 | 2026-10-20 | Tuesday | Dussehra | EQUITY | NSE/CMTR/71775 | 2025-12-12 | `VERIFIED` |
| 14 | 2026-11-10 | Tuesday | Diwali-Balipratipada | EQUITY | NSE/CMTR/71775 | 2025-12-12 | `VERIFIED` |
| 15 | 2026-11-24 | Tuesday | Gurunanak Jayanti | EQUITY | NSE/CMTR/71775 | 2025-12-12 | `VERIFIED` |
| 16 | 2026-12-25 | Friday | Christmas | EQUITY | NSE/CMTR/71775 | 2025-12-12 | `VERIFIED` |

#### Official Weekend Holidays (4 Days — Tracked Separately)

| No. | Date | Day | Holiday Name | Segment | Circular Ref | Pub Date | Verification Status | Notes |
| :---: | :---: | :---: | :--- | :---: | :---: | :---: | :---: | :--- |
| 1 | 2026-02-15 | Sunday | Mahashivratri | EQUITY | NSE/CMTR/71775 | 2025-12-12 | `VERIFIED` | Regular weekend closure |
| 2 | 2026-03-21 | Saturday | Id-Ul-Fitr (Ramadan Eid) | EQUITY | NSE/CMTR/71775 | 2025-12-12 | `VERIFIED` | Regular weekend closure |
| 3 | 2026-08-15 | Saturday | Independence Day | EQUITY | NSE/CMTR/71775 | 2025-12-12 | `VERIFIED` | National holiday coinciding with Saturday |
| 4 | 2026-11-08 | Sunday | Diwali Laxmi Pujan | EQUITY | NSE/CMTR/71775 | 2025-12-12 | `VERIFIED` | Daytime closed; Special Muhurat session held |

---

### 6. Unverified Items & Operational Limitations

1. **Other Exchange Segments:** Non-equity segments (e.g. SLBM settlement calendars, Commodity Evening clearing cycles, Currency Futures) may have distinct trading schedules. In accordance with strict audit rules, any session lacking a specific segment circular is marked `UNVERIFIED`.
2. **Offline Research Boundary:** This research framework operates strictly offline. No network requests to broker endpoints or live exchange feeds were initiated.
3. **No Certification Claim:** No claim of third-party exchange certification, production deployment, or financial profitability is made.
4. **Credential Security:** Rotation of previously exposed credentials remains `PENDING ACCOUNT OWNER CONFIRMATION`.

---
*Report Author: Institutional Verification Agent (DeepMind Antigravity)*  
*Verification Date: 2026-11-17*
