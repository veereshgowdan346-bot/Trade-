/**
 * OmniTradePro Apex V2.0 — API Guard (Phase 2, SEC-001).
 *
 * Authentication / authorization / rate limiting for the exposed /api surface.
 *
 * Threat model: the desktop app binds a Next.js server that may be reachable beyond
 * loopback (LAN or the Arena live preview). The trading engine itself permanently
 * blocks LIVE execution (Phase 1 SEC-004), so the residual risk is unauthorised
 * paper-state manipulation, config tampering, webhook signal injection and abuse.
 *
 * Policy (preserves local development):
 *  - If OMNI_API_TOKEN is set: every mutating request must carry
 *    `Authorization: Bearer <token>` (compared in constant time).
 *  - If OMNI_API_TOKEN is set to >= 8 non-blank characters: Bearer token required (constant-time), for
 *    everyone; local trust is irrelevant while a usable token exists (token precedence).
 *  - If OMNI_API_TOKEN is set but unusable (blank/too short): 401 AUTH_MISCONFIGURED. It is never silently
 *    ignored, because ignoring it would downgrade the deployment to the token-less path (SEC-012).
 *  - If OMNI_API_TOKEN is not set: mutations are rejected UNLESS the operator asserts a
 *    single-machine deployment with OMNI_LOCAL_TRUST=true (SEC-011). With that assertion,
 *    a request with no forwarding headers, or a trusted proxy whose NEAREST hop is private
 *    (OMNI_TRUST_PROXY=true), is accepted. Without it, everything fails closed with 401
 *    AUTH_NOT_CONFIGURED — the guard cannot read the peer socket, so a missing header is
 *    not evidence of locality.
 *
 *    A client-supplied X-Forwarded-For value is NOT proof of locality: that was a
 *    real bypass (any caller could claim 127.0.0.1) and is fixed here.
 *  - /api/v1/webhook additionally accepts a configured secret (constant-time
 *    compare). Without a secret, webhook calls are accepted only from trusts
 *    established by isTrustedLocalClient() (local TradingView/ChartInk development).
 *  - Per-client rate limits apply to every class of endpoint; excess returns 429. Limits are per-process
 *    and keyed by the client's claimed IP, so they are best-effort abuse control, not a security boundary.
 *
 * SEC-008 (closed): the same-origin check was previously an alternative to the locality rule, so a
 * non-browser client could forge Origin+Host and mutate state with no token. originMatchesHost() is still
 * exported for CSRF diagnostics, but it no longer authorises a mutation. Deployments reachable beyond
 * loopback MUST set OMNI_API_TOKEN; without it remote mutations fail closed.
 *
 * The UI attaches the bearer token from localStorage("omni_api_token") when present
 * (src/components/ui.tsx api()).
 */
import crypto from "node:crypto";

export type GuardRejection = { status: number; body: { ok: false; reason: string; code: string } };
export type GuardResult = GuardRejection | null; // null = allowed

export type RateClass = "read" | "write" | "webhook" | "vault";

const RATE_LIMITS: Record<RateClass, { limit: number; windowMs: number }> = {
  read: { limit: 120, windowMs: 60_000 },
  write: { limit: 30, windowMs: 60_000 },
  webhook: { limit: 20, windowMs: 60_000 },
  vault: { limit: 10, windowMs: 60_000 },
};

/** Minimal structural type so unit tests can pass plain objects (NextRequest fits). */
export type MinimalRequest = {
  headers: { get(name: string): string | null | undefined };
};

/** Constant-time string comparison (false on length mismatch without leaking the values). */
export function timingSafeEqualStr(a: string, b: string): boolean {
  const ba = Buffer.from(String(a ?? ""), "utf8");
  const bb = Buffer.from(String(b ?? ""), "utf8");
  if (ba.length !== bb.length) {
    // Compare against self to keep the work (and timing) roughly constant, then fail.
    crypto.timingSafeEqual(ba, ba);
    return false;
  }
  return crypto.timingSafeEqual(ba, bb);
}

/**
 * Trust X-Forwarded-For / X-Real-IP only when a reverse proxy is explicitly declared.
 *
 * The previous implementation read the FIRST X-Forwarded-For entry, which is supplied by the client.
 * Any caller could therefore claim `X-Forwarded-For: 127.0.0.1`, be classified as loopback and pass the
 * mutation check with no token. Forwarded headers are now advisory unless OMNI_TRUST_PROXY=true, and
 * even then only the LAST hop (appended by the proxy nearest the server) is trusted.
 */
/**
 * SEC-011: local trust must be ASSERTED by the operator, not inferred from the absence of a header.
 *
 * The guard sees headers only — it cannot read the peer socket — so "no forwarding headers" is equally
 * consistent with a direct connection from another machine. Treating that as local was an assumption, not
 * evidence. Deployments must therefore either configure OMNI_API_TOKEN, or explicitly assert that the server
 * is bound to this machine with OMNI_LOCAL_TRUST=true. With neither set, every mutation fails closed.
 */
export function localTrustAsserted(): boolean {
  const v = String(process.env.OMNI_LOCAL_TRUST ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/**
 * Token usability (SEC-012). A token shorter than 8 characters or consisting only of whitespace is NOT
 * usable. It must not be silently ignored: doing so downgrades an operator who configured a token to the
 * token-less path, which (with OMNI_LOCAL_TRUST asserted) means no authentication at all while the operator
 * believes the API is protected. Unusable-but-present configuration therefore fails closed with its own code.
 */
const MIN_TOKEN_LENGTH = 8;
export function tokenState(): "absent" | "usable" | "unusable" {
  const raw = process.env.OMNI_API_TOKEN;
  if (raw === undefined || String(raw).trim() === "") return "absent";
  return String(raw).trim().length >= MIN_TOKEN_LENGTH ? "usable" : "unusable";
}

export function trustProxyEnabled(): boolean {
  const v = String(process.env.OMNI_TRUST_PROXY ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function forwardedChain(req: MinimalRequest): string[] {
  const fwd = req.headers.get("x-forwarded-for");
  if (!fwd) return [];
  return String(fwd)
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

export function clientIp(req: MinimalRequest): string {
  const chain = forwardedChain(req);
  if (chain.length) return trustProxyEnabled() ? chain[chain.length - 1] : chain[0];
  return String(req.headers.get("x-real-ip") ?? "").trim() || "local";
}

/**
 * True only when the request can be believed to originate on this machine or the private network.
 *
 * - No forwarding headers at all -> direct connection -> local (development preserved).
 * - Forwarding headers present    -> require OMNI_TRUST_PROXY, then judge the nearest hop only.
 *
 * A client-supplied header on its own is never treated as proof of locality.
 */
export function isTrustedLocalClient(req: MinimalRequest): boolean {
  // Presence of a forwarding header is the signal that a proxy is in the path — not its content.
  // An EMPTY or whitespace-only X-Forwarded-For (SEC-010) previously parsed to an empty chain and was
  // indistinguishable from a direct connection, so a remote client could send `X-Forwarded-For:` with
  // no value and be classified as local. Presence now counts, and an unparseable nearest hop fails closed.
  const rawFwd = req.headers.get("x-forwarded-for");
  const rawReal = req.headers.get("x-real-ip");
  const hasForwardingHeader = (rawFwd !== null && rawFwd !== undefined) || (rawReal !== null && rawReal !== undefined);
  if (!hasForwardingHeader) return true;
  if (!trustProxyEnabled()) return false;
  const chain = forwardedChain(req);
  const nearest = chain.length ? chain[chain.length - 1] : String(rawReal ?? "").trim();
  if (!nearest) return false; // header present but unusable -> cannot be believed local
  return isLoopbackOrPrivate(nearest);
}

export function isLoopbackOrPrivate(ip: string): boolean {
  const v = String(ip ?? "").trim().toLowerCase();
  if (!v || v === "local" || v === "localhost" || v === "::1" || v === "[::1]" || v === "0:0:0:0:0:0:0:1") return true;
  if (v.startsWith("127.") || v.startsWith("10.") || v.startsWith("192.168.")) return true;
  const m172 = v.match(/^172\.(\d{1,3})\./);
  if (m172) {
    const second = Number(m172[1]);
    if (second >= 16 && second <= 31) return true;
  }
  // IPv6 unique-local fc00::/7
  if (v.startsWith("fc") || v.startsWith("fd")) return true;
  return false;
}

export function originMatchesHost(req: MinimalRequest): boolean {
  const host = String(req.headers.get("x-forwarded-host") ?? req.headers.get("host") ?? "").toLowerCase();
  if (!host) return false;
  const candidates = [req.headers.get("origin"), req.headers.get("referer")];
  for (const c of candidates) {
    if (!c) continue;
    try {
      const u = new URL(String(c));
      if (u.host.toLowerCase() === host) return true;
    } catch {
      /* ignore malformed */
    }
  }
  return false;
}

/* ------------------------------------------------------------------ */
/* In-memory per-client rate limiter (per-process, non-distributed).    */
/* ------------------------------------------------------------------ */
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 4096;

export function resetRateLimitState(): void {
  buckets.clear();
}

export function checkRateLimit(req: MinimalRequest, cls: RateClass, now = Date.now()): GuardResult {
  const { limit, windowMs } = RATE_LIMITS[cls];
  const key = `${cls}|${clientIp(req)}`;
  let b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    if (buckets.size >= MAX_BUCKETS) {
      for (const [k, v] of buckets) if (v.resetAt <= now) buckets.delete(k);
      if (buckets.size >= MAX_BUCKETS) buckets.clear();
    }
    b = { count: 0, resetAt: now + windowMs };
    buckets.set(key, b);
  }
  b.count += 1;
  if (b.count > limit) {
    return {
      status: 429,
      body: {
        ok: false,
        code: "RATE_LIMITED",
        reason: `Rate limit exceeded for ${cls} endpoints (${limit}/${Math.round(windowMs / 1000)}s per client). Retry later.`,
      },
    };
  }
  return null;
}

/* ------------------------------------------------------------------ */
/* Authorization                                                        */
/* ------------------------------------------------------------------ */
function unauthorized(reason: string, code = "UNAUTHORIZED"): GuardRejection {
  return { status: 401, body: { ok: false, code, reason } };
}

export function apiTokenConfigured(): boolean {
  return Boolean(process.env.OMNI_API_TOKEN && String(process.env.OMNI_API_TOKEN).length >= 8);
}

/**
 * Authorize a mutating API request (POST/PUT/PATCH/DELETE).
 * - Token configured  -> Bearer token required (constant-time).
 * - No token          -> loopback/private client OR same-origin browser request.
 */
export function authorizeMutation(req: MinimalRequest): GuardResult {
  const token = process.env.OMNI_API_TOKEN;
  // SEC-012: present-but-unusable configuration must fail closed, never fall through to "no token configured".
  if (tokenState() === "unusable") {
    return unauthorized(
      "OMNI_API_TOKEN is set but unusable: it must be at least " + MIN_TOKEN_LENGTH + " characters and not blank. "
        + "Fix the token or unset it (then assert OMNI_LOCAL_TRUST=true for a single-machine deployment). "
        + "Refusing rather than ignoring it, because ignoring it would remove authentication entirely.",
      "AUTH_MISCONFIGURED",
    );
  }
  if (tokenState() === "usable") {
    const auth = String(req.headers.get("authorization") ?? "");
    const got = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    if (!got) return unauthorized("OMNI_API_TOKEN is configured: Authorization: Bearer <token> required for mutating endpoints.", "TOKEN_REQUIRED");
    if (!timingSafeEqualStr(got, String(token))) return unauthorized("Invalid API token.", "TOKEN_INVALID");
    return null;
  }
  // SEC-008 CLOSED: a same-origin Origin/Referer match is a CSRF control, not authentication, and a
  // non-browser caller can forge those headers. No-token deployments therefore allow mutations only from a
  // genuinely local client. Anything arriving through a proxy (i.e. exposed beyond loopback) must present a
  // bearer token — it fails closed rather than trusting a forgeable header.
  if (!localTrustAsserted()) {
    return unauthorized(
      "No authentication is configured and local trust is not asserted. Set OMNI_API_TOKEN (>= 8 chars) "
        + "and send Authorization: Bearer <token>, or assert a single-machine deployment with OMNI_LOCAL_TRUST=true. "
        + "The guard cannot see the peer socket, so an absent forwarding header is not evidence of locality.",
      "AUTH_NOT_CONFIGURED",
    );
  }
  if (isTrustedLocalClient(req)) return null;
  return unauthorized(
    "Mutating endpoint requires authentication from a remote client. "
      + "Set OMNI_API_TOKEN (>= 8 chars) and send Authorization: Bearer <token>. "
      + "Requests arriving through a proxy are never treated as local.",
    "AUTH_REQUIRED_FOR_REMOTE",
  );
}

/**
 * Authorize the external signal webhook.
 * - secret provided by caller (from body/header): constant-time compare vs configured secret.
 * - No configured secret: accept only loopback/private clients (local dev).
 */
export function authorizeWebhook(req: MinimalRequest, providedSecret: string | undefined, configuredSecret: string | undefined): GuardRejection | null {
  if (tokenState() === "unusable") {
    return unauthorized("OMNI_API_TOKEN is set but unusable (blank or under " + MIN_TOKEN_LENGTH + " characters). Refusing all webhook calls until it is fixed or unset.", "AUTH_MISCONFIGURED");
  }
  // SEC-012: a configured secret that is too short is a broken configuration, not an absent one.
  if (configuredSecret !== undefined && configuredSecret !== null && String(configuredSecret).trim() !== ""
      && String(configuredSecret).trim().length < 8) {
    return unauthorized("The webhook secret is configured but too short (minimum 8 characters). Refusing rather than falling back to the unauthenticated local path.", "WEBHOOK_MISCONFIGURED");
  }
  if (configuredSecret && String(configuredSecret).length >= 8) {
    if (!providedSecret) return unauthorized("Webhook secret required (body 'secret' or X-Webhook-Secret header).", "WEBHOOK_SECRET_REQUIRED");
    if (!timingSafeEqualStr(providedSecret, String(configuredSecret))) return unauthorized("Invalid webhook secret.", "WEBHOOK_SECRET_INVALID");
    return null;
  }
  if (!localTrustAsserted()) {
    return unauthorized(
      "Webhook has no configured secret and local trust is not asserted. Configure a webhook secret (>=8 chars) "
        + "or assert a single-machine deployment with OMNI_LOCAL_TRUST=true.",
      "WEBHOOK_NOT_CONFIGURED",
    );
  }
  if (isTrustedLocalClient(req)) return null;
  return unauthorized("Unauthenticated external webhook rejected: configure a webhook secret (>=8 chars) first.", "WEBHOOK_UNAUTHENTICATED");
}
