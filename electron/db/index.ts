import { app } from "electron";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import type BetterSqlite3 from "better-sqlite3";

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3") as typeof BetterSqlite3;

let db: BetterSqlite3.Database | null = null;

export function getDb() {
  if (db) return db;

  const userData = app.getPath("userData");
  const dir = path.join(userData, "data");
  fs.mkdirSync(dir, { recursive: true });

  const dbPath = path.join(dir, "pokementor.sqlite");

  db = new Database(dbPath);

  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");

  console.log("[db] userData =", userData);
  console.log("[db] dbPath   =", dbPath);

  return db;
}

export function closeDb() {
  db?.close();
  db = null;
}