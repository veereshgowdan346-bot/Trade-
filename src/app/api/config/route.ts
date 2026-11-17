import { NextRequest } from "next/server";
import { authorizeMutation, checkRateLimit } from "@/lib/apiGuard";
import { audit, getRisk, saveRisk } from "@/lib/settings";
import type { RiskConfig } from "@/lib/risk";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = checkRateLimit(req, "read");
  if (denied) return Response.json(denied.body, { status: denied.status });
  return Response.json(await getRisk());
}

export async function POST(req: NextRequest) {
  const denied = checkRateLimit(req, "write") ?? authorizeMutation(req);
  if (denied) return Response.json(denied.body, { status: denied.status });
  const body = (await req.json().catch(() => ({}))) as Partial<RiskConfig>;
  if (body.tradingMode === "LIVE") {
    await audit("WARN", "SAFETY_INTERLOCK", "Blocked attempt to configure tradingMode=LIVE. Live broker execution is permanently disabled.");
  }
  const allowed: (keyof RiskConfig)[] = [
    "tradingMode", "capital", "riskPct", "drawdownFloor", "hurdle", "rewardRisk", "leverage",
    "quorumPct", "gbmMin", "maxOpenPositions", "enforceSessions", "autoTrade",
    "primaryBroker", "secondaryBroker", "tertiaryBroker", "simulateDrop", "webhookSecret",
  ];
  const patch: Record<string, unknown> = {};
  for (const k of allowed) if (k in body) patch[k] = body[k];
  const next = await saveRisk(patch as Partial<RiskConfig>);
  await audit("INFO", "CONFIG", `Risk / routing configuration saved (mode: ${next.tradingMode})`, {
    tradingMode: next.tradingMode,
    capital: next.capital,
    maxSL: next.maxSL,
    floor: next.drawdownFloor,
    primary: next.primaryBroker,
  });
  return Response.json(next);
}
