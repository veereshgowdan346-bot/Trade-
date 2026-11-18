#!/usr/bin/env node
/**
 * Environment-configuration probe (SEC-012, SEC-011, SEC-003).
 *
 * Verifies how the six environment variables the application actually reads behave when they are
 * MISSING, MALFORMED, CONTRADICTORY or UNSAFE. The rule under test: an operator's broken configuration
 * must fail closed and say so, never silently downgrade to "no authentication".
 *
 * No secret values are printed: token comparisons report the resulting decision code only.
 */
const crypto = require("node:crypto");
const MODULE_ARG = process.argv.find((a) => a.startsWith("--module="));
const GUARD_PATH = MODULE_ARG ? MODULE_ARG.slice("--module=".length) : require("node:path").join(__dirname, "..", "dist_test_cjs", "apiGuard.js");
const guard = require(require("node:path").resolve(GUARD_PATH));
const vault = require("../dist_test_cjs/vault_key.js");

const req = (headers = {}) => ({ headers: { get: (n) => headers[n.toLowerCase()] ?? null } });

const ENV_KEYS = ["OMNI_API_TOKEN", "OMNI_LOCAL_TRUST", "OMNI_TRUST_PROXY", "VAULT_KEY", "TRADING_MODE", "DATABASE_URL"];
const saved = {};
for (const k of ENV_KEYS) saved[k] = process.env[k];
const restore = () => {
  for (const k of ENV_KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
};
const clearAll = () => { for (const k of ENV_KEYS) delete process.env[k]; };

let passed = 0;
const failures = [];
function check(name, fn) {
  try {
    const detail = fn();
    passed += 1;
    console.log(`  PASS  ${name}${detail ? " — " + detail : ""}`);
  } catch (err) {
    failures.push({ name, error: err.message });
    console.log(`  FAIL  ${name} — ${err.message}`);
  }
}
const assert = (cond, msg) => { if (!cond) throw new Error(msg); };
const codeOf = (r) => (r === null ? "ALLOWED" : r.body.code);

console.log("\n--> 1. OMNI_LOCAL_TRUST: accepted values are an explicit assertion only");
for (const v of ["true", "TRUE", " true ", "1", "yes", "Yes"]) {
  check(`OMNI_LOCAL_TRUST=${JSON.stringify(v)} asserts local trust`, () => {
    clearAll(); process.env.OMNI_LOCAL_TRUST = v;
    assert(codeOf(guard.authorizeMutation(req())) === "ALLOWED", "did not assert");
    return "asserted";
  });
}
for (const v of ["false", "0", "no", "on", "y", "tru", "true,false", "yes please", ""]) {
  check(`OMNI_LOCAL_TRUST=${JSON.stringify(v)} does NOT assert (fails closed)`, () => {
    clearAll(); process.env.OMNI_LOCAL_TRUST = v;
    const c = codeOf(guard.authorizeMutation(req()));
    assert(c === "AUTH_NOT_CONFIGURED", `expected AUTH_NOT_CONFIGURED, got ${c}`);
    return c;
  });
}
check("OMNI_LOCAL_TRUST unset fails closed", () => {
  clearAll();
  const c = codeOf(guard.authorizeMutation(req({ host: "localhost:3000" })));
  assert(c === "AUTH_NOT_CONFIGURED", `expected AUTH_NOT_CONFIGURED, got ${c}`);
  return c;
});

console.log("\n--> 2. OMNI_API_TOKEN: missing / malformed / contradictory");
check("unset token = absent (documented default)", () => {
  clearAll();
  assert(guard.tokenState() === "absent", "unset token not reported absent");
  return "absent";
});
check("empty token = absent, so a fresh .env still works", () => {
  clearAll(); process.env.OMNI_API_TOKEN = "";
  assert(guard.tokenState() === "absent", "empty token not treated as absent");
  return "absent";
});
for (const v of ["abc123", "short", "1234567"]) {
  check(`token shorter than 8 chars fails closed with AUTH_MISCONFIGURED (${v.length} chars)`, () => {
    clearAll(); process.env.OMNI_LOCAL_TRUST = "true"; process.env.OMNI_API_TOKEN = v;
    const c = codeOf(guard.authorizeMutation(req()));
    assert(c === "AUTH_MISCONFIGURED", `expected AUTH_MISCONFIGURED, got ${c}`);
    return c + " (not silently ignored)";
  });
}
check("usable token takes precedence over OMNI_LOCAL_TRUST (no headerless bypass)", () => {
  clearAll();
  const tok = crypto.randomBytes(16).toString("hex");
  process.env.OMNI_API_TOKEN = tok; process.env.OMNI_LOCAL_TRUST = "true";
  const noAuth = codeOf(guard.authorizeMutation(req()));
  assert(noAuth === "TOKEN_REQUIRED", `expected TOKEN_REQUIRED, got ${noAuth}`);
  const wrong = codeOf(guard.authorizeMutation(req({ authorization: "Bearer " + crypto.randomBytes(16).toString("hex") })));
  assert(wrong === "TOKEN_INVALID", `expected TOKEN_INVALID, got ${wrong}`);
  const right = codeOf(guard.authorizeMutation(req({ authorization: "Bearer " + tok })));
  assert(right === "ALLOWED", `correct token rejected: ${right}`);
  return "TOKEN_REQUIRED / TOKEN_INVALID / ALLOWED";
});
check("token comparison is constant-time (uses crypto.timingSafeEqual)", () => {
  if (MODULE_ARG) return "skipped for mutant build (source check is for the production build)";
  const src = require("node:fs").readFileSync(require("node:path").join(__dirname, "..", "src", "lib", "apiGuard.ts"), "utf8");
  assert(/timingSafeEqual/.test(src), "constant-time compare missing from source");
  assert(!/got\s*===\s*String\(token\)/.test(src), "a plain string comparison of the token is present");
  return "crypto.timingSafeEqual only";
});

console.log("\n--> 3. OMNI_TRUST_PROXY: malformed values never widen trust");
for (const v of ["true", "1", "yes"]) {
  check(`OMNI_TRUST_PROXY=${JSON.stringify(v)} honours only the nearest hop`, () => {
    clearAll(); process.env.OMNI_LOCAL_TRUST = "true"; process.env.OMNI_TRUST_PROXY = v;
    const prepended = codeOf(guard.authorizeMutation(req({ "x-forwarded-for": "127.0.0.1, 203.0.113.9" })));
    assert(prepended === "AUTH_REQUIRED_FOR_REMOTE", `client-prepended loopback accepted: ${prepended}`);
    const privateHop = codeOf(guard.authorizeMutation(req({ "x-forwarded-for": "203.0.113.9, 10.1.2.3" })));
    assert(privateHop === "ALLOWED", `private nearest hop rejected: ${privateHop}`);
    return "prepended denied, nearest private allowed";
  });
}
for (const v of ["false", "0", "on", "yess", ""]) {
  check(`OMNI_TRUST_PROXY=${JSON.stringify(v)} does not enable proxy trust`, () => {
    clearAll(); process.env.OMNI_LOCAL_TRUST = "true"; process.env.OMNI_TRUST_PROXY = v;
    const c = codeOf(guard.authorizeMutation(req({ "x-forwarded-for": "10.1.2.3" })));
    assert(c === "AUTH_REQUIRED_FOR_REMOTE", `proxy trust enabled by ${JSON.stringify(v)}: ${c}`);
    return c;
  });
}
check("contradictory: local trust asserted + trust proxy + public nearest hop is still denied", () => {
  clearAll(); process.env.OMNI_LOCAL_TRUST = "true"; process.env.OMNI_TRUST_PROXY = "true";
  const c = codeOf(guard.authorizeMutation(req({ "x-forwarded-for": "10.0.0.1, 198.51.100.7" })));
  assert(c === "AUTH_REQUIRED_FOR_REMOTE", `public hop accepted: ${c}`);
  return c;
});
check("contradictory: forged proxy headers with trust disabled are never local", () => {
  clearAll(); process.env.OMNI_LOCAL_TRUST = "true";
  for (const h of [{ "x-forwarded-for": "127.0.0.1" }, { "x-real-ip": "127.0.0.1" }]) {
    const c = codeOf(guard.authorizeMutation(req(h)));
    assert(c === "AUTH_REQUIRED_FOR_REMOTE", `forged header accepted: ${c}`);
  }
  return "both denied";
});

console.log("\n--> 4. Webhook boundary fails closed");
check("no secret and no assertion -> WEBHOOK_NOT_CONFIGURED", () => {
  clearAll();
  const c = codeOf(guard.authorizeWebhook(req(), undefined, undefined));
  assert(c === "WEBHOOK_NOT_CONFIGURED", `got ${c}`);
  return c;
});
check("configured-but-short secret -> WEBHOOK_MISCONFIGURED (not a silent downgrade)", () => {
  clearAll(); process.env.OMNI_LOCAL_TRUST = "true";
  const c = codeOf(guard.authorizeWebhook(req(), undefined, "short"));
  assert(c === "WEBHOOK_MISCONFIGURED", `got ${c}`);
  return c;
});
check("usable secret: missing / wrong / correct", () => {
  clearAll();
  const secret = crypto.randomBytes(16).toString("hex");
  assert(codeOf(guard.authorizeWebhook(req(), undefined, secret)) === "WEBHOOK_SECRET_REQUIRED", "missing secret accepted");
  assert(codeOf(guard.authorizeWebhook(req(), "wrong-value", secret)) === "WEBHOOK_SECRET_INVALID", "wrong secret accepted");
  assert(codeOf(guard.authorizeWebhook(req(), secret, secret)) === "ALLOWED", "correct secret rejected");
  return "REQUIRED / INVALID / ALLOWED";
});
check("unusable env token blocks webhooks too", () => {
  clearAll(); process.env.OMNI_LOCAL_TRUST = "true"; process.env.OMNI_API_TOKEN = "tiny";
  const c = codeOf(guard.authorizeWebhook(req(), undefined, undefined));
  assert(c === "AUTH_MISCONFIGURED", `got ${c}`);
  return c;
});

console.log("\n--> 5. VAULT_KEY: no fallback, ever");
check("unset VAULT_KEY throws VaultKeyMissingError", () => {
  clearAll();
  let threw = null;
  try { vault.masterKey(); } catch (e) { threw = e; }
  assert(threw && threw.name === "VaultKeyMissingError", "did not throw VaultKeyMissingError");
  return threw.name;
});
check("short / blank VAULT_KEY throws (no published constant fallback)", () => {
  for (const v of ["short", "1234567", ""]) {
    clearAll(); process.env.VAULT_KEY = v;
    let threw = false;
    try { vault.masterKey(); } catch (e) { threw = e.name === "VaultKeyMissingError"; }
    assert(threw, `VAULT_KEY=${JSON.stringify(v)} produced a key`);
  }
  return "3 malformed values rejected";
});
check("valid VAULT_KEY derives 32 bytes; different passphrases give different keys", () => {
  clearAll();
  const a = crypto.randomBytes(12).toString("hex");
  const b = crypto.randomBytes(12).toString("hex");
  process.env.VAULT_KEY = a;
  const k1 = vault.masterKey();
  process.env.VAULT_KEY = b;
  const k2 = vault.masterKey();
  assert(k1.length === 32 && k2.length === 32, "derived key is not 32 bytes");
  assert(!k1.equals(k2), "two different passphrases derived the same key");
  return "32 bytes, distinct";
});

console.log("\n--> 6. TRADING_MODE: LIVE cannot be enabled by configuration");
check("source refuses LIVE regardless of TRADING_MODE", () => {
  const src = require("node:fs").readFileSync(require("node:path").join(__dirname, "..", "src", "lib", "engine.ts"), "utf8");
  assert(/tradingMode === "LIVE"|=== "LIVE"/.test(src), "no LIVE guard found in engine");
  const block = src.slice(Math.max(0, src.indexOf('=== "LIVE"') - 300), src.indexOf('=== "LIVE"') + 500);
  assert(/throw|reject|block|refus|not allowed|PAPER/i.test(block), "LIVE branch does not appear to refuse execution");
  return "LIVE guard present in engine";
});

console.log("\n--> 7. Documentation must match the implementation");
check(".env.example documents all six variables, with placeholders only", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const text = fs.readFileSync(path.join(__dirname, "..", ".env.example"), "utf8");
  for (const k of ENV_KEYS) assert(new RegExp("^" + k + "=", "m").test(text), `${k} not documented`);
  assert(!/VAULT_KEY=.{8,}/.test(text), "VAULT_KEY appears to carry a real value");
  assert(!/OMNI_API_TOKEN=.{8,}/.test(text), "OMNI_API_TOKEN appears to carry a real value");
  return "6/6 documented, no values";
});
check("OMNI_LOCAL_TRUST is described as an assertion, not as proof of locality", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const text = fs.readFileSync(path.join(__dirname, "..", ".env.example"), "utf8");
  assert(/assert/i.test(text) && /cannot see the peer socket|not evidence of locality/i.test(text),
    "the safety implication of OMNI_LOCAL_TRUST is not stated");
  return "assertion documented";
});

restore();
console.log(`\nenv-config probe: ${passed} passed, ${failures.length} failed`);

if (!MODULE_ARG) {
  const fs = require("node:fs");
  const path = require("node:path");
  fs.mkdirSync(path.join(__dirname, "..", "data", "security"), { recursive: true });
  fs.writeFileSync(path.join(__dirname, "..", "data", "security", "env_config_audit.json"), JSON.stringify({
    generatedAt: new Date().toISOString(),
    command: "node scripts/env_config_probe.js",
    note: "Missing, malformed, contradictory and unsafe values for the six environment variables the app reads.",
    passed,
    failed: failures.length,
    variables: ENV_KEYS,
    failures,
  }, null, 2) + "\n");
}
if (failures.length) {
  for (const f of failures) console.log(`  - ${f.name}: ${f.error}`);
  process.exit(1);
}
