import { app } from "electron";
import path from "node:path";
import fs from "node:fs";
import { createRequire } from "node:module";
import type BetterSqlite3 from "better-sqlite3";

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3") as typeof BetterSqlite3;

let db: BetterSqlite3.Database | null = null;

export function getDb() {
  if (db) return db;

  const dir = path.join(app.getPath("userData"), "data");
  fs.mkdirSync(dir, { recursive: true });

  const dbPath = path.join(dir, "pokementor.sqlite");
  db = new Database(dbPath);

  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");

  return db;
}

export async function migrate() {
  await app.whenReady();
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS battles (
      id TEXT PRIMARY KEY,
      played_at TEXT NOT NULL,
      format TEXT,
      result TEXT,
      raw_log TEXT
    );
  `);
}