import { eq } from "drizzle-orm";
import { db } from "@/db";
import { positions } from "@/db/schema";
import { authorizeMutation, checkRateLimit } from "@/lib/apiGuard";
import { checkCircuit, closePosition } from "@/lib/engine";
import { ltpOf } from "@/lib/market";
import { resolveInstrument } from "@/lib/tokenMaster";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = checkRateLimit(req, "write") ?? authorizeMutation(req);
  if (denied) return Response.json(denied.body, { status: denied.status });
  const { id } = await ctx.params;
  const rows = await db.select().from(positions).where(eq(positions.id, Number(id)));
  const p = rows[0];
  if (!p || p.status !== "OPEN") return Response.json({ ok: false, reason: "Position not open" }, { status: 404 });
  const inst = await resolveInstrument(p.symbol);
  if (!inst) return Response.json({ ok: false, reason: "Unknown instrument" }, { status: 400 });
  const exitPrice = ltpOf(inst) ?? p.entryPrice;
  const net = await closePosition(p, exitPrice, "MANUAL_SQUARE_OFF");
  if (net === null) return Response.json({ ok: false, reason: "Exit order failed — inspect audit log" }, { status: 502 });
  await checkCircuit();
  return Response.json({ ok: true, net });
}
