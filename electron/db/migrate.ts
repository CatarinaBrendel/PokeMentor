import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { getDb } from "../db/index";


type MigrationRow = { name: string };

function findMigrationsDir() {
  const appRoot = process.env.APP_ROOT; // you already set this in main.ts

  const candidates = [
    // Dev: always stable if APP_ROOT is set
    appRoot ? path.join(appRoot, "electron", "db", "migrations") : null,

    // Packaged: resourcesPath (you may copy migrations there at build time)
    app.isPackaged ? path.join(process.resourcesPath, "db", "migrations") : null,

    // Last-resort fallback (dev only)
    !app.isPackaged ? path.join(process.cwd(), "electron", "db", "migrations") : null,
  ].filter(Boolean) as string[];

  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }

  throw new Error(
    `Migrations directory not found. Tried:\n${candidates.map((d) => `- ${d}`).join("\n")}`
  );
}

export async function runMigrations() {
  await app.whenReady();
  const db = getDb();

  db.pragma("journal_mode = DELETE");
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");

  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      applied_at TEXT NOT NULL
    );
  `);

  const migrationsDir = findMigrationsDir();

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  console.log("[migrate] found", files.length, "migration files:", files);

  const appliedRows = db
    .prepare("SELECT name FROM schema_migrations")
    .all() as MigrationRow[];

  const applied = new Set(appliedRows.map((r) => r.name));
  console.log("[migrate] already applied:", [...applied]);

    let appliedNow = 0;

  for (const file of files) {
    if (applied.has(file)) continue;

    const fullPath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(fullPath, "utf8");

    console.log("[migrate] applying", file);

    db.transaction(() => {
      db.exec(sql);
      db.prepare(
        "INSERT INTO schema_migrations (name, applied_at) VALUES (?, datetime('now'))"
      ).run(file);
    })();

    appliedNow += 1;
  }

  console.log("[migrate] done. newly applied:", appliedNow);
}