#!/usr/bin/env node
/**
 * Adversarial probe for the API mutation authorization boundary.
 *
 * Why this exists: the SEC-010 incident showed that a test can pass while checking the wrong property
 * ("malformed input does not crash" instead of "malformed input is denied"). This probe therefore:
 *   1. drives the REAL production entry point (authorizeMutation / authorizeWebhook), not an internal
 *      helper, so a fix inside a helper cannot mask a broken boundary;
 *   2. states the threat and the expected property for every case;
 *   3. can be pointed at a deliberately vulnerable build
 *      (`node scripts/adversarial_api_probe.js --module=/tmp/vuln_a/apiGuard.js`) to prove the matrix
 *      actually detects each regression. A suite that cannot fail is not evidence.
 *
 * No credential is used. Any token used here is generated at run time.
 */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const ROOT = path.join(__dirname, "..");
const arg = process.argv.find((a) => a.startsWith("--module="));
const MODULE = arg ? arg.split("=")[1] : path.join(ROOT, "dist_test_cjs", "apiGuard.js");
const guard = require(MODULE);

const mk = (headers) => ({ headers: { get: (n) => headers[n.toLowerCase()] ?? null } });
const RUNTIME_TOKEN = crypto.randomBytes(16).toString("hex");
const WEBHOOK_SECRET = crypto.randomBytes(24).toString("hex");

const results = [];
function run(name, threat, property, fn) {
  let ok = false;
  let detail = "";
  try {
    const r = fn();
    ok = r.ok;
    detail = r.detail || "";
  } catch (err) {
    ok = false;
    detail = "threw: " + err.message;
  }
  results.push({ name, threat, property, ok, detail });
}

const denied = (res) => res !== null && res !== undefined && res.status === 401;
const mutation = (headers) => guard.authorizeMutation(mk(headers));

/* ------------------------------------------------------------------ */
/* Remote, unauthenticated mutation attempts: every case must be 401.  */
/* ------------------------------------------------------------------ */
const remoteDenyCases = [
  ["no forwarding header at all", {}, "a caller who omits proxy headers entirely must not be trusted when the request did not originate locally"],
  ["empty X-Forwarded-For", { "x-forwarded-for": "" }, "an empty header still proves a proxy is in the path (SEC-010)"],
  ["whitespace-only X-Forwarded-For", { "x-forwarded-for": "   " }, "whitespace must not parse to 'absent' (SEC-010)"],
  ["tab/newline-only X-Forwarded-For", { "x-forwarded-for": "\t\n " }, "control whitespace must not parse to 'absent' (SEC-010)"],
  ["comma-only chain", { "x-forwarded-for": ",,," }, "separators with no addresses must not parse to 'absent' (SEC-010)"],
  ["malformed token", { "x-forwarded-for": "not-an-ip" }, "unparseable values must fail closed"],
  ["out-of-range IPv4", { "x-forwarded-for": "999.999.999.999" }, "invalid addresses must fail closed"],
  ["null byte", { "x-forwarded-for": "127.0.0.1\u0000evil" }, "null bytes must not truncate into a trusted value"],
  ["loopback claim", { "x-forwarded-for": "127.0.0.1" }, "the first hop is client-controlled (SEC-007)"],
  ["prepended loopback before public", { "x-forwarded-for": "127.0.0.1, 203.0.113.9" }, "only the nearest hop may be trusted (SEC-007)"],
  ["multi-hop loopback chain", { "x-forwarded-for": "127.0.0.1, 127.0.0.1, 127.0.0.1" }, "repeated loopback claims are still client-supplied"],
  ["private range claim", { "x-forwarded-for": "10.0.0.5" }, "private ranges are only meaningful from a trusted proxy"],
  ["forged X-Real-IP", { "x-real-ip": "127.0.0.1" }, "x-real-ip is equally user-controlled"],
  ["conflicting XFF vs X-Real-IP", { "x-forwarded-for": "203.0.113.9", "x-real-ip": "127.0.0.1" }, "conflicting headers must not resolve to trust"],
  ["empty XFF with loopback X-Real-IP", { "x-forwarded-for": "", "x-real-ip": "127.0.0.1" }, "an empty XFF plus a private X-Real-IP must not combine into trust"],
  ["forged same-origin", { "x-forwarded-for": "203.0.113.9", host: "a.example", origin: "https://a.example" }, "Origin/Host are forgeable; same-origin is CSRF control, not auth (SEC-008)"],
  ["forged Referer", { "x-forwarded-for": "203.0.113.9", host: "a.example", referer: "https://a.example/x" }, "Referer is forgeable (SEC-008)"],
  ["forged X-Forwarded-Host", { "x-forwarded-for": "203.0.113.9", "x-forwarded-host": "a.example", origin: "https://a.example" }, "X-Forwarded-Host is forgeable (SEC-008)"],
  ["public IP with loopback Origin", { "x-forwarded-for": "203.0.113.9", host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000" }, "a loopback Origin does not make a remote request local"],
];

delete process.env.OMNI_API_TOKEN;
delete process.env.OMNI_TRUST_PROXY;
delete process.env.OMNI_LOCAL_TRUST;
for (const [name, headers, property] of remoteDenyCases) {
  run(name, "remote client attempts an unauthenticated mutation", property, () => {
    const res = mutation(headers);
    return { ok: denied(res), detail: denied(res) ? "401 " + res.body.code : "ALLOWED" };
  });
}

/* Token handling: absent, malformed, wrong, and non-Bearer forms must be rejected. */
process.env.OMNI_API_TOKEN = RUNTIME_TOKEN;
const tokenCases = [
  ["no Authorization header", {}, "TOKEN_REQUIRED"],
  ["empty Authorization", { authorization: "" }, null],
  ["malformed Authorization (no Bearer)", { authorization: RUNTIME_TOKEN }, null],
  ["Bearer with empty value", { authorization: "Bearer " }, null],
  ["wrong token", { authorization: "Bearer " + "x".repeat(32) }, null],
  ["token in a query-style header", { "x-api-token": RUNTIME_TOKEN }, null],
  ["token with different case prefix", { authorization: "bearer " + RUNTIME_TOKEN }, null],
];
for (const [name, headers, expectedCode] of tokenCases) {
  run("bearer token case — " + name, "caller cannot present a valid bearer token", "the request must be rejected", () => {
    const res = mutation({ "x-forwarded-for": "203.0.113.9", ...headers });
    const ok = denied(res) && (!expectedCode || res.body.code === expectedCode);
    return { ok, detail: denied(res) ? "401 " + res.body.code : "ALLOWED" };
  });
}
run("token: correct bearer accepted", "legitimate operator", "a valid token must be accepted (the control must not be over-tightened)", () => {
  const res = mutation({ "x-forwarded-for": "203.0.113.9", authorization: "Bearer " + RUNTIME_TOKEN });
  return { ok: res === null, detail: res === null ? "allowed" : "rejected " + res.body.code };
});
delete process.env.OMNI_API_TOKEN;

/* Trusted-proxy mode: nearest hop decides; unusable nearest hop fails closed.
   Local trust must be asserted, since the guard cannot read the peer socket (SEC-011). */
process.env.OMNI_LOCAL_TRUST = "true";
process.env.OMNI_TRUST_PROXY = "true";
const proxyCases = [
  ["nearest hop public", { "x-forwarded-for": "127.0.0.1, 203.0.113.9" }, false],
  ["nearest hop private", { "x-forwarded-for": "203.0.113.9, 10.1.2.3" }, true],
  ["nearest hop loopback", { "x-forwarded-for": "203.0.113.9, 127.0.0.1" }, true],
  ["nearest hop empty", { "x-forwarded-for": "203.0.113.9, " }, false],
  ["only an empty header", { "x-forwarded-for": "" }, false],
  ["malformed nearest hop", { "x-forwarded-for": "203.0.113.9, not-an-ip" }, false],
];
for (const [name, headers, expectAllow] of proxyCases) {
  run("trusted proxy: " + name, "misconfigured or hostile chain behind a declared proxy", "only a private nearest hop may be treated as local", () => {
    const res = mutation(headers);
    const ok = expectAllow ? res === null : denied(res);
    return { ok, detail: res === null ? "allowed" : "401 " + res.body.code };
  });
}
delete process.env.OMNI_TRUST_PROXY;

/* SEC-008 under an ASSERTED local deployment: the desktop operator asserts local trust, but the port is
   still reachable from the network. A forged same-origin header must not authorise those remote calls.
   (This case was missing at first — without it the probe passed a build with SEC-008 reintroduced.) */
process.env.OMNI_LOCAL_TRUST = "true";
delete process.env.OMNI_TRUST_PROXY;
const assertedRemoteCases = [
  ["forged Origin+Host under asserted local trust", { "x-forwarded-for": "203.0.113.9", host: "a.example", origin: "https://a.example" }],
  ["forged Referer under asserted local trust", { "x-forwarded-for": "203.0.113.9", host: "a.example", referer: "https://a.example/p" }],
  ["forged X-Forwarded-Host under asserted local trust", { "x-forwarded-for": "203.0.113.9", "x-forwarded-host": "a.example", origin: "https://a.example" }],
  ["loopback Host from a remote IP", { "x-forwarded-for": "203.0.113.9", host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000" }],
];
for (const [name, headers] of assertedRemoteCases) {
  run(name, "remote caller while the operator has asserted a local deployment",
    "same-origin headers are CSRF control only and must not authorise a remote mutation (SEC-008)", () => {
      const res = mutation(headers);
      return { ok: denied(res), detail: denied(res) ? "401 " + res.body.code : "ALLOWED" };
    });
}

/* Genuinely local: no forwarding headers at all, with the deployment assertion in place. */
run("direct connection allowed once local trust is asserted", "desktop operator on the same machine",
  "an asserted single-machine deployment must still work (no over-tightening)", () => {
    const res = mutation({ host: "localhost:3000" });
    return { ok: res === null, detail: res === null ? "allowed" : "rejected " + res.body.code };
  });

run("header-less request denied when local trust is NOT asserted", "direct remote client with no proxy headers",
  "absence of a forwarding header is not evidence of locality (SEC-011)", () => {
    const saved = process.env.OMNI_LOCAL_TRUST;
    delete process.env.OMNI_LOCAL_TRUST;
    try {
      const res = mutation({ host: "localhost:3000" });
      return { ok: denied(res) && res.body.code === "AUTH_NOT_CONFIGURED", detail: res === null ? "ALLOWED" : res.body.code };
    } finally { process.env.OMNI_LOCAL_TRUST = saved === undefined ? "true" : saved; }
  });

/* Webhook boundary. */
const webhook = (headers, provided, configured) => guard.authorizeWebhook(mk(headers), provided, configured);
run("webhook: no secret configured, remote", "external caller guessing the webhook", "must be rejected", () => {
  const r = webhook({ "x-forwarded-for": "203.0.113.9" }, undefined, undefined);
  return { ok: r !== null, detail: r ? "401 " + r.body.code : "ALLOWED" };
});
run("webhook: secret configured, missing", "caller omits the secret", "must be rejected", () => {
  const r = webhook({ "x-forwarded-for": "203.0.113.9" }, undefined, WEBHOOK_SECRET);
  return { ok: r !== null, detail: r ? "401 " + r.body.code : "ALLOWED" };
});
run("webhook: secret configured, wrong", "caller guesses the secret", "must be rejected", () => {
  const r = webhook({ "x-forwarded-for": "203.0.113.9" }, crypto.randomBytes(24).toString("hex"), WEBHOOK_SECRET);
  return { ok: r !== null, detail: r ? "401 " + r.body.code : "ALLOWED" };
});
run("webhook: secret configured, correct", "legitimate signal provider", "must be accepted", () => {
  const r = webhook({ "x-forwarded-for": "203.0.113.9" }, WEBHOOK_SECRET, WEBHOOK_SECRET);
  return { ok: r === null, detail: r ? "rejected" : "allowed" };
});
run("webhook: local, no secret configured", "local development", "must be accepted", () => {
  const r = webhook({}, undefined, undefined);
  return { ok: r === null, detail: r ? "rejected" : "allowed" };
});

/* Constant-time comparison must accept equal and reject unequal / length-mismatched values. */
run("constant-time compare: equal", "timing side channel", "equal inputs compare true", () => {
  const v = crypto.randomBytes(24).toString("hex");
  return { ok: guard.timingSafeEqualStr(v, v) === true, detail: "" };
});
run("constant-time compare: unequal same length", "timing side channel", "unequal same-length inputs compare false", () => {
  const a = crypto.randomBytes(24).toString("hex");
  const b = (a[0] === "a" ? "b" : "a") + a.slice(1);
  return { ok: guard.timingSafeEqualStr(a, b) === false, detail: "" };
});
run("constant-time compare: length mismatch", "timing side channel", "different-length inputs compare false without throwing", () => {
  return { ok: guard.timingSafeEqualStr("short", "a-much-longer-value") === false, detail: "" };
});

/* ------------------------------------------------------------------ */
/* Route inventory: a new mutating route without a guard must fail.    */
/* ------------------------------------------------------------------ */
function routeInventory() {
  const root = path.join(ROOT, "src", "app");
  const files = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full);
      else if (e.name === "route.ts") files.push(full);
    }
  })(root);
  const mutating = files.filter((f) => /export async function (POST|PUT|PATCH|DELETE)/.test(fs.readFileSync(f, "utf8")));
  const unguarded = mutating.filter((f) => !/(authorizeMutation|authorizeWebhook|guard\()/.test(fs.readFileSync(f, "utf8")));
  return { total: mutating.length, unguarded: unguarded.map((f) => path.relative(root, f)) };
}
run("route inventory: every mutating route is guarded", "a developer adds a mutating route without authorization", "the inventory check must list zero unguarded routes", () => {
  const inv = routeInventory();
  return {
    ok: inv.unguarded.length === 0 && inv.total > 0,
    detail: inv.total + " mutating routes, unguarded: " + (inv.unguarded.length ? inv.unguarded.join(", ") : "none"),
  };
});

/* ---------------------------------- report ---------------------------------- */
const failed = results.filter((r) => !r.ok);
const label = path.basename(path.dirname(MODULE)) + "/" + path.basename(MODULE);
console.log("module: " + MODULE);
for (const r of results) {
  if (!r.ok) {
    console.log("  FAIL " + r.name + "  [" + r.detail + "]");
    console.log("       threat  : " + r.threat);
    console.log("       expected: " + r.property);
  }
}
console.log("\n" + label + ": " + (results.length - failed.length) + " passed, " + failed.length + " failed");
process.exit(failed.length === 0 ? 0 : 1);
