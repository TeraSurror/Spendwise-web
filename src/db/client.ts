import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { paths } from "../lib/paths";
import * as schema from "./schema";
import { seed } from "./seed";

export type DB = BetterSQLite3Database<typeof schema> & { $client: Database.Database };

const migrationsFolder = () =>
  process.env.SPENDWISE_MIGRATIONS ?? path.join(process.cwd(), "src", "db", "migrations");

/** Opens (creating if needed) a database, applies migrations and seeds defaults. Pass ":memory:" in tests. */
export function openDb(file: string): DB {
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const sqlite = new Database(file);
  sqlite.pragma("journal_mode = WAL");
  sqlite.pragma("foreign_keys = ON");
  sqlite.pragma("busy_timeout = 5000");
  const db = drizzle(sqlite, { schema }) as DB;
  migrate(db, { migrationsFolder: migrationsFolder() });
  seed(db);
  return db;
}

// Cached on globalThis so Next.js hot reloads don't open a new connection each time.
const g = globalThis as unknown as { __spendwiseDb?: DB };

export function getDb(): DB {
  if (!g.__spendwiseDb) g.__spendwiseDb = openDb(paths.db);
  return g.__spendwiseDb;
}
