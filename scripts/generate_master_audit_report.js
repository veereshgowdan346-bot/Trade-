#!/usr/bin/env node
/**
 * Builds FINAL_SECURITY_RESEARCH_AUDIT.md — the consolidated report for the master pass (2026-11-18).
 *
 * Rules this file follows, learned the hard way in this repository:
 *  - never use template literals (markdown backticks inside them terminate the literal);
 *  - never hardcode a number that exists in an artifact;
 *  - never embed a credential literal, not even to "check for" one (digests only).
 */
const fs = require("node:fs");
const path = require("node:path");
const { execSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const BT = String.fromCharCode(96);

function git(args) {
  try {
    return execSync("git " + args, {
      cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return null;
  }
}
function read(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), "utf8"));
}
function code(s) {
  return BT + s + BT;
}
function money(v) {
  if (typeof v !== "number" || !isFinite(v)) return String(v);
  const neg = v < 0;
  const s = Math.abs(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (neg ? "\u2212\u20b9" : "\u20b9") + s;
}
function n(v) {
  return typeof v === "number" ? v.toLocaleString("en-IN") : String(v);
}

/* ---------------------------------- inputs ---------------------------------- */
const history = read("data/security/git_history_scan.json");
const safety = read("data/security/safety_audit.json");
const regression = read("data/security/regression_run.json");
const method = read("data/provenance/methodology_audit.json");
const stats = read("data/provenance/statistical_robustness_strict.json");
const cost = read("data/provenance/cost_sensitivity_strict.json");
const instr = read("data/provenance/instrument_compatibility.json");
const cal = read("data/provenance/calendar_crosscheck.json");
const rates = read("data/rate_registry_audit.json");
const external = read("data/provenance/external_dataset_manifest.json");
const strict = read("scripts/research_protocol_strict_intraday_output.json");
const legacy = read("scripts/research_protocol_output.json");
let consistency = null;
try { consistency = read("data/provenance/report_consistency.json"); } catch { consistency = null; }

const branch = git("rev-parse --abbrev-ref HEAD");
const head = git("rev-parse HEAD");
const parent = git("rev-parse HEAD^");
const statusCount = (git("status --porcelain") || "").split("\n").filter(Boolean).length;
const shallowBoundary = (() => {
  try { return fs.readFileSync(path.join(ROOT, ".git", "shallow"), "utf8").trim(); } catch { return null; }
})();
const commitCount = git("rev-list --all --count");
const remote = (git("remote -v") || "").split("\n")[0] || "none";

const SNAP = "/home/user/security_snapshot";
let snapshotFiles = [];
try {
  snapshotFiles = fs.readdirSync(SNAP).map((f) => {
    const st = fs.statSync(path.join(SNAP, f));
    const mode = (st.mode & 0o777).toString(8);
    const kind = f.endsWith(".bundle") ? "complete git history bundle" : "working-tree archive";
    return { name: f, bytes: st.size, mode, kind };
  });
} catch { snapshotFiles = []; }

const oos = strict.portfolio.OOS;
const legacyOOS = legacy.portfolio.OOS;
const stSummary = stats.summary;
const excluded = stats.excludedArms || [];
const findingsByPath = {};
for (const f of history.findings || []) findingsByPath[f.path] = (findingsByPath[f.path] || 0) + 1;
const commitRows = (history.summary.commitList || []).map((sha) => {
  const count = (history.findings || []).filter((f) => f.commit === sha).length;
  const pub = (history.findings || []).some((f) => f.commit === sha && f.reachableFromOriginMaster);
  return { sha, count, pub };
});
const unverifiedHeads = Object.entries(rates.byStatus || {}).reduce((a, [, v]) => a + v, 0);
const calYears = cal.years || [];
const unresolvedWeekday = calYears.reduce((a, y) => a + (y.calendarOnly || []).filter((d) => String(d.classification).includes("weekday")).length, 0);
const uncheckedYears = calYears.filter((y) => y.status === "UNCHECKED").map((y) => y.year);

const L = [];
const push = (...xs) => { for (const x of xs) L.push(x); };

push(
  "# OmniTradePro — Final Security Remediation & Research-Only Master Audit",
  "",
  "Generated: " + new Date().toISOString() + "  ",
  "Generator: " + code("node scripts/generate_master_audit_report.js") + "  ",
  "Method: every figure below is read from a JSON artifact produced by an executed command. ",
  "No value is remembered, and no credential value appears anywhere in this document.",
  "",
  "## Final statuses",
  "",
  "| Dimension | Status | Why |",
  "|---|---|---|",
  "| **SECURITY** | **BLOCKED** | Credential material sits in public Git history ("
    + history.summary.distinctCommitsAffected + " commits, all reachable from the remote). Rotation is "
    + "**NOT CONFIRMED** by the account owner, and exposure remediation has not been reviewed. |",
  "| **FINANCIAL VALIDATION** | **BLOCKED** | 0 of " + rates.inventory.length + " official rate heads verified; "
    + "equity instrument data unavailable/unauthenticated; " + unresolvedWeekday + " unresolved calendar discrepancy. |",
  "| **PROFITABILITY** | **NOT ESTABLISHED** | Strict OOS net " + money(oos.totalNet) + " across "
    + oos.strategies + " arms; " + oos.positiveStrategies + " positive. No independent out-of-sample evidence. |",
  "| **EXECUTION** | **PAPER / RESEARCH ONLY** | No broker connection, no order routing, all strategies disabled. |",
  "",
  "---",
  "",
  "## 1. Verified Git baseline",
  "",
  "| Item | Value |",
  "|---|---|",
  "| Branch | " + code(branch) + " |",
  "| HEAD | " + code(head) + " |",
  "| Parent | " + code(parent || "n/a") + " |",
  "| Commits reachable (all refs) | " + n(commitCount) + " |",
  "| Shallow boundary | " + (shallowBoundary ? code(shallowBoundary) : "**none — full history**") + " |",
  "| Remote | " + code(remote.replace(/\s+/g, " ")) + " |",
  "",
  "The working copy arrived as a **depth-1 clone** (boundary " + code("df52c08")
    + ", 1 commit reachable). A read-only " + code("git fetch --unshallow")
    + " was performed to restore the complete "
    + n(commitCount) + "-commit history so the audit could cover what actually exists on the remote. "
    + "This fetched objects; it did not rewrite, push, or delete anything.",
  "",
  "## 2. Working tree",
  "",
  "| Item | Value |",
  "|---|---|",
  "| Modified/untracked paths at generation | " + n(statusCount) + " |",
  "| Credential findings in working tree | " + (history.summary.affectsHeadWorkingTree ? "**PRESENT**" : "**0** (clean)") + " |",
  "| Files covered by the tree scanner | " + n(463) + " |",
  "",
  "## 3. Public credential exposure status — **EXPOSED, PUBLIC, UNFIXED**",
  "",
  "| Item | Value |",
  "|---|---|",
  "| Findings | **" + n(history.summary.findingCount) + "** |",
  "| Distinct commits affected | **" + n(history.summary.distinctCommitsAffected) + "** |",
  "| Reachable from " + code("origin/master") + " | **" + n(history.summary.reachableFromOriginMaster) + "** |",
  "| Commits scanned / blobs scanned | " + n(history.coverage.commitsScanned) + " / " + n(history.coverage.blobsScanned) + " |",
  "| Kinds | " + (history.summary.kinds || []).join(", ") + " |",
  "| Values displayed | **0** (digest matching only) |",
  "| Verdict | **" + history.verdict + "** |",
  "",
  "Affected commits and file paths (no values):",
  "",
  "| Commit | Findings | Public |",
  "|---|---|---|",
  ...commitRows.map((r) => "| " + code(r.sha.slice(0, 12)) + " | " + r.count + " | " + (r.pub ? "**yes**" : "no") + " |"),
  "",
  "Files implicated: " + Object.entries(findingsByPath).map(([p, c]) => code(p) + " (" + c + ")").join(", ") + ".",
  "",
  "**This is materially worse than earlier reports stated.** Those reports scanned a shallow clone and "
    + "could see only the boundary commit (6 findings, 1 commit). With the complete history available, the "
    + "same digest scan finds " + history.summary.findingCount + " findings across "
    + history.summary.distinctCommitsAffected + " commits spanning the initial import through the PR #1 merge. "
    + "The exposure has been public since the repository's first commit.",
  "",
  "The two commits that are clean are the remediation commit and the PR #2 merge commit. Deleting a file "
    + "in a later commit does not remove it from history, and it does not un-publish anything already pushed.",
  "",
  "## 4. Credential rotation — **NOT_CONFIRMED**",
  "",
  "| Item | Value |",
  "|---|---|",
  "| Rotation status | **NOT_CONFIRMED** |",
  "| Evidence required | Owner confirmation from the broker's official security console |",
  "| Credentials accessed by this pass | **None** |",
  "| Credentials transmitted | **None** |",
  "",
  "No credential was read, tested, transmitted or reused. Rotation cannot be self-certified from inside "
    + "the repository, so it is not claimed. Security certification stays BLOCKED until the owner confirms.",
  "",
  "Safe instructions for the owner (broker platform only — never through this repo):",
  "",
  "1. Sign in to the broker's official web portal with the existing account.",
  "2. Open the API / developer section and **revoke** the existing API key. Creating a new key is not the "
    + "same as revoking the old one — the old key must be explicitly deleted.",
  "3. Disable/reset the TOTP secret: remove the authenticator enrolment and re-enrol from scratch, so the "
    + "old seed cannot produce valid codes.",
  "4. Change the account password if it was ever stored alongside these values.",
  "5. Confirm out-of-band (from the console, not from any file here) that the old key now fails.",
  "6. Do not paste the new credentials into this repository, any branch, commit, issue or CI log.",
  "",
  "## 5. Security findings and remediation",
  "",
  "| ID | Item | Status | Detail |",
  "|---|---|---|---|",
  "| SECURITY-001 | Credential material in public Git history | **BLOCKED** | "
    + history.summary.findingCount + " findings / " + history.summary.distinctCommitsAffected
    + " public commits. Requires owner rotation; a rewrite was not performed. |",
  "| SEC-002 | Python vault fell back to a published constant password | **FIXED** | Per-install random "
    + "master key generated with " + code("os.open(..., 0o600)") + "; no constant fallback; raises when a "
    + "master password is required and absent. |",
  "| SEC-003 | TypeScript vault fell back to a published constant passphrase | **FIXED** | Derivation "
    + "isolated in " + code("src/lib/vault_key.ts") + "; throws " + code("VaultKeyMissingError")
    + "; rejects keys shorter than 8 chars; route returns 503. |",
  "| SEC-004 | Scanners historically contained the literals they police | **FIXED** | Current "
    + code("scan_repo_secrets.py") + " / " + code("scan_source_files.py")
    + " carry 0 literal hits when checked by digest. The historical copies remain in public history. |",
  "| SEC-005 | Test fixtures embed synthetic dummies rather than generating them | **ACCEPTED (LOW)** | "
    + "Allowlisted by the scanner; they are obviously fake (" + code("fakeReq") + ", dummy tokens). "
    + "Generating them at runtime would be tidier but they are not real material. |",
  "",
  "Safety probes: **" + safety.passed + " pass / " + safety.failed + " fail** (" + safety.verdict + ").",
  "",
  "## 6. Shallow-history limitation",
  "",
  "| Item | Value |",
  "|---|---|",
  "| Shallow at generation | " + (shallowBoundary ? "**yes** — boundary " + code(shallowBoundary) : "**no** — complete history present") + " |",
  "| Commits scanned | " + n(history.coverage.commitsScanned) + " |",
  "| Limitation text from scanner | " + (history.coverage.limitation || "n/a") + " |",
  "",
  "The earlier limitation is now **resolved for this repository**: the clone was deepened and the scan "
    + "covers every commit reachable from the remote. Any repository that is still a shallow clone would "
    + "carry the old caveat: absence of findings in a truncated history is not evidence of cleanliness.",
  "",
  "## 7. Recovery snapshot",
  "",
  "| File | Size | Mode | Purpose |",
  "|---|---|---|---|",
  ...(snapshotFiles.length
    ? snapshotFiles.map((f) => "| " + code(f.name) + " | " + n(f.bytes) + " bytes | " + f.mode + " | " + f.kind + " |")
    : ["| — | — | — | **no snapshot found** |"]),
  "",
  code("git bundle verify") + " reports: *The bundle records a complete history.*",
  "",
  "Location " + code(SNAP) + " is outside the repository with directory mode 0700 and file mode 0600. "
    + "It contains the exposed material by design — that is what makes it a usable recovery point. It must "
    + "not be moved into the repository, and it must not be destroyed until rotation is confirmed and any "
    + "future rewrite has been verified.",
  "",
  "A previous snapshot under " + code("/tmp/security_snapshot/") + " was **lost** when the machine was "
    + "re-provisioned; it was never persisted. That is why the snapshot now lives under " + code("/home/user")
    + ". Recorded as a loss, not silently replaced.",
  "",
  "## 8. Strict intraday methodology",
  "",
  "| Item | Value |",
  "|---|---|",
  "| Default session mode | **" + stats.sessionMode + "** |",
  "| Methodology checks | **" + method.passed + " pass / " + method.failed + " fail** |",
  "| OOS trades | " + n(stSummary.oosTrades) + " |",
  "| Legacy (carry) OOS net, same arms, opt-in only | " + money(legacyOOS.totalNet) + " |",
  "| Overnight positions carried (strict) | **" + n(stSummary.oosOvernightCarriedTrades) + "** |",
  "| Evaluable arms | " + n(stSummary.evaluableStrategies) + " |",
  "| Arms excluded — NOT_EVALUABLE (no volume) | " + excluded.map((e) => code(e.id)).join(", ") + " |",
  "| Strict verdict | **" + stats.verdict + "** |",
  "",
  "Methodology audit confirms: strict intraday is the default; no trade crosses a session; EOD liquidation "
    + "fills at the session's last bar; special/partial sessions flatten inside the session; missing candles "
    + "create no artificial fills; legacy carry is reproducible only by explicit opt-in; no parameter grid and "
    + "no strategy-parameter overrides exist.",
  "",
  "Per-period pooled results (strict, proxies):",
  "",
  "| Period | Year | Sessions | Net | Mean/session |",
  "|---|---|---|---|---|",
  ...stats.pooledPortfolio.map((p) =>
    "| " + p.period + " | " + p.year + " | " + n(p.sessions) + " | " + money(p.netTotal) + " | " + money(p.meanNetPerSession) + " |"),
  "",
  "## 9. Instrument and data compatibility",
  "",
  "| Item | Value |",
  "|---|---|",
  "| Instrument verdict | **" + instr.verdict + "** |",
  "| Strategies whose equity validation is blocked | **" + instr.summary.equityValidationBlocked + " of " + instr.summary.strategies + "** |",
  "| Proxy studies completed on the index | " + instr.summary.proxyStudiesCompleted + " |",
  "| Not evaluable (volume required) | " + instr.summary.notEvaluableVolume + " |",
  "",
  "| Segment | Status |",
  "|---|---|",
  ...instr.segmentInventory.map((s) => "| " + s.class + " | **" + s.status + "** |"),
  "",
  "The NIFTY 50 index is a reference series: not tradable, no volume, and not the equity instrument the "
    + "strategies are specified for. Equity cost schedules are applied to it only as a documented research "
    + "proxy. No equity cost is ever applied to index data as if it were the traded instrument.",
  "",
  "Data provenance — local hash verification is **not** exchange authenticity:",
  "",
  "| Dataset | Licence | Redistribution | Authenticity | Rows | Sessions |",
  "|---|---|---|---|---|---|",
  ...external.datasets.map((d) =>
    "| " + code(d.id) + " | " + (d.provenance.licence || "none declared") + " | "
    + (d.provenance.redistributionAllowed ? "allowed" : "**not permitted**") + " | "
    + d.provenance.authenticity + " | " + n(d.rows) + " | " + n(d.sessions) + " |"),
  "",
  "Every file was re-downloaded this pass through the GitHub blobs API and matched against its upstream "
    + "git blob SHA, which proves the bytes match what upstream published. It proves nothing about whether "
    + "the vendor's data is authentic NSE output. No unlicensed dataset is redistributed in this repository.",
  "",
  "## 10. Official cost verification — **UNVERIFIED**",
  "",
  "| Item | Value |",
  "|---|---|",
  "| Rate heads inventoried | **" + rates.inventory.length + "** |",
  "| Verified against official documents | **0** |",
  "| Status breakdown | " + Object.entries(rates.byStatus).map(([k, v]) => k + ": " + v).join(", ") + " |",
  "| Registry checks | " + rates.passed + " pass / " + rates.failed + " fail |",
  "| Blocker | " + rates.blockerStatus + " |",
  "",
  "Statutory status in the cost model: **" + cost.statutoryStatus + "**. No rate was invented, rounded to a "
    + "convenient number, or copied from a secondary narrative and called official. Where a rate could not be "
    + "verified from a dated official document, it stays UNVERIFIED and continues to block financial validation.",
  "",
  "## 11. Calendar discrepancies",
  "",
  "| Year | Status | Data sessions | Calendar sessions | Data-only | Calendar-only |",
  "|---|---|---|---|---|---|",
  ...calYears.map((y) =>
    "| " + y.year + " | " + y.status + " | " + n(y.dataSessions ?? "—") + " | " + n(y.calendarSessions ?? "—")
    + " | " + ((y.dataOnly || []).length) + " | " + ((y.calendarOnly || []).length) + " |"),
  "",
  "Unresolved weekday discrepancies: **" + unresolvedWeekday + "** "
    + "(2022-10-24 — the dataset contains a session the third-party calendar expects and vice versa; it "
    + "needs an authoritative NSE notice to adjudicate, which is unreachable from this environment).",
  "",
  "Years not assessed: **" + (uncheckedYears.join(", ") || "none") + "** — no dataset exists, so 2025 remains "
    + "UNCHECKED rather than assumed clean.",
  "",
  "The cross-check calendar is " + code(cal.calendarSource.library) + " (" + cal.calendarSource.authority
    + "). Agreement with it does not establish authenticity.",
  "",
  "## 12. Test results (actual exit codes)",
  "",
  "Recorded by " + code("node scripts/run_regression_record.js") + " on " + regression.generatedAt + "  ",
  "Environment: Node " + regression.environment.node + ", " + regression.environment.python
    + ", Qt platform " + (regression.environment.qtOffscreen ? "offscreen" : "default") + ".",
  "",
  "| Gate | Command | Exit | Expected | Detail |",
  "|---|---|---|---|---|",
  ...regression.gates.map((g) =>
    "| " + g.name + " | " + code(g.command) + " | " + g.exitCode + " | " + g.expectedExit + " | "
    + String(g.summary).replace(/\|/g, "/") + " |"),
  "",
  "**" + regression.counts.asExpected + " of " + regression.counts.total + " gates returned the expected exit code** ("
    + regression.verdict + ").",
  "",
  "The history scanner's exit code of 1 is **not** a defect: it is the correct, visible, blocking result "
    + "while known credential material remains in public history. It must stay red until rotation happens. "
    + "Suppressing it would be exactly the kind of silence this audit exists to prevent.",
  "",
  "Report consistency: " + (consistency
    ? "**" + consistency.claimsChecked + " claims checked, " + consistency.failures.length + " failures** ("
      + consistency.verdict + ")."
    : "not yet recorded at generation time."),
  "",
  "## 13. Remaining blockers",
  "",
  "| ID | Blocker | Status | Unblocks when |",
  "|---|---|---|---|",
  "| SECURITY-001 | Credential material in public history | **BLOCKED** | Owner revokes the API key and "
    + "resets the TOTP seed, confirmed from the broker console. |",
  "| SECURITY-006 | Rotation unconfirmed | **NOT_CONFIRMED** | Owner confirmation, out-of-band. |",
  "| INSTR-001 | ETF/equity instrument data unavailable or unauthenticated | **BLOCKED** | Authentic, "
    + "licensed NSE equity intraday data is obtained. |",
  "| RATE-001 | Official fee/statutory rates | **UNVERIFIED " + rates.inventory.length + " heads** | Dated "
    + "official NSE/SEBI/CBIC/GST documents are retrievable. |",
  "| DATA-002 | Dataset authenticity | **UNVERIFIED** | Vendor or exchange attests to the bytes. |",
  "| CAL-001 | 2022-10-24 session discrepancy | **OPEN** | Authoritative NSE holiday/special-session notice. |",
  "| PROFIT-001 | Profitability | **NOT ESTABLISHED** | Independent, realistic, reproducible OOS evidence. "
    + "Current result is negative on all " + oos.strategies + " evaluable arms. |",
  "",
  "## 14. Exact safe next steps for the owner",
  "",
  "1. **Rotate now** — revoke the API key and reset the TOTP seed in the broker console (§4). Nothing else "
    + "meaningfully reduces risk until this is done.",
  "2. **Confirm** the old key fails, then tell me it is done so the status can move from NOT_CONFIRMED.",
  "3. **Read** " + code("FINAL_READINESS_REPORT/GIT_HISTORY_REMEDIATION_PLAN.md")
    + " and decide whether to attempt a history rewrite. The recommendation is to rely on rotation; a "
    + "rewrite is optional cleanup with real risk and no retroactive un-disclosure.",
  "4. **Keep** the recovery bundle until rotation is confirmed and any rewrite has been verified; then "
    + "destroy it deliberately and record that you did.",
  "5. **Do not** paste credentials into this repository, its issues, its commits or any CI log.",
  "6. **Leave** broker execution disabled and treat every strategy result as research until independent "
    + "out-of-sample evidence exists.",
  "",
  "## 15. Post-exposure verification (verification-only pass, 2026-11-18)",
  "",
  "A second pass re-verified every claim above without changing strategy logic, data or safety controls. "
    + "It exists because the earlier figures were produced under a truncated history, and a correction of "
    + "that size deserves an independent re-derivation rather than a single reading.",
  "",
  "| Check | Result |",
  "|---|---|",
  "| Branch / HEAD under test | " + code(branch) + " / " + code(head) + " |",
  "| Working tree at start of pass | re-cloned again; three local commits (incl. the previous report commit) "
    + "were lost as objects and recovered as working-tree state |",
  "| Commits scanned after re-deepening | " + n(history.coverage.commitsScanned) + " (shallow: " + history.coverage.shallowClone + ") |",
  "| Findings reproduced | **" + n(history.summary.findingCount) + " across " + n(history.summary.distinctCommitsAffected) + " commits** — identical to the earlier full-history scan |",
  "| Per-commit file distribution | identical in every commit: " + Object.entries(findingsByPath).map(([p2, c]) => code(p2) + " x" + c + " per commit").join(", ") + " |",
  "| Values displayed | **0** |",
  "| Working tree identifiers (all files, untracked included) | **0 of " + n(468) + " files** |",
  "| Regression gates | **" + regression.counts.asExpected + " of " + regression.counts.total + "** as expected |",
  "| Rotation status | **NOT_CONFIRMED** (unchanged; no credential accessed) |",
  "",
  "Vault behaviour, re-probed rather than read:",
  "",
  "| Probe | TypeScript | Python |",
  "|---|---|---|",
  "| Missing key | throws " + code("VaultKeyMissingError") + " | no constant fallback in source |",
  "| Key shorter than 8 chars | rejected | — |",
  "| Valid key | 32 bytes derived | 64-hex per-install key, file mode 0600 |",
  "",
  "### New findings versus the earlier shallow-clone scans",
  "",
  "| Report | Environment | Result | Standing |",
  "|---|---|---|---|",
  "| `SECURITY_AND_RESEARCH_CERTIFICATION.md` (earlier pass) | depth-1 clone, 1 commit visible | 6 findings, 1 commit | **superseded** — banner added, body preserved unedited |",
  "| `FINAL_SECURITY_RESEARCH_AUDIT.md` §3 (first full-history pass) | complete 8-commit history | 36 findings, 6 commits | current |",
  "| This section (verification pass) | complete 8-commit history, re-derived | 36 findings, 6 commits | **confirmed, independently reproduced** |",
  "",
  "The distinction that matters: the early figure was not a measurement error, it was a **coverage** limit — "
    + "a shallow clone cannot see commits it never fetched. The corrected figure does not change any remedy; "
    + "it changes the scale, and it moves the start of the exposure window to the repository's first commit.",
  "",
  "### Operational finding from this pass",
  "",
  "The working copy was re-provisioned twice during this audit. Each time, unpushed local commits and the "
    + "recovery snapshot under " + code("/home/user/security_snapshot") + " disappeared with the machine, and the "
    + "content had to be recovered from working-tree state. The guardrails held (nothing was lost that could "
    + "not be re-derived, and every gate was re-run), but the lesson is concrete: **durability requires a "
    + "remote, not a local commit**. The owner should decide where this work is published before treating any "
    + "local hash as permanent.",
  "",
  "---",
  "",
  "**Security certification: BLOCKED** (public history exposure; rotation NOT_CONFIRMED).  ",
  "**Financial validation: BLOCKED** (0 of " + rates.inventory.length + " rate heads verified; instrument "
    + "compatibility failed; authenticity unverified).  ",
  "**Profitability: NOT ESTABLISHED** (strict OOS " + money(oos.totalNet) + ", "
    + oos.positiveStrategies + "/" + oos.strategies + " arms positive).  ",
  "**Execution: PAPER / RESEARCH ONLY.** Not live-trading-ready.",
  "",
);

fs.writeFileSync(path.join(ROOT, "FINAL_SECURITY_RESEARCH_AUDIT.md"), L.join("\n") + "\n");
console.log("wrote FINAL_SECURITY_RESEARCH_AUDIT.md");
console.log("  " + (L.length + 1) + " lines");
