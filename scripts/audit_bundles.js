#!/usr/bin/env node
/**
 * Audits every recovery bundle in backups/ and records the result.
 *
 * The manifest previously described only the newest bundle, which made the inventory inconsistent with
 * reality (five bundles on disk, four in the table). This script is the single source of truth for bundle
 * identity and restore results; RECOVERY_MANIFEST.md renders whatever this writes.
 *
 * Identity is measured on the bundle itself (verify + list-heads + cat-file). Restore results come from an
 * actual clone. With --full it also installs dependencies and runs the security suites inside each clone,
 * which is slow — the artefact records exactly what was executed so a partial run can never look complete.
 *
 * Usage:
 *   node scripts/audit_bundles.js                 # identity + clone + fsck (fast)
 *   node scripts/audit_bundles.js --full          # + npm ci, probes, pytest
 *   node scripts/audit_bundles.js --full --python=/tmp/venv/bin/python
 *
 * Nothing here writes to a bundle, and nothing deletes one.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { execSync, execFileSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const DIR_ARG = (process.argv.find((a) => a.startsWith("--dir=")) || "").split("=")[1];
/* --dir lets the negative tests point the audit at fixtures; the real inventory is always backups/. */
const BACKUPS = DIR_ARG ? path.resolve(DIR_ARG) : path.join(ROOT, "backups");
const OUT = (process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1]
  ? path.resolve((process.argv.find((a) => a.startsWith("--out=")) || "").split("=")[1])
  : path.join(ROOT, "data", "security", "bundle_audit.json");

const FULL = process.argv.includes("--full");
const PYTHON = (process.argv.find((a) => a.startsWith("--python=")) || "").split("=")[1] || null;

const run = (cmd, cwd, opts = {}) =>
  execSync(cmd, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts }).trim();
const tryRun = (cmd, cwd) => { try { return { ok: true, out: run(cmd, cwd) }; } catch (e) { return { ok: false, out: `${e.stdout || ""}${e.stderr || ""}`.trim(), status: e.status }; } };
const grab = (text, re) => { const m = re.exec(text); return m ? m[1] : null; };
const { parsePytestSummary, isGreen } = require("./lib/pytest_summary.js");
const pytestSummary = (text) => parsePytestSummary(text).text;

const bundles = fs.existsSync(BACKUPS)
  ? fs.readdirSync(BACKUPS).filter((f) => f.endsWith(".bundle")).sort()
  : [];

const results = [];
for (const name of bundles) {
  const file = path.join(BACKUPS, name);
  const bytes = fs.readFileSync(file);
  const entry = {
    file: name,
    size: bytes.length,
    sha256: crypto.createHash("sha256").update(bytes).digest("hex"),
    verify: "not verified",
    containsHead: null,
    containsTree: null,
    commits: null,
    trackedFiles: null,
    restore: "not attempted",
    packIntegrity: "not established",
    fsck: "not run",
    checks: {},
  };

  const v = tryRun(`git bundle verify "${file}"`, ROOT);
  // REC-001: `git bundle verify` checks the header and prerequisites only. It reports "is okay" for a bundle
  // whose pack is truncated — a clone fails with "early EOF". So this field is recorded as a prerequisite
  // check, and the integrity claim comes from the restore below, never from this line.
  entry.verify = v.ok ? "prerequisites ok (pack NOT checked by this command)" : "prerequisites FAILED";

  // The commit the bundle's own branch points at.
  const heads = tryRun(`git bundle list-heads "${file}"`, ROOT);
  if (heads.ok) {
    const lines = heads.out.split("\n").filter(Boolean).map((l) => l.trim().split(/\s+/));
    const branchLine = lines.find(([, ref]) => ref === "refs/heads/arena/f721e253-trade") || lines.find(([, ref]) => ref.startsWith("refs/heads/"));
    if (branchLine) entry.containsHead = branchLine[0];
  }
  if (entry.containsHead) {
    const t = tryRun(`git rev-parse ${entry.containsHead}^{tree}`, ROOT);
    entry.containsTree = t.ok ? t.out : null;
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bundle-audit-"));
  const clone = path.join(tmp, "clone");
  try {
    execSync(`git clone -q "${file}" "${clone}"`, { stdio: "ignore" });
    const head = run("git rev-parse HEAD", clone);
    const tree = run("git rev-parse HEAD^{tree}", clone);
    const commits = Number(run("git rev-list --count HEAD", clone));
    const files = Number(run("git ls-files | wc -l", clone));
    const dirty = Number(run("git status --porcelain | wc -l", clone));
    entry.commits = commits;
    entry.trackedFiles = files;
    const fsck = tryRun("git fsck --full", clone);
    entry.fsck = fsck.ok ? "clean" : "ERRORS";
    // A successful clone proves the pack is readable and complete for the refs it carries.
    entry.packIntegrity = "pack readable (clone succeeded, fsck " + entry.fsck + ")";
    entry.restore = `HEAD ${head === entry.containsHead ? "matches" : "MISMATCH"} (${head.slice(0, 7)}) · ` +
      `tree ${tree === entry.containsTree ? "matches" : "MISMATCH"} (${tree.slice(0, 7)}) · ` +
      `${commits} commits · ${files} files · tree ${dirty === 0 ? "clean" : dirty + " entries"}`;

    if (FULL) {
      const ci = tryRun("npm ci --no-audit --no-fund", clone);
      entry.checks.npmCi = ci.ok ? 0 : ci.status ?? 1;
      const prep = tryRun("npm run test:prep", clone);
      entry.checks.testPrep = prep.ok ? 0 : prep.status ?? 1;
      for (const [label, cmd, re] of [
        ["adversarial", "node scripts/adversarial_api_probe.js", /(\d+ passed, \d+ failed)/],
        ["environment", "node scripts/env_config_probe.js", /(\d+ passed, \d+ failed)/],
        ["mutation", "node scripts/mutation_check.js", /(\d+\/\d+ mutants detected)/],
        ["safety", "node scripts/audit_safety.js", /(PAPER_ONLY_SAFETY_PASS|SAFETY_FAILURE)/],
      ]) {
        const r = tryRun(cmd, clone);
        entry.checks[label] = { exit: r.ok ? 0 : r.status ?? 1, result: grab(r.out, re) || "no result" };
      }
      const sec = tryRun("python3 scripts/scan_repo_secrets.py", clone);
      entry.checks.secrets = { exit: sec.ok ? 0 : sec.status ?? 1, result: grab(sec.out, /blocking findings: (\d+)/) ? grab(sec.out, /blocking findings: (\d+)/) + " blocking" : "no result" };
      const con = tryRun("node scripts/verify_report_consistency.js", clone);
      entry.checks.consistency = { exit: con.ok ? 0 : con.status ?? 1, result: grab(con.out, /verdict: (\w+)/) || "no result" };
      if (PYTHON) {
        const pt = tryRun(`QT_QPA_PLATFORM=offscreen ${PYTHON} -m pytest -q`, clone);
        entry.checks.pytest = { exit: pt.ok ? 0 : pt.status ?? 1, result: pytestSummary(pt.out) };
        const t3 = tryRun(`QT_QPA_PLATFORM=offscreen ${PYTHON} -m pytest -q tests/test_phase71_security_closure_verification.py`, clone);
        entry.checks.test003 = { exit: t3.ok ? 0 : t3.status ?? 1, result: pytestSummary(t3.out) };
      } else {
        entry.checks.pytest = { exit: null, result: "not run (no --python given)" };
      }
    }
  } catch (e) {
    entry.restore = `FAILED: ${String(e.message).split("\n")[0]}`;
    entry.packIntegrity = "pack NOT readable (clone failed)";
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  results.push(entry);
  const good = entry.verify.startsWith("prerequisites ok") && /^HEAD matches/.test(entry.restore) && entry.fsck === "clean";
  console.log(`${good ? "ok  " : "FAIL"} ${name}  ${entry.restore}`);
}

if (results.length === 0) {
  // Never replace a recorded inventory with an empty one: an empty result means the bundles are missing, and
  // silently recording "0" would erase the evidence that they existed.
  console.error("ERROR: no bundles found — leaving the existing inventory untouched.");
  process.exit(2);
}
fs.mkdirSync(path.dirname(OUT), { recursive: true });

// Bundles that were audited in an earlier session and no longer exist. They are kept in the artefact so that a
// destroyed backup is never mistaken for one that was never made — the whole point of REC-002.
function archivedBundles(present) {
  const reg = path.join(ROOT, "data", "security", "bundle_archive_register.json");
  if (!fs.existsSync(reg)) return { note: "no archive register", bundles: [] };
  const data = JSON.parse(fs.readFileSync(reg, "utf8"));
  const onDisk = new Set(present.map((b) => b.file));
  const bundles = (data.bundles || []).filter((b) => !onDisk.has(b.file));
  return {
    note: "Recorded in an earlier audit, then destroyed. The files are gone; nothing here is restorable. "
      + "Older bundles carrying the pre-TEST-003 defect are listed with their real failing result, not as green.",
    source: data.recordedInCommit,
    destroyedBy: data.destroyedBy,
    count: bundles.length,
    bundles,
  };
}
fs.writeFileSync(OUT, JSON.stringify({
  generatedAt: new Date().toISOString(),
  command: `node scripts/audit_bundles.js${FULL ? " --full" : ""}${PYTHON ? " --python=" + PYTHON : ""}`,
  full: FULL,
  python: PYTHON,
  note: "Every bundle in backups/ is enumerated. Older bundles are historical snapshots and are not patched. "
    + "IMPORTANT: `git bundle verify` does not read the pack and reports 'is okay' for truncated bundles; the "
    + "integrity claim in this artefact comes from the clone (packIntegrity), never from that command.",
  count: results.length,
  bundles: results,
  historicallyRecorded: archivedBundles(results),
}, null, 2) + "\n");

const bad = results.filter((r) => !r.verify.startsWith("prerequisites ok") || !/^HEAD matches/.test(r.restore) || r.fsck !== "clean");
const failing = FULL ? results.filter((r) => r.checks.pytest && r.checks.pytest.exit !== 0) : [];
console.log(`\n${results.length} bundle(s) audited -> ${path.relative(ROOT, OUT)}${FULL ? " (full)" : " (identity only)"}`);
if (bad.length) {
  console.error(`ERROR: ${bad.length} bundle(s) failed verification or restore: ${bad.map((b) => b.file).join(", ")}`);
  process.exit(1);
}
if (failing.length) {
  // Not an error: historical bundles legitimately contain fixed defects. Reported, never hidden.
  console.log(`note: ${failing.length} bundle(s) contain failing tests (historical): ${failing.map((b) => b.file).join(", ")}`);
}
