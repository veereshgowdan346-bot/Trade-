import {
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/** AES-256-GCM encrypted credential blobs (Angel One / Shoonya / Groww / SMTP). */
export const vaultCredentials = pgTable("vault_credentials", {
  broker: text("broker").primaryKey(),
  ciphertext: text("ciphertext").notNull(),
  iv: text("iv").notNull(),
  tag: text("tag").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Generic key/value store: risk config, routing, circuit breaker, balances, scheduler marks. */
export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Order ledger: every order attempt, including rejections, with routing payloads. */
export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  ts: timestamp("ts", { withTimezone: true }).defaultNow().notNull(),
  symbol: text("symbol").notNull(),
  exchange: text("exchange").notNull(),
  side: text("side").notNull(),
  qty: integer("qty").notNull().default(0),
  orderType: text("order_type").notNull().default("MARKET"),
  price: doublePrecision("price").notNull().default(0),
  status: text("status").notNull(),
  mode: text("mode").notNull().default("PAPER"),
  source: text("source").notNull().default("MANUAL"),
  strategy: text("strategy").notNull().default("MANUAL"),
  brokerRequested: text("broker_requested"),
  brokerUsed: text("broker_used"),
  failover: boolean("failover").notNull().default(false),
  latencyMs: integer("latency_ms").notNull().default(0),
  slPrice: doublePrecision("sl_price"),
  targetPrice: doublePrecision("target_price"),
  expectedNet: doublePrecision("expected_net"),
  reason: text("reason"),
  payload: jsonb("payload"),
});

/** Positions: open while status = OPEN, an executed trade once CLOSED. */
export const positions = pgTable("positions", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id"),
  symbol: text("symbol").notNull(),
  exchange: text("exchange").notNull(),
  side: text("side").notNull(),
  qty: integer("qty").notNull(),
  entryPrice: doublePrecision("entry_price").notNull(),
  slPrice: doublePrecision("sl_price").notNull(),
  targetPrice: doublePrecision("target_price").notNull(),
  initialSlDistance: doublePrecision("initial_sl_distance"),
  strategy: text("strategy").notNull(),
  broker: text("broker").notNull(),
  mode: text("mode").notNull().default("PAPER"),
  status: text("status").notNull().default("OPEN"),
  openedAt: timestamp("opened_at", { withTimezone: true }).defaultNow().notNull(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  exitPrice: doublePrecision("exit_price"),
  exitReason: text("exit_reason"),
  grossPnl: doublePrecision("gross_pnl"),
  charges: jsonb("charges"),
  totalCharges: doublePrecision("total_charges"),
  netPnl: doublePrecision("net_pnl"),
});

/** SQLite-style audit trail (kept in Postgres here). */
export const auditLogs = pgTable("audit_logs", {
  id: serial("id").primaryKey(),
  ts: timestamp("ts", { withTimezone: true }).defaultNow().notNull(),
  level: text("level").notNull().default("INFO"),
  category: text("category").notNull(),
  message: text("message").notNull(),
  data: jsonb("data"),
});

/** Cached daily scrip master rows (NSE / NFO / MCX) resolved per broker. */
export const scrips = pgTable("scrips", {
  id: serial("id").primaryKey(),
  exchange: text("exchange").notNull(),
  symbol: text("symbol").notNull(),
  tradingSymbol: text("trading_symbol").notNull(),
  token: text("token").notNull(),
  expiry: text("expiry"),
  lotSize: integer("lot_size").notNull().default(1),
  instrumentType: text("instrument_type"),
  ingestedAt: timestamp("ingested_at", { withTimezone: true }).defaultNow().notNull(),
});
