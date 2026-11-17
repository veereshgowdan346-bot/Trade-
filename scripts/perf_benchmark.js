/**
 * PERF-001 BENCHMARK LADDER
 *
 * Measures the legacy O(n^2) path against the O(n) fast path on identical data.
 * Reports wall time, throughput, peak RSS delta and the resulting trade count / net P&L,
 * so speed is never reported without the correctness context.
 *
 * Legacy is only attempted up to a bar count that completes in reasonable time; larger
 * sizes are fast-only, and that limitation is reported explicitly (never fabricated).
 *
 * Usage: node scripts/perf_benchmark.js [sizes...]
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { runBacktest } = require("../dist_test_cjs/backtest_engine.js");
const { normaliseRisk } = require("../dist_test_cjs/risk.js");

const T0 = Date.parse("2026-01-05T09:15:00+05:30");
const STEP = 60 * 1000;
const inst = { symbol: "SBIN", exchange: "NSE", kind: "EQ", tradingsymbol: "SBIN-EQ", lotSize: 1, tick: 0.05 };
const cfg = normaliseRisk({ capital: 500000 });

function lcg(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function makeCandles(n) {
  const r = lcg(2024);
  const out = new Array(n);
  let p = 900;
  for (let i = 0; i < n; i++) {
    // regime-switching drift + noise so the decision layer is genuinely exercised
    const phase = Math.floor(i / 20000) % 3;
    p = Math.max(50, p + (phase === 0 ? 0.02 : phase === 1 ? -0.015 : 0) + (r() - 0.5) * 3);
    out[i] = { t: T0 + i * STEP, o: p, h: p + 1.2, l: p - 1.2, c: p + (r() - 0.5), v: 1000 };
  }
  return out;
}

const LEGACY_MAX = 8000; // beyond this the O(n^2) path is not run (documented, not faked)
const sizes = process.argv.slice(2).length
  ? process.argv.slice(2).map(Number)
  : [1000, 2000, 4000, 8000, 16000, 25000, 50000, 100000, 200000];

const rows = [];
for (const n of sizes) {
  const c = makeCandles(n);
  const row = { bars: n };

  if (n <= LEGACY_MAX) {
    const rss0 = process.memoryUsage().rss;
    const t0 = process.hrtime.bigint();
    const legacy = runBacktest(c, inst, cfg, "STANDARD_SHOONYA", { fastEval: false });
    row.legacyMs = Number(process.hrtime.bigint() - t0) / 1e6;
    row.legacyRssMb = Math.round((process.memoryUsage().rss - rss0) / (1024 * 1024));
    row.legacyTrades = legacy.totalTrades;
    row.legacyNet = legacy.netPnl;
  }

  // warm-up pass so V8/JIT state is comparable between the two paths
  const rss1 = process.memoryUsage().rss;
  const t1 = process.hrtime.bigint();
  const fast = runBacktest(c, inst, cfg, "STANDARD_SHOONYA", { fastEval: true });
  row.fastMs = Number(process.hrtime.bigint() - t1) / 1e6;
  row.fastRssMb = Math.round((process.memoryUsage().rss - rss1) / (1024 * 1024));
  row.fastTrades = fast.totalTrades;
  row.fastNet = fast.netPnl;
  row.usPerBar = Number(((row.fastMs * 1000) / n).toFixed(2));

  if (row.legacyMs) {
    row.speedup = Number((row.legacyMs / row.fastMs).toFixed(1));
    row.identical = row.legacyTrades === row.fastTrades && row.legacyNet === row.fastNet;
  }
  rows.push(row);
  console.error(
    `[bench] ${String(n).padStart(7)} bars | legacy ${row.legacyMs ? String(Math.round(row.legacyMs)).padStart(8) + " ms" : "   skipped"} | fast ${String(Math.round(row.fastMs)).padStart(7)} ms | ${row.usPerBar} us/bar${row.speedup ? ` | ${row.speedup}x | identical=${row.identical}` : ""}`,
  );
}

const ok = rows.every((r) => r.identical !== false);
const report = {
  generatedAt: new Date().toISOString(),
  environment: { node: process.version, platform: process.platform, arch: process.arch },
  legacyMaxBars: LEGACY_MAX,
  note: "Legacy path is O(n^2) and is not attempted above LEGACY_MAX; those rows are fast-only.",
  rows,
  allComparedRunsIdentical: ok,
};
fs.writeFileSync(path.join(__dirname, "perf_benchmark_output.json"), JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
process.exitCode = ok ? 0 : 1;
