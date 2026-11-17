import { cancelOrder } from "@/lib/engine";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const res = await cancelOrder(Number(id));
  return Response.json(res, { status: res.ok ? 200 : 400 });
}

