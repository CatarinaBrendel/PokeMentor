import { app, ipcMain, BrowserWindow } from "electron";
import { fileURLToPath } from "node:url";
import path, { dirname } from "node:path";
import fs from "node:fs";
import { createRequire } from "node:module";
import crypto, { randomUUID } from "node:crypto";
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
function sha256(s) {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}
function normalizePokepasteUrl(url) {
  const m = url.trim().match(/^https?:\/\/pokepast\.es\/([a-zA-Z0-9]+)(?:\/.*)?$/);
  if (!m) throw new Error("Invalid Pokepaste URL.");
  const id = m[1];
  return {
    id,
    viewUrl: `https://pokepast.es/${id}`,
    rawUrl: `https://pokepast.es/${id}/raw`
  };
}
async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch Pokepaste (${res.status})`);
  }
  return res.text();
}
function parseEvIvLine(line) {
  var _a;
  const out = {};
  const parts = ((_a = line.split(":")[1]) == null ? void 0 : _a.split("/").map((p) => p.trim())) ?? [];
  for (const p of parts) {
    const mm = p.match(/^(\d+)\s+(HP|Atk|Def|SpA|SpD|Spe)$/i);
    if (!mm) continue;
    const val = Number(mm[1]);
    const stat = mm[2].toLowerCase();
    out[stat] = val;
  }
  return out;
}
function emptyStats() {
  return {
    hp: null,
    atk: null,
    def: null,
    spa: null,
    spd: null,
    spe: null
  };
}
function parseShowdownExport(text) {
  const blocks = text.replace(/\r\n/g, "\n").split(/\n\s*\n/g).map((b) => b.trim()).filter(Boolean);
  const sets = [];
  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;
    const first = lines[0];
    const [left, itemPart] = first.split(" @ ");
    const item_name = itemPart ? itemPart.trim() : null;
    let gender = null;
    let left2 = left.trim();
    const genderMatch = left2.match(/\((M|F)\)\s*$/);
    if (genderMatch) {
      gender = genderMatch[1];
      left2 = left2.replace(/\((M|F)\)\s*$/, "").trim();
    }
    let nickname = null;
    let species_name = left2;
    const nm = left2.match(/^(.+)\s+\((.+)\)$/);
    if (nm) {
      nickname = nm[1].trim();
      species_name = nm[2].trim();
    }
    let ability_name = null;
    let level = null;
    let shiny = 0;
    let tera_type = null;
    let happiness = null;
    let nature = null;
    let ev = { ...emptyStats() };
    let iv = { ...emptyStats() };
    const moves = [];
    for (const line of lines.slice(1)) {
      if (line.startsWith("Ability:")) {
        ability_name = line.slice("Ability:".length).trim() || null;
      } else if (line.startsWith("Level:")) {
        const n = Number(line.slice("Level:".length).trim());
        level = Number.isFinite(n) ? n : null;
      } else if (line === "Shiny: Yes") {
        shiny = 1;
      } else if (line.startsWith("Happiness:")) {
        const n = Number(line.slice("Happiness:".length).trim());
        happiness = Number.isFinite(n) ? n : null;
      } else if (line.startsWith("Tera Type:")) {
        tera_type = line.slice("Tera Type:".length).trim() || null;
      } else if (line.startsWith("EVs:")) {
        const m = parseEvIvLine(line);
        ev = {
          hp: m.hp ?? ev.hp,
          atk: m.atk ?? ev.atk,
          def: m.def ?? ev.def,
          spa: m.spa ?? ev.spa,
          spd: m.spd ?? ev.spd,
          spe: m.spe ?? ev.spe
        };
      } else if (line.startsWith("IVs:")) {
        const m = parseEvIvLine(line);
        iv = {
          hp: m.hp ?? iv.hp,
          atk: m.atk ?? iv.atk,
          def: m.def ?? iv.def,
          spa: m.spa ?? iv.spa,
          spd: m.spd ?? iv.spd,
          spe: m.spe ?? iv.spe
        };
      } else if (line.endsWith(" Nature")) {
        nature = line.replace(" Nature", "").trim() || null;
      } else if (line.startsWith("- ")) {
        moves.push(line.slice(2).trim());
      }
    }
    sets.push({
      nickname,
      species_name,
      item_name,
      ability_name,
      level,
      gender,
      shiny,
      tera_type,
      happiness,
      nature,
      ev_hp: ev.hp,
      ev_atk: ev.atk,
      ev_def: ev.def,
      ev_spa: ev.spa,
      ev_spd: ev.spd,
      ev_spe: ev.spe,
      iv_hp: iv.hp,
      iv_atk: iv.atk,
      iv_def: iv.def,
      iv_spa: iv.spa,
      iv_spd: iv.spd,
      iv_spe: iv.spe,
      moves
    });
  }
  return sets;
}
function canonicalizeSet(s) {
  return [
    `species=${s.species_name}`,
    `nickname=${s.nickname ?? ""}`,
    `item=${s.item_name ?? ""}`,
    `ability=${s.ability_name ?? ""}`,
    `level=${s.level ?? ""}`,
    `gender=${s.gender ?? ""}`,
    `shiny=${s.shiny}`,
    `tera=${s.tera_type ?? ""}`,
    `happiness=${s.happiness ?? ""}`,
    `nature=${s.nature ?? ""}`,
    `ev=${[s.ev_hp, s.ev_atk, s.ev_def, s.ev_spa, s.ev_spd, s.ev_spe].map((v) => v ?? "").join(",")}`,
    `iv=${[s.iv_hp, s.iv_atk, s.iv_def, s.iv_spa, s.iv_spd, s.iv_spe].map((v) => v ?? "").join(",")}`,
    `moves=${s.moves.join("|")}`
  ].join("\n");
}
async function importTeamFromPokepaste(args) {
  const { rawUrl, viewUrl } = normalizePokepasteUrl(args.url);
  const source_text = await fetchText(rawUrl);
  const parsed = parseShowdownExport(source_text);
  if (parsed.length === 0) {
    throw new Error("No Pokémon sets found in Pokepaste.");
  }
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const source_hash = sha256(source_text.trim());
  const db2 = getDb();
  const insert = db2.transaction(() => {
    const team_id = randomUUID();
    db2.prepare(`
      INSERT INTO teams (id, name, format_ps, created_at, updated_at)
      VALUES (@id, @name, @format_ps, @created_at, @updated_at)
    `).run({
      id: team_id,
      name: args.name ?? null,
      format_ps: args.format_ps ?? null,
      created_at: now,
      updated_at: now
    });
    const version_num = 1;
    const team_version_id = randomUUID();
    db2.prepare(`
      INSERT INTO team_versions (
        id, team_id, version_num, source_type, source_url, source_hash, source_text, notes, created_at
      )
      VALUES (
        @id, @team_id, @version_num, 'pokepaste', @source_url, @source_hash, @source_text, NULL, @created_at
      )
    `).run({
      id: team_version_id,
      team_id,
      version_num,
      source_url: viewUrl,
      source_hash,
      source_text,
      created_at: now
    });
    const selectSet = db2.prepare(`
      SELECT id FROM pokemon_sets WHERE set_hash = @set_hash LIMIT 1
    `);
    const insertSet = db2.prepare(`
      INSERT INTO pokemon_sets (
        id, nickname, species_name, species_id,
        item_name, item_id,
        ability_name, ability_id,
        level, gender, shiny, tera_type, happiness,
        nature,
        ev_hp, ev_atk, ev_def, ev_spa, ev_spd, ev_spe,
        iv_hp, iv_atk, iv_def, iv_spa, iv_spd, iv_spe,
        set_hash, created_at
      ) VALUES (
        @id, @nickname, @species_name, NULL,
        @item_name, NULL,
        @ability_name, NULL,
        @level, @gender, @shiny, @tera_type, @happiness,
        @nature,
        @ev_hp, @ev_atk, @ev_def, @ev_spa, @ev_spd, @ev_spe,
        @iv_hp, @iv_atk, @iv_def, @iv_spa, @iv_spd, @iv_spe,
        @set_hash, @created_at
      )
    `);
    const insertSlot = db2.prepare(`
      INSERT INTO team_slots (team_version_id, slot_index, pokemon_set_id)
      VALUES (@team_version_id, @slot_index, @pokemon_set_id)
    `);
    let slotIndex = 1;
    for (const s of parsed.slice(0, 6)) {
      const set_hash = sha256(canonicalizeSet(s));
      const existing = selectSet.get({ set_hash });
      const pokemon_set_id = (existing == null ? void 0 : existing.id) ?? randomUUID();
      if (!existing) {
        insertSet.run({
          id: pokemon_set_id,
          nickname: s.nickname,
          species_name: s.species_name,
          item_name: s.item_name,
          ability_name: s.ability_name,
          level: s.level,
          gender: s.gender,
          shiny: s.shiny,
          tera_type: s.tera_type,
          happiness: s.happiness,
          nature: s.nature,
          ev_hp: s.ev_hp,
          ev_atk: s.ev_atk,
          ev_def: s.ev_def,
          ev_spa: s.ev_spa,
          ev_spd: s.ev_spd,
          ev_spe: s.ev_spe,
          iv_hp: s.iv_hp,
          iv_atk: s.iv_atk,
          iv_def: s.iv_def,
          iv_spa: s.iv_spa,
          iv_spd: s.iv_spd,
          iv_spe: s.iv_spe,
          set_hash,
          created_at: now
        });
      }
      insertSlot.run({
        team_version_id,
        slot_index: slotIndex,
        pokemon_set_id
      });
      slotIndex += 1;
    }
    return {
      team_id,
      team_version_id,
      version_num,
      slots_inserted: Math.min(parsed.length, 6),
      source_url: viewUrl
    };
  });
  return insert();
}
function registerDbHandlers() {
  ipcMain.handle("db:teams:importPokepaste", async (_evt, args) => {
    return importTeamFromPokepaste(args);
  });
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
