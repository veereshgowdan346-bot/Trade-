# OmniTradePro Apex V2.0 — Phase 7.3
## Historical Dataset Ingestion, NSE Calendar & Data Leakage Audit Report

**Operating Mode:** STRICT OFFLINE RESEARCH ONLY  
**Live Broker Execution:** PERMANENTLY DISABLED  
**Real-Money Trading:** PROHIBITED  
**Broker Account Connections:** ZERO / DISCONNECTED  
**Credential Usage:** PROHIBITED (Zero Credentials Used)  
**Strategy Parameter Tuning / Optimization:** PROHIBITED  
**Audit Date:** 2026-11-17  
**Calendar Specification Version:** `NSE_CALENDAR_VERSION = "2026.1"`

---

### Executive Summary

Phase 7.3 establishes a production-grade, offline CSV ingestion pipeline, a versioned National Stock Exchange of India (NSE) trading calendar engine, a rigorous lookahead bias/data leakage audit framework, and an automated cross-language parity verifier between Python and TypeScript.

Key Accomplishments:
1. **Raw CSV Ingestion with Zero Data Repair:** Built safe, read-only CSV parsing engines in Python (`core/csv_data_ingestion.py`) and TypeScript (`src/lib/csv_ingestion.ts`). Raw source files on disk are verified against their SHA-256 checksums and never modified. Corrupted bars are cataloged with raw context and excluded from quantitative research slices rather than silently altered.
2. **Provenance Integrity Guard:** Hardened the provenance engine to strictly prohibit classifying `SAMPLE` or `SYNTHETIC` datasets as `GENUINE_HISTORICAL`. Any ingestion attempt specifying `GENUINE_HISTORICAL` for test or sample files raises an immediate integrity violation.
3. **Versioned NSE Calendar Engine (v2026.1):** Codified the official 2026 NSE equity schedule (09:15–15:30 IST), pre/post market windows, 15 official trading holidays, MCX extended commodity hours (09:00–23:30 IST), and special authorized sessions including **Muhurat Trading** (Diwali evening session: 2026-11-08 18:15–19:15 IST) and **Disaster Recovery (DR)** live sessions.
4. **Data Leakage & Lookahead Audit Engine:** Implemented quantitative leakage auditors in Python (`core/leakage_audit.py`) and TypeScript (`src/lib/leakage_audit.ts`). Deliberately injected three fatal leakage archetypes (forward-looking indicator $t+1$, global feature scaler fit on test data, and temporal partition overlap) and proved that our audit engine successfully flags every single violation.
5. **100% Cross-Language Parity:** Built an automated verification script (`scripts/verify_cross_language_parity.py`) proving bit-for-bit parity across Python and TypeScript for valid counts, duplicate counts, missing candle counts, overnight gap counts, quality scores, and file SHA-256 hashes.
6. **Automated Test Results:** 275 total passing tests (169 Python Pytest + 106 TypeScript/Node tests, 0 failures, 0 skipped).

---

### Task 1 — CSV Data Ingestion Architecture

#### 1.1 Ingestion Specifications
The ingestion engine supports user-provided OHLCV CSV files across multiple resolutions:
- **Supported Timeframes:** 1-minute (`1m`), 5-minute (`5m`), 15-minute (`15m`), 30-minute (`30m`), 1-hour (`1h` / `60m`), and 1-day (`1D` / `1d`).
- **Flexible Header Resolution:** Case-insensitive mapping for timestamp (`timestamp`, `datetime`, `date_time`, `date`, `time`, `ts`), OHLC (`open`, `high`, `low`, `close`), and volume (`volume`, `v`, `vol`, `traded_qty`).
- **Timestamp Parsing:** Normalizes ISO-8601 strings (e.g. `2026-02-18T09:15:00+05:30`), Unix millisecond/second epochs, and standard datetime strings (`YYYY-MM-DD HH:MM:SS`) into localized `Asia/Kolkata` (`UTC+05:30`) timestamps.
- **Fail-Safe Rejection:** Safely catches missing mandatory columns, empty files, non-numeric prices, and unparseable date formats without crashing the process.
- **Read-Only Invariant:** Original CSV files are ingested strictly read-only; disk contents and file modification times remain unmodified.

---

### Task 2 — Data Validation & Anomaly Taxonomy

Raw data is never silently repaired or manipulated. The ingestion pipeline audits every candlestick row against the following comprehensive checks:

| Validation Rule | Condition | Severity | Pipeline Action |
| :--- | :--- | :--- | :--- |
| **Non-Positive Price** | $O, H, L, C \le 0.0$ | `CRITICAL` | Bar rejected; logged in anomalies |
| **Negative / NaN Volume** | $V < 0.0$ or $\text{isNaN}(V)$ or $\text{isInf}(V)$ | `CRITICAL` | Bar rejected; logged in anomalies |
| **Invalid OHLC Geometry** | $H < \max(O,C) - 10^{-4}$ or $L > \min(O,C) + 10^{-4}$ | `CRITICAL` | Bar rejected; raw wicks preserved in report |
| **Duplicate Timestamp** | $t_i \in \text{seen\_timestamps}$ | `CRITICAL` | Bar rejected; counted in `duplicate_count` |
| **Out-of-Order Timestamp** | $t_i < t_{i-1}$ | `CRITICAL` | Bar rejected; sequence flagged |
| **Session Boundary Breach** | Outside authorized trading session | `WARNING` | Bar rejected for market research |
| **Intrasession Dropout** | $\Delta t > 1.5 \times \text{interval}$ (same session day) | `WARNING` | Calculated missing bars added to penalty |
| **Overnight Market Gap** | $\Delta t > 1.5 \times \text{interval}$ (interday closure) | `ADVISORY` | Counted in `overnight_gap_count`; 0 penalty |
| **Corporate Action Split Drop**| Sudden overnight drop $< -25.0\%$ | `WARNING` | Flagged as `POTENTIAL_UNADJUSTED_CORPORATE_ACTION` |
| **Suspicious Price Jump** | Sudden intraday jump $> 10.0\%$ | `ADVISORY` | Flagged for audit investigation |

---

### Task 3 — Data Provenance & Cryptographic Tracking

Every dataset ingested through the pipeline receives a standardized `DataProvenance` record:
- `dataset_id`: Unique deterministic identifier (`CSV-{instrument}-{timeframe}-{sha256[:8]}`)
- `source_classification`: Strictly `SYNTHETIC`, `SAMPLE`, or `GENUINE_HISTORICAL`
- `instrument`: e.g. `NIFTY50`, `BANKNIFTY`, `RELIANCE`
- `exchange`: `NSE`, `BSE`, `MCX`
- `timeframe`: `1m`, `5m`, `15m`, `1D`
- `adjustment`: `UNADJUSTED_RAW`, `SPLIT_ADJUSTED`
- `date_range`: ISO start and end timestamps
- `import_timestamp`: Localized timestamp of file import
- `file_sha256`: 64-character SHA-256 cryptographic digest of the raw byte stream
- `row_count`: Total rows observed
- `valid_row_count`: Valid rows passing all critical checks
- `duplicate_count`: Exact duplicate timestamps
- `missing_candle_count`: Intrasession missing bars

#### Strict False Provenance Guard
To protect research integrity, the framework enforces a programmatic rule: **never classify sample or synthetic data as genuine historical data**.
If an ingestion request attempts to pass `source_classification = "GENUINE_HISTORICAL"` for a file located in a sample, fixture, or synthetic path, the engine raises an immediate `ValueError`:
> `Integrity Violation: File '...' from a test/sample directory cannot be classified as 'GENUINE_HISTORICAL'.`

---

### Task 4 — Versioned NSE Trading Calendar (`v2026.1`)

The exchange calendar module ([core/nse_calendar.py](file:///c:/Users/veere/Desktop/g4/core/nse_calendar.py) and [src/lib/nse_calendar.ts](file:///c:/Users/veere/Desktop/g4/src/lib/nse_calendar.ts)) codifies verified trading rules for Indian exchanges in `Asia/Kolkata` time:

1. **Regular Trading Sessions:**
   - Pre-Open: 09:00:00 to 09:15:00 IST (Order entry 09:00–09:08, matching 09:08–09:15).
   - Regular Equity & F&O: 09:15:00 to 15:30:00 IST (Monday through Friday).
   - Post-Closing: 15:40:00 to 16:00:00 IST.
2. **Instrument-Specific Sessions:**
   - MCX Commodity Hours: 09:00:00 to 23:30:00 IST (extended to 23:55 during US Daylight Saving Time).
   - Currency Derivatives: 09:00:00 to 17:00:00 IST.
3. **Official 2026 NSE/BSE Trading Holidays (15 Days):**
   - 2026-01-26 (Republic Day)
   - 2026-02-17 (Mahashivratri)
   - 2026-03-04 (Holi)
   - 2026-03-20 (Id-ul-Fitr / Ramzan Id)
   - 2026-04-03 (Good Friday)
   - 2026-04-14 (Dr. Baba Saheb Ambedkar Jayanti)
   - 2026-05-01 (Maharashtra Day)
   - 2026-05-27 (Bakri Id / Id-Ul-Zuha)
   - 2026-06-26 (Muharram)
   - 2026-10-02 (Mahatma Gandhi Jayanti)
   - 2026-10-20 (Dussehra)
   - 2026-11-08 (Diwali Laxmi Pujan — daytime closed; Muhurat trading authorized in evening)
   - 2026-11-10 (Diwali Balipratipada)
   - 2026-11-24 (Gurunanak Jayanti)
   - 2026-12-25 (Christmas)
4. **Special Trading Sessions:**
   - **Diwali Muhurat Trading Session:** Sunday, 2026-11-08: Pre-open 18:00–18:08 IST, Regular Trading 18:15:00 to 19:15:00 IST. Authorized by `is_muhurat_session()`.
   - **Disaster Recovery (DR) Live Trading Test:** Saturday, 2026-03-07: Session 1 (09:15–10:00 IST Primary) and Session 2 (11:30–12:30 IST DR Site). Authorized by `is_dr_session()`.

---

### Task 5 — Lookahead Bias & Data Leakage Audit

A core requirement of Phase 7.3 is auditing quantitative models for future-bar contamination and testing detection against deliberate leakage injections:

#### 5.1 Rolling Indicator Causality
- **Invariant:** Calculating an indicator on rolling prefix $C[:k]$ must yield identical output at bar $k-1$ as calculating on the full series $C[:N]$.
- **Deliberate Injection Test:** Injected a centered moving average:
  $$MA_t = \frac{C_{t-1} + C_t + C_{t+1}}{3}$$
- **Audit Engine Result:** Successfully detected and flagged `INDICATOR_LOOKAHEAD_FUTURE_BAR` with `CRITICAL` severity.

#### 5.2 Feature Scaler & Normalization Leakage
- **Invariant:** Scaler parameters (e.g. MinMax $\min, \max$ or StandardScaler $\mu, \sigma$) must be computed strictly on training data $X_{\text{train}}$. Applying a scaler fit on $(X_{\text{train}} \cup X_{\text{test}})$ leaks test distributions into the model training space.
- **Deliberate Injection Test:** Injected a global scaler fit across train ($[10, 25]$) and test ($[5, 30]$), setting scaler bounds to $[5, 30]$.
- **Audit Engine Result:** Successfully detected and flagged `GLOBAL_FEATURE_SCALER_LEAKAGE` with `CRITICAL` severity.

#### 5.3 Partition Temporal Separation
- **Invariant:** Strict chronological monotonicity without interleaving:
  $$\max(t_{\text{train}}) < \min(t_{\text{val}}) < \max(t_{\text{val}}) < \min(t_{\text{test}})$$
- **Deliberate Injection Tests:**
  1. Injected temporal overlap where $t_{\text{train}} \ge \min(t_{\text{test}})$. -> Caught and flagged `TRAIN_TEST_TEMPORAL_OVERLAP`.
  2. Injected shuffled timestamps (simulating naive random k-fold cross validation). -> Caught and flagged `OUT_OF_ORDER_PARTITION_TIMESTAMPS`.

---

### Task 6 — Cross-Language Consistency & Parity

We verified cross-language parity by running the Python engine (`core/csv_data_ingestion.py`) and TypeScript engine (`src/lib/csv_ingestion.ts`) across identical CSV files on disk via `scripts/verify_cross_language_parity.py`.

#### Cross-Language Parity Audit Results

| Dataset Fixture | Metric | Python Result | TypeScript Result | Match Status |
| :--- | :--- | :--- | :--- | :--- |
| **`sample_nifty50_1m.csv`** | SHA-256 Hash | `a785f1af9aec...` | `a785f1af9aec...` | **EXACT MATCH** |
| | Total Observed Bars | 375 | 375 | **EXACT MATCH** |
| | Valid Bars | 375 | 375 | **EXACT MATCH** |
| | Duplicate Count | 0 | 0 | **EXACT MATCH** |
| | Missing Candle Count | 0 | 0 | **EXACT MATCH** |
| | Overnight Gap Count | 0 | 0 | **EXACT MATCH** |
| | Quality Score | **100.00%** | **100.00%** | **EXACT MATCH** |
| | Valid for Research | `True` | `true` | **EXACT MATCH** |
| **`multiday_overnight_1m.csv`** | SHA-256 Hash | `b96ec03a8018...` | `b96ec03a8018...` | **EXACT MATCH** |
| | Total Observed Bars | 750 | 750 | **EXACT MATCH** |
| | Valid Bars | 750 | 750 | **EXACT MATCH** |
| | Duplicate Count | 0 | 0 | **EXACT MATCH** |
| | Missing Candle Count | 0 | 0 | **EXACT MATCH** |
| | Overnight Gap Count | 1 (Interday closure) | 1 (Interday closure) | **EXACT MATCH** |
| | Quality Score | **100.00%** | **100.00%** | **EXACT MATCH** |
| | Valid for Research | `True` | `true` | **EXACT MATCH** |
| **`corrupted_anomalies_1m.csv`** | SHA-256 Hash | `5f3eb779a1aa...` | `5f3eb779a1aa...` | **EXACT MATCH** |
| | Total Observed Bars | 100 | 100 | **EXACT MATCH** |
| | Valid Bars | 89 | 89 | **EXACT MATCH** |
| | Duplicate Count | 3 | 3 | **EXACT MATCH** |
| | Missing Candle Count | 11 | 11 | **EXACT MATCH** |
| | Overnight Gap Count | 0 | 0 | **EXACT MATCH** |
| | Quality Score | **85.95%** | **85.95%** | **EXACT MATCH** |
| | Valid for Research | `False` | `false` | **EXACT MATCH** |
| **`special_sessions_1m.csv`** | SHA-256 Hash | `a03ffce131ec...` | `a03ffce131ec...` | **EXACT MATCH** |
| | Total Observed Bars | 105 | 105 | **EXACT MATCH** |
| | Valid Bars | 60 (Muhurat trading) | 60 (Muhurat trading) | **EXACT MATCH** |
| | Quality Score | **57.14%** | **57.14%** | **EXACT MATCH** |
| | Valid for Research | `False` | `false` | **EXACT MATCH** |

**Parity Summary:** Zero discrepancy. Python and TypeScript produce bit-for-bit identical counts, quality scores, and SHA-256 digests.

---

### Task 7 — Comprehensive Test Results

#### 7.1 Python Pytest Suite
- Test Files: 16 test files covering Phases 1 through 7.3
- Primary Phase 7.3 File: `tests/test_phase73_dataset_ingestion_leakage.py` (18 tests)
- Command: `pytest -q`
- Output: **169 passed in 12.51s (0 failures, 0 skipped)**

#### 7.2 TypeScript Test Suite
- Runner: `scripts/run_comprehensive_tests.js`
- Section 22: Historical Dataset Ingestion & Leakage Audit (9 dedicated Phase 7.3 tests)
- Command: `npm test`
- Output: **106 passed / 0 failed in 4.25s (0 failures)**

#### 7.3 TypeScript Typecheck
- Command: `npm run typecheck` (`tsc --noEmit`)
- Output: **0 errors across all TypeScript files**

#### 7.4 Cross-Language Parity Script
- Script: `scripts/verify_cross_language_parity.py`
- Command: `python scripts/verify_cross_language_parity.py`
- Output: **PARITY AUDIT RESULT: 100% MATCH ACROSS ALL METRICS (PASS)**

---

### Honest Disclosure of Research Limitations

1. **No Real-Money Trading or Live Broker Feed:** Live execution remains permanently blocked by safety interlocks. All tests are offline.
2. **Absence of Real Historical Ticks:** The offline repository contains sample fixtures and synthetic test sets. Genuine historical exchange archives must be imported and independently verified via this pipeline in future work.
3. **No Claim of Trading Profitability or Certification:** No trading strategy was tuned or optimized. No claim of trading alpha, institutional certification, or commercial fitness is made.

---

### Sign-Off & Repository Status

| Attribute | Value |
| :--- | :--- |
| **Audit Status** | **VERIFIED & CLOSED (PHASE 7.3 COMPLETE)** |
| **Total Test Count** | **275 Passing / 0 Failing** (169 Pytest + 106 TypeScript) |
| **Calendar Engine** | NSE v2026.1 Audited |
| **Data Leakage Auditor** | Active & Validated against 3 Injected Vulnerabilities |
| **Cross-Language Consistency** | Verified 100% Parity |
| **Working Tree** | Clean & Committed Locally |
