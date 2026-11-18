/**
 * Off-machine handoff guard.
 *
 * The handoff is the only document that tells an owner how to replace DURABLE_BACKUP_NOT_ESTABLISHED, so it is
 * also the document most able to mislead: it can pin a stale commit, claim a recovery that never happened, or drift
 * out of reach of the other documents. Each rule below corresponds to a failure that was actually observed during
 * this audit, and each has a negative test in scripts/test_bundle_audit.js.
 *
 * Rules:
 *   1. The procedures that a recovering reader follows must link to it.
 *   2. It must capture the source identity at bundle time, not hard-code one.
 *   3. It must say what to do when the quoted commit is not the current one.
 *   4. It must require an off-machine check, a hash check and an fsck.
 *   5. It must not assert that durability exists, or that any transfer/restore has already happened.
 */

const REQUIRED = [
  ["DURABLE_BACKUP_NOT_ESTABLISHED", "status", "does not carry the current durability status"],
  ["git fsck --full", "fsck", "does not require a filesystem check on the downloaded copy"],
  ["sha256sum", "hash", "does not require a hash comparison"],
  ["npm ci", "deps", "does not require a dependency rebuild"],
  ["regenerate this document before proceeding", "staleness-guidance",
    "no instruction for what to do when the quoted commit is not the current one"],
];

/** Sentences that describe the state to reach are allowed; sentences that assert a past transfer are not. */
const PERFORMED = [
  /(?:has|have) been (?:restored|uploaded|verified|transferred)/i,
  /was (?:restored|uploaded|verified|transferred) (?:off-machine|from a separate machine|to the destination|successfully)/i,
  /off-machine (?:restore|verification|recovery) (?:completed|succeeded|is complete|has completed)/i,
  /(?:backup|copy) (?:is|was) (?:established|complete|in place|stored externally)/i,
];

/**
 * @param {{handoffText: string, linkedFrom: Record<string,string>}} input
 *   linkedFrom maps a document label to its text.
 * @returns {{ok: boolean, errors: string[]}}
 */
function checkHandoff({ handoffText, linkedFrom }) {
  const text = String(handoffText || "");
  const errors = [];
  const doc = linkedFrom || {};

  for (const [needle, label, reason] of REQUIRED) {
    if (!text.includes(needle)) errors.push(`${label}: ${reason}`);
  }

  // 1. reachability
  for (const [name, body] of Object.entries(doc)) {
    if (!String(body || "").includes("OFF_MACHINE_BACKUP_HANDOFF.md")) {
      errors.push(`link: ${name} does not reference OFF_MACHINE_BACKUP_HANDOFF.md`);
    }
  }

  // 2. dynamic identity — a literal commit in the bundle command would be stale by the time anyone runs it
  if (!/\$\(\s*git rev-parse HEAD\s*\)/.test(text)) {
    errors.push("identity: the procedure does not capture the source commit with $(git rev-parse HEAD)");
  }
  for (const line of text.split("\n")) {
    if (/git bundle create/.test(line) && /\b[0-9a-f]{40}\b/.test(line)) {
      errors.push(`identity: the bundle command hard-codes a commit (${line.trim().slice(0, 60)})`);
    }
  }

  // 5a. durability must not be asserted, only aimed at
  const asserting = text.split("\n")
    .filter((line) => /DURABLE_BACKUP_ESTABLISHED/.test(line))
    .filter((line) => !/replac|upgrad|only (when|then)|until/i.test(line));
  if (asserting.length) errors.push(`overclaim: ${asserting[0].trim().slice(0, 60)}`);

  // 5b. no sentence may report a transfer or restore as done
  for (const re of PERFORMED) {
    const m = text.match(re);
    if (m) errors.push(`performed: the handoff reports "${m[0]}" as having happened`);
  }

  return { ok: errors.length === 0, errors };
}

module.exports = { checkHandoff, REQUIRED, PERFORMED };
