import fs from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle as drizzlePg, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL?.trim() || "pglite://./data/omnitrade-pg";
const isPostgres = /^postgres(ql)?:\/\//i.test(databaseUrl);

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
  __omniPglite?: PGlite;
  __omniDb?: NodePgDatabase;
};

function getDb(): NodePgDatabase {
  if (globalForDb.__omniDb) return globalForDb.__omniDb;

  if (isPostgres) {
    const pool =
      globalForDb.__arenaNextJsPostgresqlPool ??
      new Pool({
        connectionString: databaseUrl,
      });
    globalForDb.__arenaNextJsPostgresqlPool = pool;
    globalForDb.__omniDb = drizzlePg(pool);
    return globalForDb.__omniDb;
  }

  const rawPath = databaseUrl.replace(/^pglite:\/\//i, "").replace(/^file:/i, "") || "./data/omnitrade-pg";
  const resolvedPath = path.resolve(/*turbopackIgnore: true*/ process.cwd(), rawPath);
  fs.mkdirSync(resolvedPath, { recursive: true });
  const client = globalForDb.__omniPglite ?? new PGlite(resolvedPath);
  globalForDb.__omniPglite = client;
  globalForDb.__omniDb = drizzlePglite(client) as unknown as NodePgDatabase;
  return globalForDb.__omniDb;
}

export const db = new Proxy({} as NodePgDatabase, {
  get(_target, prop) {
    const inst = getDb() as unknown as Record<PropertyKey, unknown>;
    const val = Reflect.get(inst, prop, inst);
    return typeof val === "function" ? val.bind(inst) : val;
  },
});

export const dbDialect = isPostgres ? "postgresql" : "pglite";
