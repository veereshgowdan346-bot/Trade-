# OFFICIAL RATE EVIDENCE REGISTER

**Status: BLOCKED — 0 of 26 rate heads verified. No value, date or citation was invented.**
**Date:** 2026-11-17 · **Baseline commit:** `adba1be311f56dd6328e6f88d64f50402aa862d7`

---

## 1. Why this is blocked (measured, not asserted)

Every issuer site was probed from this environment. All failed at TLS before any HTTP response:

| Host | Purpose | Result (`curl -m 8`) |
|---|---|---|
| `www.nseindia.com` | Exchange transaction charges, STT annexures | `curl: (35) OpenSSL SSL_connect: SSL_ERROR_SYSCALL` |
| `www.sebi.gov.in` | SEBI turnover fee circulars | `curl: (35) OpenSSL SSL_connect: SSL_ERROR_SYSCALL` |
| `www.cbic.gov.in` | GST rate notifications | `http=000` |
| `www.shoonya.com` | Broker tariff | `http=000` |
| `www.groww.in` | Broker tariff | `http=000` |
| `smartapisocket.angelone.in` | Angel One | `http=000` |
| `raw.githubusercontent.com` | (even a mirror path) | `http=000` |

Reachable: `api.github.com` 200, `pypi.org` 200, `registry.npmjs.org` 200, `codeload.github.com` 301.

**Consequence:** no official document can be retrieved, opened, or dated. A rate value that appears in
this repository is therefore a *modelled construct*, never a verified fact. Per instruction, no
substitute value was invented and no effective date was guessed.

## 2. What the register does contain

For each head, the **authoritative issuer and publication channel** are identified so the evidence can
be fetched by someone with network access. `status` stays `UNVERIFIED`; `effectiveDate`, `source` and
`verifiedAt` stay `null` until a dated document is attached.

| # | Head | Segment | Authoritative issuer | Canonical publication | Status |
|---|---|---|---|---|---|
| 1 | Securities Transaction Tax | NSE_EQ intraday | Government of India (Finance Act / STT Rules) | CBIC/Income Tax portal; NSE "STT" annexure in its charges circular | UNVERIFIED |
| 2 | Exchange transaction charges | NSE_EQ | NSE | NSE circular "Transaction charges" (Annexure, segment-wise) | UNVERIFIED |
| 3 | Stamp duty | NSE_EQ (buy side) | State Government + Indian Stamp Act | State stamp-duty schedule; NSE circular on stamp duty collection | UNVERIFIED |
| 4 | SEBI turnover fee | All | SEBI | SEBI circular on turnover fees (₹10 per ₹1 crore) | UNVERIFIED |
| 5 | GST | On brokerage + exchange + SEBI fees | GST Council / CBIC | CBIC rate notification (18%) + clarification on the levy base | UNVERIFIED |
| 6 | Exchange transaction charges | NSE_FUT | NSE | NSE circular (futures annexure) | UNVERIFIED |
| 7 | STT | NSE_FUT | Government of India | STT Rules (futures: sell side) | UNVERIFIED |
| 8 | Stamp duty | NSE_FUT | State + Indian Stamp Act | State schedule | UNVERIFIED |
| 9 | Exchange transaction charges | NSE_OPT | NSE | NSE circular (options annexure, premium vs notional) | UNVERIFIED |
| 10 | STT | NSE_OPT | Government of India | STT Rules (options: sell side on premium) | UNVERIFIED |
| 11 | Stamp duty | NSE_OPT | State + Indian Stamp Act | State schedule | UNVERIFIED |
| 12 | Exchange transaction charges | MCX_ANY | MCX | MCX circular (commodity annexure) | UNVERIFIED |
| 13 | CTT | MCX_ANY | Government of India | Finance Act (CTT on non-agri futures) | UNVERIFIED |
| 14 | Stamp duty | MCX_ANY | State + Indian Stamp Act | State schedule | UNVERIFIED |
| 15 | Brokerage (intraday, per leg) | shoonya | Shoonya (Finvasia) | Broker's published tariff page | UNVERIFIED |
| 16 | Brokerage (delivery, per leg) | shoonya | Shoonya | Broker's published tariff page | UNVERIFIED |
| 17 | Round-trip brokerage floor | shoonya | Shoonya | Broker's tariff + DP/API fee schedule | UNVERIFIED |
| 18 | Minimum round-trip deduction | shoonya | Shoonya | **Modelled construct** — not a published tariff line | UNVERIFIED |
| 19–22 | Brokerage heads ×4 | angel | Angel One | Broker's published tariff page | UNVERIFIED |
| 23–26 | Brokerage heads ×4 | groww | Groww | Broker's published tariff page | `UNVERIFIED_ASSUMED_SAME_AS_ANGEL` |

Also recorded in the spec but still unverified: GST base composition, slippage defaults (see §4).

`NSE_EQ_DELIVERY` and `CDS_ANY` remain `UNSUPPORTED_NO_EVIDENCE` and **fail closed** — they cannot be
priced at all, which is the correct behaviour when no evidence exists.

## 3. Acceptance criteria for closure

A head moves to `VERIFIED` only when all of the following are attached in `config/statutory_rates.json`:

1. `source` — a stable document identifier or URL to the **issuer's own** publication.
2. `effectiveDate` — the date the rate took effect (from the document, not inferred).
3. `verifiedAt` — ISO timestamp of retrieval.
4. `retrievedBy` — who retrieved it.
5. A local copy (PDF/HTML) stored under `data/evidence/` with its SHA-256 so the claim is reproducible.

Because criterion 5 is impossible here, **the blocker cannot be closed from this environment.** The
audit check that currently asserts `verifiedCount === 0` must be replaced by a per-rate evidence check
when real documents are added — not simply relaxed.

## 4. The finding that matters for research

The cost model's *statutory* heads total ₹47.12 on a representative ₹2,00,250 round trip, while the
slippage assumption totals **₹160.20 — 77.3% of the modelled cost**. Slippage is an assumption, not a
published charge. The OOS study therefore reports both the full model and a slippage-sensitivity ladder
(0×/0.25×/0.5×/1×/1.5×), and the headline conclusion holds even at **zero** slippage
(see `OOS_RESULTS_REAL_DATA.md`). Any future profitability work must treat slippage as an explicit
assumption with a stated range, never as a rate.

## 5. Evidence

- `data/rate_registry_audit.json` — 26 heads enumerated, 15/15 audit checks pass, TS↔Python byte-identical spec.
- `scripts/rate_registry_audit.js` — re-runnable; fails if provenance fields are missing or a rate is VERIFIED without source + date.
- Reachability probe reproduced in `data/provenance/external_dataset_manifest.json` → `environment.blocked`.
