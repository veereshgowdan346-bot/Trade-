"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, Badge, inr, istTime, num, Panel, pnlClass, Stat } from "../ui";
import type { Ctx } from "../ctx";

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

export function TradeCalendarPage({ ctx }: { ctx: Ctx }) {
  const [calendarData, setCalendarData] = useState<Record<string, DaySummary>>({});
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // Calendar navigation state (Year and Month)
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth()); // 0-indexed

  // FIX (FINAL-AUDIT UI-01): the mount effect must not call setState synchronously
  // (react-hooks/set-state-in-effect) and refs must not be written during render
  // (react-hooks/refs). Fetch logic is a stable callback; the mount fetch is deferred
  // to a task so state updates land outside the effect's synchronous pass; the toast
  // ref is synchronized in its own effect. Behavior is unchanged (single mount fetch;
  // manual refresh button keeps the explicit `setLoading(true)` entry point).
  const toastRef = useRef(ctx.toast);

  const fetchCalendar = useCallback(async () => {
    try {
      const res = await api<{ ok: boolean; calendar: Record<string, DaySummary> }>("/api/trades/calendar");
      if (res.ok && res.calendar) {
        setCalendarData(res.calendar);
      }
    } catch (e) {
      toastRef.current(`Failed to load calendar history: ${e instanceof Error ? e.message : String(e)}`, "err");
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCalendar = useCallback(async () => {
    setLoading(true);
    await fetchCalendar();
  }, [fetchCalendar]);

  useEffect(() => {
    toastRef.current = ctx.toast;
  }, [ctx.toast]);

  useEffect(() => {
    const timer = setTimeout(fetchCalendar, 0);
    return () => clearTimeout(timer);
  }, [fetchCalendar]);

  // Compute days in viewMonth
  const firstDayOfMonth = new Date(viewYear, viewMonth, 1).getDay(); // 0 = Sun
  const totalDaysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewYear(viewYear - 1);
      setViewMonth(11);
    } else {
      setViewMonth(viewMonth - 1);
    }
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewYear(viewYear + 1);
      setViewMonth(0);
    } else {
      setViewMonth(viewMonth + 1);
    }
  };

  const goToToday = () => {
    const t = new Date();
    setViewYear(t.getFullYear());
    setViewMonth(t.getMonth());
  };

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];

  const selectedDayData = selectedDate ? calendarData[selectedDate] : null;

  return (
    <div className="space-y-4">
      <Panel
        title="📅 Trade History Calendar · Daily Segregated P&L"
        right={
          <div className="flex items-center gap-2">
            <button className="btn !h-7 !px-2.5 !text-[11px]" onClick={prevMonth}>◀ Prev</button>
            <span className="mono font-bold text-[13px] px-2 min-w-[130px] text-center">
              {monthNames[viewMonth]} {viewYear}
            </span>
            <button className="btn !h-7 !px-2.5 !text-[11px]" onClick={nextMonth}>Next ▶</button>
            <button className="btn !h-7 !px-2.5 !text-[11px]" onClick={goToToday}>Today</button>
            <button className="btn btn-primary !h-7 !px-3 !text-[11px]" onClick={() => void loadCalendar()}>
              {loading ? "↻ Loading…" : "↻ Refresh"}
            </button>
          </div>
        }
      >
        <div className="space-y-2">
          {/* Day of Week Headers */}
          <div className="grid grid-cols-7 gap-2 text-center text-[11px] font-bold uppercase tracking-wider text-muted pb-1 border-b border-[var(--line)]">
            <div className="text-red-400">Sun</div>
            <div>Mon</div>
            <div>Tue</div>
            <div>Wed</div>
            <div>Thu</div>
            <div>Fri</div>
            <div className="text-amber-400">Sat</div>
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-2">
            {/* Empty slots for days before 1st of month */}
            {Array.from({ length: firstDayOfMonth }).map((_, i) => (
              <div key={`empty-${i}`} className="h-24 rounded border border-transparent bg-transparent" />
            ))}

            {/* Days of current month */}
            {Array.from({ length: totalDaysInMonth }).map((_, i) => {
              const dayNum = i + 1;
              const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(dayNum).padStart(2, "0")}`;
              const day = calendarData[dateStr];
              const hasTrades = Boolean(day && day.totalTrades > 0);
              const isToday =
                new Date().toISOString().slice(0, 10) === dateStr;

              return (
                <div
                  key={dateStr}
                  onClick={() => setSelectedDate(dateStr)}
                  className={`h-24 p-2 rounded-lg border transition-all cursor-pointer flex flex-col justify-between ${
                    isToday ? "ring-1 ring-[var(--accent)] border-[var(--accent)]" : "border-[var(--line)]"
                  } ${
                    hasTrades
                      ? "bg-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.06)] hover:border-[rgba(0,229,255,0.5)]"
                      : "bg-[rgba(0,0,0,0.12)] hover:bg-[rgba(255,255,255,0.02)]"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className={`text-[12px] font-bold ${isToday ? "text-[var(--accent)]" : "text-white"}`}>
                      {dayNum}
                    </span>
                    {isToday && (
                      <span className="text-[9px] px-1 py-0.2 rounded bg-[var(--accent)]/20 text-[var(--accent)] font-semibold">
                        TODAY
                      </span>
                    )}
                  </div>

                  {hasTrades && day ? (
                    <div className="space-y-1 text-left">
                      <div className="text-[10px] font-bold text-muted flex items-center justify-between">
                        <span>{day.totalTrades} trade(s)</span>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        {day.paperCount > 0 && (
                          <div className="flex items-center justify-between text-[10px] mono">
                            <span className="px-1 py-0.2 text-[9px] font-bold rounded bg-[#f59e0b]/20 text-[#f59e0b]">P</span>
                            <span className={pnlClass(day.paperNetPnl)}>{inr(day.paperNetPnl)}</span>
                          </div>
                        )}
                        {day.liveCount > 0 && (
                          <div className="flex items-center justify-between text-[10px] mono">
                            <span className="px-1 py-0.2 text-[9px] font-bold rounded bg-[#10b981]/20 text-[#10b981]">L</span>
                            <span className={pnlClass(day.liveNetPnl)}>{inr(day.liveNetPnl)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center text-[12px] font-semibold text-muted/40 my-auto">
                      0
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </Panel>

      {/* Date Inspection Modal / Drawer */}
      {selectedDate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="bg-[#0b1017] border border-[var(--line)] rounded-xl max-w-4xl w-full max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Modal Header */}
            <div className="px-5 py-3.5 border-b border-[var(--line)] flex items-center justify-between bg-[#111722]">
              <div className="flex items-center gap-3">
                <span className="text-[16px] font-bold">📅 Trade History Details: {selectedDate}</span>
                {selectedDayData ? (
                  <Badge tone={selectedDayData.totalTrades > 0 ? "bull" : "mute"}>
                    {selectedDayData.totalTrades} Total Closed Trades
                  </Badge>
                ) : (
                  <Badge tone="mute">0 Trades</Badge>
                )}
              </div>
              <button
                className="btn !h-7 !px-3 !text-[12px] !font-bold"
                onClick={() => setSelectedDate(null)}
              >
                ✕ Close
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-4 flex-1">
              {selectedDayData && selectedDayData.totalTrades > 0 ? (
                <>
                  {/* Summary Cards segregated by Paper vs Live */}
                  <div className="grid grid-cols-2 gap-4">
                    {/* Paper Card */}
                    <div className="p-3.5 rounded-lg border border-[#f59e0b]/40 bg-[#f59e0b]/5 space-y-2">
                      <div className="flex items-center justify-between pb-1 border-b border-[#f59e0b]/20">
                        <span className="font-extrabold text-[12.5px] text-[#f59e0b] flex items-center gap-1.5">
                          <span className="px-1.5 py-0.5 rounded bg-[#f59e0b]/20 border border-[#f59e0b]/40">P</span>
                          PAPER TRADING SUMMARY
                        </span>
                        <span className="text-[11px] mono font-bold text-muted">{selectedDayData.paperCount} trade(s)</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[12px]">
                        <Stat label="Gross P&L" value={inr(selectedDayData.paperGrossPnl)} cls={pnlClass(selectedDayData.paperGrossPnl)} />
                        <Stat label="Total Charges" value={inr(selectedDayData.paperCharges)} cls="text-[#f59e0b]" />
                        <Stat label="Net Realized P&L" value={inr(selectedDayData.paperNetPnl)} cls={pnlClass(selectedDayData.paperNetPnl)} />
                        <Stat label="Win Count" value={`${selectedDayData.paperWins} / ${selectedDayData.paperCount}`} />
                      </div>
                    </div>

                    {/* Live Card */}
                    <div className="p-3.5 rounded-lg border border-[#10b981]/40 bg-[#10b981]/5 space-y-2">
                      <div className="flex items-center justify-between pb-1 border-b border-[#10b981]/20">
                        <span className="font-extrabold text-[12.5px] text-[#10b981] flex items-center gap-1.5">
                          <span className="px-1.5 py-0.5 rounded bg-[#10b981]/20 border border-[#10b981]/40">L</span>
                          LIVE TRADING SUMMARY
                        </span>
                        <span className="text-[11px] mono font-bold text-muted">{selectedDayData.liveCount} trade(s)</span>
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-[12px]">
                        <Stat label="Gross P&L" value={inr(selectedDayData.liveGrossPnl)} cls={pnlClass(selectedDayData.liveGrossPnl)} />
                        <Stat label="Total Charges" value={inr(selectedDayData.liveCharges)} cls="text-[#f59e0b]" />
                        <Stat label="Net Realized P&L" value={inr(selectedDayData.liveNetPnl)} cls={pnlClass(selectedDayData.liveNetPnl)} />
                        <Stat label="Win Count" value={`${selectedDayData.liveWins} / ${selectedDayData.liveCount}`} />
                      </div>
                    </div>
                  </div>

                  {/* Trades Detail Table */}
                  <Panel title={`Executed Trades on ${selectedDate}`} bodyClass="p-0">
                    <div className="scroll max-h-[300px]">
                      <table className="grid">
                        <thead>
                          <tr>
                            <th>Time (IST)</th>
                            <th>Mode</th>
                            <th>Symbol</th>
                            <th>Side</th>
                            <th className="text-right">Qty</th>
                            <th className="text-right">Entry</th>
                            <th className="text-right">Exit</th>
                            <th>Reason</th>
                            <th className="text-right">Gross</th>
                            <th className="text-right">Charges</th>
                            <th className="text-right">Net P&L</th>
                            <th>Broker</th>
                            <th>Strategy</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedDayData.trades.map((t) => (
                            <tr key={t.id}>
                              <td className="mono">{istTime(t.closedAt)}</td>
                              <td>
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold ${
                                  t.mode === "LIVE"
                                    ? "bg-[#10b981]/20 text-[#10b981] border border-[#10b981]/40"
                                    : "bg-[#f59e0b]/20 text-[#f59e0b] border border-[#f59e0b]/40"
                                }`}>
                                  {t.mode === "LIVE" ? "L LIVE" : "P PAPER"}
                                </span>
                              </td>
                              <td><b>{t.symbol}</b></td>
                              <td><Badge tone={t.side === "BUY" ? "bull" : "bear"}>{t.side}</Badge></td>
                              <td className="mono text-right">{t.qty}</td>
                              <td className="mono text-right">{num(t.entryPrice)}</td>
                              <td className="mono text-right">{num(t.exitPrice)}</td>
                              <td className="muted">{t.exitReason}</td>
                              <td className={`mono text-right ${pnlClass(t.grossPnl)}`}>{inr(t.grossPnl)}</td>
                              <td className="mono text-right text-[#f59e0b]">{inr(t.totalCharges)}</td>
                              <td className={`mono text-right font-bold ${pnlClass(t.netPnl)}`}>
                                <span className={`text-[9.5px] font-bold px-1 py-0.2 mr-1 rounded ${
                                  t.mode === "LIVE" ? "bg-[#10b981]/20 text-[#10b981]" : "bg-[#f59e0b]/20 text-[#f59e0b]"
                                }`}>
                                  {t.mode === "LIVE" ? "L" : "P"}
                                </span>
                                {inr(t.netPnl)}
                              </td>
                              <td>{t.broker.toUpperCase()}</td>
                              <td className="muted">{t.strategy}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </Panel>
                </>
              ) : (
                <div className="py-12 text-center text-muted">
                  <div className="text-3xl mb-2">🏖️</div>
                  <div className="text-[14px] font-semibold text-white">Zero Trades Executed on {selectedDate}</div>
                  <div className="text-[12px] text-muted mt-1">No Paper or Live trades were recorded in the system on this date.</div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
