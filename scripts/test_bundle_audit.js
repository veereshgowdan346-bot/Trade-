#!/usr/bin/env node
/**
 * Negative tests for the bundle-inventory tooling.
 *
 * Everything here works on fixtures in the OS temp directory. The real backups/ directory is only ever read
 * (once, to build a valid fixture); no fixture is created inside it and nothing is deleted from it.
 *
 * The point: prove that the tooling FAILS when it should. A backup tool that reports success on a corrupted,
 * missing or extra bundle is worse than no tool, because it converts "we have no backups" into "we have
 * backups" — which is precisely the class of error this project keeps finding.
 */
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const { parsePytestSummary, isGreen } = require("./lib/pytest_summary.js");
const { checkInventory } = require("./lib/inventory_guard.js");

let passed = 0;
const failures = [];
const check = (name, fn) => {
  try {
    const detail = fn();
    passed += 1;
    console.log(`  PASS  ${name}${detail ? " — " + detail : ""}`);
  } catch (e) {
    failures.push({ name, error: e.message });
    console.log(`  FAIL  ${name} — ${e.message}`);
  }
};
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };

const runAudit = (dir) => {
  const out = path.join(dir, "audit.json");
  try {
    execFileSync(process.execPath, [path.join(__dirname, "audit_bundles.js"), `--dir=${dir}`, `--out=${out}`], { encoding: "utf8", stdio: "pipe" });
    return { exit: 0, out };
  } catch (e) {
    return { exit: e.status ?? 1, out };
  }
};

/* A small but genuine repository to bundle — built in temp, never touching the workspace. */
function makeFixtureRepo(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const g = (cmd) => execFileSync("bash", ["-lc", `cd "${dir}" && ${cmd}`], { encoding: "utf8" });
  g("git init -q -b main");
  g("git config user.email fixture@example.invalid");
  g("git config user.name fixture");
  fs.writeFileSync(path.join(dir, "a.txt"), "one\n");
  g("git add a.txt && git commit -q -m one");
  return dir;
}

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "bundle-audit-tests-"));
let fixtureRepo;
try {
  console.log("\n--> 1. Inventory guard: manifest vs disk");
  check("equal sets pass", () => {
    const manifest = "| `a.bundle` | 1 |\n| `b.bundle` | 2 |";
    const r = checkInventory(manifest, ["a.bundle", "b.bundle"]);
    assert(r.ok, `expected ok, got ${r.errors.join("; ")}`);
    return "2 = 2";
  });
  check("bundle on disk but absent from the manifest fails (the original defect)", () => {
    const r = checkInventory("| `a.bundle` | 1 |", ["a.bundle", "b.bundle"]);
    assert(!r.ok && r.errors.some((e) => e.includes("b.bundle")), "extra bundle on disk was not reported");
    return r.errors[0];
  });
  check("manifest naming a bundle that is not on disk fails", () => {
    const r = checkInventory("| `a.bundle` | 1 |\n| `ghost.bundle` | 2 |", ["a.bundle"]);
    assert(!r.ok && r.errors.some((e) => e.includes("ghost.bundle")), "phantom bundle was not reported");
    return r.errors[0];
  });
  check("duplicate manifest rows fail", () => {
    const r = checkInventory("| `a.bundle` | 1 |\n| `a.bundle` | 2 |", ["a.bundle"]);
    assert(!r.ok && r.errors.some((e) => e.includes("more than once")), "duplicate row was not reported");
    return r.errors[0];
  });
  check("empty disk inventory is an error, never a pass", () => {
    const r = checkInventory("", []);
    assert(!r.ok, "empty inventory passed");
    return r.errors[0];
  });
  check("non-bundle files are ignored", () => {
    const r = checkInventory("| `a.bundle` | 1 |", ["a.bundle", "notes.txt", "a.bundle.sha256"]);
    assert(r.ok, `expected ok, got ${r.errors.join("; ")}`);
    return "notes ignored";
  });

  console.log("\n--> 2. pytest summary parsing: a summary containing a failure is never green");
  const cases = [
    ["1 failed, 388 passed in 2.49s", "388 passed, 1 failed", false],
    ["390 passed in 1.55s", "390 passed", true],
    ["2 passed, 1 skipped in 0.31s", "2 passed, 1 skipped", true],
    ["3 errors in 0.51s", "3 error(s)", false],
    ["1 failed, 2 passed, 1 skipped, 3 warnings in 0.40s", "2 passed, 1 failed, 1 skipped", false],
    ["no tests ran in 0.01s", "no summary", false],
    ["", "no summary", false],
    ["10 passed, 2 xfailed", "10 passed, 2 xfailed", true],
  ];
  for (const [input, expected, green] of cases) {
    check(`parse ${JSON.stringify(input)}`, () => {
      const r = parsePytestSummary(input);
      assert(r.text === expected, `expected ${JSON.stringify(expected)}, got ${JSON.stringify(r.text)}`);
      assert(isGreen(r) === green, `green expected ${green}, got ${isGreen(r)}`);
      return r.text;
    });
  }
  check("the old regex bug cannot recur: 1 failed before 388 passed is not green", () => {
    const r = parsePytestSummary("1 failed, 388 passed in 2.49s");
    assert(r.counts.failed === 1 && r.counts.passed === 388, "counters not extracted independently");
    assert(!isGreen(r), "reported green");
    return "388 passed, 1 failed";
  });

  console.log("\n--> 3. Audit tool: fixtures outside backups/");
  fixtureRepo = makeFixtureRepo(path.join(tmpRoot, "repo"));
  const goodBundle = path.join(tmpRoot, "good.bundle");
  execFileSync("bash", ["-lc", `cd "${fixtureRepo}" && git bundle create "${goodBundle}" --all`], { encoding: "utf8" });

  check("a valid fixture bundle audits cleanly and is recorded", () => {
    const dir = path.join(tmpRoot, "case-good");
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(goodBundle, path.join(dir, "good.bundle"));
    const r = runAudit(dir);
    assert(r.exit === 0, `expected exit 0, got ${r.exit}`);
    const artefact = JSON.parse(fs.readFileSync(r.out, "utf8"));
    assert(artefact.count === 1, `expected 1 bundle, got ${artefact.count}`);
    assert(artefact.bundles[0].verify.startsWith("prerequisites ok"), "prerequisite check not recorded");
    assert(/pack readable/.test(artefact.bundles[0].packIntegrity), "pack integrity not established by the clone");
    assert(/^HEAD matches/.test(artefact.bundles[0].restore), `restore not matching: ${artefact.bundles[0].restore}`);
    return "1 bundle, verified, restored";
  });

  check("an empty directory fails the audit (and does not overwrite a recorded inventory)", () => {
    const dir = path.join(tmpRoot, "case-empty");
    fs.mkdirSync(dir, { recursive: true });
    const r = runAudit(dir);
    assert(r.exit === 2, `expected exit 2, got ${r.exit}`);
    assert(!fs.existsSync(r.out), "an empty run must not write an inventory artefact");
    return "exit 2, nothing written";
  });

  check("a corrupted bundle fails the audit", () => {
    const dir = path.join(tmpRoot, "case-corrupt");
    fs.mkdirSync(dir, { recursive: true });
    const bad = path.join(dir, "corrupt.bundle");
    const bytes = fs.readFileSync(goodBundle);
    fs.writeFileSync(bad, bytes.subarray(0, Math.floor(bytes.length / 3)));
    const r = runAudit(dir);
    assert(r.exit === 1, `expected exit 1, got ${r.exit}`);
    const artefact = JSON.parse(fs.readFileSync(r.out, "utf8"));
    const b = artefact.bundles[0];
    // REC-001: `git bundle verify` reports "is okay" even for a truncated pack, so the artefact must not treat
    // that command as the integrity proof. The clone is what fails.
    assert(b.verify.startsWith("prerequisites ok"), `unexpected verify text: ${b.verify}`);
    assert(/clone failed|NOT readable/.test(b.packIntegrity), `pack integrity not reported as unreadable: ${b.packIntegrity}`);
    assert(!/^HEAD matches/.test(b.restore), "corrupted bundle was reported as restored");
    return "verify says okay, clone fails — recorded correctly";
  });

  check("an extra bundle is enumerated, not ignored", () => {
    const dir = path.join(tmpRoot, "case-extra");
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(goodBundle, path.join(dir, "one.bundle"));
    fs.copyFileSync(goodBundle, path.join(dir, "two.bundle"));
    const r = runAudit(dir);
    const artefact = JSON.parse(fs.readFileSync(r.out, "utf8"));
    assert(artefact.count === 2, `expected 2 bundles, got ${artefact.count}`);
    return "2 enumerated";
  });

  check("a bundle-shaped file that is not a bundle fails cleanly", () => {
    const dir = path.join(tmpRoot, "case-notabundle");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "fake.bundle"), "this is not a git bundle\n");
    const r = runAudit(dir);
    assert(r.exit === 1, `expected exit 1, got ${r.exit}`);
    return "exit 1";
  });

  console.log("\n--> 4a. The destroyed-bundle archive is not read as a missing bundle");
  check("archived names sit outside the live inventory, while a real gap still fails", () => {
    const LIVE = "## Recovery bundles\n\n| File | Bytes |\n|---|---|\n| `repo_all_refs_A.bundle` | 10 |\n";
    const ARCHIVE = "\n**Recorded but no longer present.**\n\n| `repo_all_refs_OLD.bundle` | 9 |\n";
    const inv = checkInventory(LIVE, ["repo_all_refs_A.bundle"]);
    assert(inv.errors.length === 0, `live table rejected: ${inv.errors.join("; ")}`);
    const both = checkInventory(LIVE + ARCHIVE, ["repo_all_refs_A.bundle"]);
    assert(both.errors.some((e) => e.includes("OLD")), "unsliced text must trip the guard — that is why the verifier slices it");
    const missing = checkInventory(LIVE, []);
    assert(missing.errors.length > 0, "empty disk did not fail");
    return "live table agrees with disk; archive kept separate; genuine gap still caught";
  });

  console.log("\n--> 4. Stale manifest data is caught by the verifier");
  check("verifier fails when backups/ holds a bundle the manifest does not list", () => {
    const dir = path.join(tmpRoot, "case-stale");
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(goodBundle, path.join(dir, "unlisted.bundle"));
    let exit = 0;
    try {
      execFileSync(process.execPath, [path.join(__dirname, "verify_report_consistency.js")], {
        encoding: "utf8",
        stdio: "pipe",
        env: { ...process.env, OMNI_BACKUP_DIR: dir },
      });
    } catch (e) { exit = e.status ?? 1; }
    assert(exit !== 0, "verifier passed with an unlisted bundle on disk");
    return `exit ${exit}`;
  });
} finally {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
}

console.log(`\nbundle-audit tests: ${passed} passed, ${failures.length} failed`);
if (failures.length) {
  for (const f of failures) console.log(`  - ${f.name}: ${f.error}`);
  process.exit(1);
}
