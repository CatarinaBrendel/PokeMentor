import { app, ipcMain, BrowserWindow } from "electron";
import { fileURLToPath } from "node:url";
import path, { dirname } from "node:path";
import fs from "node:fs";
import { createRequire } from "node:module";
import crypto from "node:crypto";
const require$1 = createRequire(import.meta.url);
const Database = require$1("better-sqlite3");
let db = null;
function getDb() {
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
const __filename$2 = fileURLToPath(import.meta.url);
const __dirname$2 = path.dirname(__filename$2);
function findMigrationsDir() {
  const candidates = [
    // when bundled/copied: dist-electron/db/migrations (because migrate.js ends up in dist-electron/db)
    path.join(__dirname$2, "migrations"),
    // when running from source during dev (fallback)
    path.join(process.cwd(), "electron", "db", "migrations")
  ];
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }
  throw new Error(
    `Migrations directory not found. Tried:
${candidates.map((d) => `- ${d}`).join("\n")}`
  );
}
function runMigrations() {
  const db2 = getDb();
  db2.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL
    );
  `);
  const migrationsDir = findMigrationsDir();
  const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
  console.log("[migrate] found", files.length, "migration files:", files);
  const appliedRows = db2.prepare("SELECT name FROM schema_migrations").all();
  const applied = new Set(appliedRows.map((r) => r.name));
  console.log("[migrate] already applied:", [...applied]);
  let appliedNow = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const fullPath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(fullPath, "utf8");
    console.log("[migrate] applying", file);
    db2.transaction(() => {
      db2.exec(sql);
      db2.prepare(
        "INSERT INTO schema_migrations (name, applied_at) VALUES (?, datetime('now'))"
      ).run(file);
    })();
    appliedNow += 1;
  }
  console.log("[migrate] done. newly applied:", appliedNow);
}
function uuid() {
  return crypto.randomUUID();
}
function listTeams() {
  const db2 = getDb();
  return db2.prepare(
    `
      SELECT id, name, format_ps, created_at, updated_at
      FROM teams
      ORDER BY updated_at DESC
      `
  ).all();
}
function insertTeam(team) {
  const db2 = getDb();
  const id = uuid();
  const now = (/* @__PURE__ */ new Date()).toISOString();
  db2.prepare(
    `
    INSERT INTO teams (id, name, format_ps, created_at, updated_at)
    VALUES (@id, @name, @format_ps, @created_at, @updated_at)
    `
  ).run({
    id,
    name: team.name ?? null,
    format_ps: team.formatPs ?? null,
    created_at: now,
    updated_at: now
  });
  return id;
}
function registerDbHandlers() {
  ipcMain.handle("db:teams:list", async () => {
    return listTeams();
  });
  ipcMain.handle(
    "db:teams:insert",
    async (_evt, team) => {
      const id = insertTeam(team);
      return { ok: true, id };
    }
  );
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
    width: 1380,
    height: 800,
    minWidth: 1280,
    minHeight: 720,
    icon: path.join(process.env.VITE_PUBLIC, "electron-vite.svg"),
    webPreferences: {
      preload: path.join(__dirname$1, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false
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
app.whenReady().then(async () => {
  try {
    await runMigrations();
    registerDbHandlers();
  } catch (err) {
    console.error("Migration failed:", err);
  }
  createWindow();
});
export {
  MAIN_DIST,
  RENDERER_DIST,
  VITE_DEV_SERVER_URL
};
