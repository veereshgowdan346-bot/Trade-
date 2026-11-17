export type Candle = {
  t: number; // epoch ms (candle open)
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
};

export function ema(values: number[], period: number): number[] {
  const k = 2 / (period + 1);
  const out: number[] = [];
  let prev = values[0] ?? 0;
  for (let i = 0; i < values.length; i++) {
    prev = i === 0 ? values[0] : values[i] * k + prev * (1 - k);
    out.push(prev);
  }
  return out;
}

export function trueRange(c: Candle[]): number[] {
  return c.map((x, i) =>
    i === 0 ? x.h - x.l : Math.max(x.h - x.l, Math.abs(x.h - c[i - 1].c), Math.abs(x.l - c[i - 1].c)),
  );
}

/** Wilder smoothing (RMA). */
export function rma(values: number[], period: number): number[] {
  const out: number[] = [];
  let prev = 0;
  for (let i = 0; i < values.length; i++) {
    if (i < period) {
      prev += values[i];
      out.push(i === period - 1 ? prev / period : NaN);
      if (i === period - 1) prev = prev / period;
    } else {
      prev = (prev * (period - 1) + values[i]) / period;
      out.push(prev);
    }
  }
  return out;
}

export function atr(c: Candle[], period = 14): number[] {
  return rma(trueRange(c), period);
}

export function adx(c: Candle[], period = 14) {
  const plusDM: number[] = [0];
  const minusDM: number[] = [0];
  for (let i = 1; i < c.length; i++) {
    const up = c[i].h - c[i - 1].h;
    const dn = c[i - 1].l - c[i].l;
    plusDM.push(up > dn && up > 0 ? up : 0);
    minusDM.push(dn > up && dn > 0 ? dn : 0);
  }
  const tr = rma(trueRange(c), period);
  const pSm = rma(plusDM, period);
  const mSm = rma(minusDM, period);
  const plusDI = pSm.map((v, i) => (tr[i] ? (100 * v) / tr[i] : NaN));
  const minusDI = mSm.map((v, i) => (tr[i] ? (100 * v) / tr[i] : NaN));
  const dx = plusDI.map((p, i) => {
    const m = minusDI[i];
    const s = p + m;
    return s ? (100 * Math.abs(p - m)) / s : NaN;
  });
  const clean = dx.map((v) => (Number.isNaN(v) ? 0 : v));
  const firstValid = dx.findIndex((v) => !Number.isNaN(v));
  const adxArr = rma(clean.slice(Math.max(0, firstValid)), period);
  const pad = new Array(Math.max(0, firstValid)).fill(NaN);
  return { adx: [...pad, ...adxArr], plusDI, minusDI };
}

export function bollinger(closes: number[], period = 20, mult = 2) {
  const mid: number[] = [];
  const upper: number[] = [];
  const lower: number[] = [];
  const width: number[] = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < period - 1) {
      mid.push(NaN);
      upper.push(NaN);
      lower.push(NaN);
      width.push(NaN);
      continue;
    }
    const w = closes.slice(i - period + 1, i + 1);
    const m = w.reduce((a, b) => a + b, 0) / period;
    const sd = Math.sqrt(w.reduce((a, b) => a + (b - m) ** 2, 0) / period);
    mid.push(m);
    upper.push(m + mult * sd);
    lower.push(m - mult * sd);
    width.push(m ? ((2 * mult * sd) / m) * 100 : 0);
  }
  return { mid, upper, lower, width };
}

export function rsi(closes: number[], period = 14): number[] {
  const gains: number[] = [0];
  const losses: number[] = [0];
  for (let i = 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    gains.push(Math.max(d, 0));
    losses.push(Math.max(-d, 0));
  }
  const g = rma(gains, period);
  const l = rma(losses, period);
  return g.map((v, i) => (l[i] === 0 ? 100 : 100 - 100 / (1 + v / l[i])));
}

/** Session VWAP over the supplied candles (cumulative typical-price * volume). */
export function vwap(c: Candle[]): number[] {
  let pv = 0;
  let vol = 0;
  return c.map((x) => {
    const tp = (x.h + x.l + x.c) / 3;
    pv += tp * x.v;
    vol += x.v;
    return vol ? pv / vol : x.c;
  });
}

export function superTrend(c: Candle[], period = 10, mult = 3) {
  const a = atr(c, period);
  const dir: number[] = [];
  const line: number[] = [];
  let fu = NaN;
  let fl = NaN;
  let d = 1;
  for (let i = 0; i < c.length; i++) {
    const hl2 = (c[i].h + c[i].l) / 2;
    if (Number.isNaN(a[i])) {
      dir.push(1);
      line.push(NaN);
      continue;
    }
    const bu = hl2 + mult * a[i];
    const bl = hl2 - mult * a[i];
    const prevClose = c[i - 1]?.c ?? c[i].c;
    fu = Number.isNaN(fu) || bu < fu || prevClose > fu ? bu : fu;
    fl = Number.isNaN(fl) || bl > fl || prevClose < fl ? bl : fl;
    if (d === 1 && c[i].c < fl) d = -1;
    else if (d === -1 && c[i].c > fu) d = 1;
    dir.push(d);
    line.push(d === 1 ? fl : fu);
  }
  return { dir, line };
}

export const last = <T,>(a: T[]): T => a[a.length - 1];
