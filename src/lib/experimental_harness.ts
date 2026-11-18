/**
 * Experimental research harness + portfolio statistics (research only).
 *
 * CORR-001 / DATA-001 support code. Two concerns live here because both the per-strategy
 * evaluation and the correlation study must use the SAME trade-generation rules — duplicating
 * the harness in two scripts is how research results silently diverge.
 *
 * HARNESS RULES (identical for every strategy, no per-strategy tuning)
 *   - signal computed on the PREFIX excluding the current bar (mirrors the production engine)
 *   - fill at c[i].c; exit on opposite signal / 2xATR stop / 3xATR target / session boundary
 *   - Rs 1,00,000 notional sleeve, statutory round-trip costs (Shoonya) + slippage
 *   - no leverage, no parameter search, no optimisation against the evaluated data
 *
 * SESSION MODE (METHOD-001)
 *   STRICT_INTRADAY (default) — a position open on the last bar of a session is squared off at that
 *      bar's close, and no position may be opened on a session's last bar (no time to exit). Every
 *      trade therefore opens and closes inside one IST session. This is the mandated behaviour for
 *      an intraday strategy.
 *   CARRY_OVERNIGHT (legacy, explicit opt-in) — a position open at a session end is filled at the
 *      NEXT session's OPEN, so it carries overnight gap exposure. This is how every result published
 *      before 2026-11-18 was produced; it is retained ONLY so those historical numbers stay
 *      reproducible. It must never be used for new work.
 *
 * Everything here is offline research. Nothing is wired into the production quorum.
 */

import type { Candle } from "./indicators";
import { atr } from "./indicators";
import { roundTripCharges } from "./tax";
import { runExperimental } from "./experimental_strategies";

export type SessionMode = "STRICT_INTRADAY" | "CARRY_OVERNIGHT";

/** Correct behaviour is the default; the unsafe legacy path requires an explicit opt-in. */
export const DEFAULT_SESSION_MODE: SessionMode = "STRICT_INTRADAY";

export type HarnessTrade = {
  entryTime: number;
  exitTime: number;
  side: "BUY" | "SELL";
  qty: number;
  entry: number;
  exit: number;
  reason: "STOP_LOSS" | "TARGET" | "EOD_EXIT" | "SIGNAL_FLIP";
  gross: number;
  charges: number;
  net: number;
  /** EXIT session (kept for backwards compatibility with existing artifacts). */
  day: string;
  /** SESSION accounting, explicit (METHOD-001 requirement). */
  entryDay: string;
  exitDay: string;
  sessionMode: SessionMode;
  /** True only if a strict-mode trade somehow crossed a session boundary — must always be false. */
  strictViolation?: boolean;
};

export type HarnessResult = {
  trades: HarnessTrade[];
  sessionMode: SessionMode;
  /** Number of trades whose entry and exit fall in different IST sessions (must be 0 when strict). */
  crossSessionTrades: number;
  /** IST day -> true when a position was open at any point that day (overlap measurement) */
  exposureDays: Record<string, boolean>;
  dailyPnl: Record<string, number>;
};

export const SLEEVE = 100000;
export const BROKER = "shoonya";
export const MIN_CONFIDENCE = 55;

export function istDay(ms: number): string {
  return new Date(ms).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

export function researchBacktest(
  strategyId: string,
  candles: Candle[],
  opts: {
    warmup?: number;
    sleeve?: number;
    /** Session-boundary policy. Defaults to STRICT_INTRADAY (METHOD-001). */
    sessionMode?: SessionMode;
    /**
     * @deprecated Superseded by `sessionMode`. `true` maps to STRICT_INTRADAY, `false` to the legacy
     * CARRY_OVERNIGHT path. Kept so existing sensitivity scripts keep running unchanged.
     */
    intradayOnly?: boolean;
  } = {},
): HarnessResult {
  const warmup = opts.warmup ?? 60;
  const sessionMode: SessionMode =
    opts.sessionMode ?? (opts.intradayOnly === undefined ? DEFAULT_SESSION_MODE : opts.intradayOnly ? "STRICT_INTRADAY" : "CARRY_OVERNIGHT");
  const strict = sessionMode === "STRICT_INTRADAY";
  const isLastBarOfSession = (i: number) =>
    i + 1 >= candles.length || istDay(candles[i + 1].t) !== istDay(candles[i].t);
  /* PAPER-ONLY hardening: fail closed on invalid inputs instead of producing NaN/Infinity
   * quantities or silently forcing leverage. Default sleeve (100k) behaviour is unchanged. */
  if (!Array.isArray(candles) || candles.length === 0) {
    return { trades: [], exposureDays: {}, dailyPnl: {}, sessionMode, crossSessionTrades: 0 };
  }
  const sleeveRaw = opts.sleeve ?? SLEEVE;
  const sleeve = Number.isFinite(sleeveRaw) && sleeveRaw > 0 ? sleeveRaw : SLEEVE;
  const safeWarmup = Number.isFinite(warmup) && warmup >= 0 ? Math.floor(warmup) : 60;
  const atrArr = atr(candles, 14);
  const trades: HarnessTrade[] = [];
  const exposureDays: Record<string, boolean> = {};
  const dailyPnl: Record<string, number> = {};
  let pos: { side: "BUY" | "SELL"; qty: number; entry: number; entryTime: number; stop: number; target: number } | null = null;
  let lastDay = istDay(candles[0].t);

  for (let i = safeWarmup; i < candles.length; i++) {
    const c = candles[i];
    const day = istDay(c.t);
    const newDay = day !== lastDay;
    lastDay = day;
    const a = atrArr[i];
    const out = runExperimental(strategyId, candles.slice(0, i)); // prefix excludes the current bar
    const sig = out.signal;
    const conf = out.confidence;

    if (pos) {
      exposureDays[day] = true;
      const hitStop = pos.side === "BUY" ? c.l <= pos.stop : c.h >= pos.stop;
      const hitTarget = pos.side === "BUY" ? c.h >= pos.target : c.l <= pos.target;
      const opposite = pos.side === "BUY" ? sig === -1 : sig === 1;
      let exitPx: number | null = null;
      let reason: HarnessTrade["reason"] | null = null;
      let strictViolation = false;
      if (hitStop) { exitPx = pos.stop; reason = "STOP_LOSS"; }
      else if (hitTarget) { exitPx = pos.target; reason = "TARGET"; }
      else if (strict && isLastBarOfSession(i)) { exitPx = c.c; reason = "EOD_EXIT"; }
      else if (newDay) {
        // Reached only in CARRY_OVERNIGHT, or defensively in strict mode if a position somehow
        // survived a session end. The latter is recorded rather than hidden, and the behavioural
        // tests assert it never occurs.
        exitPx = c.o;
        reason = "EOD_EXIT";
        strictViolation = strict;
      }
      else if (opposite && conf >= MIN_CONFIDENCE) { exitPx = c.c; reason = "SIGNAL_FLIP"; }

      if (reason && exitPx !== null) {
        const gross = pos.side === "BUY" ? (exitPx - pos.entry) * pos.qty : (pos.entry - exitPx) * pos.qty;
        const ch = roundTripCharges({
          exchange: "NSE",
          kind: "EQ",
          broker: BROKER,
          qty: pos.qty,
          entry: pos.entry,
          exit: exitPx,
          side: pos.side,
          productType: "INTRADAY",
        });
        const net = gross - ch.total;
        trades.push({
          entryTime: pos.entryTime,
          exitTime: c.t,
          side: pos.side,
          qty: pos.qty,
          entry: pos.entry,
          exit: exitPx,
          reason,
          gross,
          charges: ch.total,
          net,
          day,
          entryDay: istDay(pos.entryTime),
          exitDay: day,
          sessionMode,
          ...(strictViolation ? { strictViolation: true } : {}),
        });
        dailyPnl[day] = (dailyPnl[day] ?? 0) + net;
        pos = null;
      }
    }

    // Strict mode forbids opening on the session's last bar: there would be no bar left to exit on,
    // which is exactly how the legacy path ended up carrying positions overnight.
    const mayEnter = strict ? !isLastBarOfSession(i) : true;
    if (!pos && !newDay && mayEnter && sig !== 0 && conf >= MIN_CONFIDENCE && Number.isFinite(a) && a > 0) {
      const side: "BUY" | "SELL" = sig === 1 ? "BUY" : "SELL";
      const entry = c.c;
      /* PAPER-ONLY fix (sizing): never force qty=1 when the sleeve cannot afford one unit.
       * Previously Math.max(1, floor(sleeve/entry)) silently created ~22x leverage on a
       * ₹1,000 sleeve vs a ~₹22,000 NIFTY proxy. Now: unaffordable => no trade (qty 0).
       * Default ₹1,00,000 sleeve is unaffected (floor >= 4 on NIFTY). */
      if (!Number.isFinite(entry) || entry <= 0) continue;
      const qty = Math.floor(sleeve / entry);
      if (!Number.isFinite(qty) || qty <= 0) continue;
      pos = {
        side,
        qty,
        entry,
        entryTime: c.t,
        stop: side === "BUY" ? entry - 2 * a : entry + 2 * a,
        target: side === "BUY" ? entry + 3 * a : entry - 3 * a,
      };
      exposureDays[day] = true;
    }
  }
  const crossSessionTrades = trades.filter((t) => t.entryDay !== t.exitDay).length;
  return { trades, exposureDays, dailyPnl, sessionMode, crossSessionTrades };
}

/* ------------------------- CORR-001 reliability -------------------------- */

export type Reliability = "INSUFFICIENT_SAMPLE" | "PRELIMINARY" | "RELIABLE" | "UNVERIFIED";

/**
 * CORR-001: correlation on a handful of days is noise. These thresholds are stated up front so
 * a number can never be quoted without its reliability class.
 *   < 30 sessions  -> INSUFFICIENT_SAMPLE
 *   30-59          -> PRELIMINARY
 *   >= 60          -> RELIABLE
 *   zero variance / missing -> UNVERIFIED (correlation is undefined)
 */
export function reliabilityLabel(sessions: number): Reliability {
  if (!Number.isFinite(sessions) || sessions <= 0) return "UNVERIFIED";
  if (sessions < 30) return "INSUFFICIENT_SAMPLE";
  if (sessions < 60) return "PRELIMINARY";
  return "RELIABLE";
}

export function pearson(a: number[], b: number[]): number | null {
  const n = Math.min(a.length, b.length);
  if (n < 3) return null;
  const ma = a.slice(0, n).reduce((x, y) => x + y, 0) / n;
  const mb = b.slice(0, n).reduce((x, y) => x + y, 0) / n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] - ma;
    const y = b[i] - mb;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  if (da <= 1e-18 || db <= 1e-18) return null; // flat series: correlation undefined
  return Number((num / Math.sqrt(da * db)).toFixed(3));
}

/** Rolling correlation with a fixed window; null entries where a window is degenerate. */
export function rollingCorrelation(a: number[], b: number[], window = 30): (number | null)[] {
  const out: (number | null)[] = [];
  for (let end = 1; end <= a.length; end++) {
    const start = Math.max(0, end - window);
    if (end - start < Math.max(3, Math.min(window, 10))) {
      out.push(null);
      continue;
    }
    out.push(pearson(a.slice(start, end), b.slice(start, end)));
  }
  return out;
}

/** Drawdown series (≥ 0) from a cumulative P&L series. */
export function drawdownSeries(dailyPnl: number[]): number[] {
  let peak = 0;
  let cum = 0;
  const out: number[] = [];
  for (const v of dailyPnl) {
    cum += v;
    if (cum > peak) peak = cum;
    out.push(Number((peak - cum).toFixed(4)));
  }
  return out;
}

export function maxDrawdown(dailyPnl: number[]): number {
  return Math.max(0, ...drawdownSeries(dailyPnl));
}

export type PortfolioStats = {
  sessions: number;
  net: number;
  maxDrawdown: number;
  /** stdev of daily portfolio returns (Rs), a volatility proxy */
  dailyVolatility: number;
  /** annualised-ish volatility using sqrt(252) on daily returns — labelled, not a promise */
  annualisedVolatility: number;
  recoveryFactor: number | null;
  /** sum(|daily pnl|) / starting capital — a turnover proxy */
  turnoverProxy: number;
  bestDay: number;
  worstDay: number;
  positiveDays: number;
  negativeDays: number;
};

export function portfolioStats(dailyPnl: number[], capital = SLEEVE): PortfolioStats {
  const n = dailyPnl.length;
  const net = dailyPnl.reduce((a, b) => a + b, 0);
  const mean = n ? net / n : 0;
  const variance = n > 1 ? dailyPnl.reduce((a, b) => a + (b - mean) ** 2, 0) / (n - 1) : 0;
  const vol = Math.sqrt(variance);
  const mdd = maxDrawdown(dailyPnl);
  return {
    sessions: n,
    net: Number(net.toFixed(2)),
    maxDrawdown: Number(mdd.toFixed(2)),
    dailyVolatility: Number(vol.toFixed(2)),
    annualisedVolatility: Number((vol * Math.sqrt(252)).toFixed(2)),
    recoveryFactor: mdd > 0 ? Number((net / mdd).toFixed(3)) : net > 0 ? null : 0,
    turnoverProxy: Number((dailyPnl.reduce((a, b) => a + Math.abs(b), 0) / capital).toFixed(3)),
    bestDay: Number(Math.max(0, ...dailyPnl).toFixed(2)),
    worstDay: Number(Math.min(0, ...dailyPnl).toFixed(2)),
    positiveDays: dailyPnl.filter((v) => v > 0).length,
    negativeDays: dailyPnl.filter((v) => v < 0).length,
  };
}

/** Fraction of days on which BOTH strategies had an open position. */
export function exposureOverlap(a: Record<string, boolean>, b: Record<string, boolean>): number {
  const days = new Set([...Object.keys(a), ...Object.keys(b)]);
  let both = 0;
  let any = 0;
  for (const d of days) {
    if (a[d] || b[d]) any++;
    if (a[d] && b[d]) both++;
  }
  return any ? Number((both / any).toFixed(3)) : 0;
}
