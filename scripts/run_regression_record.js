#!/usr/bin/env node
/**
 * Records the actual exit code and a one-line summary for every regression gate.
 *
 * Why a recorder instead of hand-written numbers: the consolidated report must be traceable to executed
 * commands. Typing "389 passed" into a document is exactly the kind of remembered figure this repository
 * has been burned by. This script runs each gate, keeps the real exit code, and writes a JSON artifact
 * that the report generator reads.
 *
 * Gates that are EXPECTED to fail are declared as such (expectedExit) and are still recorded honestly.
 */
const { execSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "data", "security", "regression_run.json");

const GATES = [
  { name: "TypeScript typecheck", cmd: "npx tsc --noEmit", group: "static", expectedExit: 0 },
  { name: "Lint (eslint, zero warnings)", cmd: "npx eslint . --max-warnings=0", group: "static", expectedExit: 0 },
  { name: "Production build", cmd: "npm run build", group: "static", expectedExit: 0 },
  { name: "Python test suite", cmd: "python3 -m pytest -q", group: "tests", expectedExit: 0 },
  { name: "JavaScript suite (test:all)", cmd: "npm run test:all", group: "tests", expectedExit: 0 },
  { name: "Security probes (test:safety)", cmd: "npm run test:safety", group: "security", expectedExit: 0 },
  { name: "Secret scanner (test:secrets)", cmd: "npm run test:secrets", group: "security", expectedExit: 0 },
  {
    name: "History scanner (test:history)",
    cmd: "npm run test:history",
    group: "security",
    expectedExit: 1,
    expectedNote: "exits 1 BY DESIGN while known exposure exists in public history",
  },
  { name: "Instrument compatibility", cmd: "npm run test:instrument", group: "data", expectedExit: 0 },
  { name: "External dataset audit", cmd: "npm run test:external", group: "data", expectedExit: 0 },
  { name: "Calendar cross-check", cmd: "npm run test:calendar", group: "data", expectedExit: 0 },
  { name: "Official rate registry audit", cmd: "npm run test:rate", group: "data", expectedExit: 0 },
  { name: "Methodology audit", cmd: "npm run test:methodology", group: "research", expectedExit: 0 },
  { name: "Research protocol (legacy carry)", cmd: "npm run test:protocol", group: "research", expectedExit: 0 },
  { name: "Research protocol (strict intraday)", cmd: "npm run test:protocol:strict", group: "research", expectedExit: 0 },
  { name: "Statistical robustness", cmd: "npm run test:stats", group: "research", expectedExit: 0 },
  { name: "Cost sensitivity", cmd: "npm run test:cost", group: "research", expectedExit: 0 },
  { name: "Bundle-audit negative tests", cmd: "node scripts/test_bundle_audit.js", group: "security", expectedExit: 0 },
  { name: "Environment configuration probe", cmd: "node scripts/env_config_probe.js", group: "security", expectedExit: 0 },
  { name: "Adversarial API probe", cmd: "node scripts/adversarial_api_probe.js", group: "security", expectedExit: 0 },
  {
    name: "Mutation detection (security suite can fail)",
    cmd: "node scripts/mutation_check.js",
    group: "security",
    expectedExit: 0,
    expectedNote: "each reintroduced vulnerability must be detected by the adversarial probe",
  },
  { name: "Readiness probes", cmd: "node scripts/final_readiness_probes.js", group: "security", expectedExit: 0 },
];

function summarise(output) {
  const lines = output.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const interesting = [
    /passed/i, /PASS \/ /i, /PASSED \/ /i, /pass \/ /i, /fail /i, /blocking findings/i,
    /findings:/i, /verdict/i, /EXACT_EQUIVALENCE/i, /ANCHORS_/i, /PASS$/i,
  ];
  const picked = lines.filter((l) => interesting.some((re) => re.test(l))).slice(-3);
  return (picked.length ? picked : lines.slice(-1)).join(" | ").slice(0, 260);
}

const results = [];
for (const g of GATES) {
  const started = Date.now();
  let exit = 0;
  let output = "";
  try {
    output = execSync(g.cmd, {
      cwd: ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, QT_QPA_PLATFORM: "offscreen" },
    });
  } catch (err) {
    exit = typeof err.status === "number" ? err.status : 1;
    output = `${err.stdout ?? ""}\n${err.stderr ?? ""}`;
  }
  const entry = {
    name: g.name,
    command: g.cmd,
    group: g.group,
    exitCode: exit,
    expectedExit: g.expectedExit,
    asExpected: exit === g.expectedExit,
    durationMs: Date.now() - started,
    summary: summarise(output),
  };
  if (g.expectedNote) entry.note = g.expectedNote;
  results.push(entry);
  const flag = entry.asExpected ? "ok " : "BAD";
  console.log(`${flag} ${String(exit).padStart(2)}  ${g.name}  (${(entry.durationMs / 1000).toFixed(1)}s)`);
}

const unexpected = results.filter((r) => !r.asExpected);
const doc = {
  generatedAt: new Date().toISOString(),
  command: "node scripts/run_regression_record.js",
  environment: {
    node: process.version,
    python: execSync("python3 --version", { encoding: "utf8" }).trim(),
    platform: process.platform,
    qtOffscreen: true,
  },
  gates: results,
  counts: {
    total: results.length,
    asExpected: results.length - unexpected.length,
    unexpected: unexpected.length,
  },
  unexpectedGates: unexpected.map((r) => ({ name: r.name, exitCode: r.exitCode, expectedExit: r.expectedExit })),
  verdict: unexpected.length === 0 ? "ALL_GATES_AS_EXPECTED" : "GATE_REGRESSION",
};
fs.writeFileSync(OUT, JSON.stringify(doc, null, 2) + "\n");
console.log(`\n${doc.counts.asExpected}/${doc.counts.total} gates as expected -> ${doc.verdict}`);
process.exit(unexpected.length === 0 ? 0 : 1);
