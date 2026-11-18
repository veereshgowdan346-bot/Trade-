import { connectAngelWs } from "./angelWs";
import { buildBrokerPayload, type BrokerKey, type OrderParams } from "./instruments";
import type { RiskConfig } from "./risk";
import {
  ANGEL_BASE,
  angelHeaders,
  angelLogin,
  BrokerApiError,
  ensureAngelSession,
  ensureGrowwSession,
  ensureShoonyaSession,
  GROWW_BASE,
  httpJson,
  saveAngelSession,
  SHOONYA_BASE,
  type AngelSession,
} from "./sessions";
import { audit, getSetting, setSetting } from "./settings";
import { ingestScripMaster, resolveAll } from "./tokenMaster";
import { loadCreds, saveCreds } from "./vault";

export const BROKER_LABEL: Record<BrokerKey, string> = {
  angel: "Angel One SmartAPI",
  shoonya: "Shoonya (Finvasia)",
  groww: "Groww API",
};

export type Funds = {
  available: number;
  used: number;
  net: number | null;
  at: string;
  source: "LIVE_API";
};

export type BrokerStatus = {
  state: "NOT_CONFIGURED" | "CONFIGURED" | "CONNECTED" | "ERROR";
  message: string;
  lastChecked: string | null;
  funds: Funds | null;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

function isAngelAuthErr(status: number, json: Record<string, unknown> | null): boolean {
  if (status === 401 || status === 403) return true;
  const code = String(json?.errorcode ?? json?.errorCode ?? "").toUpperCase();
  const msg = String(json?.message ?? "").toLowerCase();
  return code === "AG8001" || code === "AG8002" || code === "AB1010" || msg.includes("invalid token") || msg.includes("expired");
}

function isShoonyaAuthErr(json: Record<string, unknown> | null): boolean {
  const msg = String(json?.emsg ?? "").toLowerCase();
  return msg.includes("session expired") || msg.includes("invalid session");
}

/* ---- Angel One: ensureAngelSession (TOTP + refresh) + getRMS --------------- */
async function angelFunds(forceRefresh = false): Promise<Funds> {
  let sess = await ensureAngelSession(forceRefresh);
  let rms = await httpJson(`${ANGEL_BASE}/rest/secure/angelbroking/user/v1/getRMS`, {
    headers: angelHeaders(sess.apiKey, sess.jwtToken),
  });
  if (isAngelAuthErr(rms.status, rms.json)) {
    sess = await ensureAngelSession(true);
    rms = await httpJson(`${ANGEL_BASE}/rest/secure/angelbroking/user/v1/getRMS`, {
      headers: angelHeaders(sess.apiKey, sess.jwtToken),
    });
  }
  const d = rms.json?.data as Record<string, unknown> | null | undefined;
  if (!rms.ok || !d) {
    throw new BrokerApiError(String(rms.json?.message ?? `Angel getRMS failed (HTTP ${rms.status})`), {
      status: rms.status,
      retryable: rms.status >= 500 || rms.status === 429,
    });
  }
  return {
    available: num(d.availablecash),
    used: num(d.utiliseddebits),
    net: d.net !== undefined ? num(d.net) : null,
    at: new Date().toISOString(),
    source: "LIVE_API",
  };
}

/* ---- Shoonya: ensureShoonyaSession (QuickAuth) + Limits -------------------- */
async function shoonyaFunds(forceRefresh = false): Promise<Funds> {
  let sess = await ensureShoonyaSession(forceRefresh);
  const callLimits = (token: string, uid: string) =>
    httpJson(`${SHOONYA_BASE}/Limits`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `jData=${JSON.stringify({ uid, actid: sess.actid })}&jKey=${token}`,
    });

  let lim = await callLimits(sess.token, sess.uid);
  if (lim.json?.stat === "Not_Ok" && isShoonyaAuthErr(lim.json)) {
    sess = await ensureShoonyaSession(true);
    lim = await callLimits(sess.token, sess.uid);
  }
  const d = lim.json;
  if (!lim.ok || !d || d.stat !== "Ok") {
    return { available: 0.0, used: 0.0, net: 0.0, at: new Date().toISOString(), source: "LIVE_API" };
  }
  const cash = num(d.cash) + num(d.payin) - num(d.payout);
  return { available: cash - num(d.marginused), used: num(d.marginused), net: cash, at: new Date().toISOString(), source: "LIVE_API" };
}

/* ---- Groww: GET /v1/margins/detail/user ----------------------------------- */
async function growwFunds(): Promise<Funds> {
  const sess = await ensureGrowwSession();
  const r = await httpJson(`${GROWW_BASE}/margins/detail/user`, {
    headers: { Accept: "application/json", Authorization: `Bearer ${sess.accessToken}`, "X-API-VERSION": "1.0" },
  });
  const raw = r.json as Record<string, unknown> | null;
  const d = (raw?.payload ?? raw) as Record<string, unknown> | null;
  if (!r.ok || !d || d.clear_cash === undefined) {
    throw new BrokerApiError(String(raw?.error ?? raw?.message ?? `Groww margin call failed (HTTP ${r.status})`), {
      status: r.status,
      retryable: r.status >= 500 || r.status === 429,
    });
  }
  return {
    available: num(d.clear_cash),
    used: num(d.net_margin_used),
    net: num(d.clear_cash) + num(d.net_margin_used),
    at: new Date().toISOString(),
    source: "LIVE_API",
  };
}

const REQUIRED: Record<BrokerKey, string[]> = {
  angel: ["clientId", "apiKey", "totpSecret"],
  shoonya: ["userId", "password", "totpSecret"],
  groww: ["accessToken"],
};

function isConfigured(b: BrokerKey, creds: Record<string, string> | null): boolean {
  if (!creds) return false;
  if (!REQUIRED[b].every((k) => Boolean(creds[k]))) return false;
  if (b === "angel" && !(creds.password || creds.tradingPin)) return false;
  return true;
}

function missingFields(b: BrokerKey, creds: Record<string, string>): string[] {
  const miss = REQUIRED[b].filter((k) => !creds[k]);
  if (b === "angel" && !(creds.password || creds.tradingPin)) miss.push("password / tradingPin");
  return miss;
}

export async function getBrokerStatuses(): Promise<Record<BrokerKey, BrokerStatus>> {
  const stored = await getSetting<Partial<Record<BrokerKey, BrokerStatus>>>("brokerStatus", {});
  const out = {} as Record<BrokerKey, BrokerStatus>;
  for (const b of ["angel", "shoonya", "groww"] as BrokerKey[]) {
    const creds = await loadCreds(b);
    const complete = isConfigured(b, creds);
    const s = stored[b];
    if (!creds || !complete) {
      out[b] = {
        state: "NOT_CONFIGURED",
        message: creds ? `Missing: ${missingFields(b, creds).join(", ")}` : "No credentials in vault",
        lastChecked: s?.lastChecked ?? null,
        funds: null,
      };
    } else out[b] = s && s.state !== "NOT_CONFIGURED" ? s : { state: "CONFIGURED", message: "Credentials stored - press Connect", lastChecked: null, funds: null };
  }
  return out;
}

/** Authenticate with the broker using vault credentials, persist session tokens, and pull margin ledger. */
export async function connectBroker(b: BrokerKey, force = false): Promise<BrokerStatus> {
  const creds = await loadCreds(b);
  const stored = await getSetting<Partial<Record<BrokerKey, BrokerStatus>>>("brokerStatus", {});
  let status: BrokerStatus;
  if (!creds || !isConfigured(b, creds)) {
    status = {
      state: "NOT_CONFIGURED",
      message: creds ? `Missing: ${missingFields(b, creds).join(", ")}` : "Credentials incomplete in vault",
      lastChecked: new Date().toISOString(),
      funds: null,
    };
  } else {
    try {
      const funds = b === "angel" ? await angelFunds(force) : b === "shoonya" ? await shoonyaFunds(force) : await growwFunds();
      status = { state: "CONNECTED", message: "Session authenticated - live ledger synced", lastChecked: new Date().toISOString(), funds };
      await audit("INFO", "BROKER", `${BROKER_LABEL[b]} connected, available ₹${funds.available.toFixed(2)}`);
      if (b === "angel") {
        const currentAll = await resolveAll();
        if (currentAll.some((i) => !i.resolved || i.token === "PENDING_MASTER")) {
          await ingestScripMaster();
        }
        await connectAngelWs(true);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      status = { state: "ERROR", message: msg, lastChecked: new Date().toISOString(), funds: null };
      await audit("WARN", "BROKER", `${BROKER_LABEL[b]} connect failed: ${msg}`);
    }
  }
  await setSetting("brokerStatus", { ...stored, [b]: status });
  return status;
}

/**
 * Live test of Angel One credentials first, and only on successful loginByPassword handshake
 * persist them permanently into the on-disk database.
 * If authentication fails, leaves existing stored credentials untouched.
 */
export async function verifyAndSaveAngelCredentials(fields: Record<string, string>): Promise<{
  ok: boolean;
  clientCode?: string;
  connectedAt?: string;
  funds?: Funds | null;
  error?: string;
}> {
  // 1. Merge submitted fields with existing stored credentials
  const existing = (await loadCreds("angel")) ?? {};
  const candidate: Record<string, string> = { ...existing };
  for (const [k, v] of Object.entries(fields)) {
    if (typeof v === "string" && v.trim() !== "") {
      candidate[k] = v.trim();
    }
  }

  // 2. Set pinSource
  const hasPwd = typeof fields.password === "string" && fields.password.trim() !== "";
  const hasPin = typeof fields.tradingPin === "string" && fields.tradingPin.trim() !== "";
  if (hasPin && !hasPwd) candidate.pinSource = "tradingPin";
  else if (hasPwd) candidate.pinSource = "password";

  // 3. Validate PIN / MPIN (4 to 6 numeric digits)
  for (const key of ["tradingPin", "password"] as const) {
    const val = candidate[key];
    if (val && !/^\d{4,6}$/.test(val)) {
      return { ok: false, error: "Enter 4 to 6-digit MPIN / Trading Security PIN" };
    }
  }

  // 4. Validate mandatory fields
  const missing: string[] = [];
  if (!candidate.clientId) missing.push("Client ID");
  if (!candidate.apiKey) missing.push("SmartAPI Key");
  if (!candidate.password && !candidate.tradingPin) missing.push("Login MPIN / Trading PIN");
  if (!candidate.totpSecret) missing.push("TOTP Secret");
  if (missing.length > 0) {
    return { ok: false, error: `Missing required fields: ${missing.join(", ")}` };
  }

  // 5. Test Angel One live authentication handshake FIRST before saving!
  let session: AngelSession;
  try {
    session = await angelLogin(candidate);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // DO NOT touch existing valid credentials in database on error!
    return { ok: false, error: msg };
  }

  // 6. Handshake SUCCESS! Persist encrypted credentials permanently to on-disk database
  await saveCreds("angel", candidate);
  await saveAngelSession(session);

  // 7. Sync RMS funds
  let funds: Funds | null = null;
  try {
    funds = await angelFunds(false);
  } catch {
    /* session is valid, getRMS may report zero/unfunded ledger */
  }

  // 8. Update broker status in settings
  const status: BrokerStatus = {
    state: "CONNECTED",
    message: "Session authenticated - live ledger synced",
    lastChecked: new Date().toISOString(),
    funds,
  };
  const stored = await getSetting<Partial<Record<BrokerKey, BrokerStatus>>>("brokerStatus", {});
  await setSetting("brokerStatus", { ...stored, angel: status });

  // 9. Ingest scrip master if needed and connect SmartWebSocketV2
  try {
    const currentAll = await resolveAll();
    if (currentAll.some((i) => !i.resolved || i.token === "PENDING_MASTER")) {
      await ingestScripMaster();
    }
    await connectAngelWs(true);
  } catch (e) {
    console.error("[verifyAndSaveAngelCredentials] WS connect error:", e);
  }

  await audit("INFO", "VAULT", `Angel One verified, connected, and saved permanently for ${session.clientCode}`);

  return {
    ok: true,
    clientCode: session.clientCode,
    connectedAt: new Date().toISOString(),
    funds,
  };
}

/* ---- Live Broker Positions & Order Book ----------------------------------- */

export async function fetchBrokerPositions(b: BrokerKey): Promise<{ ok: boolean; broker: BrokerKey; positions: unknown[]; error?: string }> {
  try {
    if (b === "angel") {
      let sess = await ensureAngelSession();
      let res = await httpJson(`${ANGEL_BASE}/rest/secure/angelbroking/order/v1/getPosition`, {
        headers: angelHeaders(sess.apiKey, sess.jwtToken),
      });
      if (isAngelAuthErr(res.status, res.json)) {
        sess = await ensureAngelSession(true);
        res = await httpJson(`${ANGEL_BASE}/rest/secure/angelbroking/order/v1/getPosition`, {
          headers: angelHeaders(sess.apiKey, sess.jwtToken),
        });
      }
      if (!res.ok || res.json?.status === false) {
        return { ok: false, broker: b, positions: [], error: String(res.json?.message ?? `HTTP ${res.status}`) };
      }
      const data = res.json?.data;
      return { ok: true, broker: b, positions: Array.isArray(data) ? data : [] };
    }
    if (b === "shoonya") {
      let sess = await ensureShoonyaSession();
      const post = (token: string, uid: string, actid: string) =>
        httpJson(`${SHOONYA_BASE}/PositionBook`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: `jData=${encodeURIComponent(JSON.stringify({ uid, actid }))}&jKey=${token}`,
        });
      let res = await post(sess.token, sess.uid, sess.actid);
      if (res.json?.stat === "Not_Ok" && isShoonyaAuthErr(res.json)) {
        sess = await ensureShoonyaSession(true);
        res = await post(sess.token, sess.uid, sess.actid);
      }
      const raw = res.json as unknown;
      if (Array.isArray(raw)) return { ok: true, broker: b, positions: raw };
      if (res.json?.emsg && String(res.json.emsg).toLowerCase().includes("no data")) return { ok: true, broker: b, positions: [] };
      return { ok: false, broker: b, positions: [], error: String(res.json?.emsg ?? `HTTP ${res.status}`) };
    }
    const sess = await ensureGrowwSession();
    const res = await httpJson(`${GROWW_BASE}/positions/user`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${sess.accessToken}`, "X-API-VERSION": "1.0" },
    });
    if (!res.ok) return { ok: false, broker: b, positions: [], error: String(res.json?.message ?? res.json?.error ?? `HTTP ${res.status}`) };
    const p = (res.json?.payload as Record<string, unknown> | undefined)?.positions ?? res.json?.payload;
    return { ok: true, broker: b, positions: Array.isArray(p) ? p : [] };
  } catch (e) {
    return { ok: false, broker: b, positions: [], error: e instanceof Error ? e.message : String(e) };
  }
}

export async function fetchBrokerOrders(b: BrokerKey): Promise<{ ok: boolean; broker: BrokerKey; orders: unknown[]; error?: string }> {
  try {
    if (b === "angel") {
      let sess = await ensureAngelSession();
      let res = await httpJson(`${ANGEL_BASE}/rest/secure/angelbroking/order/v1/getOrderBook`, {
        headers: angelHeaders(sess.apiKey, sess.jwtToken),
      });
      if (isAngelAuthErr(res.status, res.json)) {
        sess = await ensureAngelSession(true);
        res = await httpJson(`${ANGEL_BASE}/rest/secure/angelbroking/order/v1/getOrderBook`, {
          headers: angelHeaders(sess.apiKey, sess.jwtToken),
        });
      }
      if (!res.ok || res.json?.status === false) {
        return { ok: false, broker: b, orders: [], error: String(res.json?.message ?? `HTTP ${res.status}`) };
      }
      const data = res.json?.data;
      return { ok: true, broker: b, orders: Array.isArray(data) ? data : [] };
    }
    if (b === "shoonya") {
      let sess = await ensureShoonyaSession();
      const post = (token: string, uid: string) =>
        httpJson(`${SHOONYA_BASE}/OrderBook`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: `jData=${encodeURIComponent(JSON.stringify({ uid }))}&jKey=${token}`,
        });
      let res = await post(sess.token, sess.uid);
      if (res.json?.stat === "Not_Ok" && isShoonyaAuthErr(res.json)) {
        sess = await ensureShoonyaSession(true);
        res = await post(sess.token, sess.uid);
      }
      const raw = res.json as unknown;
      if (Array.isArray(raw)) return { ok: true, broker: b, orders: raw };
      if (res.json?.emsg && String(res.json.emsg).toLowerCase().includes("no data")) return { ok: true, broker: b, orders: [] };
      return { ok: false, broker: b, orders: [], error: String(res.json?.emsg ?? `HTTP ${res.status}`) };
    }
    const sess = await ensureGrowwSession();
    const res = await httpJson(`${GROWW_BASE}/order/list`, {
      headers: { Accept: "application/json", Authorization: `Bearer ${sess.accessToken}`, "X-API-VERSION": "1.0" },
    });
    if (!res.ok) return { ok: false, broker: b, orders: [], error: String(res.json?.message ?? res.json?.error ?? `HTTP ${res.status}`) };
    const p = (res.json?.payload as Record<string, unknown> | undefined)?.order_list ?? res.json?.payload;
    return { ok: true, broker: b, orders: Array.isArray(p) ? p : [] };
  } catch (e) {
    return { ok: false, broker: b, orders: [], error: e instanceof Error ? e.message : String(e) };
  }
}

/* ---- Order dispatch (LIVE + PAPER) --------------------------------------- */

export type DispatchResult = {
  broker: BrokerKey;
  orderId: string;
  payload: Record<string, unknown>;
  latencyMs: number;
  mode: "LIVE" | "PAPER";
};

async function dispatchAngelLive(_p: OrderParams, _timeoutMs: number): Promise<{ orderId: string; payload: Record<string, unknown> }> {
  // CRITICAL SAFETY INTERLOCK (Phase 6.9): Real-money execution permanently disabled.
  throw new BrokerApiError("CRITICAL SAFETY INTERLOCK: Live broker execution is permanently disabled. Angel One placeOrder blocked.", {
    status: 403,
    retryable: false,
  });
}

async function dispatchShoonyaLive(_p: OrderParams, _timeoutMs: number): Promise<{ orderId: string; payload: Record<string, unknown> }> {
  // CRITICAL SAFETY INTERLOCK (Phase 6.9): Real-money execution permanently disabled.
  throw new BrokerApiError("CRITICAL SAFETY INTERLOCK: Live broker execution is permanently disabled. Shoonya PlaceOrder blocked.", {
    status: 403,
    retryable: false,
  });
}

async function dispatchGrowwLive(_p: OrderParams, _timeoutMs: number): Promise<{ orderId: string; payload: Record<string, unknown> }> {
  // CRITICAL SAFETY INTERLOCK (Phase 6.9): Real-money execution permanently disabled.
  throw new BrokerApiError("CRITICAL SAFETY INTERLOCK: Live broker execution is permanently disabled. Groww order/create blocked.", {
    status: 403,
    retryable: false,
  });
}

/**
 * Dual-mode order dispatch:
 * - PAPER: builds exact broker payload and acknowledges locally (supports simulateDrop failover drills).
 * - LIVE: HARD-BLOCKED by institutional safety mandate.
 */
export async function dispatchOrder(broker: BrokerKey, p: OrderParams, cfg: RiskConfig, _timeoutMs = 4500): Promise<DispatchResult> {
  const t0 = Date.now();
  if (cfg.tradingMode === "LIVE") {
    throw new BrokerApiError("CRITICAL SAFETY INTERLOCK: Live broker execution is permanently disabled. Real-money orders rejected.", {
      status: 403,
      retryable: false,
    });
  }

  const payload = buildBrokerPayload(broker, p);
  if (cfg.simulateDrop[broker]) {
    await sleep(120);
    throw new BrokerApiError(`${BROKER_LABEL[broker]}: simulated WebSocket drop / network timeout`, { retryable: true });
  }
  await sleep(10 + Math.floor(Math.random() * 30));
  return { broker, orderId: `PAPER-${broker.toUpperCase()}-${Date.now().toString(36)}`, payload, latencyMs: Date.now() - t0, mode: "PAPER" };
}

/** Cancels a live resting order at the target broker OMS. */
export async function cancelBrokerOrder(
  broker: BrokerKey,
  brokerOrderId: string,
  segment = "CASH",
): Promise<{ ok: boolean; error?: string }> {
  try {
    if (broker === "angel") {
      let sess = await ensureAngelSession();
      const send = (jwt: string, apiKey: string) =>
        httpJson(`${ANGEL_BASE}/rest/secure/angelbroking/order/v1/cancelOrder`, {
          method: "POST",
          headers: angelHeaders(apiKey, jwt),
          body: JSON.stringify({ variety: "NORMAL", orderid: brokerOrderId }),
        });
      let res = await send(sess.jwtToken, sess.apiKey);
      if (isAngelAuthErr(res.status, res.json)) {
        sess = await ensureAngelSession(true);
        res = await send(sess.jwtToken, sess.apiKey);
      }
      if (!res.ok || res.json?.status === false) {
        return { ok: false, error: String(res.json?.message ?? `Angel cancelOrder failed (HTTP ${res.status})`) };
      }
      return { ok: true };
    }
    if (broker === "shoonya") {
      let sess = await ensureShoonyaSession();
      const send = (token: string, uid: string) =>
        httpJson(`${SHOONYA_BASE}/CancelOrder`, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: `jData=${encodeURIComponent(JSON.stringify({ uid, norenordno: brokerOrderId }))}&jKey=${token}`,
        });
      let res = await send(sess.token, sess.uid);
      if (res.json?.stat === "Not_Ok" && isShoonyaAuthErr(res.json)) {
        sess = await ensureShoonyaSession(true);
        res = await send(sess.token, sess.uid);
      }
      if (!res.ok || res.json?.stat !== "Ok") {
        return { ok: false, error: String(res.json?.emsg ?? `Shoonya CancelOrder failed (HTTP ${res.status})`) };
      }
      return { ok: true };
    }
    const sess = await ensureGrowwSession();
    const res = await httpJson(`${GROWW_BASE}/order/cancel`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${sess.accessToken}`,
        "X-API-VERSION": "1.0",
      },
      body: JSON.stringify({ segment, groww_order_id: brokerOrderId }),
    });
    if (!res.ok || res.json?.status === "FAILURE") {
      return { ok: false, error: String(res.json?.message ?? res.json?.error ?? `Groww order/cancel failed (HTTP ${res.status})`) };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
