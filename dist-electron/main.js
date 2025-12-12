import { app, BrowserWindow, ipcMain } from "electron";
import path, { dirname } from "node:path";
import fs from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const require$1 = createRequire(import.meta.url);
const Database = require$1("better-sqlite3");
let db = null;
function getDb() {
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
async function migrate() {
  await app.whenReady();
  const db2 = getDb();
  db2.exec(`
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
function insertBattle(args) {
  const db2 = getDb();
  const stmt = db2.prepare(`
    INSERT INTO battles (id, played_at, format, result, raw_log)
    VALUES (@id, @played_at, @format, @result, @raw_log)
    ON CONFLICT(id) DO UPDATE SET
      played_at=excluded.played_at,
      format=excluded.format,
      result=excluded.result,
      raw_log=excluded.raw_log
  `);
  stmt.run({
    id: args.id,
    played_at: args.played_at,
    format: args.format ?? null,
    result: args.result ?? null,
    raw_log: args.raw_log ?? null
  });
}
function listRecentBattles(limit = 20) {
  const db2 = getDb();
  const stmt = db2.prepare(`
    SELECT id, played_at, format, result
    FROM battles
    ORDER BY played_at DESC
    LIMIT ?
  `);
  return stmt.all(limit);
}
const __filename$1 = fileURLToPath(import.meta.url);
const __dirname$1 = dirname(__filename$1);
process.env.APP_ROOT = path.join(__dirname$1, "..");
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, "public") : RENDERER_DIST;
let win = null;
function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, "electron-vite.svg"),
    webPreferences: {
      preload: path.join(__dirname$1, "preload.mjs")
    }
  });
  win.webContents.on("did-finish-load", () => {
    win == null ? void 0 : win.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
  });
  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(RENDERER_DIST, "index.html"));
  }
}
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
    win = null;
  }
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
app.whenReady().then(() => {
  migrate();
  ipcMain.handle("db:battleInsert", (_evt, args) => {
    insertBattle(args);
    return { ok: true };
  });
  ipcMain.handle("db:battleListRecent", (_evt, limit) => {
    return listRecentBattles(limit ?? 20);
  });
  createWindow();
});
export {
  MAIN_DIST,
  RENDERER_DIST,
  VITE_DEV_SERVER_URL
};
