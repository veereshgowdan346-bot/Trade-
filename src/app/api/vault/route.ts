import { NextRequest } from "next/server";
import { stopAngelWs } from "@/lib/angelWs";
import { authorizeMutation, checkRateLimit } from "@/lib/apiGuard";
import { verifyAndSaveAngelCredentials } from "@/lib/brokers";
import type { BrokerKey } from "@/lib/instruments";
import { clearSession } from "@/lib/sessions";
import { audit } from "@/lib/settings";
import { deleteCreds, saveCreds, vaultSummary, VAULT_FIELDS, vaultUsingFallbackKey, type VaultKey } from "@/lib/vault";

export const dynamic = "force-dynamic";

// SEC-001: vault endpoints are sensitive on every method (credential summary + writes),
// so they use the strict "vault" rate class and require mutation authorization even for GET.
function guard(req: NextRequest) {
  return checkRateLimit(req, "vault") ?? authorizeMutation(req);
}

export async function GET(req: NextRequest) {
  const denied = guard(req);
  if (denied) return Response.json(denied.body, { status: denied.status });
  return Response.json({ summary: await vaultSummary(), fields: VAULT_FIELDS, fallbackKey: vaultUsingFallbackKey() });
}

export async function POST(req: NextRequest) {
  const denied = guard(req);
  if (denied) return Response.json(denied.body, { status: denied.status });
  const b = (await req.json().catch(() => ({}))) as {
    broker?: string;
    fields?: Record<string, string>;
    action?: string;
  };
  if (!b.broker || !(b.broker in VAULT_FIELDS)) return Response.json({ ok: false, error: "bad broker" }, { status: 400 });

  const fields = b.fields ?? {};

  // Unified "Verify, Connect & Save Permanently" workflow for Angel One
  if (b.broker === "angel" && b.action === "verify-connect-save") {
    const res = await verifyAndSaveAngelCredentials(fields);
    if (!res.ok) {
      return Response.json({ ok: false, error: res.error }, { status: 400 });
    }
    return Response.json({
      ok: true,
      clientCode: res.clientCode,
      connectedAt: res.connectedAt,
      funds: res.funds,
      summary: await vaultSummary(),
    });
  }

  if (b.broker === "angel") {
    for (const key of ["tradingPin", "password"] as const) {
      const val = fields[key];
      if (typeof val === "string" && val.trim() !== "" && !/^\d{4,6}$/.test(val.trim())) {
        return Response.json({ ok: false, error: "Enter 4 to 6-digit MPIN / Trading Security PIN" }, { status: 400 });
      }
    }
  }

  try {
    await saveCreds(b.broker as VaultKey, fields);
  } catch (err) {
    if (err instanceof Error && err.name === "VaultKeyMissingError") {
      return Response.json({ ok: false, error: err.message, code: "VAULT_KEY_MISSING" }, { status: 503 });
    }
    throw err;
  }
  if (b.broker !== "smtp") await clearSession(b.broker as BrokerKey);
  if (b.broker === "angel") stopAngelWs();
  await audit("INFO", "VAULT", `Credentials updated (AES-256-GCM) for ${b.broker}`);
  return Response.json({ ok: true, summary: await vaultSummary() });
}

export async function DELETE(req: NextRequest) {
  const denied = guard(req);
  if (denied) return Response.json(denied.body, { status: denied.status });
  const broker = req.nextUrl.searchParams.get("broker");
  if (!broker || !(broker in VAULT_FIELDS)) return Response.json({ ok: false }, { status: 400 });
  await deleteCreds(broker as VaultKey);
  if (broker !== "smtp") await clearSession(broker as BrokerKey);
  if (broker === "angel") stopAngelWs();
  await audit("WARN", "VAULT", `Credentials wiped for ${broker}`);
  return Response.json({ ok: true });
}
