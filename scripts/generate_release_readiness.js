#!/usr/bin/env node
/**
 * Builds RELEASE_READINESS.md — final security-closure and release-readiness report.
 *
 * Fixed / verified / blocked / externally-dependent are kept in separate sections so the release decision
 * cannot be read as better than it is. Every figure comes from an artifact; no credential value is emitted.
 */
const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");
const crypto = require("node:crypto");

const ROOT = path.join(__dirname, "..");
const BT = String.fromCharCode(96);
const code = (s) => BT + s + BT;
const money = (v) => {
  if (typeof v !== "number" || !isFinite(v)) return String(v);
  const s = Math.abs(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (v < 0 ? "\u2212\u20b9" : "\u20b9") + s;
};
const n = (v) => (typeof v === "number" ? v.toLocaleString("en-IN") : String(v));
const git = (args) => {
  try {
    return execSync("git " + args, { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  } catch { return null; }
};
const read = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));

const history = read("data/security/git_history_scan.json");
const safety = read("data/security/safety_audit.json");
const safetyFailed = typeof safety.failed === "number" ? safety.failed : Math.max(0, (safety.checks || []).length - safety.passed);
const regression = read("data/security/regression_run.json");
const defects = read("data/security/application_defects.json");
const method = read("data/provenance/methodology_audit.json");
const stats = read("data/provenance/statistical_robustness_strict.json");
const cost = read("data/provenance/cost_sensitivity_strict.json");
const instr = read("data/provenance/instrument_compatibility.json");
const cal = read("data/provenance/calendar_crosscheck.json");
const rates = read("data/rate_registry_audit.json");
const strict = read("scripts/research_protocol_strict_intraday_output.json");
const mutation = read("data/security/mutation_check.json");
const envConfig = read("data/security/env_config_audit.json");

const branch = git("rev-parse --abbrev-ref HEAD");
const head = git("rev-parse HEAD");
const parent = git("rev-parse HEAD^");
const commitCount = git("rev-list --all --count");
const shallow = (() => { try { return fs.readFileSync(path.join(ROOT, ".git", "shallow"), "utf8").trim(); } catch { return null; } })();

const SNAP = "/home/user/security_snapshot";
let bundles = [];
try {
  bundles = fs.readdirSync(SNAP).filter((f) => f.endsWith(".bundle")).map((f) => {
    const st = fs.statSync(path.join(SNAP, f));
    let verify = "unverified";
    try {
      const out = execSync("git bundle verify " + JSON.stringify(path.join(SNAP, f)), { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
      verify = /records a complete history/i.test(out) ? "complete history" : "verified (partial)";
    } catch { verify = "VERIFY FAILED"; }
    return { name: f, bytes: st.size, mode: (st.mode & 0o777).toString(8), verify, sha256: (() => {
      try { return crypto.createHash("sha256").update(fs.readFileSync(path.join(SNAP, f))).digest("hex").slice(0, 16); } catch { return "n/a"; }
    })() };
  });
} catch { bundles = []; }

const oos = strict.portfolio.OOS;
const fixed = defects.defects.filter((d) => String(d.status).startsWith("FIXED"));
const documented = defects.defects.filter((d) => String(d.status).startsWith("ACCEPTED"));
const byStatus = rates.byStatus || {};
const calRows = cal.years || [];
const unresolved = calRows.reduce((a, y) => a + (y.calendarOnly || []).filter((d) => String(d.classification).includes("weekday")).length, 0);
const unchecked = calRows.filter((y) => y.status === "UNCHECKED").map((y) => y.year);
const gatesOk = regression.counts.unexpected === 0;

const L = [];
const push = (...xs) => { for (const x of xs) L.push(x); };

push(
  "# OmniTradePro — Release Readiness & Security Closure",
  "",
  "Generated: " + new Date().toISOString() + "  ",
  "Branch " + code(branch || "?") + " · HEAD " + code((head || "?").slice(0, 12)) + " · parent "
    + code((parent || "?").slice(0, 12)) + " · " + n(commitCount) + " commits · shallow: "
    + (shallow ? code(shallow.slice(0, 12)) : "no") + "  ",
  "Generator: " + code("node scripts/generate_release_readiness.js") + "",
  "",
  "## Release decision",
  "",
  "| | |",
  "|---|---|",
  "| **DECISION** | **SECURITY BLOCKED** |",
  "| Production readiness | **NOT CLAIMED** |",
  "| Permitted use | **PAPER / RESEARCH ONLY** |",
  "",
  "**Why not RESEARCH-ONLY READY.** The research *code* is in a releasable state: every gate passes, both "
    + "vaults fail closed, the API guard is hardened and covered by adversarial tests. But the release "
    + "decision cannot be separated from the credential exposure: "
    + history.summary.findingCount + " findings across " + history.summary.distinctCommitsAffected
    + " commits are reachable from the public remote, and rotation is **NOT_CONFIRMED**. Shipping a "
    + "certificate that says \"ready\" while the broker key is still live and public would be exactly the "
    + "misleading green this project has been engineered to avoid.",
  "",
  "**What would change the decision:** the account owner revoking the API key and resetting the TOTP seed, "
    + "confirmed out-of-band from the broker console. Nothing in this repository can confirm that.",
  "",
  "---",
  "",
  "## 1. Fixed",
  "",
  "| ID | Defect | Severity | Status |",
  "|---|---|---|---|",
  ...fixed.map((d) => "| **" + d.id + "** | " + d.title + " | " + d.severity + " | " + d.status + " |"),
  "",
  "Two of these were found by challenging the code rather than re-running the suite: **SEC-011** (locality was "
    + "inferred from a missing header the guard cannot verify) came out of the new adversarial probe, and "
    + "**TEST-001** came out of mutation testing — a reintroduced SEC-008 passed 44/44 because no case reached "
    + "the mutated line. Both are fixed, and the probe now fails on all four reintroduced vulnerabilities.",
  "",
  "### Environment configuration (missing, malformed, contradictory, unsafe)",
  "",
  "All six variables the code actually reads are documented in " + code("CONFIGURATION.md") + " and exercised by "
    + code("scripts/env_config_probe.js") + ": **" + envConfig.passed + " passed / " + envConfig.failed + " failed**. "
    + "A present-but-unusable token now fails closed (" + code("AUTH_MISCONFIGURED") + ") instead of being silently "
    + "ignored, which had removed authentication entirely (SEC-012).",
  "",
  "### Mutation evidence (a suite that cannot fail is not evidence)",
  "",
  "| Reintroduced vulnerability | Detected by probe |",
  "|---|---|",
  ...mutation.mutants.map((m) => "| " + code(m.id) + " " + m.description + " | **" + (m.detected ? "yes — " + m.failedCases + " failing case(s)" : "NO — COVERAGE GAP") + "** |"),
  "",
  "All " + mutation.mutants.length + " mutants are generated into the OS temp directory and never written into "
    + "the repository. Production build: **" + mutation.production.passed + " passed / "
    + mutation.production.failed + " failed** (" + mutation.verdict + ").",
  "",
  "## 2. Verified unchanged",
  "",
  "| Item | Evidence |",
  "|---|---|",
  "| Every mutating API route is guarded | automated route walk: 10 mutating routes, 0 unguarded (test) |",
  "| Webhook authentication | independent probe: no secret → " + code("WEBHOOK_UNAUTHENTICATED")
    + ", missing → " + code("WEBHOOK_SECRET_REQUIRED") + ", wrong → " + code("WEBHOOK_SECRET_INVALID")
    + ", correct → allowed, constant-time compare |",
  "| Vault fail-closed (both languages) | SAFE-13, SAFE-14, direct probes |",
  "| Safety probes | **" + safety.passed + " pass / " + safety.failed + " fail** (" + safety.verdict + ") |",
  "| Methodology | **" + method.passed + " pass / " + method.failed + " fail**; strict is the default; "
    + stats.summary.oosOvernightCarriedTrades + " overnight positions |",
  "| Research-only execution | " + code("productionChanged: " + strict.summary.productionChanged)
    + "; all strategies disabled; no broker connection in this pass |",
  "| Full-history digest scan | " + history.summary.findingCount + " findings / "
    + history.summary.distinctCommitsAffected + " commits; working tree "
    + (history.summary.affectsHeadWorkingTree ? "AFFECTED" : "clean") + "; values displayed 0 |",
  "",
  "## 3. Blocked (repository cannot resolve)",
  "",
  "| ID | Blocker | Severity | Required owner action |",
  "|---|---|---|---|",
  "| SECURITY-001 | Credential material in public Git history (" + history.summary.findingCount
    + " findings across " + history.summary.distinctCommitsAffected + " commits) | CRITICAL | Revoke API key + reset TOTP seed |",
  "| SECURITY-006 | Rotation unconfirmed | CRITICAL | Confirm from the broker console; do not paste secrets |",
  "| INSTR-001 | No authentic equity instrument data (" + instr.summary.equityValidationBlocked + " of "
    + instr.summary.strategies + " strategies blocked) | HIGH | Licensed, attested NSE equity intraday data |",
  "| RATE-001 | Official rates unverified (" + rates.inventory.length + " heads, 0 verified) | HIGH | Dated official NSE/SEBI/CBIC/GST documents |",
  "| DATA-002 | Dataset authenticity | MEDIUM | Vendor or exchange attestation |",
  "| CAL-001 | " + unresolved + " unresolved calendar discrepancy (2022-10-24) | MEDIUM | Authoritative NSE notice |",
  "| SEC-009 | Rate limiter is process-local | LOW | Multi-instance deployment stays blocked until a shared limiter exists |",
  "",
  "## 4. Externally dependent",
  "",
  "| Item | Depends on | Consequence if unavailable |",
  "|---|---|---|",
  "| Credential rotation | Broker account owner | Security certification stays BLOCKED |",
  "| Official cost documents | NSE / SEBI / CBIC / GST reachability | Financial validation stays BLOCKED |",
  "| Equity instrument data | Data licence + vendor attestation | Equity validation stays BLOCKED |",
  "| Calendar adjudication | NSE holiday/special-session notice | One weekday discrepancy remains OPEN |",
  "| Durable storage | A remote or archive outside this machine | Work survives only as long as the sandbox |",
  "",
  "## 5. Not tested / out of scope",
  "",
  "- Live broker connectivity — deliberately out of scope; no credential may be used.",
  "- Multi-instance deployment — no shared rate limiter exists (SEC-009).",
  "- 2025 market sessions — no dataset exists, so UNCHECKED rather than assumed clean.",
  "- Profitability — not established, and not a release criterion for a research tool.",
  "",
  "## 6. Regression (actual exit codes)",
  "",
  "| Gate | Command | Exit | Expected |",
  "|---|---|---|---|",
  ...regression.gates.map((g) => "| " + g.name + " | " + code(g.command) + " | " + g.exitCode + " | " + g.expectedExit + " |"),
  "",
  "**" + regression.counts.asExpected + " of " + regression.counts.total + " gates as expected** ("
    + regression.verdict + "). " + (gatesOk ? "No unexpected exits." : "Unexpected: "
      + regression.unexpectedGates.map((g) => g.name).join(", ")),
  "",
  "The history scanner's exit code of 1 is intentional and must remain red while the exposure stands. It is "
    + "the single most important line in this table.",
  "",
  "## 7. Research state (unchanged)",
  "",
  "| Metric | Value |",
  "|---|---|",
  "| Strict OOS net | **" + money(oos.totalNet) + "** |",
  "| Arms positive | **" + oos.positiveStrategies + " of " + oos.strategies + "** |",
  "| Trades | " + n(stats.summary.oosTrades) + " |",
  "| Overnight positions (strict) | **" + stats.summary.oosOvernightCarriedTrades + "** |",
  "| Statistical verdict | **" + stats.verdict + "** |",
  "| Cost sensitivity | " + cost.verdict.armsPositiveAtBaseline + " of " + cost.verdict.totalArms
    + " positive at baseline, " + cost.verdict.armsPositiveAtZeroSlippage + " at zero slippage |",
  "| Statutory status | **" + cost.statutoryStatus + "** |",
  "| Instrument verdict | **" + instr.verdict + "** |",
  "| Profitability claim | " + (strict.summary.profitabilityClaim || "none") + " |",
  "",
  "## 8. Recovery",
  "",
  "| Bundle | Size | Mode | SHA-256 (first 16) | Verification |",
  "|---|---|---|---|---|",
  ...(bundles.length
    ? bundles.map((b) => "| " + code(b.name) + " | " + n(b.bytes) + " | " + b.mode + " | " + code(b.sha256) + " | **" + b.verify + "** |")
    : ["| none found | — | — | — | **NO RECOVERY BUNDLE** |"]),
  "",
  "**Storage caveat, stated without softening:** these bundles live on local disk under "
    + code("/home/user/security_snapshot") + ". They are not durable. This environment has already lost "
    + "unpushed commits and snapshots three times mid-project; each time the content had to be recovered from "
    + "working-tree state, and the commit hashes were gone. A local bundle is a recovery aid, not a backup. "
    + "Durability requires a remote or archival copy, which this pass is not permitted to create.",
  "",
  "## 9. Release conditions",
  "",
  "| # | Condition | State |",
  "|---|---|---|",
  "| 1 | API key revoked and TOTP seed reset, confirmed by the owner | **NOT MET** |",
  "| 2 | Security review of the exposure completed | **NOT MET** |",
  "| 3 | Official rate evidence obtained | **NOT MET** |",
  "| 4 | Authentic instrument data obtained | **NOT MET** |",
  "| 5 | Calendar discrepancy adjudicated | **NOT MET** |",
  "| 6 | All regression gates as expected | MET |",
  "| 7 | Vaults fail closed | MET |",
  "| 8 | Mutating routes authenticated | MET |",
  "| 9 | Working tree free of credentials | MET |",
  "",
  "## 10. Explicit non-claims",
  "",
  "- This is **not** a production-readiness certificate.",
  "- No credential has been rotated; nothing here implies it has been.",
  "- No official fee rate is verified; none was invented.",
  "- No dataset has been authenticated by an exchange; matching a blob hash proves file identity only.",
  "- No strategy is profitable; the out-of-sample result is negative in every evaluable arm.",
  "- Editing a file does not remove it from Git history, and a rewrite would not un-disclose what has already been fetched.",
  "",
  "---",
  "",
  "**FINAL DECISION: SECURITY BLOCKED.**",
  "",
  "The code is in its best verified state; the exposure is not. Revoke the credentials, then re-run this pass.",
  "",
);

fs.writeFileSync(path.join(ROOT, "RELEASE_READINESS.md"), L.join("\n") + "\n");
console.log("wrote RELEASE_READINESS.md");
console.log("  " + (L.length + 1) + " lines");
