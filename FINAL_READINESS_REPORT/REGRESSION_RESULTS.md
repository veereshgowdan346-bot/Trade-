# Final Regression Results

**Rule applied:** a previous PASS does not substitute for the final run. Everything below was
executed **after all code changes of this phase**, from the final source state.

## Commands and exact results
```
$ npm run test:prep
  -> dist_test_cjs built (14 modules)                                        OK

$ node scripts/run_comprehensive_tests.js
  TEST RESULTS: 169 PASSED / 0 FAILED (TOTAL: 169)

$ node scripts/independent_math_verification.js
  === INDEPENDENT MATH RESULTS: 40 PASSED / 0 FAILED ===

$ python3 -m pytest tests/ -q
  388 passed in 1.47s

$ npx tsc --noEmit
  exit 0

$ npm run lint
  exit 0 — 0 problems

$ npx next build
  compiled successfully — 19 dynamic API routes, exit 0

$ node scripts/final_readiness_probes.js
  11 PASS / 1 FAIL  (FAIL = P5_linear_or_better, PERF-001)

$ node scripts/phase2_recheck_matrix.js
  9 tiers + multiday + fail-closed written to scripts/phase2_recheck_matrix_output.json
```

## Summary counts
| Suite | Passed | Failed | Total |
|---|---|---|---|
| Python pytest | 388 | 0 | 388 |
| TypeScript harness | 169 | 0 | 169 |
| Independent math | 40 | 0 | 40 |
| Subsystem probes | 11 | 1 | 12 |
| Type check | 1 | 0 | 1 |
| Lint | 1 | 0 | 1 |
| Production build | 1 | 0 | 1 |
| **Total (excluding the documented PERF-001 finding)** | **611** | **0** | **611** |

## Regression-specific checks
* Financial calculations unchanged: anchors ₹256.54 (Shoonya) and ₹291.94 (Angel) reproduce
  exactly; parity across 17 fixtures remains identical.
* Cross-language parity: PASS.
* Paper-trading workflows: PASS (12/12 lifecycle + 12-stage workflow).
* Security checks: PASS (all guard codes, rate limits, webhook verification).
* Look-ahead: PASS (truncation-equivalence proof).
* Live execution: still hard-blocked in both stacks (verified by interlock test).

## Known non-green item
`P5_linear_or_better` fails by design of the audit: the backtest is super-linear. This is a
**reported finding (PERF-001)**, not an unnoticed regression, and it is not hidden by
adjusting the threshold.
