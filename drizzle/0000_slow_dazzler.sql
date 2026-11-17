CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"ts" timestamp with time zone DEFAULT now() NOT NULL,
	"level" text DEFAULT 'INFO' NOT NULL,
	"category" text NOT NULL,
	"message" text NOT NULL,
	"data" jsonb
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"ts" timestamp with time zone DEFAULT now() NOT NULL,
	"symbol" text NOT NULL,
	"exchange" text NOT NULL,
	"side" text NOT NULL,
	"qty" integer DEFAULT 0 NOT NULL,
	"order_type" text DEFAULT 'MARKET' NOT NULL,
	"price" double precision DEFAULT 0 NOT NULL,
	"status" text NOT NULL,
	"mode" text DEFAULT 'PAPER' NOT NULL,
	"source" text DEFAULT 'MANUAL' NOT NULL,
	"strategy" text DEFAULT 'MANUAL' NOT NULL,
	"broker_requested" text,
	"broker_used" text,
	"failover" boolean DEFAULT false NOT NULL,
	"latency_ms" integer DEFAULT 0 NOT NULL,
	"sl_price" double precision,
	"target_price" double precision,
	"expected_net" double precision,
	"reason" text,
	"payload" jsonb
);
--> statement-breakpoint
CREATE TABLE "positions" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer,
	"symbol" text NOT NULL,
	"exchange" text NOT NULL,
	"side" text NOT NULL,
	"qty" integer NOT NULL,
	"entry_price" double precision NOT NULL,
	"sl_price" double precision NOT NULL,
	"target_price" double precision NOT NULL,
	"initial_sl_distance" double precision,
	"strategy" text NOT NULL,
	"broker" text NOT NULL,
	"mode" text DEFAULT 'PAPER' NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"exit_price" double precision,
	"exit_reason" text,
	"gross_pnl" double precision,
	"charges" jsonb,
	"total_charges" double precision,
	"net_pnl" double precision
);
--> statement-breakpoint
CREATE TABLE "scrips" (
	"id" serial PRIMARY KEY NOT NULL,
	"exchange" text NOT NULL,
	"symbol" text NOT NULL,
	"trading_symbol" text NOT NULL,
	"token" text NOT NULL,
	"expiry" text,
	"lot_size" integer DEFAULT 1 NOT NULL,
	"instrument_type" text,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "vault_credentials" (
	"broker" text PRIMARY KEY NOT NULL,
	"ciphertext" text NOT NULL,
	"iv" text NOT NULL,
	"tag" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
