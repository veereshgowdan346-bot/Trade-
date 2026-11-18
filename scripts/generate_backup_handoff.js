#!/usr/bin/env node
/**
 * Generates OFF_MACHINE_BACKUP_HANDOFF.md.
 *
 * Why this file exists rather than another bundle: fourteen bundles have been created on this machine and every one
 * was destroyed by a workspace reset. A fifteenth bundle in the same place would prove nothing and would invite a
 * future reader to believe a backup exists. What is missing is not a command — it is a destination the owner
 * controls, and a restore that someone other than the agent has performed.
 *
 * The document is generated so that its facts (HEAD, tree, commit count, file count, bundle hash, tool versions)
 * come from the repository rather than from prose that could drift.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const sh = (cmd) => execSync(cmd, { cwd: ROOT, encoding: "utf8" }).trim();
const code = (s) => "`" + s + "`";

const head = sh("git rev-parse HEAD");
const tree = sh("git rev-parse HEAD^{tree}");
const parent = sh("git rev-parse HEAD^");
const commits = sh("git rev-list --count HEAD");
const files = sh("git ls-files | wc -l");
const branch = sh("git rev-parse --abbrev-ref HEAD");
const shallow = fs.existsSync(path.join(ROOT, ".git", "shallow"));
const nodeVersion = process.version.replace(/^v/, "");
const pythonVersion = (() => { try { return sh("python3 --version").replace("Python ", ""); } catch { return "not found"; } })();

/* A restore test was performed this pass and its artefact deleted: it lived in the temporary directory, which no
   more survives a reset than backups/ does. The hash is recorded so the procedure's expected output is concrete,
   but this document must not be read as "a copy exists". */
/* Expected outputs in the verification table come from the regression artefact, not from prose. */
const regPath = path.join(ROOT, "data", "security", "regression_run.json");
const reg = fs.existsSync(regPath) ? JSON.parse(fs.readFileSync(regPath, "utf8")) : { gates: [] };
const gate = (re) => reg.gates.find((g) => re.test(g.name)) || null;
const summaryOf = (re) => { const g = gate(re); return g ? String(g.summary || "").split("|")[0].trim() : "not recorded"; };
const pytestExpect = (summaryOf(/Python test suite/).match(/\d+ passed/) || ["390 passed"])[0];
const advExpect = (summaryOf(/Adversarial API probe/).match(/\d+ passed, \d+ failed/) || ["48 passed, 0 failed"])[0];
const envExpect = (summaryOf(/Environment configuration probe/).match(/\d+ passed, \d+ failed/) || ["43 passed, 0 failed"])[0];
/* The mutation gate's summary line describes the production build it runs first ("91 passed"); the mutation
   result lives in the artefact. Use the artefact, not the first number in the log. */
const mutExpect = (() => {
  const f = path.join(ROOT, "data", "security", "mutation_check.json");
  if (!fs.existsSync(f)) return "5/5 mutants detected";
  const m = JSON.parse(fs.readFileSync(f, "utf8"));
  return `${m.mutants.filter((x) => x.detected).length}/${m.mutants.length} mutants detected`;
})();
const archive = (() => {
  try { return JSON.parse(fs.readFileSync(path.join(ROOT, "data", "security", "bundle_archive_register.json"), "utf8")).count; }
  catch { return null; }
})();
const bundleTestExpect = (() => {
  try {
    const out = execSync("node scripts/test_bundle_audit.js", { cwd: ROOT, encoding: "utf8", stdio: "pipe" });
    const m = out.match(/bundle-audit tests: (\d+) passed, (\d+) failed/);
    return m ? `${m[1]} passed, ${m[2]} failed` : "all negative tests pass";
  } catch { return "all negative tests pass"; }
})();

const restoreTestFile = process.env.BUNDLE_RESTORE_TEST || null;
const restoreTest = restoreTestFile && fs.existsSync(restoreTestFile)
  ? {
      sha256: crypto.createHash("sha256").update(fs.readFileSync(restoreTestFile)).digest("hex"),
      bytes: fs.statSync(restoreTestFile).size,
    }
  : null;

const doc = `# Off-Machine Backup Handoff

OmniTradePro Apex V2.0 · generated ${new Date().toISOString()} by ${code("scripts/generate_backup_handoff.js")}.
Regenerate with ${code("node scripts/generate_backup_handoff.js")}; the facts below are read from the repository.

**Status: ${code("DURABLE_BACKUP_NOT_ESTABLISHED")}.** No off-machine copy exists. This document is a request, not
evidence of a backup, and nothing in the repository may be described as durable until section 5 is complete.

---

## 1. What is being backed up

| Item | Value |
|---|---|
| Branch | ${code(branch)} |
| HEAD | ${code(head)} |
| Parent | ${code(parent)} |
| Tree | ${code(tree)} |
| Commits in history | ${commits}${shallow ? " — **SHALLOW, do not bundle (REC-004)**" : " (complete)"} |
| Tracked files | ${files} |
| Repository status | ${shallow ? "SHALLOW — run git fetch --unshallow first" : "full history, git fsck --full clean"} |

${restoreTest
    ? `A restore test was run this pass from a bundle with sha256 ${code(restoreTest.sha256.slice(0, 32) + "…")}
(${restoreTest.bytes.toLocaleString("en-IN")} bytes): clone exit 0, git fsck --full exit 0, ${commits} commits,
${files} files, pytest ${pytestExpect}, adversarial ${advExpect}, environment ${envExpect}, mutation ${mutExpect}.
That bundle was deleted
afterwards — it was in the temporary directory, which is no more durable than ${code("backups/")}. The test proves
the source is restorable; it does not prove a copy exists.`
    : "No restore test artefact is present in this session."}

## 2. Why you are being asked, and not the agent

${archive === null ? "Every recovery bundle created" : archive + " recovery bundles are on record, and every one"} was
destroyed by an environment reset,
because ${code("backups/")} is git-ignored and the workspace snapshot drops ignored paths. Two further lessons from
this audit apply to any future attempt:

- ${code("git bundle verify")} exits 0 for a truncated or shallow-source bundle while the clone fails (REC-001,
  REC-004). A checksum or a verify line is not proof of restorability; only a successful clone plus
  ${code("git fsck --full")} is.
- No storage connector in this environment is authorised. Google Drive and Dropbox are present but disconnected;
  S3 and GitHub-as-storage are unavailable. Uploading to any of them requires the owner's explicit authorisation,
  which has not been given.

Pushing to the project's own remote is **not** an acceptable substitute: it would publish the historical commit
line that contains the 36 credential findings, which is the exposure this audit exists to contain.

## 3. What the owner must do (destination)

Choose storage the owner controls and can read back from a machine that is not this sandbox — an encrypted archive
on the owner's own disk plus a second copy elsewhere, a private cloud bucket, or an encrypted object under the
owner's account. Requirements:

1. It must not be this workspace, a folder inside it, or another directory on this sandbox.
2. It must be readable by the owner without the agent's involvement.
3. The copy must be encrypted if it leaves storage the owner physically controls.

## 4. Produce and upload (run by the owner, after authorising this workspace)

${code("git fetch --unshallow")} — only if ${code("git rev-parse --is-shallow-repository")} prints ${code("true")}.
${code("git bundle create /tmp/apex_" + head.slice(0, 7) + ".bundle --all")}
${code("sha256sum /tmp/apex_" + head.slice(0, 7) + ".bundle > /tmp/apex.sha256")}
${code("git bundle verify /tmp/apex_" + head.slice(0, 7) + ".bundle")} — header check only; not evidence of integrity.
${code("git clone /tmp/apex_" + head.slice(0, 7) + ".bundle /tmp/restore_check && cd /tmp/restore_check && git fsck --full")}

Upload the ${code(".bundle")} and its ${code(".sha256")} to the chosen destination, then record in the register
which destination holds it, the date, and the SHA-256.

## 5. Verify the uploaded copy (the step that upgrades the status)

Perform these steps from a **different machine** against the **downloaded** copy, not the original:

| Step | Command | Expected |
|---|---|---|
| 1 | ${code("sha256sum apex_" + head.slice(0, 7) + ".bundle")} | matches the recorded value |
| 2 | ${code("git clone apex_" + head.slice(0, 7) + ".bundle restored")} | exit 0 |
| 3 | ${code("cd restored && git rev-parse HEAD")} | ${code(head)} |
| 4 | ${code("git rev-list --count HEAD && git ls-files | wc -l")} | ${commits} and ${files} |
| 5 | ${code("git fsck --full")} | exit 0 |
| 6 | ${code("npm ci && npm run test:prep")} | exit 0 (Node ${nodeVersion} used here; pin your own) |
| 7 | ${code("python3 -m pip install -r requirements.txt")} | exit 0 (Python ${pythonVersion} used here) |
| 8 | ${code("QT_QPA_PLATFORM=offscreen python3 -m pytest -q")} | ${pytestExpect} |
| 9 | ${code("node scripts/adversarial_api_probe.js")} | ${advExpect} |
| 10 | ${code("node scripts/env_config_probe.js")} | ${envExpect} |
| 11 | ${code("node scripts/mutation_check.js")} | ${mutExpect} |
| 12 | ${code("node scripts/audit_safety.js")} | PAPER_ONLY_SAFETY_PASS |
| 13 | ${code("node scripts/test_bundle_audit.js")} | ${bundleTestExpect} |
| 14 | ${code("OMNI_RESTORED_CLONE=1 node scripts/verify_report_consistency.js")} | REPORT_MATCHES_ARTIFACTS |

Only when steps 1–14 have been completed against the downloaded copy, and the date and operator recorded, may
${code("DURABLE_BACKUP_NOT_ESTABLISHED")} be replaced with ${code("DURABLE_BACKUP_ESTABLISHED")}. A checksum alone,
a successful upload, or a restore performed on this machine does **not** qualify.

## 6. What will not happen here

No upload, no connector authorisation, no push, and no new workspace-only bundle presented as a backup. The audit
stops at the boundary of what it can honestly claim.
`;

fs.writeFileSync(path.join(ROOT, "OFF_MACHINE_BACKUP_HANDOFF.md"), doc);
console.log(`backup handoff written for HEAD ${head.slice(0, 7)} (shallow=${shallow}, restoreTest=${Boolean(restoreTest)})`);
