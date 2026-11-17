/**
 * CORR-001 — unit tests for the portfolio statistics helpers.
 * Known-answer tests: every assertion can be verified by hand.
 *
 * Usage: node scripts/portfolio_stats_tests.js
 */
"use strict";

const {
  reliabilityLabel,
  pearson,
  rollingCorrelation,
  drawdownSeries,
  maxDrawdown,
  portfolioStats,
  exposureOverlap,
} = require("../dist_test_cjs/experimental_harness.js");

let pass = 0;
let fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  PASS ${name}`); }
  else { fail++; console.log(`  FAIL ${name} ${detail}`); }
};

console.log("CORR-001 portfolio statistics\n");

/* reliability labels — thresholds stated in src/lib/experimental_harness.ts */
check("12 sessions -> INSUFFICIENT_SAMPLE", reliabilityLabel(12) === "INSUFFICIENT_SAMPLE", reliabilityLabel(12));
check("29 sessions -> INSUFFICIENT_SAMPLE", reliabilityLabel(29) === "INSUFFICIENT_SAMPLE");
check("30 sessions -> PRELIMINARY", reliabilityLabel(30) === "PRELIMINARY");
check("59 sessions -> PRELIMINARY", reliabilityLabel(59) === "PRELIMINARY");
check("60 sessions -> RELIABLE", reliabilityLabel(60) === "RELIABLE");
check("0 sessions -> UNVERIFIED", reliabilityLabel(0) === "UNVERIFIED");

/* pearson known answers */
check("perfect positive correlation = 1", pearson([1, 2, 3], [2, 4, 6]) === 1, String(pearson([1, 2, 3], [2, 4, 6])));
check("perfect negative correlation = -1", pearson([1, 2, 3], [6, 4, 2]) === -1, String(pearson([1, 2, 3], [6, 4, 2])));
check("flat series -> null (undefined, not 0)", pearson([5, 5, 5], [1, 2, 3]) === null);
check("too few points -> null", pearson([1, 2], [1, 2]) === null);
check("known value r=0 (mean-centred vectors orthogonal)", pearson([1, 2, 3, 4], [1, 4, 4, 1]) === 0, String(pearson([1, 2, 3, 4], [1, 4, 4, 1])));

/* rolling correlation */
const twelve = Array.from({ length: 12 }, (_, i) => i + 1);
const roll = rollingCorrelation(twelve, twelve.map((v) => v * 2), 30);
check("rolling output length = input length", roll.length === 12, String(roll.length));
check("rolling last value = 1 on perfectly correlated data", roll[11] === 1, String(roll[11]));
// deliberate statistical floor: fewer than 10 observations in the window yields null, not a number
check("6 observations below the floor -> null", rollingCorrelation([1, 2, 3, 4, 5, 6], [2, 4, 6, 8, 10, 12], 30)[5] === null);

/* drawdown known answer: cum 10, -20, -10 with peak 10 -> 0, 30, 20 */
const dd = drawdownSeries([10, -30, 10]);
check("drawdown series [0,30,20]", JSON.stringify(dd) === "[0,30,20]", JSON.stringify(dd));
check("maxDrawdown = 30", maxDrawdown([10, -30, 10]) === 30, String(maxDrawdown([10, -30, 10])));
check("monotone loss => maxDrawdown = total loss", maxDrawdown([-10, -20, -30]) === 60, String(maxDrawdown([-10, -20, -30])));

/* portfolio stats */
const ps = portfolioStats([100, -50, 30, -10]);
check("portfolio net = 70", ps.net === 70, String(ps.net));
check("positiveDays = 2", ps.positiveDays === 2, String(ps.positiveDays));
check("negativeDays = 2", ps.negativeDays === 2, String(ps.negativeDays));
check("maxDrawdown = 50 (cum 100,50,80,70 from peak 100)", ps.maxDrawdown === 50, String(ps.maxDrawdown));
check("recoveryFactor = net/mdd = 70/50 = 1.4", ps.recoveryFactor === 1.4, String(ps.recoveryFactor));
check("turnoverProxy = sum|pnl|/capital", ps.turnoverProxy === Number(((100 + 50 + 30 + 10) / 100000).toFixed(3)), String(ps.turnoverProxy));
const allNeg = portfolioStats([-10, -20]);
check("all-negative days -> recoveryFactor -1", allNeg.recoveryFactor === -1, String(allNeg.recoveryFactor));

/* exposure overlap */
check(
  "overlap = both/any = 1 of 2 exposed days",
  exposureOverlap({ d1: true, d2: true, d3: false }, { d1: true, d2: false, d3: false }) === 0.5,
  String(exposureOverlap({ d1: true, d2: true, d3: false }, { d1: true, d2: false, d3: false })),
);
check("no shared exposure -> 0", exposureOverlap({ d1: true }, { d2: true }) === 0);

console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exitCode = fail === 0 ? 0 : 1;
