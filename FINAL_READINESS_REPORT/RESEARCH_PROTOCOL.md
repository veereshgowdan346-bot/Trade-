# RESEARCH PROTOCOL v1.0.0 — Chronological Train / Validation / Out-of-Sample

**Status: PREDEFINED and executed once. No parameter search was performed.**
**Date:** 2026-11-17 · Runner: `scripts/research_protocol_oos.js` · Output: `scripts/research_protocol_output.json`

---

## 1. Why a protocol document exists

The failure mode this guards against is *protocol drift*: choosing the split, the metric or the strategy
after seeing results. Everything below was fixed before the run and is embedded in code, so the run is
reproducible and the choices are auditable.

## 2. Data

| Element | Decision |
|---|---|
| Source | `data/external/nse/NIFTY50_1min_*.csv`, obtained as a third-party redistribution (MIT), authenticity **UNVERIFIED** |
| Instrument | NIFTY 50 **index** — a proxy; not directly tradable |
| Timeframe | 1-minute upstream, **aggregated to 15-minute** bars (o=first, h=max, l=min, c=last, v=sum), stamped at bucket close |
| Why 15-minute | Full-prefix signal evaluation on 92k 1-minute bars per period is O(n²) and would take hours per strategy; 15-minute bars give ~6.1k bars per year with ~247 sessions and keep signal computation **exact** (no rolling-window approximation, which was measured at only ~99.6% agreement and rejected) |
| Timezone | `Asia/Kolkata` throughout |
| Volume | Not published for the index → volume-dependent strategies are `NOT_EVALUABLE` |

## 3. Splits (chronological, non-overlapping, never shuffled)

| Period | Year | Sessions | 15-min bars | Role |
|---|---|---:|---:|---|
| TRAIN | 2022 | 247 | 6,175 | reference only — no fitting is done, so "train" is a baseline period |
| VALIDATION | 2023 | 246 | 6,130 | first confirmation |
| OOS | 2024 | 249 | 6,171 | untouched until the verdict |

Because no parameters are estimated, there is nothing to "train". The split exists to answer a weaker
but meaningful question: *does behaviour persist across three independent years?*

## 4. Signal and execution conventions (identical to production conventions)

- Signal at bar `i` computed from `candles.slice(0, i)` — the current bar is excluded (no look-ahead).
- Entry at `c[i].c`; exits at a 2×ATR stop, 3×ATR target, opposite signal (confidence ≥ 55), or the next
  session's open (mandatory intraday square-off).
- Sleeve ₹1,00,000 per trade; no leverage; no position stacking.
- Harness: `src/lib/experimental_harness.ts` — the same single source of truth used by
  `experimental_research.js` and `portfolio_correlation.js`.

## 5. Cost model (declared, not assumed away)

- Statutory round trip (Shoonya, NSE equity intraday) + slippage, per trade, via `roundTripCharges()`.
- On a representative ₹2,00,250 round trip: **statutory ₹47.12**, **slippage ₹160.20 (77.3%)**.
- **Every statutory rate is UNVERIFIED** (RATE-001) and slippage is an arbitrary assumption, so the
  study reports a **slippage sensitivity ladder**: net at 0×, 0.25×, 0.5×, 1×, 1.5× the assumed slippage.
- The headline test is whether a strategy survives at **0× slippage** — i.e. on statutory charges alone.

## 6. Metrics reported per strategy per period

Trades, sessions traded, gross, statutory charges, slippage, net, win rate, profit factor, expectancy,
max drawdown of the daily P&L curve, **bootstrap 95% CI of mean net per trade** (10,000 resamples,
deterministic LCG seed 42), and a t-statistic.

## 7. Decision rule (fixed in advance)

A strategy is `OOS_SUPPORTED` only if **all** hold:

1. net > 0 in VALIDATION,
2. net > 0 in OOS,
3. ≥ 100 trades in each of VALIDATION and OOS,
4. bootstrap 95% CI for mean net per trade has a **positive lower bound** in OOS.

Otherwise `NOT_SUPPORTED`. Strategies lacking required inputs are `NOT_EVALUABLE` — never run on
fabricated inputs (no volume zeros).

## 8. Promotion policy

**No outcome promotes anything.** Even `OOS_SUPPORTED` would only justify a *further* study. The
experimental registry stays `enabled: false`, production execution stays PAPER, and no live path is
touched. Promotion would require, at additional minimum: verified rates, authentic data, ≥60 sessions in
each period at the production timeframe, and explicit authorisation.

## 9. Limitations stated up front

1. Index proxy — costs are indicative, not a tradability claim.
2. 15-minute aggregation changes the strategy's character vs 1-minute production bars.
3. Authenticity of the data is unverified; one redistribution, one upstream author.
4. Slippage assumption dominates the cost model and is not evidence-based.
5. No volume → 2 of 10 strategies cannot be evaluated at all.
6. Three years is a small sample for regime inference; no regime-conditional claim is made.

## 10. Reproduce

```bash
node scripts/import_external_data.js        # verifies hashes, builds canonical cache
node scripts/audit_external_datasets.js     # data quality gates
node scripts/research_protocol_oos.js       # the study (~17 s)
```
Any change to the protocol (periods, aggregation, decision rule) must be versioned here and re-run from
scratch — results may not be carried forward.
