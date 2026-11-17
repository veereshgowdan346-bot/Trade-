"use client";

import type { ReactNode } from "react";

export const inr = (n: number | null | undefined, d = 2) =>
  n === null || n === undefined || Number.isNaN(n)
    ? "—"
    : `${n < 0 ? "-" : ""}₹${Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d })}`;

export const num = (n: number | null | undefined, d = 2) =>
  n === null || n === undefined ? "—" : n.toLocaleString("en-IN", { minimumFractionDigits: d, maximumFractionDigits: d });

export const pnlClass = (n: number | null | undefined) => ((n ?? 0) > 0 ? "up" : (n ?? 0) < 0 ? "down" : "muted");

export const istTime = (iso: string | number | null) => {
  if (!iso) return "—";
  const d = new Date(typeof iso === "string" ? iso : iso);
  return new Date(d.getTime() + 5.5 * 3600_000).toISOString().slice(11, 19);
};

export async function api<T = unknown>(path: string, body?: unknown, method?: string): Promise<T> {
  const res = await fetch(path, {
    method: method ?? (body === undefined ? "GET" : "POST"),
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  return (await res.json()) as T;
}

export function Panel({
  title,
  right,
  children,
  className = "",
  bodyClass = "p-3",
}: {
  title?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClass?: string;
}) {
  return (
    <section className={`glass flex flex-col min-h-0 ${className}`}>
      {title && (
        <header className="flex items-center justify-between px-3 h-9 border-b" style={{ borderColor: "var(--line)" }}>
          <h3 className="label !text-[11px] !text-[#aab4c0]">{title}</h3>
          <div className="flex items-center gap-2">{right}</div>
        </header>
      )}
      <div className={`${bodyClass} min-h-0 flex-1`}>{children}</div>
    </section>
  );
}

export function Stat({ label, value, sub, cls = "" }: { label: string; value: ReactNode; sub?: ReactNode; cls?: string }) {
  return (
    <div className="min-w-0">
      <div className="label">{label}</div>
      <div className={`mono text-[17px] font-semibold leading-tight ${cls}`}>{value}</div>
      {sub && <div className="text-[11px] muted mono">{sub}</div>}
    </div>
  );
}

export function Badge({ tone = "mute", children, className = "" }: { tone?: "bull" | "bear" | "cyan" | "amber" | "mute"; children: ReactNode; className?: string }) {
  return <span className={`badge badge-${tone} ${className}`}>{children}</span>;
}

export function statusTone(status: string): "bull" | "bear" | "cyan" | "amber" | "mute" {
  if (status === "FILLED" || status === "CONNECTED" || status === "PREFLIGHT_OK") return "bull";
  if (status.startsWith("REJECTED") || status === "ERROR") return "bear";
  if (status === "CONFIGURED") return "cyan";
  return "mute";
}

export function regimeTone(r: string): "bull" | "bear" | "cyan" | "amber" | "mute" {
  return r === "TRENDING_BULL" ? "bull" : r === "TRENDING_BEAR" ? "bear" : r === "VOLATILITY_EXPANSION" ? "amber" : "cyan";
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="py-8 text-center text-[12px] muted">{children}</div>;
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="block">
      <span className="label block mb-1">{label}</span>
      {children}
      {hint && <span className="text-[10.5px] muted block mt-1">{hint}</span>}
    </label>
  );
}
