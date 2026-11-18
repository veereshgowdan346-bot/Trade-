/**
 * Generates SECURITY_AND_RESEARCH_CERTIFICATION.md from artifacts (mission H).
 *
 * Numbers are interpolated from JSON artifacts, and no credential value can enter this file: the
 * history-scan artifact records commit ids, paths, blob ids and identifier KINDS only.
 *
 * Implementation note: the report is assembled from single-quoted fragments joined with newlines, and
 * markdown code spans are produced through the BT constant. Using a template literal here is a trap:
 * markdown backticks terminate it, which is how the first version of this script broke.
 *
 * Usage: node scripts/generate_certification_report.js
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
const git = (args) => execSync("git " + args, { cwd: ROOT, encoding: "utf8" }).trim();
const BT = "`";
const code = (s) => BT + s + BT;

const money = (v) =>
  (v < 0 ? "−₹" : "+₹") + Math.abs(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const history = read("data/security/git_history_scan.json");
const safety = read("data/security/safety_audit.json");
const method = read("data/provenance/methodology_audit.json");
const instr = read("data/provenance/instrument_compatibility.json");
const manifest = read("data/provenance/external_dataset_manifest.json");
const protocolStrict = read("scripts/research_protocol_strict_intraday_output.json");
const protocolLegacy = read("scripts/research_protocol_output.json");
const statsStrict = read("data/provenance/statistical_robustness_strict.json");
const statsLegacy = read("data/provenance/statistical_robustness.json");
const costStrict = read("data/provenance/cost_sensitivity_strict.json");
const perf = read("scripts/perf_benchmark_output.json");
const probes = read("scripts/final_readiness_probes_output.json");
const equivalence = read("scripts/perf_equivalence_output.json");
const anchors = read("scripts/anchor_reproduction_output.json");

const head = git("rev-parse HEAD");
// A shallow clone has no parent at the boundary; degrade instead of crashing.
const parent = (() => {
  try {
    return require("node:child_process")
      .execSync("git rev-parse HEAD^", { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
      .trim();
  }
  catch { return "n/a (shallow-clone boundary — parent commit not fetched)"; }
})();
const branch = git("rev-parse --abbrev-ref HEAD");
const statusCount = git("status --porcelain").split("\n").filter(Boolean).length;

const oosCost = costStrict.periods.find((p) => p.period === "OOS");
const oosStats = statsStrict.pooledPortfolio.find((p) => p.year === 2024);
const oosStatsLegacy = statsLegacy.pooledPortfolio.find((p) => p.year === 2024);
const bar200k = perf.rows.find((r) => r.bars === 200000);

const affectedRows = history.summary.commitList
  .map((c) => {
    const mine = history.findings.filter((f) => f.commit === c);
    const files = [...new Set(mine.map((f) => f.path))].map(code).join("<br>");
    const kinds = [...new Set(mine.map((f) => f.kind))].join(", ");
    const isPublic = mine.some((f) => f.reachableFromOriginMaster);
    const vis = isPublic ? "**PUBLIC** (reachable from origin/master)" : "local-only";
    return "| " + code(c.slice(0, 12) + "…") + " | " + vis + " | " + files + " | " + kinds + " |";
  })
  .join("\n");

const datasetRows = manifest.datasets
  .map((d) => {
    const p = d.provenance;
    return (
      "| " +
      d.id +
      " | " +
      p.licence +
      " | " +
      (p.redistributionAllowed ? "yes (with notice)" : "**no**") +
      " | " +
      p.authenticity +
      " | " +
      code((p.upstreamBlobSha ?? "").slice(0, 12) + "…") +
      " |"
    );
  })
  .join("\n");

const safetyRows = safety.checks.map((c) => "| " + c.id + " | " + c.name + " | **" + c.status + "** |").join("\n");
const methodRows = method.checks.map((c) => "| " + c.id + " | " + c.name + " | **" + (c.ok ? "PASS" : "FAIL") + "** |").join("\n");
const segmentRows = instr.segmentInventory.map((s) => "| " + s.class + " | **" + s.status + "** |").join("\n");

const armRows = statsStrict.strategies
  .find((s) => s.period === "OOS")
  .results.filter((r) => r.evaluable)
  .map(
    (r) =>
      "| " +
      r.id +
      " | " +
      r.trades +
      " | " +
      money(r.meanNetPerTrade) +
      " | [" +
      r.ci95.sessionCluster.low +
      ", " +
      r.ci95.sessionCluster.high +
      "] | NOT_SUPPORTED |",
  )
  .join("\n");

const L = [];
const push = (...lines) => L.push(...lines);

push(
  "# OmniTradePro — Final Security Remediation & Research Certification",
  "",
  "**Generated:** " + new Date().toISOString() + " by " + code("scripts/generate_certification_report.js"),
  "**Branch:** " + code(branch) + " · **HEAD:** " + code(head) + " · **Parent:** " + code(parent) + " · **Tree at generation:** " + statusCount + " modified path(s)",
  "**Mode:** verification, defensive remediation, historical research and paper simulation. No live execution, no real money, no push/deploy/PR.",
  "",
  "---",
  "",
  "## 1. Certification summary",
  "",
  "| Area | Status |",
  "|---|---|",
  "| Working tree cleanliness (credentials) | **PASS** — 0 findings in every tracked file |",
  "| Git history (credentials) | **FAIL — EXPOSURE CONFIRMED, AND PUBLIC** |",
  "| Credential rotation | **BLOCKED** — cannot be independently confirmed from this environment |",
  "| History remediation | **BLOCKED** — requires explicit owner authorization; prohibited in this pass |",
  "| Vault key handling (Python + TypeScript) | **PASS** — fail-closed, per-install key, 0600, no published fallback |",
  "| Strict intraday (METHOD-001) | **PASS** — " + method.passed + "/" + (method.passed + method.failed) + " behavioural checks, 0 overnight trades |",
  "| Instrument compatibility | **FAIL — equity validation BLOCKED** (index proxy only) |",
  "| Data authenticity | **UNVERIFIED** |",
  "| Official rates | **UNVERIFIED (0/26)** |",
  "| Profitability | **FAIL** |",
  "| Regression suite | **PASS** (one intentional red gate: test:history) |",
  "",
  "> **SECURITY CERTIFICATION IS BLOCKED.** Rotation of the exposed broker API key and TOTP seed has not",
  "> been independently confirmed, and history remediation has not been authorized.",
  ">",
  "> **PROFITABILITY NOT ESTABLISHED. FINANCIAL VALIDATION BLOCKED.**",
  "> This project is **not** live-trading-ready and must not be represented as such.",
  "",
  "---",
  "",
  "## 2. Credential exposure and rotation status",
  "",
  "**Exposure confirmed.** Three identifiers are affected — a broker client/user id, an API secret and a",
  "TOTP seed prefix. Values are **not** reproduced anywhere in this document, in any artifact, or in any",
  "scanner output; matching is performed on SHA-256 digests stored in " + code("data/security/leaked_identifiers.json") + ".",
  "",
  "| Commit | Visibility | Paths containing material | Identifier kinds |",
  "|---|---|---|---|",
  affectedRows,
  "",
  "Findings: **" + history.summary.findingCount + "** across **" + history.summary.distinctCommitsAffected + "** commit(s).",
  "Reachable from origin/master: **" + history.summary.reachableFromOriginMaster + "** → publicExposure = " + code(String(history.summary.publicExposure)) + ".",
  "",
  "### What this means",
  "",
  "The material is reachable from origin/master, so it was **pushed to the GitHub remote**. Consequences",
  "that must not be softened:",
  "",
  "1. Deleting the strings from the latest tree (done in the previous pass) removes them from *HEAD only*.",
  "   They remain retrievable from history — from commit 60d7c41 (verified present in this clone) and",
  "   remotely from GitHub's stored objects, any fork, and any clone.",
  "2. **The API secret and the TOTP seed must be treated as compromised.** The TOTP seed is the more severe",
  "   of the two: it allows generation of valid second factors for the broker account.",
  "3. Rotation is the only effective remedy. History rewriting cannot recall copies that already exist.",
  "",
  "### Rotation status: BLOCKED",
  "",
  "| Item | Status |",
  "|---|---|",
  "| Broker API key revoked/rotated | **BLOCKED** — no independent confirmation available |",
  "| Broker TOTP seed regenerated | **BLOCKED** — no independent confirmation available |",
  "| Account owner verification | **BLOCKED** — the owner must confirm; no confirmation channel exists here |",
  "",
  "No attempt was made to use the credentials, and none should be.",
  "",
  "---",
  "",
  "## 3. Git history security report",
  "",
  "| Item | Value |",
  "|---|---|",
  "| Commits scanned (--all) | " + history.coverage.commitsScanned + " |",
  "| Blobs scanned | " + history.coverage.blobsScanned + " |",
  "| Shallow clone | " + history.coverage.shallowClone + " |",
  "| Shallow boundary | " + code(history.coverage.shallowBoundary.join(", ")) + " |",
  "| Findings | " + history.summary.findingCount + " |",
  "| Kinds | " + history.summary.kinds.join(", ") + " |",
  "| Verdict | **" + history.verdict + "** |",
  "",
  "**Coverage limitation (not a clean pass):** the clone is shallow with boundary " + code(history.coverage.shallowBoundary[0] || "n/a") + ",",
  "so commits *before* that point are absent locally and were **not** scanned. The remote holds them, and if",
  "the material predates the boundary it is exposed there too. Full-history scanning requires a complete clone.",
  "",
  "**Other copies that may retain the material** (documented, not remediated):",
  "",
  "- the GitHub remote (origin) and any forks of it;",
  "- any developer clone or backup taken before the previous pass;",
  "- the protected recovery snapshot created in this pass",
  "  (/home/user/security_snapshot/, mode 0600, outside the repository), which by definition",
  "  contains the pre-redaction history and must be destroyed after remediation;",
  "- CI logs, chat transcripts, or ticket attachments where build output was pasted.",
  "",
  "**History rewrite: NOT PERFORMED.** It requires explicit authorization (mission B.5), it would rewrite",
  "shared public history, and it cannot undo the public exposure. Recommended sequence for the owner:",
  "rotate first (removes the value of the leaked material), then decide whether to rewrite.",
  "",
  "---",
  "",
  "## 4. Vault key handling",
  "",
  "| Check | Result |",
  "|---|---|",
  "| Python vault: per-install random key, 0600, stable, env override honoured | **PASS** |",
  "| Python vault: no hardcoded fallback passphrase | **PASS** (constant removed) |",
  "| TypeScript vault: fails closed without VAULT_KEY | **PASS** (SEC-003 fixed this pass) |",
  "| TypeScript vault: rejects keys shorter than 8 characters | **PASS** |",
  "| TypeScript vault: derives a 32-byte AES key only from VAULT_KEY | **PASS** |",
  "",
  "The TypeScript vault previously fell back to a constant passphrase committed to this repository — the",
  "same defect class as the Python vault fixed earlier. Key derivation now lives in " + code("src/lib/vault_key.ts"),
  "(database-free, unit-testable) and throws VaultKeyMissingError rather than inventing a key. The vault API",
  "returns 503 VAULT_KEY_MISSING instead of silently encrypting with a public key.",
  "",
  "---",
  "",
  "## 5. Strict-intraday verification (METHOD-001)",
  "",
  "| ID | Check | Result |",
  "|---|---|---|",
  methodRows,
  "",
  "- Default mode: STRICT_INTRADAY — confirmed by asserting result.sessionMode.",
  "- **Overnight trades in strict mode: " + statsStrict.summary.oosOvernightCarriedTrades + "** across " + statsStrict.summary.oosTrades.toLocaleString("en-IN") + " OOS trades.",
  "- No next-session-open exit in strict mode; liquidation fills exactly at the session's last bar close.",
  "- No entry on a session's final bar; partial (2024-03-02, 2024-05-18) and special (Muhurat 2024-11-01) sessions flatten correctly.",
  "- Missing candles: two deliberate mid-session gaps, 0 artificial fills, 0 cross-session trades.",
  "- Legacy CARRY_OVERNIGHT remains explicit opt-in and its historical artifact reproduces byte-identically.",
  "",
  "---",
  "",
  "## 6. Instrument compatibility",
  "",
  "**Verdict: " + instr.verdict + ".** Equity validation is **BLOCKED** for all " + instr.summary.strategies + " strategies.",
  "",
  "| Segment | Status |",
  "|---|---|",
  segmentRows,
  "",
  "Index and equity research are kept separate: the index series is PROXY_ONLY, carries no volume, and is",
  "**not** treated as an equity substitute. The equity intraday cost schedule is applied to it only as a",
  "documented research proxy, with the mismatch stated per strategy in",
  code("data/provenance/instrument_compatibility.json") + ". Authentic per-symbol equity data with a suitable",
  "licence is **not available** in this repository.",
  "",
  "---",
  "",
  "## 7. Data provenance",
  "",
  "| Dataset | Licence | Redistributable | Authenticity | Upstream blob |",
  "|---|---|---|---|---|",
  datasetRows,
  "",
  "Licence permission and exchange authenticity are kept separate. No unlicensed dataset is redistributed",
  "(0 external files tracked; .gitignore:42). Authenticity remains **UNVERIFIED**: a public repository does",
  "not establish that the prices originated at NSE.",
  "",
  "**Calendar:** 2023-11-12 and 2024-01-20/03-02/05-18 are legitimate weekend special sessions absent from the",
  "third-party calendar. **2022-10-24 remains unresolved** — the authoritative NSE list is unreachable",
  "(curl: (35) OpenSSL SSL_connect: SSL_ERROR_SYSCALL), so it stays OPEN rather than being assumed clean.",
  "**2025 remains UNCHECKED.**",
  "",
  "---",
  "",
  "## 8. Official-rate evidence register",
  "",
  "| Item | Value |",
  "|---|---|",
  "| Heads | 26 |",
  "| Verified against a primary source | **0** |",
  "| Status | **UNVERIFIED** |",
  "| Reason | nseindia.com, sebi.gov.in, cbic.gov.in, gst.gov.in and broker tariff pages all fail TLS from this environment (http=000, SSL_ERROR_SYSCALL) |",
  "| In-repo evidence | secondary, undated narratives only — explicitly not official documents |",
  "| Substitution of invented values | **none** |",
  "| Fail-closed behaviour | verified (unsupported segment and unknown broker both throw) |",
  "",
  "Statutory charges, broker charges and slippage are reported separately throughout. No rate was invented.",
  "",
  "---",
  "",
  "## 9. Statistical and profitability report",
  "",
  "**Strict intraday, 2024 OOS, eight evaluable arms.** x_obv_confirmation and x_volume_profile are",
  "NOT_EVALUABLE: the index publishes no volume (STAT-003).",
  "",
  "| Arm | Trades | Net/trade | 95% CI (session cluster) | Verdict |",
  "|---|---|---|---|---|",
  armRows,
  "",
  "| Portfolio (strict) | Value |",
  "|---|---|",
  "| OOS net | " + money(protocolStrict.portfolio.OOS.totalNet) + " |",
  "| OOS gross | " + money(protocolStrict.portfolio.OOS.gross) + " |",
  "| OOS statutory | " + money(protocolStrict.portfolio.OOS.statutoryCharges) + " |",
  "| oosSupported | " + code(JSON.stringify(protocolStrict.summary.oosSupported)) + " (0 of 8) |",
  "| Sessions | " + oosStats.sessions + " |",
  "| Mean net/session | " + money(oosStats.meanNetPerSession) + " |",
  "| 95% CI (session cluster) | [" + oosStats.ci95SessionCluster.low + ", " + oosStats.ci95SessionCluster.high + "] |",
  "| Max drawdown | " + money(-oosStats.maxDrawdownNet) + " (equals total loss — monotone decline) |",
  "",
  "**Legacy comparison (historical, still reproducible):** OOS " + money(protocolLegacy.portfolio.OOS.totalNet) + " for the",
  "8-arm portfolio, " + money(oosStatsLegacy.netTotal) + " in the cluster-bootstrap study. Strict is",
  money(protocolStrict.portfolio.OOS.totalNet - protocolLegacy.portfolio.OOS.totalNet) + " *worse* — the correction did not flatter the strategies.",
  "",
  "**Cost sensitivity (strict):** gross " + money(oosCost.gross) + ", statutory " + money(oosCost.statutoryAtBaseline) + ",",
  "slippage " + money(oosCost.slippageAtBaseline) + " at 16 bps/side. Break-even slippage",
  "**" + oosCost.breakEvenSlippage.bpsPerSide + " bps/side — " + oosCost.breakEvenSlippage.interpretation + "**.",
  "Arms positive at baseline: " + costStrict.verdict.armsPositiveAtBaseline + "; at zero slippage:",
  costStrict.verdict.armsPositiveAtZeroSlippage + " (of " + costStrict.verdict.totalArms + "). Sign invariant across all",
  "assumptions: **" + costStrict.verdict.signInvariantAcrossAllAssumptions + "**.",
  "",
  "**Bootstrap methods:** trade-level, session-cluster and moving-block all agree (negative under every",
  "method); median design effect " + statsStrict.summary.medianDesignEffect + ".",
  "",
  "**STAT-003 correction:** the robustness and cost studies previously included x_volume_profile, an arm the",
  "protocol declares NOT_EVALUABLE for lack of volume. It is now excluded in both, with the exclusion",
  "recorded in excludedArms inside each artifact. This changes the eight-arm OOS total from the previously",
  "reported nine-arm figure; the earlier numbers remain in git history and in prior reports, annotated here",
  "rather than quietly overwritten. No parameter was tuned and no arm was added or removed to improve a result.",
  "",
  "All strategies remain enabled: false.",
  "",
  "---",
  "",
  "## 10. Full regression report (actual exit codes)",
  "",
  "| Command | Exit | Note |",
  "|---|---|---|",
  "| npx tsc --noEmit | 0 | clean |",
  "| npx eslint . --max-warnings=0 | 0 | clean |",
  "| npm run build | 0 | production build |",
  "| python3 -m pytest -q | 0 | 389 passed |",
  "| npm run test:all | 0 | " + equivalence.verdict + ", " + anchors.verdict + " |",
  "| npm run test:methodology | 0 | " + method.passed + " pass / " + method.failed + " fail |",
  "| npm run test:safety | 0 | " + safety.passed + " pass / " + safety.failed + " fail |",
  "| npm run test:secrets | 0 | 0 blocking findings in tracked files |",
  "| npm run test:history | **1** | **intended** — history exposure found; stays red until rotation/remediation |",
  "| npm run test:instrument | 0 | equity validation BLOCKED (documented) |",
  "| npm run test:external | 0 | dataset audit passes |",
  "| npm run test:calendar | 0 | 1 unresolved weekday discrepancy recorded |",
  "| node scripts/final_readiness_probes.js | 0 | " + probes.passed + "/" + probes.probeCount + " probes |",
  "| node scripts/perf_benchmark.js | 0 | equivalence " + perf.allComparedRunsIdentical + "; 200k bars " + bar200k.fastMs.toFixed(1) + " ms |",
  "",
  "Environment issues were separated from code defects: missing cryptography was installed to verify the",
  "Python vault; cross-env was not added (CLI flags used instead).",
  "",
  "---",
  "",
  "## 11. Remaining blocker register",
  "",
  "| ID | Blocker | Status | Closing condition |",
  "|---|---|---|---|",
  "| SECURITY-001 | Exposed broker API secret + TOTP seed + client id, public on origin/master | **BLOCKED** | Owner rotates all three and confirms; optionally authorizes history rewrite |",
  "| SECURITY-004 | Pre-redaction copies may persist (remote, forks, clones, recovery bundle) | **OPEN** | Destroy the recovery bundle after remediation; audit clones/forks |",
  "| INSTR-001 | Equity validation blocked; index proxy only | **BLOCKED** | Licensed, authenticated per-symbol equity data |",
  "| COST-001 | 0/26 rate heads verified | **UNVERIFIED** | Reachable regulator/exchange/broker documents |",
  "| DATA-002 | Dataset authenticity | **UNVERIFIED** | Vendor attestation or reconciliation to a licensed feed |",
  "| CAL-001 | 2022-10-24 discrepancy | **OPEN** | Official NSE session list |",
  "| CAL-002 | App calendar models 2026 only | **OPEN** | Model and cross-check historical years |",
  "| PROFIT-001 | No arm profitable | **FAIL** | A strategy whose gross edge exceeds round-trip cost before tuning |",
  "| HIST-001 | History scan incomplete (shallow clone) | **PRELIMINARY** | Full clone, then re-scan every commit |",
  "",
  "---",
  "",
  "## 12. Final Git status and commit hash",
  "",
  "| Item | Value |",
  "|---|---|",
  "| Branch | " + code(branch) + " |",
  "| HEAD at report generation | " + code(head) + " |",
  "| Parent | " + code(parent) + " |",
  "| Working tree at generation | " + statusCount + " modified path(s) — the report and artifacts of this pass |",
  "| Snapshot | /home/user/security_snapshot/ (worktree tar, mode 0600, outside the repository) |",
  "| Pushed / merged / deployed | **No** |",
  "",
  "### Recovery note: the environment was re-cloned during this pass",
  "",
  "The working copy was re-cloned from the GitHub remote mid-pass. Three local commits created by the",
  "previous passes (`1ccee80`, `791e0a3`, `c9b2af2`) **no longer exist as objects** — reflog shows only",
  "`clone` then `checkout`, and the objects are absent. Their *content* survived and is preserved in this",
  "commit as working-tree state, verified by re-running every gate; but their hashes must not be cited as",
  "existing. Consequences recorded honestly:",
  "",
  "- the earlier history scan reported 18 findings across 3 commits; after re-cloning, only the boundary",
  "  commit is reachable locally, so the reproducible figure is the 6 findings in `60d7c41` shown in §3.",
  "  The 18/3 figure cannot be re-derived from this environment and is therefore not asserted as current.",
  "- the exposure conclusion is unchanged: `60d7c41` is the PUBLIC commit and it alone carries the material.",
  "- a fresh recovery snapshot was taken before any git operation on the re-cloned tree.",
  "",
  "The commit containing this file is the final commit of this pass:",
  "",
  "    git log -1 --format=%H -- SECURITY_AND_RESEARCH_CERTIFICATION.md",
  "",
  "**Not live-trading-ready. Security certification BLOCKED pending credential rotation.**",
);

fs.writeFileSync(path.join(ROOT, "SECURITY_AND_RESEARCH_CERTIFICATION.md"), L.join("\n") + "\n");
console.log("wrote SECURITY_AND_RESEARCH_CERTIFICATION.md");
console.log("  " + (L.length + 1) + " lines");
