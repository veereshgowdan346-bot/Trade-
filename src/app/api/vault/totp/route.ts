import { NextRequest } from "next/server";
import { authorizeMutation, checkRateLimit } from "@/lib/apiGuard";
import { totp } from "@/lib/totp";
import { loadCreds, type VaultKey } from "@/lib/vault";

export const dynamic = "force-dynamic";

/** Returns the current rotating code + seconds remaining. The secret never leaves the server. */
export async function GET(req: NextRequest) {
  const denied = checkRateLimit(req, "vault") ?? authorizeMutation(req);
  if (denied) return Response.json(denied.body, { status: denied.status });
  const broker = req.nextUrl.searchParams.get("broker") as VaultKey | null;
  if (!broker || !["angel", "shoonya", "groww"].includes(broker)) return Response.json({ ok: false }, { status: 400 });
  const c = await loadCreds(broker);
  if (!c?.totpSecret) return Response.json({ ok: false, error: "No TOTP secret stored", serverNow: Date.now() });
  try {
    const t = totp(c.totpSecret);
    return Response.json({ ok: true, code: t.code, remaining: t.remaining, serverNow: Date.now() });
  } catch (e) {
    return Response.json({ ok: false, error: e instanceof Error ? e.message : "TOTP error", serverNow: Date.now() });
  }
}
