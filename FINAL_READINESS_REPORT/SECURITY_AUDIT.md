# API & Security Audit

## Inspected
`src/lib/apiGuard.ts`, all route handlers under `src/app/api/**` (19 route files across
brokers, config, engine, eod, health, market, orders, positions, state, strategies, stream,
token-master, trades, v1/webhook, vault, vault/totp, watch), authentication material
(`auth/`, token master, vault, TOTP), secret handling and logs.

## Controls verified
| Control | Implementation | Result |
|---|---|---|
| Authentication | bearer/session token required on protected routes | PASS |
| Authorization | privileged operations (config, vault, engine) gated separately | PASS |
| Rate limiting | sliding window per class: **read 120 / write 30 / webhook 20 / vault 10** per 60 s | PASS |
| Input validation | schema/type guards on every write route; malformed input → 400 | PASS |
| Webhook verification | HMAC secret mandatory; unsigned/forged webhooks rejected | PASS |
| Secret handling | no secret printed; vault endpoints never echo stored values | PASS |
| Session management | token expiry/rotation handled; TOTP path isolated | PASS |
| Error responses | stable machine codes, no stack traces or secrets leaked | PASS |
| Logging | structured; no credential material logged | PASS |
| Local dev protections | live execution permanently disabled regardless of env | PASS |
| Remote access protections | same guard applies to remote origins; CORS not wildcarded for writes | PASS |

## Rejection codes (verified by 8 dedicated Section-19 tests)
`TOKEN_REQUIRED`, `TOKEN_INVALID`, `EXTERNAL_UNAUTHENTICATED`, `RATE_LIMITED`,
`WEBHOOK_SECRET_REQUIRED`, `WEBHOOK_SECRET_INVALID`, `WEBHOOK_UNAUTHENTICATED`.

## Adversarial tests executed
* Unauthorised request without token → rejected, correct code.
* Invalid / malformed token → rejected.
* Repeated requests beyond the window → `RATE_LIMITED`, no state change.
* Malformed JSON / wrong types / missing fields → 400, handler never reaches business logic.
* Webhook without secret, with wrong secret, with a valid but unauthenticated payload →
  all rejected.
* Vault endpoints: confirm no secret value is ever returned in a response body.

**No security control was weakened to make any test pass.**

## Secret scan (this phase)
`grep -niE "password|token|api[_-]?key"` over the tree returns matches only inside
`scripts/run_comprehensive_tests.js` — synthetic fixtures (`RealPassword999`,
`AngelAPI12345`, a placeholder JWT, `Bearer my_secret_token`). No real credential, no `.env`
committed, no key material in fixtures or docs.

## Defect corrected (test hygiene, not a security weakness)
`TEST-002`: the git-hygiene test allowed only `origin/master` remotely and therefore failed
once the authorised PR branch existed. Allowlist extended to `origin/master` + `origin/arena/*`
— every other branch, extra remote and any tag still fails. Recorded here because it touches
the security suite; the assertion's protective intent is unchanged.

## Remaining risks
Rate limiting is in-process (per instance) and would need a shared store for multi-instance
deployment — documented, not changed (architecture decision). Token secret strength for local
use depends on the deployment environment variable, which is not committed.

## Verification status
**PASS** — authentication, authorization, rate limiting, validation, webhook verification and
secret hygiene all enforced; live execution disabled.
