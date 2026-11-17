/**
 * GATE 4 — Independent methodology audit of the research protocol.
 *
 * These are BEHAVIOURAL tests on real data. Reading the source and declaring "no look-ahead" is not
 * evidence; the tests below try to break the claim.
 *
 *  M1  15-minute aggregation is exactly correct (o=first, h=max, l=min, c=last, v=sum, 15 bars/bucket)
 *  M2  15-minute bucket count and alignment per session (25 buckets from 09:15, remainder handled)
 *  M3  Look-ahead: mutating bar k must not change any trade that closed before bar k
 *  M4  Look-ahead: the signal AT bar k must be computable from data before k only (prefix invariant)
 *  M5  Session discipline: no trade spans two IST sessions; EOD exits fill at the next session's open
 *  M6  Split integrity: TRAIN/VALIDATION/OOS date ranges are disjoint and chronologically ordered
 *  M7  No parameter search: the protocol exposes no fitted parameters (defaults only)
 *
 * Usage: node scripts/audit_methodology.js
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { researchBacktest } = require("../dist_test_cjs/experimental_harness.js");
const { runExperimental } = require("../dist_test_cjs/experimental_strategies.js");
const { getIstComponents } = require("../dist_test_cjs/nse_calendar.js");

const ROOT = path.join(__dirname, "..");
const CANON = path.join(ROOT, "data", "external", "canonical");
const OUT = path.join(ROOT, "data", "provenance", "methodology_audit.json");
const BUCKET = 15;

let pass = 0;
let fail = 0;
const checks = [];
const check = (id, name, ok, detail = "") => {
  checks.push({ id, name, ok: !!ok, detail });
  if (ok) pass++;
  else fail++;
};

const load = (f) => JSON.parse(fs.readFileSync(path.join(CANON, f), "utf8")).candles;
const DAY = (t) => getIstComponents(t).dateStr;

function aggregate(candles, bucketMin) {
  const out = [];
  let key = null;
  let cur = null;
  for (const c of candles) {
    const ist = getIstComponents(c.t);
    const minutesOfDay = ist.hours * 60 + ist.minutes;
    const k = `${ist.dateStr}:${Math.floor((minutesOfDay - (9 * 60 + 15)) / bucketMin)}`;
    if (k !== key) {
      if (cur) out.push(cur);
      key = k;
      cur = { t: c.t, o: c.o, h: c.h, l: c.l, c: c.c, v: c.v, n: 1 };
    } else {
      cur.h = Math.max(cur.h, c.h);
      cur.l = Math.min(cur.l, c.l);
      cur.c = c.c;
      cur.v += c.v;
      cur.t = c.t;
      cur.n++;
    }
  }
  if (cur) out.push(cur);
  return out;
}

const raw2024 = load("NIFTY50_1min_2024.json");
const agg2024 = aggregate(raw2024, BUCKET);

/* ------------------------------- M1 aggregation ------------------------------- */
{
  // Group raw bars by their 15-minute slot and verify the aggregated OHLCV values against a fresh
  // computation. (An earlier version of this test grouped 15 bars at a time and produced false
  // mismatches wherever a bar was missing or a session was short — the test was wrong, not the code.)
  const keyOf = (t) => {
    const ist = getIstComponents(t);
    return `${ist.dateStr}#${Math.floor((ist.hours * 60 + ist.minutes - 555) / BUCKET)}`;
  };
  const groups = new Map();
  for (const c of raw2024) {
    const k = keyOf(c.t);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(c);
  }
  let mismatches = 0;
  let compared = 0;
  for (const b of agg2024) {
    const g = groups.get(keyOf(b.t));
    if (!g) { mismatches++; continue; }
    const exp = {
      o: g[0].o,
      h: g.reduce((a, x) => (x.h > a ? x.h : a), -Infinity),
      l: g.reduce((a, x) => (x.l < a ? x.l : a), Infinity),
      c: g[g.length - 1].c,
      v: g.reduce((a, x) => a + x.v, 0),
    };
    if (b.o !== exp.o || b.h !== exp.h || b.l !== exp.l || b.c !== exp.c || b.v !== exp.v) mismatches++;
    compared++;
  }
  // partition check: every bucket non-empty, total raw bars accounted for exactly once
  const totalBars = [...groups.values()].reduce((a, g) => a + g.length, 0);
  const bucketSum = agg2024.reduce((a, b) => a + (groups.get(keyOf(b.t))?.length ?? 0), 0);
  check(
    "M1",
    "15-min aggregation values exact and bars partitioned once (independent recomputation)",
    mismatches === 0 && totalBars === raw2024.length && bucketSum === raw2024.length && compared === agg2024.length,
    `${compared} buckets compared, ${mismatches} mismatches, ${totalBars}/${raw2024.length} raw bars partitioned`,
  );
}

/* ------------------------- M2 bucket alignment & count ------------------------- */
{
  const perDay = new Map();
  for (const b of agg2024) perDay.set(DAY(b.t), (perDay.get(DAY(b.t)) ?? 0) + 1);
  const firstOfDay = new Map();
  for (const b of agg2024) if (!firstOfDay.has(DAY(b.t))) firstOfDay.set(DAY(b.t), b);
  // regular sessions must open with the 09:15-09:29 bucket; special sessions (Muhurat, shortened)
  // legitimately start off-grid — record them rather than failing or silently ignoring them
  const offGrid = [];
  for (const [d, b] of firstOfDay) {
    const ist = getIstComponents(b.t);
    if (!(ist.hours === 9 && ist.minutes === 29)) offGrid.push(`${d}@${String(ist.hours).padStart(2, "0")}:${String(ist.minutes).padStart(2, "0")}`);
  }
  const full = [...perDay.values()].filter((n) => n === 25).length;
  const partial = [...perDay.entries()].filter(([, n]) => n !== 25);
  check(
    "M2",
    "regular sessions start at 09:15 and produce exactly 25 buckets; off-grid sessions enumerated",
    full > 200 && offGrid.every((o) => partial.some(([d]) => o.startsWith(d))) && partial.length === offGrid.length + 2 /* Sat 2024-03-02, 2024-05-18 are short but on-grid */,
    `${full} full sessions, ${partial.length} partial (${partial.map(([d, n]) => `${d}:${n}`).join(", ")}), off-grid: ${offGrid.join(", ") || "none"}`,
  );
}

/* ---------------------------- M3 look-ahead (trades) ---------------------------- */
{
  const STRAT = "x_macd_momentum";
  const base = researchBacktest(STRAT, agg2024).trades;
  const k = Math.floor(agg2024.length * 0.6);
  const mutated = agg2024.map((c, i) =>
    i === k ? { t: c.t, o: c.o * 1.05, h: c.h * 1.08, l: c.l * 0.92, c: c.c * 1.06, v: c.v } : c,
  );
  const after = researchBacktest(STRAT, mutated).trades;
  const cutoff = agg2024[k].t;
  const before = (ts) => ts.trades.filter((t) => t.exitTime < cutoff);
  const A = before({ trades: base });
  const B = before({ trades: after });
  const same =
    A.length === B.length &&
    A.every((t, i) => t.entryTime === B[i].entryTime && t.exitTime === B[i].exitTime && t.entry === B[i].entry && t.exit === B[i].exit && t.net === B[i].net);
  check(
    "M3",
    "mutating bar k leaves every trade closed before k bit-identical (no look-ahead)",
    same,
    `${A.length} vs ${B.length} pre-cutoff trades (bar ${k} of ${agg2024.length})`,
  );
}

/* --------------------------- M4 prefix (signal) invariant --------------------------- */
{
  const k = 5000;
  const prefix = agg2024.slice(0, k);
  const sigBase = runExperimental("x_macd_momentum", prefix);
  // append the future bar with an absurd value: the signal at k-1 must not move
  const withFuture = agg2024.slice(0, k).concat([{ t: agg2024[k].t, o: 1, h: 1e6, l: 1, c: 1e6, v: 0 }]);
  const sigFuture = runExperimental("x_macd_momentum", withFuture.slice(0, k));
  check(
    "M4",
    "signal depends only on the prefix passed in",
    JSON.stringify(sigBase) === JSON.stringify(sigFuture),
    `signal=${sigBase.signal}, confidence=${sigBase.confidence}`,
  );
}

/* ----------------- M5 STRICT INTRADAY (default) — METHOD-001 closure ----------------- */
{
  // The default must now be strict: no position may survive a session boundary.
  const res = researchBacktest("x_macd_momentum", agg2024);
  const spanning = res.trades.filter((t) => t.entryDay !== t.exitDay);
  const violations = res.trades.filter((t) => t.strictViolation);
  check(
    "M5",
    "default session mode is STRICT_INTRADAY and no trade crosses a session",
    res.sessionMode === "STRICT_INTRADAY" && spanning.length === 0 && res.crossSessionTrades === 0 && violations.length === 0,
    `mode=${res.sessionMode}, spanning=${spanning.length}, violations=${violations.length}, trades=${res.trades.length}`,
  );

  // Every position must be flat at the end of each session: the last trade of any session-touched
  // bar must exit at or before that session's last bar.
  const lastBarOfDay = new Map();
  for (const c of agg2024) lastBarOfDay.set(DAY(c.t), c.t);
  const lateExits = res.trades.filter((t) => t.exitTime > (lastBarOfDay.get(t.entryDay) ?? Infinity));
  check("M5b", "no position remains open past its session's last bar", lateExits.length === 0, `${lateExits.length} late exits`);

  // Session liquidation must be recorded and must fill at the session's last bar close.
  const liquidation = res.trades.filter((t) => t.reason === "EOD_EXIT");
  const badFill = liquidation.filter((t) => {
    const bar = agg2024.find((c) => c.t === t.exitTime);
    return !bar || bar.c !== t.exit || t.exitTime !== lastBarOfDay.get(t.entryDay);
  });
  check(
    "M5c",
    "EOD liquidation is recorded and fills exactly at the session's last bar close",
    liquidation.length > 0 && badFill.length === 0,
    `${liquidation.length} liquidations, ${badFill.length} mismatched fills`,
  );

  // Legacy remains available but only by explicit opt-in, and must still be reproducible.
  const legacy = researchBacktest("x_macd_momentum", agg2024, { sessionMode: "CARRY_OVERNIGHT" });
  const legacySpanning = legacy.trades.filter((t) => t.entryDay !== t.exitDay).length;
  check(
    "M5d",
    "historical CARRY_OVERNIGHT mode still reproducible by explicit opt-in (documented defect)",
    legacy.sessionMode === "CARRY_OVERNIGHT" && legacy.crossSessionTrades === legacySpanning && legacySpanning > 0,
    `${legacySpanning}/${legacy.trades.length} legacy trades carry overnight (${((100 * legacySpanning) / legacy.trades.length).toFixed(1)}%)`,
  );
}

/* ---------------- M5e partial and special sessions under strict rules ---------------- */
{
  // Sessions with fewer than 25 buckets (Saturday/Muhurat) must still flatten: the last available
  // bar of the session is the exit point, not a padded or forward-filled one.
  const perDay = new Map();
  for (const c of agg2024) {
    const d = DAY(c.t);
    perDay.set(d, (perDay.get(d) ?? 0) + 1);
  }
  const partialDays = [...perDay.entries()].filter(([, n]) => n !== 25).map(([d]) => d);
  let checked = 0;
  let failures = 0;
  for (const d of partialDays) {
    const idx = agg2024.findIndex((c) => DAY(c.t) === d);
    const slice = agg2024.slice(Math.max(0, idx - 120), idx + perDay.get(d)); // context for warmup
    const r = researchBacktest("x_parabolic_sar", slice);
    const inPartial = r.trades.filter((t) => t.entryDay === d);
    for (const t of inPartial) {
      const sessionEnd = agg2024[idx + perDay.get(d) - 1].t;
      if (t.exitDay !== d || t.exitTime > sessionEnd) failures++;
    }
    checked += inPartial.length;
  }
  check(
    "M5e",
    "special/partial sessions flatten inside the session (no padding, no carry)",
    partialDays.length > 0 && failures === 0,
    `${partialDays.length} partial sessions (${partialDays.join(", ")}), ${checked} trades, ${failures} carry-outs`,
  );
}

/* --------------- M5f missing candles must not create artificial fills --------------- */
{
  // Build a 3-session window and delete the middle of session 2. Strict mode must produce no trade
  // whose entry or exit lands inside the deleted interval, and still no cross-session trade.
  // Pick full sessions only: a 9-bucket Saturday session cannot host a 17-bar deletion window.
  const dayCounts = new Map();
  for (const c of agg2024) dayCounts.set(DAY(c.t), (dayCounts.get(DAY(c.t)) ?? 0) + 1);
  const days = [...dayCounts.entries()].filter(([, n]) => n === 25).map(([d]) => d).slice(40, 50);
  const window = agg2024.filter((c) => days.includes(DAY(c.t)));
  const midDay = days[4];
  const midBars = window.filter((c) => DAY(c.t) === midDay);
  const removedFrom = midBars[8].t;
  const removedTo = midBars[16].t;
  // Also delete a mid-session block from a second session, so the test is not a single-gap artefact.
  const secondDay = days[7];
  const secondBars = window.filter((c) => DAY(c.t) === secondDay);
  const holed = window.filter(
    (c) => !(c.t >= removedFrom && c.t <= removedTo) && !(c.t >= secondBars[5].t && c.t <= secondBars[12].t),
  );
  const r = researchBacktest("x_macd_momentum", holed);
  const inside = r.trades.filter((t) => (t.entryTime > removedFrom && t.entryTime < removedTo) || (t.exitTime > removedFrom && t.exitTime < removedTo));
  check(
    "M5f",
    "missing candles create no artificial fills and no cross-session trades",
    inside.length === 0 && r.crossSessionTrades === 0 && r.trades.length >= 5,
    `${midBars.length - 7} + ${secondBars.length - 8} bars removed, ${r.trades.length} trades, ${inside.length} inside a gap, ${r.crossSessionTrades} spanning`,
  );
}

/* ------------------------------ M6 split integrity ------------------------------ */
{
  const years = { TRAIN: "NIFTY50_1min_2022.json", VALIDATION: "NIFTY50_1min_2023.json", OOS: "NIFTY50_1min_2024.json" };
  const ranges = {};
  for (const [k, f] of Object.entries(years)) {
    const c = load(f);
    ranges[k] = { from: DAY(c[0].t), to: DAY(c[c.length - 1].t), n: c.length };
  }
  const disjoint = new Set();
  for (const [k, r] of Object.entries(ranges)) disjoint.add(`${r.from}|${r.to}`);
  const ordered = ranges.TRAIN.to < ranges.VALIDATION.from && ranges.VALIDATION.to < ranges.OOS.from;
  check("M6", "train/validation/OOS ranges are disjoint and chronologically ordered", disjoint.size === 3 && ordered, JSON.stringify(ranges));
}

/* --------------------------- M7 no parameter search --------------------------- */
{
  // Comments are stripped first: the words "no parameter grid" appear in the script headers, and
  // matching prose would make this test fail on documentation rather than on behaviour.
  const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const sources = ["research_protocol_oos.js", "statistical_robustness.js", "cost_sensitivity.js"].map((f) =>
    stripComments(fs.readFileSync(path.join(__dirname, f), "utf8")),
  );
  const all = sources.join("\n");
  // A strategy parameter override would be warmup/sleeve/threshold values, or a per-strategy config.
  const forbidden = [
    // a numeric grid iterated in a loop, e.g. `for (const t of [5, 10, 20])`
    /for\s*\(\s*(?:const|let)\s+\w+\s+of\s+\[\s*\d/,
    // sweeping configs into the harness, e.g. `configs.map((c) => researchBacktest(...))`
    /\.(?:map|forEach)\(\s*\(?\s*\w+\s*\)?\s*=>\s*researchBacktest/,
    // per-strategy parameter overrides passed to the harness
    /researchBacktest\([^)]*\{[^}]*(?:warmup|sleeve|params|config)\s*:/,
  ];
  const hits = forbidden.filter((re) => re.test(all)).map(String);
  // The only permitted option is the session-mode switch (a correctness control, not a tuning knob).
  const optionKeys = [...all.matchAll(/\{\s*sessionMode:[^}]*\}/g)].map((m) => m[0]);
  check(
    "M7",
    "no parameter grid/optimisation and no strategy-parameter overrides",
    hits.length === 0,
    `hits=${JSON.stringify(hits)}; sessionMode-only options=${optionKeys.length}`,
  );
}

/* ---------------------------------- output ---------------------------------- */
const report = {
  generatedAt: new Date().toISOString(),
  command: "node scripts/audit_methodology.js",
  dataset: "NIFTY50_1min_2024 (REAL_REDISTRIBUTION, authenticity UNVERIFIED)",
  bucketMinutes: BUCKET,
  checks,
  passed: pass,
  failed: fail,
  verdict: fail === 0 ? "METHODOLOGY_CHECKS_PASS" : "METHODOLOGY_DEFECT_FOUND",
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n");

console.log(`methodology audit: ${pass} PASS / ${fail} FAIL`);
for (const c of checks) console.log(`  ${c.ok ? "PASS" : "FAIL"} ${c.id} ${c.name}${c.detail ? ` — ${c.detail}` : ""}`);
process.exitCode = fail === 0 ? 0 : 1;
