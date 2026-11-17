import { NextRequest } from "next/server";
import { authorizeMutation, checkRateLimit } from "@/lib/apiGuard";
import { placeOrder } from "@/lib/engine";
import type { BrokerKey } from "@/lib/instruments";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const denied = checkRateLimit(req, "write") ?? authorizeMutation(req);
  if (denied) return Response.json(denied.body, { status: denied.status });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const symbol = String(b.symbol ?? "");
  if (!symbol) return Response.json({ ok: false, reason: "symbol required" }, { status: 400 });

  // Phase 6.9 Safety Interlock: Reject live order requests at API gateway
  if (b.mode === "LIVE" || b.tradingMode === "LIVE") {
    return Response.json(
      { ok: false, status: "REJECTED_LIVE_EXECUTION_BLOCKED", reason: "CRITICAL SAFETY INTERLOCK: Live broker execution is permanently disabled." },
      { status: 403 }
    );
  }
  const side = b.side === "SELL" ? "SELL" : b.side === "BUY" ? "BUY" : undefined;
  const orderType = b.orderType === "LIMIT" ? "LIMIT" : "MARKET";
  const price = b.price ? Number(b.price) : undefined;
  const broker = ["angel", "shoonya", "groww"].includes(String(b.broker)) ? (b.broker as BrokerKey) : undefined;
  const flashTest = Boolean(b.flashTest);
  const out = await placeOrder({
    symbol,
    side,
    qty: b.qty ? Number(b.qty) : undefined,
    orderType,
    price,
    source: flashTest ? "FLASH_TEST" : "MANUAL",
    strategy: b.strategy ? String(b.strategy) : flashTest ? "FLASH_TEST" : "MANUAL",
    broker,
    flashTest,
  });
  return Response.json(out);
}
