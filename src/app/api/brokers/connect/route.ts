import { NextRequest } from "next/server";
import { authorizeMutation, checkRateLimit } from "@/lib/apiGuard";
import { connectBroker } from "@/lib/brokers";
import type { BrokerKey } from "@/lib/instruments";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const denied = checkRateLimit(req, "write") ?? authorizeMutation(req);
  if (denied) return Response.json(denied.body, { status: denied.status });
  const b = (await req.json().catch(() => ({}))) as { broker?: string; force?: boolean };
  if (!b.broker || !["angel", "shoonya", "groww"].includes(b.broker)) return Response.json({ ok: false }, { status: 400 });
  return Response.json(await connectBroker(b.broker as BrokerKey, Boolean(b.force)));
}
