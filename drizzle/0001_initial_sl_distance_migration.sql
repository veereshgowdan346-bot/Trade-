-- ============================================================================
-- OMNITRADEPRO APEX V2.0 — PHASE 6.8 DATABASE MIGRATION SCRIPT
-- Migration: Add initial_sl_distance to positions table for existing databases
-- ============================================================================

-- Step 1: Add initial_sl_distance column if not already present
ALTER TABLE "positions" ADD COLUMN IF NOT EXISTS "initial_sl_distance" double precision;

-- Step 2: Backfill existing legacy rows from linked orders where possible
UPDATE "positions" p
SET "initial_sl_distance" = ABS(p."entry_price" - o."sl_price")
FROM "orders" o
WHERE p."order_id" = o."id"
  AND p."initial_sl_distance" IS NULL
  AND o."sl_price" IS NOT NULL
  AND ABS(p."entry_price" - o."sl_price") > 0;

-- Step 3: Verify no invalid negative or NaN values exist
UPDATE "positions"
SET "initial_sl_distance" = NULL
WHERE "initial_sl_distance" <= 0;
