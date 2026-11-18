/**
 * pytest summary parsing, isolated so it can be tested against malformed output.
 *
 * Why this exists as its own module: the first version of the bundle audit used a single regex that grabbed
 * "388 passed" out of "1 failed, 388 passed", so three bundles with a failing test were reported green. A
 * report that hides a failure is worse than a failing report, so the parser is now (a) explicit about each
 * counter and (b) covered by negative tests in scripts/test_bundle_audit.js.
 *
 * pytest prints, for example:
 *   "1 failed, 388 passed in 2.49s"
 *   "390 passed in 1.55s"
 *   "2 passed, 1 skipped in 0.31s"
 *   "3 errors in 0.51s"
 *   "1 failed, 2 passed, 1 skipped, 3 warnings in 0.40s"
 * The order varies by pytest version, so every counter is taken independently.
 */

const COUNTERS = [
  ["passed", /(\d+)\s+passed/],
  ["failed", /(\d+)\s+failed/],
  ["errors", /(\d+)\s+error(?:s)?\b/],
  ["skipped", /(\d+)\s+skipped/],
  ["xfailed", /(\d+)\s+xfailed/],
  ["xpassed", /(\d+)\s+xpassed/],
];

/**
 * @param {string} text  pytest output (stdout+stderr)
 * @returns {{text: string, counts: object, anyFailure: boolean, ran: boolean}}
 */
function parsePytestSummary(text) {
  const body = String(text || "");
  const counts = {};
  for (const [name, re] of COUNTERS) {
    const m = re.exec(body);
    if (m) counts[name] = Number(m[1]);
  }
  const ran = Object.keys(counts).length > 0;
  const anyFailure = Boolean(counts.failed || counts.errors);
  const order = ["passed", "failed", "errors", "skipped", "xfailed", "xpassed"];
  const parts = order.filter((k) => counts[k] !== undefined).map((k) => `${counts[k]} ${k === "errors" ? "error(s)" : k}`);
  return {
    text: ran ? parts.join(", ") : "no summary",
    counts,
    anyFailure,
    ran,
  };
}

/**
 * A result must never be described as green when any failure counter is non-zero, regardless of how many
 * tests passed. Callers use this rather than eyeballing the string.
 */
function isGreen(parsed) {
  return Boolean(parsed && parsed.ran && !parsed.anyFailure);
}

module.exports = { parsePytestSummary, isGreen };
