#!/usr/bin/env node
/**
 * Generates the two handover artefacts for the final closure pass:
 *
 *   MISSING_EVIDENCE_REGISTER.md — one row per required external document, with issuing authority,
 *                                  applicable date range and the validation criterion that would
 *                                  move the item from UNVERIFIED to VERIFIED.
 *   FINAL_HANDOVER.md           — three responsible-party sections (account owner / external evidence /
 *                                  code), built from the live artefacts so the numbers cannot drift.
 *
 * Nothing here invents evidence. Every figure comes from an artefact produced by a test or audit script.
 */
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const read = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), "utf8"));
const code = (s) => String.fromCharCode(96) + s + String.fromCharCode(96);

const rates = read("data/rate_registry_audit.json");
const calendar = read("data/provenance/calendar_crosscheck.json");
const history = read("data/security/git_history_scan.json");
const regression = read("data/security/regression_run.json");
const defects = read("data/security/application_defects.json");
const mutation = read("data/security/mutation_check.json");
const envConfig = read("data/security/env_config_audit.json");
const manual = read("data/provenance/external_dataset_manifest.json");

const stats = read("data/provenance/statistical_robustness_strict.json");
const cost = read("data/provenance/cost_sensitivity_strict.json");
const instr = read("data/provenance/instrument_compatibility.json");

const oos = cost.periods.find((p) => p.period === "OOS");
const statSummary = stats.summary;
/* The headline is the sum of the eight arm nets at the harness-baseline slippage. The pooled total is the same
   trades aggregated together and rounds to one paisa less, so the two are reported separately rather than
   silently reconciled. */
const baseKey = Object.keys(oos.pooled).find((k) => oos.pooled[k].bpsPerSide === cost.baseBpsPerSide);
const oosNet = baseKey ? oos.perArm.reduce((a, x) => a + x.netByAssumption[baseKey].net, 0) : NaN;
const oosNetPooled = baseKey ? oos.pooled[baseKey].net : NaN;
const money = (v) => (v < 0 ? "-Rs " : "+Rs ") + Math.abs(v).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ------------------------------------------------------------------ missing evidence */

// Issuing authority and validation criterion per rate head. Derived from the head name; no rate value is
// asserted here, only who must publish it and what would make it acceptable.
const HEAD_EVIDENCE = {
  stt: { doc: "Securities Transaction Tax rate notification (Finance Act / STT Rules, current schedule)", authority: "Central Board of Direct Taxes (CBDT), Government of India", range: "rate in force for each backtested session, 2022-01-01 onward", criterion: "official rate table stating the rate per instrument class and its effective date; must match the charge applied on that date" },
  exchangeTxn: { doc: "Exchange transaction-charge circular for the relevant segment", authority: "NSE / MCX (as published on the exchange website)", range: "each circular's effective period covering 2022-01-01 onward", criterion: "circular number, effective date and per-lakh or per-crore rate referenced directly" },
  stampDuty: { doc: "Stamp duty schedule for securities market instruments", authority: "State stamp authorities consolidated by the exchange / SEBI", range: "rates applicable on each trade date", criterion: "state-wise schedule and collecting agency, with the effective date" },
  gst: { doc: "GST rate notification applicable to brokerage and transaction charges", authority: "Central Board of Indirect Taxes and Customs (CBIC)", range: "rate in force per trade date", criterion: "notification citing the 18% category and its effective period" },
  sebiTurnoverFee: { doc: "SEBI turnover-fee circular", authority: "Securities and Exchange Board of India (SEBI)", range: "rate in force per trade date", criterion: "circular stating the rate and the date it took effect" },
  intradayPerLeg: { doc: "Published brokerage tariff card (intraday)", authority: "Broker (Shoonya / Finvasia; Angel One; Groww)", range: "tariff in force on each trade date", criterion: "current tariff page or PDF from the broker showing the per-order charge" },
  deliveryPerLeg: { doc: "Published brokerage tariff card (delivery)", authority: "Broker (Shoonya / Finvasia; Angel One; Groww)", range: "tariff in force on each trade date", criterion: "current tariff page or PDF showing the delivery charge" },
  roundTripBrokerageFloor: { doc: "Broker tariff card stating minimum/round-trip brokerage", authority: "Broker (Shoonya / Finvasia; Angel One; Groww)", range: "tariff in force on each trade date", criterion: "explicit statement of the minimum charge per round trip" },
  minimumRoundTripDeduction: { doc: "Broker tariff card plus depot/DP charge schedule", authority: "Broker (Shoonya / Finvasia; Angel One; Groww)", range: "tariff in force on each trade date", criterion: "itemised minimum total deduction per round trip, sourced not inferred" },
};

const missingRows = rates.inventory.map((h) => {
  const key = String(h.head).replace(/^<|>$/g, "");
  const ev = HEAD_EVIDENCE[key] || { doc: "Authoritative publication for this head", authority: "Competent authority (not yet identified)", range: "trade dates covered", criterion: "primary document stating the value and effective date" };
  const status = h.status;
  const segmentNote = status === "UNSUPPORTED_NO_EVIDENCE"
    ? "Segment is not modelled at all; evidence would be a prerequisite for modelling it, not just for costing."
    : status === "UNVERIFIED_ASSUMED_SAME_AS_ANGEL"
      ? "Currently assumed identical to Angel One rather than sourced — the assumption itself must be evidenced."
      : "Value is used by the cost model but has no document behind it.";
  return { segment: h.segment, head: key === "<segment unsupported>" ? "(segment not modelled)" : key, status, ev, segmentNote };
});

const headTable = [
  "| # | Segment | Head | Status | Required document | Issuing authority | Applicable date range | Validation criterion |",
  "|---|---|---|---|---|---|---|---|",
  ...missingRows.map((r, i) => `| ${i + 1} | ${r.segment} | ${r.head} | **${r.status}** | ${r.ev.doc} | ${r.ev.authority} | ${r.ev.range} | ${r.ev.criterion} |`),
];

const calRows = calendar.years.map((y) => {
  if (y.status === "UNCHECKED") {
    return `| ${y.year} | UNCHECKED | No session dataset for the year | NSE official holiday list for ${y.year} | NSE | Full year | Every trading session in the year must match an official holiday list and the exchange's special-session circulars |`;
  }
  const bad = (y.calendarOnly || []).filter((d) => String(d.classification).includes("weekday"));
  if (!bad.length) return null;
  return `| ${y.year} | DISCREPANCY | ${bad.map((d) => d.date + " (" + d.classification + ")").join(", ")} — in the third-party calendar but absent from the data | NSE circular / official trading-holiday list covering that date | NSE | ${bad[0].date} | An official circular confirming whether the exchange traded, plus the data vendor's explanation for the missing session |`;
}).filter(Boolean);

const blockedOf = code(instr.summary.equityValidationBlocked + " of " + instr.summary.strategies);
const missingDoc = `# Missing-Evidence Register

OmniTradePro Apex V2.0 · generated ${new Date().toISOString().slice(0, 10)} by ${code("scripts/generate_handover.js")}.

This register lists every external document that is **required but not held**. Nothing in this repository
may be upgraded from ${code("UNVERIFIED")} without the document named below. No value has been estimated,
interpolated or substituted, and none may be.

Status of the cost model: **${rates.blockerStatus}** — ${rates.byStatus.UNVERIFIED} heads UNVERIFIED,
${rates.byStatus.UNSUPPORTED_NO_EVIDENCE} segments without any evidence, ${rates.byStatus.UNVERIFIED_ASSUMED_SAME_AS_ANGEL} heads assumed rather than sourced.

## 1. Transaction-cost heads (${rates.inventory.length} of ${rates.inventory.length} unverified)

${headTable.join("\n")}

A head becomes VERIFIED only when the document above is held locally, names the rate **and** the date it took
effect, and the value in the registry matches it. A matching hash proves file identity, never authenticity.

## 2. Calendar evidence

| Year | Current state | Problem | Required document | Issuing authority | Applicable date range | Validation criterion |
|---|---|---|---|---|---|---|
${calRows.join("\n")}
| 2025 | UNCHECKED | No dataset for 2025; the year was never assessed | NSE official holiday list and special-session circulars for 2025 | NSE | 2025-01-01 to 2025-12-31 | Session-for-session agreement with the official list; anything less is not "verified" |

## 3. Equity-instrument data

| Requirement | Current state | Why the existing data will not do | Acceptance criterion |
|---|---|---|---|
| Authentic, appropriately licensed **equity-instrument** intraday data | Only NIFTY **index** data is held (third-party mirrors; one repository has **no licence**) | Index levels are not tradable equity instruments, and the instrument-compatibility audit blocks ${blockedOf} strategies for equity validation | A licence statement naming the permitted use, a vendor or exchange as the origin, and per-instrument OHLCV that reconciles to an official session calendar |

## 4. What would NOT satisfy these rows

- A screenshot, a blog, a broker marketing page without an effective date, or a value "everyone knows".
- A file whose hash matches a recorded hash but whose origin cannot be established.
- Any number produced by fitting the backtest to published results.
`;

/* ------------------------------------------------------------------ handover */

const bundleAuditFile = path.join(ROOT, "data", "security", "bundle_audit.json");
const bundleAudit = fs.existsSync(bundleAuditFile) ? JSON.parse(fs.readFileSync(bundleAuditFile, "utf8")) : { count: 0, historicallyRecorded: { count: 0 } };
const bundleFacts = { onDisk: bundleAudit.count, destroyed: (bundleAudit.historicallyRecorded || {}).count || 0 };

const failedGates = regression.gates.filter((g) => g.asExpected === false);
const byDesign = regression.gates.filter((g) => g.exitCode !== 0 && g.asExpected === true);
const gateByName = (re) => regression.gates.find((g) => re.test(g.name)) || { summary: "not run", exitCode: null };
const openDefects = defects.defects.filter((d) => {
  const st = String(d.status).toUpperCase();
  return !st.startsWith("FIXED") && !st.startsWith("ACCEPTED");
});
const acceptedDefects = defects.defects.filter((d) => String(d.status).toUpperCase().startsWith("ACCEPTED"));
const hist = history.summary;

const handover = `# Final Handover

OmniTradePro Apex V2.0 · generated ${new Date().toISOString().slice(0, 10)} by ${code("scripts/generate_handover.js")}.

**Decision: SECURITY BLOCKED — RESEARCH/PAPER ONLY.** Nothing in this document authorises live trading,
real-money execution or production deployment. Every remaining blocker below belongs to someone other than
the codebase, and none of them can be discharged by writing more code.

---

## A. Account-owner actions

These require the owner of the broker account to act inside the broker's own interface. They must not be
performed by an automated agent, and this repository must never be given the credentials to perform them.

### A1. Revoke the exposed broker API credentials — **NOT_CONFIRMED**

- **Why:** ${hist.findingCount} findings across ${hist.distinctCommitsAffected} commits reachable from
  origin/master are public. Values displayed in every scan: ${hist.valuesDisplayed ?? 0} (by design).
- **Action:** log in to the broker's developer/API console and **delete or regenerate** the API key in use
  during the affected period.
- **Confirmation required:** a dated statement from the owner that the old key no longer authenticates.
  Until then rotation stays ${code("NOT_CONFIRMED")} and the incident stays open.

### A2. Reset the TOTP seed — **NOT_CONFIRMED**

- **Why:** a leaked TOTP seed is worse than a leaked API key: it lets anyone with the seed mint valid second
  factors for the account.
- **Action:** disable and re-enrol TOTP in the broker's security settings, which issues a new seed.
- **Confirmation required:** dated owner confirmation that the previous seed is invalid.

### A3. Record a decision on the historical Git exposure

- Either "accepted risk, no rewrite", or a completed rewrite performed by the owner outside this workspace.
- The plan, its risks and its prerequisites are in ${code("FINAL_READINESS_REPORT/GIT_HISTORY_REMEDIATION_PLAN.md")}.
- **Do not** rewrite while the credentials are still live — rotation first, cleanup second.

### A4. Arrange durable, off-machine backups

- Current state: **DURABLE_BACKUP_NOT_ESTABLISHED**. Bundles created in this workspace live on sandbox-local
  storage and are destroyed by environment resets: ${bundleFacts.onDisk} exist now, ${bundleFacts.destroyed} earlier
  ones were recorded and then lost. That is the clearest possible demonstration that a local copy is not a backup.
- **Action:** copy a verified bundle out of this machine to storage the owner controls and can restore from.
  Inventory, hashes and the restore procedure: ${code("RECOVERY_MANIFEST.md")} and ${code("RECOVERY_PROCEDURE.md")}.
- **Do not** treat this handover, or any file in this repository, as a backup.

---

## B. External evidence (nobody can supply this by coding)

| # | Requirement | Current state | Who can supply it |
|---|---|---|---|
| B1 | Official documentation for all ${rates.inventory.length} transaction-cost heads | ${rates.byStatus.UNVERIFIED} UNVERIFIED, ${rates.byStatus.UNSUPPORTED_NO_EVIDENCE} segments unevidenced, ${rates.byStatus.UNVERIFIED_ASSUMED_SAME_AS_ANGEL} assumed | CBDT, NSE/MCX, SEBI, CBIC, and the three brokers' tariff pages — see ${code("MISSING_EVIDENCE_REGISTER.md")} |
| B2 | Licensed, authentic **equity-instrument** intraday data | Index data only; ${instr.summary.equityValidationBlocked} of ${instr.summary.strategies} strategies blocked for equity validation | A licensed data vendor or the exchange |
| B3 | Authoritative resolution of the 2022-10-24 calendar discrepancy | Open: the third-party calendar contains the date, the data does not | NSE circular / holiday list for 2022 |
| B4 | Verification of the 2025 calendar | UNCHECKED — never assessed | NSE holiday list and special-session circulars for 2025 |

Official sources were unreachable from this environment (TLS failures); **0 documents were retrieved and
0 rates were verified**. That is a fact about the environment, not permission to approximate.

---

## C. Code tasks

### C1. Open code defects

${openDefects.length === 0
  ? "None. Every defect in the register is FIXED or is an accepted-and-documented deployment constraint. No verified code defect remains open."
  : openDefects.map((d) => `- **${d.id}** (${d.severity}) — ${d.title}\n  - Files: ${d.file}\n  - Status: ${d.status}`).join("\n")}

### C2. Accepted constraint, not a defect

- **${acceptedDefects.map((d) => d.id).join(", ")} — process-local rate limiting.** Multi-instance deployment stays blocked. Lifting it requires a
  shared store with independently verified design, failure modes and tests; none has been added, because an
  unaudited dependency would be worse than the documented limit.

### C3. Tasks that are only unblocked *by* external evidence

These are deliberately **not** started, because starting them would mean inventing the inputs:

1. Populate the rate registry and re-run the cost model — only once B1 exists.
2. Re-run equity validation — only once B2 exists.
3. Resolve the calendar item and assess 2025 — only once B3 and B4 exist.

Closure criterion for each: the document is held, cited, and the affected test changes from a documented
blocker to a passing check **without** any parameter being tuned to reach it.

---

## Current verified state

| Item | Value |
|---|---|
| Branch | ${code("arena/f721e253-trade")} |
| Regression gates | ${regression.gates.length - failedGates.length}/${regression.gates.length} as expected${byDesign.length ? " (by-design non-zero: " + byDesign.map((g) => g.name + " exit " + g.exitCode).join(", ") + ")" : ""} |
| Adversarial probe | ${gateByName(/Adversarial API probe/).summary} |
| Mutation gate | ${mutation.mutants.filter((m) => m.detected).length}/${mutation.mutants.length} reintroduced vulnerabilities detected |
| Environment probe | ${gateByName(/Environment configuration probe/).summary} |
| Defects | ${defects.defects.filter((d) => String(d.status).toUpperCase().startsWith("FIXED")).length} fixed, ${acceptedDefects.length} accepted-by-design, ${openDefects.length} open, ${defects.defects.length} total |
| Research (strict OOS) | ${money(oosNet)} net (sum of 8 arms; pooled total ${money(oosNetPooled)}), ${statSummary.oosTrades} trades, ${cost.verdict.armsPositiveAtBaseline} of 8 arms positive, ${statSummary.oosOvernightCarriedTrades} overnight-carried trades |
| Strategy scope | ${instr.summary.equityValidationBlocked} of ${instr.summary.strategies} strategies blocked for equity validation; 10 strategies remain disabled |
| Backup durability | DURABLE_BACKUP_NOT_ESTABLISHED |

Negative results are reported unchanged. No profitability, production-readiness or live-trading claim is made
anywhere in this handover.
`;

fs.writeFileSync(path.join(ROOT, "MISSING_EVIDENCE_REGISTER.md"), missingDoc);
fs.writeFileSync(path.join(ROOT, "FINAL_HANDOVER.md"), handover);
console.log(`missing-evidence rows: ${missingRows.length} cost heads, ${calRows.length} calendar rows`);
console.log(`handover: ${openDefects.length} open defects, ${regression.gates.length} gates`);
