# Final Regression Results (post-PERF-001 and post-registry)

Executed from the FINAL source state after all changes in this session. Previous PASS results
were not reused.

## Commands and exact results

```
$ npm ci                                        exit 0
$ npm run test:prep                             tsc build of 16 modules -> dist_test_cjs OK
$ node scripts/run_comprehensive_tests.js       TEST RESULTS: 169 PASSED / 0 FAILED (TOTAL: 169)
$ node scripts/independent_math_verification.js === INDEPENDENT MATH RESULTS: 40 PASSED / 0 FAILED ===
$ python3 -m pytest tests/ -q                   388 passed
$ npx tsc --noEmit                              exit 0 (no output)
$ npm run lint                                  exit 0 — 0 problems
$ npx next build                                compiled successfully (19 API routes)
```

New suites added and executed:

```
$ node scripts/perf_equivalence.js
  VERDICT: EXACT_EQUIVALENCE_VERIFIED | divergences: 0
  4 datasets x ~1,200-1,500 bars compared field-by-field + 3 trade-level runs + determinism

$ node scripts/perf_benchmark.js
  1,000 bars: 104 ms -> 13 ms (8.0x)
  2,000 bars: 349 ms -> 21 ms (16.4x)
  4,000 bars: 949 ms -> 27 ms (34.7x)
  8,000 bars: 3,568 ms -> 36 ms (98.5x), identical=true
  200,000 bars: 944 ms (legacy did not finish in 600 s)
  (figures from the original verification run; latest regeneration: 2,697 -> 31 ms, 200,000 bars 879 ms)

$ node scripts/anchor_reproduction.js
  VERDICT: ANCHORS_REPRODUCED_EXACTLY
  fixture 74/-7576.06 · research 72/-7177.69 · walk-forward 30 OOS/-4023.54 · multiday 3/-602.96

$ node scripts/experimental_registry_tests.js
  === REGISTRY RESULTS: 11 PASSED / 0 FAILED ===

$ node scripts/experimental_research.js
  10 strategies x 3 regimes (4,500 bars each); portfolio net -156,048.10; 0 promotion candidates

$ node scripts/final_readiness_probes.js
  probes 12 PASS 12 FAIL 0   (was 11/12 before PERF-001)

$ node scripts/phase2_recheck_matrix.js
  all 9 tiers + multiday + fail-closed reproduce the documented values exactly
```

## Tally

| Suite | Passed | Failed | Total |
|---|---|---|---|
| TypeScript harness | 169 | 0 | 169 |
| Independent math | 40 | 0 | 40 |
| Python pytest | 388 | 0 | 388 |
| Subsystem probes | 12 | 0 | 12 |
| PERF equivalence (field checks) | 1 verdict | 0 | 1 |
| Registry integrity | 11 | 0 | 11 |
| Anchor reproduction | 12 checks | 0 | 12 |
| Type check / lint / build | 3 | 0 | 3 |
| **Total** | **636** | **0** | **636** |

## Regression-safety notes

* No test was deleted, skipped, or weakened; no assertion was relaxed.
* The 4 previously reported defects remain fixed and are re-exercised by their tests
  (PAUSE-001, PAPER-002, UI-01, TEST-002).
* `fastEval` defaults to true; the equivalence harness is the guard. If a future change to the
  voters breaks parity, that script exits non-zero.
* Every financial anchor is bit-identical to the pre-optimization values.
* Live execution remains hard-blocked in both stacks.
