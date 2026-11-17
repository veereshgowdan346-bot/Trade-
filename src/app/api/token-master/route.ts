import { INSTRUMENTS } from "@/lib/instruments";
import { getSetting } from "@/lib/settings";
import { ingestScripMaster, resolveAll } from "@/lib/tokenMaster";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET() {
  const all = await resolveAll();
  return Response.json({
    last: await getSetting("tokenMaster", null),
    total: INSTRUMENTS.length,
    rows: all.map((i) => ({ symbol: i.symbol, exchange: i.exchange, tradingSymbol: i.tradingSymbol, token: i.token, lotSize: i.lotSize, resolved: i.resolved })),
  });
}

export async function POST() {
  return Response.json(await ingestScripMaster());
}
