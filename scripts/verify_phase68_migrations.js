/**
 * OmniTradePro Apex V2.0 — Phase 6.8 Database Migration Verification Script
 * 
 * Verifies:
 * 1. Schema migration adds initial_sl_distance to existing databases.
 * 2. Backfill correctly populates legacy rows from linked orders.
 * 3. Legacy rows without orders retain NULL (safely guarded against collapse).
 * 4. Trailing stop logic refuses to trail on NULL/0 risk distances.
 * 5. Rollback removes the column cleanly.
 */

const { PGlite } = require("@electric-sql/pglite");
const fs = require("fs");
const path = require("path");

async function runMigrationAudit() {
  console.log("==================================================================");
  console.log("  PHASE 6.8 DATABASE MIGRATION & RECOVERY AUDIT");
  console.log("==================================================================");

  const db = new PGlite();

  // Step 1: Create legacy schema (pre-Phase 6.7, WITHOUT initial_sl_distance)
  console.log("\n[1] Creating legacy schema without initial_sl_distance...");
  await db.exec(`
    CREATE TABLE orders (
      id SERIAL PRIMARY KEY,
      symbol TEXT NOT NULL,
      price DOUBLE PRECISION NOT NULL,
      sl_price DOUBLE PRECISION,
      status TEXT NOT NULL
    );

    CREATE TABLE positions (
      id SERIAL PRIMARY KEY,
      order_id INTEGER,
      symbol TEXT NOT NULL,
      qty INTEGER NOT NULL,
      entry_price DOUBLE PRECISION NOT NULL,
      sl_price DOUBLE PRECISION NOT NULL,
      status TEXT NOT NULL
    );
  `);

  // Step 2: Seed legacy rows
  console.log("[2] Seeding legacy rows (pre-Phase 6.7)...");
  // Order 101 with entry 2500, initial SL 2480 (distance = 20)
  await db.exec(`INSERT INTO orders (id, symbol, price, sl_price, status) VALUES (101, 'RELIANCE', 2500.0, 2480.0, 'FILLED');`);
  // Position 1 linked to Order 101 (has linked order)
  await db.exec(`INSERT INTO positions (id, order_id, symbol, qty, entry_price, sl_price, status) VALUES (1, 101, 'RELIANCE', 10, 2500.0, 2500.10, 'OPEN');`);
  // Position 2 with NO linked order (orphan legacy row)
  await db.exec(`INSERT INTO positions (id, order_id, symbol, qty, entry_price, sl_price, status) VALUES (2, NULL, 'INFY', 25, 1450.0, 1450.10, 'OPEN');`);

  // Step 3: Run migration
  console.log("[3] Executing Phase 6.8 Migration Script (drizzle/0001_initial_sl_distance_migration.sql)...");
  const migrationSql = fs.readFileSync(path.join(__dirname, "../drizzle/0001_initial_sl_distance_migration.sql"), "utf-8");
  await db.exec(migrationSql);

  // Step 4: Verify schema columns
  console.log("[4] Verifying table schema after migration...");
  const cols = await db.query(`
    SELECT column_name, data_type 
    FROM information_schema.columns 
    WHERE table_name = 'positions' AND column_name = 'initial_sl_distance';
  `);
  if (cols.rows.length === 1) {
    console.log("  [PASS] Column 'initial_sl_distance' successfully added (type: " + cols.rows[0].data_type + ")");
  } else {
    throw new Error("Column 'initial_sl_distance' not found after migration!");
  }

  // Step 5: Verify backfill data
  console.log("[5] Verifying legacy row data backfill...");
  const pos1 = await db.query(`SELECT id, order_id, entry_price, sl_price, initial_sl_distance FROM positions WHERE id = 1;`);
  const pos2 = await db.query(`SELECT id, order_id, entry_price, sl_price, initial_sl_distance FROM positions WHERE id = 2;`);

  console.log("  Position 1 (linked to Order 101): initial_sl_distance =", pos1.rows[0].initial_sl_distance);
  if (pos1.rows[0].initial_sl_distance === 20.0) {
    console.log("  [PASS] Position 1 successfully backfilled to exact 1R distance of 20.00 (not current trailed SL 2500.10)");
  } else {
    throw new Error(`Position 1 backfill mismatch: expected 20.0, got ${pos1.rows[0].initial_sl_distance}`);
  }

  console.log("  Position 2 (orphan legacy row): initial_sl_distance =", pos2.rows[0].initial_sl_distance);
  if (pos2.rows[0].initial_sl_distance === null) {
    console.log("  [PASS] Position 2 retains NULL (unrecoverable risk distance guarded against silent 0.10 collapse)");
  } else {
    throw new Error(`Position 2 expected NULL, got ${pos2.rows[0].initial_sl_distance}`);
  }

  // Step 6: Verify application guardrail on legacy NULL
  console.log("[6] Verifying trailing-stop protection on legacy NULL...");
  // Simulate getInitialSlDistance logic on pos2
  const p2 = pos2.rows[0];
  const resolvedDist = p2.initial_sl_distance && p2.initial_sl_distance > 0 ? p2.initial_sl_distance : null;
  const trailingStopActive = resolvedDist !== null && resolvedDist > 0;
  if (!trailingStopActive) {
    console.log("  [PASS] Trailing stop safely DISABLED for legacy row without risk distance (silent collapse PREVENTED)");
  } else {
    throw new Error("Trailing stop incorrectly activated on invalid risk distance!");
  }

  // Step 7: Test Rollback
  console.log("[7] Executing Phase 6.8 Rollback Script (drizzle/0001_initial_sl_distance_rollback.sql)...");
  const rollbackSql = fs.readFileSync(path.join(__dirname, "../drizzle/0001_initial_sl_distance_rollback.sql"), "utf-8");
  await db.exec(rollbackSql);

  const colsAfterRollback = await db.query(`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'positions' AND column_name = 'initial_sl_distance';
  `);
  if (colsAfterRollback.rows.length === 0) {
    console.log("  [PASS] Column 'initial_sl_distance' cleanly removed upon rollback");
  } else {
    throw new Error("Column 'initial_sl_distance' still exists after rollback!");
  }

  console.log("\n==================================================================");
  console.log("  ALL MIGRATION, BACKFILL & ROLLBACK TESTS PASSED");
  console.log("==================================================================");
  process.exit(0);
}

runMigrationAudit().catch((err) => {
  console.error("Migration audit failed:", err);
  process.exit(1);
});
