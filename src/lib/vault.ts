import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { vaultCredentials } from "@/db/schema";

export type VaultKey = "angel" | "shoonya" | "groww" | "smtp";

export type VaultFieldDef = {
  key: string;
  label: string;
  secret: boolean;
  hint?: string;
  pattern?: string;
};

export const VAULT_FIELDS: Record<VaultKey, VaultFieldDef[]> = {
  angel: [
    { key: "clientId", label: "Client Code (Client ID)", secret: false, hint: "Angel One Client ID (e.g. A123456)" },
    { key: "apiKey", label: "SmartAPI Key", secret: true, hint: "SmartAPI App Key" },
    { key: "password", label: "Login MPIN / Password", secret: true, hint: "Enter 4 to 6-digit MPIN / Trading Security PIN", pattern: "^\\d{4,6}$" },
    { key: "tradingPin", label: "Trading Security PIN (4-6 digits)", secret: true, hint: "Enter 4 to 6-digit MPIN / Trading Security PIN", pattern: "^\\d{4,6}$" },
    { key: "totpSecret", label: "TOTP Secret Key (Base32)", secret: true, hint: "Base32 key from SmartAPI Enable TOTP" },
  ],
  shoonya: [
    { key: "userId", label: "User ID", secret: false },
    { key: "password", label: "Password", secret: true },
    { key: "vendorCode", label: "Vendor Code", secret: false },
    { key: "apiSecret", label: "API Secret / App Key", secret: true },
    { key: "imei", label: "IMEI / Device ID", secret: false },
    { key: "totpSecret", label: "TOTP Secret (base32)", secret: true },
  ],
  groww: [
    { key: "clientId", label: "Client ID", secret: false },
    { key: "accessToken", label: "API Access Token", secret: true },
    { key: "totpSecret", label: "TOTP Secret (optional)", secret: true },
  ],
  smtp: [
    { key: "user", label: "Gmail Address", secret: false },
    { key: "appPassword", label: "Gmail App Password", secret: true },
    { key: "recipient", label: "Audit Recipient (optional)", secret: false },
  ],
};

let warned = false;
function masterKey(): Buffer {
  const pass = process.env.VAULT_KEY;
  if (!pass && !warned) {
    warned = true;
    console.warn("[vault] VAULT_KEY not set - using development fallback key. Set VAULT_KEY in .env for production.");
  }
  return crypto.scryptSync(pass || "omnitradepro-dev-vault-key", "omnitrade-vault-salt-v1", 32);
}

export function vaultUsingFallbackKey(): boolean {
  return !process.env.VAULT_KEY;
}

export function encrypt(plain: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", masterKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return { ciphertext: ct.toString("base64"), iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64") };
}

export function decrypt(b: { ciphertext: string; iv: string; tag: string }): string {
  const d = crypto.createDecipheriv("aes-256-gcm", masterKey(), Buffer.from(b.iv, "base64"));
  d.setAuthTag(Buffer.from(b.tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(b.ciphertext, "base64")), d.final()]).toString("utf8");
}

export async function loadCreds(broker: VaultKey): Promise<Record<string, string> | null> {
  const rows = await db.select().from(vaultCredentials).where(eq(vaultCredentials.broker, broker));
  if (rows[0]) {
    try {
      return JSON.parse(decrypt(rows[0])) as Record<string, string>;
    } catch {
      /* decryption failure */
    }
  }
  return null;
}

/** Merge-save: blank fields keep their stored value, so the UI never needs to echo secrets back. */
export async function saveCreds(broker: VaultKey, fields: Record<string, string>) {
  const existing = (await loadCreds(broker)) ?? {};
  const allowed = new Set(VAULT_FIELDS[broker].map((f) => f.key));
  const merged: Record<string, string> = { ...existing };
  for (const [k, v] of Object.entries(fields)) {
    if (allowed.has(k) && typeof v === "string" && v.trim() !== "") merged[k] = v.trim();
  }
  if (broker === "angel") {
    const hasPwd = typeof fields.password === "string" && fields.password.trim() !== "";
    const hasPin = typeof fields.tradingPin === "string" && fields.tradingPin.trim() !== "";
    if (hasPin && !hasPwd) merged.pinSource = "tradingPin";
    else if (hasPwd) merged.pinSource = "password";
  }
  const enc = encrypt(JSON.stringify(merged));
  await db
    .insert(vaultCredentials)
    .values({ broker, ...enc })
    .onConflictDoUpdate({ target: vaultCredentials.broker, set: { ...enc, updatedAt: new Date() } });
}

export async function deleteCreds(broker: VaultKey) {
  await db.delete(vaultCredentials).where(eq(vaultCredentials.broker, broker));
}

function maskSecret(v: string): string {
  if (v.length <= 4) return "••••";
  if (v.length <= 8) return `••••${v.slice(-2)}`;
  return `••••${v.slice(-4)}`;
}

/** Masked summary (never returns raw secret values). */
export async function vaultSummary() {
  const out: Record<string, { configured: boolean; fields: Record<string, string>; updatedAt: string | null }> = {};
  const rows = await db.select({ broker: vaultCredentials.broker, updatedAt: vaultCredentials.updatedAt }).from(vaultCredentials);
  const tsMap = new Map(rows.map((r) => [r.broker, r.updatedAt.toISOString()]));

  for (const broker of Object.keys(VAULT_FIELDS) as VaultKey[]) {
    const creds = await loadCreds(broker);
    const fields: Record<string, string> = {};
    for (const f of VAULT_FIELDS[broker]) {
      const v = creds?.[f.key];
      fields[f.key] = !v ? "" : f.secret ? maskSecret(v) : v;
    }
    out[broker] = {
      configured: !!creds && Object.keys(creds).length > 0,
      fields,
      updatedAt: tsMap.get(broker) ?? null,
    };
  }
  return out;
}
