import crypto from "node:crypto";
import os from "node:os";
import type { BrokerKey } from "./instruments";
import { audit, getSetting, setSetting } from "./settings";
import { totp } from "./totp";
import { decrypt, encrypt, loadCreds } from "./vault";

export const ANGEL_BASE = "https://apiconnect.angelone.in";
export const SHOONYA_BASE = "https://api.shoonya.com/NorenWClientAPI";
export const GROWW_BASE = "https://api.groww.in/v1";

export type AngelSession = {
  jwtToken: string;
  refreshToken: string;
  feedToken: string;
  clientCode: string;
  apiKey: string;
  issuedAt: number;
  expiresAt: number;
};

export type ShoonyaSession = {
  token: string;
  uid: string;
  actid: string;
  issuedAt: number;
  expiresAt: number;
};

export type GrowwSession = {
  accessToken: string;
  clientId: string;
  issuedAt: number;
};

type SessionBag = {
  angel?: AngelSession;
  shoonya?: ShoonyaSession;
  groww?: GrowwSession;
};

type EncBlob = { ciphertext: string; iv: string; tag: string };

type GlobalSessions = typeof globalThis & {
  __omniSessions?: SessionBag;
  __omniSessionLoaded?: boolean;
  __omniAuthInflight?: Partial<Record<BrokerKey, Promise<unknown>>>;
  __omniNetInfo?: { localIp: string; mac: string };
};

const g = globalThis as GlobalSessions;
const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

export class BrokerApiError extends Error {
  status: number;
  retryable: boolean;
  authExpired: boolean;

  constructor(message: string, opts: { status?: number; retryable?: boolean; authExpired?: boolean } = {}) {
    super(message);
    this.name = "BrokerApiError";
    this.status = opts.status ?? 0;
    this.retryable = opts.retryable ?? false;
    this.authExpired = opts.authExpired ?? false;
  }
}

export function networkMeta(): { localIp: string; mac: string } {
  if (g.__omniNetInfo) return g.__omniNetInfo;
  let localIp = "127.0.0.1";
  let mac = "00:00:00:00:00:00";
  try {
    const ifaces = os.networkInterfaces();
    for (const entries of Object.values(ifaces)) {
      if (!entries) continue;
      for (const e of entries) {
        if (!e.internal && e.family === "IPv4" && e.address) {
          localIp = e.address;
          if (e.mac && e.mac !== "00:00:00:00:00:00") mac = e.mac.toUpperCase();
          break;
        }
      }
      if (localIp !== "127.0.0.1") break;
    }
  } catch {
    /* fallback to loopback metadata */
  }
  g.__omniNetInfo = { localIp, mac };
  return g.__omniNetInfo;
}

export function angelHeaders(apiKey: string, jwtToken?: string): Record<string, string> {
  const net = networkMeta();
  return {
    "Content-Type": "application/json",
    Accept: "application/json",
    "X-UserType": "USER",
    "X-SourceID": "WEB",
    "X-ClientLocalIP": net.localIp,
    "X-ClientPublicIP": net.localIp,
    "X-MACAddress": net.mac,
    "X-PrivateKey": apiKey,
    ...(jwtToken ? { Authorization: `Bearer ${jwtToken}` } : {}),
  };
}

export async function httpJson(url: string, init: RequestInit & { timeoutMs?: number } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), init.timeoutMs ?? 10_000);
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal, cache: "no-store" });
    const text = await res.text();
    let json: Record<string, unknown> | null = null;
    try {
      json = JSON.parse(text) as Record<string, unknown>;
    } catch {
      /* non-JSON body */
    }
    return { status: res.status, ok: res.ok, json, text };
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new BrokerApiError(`Request timed out after ${init.timeoutMs ?? 10_000}ms`, { status: 408, retryable: true });
    }
    throw new BrokerApiError(e instanceof Error ? e.message : String(e), { retryable: true });
  } finally {
    clearTimeout(timer);
  }
}

export function jwtExpiresAt(token: string, fallbackMs = 12 * 3600_000): number {
  try {
    const parts = token.split(".");
    if (parts.length < 2) return Date.now() + fallbackMs;
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as { exp?: number };
    if (typeof payload.exp === "number" && Number.isFinite(payload.exp)) {
      return payload.exp * 1000;
    }
  } catch {
    /* ignore malformed JWT */
  }
  return Date.now() + fallbackMs;
}

async function loadBag(): Promise<SessionBag> {
  if (g.__omniSessionLoaded && g.__omniSessions) return g.__omniSessions;
  const enc = await getSetting<EncBlob | null>("brokerSessions", null);
  let bag: SessionBag = {};
  if (enc?.ciphertext && enc.iv && enc.tag) {
    try {
      bag = JSON.parse(decrypt(enc)) as SessionBag;
    } catch {
      bag = {};
    }
  }
  g.__omniSessions = bag;
  g.__omniSessionLoaded = true;
  return bag;
}

async function saveBag(bag: SessionBag) {
  g.__omniSessions = bag;
  g.__omniSessionLoaded = true;
  await setSetting("brokerSessions", encrypt(JSON.stringify(bag)));
}

export async function clearSession(broker: BrokerKey) {
  const bag = await loadBag();
  delete bag[broker];
  await saveBag(bag);
}

export async function getCachedAngelSession(): Promise<AngelSession | null> {
  const bag = await loadBag();
  return bag.angel ?? null;
}

async function runWithAuthLock<T>(broker: BrokerKey, fn: () => Promise<T>): Promise<T> {
  g.__omniAuthInflight ??= {};
  const existing = g.__omniAuthInflight[broker];
  if (existing) return existing as Promise<T>;
  const p = fn().finally(() => {
    delete g.__omniAuthInflight?.[broker];
  });
  g.__omniAuthInflight[broker] = p;
  return p;
}

export async function saveAngelSession(sess: AngelSession) {
  const bag = await loadBag();
  bag.angel = sess;
  await saveBag(bag);
}

export async function angelLogin(creds: Record<string, string>): Promise<AngelSession> {
  const preferred = creds.pinSource === "tradingPin" ? creds.tradingPin : creds.password;
  const secret = preferred || creds.password || creds.tradingPin;
  if (!secret) {
    throw new BrokerApiError("Missing Login MPIN / Password or Trading Security PIN");
  }
  const code = totp(creds.totpSecret).code;
  const res = await httpJson(`${ANGEL_BASE}/rest/auth/angelbroking/user/v1/loginByPassword`, {
    method: "POST",
    headers: angelHeaders(creds.apiKey),
    body: JSON.stringify({ clientcode: creds.clientId, password: secret, totp: code, state: "omnitrade" }),
  });
  const data = res.json?.data as Record<string, string> | null | undefined;
  if (!res.ok || res.json?.status === false || !data?.jwtToken) {
    const rawMsg = String(res.json?.message ?? res.text?.slice(0, 140) ?? `Angel login failed (HTTP ${res.status})`).trim();
    const errCode = String(res.json?.errorcode ?? res.json?.errorCode ?? "").trim();
    const fullMsg = errCode && !rawMsg.includes(errCode) ? `${rawMsg} [${errCode}]` : rawMsg;
    throw new BrokerApiError(fullMsg || `Angel login failed (HTTP ${res.status})`, {
      status: res.status,
      retryable: res.status >= 500 || res.status === 429,
    });
  }
  return {
    jwtToken: data.jwtToken,
    refreshToken: data.refreshToken ?? "",
    feedToken: data.feedToken ?? "",
    clientCode: creds.clientId,
    apiKey: creds.apiKey,
    issuedAt: Date.now(),
    expiresAt: jwtExpiresAt(data.jwtToken),
  };
}

async function angelRefresh(cur: AngelSession, creds: Record<string, string>): Promise<AngelSession | null> {
  if (!cur.refreshToken) return null;
  try {
    const res = await httpJson(`${ANGEL_BASE}/rest/auth/angelbroking/jwt/v1/generateTokens`, {
      method: "POST",
      headers: angelHeaders(creds.apiKey, cur.jwtToken),
      body: JSON.stringify({ refreshToken: cur.refreshToken }),
    });
    const data = res.json?.data as Record<string, string> | null | undefined;
    if (!res.ok || res.json?.status === false || !data?.jwtToken) return null;
    return {
      jwtToken: data.jwtToken,
      refreshToken: data.refreshToken || cur.refreshToken,
      feedToken: data.feedToken || cur.feedToken,
      clientCode: creds.clientId,
      apiKey: creds.apiKey,
      issuedAt: Date.now(),
      expiresAt: jwtExpiresAt(data.jwtToken),
    };
  } catch {
    return null;
  }
}

/** Ensures a valid Angel One session, refreshing via refreshToken or TOTP login automatically. */
export async function ensureAngelSession(forceRefresh = false): Promise<AngelSession> {
  const creds = await loadCreds("angel");
  if (!creds?.clientId || !(creds.password || creds.tradingPin) || !creds.apiKey || !creds.totpSecret) {
    throw new BrokerApiError("Angel One credentials incomplete in vault");
  }
  const bag = await loadBag();
  const cur = bag.angel;
  const refreshBufferMs = 15 * 60_000;
  if (!forceRefresh && cur && cur.clientCode === creds.clientId && cur.apiKey === creds.apiKey && Date.now() < cur.expiresAt - refreshBufferMs) {
    return cur;
  }

  return runWithAuthLock("angel", async () => {
    const latest = (await loadBag()).angel;
    if (!forceRefresh && latest && latest.clientCode === creds.clientId && Date.now() < latest.expiresAt - refreshBufferMs) {
      return latest;
    }
    let next: AngelSession | null = null;
    if (!forceRefresh && latest && latest.refreshToken && latest.clientCode === creds.clientId) {
      next = await angelRefresh(latest, creds);
      if (next) await audit("INFO", "SESSION", "Angel One JWT refreshed automatically via refreshToken");
    }
    if (!next) {
      next = await angelLogin(creds);
      await audit("INFO", "SESSION", `Angel One session authenticated for ${creds.clientId}`);
    }
    const updated = await loadBag();
    updated.angel = next;
    await saveBag(updated);
    return next;
  });
}

export async function shoonyaLogin(creds: Record<string, string>): Promise<ShoonyaSession> {
  const uid = (creds.userId || creds.client_id || "").trim();
  const pwd = (creds.password || "").trim();
  const totpSecret = (creds.totpSecret || creds.totp_secret || "").trim();
  const vendorCode = (creds.vendorCode || creds.vendor_code || (uid ? `${uid}_U` : "")).trim();
  const imei = (creds.imei || "12345").trim();

  if (!uid || !pwd || !totpSecret) {
    throw new BrokerApiError("Shoonya credentials missing User ID, Password, or TOTP Secret in vault");
  }

  const pwdHashed = sha256(pwd);

  // Derived secret chars: S3cur3!d
  const X = [83, 50, 97, 114, 110, 46, 27, 93];
  const secretChars = X.map((val, p) => String.fromCharCode(val + p)).join("");
  const appkeyHashed = sha256(`${uid}|${secretChars}`);
  const factor2 = totp(totpSecret).code;

  const jData = {
    apkversion: "W2_20260827",
    uid,
    pwd: pwdHashed,
    factor2,
    appkey: appkeyHashed,
    imei: imei || "12345",
    addldivinf: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    app_key: vendorCode,
    source: "API",
    vc: "NOREN_API",
  };

  const res = await httpJson(`${SHOONYA_BASE}/QuickAuth`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `jData=${JSON.stringify(jData)}`,
  });

  const token = (res.json?.susertoken as string | undefined) || (res.json?.token as string | undefined);
  if (!res.ok || !token || res.json?.stat !== "Ok") {
    const emsg = String(res.json?.emsg || res.json?.message || `Shoonya login failed (HTTP ${res.status})`);
    throw new BrokerApiError(emsg, {
      status: res.status,
      retryable: res.status >= 500 || res.status === 429,
    });
  }

  return {
    token,
    uid,
    actid: String(res.json?.actid ?? uid),
    issuedAt: Date.now(),
    expiresAt: Date.now() + 12 * 3600_000,
  };
}

export async function ensureShoonyaSession(forceRefresh = false): Promise<ShoonyaSession> {
  const creds = await loadCreds("shoonya");
  if (!creds?.userId && !creds?.client_id) {
    throw new BrokerApiError("Shoonya credentials incomplete in vault");
  }
  const bag = await loadBag();
  const cur = bag.shoonya;
  if (!forceRefresh && cur && cur.uid === creds.userId && Date.now() < cur.expiresAt - 15 * 60_000) {
    return cur;
  }
  return runWithAuthLock("shoonya", async () => {
    const latest = (await loadBag()).shoonya;
    if (!forceRefresh && latest && latest.uid === creds.userId && Date.now() < latest.expiresAt - 15 * 60_000) {
      return latest;
    }
    const next = await shoonyaLogin(creds);
    const updated = await loadBag();
    updated.shoonya = next;
    await saveBag(updated);
    await audit("INFO", "SESSION", `Shoonya session authenticated for ${creds.userId}`);
    return next;
  });
}

export async function ensureGrowwSession(): Promise<GrowwSession> {
  const creds = await loadCreds("groww");
  if (!creds?.accessToken) {
    throw new BrokerApiError("Groww accessToken missing in vault");
  }
  return {
    accessToken: creds.accessToken,
    clientId: creds.clientId || "",
    issuedAt: Date.now(),
  };
}

/** Called periodically by scheduler to proactively refresh expiring sessions before expiry. */
export async function proactiveSessionRefresh(): Promise<void> {
  const bag = await loadBag();
  if (bag.angel && bag.angel.expiresAt - Date.now() < 20 * 60_000) {
    try {
      await ensureAngelSession(true);
    } catch (e) {
      await audit("WARN", "SESSION", `Proactive Angel One token refresh failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (bag.shoonya && bag.shoonya.expiresAt - Date.now() < 20 * 60_000) {
    try {
      await ensureShoonyaSession(true);
    } catch (e) {
      await audit("WARN", "SESSION", `Proactive Shoonya session refresh failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}

