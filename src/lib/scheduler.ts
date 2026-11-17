import { connectAngelWs, getWsStatus, registerTickListener } from "./angelWs";
import { checkBrackets, checkCircuit, enforceDailyReset, getCircuit, processLiveTick, scanAndTrade, sessionStatus, squareOffAll } from "./engine";
import { sendEodAudit } from "./notifier";
import { proactiveSessionRefresh } from "./sessions";
import { audit, getRisk, getSetting, istParts, setSetting } from "./settings";
import { discoverPlugins } from "./strategies";
import { ingestScripMaster } from "./tokenMaster";
import { loadCreds } from "./vault";

export const AUTOTRADER_INTERVAL_MS = 5_000;

export type AutoTraderStatus = {
  daemonRunning: boolean;
  intervalMs: number;
  lastTickAt: number | null;
  lastScanAt: number | null;
  lastScanCount: number;
  lastFiredCount: number;
  lastError: string | null;
};

type G = typeof globalThis & {
  __omniScheduler?: NodeJS.Timeout;
  __omniBusy?: boolean;
  __omniLastScan?: number;
  __omniWsHooked?: boolean;
  __omniAutoStats?: AutoTraderStatus;
};

function stats(): AutoTraderStatus {
  const g = globalThis as G;
  if (!g.__omniAutoStats) {
    g.__omniAutoStats = {
      daemonRunning: Boolean(g.__omniScheduler),
      intervalMs: AUTOTRADER_INTERVAL_MS,
      lastTickAt: null,
      lastScanAt: null,
      lastScanCount: 0,
      lastFiredCount: 0,
      lastError: null,
    };
  }
  return g.__omniAutoStats;
}

export function getAutoTraderStatus(): AutoTraderStatus {
  const s = stats();
  s.daemonRunning = Boolean((globalThis as G).__omniScheduler);
  return { ...s };
}

async function once(name: string, date: string, fn: () => Promise<void>) {
  const marks = await getSetting<Record<string, string>>("schedMarks", {});
  if (marks[name] === date) return;
  marks[name] = date;
  await setSetting("schedMarks", marks);
  await fn();
}

/**
 * Dual-session automation + 5-second autonomous auto-trading daemon (IST):
 *  08:45 scrip master · 15:10 warn / 15:15 MIS square-off / 15:35 EOD audit (Equity+NFO)
 *  23:10 warn / 23:15 MIS square-off / 23:25 EOD audit (MCX)
 *  Every 5s: proactive token refresh, WebSocket auto-connect, bracket SL/TP check,
 *  daily loss circuit check, and autonomous consensus scan-and-execute when autoTrade is ON.
 */
export async function schedulerTick() {
  const g = globalThis as G;
  if (g.__omniBusy) return;
  g.__omniBusy = true;
  const st = stats();
  try {
    st.lastTickAt = Date.now();
    const p = istParts();
    const m = p.minutes;
    const weekday = p.dow >= 1 && p.dow <= 5;
    const inWin = (t: number, span = 45) => m >= t && m < t + span;

    if (weekday) {
      if (inWin(8 * 60 + 45, 60)) await once("scrip", p.date, async () => void (await ingestScripMaster()));
      if (inWin(15 * 60 + 10, 5)) await once("eq-warn", p.date, () => audit("WARN", "SESSION", "Equity/NFO MIS square-off in 5 minutes (15:15 IST)"));
      if (inWin(15 * 60 + 15, 15)) await once("eq-sq", p.date, async () => void (await squareOffAll("MIS_SQUARE_OFF_1515", "EQUITY")));
      if (inWin(15 * 60 + 35, 60)) await once("eq-eod", p.date, async () => void (await sendEodAudit("EQUITY")));
      if (inWin(23 * 60 + 10, 5)) await once("mcx-warn", p.date, () => audit("WARN", "SESSION", "MCX MIS square-off in 5 minutes (23:15 IST)"));
      if (inWin(23 * 60 + 15, 10)) await once("mcx-sq", p.date, async () => void (await squareOffAll("MIS_SQUARE_OFF_2315", "MCX")));
      if (inWin(23 * 60 + 25, 34)) await once("mcx-eod", p.date, async () => void (await sendEodAudit("MCX")));
    }

    await proactiveSessionRefresh();
    await enforceDailyReset();

    const ws = getWsStatus();
    if (!ws.connected && !ws.connecting) {
      const angel = await loadCreds("angel");
      if (angel?.clientId && (angel.password || angel.tradingPin) && angel.apiKey && angel.totpSecret) {
        void connectAngelWs();
      }
    }

    await checkBrackets();
    const cfg = await getRisk();
    await checkCircuit(cfg);

    if (cfg.autoTrade && !(await getCircuit()).tripped && Date.now() - (g.__omniLastScan ?? 0) >= AUTOTRADER_INTERVAL_MS - 250) {
      const ss = sessionStatus();
      if (!cfg.enforceSessions || ss.equityOpen || ss.mcxOpen) {
        g.__omniLastScan = Date.now();
        const res = await scanAndTrade();
        st.lastScanAt = Date.now();
        st.lastScanCount = res.scanned;
        st.lastFiredCount = res.fired;
        st.lastError = null;
      }
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    st.lastError = msg;
    console.error("[scheduler]", msg);
  } finally {
    g.__omniBusy = false;
  }
}

export async function autoConnectOnBoot(): Promise<void> {
  const g = globalThis as G & { __omniBooted?: boolean };
  if (g.__omniBooted) return;
  g.__omniBooted = true;
  try {
    const creds = await loadCreds("angel");
    if (creds?.clientId && (creds.password || creds.tradingPin) && creds.apiKey && creds.totpSecret) {
      console.log(`[boot] Found stored Angel One credentials for ${creds.clientId} - authenticating 24h session...`);
      const { connectBroker } = await import("./brokers");
      const status = await connectBroker("angel", false);
      if (status.state === "CONNECTED") {
        console.log(`[boot] ✓ Angel One auto-login active & connected (Available: ₹${status.funds?.available?.toFixed(2) ?? "0.00"})`);
      } else {
        console.warn(`[boot] Angel One auto-login attempt: ${status.state} - ${status.message}`);
      }
    } else {
      console.log(`[boot] No Angel One credentials in vault - waiting for user configuration.`);
    }
  } catch (e) {
    console.error(`[boot] Angel One auto-connect error:`, e instanceof Error ? e.message : String(e));
  }
}

export function startScheduler() {
  const g = globalThis as G;
  if (!g.__omniWsHooked) {
    g.__omniWsHooked = true;
    registerTickListener((symbol, ltp) => {
      void processLiveTick(symbol, ltp);
    });
    void discoverPlugins(true);
  }
  if (g.__omniScheduler) return;
  g.__omniScheduler = setInterval(() => void schedulerTick(), AUTOTRADER_INTERVAL_MS);
  stats().daemonRunning = true;
  void autoConnectOnBoot();
  setTimeout(() => void schedulerTick(), 1500);
  console.log(`[scheduler] OmniTradePro IST scheduler & ${AUTOTRADER_INTERVAL_MS / 1000}s auto-trader daemon started`);
}
