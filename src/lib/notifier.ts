import nodemailer from "nodemailer";
import { and, asc, eq, gte, isNull } from "drizzle-orm";
import { db } from "@/db";
import { positions } from "@/db/schema";
import { getBrokerStatuses, BROKER_LABEL } from "./brokers";
import type { Charges } from "./tax";
import { sumCharges } from "./tax";
import { audit, getRisk, getSetting, istDayStartDate, istParts, setSetting } from "./settings";
import { loadCreds } from "./vault";

const inr = (n: number) => `${n < 0 ? "-" : ""}₹${Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c] as string);

export async function sendMail(subject: string, html: string): Promise<{ ok: boolean; error?: string }> {
  const c = await loadCreds("smtp");
  if (!c?.user || !c.appPassword) {
    return { ok: false, error: "Gmail SMTP credentials are not configured in the vault" };
  }
  try {
    const transport = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      requireTLS: true,
      auth: { user: c.user, pass: c.appPassword },
      connectionTimeout: 12_000,
      socketTimeout: 20_000,
    });
    await transport.sendMail({ from: `OmniTradePro <${c.user}>`, to: c.recipient || c.user, subject, html });
    await audit("INFO", "EMAIL", `Email sent: ${subject}`);
    return { ok: true };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await audit("ERROR", "EMAIL", `Email failed: ${error}`, { subject });
    return { ok: false, error };
  }
}

/** Real-time emergency alert, throttled to one per kind per 10 minutes. */
export async function sendAlert(kind: string, subject: string, bodyHtml: string) {
  const marks = await getSetting<Record<string, number>>("alertMarks", {});
  if (marks[kind] && Date.now() - marks[kind] < 10 * 60_000) return { ok: false, error: "throttled" };
  marks[kind] = Date.now();
  await setSetting("alertMarks", marks);
  await audit("CRITICAL", "ALERT", subject, { kind });
  return sendMail(
    `🚨 OmniTradePro ALERT - ${subject}`,
    `<div style="font-family:Segoe UI,Arial;background:#080b10;color:#e6edf3;padding:20px"><h2 style="color:#ef4444;margin:0 0 8px">${esc(subject)}</h2>${bodyHtml}<p style="color:#7b8794;font-size:12px">${new Date().toISOString()}</p></div>`,
  );
}

type TradeRow = typeof positions.$inferSelect;

export async function buildEodHtml(session: "EQUITY" | "MCX" | "MANUAL" = "MANUAL") {
  const now = Date.now();
  const dateStr = istParts(now).date;
  const dayStart = istDayStartDate(now);
  const cfg = await getRisk();
  const rows: TradeRow[] = await db
    .select()
    .from(positions)
    .where(and(eq(positions.status, "CLOSED"), gte(positions.closedAt, dayStart)))
    .orderBy(asc(positions.closedAt));
  const open = await db.select().from(positions).where(and(eq(positions.status, "OPEN"), isNull(positions.closedAt)));
  const statuses = await getBrokerStatuses();

  const gross = rows.reduce((a, r) => a + (r.grossPnl ?? 0), 0);
  const net = rows.reduce((a, r) => a + (r.netPnl ?? 0), 0);
  const fees = sumCharges(rows.map((r) => r.charges as Charges | null));
  const deployed = rows.reduce((a, r) => a + r.entryPrice * r.qty, 0);
  const roi = cfg.capital ? (net / cfg.capital) * 100 : 0;

  const th = "padding:6px 10px;text-align:left;background:#141a24;color:#00e5ff;font-size:12px;border-bottom:1px solid #1f2937";
  const td = "padding:6px 10px;font-size:12px;border-bottom:1px solid #1a2230";
  const pnlColor = (v: number) => (v >= 0 ? "#10b981" : "#ef4444");

  const balances = (["angel", "shoonya", "groww"] as const)
    .map((b) => {
      const f = statuses[b].funds;
      return `<tr><td style="${td}">${BROKER_LABEL[b]}</td><td style="${td}">${statuses[b].state}</td><td style="${td};text-align:right">${f ? inr(f.available) : "—"}</td><td style="${td};text-align:right">${f ? inr(f.used) : "—"}</td></tr>`;
    })
    .join("");
  const aggAvail = (["angel", "shoonya", "groww"] as const).reduce((a, b) => a + (statuses[b].funds?.available ?? 0), 0);
  const aggUsed = (["angel", "shoonya", "groww"] as const).reduce((a, b) => a + (statuses[b].funds?.used ?? 0), 0);

  const ledger = rows.length
    ? rows
        .map(
          (r) =>
            `<tr><td style="${td}">${r.closedAt ? new Date(r.closedAt.getTime() + 5.5 * 3600_000).toISOString().slice(11, 19) : ""}</td><td style="${td}">${esc(r.symbol)}</td><td style="${td}">${r.broker.toUpperCase()}</td><td style="${td}">${r.side}</td><td style="${td};text-align:right">${r.qty}</td><td style="${td};text-align:right">${r.entryPrice.toFixed(2)}</td><td style="${td};text-align:right">${(r.exitPrice ?? 0).toFixed(2)}</td><td style="${td};text-align:right;color:${pnlColor(r.netPnl ?? 0)}">${inr(r.netPnl ?? 0)}</td><td style="${td}">${esc(r.strategy)}</td></tr>`,
        )
        .join("")
    : `<tr><td style="${td};color:#7b8794" colspan="9">No executed trades in this session.</td></tr>`;

  const tax = [
    [fees.sttLabel === "CTT" || session === "MCX" ? "STT / CTT" : "STT / CTT", fees.stt],
    ["Brokerage", fees.brokerage],
    ["Exchange Transaction Fees", fees.exchangeFees],
    ["SEBI Turnover Fee", fees.sebi],
    ["GST (18%)", fees.gst],
    ["Stamp Duty", fees.stamp],
    ["Slippage (0.08%)", fees.slippage],
  ]
    .map(([k, v]) => `<tr><td style="${td}">${k}</td><td style="${td};text-align:right">${inr(v as number)}</td></tr>`)
    .join("");

  const card = (label: string, value: string, color = "#e6edf3") =>
    `<td style="padding:10px 14px;background:#141a24;border:1px solid #1f2937"><div style="font-size:11px;color:#7b8794">${label}</div><div style="font-size:18px;font-weight:700;color:${color}">${value}</div></td>`;

  const html = `<!doctype html><html><body style="margin:0;background:#080b10;font-family:Segoe UI,Arial,sans-serif;color:#e6edf3">
<div style="max-width:860px;margin:0 auto;padding:24px">
<h1 style="font-size:20px;color:#00e5ff;margin:0 0 4px">OmniTradePro Daily Executive Trading Audit - ${dateStr}</h1>
<div style="color:#7b8794;font-size:12px;margin-bottom:18px">Session: ${session} · Mode: PAPER · Open positions: ${open.length}</div>
<h3 style="font-size:14px">Multi-Broker Balance Table</h3>
<table width="100%" cellspacing="0" style="border-collapse:collapse"><tr><th style="${th}">Broker</th><th style="${th}">Status</th><th style="${th};text-align:right">Available</th><th style="${th};text-align:right">Margin Used</th></tr>${balances}
<tr><td style="${td};font-weight:700">Aggregate</td><td style="${td}"></td><td style="${td};text-align:right;font-weight:700">${inr(aggAvail)}</td><td style="${td};text-align:right;font-weight:700">${inr(aggUsed)}</td></tr></table>
<h3 style="font-size:14px">Net Performance Scorecard</h3>
<table cellspacing="6" style="border-collapse:separate"><tr>${card("Starting Balance", inr(cfg.capital))}${card("Deployed Capital", inr(deployed))}${card("Gross Profit", inr(gross), pnlColor(gross))}</tr><tr>${card("Taxes & Brokerage", inr(fees.total), "#f59e0b")}${card("Net Realized P&L", inr(net), pnlColor(net))}${card("ROI %", `${roi.toFixed(2)}%`, pnlColor(roi))}</tr></table>
<h3 style="font-size:14px">Order Execution Ledger</h3>
<table width="100%" cellspacing="0" style="border-collapse:collapse"><tr><th style="${th}">Time (IST)</th><th style="${th}">Symbol</th><th style="${th}">Broker</th><th style="${th}">Side</th><th style="${th}">Qty</th><th style="${th}">Entry</th><th style="${th}">Exit</th><th style="${th}">Net P&L</th><th style="${th}">Strategy</th></tr>${ledger}</table>
<h3 style="font-size:14px">Statutory Tax Breakdown</h3>
<table width="60%" cellspacing="0" style="border-collapse:collapse">${tax}<tr><td style="${td};font-weight:700">Total</td><td style="${td};text-align:right;font-weight:700">${inr(fees.total)}</td></tr></table>
<p style="color:#7b8794;font-size:11px;margin-top:22px">Generated ${new Date().toISOString()} · OmniTradePro Apex Terminal</p>
</div></body></html>`;

  return { html, subject: `OmniTradePro Daily Executive Trading Audit - ${dateStr}`, summary: { gross, net, fees: fees.total, trades: rows.length, roi } };
}

export async function sendEodAudit(session: "EQUITY" | "MCX" | "MANUAL") {
  const { html, subject, summary } = await buildEodHtml(session);
  const r = await sendMail(subject + (session === "MANUAL" ? "" : ` (${session} close)`), html);
  return { ...r, summary };
}
