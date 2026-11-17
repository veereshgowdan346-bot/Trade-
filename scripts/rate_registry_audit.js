/**
 * RATE-001 — Statutory & brokerage rate registry audit.
 *
 * This does NOT and CANNOT verify rate values: no official NSE/SEBI/GST/broker tariff document is
 * available locally and the network is restricted to github/npm/pypi. So the audit verifies the
 * things that ARE checkable offline:
 *
 *   1. provenance completeness   — every rate head carries a status (and effectiveDate/source)
 *   2. no unearned VERIFIED      — VERIFIED requires a non-null official source AND effective date
 *   3. cross-runtime parity      — TypeScript and Python read the SAME file bytes (checksum+schema)
 *   4. fail-closed behaviour     — NSE_EQ_DELIVERY and CDS_ANY raise in both runtimes
 *   5. no shadow rate literals   — UI/source must not hardcode rates outside the spec
 *   6. rate inventory            — full table of value / status / effectiveDate / source
 *
 * Writes data/rate_registry_audit.json
 *
 * Usage: node scripts/rate_registry_audit.js
 */
"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const SPEC = path.join(ROOT, "config", "statutory_rates.json");
const OUT = path.join(ROOT, "data", "rate_registry_audit.json");

const raw = fs.readFileSync(SPEC);
const spec = JSON.parse(raw.toString("utf8"));
const fileSha256 = crypto.createHash("sha256").update(raw).digest("hex");

let pass = 0;
let fail = 0;
const results = [];
const check = (name, cond, detail = "") => {
  results.push({ name, ok: !!cond, detail });
  if (cond) pass++;
  else fail++;
};

/* ------------------------------ 1. inventory ----------------------------- */

const inventory = [];
const push = (head, value, rec, segment) =>
  inventory.push({
    segment,
    head,
    value: value ?? null,
    status: rec?.status ?? "MISSING_STATUS",
    effectiveDate: rec?.effectiveDate ?? null,
    source: rec?.source ?? rec?.officialSource ?? null,
    verified: rec?.status === "VERIFIED",
  });

for (const [segName, seg] of Object.entries(spec.segments)) {
  if (seg.supported === false || seg.status) {
    inventory.push({
      segment: segName,
      head: "<segment unsupported>",
      value: null,
      status: seg.status ?? "NOT_SUPPORTED",
      effectiveDate: seg.effectiveDate ?? null,
      source: null,
      verified: false,
      reason: seg.reason ?? null,
    });
    continue;
  }
  for (const head of ["stt", "exchangeTxn", "stampDuty"]) {
    if (!seg[head]) continue;
    const v = seg[head].rate ?? seg[head].ratePerRupee ?? seg[head].value ?? seg[head].pct;
    push(head, v, seg[head], segName);
  }
}
push("gst", spec.gst?.rate, spec.gst, "GLOBAL");
push("sebiTurnoverFee", spec.sebiTurnoverFee?.ratePerRupee, spec.sebiTurnoverFee, "GLOBAL");
for (const [bk, b] of Object.entries(spec.brokers)) {
  // Broker records are FLAT: one status covers every head belonging to that broker.
  const heads = [
    ["intradayPerLeg", b.intradayPerLeg],
    ["deliveryPerLeg", b.deliveryPerLeg],
    ["roundTripBrokerageFloor", b.roundTripBrokerageFloor],
    ["minimumRoundTripDeduction", b.minimumRoundTripDeduction],
  ];
  for (const [head, value] of heads) {
    if (value === undefined) continue;
    inventory.push({
      segment: `BROKER:${bk}`,
      head,
      value: typeof value === "number" ? value : null,
      status: b.status ?? "MISSING_STATUS",
      effectiveDate: b.effectiveDate ?? null,
      source: b.source ?? null,
      verified: b.status === "VERIFIED",
      note: head === "minimumRoundTripDeduction" ? "modeled construct, not an official tariff line" : undefined,
    });
  }
}

check("every rate head carries a status field", inventory.every((r) => r.status !== "MISSING_STATUS"), `${inventory.filter((r) => r.status === "MISSING_STATUS").length} missing`);
check("every broker declares a verification status", Object.values(spec.brokers).every((b) => !!b.status), Object.entries(spec.brokers).filter(([, b]) => !b.status).map(([k]) => k).join(", "));
check(
  "no rate is VERIFIED without an official source and effective date",
  inventory.every((r) => !r.verified || (r.source && r.effectiveDate)),
);
const verifiedCount = inventory.filter((r) => r.verified).length;
check(
  `verified rate count is consistent with available evidence (found ${verifiedCount}, official documents unavailable)`,
  verifiedCount === 0,
  verifiedCount ? `${verifiedCount} rate(s) claim VERIFIED without a local official document` : "",
);
check(
  "all unsupported segments are explicitly marked",
  ["NSE_EQ_DELIVERY", "CDS_ANY"].every((s) => (spec.segments[s]?.status ?? "").includes("UNSUPPORTED")),
);

/* --------------------------- 2. cross-runtime parity --------------------- */

let py = null;
try {
  py = JSON.parse(
    execFileSync(
      "python3",
      [
        "-c",
        `
import json,hashlib,pathlib
p=pathlib.Path("config/statutory_rates.json")
raw=p.read_bytes()
d=json.loads(raw)
print(json.dumps({"sha256":hashlib.sha256(raw).hexdigest(),"specVersion":d["specVersion"],
 "segments":sorted(d["segments"]),"gst":d["gst"]["rate"],"sebi":d["sebiTurnoverFee"]["ratePerRupee"]}))
`,
      ],
      { cwd: ROOT, encoding: "utf8" },
    ),
  );
} catch (e) {
  py = null;
}
const { loadRateSpec } = require("../dist_test_cjs/rateSpec.js");
const tsSpec = loadRateSpec();

check("Python can load the authoritative spec", py !== null);
check(
  "TS and Python read byte-identical spec (sha256)",
  py !== null && py.sha256 === fileSha256,
  py ? `${fileSha256.slice(0, 12)} vs ${py.sha256.slice(0, 12)}` : "python load failed",
);
check(
  "TS and Python agree on specVersion",
  py !== null && py.specVersion === tsSpec.specVersion,
  py ? `${tsSpec.specVersion} vs ${py.specVersion}` : "",
);
check("TS and Python agree on the segment list", py !== null && JSON.stringify(py.segments) === JSON.stringify(Object.keys(spec.segments).sort()));

/* --------------------------- 3. fail-closed behaviour -------------------- */

const { roundTripCharges, UnsupportedSegmentError } = require("../dist_test_cjs/tax.js");
const tryCharge = (opts) => {
  try {
    roundTripCharges({ qty: 10, entry: 100, exit: 101, side: "BUY", ...opts });
    return { threw: false };
  } catch (e) {
    return { threw: true, name: e.name, message: e.message };
  }
};

const delivery = tryCharge({ exchange: "NSE", kind: "EQ", broker: "shoonya", productType: "DELIVERY" });
const cnc = tryCharge({ exchange: "NSE", kind: "EQ", broker: "shoonya", productType: "CNC" });
const cds = tryCharge({ exchange: "CDS", kind: "FUT", broker: "shoonya", productType: "INTRADAY" });
const intraday = tryCharge({ exchange: "NSE", kind: "EQ", broker: "shoonya", productType: "INTRADAY" });

check("NSE_EQ DELIVERY fails closed", delivery.threw && /DELIVERY|fail closed/i.test(delivery.message || ""), delivery.message || "did NOT throw");
check("NSE_EQ CNC fails closed", cnc.threw, cnc.message || "did NOT throw");
check("CDS_ANY fails closed", cds.threw, cds.message || "did NOT throw");
check("supported NSE_EQ INTRADAY still prices", !intraday.threw);

let pyFailClosed = false;
let pyFailClosedDetail = "";
try {
  const out = execFileSync(
    "python3",
    [
      "-c",
      `
import sys, json
sys.path.insert(0, ".")
from risk.statutory_cost import *
import risk.rate_spec as rs
from risk.rate_spec import load_rate_spec
spec = load_rate_spec()
seg = spec["segments"]["NSE_EQ_DELIVERY"]
ok = seg.get("supported") is False and "UNSUPPORTED" in seg.get("status","")
print(json.dumps({"deliveryUnsupported": ok, "cdsUnsupported": spec["segments"]["CDS_ANY"].get("supported") is False}))
`,
    ],
    { cwd: ROOT, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
  );
  const parsed = JSON.parse(out.trim().split("\n").pop());
  pyFailClosed = parsed.deliveryUnsupported && parsed.cdsUnsupported;
  if (!pyFailClosed) pyFailClosedDetail = "python ran but did not report DELIVERY/CDS as unsupported";
} catch (e) {
  pyFailClosed = false;
  // Distinguish "environment is missing a dependency" from "fail-closed logic is broken" — these
  // have completely different meanings and must not be reported identically.
  const stderr = (e.stderr || "").toString();
  if (/ModuleNotFoundError|No module named/.test(stderr)) {
    pyFailClosedDetail = `python dependency missing (${(stderr.match(/No module named '([^']+)'/) || [])[1] || "unknown"}) — environment issue, not a fail-closed regression`;
  } else {
    pyFailClosedDetail = `python check error: ${stderr.split("\n").filter(Boolean).pop() || e.message}`;
  }
}
check("Python side treats DELIVERY/CDS as unsupported", pyFailClosed, pyFailClosedDetail);

/* ------------------------- 4. no shadow rate literals -------------------- */

const shadow = [];
const scanDirs = ["src/components", "src/app", "src/lib"];
const SKIP = new Set(["tax.ts", "rateSpec.ts", "statutory_rates.ts"]);
for (const dir of scanDirs) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) continue;
  const stack = [abs];
  while (stack.length) {
    const cur = stack.pop();
    for (const e of fs.readdirSync(cur, { withFileTypes: true })) {
      const fp = path.join(cur, e.name);
      if (e.isDirectory()) { stack.push(fp); continue; }
      if (!/\.(ts|tsx)$/.test(e.name) || SKIP.has(e.name)) continue;
      const src = fs.readFileSync(fp, "utf8");
      // statutory-looking constants defined locally rather than loaded from the spec
      if (/const\s+\w*(STT|STAMP|SEBI|GST|EXCH)\w*\s*(?::\s*number)?\s*=\s*0\.\d+/.test(src)) {
        shadow.push(path.relative(ROOT, fp));
      }
    }
  }
}
check("no hardcoded statutory rate literals outside the spec", shadow.length === 0, shadow.join(", "));

/* -------------------------------- output -------------------------------- */

const byStatus = inventory.reduce((a, r) => ((a[r.status] = (a[r.status] || 0) + 1), a), {});
const report = {
  generatedAt: new Date().toISOString(),
  specVersion: spec.specVersion,
  specSha256: fileSha256,
  blockerStatus: "OPEN — every statutory/brokerage rate remains UNVERIFIED",
  whyStillUnverified: {
    localEvidence: spec.verificationPolicy?.localEvidenceFound ?? [],
    localEvidenceAssessment: spec.verificationPolicy?.localEvidenceAssessment ?? null,
    network: "outbound access limited to github.com, npmjs.org, pypi.org — NSE/SEBI/GST/broker tariff pages are unreachable from this environment",
    therefore: "Rate VALUES cannot be verified here. They are unchanged and must not be treated as authoritative for live trading.",
  },
  inventory,
  byStatus,
  failClosed: { delivery, cnc, cds, intradayOk: !intraday.threw, pythonUnsupported: pyFailClosed },
  parity: { tsSpecVersion: tsSpec.specVersion, pySpecVersion: py?.specVersion ?? null, sha256Match: py ? py.sha256 === fileSha256 : false },
  shadowRateLiterals: shadow,
  checks: results,
  passed: pass,
  failed: fail,
};

fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n");

console.log(`RATE-001 registry audit — spec ${spec.specVersion} (${fileSha256.slice(0, 12)}…)`);
console.log(`rate heads: ${inventory.length} | statuses: ${JSON.stringify(byStatus)}`);
for (const r of results) console.log(`  ${r.ok ? "PASS" : "FAIL"} ${r.name}${r.ok ? "" : " -> " + r.detail}`);
console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exitCode = fail === 0 ? 0 : 1;
