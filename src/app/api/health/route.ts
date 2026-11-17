import { db } from "@/db";
import { sql } from "drizzle-orm";

import { checkRateLimit } from "@/lib/apiGuard";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const denied = checkRateLimit(req, "read");
  if (denied) return Response.json(denied.body, { status: denied.status });
  try {
    await db.execute(sql`select 1`);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ ok: false }, { status: 500 });
  }
}
