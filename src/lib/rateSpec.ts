/**
 * OmniTradePro Apex V2.0 — Single Authoritative Rate Specification loader.
 *
 * Phase 2 (TAX-006 / ARCH-001): `config/statutory_rates.json` is the ONLY place
 * statutory and brokerage rates are defined. Both the TypeScript engine
 * (`src/lib/tax.ts`) and the Python engine (`risk/statutory_cost.py`) load this
 * exact file; cross-language parity tests prove they agree.
 *
 * Verification policy: rates without locally-supplied dated official documents
 * carry status UNVERIFIED (or UNSUPPORTED_NO_EVIDENCE for excluded segments).
 * Changing any rate value without attaching dated evidence violates audit policy.
 */
import fs from "node:fs";
import path from "node:path";

export type RateEntry = {
  rate: number;
  side: "sell" | "buy" | "both";
  label: string;
  status: string;
  source?: string | null;
  effectiveDate?: string | null;
  note?: string;
};

export type SegmentSpec = {
  supported: boolean;
  status: string;
  productTypes: string[];
  instrumentKinds: string[];
  stt?: RateEntry;
  exchangeTxn?: RateEntry;
  stampDuty?: RateEntry;
  idxNote?: string;
  reason?: string;
  brokerageNote?: string;
  requiredHeads?: string[];
};

export type BrokerSpec = {
  label: string;
  brokerageModel: string;
  intradayPerLeg?: number;
  deliveryPerLeg?: number;
  perLegCap?: number;
  perLegRate?: number;
  roundTripBrokerageFloor: number;
  minimumRoundTripDeduction: number;
  status: string;
  source?: string | null;
  effectiveDate?: string | null;
  notes?: string;
};

export type HurdlePolicy = {
  note: string;
  shoonya: number;
  angel: number;
  groww: number;
  microCapitalPolicy: {
    capitalThreshold: number;
    legacyWorstCaseHurdle: number;
    phase2Hurdle: number;
    status: string;
    note: string;
  };
};

export type RateSpec = {
  specVersion: string;
  title: string;
  verificationPolicy: { rule: string; localEvidenceFound: string[]; localEvidenceAssessment: string };
  gst: { rate: number; base: string; status: string };
  sebiTurnoverFee: { ratePerRupee: number; quotedAs: string; side: string; status: string };
  slippageDefaults: { entryBps: number; exitBpsPolicy: string; status: string; note?: string };
  segments: Record<string, SegmentSpec>;
  brokers: Record<string, BrokerSpec>;
  hurdles: HurdlePolicy;
  productTypeFailClosed: Record<string, string>;
};

const SPEC_RELATIVE = path.join("config", "statutory_rates.json");

function resolveSpecPath(): string {
  const candidates = [
    path.join(process.cwd(), SPEC_RELATIVE),
    path.join(__dirname, "..", "..", "..", SPEC_RELATIVE),
    path.join(__dirname, "..", "..", SPEC_RELATIVE),
    path.join(__dirname, "..", SPEC_RELATIVE),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  throw new Error(`statutory rate spec not found (looked in: ${candidates.join(", ")})`);
}

let cache: RateSpec | null = null;

function assertFinite(name: string, v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error(`rate spec: ${name} is not a finite number`);
  return n;
}

export function loadRateSpec(): RateSpec {
  if (cache) return cache;
  const raw = JSON.parse(fs.readFileSync(resolveSpecPath(), "utf8")) as RateSpec;
  // Fail closed on structural corruption.
  if (!raw || !raw.segments || !raw.brokers || !raw.gst || !raw.sebiTurnoverFee) {
    throw new Error("rate spec: missing required sections (segments/brokers/gst/sebiTurnoverFee)");
  }
  assertFinite("gst.rate", raw.gst.rate);
  assertFinite("sebiTurnoverFee.ratePerRupee", raw.sebiTurnoverFee.ratePerRupee);
  assertFinite("slippageDefaults.entryBps", raw.slippageDefaults.entryBps);
  for (const [key, seg] of Object.entries(raw.segments)) {
    if (seg.supported) {
      assertFinite(`segments.${key}.stt.rate`, seg.stt?.rate);
      assertFinite(`segments.${key}.exchangeTxn.rate`, seg.exchangeTxn?.rate);
      assertFinite(`segments.${key}.stampDuty.rate`, seg.stampDuty?.rate);
    }
  }
  for (const [key, b] of Object.entries(raw.brokers)) {
    assertFinite(`brokers.${key}.roundTripBrokerageFloor`, b.roundTripBrokerageFloor);
    assertFinite(`brokers.${key}.minimumRoundTripDeduction`, b.minimumRoundTripDeduction);
  }
  cache = raw;
  return raw;
}

/** Test/consistency helper: drop the cached spec (e.g. after editing the JSON). */
export function resetRateSpecCache(): void {
  cache = null;
}
