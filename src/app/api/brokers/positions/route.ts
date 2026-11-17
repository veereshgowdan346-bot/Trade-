import { NextRequest } from "next/server";
import { fetchBrokerOrders, fetchBrokerPositions } from "@/lib/brokers";
import type { BrokerKey } from "@/lib/instruments";

import { checkRateLimit } from "@/lib/apiGuard";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const denied = checkRateLimit(req, "read");
  if (denied) return Response.json(denied.body, { status: denied.status });
  const param = req.nextUrl.searchParams.get("broker");
  const targets: BrokerKey[] =
    param && ["angel", "shoonya", "groww"].includes(param) ? [param as BrokerKey] : ["angel", "shoonya", "groww"];

  const results = await Promise.all(
    targets.map(async (b) => {
      const [pos, ord] = await Promise.all([fetchBrokerPositions(b), fetchBrokerOrders(b)]);
      return { broker: b, positions: pos, orders: ord };
    }),
  );
  return Response.json({ ok: true, brokers: results });
}

