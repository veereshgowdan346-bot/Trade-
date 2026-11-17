# OMNITRADEPRO_07 — BROKERAGE, TAX AND STATUTORY CHARGES AUDIT

**CRITICAL FINANCIAL VERIFICATION PHASE** · Modules: `src/lib/tax.ts`, `src/lib/risk.ts` (hurdles), `src/lib/engine.ts` (hurdle enforcement), `src/lib/brokers.ts` (broker identities), Python `risk/cost_guardrail.py`.  
**Verdict: PARTIALLY PASSED** — arithmetic and internal consistency verified by independent hand-computed fixtures (math harness §Tax); **every statutory rate is UNVERIFIED against official sources** (none locally available; environment cannot fetch them) and one structural pricing defect per product type is open (TAX-001).

## 1. Policy Compliance (§7.1)
> "If official source documents are not locally available, mark the rate UNVERIFIED. Do not invent rates."

No tariff schedules, SEBI circulars, or exchange notifications exist in the repository (124 MD files contain no source documents — checked). **Therefore every rate below is recorded with Verification Status = UNVERIFIED.** Rates were neither invented nor altered in this audit; the existing table was audited as-found and its arithmetic independently verified.

## 2. Rate Register (as implemented in `src/lib/tax.ts`)

### 2.1 Brokerage per executed order leg

| Broker | Segment/Product | Rate as implemented | Basis | Effective date | Source doc | Verified |
|--------|----------------|--------------------|-------|---------------|-----------|----------|
| Shoonya/Finvasia | Intraday & F&O | flat ₹5/leg (RT floored to ₹10 "Base/API/DP") | per executed order | "2026 pricing update" (code comment) | **NONE** | **UNVERIFIED** |
| Shoonya/Finvasia | Equity Delivery (DELIVERY/CNC) | ₹0 | per order | unknown | NONE | UNVERIFIED |
| Angel One | Intraday | min(₹20, 0.1%·turnover)/leg, then **RT floor ₹40 overrides** (TAX-004) | per leg | unknown | NONE | UNVERIFIED |
| Groww | Intraday | same as Angel | per leg | unknown | NONE | UNVERIFIED |
| Angel/Groww | Delivery | ₹0 | per order | unknown | NONE | UNVERIFIED |
| All | Round-trip minimums | Shoonya total ≥ ₹25; Angel/Groww total ≥ ₹55 (modeled "minimum deduction") | round trip | none | **NONE (modeled construct)** | **UNVERIFIED** |

### 2.2 Statutory heads (`ratesFor` + fixed bases)

| Charge | NSE Equity Intraday | NSE F&O Futures | NSE F&O Options | MCX | Side | Verified |
|--------|--------------------|-----------------|-----------------|-----|------|----------|
| STT/CTT | 0.025% (0.00025) | 0.02% (0.0002) | 0.1% (0.001) | CTT 0.01% (0.0001) | **sell only** (all) | UNVERIFIED |
| Exchange txn | 0.00297% (0.0000297) | 0.00183% (0.0000183) | 0.03503% (0.0003503) | 0.0021% (0.000021) | both (turnover) | UNVERIFIED |
| SEBI turnover | ₹10/crore (0.000001) | same | same | same | both | UNVERIFIED |
| Stamp duty | 0.003% (0.00003) | 0.002% (0.00002) | 0.003% (0.00003) | 0.002% (0.00002) | **buy only** | UNVERIFIED |
| GST | 18% on (brokerage + exchange + SEBI) | same | same | same | — | UNVERIFIED |
| Slippage (modeling, not statutory) | 8.0 bps entry, exit defaults = entry (configurable) | same | same | same | each side | Modeling assumption (default documented) |

Internal arithmetic verified against hand-computed fixture (harness §Tax #12): every head matches to ±₹0.01. SEBI ₹10/crore ⇔ 0.000001 fraction ✓ basis correct as coded.

## 3. Per-Broker / Per-Segment Findings

### 3.1 Shoonya / Finvasia
- Intraday flat ₹5/leg model coherent except TAX-004 RT-floor ₹10 makes `brokerageFor` dead for small notional ("flat ₹10 Base/API/DP fee per round trip" claim UNVERIFIED).
- Delivery ₹0 brokerage ✓ matches zero-brokerage delivery convention; **but statutory treatment of delivery is incomplete (TAX-001)**.
- MCX: CTT modeled sell-side 0.01% + MCX txn + stamp — arithmetic OK, rates UNVERIFIED.

### 3.2 Angel One
- Documented formula "lower of ₹20 or 0.1%" **cannot ever apply**: `Math.max(40, per-leg-sum)` forces flat ₹40/RT (TAX-004). Overstates cost for trades < ₹40,000 turnover/leg.
- Hurdle constants disagree across modules (TAX-005: ₹70 vs ₹55).

### 3.3 Groww
- Treated identically to Angel in code. **Groww-specific charges (e.g. any platform/IPFT fees) are not separately modeled** — applying Angel's structure to Groww violates "Do not apply the same fee assumptions to all brokers" unless verified identical. Status: Groww rate set UNVERIFIED/possibly incomplete (IPFT charged at ₹10/crore for NSE? not separately identifiable in code).

### 3.4 Segments
| Segment | Modeled? | Notes |
|---------|----------|-------|
| NSE Equity Intraday | ✅ complete heads | rates UNVERIFIED |
| NSE Equity Delivery | ❌ **structurally wrong** | intraday sell-only STT applied; delivery STT (both sides) + DP charges absent (TAX-001) |
| NSE Futures | ✅ heads present | rates UNVERIFIED |
| NSE Options | ✅ heads present | premium-side STT 0.1% sell-only as coded; UNVERIFIED |
| Currency Derivatives | ❌ **not supported** | `ratesFor` has no CDS branch (falls into NSE equity rates if used — mis-costing risk) |
| MCX Commodities | ✅ CTT branch | rates UNVERIFIED |

## 4. Calculation Correctness Tests (executed)
| Test | Result |
|------|--------|
| Entry/exit charges (hand vector) | PASS ±0.01 |
| Buy turnover / sell turnover / total turnover (side-aware) | PASS |
| Brokerage caps (min(20, 0.1%)) & RT floors | PASS as-designed (TAX-004 caveat) |
| Minimum brokerage floors (₹25/₹55) | PASS as-designed (construct unverified) |
| Multiple order legs (sumCharges) | PASS additive |
| Rounding (paise, r2) | PASS |
| Net realized P&L = gross − charges | PASS |
| Net unrealized (P&L display path uses same charge model) | PASS structurally |
| Break-even (TSL fee buffer at entry=exit) | PASS (engine) — backtest fixed BT-001 to match |
| Net target profitability gate | PASS (ORD-002/005 fixed: kind-aware on both paths) |
| Net stop-loss accounting | PASS |
| Gross never presented as net | PASS (`calculateNetPnL` + suite) |
| Partial fills (TS engine) | N/A — TS fills are whole-qty; **Python PaperTrading models partial fills** (see PAPER_TRADING report) |
| Order modifications/rejections | rejections recorded with codes ✓ (engine `reject()`); TS has no modify path (Python `modify_order` exists) |
| **Delivery charges** | **FAIL as-designed (TAX-001 — understates)** |
| **Fallback breakdown honesty** | **FAIL (TAX-002 — fabricated components)** |

## 5. Cross-Language Cost Parity (executed)
TS `tax.ts` vs Python `risk/cost_guardrail.py` — **DIVERGENT (TAX-006)**: Python omits STT, exchange charges, stamp; SEBI modeled as ₹0.01/share×2 (wrong basis, wrong magnitude); GST on brokerage only. Example (100 shares @₹100→₹101, buy+sell): TS Shoonya ≈ ₹31.4 incl. 8bps slippage; Python ≈ ₹40.58 flat model (₹40 + ₹7.2 GST + ₹2 SEBI) — different heads entirely. No test enforces parity. **Neither model is source-verified; the Python model is the less complete.**

## 6. Verdict per required control
- Rates recorded with broker/segment/name/rate/basis/effective-date/source/status: ✅ (this register) — all statuses **UNVERIFIED**.
- No invented rates: ✅ (audit made zero rate changes; delivery fix left open pending authorization).
- Broker-specific differentiation: ⚠️ Angel/Groww share one table (incomplete differentiation), Shoonya distinct ✓.
- Statutory vs broker charges distinguished: ✅ in TS (`brokerage` vs heads); ❌ blurred in Python model.
- Gross vs net: ✅ enforced after this audit's ORD fixes.

## 7. Recommendations (Category C — require explicit authorization)
1. Ingest official tariff PDFs (Shoonya/Finvasia 2026 schedule, Angel One tariff, Groww tariff, NSE/SEBI/MCX circulars incl. latest STT/stamp notifications) and flip every UNVERIFIED to VERIFIED with document IDs — the evidence framework above is ready for the data.
2. TAX-001: add a delivery rate table (delivery STT both sides, DP charges) and reject/mark unsupported segments (CDS) explicitly.
3. TAX-002/003: replace fabricated fallback breakdown + minimum floors with sourced constructs or remove.
4. TAX-004: decide per-leg formula vs flat fee and implement one; delete the dead path.
5. TAX-005: single hurdle constant module consumed by engine + risk.
6. TAX-006: delete or align the Python cost engine; add parity tests for cost math.
