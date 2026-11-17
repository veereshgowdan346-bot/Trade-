import { NextRequest } from "next/server";
import { buildEodHtml, sendEodAudit, sendMail } from "@/lib/notifier";

export const dynamic = "force-dynamic";

export async function GET() {
  const { html, subject, summary } = await buildEodHtml("MANUAL");
  return Response.json({ html, subject, summary });
}

export async function POST(req: NextRequest) {
  const b = (await req.json().catch(() => ({}))) as { kind?: string };
  if (b.kind === "test") {
    return Response.json(await sendMail("OmniTradePro SMTP test", "<p>Gmail SMTP channel verified.</p>"));
  }
  return Response.json(await sendEodAudit("MANUAL"));
}
