import { getWsStatus } from "@/lib/angelWs";
import { analyse } from "@/lib/engine";
import { marketFeedMode, marketStatusText, snapshot } from "@/lib/market";
import { getRisk } from "@/lib/settings";
import { resolveAll } from "@/lib/tokenMaster";

export const dynamic = "force-dynamic";

export async function GET() {
  const cfg = await getRisk();
  const now = Date.now();
  const rows = [];
  for (const inst of await resolveAll()) {
    const s = snapshot(inst, 200);
    const cons = await analyse(inst, cfg);
    rows.push({
      symbol: inst.symbol,
      name: inst.name,
      exchange: inst.exchange,
      lotSize: inst.lotSize,
      ltp: s.ltp,
      change: s.change,
      changePct: s.changePct,
      high: s.high,
      low: s.low,
      volume: s.volume,
      regime: cons.regime.regime,
      adx: cons.regime.adx,
      direction: cons.direction,
      quorum: cons.quorumPct,
      gbm: cons.gbm.forDirection,
      qualifies: cons.qualifies,
      source: s.source,
    });
  }
  return Response.json({
    now,
    rows,
    feed: marketFeedMode(),
    feedStatus: marketStatusText(),
    ws: getWsStatus(),
  });
}
