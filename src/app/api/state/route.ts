import { getState } from "@/lib/engine";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return Response.json(await getState());
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "state failed" }, { status: 500 });
  }
}
