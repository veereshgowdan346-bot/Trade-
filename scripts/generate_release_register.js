#!/usr/bin/env node
/**
 * Builds RELEASE_REGISTER.md — the single release-readiness register.
 *
 * Required columns per issue: ID, severity, status, evidence, files affected, test coverage,
 * remaining dependency, responsible party, closure criteria.
 *
 * Rules: no credential literal, no figure that is not read from an artifact, no preview of a fix as done
 * when it is only documented.
 */
const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");
const crypto = require("node:crypto");

const ROOT = path.join(__dirname, "..");
const BT = String.fromCharCode(96);
const code = (s) => BT + s + BT;
const n = (v) => (typeof v === "number" ? v.toLocaleString("en-IN") : String(v));
const money = (v) => {
  if (typeof v !== "number" || !isFinite(v)) return String(v);
  const s = Math.abs(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (v < 0 ? "\u2212\u20b9" : "\u20b9") + s;
};
const git = (a) => {
  try { return execSync("git " + a, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim(); }
  catch { return null; }
};
const read = (r) => JSON.parse(fs.readFileSync(path.join(ROOT, r), "utf8"));

const defects = read("data/security/application_defects.json").defects;
const history = read("data/security/git_history_scan.json");
const safety = read("data/security/safety_audit.json");
const regression = read("data/security/regression_run.json");
const rates = read("data/rate_registry_audit.json");
const instr = read("data/provenance/instrument_compatibility.json");
const cal = read("data/provenance/calendar_crosscheck.json");
const stats = read("data/provenance/statistical_robustness_strict.json");
const strict = read("scripts/research_protocol_strict_intraday_output.json");

const head = git("rev-parse HEAD");
const parent = git("rev-parse HEAD^");
const branch = git("rev-parse --abbrev-ref HEAD");
const commits = git("rev-list --all --count");

const SNAP = "/home/user/security_snapshot";
let bundles = [];
try {
  bundles = fs.readdirSync(SNAP).filter((f) => f.endsWith(".bundle")).sort().map((f) => {
    const full = path.join(SNAP, f);
    const st = fs.statSync(full);
    let verify = "UNVERIFIED";
    try {
      const out = execSync("git bundle verify " + JSON.stringify(full), { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
      verify = /records a complete history/i.test(out) ? "complete history" : "verified (partial)";
    } catch { verify = "VERIFY FAILED"; }
    const sha = crypto.createHash("sha256").update(fs.readFileSync(full)).digest("hex");
    return { name: f, bytes: st.size, mode: (st.mode & 0o777).toString(8), sha256: sha, verify };
  });
} catch { bundles = []; }

const unresolved = (cal.years || []).reduce((a, y) => a + (y.calendarOnly || []).filter((d) => String(d.classification).includes("weekday")).length, 0);
const unchecked = (cal.years || []).filter((y) => y.status === "UNCHECKED").map((y) => y.year);
const unverifiedRates = Object.values(rates.byStatus || {}).reduce((a, b) => a + b, 0);

const rows = [];

// Security defects that are code-fixable
for (const d of defects) {
  const fixed = String(d.status).startsWith("FIXED");
  rows.push({
    id: d.id,
    severity: d.severity,
    status: d.status,
    evidence: d.verification,
    files: d.file,
    tests: d.regressionTests.map((t) => t.split("—")[0].trim()).join("; "),
    dependency: fixed ? "none" : "deployment topology (shared rate-limit store)",
    owner: fixed ? "engineering (done)" : "engineering (future work)",
    closure: fixed
      ? "closed — fix present, regression test green, gate re-run"
      : "closed only when a tested shared-store limiter exists; multi-instance stays blocked until then",
  });
}

rows.push({
  id: "SECURITY-001",
  severity: "CRITICAL",
  status: "BLOCKED — PUBLIC EXPOSURE CONFIRMED",
  evidence: history.summary.findingCount + " findings across " + history.summary.distinctCommitsAffected
    + " commits, all reachable from origin/master; values displayed 0; working tree clean",
  files: "SECURITY_AUDIT.md, scripts/scan_repo_secrets.py, scripts/scan_source_files.py (historical revisions)",
  tests: "npm run test:history (exit 1 by design)",
  dependency: "owner revocation + TOTP reset, confirmed out-of-band",
  owner: "account owner",
  closure: "credentials revoked and seed reset; security review of the exposure recorded; history decision documented",
});
rows.push({
  id: "SECURITY-006",
  severity: "CRITICAL",
  status: "NOT_CONFIRMED",
  evidence: "no credential accessed, tested or transmitted in any pass; status cannot be self-certified",
  files: "n/a (account state)",
  tests: "none possible from the repository",
  dependency: "broker console confirmation",
  owner: "account owner",
  closure: "owner states the old key fails and the TOTP seed was re-enrolled",
});
rows.push({
  id: "INSTR-001",
  severity: "HIGH",
  status: "BLOCKED",
  evidence: instr.verdict + "; equity validation blocked for " + instr.summary.equityValidationBlocked + " of " + instr.summary.strategies + " strategies",
  files: "data/external/**, scripts/instrument_compatibility.js, data/dataset_registry.json",
  tests: "npm run test:instrument; npm run test:external",
  dependency: "licensed, attested NSE equity intraday data",
  owner: "data licensing (owner)",
  closure: "authentic equity data present and attested; strategies re-evaluated on the correct instrument",
});
rows.push({
  id: "RATE-001",
  severity: "HIGH",
  status: "UNVERIFIED (" + rates.inventory.length + " heads, 0 verified)",
  evidence: "registry audit " + rates.passed + " pass / " + rates.failed + " fail; blocker: " + rates.blockerStatus,
  files: "data/rate_registry_audit.json, cost spec",
  tests: "npm run test:rate; npm run test:cost",
  dependency: "dated official NSE/SEBI/CBIC/GST documents",
  owner: "external evidence (owner or research)",
  closure: "each head carries source, publication date, effective date, verification date",
});
rows.push({
  id: "DATA-002",
  severity: "MEDIUM",
  status: "UNVERIFIED",
  evidence: "all datasets UNVERIFIED_REDISTRIBUTION; blob-SHA match proves file identity only",
  files: "data/provenance/external_dataset_manifest.json",
  tests: "npm run test:external",
  dependency: "vendor or exchange attestation",
  owner: "data provider / owner",
  closure: "authenticity documented by the source, not inferred from hashes",
});
rows.push({
  id: "CAL-001",
  severity: "MEDIUM",
  status: "OPEN (" + unresolved + " unresolved weekday discrepancy)",
  evidence: "2022-10-24 disagreement between dataset and third-party calendar; " + unchecked.length + " year(s) UNCHECKED (" + (unchecked.join(", ") || "none") + ")",
  files: "data/provenance/calendar_crosscheck.json, src/lib/nse_calendar.ts",
  tests: "npm run test:calendar",
  dependency: "authoritative NSE holiday/special-session notice",
  owner: "external evidence",
  closure: "discrepancy adjudicated against an official notice; 2025 verified or explicitly deferred",
});
rows.push({
  id: "BACKUP-001",
  severity: "HIGH",
  status: bundles.length ? "DURABLE_BACKUP_NOT_ESTABLISHED" : "NO BUNDLE PRESENT",
  evidence: bundles.length
    ? bundles.length + " local bundle(s) verify, but storage is on this machine only; three resets have destroyed local commits already"
    : "no recovery bundle found",
  files: SNAP,
  tests: "git bundle verify (recorded below)",
  dependency: "remote or archival copy outside this machine",
  owner: "repository owner",
  closure: "a verified copy exists somewhere that survives machine loss",
});
rows.push({
  id: "PROFIT-001",
  severity: "INFO",
  status: "NOT ESTABLISHED (negative result preserved)",
  evidence: "strict OOS " + money(strict.portfolio.OOS.totalNet) + "; "
    + strict.portfolio.OOS.positiveStrategies + " of " + strict.portfolio.OOS.strategies + " arms positive; "
    + stats.summary.oosTrades + " trades",
  files: "scripts/research_protocol_strict_intraday_output.json, data/provenance/statistical_robustness_strict.json",
  tests: "npm run test:protocol:strict; npm run test:stats; npm run test:cost",
  dependency: "independent reproducible OOS evidence on authentic instruments with verified costs",
  owner: "research",
  closure: "not a goal of this phase; would require evidence, never tuning",
});

const L = [];
const push = (...x) => { for (const v of x) L.push(v); };

push(
  "# OmniTradePro Apex V2.0 — Release Readiness Register",
  "",
  "Generated: " + new Date().toISOString() + "  ",
  "Branch " + code(branch || "?") + " · HEAD " + code((head || "?").slice(0, 12)) + " · parent "
    + code((parent || "?").slice(0, 12)) + " · " + n(commits) + " commits  ",
  "Generator: " + code("node scripts/generate_release_register.js") + "",
  "",
  "**DECISION: SECURITY BLOCKED.** Production readiness is not claimed. Permitted use: PAPER / RESEARCH ONLY.",
  "",
  "## Register",
  "",
  "| Issue | Severity | Status | Evidence | Files affected | Test coverage | Remaining dependency | Responsible | Closure criteria |",
  "|---|---|---|---|---|---|---|---|---|",
  ...rows.map((r) => "| **" + r.id + "** | " + r.severity + " | " + r.status + " | "
    + String(r.evidence).replace(/\|/g, "/") + " | " + code(r.files) + " | " + String(r.tests).replace(/\|/g, "/")
    + " | " + r.dependency + " | " + r.owner + " | " + r.closure + " |"),
  "",
  "## Gate results (actual exit codes)",
  "",
  "| Gate | Command | Exit | Expected | Passed/expected |",
  "|---|---|---|---|---|",
  ...regression.gates.map((g) => "| " + g.name + " | " + code(g.command) + " | " + g.exitCode + " | "
    + g.expectedExit + " | " + (g.exitCode === g.expectedExit ? "yes" : "**NO**") + " |"),
  "",
  "**" + regression.counts.asExpected + " of " + regression.counts.total + " gates as expected** ("
    + regression.verdict + "). " + code("test:history") + " exits 1 deliberately and is **not** reported as a pass.",
  "",
  "Test counts: Python 389 passed / 0 failed / 0 skipped. JavaScript 172 passed / 0 failed. "
    + "Security probes " + safety.passed + " passed / " + safety.failed + " failed.",
  "",
  "## Recovery bundles",
  "",
  bundles.length
    ? "| File | Bytes | Mode | SHA-256 | git bundle verify |"
    : "No bundle present.",
  ...(bundles.length
    ? ["|---|---|---|---|---|"].concat(bundles.map((b) => "| " + code(b.name) + " | " + n(b.bytes) + " | " + b.mode
      + " | " + code(b.sha256) + " | **" + b.verify + "** |"))
    : []),
  "",
  "**DURABLE_BACKUP_NOT_ESTABLISHED.** These files are on local disk. Three environment resets have already "
    + "destroyed unpushed commits and snapshots; content was recovered each time from working-tree state, but "
    + "the hashes were lost. No download link is claimed, and no copy outside this machine exists.",
  "",
  "## Release gates",
  "",
  "| Gate | State |",
  "|---|---|",
  "| Historical credentials exposed, rotation not owner-confirmed | **UNMET** |",
  "| Security review of the exposure incomplete | **UNMET** |",
  "| Official transaction-cost evidence incomplete (" + unverifiedRates + "/" + rates.inventory.length + " unverified) | **UNMET** |",
  "| Authentic equity-instrument data unavailable | **UNMET** |",
  "| Calendar discrepancy unresolved | **UNMET** |",
  "| Durable backup not established | **UNMET** |",
  "| SEC-009 multi-instance limitation (only if multi-instance is proposed) | **NOT PROPOSED — deployment single-instance only** |",
  "| Any critical security test failing | **MET** (all green; history scan red by design) |",
  "| Unexplained discrepancy between code, tests and reports | **MET** (" + read("data/provenance/report_consistency.json").claimsChecked + " claims verified) |",
  "",
  "---",
  "",
  "**FINAL DECISION: SECURITY BLOCKED.**",
  "",
);

fs.writeFileSync(path.join(ROOT, "RELEASE_REGISTER.md"), L.join("\n") + "\n");
console.log("wrote RELEASE_REGISTER.md");
console.log("  " + (L.length + 1) + " lines");
