# BT-004 — Sharpe / Sortino Annualisation Defect

**Status: FIXED** · **Severity:** MEDIUM (reporting integrity, not order execution)
**Verification date:** 2026-11-17

---

## 1. Definition (as recorded in the original audits)

`OMNITRADEPRO_02_SOURCE_CODE_AUDIT.md:145` and `OMNITRADEPRO_09_BACKTEST_VALIDATION.md:46`:

> BT-004 — Sharpe/Sortino annualisation invalid. Returns series is per-trade, not per-day, yet it is
> scaled by √252.

## 2. Reproduction (before the fix)

`src/lib/backtest_engine.ts` built an array named `dailyReturns` by pushing `t.netPnl / initialCapital`
**once per trade**, then computed `sharpe = mean/std × √252` and `sortino` with
`std` replaced by downside deviation. With 74 trades on a single day of data, √252 was applied to
trade-level dispersion — so a single-session backtest produced values like **−81.37** and **−15.7**.
A Sharpe ratio of −81 is not a bad strategy; it is a units error.

## 3. Fix

New exported function in `src/lib/backtest_engine.ts`:

```ts
export const MIN_SESSIONS_FOR_RISK_ADJUSTED = 20;
export function computeRiskAdjustedRatios(
  sessionReturns: number[],        // equity return per IST session, not per trade
  minSessions = MIN_SESSIONS_FOR_RISK_ADJUSTED,
): { sharpeRatio: number | null; sortinoRatio: number | null; basis: RiskAdjustedBasis; sessions: number }
```

- Returns are now built from **IST-session** equity marks (`toIstDate(t.exitTime).isoIst.slice(0,10)`),
  so √252 annualisation is dimensionally correct.
- **Fewer than 20 sessions → `null` + `riskAdjustedBasis: "INSUFFICIENT_SAMPLE"`.** The engine refuses
  to emit a number rather than emit a meaningless one.
- **≥ 20 sessions →** `riskAdjustedBasis: "DAILY_ANNUALIZED"`.
- Sortino uses the standard downside deviation `sqrt(mean(min(r,0)²))` over **all** observations, not
  only the losing ones.
- `EPS = 1e-12` guard: a constant-return series has a ~1e-17 float residual variance that would
  otherwise divide by ~0 and blow the ratio up to 1e17.
- `emptySummary` now carries `null` ratios and `INSUFFICIENT_SAMPLE`; new summary fields
  `riskAdjustedBasis` and `sessions` make the basis visible to every consumer.
- The local variable was renamed `dailyReturns` → `perTradeReturns` so the misnomer cannot reappear.

## 4. Financial-output change (declared, per Apex §9)

**Yes — this changes reported output.** Sharpe/Sortino for backtests under 20 sessions become `null`,
and for ≥20-session runs they change numerically because the basis changed from per-trade to per-session.
This is intended: the previous numbers were wrong. Affected surfaces: the backtest summary object and
`scripts/run_comprehensive_tests.js`. **No UI or API consumer read these fields** (verified by search
across `src/components`, `src/app`), so no user-facing contract broke. No trading logic, sizing, stop,
or risk limit was touched.

## 5. Verification

`scripts/metric_tests.js` — **9 PASS / 0 FAIL**:

1. `MIN_SESSIONS_FOR_RISK_ADJUSTED = 20` threshold constant
2. 19 sessions → `null`, basis `INSUFFICIENT_SAMPLE`
3. 20 sessions → numeric ratios, basis `DAILY_ANNUALIZED`
4. independent Sharpe recomputation cross-check
5. Sortino downside deviation uses the full sample
6. zero-variance series → `null` (not infinity)
7. short backtest never yields an extreme ratio (guards the −81.37 class of defect)
8. session counting groups by IST day, not by trade
9. declared basis always accompanies the value

The pre-existing assertion in `scripts/run_comprehensive_tests.js` was **strengthened**, not relaxed:
it now requires *either* `null` *or* a finite number **and** a declared `riskAdjustedBasis`.

Full regression after the change: `npm test` **169/169**, math **40/40**, metrics **9/9**, anchors
`ANCHORS_REPRODUCED_EXACTLY`.

## 6. Remaining risk

- The 20-session floor is a **project-chosen** threshold, stated in code and in the test, not derived
  from a power calculation. It exists to prevent nonsense, not to guarantee significance: 20 sessions
  remains a small sample and any Sharpe quoted from it should be labelled preliminary.
- Annualisation by √252 assumes i.i.d. daily returns; that assumption is stated here rather than hidden.
