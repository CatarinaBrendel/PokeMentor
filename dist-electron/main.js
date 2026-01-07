import { app, ipcMain, BrowserWindow } from "electron";
import { fileURLToPath } from "node:url";
import path, { dirname } from "node:path";
import fs from "node:fs";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import crypto, { randomUUID } from "node:crypto";
import { randomUUID as randomUUID$1 } from "crypto";
const require$1 = createRequire(import.meta.url);
const Database = require$1("better-sqlite3");
let db = null;
function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}
function exists(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}
function quarantineDbFiles(dbPath, reason) {
  const ts = (/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-");
  const base = `${dbPath}.bad-${ts}`;
  const files = [
    { from: dbPath, to: base },
    { from: `${dbPath}-wal`, to: `${base}-wal` },
    { from: `${dbPath}-shm`, to: `${base}-shm` }
  ];
  console.warn(`[db] quarantining db files (reason=${reason})`);
  for (const f of files) {
    try {
      if (exists(f.from)) fs.renameSync(f.from, f.to);
    } catch (err) {
      console.warn(`[db] quarantine rename failed: ${f.from} -> ${f.to}`, err);
    }
  }
  return base;
}
function runQuickCheck(d) {
  const row = d.prepare("PRAGMA quick_check;").get();
  return String((row == null ? void 0 : row.quick_check) ?? "");
}
function runIntegrityCheck(d) {
  const row = d.prepare("PRAGMA integrity_check;").get();
  return String((row == null ? void 0 : row.integrity_check) ?? "");
}
function tryCheckpoint(d) {
  try {
    d.pragma("wal_checkpoint(TRUNCATE)");
  } catch (err) {
    console.warn("[db] wal_checkpoint failed", err);
  }
}
function hasSqlite3Cli() {
  const r = spawnSync("sqlite3", ["-version"], { encoding: "utf8" });
  return r.status === 0;
}
function rebuildViaDump(badDbPath, rebuiltDbPath) {
  const cmd = `sqlite3 "${badDbPath}" ".dump" | sqlite3 "${rebuiltDbPath}"`;
  const r = spawnSync(cmd, { shell: true, encoding: "utf8" });
  if (r.status !== 0) {
    return { ok: false, error: r.stderr || r.stdout || "dump/import failed" };
  }
  return { ok: true };
}
function openDbRaw(dbPath) {
  return new Database(dbPath);
}
function setRuntimePragmas(d) {
  d.pragma("foreign_keys = ON");
  d.pragma("busy_timeout = 5000");
  d.pragma("journal_mode = WAL");
  d.pragma("synchronous = NORMAL");
}
function validateDbOrThrow(d) {
  const qc = runQuickCheck(d);
  if (qc === "ok") return;
  const ic = runIntegrityCheck(d);
  throw new Error(`sqlite integrity failed: quick_check=${qc}; integrity_check=${ic}`);
}
function getDb() {
  if (db) return db;
  const userData = app.getPath("userData");
  const dir = path.join(userData, "data");
  ensureDir(dir);
  const dbPath = path.join(dir, "pokementor.sqlite");
  console.log("[db] userData =", userData);
  console.log("[db] dbPath   =", dbPath);
  if (exists(dbPath)) {
    try {
      const d = openDbRaw(dbPath);
      tryCheckpoint(d);
      validateDbOrThrow(d);
      setRuntimePragmas(d);
      db = d;
      return db;
    } catch (err) {
      console.error("[db] open/validate failed; will attempt recovery", err);
      const quarantinedBase = quarantineDbFiles(dbPath, "open/validate failed");
      if (hasSqlite3Cli() && exists(quarantinedBase)) {
        const rebuiltPath = dbPath;
        const tmpRebuilt = `${rebuiltPath}.rebuilt-${Date.now()}`;
        const r = rebuildViaDump(quarantinedBase, tmpRebuilt);
        if (r.ok) {
          try {
            const d2 = openDbRaw(tmpRebuilt);
            validateDbOrThrow(d2);
            setRuntimePragmas(d2);
            d2.close();
            try {
              if (exists(rebuiltPath)) fs.unlinkSync(rebuiltPath);
            } catch {
            }
            fs.renameSync(tmpRebuilt, rebuiltPath);
            const d3 = openDbRaw(rebuiltPath);
            setRuntimePragmas(d3);
            db = d3;
            console.warn("[db] recovery succeeded via sqlite3 .dump rebuild");
            return db;
          } catch (e2) {
            console.error("[db] rebuild validated failed; will fallback to new db", e2);
            try {
              if (exists(tmpRebuilt)) fs.unlinkSync(tmpRebuilt);
            } catch {
            }
          }
        } else {
          console.error("[db] rebuild via dump failed", r.error);
          try {
            if (exists(tmpRebuilt)) fs.unlinkSync(tmpRebuilt);
          } catch {
          }
        }
      } else {
        console.warn("[db] sqlite3 CLI not available; skipping dump rebuild");
      }
    }
  }
  console.warn("[db] creating new database");
  const dNew = openDbRaw(dbPath);
  setRuntimePragmas(dNew);
  db = dNew;
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
function teamsRepo(db2) {
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
  const upsertEvRecipeStmt = db2.prepare(`
    INSERT INTO team_ev_recipes (
      team_version_id, pokemon_set_id, source, recipe_json, created_at, updated_at
    )
    VALUES (
      @team_version_id, @pokemon_set_id, @source, @recipe_json, @now, @now
    )
    ON CONFLICT(team_version_id, pokemon_set_id, source) DO UPDATE SET
      recipe_json = excluded.recipe_json,
      updated_at = excluded.updated_at
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
    ORDER BY t.is_active DESC, t.updated_at DESC
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
  const listEvRecipesByVersionStmt = db2.prepare(`
    SELECT
      team_version_id,
      pokemon_set_id,
      source,
      recipe_json,
      updated_at
    FROM team_ev_recipes
    WHERE team_version_id = ?
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
  const unlinkTeamStmt = db2.prepare(`
    UPDATE battle_team_links
    SET team_version_id = NULL,
        match_confidence = NULL,
        match_method = NULL,
        matched_at = NULL,
        matched_by = NULL
    WHERE team_version_id IN (
      SELECT id FROM team_versions WHERE team_id = ?
    )
  `);
  const listLatestTeamVersionsByFormatStmt = db2.prepare(`
    SELECT
      t.id          AS team_id,
      t.name        AS team_name,
      t.format_ps   AS format_ps,
      tv.id         AS team_version_id,
      tv.version_num AS version_num,
      tv.created_at AS created_at
    FROM teams t
    JOIN team_versions tv
      ON tv.team_id = t.id
    JOIN (
      SELECT team_id, MAX(version_num) AS max_version_num
      FROM team_versions
      GROUP BY team_id
    ) latest
      ON latest.team_id = tv.team_id
     AND latest.max_version_num = tv.version_num
    WHERE COALESCE(t.format_ps, '') = ?
    ORDER BY tv.created_at DESC
    LIMIT ?
  `);
  const listLatestTeamVersionsAnyFormatStmt = db2.prepare(`
    SELECT
      t.id          AS team_id,
      t.name        AS team_name,
      t.format_ps   AS format_ps,
      tv.id         AS team_version_id,
      tv.version_num AS version_num,
      tv.created_at AS created_at
    FROM teams t
    JOIN team_versions tv
      ON tv.team_id = t.id
    JOIN (
      SELECT team_id, MAX(version_num) AS max_version_num
      FROM team_versions
      GROUP BY team_id
    ) latest
      ON latest.team_id = tv.team_id
     AND latest.max_version_num = tv.version_num
    ORDER BY tv.created_at DESC
    LIMIT ?
  `);
  const listTeamVersionSlotSpeciesStmt = db2.prepare(`
    SELECT
      ts.slot_index AS slot_index,
      ps.species_name AS species_name
    FROM team_slots ts
    JOIN pokemon_sets ps ON ps.id = ts.pokemon_set_id
    WHERE ts.team_version_id = ?
    ORDER BY ts.slot_index ASC
  `);
  return {
    // Inserts / writes
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
    upsertTeamEvRecipe(args) {
      upsertEvRecipeStmt.run(args);
    },
    deleteTeam(teamId) {
      unlinkTeamStmt.run(teamId);
      deleteTeamStmt.run(teamId);
    },
    // List team versions
    listLatestTeamVersions(args) {
      var _a;
      const limit = args.limit;
      const formatKey = ((_a = args.formatKeyHint) == null ? void 0 : _a.trim()) || null;
      if (formatKey) {
        return listLatestTeamVersionsByFormatStmt.all(formatKey, limit);
      }
      return listLatestTeamVersionsAnyFormatStmt.all(limit);
    },
    listTeamVersionSlotsSpecies(teamVersionId) {
      return listTeamVersionSlotSpeciesStmt.all(teamVersionId);
    },
    // Reads
    listTeams() {
      return listTeamsStmt.all();
    },
    getTeamDetails(teamId) {
      const team = getTeamStmt.get(teamId);
      if (!team) throw new Error("Team not found");
      const latestVersion = getLatestVersionStmt.get(teamId) ?? null;
      const slotsBase = latestVersion ? getSlotsForVersionStmt.all(latestVersion.id) : [];
      if (!latestVersion || slotsBase.length === 0) {
        return { team, latestVersion, slots: [] };
      }
      const setIds = Array.from(new Set(slotsBase.map((s) => s.pokemon_set_id)));
      const moveRows = getMovesForSetIds(setIds);
      const movesBySetId = /* @__PURE__ */ new Map();
      for (const r of moveRows) {
        const arr = movesBySetId.get(r.pokemon_set_id) ?? [];
        arr.push(r.name);
        movesBySetId.set(r.pokemon_set_id, arr);
      }
      const slots = slotsBase.map((s) => ({
        ...s,
        moves: movesBySetId.get(s.pokemon_set_id) ?? []
      }));
      return { team, latestVersion, slots };
    },
    listTeamEvRecipes(teamVersionId) {
      return listEvRecipesByVersionStmt.all(teamVersionId);
    },
    // Moves
    getOrCreateMoveId(name) {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Move name is empty.");
      const found = selectMoveByNameStmt.get({ name: trimmed });
      if (found == null ? void 0 : found.id) return found.id;
      try {
        insertMoveStmt.run({ name: trimmed });
      } catch {
      }
      const row = selectMoveByNameStmt.get({ name: trimmed });
      if (!(row == null ? void 0 : row.id)) throw new Error(`Failed to create move: ${trimmed}`);
      return row.id;
    },
    insertPokemonSetMove(args) {
      insertSetMoveStmt.run(args);
    },
    // Active team
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
function uniqClean(xs) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const raw of xs) {
    const s = (raw ?? "").trim();
    if (!s) continue;
    const k = s.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out;
}
function getUserSide$1(db2, battleId) {
  const row = db2.prepare(
    `
      SELECT side
      FROM battle_sides
      WHERE battle_id = ? AND is_user = 1
      LIMIT 1
    `
  ).get(battleId);
  return (row == null ? void 0 : row.side) ?? null;
}
function getPreviewSpecies(db2, battleId, side) {
  const rows = db2.prepare(
    `
      SELECT species_name
      FROM battle_preview_pokemon
      WHERE battle_id = ? AND side = ?
      ORDER BY slot_index ASC
    `
  ).all(battleId, side);
  return uniqClean(rows.map((r) => r.species_name));
}
function getRevealedSpecies(db2, battleId, side) {
  const rows = db2.prepare(
    `
      SELECT DISTINCT species_name
      FROM battle_revealed_sets
      WHERE battle_id = ? AND side = ?
      ORDER BY species_name ASC
    `
  ).all(battleId, side);
  return uniqClean(rows.map((r) => r.species_name));
}
function getBroughtSpecies(db2, battleId, side) {
  const rows = db2.prepare(
    `
      SELECT i.species_name
      FROM battle_brought_pokemon b
      JOIN battle_pokemon_instances i
        ON i.id = b.pokemon_instance_id
      WHERE b.battle_id = ? AND b.side = ?
      ORDER BY b.is_lead DESC, i.species_name ASC
    `
  ).all(battleId, side);
  return uniqClean(rows.map((r) => r.species_name));
}
function selectBattleSpeciesForUser(db2, battleId, opts) {
  const userSide = getUserSide$1(db2, battleId);
  if (!userSide) return { species: [], source: "none" };
  const brought = getBroughtSpecies(db2, battleId, userSide);
  if (brought.length > 0) {
    return { species: brought, source: "brought" };
  }
  const minRevealedToTrust = (opts == null ? void 0 : opts.minRevealedToTrust) ?? 4;
  const revealed = getRevealedSpecies(db2, battleId, userSide);
  if (revealed.length >= minRevealedToTrust) {
    return { species: revealed, source: "revealed" };
  }
  const preview = getPreviewSpecies(db2, battleId, userSide);
  if (preview.length > 0) {
    return { species: preview, source: "preview" };
  }
  return { species: [], source: "none" };
}
function normalizeSpecies(name) {
  return name.trim().toLowerCase();
}
function overlapCount(a, b) {
  const bs = new Set(b.map(normalizeSpecies));
  let n = 0;
  for (const x of a) if (bs.has(normalizeSpecies(x))) n += 1;
  return n;
}
function tryLinkBattleToTeamVersion(db2, deps, args) {
  const teamRows = deps.teamsRepo.listTeamVersionSlotsSpecies(args.teamVersionId);
  const teamSpecies = teamRows.map((r) => r.species_name).filter(Boolean);
  const teamSize = teamSpecies.length;
  const battle = selectBattleSpeciesForUser(db2, args.battleId, { minRevealedToTrust: 4 });
  const battleSpecies = battle.species;
  if (teamSize === 0 || battleSpecies.length === 0) {
    return {
      linked: false,
      confidence: 0,
      method: teamSize === 0 ? "team_empty" : "battle_species_empty",
      battleSource: battle.source,
      teamSize,
      overlap: 0
    };
  }
  const overlap = overlapCount(battleSpecies, teamSpecies);
  const baseConfidence = overlap / teamSize;
  const defaults = battle.source === "preview" ? { minOverlap: 5, minConfidence: 0.83 } : { minOverlap: 4, minConfidence: 0.66 };
  const minOverlap = args.minOverlap ?? defaults.minOverlap;
  const minConfidence = args.minConfidence ?? defaults.minConfidence;
  const method = battle.source === "brought" ? "team-link_brought_overlap" : battle.source === "revealed" ? "team-link_revealed_overlap" : battle.source === "preview" ? "team-link_preview_overlap" : "team-link_no_data";
  const linked = overlap >= minOverlap && baseConfidence >= minConfidence;
  return {
    linked,
    confidence: baseConfidence,
    method,
    battleSource: battle.source,
    teamSize,
    overlap
  };
}
function getUserSide(db2, battleId) {
  const row = db2.prepare(
    `SELECT side
       FROM battle_sides
       WHERE battle_id = ? AND is_user = 1
       LIMIT 1`
  ).get(battleId);
  return (row == null ? void 0 : row.side) ?? null;
}
function backfillLinksForTeamVersion(db2, deps, args) {
  var _a;
  const limit = args.limit ?? 500;
  const selectBattleIdsByFormat = db2.prepare(`
    SELECT b.id
    FROM battles b
    WHERE COALESCE(b.format_id, b.format_name, '') = ?
      AND NOT EXISTS (
        SELECT 1
        FROM battle_team_links l
        JOIN battle_sides s
          ON s.battle_id = l.battle_id
        AND s.side = l.side
        WHERE l.battle_id = b.id
          AND s.is_user = 1
          AND l.team_version_id IS NOT NULL
      )
    ORDER BY COALESCE(b.played_at, b.upload_time, b.created_at) DESC
    LIMIT ?
  `);
  const selectBattleIdsAnyFormat = db2.prepare(`
    SELECT b.id
    FROM battles b
    WHERE NOT EXISTS (
      SELECT 1
      FROM battle_team_links l
      JOIN battle_sides s
        ON s.battle_id = l.battle_id
      AND s.side = l.side
      WHERE l.battle_id = b.id
        AND s.is_user = 1
        AND l.team_version_id IS NOT NULL
    )
    ORDER BY COALESCE(b.played_at, b.upload_time, b.created_at) DESC
    LIMIT ?
  `);
  const formatKey = ((_a = args.formatKeyHint) == null ? void 0 : _a.trim()) || null;
  let battleIds = [];
  if (formatKey) {
    battleIds = selectBattleIdsByFormat.all(formatKey, limit);
  }
  if (!battleIds.length) {
    battleIds = selectBattleIdsAnyFormat.all(limit);
  }
  const previewCountsStmt = db2.prepare(
    `SELECT side, COUNT(*) AS c
     FROM battle_preview_pokemon
     WHERE battle_id = ?
     GROUP BY side`
  );
  const revealedCountsStmt = db2.prepare(
    `SELECT side, COUNT(*) AS c
     FROM battle_revealed_sets
     WHERE battle_id = ?
     GROUP BY side`
  );
  let linked = 0;
  let scanned = 0;
  for (const b of battleIds) {
    scanned += 1;
    const userSide = getUserSide(db2, b.id);
    const previewCounts = previewCountsStmt.all(b.id);
    const revealedCounts = revealedCountsStmt.all(b.id);
    const r = tryLinkBattleToTeamVersion(db2, deps, {
      battleId: b.id,
      teamVersionId: args.teamVersionId
    });
    if (args.debug) {
      console.log("[backfill] battle", b.id, {
        userSide,
        previewCounts,
        revealedCounts,
        linked: r.linked,
        confidence: r.confidence,
        method: r.method
      });
    }
    if (r.linked) linked += 1;
  }
  return { scanned, linked };
}
function postCommitTeamVersionLinking(db2, deps, args) {
  const res = backfillLinksForTeamVersion(db2, deps, {
    teamVersionId: args.teamVersionId,
    formatKeyHint: args.formatKeyHint ?? null,
    limit: args.limit ?? 500
  });
  {
    console.log("[team linking] post-commit", {
      teamVersionId: args.teamVersionId,
      formatKeyHint: args.formatKeyHint ?? null,
      ...res
    });
  }
  return res;
}
const STAT_MAP = {
  hp: "hp",
  atk: "atk",
  def: "def",
  spa: "spa",
  spatk: "spa",
  spdef: "spd",
  spd: "spd",
  spe: "spe",
  speed: "spe"
};
const SUPPORTED_KEYS = /* @__PURE__ */ new Set(["ability", "level", "evs", "ivs", "tera type", "happiness", "shiny"]);
function toFiniteInt$1(v) {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.trunc(n) : null;
}
function parseSpread(value) {
  const out = {};
  const parts = value.split("/").map((x) => x.trim()).filter(Boolean);
  for (const p of parts) {
    const m = p.match(/^(\d+)\s+(.+)$/);
    if (!m) continue;
    const n = toFiniteInt$1(m[1]);
    if (n == null) continue;
    const statRaw = m[2].trim();
    const keyToken = statRaw.toLowerCase().replace(/\./g, "").replace(/\s+/g, "");
    const key = STAT_MAP[keyToken];
    if (!key) continue;
    out[key] = n;
  }
  return out;
}
function parseHeader(line) {
  const [leftRaw, itemPart] = line.split(" @ ");
  const item_name = itemPart ? itemPart.trim() : null;
  let left = (leftRaw ?? "").trim();
  if (!left) return null;
  let gender = null;
  const gm = left.match(/\((M|F)\)\s*$/);
  if (gm) {
    gender = gm[1];
    left = left.replace(/\((M|F)\)\s*$/, "").trim();
  }
  let nickname = null;
  let species_name = left;
  const nm = left.match(/^(.+)\s+\((.+)\)$/);
  if (nm) {
    nickname = nm[1].trim();
    species_name = nm[2].trim();
  }
  if (!species_name) return null;
  return { nickname, species_name, item_name, gender };
}
function statsFromSpread(sp) {
  return {
    hp: sp.hp ?? null,
    atk: sp.atk ?? null,
    def: sp.def ?? null,
    spa: sp.spa ?? null,
    spd: sp.spd ?? null,
    spe: sp.spe ?? null
  };
}
function parseShowdownExport(raw) {
  const warnings = [];
  const text = (raw ?? "").replace(/\r\n/g, "\n").trim();
  if (!text) return { sets: [], warnings: ["Empty paste."] };
  const blocks = text.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  const sets = [];
  for (const [bi, block] of blocks.entries()) {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) continue;
    const header = parseHeader(lines[0]);
    if (!header) {
      warnings.push(`Block ${bi + 1}: invalid header line.`);
      continue;
    }
    let ability_name = null;
    let level = null;
    let shiny = 0;
    let tera_type = null;
    let happiness = null;
    let nature = null;
    let evs = {};
    let ivs = {};
    const moves = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const nat = line.match(/^(.+)\s+Nature$/i);
      if (nat) {
        nature = nat[1].trim() || null;
        continue;
      }
      const kv = line.match(/^([^:]+):\s*(.+)$/);
      if (kv) {
        const key = kv[1].replace(/^\uFEFF/, "").trim().toLowerCase();
        const val = kv[2].trim();
        if (!SUPPORTED_KEYS.has(key)) {
          warnings.push(`Block ${bi + 1}: unsupported key "${kv[1].trim()}" (English-only).`);
          continue;
        }
        if (key === "ability") {
          ability_name = val || null;
          continue;
        }
        if (key === "level") {
          level = toFiniteInt$1(val);
          continue;
        }
        if (key === "evs") {
          evs = parseSpread(val);
          continue;
        }
        if (key === "ivs") {
          ivs = parseSpread(val);
          continue;
        }
        if (key === "tera type") {
          tera_type = val || null;
          continue;
        }
        if (key === "happiness") {
          happiness = toFiniteInt$1(val);
          continue;
        }
        if (key === "shiny") {
          shiny = /yes|true|1/i.test(val) ? 1 : 0;
          continue;
        }
        continue;
      }
      if (moves.length < 4) {
        const mv = line.replace(/^-+\s*/, "").trim();
        if (mv && !mv.includes(":")) {
          moves.push(mv);
          continue;
        }
      }
    }
    if (moves.length === 0) {
      warnings.push(`Block ${bi + 1}: no moves detected.`);
    }
    if (moves.length > 4) {
      warnings.push(`Block ${bi + 1}: ${moves.length} moves found; keeping first 4.`);
    }
    const ev = statsFromSpread(evs);
    const iv = statsFromSpread(ivs);
    sets.push({
      nickname: header.nickname,
      species_name: header.species_name,
      item_name: header.item_name,
      ability_name,
      level,
      gender: header.gender,
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
      moves: moves.slice(0, 4)
    });
  }
  if (sets.length === 0) warnings.push("No Pokémon blocks found in paste.");
  if (sets.length > 6) warnings.push(`Paste contains ${sets.length} Pokémon; only first 6 will be imported.`);
  return { sets, warnings };
}
function canonicalizeSourceText(raw) {
  return raw.replace(/\r\n/g, "\n").trim().replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n");
}
function sha256(s) {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}
function sourceHashFromText(raw) {
  return sha256(canonicalizeSourceText(raw));
}
function canonStats(label, xs) {
  const order = ["hp", "atk", "def", "spa", "spd", "spe"];
  const parts = order.filter((k) => xs[k] != null).map((k) => `${xs[k]} ${k}`);
  return `${label}:${parts.join(",")}`;
}
function evMapFromSet(s) {
  return {
    hp: s.ev_hp,
    atk: s.ev_atk,
    def: s.ev_def,
    spa: s.ev_spa,
    spd: s.ev_spd,
    spe: s.ev_spe
  };
}
function ivMapFromSet(s) {
  return {
    hp: s.iv_hp,
    atk: s.iv_atk,
    def: s.iv_def,
    spa: s.iv_spa,
    spd: s.iv_spd,
    spe: s.iv_spe
  };
}
function norm(s) {
  return (s ?? "").trim();
}
function normNum(n) {
  return n == null ? "" : String(n);
}
function setHash(s) {
  const moves = (s.moves ?? []).map((m) => m.trim()).filter(Boolean).slice(0, 4).join("|");
  const blob = [
    `species=${norm(s.species_name)}`,
    `nick=${norm(s.nickname)}`,
    `item=${norm(s.item_name)}`,
    `ability=${norm(s.ability_name)}`,
    `level=${normNum(s.level)}`,
    `gender=${norm(s.gender)}`,
    `shiny=${s.shiny ?? 0}`,
    `tera=${norm(s.tera_type)}`,
    `happy=${normNum(s.happiness)}`,
    `nature=${norm(s.nature)}`,
    canonStats("ev", evMapFromSet(s)),
    canonStats("iv", ivMapFromSet(s)),
    `moves=${moves}`
  ].join("\n");
  return sha256(blob);
}
const STAT_DEFS = [
  { key: "ev_hp", label: "HP", vitamin: "HP Up", feather: "Health Feather" },
  { key: "ev_atk", label: "Atk", vitamin: "Protein", feather: "Muscle Feather" },
  { key: "ev_def", label: "Def", vitamin: "Iron", feather: "Resist Feather" },
  { key: "ev_spa", label: "SpA", vitamin: "Calcium", feather: "Genius Feather" },
  { key: "ev_spd", label: "SpD", vitamin: "Zinc", feather: "Clever Feather" },
  { key: "ev_spe", label: "Spe", vitamin: "Carbos", feather: "Swift Feather" }
];
function mapSetToDb(s) {
  return {
    nickname: s.nickname ?? null,
    species_name: s.species_name,
    item_name: s.item_name ?? null,
    ability_name: s.ability_name ?? null,
    level: s.level ?? null,
    gender: s.gender ?? null,
    shiny: s.shiny ?? 0,
    tera_type: s.tera_type ?? null,
    happiness: s.happiness ?? null,
    nature: s.nature ?? null,
    ev_hp: s.ev_hp ?? null,
    ev_atk: s.ev_atk ?? null,
    ev_def: s.ev_def ?? null,
    ev_spa: s.ev_spa ?? null,
    ev_spd: s.ev_spd ?? null,
    ev_spe: s.ev_spe ?? null,
    iv_hp: s.iv_hp ?? null,
    iv_atk: s.iv_atk ?? null,
    iv_def: s.iv_def ?? null,
    iv_spa: s.iv_spa ?? null,
    iv_spd: s.iv_spd ?? null,
    iv_spe: s.iv_spe ?? null
  };
}
function buildLocalRecipeFromSet(set) {
  const stats = [];
  STAT_DEFS.forEach((stat) => {
    const value = set[stat.key] ?? 0;
    if (!value) return;
    const vitamins = Math.floor(value / 10);
    const feathers = value - vitamins * 10;
    const items = [];
    if (vitamins > 0) items.push({ name: stat.vitamin, count: vitamins });
    if (feathers > 0) items.push({ name: stat.feather, count: feathers });
    stats.push({ stat: stat.label, items });
  });
  return {
    stats,
    assumptions: [
      "Assumes fresh Pokemon (0 EVs).",
      "Vitamins provide 10 EV each.",
      "Feathers are used for +1 EV precision."
    ],
    source: "local"
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
function normalizePokepasteUrl(url) {
  const u = url == null ? void 0 : url.trim();
  if (!u) return null;
  const m = u.match(/^https?:\/\/pokepast\.es\/([a-zA-Z0-9]+)(?:\/.*)?$/);
  if (!m) throw new Error("Invalid Pokepaste URL.");
  const id = m[1];
  return { id, viewUrl: `https://pokepast.es/${id}`, rawUrl: `https://pokepast.es/${id}/raw` };
}
async function fetchText(url, timeoutMs = 1e4) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "User-Agent": "PokeMentor/1.0",
        Accept: "text/html, text/plain;q=0.9, */*;q=0.8"
      }
    });
    if (!res.ok) throw new Error(`Fetch failed (${res.status}) for ${url}`);
    return await res.text();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Failed to fetch ${url}: ${msg}`);
  } finally {
    clearTimeout(t);
  }
}
function teamImportService(db2, deps) {
  const repo = deps.teamsRepo;
  return {
    async importFromPokepaste(args) {
      var _a, _b, _c, _d;
      const paste = (args.paste_text ?? "").trim();
      const norm2 = normalizePokepasteUrl(args.url);
      if (!paste && !norm2) {
        throw new Error("Provide either a Pokepaste URL or pasted Showdown export text.");
      }
      let rawText;
      let meta = { title: null, author: null, format: null };
      let source_url = null;
      if (paste) {
        rawText = paste;
        source_url = (norm2 == null ? void 0 : norm2.viewUrl) ?? null;
      } else {
        const { viewUrl, rawUrl } = norm2;
        source_url = viewUrl;
        const [fetchedRaw, viewHtml] = await Promise.all([fetchText(rawUrl), fetchText(viewUrl)]);
        rawText = fetchedRaw;
        meta = parsePokepasteMetaFromHtml(viewHtml);
      }
      const canonicalSource = canonicalizeSourceText(rawText);
      const source_hash = sourceHashFromText(canonicalSource);
      const nowIso = (/* @__PURE__ */ new Date()).toISOString();
      const parsed = parseShowdownExport(canonicalSource);
      const parsedSets = parsed.sets;
      if (parsed.warnings.length) {
        console.log("[team import] parse warnings", parsed.warnings);
      }
      const finalName = ((_a = args.name) == null ? void 0 : _a.trim()) || ((_b = meta.title) == null ? void 0 : _b.trim()) || "Imported Team";
      const finalFormat = ((_c = args.format_ps) == null ? void 0 : _c.trim()) || ((_d = meta.format) == null ? void 0 : _d.trim()) || null;
      const result = db2.transaction(() => {
        var _a2;
        const team_id = randomUUID();
        const version_id = randomUUID();
        const version_num = 1;
        repo.insertTeam({ id: team_id, name: finalName, format_ps: finalFormat, now: nowIso });
        repo.insertTeamVersion({
          id: version_id,
          team_id,
          version_num,
          source_url,
          source_hash,
          source_text: rawText,
          source_title: meta.title,
          source_author: meta.author,
          source_format: meta.format,
          now: nowIso
        });
        let slotIndex = 1;
        for (const s of parsedSets.slice(0, 6)) {
          const set_hash = setHash(s);
          const existingId = repo.findPokemonSetIdByHash(set_hash);
          const pokemon_set_id = existingId ?? randomUUID();
          if (!existingId) {
            repo.insertPokemonSet({
              id: pokemon_set_id,
              ...mapSetToDb(s),
              set_hash,
              now: nowIso
            });
            for (let i = 0; i < Math.min(s.moves.length, 4); i++) {
              const moveName = (_a2 = s.moves[i]) == null ? void 0 : _a2.trim();
              if (!moveName) continue;
              const move_id = repo.getOrCreateMoveId(moveName);
              repo.insertPokemonSetMove({ pokemon_set_id, move_slot: i + 1, move_id });
            }
          }
          repo.insertTeamSlot({ team_version_id: version_id, slot_index: slotIndex, pokemon_set_id });
          const localRecipe = buildLocalRecipeFromSet(s);
          repo.upsertTeamEvRecipe({
            team_version_id: version_id,
            pokemon_set_id,
            source: "local",
            recipe_json: JSON.stringify(localRecipe),
            now: nowIso
          });
          slotIndex += 1;
        }
        return { team_id, version_id, version_num, slots_inserted: Math.min(parsedSets.length, 6) };
      })();
      const linking = postCommitTeamVersionLinking(
        db2,
        {
          teamsRepo: deps.teamsRepo
        },
        {
          teamVersionId: result.version_id,
          formatKeyHint: finalFormat,
          limit: 500
        }
      );
      return { ...result, linking };
    },
    async previewFromPokepaste(args) {
      const paste = (args.paste_text ?? "").trim();
      const norm2 = normalizePokepasteUrl(args.url);
      if (!paste && !norm2) {
        throw new Error("Provide either a Pokepaste URL or pasted Showdown export text.");
      }
      let rawText;
      let meta = { title: null, author: null, format: null };
      let source_url = null;
      if (paste) {
        rawText = paste;
        source_url = (norm2 == null ? void 0 : norm2.viewUrl) ?? null;
      } else {
        const { viewUrl, rawUrl } = norm2;
        source_url = viewUrl;
        const [fetchedRaw, viewHtml] = await Promise.all([fetchText(rawUrl), fetchText(viewUrl)]);
        rawText = fetchedRaw;
        meta = parsePokepasteMetaFromHtml(viewHtml);
      }
      const canonicalSource = canonicalizeSourceText(rawText);
      const parsed = parseShowdownExport(canonicalSource);
      if (parsed.warnings.length) {
        console.log("[team import preview] parse warnings", parsed.warnings);
      }
      return {
        source_url,
        raw_text: canonicalSource,
        meta,
        warnings: parsed.warnings,
        sets: parsed.sets
      };
    }
  };
}
class TeamActiveService {
  constructor(repo) {
    this.repo = repo;
  }
  /**
   * Marks the given team as active (and clears any previous active team).
   * Returns { ok: true } for API convenience.
   */
  setActiveTeam(teamId) {
    this.repo.setActiveTeam(teamId);
    return { ok: true };
  }
  /**
   * Returns a lightweight summary row for the active team, or null if none.
   */
  getActiveTeamSummary() {
    return this.repo.getActiveTeamSummary();
  }
  /**
   * Returns the active team plus high-level activity counters:
   * - last import time
   * - last linked battle time
   * - total linked battles
   */
  getActiveTeamActivity() {
    return this.repo.getActiveTeamActivity();
  }
  /**
   * Convenience helper if you prefer a single endpoint that both sets
   * the active team and returns the activity payload for immediate UI refresh.
   */
  setActiveTeamAndGetActivity(teamId) {
    this.setActiveTeam(teamId);
    return this.getActiveTeamActivity();
  }
}
function normalizeShowdownName$1(name) {
  if (!name) return "";
  const trimmed = name.trim().replace(/^[@☆★+%~*&]+/, "");
  const id = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return id || trimmed.toLowerCase().replace(/\s+/g, "");
}
function clampInt(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}
function normalizeFormatKey(format_id, format_name) {
  const key = String(format_id ?? format_name ?? "").trim();
  return key.length ? key : null;
}
function uniqPreserveOrder(xs) {
  const out = [];
  const seen = /* @__PURE__ */ new Set();
  for (const x of xs) {
    const v = (x ?? "").trim();
    if (!v) continue;
    const k = v.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
}
function inferWinnerSideFromNames(args) {
  const { winnerName, p1Name, p2Name } = args;
  if (!winnerName) return null;
  const w = normalizeShowdownName$1(winnerName);
  if (!w) return null;
  const p1n = p1Name ? normalizeShowdownName$1(p1Name) : "";
  const p2n = p2Name ? normalizeShowdownName$1(p2Name) : "";
  if (p1n && w === p1n) return "p1";
  if (p2n && w === p2n) return "p2";
  return null;
}
function battleRepo(db2) {
  const stmt = {
    getUserSide: db2.prepare(`
      SELECT side
      FROM battle_sides
      WHERE battle_id = ? AND is_user = 1
      LIMIT 1
    `),
    getBattleMeta: db2.prepare(`
      SELECT format_id, format_name, game_type
      FROM battles
      WHERE id = ?
      LIMIT 1
    `),
    getRevealedSpecies: db2.prepare(`
      SELECT DISTINCT TRIM(species_name) AS species_name
      FROM battle_revealed_sets
      WHERE battle_id = ? AND side = ?
        AND TRIM(COALESCE(species_name,'')) <> ''
      ORDER BY species_name ASC
    `),
    getPreviewSpecies: db2.prepare(`
      SELECT DISTINCT TRIM(species_name) AS species_name
      FROM battle_preview_pokemon
      WHERE battle_id = ? AND side = ?
        AND TRIM(COALESCE(species_name,'')) <> ''
      ORDER BY slot_index ASC
    `),
    readExistingLink: db2.prepare(`
      SELECT team_version_id, match_confidence, matched_by
      FROM battle_team_links
      WHERE battle_id = ? AND side = ?
      LIMIT 1
    `),
    listCandidateBattleIdsByFormat: db2.prepare(`
      SELECT b.id
      FROM battles b
      WHERE COALESCE(b.format_id, b.format_name, '') LIKE ? || '%'
        AND NOT EXISTS (
          SELECT 1
          FROM battle_team_links l
          JOIN battle_sides s
            ON s.battle_id = l.battle_id
           AND s.side = l.side
           AND s.is_user = 1
          WHERE l.battle_id = b.id
            AND l.team_version_id IS NOT NULL
        )
      ORDER BY COALESCE(b.played_at, b.upload_time, b.created_at) DESC
      LIMIT ?
    `),
    listCandidateBattleIdsAnyFormat: db2.prepare(`
      SELECT b.id
      FROM battles b
      WHERE NOT EXISTS (
        SELECT 1
        FROM battle_team_links l
        JOIN battle_sides s
          ON s.battle_id = l.battle_id
         AND s.side = l.side
         AND s.is_user = 1
        WHERE l.battle_id = b.id
          AND l.team_version_id IS NOT NULL
      )
      ORDER BY COALESCE(b.played_at, b.upload_time, b.created_at) DESC
      LIMIT ?
    `),
    listBattleEvents: db2.prepare(`
      SELECT event_index, turn_num, line_type, raw_line
      FROM battle_events
      WHERE battle_id = ?
      ORDER BY event_index ASC
    `),
    previewCountsBySide: db2.prepare(`
      SELECT side, COUNT(*) AS c
      FROM battle_preview_pokemon
      WHERE battle_id = ?
      GROUP BY side
    `),
    revealedCountsBySide: db2.prepare(`
      SELECT side, COUNT(*) AS c
      FROM battle_revealed_sets
      WHERE battle_id = ?
      GROUP BY side
    `),
    listBattles: db2.prepare(`
      SELECT
        b.id,
        b.replay_id,
        b.format_id,
        b.format_name,
        b.game_type,
        b.played_at,
        b.upload_time,
        b.created_at,
        b.is_rated,
        b.is_private,
        b.winner_side,
        b.winner_name,

        us.side AS user_side,
        us.player_name AS user_player_name,

        os.player_name AS opponent_name,

        CASE
          WHEN us.side IS NULL OR b.winner_side IS NULL THEN NULL
          WHEN b.winner_side = us.side THEN 'win'
          ELSE 'loss'
        END AS result,

        l.team_version_id AS linked_team_version_id,
        l.match_confidence AS link_confidence,
        l.match_method AS link_method,
        l.matched_by AS link_matched_by,

        tv.team_id AS team_id,
        t.name AS team_name,

        COALESCE(
          NULLIF((
            SELECT json_group_array(
              json_object('species_name', pi.species_name, 'is_lead', bbp.is_lead)
            )
            FROM battle_brought_pokemon bbp
            JOIN battle_pokemon_instances pi ON pi.id = bbp.pokemon_instance_id
            WHERE bbp.battle_id = b.id
              AND bbp.side = us.side
          ), '[]'),
          (
            SELECT json_group_array(
              json_object('species_name', p.species_name, 'is_lead', 0)
            )
            FROM (
              SELECT species_name
              FROM battle_preview_pokemon
              WHERE battle_id = b.id AND side = us.side
              ORDER BY slot_index
            ) p
          ),
          '[]'
        ) AS user_brought_json,

        COALESCE(
          NULLIF((
            SELECT json_group_array(
              json_object('species_name', pi.species_name, 'is_lead', bbp.is_lead)
            )
            FROM battle_brought_pokemon bbp
            JOIN battle_pokemon_instances pi ON pi.id = bbp.pokemon_instance_id
            WHERE bbp.battle_id = b.id
              AND bbp.side = CASE
                WHEN us.side = 'p1' THEN 'p2'
                WHEN us.side = 'p2' THEN 'p1'
                ELSE NULL
              END
          ), '[]'),
          (
            SELECT json_group_array(
              json_object('species_name', p.species_name, 'is_lead', 0)
            )
            FROM (
              SELECT species_name
              FROM battle_preview_pokemon
              WHERE battle_id = b.id AND side = CASE
                WHEN us.side = 'p1' THEN 'p2'
                WHEN us.side = 'p2' THEN 'p1'
                ELSE NULL
              END
              ORDER BY slot_index
            ) p
          ),
          '[]'
        ) AS opponent_brought_json

      FROM battles b

      LEFT JOIN battle_sides us
        ON us.battle_id = b.id AND us.is_user = 1

      LEFT JOIN battle_sides os
        ON os.battle_id = b.id
      AND os.side = CASE
          WHEN us.side = 'p1' THEN 'p2'
          WHEN us.side = 'p2' THEN 'p1'
          ELSE NULL
        END

      LEFT JOIN battle_team_links l
        ON l.battle_id = b.id AND l.side = us.side

      LEFT JOIN team_versions tv
        ON tv.id = l.team_version_id

      LEFT JOIN teams t
        ON t.id = tv.team_id

      ORDER BY COALESCE(b.played_at, b.upload_time, b.created_at) DESC
      LIMIT @limit OFFSET @offset;
    `),
    getBattleRow: db2.prepare(`
      SELECT
        id,
        replay_id,
        replay_url,
        replay_json_url,
        format_id,
        format_name,
        gen,
        game_type,
        upload_time,
        played_at,
        views,
        rating,
        is_private,
        is_rated,
        winner_side,
        winner_name,
        created_at
      FROM battles
      WHERE id = ?
      LIMIT 1
    `),
    listBattleSides: db2.prepare(`
      SELECT side, is_user, player_name, avatar, rating
      FROM battle_sides
      WHERE battle_id = ?
      ORDER BY side ASC
    `),
    listBattlePreview: db2.prepare(`
      SELECT side, slot_index, species_name, level, gender, shiny, raw_text
      FROM battle_preview_pokemon
      WHERE battle_id = ?
      ORDER BY side ASC, slot_index ASC
    `),
    listBattleRevealed: db2.prepare(`
      SELECT
        side,
        species_name,
        nickname,
        item_name,
        ability_name,
        tera_type,
        level,
        gender,
        shiny,
        moves_json,
        raw_fragment
      FROM battle_revealed_sets
      WHERE battle_id = ?
      ORDER BY side ASC, species_name ASC
    `),
    readUserSideLink: db2.prepare(`
      SELECT
        l.team_version_id,
        l.match_confidence,
        l.match_method,
        l.matched_by
      FROM battle_team_links l
      JOIN battle_sides s
        ON s.battle_id = l.battle_id
       AND s.side = l.side
       AND s.is_user = 1
      WHERE l.battle_id = ?
      LIMIT 1
    `),
    getBattleIdByReplayId: db2.prepare(`
      SELECT id
      FROM battles
      WHERE replay_id = ?
      LIMIT 1
    `),
    getBattleSetForBattle: db2.prepare(`
      SELECT
        sg.set_id AS id,
        sg.game_number AS game_number,
        sg.total_games AS total_games
      FROM battle_set_games sg
      WHERE sg.battle_id = ?
      LIMIT 1
    `),
    listBattleSetGames: db2.prepare(`
      SELECT
        b.id AS battle_id,
        b.replay_id AS replay_id,
        b.played_at AS played_at,
        sg.game_number AS game_number
      FROM battle_set_games sg
      JOIN battles b ON b.id = sg.battle_id
      WHERE sg.set_id = ?
      ORDER BY
        CASE WHEN sg.game_number IS NULL THEN 1 ELSE 0 END,
        sg.game_number ASC,
        COALESCE(b.played_at, b.upload_time, b.created_at) ASC,
        b.id ASC
    `)
  };
  const write = {
    upsertLink: db2.prepare(`
      INSERT INTO battle_team_links (
        battle_id, side, team_version_id,
        match_confidence, match_method,
        matched_at, matched_by
      ) VALUES (
        @battle_id, @side, @team_version_id,
        @match_confidence, @match_method,
        @matched_at, @matched_by
      )
      ON CONFLICT(battle_id, side) DO UPDATE SET
        team_version_id = excluded.team_version_id,
        match_confidence = excluded.match_confidence,
        match_method = excluded.match_method,
        matched_at = excluded.matched_at,
        matched_by = excluded.matched_by
    `),
    upsertBattleHeader: db2.prepare(`
      INSERT INTO battles (
        id, replay_id, replay_url, replay_json_url,
        format_id, format_name, gen, game_type,
        upload_time, played_at, views, rating,
        is_private, is_rated,
        bestof_group_id, bestof_game_num, bestof_total,
        winner_side, winner_name,
        raw_json, raw_log,
        created_at
      ) VALUES (
        @id, @replay_id, @replay_url, @replay_json_url,
        @format_id, @format_name, @gen, @game_type,
        @upload_time, @played_at, @views, @rating,
        @is_private, @is_rated,
        @bestof_group_id, @bestof_game_num, @bestof_total,
        @winner_side, @winner_name,
        @raw_json, @raw_log,
        @created_at
      )
      ON CONFLICT(replay_id) DO UPDATE SET
        replay_url       = excluded.replay_url,
        replay_json_url  = excluded.replay_json_url,
        format_id        = excluded.format_id,
        format_name      = excluded.format_name,
        gen              = excluded.gen,
        game_type        = excluded.game_type,
        upload_time      = excluded.upload_time,
        played_at        = excluded.played_at,
        views            = excluded.views,
        rating           = excluded.rating,
        is_private       = excluded.is_private,
        is_rated         = excluded.is_rated,
        bestof_group_id  = excluded.bestof_group_id,
        bestof_game_num  = excluded.bestof_game_num,
        bestof_total     = excluded.bestof_total,
        winner_side      = excluded.winner_side,
        winner_name      = excluded.winner_name,
        raw_json         = excluded.raw_json,
        raw_log          = excluded.raw_log
    `),
    deleteBattleEvents: db2.prepare(`DELETE FROM battle_events WHERE battle_id = ?`),
    deleteBattleSides: db2.prepare(`DELETE FROM battle_sides WHERE battle_id = ?`),
    deleteBattlePreview: db2.prepare(`DELETE FROM battle_preview_pokemon WHERE battle_id = ?`),
    deleteBattleRevealed: db2.prepare(`DELETE FROM battle_revealed_sets WHERE battle_id = ?`),
    deleteBattleSwitches: db2.prepare(`DELETE FROM battle_switches WHERE battle_id = ?`),
    deleteBattleMoves: db2.prepare(`DELETE FROM battle_moves WHERE battle_id = ?`),
    deleteBattleBrought: db2.prepare(`DELETE FROM battle_brought_pokemon WHERE battle_id = ?`),
    deleteBattleInstances: db2.prepare(`DELETE FROM battle_pokemon_instances WHERE battle_id = ?`),
    deleteBattleLinksAll: db2.prepare(`DELETE FROM battle_team_links WHERE battle_id = ?`),
    deleteBattleLinksNonUser: db2.prepare(`DELETE FROM battle_team_links WHERE battle_id = ? AND matched_by != 'user'`),
    deleteBattleAnalysisRuns: db2.prepare(`DELETE FROM battle_analysis_runs WHERE battle_id = ?`)
  };
  return {
    // ---- Existing reads ----
    getUserSide(battleId) {
      const row = stmt.getUserSide.get(battleId);
      return (row == null ? void 0 : row.side) ?? null;
    },
    getBattleMeta(battleId) {
      const row = stmt.getBattleMeta.get(battleId);
      if (!row) return null;
      const formatKey = normalizeFormatKey(row.format_id, row.format_name);
      if (!formatKey) return null;
      return { formatKey, gameType: row.game_type ?? null };
    },
    getRevealedSpecies(battleId, side) {
      const rows = stmt.getRevealedSpecies.all(battleId, side);
      return uniqPreserveOrder(rows.map((r) => (r.species_name ?? "").trim()).filter(Boolean));
    },
    getPreviewSpecies(battleId, side) {
      const rows = stmt.getPreviewSpecies.all(battleId, side);
      return uniqPreserveOrder(rows.map((r) => (r.species_name ?? "").trim()).filter(Boolean));
    },
    readExistingLink(battleId, side) {
      const row = stmt.readExistingLink.get(battleId, side);
      return row ?? null;
    },
    // ---- Writes ----
    upsertLink(args) {
      const matched_at = args.matchedAtUnix ?? Math.floor(Date.now() / 1e3);
      write.upsertLink.run({
        battle_id: args.battleId,
        side: args.side,
        team_version_id: args.teamVersionId,
        match_confidence: args.confidence,
        match_method: args.method,
        matched_at,
        matched_by: args.matchedBy
      });
    },
    // ---- Backfill helpers ----
    listBackfillCandidateBattleIds(args) {
      var _a;
      const limit = clampInt(args.limit, 1, 1e3);
      const formatKey = ((_a = args.formatKeyHint) == null ? void 0 : _a.trim()) || null;
      let rows = [];
      if (formatKey) {
        rows = stmt.listCandidateBattleIdsByFormat.all(formatKey, limit);
      }
      if (!rows.length) {
        rows = stmt.listCandidateBattleIdsAnyFormat.all(limit);
      }
      return rows;
    },
    // ---- Optional diagnostics ----
    getPreviewCountsBySide(battleId) {
      return stmt.previewCountsBySide.all(battleId);
    },
    getRevealedCountsBySide(battleId) {
      return stmt.revealedCountsBySide.all(battleId);
    },
    // ---- List / details ----
    listBattles(args) {
      const limit = clampInt((args == null ? void 0 : args.limit) ?? 200, 1, 500);
      const offset = clampInt((args == null ? void 0 : args.offset) ?? 0, 0, 1e6);
      return stmt.listBattles.all({ limit, offset });
    },
    getBattleDetails(battleId) {
      var _a, _b, _c;
      const battleRow = stmt.getBattleRow.get(battleId);
      if (!battleRow) return null;
      const sides = stmt.listBattleSides.all(battleId);
      const preview = stmt.listBattlePreview.all(battleId);
      const revealed = stmt.listBattleRevealed.all(battleId);
      const events = stmt.listBattleEvents.all(battleId);
      const userSide = ((_a = sides.find((s) => s.is_user === 1)) == null ? void 0 : _a.side) ?? null;
      const userLink = stmt.readUserSideLink.get(battleId) ?? null;
      const p1Name = ((_b = sides.find((s) => s.side === "p1")) == null ? void 0 : _b.player_name) ?? null;
      const p2Name = ((_c = sides.find((s) => s.side === "p2")) == null ? void 0 : _c.player_name) ?? null;
      const inferredWinnerSide = battleRow.winner_side ?? inferWinnerSideFromNames({ winnerName: battleRow.winner_name, p1Name, p2Name });
      const battle = inferredWinnerSide ? { ...battleRow, winner_side: inferredWinnerSide } : battleRow;
      return {
        battle,
        sides,
        preview,
        revealed,
        events,
        userSide,
        userLink: userLink ? {
          team_version_id: userLink.team_version_id,
          match_confidence: userLink.match_confidence,
          match_method: userLink.match_method,
          matched_by: userLink.matched_by
        } : null
      };
    },
    getBattleSetSummary(battleId) {
      const setRow = stmt.getBattleSetForBattle.get(battleId);
      if (!setRow) return null;
      const games = stmt.listBattleSetGames.all(setRow.id);
      return {
        id: setRow.id,
        game_number: setRow.game_number ?? null,
        total_games: setRow.total_games ?? null,
        games
      };
    },
    // ---- Ingestion idempotency helpers ----
    getBattleIdByReplayId(replayId) {
      const row = stmt.getBattleIdByReplayId.get(replayId);
      return (row == null ? void 0 : row.id) ?? null;
    },
    upsertBattleHeader(row) {
      write.upsertBattleHeader.run(row);
    },
    clearBattleDerivedRows(battleId, opts = { preserveUserLinks: true, clearAi: true }) {
      write.deleteBattleEvents.run(battleId);
      write.deleteBattleSides.run(battleId);
      write.deleteBattlePreview.run(battleId);
      write.deleteBattleRevealed.run(battleId);
      write.deleteBattleSwitches.run(battleId);
      write.deleteBattleMoves.run(battleId);
      write.deleteBattleBrought.run(battleId);
      write.deleteBattleInstances.run(battleId);
      if (opts.preserveUserLinks) write.deleteBattleLinksNonUser.run(battleId);
      else write.deleteBattleLinksAll.run(battleId);
      if (opts.clearAi) write.deleteBattleAnalysisRuns.run(battleId);
    }
  };
}
async function fetchReplayJson(jsonUrl) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 2e4);
  try {
    const res = await fetch(jsonUrl, { method: "GET", signal: ctrl.signal });
    if (!res.ok) throw new Error(`Fetch failed (${res.status}) for ${jsonUrl}`);
    const data = await res.json();
    if (!(data == null ? void 0 : data.id) || !(data == null ? void 0 : data.log)) throw new Error("Unexpected JSON payload (missing id/log)");
    return data;
  } finally {
    clearTimeout(t);
  }
}
function uuid$2() {
  return crypto.randomUUID();
}
function parsePipeLine$1(line) {
  const parts = line.split("|");
  if (parts[0] === "") parts.shift();
  return parts;
}
function parseSideFromActorRef(actorRef) {
  const t = actorRef.trim().toLowerCase();
  if (t.startsWith("p1")) return "p1";
  if (t.startsWith("p2")) return "p2";
  return null;
}
function parseSpeciesFromDetails(details) {
  const s = (details ?? "").trim();
  if (!s) return null;
  const head = s.includes(",") ? s.split(",")[0] : s;
  const species = head.trim();
  return species || null;
}
function deriveFromEventLine(rawLine) {
  const parts = parsePipeLine$1(rawLine);
  const type = (parts[0] ?? "").trim();
  if (type !== "switch" && type !== "drag" && type !== "replace") return null;
  const actorRef = parts[1] ?? "";
  const details = parts[2] ?? "";
  const side = parseSideFromActorRef(actorRef);
  if (!side) return null;
  const species = parseSpeciesFromDetails(details);
  if (!species) return null;
  return { side, species };
}
function deriveBroughtFromEvents(db2, battleId) {
  const selectEventsStmt = db2.prepare(`
    SELECT event_index, raw_line
    FROM battle_events
    WHERE battle_id = ?
    ORDER BY event_index ASC
  `);
  const deleteExistingStmt = db2.prepare(`
    DELETE FROM battle_brought_pokemon
    WHERE battle_id = ?
  `);
  const findInstanceStmt = db2.prepare(`
    SELECT id
    FROM battle_pokemon_instances
    WHERE battle_id = ? AND side = ? AND LOWER(species_name) = LOWER(?)
    LIMIT 1
  `);
  const insertInstanceStmt = db2.prepare(`
    INSERT INTO battle_pokemon_instances (
      id, battle_id, side, species_name
    ) VALUES (
      @id, @battle_id, @side, @species_name
    )
  `);
  const insertBroughtStmt = db2.prepare(`
    INSERT INTO battle_brought_pokemon (
      battle_id, side, pokemon_instance_id, is_lead, fainted
    ) VALUES (
      @battle_id, @side, @pokemon_instance_id, @is_lead, @fainted
    )
    ON CONFLICT(battle_id, side, pokemon_instance_id) DO UPDATE SET
      is_lead = MAX(is_lead, excluded.is_lead),
      fainted = MAX(fainted, excluded.fainted)
  `);
  const events = selectEventsStmt.all(battleId);
  const firstSeen = /* @__PURE__ */ new Map();
  for (const e of events) {
    const hit = deriveFromEventLine(e.raw_line);
    if (!hit) continue;
    const key = `${battleId}|${hit.side}|${hit.species.toLowerCase()}`;
    const existing = firstSeen.get(key);
    if (!existing || e.event_index < existing.first_seen_event_index) {
      firstSeen.set(key, {
        battle_id: battleId,
        side: hit.side,
        species_name: hit.species,
        first_seen_event_index: e.event_index
      });
    }
  }
  const rows = Array.from(firstSeen.values());
  db2.transaction(() => {
    deleteExistingStmt.run(battleId);
    const instanceCache = /* @__PURE__ */ new Map();
    for (const r of rows) {
      const key = `${r.side}|${r.species_name.toLowerCase()}`;
      let instanceId = instanceCache.get(key);
      if (!instanceId) {
        const found = findInstanceStmt.get(
          r.battle_id,
          r.side,
          r.species_name
        );
        if (found == null ? void 0 : found.id) {
          instanceId = found.id;
        } else {
          instanceId = uuid$2();
          insertInstanceStmt.run({
            id: instanceId,
            battle_id: r.battle_id,
            side: r.side,
            species_name: r.species_name
          });
        }
        instanceCache.set(key, instanceId);
      }
      insertBroughtStmt.run({
        battle_id: r.battle_id,
        side: r.side,
        pokemon_instance_id: instanceId,
        is_lead: 0,
        fainted: 0
      });
    }
  })();
  let p1 = 0;
  let p2 = 0;
  for (const r of rows) {
    if (r.side === "p1") p1 += 1;
    else p2 += 1;
  }
  return { p1, p2, total: rows.length };
}
function toFiniteInt(v) {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.trunc(n) : null;
}
function cleanToken(s) {
  return (typeof s === "string" ? s : "").trim();
}
function parseMovesCsv(csv) {
  return csv.split(",").map((m) => m.trim()).filter(Boolean);
}
function splitShowteamEntries(blob) {
  return blob.split("]").map((x) => x.trim()).filter(Boolean);
}
function parseShowteamEntry(entry) {
  const raw = entry;
  const fields = entry.split("|");
  const species = cleanToken(fields[0]);
  if (!species) return null;
  const nickname = cleanToken(fields[1]) || null;
  const item = cleanToken(fields[3]) || null;
  const ability = cleanToken(fields[4]) || null;
  const movesCsv = cleanToken(fields[5]);
  const moves = movesCsv ? parseMovesCsv(movesCsv) : [];
  const genderRaw = cleanToken(fields[8]);
  const gender = genderRaw === "M" || genderRaw === "F" ? genderRaw : null;
  const level = fields[11] ? toFiniteInt(fields[11]) : null;
  const tail = cleanToken(fields[12]);
  const tera = tail && tail.includes(",") ? cleanToken(tail.split(",").pop()) || null : null;
  return {
    species,
    nickname,
    item,
    ability,
    moves,
    gender,
    level,
    tera,
    raw
  };
}
function parseShowteamBlob(blob) {
  const out = [];
  for (const rawEntry of splitShowteamEntries(blob)) {
    const parsed = parseShowteamEntry(rawEntry);
    if (parsed) out.push(parsed);
  }
  return out;
}
function uuid$1() {
  return crypto.randomUUID();
}
function nowUnix$1() {
  return Math.floor(Date.now() / 1e3);
}
function getSetting(db2, key) {
  const row = db2.prepare("SELECT value FROM app_settings WHERE key = ?").get(key);
  return (row == null ? void 0 : row.value) ?? null;
}
function parseLogLines(rawLog) {
  return rawLog.split("\n").map((s) => s.trimEnd()).filter((s) => s.length > 0);
}
function parsePipeLine(line) {
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
    const parts = parsePipeLine(l);
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
    const p = parsePipeLine(l);
    if (p[0] === "gen") gen = toFiniteNumber(p[1]);
    if (p[0] === "gametype") gameType = p[1] ?? null;
    if (gen != null && gameType != null) break;
  }
  return { gen, gameType };
}
function findWinner(lines) {
  let winnerName = null;
  for (const l of lines) {
    const parts = parsePipeLine(l);
    if (parts[0] === "win" && parts[1]) winnerName = parts[1];
  }
  if (!winnerName) return { winnerName: null, winnerSide: null };
  let p1 = null;
  let p2 = null;
  for (const l of lines) {
    const parts = parsePipeLine(l);
    if (parts[0] === "player") {
      const side = parts[1];
      const name = parts[2];
      if (side === "p1") p1 = name ?? null;
      if (side === "p2") p2 = name ?? null;
    }
  }
  const winnerNorm = normalizeShowdownName$1(winnerName);
  const p1Norm = p1 ? normalizeShowdownName$1(p1) : null;
  const p2Norm = p2 ? normalizeShowdownName$1(p2) : null;
  const winnerSide = winnerNorm && p1Norm && winnerNorm === p1Norm ? "p1" : winnerNorm && p2Norm && winnerNorm === p2Norm ? "p2" : null;
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
function makeIsUserFn(db2) {
  const showdownUsername = getSetting(db2, "showdown_username");
  const showdownUsernameNorm = showdownUsername ? normalizeShowdownName$1(showdownUsername) : null;
  return (playerName) => {
    if (!showdownUsernameNorm) return 0;
    return normalizeShowdownName$1(playerName) === showdownUsernameNorm ? 1 : 0;
  };
}
function prepareStatements(db2) {
  return {
    insertSide: db2.prepare(`
      INSERT INTO battle_sides (battle_id, side, is_user, player_name, avatar, rating)
      VALUES (@battle_id, @side, @is_user, @player_name, @avatar, @rating);
    `),
    insertPreview: db2.prepare(`
      INSERT INTO battle_preview_pokemon (
        battle_id, side, slot_index,
        species_name, level, gender, shiny, raw_text
      )
      VALUES (
        @battle_id, @side, @slot_index,
        @species_name, @level, @gender, @shiny, @raw_text
      );
    `),
    insertRevealed: db2.prepare(`
      INSERT INTO battle_revealed_sets (
        battle_id, side, species_name,
        nickname, item_name, ability_name, tera_type,
        level, gender, shiny,
        moves_json, raw_fragment
      ) VALUES (
        @battle_id, @side, @species_name,
        @nickname, @item_name, @ability_name, @tera_type,
        @level, @gender, @shiny,
        @moves_json, @raw_fragment
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
function ingestReplayJson(db2, battleRepo2, replayUrl, replayJsonUrl, json) {
  const now = nowUnix$1();
  if (!(json == null ? void 0 : json.id)) {
    throw new Error("Replay JSON missing id");
  }
  const existingBattleId = battleRepo2.getBattleIdByReplayId(json.id);
  const battleId = existingBattleId ?? uuid$1();
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
    battleRepo2.upsertBattleHeader({
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
      // Bo3 columns remain optional; fill later if you parse them
      bestof_group_id: null,
      bestof_game_num: null,
      bestof_total: null,
      winner_side: winnerSide,
      winner_name: winnerName,
      raw_json: JSON.stringify(json),
      raw_log: json.log ?? "",
      // created_at should remain the original insert time if existing.
      // Your upsert keeps created_at from the original row; however, since you always pass @created_at,
      // it will be ignored on conflict (not updated). That is what we want.
      created_at: now
    });
    battleRepo2.clearBattleDerivedRows(battleId, { preserveUserLinks: true, clearAi: true });
    for (const raw of lines) {
      const parts = parsePipeLine(raw);
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
        const blob = parts.slice(2).join("|");
        if (side === "p1" || side === "p2") {
          const entries = parseShowteamBlob(blob);
          for (const parsed of entries) {
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
              raw_fragment: parsed.raw
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
function extractReplayId(input) {
  const s = input.trim();
  if (!s) return null;
  const m = s.match(/replay\.pokemonshowdown\.com\/([a-z0-9]+-\d+)(?:\.json)?/i) ?? s.match(/^([a-z0-9]+-\d+)$/i);
  return (m == null ? void 0 : m[1]) ?? null;
}
function replayUrlFromId(id) {
  return `https://replay.pokemonshowdown.com/${id}`;
}
function replayJsonUrlFromId(id) {
  return `https://replay.pokemonshowdown.com/${id}.json`;
}
function nowUnix() {
  return Math.floor(Date.now() / 1e3);
}
function uuid() {
  return crypto.randomUUID();
}
function computeBatchSetKey(battleIds) {
  const sorted = [...battleIds].sort();
  const hash = crypto.createHash("sha1").update(sorted.join(",")).digest("hex");
  return `batch:${hash}`;
}
function prepareSetStatements(db2) {
  return {
    // Create or touch a set. We update updated_at on conflict so repeated imports refresh it.
    upsertSetByKey: db2.prepare(`
      INSERT INTO battle_sets (
        id, set_key,
        format_id, format_name,
        player1_name, player2_name,
        source,
        created_at, updated_at
      ) VALUES (
        @id, @set_key,
        @format_id, @format_name,
        @player1_name, @player2_name,
        @source,
        @created_at, @updated_at
      )
      ON CONFLICT(set_key) DO UPDATE SET
        format_id   = excluded.format_id,
        format_name = excluded.format_name,
        player1_name = COALESCE(excluded.player1_name, battle_sets.player1_name),
        player2_name = COALESCE(excluded.player2_name, battle_sets.player2_name),
        source      = battle_sets.source, -- don't overwrite "manual" with "import-batch"
        updated_at  = excluded.updated_at
    `),
    readSetIdByKey: db2.prepare(`
      SELECT id
      FROM battle_sets
      WHERE set_key = ?
      LIMIT 1
    `),
    upsertSetGame: db2.prepare(`
      INSERT INTO battle_set_games (set_id, battle_id, game_number, total_games)
      VALUES (@set_id, @battle_id, @game_number, @total_games)
      ON CONFLICT(set_id, battle_id) DO UPDATE SET
        game_number = excluded.game_number,
        total_games = excluded.total_games
    `)
  };
}
function battleIngestService(db2, deps) {
  const { battleRepo: battleRepo2, battleLinkService } = deps;
  const setStmts = prepareSetStatements(db2);
  function createOrUpdateBatchSet(args) {
    const now = nowUnix();
    const setKey = computeBatchSetKey(args.battleIdsInOrder);
    const existing = setStmts.readSetIdByKey.get(setKey);
    const setId = (existing == null ? void 0 : existing.id) ?? uuid();
    setStmts.upsertSetByKey.run({
      id: setId,
      set_key: setKey,
      format_id: args.formatId ?? null,
      format_name: args.formatName ?? null,
      player1_name: args.player1Name ?? null,
      player2_name: args.player2Name ?? null,
      source: "import-batch",
      created_at: now,
      updated_at: now
    });
    const row = setStmts.readSetIdByKey.get(setKey);
    return (row == null ? void 0 : row.id) ?? setId;
  }
  function attachBattlesToSet(args) {
    const total = args.battleIdsInOrder.length;
    for (let i = 0; i < args.battleIdsInOrder.length; i++) {
      setStmts.upsertSetGame.run({
        set_id: args.setId,
        battle_id: args.battleIdsInOrder[i],
        game_number: i + 1,
        total_games: total
      });
    }
  }
  async function importFromReplaysText(text) {
    const inputs = text.split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    const rows = [];
    const seen = /* @__PURE__ */ new Set();
    const replayIds = [];
    for (const raw of inputs) {
      const id = extractReplayId(raw);
      if (!id) {
        rows.push({ input: raw, ok: false, error: "Unrecognized replay URL / id." });
        continue;
      }
      const k = id.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      replayIds.push(id);
    }
    const importedBattleIds = [];
    let representativeMeta = null;
    for (const replayId of replayIds) {
      const replayUrl = replayUrlFromId(replayId);
      const replayJsonUrl = replayJsonUrlFromId(replayId);
      try {
        const json = await fetchReplayJson(replayJsonUrl);
        const { battleId } = ingestReplayJson(db2, battleRepo2, replayUrl, replayJsonUrl, json);
        importedBattleIds.push(battleId);
        if (!representativeMeta) {
          representativeMeta = {
            formatId: json.formatid ?? null,
            formatName: json.format ?? null
          };
        }
        const meta = battleRepo2.getBattleMeta(battleId);
        battleLinkService.autoLinkBattleForUserSide({
          battleId,
          formatKeyHint: (meta == null ? void 0 : meta.formatKey) ?? null
        });
        rows.push({ input: replayUrl, ok: true, replayId, battleId });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        rows.push({ input: replayUrl, ok: false, error: msg });
      }
    }
    if (importedBattleIds.length >= 2) {
      db2.transaction(() => {
        const setId = createOrUpdateBatchSet({
          battleIdsInOrder: importedBattleIds,
          formatId: (representativeMeta == null ? void 0 : representativeMeta.formatId) ?? null,
          formatName: (representativeMeta == null ? void 0 : representativeMeta.formatName) ?? null
        });
        attachBattlesToSet({ setId, battleIdsInOrder: importedBattleIds });
      })();
    }
    const okCount = rows.filter((r) => r.ok).length;
    const failCount = rows.length - okCount;
    return { okCount, failCount, rows };
  }
  function relinkBattle(battleId) {
    const meta = battleRepo2.getBattleMeta(battleId);
    battleLinkService.autoLinkBattleForUserSide({
      battleId,
      formatKeyHint: (meta == null ? void 0 : meta.formatKey) ?? null
    });
    return { ok: true };
  }
  return {
    importFromReplaysText,
    relinkBattle
  };
}
function BattleLinkService(db2, deps) {
  const { battleRepo: battleRepo2, teamsRepo: teamsRepo2 } = deps;
  function autoLinkBattleForUserSide(args) {
    const { battleId, debug } = args;
    const NOT_LINKED = {
      linked: false,
      teamVersionId: null,
      confidence: null,
      method: null
    };
    const userSide = battleRepo2.getUserSide(battleId);
    if (!userSide) return NOT_LINKED;
    const speciesList = selectBattleSpeciesForUser(db2, battleId, { minRevealedToTrust: 4 });
    if (speciesList.species.length === 0) return NOT_LINKED;
    const candidates = teamsRepo2.listLatestTeamVersions({
      formatKeyHint: args.formatKeyHint ?? null,
      limit: args.limitTeams ?? 200
    });
    let best = null;
    for (const tv of candidates) {
      const r = tryLinkBattleToTeamVersion(
        db2,
        { teamsRepo: teamsRepo2 },
        { battleId, teamVersionId: tv.team_version_id }
      );
      if (!r.linked) continue;
      if (!best || r.confidence > best.confidence) {
        best = {
          teamVersionId: tv.team_version_id,
          confidence: r.confidence,
          method: r.method
        };
      }
    }
    if (!best) return NOT_LINKED;
    battleRepo2.upsertLink({
      battleId,
      side: userSide,
      teamVersionId: best.teamVersionId,
      confidence: best.confidence,
      method: best.method,
      matchedBy: "auto"
    });
    if (debug) {
      console.log("[battle link] linked", { battleId, ...best, userSide });
    }
    return {
      linked: true,
      teamVersionId: best.teamVersionId,
      confidence: best.confidence,
      method: best.method
    };
  }
  return {
    autoLinkBattleForUserSide
  };
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
  const aiEnabledRaw = map.get("ai_enabled");
  const aiEnabled = aiEnabledRaw == null ? true : aiEnabledRaw === "1" || aiEnabledRaw.toLowerCase() === "true";
  return {
    showdown_username: map.get("showdown_username") ?? null,
    openrouter_api_key: map.get("openrouter_api_key") ?? null,
    openrouter_model: map.get("openrouter_model") ?? null,
    ai_enabled: aiEnabled
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
    if (typeof args.openrouter_api_key === "string") {
      const key = args.openrouter_api_key.trim();
      const normalized = key.length ? key : null;
      if (normalized) {
        db2.prepare(`
          INSERT INTO app_settings(key, value, updated_at)
          VALUES ('openrouter_api_key', ?, strftime('%s','now'))
          ON CONFLICT(key) DO UPDATE SET
            value = excluded.value,
            updated_at = excluded.updated_at
        `).run(normalized);
      } else {
        db2.prepare(`DELETE FROM app_settings WHERE key = 'openrouter_api_key'`).run();
      }
    }
    if (typeof args.openrouter_model === "string") {
      const model = args.openrouter_model.trim();
      const normalized = model.length ? model : null;
      if (normalized) {
        db2.prepare(`
          INSERT INTO app_settings(key, value, updated_at)
          VALUES ('openrouter_model', ?, strftime('%s','now'))
          ON CONFLICT(key) DO UPDATE SET
            value = excluded.value,
            updated_at = excluded.updated_at
        `).run(normalized);
      } else {
        db2.prepare(`DELETE FROM app_settings WHERE key = 'openrouter_model'`).run();
      }
    }
    if (typeof args.ai_enabled === "boolean") {
      const value = args.ai_enabled ? "1" : "0";
      db2.prepare(`
        INSERT INTO app_settings(key, value, updated_at)
        VALUES ('ai_enabled', ?, strftime('%s','now'))
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = excluded.updated_at
      `).run(value);
    }
  });
  tx();
  return getSettings();
}
const STAT_LABELS = [
  { key: "hp", label: "HP" },
  { key: "atk", label: "Atk" },
  { key: "def", label: "Def" },
  { key: "spa", label: "SpA" },
  { key: "spd", label: "SpD" },
  { key: "spe", label: "Spe" }
];
function targetLine(evs) {
  const parts = [];
  STAT_LABELS.forEach(({ key, label }) => {
    const value = evs[key];
    if (value > 0) parts.push(`${value} ${label}`);
  });
  return parts.length ? parts.join(" / ") : "No EVs recorded.";
}
function normalizeItems(raw) {
  if (!Array.isArray(raw)) return [];
  const parsed = raw.map((item) => {
    if (typeof item === "string") {
      const m = item.match(/^\s*(\d+)\s*x?\s*(.+?)\s*$/i);
      if (!m) return null;
      return { count: Number(m[1]), name: m[2].trim() };
    }
    if (item && typeof item === "object") {
      const obj = item;
      const name = [obj.name, obj.item, obj.label].find((v) => typeof v === "string");
      const countRaw = [obj.count, obj.qty, obj.quantity].find((v) => typeof v === "number" || typeof v === "string");
      const count = typeof countRaw === "number" ? countRaw : typeof countRaw === "string" ? Number(countRaw) : NaN;
      if (!name || !Number.isFinite(count)) return null;
      return { name: name.trim(), count: Math.trunc(count) };
    }
    return null;
  }).filter(Boolean);
  return parsed.filter((item) => item.name && item.count > 0);
}
function normalizeRecipe(raw) {
  const stats = Array.isArray(raw.stats) ? raw.stats.map((stat) => {
    const label = typeof (stat == null ? void 0 : stat.stat) === "string" ? stat.stat.trim() : "";
    const items = normalizeItems(stat == null ? void 0 : stat.items);
    return label ? { stat: label, items } : null;
  }).filter(Boolean) : [];
  const assumptions = Array.isArray(raw.assumptions) ? raw.assumptions.filter((s) => typeof s === "string" && s.trim()).map((s) => s.trim()) : [];
  const notes = Array.isArray(raw.notes) ? raw.notes.filter((s) => typeof s === "string" && s.trim()).map((s) => s.trim()) : void 0;
  return { stats, assumptions, notes };
}
async function getEvTrainingRecipe({
  apiKey,
  model,
  request
}) {
  var _a, _b, _c;
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://pokementor.local",
      "X-Title": "PokeMentor"
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 2e3,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: "You are a Pokemon EV training assistant. Return JSON only with keys: stats (array of {stat, items}), assumptions (array of strings), notes (optional array). Use stat labels HP, Atk, Def, SpA, SpD, Spe. Items must only be vitamins (HP Up, Protein, Iron, Calcium, Zinc, Carbos) and feathers (Health Feather, Muscle Feather, Resist Feather, Genius Feather, Clever Feather, Swift Feather). Counts are whole numbers."
        },
        {
          role: "user",
          content: [
            `Pokemon: ${request.species_name}`,
            request.nature ? `Nature: ${request.nature}` : "Nature: unknown",
            `Target EVs: ${targetLine(request.evs)}`,
            "Assumptions: fresh Pokemon (0 EVs), vitamins give +10 EV each, feathers give +1 EV each.",
            "Provide the most efficient mix of vitamins and feathers for each stat."
          ].join("\n")
        }
      ]
    })
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenRouter request failed: ${response.status} ${text}`);
  }
  const data = await response.json();
  const content = (_c = (_b = (_a = data == null ? void 0 : data.choices) == null ? void 0 : _a[0]) == null ? void 0 : _b.message) == null ? void 0 : _c.content;
  if (!content) {
    throw new Error("OpenRouter response was empty.");
  }
  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch (e) {
    const fenced = content.match(/```json\s*([\s\S]*?)\s*```/i);
    const block = (fenced == null ? void 0 : fenced[1]) ?? content;
    const start = block.indexOf("{");
    const end = block.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      try {
        parsed = JSON.parse(block.slice(start, end + 1));
      } catch (inner) {
        throw new Error("Failed to parse OpenRouter response as JSON.");
      }
    } else {
      throw new Error("Failed to parse OpenRouter response as JSON.");
    }
  }
  if (!Array.isArray(parsed.stats) || !Array.isArray(parsed.assumptions)) {
    throw new Error("OpenRouter response schema invalid.");
  }
  return normalizeRecipe(parsed);
}
function dashboardRepo(db2) {
  function getKpis() {
    const wlRow = db2.prepare(
      `
        WITH inferred_user_side AS (
          SELECT
            b.id AS battle_id,
            COALESCE(
              (SELECT s.side
                 FROM battle_sides s
                WHERE s.battle_id = b.id AND s.is_user = 1
                LIMIT 1),
              (SELECT l.side
                 FROM battle_team_links l
                WHERE l.battle_id = b.id AND l.team_version_id IS NOT NULL
                LIMIT 1)
            ) AS user_side
          FROM battles b
        )
        SELECT
          -- battles where we can infer a user side
          SUM(CASE WHEN i.user_side IS NOT NULL THEN 1 ELSE 0 END) AS battles_total,

          -- wins/losses for battles with an inferred user side and a decided winner
          SUM(CASE WHEN i.user_side IS NOT NULL AND b.winner_side = i.user_side THEN 1 ELSE 0 END) AS wins,
          SUM(CASE WHEN i.user_side IS NOT NULL AND b.winner_side IS NOT NULL AND b.winner_side <> i.user_side THEN 1 ELSE 0 END) AS losses
        FROM inferred_user_side i
        JOIN battles b ON b.id = i.battle_id
      `
    ).get();
    const battles_total = wlRow.battles_total ?? 0;
    const wins = wlRow.wins ?? 0;
    const losses = wlRow.losses ?? 0;
    const decided = wins + losses;
    const winrate_percent = decided > 0 ? Math.round(wins / decided * 100) : 0;
    const teamsRow = db2.prepare(`SELECT COUNT(*) AS n FROM teams`).get();
    const teamVersionsRow = db2.prepare(`SELECT COUNT(*) AS n FROM team_versions`).get();
    const linkedBattlesRow = db2.prepare(
      `
        SELECT COUNT(DISTINCT battle_id) AS n
        FROM battle_team_links
        WHERE team_version_id IS NOT NULL
      `
    ).get();
    return {
      battles_total,
      wins,
      losses,
      winrate_percent,
      teams_total: teamsRow.n ?? 0,
      team_versions_total: teamVersionsRow.n ?? 0,
      linked_battles_total: linkedBattlesRow.n ?? 0
    };
  }
  return { getKpis };
}
function hpTextToPercent(hp_text) {
  if (!hp_text) return null;
  if (hp_text.includes("fnt")) return 0;
  const m = hp_text.match(/(\d+)\s*\/\s*(\d+)/);
  if (!m) return null;
  const cur = Number(m[1]);
  const max = Number(m[2]);
  if (!Number.isFinite(cur) || !Number.isFinite(max) || max <= 0) return null;
  return Math.max(0, Math.min(100, Math.round(cur / max * 100)));
}
function positionsForSide(side) {
  return side === "p1" ? ["p1a", "p1b"] : ["p2a", "p2b"];
}
function PracticeDecisionSnapshotService(db2) {
  function getTurnStartEventIndex(battleId, turnNumber) {
    const row = db2.prepare(
      `
        SELECT event_index AS idx
        FROM battle_events
        WHERE battle_id = ?
          AND line_type = 'turn'
          AND turn_num = ?
        ORDER BY event_index ASC
        LIMIT 1
        `
    ).get(battleId, turnNumber);
    return (row == null ? void 0 : row.idx) ?? null;
  }
  function getLatestSwitchAtOrBefore(battleId, pos, eventIndex) {
    const row = db2.prepare(
      `
        SELECT
          s.position,
          i.species_name,
          s.hp_text
        FROM battle_switches s
        JOIN battle_pokemon_instances i
          ON i.id = s.pokemon_instance_id
        WHERE s.battle_id = ?
          AND s.position = ?
          AND s.event_index <= ?
        ORDER BY s.event_index DESC
        LIMIT 1
        `
    ).get(battleId, pos, eventIndex);
    return row ?? null;
  }
  function listPreviewRoster(battleId, side) {
    const rows = db2.prepare(
      `
        SELECT species_name
        FROM battle_preview_pokemon
        WHERE battle_id = ?
          AND side = ?
        ORDER BY slot_index ASC
        `
    ).all(battleId, side);
    return rows.map((r) => r.species_name);
  }
  function getRevealedMovesMap(battleId, side) {
    const rows = db2.prepare(
      `
        SELECT species_name, moves_json
        FROM battle_revealed_sets
        WHERE battle_id = ?
          AND side = ?
        `
    ).all(battleId, side);
    const map = /* @__PURE__ */ new Map();
    for (const r of rows) {
      try {
        const arr = JSON.parse(r.moves_json);
        if (Array.isArray(arr)) {
          map.set(
            r.species_name,
            arr.filter((x) => typeof x === "string")
          );
        }
      } catch {
      }
    }
    return map;
  }
  function buildDecisionSnapshot(args) {
    const turnStartIdx = getTurnStartEventIndex(args.battleId, args.turnNumber);
    const idx = turnStartIdx ?? 9999999999;
    const oppSide = args.userSide === "p1" ? "p2" : "p1";
    const userPositions = positionsForSide(args.userSide);
    const oppPositions = positionsForSide(oppSide);
    const userActiveRaw = userPositions.map((p) => getLatestSwitchAtOrBefore(args.battleId, p, idx)).filter(Boolean);
    const oppActiveRaw = oppPositions.map((p) => getLatestSwitchAtOrBefore(args.battleId, p, idx)).filter(Boolean);
    const user_active = userActiveRaw.map((r) => ({
      position: r.position,
      species_name: r.species_name,
      hp_percent: hpTextToPercent(r.hp_text)
    }));
    const opp_active = oppActiveRaw.map((r) => ({
      position: r.position,
      species_name: r.species_name,
      hp_percent: hpTextToPercent(r.hp_text)
    }));
    const userRoster = listPreviewRoster(args.battleId, args.userSide);
    const oppRoster = listPreviewRoster(args.battleId, oppSide);
    const userActiveSpecies = new Set(user_active.map((x) => x.species_name));
    const oppActiveSpecies = new Set(opp_active.map((x) => x.species_name));
    const user_bench = userRoster.filter((s) => !userActiveSpecies.has(s)).map((s) => ({ species_name: s, hp_percent: null }));
    const opp_bench = oppRoster.filter((s) => !oppActiveSpecies.has(s)).map((s) => ({ species_name: s, hp_percent: null }));
    const movesMap = getRevealedMovesMap(args.battleId, args.userSide);
    const legal_moves = user_active.map((a) => ({
      position: a.position,
      moves: (movesMap.get(a.species_name) ?? []).map((m) => ({ move_name: m }))
    }));
    const legal_switches = userPositions.map((pos) => ({
      position: pos,
      switches: user_bench.map((b) => ({ species_name: b.species_name }))
    }));
    return {
      turn_number: args.turnNumber,
      user_side: args.userSide,
      opponent_side: oppSide,
      user_active,
      opp_active,
      user_bench,
      opp_bench,
      legal_moves,
      legal_switches
    };
  }
  return { buildDecisionSnapshot };
}
function isEmptySnapshotJson(s) {
  if (!s) return true;
  const t = s.trim();
  return t === "" || t === "{}" || t === "null";
}
function practiceScenariosRepo(db2) {
  function inferUserSideFromBattle(battleId) {
    const row = db2.prepare(
      `
        SELECT side
        FROM battle_sides
        WHERE battle_id = ? AND is_user = 1
        LIMIT 1
        `
    ).get(battleId);
    return (row == null ? void 0 : row.side) ?? null;
  }
  function updateUserSide(args) {
    db2.prepare(
      `
      UPDATE practice_scenarios
      SET user_side = ?, updated_at = ?
      WHERE id = ?
      `
    ).run(args.user_side, args.updated_at, args.id);
  }
  const snapSvc = PracticeDecisionSnapshotService(db2);
  function listMyScenarios() {
    return db2.prepare(
      `
        SELECT *
        FROM practice_scenarios
        WHERE status <> 'archived'
        ORDER BY
          COALESCE(last_practiced_at, created_at) DESC
        `
    ).all();
  }
  function getScenarioById(id) {
    return db2.prepare(`SELECT * FROM practice_scenarios WHERE id = ?`).get(id) ?? null;
  }
  function updateSnapshot(args) {
    db2.prepare(
      `
      UPDATE practice_scenarios
      SET
        snapshot_json = ?,
        snapshot_hash = ?,
        snapshot_created_at = ?,
        updated_at = ?
      WHERE id = ?
      `
    ).run(
      args.snapshot_json,
      args.snapshot_hash,
      args.snapshot_created_at,
      args.updated_at,
      args.id
    );
  }
  function computeSnapshotHash(s) {
    if (!s.battle_id || !s.turn_number || !s.user_side) return null;
    return `battle:${s.battle_id}::turn:${s.turn_number}::side:${s.user_side}::v1`;
  }
  function ensureDecisionSnapshot(s) {
    var _a;
    const hash = computeSnapshotHash(s);
    console.log("[ensureDecisionSnapshot]", {
      id: s.id,
      battle_id: s.battle_id,
      turn_number: s.turn_number,
      user_side: s.user_side,
      hash,
      snap_len: ((_a = s.snapshot_json) == null ? void 0 : _a.length) ?? null,
      snapshot_hash: s.snapshot_hash,
      snapshot_created_at: s.snapshot_created_at
    });
    if (!hash) return null;
    const cachedOk = s.snapshot_hash === hash && !isEmptySnapshotJson(s.snapshot_json) && s.snapshot_created_at != null;
    if (cachedOk) {
      return { snapshot_json: s.snapshot_json, snapshot_hash: hash };
    }
    const snapshot = snapSvc.buildDecisionSnapshot({
      battleId: s.battle_id,
      turnNumber: s.turn_number,
      userSide: s.user_side
    });
    console.log("[buildDecisionSnapshot result keys]", Object.keys(snapshot ?? {}));
    const now = Math.floor(Date.now() / 1e3);
    const snapshot_json = JSON.stringify(snapshot);
    updateSnapshot({
      id: s.id,
      snapshot_json,
      snapshot_hash: hash,
      snapshot_created_at: now,
      updated_at: now
    });
    return { snapshot_json, snapshot_hash: hash };
  }
  function insertFromBattleTurn(args) {
    const now = Math.floor(Date.now() / 1e3);
    const id = randomUUID$1();
    const title = args.title ?? `Battle ${args.battle_id} · Turn ${args.turn_number}`;
    const user_side = inferUserSideFromBattle(args.battle_id);
    if (!user_side) {
      throw new Error(
        `Cannot infer user_side for battle ${args.battle_id}. Expected battle_sides row with is_user = 1.`
      );
    }
    db2.prepare(
      `
      INSERT OR IGNORE INTO practice_scenarios (
        id,
        source,
        status,
        title,
        subtitle,
        battle_id,
        turn_number,
        user_side,
        tags_json,
        attempts_count,
        created_at,
        updated_at
      ) VALUES (
        ?, 'battle_review', 'active', ?, 'Created from Battle Review',
        ?, ?, ?,
        '[]', 0, ?, ?
      )
      `
    ).run(id, title, args.battle_id, args.turn_number, user_side, now, now);
    const row = db2.prepare(
      `
        SELECT *
        FROM practice_scenarios
        WHERE source = 'battle_review'
          AND battle_id = ?
          AND turn_number = ?
        `
    ).get(args.battle_id, args.turn_number);
    if (row.battle_id && row.turn_number && row.user_side) {
      ensureDecisionSnapshot(row);
    }
    const fresh = getScenarioById(row.id);
    return fresh ?? row;
  }
  function getDetails(id) {
    let s = getScenarioById(id);
    if (!s) return null;
    if (s.battle_id && s.turn_number && !s.user_side) {
      const inferred = inferUserSideFromBattle(s.battle_id);
      if (inferred) {
        const now = Math.floor(Date.now() / 1e3);
        updateUserSide({ id: s.id, user_side: inferred, updated_at: now });
        s = getScenarioById(id) ?? s;
      }
    }
    const ensured = ensureDecisionSnapshot(s);
    const snapJson = (ensured == null ? void 0 : ensured.snapshot_json) ?? s.snapshot_json;
    let snapshot = {};
    try {
      snapshot = snapJson ? JSON.parse(snapJson) : {};
    } catch {
      snapshot = {};
    }
    return {
      id: s.id,
      source: s.source,
      status: s.status,
      title: s.title,
      subtitle: s.subtitle,
      description: s.description,
      format_id: s.format_id,
      team_id: s.team_id,
      team_version_id: s.team_version_id,
      battle_id: s.battle_id,
      turn_number: s.turn_number,
      user_side: s.user_side,
      tags_json: s.tags_json,
      difficulty: s.difficulty,
      attempts_count: s.attempts_count,
      last_practiced_at: s.last_practiced_at,
      best_rating: s.best_rating,
      snapshot
    };
  }
  return {
    listMyScenarios,
    getScenarioById,
    insertFromBattleTurn,
    getDetails
  };
}
function parseJsonArray(s, fallback = []) {
  if (!s) return fallback;
  try {
    const x = JSON.parse(s);
    return Array.isArray(x) ? x : fallback;
  } catch {
    return fallback;
  }
}
function inferGameType(rawLog) {
  return rawLog.includes("|gametype|doubles") ? "doubles" : "singles";
}
function parseActivesAtTurn(rawLog, decisionTurn) {
  var _a, _b;
  const actives = { p1a: null, p1b: null, p2a: null, p2b: null };
  const lines = rawLog.split("\n");
  for (const line of lines) {
    if (!line.startsWith("|")) continue;
    if (line.startsWith("|turn|")) {
      const n = Number(line.split("|")[2]);
      if (Number.isFinite(n) && n === decisionTurn) break;
    }
    if (line.startsWith("|switch|") || line.startsWith("|drag|")) {
      const parts = line.split("|");
      const who = parts[2] ?? "";
      const details = parts[3] ?? "";
      const pos = (_a = who.split(":")[0]) == null ? void 0 : _a.trim();
      if (pos !== "p1a" && pos !== "p1b" && pos !== "p2a" && pos !== "p2b") continue;
      const species = (_b = details.split(",")[0]) == null ? void 0 : _b.trim();
      if (species) actives[pos] = species;
    }
  }
  return actives;
}
function practiceDetailsService(db2) {
  function getDetails(id) {
    const scn = db2.prepare(`SELECT * FROM practice_scenarios WHERE id = ?`).get(id);
    if (!scn) return null;
    const tags = parseJsonArray(scn.tags_json, []);
    const attemptsRows = db2.prepare(
      `
        SELECT id, created_at, rating, summary
        FROM practice_attempts
        WHERE scenario_id = ?
        ORDER BY created_at DESC
        LIMIT 50
        `
    ).all(id);
    const attempts = attemptsRows.map((a) => ({
      id: a.id,
      created_at: new Date(a.created_at * 1e3).toISOString(),
      rating: a.rating ?? null,
      summary: a.summary ?? null
    }));
    if (!scn.battle_id || !scn.turn_number) {
      return {
        id: scn.id,
        title: scn.title,
        description: scn.description ?? scn.subtitle ?? null,
        source: scn.source,
        status: scn.status,
        format_id: scn.format_id ?? null,
        team_name: null,
        battle_id: scn.battle_id ?? null,
        turn_number: scn.turn_number ?? null,
        tags,
        attempts,
        snapshot: {
          game_type: "singles",
          user_side: scn.user_side ?? null,
          actives: { p1a: null, p1b: null, p2a: null, p2b: null },
          bench: { p1: [], p2: [] },
          legal_moves: { p1a: [], p1b: [], p2a: [], p2b: [] },
          legal_switches: { p1a: [], p1b: [], p2a: [], p2b: [] }
        }
      };
    }
    const battleRow = db2.prepare(`SELECT raw_log FROM battles WHERE id = ?`).get(scn.battle_id);
    const rawLog = (battleRow == null ? void 0 : battleRow.raw_log) ?? "";
    const gameType = inferGameType(rawLog);
    const activeSpeciesByPos = parseActivesAtTurn(rawLog, scn.turn_number);
    const actives = {
      p1a: activeSpeciesByPos.p1a ? { species_name: activeSpeciesByPos.p1a, hp_percent: null } : null,
      p1b: activeSpeciesByPos.p1b ? { species_name: activeSpeciesByPos.p1b, hp_percent: null } : null,
      p2a: activeSpeciesByPos.p2a ? { species_name: activeSpeciesByPos.p2a, hp_percent: null } : null,
      p2b: activeSpeciesByPos.p2b ? { species_name: activeSpeciesByPos.p2b, hp_percent: null } : null
    };
    const preview = db2.prepare(
      `
        SELECT side, slot_index, species_name
        FROM battle_preview_pokemon
        WHERE battle_id = ?
        ORDER BY side, slot_index
        `
    ).all(scn.battle_id);
    const rosterBySide = { p1: [], p2: [] };
    for (const r of preview) rosterBySide[r.side].push(r.species_name);
    const activeSet = new Set(
      Object.values(activeSpeciesByPos).filter((x) => Boolean(x))
    );
    const bench = {
      p1: rosterBySide.p1.filter((s) => !activeSet.has(s)).map((s) => ({ species_name: s, hp_percent: null })),
      p2: rosterBySide.p2.filter((s) => !activeSet.has(s)).map((s) => ({ species_name: s, hp_percent: null }))
    };
    const battleId = scn.battle_id;
    function revealedMoves(side, species) {
      if (!species) return [];
      const row = db2.prepare(
        `
          SELECT moves_json
          FROM battle_revealed_sets
          WHERE battle_id = ? AND side = ? AND species_name = ?
          `
      ).get(battleId, side, species);
      const moves = parseJsonArray(row == null ? void 0 : row.moves_json, []);
      return moves.map((m) => ({ move_name: m }));
    }
    const legal_moves = {
      p1a: revealedMoves("p1", activeSpeciesByPos.p1a),
      p1b: revealedMoves("p1", activeSpeciesByPos.p1b),
      p2a: revealedMoves("p2", activeSpeciesByPos.p2a),
      p2b: revealedMoves("p2", activeSpeciesByPos.p2b)
    };
    const legal_switches = {
      p1a: bench.p1.map((b) => ({ species_name: b.species_name })),
      p1b: bench.p1.map((b) => ({ species_name: b.species_name })),
      p2a: bench.p2.map((b) => ({ species_name: b.species_name })),
      p2b: bench.p2.map((b) => ({ species_name: b.species_name }))
    };
    if (gameType === "singles") {
      actives.p1b = null;
      actives.p2b = null;
      legal_moves.p1b = [];
      legal_moves.p2b = [];
      legal_switches.p1b = [];
      legal_switches.p2b = [];
    }
    return {
      id: scn.id,
      title: scn.title,
      description: scn.description ?? scn.subtitle ?? null,
      source: scn.source,
      status: scn.status,
      format_id: scn.format_id ?? null,
      team_name: null,
      battle_id: scn.battle_id,
      turn_number: scn.turn_number,
      tags,
      attempts,
      snapshot: {
        game_type: gameType,
        user_side: scn.user_side ?? null,
        actives,
        bench,
        legal_moves,
        legal_switches
      }
    };
  }
  return { getDetails };
}
function registerDbHandlers() {
  const db2 = getDb();
  const teams = teamsRepo(db2);
  const battles = battleRepo(db2);
  const battleLink = BattleLinkService(db2, {
    battleRepo: battles,
    teamsRepo: teams
  });
  const battleIngest = battleIngestService(db2, {
    battleRepo: battles,
    battleLinkService: battleLink
  });
  const teamActive = new TeamActiveService(teams);
  const teamImport = teamImportService(db2, {
    teamsRepo: teams
  });
  ipcMain.handle("db:teams:list", async () => teams.listTeams());
  ipcMain.handle("db:teams:getDetails", async (_evt, teamId) => teams.getTeamDetails(teamId));
  ipcMain.handle("db:teams:getActiveSummary", async () => teams.getActiveTeamSummary());
  ipcMain.handle("db:teams:getActiveActivity", async () => teams.getActiveTeamActivity());
  ipcMain.handle("db:teams:setTeamActive", async (_evt, teamId) => teamActive.setActiveTeam(teamId));
  ipcMain.handle("db:teams:delete", async (_evt, teamId) => teams.deleteTeam(teamId));
  ipcMain.handle("db:teams:importPokepaste", async (_evt, args) => teamImport.importFromPokepaste(args));
  ipcMain.handle("db:teams:previewPokepaste", async (_evt, args) => teamImport.previewFromPokepaste(args));
  ipcMain.handle(
    "db:teams:getEvRecipes",
    async (_evt, teamVersionId) => teams.listTeamEvRecipes(teamVersionId)
  );
  ipcMain.handle(
    "db:teams:saveEvRecipe",
    async (_evt, args) => teams.upsertTeamEvRecipe({ ...args, now: (/* @__PURE__ */ new Date()).toISOString() })
  );
  ipcMain.handle("db:battles:list", async (_evt, args) => {
    const limit = (args == null ? void 0 : args.limit) ?? 200;
    const offset = (args == null ? void 0 : args.offset) ?? 0;
    return battles.listBattles({ limit, offset });
  });
  ipcMain.handle("db:battles:getDetails", async (_evt, battleId) => {
    var _a, _b;
    const d = battles.getBattleDetails(battleId);
    if (!d) return null;
    const set = battles.getBattleSetSummary(battleId);
    return {
      battle: {
        ...d.battle,
        team_label: null,
        team_version_label: null,
        match_confidence: ((_a = d.userLink) == null ? void 0 : _a.match_confidence) ?? null,
        match_method: ((_b = d.userLink) == null ? void 0 : _b.match_method) ?? null
      },
      set: set ? {
        id: set.id,
        game_number: set.game_number ?? null,
        total_games: set.total_games ?? (set.games.length || null),
        games: set.games.map((g) => ({
          battle_id: g.battle_id,
          replay_id: g.replay_id,
          played_at: g.played_at,
          game_number: g.game_number ?? 0
          // frontend prefers number; see note below
        }))
      } : null,
      sides: d.sides,
      preview: d.preview,
      revealed: d.revealed,
      events: d.events
    };
  });
  ipcMain.handle("db:battles:importReplays", async (_evt, args) => {
    return battleIngest.importFromReplaysText(args.text);
  });
  ipcMain.handle("db:battles:relinkBattle", async (_evt, battleId) => {
    return battleLink.autoLinkBattleForUserSide({ battleId, formatKeyHint: null });
  });
  ipcMain.handle("db:settings:get", async () => getSettings());
  ipcMain.handle(
    "db:settings:update",
    async (_evt, patch) => updateSettings(patch)
  );
  ipcMain.handle("ai:evs:recipe", async (_evt, args) => {
    const settings = getSettings();
    if (!settings.ai_enabled) {
      throw new Error("AI assistant is disabled in Settings.");
    }
    const apiKey = settings.openrouter_api_key;
    if (!apiKey) {
      throw new Error("Missing OpenRouter API key. Configure it in Settings.");
    }
    const model = settings.openrouter_model ?? "openrouter/auto";
    return getEvTrainingRecipe({ apiKey, model, request: args });
  });
  const dashboard = dashboardRepo(db2);
  ipcMain.handle("db:dashboard:getKpis", async () => {
    return dashboard.getKpis();
  });
  const practice = practiceScenariosRepo(db2);
  ipcMain.handle("db:practice:listMyScenarios", async () => {
    return practice.listMyScenarios();
  });
  ipcMain.handle(
    "db:practice:createFromBattleTurn",
    async (_ev, args) => {
      return practice.insertFromBattleTurn(args);
    }
  );
  ipcMain.handle(
    "db:practice:getScenario",
    async (_ev, id) => {
      return practice.getScenarioById(id);
    }
  );
  const practiceDetails = practiceDetailsService(db2);
  ipcMain.handle("db:practice:getDetails", async (_ev, id) => {
    return practiceDetails.getDetails(id);
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
    height: 940,
    minWidth: 1280,
    minHeight: 920,
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
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    } else {
      createWindow();
    }
  });
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
}
export {
  MAIN_DIST,
  RENDERER_DIST,
  VITE_DEV_SERVER_URL
};
