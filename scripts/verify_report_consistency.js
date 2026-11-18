/**
 * REPORT-001 — report-to-artifact consistency verifier.
 *
 * Recomputes every headline figure from its JSON artifact and asserts the exact formatted string
 * appears in the generated report. If a report is edited by hand, or an artifact is regenerated without
 * regenerating the report, this fails.
 *
 * Usage: node scripts/verify_report_consistency.js
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const REPORT = path.join(ROOT, "APEX_V2_FINAL_AUDIT_REPORT.md");
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
const money = (v) => (v < 0 ? "−₹" : "+₹") + Math.abs(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const text = fs.readFileSync(REPORT, "utf8");
const CERT = path.join(ROOT, "SECURITY_AND_RESEARCH_CERTIFICATION.md");
const certText = fs.readFileSync(CERT, "utf8");
const protocolLegacy = read("scripts/research_protocol_output.json");
const protocolStrict = read("scripts/research_protocol_strict_intraday_output.json");
const statsLegacy = read("data/provenance/statistical_robustness.json");
const statsStrict = read("data/provenance/statistical_robustness_strict.json");
const costStrict = read("data/provenance/cost_sensitivity_strict.json");
const method = read("data/provenance/methodology_audit.json");
const safety = read("data/security/safety_audit.json");
const instr = read("data/provenance/instrument_compatibility.json");
const calendar = read("data/provenance/calendar_crosscheck.json");
const perf = read("scripts/perf_benchmark_output.json");
const probes = read("scripts/final_readiness_probes_output.json");
const equivalence = read("scripts/perf_equivalence_output.json");
const historyScan = read("data/security/git_history_scan.json");
const anchors = read("scripts/anchor_reproduction_output.json");
const MASTER = path.join(ROOT, "FINAL_SECURITY_RESEARCH_AUDIT.md");
const masterText = fs.readFileSync(MASTER, "utf8");
const APEX = path.join(ROOT, "APEX_V2_FINAL_CERTIFICATION.md");
const REL = path.join(ROOT, "RELEASE_READINESS.md");
const REG = path.join(ROOT, "RELEASE_REGISTER.md");
const registerText = fs.readFileSync(REG, "utf8");
const mutationCheck = read("data/security/mutation_check.json");
const releaseText = fs.readFileSync(REL, "utf8");
const apexText = fs.readFileSync(APEX, "utf8");
const defects = read("data/security/application_defects.json");
const rates = read("data/rate_registry_audit.json");
const regression = read("data/security/regression_run.json");

const oosCost = costStrict.periods.find((p) => p.period === "OOS");
const oosStatsStrict = statsStrict.pooledPortfolio.find((p) => p.year === 2024);
const oosStatsLegacy = statsLegacy.pooledPortfolio.find((p) => p.year === 2024);
const bar200k = perf.rows.find((r) => r.bars === 200000);

const claims = [
  ["strict OOS net (8 arms)", money(protocolStrict.portfolio.OOS.totalNet)],
  ["legacy OOS net (8 arms)", money(protocolLegacy.portfolio.OOS.totalNet)],
  ["strict OOS gross (8 arms)", money(protocolStrict.portfolio.OOS.gross)],
  ["legacy OOS gross (8 arms)", money(protocolLegacy.portfolio.OOS.gross)],
  ["strict OOS statutory (8 arms)", money(protocolStrict.portfolio.OOS.statutoryCharges)],
  ["strict 9-arm OOS net", money(oosStatsStrict.netTotal)],
  ["strict 9-arm mean/session", money(oosStatsStrict.meanNetPerSession)],
  ["strict 9-arm CI bounds", `[${oosStatsStrict.ci95SessionCluster.low}, ${oosStatsStrict.ci95SessionCluster.high}]`],
  ["legacy 9-arm OOS net", money(oosStatsLegacy.netTotal)],
  ["strict OOS trades", statsStrict.summary.oosTrades.toLocaleString("en-IN")],
  ["strict negative-under-all-methods count", String(statsStrict.summary.negativeAllMethods)],
  ["strict design-effect median", String(statsStrict.summary.medianDesignEffect)],
  ["strict overnight-carried trades", String(statsStrict.summary.oosOvernightCarriedTrades)],
  ["cost gross (9 arms)", money(oosCost.gross)],
  ["cost statutory (9 arms)", money(oosCost.statutoryAtBaseline)],
  ["cost slippage (9 arms)", money(oosCost.slippageAtBaseline)],
  ["cost break-even bps/side", `${oosCost.breakEvenSlippage.bpsPerSide} bps/side`],
  ["cost arms positive at baseline", `Arms positive at baseline: ${costStrict.verdict.armsPositiveAtBaseline}`],
  ["cost arms positive at zero slippage", `arms positive at zero slippage: ${costStrict.verdict.armsPositiveAtZeroSlippage}`],
  ["methodology pass count", `${method.passed} pass / ${method.failed} fail`],
  ["safety pass count", `${safety.passed} pass / ${(typeof safety.failed === "number" ? safety.failed : 0)} fail`],
  ["instrument equity validation blocked", `${instr.summary.equityValidationBlocked} of ${instr.summary.strategies} strategies`],
  ["calendar 2022 data sessions", `| 2022 | ${calendar.years[0].dataSessions} |`],
  ["calendar 2025 unchecked", "2025"],
  ["perf 200k bars wall time", bar200k.fastMs.toFixed(1)],
  ["perf 200k trade count", `| ${bar200k.bars.toLocaleString("en-IN")} |`],
  ["equivalence verdict", String(equivalence.verdict)],
  ["anchors verdict", String(anchors.verdict)],
  ["probe count", `${probes.passed}/${probes.probeCount}`],
  ["strict portfolio oosSupported empty", "0 of 8 arms supported in strict mode"],
];

const failures = [];
const notes = [];
for (const [label, needle] of claims) {
  if (!needle || needle === "undefined") {
    failures.push({ label, needle: String(needle), reason: "artifact value missing/undefined" });
    continue;
  }
  if (!text.includes(needle)) failures.push({ label, needle, reason: "not found in report" });
}

/* -------- historical reports: banner + integrity, no live numeric assertions -------- */
// Reports from earlier passes are dated snapshots. Asserting today's artifact values against them would
// force either silent rewrites or perpetual mismatches; instead each must declare itself superseded.
const historicalReports = [
  ["FINAL_SECURITY_RESEARCH_AUDIT.md", "SUPERSEDED — see `APEX_V2_FINAL_CERTIFICATION.md`"],
  ["SECURITY_AND_RESEARCH_CERTIFICATION.md", "SUPERSEDED"],
  ["APEX_V2_FINAL_AUDIT_REPORT.md", null], // regenerated by test:report, holds current values
];
for (const [file, banner] of historicalReports) {
  const body = fs.readFileSync(path.join(ROOT, file), "utf8");
  if (banner && !body.includes(banner)) {
    failures.push({ label: "history-banner:" + file, needle: banner, reason: "historical report lacks a supersession banner" });
  }
}

/* -------- Apex V2.0 final certification claims -------- */
const apexClaims = [
  ["apex:history findings", "**" + historyScan.summary.findingCount + "**"],
  ["apex:history commits", "**" + historyScan.summary.distinctCommitsAffected + "**"],
  ["apex:history public", "**" + historyScan.summary.reachableFromOriginMaster + "**"],
  ["apex:strict OOS", money(protocolStrict.portfolio.OOS.totalNet)],
  ["apex:legacy OOS", money(protocolLegacy.portfolio.OOS.totalNet)],
  ["apex:arms", "**" + protocolStrict.portfolio.OOS.positiveStrategies + " of " + protocolStrict.portfolio.OOS.strategies + "**"],
  ["apex:trades", statsStrict.summary.oosTrades.toLocaleString("en-IN")],
  ["apex:overnight", "**" + statsStrict.summary.oosOvernightCarriedTrades + "**"],
  ["apex:methodology", "**" + method.passed + " pass / " + method.failed + " fail**"],
  ["apex:safety", "**" + safety.passed + " pass / " + safety.failed + " fail**"],
  ["apex:instrument", "**" + instr.verdict + "**"],
  ["apex:rates", "| Rate heads inventoried | " + rates.inventory.length + " |"],
  ["apex:gates", "**" + regression.counts.asExpected + " of " + regression.counts.total + " gates returned the expected exit code**"],
  ["apex:defect count", "### " + defects.defects[0].id],
  ["apex:security blocked", "**SECURITY** | **BLOCKED**"],
  ["apex:financial blocked", "**FINANCIAL VALIDATION** | **BLOCKED**"],
  ["apex:profitability", "**PROFITABILITY** | **NOT ESTABLISHED**"],
  ["apex:execution", "**PAPER / RESEARCH ONLY**"],
  ["apex:history status", "**PUBLIC EXPOSURE CONFIRMED**"],
  ["apex:recovery", "**VERIFIED (with caveat)**"],
  ["apex:rotation", "**NOT_CONFIRMED**"],
  ["apex:roadmap p1", "### Priority 1"],
  ["apex:roadmap p8", "### Priority 8"],
];
for (const [label, needle] of apexClaims) {
  if (!needle || needle === "undefined" || needle === "NaN") {
    failures.push({ label, needle: String(needle), reason: "artifact value missing" });
  } else if (!apexText.includes(needle)) {
    failures.push({ label, needle, reason: "not found in Apex certification report" });
  }
}

/* -------- release-readiness claims -------- */
const releaseClaims = [
  ["release:decision", "**FINAL DECISION: SECURITY BLOCKED.**"],
  ["release:not production", "| Production readiness | **NOT CLAIMED** |"],
  ["release:paper only", "**PAPER / RESEARCH ONLY**"],
  ["release:history findings", historyScan.summary.findingCount + " findings across " + historyScan.summary.distinctCommitsAffected + " commits"],
  ["release:gates", "**" + regression.counts.asExpected + " of " + regression.counts.total + " gates as expected**"],
  ["release:safety", "**" + safety.passed + " pass / " + safety.failed + " fail**"],
  ["release:rates", "(" + rates.inventory.length + " heads, 0 verified)"],
  ["release:methodology", "**" + method.passed + " pass / " + method.failed + " fail**"],
  ["release:overnight", statsStrict.summary.oosOvernightCarriedTrades + " overnight positions"],
  ["release:sec008", "| **SEC-008** |"],
  ["release:recovery warn", "not durable"],
];
for (const [label, needle] of releaseClaims) {
  if (!needle || needle === "undefined" || needle === "NaN") {
    failures.push({ label, needle: String(needle), reason: "artifact value missing" });
  } else if (!releaseText.includes(needle)) {
    failures.push({ label, needle, reason: "not found in release-readiness report" });
  }
}

/* -------- release register claims -------- */
const registerClaims = [
  ["register:decision", "**FINAL DECISION: SECURITY BLOCKED.**"],
  ["register:gates", "**" + regression.counts.asExpected + " of " + regression.counts.total + " gates as expected**"],
  ["register:sec010", "| **SEC-010** |"],
  ["register:backup", "DURABLE_BACKUP_NOT_ESTABLISHED"],
  ["register:history", historyScan.summary.findingCount + " findings across " + historyScan.summary.distinctCommitsAffected + " commits"],
  ["register:rates", "(" + rates.inventory.length + " heads, 0 verified)"],
  ["register:safety", "Security probes " + safety.passed + " passed / " + safety.failed + " failed."],
];
for (const [label, needle] of registerClaims) {
  if (!needle || needle === "undefined" || needle === "NaN") {
    failures.push({ label, needle: String(needle), reason: "artifact value missing" });
  } else if (!registerText.includes(needle)) {
    failures.push({ label, needle, reason: "not found in release register" });
  }
}

/* -------- mutation-testing and SEC-011 evidence -------- */
const hardeningClaims = [
  ["release:sec011", "SEC-011"],
  ["release:test001", "TEST-001"],
  ["release:mutation verdict", mutationCheck.verdict],
  ["release:mutation count", mutationCheck.mutants.length + " mutants"],
  ["register:sec011 row", "| **SEC-011** |"],
  ["register:test001 row", "| **TEST-001** |"],
  ["register:sec012 row", "| **SEC-012** |"],
  ["register:sec013 row", "| **SEC-013** |"],
  ["env config probe count", "43 passed"],
  ["audit:baseline row present", "| Baseline (HEAD at audit start) |"],
  ["apex:sec011", "SEC-011"],
];
for (const [label, needle] of hardeningClaims) {
  if (!needle || needle === "undefined" || needle === "NaN") {
    failures.push({ label, needle: String(needle), reason: "artifact value missing" });
  } else if (!(releaseText + registerText + apexText + text).includes(needle)) {
    failures.push({ label, needle, reason: "not found in the release documents" });
  }
}
/* The report's baseline must be a real, reachable commit — the previous report cited a hash that did not
   exist at all (DOC-001), so this is checked against git rather than trusted. */
{
  const cp = require("node:child_process");
  const m = /\| Baseline \(HEAD at audit start\) \| `([0-9a-f]+)` \|/.exec(text);
  if (!m) {
    failures.push({ label: "audit:baseline", needle: "absent", reason: "no baseline row in the audit report" });
  } else {
    let ok = true;
    try { cp.execSync(`git cat-file -e ${m[1]}^{commit}`, { cwd: ROOT, stdio: "ignore" }); } catch { ok = false; }
    if (!ok) {
      failures.push({ label: "audit:baseline exists", needle: m[1], reason: "cited baseline commit is not in this repository" });
    } else {
      let ancestor = true;
      try { cp.execSync(`git merge-base --is-ancestor ${m[1]} HEAD`, { cwd: ROOT, stdio: "ignore" }); } catch { ancestor = false; }
      if (!ancestor) failures.push({ label: "audit:baseline reachable", needle: m[1], reason: "baseline is not an ancestor of HEAD" });
    }
  }
}

/* Handover artefacts must exist and agree with the artefacts they summarise. */
{
  const fs = require("node:fs");
  const path = require("node:path");
  const handover = path.join(ROOT, "FINAL_HANDOVER.md");
  const register = path.join(ROOT, "MISSING_EVIDENCE_REGISTER.md");
  for (const [label, file, needles] of [
    ["handover", handover, ["## A. Account-owner actions", "## B. External evidence", "## C. Code tasks", "SECURITY BLOCKED — RESEARCH/PAPER ONLY", "NOT_CONFIRMED"]],
    ["missing-evidence", register, ["Required document", "Issuing authority", "Applicable date range", "Validation criterion"]],
    ["recovery-manifest", path.join(ROOT, "RECOVERY_MANIFEST.md"), ["| Tree ID |", "DURABLE_BACKUP_NOT_ESTABLISHED",
      /* The hash table and the restore line only exist when a bundle does. Requiring them unconditionally would
         push a generator towards inventing a bundle to satisfy the checker. */
      ...(fs.existsSync(path.join(ROOT, "backups")) && fs.readdirSync(path.join(ROOT, "backups")).some((f) => f.endsWith(".bundle"))
        ? ["| SHA-256 |", "Independent restore test"]
        : ["Recorded but no longer present"])]],
    ["recovery-procedure", path.join(ROOT, "RECOVERY_PROCEDURE.md"), ["Step 1 — Restore full history", "Step 4 — Restore the external datasets", "Step 6 — Re-establish the commit line", "What must never be done"]],
  ]) {
    if (!fs.existsSync(file)) {
      failures.push({ label, needle: file, reason: "handover artefact missing" });
      continue;
    }
    const body = fs.readFileSync(file, "utf8");
    for (const needle of needles) {
      if (!body.includes(needle)) failures.push({ label, needle, reason: "required section missing" });
    }
  }
  /* A manifest that names a commit which no git object backs is the DOC-001 failure returning. */
  const manifestBody = fs.readFileSync(path.join(ROOT, "RECOVERY_MANIFEST.md"), "utf8");
  const citedHead = /\| HEAD \| `([0-9a-f]{40})` \|/.exec(manifestBody);
  if (!citedHead) {
    failures.push({ label: "manifest:head", needle: "absent", reason: "no HEAD row in the recovery manifest" });
  } else {
    try {
      require("node:child_process").execSync(`git cat-file -e ${citedHead[1]}^{commit}`, { cwd: ROOT, stdio: "ignore" });
    } catch {
      failures.push({ label: "manifest:head exists", needle: citedHead[1], reason: "manifest cites a commit that is not in this repository" });
    }
  }
  /* The manifest once described only the newest bundle while five sat on disk. The comparison lives in
     scripts/lib/inventory_guard.js so it can be unit-tested; here it is applied to the real directory. */
  {
    const fs = require("node:fs");
    const path = require("node:path");
    const { checkInventory, classifyInventory } = require("./lib/inventory_guard.js");
    const backupDir = process.env.OMNI_BACKUP_DIR || path.join(ROOT, "backups");
    const auditPath = path.join(ROOT, "data", "security", "bundle_audit.json");
    const declaredMatch = manifestBody.match(/Bundles on disk: (\d+)\./);
    const declared = declaredMatch ? Number(declaredMatch[1]) : null;
    const verdict = classifyInventory({
      dirExists: fs.existsSync(backupDir),
      declared,
      statesAbsence: /\*\*No recovery bundle exists on this machine\.\*\*/.test(manifestBody),
      restoredClone: process.env.OMNI_RESTORED_CLONE === "1",
    });
    if (verdict.error) {
      failures.push({ label: `manifest:bundle inventory ${verdict.state}`, needle: String(declared), reason: verdict.error });
    } else if (verdict.state === "ABSENCE_DOCUMENTED") {
      notes.push("bundle inventory: zero bundles, stated explicitly (NO_BUNDLE_EXISTS) — nothing is restorable, durability stays unestablished");
    } else if (verdict.state === "RESTORED_CLONE") {
      notes.push(`bundle inventory: not applicable (restored clone declares ${declared}, has no backups/ — bundles are not committed)`);
    }
    if (fs.existsSync(backupDir)) {
      const diskFiles = fs.readdirSync(backupDir);
      /* Only the live inventory table counts. The manifest also lists bundles that were destroyed, and those
         names must not be read as "missing from disk" — they are missing by definition. */
      const live = (() => {
        const from = manifestBody.indexOf("## Recovery bundles");
        if (from < 0) return manifestBody;
        const rest = manifestBody.slice(from);
        const stop = rest.indexOf("**Recorded but no longer present.**");
        const body = stop < 0 ? rest : rest.slice(0, stop);
        const next = body.indexOf("\n## ", 1);
        return next < 0 ? body : body.slice(0, next);
      })();
      const inv = checkInventory(live, diskFiles);
      for (const err of inv.errors) {
        failures.push({ label: "manifest:bundle inventory", needle: err, reason: "manifest and backups/ disagree — regenerate with scripts/generate_recovery_docs.js" });
      }
      if (fs.existsSync(auditPath)) {
        const audit = JSON.parse(fs.readFileSync(auditPath, "utf8"));
        if (audit.count !== inv.onDisk.length) {
          failures.push({ label: "bundle_audit:count", needle: `${audit.count} recorded / ${inv.onDisk.length} on disk`, reason: "run scripts/audit_bundles.js to refresh the inventory" });
        }
      }
    } else if (fs.existsSync(auditPath)) {
      const audit = JSON.parse(fs.readFileSync(auditPath, "utf8"));
      if (audit.count !== 0) {
        failures.push({ label: "bundle_audit:count", needle: `${audit.count} recorded / 0 on disk`, reason: "the audit artefact still claims bundles that are gone" });
      }
    }
  }

  const { execFileSync } = require("node:child_process");
  /* The off-machine handoff is the only document that tells the owner what to do about durability. It must exist,
     must not claim the backup is established, and must contain the steps that would upgrade the status. */
  {
    const p = path.join(ROOT, "OFF_MACHINE_BACKUP_HANDOFF.md");
    if (!fs.existsSync(p)) {
      failures.push({ label: "handoff:missing", needle: "OFF_MACHINE_BACKUP_HANDOFF.md", reason: "no off-machine backup handoff exists" });
    } else {
      const { checkHandoff } = require("./lib/handoff_guard.js");
      const handoffText = fs.readFileSync(p, "utf8");
      const linkedFrom = {};
      for (const [name, file] of [["manifest", "RECOVERY_MANIFEST.md"], ["procedure", "RECOVERY_PROCEDURE.md"],
        ["handover", "FINAL_HANDOVER.md"]]) {
        const f = path.join(ROOT, file);
        if (!fs.existsSync(f)) {
          failures.push({ label: `handoff:link-doc-missing`, needle: file, reason: `required linking document ${file} is missing` });
          linkedFrom[name] = "";
        } else {
          linkedFrom[name] = fs.readFileSync(f, "utf8");
        }
      }
      const verdict = checkHandoff({ handoffText, linkedFrom });
      for (const e of verdict.errors) {
        failures.push({ label: `handoff:${e.split(":")[0]}`, needle: e.slice(0, 70), reason: "handoff guard" });
      }
      /* The quoted commit must be real and an ancestor, or the expected values describe another repository. */
      const quoted = (handoffText.match(/^\| HEAD \| `([0-9a-f]{40})` \|$/m) || [])[1];
      if (!quoted) {
        failures.push({ label: "handoff:head", needle: "missing", reason: "the handoff does not state which commit it describes" });
      } else {
        let ancestor = false;
        try {
          require("node:child_process").execFileSync("git", ["merge-base", "--is-ancestor", quoted, "HEAD"], { cwd: ROOT, stdio: "pipe" });
          ancestor = true;
        } catch { ancestor = false; }
        if (!ancestor) {
          failures.push({ label: "handoff:head", needle: quoted, reason: "the handoff names a commit that is not in this history" });
        }
      }
    }
  }

  /* REC-004: a shallow workspace cannot produce a restorable bundle. The manifest must say so, and the audit
     artefact must record it, so neither can quietly claim a usable backup from a shallow source. */
  {
    const manifestText = fs.readFileSync(path.join(ROOT, "RECOVERY_MANIFEST.md"), "utf8");
    const auditFile = path.join(ROOT, "data", "security", "bundle_audit.json");
    if (!/Shallow-source trap/.test(manifestText)) {
      failures.push({ label: "manifest:shallow-trap", needle: "missing", reason: "REC-004 guidance absent from the manifest" });
    }
    if (fs.existsSync(auditFile)) {
      const audit = JSON.parse(fs.readFileSync(auditFile, "utf8"));
      if (!("workspaceShallow" in audit)) {
        failures.push({ label: "audit:workspaceShallow", needle: "missing", reason: "the audit artefact does not record whether the source workspace was shallow" });
      }
    }
    const shallow = fs.existsSync(path.join(ROOT, ".git", "shallow"));
    if (shallow) {
      failures.push({ label: "repo:shallow", needle: "true", reason: "this repository is shallow; no bundle produced from it would be restorable (REC-004)" });
    }
  }

  /* The procedure quotes a count of negative tests. Check it against an actual run, so a stale number cannot
     survive a generator run. */
  if (process.env.OMNI_IN_HARNESS === "1") {
    notes.push("procedure:bundle-tests not re-run (already inside the harness)");
  } else {
    const proc = fs.readFileSync(path.join(ROOT, "RECOVERY_PROCEDURE.md"), "utf8");
    let actual = null;
    try {
      const out = require("node:child_process").execSync("node scripts/test_bundle_audit.js", { cwd: ROOT, encoding: "utf8", stdio: "pipe" });
      const m = out.match(/bundle-audit tests: (\d+) passed, (\d+) failed/);
      actual = m ? `${m[1]} passed, ${m[2]} failed` : null;
    } catch { actual = null; }
    if (!actual) {
      failures.push({ label: "procedure:bundle-tests", needle: "run failed", reason: "the negative-test harness does not run cleanly" });
    } else if (!proc.includes(actual)) {
      failures.push({ label: "procedure:bundle-tests", needle: actual, reason: "the procedure quotes a different count from the one the tests produce" });
    }
  }

  /* The handover summary is the first table a reader sees. Each of these numbers was wrong at some point in this
     audit (0/22 gates, a NaN net, a probe count from the wrong artefact, and a robustness file that was not the
     strict one), and every one of them was invisible to the checks above. */
  {
    const handover = fs.readFileSync(path.join(ROOT, "FINAL_HANDOVER.md"), "utf8");
    const must = [
      ["22/22 as expected", "handover:gates", "regression summary is wrong or missing"],
      ["-Rs 6,79,195.43", "handover:oos-net", "strict OOS net is wrong or missing (not the strict artefact?)"],
      ["3956 trades", "handover:oos-trades", "strict OOS trade count is wrong or missing"],
      ["0 overnight-carried trades", "handover:overnight", "overnight-carry count is wrong or missing"],
      ["48 passed, 0 failed", "handover:adversarial", "adversarial probe count is wrong or missing"],
      ["43 passed, 0 failed", "handover:environment", "environment probe count is wrong or missing"],
      ["DURABLE_BACKUP_NOT_ESTABLISHED", "handover:durability", "durability status missing"],
      ["SECURITY BLOCKED", "handover:decision", "the blocking decision line is missing"],
    ];
    for (const [needle, label, reason] of must) {
      if (!handover.includes(needle)) failures.push({ label, needle, reason });
    }
    for (const [name, file] of [["handover", "FINAL_HANDOVER.md"], ["manifest", "RECOVERY_MANIFEST.md"],
      ["register", "RELEASE_REGISTER.md"], ["readiness", "RELEASE_READINESS.md"], ["certification", "APEX_V2_FINAL_CERTIFICATION.md"]]) {
      const text = fs.readFileSync(path.join(ROOT, file), "utf8");
      for (const bad of ["NaN", "undefined", "[object Object]", "Infinity"]) {
        if (text.includes(bad)) failures.push({ label: `${name}:bad-token`, needle: bad, reason: `a generated document contains ${bad}` });
      }
    }
  }

  /* The manifest describes the repository it was generated from. A document cannot contain its own commit, so the
     requirement is ancestry plus no-inflation, not equality — but a stale or invented HEAD must still fail. */
  {
    const manifestText = fs.readFileSync(path.join(ROOT, "RECOVERY_MANIFEST.md"), "utf8");
    const head = (manifestText.match(/\| HEAD \| `([0-9a-f]{40})` \|/) || [])[1];
    if (!head) {
      failures.push({ label: "manifest:head", needle: "missing", reason: "manifest does not state its HEAD" });
    } else {
      let isAncestor = false;
      try {
        execFileSync("git", ["merge-base", "--is-ancestor", head, "HEAD"], { cwd: ROOT, stdio: "pipe" });
        isAncestor = true;
      } catch { isAncestor = false; }
      if (!isAncestor) {
        failures.push({ label: "manifest:head", needle: head, reason: "manifest HEAD is not in this repository's history — regenerate it" });
      }
      const declared = Number((manifestText.match(/\| Commits in history \| (\d+)/) || [])[1] || 0);
      const actual = Number(execFileSync("git", ["rev-list", "--count", "HEAD"], { cwd: ROOT, encoding: "utf8" }).trim());
      if (declared > actual) {
        failures.push({ label: "manifest:commits", needle: `${declared} declared / ${actual} actual`, reason: "manifest claims more commits than the repository has" });
      }
      const filesDeclared = Number((manifestText.match(/\| Tracked files \| (\d+)/) || [])[1] || 0);
      const filesActual = Number(execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" }).trim().split("\n").filter(Boolean).length);
      if (filesDeclared > filesActual) {
        failures.push({ label: "manifest:files", needle: `${filesDeclared} declared / ${filesActual} actual`, reason: "manifest claims more tracked files than exist" });
      }
    }
  }

  /* The destroyed bundles are a record, not an inventory. Their count must match the register and the manifest
     must not quietly drop them — six bundles existed, and that fact has to survive every regeneration. */
  {
    const regPath = path.join(ROOT, "data", "security", "bundle_archive_register.json");
    if (fs.existsSync(regPath)) {
      const reg = JSON.parse(fs.readFileSync(regPath, "utf8"));
      const n = (reg.bundles || []).length;
      const auditFile = path.join(ROOT, "data", "security", "bundle_audit.json");
      if (fs.existsSync(auditFile)) {
        const hist = JSON.parse(fs.readFileSync(auditFile, "utf8")).historicallyRecorded;
        if (!hist || hist.count !== n) {
          failures.push({ label: "bundle archive:count", needle: `${hist ? hist.count : "none"} recorded / ${n} in register`, reason: "the record of destroyed bundles drifted from its register" });
        }
      }
      const manifestText = fs.readFileSync(path.join(ROOT, "RECOVERY_MANIFEST.md"), "utf8");
      for (const b of reg.bundles) {
        if (!manifestText.includes(b.file)) {
          failures.push({ label: "manifest:destroyed bundle", needle: b.file, reason: "a destroyed bundle vanished from the manifest" });
        }
      }
      if (!/Recorded but no longer present/.test(manifestText)) {
        failures.push({ label: "manifest:archive section", needle: "missing", reason: "no section distinguishing destroyed bundles from live ones" });
      }
    }
  }

  const rateRows = (fs.readFileSync(register, "utf8").match(/^\| \d+ \|/gm) || []).length;
  if (rateRows < 26) {
    failures.push({ label: "missing-evidence rows", needle: String(rateRows), reason: "fewer than 26 cost-head rows" });
  }
}

if (mutationCheck.verdict !== "ALL_MUTANTS_DETECTED") {
  failures.push({ label: "mutation:verdict", needle: mutationCheck.verdict, reason: "security suite failed to detect a reintroduced vulnerability" });
}

// The superseded report must say so, rather than silently contradicting the newer figures.
if (!certText.includes("SUPERSEDED")) {
  failures.push({ label: "cert:superseded-banner", needle: "SUPERSEDED", reason: "prior report lacks supersession banner" });
}
// Only fully-verified-gate exits may be asserted as zero failures.
for (const g of regression.gates) {
  if (g.exitCode !== g.expectedExit) {
    failures.push({ label: "regression:" + g.name, needle: String(g.exitCode), reason: "unexpected exit code recorded" });
  }
}

// The certification report must never contain credential material. Checked by digest, never by
// embedding the values: a list of literals here would recreate the very exposure being audited.
{
  const crypto = require("node:crypto");
  const digests = new Set(
    JSON.parse(fs.readFileSync(path.join(ROOT, "data", "security", "leaked_identifiers.json"), "utf8")).identifiers.map((i) => i.sha256),
  );
  for (const token of (certText + masterText + apexText + releaseText + registerText).match(/[A-Za-z0-9]{6,64}/g) ?? []) {
    if (digests.has(crypto.createHash("sha256").update(token.toUpperCase()).digest("hex"))) {
      failures.push({ label: "cert:secret-leak", needle: "[redacted]", reason: "known leaked identifier present in certification report" });
    }
  }
}

// Structural checks: no placeholders, no unfilled template expressions.
const placeholderPatterns = [/%[A-Z_]+%/, /\$\{[^}]*\}/, /\bTBD\b/, /\bTODO\b/, /lorem ipsum/i];
for (const re of placeholderPatterns) {
  if (re.test(text)) failures.push({ label: "placeholder", needle: String(re), reason: "placeholder or unfilled template in report" });
}

const report = {
  generatedAt: new Date().toISOString(),
  command: "node scripts/verify_report_consistency.js",
  reportFiles: ["APEX_V2_FINAL_AUDIT_REPORT.md", "SECURITY_AND_RESEARCH_CERTIFICATION.md", "FINAL_SECURITY_RESEARCH_AUDIT.md", "APEX_V2_FINAL_CERTIFICATION.md", "RELEASE_READINESS.md", "RELEASE_REGISTER.md"],
  notes,
  claimsChecked: claims.length + apexClaims.length + releaseClaims.length + registerClaims.length + hardeningClaims.length,
  failures,
  verdict: failures.length === 0 ? "REPORT_MATCHES_ARTIFACTS" : "REPORT_ARTIFACT_MISMATCH",
};

/* PAPER-ONLY hardening (OMNI_CONSISTENCY_OUT): trim whitespace, resolve relative paths
 * against cwd, and ensure the parent directory exists so a redirected test output
 * never fails with ENOENT or silently writes to an unexpected location. */
const _omniOut = (process.env.OMNI_CONSISTENCY_OUT || "").trim();
const out = _omniOut ? path.resolve(_omniOut) : path.join(ROOT, "data", "provenance", "report_consistency.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(report, null, 2) + "\n");

console.log(`report consistency: ${report.claimsChecked} claims checked, ${failures.length} failures`);
for (const f of failures) console.log(`  MISMATCH ${f.label}: expected "${f.needle}" (${f.reason})`);
if (notes.length) for (const n of notes) console.log(`note: ${n}`);
console.log(`verdict: ${report.verdict}`);
process.exitCode = failures.length === 0 ? 0 : 1;
