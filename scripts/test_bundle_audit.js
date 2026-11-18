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
const { checkInventory, classifyInventory } = require("./lib/inventory_guard.js");
const { checkHandoff } = require("./lib/handoff_guard.js");

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

  console.log("\n--> 3b. An absent inventory can be recorded, but never as success");
  check("--record-absence writes NO_BUNDLE_EXISTS and exits 3, and the flag is required", () => {
    const dir = path.join(tmpRoot, "case-absent");
    fs.mkdirSync(dir, { recursive: true });
    const out = path.join(dir, "audit.json");
    fs.writeFileSync(out, "{\"sentinel\":true}\n");
    // Without the flag: refusal, exit 2, previous artefact untouched.
    let silentExit = 0;
    try {
      execFileSync(process.execPath, [path.join(__dirname, "audit_bundles.js"), `--dir=${dir}`, `--out=${out}`], { stdio: "pipe" });
    } catch (e) { silentExit = e.status ?? 1; }
    assert(silentExit === 2, `expected exit 2 without the flag, got ${silentExit}`);
    assert(fs.readFileSync(out, "utf8").includes("sentinel"), "refusal overwrote the existing inventory");
    // With the flag: explicit absence, exit 3 (never 0), archive attached.
    let exit = 0;
    try {
      execFileSync(process.execPath, [path.join(__dirname, "audit_bundles.js"), `--dir=${dir}`, `--out=${out}`, "--record-absence"], { stdio: "pipe", cwd: __dirname });
    } catch (e) { exit = e.status ?? 1; }
    const artefact = JSON.parse(fs.readFileSync(out, "utf8"));
    assert(exit === 3, `expected exit 3 for a recorded absence, got ${exit}`);
    assert(artefact.state === "NONE_PRESENT" && artefact.verdict === "NO_BUNDLE_EXISTS", "absence not labelled");
    assert(artefact.count === 0 && artefact.bundles.length === 0, "absence recorded with invented bundles");
    assert(artefact.historicallyRecorded && artefact.historicallyRecorded.count > 0, "destroyed bundles dropped from the absence record");
    return "refuses silently, records loudly, exits non-zero";
  });

  check("the archive register qualifies its own evidence and never claims a restore", () => {
    const reg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "data", "security", "bundle_archive_register.json"), "utf8"));
    assert(reg.count === reg.bundles.length, "register count disagrees with its own rows");
    assert(/measurement, not a copy/.test(reg.evidencePolicy), "evidence policy is missing");
    for (const b of reg.bundles) {
      assert(b.evidence && b.evidence.kind, `${b.file} has no evidence provenance`);
      assert(typeof b.evidence.sourceInspectableNow === "boolean", `${b.file} does not say whether its source is inspectable`);
      assert(!/restore/i.test(JSON.stringify(b.evidence)), `${b.file} claims a restore it cannot have had`);
    }
    const restored = reg.bundles.filter((b) => b.restored === true).length;
    assert(restored === 0, "a destroyed bundle is marked as restored");
    return `${reg.count} rows, ${reg.bundles.filter((b) => !b.evidence.sourceInspectableNow).length} unverifiable beyond the record`;
  });

  console.log("\n--> 3c. Every way an inventory can be missing is classified, and only one of them is innocent");
  check("an absent backups/ is LOST unless it is a declared absence or an admitted clone", () => {
    const c = (o) => classifyInventory(o).state;
    assert(c({ dirExists: true, declared: 3, statesAbsence: false, restoredClone: false }) === "PRESENT", "present dir not recognised");
    assert(c({ dirExists: false, declared: null, statesAbsence: false, restoredClone: false }) === "UNDECLARED", "missing count line accepted");
    assert(c({ dirExists: false, declared: 0, statesAbsence: false, restoredClone: false }) === "UNDECLARED", "silent zero accepted");
    assert(c({ dirExists: false, declared: 0, statesAbsence: true, restoredClone: false }) === "ABSENCE_DOCUMENTED", "documented loss not recognised");
    assert(c({ dirExists: false, declared: 8, statesAbsence: false, restoredClone: true }) === "RESTORED_CLONE", "clone not recognised");
    const lost = classifyInventory({ dirExists: false, declared: 8, statesAbsence: false, restoredClone: false });
    assert(lost.state === "LOST" && lost.error, "a destroyed inventory was not called LOST");
    assert(lost.error.includes("8"), "the LOST message does not say how many were claimed");
    return "PRESENT / UNDECLARED / ABSENCE_DOCUMENTED / RESTORED_CLONE / LOST, with nothing defaulting to ok";
  });

  console.log("\n--> 3d. A bundle made from a shallow clone cannot be restored, and the audit says so");
  check("a bundle whose source was shallow fails the clone check even though verify succeeds", () => {
    const full = path.join(tmpRoot, "shallow-src");
    makeFixtureRepo(full);
    execFileSync("bash", ["-lc", `cd "${full}" && echo two > b.txt && git add . && git commit -q -m two`], { encoding: "utf8" });
    const shallow = path.join(tmpRoot, "shallow-clone");
    execFileSync("bash", ["-lc", `git clone -q --depth 1 "file://${full}" "${shallow}"`], { encoding: "utf8" });
    const shallowBundle = path.join(tmpRoot, "shallow.bundle");
    execFileSync("bash", ["-lc", `cd "${shallow}" && git bundle create "${shallowBundle}" --all`], { encoding: "utf8" });
    const dir = path.join(tmpRoot, "case-shallow");
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(shallowBundle, path.join(dir, "shallow.bundle"));
    const r = runAudit(dir);
    const artefact = JSON.parse(fs.readFileSync(r.out, "utf8"));
    const b = artefact.bundles[0];
    assert(r.exit === 1, `a shallow-source bundle was accepted (exit ${r.exit})`);
    assert(/NOT readable|clone failed|early EOF|index-pack/i.test(b.packIntegrity), `packIntegrity did not record the failure: ${b.packIntegrity}`);
    return "verify may pass, the clone does not — the audit fails it";
  });

  console.log("\n--> 3e. Handoff guard: verified mutations, adversarial bypass checks, and positive controls");
  let effectiveMutations = 0;
  function runHandoffMutation({ name, dir, mutate, expectedCode, expectedDetail }) {
    const files = ["OFF_MACHINE_BACKUP_HANDOFF.md", "RECOVERY_MANIFEST.md", "RECOVERY_PROCEDURE.md", "FINAL_HANDOVER.md"];
    const backups = {};
    for (const f of files) {
      backups[f] = fs.readFileSync(path.join(dir, f), "utf8");
    }
    try {
      const readState = (overrideLinks) => ({
        handoffText: fs.existsSync(path.join(dir, "OFF_MACHINE_BACKUP_HANDOFF.md"))
          ? fs.readFileSync(path.join(dir, "OFF_MACHINE_BACKUP_HANDOFF.md"), "utf8")
          : "",
        linkedFrom: overrideLinks || {
          manifest: fs.existsSync(path.join(dir, "RECOVERY_MANIFEST.md")) ? fs.readFileSync(path.join(dir, "RECOVERY_MANIFEST.md"), "utf8") : "",
          procedure: fs.existsSync(path.join(dir, "RECOVERY_PROCEDURE.md")) ? fs.readFileSync(path.join(dir, "RECOVERY_PROCEDURE.md"), "utf8") : "",
          handover: fs.existsSync(path.join(dir, "FINAL_HANDOVER.md")) ? fs.readFileSync(path.join(dir, "FINAL_HANDOVER.md"), "utf8") : "",
        },
      });
      const before = readState();
      const preCheck = checkHandoff(before);
      assert(preCheck.ok, `pre-mutation state in "${name}" already had errors: ${preCheck.errors.join("; ")}`);

      const beforeSerialised = JSON.stringify(before);
      const { target, snippetBefore, snippetAfter, overrideLinks } = mutate(dir);
      const after = readState(overrideLinks);
      const afterSerialised = JSON.stringify(after);
      assert(beforeSerialised !== afterSerialised, `NO-OP MUTATION in "${name}": input did not change`);
      effectiveMutations += 1;

      const res = checkHandoff(after);
      assert(!res.ok, `mutation "${name}" passed checkHandoff unexpectedly`);
      assert(
        res.errors.every((e) => e.startsWith(`${expectedCode}:`)),
        `mutation "${name}" triggered unexpected/masking error code(s): expected only "${expectedCode}:*", got [${res.errors.join("; ")}]`,
      );
      if (expectedDetail) {
        assert(
          res.errors.some((e) => expectedDetail.test(e)),
          `mutation "${name}" did not match detail ${expectedDetail}; got [${res.errors.join("; ")}]`,
        );
      }
      const matched = expectedDetail ? res.errors.find((e) => expectedDetail.test(e)) : res.errors[0];
      return `[${target}] ${JSON.stringify(snippetBefore)} -> ${JSON.stringify(snippetAfter)} => ${matched}`;
    } finally {
      for (const f of files) {
        fs.writeFileSync(path.join(dir, f), backups[f]);
      }
      for (const f of files) {
        assert(fs.readFileSync(path.join(dir, f), "utf8") === backups[f], `cleanup failed to restore ${f}`);
      }
    }
  }

  const handoffTmpDir = path.join(tmpRoot, "handoff-mutations");
  fs.mkdirSync(handoffTmpDir, { recursive: true });
  for (const f of ["OFF_MACHINE_BACKUP_HANDOFF.md", "RECOVERY_MANIFEST.md", "RECOVERY_PROCEDURE.md", "FINAL_HANDOVER.md"]) {
    fs.copyFileSync(path.join(ROOT, f), path.join(handoffTmpDir, f));
  }

  check("baseline real handoff + linked documents pass checkHandoff cleanly", () => {
    const res = checkHandoff({
      handoffText: fs.readFileSync(path.join(handoffTmpDir, "OFF_MACHINE_BACKUP_HANDOFF.md"), "utf8"),
      linkedFrom: {
        manifest: fs.readFileSync(path.join(handoffTmpDir, "RECOVERY_MANIFEST.md"), "utf8"),
        procedure: fs.readFileSync(path.join(handoffTmpDir, "RECOVERY_PROCEDURE.md"), "utf8"),
        handover: fs.readFileSync(path.join(handoffTmpDir, "FINAL_HANDOVER.md"), "utf8"),
      },
    });
    assert(res.ok, "real documents rejected: " + res.errors.join("; "));
    return "0 errors on real documents";
  });

  const handoffMutations = [
    {
      name: "M1: missing handoff file fails with missing",
      expectedCode: "missing",
      mutate: (dir) => {
        const p = path.join(dir, "OFF_MACHINE_BACKUP_HANDOFF.md");
        const snippetBefore = fs.readFileSync(p, "utf8").split("\n")[0];
        fs.unlinkSync(p);
        return { target: "OFF_MACHINE_BACKUP_HANDOFF.md", snippetBefore, snippetAfter: "<deleted>" };
      },
    },
    {
      name: "M2: missing link from RECOVERY_MANIFEST.md fails with link",
      expectedCode: "link",
      expectedDetail: /manifest does not reference OFF_MACHINE_BACKUP_HANDOFF\.md/,
      mutate: (dir) => {
        const p = path.join(dir, "RECOVERY_MANIFEST.md");
        const s = fs.readFileSync(p, "utf8");
        const line = s.split("\n").find((l) => l.includes("OFF_MACHINE_BACKUP_HANDOFF.md"));
        fs.writeFileSync(p, s.replace(/.*OFF_MACHINE_BACKUP_HANDOFF\.md.*\n?/g, ""));
        return { target: "RECOVERY_MANIFEST.md", snippetBefore: line.slice(0, 55), snippetAfter: "<removed>" };
      },
    },
    {
      name: "M3: missing link from RECOVERY_PROCEDURE.md fails with link",
      expectedCode: "link",
      expectedDetail: /procedure does not reference OFF_MACHINE_BACKUP_HANDOFF\.md/,
      mutate: (dir) => {
        const p = path.join(dir, "RECOVERY_PROCEDURE.md");
        const s = fs.readFileSync(p, "utf8");
        const line = s.split("\n").find((l) => l.includes("OFF_MACHINE_BACKUP_HANDOFF.md"));
        fs.writeFileSync(p, s.replace(/OFF_MACHINE_BACKUP_HANDOFF\.md/g, "OTHER_DOC.md"));
        return { target: "RECOVERY_PROCEDURE.md", snippetBefore: line.slice(0, 55), snippetAfter: "OTHER_DOC.md" };
      },
    },
    {
      name: "M4: missing link from FINAL_HANDOVER.md fails with link",
      expectedCode: "link",
      expectedDetail: /handover does not reference OFF_MACHINE_BACKUP_HANDOFF\.md/,
      mutate: (dir) => {
        const p = path.join(dir, "FINAL_HANDOVER.md");
        const s = fs.readFileSync(p, "utf8");
        const line = s.split("\n").find((l) => l.includes("OFF_MACHINE_BACKUP_HANDOFF.md"));
        fs.writeFileSync(p, s.replace(/OFF_MACHINE_BACKUP_HANDOFF\.md/g, "NONE.md"));
        return { target: "FINAL_HANDOVER.md", snippetBefore: line.slice(0, 55), snippetAfter: "NONE.md" };
      },
    },
    {
      name: "M5: renamed suffixed/prefixed/subdir link lookalike (OFF_MACHINE_BACKUP_HANDOFF.md.bak) fails with link",
      expectedCode: "link",
      expectedDetail: /manifest does not reference OFF_MACHINE_BACKUP_HANDOFF\.md/,
      mutate: (dir) => {
        const p = path.join(dir, "RECOVERY_MANIFEST.md");
        const s = fs.readFileSync(p, "utf8");
        fs.writeFileSync(p, s.replace(/OFF_MACHINE_BACKUP_HANDOFF\.md/g, "OFF_MACHINE_BACKUP_HANDOFF.md.bak"));
        return { target: "RECOVERY_MANIFEST.md", snippetBefore: "OFF_MACHINE_BACKUP_HANDOFF.md", snippetAfter: "OFF_MACHINE_BACKUP_HANDOFF.md.bak" };
      },
    },
    {
      name: "M6: omitted required linkedFrom entry (handover missing from map) fails with link",
      expectedCode: "link",
      expectedDetail: /required document "handover" was not supplied/,
      mutate: (dir) => ({
        target: "linkedFrom",
        snippetBefore: "{manifest,procedure,handover}",
        snippetAfter: "{manifest,procedure}",
        overrideLinks: {
          manifest: fs.readFileSync(path.join(dir, "RECOVERY_MANIFEST.md"), "utf8"),
          procedure: fs.readFileSync(path.join(dir, "RECOVERY_PROCEDURE.md"), "utf8"),
        },
      }),
    },
    {
      name: "M7: static SRC= assignment (even if $(git rev-parse HEAD) appears in prose) fails with identity",
      expectedCode: "identity",
      expectedDetail: /SRC is assigned a fixed value/,
      mutate: (dir) => {
        const p = path.join(dir, "OFF_MACHINE_BACKUP_HANDOFF.md");
        const s = fs.readFileSync(p, "utf8");
        const oldStr = 'SRC=$(git rev-parse HEAD) && echo "bundling $SRC"';
        const newStr = "SRC=0046eeb473ef5241202dcba66dbf183e0b07b2e1\nNote: $(git rev-parse HEAD) is mentioned in prose.";
        fs.writeFileSync(p, s.replace(oldStr, newStr));
        return { target: "OFF_MACHINE_BACKUP_HANDOFF.md", snippetBefore: oldStr, snippetAfter: "SRC=0046eeb... + prose $(git rev-parse HEAD)" };
      },
    },
    {
      name: "M8: git bundle create omitting $SRC (without hex literal) fails with identity",
      expectedCode: "identity",
      expectedDetail: /git bundle create does not use \$SRC/,
      mutate: (dir) => {
        const p = path.join(dir, "OFF_MACHINE_BACKUP_HANDOFF.md");
        const s = fs.readFileSync(p, "utf8");
        const oldStr = "git bundle create /tmp/apex_$SRC.bundle --all";
        const newStr = "git bundle create /tmp/apex_latest.bundle --all";
        fs.writeFileSync(p, s.replace(oldStr, newStr));
        return { target: "OFF_MACHINE_BACKUP_HANDOFF.md", snippetBefore: oldStr, snippetAfter: newStr };
      },
    },
    {
      name: "M9: git bundle create hard-coding a 7-char short SHA alongside $SRC fails with identity",
      expectedCode: "identity",
      expectedDetail: /the bundle command hard-codes a commit hash/,
      mutate: (dir) => {
        const p = path.join(dir, "OFF_MACHINE_BACKUP_HANDOFF.md");
        const s = fs.readFileSync(p, "utf8");
        const oldStr = "git bundle create /tmp/apex_$SRC.bundle --all";
        const newStr = "git bundle create /tmp/apex_${SRC}_cf51ff7.bundle --all";
        fs.writeFileSync(p, s.replace(oldStr, newStr));
        return { target: "OFF_MACHINE_BACKUP_HANDOFF.md", snippetBefore: oldStr, snippetAfter: newStr };
      },
    },
    {
      name: "M10: missing stale-document regeneration guidance fails with staleness-guidance",
      expectedCode: "staleness-guidance",
      mutate: (dir) => {
        const p = path.join(dir, "OFF_MACHINE_BACKUP_HANDOFF.md");
        const s = fs.readFileSync(p, "utf8");
        const oldStr = "regenerate this document before proceeding";
        const newStr = "continue with the steps below";
        fs.writeFileSync(p, s.replace(oldStr, newStr));
        return { target: "OFF_MACHINE_BACKUP_HANDOFF.md", snippetBefore: oldStr, snippetAfter: newStr };
      },
    },
    {
      name: "M11: missing separate-machine / downloaded-copy requirement fails with off-machine-verify",
      expectedCode: "off-machine-verify",
      mutate: (dir) => {
        const p = path.join(dir, "OFF_MACHINE_BACKUP_HANDOFF.md");
        const s = fs.readFileSync(p, "utf8");
        const oldStr = "from a **different machine** against the **downloaded** copy";
        const newStr = "in this workspace against the local file";
        fs.writeFileSync(p, s.replace(oldStr, newStr));
        return { target: "OFF_MACHINE_BACKUP_HANDOFF.md", snippetBefore: oldStr, snippetAfter: newStr };
      },
    },
    {
      name: "M12: whitespace/newline splitting + unhyphenated 'off machine' fails with performed",
      expectedCode: "performed",
      mutate: (dir) => {
        const p = path.join(dir, "OFF_MACHINE_BACKUP_HANDOFF.md");
        const s = fs.readFileSync(p, "utf8");
        const injected = "The bundle has been\n   restored off machine and verified.";
        fs.writeFileSync(p, s.replace("## 1. What is being backed up", "## 1. What is being backed up\n\n" + injected));
        return { target: "OFF_MACHINE_BACKUP_HANDOFF.md#sec1", snippetBefore: "<absent>", snippetAfter: injected.replace("\n", "\\n") };
      },
    },
    {
      name: "M13: alternate completion wording ('was completed from a separate machine') fails with performed",
      expectedCode: "performed",
      mutate: (dir) => {
        const p = path.join(dir, "OFF_MACHINE_BACKUP_HANDOFF.md");
        const s = fs.readFileSync(p, "utf8");
        const injected = "The restore was completed from a separate machine.";
        fs.writeFileSync(p, s + "\n" + injected + "\n");
        return { target: "OFF_MACHINE_BACKUP_HANDOFF.md#eof", snippetBefore: "<absent>", snippetAfter: injected };
      },
    },
    {
      name: "M14: passive/synonymous wording ('downloaded bundle was verified on a separate machine' / 'restoration succeeded') fails with performed",
      expectedCode: "performed",
      mutate: (dir) => {
        const p = path.join(dir, "OFF_MACHINE_BACKUP_HANDOFF.md");
        const s = fs.readFileSync(p, "utf8");
        const injected = "The downloaded bundle was verified on a separate machine. Off-machine restoration succeeded.";
        fs.writeFileSync(p, s + "\n" + injected + "\n");
        return { target: "OFF_MACHINE_BACKUP_HANDOFF.md#eof", snippetBefore: "<absent>", snippetAfter: injected };
      },
    },
    {
      name: "M15: Markdown emphasis split ('**has been** _restored_ off-machine') fails with performed",
      expectedCode: "performed",
      mutate: (dir) => {
        const p = path.join(dir, "OFF_MACHINE_BACKUP_HANDOFF.md");
        const s = fs.readFileSync(p, "utf8");
        const injected = "The backup **has been** _restored_ off-machine.";
        fs.writeFileSync(p, s + "\n" + injected + "\n");
        return { target: "OFF_MACHINE_BACKUP_HANDOFF.md", snippetBefore: "<absent>", snippetAfter: injected };
      },
    },
    {
      name: "M16: claim split across blank-line paragraph boundary ('has been\\n\\nrestored') fails with performed",
      expectedCode: "performed",
      mutate: (dir) => {
        const p = path.join(dir, "OFF_MACHINE_BACKUP_HANDOFF.md");
        const s = fs.readFileSync(p, "utf8");
        const injected = "The backup has been\n\nrestored off-machine.";
        fs.writeFileSync(p, s + "\n\n" + injected + "\n");
        return { target: "OFF_MACHINE_BACKUP_HANDOFF.md", snippetBefore: "<absent>", snippetAfter: "The backup has been\\n\\nrestored off-machine." };
      },
    },
    {
      name: "M17: claim wrapped in inline code backticks (`backup has been restored off-machine`) fails with performed",
      expectedCode: "performed",
      mutate: (dir) => {
        const p = path.join(dir, "OFF_MACHINE_BACKUP_HANDOFF.md");
        const s = fs.readFileSync(p, "utf8");
        const injected = "Audit note: `backup has been restored off-machine`.";
        fs.writeFileSync(p, s + "\n" + injected + "\n");
        return { target: "OFF_MACHINE_BACKUP_HANDOFF.md", snippetBefore: "<absent>", snippetAfter: injected };
      },
    },
    {
      name: "M18: unsupported restore claim moved into linked document (RECOVERY_MANIFEST.md) fails with performed",
      expectedCode: "performed",
      expectedDetail: /^performed: manifest reports/,
      mutate: (dir) => {
        const p = path.join(dir, "RECOVERY_MANIFEST.md");
        const s = fs.readFileSync(p, "utf8");
        const injected = "Off-machine recovery completed.";
        fs.writeFileSync(p, s + "\n" + injected + "\n");
        return { target: "RECOVERY_MANIFEST.md", snippetBefore: "<absent>", snippetAfter: injected };
      },
    },
    {
      name: "M19: status upgrade DURABLE_BACKUP_ESTABLISHED separated by sentence boundary from 'upgrade' fails with overclaim",
      expectedCode: "overclaim",
      expectedDetail: /^overclaim: handoff asserts durability/,
      mutate: (dir) => {
        const p = path.join(dir, "OFF_MACHINE_BACKUP_HANDOFF.md");
        const s = fs.readFileSync(p, "utf8");
        const injected = "An upgrade path exists. Status is now DURABLE_BACKUP_ESTABLISHED.";
        fs.writeFileSync(p, s + "\n" + injected + "\n");
        return { target: "OFF_MACHINE_BACKUP_HANDOFF.md", snippetBefore: "<absent>", snippetAfter: injected };
      },
    },
    {
      name: "M20: status upgrade in Markdown heading/blockquote/list/table adjacent to 'upgrade' fails with overclaim",
      expectedCode: "overclaim",
      expectedDetail: /## DURABLE_BACKUP_ESTABLISHED/,
      mutate: (dir) => {
        const p = path.join(dir, "OFF_MACHINE_BACKUP_HANDOFF.md");
        const s = fs.readFileSync(p, "utf8");
        const injected = "## DURABLE_BACKUP_ESTABLISHED\nUpgrade notes follow.";
        fs.writeFileSync(p, s + "\n\n" + injected + "\n");
        return { target: "OFF_MACHINE_BACKUP_HANDOFF.md", snippetBefore: "<absent>", snippetAfter: "## DURABLE_BACKUP_ESTABLISHED\\nUpgrade notes follow." };
      },
    },
    {
      name: "M21: status upgrade DURABLE_BACKUP_ESTABLISHED placed in linked document (FINAL_HANDOVER.md) fails with overclaim",
      expectedCode: "overclaim",
      expectedDetail: /^overclaim: handover asserts durability/,
      mutate: (dir) => {
        const p = path.join(dir, "FINAL_HANDOVER.md");
        const s = fs.readFileSync(p, "utf8");
        const injected = "Backup status: DURABLE_BACKUP_ESTABLISHED.";
        fs.writeFileSync(p, s + "\n" + injected + "\n");
        return { target: "FINAL_HANDOVER.md", snippetBefore: "<absent>", snippetAfter: injected };
      },
    },
    {
      name: "M22: removing required git fsck --full check fails with fsck",
      expectedCode: "fsck",
      mutate: (dir) => {
        const p = path.join(dir, "OFF_MACHINE_BACKUP_HANDOFF.md");
        const s = fs.readFileSync(p, "utf8");
        fs.writeFileSync(p, s.replace(/git fsck --full/g, "git status"));
        return { target: "OFF_MACHINE_BACKUP_HANDOFF.md", snippetBefore: "git fsck --full", snippetAfter: "git status" };
      },
    },
  ];

  for (const m of handoffMutations) {
    check(m.name, () => runHandoffMutation({ ...m, dir: handoffTmpDir }));
  }

  check("positive controls: future/conditional instructions, shell commands, and duplicate valid links are not falsely rejected", () => {
    const h = fs.readFileSync(path.join(handoffTmpDir, "OFF_MACHINE_BACKUP_HANDOFF.md"), "utf8");
    const links = {
      manifest: fs.readFileSync(path.join(handoffTmpDir, "RECOVERY_MANIFEST.md"), "utf8") + "\nSee also `OFF_MACHINE_BACKUP_HANDOFF.md`.\n",
      procedure: fs.readFileSync(path.join(handoffTmpDir, "RECOVERY_PROCEDURE.md"), "utf8"),
      handover: fs.readFileSync(path.join(handoffTmpDir, "FINAL_HANDOVER.md"), "utf8"),
    };
    const augmented = [
      h,
      "Once the backup has been restored off-machine, record the operator and date.",
      "After you restore the bundle on a separate machine, run pytest to confirm.",
      "No copy has been uploaded or restored off-machine.",
      "`git clone apex_$SRC.bundle /tmp/restored_verified && cd /tmp/restored_verified && echo verified`",
      "```sh\ngit clone apex_$SRC.bundle /tmp/restored_verified\ncd /tmp/restored_verified && git fsck --full\n```",
    ].join("\n\n");
    const res = checkHandoff({ handoffText: augmented, linkedFrom: links });
    assert(res.ok, `legitimate control falsely rejected: ${res.errors.join("; ")}`);
    return "5 positive controls accepted cleanly";
  });

  check("a no-op mutation is itself rejected by the mutation runner", () => {
    let caught = false;
    try {
      runHandoffMutation({
        name: "intentional-no-op",
        dir: handoffTmpDir,
        expectedCode: "identity",
        mutate: () => ({ target: "none", snippetBefore: "x", snippetAfter: "x" }),
      });
    } catch (e) {
      caught = /NO-OP MUTATION/.test(e.message);
    }
    assert(caught, "mutation runner failed to reject an unapplied mutation");
    return `effective handoff mutations verified: ${effectiveMutations}`;
  });

  check("production verifier integration: verify_report_consistency.js invokes handoff_guard and fails on a mutated clone", () => {
    const simDir = path.join(tmpRoot, "verifier-handoff-sim");
    execFileSync("git", ["clone", "-q", ROOT, simDir], { stdio: "pipe" });
    // Copy current working-tree guard & verifier into the throwaway clone so uncommitted changes are tested too
    fs.copyFileSync(path.join(ROOT, "scripts", "lib", "handoff_guard.js"), path.join(simDir, "scripts", "lib", "handoff_guard.js"));
    fs.copyFileSync(path.join(ROOT, "scripts", "verify_report_consistency.js"), path.join(simDir, "scripts", "verify_report_consistency.js"));
    const hp = path.join(simDir, "OFF_MACHINE_BACKUP_HANDOFF.md");
    const before = fs.readFileSync(hp, "utf8");
    fs.writeFileSync(hp, before + "\n\nThe backup **has been** _restored_ off machine.\n");
    assert(fs.readFileSync(hp, "utf8") !== before, "clone mutation did not apply");
    let exit = 0;
    let out = "";
    try {
      out = execFileSync(process.execPath, [path.join(simDir, "scripts", "verify_report_consistency.js")], {
        cwd: simDir,
        encoding: "utf8",
        stdio: "pipe",
        env: { ...process.env, OMNI_IN_HARNESS: "1" },
      });
    } catch (e) {
      exit = e.status ?? 1;
      out = String(e.stdout || "") + String(e.stderr || "");
    }
    assert(exit === 1, `expected production verifier exit 1, got ${exit}`);
    assert(/MISMATCH handoff:performed:/.test(out), `expected handoff:performed mismatch in verifier output, got: ${out}`);
    return "exit 1 with MISMATCH handoff:performed";
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
        /* OMNI_IN_HARNESS stops the verifier from spawning this harness again: the harness runs the verifier, and
           the verifier checks the harness's quoted test count by running it. Without the flag that recurses. */
        env: { ...process.env, OMNI_BACKUP_DIR: dir, OMNI_IN_HARNESS: "1" },
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
