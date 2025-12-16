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
} from "./teams.types";

type RowId = { id: string };

type MoveRowId = { id: number }

type SetMoveRow = {
  pokemon_set_id: string;
  move_slot: number;
  name: string;
};

/**
 * Queries for Teams domain.
 * This file MUST NOT fetch Pokepaste or parse text.
 */
export function teamsQueries(db: BetterSqlite3.Database) {
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
    ORDER BY t.is_active DESC, t.updated_at DESC;
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

  const clearActiveTeamsStmt = db.prepare(`
    UPDATE teams SET is_active = 0
  `);

  const setActiveTeamStmt = db.prepare(`
    UPDATE teams SET is_active = 1
    WHERE id = @team_id
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

  return {
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

    listTeams(): TeamListRow[] {
      return listTeamsStmt.all() as TeamListRow[];
    },

    deleteTeam(teamId: string) {
      deleteTeamStmt.run(teamId);
    },

    getTeamDetails(teamId: string): TeamDetails {
      const team = getTeamStmt.get(teamId) as TeamHeaderRow | undefined;
      if (!team) {
        throw new Error("Team not found");
      }

      const latestVersion =
        (getLatestVersionStmt.get(teamId) as TeamVersionRow | undefined) ?? null;

            const slotsBase = latestVersion
        ? (getSlotsForVersionStmt.all(latestVersion.id) as Omit<TeamSlotWithSetRow, "moves">[])
        : [];

      let slots: TeamSlotWithSetRow[] = [];

      if (slotsBase.length === 0) {
        slots = [];
      } else {
        const ids = Array.from(new Set(slotsBase.map(s => s.pokemon_set_id)));
        const rows = getMovesForSetIds((ids));

        const movesBySetId = new Map<string, string[]>();
        for (const r of rows) {
          const arr = movesBySetId.get(r.pokemon_set_id) ?? [];
          arr.push(r.name);
          movesBySetId.set(r.pokemon_set_id, arr);
        }

        slots = slotsBase.map((s) => ({
          ...s,
          moves: movesBySetId.get(s.pokemon_set_id) ?? [],
        }));
      }

      return {
        team,
        latestVersion,
        slots,
      } satisfies TeamDetails;
    },

    getOrCreateMoveId(name: string): number {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Move name is empty.");

      const found = selectMoveByNameStmt.get({ name: trimmed }) as MoveRowId | undefined;
      if (found?.id) return found.id;

      // Insert (may race on UNIQUE in concurrent runs; safe to catch & re-select)
      try {
        insertMoveStmt.run({ name: trimmed });
      } catch (e) {
        // If UNIQUE constraint hit, just fall through to re-select.
      }

      const row = selectMoveByNameStmt.get({ name: trimmed }) as MoveRowId | undefined;
      if (!row?.id) throw new Error(`Failed to create move: ${trimmed}`);
      return row.id;
    },

    insertPokemonSetMove(args: { pokemon_set_id: string; move_slot: number; move_id: number }) {
      insertSetMoveStmt.run(args);
    },

    setActiveTeam(team_id: string) {
      db.transaction(() => {
        clearActiveTeamsStmt.run();
        const res = setActiveTeamStmt.run({ team_id });
        if (res.changes !== 1) {
          throw new Error(`setActiveTeam: team not found: ${team_id}`);
        }
      })();
    },

  };
}