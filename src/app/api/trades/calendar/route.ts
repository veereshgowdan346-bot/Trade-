import { NextRequest, NextResponse } from "next/server";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { positions } from "@/db/schema";
import { istParts } from "@/lib/settings";

import { checkRateLimit } from "@/lib/apiGuard";

export const dynamic = "force-dynamic";

export type DaySummary = {
  date: string;
  totalTrades: number;
  paperCount: number;
  paperNetPnl: number;
  paperGrossPnl: number;
  paperCharges: number;
  paperWins: number;
  liveCount: number;
  liveNetPnl: number;
  liveGrossPnl: number;
  liveCharges: number;
  liveWins: number;
  trades: Array<{
    id: number;
    symbol: string;
    exchange: string;
    side: string;
    qty: number;
    entryPrice: number;
    exitPrice: number | null;
    exitReason: string | null;
    grossPnl: number | null;
    totalCharges: number | null;
    netPnl: number | null;
    strategy: string;
    broker: string;
    mode: string;
    openedAt: string;
    closedAt: string | null;
  }>;
};

export async function GET(req: NextRequest) {
  const denied = checkRateLimit(req, "read");
  if (denied) return Response.json(denied.body, { status: denied.status });
  try {
    const rows = await db
      .select()
      .from(positions)
      .where(eq(positions.status, "CLOSED"))
      .orderBy(desc(positions.closedAt));

    const calendar: Record<string, DaySummary> = {};

    for (const r of rows) {
      if (!r.closedAt) continue;
      const istDate = istParts(new Date(r.closedAt).getTime()).date;
      if (!calendar[istDate]) {
        calendar[istDate] = {
          date: istDate,
          totalTrades: 0,
          paperCount: 0,
          paperNetPnl: 0,
          paperGrossPnl: 0,
          paperCharges: 0,
          paperWins: 0,
          liveCount: 0,
          liveNetPnl: 0,
          liveGrossPnl: 0,
          liveCharges: 0,
          liveWins: 0,
          trades: [],
        };
      }

      const day = calendar[istDate];
      day.totalTrades += 1;
      const isLive = r.mode === "LIVE";
      const net = r.netPnl ?? 0;
      const gross = r.grossPnl ?? 0;
      const chg = r.totalCharges ?? 0;

      if (isLive) {
        day.liveCount += 1;
        day.liveNetPnl = Math.round((day.liveNetPnl + net) * 100) / 100;
        day.liveGrossPnl = Math.round((day.liveGrossPnl + gross) * 100) / 100;
        day.liveCharges = Math.round((day.liveCharges + chg) * 100) / 100;
        if (net > 0) day.liveWins += 1;
      } else {
        day.paperCount += 1;
        day.paperNetPnl = Math.round((day.paperNetPnl + net) * 100) / 100;
        day.paperGrossPnl = Math.round((day.paperGrossPnl + gross) * 100) / 100;
        day.paperCharges = Math.round((day.paperCharges + chg) * 100) / 100;
        if (net > 0) day.paperWins += 1;
      }

      day.trades.push({
        id: r.id,
        symbol: r.symbol,
        exchange: r.exchange,
        side: r.side,
        qty: r.qty,
        entryPrice: r.entryPrice,
        exitPrice: r.exitPrice,
        exitReason: r.exitReason,
        grossPnl: r.grossPnl,
        totalCharges: r.totalCharges,
        netPnl: r.netPnl,
        strategy: r.strategy,
        broker: r.broker,
        mode: r.mode ?? "PAPER",
        openedAt: r.openedAt.toISOString(),
        closedAt: r.closedAt ? r.closedAt.toISOString() : null,
      });
    }

    return NextResponse.json({ ok: true, calendar });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : String(e) },
      { status: 500 }
    );
  }
}
