# Performance Benchmarks — PERF-001 Resolution

**Status: PASS — PERF-001 FIXED, with exact-equivalence proof.**

## What was wrong

`runBacktest` decided every bar by calling `evaluateConsensus(candles.slice(0, i), cfg)`. That
re-creates the prefix array and recomputes ~10 indicator arrays (EMA, RSI, ATR, ADX, Bollinger,
VWAP, SuperTrend) over it, so a run cost **O(n²)** in time and allocation. Measured before the
fix: 8,000 bars took ≈2.7 s on the same host (3,144–3,568 ms across earlier runs) and a 200,000-bar
run did not finish inside a 600-second cap.

## Why the fix is exact, not approximate

Every indicator and voter is *causal*: `ema(closes,p)[i]` depends only on bars ≤ i, `vwap`
accumulates from bar 0, `bollinger` reads a 20-bar window ending at i, and RSI/ATR/ADX/
SuperTrend are recursions from the start. Therefore

```
last(indicator(candles.slice(0, i)))  ===  indicator(candles)[i]
```

bit-for-bit — same function, same inputs, same operations, same order. The fast path
(`src/lib/consensus_fast.ts`) computes each array **once** per run (O(n)) and reads index `i`
per bar. Two quirks are preserved deliberately rather than "cleaned up":

1. `orbVwapMomentum` sizes its opening-range window from `floor(prefixLen × 0.35)` clamped to
   10–20 — it depends on the **prefix length**, so the fast path passes the prefix length in.
2. `classifyRegime` returns **rounded** fields (2/4 dp) and the wave gate consumes those rounded
   values — the rounding is replicated, not the raw numbers.
3. The engine's decision prefix is `candles.slice(0, i)`, which **excludes the current bar**, so
   the fast path evaluates index `i-1`.

## Golden-master equivalence (§5C)

`scripts/perf_equivalence.js` compares the two paths on every bar, on four datasets that
exercise all regime branches (trend, choppy, volatile, regime-switching), comparing: every
regime field, the wave gate, all 7 voter votes/strengths/**detail strings**, the suppressed set,
buy/sell/voters/quorum/direction, the GBM triple, the qualifies flag, ATR, plugin votes and last
price — then trade-level: every trade field and the full summary.

```
VERDICT: EXACT_EQUIVALENCE_VERIFIED | divergences: 0
  trend:      1199 bars -> EXACT_MATCH
  choppy:     1199 bars -> EXACT_MATCH
  volatile:   1199 bars -> EXACT_MATCH
  switching:  1499 bars -> EXACT_MATCH
  trend_3000:     163 trades, net -1738.39 -> EXACT_MATCH
  volatile_2500:   10 trades, net  -469.70 -> EXACT_MATCH
  switching_1500:  31 trades, net   261.30 -> EXACT_MATCH
  determinism: EXACT_MATCH
```

Tolerance used: **exact equality (zero tolerance)**. No float tolerance was needed or applied,
so no trading difference can hide behind one.

## Benchmark ladder (`scripts/perf_benchmark.js`, Node v22.22.3)

| Bars | Legacy (ms) | Fast (ms) | Speedup | µs/bar (fast) | Trades | Net P&L | Identical |
|---|---|---|---|---|---|---|---|
| 1,000 | 104 | 13 | 7.9× | 13.10 | 6 | −1,975.70 | yes |
| 2,000 | 357 | 22 | 15.9× | 11.20 | 21 | −3,432.71 | yes |
| 4,000 | 933 | 26 | 35.7× | 6.53 | 23 | −4,016.46 | yes |
| 8,000 | 2,697 | 31 | 86.4× | 3.90 | 34 | −7,096.43 | yes |
| 16,000 | not run (O(n²)) | 67 | — | 4.19 | 56 | −12,788.46 | n/a |
| 25,000 | not run (O(n²)) | 108 | — | 4.30 | 71 | −16,337.41 | n/a |
| **32,000** | not run (O(n²)) | **143** | — | 4.48 | 76 | −16,902.06 | n/a |
| 50,000 | not run (O(n²)) | 202 | — | 4.04 | 123 | −26,988.13 | n/a |
| **64,000** | not run (O(n²)) | **269** | — | 4.20 | 153 | −34,021.99 | n/a |
| 100,000 | not run (O(n²)) | 410 | — | 4.10 | 227 | −48,195.40 | n/a |
| **200,000** | not run (O(n²)) | **879** | — | 4.40 | 395 | −82,192.86 | n/a |

All figures in this table are generated from `scripts/perf_benchmark_output.json` (no hand-typed
values). Wall-clock timings vary ≈±10% between runs on shared hardware; the µs/bar column is the
stable quantity. **Apex V2.0 ladder completed 1k → 200k including the previously missing 32k/64k rows**
(`node scripts/perf_benchmark.js 1000 2000 4000 8000 16000 25000 32000 50000 64000 100000 200000`,
11 rows, `allComparedRunsIdentical: true`).

Throughput is flat at ≈4.0–4.5 µs/bar from 16k → 200k bars: **linear scaling confirmed**. Run-to-run
variation of ±10% between sessions is expected on shared hardware; the µs/bar column, not the raw ms,
is the quantity that matters. The
legacy column is intentionally not attempted above 8,000 bars (it is O(n²)); those rows are
fast-only and labelled as such rather than fabricated.

Memory: RSS delta 2–17 MB across the ladder, no unbounded growth observed.

## Financial anchors are unchanged (the decisive check)

Anchor reproduction from the final source (`scripts/anchor_reproduction.js`):

```
VERDICT: ANCHORS_REPRODUCED_EXACTLY
  fixture 74 trades, net -7576.06, 0 cross-day, 1 EOD exit   (research: 72 / -7177.69)
  walk-forward 2 folds, 30 OOS trades, net -4023.54, chronology proof all true
  multiday 3 trades, net -602.96, charges 474.59
```

These are the exact numbers every earlier report quotes. Additionally the whole pre-existing
suite still passes unchanged (169 TS + 40 math + 388 Python), and the 9-tier capital matrix
reproduces −25 / −25 / −25 / 7.85 / 106.4 / 236.76 / 516.38 / 2,753.39 / 5,549.64 with identical
admissibility decisions.

## Limitations

* Speed is a property of the decision layer only; the surrounding trade accounting is unchanged.
* 200,000 bars is now practical (≈1 s), but the fixture-based research still lacks a large
  *representative* historical dataset — that remains the binding constraint on profitability
  evidence, not runtime.
* The fast path duplicates voter logic in one clearly-marked module. It is protected by the
  equivalence harness, which must be rerun whenever `strategies.ts`, `intelligence.ts` or
  `indicators.ts` change; a divergence fails the script (non-zero exit).
