// teams/repo/teamsRepo.ts
//
// DB-only repository for Teams domain.
// - No network
// - No parsing
// - No cross-domain orchestration
//
// This file is the single place that knows SQL for teams / versions / sets / slots.

import type BetterSqlite3 from "better-sqlite3";
import type {
  TeamListRow,
  CreateTeamArgs,
  CreateTeamVersionArgs,
  CreatePokemonSetArgs,
  TeamDetails,
  TeamHeaderRow,
  TeamVersionRow,
  TeamSlotWithSetRow,
  ActiveTeamActivity,
} from "../teams.types";

export type TeamsRepo = ReturnType<typeof teamsRepo>;

type RowId = { id: string };
type MoveRowId = { id: number };

type SetMoveRow = {
  pokemon_set_id: string;
  move_slot: number;
  name: string;
};

export function teamsRepo(db: BetterSqlite3.Database) {
  // ---------------------------------------------------------------------------
  // Inserts
  // ---------------------------------------------------------------------------
  const insertTeamStmt = db.prepare(`
    INSERT INTO teams (id, name, format_ps, created_at, updated_at)
    VALUES (@id, @name, @format_ps, @now, @now)
  `);

  const insertVersionStmt = db.prepare(`
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

  const selectSetByHashStmt = db.prepare(`
    SELECT id FROM pokemon_sets WHERE set_hash = @set_hash LIMIT 1
  `);

  const insertSetStmt = db.prepare(`
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

  const insertSlotStmt = db.prepare(`
    INSERT INTO team_slots (team_version_id, slot_index, pokemon_set_id)
    VALUES (@team_version_id, @slot_index, @pokemon_set_id)
  `);

  const upsertEvRecipeStmt = db.prepare(`
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

  // ---------------------------------------------------------------------------
  // Lists / Reads
  // ---------------------------------------------------------------------------
  const listTeamsStmt = db.prepare(`
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

  const deleteTeamStmt = db.prepare(`
    DELETE FROM teams
    WHERE id = ?
  `);

  const getTeamStmt = db.prepare(`
    SELECT id, name, format_ps, created_at, updated_at, is_active
    FROM teams
    WHERE id = ?
    LIMIT 1
  `);

  const getLatestVersionStmt = db.prepare(`
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

  const getSlotsForVersionStmt = db.prepare(`
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

  const listEvRecipesByVersionStmt = db.prepare(`
    SELECT
      team_version_id,
      pokemon_set_id,
      source,
      recipe_json,
      updated_at
    FROM team_ev_recipes
    WHERE team_version_id = ?
  `);

  // ---------------------------------------------------------------------------
  // Moves (normalized table)
  // ---------------------------------------------------------------------------
  const selectMoveByNameStmt = db.prepare(`
    SELECT id
    FROM moves
    WHERE name = @name COLLATE NOCASE
    LIMIT 1
  `);

  const insertMoveStmt = db.prepare(`
    INSERT INTO moves (name)
    VALUES (@name)
  `);

  const insertSetMoveStmt = db.prepare(`
    INSERT INTO pokemon_set_moves (pokemon_set_id, move_slot, move_id)
    VALUES (@pokemon_set_id, @move_slot, @move_id)
  `);

  function getMovesForSetIds(setIds: string[]): SetMoveRow[] {
    if (setIds.length === 0) return [];

    const ids = Array.from(new Set(setIds));
    const placeholders = ids.map(() => "?").join(", ");

    const stmt = db.prepare(`
      SELECT
        psm.pokemon_set_id,
        psm.move_slot,
        m.name
      FROM pokemon_set_moves psm
      JOIN moves m ON m.id = psm.move_id
      WHERE psm.pokemon_set_id IN (${placeholders})
      ORDER BY psm.pokemon_set_id ASC, psm.move_slot ASC
    `);

    return stmt.all(...ids) as SetMoveRow[];
  }

  // ---------------------------------------------------------------------------
  // Active team + activity
  // ---------------------------------------------------------------------------
  const clearActiveTeamsStmt = db.prepare(`
    UPDATE teams SET is_active = 0
  `);

  const setActiveTeamStmt = db.prepare(`
    UPDATE teams SET is_active = 1
    WHERE id = @team_id
  `);

  const getActiveTeamIdStmt = db.prepare(`
    SELECT id
    FROM teams
    WHERE is_active = 1
    LIMIT 1
  `);

  const getActiveTeamSummaryStmt = db.prepare(`
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

  const getLastImportStmt = db.prepare(`
    SELECT MAX(created_at) AS last_import_at
    FROM team_versions
    WHERE team_id = @team_id
  `);

  const getBattleActivityStmt = db.prepare(`
    SELECT
      COUNT(DISTINCT b.id) AS total_battles,
      MAX(COALESCE(b.played_at, b.created_at)) AS last_battle_at
    FROM battle_team_links btl
    JOIN team_versions tv ON tv.id = btl.team_version_id
    JOIN battles b ON b.id = btl.battle_id
    WHERE tv.team_id = @team_id
  `);

  const unlinkTeamStmt = db.prepare(`
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

  // ---------------------------------------------------------------------------
  // List team version
  // ---------------------------------------------------------------------------
  const listLatestTeamVersionsByFormatStmt = db.prepare(`
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

  const listLatestTeamVersionsAnyFormatStmt = db.prepare(`
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

  const listTeamVersionSlotSpeciesStmt = db.prepare(`
    SELECT
      ts.slot_index AS slot_index,
      ps.species_name AS species_name
    FROM team_slots ts
    JOIN pokemon_sets ps ON ps.id = ts.pokemon_set_id
    WHERE ts.team_version_id = ?
    ORDER BY ts.slot_index ASC
  `);


  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------
  return {
    // Inserts / writes
    insertTeam(args: CreateTeamArgs) {
      insertTeamStmt.run(args);
    },

    insertTeamVersion(args: CreateTeamVersionArgs) {
      insertVersionStmt.run(args);
    },

    findPokemonSetIdByHash(set_hash: string): string | null {
      const row = selectSetByHashStmt.get({ set_hash }) as RowId | undefined;
      return row?.id ?? null;
    },

    insertPokemonSet(args: CreatePokemonSetArgs) {
      insertSetStmt.run(args);
    },

    insertTeamSlot(args: { team_version_id: string; slot_index: number; pokemon_set_id: string }) {
      insertSlotStmt.run(args);
    },

    upsertTeamEvRecipe(args: {
      team_version_id: string;
      pokemon_set_id: string;
      source: "local" | "ai";
      recipe_json: string;
      now: string;
    }) {
      upsertEvRecipeStmt.run(args);
    },

    deleteTeam(teamId: string) {
      unlinkTeamStmt.run(teamId);
      deleteTeamStmt.run(teamId);
    },

    // List team versions
        listLatestTeamVersions(args: {
      formatKeyHint?: string | null;
      limit: number;
    }) {
      const limit = args.limit;
      const formatKey = args.formatKeyHint?.trim() || null;

      if (formatKey) {
        return listLatestTeamVersionsByFormatStmt.all(formatKey, limit) as import("../teams.types").TeamVersionCandidateRow[];
      }

      return listLatestTeamVersionsAnyFormatStmt.all(limit) as import("../teams.types").TeamVersionCandidateRow[];
    },

    listTeamVersionSlotsSpecies(teamVersionId: string) {
      return listTeamVersionSlotSpeciesStmt.all(teamVersionId) as import("../teams.types").TeamVersionSlotSpeciesRow[];
    },

    // Reads
    listTeams(): TeamListRow[] {
      return listTeamsStmt.all() as TeamListRow[];
    },

    getTeamDetails(teamId: string): TeamDetails {
      const team = getTeamStmt.get(teamId) as TeamHeaderRow | undefined;
      if (!team) throw new Error("Team not found");

      const latestVersion =
        (getLatestVersionStmt.get(teamId) as TeamVersionRow | undefined) ?? null;

      const slotsBase = latestVersion
        ? (getSlotsForVersionStmt.all(latestVersion.id) as Omit<TeamSlotWithSetRow, "moves">[])
        : [];

      if (!latestVersion || slotsBase.length === 0) {
        return { team, latestVersion, slots: [] } satisfies TeamDetails;
      }

      const setIds = Array.from(new Set(slotsBase.map((s) => s.pokemon_set_id)));
      const moveRows = getMovesForSetIds(setIds);

      const movesBySetId = new Map<string, string[]>();
      for (const r of moveRows) {
        const arr = movesBySetId.get(r.pokemon_set_id) ?? [];
        arr.push(r.name);
        movesBySetId.set(r.pokemon_set_id, arr);
      }

      const slots: TeamSlotWithSetRow[] = slotsBase.map((s) => ({
        ...s,
        moves: movesBySetId.get(s.pokemon_set_id) ?? [],
      }));

      return { team, latestVersion, slots } satisfies TeamDetails;
    },

    listTeamEvRecipes(teamVersionId: string) {
      return listEvRecipesByVersionStmt.all(teamVersionId) as import("../teams.types").TeamEvRecipeRow[];
    },

    // Moves
    getOrCreateMoveId(name: string): number {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Move name is empty.");

      const found = selectMoveByNameStmt.get({ name: trimmed }) as MoveRowId | undefined;
      if (found?.id) return found.id;

      try {
        insertMoveStmt.run({ name: trimmed });
      } catch {
        // likely UNIQUE constraint; re-select below
      }

      const row = selectMoveByNameStmt.get({ name: trimmed }) as MoveRowId | undefined;
      if (!row?.id) throw new Error(`Failed to create move: ${trimmed}`);
      return row.id;
    },

    insertPokemonSetMove(args: { pokemon_set_id: string; move_slot: number; move_id: number }) {
      insertSetMoveStmt.run(args);
    },

    // Active team
    setActiveTeam(team_id: string) {
      db.transaction(() => {
        clearActiveTeamsStmt.run();
        const res = setActiveTeamStmt.run({ team_id });
        if (res.changes !== 1) {
          throw new Error(`setActiveTeam: team not found: ${team_id}`);
        }
      })();
    },

    getActiveTeamSummary(): TeamListRow | null {
      const active = getActiveTeamIdStmt.get() as { id: string } | undefined;
      if (!active?.id) return null;

      const row = getActiveTeamSummaryStmt.get({ team_id: active.id }) as TeamListRow | undefined;
      return row ?? null;
    },

    getActiveTeamActivity(): ActiveTeamActivity {
      const active = getActiveTeamIdStmt.get() as { id: string } | undefined;
      if (!active?.id) {
        return {
          activeTeam: null,
          last_import_at: null,
          last_battle_at: null,
          total_battles: 0,
        };
      }

      const activeTeam = getActiveTeamSummaryStmt.get({ team_id: active.id }) as TeamListRow;

      const lastImportRow = getLastImportStmt.get({ team_id: active.id }) as
        | { last_import_at: string | null }
        | undefined;

      const battleRow = getBattleActivityStmt.get({ team_id: active.id }) as
        | { total_battles: number | null; last_battle_at: number | null }
        | undefined;

      return {
        activeTeam,
        last_import_at: lastImportRow?.last_import_at ?? null,
        last_battle_at: battleRow?.last_battle_at ?? null,
        total_battles: battleRow?.total_battles ?? 0,
      };
    },
  };
}
