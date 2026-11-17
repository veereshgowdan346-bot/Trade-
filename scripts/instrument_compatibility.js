/**
 * INSTR-001 — instrument compatibility matrix.
 *
 * The research mandate specifies intraday EQUITY trading. The only usable price series in the
 * repository is the NIFTY 50 INDEX. These are different instruments with different economics, and
 * this script exists so that difference is stated machine-readably instead of being lost in prose.
 *
 * It does not decide that the proxy study is invalid — it records that a proxy study cannot serve
 * as equity validation, and it marks every segment for which no compatible data exists as BLOCKED.
 *
 * Usage: node scripts/instrument_compatibility.js
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { EXPERIMENTAL_REGISTRY } = require("../dist_test_cjs/experimental_strategies.js");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "data", "provenance", "instrument_compatibility.json");
const MANIFEST = path.join(ROOT, "data", "provenance", "external_dataset_manifest.json");

/** The instrument class the strategies are specified for, per the research mandate. */
const INTENDED_INSTRUMENT = {
  class: "EQUITY",
  segment: "NSE cash market, intraday",
  rationale:
    "The repository models NSE equity intraday execution (kind: 'EQ', productType: 'INTRADAY'), and the engine refuses spot-index orders ('route orders via NIFTY/BANKNIFTY NFO futures'), so equity is the declared trading intent.",
};

const manifest = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
const byId = Object.fromEntries(manifest.datasets.map((d) => [d.id, d]));

const needsVolume = (s) => s.requiredData.some((r) => /volume/i.test(r));

function datasetFacts(id) {
  const d = byId[id];
  if (!d) return null;
  return {
    id,
    upstream: d.provenance.upstream,
    blobSha: d.provenance.upstreamBlobSha,
    licence: d.provenance.licence,
    authenticity: d.provenance.authenticity,
    localSha256: d.provenance.fileSha256,
  };
}

/**
 * Segment inventory. "compatible" means: same instrument class as the mandate AND carrying the
 * provenance/licence needed to publish a conclusion. Nothing here is inferred from file names.
 */
const SEGMENTS = [
  {
    class: "EQUITY",
    status: "BLOCKED",
    datasets: ["20200108", "20200110"].map(datasetFacts).filter(Boolean),
    tradable: true,
    volume: "present in the tapes",
    why: "Two 2020 tapes only, no licence (all rights reserved), multiple symbols interleaved without per-symbol separation (grade F). They cannot support a per-strategy equity study, and they may not be redistributed.",
  },
  {
    class: "INDEX_REFERENCE",
    status: "PROXY_ONLY",
    datasets: ["NIFTY50_1min_2022", "NIFTY50_1min_2023", "NIFTY50_1min_2024"].map(datasetFacts).filter(Boolean),
    tradable: false,
    volume: "absent by construction (index series publishes zero volume)",
    contractSpec: "not applicable — a spot index is a reference series, not a contract",
    lotSize: "not applicable",
    why: "This is the only multi-year series available. It supports a mechanical proxy study, not validation of an equity strategy: the price path is not the traded instrument, and the engine itself rejects spot-index orders.",
  },
  {
    class: "FUTURES",
    status: "BLOCKED",
    datasets: [],
    tradable: true,
    volume: "not available",
    contractSpec: "UNVERIFIED — no contract master or lot size verified in this environment",
    lotSize: "UNVERIFIED",
    why: "No futures price series exists in the repository and the lot-size/expiry basis is unverified, so a futures study cannot be run honestly.",
  },
  {
    class: "OPTIONS",
    status: "NOT_APPLICABLE",
    datasets: [],
    tradable: true,
    volume: "not available",
    contractSpec: "UNVERIFIED",
    lotSize: "UNVERIFIED",
    why: "No option chains, strikes, expiries or IV surfaces are present; no strategy in the registry is an options strategy.",
  },
];

const matrix = EXPERIMENTAL_REGISTRY.map((s) => ({
  id: s.id,
  name: s.name,
  family: s.family,
  enabled: s.enabled,
  intendedInstrument: `${INTENDED_INSTRUMENT.class} — ${INTENDED_INSTRUMENT.segment}`,
  requiresVolume: needsVolume(s),
  dataUsedInStudy: "NIFTY50_1min_{2022,2023,2024}",
  dataClass: "INDEX_REFERENCE",
  tradable: false,
  volumeAvailable: false,
  contractSpec: "not applicable (spot index)",
  lotSize: "not applicable (spot index)",
  sessions: "09:15-15:30 IST, plus enumerated special sessions (2024-03-02, 2024-05-18, 2024-11-01)",
  costModelApplied: "NSE EQUITY intraday (Shoonya defaults) — a documented proxy, NOT this instrument's schedule",
  costModelMatchesInstrument: false,
  provenance: "data/provenance/external_dataset_manifest.json",
  equityValidation: "BLOCKED",
  equityValidationReason: "No licensed, authenticated, per-symbol equity series exists in the repository",
  proxyStudy: needsVolume(s) ? "NOT_EVALUABLE" : "COMPLETED (proxy only)",
  limitations: [
    "The index is a reference series and cannot be traded; the study is a per-Rs 1,00,000 notional normalisation, not an implementable P&L.",
    "An equity intraday cost schedule is applied to an index series; the two errors (wrong schedule, non-tradable series) bias in opposite directions and neither is quantified.",
    ...(needsVolume(s) ? ["The strategy requires volume, which an index series does not publish: results are NOT_EVALUABLE, not negative."] : []),
  ],
}));

const report = {
  generatedAt: new Date().toISOString(),
  command: "node scripts/instrument_compatibility.js",
  issue: "INSTR-001",
  intendedInstrument: INTENDED_INSTRUMENT,
  segmentInventory: SEGMENTS,
  strategies: matrix,
  summary: {
    strategies: matrix.length,
    equityValidationBlocked: matrix.filter((m) => m.equityValidation === "BLOCKED").length,
    proxyStudiesCompleted: matrix.filter((m) => m.proxyStudy.startsWith("COMPLETED")).length,
    notEvaluableVolume: matrix.filter((m) => m.proxyStudy === "NOT_EVALUABLE").length,
    segmentsBlocked: SEGMENTS.filter((s) => s.status === "BLOCKED").length,
  },
  conclusion:
    "The equity strategy mandate cannot be validated with the data in this repository: the equity segment is BLOCKED and the index segment is a proxy only. The proxy study is reported as a mechanical study of the price series, never as equity validation, and never as a tradable result.",
  verdict: "INSTRUMENT_INCOMPATIBLE_FOR_EQUITY_VALIDATION",
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n");

console.log(`instrument compatibility: ${report.verdict}`);
console.log(JSON.stringify(report.summary, null, 2));
for (const s of SEGMENTS) console.log(`  ${s.class.padEnd(16)} ${s.status.padEnd(14)} datasets=${s.datasets.length}`);
console.log(`  strategies: ${matrix.length} (equity validation BLOCKED for all ${report.summary.equityValidationBlocked})`);
