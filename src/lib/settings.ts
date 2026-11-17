import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { appSettings, auditLogs } from "@/db/schema";
import { DEFAULT_RISK, normaliseRisk, type RiskConfig } from "./risk";

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const rows = await db.select().from(appSettings).where(eq(appSettings.key, key));
  return rows[0] ? (rows[0].value as T) : fallback;
}

export async function setSetting(key: string, value: unknown) {
  await db
    .insert(appSettings)
    .values({ key, value: value as object })
    .onConflictDoUpdate({ target: appSettings.key, set: { value: value as object, updatedAt: new Date() } });
}

export async function getRisk(): Promise<RiskConfig> {
  const stored = await getSetting<Partial<RiskConfig>>("risk", {});
  return normaliseRisk({ ...DEFAULT_RISK, ...stored });
}

export async function saveRisk(patch: Partial<RiskConfig>): Promise<RiskConfig> {
  const cur = await getRisk();
  const next = normaliseRisk({ ...cur, ...patch, simulateDrop: { ...cur.simulateDrop, ...(patch.simulateDrop ?? {}) } });
  await setSetting("risk", next);
  return next;
}

export type Level = "INFO" | "WARN" | "ERROR" | "CRITICAL";

const SENSITIVE_KEY_REGEX = /password|pin|secret|token|apikey|jwt|auth|credential|cookie|private|bearer|totp|seed/i;

export function sanitizeSensitiveData(val: unknown, depth = 0): unknown {
  if (depth > 10 || val === null || val === undefined) return val;
  if (typeof val === "string") {
    // Redact Bearer tokens or obvious JWT patterns
    if (/bearer\s+[a-zA-Z0-9_\-\.]+/i.test(val)) {
      return val.replace(/bearer\s+[a-zA-Z0-9_\-\.]+/gi, "Bearer [REDACTED]");
    }
    if (/^[a-zA-Z0-9_\-]{20,}\.[a-zA-Z0-9_\-]{20,}\.[a-zA-Z0-9_\-]{20,}$/.test(val)) {
      return "[REDACTED_JWT]";
    }
    return val;
  }
  if (Array.isArray(val)) {
    return val.map((item) => sanitizeSensitiveData(item, depth + 1));
  }
  if (typeof val === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      if (SENSITIVE_KEY_REGEX.test(k)) {
        out[k] = "[REDACTED]";
      } else {
        out[k] = sanitizeSensitiveData(v, depth + 1);
      }
    }
    return out;
  }
  return val;
}

export async function audit(level: Level, category: string, message: string, data?: unknown) {
  try {
    const cleanData = data !== undefined ? sanitizeSensitiveData(data) : null;
    let cleanMessage = message;
    if (/bearer\s+[a-zA-Z0-9_\-\.]+/i.test(cleanMessage)) {
      cleanMessage = cleanMessage.replace(/bearer\s+[a-zA-Z0-9_\-\.]+/gi, "Bearer [REDACTED]");
    }
    await db.insert(auditLogs).values({ level, category, message: cleanMessage, data: cleanData as object | null });
  } catch (e) {
    console.error("[audit] failed", e);
  }
}

export async function recentAudit(limit = 80) {
  return db.select().from(auditLogs).orderBy(desc(auditLogs.id)).limit(limit);
}

/* IST helpers */
const IST = 5.5 * 3600_000;
export function istParts(now = Date.now()) {
  const d = new Date(now + IST);
  return {
    date: d.toISOString().slice(0, 10),
    hh: d.getUTCHours(),
    mm: d.getUTCMinutes(),
    minutes: d.getUTCHours() * 60 + d.getUTCMinutes(),
    dow: d.getUTCDay(),
  };
}
export function istDayStartDate(now = Date.now()): Date {
  return new Date(Math.floor((now + IST) / 86_400_000) * 86_400_000 - IST);
}
