import { NextRequest } from "next/server";
import { authorizeMutation, checkRateLimit } from "@/lib/apiGuard";
import { preflight, resetCircuit, scanAndTrade, squareOffAll } from "@/lib/engine";
import { discoverPlugins } from "@/lib/strategies";
import { audit } from "@/lib/settings";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const denied = checkRateLimit(req, "write") ?? authorizeMutation(req);
  if (denied) return Response.json(denied.body, { status: denied.status });
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  switch (b.action) {
    case "scan":
      return Response.json(await scanAndTrade());
    case "preflight":
      return Response.json(await preflight(String(b.symbol ?? "SBIN"), b.side === "SELL" ? "SELL" : "BUY"));
    case "reset-circuit":
      await resetCircuit();
      return Response.json({ ok: true });
    case "squareoff-all":
      return Response.json({ ok: true, closed: await squareOffAll("OPERATOR_SQUARE_OFF_ALL") });
    case "reload-strategies": {
      const found = await discoverPlugins(true);
      await audit("INFO", "STRATEGY_HUB", `Strategy plugins reloaded: ${found.length} discovered`, { files: found.map((f) => f.file) });
      return Response.json({ ok: true, count: found.length });
    }
    default:
      return Response.json({ ok: false, error: "unknown action" }, { status: 400 });
  }
}
