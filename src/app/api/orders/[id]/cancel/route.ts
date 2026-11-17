import { authorizeMutation, checkRateLimit } from "@/lib/apiGuard";
import { cancelOrder } from "@/lib/engine";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const denied = checkRateLimit(req, "write") ?? authorizeMutation(req);
  if (denied) return Response.json(denied.body, { status: denied.status });
  const { id } = await ctx.params;
  const res = await cancelOrder(Number(id));
  return Response.json(res, { status: res.ok ? 200 : 400 });
}

