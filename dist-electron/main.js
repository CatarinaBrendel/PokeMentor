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
function findMigrationsDir() {
  const appRoot = process.env.APP_ROOT;
  const candidates = [
    // Dev: always stable if APP_ROOT is set
    appRoot ? path.join(appRoot, "electron", "db", "migrations") : null,
    // Packaged: resourcesPath (you may copy migrations there at build time)
    app.isPackaged ? path.join(process.resourcesPath, "db", "migrations") : null,
    // Last-resort fallback (dev only)
    !app.isPackaged ? path.join(process.cwd(), "electron", "db", "migrations") : null
  ].filter(Boolean);
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }
  throw new Error(
    `Migrations directory not found. Tried:
${candidates.map((d) => `- ${d}`).join("\n")}`
  );
}
async function runMigrations() {
  await app.whenReady();
  const db2 = getDb();
  db2.pragma("journal_mode = DELETE");
  db2.pragma("foreign_keys = ON");
  db2.pragma("busy_timeout = 5000");
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
function teamsQueries(db2) {
  const insertTeamStmt = db2.prepare(`
    INSERT INTO teams (id, name, format_ps, created_at, updated_at)
    VALUES (@id, @name, @format_ps, @now, @now)
  `);
  const insertVersionStmt = db2.prepare(`
    INSERT INTO team_versions (
      id, team_id, version_num,
      source_type, source_url, source_hash, source_text,
      source_title, source_author, source_format,
      notes, created_at
    )
    VALUES (
      @id, @team_id, @version_num,
      'pokepaste', @source_url, @source_hash, @source_text,
      @source_title, @source_author, @source_format,
      NULL, @now
    )
  `);
  const selectSetByHashStmt = db2.prepare(`
    SELECT id FROM pokemon_sets WHERE set_hash = @set_hash LIMIT 1
  `);
  const insertSetStmt = db2.prepare(`
    INSERT INTO pokemon_sets (
      id, nickname, species_name, species_id,
      item_name, item_id,
      ability_name, ability_id,
      level, gender, shiny, tera_type, happiness,
      nature,
      ev_hp, ev_atk, ev_def, ev_spa, ev_spd, ev_spe,
      iv_hp, iv_atk, iv_def, iv_spa, iv_spd, iv_spe,
      set_hash, created_at
    )
    VALUES (
      @id, @nickname, @species_name, NULL,
      @item_name, NULL,
      @ability_name, NULL,
      @level, @gender, @shiny, @tera_type, @happiness,
      @nature,
      @ev_hp, @ev_atk, @ev_def, @ev_spa, @ev_spd, @ev_spe,
      @iv_hp, @iv_atk, @iv_def, @iv_spa, @iv_spd, @iv_spe,
      @set_hash, @now
    )
  `);
  const insertSlotStmt = db2.prepare(`
    INSERT INTO team_slots (team_version_id, slot_index, pokemon_set_id)
    VALUES (@team_version_id, @slot_index, @pokemon_set_id)
  `);
  const listTeamsStmt = db2.prepare(`
   SELECT
      t.id,
      t.name,
      t.format_ps,
      t.updated_at,
      t.is_active,
      (
        SELECT MAX(tv.version_num)
        FROM team_versions tv
        WHERE tv.team_id = t.id
      ) AS latest_version_num
    FROM teams t
    ORDER BY t.is_active DESC, t.updated_at DESC;
  `);
  const deleteTeamStmt = db2.prepare(`
    DELETE FROM teams
    WHERE id = ?
  `);
  const getTeamStmt = db2.prepare(`
    SELECT id, name, format_ps, created_at, updated_at, is_active
    FROM teams
    WHERE id = ?
    LIMIT 1
  `);
  const getLatestVersionStmt = db2.prepare(`
    SELECT
      id,
      team_id,
      version_num,
      source_type,
      source_url,
      source_hash,
      source_title,
      source_author,
      source_format,
      created_at
    FROM team_versions
    WHERE team_id = ?
    ORDER BY version_num DESC
    LIMIT 1
  `);
  const getSlotsForVersionStmt = db2.prepare(`
    SELECT
      ts.slot_index,
      ts.pokemon_set_id,

      ps.nickname,
      ps.species_name,
      ps.item_name,
      ps.ability_name,

      ps.level,
      ps.gender,
      ps.shiny,
      ps.tera_type,
      ps.happiness,
      ps.nature,

      ps.ev_hp, ps.ev_atk, ps.ev_def,
      ps.ev_spa, ps.ev_spd, ps.ev_spe,

      ps.iv_hp, ps.iv_atk, ps.iv_def,
      ps.iv_spa, ps.iv_spd, ps.iv_spe
    FROM team_slots ts
    JOIN pokemon_sets ps ON ps.id = ts.pokemon_set_id
    WHERE ts.team_version_id = ?
    ORDER BY ts.slot_index ASC
  `);
  const selectMoveByNameStmt = db2.prepare(`
    SELECT id
    FROM moves
    WHERE name = @name COLLATE NOCASE
    LIMIT 1
  `);
  const insertMoveStmt = db2.prepare(`
    INSERT INTO moves (name)
    VALUES (@name)
  `);
  const insertSetMoveStmt = db2.prepare(`
    INSERT INTO pokemon_set_moves (pokemon_set_id, move_slot, move_id)
    VALUES (@pokemon_set_id, @move_slot, @move_id)
  `);
  const clearActiveTeamsStmt = db2.prepare(`
    UPDATE teams SET is_active = 0
  `);
  const setActiveTeamStmt = db2.prepare(`
    UPDATE teams SET is_active = 1
    WHERE id = @team_id
  `);
  function getMovesForSetIds(setIds) {
    if (setIds.length === 0) return [];
    const ids = Array.from(new Set(setIds));
    const placeholders = ids.map(() => "?").join(", ");
    const stmt = db2.prepare(`
      SELECT
        psm.pokemon_set_id,
        psm.move_slot,
        m.name
      FROM pokemon_set_moves psm
      JOIN moves m ON m.id = psm.move_id
      WHERE psm.pokemon_set_id IN (${placeholders})
      ORDER BY psm.pokemon_set_id ASC, psm.move_slot ASC
    `);
    return stmt.all(...ids);
  }
  return {
    insertTeam(args) {
      insertTeamStmt.run(args);
    },
    insertTeamVersion(args) {
      insertVersionStmt.run(args);
    },
    findPokemonSetIdByHash(set_hash) {
      const row = selectSetByHashStmt.get({ set_hash });
      return (row == null ? void 0 : row.id) ?? null;
    },
    insertPokemonSet(args) {
      insertSetStmt.run(args);
    },
    insertTeamSlot(args) {
      insertSlotStmt.run(args);
    },
    listTeams() {
      return listTeamsStmt.all();
    },
    deleteTeam(teamId) {
      deleteTeamStmt.run(teamId);
    },
    getTeamDetails(teamId) {
      const team = getTeamStmt.get(teamId);
      if (!team) {
        throw new Error("Team not found");
      }
      const latestVersion = getLatestVersionStmt.get(teamId) ?? null;
      const slotsBase = latestVersion ? getSlotsForVersionStmt.all(latestVersion.id) : [];
      let slots = [];
      if (slotsBase.length === 0) {
        slots = [];
      } else {
        const ids = Array.from(new Set(slotsBase.map((s) => s.pokemon_set_id)));
        const rows = getMovesForSetIds(ids);
        const movesBySetId = /* @__PURE__ */ new Map();
        for (const r of rows) {
          const arr = movesBySetId.get(r.pokemon_set_id) ?? [];
          arr.push(r.name);
          movesBySetId.set(r.pokemon_set_id, arr);
        }
        slots = slotsBase.map((s) => ({
          ...s,
          moves: movesBySetId.get(s.pokemon_set_id) ?? []
        }));
      }
      return {
        team,
        latestVersion,
        slots
      };
    },
    getOrCreateMoveId(name) {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Move name is empty.");
      const found = selectMoveByNameStmt.get({ name: trimmed });
      if (found == null ? void 0 : found.id) return found.id;
      try {
        insertMoveStmt.run({ name: trimmed });
      } catch (e) {
      }
      const row = selectMoveByNameStmt.get({ name: trimmed });
      if (!(row == null ? void 0 : row.id)) throw new Error(`Failed to create move: ${trimmed}`);
      return row.id;
    },
    insertPokemonSetMove(args) {
      insertSetMoveStmt.run(args);
    },
    setActiveTeam(team_id) {
      db2.transaction(() => {
        clearActiveTeamsStmt.run();
        const res = setActiveTeamStmt.run({ team_id });
        if (res.changes !== 1) {
          throw new Error(`setActiveTeam: team not found: ${team_id}`);
        }
      })();
    }
  };
}
function decodeHtml(s) {
  return s.replace("&nbsp;", " ").replace("&amp;", "&").replace("&lt;", "<").replace("&gt;", ">").replace("&quot;", '"').replace("&#39;", "'");
}
function stripTags(s) {
  return decodeHtml(s.replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();
}
function parsePokepasteMetaFromHtml(html) {
  const asideMatch = html.match(/<aside\b[^>]*>([\s\S]*?)<\/aside>/i);
  const aside = (asideMatch == null ? void 0 : asideMatch[1]) ?? html;
  const title = (() => {
    const m = aside.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
    return m ? stripTags(m[1]) : null;
  })();
  const author = (() => {
    const m = aside.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/i);
    if (!m) return null;
    const t = stripTags(m[1]);
    return t.replace(/^by\s+/i, "").trim() || null;
  })();
  const format = (() => {
    const m = aside.match(/<p\b[^>]*>\s*Format:\s*([^<]+)\s*<\/p>/i);
    return m ? stripTags(m[1]) : null;
  })();
  return { title, author, format };
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
async function fetchText(url, timeoutMs = 1e4) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        // Helps avoid occasional “smart” responses
        "User-Agent": "PokeMentor/1.0",
        "Accept": "text/html, text/plain;q=0.9, */*;q=0.8"
      }
    });
    if (!res.ok) {
      throw new Error(`Fetch failed (${res.status}) for ${url}`);
    }
    return await res.text();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Failed to fetch ${url}: ${msg}`);
  } finally {
    clearTimeout(t);
  }
}
function emptyStats() {
  return { hp: null, atk: null, def: null, spa: null, spd: null, spe: null };
}
function parseEvIvLine(line) {
  var _a;
  const out = {};
  const parts = ((_a = line.split(":")[1]) == null ? void 0 : _a.split("/").map((p) => p.trim())) ?? [];
  for (const p of parts) {
    const mm = p.match(/^(\d+)\s+(HP|Atk|Def|SpA|SpD|Spe)$/i);
    if (!mm) continue;
    const val = Number(mm[1]);
    const statToken = mm[2].toLowerCase();
    const stat = statToken === "hp" ? "hp" : statToken === "atk" ? "atk" : statToken === "def" ? "def" : statToken === "spa" ? "spa" : statToken === "spd" ? "spd" : "spe";
    out[stat] = val;
  }
  return out;
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
    let ev = emptyStats();
    let iv = emptyStats();
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
        ev = { ...ev, ...m };
      } else if (line.startsWith("IVs:")) {
        const m = parseEvIvLine(line);
        iv = { ...iv, ...m };
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
  var _a, _b, _c, _d;
  const { viewUrl, rawUrl } = normalizePokepasteUrl(args.url);
  const [rawText, viewHtml] = await Promise.all([
    fetchText(rawUrl),
    fetchText(viewUrl)
  ]);
  const meta = parsePokepasteMetaFromHtml(viewHtml);
  const parsedSets = parseShowdownExport(rawText);
  if (parsedSets.length === 0) throw new Error("No Pokémon sets found in Pokepaste.");
  const now = (/* @__PURE__ */ new Date()).toISOString();
  const source_hash = sha256(rawText.trim());
  const finalName = ((_a = args.name) == null ? void 0 : _a.trim()) || ((_b = meta.title) == null ? void 0 : _b.trim()) || "Imported Team";
  const finalFormat = ((_c = args.format_ps) == null ? void 0 : _c.trim()) || ((_d = meta.format) == null ? void 0 : _d.trim()) || null;
  const db2 = getDb();
  const q = teamsQueries(db2);
  return db2.transaction(() => {
    var _a2;
    const team_id = randomUUID();
    const version_id = randomUUID();
    const version_num = 1;
    q.insertTeam({ id: team_id, name: finalName, format_ps: finalFormat, now });
    q.insertTeamVersion({
      id: version_id,
      team_id,
      version_num,
      source_url: viewUrl,
      source_hash,
      source_text: rawText,
      source_title: meta.title,
      source_author: meta.author,
      source_format: meta.format,
      now
    });
    let slotIndex = 1;
    for (const s of parsedSets.slice(0, 6)) {
      const set_hash = sha256(canonicalizeSet(s));
      const existingId = q.findPokemonSetIdByHash(set_hash);
      const pokemon_set_id = existingId ?? randomUUID();
      if (!existingId) {
        q.insertPokemonSet({
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
          now
        });
        for (let i = 0; i < Math.min(s.moves.length, 4); i++) {
          const moveName = (_a2 = s.moves[i]) == null ? void 0 : _a2.trim();
          if (!moveName) continue;
          const move_id = q.getOrCreateMoveId(moveName);
          q.insertPokemonSetMove({
            pokemon_set_id,
            move_slot: i + 1,
            move_id
          });
        }
      }
      q.insertTeamSlot({ team_version_id: version_id, slot_index: slotIndex, pokemon_set_id });
      slotIndex += 1;
    }
    return {
      team_id,
      version_id,
      version_num,
      slots_inserted: Math.min(parsedSets.length, 6)
    };
  })();
}
function listTeams() {
  const db2 = getDb();
  return teamsQueries(db2).listTeams();
}
function setTeamActive(teamId) {
  const db2 = getDb();
  const q = teamsQueries(db2);
  q.setActiveTeam(teamId);
  return { ok: true };
}
function deleteTeam(teamId) {
  const db2 = getDb();
  const q = teamsQueries(db2);
  q.deleteTeam(teamId);
  return { ok: true };
}
function getTeamDetails(teamId) {
  const db2 = getDb();
  const q = teamsQueries(db2);
  return q.getTeamDetails(teamId);
}
ipcMain.removeHandler("db:teams:importPokepaste");
ipcMain.removeHandler("db:teams:list");
function registerDbHandlers() {
  ipcMain.handle("db:teams:importPokepaste", async (_evt, args) => {
    const result = importTeamFromPokepaste(args);
    return {
      team_id: (await result).team_id,
      version_id: (await result).version_id,
      version_num: (await result).version_num,
      slots_inserted: (await result).slots_inserted
    };
  });
  ipcMain.handle("db:teams:list", async () => {
    return listTeams();
  });
  ipcMain.handle("db:teams:delete", async (_evt, teamId) => {
    return deleteTeam(teamId);
  });
  ipcMain.handle("db:teams:getDetails", async (_evt, teamId) => {
    return getTeamDetails(teamId);
  });
  ipcMain.handle("db:teams:setTeamActive", (_evt, teamId) => {
    return setTeamActive(teamId);
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
    createWindow();
  } catch (err) {
    console.error("[main] startup failed:", err);
    app.quit();
  }
});
export {
  MAIN_DIST,
  RENDERER_DIST,
  VITE_DEV_SERVER_URL
};
