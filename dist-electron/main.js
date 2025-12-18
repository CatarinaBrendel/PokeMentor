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
  db.pragma("foreign_keys = ON");
  db.pragma("busy_timeout = 5000");
  db.pragma("journal_mode = WAL");
  db.pragma("synchronous = NORMAL");
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
  const getActiveTeamIdStmt = db2.prepare(`
    SELECT id
    FROM teams
    WHERE is_active = 1
    LIMIT 1
  `);
  const getActiveTeamSummaryStmt = db2.prepare(`
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
    WHERE t.id = @team_id
    LIMIT 1
  `);
  const getLastImportStmt = db2.prepare(`
    SELECT MAX(created_at) AS last_import_at
    FROM team_versions
    WHERE team_id = @team_id
  `);
  const getBattleActivityStmt = db2.prepare(`
    SELECT
      COUNT(DISTINCT b.id) AS total_battles,
      MAX(COALESCE(b.played_at, b.created_at)) AS last_battle_at
    FROM battle_team_links btl
    JOIN team_versions tv ON tv.id = btl.team_version_id
    JOIN battles b ON b.id = btl.battle_id
    WHERE tv.team_id = @team_id
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
    },
    getActiveTeamSummary() {
      const active = getActiveTeamIdStmt.get();
      if (!(active == null ? void 0 : active.id)) return null;
      const row = getActiveTeamSummaryStmt.get({ team_id: active.id });
      return row ?? null;
    },
    getActiveTeamActivity() {
      const active = getActiveTeamIdStmt.get();
      if (!(active == null ? void 0 : active.id)) {
        return {
          activeTeam: null,
          last_import_at: null,
          last_battle_at: null,
          total_battles: 0
        };
      }
      const activeTeam = getActiveTeamSummaryStmt.get({ team_id: active.id });
      const lastImportRow = getLastImportStmt.get({ team_id: active.id });
      const battleRow = getBattleActivityStmt.get({ team_id: active.id });
      return {
        activeTeam,
        last_import_at: (lastImportRow == null ? void 0 : lastImportRow.last_import_at) ?? null,
        last_battle_at: (battleRow == null ? void 0 : battleRow.last_battle_at) ?? null,
        total_battles: (battleRow == null ? void 0 : battleRow.total_battles) ?? 0
      };
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
function getActiveTeamActivity() {
  const db2 = getDb();
  return teamsQueries(db2).getActiveTeamActivity();
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
function getActiveTeamSummary() {
  const db2 = getDb();
  return teamsQueries(db2).getActiveTeamSummary();
}
const BASE = "https://replay.pokemonshowdown.com";
function normalizeReplayInput(line) {
  const raw = line.trim();
  if (!raw) throw new Error("Empty line");
  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    const u = new URL(raw);
    const path2 = u.pathname.replace(/^\//, "");
    const replayId2 = path2.replace(/\.json$/, "");
    if (!replayId2) throw new Error("Could not extract replay id from URL");
    const replayUrl2 = `${BASE}/${replayId2}`;
    return { replayId: replayId2, replayUrl: replayUrl2, jsonUrl: `${replayUrl2}.json` };
  }
  const replayId = raw.replace(/\.json$/, "");
  const replayUrl = `${BASE}/${replayId}`;
  return { replayId, replayUrl, jsonUrl: `${replayUrl}.json` };
}
async function fetchReplayJson(jsonUrl) {
  const res = await fetch(jsonUrl, { method: "GET" });
  if (!res.ok) throw new Error(`Fetch failed (${res.status})`);
  const data = await res.json();
  if (!(data == null ? void 0 : data.id) || !(data == null ? void 0 : data.log)) throw new Error("Unexpected JSON payload (missing id/log)");
  return data;
}
function uuid$1() {
  return crypto.randomUUID();
}
function parseSwitchLike(rawLine) {
  if (!rawLine.startsWith("|")) return null;
  const parts = rawLine.split("|");
  const lineType = parts[1];
  if (lineType !== "switch" && lineType !== "drag" && lineType !== "replace") return null;
  const who = parts[2] ?? "";
  const details = parts[3] ?? "";
  const m = who.match(/^(p[12][ab]):/);
  if (!m) return null;
  const position = m[1];
  const side = position.slice(0, 2);
  const species = (details.split(",")[0] ?? "").trim();
  if (!species) return null;
  return { position, side, species };
}
function deriveBroughtFromEvents(db2, battleId) {
  const events = db2.prepare(
    `
    SELECT event_index, turn_num, raw_line
    FROM battle_events
    WHERE battle_id = ?
      AND line_type IN ('switch','drag','replace')
    ORDER BY event_index ASC
    `
  ).all(battleId);
  if (events.length === 0) return { insertedInstances: 0, insertedBrought: 0 };
  const broughtBySide = { p1: /* @__PURE__ */ new Set(), p2: /* @__PURE__ */ new Set() };
  const firstByPos = /* @__PURE__ */ new Map();
  for (const e of events) {
    const parsed = parseSwitchLike(e.raw_line);
    if (!parsed) continue;
    broughtBySide[parsed.side].add(parsed.species);
    if (!firstByPos.has(parsed.position)) {
      firstByPos.set(parsed.position, { species: parsed.species, turn_num: e.turn_num, event_index: e.event_index });
    }
  }
  const leadKey = /* @__PURE__ */ new Set();
  for (const [pos, info] of firstByPos.entries()) {
    const side = pos.slice(0, 2);
    leadKey.add(`${side}|${info.species}`);
  }
  const getInstance = db2.prepare(`
    SELECT id
    FROM battle_pokemon_instances
    WHERE battle_id = ? AND side = ? AND species_name = ?
    LIMIT 1
  `);
  const insertInstance = db2.prepare(`
    INSERT INTO battle_pokemon_instances (id, battle_id, side, species_name, shiny)
    VALUES (?, ?, ?, ?, 0)
  `);
  const insertBrought = db2.prepare(`
    INSERT OR IGNORE INTO battle_brought_pokemon (battle_id, side, pokemon_instance_id, is_lead, fainted)
    VALUES (?, ?, ?, ?, 0)
  `);
  const updateLead = db2.prepare(`
    UPDATE battle_brought_pokemon
    SET is_lead = CASE WHEN is_lead = 1 THEN 1 ELSE ? END
    WHERE battle_id = ? AND side = ? AND pokemon_instance_id = ?
  `);
  let insertedInstances = 0;
  let insertedBrought = 0;
  db2.transaction(() => {
    for (const side of ["p1", "p2"]) {
      for (const species of broughtBySide[side]) {
        let inst = getInstance.get(battleId, side, species);
        if (!inst) {
          const id = uuid$1();
          insertInstance.run(id, battleId, side, species);
          insertedInstances += 1;
          inst = { id };
        }
        const isLead = leadKey.has(`${side}|${species}`) ? 1 : 0;
        const info = insertBrought.run(battleId, side, inst.id, isLead);
        if (typeof (info == null ? void 0 : info.changes) === "number" && info.changes > 0) {
          insertedBrought += info.changes;
        } else {
          if (isLead) updateLead.run(1, battleId, side, inst.id);
        }
      }
    }
  })();
  return { insertedInstances, insertedBrought };
}
function uuid() {
  return crypto.randomUUID();
}
function nowUnix() {
  return Math.floor(Date.now() / 1e3);
}
function getSetting$1(db2, key) {
  const row = db2.prepare("SELECT value FROM app_settings WHERE key = ?").get(key);
  return (row == null ? void 0 : row.value) ?? null;
}
function normalizeShowdownName$2(name) {
  return name.trim().replace(/^☆+/, "").replace(/\s+/g, "").toLowerCase();
}
function parseLogLines(rawLog) {
  return rawLog.split("\n").map((s) => s.trimEnd()).filter((s) => s.length > 0);
}
function parsePipeLine$1(line) {
  const parts = line.split("|");
  if (parts[0] === "") parts.shift();
  return parts;
}
function toFiniteNumber(v) {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}
function firstTUnix(lines) {
  for (const l of lines) {
    const parts = parsePipeLine$1(l);
    if (parts[0] === "t:" && parts[1]) return toFiniteNumber(parts[1]);
  }
  return null;
}
function hasRatedLine(lines) {
  return lines.some((l) => l === "|rated|" || l.startsWith("|rated|"));
}
function extractGenAndGameType(lines) {
  let gen = null;
  let gameType = null;
  for (const l of lines) {
    const p = parsePipeLine$1(l);
    if (p[0] === "gen") gen = toFiniteNumber(p[1]);
    if (p[0] === "gametype") gameType = p[1] ?? null;
    if (gen != null && gameType != null) break;
  }
  return { gen, gameType };
}
function findWinner(lines) {
  let winnerName = null;
  for (const l of lines) {
    const parts = parsePipeLine$1(l);
    if (parts[0] === "win" && parts[1]) winnerName = parts[1];
  }
  if (!winnerName) return { winnerName: null, winnerSide: null };
  let p1 = null;
  let p2 = null;
  for (const l of lines) {
    const parts = parsePipeLine$1(l);
    if (parts[0] === "player") {
      const side = parts[1];
      const name = parts[2];
      if (side === "p1") p1 = name ?? null;
      if (side === "p2") p2 = name ?? null;
    }
  }
  const winnerSide = winnerName === p1 ? "p1" : winnerName === p2 ? "p2" : null;
  return { winnerName, winnerSide };
}
function parsePreviewMon(rawText) {
  const bits = rawText.split(",").map((s) => s.trim()).filter(Boolean);
  const species = (bits[0] ?? "").trim();
  const levelToken = bits.find((b) => /^L\d+$/i.test(b));
  const level = levelToken ? toFiniteNumber(levelToken.slice(1)) : null;
  const gender = bits.includes("M") ? "M" : bits.includes("F") ? "F" : null;
  return { species, level, gender };
}
function parseShowteamEntries(blob) {
  return blob.split("]").map((x) => x.trim()).filter(Boolean);
}
function parseShowteamEntry(entry) {
  var _a;
  const fields = entry.split("|");
  const species = (fields[0] ?? "").trim();
  const nickname = fields[1] ? fields[1] : null;
  const item = fields[3] ? fields[3] : null;
  const ability = fields[4] ? fields[4] : null;
  const movesCsv = fields[5] ?? "";
  const moves = movesCsv.split(",").map((m) => m.trim()).filter(Boolean);
  const genderRaw = fields[8];
  const gender = genderRaw === "M" || genderRaw === "F" ? genderRaw : null;
  const level = fields[11] ? toFiniteNumber(fields[11]) : null;
  const tail = fields[12] ?? "";
  const tera = tail.includes(",") ? ((_a = tail.split(",").pop()) == null ? void 0 : _a.trim()) ?? null : null;
  return { species, nickname, item, ability, moves, gender, level, tera };
}
function makeIsUserFn(db2) {
  const showdownUsername = getSetting$1(db2, "showdown_username");
  const showdownUsernameNorm = showdownUsername ? normalizeShowdownName$2(showdownUsername) : null;
  return (playerName) => {
    if (!showdownUsernameNorm) return 0;
    return normalizeShowdownName$2(playerName) === showdownUsernameNorm ? 1 : 0;
  };
}
function prepareStatements(db2) {
  return {
    insertBattle: db2.prepare(`
      INSERT INTO battles (
        id, replay_id, replay_url, replay_json_url,
        format_id, format_name, gen, game_type,
        upload_time, played_at, views, rating, is_private, is_rated,
        winner_side, winner_name,
        raw_json, raw_log,
        created_at
      ) VALUES (
        @id, @replay_id, @replay_url, @replay_json_url,
        @format_id, @format_name, @gen, @game_type,
        @upload_time, @played_at, @views, @rating, @is_private, @is_rated,
        @winner_side, @winner_name,
        @raw_json, @raw_log,
        @created_at
      );
    `),
    insertSide: db2.prepare(`
      INSERT INTO battle_sides (battle_id, side, is_user, player_name, avatar, rating)
      VALUES (@battle_id, @side, @is_user, @player_name, @avatar, @rating);
    `),
    insertPreview: db2.prepare(`
      INSERT INTO battle_preview_pokemon (battle_id, side, slot_index, species_name, level, gender, shiny, raw_text)
      VALUES (@battle_id, @side, @slot_index, @species_name, @level, @gender, @shiny, @raw_text);
    `),
    insertRevealed: db2.prepare(`
      INSERT INTO battle_revealed_sets (
        battle_id, side, species_name, nickname, item_name, ability_name, tera_type, level, gender, shiny, moves_json, raw_fragment
      ) VALUES (
        @battle_id, @side, @species_name, @nickname, @item_name, @ability_name, @tera_type, @level, @gender, @shiny, @moves_json, @raw_fragment
      );
    `),
    insertEvent: db2.prepare(`
      INSERT INTO battle_events (
        battle_id, event_index, turn_num, t_unix,
        line_type, raw_line,
        actor_ref, actor_name, target_ref, target_name,
        move_name, item_name, ability_name,
        condition_text, value_text, value_num,
        flags_json, payload_json
      ) VALUES (
        @battle_id, @event_index, @turn_num, @t_unix,
        @line_type, @raw_line,
        @actor_ref, @actor_name, @target_ref, @target_name,
        @move_name, @item_name, @ability_name,
        @condition_text, @value_text, @value_num,
        @flags_json, @payload_json
      );
    `)
  };
}
function ingestReplayJson(db2, replayUrl, replayJsonUrl, json) {
  const now = nowUnix();
  const battleId = uuid();
  const lines = parseLogLines(json.log ?? "");
  const playedAt = firstTUnix(lines) ?? (json.uploadtime ?? now);
  const isRated = hasRatedLine(lines) ? 1 : 0;
  const { winnerName, winnerSide } = findWinner(lines);
  const { gen, gameType } = extractGenAndGameType(lines);
  const isUser = makeIsUserFn(db2);
  const stmts = prepareStatements(db2);
  let eventIndex = 0;
  let currentTurn = null;
  let currentT = null;
  const previewSlotCounter = { p1: 0, p2: 0 };
  db2.transaction(() => {
    stmts.insertBattle.run({
      id: battleId,
      replay_id: json.id,
      replay_url: replayUrl,
      replay_json_url: replayJsonUrl,
      format_id: json.formatid ?? null,
      format_name: json.format ?? null,
      gen,
      game_type: gameType,
      upload_time: json.uploadtime ?? null,
      played_at: playedAt ?? null,
      views: json.views ?? null,
      rating: json.rating ?? null,
      is_private: json.private ? 1 : 0,
      is_rated: isRated,
      winner_side: winnerSide,
      winner_name: winnerName,
      raw_json: JSON.stringify(json),
      raw_log: json.log ?? "",
      created_at: now
    });
    for (const raw of lines) {
      const parts = parsePipeLine$1(raw);
      const type = parts[0] ?? "unknown";
      if (type === "t:") currentT = toFiniteNumber(parts[1]);
      if (type === "turn") currentTurn = toFiniteNumber(parts[1]);
      if (type === "player") {
        const side = parts[1];
        const name = parts[2] ?? "";
        const avatar = parts[3] ?? null;
        const rating = toFiniteNumber(parts[4]);
        if ((side === "p1" || side === "p2") && name) {
          stmts.insertSide.run({
            battle_id: battleId,
            side,
            is_user: isUser(name),
            player_name: name,
            avatar,
            rating
          });
        }
      }
      if (type === "poke") {
        const side = parts[1];
        const rawText = parts[2] ?? "";
        if (side === "p1" || side === "p2") {
          previewSlotCounter[side] += 1;
          const slotIndex = previewSlotCounter[side];
          const { species, level, gender } = parsePreviewMon(rawText);
          if (species) {
            stmts.insertPreview.run({
              battle_id: battleId,
              side,
              slot_index: slotIndex,
              species_name: species,
              level,
              gender,
              shiny: 0,
              raw_text: rawText
            });
          }
        }
      }
      if (type === "showteam") {
        const side = parts[1];
        const blob = parts[2] ?? "";
        if (side === "p1" || side === "p2") {
          for (const entry of parseShowteamEntries(blob)) {
            const parsed = parseShowteamEntry(entry);
            if (!parsed.species) continue;
            stmts.insertRevealed.run({
              battle_id: battleId,
              side,
              species_name: parsed.species,
              nickname: parsed.nickname,
              item_name: parsed.item,
              ability_name: parsed.ability,
              tera_type: parsed.tera,
              level: parsed.level,
              gender: parsed.gender,
              shiny: 0,
              moves_json: JSON.stringify(parsed.moves),
              raw_fragment: entry
            });
          }
        }
      }
      stmts.insertEvent.run({
        battle_id: battleId,
        event_index: eventIndex++,
        turn_num: currentTurn,
        t_unix: currentT,
        line_type: type,
        raw_line: raw,
        actor_ref: null,
        actor_name: null,
        target_ref: null,
        target_name: null,
        move_name: type === "move" ? parts[2] ?? null : null,
        item_name: null,
        ability_name: null,
        condition_text: null,
        value_text: null,
        value_num: null,
        flags_json: "{}",
        payload_json: "{}"
      });
    }
  })();
  deriveBroughtFromEvents(db2, battleId);
  return { battleId };
}
async function importBattlesFromReplaysText(args) {
  const db2 = getDb();
  const inputs = Array.from(
    new Set(
      args.text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
    )
  );
  const rows = [];
  let okCount = 0;
  let failCount = 0;
  for (const input of inputs) {
    try {
      const { replayId, replayUrl, jsonUrl } = normalizeReplayInput(input);
      const existing = db2.prepare("SELECT id FROM battles WHERE replay_id = ?").get(replayId);
      if (existing == null ? void 0 : existing.id) {
        rows.push({ input, ok: true, replayId, battleId: existing.id });
        okCount += 1;
        continue;
      }
      const json = await fetchReplayJson(jsonUrl);
      const tx = db2.transaction(() => {
        const { battleId: battleId2 } = ingestReplayJson(db2, replayUrl, jsonUrl, json);
        return battleId2;
      });
      const battleId = tx();
      rows.push({ input, ok: true, replayId, battleId });
      okCount += 1;
    } catch (e) {
      rows.push({ input, ok: false, error: e instanceof Error ? e.message : String(e) });
      failCount += 1;
    }
  }
  return { okCount, failCount, rows };
}
function getSetting(db2, key) {
  const row = db2.prepare("SELECT value FROM app_settings WHERE key = ?").get(key);
  return (row == null ? void 0 : row.value) ?? null;
}
function normalizeShowdownName$1(name) {
  return name.trim().replace(/^☆+/, "").replace(/\s+/g, "").toLowerCase();
}
function parsePipeLine(raw) {
  const parts = raw.split("|");
  if (parts[0] === "") parts.shift();
  return parts;
}
function speciesFromDetails(details) {
  return (details.split(",")[0] ?? "").trim();
}
function sideFromActor(actor) {
  const s = actor.slice(0, 2);
  return s === "p1" || s === "p2" ? s : null;
}
function deriveForBattle(events, gameType) {
  let p1_expected = null;
  let p2_expected = null;
  const p1SeenOrder = [];
  const p2SeenOrder = [];
  const p1SeenSet = /* @__PURE__ */ new Set();
  const p2SeenSet = /* @__PURE__ */ new Set();
  for (const e of events) {
    const parts = parsePipeLine(e.raw_line);
    const t = parts[0] ?? "";
    if (t === "teamsize") {
      const side = parts[1];
      const n = parts[2] ? Number(parts[2]) : NaN;
      if ((side === "p1" || side === "p2") && Number.isFinite(n)) {
        if (side === "p1") p1_expected = n;
        if (side === "p2") p2_expected = n;
      }
      continue;
    }
    if (t === "switch" || t === "drag" || t === "replace") {
      const actor = parts[1] ?? "";
      const details = parts[2] ?? "";
      const side = sideFromActor(actor);
      const species = speciesFromDetails(details);
      if (!side || !species) continue;
      if (side === "p1") {
        if (!p1SeenSet.has(species)) {
          p1SeenSet.add(species);
          p1SeenOrder.push(species);
        }
      } else {
        if (!p2SeenSet.has(species)) {
          p2SeenSet.add(species);
          p2SeenOrder.push(species);
        }
      }
    }
  }
  const leadCount = gameType === "doubles" ? 2 : 1;
  return {
    p1_expected,
    p2_expected,
    p1_seen: p1SeenOrder.map((s, idx) => ({ species_name: s, is_lead: idx < leadCount })),
    p2_seen: p2SeenOrder.map((s, idx) => ({ species_name: s, is_lead: idx < leadCount }))
  };
}
const MAX_IDS_PER_CHUNK = 900;
function listBattles(args = {}) {
  const db2 = getDb();
  const limit = Math.min(Math.max(args.limit ?? 200, 1), 1e3);
  const offset = Math.max(args.offset ?? 0, 0);
  const showdownUsername = getSetting(db2, "showdown_username");
  showdownUsername ? normalizeShowdownName$1(showdownUsername) : null;
  const baseStmt = db2.prepare(`
    WITH sides AS (
      SELECT
        battle_id,
        MAX(CASE WHEN is_user = 1 THEN side END)        AS user_side,
        MAX(CASE WHEN is_user = 1 THEN player_name END) AS user_name,
        MAX(CASE WHEN side = 'p1' THEN player_name END) AS p1_name,
        MAX(CASE WHEN side = 'p2' THEN player_name END) AS p2_name
      FROM battle_sides
      GROUP BY battle_id
    ),
    links AS (
      SELECT
        btl.battle_id,
        MAX(tv.team_id) AS team_id
      FROM battle_team_links btl
      JOIN team_versions tv ON tv.id = btl.team_version_id
      GROUP BY btl.battle_id
    )
    SELECT
      b.id,
      b.played_at,
      b.format_id,
      b.format_name,
      b.is_rated,
      b.winner_side,
      b.game_type,

      s.user_side,
      s.user_name,
      s.p1_name,
      s.p2_name,

      l.team_id AS team_id, 

      CASE
        WHEN s.user_side = 'p1' THEN s.p2_name
        WHEN s.user_side = 'p2' THEN s.p1_name
        ELSE COALESCE(s.p2_name, s.p1_name)
      END AS opponent_name,

      CASE
        WHEN s.user_side IS NULL THEN NULL
        WHEN b.winner_side IS NULL THEN NULL
        WHEN b.winner_side = s.user_side THEN 'win'
        ELSE 'loss'
      END AS result

    FROM battles b
    LEFT JOIN sides s ON s.battle_id = b.id
    LEFT JOIN links l ON l.battle_id = b.id
    ORDER BY COALESCE(b.played_at, b.upload_time, b.created_at) DESC
    LIMIT ? OFFSET ?;
  `);
  const base = baseStmt.all(limit, offset);
  if (base.length === 0) return [];
  const byBattle = /* @__PURE__ */ new Map();
  for (let i = 0; i < base.length; i += MAX_IDS_PER_CHUNK) {
    const chunk = base.slice(i, i + MAX_IDS_PER_CHUNK);
    const ids = chunk.map((r) => r.id);
    const placeholders = ids.map(() => "?").join(",");
    const evStmt = db2.prepare(`
      SELECT battle_id, event_index, line_type, raw_line
      FROM battle_events
      WHERE battle_id IN (${placeholders})
        AND line_type IN ('teamsize','switch','drag','replace')
      ORDER BY battle_id ASC, event_index ASC;
    `);
    const evRows = evStmt.all(...ids);
    for (const e of evRows) {
      const arr = byBattle.get(e.battle_id);
      if (arr) arr.push(e);
      else byBattle.set(e.battle_id, [e]);
    }
  }
  return base.map((row) => {
    const events = byBattle.get(row.id) ?? [];
    const d = deriveForBattle(events, row.game_type ?? null);
    const userSide = row.user_side;
    const userSeen = userSide === "p1" ? d.p1_seen : userSide === "p2" ? d.p2_seen : [];
    const user_brought_json = userSide && userSeen.length > 0 ? JSON.stringify(userSeen) : null;
    const user_brought_seen = userSide ? userSeen.length || null : null;
    const user_brought_expected = userSide === "p1" ? d.p1_expected : userSide === "p2" ? d.p2_expected : null;
    return {
      ...row,
      user_brought_json,
      user_brought_seen,
      user_brought_expected
      // optional: keep these if your UI still displays Opp counts
      // opponent_brought_seen: null,
      // opponent_brought_expected: null,
    };
  });
}
function getBattleDetails(battleId) {
  const db2 = getDb();
  const battle = db2.prepare(`
    SELECT id, replay_url, replay_id, format_id, format_name, played_at, is_rated, winner_side
    FROM battles
    WHERE id = ?
  `).get(battleId);
  const sides = db2.prepare(`
    SELECT side, is_user, player_name, avatar, rating
    FROM battle_sides
    WHERE battle_id = ?
    ORDER BY side ASC
  `).all(battleId);
  const preview = db2.prepare(`
    SELECT side, slot_index, species_name
    FROM battle_preview_pokemon
    WHERE battle_id = ?
    ORDER BY side ASC, slot_index ASC
  `).all(battleId);
  const revealedRaw = db2.prepare(`
    SELECT side, species_name, nickname, item_name, ability_name, tera_type, moves_json
    FROM battle_revealed_sets
    WHERE battle_id = ?
    ORDER BY side ASC, species_name ASC
  `).all(battleId);
  const events = db2.prepare(`
    SELECT event_index, turn_num, line_type, raw_line
    FROM battle_events
    WHERE battle_id = ?
    ORDER BY event_index ASC
  `).all(battleId);
  const revealed = revealedRaw.map((r) => ({
    side: r.side,
    species_name: r.species_name,
    nickname: r.nickname,
    item_name: r.item_name,
    ability_name: r.ability_name,
    tera_type: r.tera_type,
    moves: safeJsonArray(r.moves_json)
  }));
  return { battle, sides, preview, revealed, events };
}
function safeJsonArray(s) {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}
function normalizeShowdownName(name) {
  return name.trim().replace(/^☆+/, "").replace(/\s+/g, "").toLowerCase();
}
function backfillIsUserForAllBattles(db2, showdownUsername) {
  const clearAll = db2.prepare(`UPDATE battle_sides SET is_user = 0`);
  const setUserForBattle = db2.prepare(`
    UPDATE battle_sides
    SET is_user = 1
    WHERE battle_id = ? AND side = ?
  `);
  if (!showdownUsername) {
    clearAll.run();
    return;
  }
  const target = normalizeShowdownName(showdownUsername);
  const battles = db2.prepare(`SELECT DISTINCT battle_id FROM battle_sides`).all();
  const getSides = db2.prepare(`
    SELECT side, player_name
    FROM battle_sides
    WHERE battle_id = ?
  `);
  const tx = db2.transaction(() => {
    clearAll.run();
    for (const b of battles) {
      const sides = getSides.all(b.battle_id);
      const match = sides.find(
        (s) => normalizeShowdownName(s.player_name) === target
      );
      if (match) {
        setUserForBattle.run(b.battle_id, match.side);
      }
    }
  });
  tx();
}
function getSettings() {
  const db2 = getDb();
  const rows = db2.prepare(`SELECT key, value FROM app_settings`).all();
  const map = new Map(rows.map((r) => [r.key, r.value]));
  return {
    showdown_username: map.get("showdown_username") ?? null
  };
}
function updateSettings(args) {
  const db2 = getDb();
  const tx = db2.transaction(() => {
    if (typeof args.showdown_username === "string") {
      const name = args.showdown_username.trim();
      const normalized = name.length ? name : null;
      if (normalized) {
        db2.prepare(`
          INSERT INTO app_settings(key, value, updated_at)
          VALUES ('showdown_username', ?, strftime('%s','now'))
          ON CONFLICT(key) DO UPDATE SET
            value = excluded.value,
            updated_at = excluded.updated_at
        `).run(normalized);
      } else {
        db2.prepare(`DELETE FROM app_settings WHERE key = 'showdown_username'`).run();
      }
      backfillIsUserForAllBattles(db2, normalized);
    }
  });
  tx();
  return getSettings();
}
ipcMain.removeHandler("db:teams:importPokepaste");
ipcMain.removeHandler("db:teams:list");
ipcMain.removeHandler("db:battles:importReplays");
ipcMain.removeHandler("db:settings:get");
ipcMain.removeHandler("db:settings:update");
function registerDbHandlers() {
  ipcMain.handle("db:teams:importPokepaste", async (_evt, args) => {
    const result = await importTeamFromPokepaste(args);
    return {
      team_id: result.team_id,
      version_id: result.version_id,
      version_num: result.version_num,
      slots_inserted: result.slots_inserted
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
  ipcMain.handle("db:teams:getActiveSummary", () => {
    return getActiveTeamSummary();
  });
  ipcMain.handle("db:teams:getActiveActivity", () => {
    return getActiveTeamActivity();
  });
  ipcMain.handle("db:battles:importReplays", async (_evt, args) => {
    return importBattlesFromReplaysText(args);
  });
  ipcMain.handle("battles:list", (_e, args) => {
    return listBattles(args);
  });
  ipcMain.handle("db:settings:get", async () => {
    return getSettings();
  });
  ipcMain.handle("db:settings:update", async (_evt, args) => {
    return updateSettings(args);
  });
  ipcMain.handle("db:battles:getDetails", async (_evt, battleId) => {
    return getBattleDetails(battleId);
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
    height: 910,
    minWidth: 1280,
    minHeight: 910,
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
