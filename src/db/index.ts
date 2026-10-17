import Database from "better-sqlite3";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config } from "../config.js";
import { logger } from "../logger.js";

const here = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(here, "schema.sql");

export type Db = Database.Database;

let schemaCache: string | undefined;

function loadSchema(): string {
  schemaCache ??= readFileSync(schemaPath, "utf8");
  return schemaCache;
}

export function applySchema(db: Db): void {
  db.exec(loadSchema());
}

/**
 * Open a SQLite database, enable sensible pragmas, and apply the schema.
 * Pass ":memory:" for tests.
 */
export function openDatabase(dbPath: string = config.DB_PATH): Db {
  if (dbPath !== ":memory:") {
    mkdirSync(dirname(dbPath), { recursive: true });
  }
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  applySchema(db);
  return db;
}

let singleton: Db | undefined;

/** Shared application database handle (lazily opened). */
export function getDb(): Db {
  if (!singleton) {
    singleton = openDatabase();
    logger.info({ dbPath: config.DB_PATH }, "SQLite database opened");
  }
  return singleton;
}

/** Liveness/readiness probe for the database. */
export function isDbReady(db: Db = getDb()): boolean {
  try {
    db.prepare("SELECT 1").get();
    return true;
  } catch {
    return false;
  }
}

export function closeDb(): void {
  singleton?.close();
  singleton = undefined;
}
