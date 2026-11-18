/**
 * Bundle-inventory guard.
 *
 * The failure this prevents: RECOVERY_MANIFEST.md listed four bundles while five were on disk, because the
 * manifest generator only ever described the newest one. A report that disagrees with the filesystem is a
 * documentation defect, so the comparison lives here and is unit-tested against fixtures in
 * scripts/test_bundle_audit.js.
 *
 * Rules:
 *   - every bundle on disk must appear in the manifest exactly once
 *   - the manifest must not name a bundle that is not on disk
 *   - an empty disk inventory is an error, never a pass
 */

function bundlesOnDisk(files) {
  return (files || []).filter((f) => String(f).endsWith(".bundle")).sort();
}

/** @returns {{ok: boolean, onDisk: string[], listed: string[], errors: string[]}} */
function checkInventory(manifestText, diskFiles) {
  const onDisk = bundlesOnDisk(diskFiles);
  const listedRaw = Array.from(String(manifestText || "").matchAll(/^\| `([^`]+\.bundle)` \|/gm)).map((m) => m[1]);
  const errors = [];

  if (onDisk.length === 0) {
    errors.push("no bundles on disk — an empty inventory cannot be reported as a pass");
  }

  const seen = new Set();
  for (const name of listedRaw) {
    if (seen.has(name)) errors.push(`manifest lists ${name} more than once`);
    seen.add(name);
  }

  for (const name of onDisk) {
    if (!seen.has(name)) errors.push(`${name} is on disk but missing from the manifest`);
  }
  const diskSet = new Set(onDisk);
  for (const name of seen) {
    if (!diskSet.has(name)) errors.push(`manifest names ${name}, which is not on disk`);
  }

  return { ok: errors.length === 0, onDisk, listed: Array.from(seen), errors };
}

/**
 * Classifies the bundle inventory when the backups/ directory is not simply present-and-matching.
 *
 * Four states look similar on disk and mean very different things:
 *
 *   PRESENT            backups/ exists; checkInventory decides.
 *   ABSENCE_DOCUMENTED the manifest says "Bundles on disk: 0" and states the loss explicitly. Nothing is
 *                      restorable; that is a fact to report, never a pass.
 *   RESTORED_CLONE     backups/ is absent and the manifest declares bundles, in a tree that came from a bundle.
 *                      Bundles are not committed, so this is expected and must not fail the code checks.
 *   LOST               backups/ is absent, bundles are claimed, and nobody said this is a clone. That is what a
 *                      destroyed backup looks like, and it must fail.
 *
 * The clone case is decided by an explicit flag, not by guessing: a silent guess here would excuse a real loss.
 */
function classifyInventory({ dirExists, declared, statesAbsence, restoredClone }) {
  if (dirExists) return { state: "PRESENT", error: null };
  if (declared === null || declared === undefined) {
    return { state: "UNDECLARED", error: "no 'Bundles on disk: N' line — the reader cannot tell what is expected" };
  }
  if (declared === 0) {
    return statesAbsence
      ? { state: "ABSENCE_DOCUMENTED", error: null }
      : { state: "UNDECLARED", error: "zero bundles is not stated explicitly — silence would read as success" };
  }
  if (restoredClone) return { state: "RESTORED_CLONE", error: null };
  return { state: "LOST", error: `manifest claims ${declared} bundle(s) but backups/ does not exist` };
}

module.exports = { checkInventory, bundlesOnDisk, classifyInventory };
