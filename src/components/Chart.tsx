"use client";

import { useEffect, useRef } from "react";
import type { MarketData } from "./types";

type Overlay = { sl?: number; target?: number; entry?: number; side?: string } | null;

const BULL = "#10b981";
const BEAR = "#ef4444";
const CYAN = "#00e5ff";
const VIOLET = "#a78bfa";
const AMBER = "#f59e0b";

/**
 * 30 FPS canvas chart. Rendering is decoupled from data polling (33ms timer) and the Y axis is
 * "sticky": bounds are committed in quantised steps (Rs 5 for >= Rs 100 instruments) with a 2%
 * expansion headroom and a shrink hysteresis, then critically damped - so the scale never jitters.
 */
export default function Chart({
  data,
  height,
  mini = false,
  overlay = null,
}: {
  data: MarketData | null;
  height: number;
  mini?: boolean;
  overlay?: Overlay;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dataRef = useRef<MarketData | null>(data);
  const frozenCandlesRef = useRef<MarketData | null>(null);
  const overlayRef = useRef<Overlay>(overlay);
  const drawRef = useRef<(() => void) | null>(null);
  const mouse = useRef<{ x: number; y: number } | null>(null);
  const axis = useRef<{ symbol: string; cmin: number; cmax: number; dmin: number; dmax: number } | null>(null);

  useEffect(() => {
    if (data && data.candles && data.candles.length >= 2) {
      dataRef.current = data;
      frozenCandlesRef.current = data;
    } else if (frozenCandlesRef.current && frozenCandlesRef.current.candles && frozenCandlesRef.current.candles.length >= 2) {
      // Market closed or WS disconnected: freeze chart permanently at last received tick!
      dataRef.current = {
        ...frozenCandlesRef.current,
        ws: data?.ws ?? frozenCandlesRef.current.ws,
        feedStatus: data?.feedStatus ?? "MARKET CLOSED / SESSION FROZEN",
      };
    } else {
      dataRef.current = data;
    }
    drawRef.current?.();
  }, [data]);
  useEffect(() => {
    overlayRef.current = overlay;
    drawRef.current?.();
  }, [overlay]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const draw = () => {
      const d = dataRef.current;
      const dpr = window.devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
        canvas.width = Math.floor(w * dpr);
        canvas.height = Math.floor(h * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      if (!d || d.candles.length < 2) {
        ctx.fillStyle = "#f59e0b";
        ctx.font = "12px Segoe UI";
        const msg = d?.ws?.connected
          ? `Connected to SmartWebSocketV2 — awaiting real 1m candles for ${d.inst.symbol}…`
          : d?.feedStatus || "MARKET CLOSED / WS DISCONNECTED — Connect Angel One in Settings (11) for live candles";
        ctx.fillText(msg, 14, 24);
        return;
      }

      const c = d.candles;
      const n = c.length;
      const padR = mini ? 52 : 66;
      const padT = 8;
      const volH = mini ? 0 : Math.max(46, h * 0.16);
      const padB = (mini ? 16 : 20) + volH;
      const plotW = w - padR - 6;
      const plotH = h - padT - padB;
      const step = plotW / n;
      const bw = Math.max(1.5, step * 0.62);

      // ---- sticky Y axis ----
      let lo = Infinity;
      let hi = -Infinity;
      for (let i = 0; i < n; i++) {
        lo = Math.min(lo, c[i].l, d.vwap[i] ?? c[i].l, d.ema9[i] ?? c[i].l, d.ema21[i] ?? c[i].l);
        hi = Math.max(hi, c[i].h, d.vwap[i] ?? c[i].h, d.ema9[i] ?? c[i].h, d.ema21[i] ?? c[i].h);
      }
      const q = (d.ltp ?? c[n - 1].c) >= 100 ? 5 : 1;
      const needMin = Math.floor(lo / q) * q;
      const needMax = Math.ceil(hi / q) * q;
      let a = axis.current;
      if (!a || a.symbol !== d.inst.symbol) {
        const pad = Math.max(q, Math.ceil(((needMax - needMin) * 0.02) / q) * q);
        a = { symbol: d.inst.symbol, cmin: needMin - pad, cmax: needMax + pad, dmin: needMin - pad, dmax: needMax + pad };
        axis.current = a;
      }
      const span = a.cmax - a.cmin;
      if (needMin < a.cmin || needMax > a.cmax) {
        // expansion gate: expand with 2% headroom, quantised
        const headroom = Math.max(q, Math.ceil((Math.max(needMax - needMin, span) * 0.02) / q) * q);
        a.cmin = Math.min(a.cmin, needMin - headroom);
        a.cmax = Math.max(a.cmax, needMax + headroom);
      } else if (needMax - needMin < span * 0.6) {
        // shrink only with strong hysteresis
        const headroom = Math.max(q, Math.ceil(((needMax - needMin) * 0.1) / q) * q);
        a.cmin = needMin - headroom;
        a.cmax = needMax + headroom;
      }
      a.dmin += (a.cmin - a.dmin) * 0.14;
      a.dmax += (a.cmax - a.dmax) * 0.14;
      if (Math.abs(a.dmin - a.cmin) < 0.01) a.dmin = a.cmin;
      if (Math.abs(a.dmax - a.cmax) < 0.01) a.dmax = a.cmax;
      const yMin = a.dmin;
      const yMax = a.dmax;
      const y = (p: number) => padT + (1 - (p - yMin) / (yMax - yMin)) * plotH;
      const x = (i: number) => 4 + i * step + step / 2;

      // ---- grid + labels ----
      ctx.lineWidth = 1;
      ctx.font = `${mini ? 10 : 11}px Cascadia Mono, Consolas, monospace`;
      const gridStep = niceStep((yMax - yMin) / (mini ? 4 : 6), q);
      ctx.textBaseline = "middle";
      for (let p = Math.ceil(yMin / gridStep) * gridStep; p <= yMax; p += gridStep) {
        const yy = Math.round(y(p)) + 0.5;
        ctx.strokeStyle = "rgba(148,163,184,0.08)";
        ctx.beginPath();
        ctx.moveTo(0, yy);
        ctx.lineTo(plotW + 6, yy);
        ctx.stroke();
        ctx.fillStyle = "#7b8794";
        ctx.fillText(p.toLocaleString("en-IN", { maximumFractionDigits: 2 }), plotW + 10, yy);
      }
      // time labels
      ctx.textBaseline = "alphabetic";
      ctx.fillStyle = "#6b7684";
      const every = Math.max(1, Math.round(n / (mini ? 4 : 8)));
      for (let i = 0; i < n; i += every) {
        const dt = new Date(c[i].t + 5.5 * 3600_000).toISOString().slice(11, 16);
        ctx.fillText(dt, Math.max(2, x(i) - 12), padT + plotH + 13);
      }

      // ---- volume sub-panel ----
      if (volH) {
        const vTop = padT + plotH + 18;
        const vh = volH - 22;
        const vmax = Math.max(...c.map((k) => k.v));
        for (let i = 0; i < n; i++) {
          const up = c[i].c >= c[i].o;
          ctx.fillStyle = up ? "rgba(16,185,129,0.45)" : "rgba(239,68,68,0.45)";
          const bh = (c[i].v / vmax) * vh;
          ctx.fillRect(x(i) - bw / 2, vTop + vh - bh, bw, bh);
        }
        ctx.fillStyle = "#6b7684";
        ctx.fillText("VOL", 6, vTop + 10);
      }

      // ---- candles ----
      for (let i = 0; i < n; i++) {
        const k = c[i];
        const up = k.c >= k.o;
        const col = up ? BULL : BEAR;
        ctx.strokeStyle = col;
        ctx.fillStyle = col;
        ctx.beginPath();
        const xx = Math.round(x(i)) + 0.5;
        ctx.moveTo(xx, y(k.h));
        ctx.lineTo(xx, y(k.l));
        ctx.stroke();
        const top = y(Math.max(k.o, k.c));
        const bh = Math.max(1, Math.abs(y(k.o) - y(k.c)));
        ctx.fillRect(x(i) - bw / 2, top, bw, bh);
      }

      // ---- overlays: VWAP, EMA9, EMA21 ----
      const line = (arr: number[], color: string, wd: number, dash: number[] = []) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = wd;
        ctx.setLineDash(dash);
        ctx.beginPath();
        arr.forEach((v, i) => (i === 0 ? ctx.moveTo(x(i), y(v)) : ctx.lineTo(x(i), y(v))));
        ctx.stroke();
        ctx.setLineDash([]);
      };
      line(d.vwap, AMBER, 1.4, [5, 3]);
      line(d.ema9, CYAN, 1.5);
      line(d.ema21, VIOLET, 1.5);
      ctx.lineWidth = 1;

      // ---- position bracket lines ----
      const ov = overlayRef.current;
      if (ov && !mini) {
        const hl = (price: number | undefined, color: string, tag: string) => {
          if (price === undefined || price < yMin || price > yMax) return;
          const yy = Math.round(y(price)) + 0.5;
          ctx.strokeStyle = color;
          ctx.setLineDash([3, 3]);
          ctx.beginPath();
          ctx.moveTo(0, yy);
          ctx.lineTo(plotW + 6, yy);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = color;
          ctx.fillText(`${tag} ${price.toFixed(2)}`, 8, yy - 5);
        };
        hl(ov.entry, CYAN, ov.side ?? "ENTRY");
        hl(ov.sl, BEAR, "SL");
        hl(ov.target, BULL, "TGT");
      }

      // ---- last price tag ----
      const lastC = c[n - 1];
      const livePx = d.ltp ?? lastC.c;
      const ly = y(livePx);
      const col = lastC.c >= lastC.o ? BULL : BEAR;
      ctx.strokeStyle = col;
      ctx.globalAlpha = 0.5;
      ctx.setLineDash([2, 3]);
      ctx.beginPath();
      ctx.moveTo(0, Math.round(ly) + 0.5);
      ctx.lineTo(plotW + 6, Math.round(ly) + 0.5);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      ctx.fillStyle = col;
      ctx.fillRect(plotW + 6, ly - 9, padR - 4, 18);
      ctx.fillStyle = "#04120d";
      ctx.textBaseline = "middle";
      ctx.fillText(livePx.toLocaleString("en-IN", { maximumFractionDigits: 2 }), plotW + 9, ly);

      // ---- hover crosshair ----
      const m = mouse.current;
      if (m && !mini && m.x < plotW + 6 && m.y > padT && m.y < padT + plotH) {
        const idx = Math.min(n - 1, Math.max(0, Math.floor((m.x - 4) / step)));
        ctx.strokeStyle = "rgba(0,229,255,0.45)";
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(Math.round(x(idx)) + 0.5, padT);
        ctx.lineTo(Math.round(x(idx)) + 0.5, padT + plotH);
        ctx.moveTo(0, Math.round(m.y) + 0.5);
        ctx.lineTo(plotW + 6, Math.round(m.y) + 0.5);
        ctx.stroke();
        ctx.setLineDash([]);
        const price = yMax - ((m.y - padT) / plotH) * (yMax - yMin);
        ctx.fillStyle = "#0e5f6b";
        ctx.fillRect(plotW + 6, m.y - 9, padR - 4, 18);
        ctx.fillStyle = "#e6edf3";
        ctx.fillText(price.toFixed(2), plotW + 9, m.y);
        const k = c[idx];
        const txt = `${new Date(k.t + 5.5 * 3600_000).toISOString().slice(11, 16)}  O ${k.o}  H ${k.h}  L ${k.l}  C ${k.c}  V ${k.v}`;
        ctx.font = "11px Cascadia Mono, Consolas, monospace";
        const tw = ctx.measureText(txt).width + 14;
        ctx.fillStyle = "rgba(8,11,16,0.9)";
        ctx.fillRect(8, padT + 4, tw, 20);
        ctx.fillStyle = "#e6edf3";
        ctx.fillText(txt, 15, padT + 14);
      }

      if (!d.ws?.connected) {
        ctx.font = "10.5px Segoe UI, sans-serif";
        const lockText = `🔒 FROZEN AT SESSION CLOSE — LTP ₹${livePx.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
        ctx.fillStyle = "rgba(245, 158, 11, 0.18)";
        ctx.strokeStyle = "rgba(245, 158, 11, 0.5)";
        const ltw = ctx.measureText(lockText).width + 16;
        ctx.fillRect(plotW - ltw - 4, padT + 4, ltw, 20);
        ctx.strokeRect(plotW - ltw - 4, padT + 4, ltw, 20);
        ctx.fillStyle = "#f59e0b";
        ctx.fillText(lockText, plotW - ltw + 4, padT + 14);
      }
      ctx.textBaseline = "alphabetic";
    };

    drawRef.current = draw;
    const timer = setInterval(draw, 33); // decoupled 30 FPS render loop + instant SSE tick paint
    draw();
    return () => {
      drawRef.current = null;
      clearInterval(timer);
    };
  }, [mini]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: "100%", height, display: "block" }}
      onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        mouse.current = { x: e.clientX - r.left, y: e.clientY - r.top };
      }}
      onMouseLeave={() => (mouse.current = null)}
    />
  );
}

function niceStep(raw: number, q: number) {
  const mag = Math.pow(10, Math.floor(Math.log10(Math.max(raw, 1e-6))));
  const norm = raw / mag;
  const s = norm < 1.5 ? 1 : norm < 3.5 ? 2 : norm < 7.5 ? 5 : 10;
  return Math.max(q >= 5 ? 1 : 0.5, s * mag);
}
