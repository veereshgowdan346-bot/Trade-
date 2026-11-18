#!/usr/bin/env node
/**
 * Mutation check: prove the adversarial suite can actually fail.
 *
 * For each known security regression, this rebuilds the compiled guard with that specific vulnerability
 * reintroduced, then runs the adversarial probe against the mutant. The probe MUST report failures;
 * a mutant that passes means the suite has a coverage gap (exactly how TEST-001 was found).
 *
 * Mutants are written to the OS temp directory and never into the repository.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "dist_test_cjs", "apiGuard.js");
const PROBE = path.join(ROOT, "scripts", "adversarial_api_probe.js");
const ENV_PROBE = path.join(ROOT, "scripts", "env_config_probe.js");
/* Both boundaries are exercised: the adversarial header matrix and the environment-configuration probe.
   A mutant may only be visible to one of them (SEC-012 is an env-configuration defect). */
const PROBES = [PROBE, ENV_PROBE];

const source = fs.readFileSync(SRC, "utf8");

const MUTANTS = [
  {
    id: "SEC-010",
    description: "empty X-Forwarded-For treated as an absent header",
    find: `    const hasForwardingHeader = (rawFwd !== null && rawFwd !== undefined) || (rawReal !== null && rawReal !== undefined);
    if (!hasForwardingHeader)
        return true;`,
    replace: `    const chainA = String(rawFwd ?? "").split(",").map((x) => x.trim()).filter(Boolean);
    const realA = String(rawReal ?? "").trim();
    if (!chainA.length && !realA)
        return true; // MUTANT`,
  },
  {
    id: "SEC-007",
    description: "first (client-supplied) proxy hop trusted as locality",
    find: `    const nearest = chain.length ? chain[chain.length - 1] : String(rawReal ?? "").trim();`,
    replace: `    const nearest = chain.length ? chain[0] : String(rawReal ?? "").trim(); // MUTANT`,
  },
  {
    id: "SEC-008",
    description: "forged same-origin header accepted as authorisation",
    find: `    if (isTrustedLocalClient(req))
        return null;
    return unauthorized("Mutating endpoint requires authentication from a remote client. "`,
    replace: `    if (isTrustedLocalClient(req) || originMatchesHost(req))
        return null; // MUTANT
    return unauthorized("Mutating endpoint requires authentication from a remote client. "`,
  },
  {
    id: "SEC-011",
    description: "local trust inferred without the operator assertion",
    find: `    if (!localTrustAsserted()) {`,
    replace: `    if (false) { // MUTANT: assertion ignored`,
  },
  {
    id: "SEC-012",
    description: "short token silently ignored instead of failing closed",
    find: `const MIN_TOKEN_LENGTH = 8;`,
    replace: `const MIN_TOKEN_LENGTH = 1; // MUTANT: short token accepted as usable`,
  },
];

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "omni-mutants-"));
const results = [];

for (const m of MUTANTS) {
  const dir = path.join(tmpRoot, m.id);
  fs.mkdirSync(dir, { recursive: true });
  if (!source.includes(m.find)) {
    results.push({ ...m, detected: false, passed: null, failed: null, note: "MUTATION NOT APPLICABLE — production text changed" });
    continue;
  }
  const mutated = source.replace(m.find, m.replace);
  const file = path.join(dir, "apiGuard.js");
  fs.writeFileSync(file, mutated);

  let output = "";
  let exit = 0;
  let failedTotal = 0;
  let passedTotal = 0;
  let sawSummary = false;
  for (const probe of PROBES) {
    const args = probe === PROBE ? [probe, "--module=" + file] : [probe, "--module=" + file];
    let out = "";
    let code = 0;
    try {
      out = execFileSync(process.execPath, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    } catch (err) {
      code = typeof err.status === "number" ? err.status : 1;
      out = `${err.stdout ?? ""}${err.stderr ?? ""}`;
    }
    output += out;
    exit = Math.max(exit, code);
    // The adversarial probe prints "N passed, M failed"; the env probe prints the same shape.
    const summary = /(\d+) passed, (\d+) failed/.exec(out);
    if (summary) { sawSummary = true; passedTotal += Number(summary[1]); failedTotal += Number(summary[2]); }
  }
  const failed = sawSummary ? failedTotal : null;
  results.push({ ...m, detected: exit !== 0 && failedTotal > 0, passed: sawSummary ? passedTotal : null, failed });
}

// The production build must pass everything.
let prodExit = 0;
let prodOutput = "";
for (const probe of PROBES) {
  try {
    prodOutput += execFileSync(process.execPath, [probe], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  } catch (err) {
    prodExit = Math.max(prodExit, typeof err.status === "number" ? err.status : 1);
    prodOutput += `${err.stdout ?? ""}${err.stderr ?? ""}`;
  }
}
const prodMatches = [...prodOutput.matchAll(/(\d+) passed, (\d+) failed/g)];
const prodSummary = prodMatches.length
  ? [null, String(prodMatches.reduce((a, m) => a + Number(m[1]), 0)), String(prodMatches.reduce((a, m) => a + Number(m[2]), 0))]
  : null;

for (const r of results) {
  const flag = r.detected ? "detected" : "MISSED  ";
  console.log(`  ${flag}  ${r.id}  (${r.description})  ${r.failed ?? "?"} failing case(s)`);
}
console.log(`  production build: ${prodSummary ? prodSummary[1] + " passed, " + prodSummary[2] + " failed" : "no summary"}`);

const missed = results.filter((r) => !r.detected);
const prodOk = prodExit === 0;
fs.mkdirSync(path.join(ROOT, "data", "security"), { recursive: true });
fs.writeFileSync(
  path.join(ROOT, "data", "security", "mutation_check.json"),
  JSON.stringify({
    generatedAt: new Date().toISOString(),
    command: "node scripts/mutation_check.js",
    note: "Each mutant reintroduces one known vulnerability; the adversarial probe must detect it.",
    mutants: results.map((r) => ({ id: r.id, description: r.description, detected: r.detected, failedCases: r.failed })),
    production: { exitCode: prodExit, passed: prodSummary ? Number(prodSummary[1]) : null, failed: prodSummary ? Number(prodSummary[2]) : null },
    verdict: missed.length === 0 && prodOk ? "ALL_MUTANTS_DETECTED" : "COVERAGE_GAP",
  }, null, 2) + "\n",
);

fs.rmSync(tmpRoot, { recursive: true, force: true });
console.log(`\n${results.length - missed.length}/${results.length} mutants detected; production ${prodOk ? "clean" : "FAILED"} -> ${missed.length === 0 && prodOk ? "ALL_MUTANTS_DETECTED" : "COVERAGE_GAP"}`);
process.exit(missed.length === 0 && prodOk ? 0 : 1);
