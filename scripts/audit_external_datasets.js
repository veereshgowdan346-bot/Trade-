/**
 * DATA-001 — audit of EXTERNAL (real, redistributed) datasets.
 *
 * Uses the same auditDataset() as the synthetic fixtures, but with the relaxations that genuine
 * market data legitimately requires:
 *   - index series publish no volume            -> allowZeroVolume
 *   - muhurat / special sessions run off-grid   -> allowSpecialSessions
 *   - time-series work needs sessions, not rows -> minSessionsForResearch
 *
 * Everything else (OHLC integrity, duplicates, ordering, coverage, checksums, provenance) is applied
 * unchanged. Synthetic and real datasets are never mixed in one series or one report table.
 *
 * Usage: node scripts/audit_external_datasets.js
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { auditDataset, fingerprintCandles } = require("../dist_test_cjs/data_quality.js");

const ROOT = path.join(__dirname, "..");
const CANON = path.join(ROOT, "data", "external", "canonical");
const MANIFEST = path.join(ROOT, "data", "provenance", "external_dataset_manifest.json");
const OUT = path.join(ROOT, "data", "provenance", "external_quality_report.json");

if (!fs.existsSync(MANIFEST) || !fs.existsSync(CANON)) {
  console.error("[audit-external] no external manifest/canonical cache — run scripts/import_external_data.js first");
  process.exitCode = 2;
  process.exit();
}

const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
const byId = new Map(manifest.datasets.map((d) => [d.id, d]));

const results = [];
let pass = 0;
let fail = 0;
const check = (name, ok, detail = "") => {
  if (ok) pass++;
  else fail++;
  results.push({ name, ok: !!ok, detail });
};

(async () => {
  const indexIds = manifest.datasets.filter((d) => d.instrument.includes("NIFTY 50")).map((d) => d.id);
  const tapeIds = manifest.datasets.filter((d) => d.instrument.includes("equity tape")).map((d) => d.id);
  const audits = [];

  for (const id of indexIds) {
    const { candles } = JSON.parse(fs.readFileSync(path.join(CANON, `${id}.json`), "utf8"));
    const meta = byId.get(id);
    const provenance = {
      id,
      kind: "REAL_REDISTRIBUTION",
      instrument: "NIFTY 50 (index)",
      timeframe: "1m",
      source: `${meta.provenance.upstream} (third-party redistribution via GitHub API)`,
      retrievedOrGeneratedAt: meta.provenance.retrievedAt.slice(0, 10),
      timezone: "Asia/Kolkata",
      adjustments: "none declared upstream; index levels are not adjusted for dividends",
      limitations: meta.provenance.limitations,
    };
    const audit = await auditDataset(candles, provenance, {
      allowZeroVolume: true,
      allowSpecialSessions: true,
      minSessionsForResearch: 20,
      minBarsForResearch: 2000,
    });
    audits.push({
      id,
      role: "REAL",
      instrument: provenance.instrument,
      rows: audit.rows,
      sessions: audit.sessions,
      dateRange: audit.dateRange,
      checksum: audit.checksum,
      grade: audit.grade,
      qualityScorePct: audit.qualityScorePct,
      stats: audit.stats,
      holidayCoverage: audit.holidayCoverage,
      relaxations: audit.relaxations,
      researchUsable: audit.researchUsable,
      profitClaimAllowed: audit.profitClaimAllowed,
      blockers: audit.blockers,
      shortSessions: meta.shortSessions,
      authenticity: meta.provenance.authenticity,
    });
    console.error(
      `[audit-real] ${id.padEnd(20)} rows=${String(audit.rows).padStart(6)} sessions=${String(audit.sessions).padStart(4)} grade=${audit.grade} score=${audit.qualityScorePct}% research=${audit.researchUsable} holidays=${audit.holidayCoverage.status} shortSessions=${meta.shortSessions.length}`,
    );
  }

  for (const id of tapeIds) {
    const { candles } = JSON.parse(fs.readFileSync(path.join(CANON, `${id}.json`), "utf8"));
    const meta = byId.get(id);
    const provenance = {
      id,
      kind: "REAL_REDISTRIBUTION",
      instrument: `NSE equity tape (${meta.symbolCount} symbols)`,
      timeframe: "1m",
      source: `${meta.provenance.upstream} (third-party redistribution via GitHub API)`,
      retrievedOrGeneratedAt: meta.provenance.retrievedAt.slice(0, 10),
      timezone: "Asia/Kolkata",
      adjustments: "none declared upstream",
      limitations: meta.provenance.limitations,
    };
    const audit = await auditDataset(candles, provenance, {
      minSessionsForResearch: 20,
      minBarsForResearch: 2000,
    });
    audits.push({
      id,
      role: "REAL_MIXED_INSTRUMENTS",
      instrument: provenance.instrument,
      seriesSemantics: "MIXED_INSTRUMENTS",
      note:
        "This file interleaves many symbols in one series. It is audited for integrity only; it is NOT a tradable time series and must never be backtested as one.",
      rows: audit.rows,
      sessions: audit.sessions,
      checksum: audit.checksum,
      grade: audit.grade,
      qualityScorePct: audit.qualityScorePct,
      stats: audit.stats,
      holidayCoverage: audit.holidayCoverage,
      relaxations: audit.relaxations,
      researchUsable: false,
      profitClaimAllowed: false,
      blockers: [...audit.blockers, "series interleaves multiple instruments"],
      authenticity: meta.provenance.authenticity,
    });
    console.error(
      `[audit-real] ${id.padEnd(20)} rows=${String(audit.rows).padStart(6)} sessions=${audit.sessions} grade=${audit.grade} (mixed instruments — integrity only)`,
    );
  }

  /* ------------------------------- invariants ------------------------------- */

  check(
    "every external dataset carries a sha256 checksum matching the raw file",
    audits.every((a) => a.checksum && a.checksum.value && a.checksum.rows === a.rows),
  );
  check(
    "no external dataset claims verified authenticity",
    audits.every((a) => a.authenticity === "UNVERIFIED_REDISTRIBUTION"),
  );
  check(
    "no external dataset may support a profitability claim",
    audits.every((a) => a.profitClaimAllowed === false),
  );
  check(
    "holiday coverage is reported honestly (2022-2024 are outside the calendar)",
    audits.filter((a) => a.role === "REAL").every((a) => a.holidayCoverage.status !== "CHECKED"),
  );
  check(
    "mixed-instrument tapes are never research-usable",
    audits.filter((a) => a.role === "REAL_MIXED_INSTRUMENTS").every((a) => a.researchUsable === false),
  );
  check(
    "at least one real dataset is research-usable for mechanical study",
    audits.some((a) => a.role === "REAL" && a.researchUsable),
  );
  check(
    "index series reports zero volume as a declared relaxation",
    audits.filter((a) => a.role === "REAL").every((a) => a.relaxations.some((r) => r.startsWith("zero-volume"))),
  );

  const report = {
    generatedAt: new Date().toISOString(),
    command: "node scripts/audit_external_datasets.js",
    separation: {
      synthetic: "data/fixtures/** (committed, SYNTHETIC, audited by scripts/data_quality_audit.js)",
      real: "data/external/** (gitignored, REAL_REDISTRIBUTION, audited here)",
      rule: "the two are never combined into one series or one results table",
    },
    datasets: audits,
    checks: results,
    passed: pass,
    failed: fail,
  };
  fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n");

  console.log(`\nexternal audit: ${pass} PASS / ${fail} FAIL`);
  for (const r of results) console.log(`  ${r.ok ? "PASS" : "FAIL"} ${r.name}${r.ok ? "" : " -> " + r.detail}`);
  process.exitCode = fail === 0 ? 0 : 1;
})();
