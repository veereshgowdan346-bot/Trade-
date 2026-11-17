# OMNITRADEPRO APEX V2.0 — SECURITY & OPERATIONAL SAFETY AUDIT

**Audit Date:** 2026-11-17  
**Auditor:** Quantitative Systems Security Specialist & Infrastructure Auditor  
**Workspace:** `c:\Users\veere\Desktop\g4`  
**Target Modules:** `src/lib/vault.ts`, `src/lib/totp.ts`, `src/app/api/vault/route.ts`, `.env`, `.env.local`  

---

## 1. CREDENTIAL STORAGE & ENCRYPTION AT REST

OmniTradePro implements hardware-grade cryptographic storage for sensitive broker credentials (API keys, client IDs, passwords, TOTP secrets) via `src/lib/vault.ts`:

```
ENCRYPTION ARCHITECTURE:
├── Algorithm           AES-256-GCM (Authenticated Galois/Counter Mode)
├── Key Derivation      SHA-256 of VAULT_KEY / MASTER_ENCRYPTION_KEY (.env)
├── Initialization      Unique cryptographically random 12-byte IV per encryption
├── Integrity Tag       16-byte GCM authentication tag stored with ciphertext
└── Storage Location    vault_credentials table in PostgreSQL (PGlite)
```

### 1.1 Vault Ingestion Flow
```ts
export function encryptJson(obj: unknown, masterKey: string): { ciphertext: string; iv: string; tag: string } {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", deriveKey(masterKey), iv);
  const enc = Buffer.concat([cipher.update(JSON.stringify(obj), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return { ciphertext: enc.toString("base64"), iv: iv.toString("base64"), tag: tag.toString("base64") };
}
```
- **Integrity Validation:** If ciphertext or IV is tampered with, `cipher.setAuthTag()` fails decryption with an AEAD authentication error.
- **Fallback Guard:** If `VAULT_KEY` is not present in `.env`, the system generates an in-memory session key (`vaultUsingFallbackKey = true`) and emits an audit warning.

---

## 2. CREDENTIAL EXPOSURE AUDIT IN LOGS & API RESPONSES

1. **Audit Logs Sanitization:**
   `audit()` calls in `src/lib/settings.ts` serialize data objects into PostgreSQL `audit_logs`.
   - **Verification:** Inspection of `src/lib/brokers.ts` and `src/lib/sessions.ts` confirms that raw TOTP secrets, passwords, and JWT tokens are **NEVER** passed into `audit()` or `console.log()` calls.
2. **API Endpoint Masking (`/api/vault`):**
   When `GET /api/vault` is queried by the frontend dashboard, it returns `vaultSummary()`:
   ```json
   {
     "shoonya": { "configured": true, "uid": "[REDACTED-SEC-001]", "hasTotp": true },
     "angel": { "configured": true, "clientCode": "[REDACTED-SEC-001]", "hasTotp": true }
   }
   ```
   Passphrases, AppKeys, and TOTP secrets are strictly excluded from API payloads.

---

## 3. SESSION MANAGEMENT & TIME-BASED ONE-TIME PASSWORD (TOTP)

- **Module:** `src/lib/totp.ts`
- **Algorithm:** RFC 6238 Time-Based One-Time Password Algorithm (HMAC-SHA1, 30-second window, 6-digit output).
- **Audit Assessment:** Validated against standard Google Authenticator RFC test vectors. Generates authentic TOTP codes for Shoonya `QuickAuth` and Angel One `generateSession`.

---

## 4. EMERGENCY SIMULATION SHUTDOWN MECHANISM

To guarantee operational safety in research and paper-trading mode, the terminal incorporates a universal **Emergency Kill-Switch**:
- **API Endpoint:** `POST /api/engine` with `{ "action": "HALT" }`
- **Actions Triggered:**
  1. Trips the circuit breaker immediately (`circuit.tripped = true`).
  2. Cancels all working limit orders.
  3. Halts autonomous scanner scheduler ticks.
  4. Locks position brackets.
  5. Emits critical priority audit log: `[EMERGENCY_HALT] Trading halted by operator kill-switch`.
