/**
 * Off-machine handoff guard.
 *
 * The handoff is the only document that tells an owner how to replace DURABLE_BACKUP_NOT_ESTABLISHED, so it is
 * also the document most able to mislead: it can pin a stale commit, claim a recovery that never happened, or drift
 * out of reach of the other documents. Each rule below corresponds to a failure that was actually observed during
 * this audit, and each has a verified mutation test in scripts/test_bundle_audit.js.
 *
 * Rules:
 *   1. Every required linking document must exist, be passed in, and reference OFF_MACHINE_BACKUP_HANDOFF.md.
 *   2. The handoff must capture the source identity dynamically at bundle time (`SRC=$(git rev-parse HEAD)`),
 *      reference `$SRC` in the bundle/verify commands, and never hard-code a commit SHA or branch literal in
 *      `SRC=...`, `git bundle create`, `sha256sum`, or `git clone`.
 *   3. It must instruct the operator what to do when the quoted commit is stale.
 *   4. It must require verification from a separate/different machine against the downloaded copy, plus
 *      `sha256sum`, `git fsck --full`, and `npm ci`.
 *   5. Neither the handoff nor any linked document may assert that durability is established or that an
 *      off-machine transfer, upload, or restore has already occurred — regardless of section placement,
 *      whitespace/newline splitting, hyphenation, or alternate phrasing.
 */
"use strict";

const REQUIRED_LINK_DOCS = ["manifest", "procedure", "handover"];

const REQUIRED = [
  ["DURABLE_BACKUP_NOT_ESTABLISHED", "status", "does not carry the current durability status"],
  ["git fsck --full", "fsck", "does not require a filesystem check on the downloaded copy"],
  ["sha256sum", "hash", "does not require a hash comparison"],
  ["npm ci", "deps", "does not require a dependency rebuild"],
];

/** Strip only shell-command inline code spans, leaving prose wrapped in backticks visible to claim checks. */
function stripCommandCode(s) {
  return String(s || "").replace(/`([^`\n]*)`/g, (full, inner) => {
    if (/^(?:git|npm|node|python3?|pip|curl|mkdir|cd|sha256sum|cat|ls|rm|cp|mv|echo|SRC=|QT_QPA_|OMNI_|BUNDLE_)\b/.test(inner.trim())) {
      return " ";
    }
    return inner;
  });
}

/** Normalise whitespace (including line wraps inside prose) and `off machine` / `off-machine` variants. */
function normaliseProse(text) {
  return stripCommandCode(text)
    .replace(/off\s*-\s*machine|off\s+machine/gi, "off-machine")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Focused structural patterns for claims that an off-machine backup, transfer, or restore has already happened,
 * evaluated after stripping inline code spans and collapsing whitespace/newlines so line-wrapping, double spaces,
 * section movement, and hyphen splitting cannot evade them.
 *
 * Kept intentionally narrow (auxiliary + past participle, or explicit off-machine/external completion clause)
 * rather than a broad keyword blacklist, so ordinary procedural and historical descriptions do not false-positive.
 */
const PERFORMED_CLAIMS = [
  // Present-perfect or passive assertions on a backup/bundle/copy/restore subject
  /\b(?:has|have)\s+been\s+(?:\w+\s+)?(?:restored|uploaded|transferred|copied|archived|backed\s+up)\b/i,
  /\b(?:has|have)\s+been\s+(?:independently\s+|externally\s+|off-machine\s+)+verified\b/i,
  /\b(?:backup|bundle|copy|archive|restore|recovery|upload|transfer)\s+(?:was|were)\s+(?:\w+\s+)?(?:completed|restored|uploaded|transferred|established|performed|verified)\s+(?:off-machine|from\s+a\s+(?:separate|different)\s+machine|to\s+(?:the\s+|an?\s+)?(?:external|remote|off-machine|destination)|externally|independently|successfully)\b/i,
  /\b(?:was|were)\s+(?:restored|uploaded|transferred|verified|copied)\s+(?:off-machine|from\s+a\s+(?:separate|different)\s+machine|to\s+(?:the\s+|an?\s+)?(?:destination|external)|externally)\b/i,
  // Direct completion clauses for off-machine / separate-machine restore or verification
  /\boff-machine\s+(?:backup|restore|recovery|verification|upload|transfer)\s+(?:is\s+complete|is\s+done|is\s+established|completed|succeeded|has\s+completed|was\s+completed)\b/i,
  /\b(?:restore|recovery|verification|upload|transfer)\s+(?:completed|succeeded)\s+(?:off-machine|from\s+a\s+(?:separate|different)\s+machine|externally)\b/i,
  // Present-state assertions that an external/durable backup is already in place (unless negated right before)
  /(?<!\bnot\s)(?<!\bnever\s)\b(?:backup|off-machine\s+copy|external\s+copy)\s+(?:is|are)\s+(?:now\s+|already\s+)?(?:complete|established|in\s+place|stored\s+externally|stored\s+off-machine|durable)\b/i,
];

function performedClaims(rawText) {
  const found = [];
  // Split into paragraphs before collapsing intra-paragraph newlines, so headings/lists don't fuse across blank lines.
  const blocks = String(rawText || "").split(/\n\s*\n/);
  for (const block of blocks) {
    const clean = normaliseProse(block);
    if (!clean) continue;
    for (const re of PERFORMED_CLAIMS) {
      const m = clean.match(re);
      if (m) {
        // Guard against negated clauses such as "no copy has been uploaded" or "has not been restored"
        const prefix = clean.slice(Math.max(0, m.index - 35), m.index);
        if (/\b(?:no|not|never|neither|none|unless|until|whether|if)\b[^.;:]*$/i.test(prefix)) continue;
        found.push(m[0].slice(0, 90));
      }
    }
  }
  return found;
}

/** Check whether `DURABLE_BACKUP_ESTABLISHED` is asserted rather than described as a conditional future replacement. */
function overclaimLines(rawText) {
  const bad = [];
  for (const block of String(rawText || "").split(/\n\s*\n/)) {
    for (const sentence of block.split(/(?<=[.!?;])\s+|\n(?=\|)/)) {
      const flat = sentence.replace(/\s+/g, " ").trim();
      if (!/DURABLE_BACKUP_ESTABLISHED/.test(flat)) continue;
      if (!/\b(?:replac\w*|upgrad\w*|only\s+(?:when|then|after|once)|until|cannot|must\s+not|do\s+not|never)\b/i.test(flat)) {
        bad.push(flat.slice(0, 80));
      }
    }
  }
  return bad;
}

/**
 * @param {{handoffText: string, linkedFrom: Record<string,string>}} input
 *   linkedFrom maps each required document label ("manifest", "procedure", "handover") to its text.
 * @returns {{ok: boolean, errors: string[]}}
 */
function checkHandoff({ handoffText, linkedFrom }) {
  const text = String(handoffText || "");
  const errors = [];
  const doc = linkedFrom || {};

  if (!text.trim()) {
    errors.push("missing: handoff content is empty");
    return { ok: false, errors };
  }

  // 4. Required operational tokens
  for (const [needle, label, reason] of REQUIRED) {
    if (!text.includes(needle)) errors.push(`${label}: ${reason}`);
  }

  // Stale-document guidance (whitespace-normalised so line wraps do not break a legitimate document or hide a removal)
  const flatRaw = text.replace(/\s+/g, " ");
  if (!/regenerate\s+this\s+document\s+before\s+proceeding/i.test(flatRaw)) {
    errors.push("staleness-guidance: no instruction for what to do when the quoted commit is not the current one");
  }

  // Separate-machine + downloaded-copy verification requirement
  if (!/\b(?:different|separate)\s+machine\b/i.test(flatRaw) || !/\bdownloaded\b[^.;]{0,40}\bcopy\b/i.test(flatRaw)) {
    errors.push("off-machine-verify: does not require verifying the downloaded copy from a separate/different machine");
  }

  // 1. Reachability: every required document key must be present and must link to OFF_MACHINE_BACKUP_HANDOFF.md
  for (const reqName of REQUIRED_LINK_DOCS) {
    if (!(reqName in doc) || !String(doc[reqName] || "").trim()) {
      errors.push(`link: required document "${reqName}" was not supplied or is empty`);
    }
  }
  for (const [name, body] of Object.entries(doc)) {
    if (String(body || "").trim() && !String(body).includes("OFF_MACHINE_BACKUP_HANDOFF.md")) {
      errors.push(`link: ${name} does not reference OFF_MACHINE_BACKUP_HANDOFF.md`);
    }
  }

  // 2. Dynamic source identity capture & consistent usage, with no fixed/hard-coded source identity
  if (!/\bSRC=\$\(\s*git\s+rev-parse\s+HEAD\s*\)/.test(text)) {
    errors.push("identity: the procedure does not capture the source commit dynamically with SRC=$(git rev-parse HEAD)");
  }
  // Reject any static assignment `SRC=<literal>` (short SHA, full SHA, or fixed token)
  for (const line of text.split("\n")) {
    if (/\bSRC=(?!\$\(\s*git\s+rev-parse\s+HEAD\s*\))\S+/.test(line)) {
      errors.push(`identity: SRC is assigned a fixed value instead of $(git rev-parse HEAD) (${line.trim().slice(0, 60)})`);
    }
    if (/git\s+bundle\s+create\b/.test(line)) {
      if (!/\$SRC\b|\$\{SRC\}/.test(line)) {
        errors.push(`identity: git bundle create does not use $SRC (${line.trim().slice(0, 60)})`);
      }
      if (/\b[0-9a-f]{7,40}\b/i.test(line)) {
        errors.push(`identity: the bundle command hard-codes a commit hash (${line.trim().slice(0, 60)})`);
      }
    }
    if (/\bsha256sum\b[^\n]*\.bundle/.test(line) && /\b[0-9a-f]{7,40}\b/i.test(line)) {
      errors.push(`identity: sha256sum command hard-codes a commit hash (${line.trim().slice(0, 60)})`);
    }
    if (/\bgit\s+clone\b[^\n]*\.bundle/.test(line) && /\b[0-9a-f]{7,40}\b/i.test(line)) {
      errors.push(`identity: git clone command hard-codes a commit hash (${line.trim().slice(0, 60)})`);
    }
  }

  // 5a. Durability status must not be asserted as established in the handoff OR in any linked document
  for (const [name, body] of [["handoff", text], ...Object.entries(doc)]) {
    const bad = overclaimLines(body);
    if (bad.length) errors.push(`overclaim: ${name} asserts durability (${bad[0]})`);
  }

  // 5b. Neither the handoff nor any linked document may report an off-machine transfer or restore as done
  for (const [name, body] of [["handoff", text], ...Object.entries(doc)]) {
    for (const claim of performedClaims(body)) {
      errors.push(`performed: ${name} reports "${claim}" as having happened`);
    }
  }

  return { ok: errors.length === 0, errors };
}

module.exports = { checkHandoff, performedClaims, overclaimLines, REQUIRED, REQUIRED_LINK_DOCS };
