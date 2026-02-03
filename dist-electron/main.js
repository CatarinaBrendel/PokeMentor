import { app, ipcMain, BrowserWindow } from "electron";
import { fileURLToPath } from "node:url";
import path, { dirname } from "node:path";
import fs from "node:fs";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
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
    const value = evs[key] ?? 0;
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
  }).filter((s) => Boolean(s)) : [];
  const assumptions = Array.isArray(raw.assumptions) ? raw.assumptions.filter((s) => typeof s === "string" && s.trim()).map((s) => s.trim()) : [];
  const notes = Array.isArray(raw.notes) ? raw.notes.filter((s) => typeof s === "string" && s.trim()).map((s) => s.trim()) : void 0;
  return { stats, assumptions, notes };
}
function parseEvsFromText(text) {
  if (!text || typeof text !== "string") return null;
  const evs = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
  const targetMatch = text.match(/Target EVs are\s*([^.\n]+)/i);
  if (targetMatch && targetMatch[1]) {
    const parts = targetMatch[1].split(/[,;]|\band\b/i).map((p) => p.trim()).filter(Boolean);
    for (const p of parts) {
      const m = p.match(/(\d{1,3})\s*(HP|Atk|Def|SpA|SpD|Spe)/i);
      if (m) {
        const n = Number(m[1]);
        const key = m[2].toLowerCase();
        if (!Number.isNaN(n) && key in evs) evs[key] = n;
      }
    }
  }
  const generic = text.matchAll(/(HP|Atk|Def|SpA|SpD|Spe)[:\s-]*?(\d{1,3})/gi);
  for (const m of generic) {
    const keyRaw = m[1];
    const n = Number(m[2]);
    const key = keyRaw.toLowerCase();
    if (!Number.isNaN(n) && key in evs) evs[key] = n;
  }
  const before = text.matchAll(/(\d{1,3})\s*(HP|Atk|Def|SpA|SpD|Spe)/gi);
  for (const m of before) {
    const n = Number(m[1]);
    const keyRaw = m[2];
    const key = keyRaw.toLowerCase();
    if (!Number.isNaN(n) && key in evs) evs[key] = n;
  }
  const anyNonZero = Object.values(evs).some((v) => v > 0);
  return anyNonZero ? { hp: evs.hp, atk: evs.atk, def: evs.def, spa: evs.spa, spd: evs.spd, spe: evs.spe } : null;
}
function buildRecipeFromEvs(evs) {
  const statMap = {
    hp: { vitamin: "HP Up", feather: "Health Feather" },
    atk: { vitamin: "Protein", feather: "Muscle Feather" },
    def: { vitamin: "Iron", feather: "Resist Feather" },
    spa: { vitamin: "Calcium", feather: "Genius Feather" },
    spd: { vitamin: "Zinc", feather: "Clever Feather" },
    spe: { vitamin: "Carbos", feather: "Swift Feather" }
  };
  const stats = [];
  for (const s of STAT_LABELS) {
    const key = s.key;
    const val = evs[key] ?? 0;
    const vitamins = Math.floor(val / 10);
    const feathers = val - vitamins * 10;
    const items = [];
    if (vitamins > 0) items.push({ name: statMap[key].vitamin, count: vitamins });
    if (feathers > 0) items.push({ name: statMap[key].feather, count: feathers });
    stats.push({ stat: s.label, items });
  }
  const assumptions = [
    "Assumes fresh Pokemon (0 EVs).",
    "Vitamins provide 10 EV each.",
    "Feathers provide +1 EV each."
  ];
  const notes = ["This recipe was inferred from the assistant reasoning text (StepFun)."];
  return { stats, assumptions, notes };
}
async function getEvTrainingRecipe({ apiKey, model, request }) {
  var _a, _b;
  console.info(`[ai] Sending OpenRouter request for ${request.species_name} (model=${model})`);
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
  let dataAny = null;
  try {
    dataAny = await response.json();
    try {
      const excerpt = JSON.stringify(dataAny).slice(0, 1e3);
      console.info(`[ai] OpenRouter response received for ${request.species_name}: ${excerpt}`);
    } catch (_) {
      console.info(`[ai] OpenRouter response received for ${request.species_name} (response not stringifiable)`);
    }
  } catch (e) {
    console.warn("[ai] OpenRouter returned non-json response; using local fallback recipe");
    return computeLocalRecipe(request);
  }
  const extractContentFromChoice = (c) => {
    if (!c || typeof c !== "object") return null;
    const obj = c;
    const msg = obj["message"];
    const content2 = msg == null ? void 0 : msg["content"];
    if (typeof content2 === "string") return content2;
    const text = obj["text"];
    if (typeof text === "string") return text;
    const reasoning = (msg == null ? void 0 : msg["reasoning"]) ?? obj["reasoning"];
    if (typeof reasoning === "string") return reasoning;
    return null;
  };
  let content = null;
  const data = dataAny;
  if (data && Array.isArray(data.choices) && data.choices.length > 0) {
    const first = data.choices[0];
    content = extractContentFromChoice(first);
    if (!content) {
      content = data.choices.map((c) => extractContentFromChoice(c) ?? "").filter((s) => !!s).join("\n");
      if (!content) content = null;
    }
  }
  if (!content) {
    const first = (_a = data == null ? void 0 : data.choices) == null ? void 0 : _a[0];
    const reasoning = first ? ((_b = first["message"]) == null ? void 0 : _b["reasoning"]) ?? first["reasoning"] ?? null : null;
    if (typeof reasoning === "string" && reasoning.trim()) {
      const evsParsed = parseEvsFromText(reasoning);
      if (evsParsed) {
        try {
          console.info(`[ai] Parsed EVs from reasoning for ${request.species_name}: ${JSON.stringify(evsParsed)}`);
        } catch (_) {
        }
        return buildRecipeFromEvs(evsParsed);
      }
      try {
        const followupResp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": "https://pokementor.local",
            "X-Title": "PokeMentor"
          },
          body: JSON.stringify({
            model,
            temperature: 0,
            max_tokens: 2e3,
            messages: [
              { role: "system", content: "You are a JSON-only formatter. Return ONLY valid JSON and nothing else. Wrap the JSON between the markers <<<JSON>>> and <<<END>>>. The JSON should be a single object with keys: stats (array of {stat, items}), assumptions (array of strings), notes (optional array)." },
              { role: "user", content: `Assistant reasoning:
${reasoning}

Return ONLY the JSON between <<<JSON>>> and <<<END>>>.` }
            ]
          })
        });
        if (followupResp.ok) {
          const fdata = await followupResp.json();
          const fchoices = (fdata == null ? void 0 : fdata.choices) ?? [];
          const ffirst = fchoices[0];
          const fcontent = extractContentFromChoice(ffirst);
          if (typeof fcontent === "string" && fcontent.trim()) {
            content = fcontent.trim();
            try {
              console.info(`[ai] Follow-up returned content for ${request.species_name} (follow-up)`);
            } catch (_) {
            }
          }
        }
      } catch (err) {
      }
    }
  }
  if (!content) {
    try {
      const excerpt = JSON.stringify(dataAny).slice(0, 2e3);
      console.warn(`[ai] OpenRouter response empty; using local fallback recipe — response excerpt: ${excerpt}`);
    } catch (_) {
      console.warn("[ai] OpenRouter response empty; using local fallback recipe (response could not be stringified)");
    }
    return computeLocalRecipe(request);
  }
  let parsed = null;
  try {
    const markerMatch = content.match(/<<<JSON>>>([\s\S]*?)<<<END>>>/i);
    const toParse = markerMatch ? markerMatch[1] : content;
    parsed = JSON.parse(toParse);
  } catch (e) {
    const fenced = content.match(/```json\s*([\s\S]*?)\s*```/i);
    const block = (fenced == null ? void 0 : fenced[1]) ?? content;
    const startFence = block.indexOf("{");
    const endFence = block.lastIndexOf("}");
    if (startFence !== -1 && endFence !== -1 && endFence > startFence) {
      const candidate = block.slice(startFence, endFence + 1);
      try {
        parsed = JSON.parse(candidate);
      } catch (_) {
        const s = content.indexOf("{");
        const e2 = content.lastIndexOf("}");
        if (s !== -1 && e2 !== -1 && e2 > s) {
          try {
            parsed = JSON.parse(content.slice(s, e2 + 1));
          } catch (__) {
            parsed = null;
          }
        }
      }
    } else {
      const s = content.indexOf("{");
      const e2 = content.lastIndexOf("}");
      if (s !== -1 && e2 !== -1 && e2 > s) {
        try {
          parsed = JSON.parse(content.slice(s, e2 + 1));
        } catch (_) {
          parsed = null;
        }
      }
    }
  }
  if (!parsed || !Array.isArray(parsed.stats) || !Array.isArray(parsed.assumptions)) {
    console.warn("[ai] OpenRouter returned invalid or unparseable schema; using local fallback recipe");
    return computeLocalRecipe(request);
  }
  const normalized = normalizeRecipe(parsed);
  try {
    console.info(`[ai] Parsed recipe from AI for ${request.species_name}: ${JSON.stringify(normalized)}`);
  } catch (_) {
  }
  return normalized;
}
function computeLocalRecipe(request) {
  const statMap = {
    hp: { vitamin: "HP Up", feather: "Health Feather" },
    atk: { vitamin: "Protein", feather: "Muscle Feather" },
    def: { vitamin: "Iron", feather: "Resist Feather" },
    spa: { vitamin: "Calcium", feather: "Genius Feather" },
    spd: { vitamin: "Zinc", feather: "Clever Feather" },
    spe: { vitamin: "Carbos", feather: "Swift Feather" }
  };
  const stats = [];
  for (const s of STAT_LABELS) {
    const key = s.key;
    const ev = request.evs[key] ?? 0;
    const vitamins = Math.floor(ev / 10);
    const feathers = ev - vitamins * 10;
    const items = [];
    if (vitamins > 0) items.push({ name: statMap[key].vitamin, count: vitamins });
    if (feathers > 0) items.push({ name: statMap[key].feather, count: feathers });
    stats.push({ stat: s.label, items });
  }
  const assumptions = [
    "Assumes fresh Pokemon (0 EVs).",
    "Vitamins provide 10 EV each.",
    "Feathers provide +1 EV each."
  ];
  const notes = ["This recipe was generated locally as a fallback when the AI did not return structured JSON."];
  return { stats, assumptions, notes };
}
function registerDbHandlers() {
  try {
    try {
      ipcMain.removeHandler("db:dashboard:getKpis");
    } catch {
    }
    ipcMain.handle("db:dashboard:getKpis", () => {
      const db2 = getDb();
      return dashboardRepo(db2).getKpis();
    });
    try {
      ipcMain.removeHandler("db:teams:list");
    } catch {
    }
    ipcMain.handle("db:teams:list", () => {
      const db2 = getDb();
      return teamsRepo(db2).listTeams();
    });
    try {
      ipcMain.removeHandler("db:teams:getActiveActivity");
    } catch {
    }
    ipcMain.handle("db:teams:getActiveActivity", () => {
      const db2 = getDb();
      return teamsRepo(db2).getActiveTeamActivity();
    });
    try {
      ipcMain.removeHandler("db:teams:getActiveSummary");
    } catch {
    }
    ipcMain.handle("db:teams:getActiveSummary", () => {
      const db2 = getDb();
      return teamsRepo(db2).getActiveTeamSummary();
    });
    try {
      ipcMain.removeHandler("db:teams:getDetails");
    } catch {
    }
    ipcMain.handle("db:teams:getDetails", (_e, teamId) => {
      const db2 = getDb();
      return teamsRepo(db2).getTeamDetails(teamId);
    });
    try {
      ipcMain.removeHandler("db:teams:getEvRecipes");
    } catch {
    }
    ipcMain.handle("db:teams:getEvRecipes", (_e, teamVersionId) => {
      const db2 = getDb();
      return teamsRepo(db2).listTeamEvRecipes(teamVersionId);
    });
    try {
      ipcMain.removeHandler("db:teams:saveEvRecipe");
    } catch {
    }
    ipcMain.handle("db:teams:saveEvRecipe", (_e, args) => {
      const db2 = getDb();
      teamsRepo(db2).upsertTeamEvRecipe({ ...args, now: (/* @__PURE__ */ new Date()).toISOString() });
      return { ok: true };
    });
    try {
      ipcMain.removeHandler("db:teams:setTeamActive");
    } catch {
    }
    ipcMain.handle("db:teams:setTeamActive", (_e, teamId) => {
      const db2 = getDb();
      teamsRepo(db2).setActiveTeam(teamId);
      return { ok: true };
    });
    try {
      ipcMain.removeHandler("db:teams:delete");
    } catch {
    }
    ipcMain.handle("db:teams:delete", (_e, teamId) => {
      const db2 = getDb();
      teamsRepo(db2).deleteTeam(teamId);
      return { ok: true };
    });
    try {
      ipcMain.removeHandler("db:settings:get");
    } catch {
    }
    ipcMain.handle("db:settings:get", () => getSettings());
    try {
      ipcMain.removeHandler("db:settings:update");
    } catch {
    }
    ipcMain.handle("db:settings:update", (_e, args) => updateSettings(args));
    try {
      ipcMain.removeHandler("ai:evs:recipe");
    } catch {
    }
    ipcMain.handle("ai:evs:recipe", async (_e, args) => {
      const settings = getSettings();
      const key = settings.openrouter_api_key;
      const model = settings.openrouter_model ?? "gpt-4o-mini";
      if (!key) throw new Error("No OpenRouter API key configured");
      const resp = await getEvTrainingRecipe({ apiKey: key, model, request: args });
      return resp;
    });
  } catch (err) {
    console.error("[ipc] failed to register db handlers:", err);
  }
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
