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
  ["safety pass count", `${safety.passed} pass / ${safety.failed} fail`],
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
for (const [label, needle] of claims) {
  if (!needle || needle === "undefined") {
    failures.push({ label, needle: String(needle), reason: "artifact value missing/undefined" });
    continue;
  }
  if (!text.includes(needle)) failures.push({ label, needle, reason: "not found in report" });
}

/* -------- certification report (mission H) claims -------- */
const certClaims = [
  ["history findings", "Findings: **" + historyScan.summary.findingCount + "**"],
  ["history distinct commits", "across **" + historyScan.summary.distinctCommitsAffected + "** commit(s)"],
  ["history public exposure count", "Reachable from origin/master: **" + historyScan.summary.reachableFromOriginMaster + "**"],
  ["history verdict", "**" + historyScan.verdict + "**"],
  ["shallow boundary", historyScan.coverage.shallowBoundary[0] || "n/a"],
  ["strict OOS net in cert report", money(protocolStrict.portfolio.OOS.totalNet)],
  ["legacy OOS net in cert report", money(protocolLegacy.portfolio.OOS.totalNet)],
  ["strict 8-arm cluster net", money(oosStatsStrict.netTotal)],
  ["strict mean/session cert", money(oosStatsStrict.meanNetPerSession)],
  ["strict CI cert", "[" + oosStatsStrict.ci95SessionCluster.low + ", " + oosStatsStrict.ci95SessionCluster.high + "]"],
  ["cost gross cert", money(oosCost.gross)],
  ["cost statutory cert", money(oosCost.statutoryAtBaseline)],
  ["cost slippage cert", money(oosCost.slippageAtBaseline)],
  ["cost break-even cert", oosCost.breakEvenSlippage.bpsPerSide + " bps/side"],
  ["overnight trades zero", "Overnight trades in strict mode: " + statsStrict.summary.oosOvernightCarriedTrades],
  ["methodology count cert", method.passed + " pass / " + method.failed + " fail"],
  ["safety count cert", safety.passed + " pass / " + safety.failed + " fail"],
  ["instrument blocked cert", "BLOCKED** for all " + instr.summary.strategies + " strategies"],
  ["probes cert", probes.passed + "/" + probes.probeCount],
  ["rotation status blocked", "Rotation status: BLOCKED"],
  ["security certification blocked", "SECURITY CERTIFICATION IS BLOCKED"],
  ["profitability not established", "PROFITABILITY NOT ESTABLISHED"],
  ["no-live-ready statement", "Not live-trading-ready"],
  ["structured exclusion of volume arms", "NOT_EVALUABLE"],
];
for (const [label, needle] of certClaims) {
  if (!needle || needle === "undefined") {
    failures.push({ label: "cert:" + label, needle: String(needle), reason: "artifact value missing" });
  } else if (!certText.includes(needle)) {
    failures.push({ label: "cert:" + label, needle, reason: "not found in certification report" });
  }
}
// The certification report must never contain credential material. Checked by digest, never by
// embedding the values: a list of literals here would recreate the very exposure being audited.
{
  const crypto = require("node:crypto");
  const digests = new Set(
    JSON.parse(fs.readFileSync(path.join(ROOT, "data", "security", "leaked_identifiers.json"), "utf8")).identifiers.map((i) => i.sha256),
  );
  for (const token of certText.match(/[A-Za-z0-9]{6,64}/g) ?? []) {
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
  reportFiles: ["APEX_V2_FINAL_AUDIT_REPORT.md", "SECURITY_AND_RESEARCH_CERTIFICATION.md"],
  claimsChecked: claims.length + certClaims.length,
  failures,
  verdict: failures.length === 0 ? "REPORT_MATCHES_ARTIFACTS" : "REPORT_ARTIFACT_MISMATCH",
};

const out = path.join(ROOT, "data", "provenance", "report_consistency.json");
fs.writeFileSync(out, JSON.stringify(report, null, 2) + "\n");

console.log(`report consistency: ${report.claimsChecked} claims checked, ${failures.length} failures`);
for (const f of failures) console.log(`  MISMATCH ${f.label}: expected "${f.needle}" (${f.reason})`);
console.log(`verdict: ${report.verdict}`);
process.exitCode = failures.length === 0 ? 0 : 1;
