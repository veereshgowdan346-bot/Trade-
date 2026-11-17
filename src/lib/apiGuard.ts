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
 *  - If OMNI_API_TOKEN is not set: mutating requests are allowed only from
 *    loopback/private-network clients or from same-origin browser requests
 *    (Origin/Referer host matches the request host). External non-browser
 *    mutation attempts are rejected 401.
 *  - /api/v1/webhook additionally accepts a configured secret (constant-time
 *    compare). Without a secret, webhook calls are accepted only from
 *    loopback/private clients (local TradingView/ChartInk development).
 *  - Per-client rate limits apply to every class of endpoint; excess returns 429.
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

export function clientIp(req: MinimalRequest): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const first = String(fwd).split(",")[0].trim();
    if (first) return first;
  }
  return String(req.headers.get("x-real-ip") ?? "").trim() || "local";
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
  if (token && String(token).length >= 8) {
    const auth = String(req.headers.get("authorization") ?? "");
    const got = auth.startsWith("Bearer ") ? auth.slice(7).trim() : "";
    if (!got) return unauthorized("OMNI_API_TOKEN is configured: Authorization: Bearer <token> required for mutating endpoints.", "TOKEN_REQUIRED");
    if (!timingSafeEqualStr(got, String(token))) return unauthorized("Invalid API token.", "TOKEN_INVALID");
    return null;
  }
  if (isLoopbackOrPrivate(clientIp(req)) || originMatchesHost(req)) return null;
  return unauthorized(
    "Unauthenticated external mutation rejected. Set OMNI_API_TOKEN and send Authorization: Bearer <token>, or operate from localhost.",
    "EXTERNAL_UNAUTHENTICATED",
  );
}

/**
 * Authorize the external signal webhook.
 * - secret provided by caller (from body/header): constant-time compare vs configured secret.
 * - No configured secret: accept only loopback/private clients (local dev).
 */
export function authorizeWebhook(req: MinimalRequest, providedSecret: string | undefined, configuredSecret: string | undefined): GuardRejection | null {
  if (configuredSecret && String(configuredSecret).length >= 8) {
    if (!providedSecret) return unauthorized("Webhook secret required (body 'secret' or X-Webhook-Secret header).", "WEBHOOK_SECRET_REQUIRED");
    if (!timingSafeEqualStr(providedSecret, String(configuredSecret))) return unauthorized("Invalid webhook secret.", "WEBHOOK_SECRET_INVALID");
    return null;
  }
  if (isLoopbackOrPrivate(clientIp(req))) return null;
  return unauthorized("Unauthenticated external webhook rejected: configure a webhook secret (>=8 chars) first.", "WEBHOOK_UNAUTHENTICATED");
}
