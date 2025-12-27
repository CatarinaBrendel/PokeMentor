import { app } from "electron";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import type BetterSqlite3 from "better-sqlite3";

const require = createRequire(import.meta.url);
const Database = require("better-sqlite3") as typeof BetterSqlite3;

let db: BetterSqlite3.Database | null = null;

function ensureDir(p: string) {
  fs.mkdirSync(p, { recursive: true });
}

function exists(p: string) {
  try { return fs.existsSync(p); } catch { return false; }
}

function quarantineDbFiles(dbPath: string, reason: string) {
  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const base = `${dbPath}.bad-${ts}`;

  const files = [
    { from: dbPath, to: base },
    { from: `${dbPath}-wal`, to: `${base}-wal` },
    { from: `${dbPath}-shm`, to: `${base}-shm` },
  ];

  console.warn(`[db] quarantining db files (reason=${reason})`);

  for (const f of files) {
    try {
      if (exists(f.from)) fs.renameSync(f.from, f.to);
    } catch (err) {
      console.warn(`[db] quarantine rename failed: ${f.from} -> ${f.to}`, err);
    }
  }

  return base; // base path of quarantined db
}

function runQuickCheck(d: BetterSqlite3.Database): string {
  // returns 'ok' or error text
  const row = d.prepare("PRAGMA quick_check;").get() as { quick_check: string };
  // better-sqlite3 returns column name "quick_check"
  return String(row?.quick_check ?? "");
}

function runIntegrityCheck(d: BetterSqlite3.Database): string {
  const row = d.prepare("PRAGMA integrity_check;").get() as { integrity_check: string };
  return String(row?.integrity_check ?? "");
}

function tryCheckpoint(d: BetterSqlite3.Database) {
  try {
    // TRUNCATE reduces WAL size; safe to attempt
    d.pragma("wal_checkpoint(TRUNCATE)");
  } catch (err) {
    // Non-fatal
    console.warn("[db] wal_checkpoint failed", err);
  }
}

function hasSqlite3Cli(): boolean {
  const r = spawnSync("sqlite3", ["-version"], { encoding: "utf8" });
  return r.status === 0;
}

function rebuildViaDump(badDbPath: string, rebuiltDbPath: string): { ok: boolean; error?: string } {
  // Uses sqlite3 CLI:
  // sqlite3 bad.db ".dump" | sqlite3 rebuilt.db
  // We do it via spawnSync with shell piping to avoid temp files.
  const cmd = `sqlite3 "${badDbPath}" ".dump" | sqlite3 "${rebuiltDbPath}"`;
  const r = spawnSync(cmd, { shell: true, encoding: "utf8" });

  if (r.status !== 0) {
    return { ok: false, error: r.stderr || r.stdout || "dump/import failed" };
  }
  return { ok: true };
}

function openDbRaw(dbPath: string): BetterSqlite3.Database {
  // Open with conservative options; you can tune verbose / fileMustExist if desired
  return new Database(dbPath);
}

function setRuntimePragmas(d: BetterSqlite3.Database) {
  d.pragma("foreign_keys = ON");
  d.pragma("busy_timeout = 5000");
  d.pragma("journal_mode = WAL");
  d.pragma("synchronous = NORMAL");
}

function validateDbOrThrow(d: BetterSqlite3.Database) {
  const qc = runQuickCheck(d);
  if (qc === "ok") return;

  // quick_check failed; try full integrity_check for better diagnostics
  const ic = runIntegrityCheck(d);
  throw new Error(`sqlite integrity failed: quick_check=${qc}; integrity_check=${ic}`);
}

export function getDb(): BetterSqlite3.Database {
  if (db) return db;

  const userData = app.getPath("userData");
  const dir = path.join(userData, "data");
  ensureDir(dir);

  const dbPath = path.join(dir, "pokementor.sqlite");

  console.log("[db] userData =", userData);
  console.log("[db] dbPath   =", dbPath);

  // Attempt #1: open existing db
  if (exists(dbPath)) {
    try {
      const d = openDbRaw(dbPath);

      // Before setting WAL, attempt checkpoint (helps if wal/shm out of sync)
      tryCheckpoint(d);

      validateDbOrThrow(d);

      setRuntimePragmas(d);
      db = d;
      return db;
    } catch (err) {
      console.error("[db] open/validate failed; will attempt recovery", err);

      // Quarantine
      const quarantinedBase = quarantineDbFiles(dbPath, "open/validate failed");

      // Optional rebuild via dump if sqlite3 exists and quarantined base exists
      if (hasSqlite3Cli() && exists(quarantinedBase)) {
        const rebuiltPath = dbPath; // rebuild into the normal location
        const tmpRebuilt = `${rebuiltPath}.rebuilt-${Date.now()}`;

        const r = rebuildViaDump(quarantinedBase, tmpRebuilt);
        if (r.ok) {
          try {
            const d2 = openDbRaw(tmpRebuilt);
            validateDbOrThrow(d2);
            setRuntimePragmas(d2);
            d2.close();

            // swap in rebuilt db atomically-ish
            try {
              if (exists(rebuiltPath)) fs.unlinkSync(rebuiltPath);
            } catch {}

            fs.renameSync(tmpRebuilt, rebuiltPath);

            const d3 = openDbRaw(rebuiltPath);
            setRuntimePragmas(d3);
            db = d3;

            console.warn("[db] recovery succeeded via sqlite3 .dump rebuild");
            return db;
          } catch (e2) {
            console.error("[db] rebuild validated failed; will fallback to new db", e2);
            try { if (exists(tmpRebuilt)) fs.unlinkSync(tmpRebuilt); } catch {}
          }
        } else {
          console.error("[db] rebuild via dump failed", r.error);
          try { if (exists(tmpRebuilt)) fs.unlinkSync(tmpRebuilt); } catch {}
        }
      } else {
        console.warn("[db] sqlite3 CLI not available; skipping dump rebuild");
      }
    }
  }

  // Fallback: create new db
  console.warn("[db] creating new database");
  const dNew = openDbRaw(dbPath);
  setRuntimePragmas(dNew);
  db = dNew;
  return db;
}

export function closeDb() {
  try { db?.close(); } catch {}
  db = null;
}