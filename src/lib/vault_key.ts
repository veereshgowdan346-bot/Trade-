/**
 * SEC-003: vault key derivation, isolated from the database so it can be unit-tested.
 *
 * The vault previously fell back to a constant passphrase committed to this repository when VAULT_KEY
 * was unset. That encrypts secrets with a publicly known key while appearing secure. There is no
 * fallback here: derivation fails closed with VaultKeyMissingError.
 */
import crypto from "node:crypto";

export class VaultKeyMissingError extends Error {
  constructor() {
    super("VAULT_KEY is not configured: the credential vault is disabled until an operator sets it.");
    this.name = "VaultKeyMissingError";
  }
}

const MIN_KEY_LENGTH = 8;
const SALT = "omnitrade-vault-salt-v1";

/**
 * True when no usable VAULT_KEY is configured (the vault cannot be used).
 *
 * The name is retained for compatibility with the `fallbackKey` payload field, but there is NO fallback
 * key: this now means "unconfigured, therefore disabled". Callers must not describe it as a fallback.
 */
export function vaultUsingFallbackKey(): boolean {
  const pass = process.env.VAULT_KEY;
  return !pass || pass.length < MIN_KEY_LENGTH;
}

/** True when the vault is usable. */
export function vaultConfigured(): boolean {
  return !vaultUsingFallbackKey();
}

/** Derive the AES-256 key. Throws VaultKeyMissingError rather than inventing a key. */
export function masterKey(): Buffer {
  const pass = process.env.VAULT_KEY;
  if (!pass || pass.length < MIN_KEY_LENGTH) throw new VaultKeyMissingError();
  return crypto.scryptSync(pass, SALT, 32);
}
