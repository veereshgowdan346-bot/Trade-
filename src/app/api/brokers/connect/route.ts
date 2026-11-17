import { NextRequest } from "next/server";
import { connectBroker } from "@/lib/brokers";
import type { BrokerKey } from "@/lib/instruments";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as { broker?: string; force?: boolean };
  if (!b.broker || !["angel", "shoonya", "groww"].includes(b.broker)) return Response.json({ ok: false }, { status: 400 });
  return Response.json(await connectBroker(b.broker as BrokerKey, Boolean(b.force)));
}
