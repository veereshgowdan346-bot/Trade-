# OMNITRADEPRO RISK & SCALABILITY REPORT (CONSOLIDATED)

Detailed matrix: `OMNITRADEPRO_08_RISK_AND_SCALABILITY.md`.

## Verdict: PASSED (Gate 8) — with one Category-C design flag (MICRO-001)

## Risk engine (verified against documented parameters)
- **1% per-trade risk rule:** implemented as `riskPct` (default 1%, clamp 0.1–25%) — invariant `riskAtStop ≤ capital·riskPct%` proven across a ₹1k–₹10L sweep ✅.
- **ATR-based stop (1.5×ATR14, ≥2 ticks) + guaranteed bracket clamp** ✅ (≤1-tick edge documented).
- **20% exposure cap** on capital×leverage per trade ✅ sweep-proven; plus hard deployed-notional ceiling at order time ✅.
- **Sizing** = floor(min(conf·20%-cap, 1%-risk cap), lot) with LOT_SIZE/CAPITAL/ATR_RISK attribution ✅; confidence multiplier clamped [0.25→1] (RISK-001 fixed).
- **3R minimum target, net-target hurdle, duplicate-position & max-position caps, daily drawdown floor (2.5×maxSL), circuit breaker (3×floor or 90% capital), recovery mode (200/800 rule: 90% quorum + 85% GBM + remaining-capital cap), catastrophic square-off** — all verified in code paths and pytest suites ✅.
- Fail-scenarios (consecutive losses → recovery → circuit; gaps; stale data; duplicates; DB interruption; restart) covered by failure-injection suites ✅.

## Capital scalability matrix (executed; hypothetical balances)
| Capital | Tradable universe (tested instruments) | Blocked instruments |
|---------|----------------------------------------|---------------------|
| ₹1,000–₹5,000 | TATASTEEL-EQ only | NIFTY/BNF futures, RELIANCE |
| ₹10,000–₹25,000 | RELIANCE, TATASTEEL | NIFTY/BNF futures (lot+1% risk) |
| ₹50,000–₹1,00,000 | RELIANCE, TATASTEEL; NIFTY-lot indices ≳₹22.5k/unit still blocked at ₹1L | NIFTY/BNF futures |
| ₹5,00,000 | + NIFTY-50-priced units (demonstrated live) | NIFTY/BNF futures (LOT_SIZE) |
| ₹10,00,000 | equity widely tradable | NIFTY fut needs ≈₹13.5L; BNF ≈₹31.2L (SCALE-001) |

Key numbers: minimum valid position = 1 lot/unit where tradeable; charges at target range ₹25 (floor) → ₹415; rejection reasons (`SIZE_ZERO`, `CAPITAL_EXHAUSTED`, `PREFLIGHT_LOW_YIELD`) verified explicit.

## Flags
- **MICRO-001 (HIGH, Category C):** capital ≤ ₹2,000 lowers the net-yield hurdle to **−₹50** (expected losses permitted up to 5% of a ₹1,000 account per trade). Requires explicit decision; until then treat micro accounts as research-only.
- Leverage clamp allows up to 20× (default 1) — pre-deployment review recommended.
- Python `RiskManager` is a second, unreconciled risk model (ARCH-001).

## Honest expectations
Under the verified charge model, small accounts face ₹25–₹55 fixed friction per round trip; at ₹1,000 that is 2.5–5.5% of capital per trade — the hurdle gate correctly blocks most micro setups (except the MICRO-001 carve-out).
