-- ============================================================================
-- OMNITRADEPRO APEX V2.0 — PHASE 6.8 DATABASE ROLLBACK SCRIPT
-- Rollback: Remove initial_sl_distance column from positions table
-- ============================================================================

-- Safely drop initial_sl_distance column if rolling back to pre-Phase 6.7 schema
ALTER TABLE "positions" DROP COLUMN IF EXISTS "initial_sl_distance";
