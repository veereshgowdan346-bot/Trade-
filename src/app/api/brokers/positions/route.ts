import { NextRequest } from "next/server";
import { fetchBrokerOrders, fetchBrokerPositions } from "@/lib/brokers";
import type { BrokerKey } from "@/lib/instruments";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
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

