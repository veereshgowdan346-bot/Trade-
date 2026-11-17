import { NextRequest } from "next/server";
import { authorizeWebhook, checkRateLimit } from "@/lib/apiGuard";
import { placeOrder } from "@/lib/engine";
import { getInstrument } from "@/lib/instruments";
import { audit, getRisk } from "@/lib/settings";

export const dynamic = "force-dynamic";

function normSymbol(raw: string): string {
  let s = raw.trim().toUpperCase();
  if (s.includes(":")) s = s.split(":").pop() as string;
  return s.replace(/-EQ$/, "").replace(/\d+!$/, "").replace(/\d{2}[A-Z]{3}FUT$/, "");
}

function parseSide(raw: unknown, hint = ""): "BUY" | "SELL" | undefined {
  const s = String(raw ?? "").toLowerCase();
  if (["buy", "long", "bull", "enter_long"].some((k) => s.includes(k))) return "BUY";
  if (["sell", "short", "bear", "exit_long", "enter_short"].some((k) => s.includes(k))) return "SELL";
  const h = hint.toLowerCase();
  if (/short|sell|bear|down/.test(h)) return "SELL";
  return undefined;
}

/**
 * External signal gateway for TradingView PineScript alerts and ChartInk 5-minute scanner
 * payloads. Signals count as the 5th voter inside the Quorum & Risk Gateway and still have to
 * clear regime gate, GBM, sizing, hurdle and circuit breaker.
 */
export async function POST(req: NextRequest) {
  const denied = checkRateLimit(req, "webhook");
  if (denied) return Response.json(denied.body, { status: denied.status });
  const cfg = await getRisk();
  const text = await req.text();
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(text);
  } catch {
    // TradingView sometimes sends plain text alerts such as "BUY RELIANCE"
    const m = /(buy|sell|long|short)\s+([A-Za-z:0-9!-]+)/i.exec(text);
    if (m) body = { action: m[1], symbol: m[2] };
  }
  // SEC-001 (Phase 2): constant-time secret comparison + loopback gating for the
  // no-secret configuration (local TradingView/ChartInk development still works).
  const given = req.headers.get("x-webhook-secret") ?? (body.secret !== undefined ? String(body.secret) : undefined);
  const deniedWebhook = authorizeWebhook(req, given, cfg.webhookSecret || undefined);
  if (deniedWebhook) {
    await audit("WARN", "WEBHOOK", "Webhook rejected: authorization failed", { code: deniedWebhook.body.code });
    return Response.json(deniedWebhook.body, { status: deniedWebhook.status });
  }

  const signals: { symbol: string; side?: "BUY" | "SELL"; strategy: string; origin: string }[] = [];
  if (typeof body.stocks === "string") {
    const scan = String(body.scan_name ?? body.alert_name ?? "ChartInk");
    const side = parseSide(body.action ?? body.side, scan) ?? "BUY";
    for (const s of body.stocks.split(",")) if (s.trim()) signals.push({ symbol: normSymbol(s), side, strategy: `ChartInk:${scan}`.slice(0, 40), origin: "CHARTINK" });
  } else if (body.symbol || body.ticker) {
    const side = parseSide(body.action ?? body.side ?? body.signal ?? body.order_action);
    signals.push({ symbol: normSymbol(String(body.symbol ?? body.ticker)), side, strategy: `TV:${String(body.strategy ?? "PineScript")}`.slice(0, 40), origin: "TRADINGVIEW" });
  }
  if (!signals.length) {
    await audit("WARN", "WEBHOOK", "Webhook payload not recognised", { body });
    return Response.json({ ok: false, error: "unrecognised payload" }, { status: 400 });
  }

  const results = [];
  for (const s of signals) {
    if (!getInstrument(s.symbol)) {
      results.push({ symbol: s.symbol, status: "IGNORED_UNTRACKED", reason: "Symbol not in token master" });
      continue;
    }
    if (!s.side) {
      results.push({ symbol: s.symbol, status: "IGNORED_NO_SIDE", reason: "Could not determine buy/sell" });
      continue;
    }
    const r = await placeOrder({ symbol: s.symbol, side: s.side, source: "WEBHOOK", strategy: s.strategy, externalVote: true });
    results.push({ symbol: s.symbol, status: r.status, reason: r.reason, orderId: r.orderId });
  }
  await audit("INFO", "WEBHOOK", `${signals[0].origin} webhook processed (${signals.length} signal(s))`, { results });
  return Response.json({ ok: true, results });
}

export async function GET(req: NextRequest) {
  const denied = checkRateLimit(req, "read");
  if (denied) return Response.json(denied.body, { status: denied.status });
  return Response.json({ service: "OmniTradePro webhook gateway", endpoint: "/api/v1/webhook", accepts: ["TradingView", "ChartInk"] });
}
