/**
 * BT-004 REGRESSION TESTS — Sharpe/Sortino annualisation basis.
 *
 * The defect: per-trade returns were annualised with sqrt(252), as though each trade were a
 * day. On short samples this produced absurd values (e.g. -81.37) that were nonetheless
 * reported as Sharpe ratios.
 *
 * These tests pin the corrected contract:
 *   - < 20 sessions  -> sharpe/sortino are null, basis = INSUFFICIENT_SAMPLE
 *   - >= 20 sessions -> daily-annualised values, basis = DAILY_ANNUALIZED
 *   - the maths itself is checked against an independent implementation
 *   - a short backtest can never emit an extreme annualised ratio
 *
 * Usage: node scripts/metric_tests.js
 */
"use strict";
const {
  computeRiskAdjustedRatios,
  MIN_SESSIONS_FOR_RISK_ADJUSTED,
  runBacktest,
} = require("../dist_test_cjs/backtest_engine.js");
const { normaliseRisk } = require("../dist_test_cjs/risk.js");

let pass = 0;
let fail = 0;
const t = (name, fn) => {
  try {
    fn();
    pass++;
    console.log(`  [PASS] ${name}`);
  } catch (e) {
    fail++;
    console.log(`  [FAIL] ${name}: ${e.message}`);
  }
};
const assert = (c, m) => { if (!c) throw new Error(m); };
const close = (a, b, tol, m) => assert(Math.abs(a - b) <= tol, `${m}: ${a} vs ${b}`);

console.log("=== BT-004 RISK-ADJUSTED METRIC TESTS ===");

t("threshold is 20 sessions", () => assert(MIN_SESSIONS_FOR_RISK_ADJUSTED === 20, "unexpected threshold"));

t("< 20 sessions returns nulls and INSUFFICIENT_SAMPLE", () => {
  const r = computeRiskAdjustedRatios([0.01, -0.02, 0.03]);
  assert(r.sharpeRatio === null, "sharpe should be null");
  assert(r.sortinoRatio === null, "sortino should be null");
  assert(r.basis === "INSUFFICIENT_SAMPLE", "wrong basis");
});

t("exactly 19 sessions is still insufficient", () => {
  const r = computeRiskAdjustedRatios(new Array(19).fill(0.001));
  assert(r.sharpeRatio === null, "19 sessions must not report a ratio");
});

t("20 sessions produces daily-annualised values", () => {
  const rets = Array.from({ length: 20 }, (_, i) => (i % 2 === 0 ? 0.004 : -0.002));
  const r = computeRiskAdjustedRatios(rets);
  assert(r.basis === "DAILY_ANNUALIZED", "wrong basis");
  assert(typeof r.sharpeRatio === "number" && Number.isFinite(r.sharpeRatio), "sharpe not finite");
  assert(typeof r.sortinoRatio === "number" && Number.isFinite(r.sortinoRatio), "sortino not finite");
});

t("sharpe matches an independent implementation", () => {
  // deterministic, varied session returns
  const rets = Array.from({ length: 40 }, (_, i) => Math.sin(i / 3) * 0.006 + 0.0005);
  const n = rets.length;
  const mean = rets.reduce((a, b) => a + b, 0) / n;
  const sd = Math.sqrt(rets.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1));
  const expected = Math.round(((mean / sd) * Math.sqrt(252)) * 100) / 100;
  const r = computeRiskAdjustedRatios(rets);
  close(r.sharpeRatio, expected, 0.011, "sharpe mismatch");
});

t("sortino uses full-sample downside deviation (not only negative days averaged)", () => {
  const rets = Array.from({ length: 30 }, (_, i) => (i % 3 === 0 ? -0.005 : 0.002));
  const n = rets.length;
  const mean = rets.reduce((a, b) => a + b, 0) / n;
  const dd = Math.sqrt(rets.reduce((a, b) => a + Math.min(b, 0) ** 2, 0) / n);
  const expected = Math.round(((mean / dd) * Math.sqrt(252)) * 100) / 100;
  const r = computeRiskAdjustedRatios(rets);
  close(r.sortinoRatio, expected, 0.011, "sortino mismatch");
});

t("zero-variance series yields null (no division blow-up)", () => {
  const r = computeRiskAdjustedRatios(new Array(25).fill(0.001));
  assert(r.sharpeRatio === null, "constant returns must not produce a Sharpe");
  assert(r.basis === "DAILY_ANNUALIZED", "basis should still report the intended method");
});

t("a short backtest can no longer emit an extreme annualised ratio", () => {
  const T0 = Date.parse("2026-01-05T09:15:00+05:30");
  const candles = [];
  let p = 900;
  for (let i = 0; i < 400; i++) {
    p += Math.sin(i / 7) * 3;
    candles.push({ t: T0 + i * 60000, o: p, h: p + 2, l: p - 2, c: p, v: 1000 });
  }
  const summary = runBacktest(candles, { symbol: "SBIN", exchange: "NSE", kind: "EQ", tradingsymbol: "SBIN-EQ", lotSize: 1, tick: 0.05 }, normaliseRisk({ capital: 500000 }), "STANDARD_SHOONYA");
  assert("sharpeRatio" in summary, "summary missing sharpeRatio");
  if (summary.sessions < MIN_SESSIONS_FOR_RISK_ADJUSTED) {
    assert(summary.sharpeRatio === null, `short run reported sharpe ${summary.sharpeRatio}`);
    assert(summary.riskAdjustedBasis === "INSUFFICIENT_SAMPLE", "wrong basis on short run");
  } else {
    assert(Number.isFinite(summary.sharpeRatio), "long run should report a finite ratio");
  }
  assert(summary.sessions >= 0, "sessions must be present");
});

t("sessions are counted per IST trading day, not per trade", () => {
  const T0 = Date.parse("2026-01-05T09:15:00+05:30");
  const DAY = 375 * 60000;
  const candles = [];
  let p = 900;
  for (let d = 0; d < 3; d++) {
    for (let i = 0; i < 300; i++) {
      p += Math.sin(i / 5) * 2.5;
      candles.push({ t: T0 + d * DAY + i * 60000, o: p, h: p + 2, l: p - 2, c: p, v: 1000 });
    }
  }
  const s = runBacktest(candles, { symbol: "SBIN", exchange: "NSE", kind: "EQ", tradingsymbol: "SBIN-EQ", lotSize: 1, tick: 0.05 }, normaliseRisk({ capital: 500000 }), "STANDARD_SHOONYA");
  assert(s.sessions <= 3, `sessions (${s.sessions}) cannot exceed the number of trading days (3) when trades have <= ${s.totalTrades} exits`);
});

console.log(`\n=== METRIC RESULTS: ${pass} PASSED / ${fail} FAILED ===`);
process.exitCode = fail === 0 ? 0 : 1;
