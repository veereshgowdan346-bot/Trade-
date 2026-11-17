#!/usr/bin/env node
/**
 * OmniTradePro Phase 2 — TS side of the cross-language cost parity harness (TAX-006).
 *
 * Reads data/fixtures/cost_parity_scenarios.json, computes every scenario with the
 * compiled TypeScript cost engine (dist_test_cjs/tax.js), and prints a JSON result
 * document to stdout. tests/test_cost_parity.py runs the SAME scenarios through
 * risk/statutory_cost.py and asserts field-by-field equality to the paise.
 *
 * Usage: node scripts/cost_parity_ts.js   (after: npm run test:prep)
 */
const fs = require("fs");
const path = require("path");

const tax = require("../dist_test_cjs/tax.js");
const risk = require("../dist_test_cjs/risk.js");

const fixturePath = path.join(__dirname, "..", "data", "fixtures", "cost_parity_scenarios.json");
const fixture = JSON.parse(fs.readFileSync(fixturePath, "utf8"));

const out = {
  engine: "typescript",
  fixturePath: "data/fixtures/cost_parity_scenarios.json",
  results: {},
  hurdles: {
    shoonya: risk.hurdleFloorFor("shoonya"),
    angel: risk.hurdleFloorFor("angel"),
    groww: risk.hurdleFloorFor("groww"),
  },
};

for (const s of fixture.scenarios) {
  const a = s.args;
  const rtArgs = {
    exchange: a.exchange,
    kind: a.kind,
    broker: a.broker,
    qty: a.qty,
    entry: a.entry,
    exit: a.exit,
    side: a.side,
    productType: a.productType,
    entrySlippageBps: a.entrySlippageBps,
    exitSlippageBps: a.exitSlippageBps,
  };
  try {
    const charges = tax.roundTripCharges(rtArgs);
    const net = tax.calculateNetPnL({
      grossPnL: s.grossPnL ?? 0,
      broker: a.broker,
      qty: a.qty,
      entry: a.entry,
      exit: a.exit,
      exchange: a.exchange,
      kind: a.kind,
      side: a.side,
      productType: a.productType,
      entrySlippageBps: a.entrySlippageBps,
      exitSlippageBps: a.exitSlippageBps,
    });
    out.results[s.id] = {
      ok: true,
      charges,
      netPnL: net.netPnL,
      grossPnL: net.grossPnL,
      totalCharges: net.totalCharges,
    };
  } catch (e) {
    out.results[s.id] = { ok: false, errorName: e.name || "Error", errorMessage: String(e.message) };
  }
}

process.stdout.write(JSON.stringify(out, null, 2));
