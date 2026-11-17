import { BROKER_LABEL, dispatchOrder, type DispatchResult } from "./brokers";
import type { BrokerKey, OrderParams } from "./instruments";
import { sendAlert } from "./notifier";
import type { RiskConfig } from "./risk";
import { BrokerApiError } from "./sessions";
import { audit, getSetting, setSetting } from "./settings";

export const ATTEMPT_TIMEOUT_MS = 5_000;
const MAX_RETRIES = 2;

export type RouteResult = {
  ok: boolean;
  result?: DispatchResult;
  requested: BrokerKey;
  used?: BrokerKey;
  failover: boolean;
  failoverMs: number;
  attempts: { broker: BrokerKey; ok: boolean; error?: string; ms: number }[];
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function withTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(
      () => reject(new BrokerApiError(`${label}: order placement timeout (${ms}ms)`, { status: 408, retryable: true })),
      ms,
    );
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

export function brokerChain(cfg: RiskConfig, override?: BrokerKey): BrokerKey[] {
  const primary: BrokerKey = override ?? cfg.primaryBroker;
  const base: BrokerKey[] = [primary, "shoonya", "angel", "groww"];
  return base.filter((b, i) => base.indexOf(b) === i);
}

async function bumpFailure(b: BrokerKey, failed: boolean) {
  const counts = await getSetting<Record<string, number>>("brokerFailures", {});
  counts[b] = failed ? (counts[b] ?? 0) + 1 : 0;
  await setSetting("brokerFailures", counts);
  if (failed && counts[b] >= 3 && counts[b] % 3 === 0) {
    await sendAlert(
      `SESSION_DROP_${b}`,
      `Broker session dropped ${counts[b]}x consecutively: ${BROKER_LABEL[b]}`,
      `<p>${BROKER_LABEL[b]} failed ${counts[b]} consecutive order/session attempts. Orders are being routed to the secondary broker.</p>`,
    );
  }
}

async function dispatchWithBackoff(broker: BrokerKey, p: OrderParams, cfg: RiskConfig): Promise<DispatchResult> {
  let lastErr: unknown;
  // In PAPER failover drill mode, fail cleanly without retrying simulated drops
  const retries = cfg.tradingMode === "LIVE" ? MAX_RETRIES : 0;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await withTimeout(dispatchOrder(broker, p, cfg, ATTEMPT_TIMEOUT_MS), ATTEMPT_TIMEOUT_MS, BROKER_LABEL[broker]);
    } catch (e) {
      lastErr = e;
      const retryable = e instanceof BrokerApiError ? e.retryable : false;
      if (!retryable || attempt >= retries) throw e;
      const backoffMs = 200 * 2 ** attempt; // 200ms, 400ms
      await sleep(backoffMs);
    }
  }
  throw lastErr;
}

/**
 * Intelligent 3-broker failover router (5000ms attempt timeout + exponential backoff).
 * Tries the primary broker first; on transient timeout/5xx retries with backoff,
 * and on persistent failure hops immediately to the next broker in the priority chain.
 */
export async function routeOrder(p: OrderParams, cfg: RiskConfig, override?: BrokerKey): Promise<RouteResult> {
  const chain = brokerChain(cfg, override);

  // CRITICAL SAFETY INTERLOCK (Phase 6.9): Block live order routing under every configuration
  if (cfg.tradingMode === "LIVE") {
    await audit("CRITICAL", "SAFETY_INTERLOCK", "BLOCKED: Attempt to route order with tradingMode=LIVE", {
      symbol: p.inst.symbol,
      side: p.side,
      qty: p.qty,
    });
    return {
      ok: false,
      requested: chain[0],
      failover: false,
      failoverMs: 0,
      attempts: [
        {
          broker: chain[0],
          ok: false,
          error: "CRITICAL SAFETY INTERLOCK: Live broker order routing is permanently disabled.",
          ms: 0,
        },
      ],
    };
  }

  const attempts: RouteResult["attempts"] = [];
  const t0 = Date.now();
  let firstFailAt = 0;

  for (const b of chain) {
    const a0 = Date.now();
    try {
      const result = await dispatchWithBackoff(b, p, cfg);
      attempts.push({ broker: b, ok: true, ms: Date.now() - a0 });
      await bumpFailure(b, false);
      const failover = b !== chain[0];
      const failoverMs = failover ? Date.now() - firstFailAt : 0;
      if (failover) {
        await audit("WARN", "FAILOVER", `Order re-routed ${chain[0]} -> ${b} in ${failoverMs}ms`, {
          attempts,
          symbol: p.inst.symbol,
          failoverMs,
          mode: cfg.tradingMode,
        });
      }
      return { ok: true, result, requested: chain[0], used: b, failover, failoverMs, attempts };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      if (!firstFailAt) firstFailAt = Date.now();
      attempts.push({ broker: b, ok: false, error, ms: Date.now() - a0 });
      await bumpFailure(b, true);
    }
  }
  await audit("ERROR", "FAILOVER", "All brokers failed to accept the order", { attempts, total: Date.now() - t0, mode: cfg.tradingMode });
  return { ok: false, requested: chain[0], failover: false, failoverMs: 0, attempts };
}
