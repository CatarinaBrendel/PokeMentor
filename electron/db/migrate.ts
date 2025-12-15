import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getDb } from "../db/index";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type MigrationRow = { name: string };

function findMigrationsDir() {
  const candidates = [
    // when bundled/copied: dist-electron/db/migrations (because migrate.js ends up in dist-electron/db)
    path.join(__dirname, "migrations"),

    // when running from source during dev (fallback)
    path.join(process.cwd(), "electron", "db", "migrations"),
  ];

  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }

  throw new Error(
    `Migrations directory not found. Tried:\n${candidates.map((d) => `- ${d}`).join("\n")}`
  );
}

export function runMigrations() {
  const db = getDb();

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