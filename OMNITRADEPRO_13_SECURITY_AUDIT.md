# OMNITRADEPRO_13 — SECURITY AND APPLICATION SAFETY AUDIT

**Verdict: PARTIALLY PASSED** — the live-trading restriction and secret hygiene are solid; API authentication/rate-limiting gaps (SEC-001) block any networked deployment.

## 1. Live Trading Restriction (§13.1) — VERIFIED PERMANENT

| Requirement | Verification | Result |
|-------------|-------------|--------|
| UI cannot enable live execution | UI-001 fixed; no control remains | ✅ |
| API cannot enable live execution | `/api/orders` 403 on LIVE payloads; `/api/config` round-trips through `normaliseRisk` (forces PAPER) | ✅ |
| DB configuration cannot enable live execution | `getRisk()` re-applies `normaliseRisk` on every read — stored `tradingMode: LIVE` is ignored | ✅ (tested with 5 variants) |
| Broker adapters cannot bypass simulation | `dispatchOrder` has no live order code path; `routeOrder` interlock; Python `place_order` permanent reject | ✅ |
| Background tasks cannot bypass simulation | `scanAndTrade` → `placeOrder` (same gates); scheduler wraps engine | ✅ |
| Restart cannot accidentally enable execution | settings load → normaliseRisk forces PAPER | ✅ |
| Invalid configuration fails closed | clamps raise safety floors (quorum ≥75, gbm ≥65); unknown symbols rejected; NaN guards (MATH-002) | ✅ |
| Never tested with real orders | ✅ — all verification is code-level + simulated | ✅ |

Depth: **four independent interlocks** (UI, API, engine, gateway/broker) + env-var immunity (pytest: `TRADING_MODE=LIVE`, `ENABLE_LIVE_TRADING`, `LIVE_EXECUTION`, `NODE_ENV=production`, `BROKER_MODE=REAL_MONEY` all inert).

## 2. Security Domain Review

| Domain | Finding | Severity |
|--------|---------|----------|
| Authentication | **None on Next API** (SEC-001). Desktop Python stack has TOTP/MPIN/session auth (`auth/`) — not applied to the web API | MEDIUM |
| Authorization | No roles; single-user desktop model assumed | MEDIUM |
| Session handling | Python `session_manager` tested (phase suites); TS server is stateless | INFO |
| API validation | inputs validated (symbol/side/orderType/qty/broker enums); SQL via drizzle parameterization | ✅ LOW residual |
| Secret management | encrypted vault (`vault.ts` + Fernet/py `credential_manager`), fallback-key detection, `.gitignore` excludes creds/env/keys | ✅ |
| SQL injection | ORM parameterized queries throughout; no string-built SQL found | ✅ |
| XSS | React auto-escaping; `dangerouslySetInnerHTML` absent (grep-verified in components) | ✅ |
| CSRF | **State-changing routes accept JSON without CSRF tokens** — mitigated only by no-auth local deployment + JSON content-type parsing | MEDIUM (SEC-001 family) |
| WebSocket handling | SmartWebSocketV2 client-side only; SSE stream read-only; reconnect/backoff logic; crash-protection on drop | ✅ |
| Replay protection | **Absent on webhook** | MEDIUM |
| Idempotency | **Absent on webhook** (duplicate signal ⇒ separate order attempts; duplicate-symbol guard is the only barrier) | MEDIUM |
| Rate limiting | `core/rate_limiter.py` exists (Python, used for broker REST); **no rate limiting on Next API/webhook** | MEDIUM |
| Race conditions | per-symbol tick locks, claim-based UPDATE…WHERE status transitions (OPEN→CLOSING→CLOSED), inflight plugin cache dedupe | ✅ good practice |
| Audit logs | every order/reject/circuit/TSL event audited with `sanitizeSensitiveData` scrubber | ✅ |
| Error leakage | API error responses carry reason codes, no stack traces observed in route handlers | ✅ LOW residual |
| Dependency vulnerabilities | npm install clean; no `npm audit` failures surfaced; lockfile pinned. Python deps: cryptography/pyotp/requests/websockets current majors | LOW residual (no formal SCA run offline) |

## 3. Secret Scan (executed)
`python3 scripts/scan_repo_secrets.py` → **12 findings, ALL INERT** (SEC-002): test-fixture literals (`Bearer ***2345`, `***xyz` in test data), scanner self-matches (`scan_repo_secrets.py`/`scan_source_files.py` pattern tables), and masked references to the previously documented credential incident (`SECURITY_AUDIT.md`, `PHASE70_*`). **No live credential verified in the tree.** Historical note: `PHASE70/71` docs record a past broker-credential leak and its remediation; the incident references are redacted.

## 4. Application Safety
- Fail-closed defaults verified (PAPER forced; safety floors clamp upward; unknown/incomplete data rejects orders).
- Crash protection: WS drop ⇒ entries halted, brackets locked, no blind SLs.
- Daily reset archives only PAPER/unconfirmed orders; LIVE-legacy rows preserved for manual reconciliation (R-001 design) ✓.
- Notify/SMTP path (`notifier.ts`) uses configured credentials from vault; alerts contain no secrets (sanitizer).

## 5. Recommendations (priority order)
1. **Before any non-local exposure:** add authentication (even a static bearer for the API), CSRF protection, webhook HMAC signatures + timestamp/nonces, and rate limits (reuse `rate_limiter.py` patterns).
2. Make `webhookSecret` mandatory when the webhook route is enabled (fail closed).
3. Constant-time secret comparison (`crypto.timingSafeEqual`).
4. Run `npm audit`/`pip-audit` in CI when network policy allows.
5. Keep the four live interlocks under permanent regression (they are the system's core safety property).
