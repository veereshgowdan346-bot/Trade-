/**
 * EXPERIMENTAL STRATEGY REGISTRY — isolation & integrity tests.
 *
 * These guard the invariance the audit brief demands: an experimental strategy can never
 * become active silently, can never be wired into the production quorum, and must declare
 * complete metadata.
 *
 * Usage: node scripts/experimental_registry_tests.js
 */
"use strict";
const fs = require("fs");
const path = require("path");
const {
  EXPERIMENTAL_REGISTRY,
  EXPERIMENTAL_IDS,
  getExperimental,
  runExperimental,
  validateRegistry,
} = require("../dist_test_cjs/experimental_strategies.js");

let pass = 0;
let fail = 0;
function t(name, fn) {
  try {
    fn();
    pass++;
    console.log(`  [PASS] ${name}`);
  } catch (e) {
    fail++;
    console.log(`  [FAIL] ${name}: ${e.message}`);
  }
}
const assert = (c, m) => { if (!c) throw new Error(m); };

console.log("=== EXPERIMENTAL STRATEGY REGISTRY TESTS ===");

t("registry validates", () => {
  const r = validateRegistry();
  assert(r.ok === true, "validateRegistry did not return ok");
  assert(r.count === 10, `expected 10 strategies, got ${r.count}`);
});

t("every strategy is disabled", () => {
  for (const s of EXPERIMENTAL_REGISTRY) assert(s.enabled === false, `${s.id} is enabled`);
});

t("ids are unique and non-empty", () => {
  assert(new Set(EXPERIMENTAL_IDS).size === EXPERIMENTAL_IDS.length, "duplicate ids");
  for (const id of EXPERIMENTAL_IDS) assert(typeof id === "string" && id.length > 3, "bad id");
});

t("validateRegistry throws if a strategy is enabled", () => {
  const bad = [{ ...EXPERIMENTAL_REGISTRY[0], enabled: true }];
  let threw = false;
  try { validateRegistry(bad); } catch { threw = true; }
  assert(threw, "enabling a strategy did not raise");
});

t("validateRegistry throws on duplicate ids", () => {
  const bad = [EXPERIMENTAL_REGISTRY[0], EXPERIMENTAL_REGISTRY[0]];
  let threw = false;
  try { validateRegistry(bad); } catch { threw = true; }
  assert(threw, "duplicate ids did not raise");
});

t("validateRegistry throws on missing metadata", () => {
  const bad = [{ ...EXPERIMENTAL_REGISTRY[0], description: "" }];
  let threw = false;
  try { validateRegistry(bad); } catch { threw = true; }
  assert(threw, "empty description did not raise");
});

t("every strategy declares regimes, entry/exit and limitations", () => {
  for (const s of EXPERIMENTAL_REGISTRY) {
    assert(Array.isArray(s.supportedRegimes) && s.supportedRegimes.length > 0, `${s.id} regimes`);
    assert(typeof s.entryConditions === "string" && s.entryConditions.length > 10, `${s.id} entry`);
    assert(typeof s.exitConditions === "string" && s.exitConditions.length > 5, `${s.id} exit`);
    assert(Array.isArray(s.limitations) && s.limitations.length > 0, `${s.id} limitations`);
    assert(s.configSchema && Object.keys(s.configSchema).length > 0, `${s.id} config schema`);
    assert(/^\d+\.\d+\.\d+$/.test(s.version), `${s.id} version format`);
  }
});

t("unknown strategy id is rejected", () => {
  let threw = false;
  try { getExperimental("x_does_not_exist"); } catch { threw = true; }
  assert(threw, "unknown id accepted");
});

t("runExperimental executes and reports enabled=false", () => {
  const T0 = Date.parse("2026-01-05T09:15:00+05:30");
  const candles = [];
  let p = 900;
  for (let i = 0; i < 300; i++) {
    p += Math.sin(i / 5) * 2;
    candles.push({ t: T0 + i * 60000, o: p, h: p + 1, l: p - 1, c: p, v: 1000 });
  }
  let ran = 0;
  for (const id of EXPERIMENTAL_IDS) {
    const out = runExperimental(id, candles);
    assert(out && typeof out === "object", `${id} returned nothing`);
    assert(out.enabled === false, `${id} reported enabled=true`);
    assert([-1, 0, 1].includes(out.signal), `${id} invalid signal ${out.signal}`);
    assert(Number.isFinite(out.confidence) && out.confidence >= 0 && out.confidence <= 100, `${id} bad confidence`);
    ran++;
  }
  assert(ran === 10, `ran ${ran} strategies`);
});

t("experimental module is NOT imported by the production decision path", () => {
  const forbidden = [
    path.join(__dirname, "..", "src", "lib", "strategies.ts"),
    path.join(__dirname, "..", "src", "lib", "engine.ts"),
    path.join(__dirname, "..", "src", "lib", "backtest_engine.ts"),
    path.join(__dirname, "..", "src", "lib", "risk.ts"),
  ];
  for (const f of forbidden) {
    const src = fs.readFileSync(f, "utf8");
    assert(!/experimental_strategies/.test(src), `${path.basename(f)} imports experimental_strategies`);
  }
});

t("production quorum voters are unchanged (7 core voters present)", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "src", "lib", "strategies.ts"), "utf8");
  for (const id of ["smc_liquidity_grab", "institutional_vwap", "dual_ema_9_21", "supertrend_10_3", "orb_vwap_momentum", "bb_mean_reversion", "rsi_mean_reversion"]) {
    assert(src.includes(`id: "${id}"`), `missing core voter ${id}`);
  }
});

console.log(`\n=== REGISTRY RESULTS: ${pass} PASSED / ${fail} FAILED ===`);
process.exitCode = fail === 0 ? 0 : 1;
