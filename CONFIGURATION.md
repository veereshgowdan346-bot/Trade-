# Environment Configuration Reference

OmniTradePro Apex V2.0 · research and paper-trading build.

This document describes the **six** environment variables the application actually reads. Every statement
here was checked against the source (`grep -rn "process.env" src/`) and is enforced by
`scripts/env_config_probe.js`, which runs as a release gate.

> **Posture: PAPER / RESEARCH ONLY.** Live broker execution is disabled in code and cannot be enabled by any
> environment variable. Do not configure real broker credentials in any environment.

Nothing in this document is a real credential. Every value shown is a placeholder or a command that
generates one locally.

---

## Precedence, in one paragraph

If `OMNI_API_TOKEN` holds a **usable** token (≥ 8 non-blank characters), every mutating request must present
`Authorization: Bearer <token>` and `OMNI_LOCAL_TRUST` is irrelevant. If `OMNI_API_TOKEN` is set but
**unusable**, every mutation and webhook call is refused (`401 AUTH_MISCONFIGURED`) — it is never silently
ignored. If `OMNI_API_TOKEN` is absent or empty, mutations are allowed only when the operator has asserted a
single-machine deployment with `OMNI_LOCAL_TRUST=true`, and only for requests that satisfy the locality rules
below. Otherwise everything fails closed with `401 AUTH_NOT_CONFIGURED`.

---

## 1. `OMNI_API_TOKEN`

| | |
|---|---|
| **Purpose** | Bearer token authenticating every mutating API request. |
| **Required?** | Required for any deployment reachable beyond loopback. Optional for a single-machine desktop install, but then `OMNI_LOCAL_TRUST` must be asserted. |
| **Default** | Absent (empty string is treated as absent). |
| **Accepted values** | ≥ 8 characters after trimming, not blank. Compared in constant time (`crypto.timingSafeEqual`). |
| **Invalid-value behaviour** | Present but < 8 characters or blank ⇒ `401 AUTH_MISCONFIGURED` on mutations and webhooks. Fail closed; no fallthrough to the token-less path. |
| **Security implication** | This is the only real authentication boundary for a networked deployment. A short or empty value is a configuration error, not a weaker mode. |
| **Safe example** | `OMNI_API_TOKEN=<64 hex characters>` — generate locally: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |

The browser UI sends the token from `localStorage["omni_api_token"]`; the token is never written to a report,
log, or artifact.

## 2. `OMNI_LOCAL_TRUST`

| | |
|---|---|
| **Purpose** | An **administrator's explicit assertion** that this deployment is a single-machine environment whose API is not exposed to an untrusted network. |
| **Required?** | Optional. Required only for token-less single-machine operation. |
| **Default** | Not asserted. |
| **Accepted values** | Exactly `true`, `1` or `yes` (trimmed, case-insensitive). Every other value — including `on`, `y`, `tru`, `true,false`, `yes please`, `false`, `0`, `no`, or empty — leaves trust **unasserted**. |
| **Invalid-value behaviour** | Treats the deployment as unasserted ⇒ `401 AUTH_NOT_CONFIGURED`. Unrecognised values never enable anything. |
| **Security implication** | **This is an assertion, not a proof, and not a security control.** The API guard reads request headers only — it cannot see the peer socket — so it cannot verify locality. Setting this to `true` does **not** make an exposed service safe; it tells the application to assume the network is trustworthy. If the port is reachable from a LAN, a container network, or a preview host, **use `OMNI_API_TOKEN` instead**. |
| **Safe example** | `OMNI_LOCAL_TRUST=true` — only on a workstation where the server binds to this machine and no one else can reach it. |

**Operational consequence.** With this asserted and no token, a client that connects directly without proxy
headers is treated as local. If that assumption is wrong, mutations are unauthenticated. That is the risk the
operator accepts by asserting it.

## 3. `OMNI_TRUST_PROXY`

| | |
|---|---|
| **Purpose** | Declares that a reverse proxy you control sits in front of the app **and overwrites** `X-Forwarded-For`, so the forwarded chain may be read. |
| **Required?** | Optional. Needed only behind such a proxy. |
| **Default** | Disabled — forwarded headers are ignored entirely. |
| **Accepted values** | Exactly `true`, `1` or `yes`. |
| **Invalid-value behaviour** | Any other value leaves proxy trust disabled ⇒ forwarded headers are ignored and such requests are treated as remote. |
| **Security implication** | Only the **nearest** (last) hop is judged. A client-prepended `127.0.0.1` is never trusted. Enabling this without a proxy that overwrites the header lets a caller choose the hop that decides locality — do not set it speculatively. |
| **Safe example** | `OMNI_TRUST_PROXY=true` — only when every request provably passes through your proxy. |

## 4. `VAULT_KEY`

| | |
|---|---|
| **Purpose** | Passphrase from which the AES-256 credential-vault key is derived (`scrypt`, fixed salt). |
| **Required?** | Required to store or read broker credentials. The rest of the app runs without it. |
| **Default** | Absent ⇒ vault disabled. |
| **Accepted values** | ≥ 8 characters. |
| **Invalid-value behaviour** | Missing, blank or short ⇒ `VaultKeyMissingError`; the vault API returns `503 VAULT_KEY_MISSING`. **There is no fallback key** — the historical constant was removed (SEC-003) because it encrypted secrets with a publicly known key. |
| **Security implication** | Treat as a master secret. Compromise of this key plus a vault file compromises every stored credential. It is never logged or written to artifacts. |
| **Safe example** | `VAULT_KEY=<passphrase of 32+ random characters>` — generate and store in a password manager, never in Git. |

## 5. `TRADING_MODE`

| | |
|---|---|
| **Purpose** | Declares the intended trading mode for diagnostics. |
| **Required?** | Optional. |
| **Default** | `paper`. |
| **Accepted values** | `paper` is the only supported value. |
| **Invalid-value behaviour** | `LIVE` (or any live request, from config or the engine) is **refused in code** by the engine guard — the value cannot enable live execution. Unrecognised values fall back to paper behaviour. |
| **Security implication** | Cannot be used to enable real order placement. This is deliberate: the project is research/paper only. |
| **Safe example** | `TRADING_MODE=paper` |

## 6. `DATABASE_URL`

| | |
|---|---|
| **Purpose** | Location of the embedded database used for paper-trading state. |
| **Required?** | Optional. |
| **Default** | `pglite://./data/omnitrade-pg` when unset or blank. |
| **Accepted values** | A `pglite://` path (or an equivalent local URL) that the process can write to. |
| **Invalid-value behaviour** | Blank ⇒ default. An unwritable or malformed location fails at startup or on first write; it is not silently redirected. |
| **Security implication** | Holds paper-trading state only — never broker credentials (those live in the encrypted vault). Point it at a local, access-controlled path. |
| **Safe example** | `DATABASE_URL=pglite://./data/omnitrade-pg` |

---

## Not environment variables

`NEXT_RUNTIME` is read by the Next.js framework, not by this application's code, and requires no action.

## Deployment shapes

| Shape | Configuration | Notes |
|---|---|---|
| Single-machine desktop (default) | `OMNI_LOCAL_TRUST=true`, `VAULT_KEY=<secret>` | No token needed; the assertion is the trade-off described above. |
| LAN / container / preview host | `OMNI_API_TOKEN=<64 hex>`, `VAULT_KEY=<secret>` | **Never** rely on `OMNI_LOCAL_TRUST` here. |
| Behind a proxy | `OMNI_API_TOKEN=<64 hex>`, `OMNI_TRUST_PROXY=true` | Only if the proxy overwrites `X-Forwarded-For`. |
| Multi-instance | **Not supported** | Rate limiting is process-local (SEC-009). |

## Single-process limits (SEC-009)

This build supports **one process** on **one machine**. Rate limiting (read 120/min, write 30/min,
webhook 20/min, vault 10/min) is held in process memory and keyed by the client's *claimed* IP, so it is
best-effort abuse control, **not a security boundary** — a caller can present a different
`X-Forwarded-For` per request.

Consequences the operator must accept:

- Multi-instance deployment is **blocked**. Two processes would each keep their own counters, so the
  effective limit multiplies by the instance count, and the limiter could be bypassed by hitting
  different instances.
- Restarting the process resets all counters.
- Do not scale this build horizontally, and do not put it behind a load balancer that spreads one client
  across instances.
- Lifting this requires a shared, audited store with documented failure modes and its own tests. No such
  dependency has been added, because it could not be verified in this environment.

## Verifying your configuration

```bash
node scripts/env_config_probe.js   # 43 checks: missing, malformed, contradictory, unsafe values
node scripts/adversarial_api_probe.js   # 48 checks: header/hop/token matrix
node scripts/mutation_check.js     # proves both suites can actually fail
```

None of these print secret values.
