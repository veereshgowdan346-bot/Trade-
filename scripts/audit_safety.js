/**
 * Paper-only safety audit (mission §11). Behaviour, not source-reading.
 *
 * Every check below CALLS the production code and asserts the observed outcome. Where a guarantee
 * cannot be exercised without a live broker or database, that is stated as a limitation instead of
 * being claimed as verified.
 *
 * Usage: node scripts/audit_safety.js
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { normaliseRisk, LIVE_BROKER_EXECUTION_DISABLED, DEFAULT_RISK } = require("../dist_test_cjs/risk.js");
const { authorizeMutation, checkRateLimit } = require("../dist_test_cjs/apiGuard.js");
const { roundTripCharges, UnsupportedSegmentError } = require("../dist_test_cjs/tax.js");
const { EXPERIMENTAL_REGISTRY } = require("../dist_test_cjs/experimental_strategies.js");

const ROOT = path.join(__dirname, "..");
const OUT = path.join(ROOT, "data", "security", "safety_audit.json");

const checks = [];
const check = (id, name, fn) => {
  try {
    const detail = fn();
    checks.push({ id, name, status: detail === false ? "FAIL" : "PASS", detail: typeof detail === "string" ? detail : "" });
  } catch (err) {
    checks.push({ id, name, status: "FAIL", detail: `${err.name}: ${err.message}` });
  }
};
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

/* ------------------------------ 1. PAPER is forced ------------------------------ */
check("SAFE-01", "tradingMode is forced to PAPER even when LIVE is requested", () => {
  const a = normaliseRisk({ tradingMode: "LIVE" });
  assert(a.tradingMode === "PAPER", `expected PAPER, got ${a.tradingMode}`);
  return `requested LIVE -> ${a.tradingMode}`;
});

check("SAFE-02", "environment variables cannot enable LIVE", () => {
  process.env.TRADING_MODE = "LIVE";
  const b = normaliseRisk({ tradingMode: process.env.TRADING_MODE });
  delete process.env.TRADING_MODE;
  assert(b.tradingMode === "PAPER", `expected PAPER, got ${b.tradingMode}`);
  return "TRADING_MODE=LIVE -> PAPER";
});

check("SAFE-03", "live broker execution interlock constant is true", () => {
  assert(LIVE_BROKER_EXECUTION_DISABLED === true, "interlock constant is not true");
  return "LIVE_BROKER_EXECUTION_DISABLED === true";
});

check("SAFE-04", "default risk config ships in PAPER mode", () => {
  assert(DEFAULT_RISK.tradingMode === "PAPER", `default mode is ${DEFAULT_RISK.tradingMode}`);
  return `DEFAULT_RISK.tradingMode = ${DEFAULT_RISK.tradingMode}`;
});

/* --------------------------- 2. strategies are disabled --------------------------- */
check("SAFE-05", "every experimental strategy is disabled", () => {
  const enabled = EXPERIMENTAL_REGISTRY.filter((s) => s.enabled !== false);
  assert(enabled.length === 0, `${enabled.length} strategies are enabled: ${enabled.map((s) => s.id).join(", ")}`);
  return `${EXPERIMENTAL_REGISTRY.length}/${EXPERIMENTAL_REGISTRY.length} disabled`;
});

/* ---------------------- 3. unsupported segments fail closed ---------------------- */
check("SAFE-06", "unsupported segment throws instead of inventing a rate", () => {
  let threw = false;
  try {
    roundTripCharges({ exchange: "NSE", kind: "CURRENCY", broker: "shoonya", qty: 1, entry: 100, exit: 101, side: "BUY", productType: "INTRADAY" });
  } catch (err) {
    threw = err instanceof UnsupportedSegmentError || /unsupported|no evidenced/i.test(err.message);
  }
  assert(threw, "unsupported segment did not fail closed");
  return "CURRENCY segment rejected";
});

check("SAFE-07", "unknown broker fails closed", () => {
  let threw = false;
  try {
    roundTripCharges({ exchange: "NSE", kind: "EQ", broker: "notabroker", qty: 1, entry: 100, exit: 101, side: "BUY", productType: "INTRADAY" });
  } catch {
    threw = true;
  }
  assert(threw, "unknown broker did not fail closed");
  return "unknown broker rejected";
});

/* ------------------------------- 4. auth / rate limit ------------------------------- */
const req = (headers = {}) => ({ headers: { get: (k) => headers[k.toLowerCase()] ?? null } });

check("SAFE-08", "mutating request from outside is rejected when no token is configured", () => {
  delete process.env.OMNI_API_TOKEN;
  const denial = authorizeMutation(req({ "x-forwarded-for": "203.0.113.9", host: "example.com", origin: "https://evil.example" }));
  assert(denial && denial.status === 401, "external mutation was allowed without a token");
  return `status ${denial.status}`;
});

check("SAFE-09", "mutating request is allowed from a direct connection only when local trust is asserted", () => {
  const prevLocal = process.env.OMNI_LOCAL_TRUST;
  try {
    delete process.env.OMNI_API_TOKEN;
    // SEC-011: the guard cannot see the peer socket, so absence of a forwarding header is not evidence
    // of locality. Without an explicit assertion the request must fail closed.
    delete process.env.OMNI_LOCAL_TRUST;
    const unasserted = authorizeMutation(req({ host: "localhost:3000" }));
    assert(unasserted && unasserted.body.code === "AUTH_NOT_CONFIGURED", "unasserted local trust was accepted");
    process.env.OMNI_LOCAL_TRUST = "true";
    const denial = authorizeMutation(req({ host: "localhost:3000" }));
    assert(denial === null, `asserted local connection was rejected: ${JSON.stringify(denial)}`);
  } finally {
    if (prevLocal === undefined) delete process.env.OMNI_LOCAL_TRUST; else process.env.OMNI_LOCAL_TRUST = prevLocal;
    delete process.env.OMNI_API_TOKEN;
  }
  return "fail-closed without assertion; allowed with OMNI_LOCAL_TRUST=true";
});

check("SAFE-17", "an empty forwarding header cannot pass as a direct local connection", () => {
  const prevToken = process.env.OMNI_API_TOKEN;
  const prevTrust = process.env.OMNI_TRUST_PROXY;
  try {
    delete process.env.OMNI_API_TOKEN;
    delete process.env.OMNI_TRUST_PROXY;
    process.env.OMNI_LOCAL_TRUST = "true";
    for (const v of ["", " ", ",,,"]) {
      const res = authorizeMutation(req({ "x-forwarded-for": v }));
      assert(res && res.status === 401, `empty forwarding header treated as local: ${JSON.stringify(v)}`);
    }
    const direct = authorizeMutation(req({}));
    assert(direct === null, "a genuinely direct connection must still be allowed once local trust is asserted");
  } finally {
    if (prevToken === undefined) delete process.env.OMNI_API_TOKEN; else process.env.OMNI_API_TOKEN = prevToken;
    if (prevTrust === undefined) delete process.env.OMNI_TRUST_PROXY; else process.env.OMNI_TRUST_PROXY = prevTrust;
  }
  return "empty/whitespace forwarding headers are denied; direct connections still allowed";
});

check("SAFE-16", "remote mutations fail closed without a token (same-origin is not authentication)", () => {
  const prevToken = process.env.OMNI_API_TOKEN;
  const prevTrust = process.env.OMNI_TRUST_PROXY;
  try {
    delete process.env.OMNI_API_TOKEN;
    delete process.env.OMNI_TRUST_PROXY;
    const remote = req({ "x-forwarded-for": "203.0.113.9", host: "app.example.com", origin: "https://app.example.com" });
    const res = authorizeMutation(remote);
    assert(res && res.status === 401, "a forgeable same-origin header authorised a remote mutation");
    assert(res.body.code === "AUTH_REQUIRED_FOR_REMOTE", `unexpected code: ${res.body.code}`);
    // Generated at run time: a literal token here would be the exact defect class this audit polices.
    const probeToken = require("node:crypto").randomBytes(16).toString("hex");
    process.env.OMNI_API_TOKEN = probeToken;
    const withToken = req({
      "x-forwarded-for": "203.0.113.9", host: "app.example.com", origin: "https://app.example.com",
      authorization: `Bearer ${probeToken}`,
    });
    assert(authorizeMutation(withToken) === null, "a valid token must still admit a remote mutation");
  } finally {
    if (prevToken === undefined) delete process.env.OMNI_API_TOKEN; else process.env.OMNI_API_TOKEN = prevToken;
    if (prevTrust === undefined) delete process.env.OMNI_TRUST_PROXY; else process.env.OMNI_TRUST_PROXY = prevTrust;
  }
  return "remote mutations require a token; same-origin alone is rejected";
});

check("SAFE-15", "client-supplied X-Forwarded-For is not treated as proof of locality", () => {
  const prev = process.env.OMNI_TRUST_PROXY;
  delete process.env.OMNI_API_TOKEN;
  try {
    delete process.env.OMNI_TRUST_PROXY;
    const spoof = authorizeMutation(req({ "x-forwarded-for": "127.0.0.1" }));
    assert(spoof && spoof.status === 401, "spoofed X-Forwarded-For granted local trust");

    process.env.OMNI_TRUST_PROXY = "true";
    process.env.OMNI_LOCAL_TRUST = "true";
    const prepended = authorizeMutation(req({ "x-forwarded-for": "127.0.0.1, 203.0.113.9" }));
    assert(prepended && prepended.status === 401, "client-prepended loopback entry was trusted behind a proxy");
    const nearest = authorizeMutation(req({ "x-forwarded-for": "203.0.113.9, 127.0.0.1" }));
    assert(nearest === null, "trusted proxy with a private nearest hop was rejected");
  } finally {
    if (prev === undefined) delete process.env.OMNI_TRUST_PROXY; else process.env.OMNI_TRUST_PROXY = prev;
    delete process.env.OMNI_API_TOKEN;
  }
  return "spoofed header rejected; nearest-hop-only under OMNI_TRUST_PROXY";
});

check("SAFE-10", "configured token is required and compared exactly", () => {
  // Generate the token at run time: embedding a literal credential in a safety test would reproduce
  // the exact defect class this audit polices (SEC-001), and would trip the secret scanner.
  const crypto = require("node:crypto");
  const token = crypto.randomBytes(16).toString("hex");
  process.env.OMNI_API_TOKEN = token;
  const missing = authorizeMutation(req({ "x-forwarded-for": "203.0.113.9" }));
  const wrong = authorizeMutation(req({ authorization: `Bearer ${crypto.randomBytes(16).toString("hex")}`, "x-forwarded-for": "203.0.113.9" }));
  const right = authorizeMutation(req({ authorization: `Bearer ${token}`, "x-forwarded-for": "203.0.113.9" }));
  delete process.env.OMNI_API_TOKEN;
  assert(missing && missing.status === 401, "missing token accepted");
  assert(wrong && wrong.status === 401, "wrong token accepted");
  assert(right === null, "correct token rejected");
  return "missing/wrong rejected, correct accepted (runtime-generated token)";
});

check("SAFE-11", "rate limiter returns 429 once the budget is exhausted", () => {
  const r = req({ "x-forwarded-for": "198.51.100.77" });
  const t0 = 9_000_000;
  let limited = null;
  for (let i = 0; i < 40; i++) {
    const d = checkRateLimit(r, "write", t0);
    if (d) { limited = { at: i, status: d.status }; break; }
  }
  assert(limited && limited.status === 429, "rate limit never triggered for 40 writes");
  return `429 after ${limited.at} writes (limit 30/min)`;
});

/* ------------------------------- 5. secrets hygiene ------------------------------- */
check("SAFE-12", "no known leaked identifier remains in the tracked tree", () => {
  const idPath = path.join(ROOT, "data", "security", "leaked_identifiers.json");
  const digests = JSON.parse(fs.readFileSync(idPath, "utf8")).identifiers.map((i) => i.sha256);
  const crypto = require("node:crypto");
  const { execFileSync } = require("node:child_process");
  const files = execFileSync("git", ["ls-files"], { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);
  const hits = [];
  for (const rel of files) {
    let text;
    try {
      text = fs.readFileSync(path.join(ROOT, rel), "utf8");
    } catch {
      continue;
    }
    for (const tok of text.match(/[A-Za-z0-9]{6,64}/g) ?? []) {
      if (digests.includes(crypto.createHash("sha256").update(tok.toUpperCase()).digest("hex"))) hits.push(rel);
    }
  }
  assert(hits.length === 0, `identifier still present in: ${[...new Set(hits)].join(", ")}`);
  return `${files.length} files, ${digests.length} digests, 0 matches`;
});

check("SAFE-13", "vault uses a per-install random key, not a published constant", () => {
  // Behavioural: build a vault in a throwaway HOME and inspect the key it actually creates.
  // The old hardcoded constant is deliberately NOT named here — embedding the secret to prove the
  // secret is gone would recreate the very defect SEC-001 fixed.
  const { execFileSync } = require("node:child_process");
  const os = require("node:os");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "vault-audit-"));
  const script = [
    "import sys, os",
    "sys.path.insert(0, 'config')",
    "import credential_manager as cm",
    "m = cm.CredentialManager()",
    "p = m.MASTER_KEY_FILE",
    "print(len(m._master_password), oct(p.stat().st_mode & 0o777), m._master_password == m._master_password.strip())",
  ].join("\n");
  try {
    const out = execFileSync("python3", ["-c", script], {
      cwd: ROOT,
      encoding: "utf8",
      env: { ...process.env, HOME: tmp, VAULT_KEY: "" },
    }).trim();
    const [len, perms, stable] = out.split(" ");
    assert(Number(len) === 64, `master key length ${len} is not 64 hex chars`);
    assert(perms === "0o600", `master key permissions are ${perms}, expected 0o600`);
    assert(stable === "True", "master key is not stable across reads");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  // Structural: no constant fallback next to the env lookup, and randomness present.
  const src = fs.readFileSync(path.join(ROOT, "config", "credential_manager.py"), "utf8");
  assert(!/VAULT_KEY"\s*\)\s*or\s+["']/.test(src), "constant fallback after VAULT_KEY lookup still present");
  assert(/token_hex|urandom/.test(src), "no random key generation found");
  return "64-hex per-install key, 0600, stable, no constant fallback";
});

check("SAFE-18", "no user-facing text claims a credential fallback key exists", () => {
  // SEC-013: the vault banner used to say credentials were "encrypted with a development fallback key".
  // Since SEC-003 there is no fallback key and the vault refuses to encrypt, so that text was false and
  // understated the risk (it implied encryption was happening when the vault was disabled).
  const fs = require("node:fs");
  const path = require("node:path");
  const root = path.join(__dirname, "..", "src");
  const offenders = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!/\.(ts|tsx)$/.test(entry.name)) continue;
      const text = fs.readFileSync(full, "utf8");
      if (/encrypted with a development fallback key/i.test(text)) offenders.push(path.relative(root, full));
    }
  };
  walk(root);
  assert(offenders.length === 0, `misleading fallback-key text remains in: ${offenders.join(", ")}`);
  return "no stale fallback-key claims";
});

check("SAFE-14", "credential vault fails closed without VAULT_KEY (no published fallback)", () => {
  const vaultKey = require("../dist_test_cjs/vault_key.js");
  const saved = process.env.VAULT_KEY;
  try {
    delete process.env.VAULT_KEY;
    let threw = null;
    try {
      vaultKey.masterKey();
    } catch (err) {
      threw = err;
    }
    assert(threw && threw.name === "VaultKeyMissingError", "masterKey() did not fail closed without VAULT_KEY");
    assert(vaultKey.vaultConfigured() === false, "vaultConfigured() should be false without a key");

    process.env.VAULT_KEY = "short";
    let threwShort = null;
    try {
      vaultKey.masterKey();
    } catch (err) {
      threwShort = err;
    }
    assert(threwShort && threwShort.name === "VaultKeyMissingError", "a too-short key was accepted");

    process.env.VAULT_KEY = "audit-only-test-key-0123456789";
    assert(vaultKey.vaultConfigured() === true, "vaultConfigured() should be true with a valid key");
    assert(vaultKey.masterKey().length === 32, "derived key is not 32 bytes");
    return "throws without key, rejects short keys, derives 32 bytes with a key";
  } finally {
    if (saved === undefined) delete process.env.VAULT_KEY;
    else process.env.VAULT_KEY = saved;
  }
});

/* ----------------------------------- output ----------------------------------- */
const failed = checks.filter((c) => c.status !== "PASS");
const report = {
  generatedAt: new Date().toISOString(),
  command: "node scripts/audit_safety.js",
  checks,
  passed: checks.length - failed.length,
  failed: failed.length,
  limitations: [
    "The engine's order path itself requires a database and live feed; its LIVE rejection is covered by the existing comprehensive suite and by the interlock constant checked here, not re-exercised end-to-end in this script.",
    "WebSocket stream authentication and vault TOTP are covered by tests/ and were not re-driven here.",
    "Credential material remains in git history: rotation is required and cannot be performed from this environment.",
  ],
  verdict: failed.length === 0 ? "PAPER_ONLY_SAFETY_PASS" : "SAFETY_FAILURE",
};
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(report, null, 2) + "\n");

console.log(`safety audit: ${report.passed} PASS / ${report.failed} FAIL`);
for (const c of checks) console.log(`  ${c.status} ${c.id} ${c.name}${c.detail ? ` — ${c.detail}` : ""}`);
console.log(`verdict: ${report.verdict}`);
process.exitCode = failed.length === 0 ? 0 : 1;
