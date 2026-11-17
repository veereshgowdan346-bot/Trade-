# OMNITRADEPRO BROKERAGE & TAX AUDIT (CONSOLIDATED)

Detailed registers: `OMNITRADEPRO_07_BROKERAGE_TAX_AUDIT.md`.

## Verdict: PARTIALLY PASSED — evidence BLOCKED on official sources (Gate 7)

## Headline
- **Every statutory rate in the codebase is UNVERIFIED.** No official tariff schedules/circulars are present in the repository and this offline environment cannot fetch them. Policy applied strictly: no rate was invented, altered, or "corrected" toward remembered values (Category C prohibition).
- **Arithmetic is correct:** the implemented rate table computes STT/exchange/SEBI/stamp/GST/slippage/brokerage exactly as specified — proven by hand-computed independent fixtures (±₹0.01), side-aware turnover, rounding, caps and floors (math harness §Tax, 7 tests).
- **Structural defects (open, need authorized rate data):**
  - **TAX-001 (HIGH):** delivery/CNC priced with intraday sell-only STT; delivery rate heads and DP charges missing; unsupported segments (CDS) fall into equity rates.
  - **TAX-002 (HIGH):** `calculateNetPnL` fallback emits a fabricated ₹25/₹55 breakdown presented as computed components.
  - **TAX-004 (MEDIUM):** Angel/Groww per-leg `min(₹20, 0.1%)` is dead code — a round-trip floor forces flat ₹40 always (overstates small trades; contradicts the code's own documentation).
  - **TAX-005 (MEDIUM):** hurdle constants disagree across modules (₹55 vs ₹70).
  - **TAX-006 (HIGH):** Python `cost_guardrail.py` is a divergent second cost model (flat ₹40, no STT/exchange/stamp, SEBI ₹0.01/share — wrong basis) with no parity tests.

## Rate register status (summary)
| Broker | Differentiated? | Rates verified? | Notable gap |
|--------|----------------|-----------------|-------------|
| Shoonya/Finvasia | ✅ flat ₹5/leg + ₹0 delivery | ❌ UNVERIFIED | "₹10 base/API/DP" RT floor uncited |
| Angel One | ✅ (but formula dead — TAX-004) | ❌ UNVERIFIED | ₹55/₹70 hurdle conflict |
| Groww | ❌ shares Angel table wholesale | ❌ UNVERIFIED | no Groww-specific heads (IPFT etc.) |

Segments: intraday equity ✅-modeled · delivery ❌-wrong · futures/options ✅-modeled · MCX ✅-modeled · currency ❌-missing.

## Compliance checklist (§7)
Per-rate record fields ✅ populated (all statuses UNVERIFIED) · no invented rates ✅ · no same-assumptions-for-all-brokers ⚠️ (Groww piggybacks Angel) · statutory vs broker charges distinguished ✅ (TS) / ❌ (Python) · gross never shown as net ✅ (after ORD fixes) · partial fills/multi-leg/rounding/net-target/net-SL tests ✅ executed.

## What would unblock Gate 7
Official PDFs: Shoonya/Finvasia tariff, Angel One tariff, Groww tariff, NSE/SEBI/MCX circulars (STT, stamp, exchange txn, SEBI fees, GST) with effective dates → flip UNVERIFIED→VERIFIED in the register, then implement TAX-001/002/004/005 against those documents.
