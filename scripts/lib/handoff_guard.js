/**
 * Off-machine handoff guard.
 *
 * The handoff is the only document that tells an owner how to replace DURABLE_BACKUP_NOT_ESTABLISHED, so it is
 * also the document most able to mislead: it can pin a stale commit, claim a recovery that never happened, or drift
 * out of reach of the other documents. Each rule below corresponds to a failure that was actually observed during
 * this audit, and each has a verified mutation test in scripts/test_bundle_audit.js.
 *
 * Rules:
 *   1. Every required linking document must exist, be passed in, and reference the exact root path
 *      OFF_MACHINE_BACKUP_HANDOFF.md (not a renamed prefix/suffix/subdirectory lookalike).
 *   2. The handoff must capture the source identity dynamically at bundle time (`SRC=$(git rev-parse HEAD)`),
 *      reference `$SRC` in the bundle/verify commands, and never hard-code a commit SHA or fixed literal in
 *      `SRC=...`, `git bundle create`, `sha256sum`, or `git clone`.
 *   3. It must instruct the operator what to do when the quoted commit is stale.
 *   4. It must require verification from a separate/different machine against the downloaded copy, plus
 *      `sha256sum`, `git fsck --full`, and `npm ci`.
 *   5. Neither the handoff nor any linked document may assert that durability is established or that an
 *      off-machine transfer, upload, or restore has already occurred — regardless of section placement,
 *      Markdown emphasis/blockquote/heading/list/table formatting, paragraph/line splitting, hyphenation,
 *      backtick wrapping, or passive/synonymous completion phrasing.
 */
"use strict";

const REQUIRED_LINK_DOCS = ["manifest", "procedure", "handover"];

const REQUIRED = [
  ["DURABLE_BACKUP_NOT_ESTABLISHED", "status", "does not carry the current durability status"],
  ["git fsck --full", "fsck", "does not require a filesystem check on the downloaded copy"],
  ["sha256sum", "hash", "does not require a hash comparison"],
  ["npm ci", "deps", "does not require a dependency rebuild"],
];

/** Exact root-file reference (allows optional `./`, backticks, parens, quotes, or sentence-final period; rejects `.bak`, prefixes, or subdirs). */
const EXACT_HANDOFF_LINK_RE = /(?:^|[^A-Za-z0-9_./-])(?:\.\/)?OFF_MACHINE_BACKUP_HANDOFF\.md(?=$|\.(?:\s|$)|[^A-Za-z0-9_./-])/;

/** Strip shell-command code spans (fenced or inline) while keeping prose wrapped in backticks/fences visible. */
function stripCommandCode(s) {
  const cmdStart = /^(?:git|npm|node|python3?|pip|curl|mkdir|cd|sha256sum|cat|ls|rm|cp|mv|echo|SRC=|QT_QPA_|OMNI_|BUNDLE_)\b/;
  return String(s || "")
    .replace(/```[^\n]*\n([\s\S]*?)```/g, (full, body) => {
      const nonEmpty = String(body).split("\n").map((l) => l.trim()).filter(Boolean);
      if (nonEmpty.length > 0 && nonEmpty.every((l) => cmdStart.test(l) || l.startsWith("#"))) return " ";
      return body;
    })
    .replace(/`([^`\n]*)`/g, (full, inner) => (cmdStart.test(inner.trim()) ? " " : inner));
}

/** Strip Markdown emphasis/blockquote markers and normalise whitespace and `off machine` / `off-machine` variants. */
function normaliseProse(text) {
  return stripCommandCode(text)
    .replace(/^\s*>\s?/gm, " ")
    // Strip inline Markdown emphasis wrappers (**bold**, __bold__, *italic*, _italic_, ~~strike~~) at word boundaries
    .replace(/(?:^|(?<=[\s([{"']))[*_~]+|[*_~]+(?=[\s)\]}"'.,;:!?]|$)/g, "")
    .replace(/off\s*-\s*machine|off\s+machine/gi, "off-machine")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Segment Markdown into independent clause windows while keeping sentences split across soft wraps or mid-sentence
 * blank lines together: headings (`# ...`) and table rows (`| ... |`) become hard boundaries, whereas unpunctuated
 * paragraph breaks collapse into the continuing sentence.
 */
function proseSegments(rawText) {
  const marked = String(rawText || "")
    .replace(/^#+\s+.*$/gm, (m) => `\n@@SEG@@ ${m} @@SEG@@\n`)
    .replace(/^\|.*\|$/gm, (m) => `\n@@SEG@@ ${m} @@SEG@@\n`);
  return marked
    .split(/@@SEG@@/)
    .map((chunk) => normaliseProse(chunk))
    .filter(Boolean);
}

const LOCATION_QUALIFIER =
  "(?:off-machine|(?:on|from|in|at|by|across|using)\\s+(?:a\\s+|an\\s+|the\\s+)?(?:separate|different|external|second|independent|remote)\\s+(?:machine|host|system|server|environment)|to\\s+(?:the\\s+|an?\\s+)?(?:external|remote|off-machine|destination)(?:\\s+\\w+)?|externally|independently|successfully)";

/**
 * Narrow, explainable structural patterns for claims that an off-machine backup, transfer, or restore has already
 * happened (auxiliary + past participle, or explicit off-machine/external completion clause).
 */
const PERFORMED_CLAIMS = [
  // Present-perfect passive assertions ("has been restored", "has been downloaded and verified", "have been backed up")
  /\b(?:has|have)\s+been\s+(?:[\w-]+\s+(?:and\s+)?)?(?:restored|uploaded|transferred|copied|archived|backed\s+up)\b/i,
  /\b(?:has|have)\s+been\s+(?:(?:independently|externally|off-machine|downloaded|restored|uploaded)\s+(?:and\s+)?)+verified\b/i,
  // Past-passive assertions on backup/bundle/copy/restore subjects qualified by external/separate-machine context
  new RegExp(
    `\\b(?:backup|bundle|copy|archive|restore|restoration|recovery|upload|transfer)\\s+(?:was|were)\\s+(?:[\\w-]+\\s+(?:and\\s+)?)?(?:completed|restored|uploaded|transferred|established|performed|verified|validated|confirmed)\\s+${LOCATION_QUALIFIER}\\b`,
    "i",
  ),
  new RegExp(
    `\\b(?:was|were)\\s+(?:[\\w-]+\\s+(?:and\\s+)?)?(?:restored|uploaded|transferred|verified|validated|copied)\\s+${LOCATION_QUALIFIER}\\b`,
    "i",
  ),
  // Direct completion clauses ("off-machine restoration succeeded", "recovery completed from a separate machine")
  /\boff-machine\s+(?:backup|restore|restoration|recovery|verification|validation|upload|transfer)\s+(?:is\s+complete|is\s+done|is\s+established|is\s+verified|completed|succeeded|passed|has\s+completed|was\s+completed|was\s+verified)\b/i,
  new RegExp(
    `\\b(?:restore|restoration|recovery|verification|validation|upload|transfer)\\s+(?:completed|succeeded|passed)\\s+${LOCATION_QUALIFIER}\\b`,
    "i",
  ),
  // Present-state assertions that an external/durable backup is already in place (unless negated)
  /(?<!\bnot\s)(?<!\bnever\s)\b(?:backup|off-machine\s+copy|external\s+copy|external\s+backup)\s+(?:is|are|was)\s+(?:now\s+|already\s+)?(?:complete|established|verified|in\s+place|stored\s+externally|stored\s+off-machine|durable)\b/i,
];

function performedClaims(rawText) {
  const found = [];
  for (const clean of proseSegments(rawText)) {
    for (const re of PERFORMED_CLAIMS) {
      const m = clean.match(re);
      if (m) {
        const prefix = clean.slice(Math.max(0, m.index - 40), m.index);
        if (/\b(?:no|not|never|neither|none|unless|until|whether|if|once|after|when|before)\b[^.;:!?]*$/i.test(prefix)) continue;
        found.push(m[0].slice(0, 90));
      }
    }
  }
  return found;
}

/**
 * Check whether `DURABLE_BACKUP_ESTABLISHED` is asserted rather than described as a conditional future replacement.
 * Splits on sentence punctuation AND structural Markdown boundaries (headings, tables, blockquotes, list items) so
 * an adjacent heading/list/blockquote mentioning "upgrade" cannot mask an unqualified status upgrade.
 */
function overclaimLines(rawText) {
  const bad = [];
  const structuralUnits = String(rawText || "")
    .split(/\n\s*\n|(?<=^#[^\n]*)\n|\n(?=\s*(?:#|\||>|[-*+]\s|\d+\.\s))/m);
  for (const unit of structuralUnits) {
    for (const sentence of unit.split(/(?<=[.!?;])\s+/)) {
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

  // 1. Reachability: every required document key must be present and must contain an exact token-bounded link
  for (const reqName of REQUIRED_LINK_DOCS) {
    if (!(reqName in doc) || !String(doc[reqName] || "").trim()) {
      errors.push(`link: required document "${reqName}" was not supplied or is empty`);
    }
  }
  for (const [name, body] of Object.entries(doc)) {
    const s = String(body || "");
    if (s.trim() && !EXACT_HANDOFF_LINK_RE.test(s)) {
      errors.push(`link: ${name} does not reference OFF_MACHINE_BACKUP_HANDOFF.md`);
    }
  }

  // 2. Dynamic source identity capture & consistent usage, with no fixed/hard-coded source identity
  if (!/\bSRC=\$\(\s*git\s+rev-parse\s+HEAD\s*\)/.test(text)) {
    errors.push("identity: the procedure does not capture the source commit dynamically with SRC=$(git rev-parse HEAD)");
  }
  for (const line of text.split("\n")) {
    if (/\bSRC=(?!\$\(\s*git\s+rev-parse\s+HEAD\s*\))\S+/.test(line)) {
      errors.push(`identity: SRC is assigned a fixed value instead of $(git rev-parse HEAD) (${line.trim().slice(0, 60)})`);
    }
    if (/git\s+bundle\s+create\b/.test(line)) {
      if (!/\$SRC\b|\$\{SRC\}/.test(line)) {
        errors.push(`identity: git bundle create does not use $SRC (${line.trim().slice(0, 60)})`);
      }
      if (/(?:^|[^A-Za-z0-9])[0-9a-f]{7,40}(?:$|[^A-Za-z0-9])/i.test(line)) {
        errors.push(`identity: the bundle command hard-codes a commit hash (${line.trim().slice(0, 60)})`);
      }
    }
    if (/\bsha256sum\b[^\n]*\.bundle/.test(line) && /(?:^|[^A-Za-z0-9])[0-9a-f]{7,40}(?:$|[^A-Za-z0-9])/i.test(line)) {
      errors.push(`identity: sha256sum command hard-codes a commit hash (${line.trim().slice(0, 60)})`);
    }
    if (/\bgit\s+clone\b[^\n]*\.bundle/.test(line) && /(?:^|[^A-Za-z0-9])[0-9a-f]{7,40}(?:$|[^A-Za-z0-9])/i.test(line)) {
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

module.exports = {
  checkHandoff,
  performedClaims,
  overclaimLines,
  EXACT_HANDOFF_LINK_RE,
  REQUIRED,
  REQUIRED_LINK_DOCS,
};
