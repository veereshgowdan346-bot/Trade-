# Cost Sensitivity Report (Gate 6)

**Date:** 2026-11-17 · **Baseline commit:** `d095fc0754edd40ca369a127ce140a7d22e0e680`
**Reproduce:** `npm run test:cost` → `data/provenance/cost_sensitivity.json`

## Verdict

`COST_MODEL_UNVERIFIED / RESULT_SIGN_INVARIANT`

Two independent statements, deliberately kept apart:

1. **Every statutory rate is UNVERIFIED.** 0 of 26 heads have been checked against a regulator,
   exchange or broker publication (`RATE-001`). No official value has been substituted, invented or
   "looked up from memory" anywhere in this study.
2. **The negative result does not depend on the cost assumption.** Across six labelled slippage
   assumptions, in all three years, the pooled sign stays negative. The result is not a cost-tuning
   artefact — but it is not cost-independent either, because *statutory charges alone already exceed
   gross P&L*.

## Baseline cost decomposition (2024 OOS, nine arms, 4,582 trades)

| Component | Amount | Share of modelled costs |
|---|---|---|
| Gross P&L | **+₹95,673.39** | — |
| Statutory charges (STT, exchange, SEBI, GST, stamp, brokerage) | **−₹200,449.40** | 23.2% |
| Slippage (16 bps/side) | **−₹664,470.58** | 76.8% |
| **Net** | **−₹769,246.59** | — |

Statutory and slippage are computed separately (`roundTripCharges` exposes `slippage`; statutory is
`total − slippage`) and are never blended into a single "cost" number.

## Slippage ladder — all assumptions labelled, zero included

| ID | bps/side | Label | Realistic? | 2022 net | 2023 net | 2024 OOS net | Sign |
|---|---|---|---|---|---|---|---|
| M0 | 0 | ZERO_SLIPPAGE_STATUTORY_ONLY | **NO** — perfect fills; optimistic bound only | −₹126,738.09 | −₹110,635.66 | −₹104,776.01 | negative |
| M25 | 4 | ULTRA_LIQUID_4BPS | only top-liquidity names | −₹285,106.58 | −₹277,104.70 | −₹270,893.65 | negative |
| M50 | 8 | LIQUID_8BPS | plausible | −₹443,475.08 | −₹443,573.75 | −₹437,011.30 | negative |
| M100 | 16 | HARNESS_BASELINE_16BPS | model default, **unverified** | −₹760,212.07 | −₹776,511.84 | −₹769,246.59 | negative |
| M150 | 24 | STRESSED_24BPS | stressed | −₹1,076,949.06 | −₹1,109,449.93 | −₹1,101,481.88 | negative |
| M200 | 32 | SEVERE_32BPS | severe | −₹1,393,686.05 | −₹1,442,388.02 | −₹1,433,717.17 | negative |

Zero slippage is reported because a sensitivity study needs it as a bound. It is **not** a realistic
case and is never presented as achievable: the instrument studied (the NIFTY 50 index) cannot be
traded at all, so a zero-slippage fill is doubly hypothetical.

## Break-even slippage — the decisive arithmetic

| Period | Gross − statutory | Break-even slippage | Interpretation |
|---|---|---|---|
| 2022 | ₹64,354.20 − ₹191,092.29 = **−₹126,738.09** | **−3.2 bps/side** | never reachable |
| 2023 | ₹89,260.72 − ₹199,896.38 = **−₹110,635.66** | **−2.7 bps/side** | never reachable |
| 2024 | ₹95,673.39 − ₹200,449.40 = **−₹104,776.01** | **−2.5 bps/side** | never reachable |

A negative break-even means **no slippage level, including zero, produces break-even**: statutory
charges alone exceed the entire gross P&L, so slippage can only deepen the loss.

The only way this arithmetic could change is if the statutory schedule were *overstated*. Break-even at
zero slippage requires statutory charges to fall by the full shortfall — 52.3% below the modelled
level in 2024 (55.3% in 2023, 66.3% in 2022). Because those rates are unverified (`RATE-001`), that
possibility cannot be dismissed from the model alone; it is precisely why the verdict is
`UNVERIFIED` rather than a clean "costs are fatal". What *can* be stated is that at the model's current
statutory level — and at any level within ~50% of it — no slippage assumption rescues these arms.

## OOS uncertainty at each assumption (session-cluster bootstrap, 5,000 reps)

| ID | bps/side | Mean net/session | 95% CI | Sign |
|---|---|---|---|---|
| M0 | 0 | −₹424.19 | [−730.08, −107.39] | negative |
| M25 | 4 | −₹1,096.74 | [−1,411.56, −766.91] | negative |
| M50 | 8 | −₹1,769.28 | [−2,099.46, −1,427.46] | negative |
| M100 | 16 | −₹3,114.36 | [−3,476.73, −2,741.89] | negative |
| M150 | 24 | −₹4,459.44 | [−4,859.20, −4,039.60] | negative |
| M200 | 32 | −₹5,804.52 | [−6,256.31, −5,336.74] | positive: none |

Even the most optimistic assumption (M0, zero slippage) excludes zero at 95% confidence:
upper bound −₹107.39 per session.

## Per-arm behaviour at the optimistic bound

- Arms positive at baseline (16 bps): **0 of 9**.
- Arms positive at zero slippage: **2 of 9** — `x_choppiness_index` and `x_donchian_trend_50`.
- Both are the two lowest-frequency arms (239 and 216 trades) and both have the widest intervals in
  the robustness report. They turn positive **only** under an assumption labelled not realistic, by
  margins of a few thousand rupees on ~₹1L sleeves across a year. They are **not promoted**, not
  ranked first, and not described as candidates. Per the phase mandate, no strategy is promoted and no
  parameter was adjusted to make them positive.

## What this report may and may not be used for

**May:** support the statement "the strategies are unprofitable under every cost assumption tested,
including an unrealistically favourable one".

**May not:** be used to argue "costs are the only problem". Gross edge is ₹26–54/trade in most arms
(2.6–5.4 bps on a ₹1L sleeve), which is (a) small relative to the unverified cost schedule's
uncertainty, and (b) measured on an index series whose authenticity is UNVERIFIED and whose cost
schedule (equity intraday) does not match the instrument. Cost dominance means the net sign is robust;
it does not mean the gross edge is real or transferable.

## Residual cost-model risk

| Risk | Status |
|---|---|
| Statutory heads verified against publication | **0 / 26** (`RATE-001`) |
| Whether the equity schedule is the right schedule for the instrument | **NO** — instrument is an index (see Provenance audit) |
| Slippage model calibrated to observed fills | **NO** — assumption, not measurement |
| Impact/capacity modelled | **NO** — flat 16 bps regardless of size |
| Brokerage floor effects at ₹1L notional | modelled (`roundTripBrokerageFloor`) but the broker's floor itself is unverified |
