import { getState } from "@/lib/engine";

import { checkRateLimit } from "@/lib/apiGuard";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = checkRateLimit(req, "read");
  if (denied) return Response.json(denied.body, { status: denied.status });
  try {
    return Response.json(await getState());
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "state failed" }, { status: 500 });
  }
}
