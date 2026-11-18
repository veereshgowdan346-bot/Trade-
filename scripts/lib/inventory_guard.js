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

module.exports = { checkInventory, bundlesOnDisk };
