// battles/repo/battleRepo.ts
import type BetterSqlite3 from "better-sqlite3";
import { normalizeShowdownName } from "../utils/normalizeShowdownName";

export type Side = "p1" | "p2";

export type BattleMeta = {
  formatKey: string;
  gameType: string | null;
};

export type ExistingLinkRow = {
  team_version_id: string | null;
  match_confidence: number | null;
  matched_by: "auto" | "user" | null;
} | null;

export type BattleListRow = {
  id: string;
  replay_id: string | null;
  format_id: string | null;
  format_name: string | null;
  game_type: string | null;
  result: "win" | "loss" | null;

  played_at: number | null;
  upload_time: number | null;
  created_at: number;

  is_rated: number | null;
  is_private: number | null;

  winner_side: Side | null;
  winner_name: string | null;

  // Convenience fields (may be null)
  user_side: Side | null;
  user_player_name: string | null;
  opponent_name: string | null;

  // If you store a link per (battle_id, side), this reflects the user-side link if present
  linked_team_version_id: string | null;
  link_confidence: number | null;
  link_method: string | null;
  link_matched_by: "auto" | "user" | null;

  user_brought_json: string;
  opponent_brought_json: string;

  team_id: string | null;
  team_name: string | null;
};

export type BattleSideRow = {
  side: Side;
  is_user: 0 | 1;
  player_name: string;
  avatar: string | null;
  rating: number | null;
};

export type BattlePreviewRow = {
  side: Side;
  slot_index: number;
  species_name: string;
  level: number | null;
  gender: "M" | "F" | null;
  shiny: number | null;
  raw_text: string | null;
};

export type BattleRevealedRow = {
  side: Side;
  species_name: string;
  nickname: string | null;
  item_name: string | null;
  ability_name: string | null;
  tera_type: string | null;
  level: number | null;
  gender: "M" | "F" | null;
  shiny: number | null;
  moves_json: string | null;
  raw_fragment: string | null;
};

export type BattleEventRow = {
  event_index: number;
  turn_num: number | null;
  line_type: string;
  raw_line: string;
};

export type BattleDetails = {
  battle: {
    id: string;
    replay_id: string | null;
    replay_url: string | null;
    replay_json_url: string | null;

    format_id: string | null;
    format_name: string | null;
    gen: number | null;
    game_type: string | null;

    upload_time: number | null;
    played_at: number | null;
    views: number | null;
    rating: number | null;
    is_private: number | null;
    is_rated: number | null;

    winner_side: Side | null;
    winner_name: string | null;

    created_at: number;
  };

  sides: BattleSideRow[];
  preview: BattlePreviewRow[];
  revealed: BattleRevealedRow[];
  events: BattleEventRow[];

  userSide: Side | null;
  userLink: {
    team_version_id: string | null;
    match_confidence: number | null;
    match_method: string | null;
    matched_by: "auto" | "user" | null;
  } | null;
};

export type CountRow = { side: Side; c: number };

export function battleRepo(db: BetterSqlite3.Database) {
  // -----------------------------
  // Prepared statements
  // -----------------------------

  const getUserSideStmt = db.prepare(`
    SELECT side
    FROM battle_sides
    WHERE battle_id = ? AND is_user = 1
    LIMIT 1
  `);

  const getBattleMetaStmt = db.prepare(`
    SELECT format_id, format_name, game_type
    FROM battles
    WHERE id = ?
    LIMIT 1
  `);

  const getRevealedSpeciesStmt = db.prepare(`
    SELECT DISTINCT TRIM(species_name) AS species_name
    FROM battle_revealed_sets
    WHERE battle_id = ? AND side = ?
      AND TRIM(COALESCE(species_name,'')) <> ''
    ORDER BY species_name ASC
  `);

  const getPreviewSpeciesStmt = db.prepare(`
    SELECT DISTINCT TRIM(species_name) AS species_name
    FROM battle_preview_pokemon
    WHERE battle_id = ? AND side = ?
      AND TRIM(COALESCE(species_name,'')) <> ''
    ORDER BY slot_index ASC
  `);

  const readExistingLinkStmt = db.prepare(`
    SELECT team_version_id, match_confidence, matched_by
    FROM battle_team_links
    WHERE battle_id = ? AND side = ?
    LIMIT 1
  `);

  const upsertLinkStmt = db.prepare(`
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
  `);

  // Backfill candidate listing (format-filtered, only those lacking a link for the user side)
  const listCandidateBattleIdsByFormatStmt = db.prepare(`
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
  `);

  // Backfill candidate listing (any format, only those lacking a link for the user side)
  const listCandidateBattleIdsAnyFormatStmt = db.prepare(`
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
  `);

  const listBattleEventsStmt = db.prepare(`
    SELECT event_index, turn_num, line_type, raw_line
    FROM battle_events
    WHERE battle_id = ?
    ORDER BY event_index ASC
  `);

  // Optional diagnostics
  const previewCountsBySideStmt = db.prepare(`
    SELECT side, COUNT(*) AS c
    FROM battle_preview_pokemon
    WHERE battle_id = ?
    GROUP BY side
  `);

  const revealedCountsBySideStmt = db.prepare(`
    SELECT side, COUNT(*) AS c
    FROM battle_revealed_sets
    WHERE battle_id = ?
    GROUP BY side
  `);

    // -----------------------------
  // List / details
  // -----------------------------

  const listBattlesStmt = db.prepare(`
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
  `);

  const getBattleRowStmt = db.prepare(`
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
  `);

  const listBattleSidesStmt = db.prepare(`
    SELECT side, is_user, player_name, avatar, rating
    FROM battle_sides
    WHERE battle_id = ?
    ORDER BY side ASC
  `);

  const listBattlePreviewStmt = db.prepare(`
    SELECT side, slot_index, species_name, level, gender, shiny, raw_text
    FROM battle_preview_pokemon
    WHERE battle_id = ?
    ORDER BY side ASC, slot_index ASC
  `);

  const listBattleRevealedStmt = db.prepare(`
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
  `);

  const readUserSideLinkStmt = db.prepare(`
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
  `);

  // -----------------------------
  // Helpers
  // -----------------------------

  function normalizeFormatKey(format_id: unknown, format_name: unknown): string | null {
    const key = String(format_id ?? format_name ?? "").trim();
    return key.length ? key : null;
  }

  function uniqPreserveOrder(xs: string[]): string[] {
    const out: string[] = [];
    const seen = new Set<string>();
    for (const x of xs) {
      const v = x.trim();
      if (!v) continue;
      const k = v.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(v);
    }
    return out;
  }

  // -----------------------------
  // Public repo API
  // -----------------------------

  return {
    getUserSide(battleId: string): Side | null {
      const row = getUserSideStmt.get(battleId) as { side: Side } | undefined;
      return row?.side ?? null;
    },

    getBattleMeta(battleId: string): BattleMeta | null {
      const row = getBattleMetaStmt.get(battleId) as
        | { format_id: string | null; format_name: string | null; game_type: string | null }
        | undefined;

      if (!row) return null;

      const formatKey = normalizeFormatKey(row.format_id, row.format_name);
      if (!formatKey) return null;

      return { formatKey, gameType: row.game_type ?? null };
    },

    getRevealedSpecies(battleId: string, side: Side): string[] {
      const rows = getRevealedSpeciesStmt.all(battleId, side) as Array<{ species_name: string }>;
      return uniqPreserveOrder(rows.map((r) => (r.species_name ?? "").trim()).filter(Boolean));
    },

    getPreviewSpecies(battleId: string, side: Side): string[] {
      const rows = getPreviewSpeciesStmt.all(battleId, side) as Array<{ species_name: string }>;
      return uniqPreserveOrder(rows.map((r) => (r.species_name ?? "").trim()).filter(Boolean));
    },

    readExistingLink(battleId: string, side: Side): ExistingLinkRow {
      const row = readExistingLinkStmt.get(battleId, side) as
        | { team_version_id: string | null; match_confidence: number | null; matched_by: "auto" | "user" | null }
        | undefined;

      return row ?? null;
    },

    upsertLink(args: {
      battleId: string;
      side: Side;
      teamVersionId: string;
      confidence: number;
      method: string;
      matchedBy: "auto" | "user";
      matchedAtUnix?: number; // optional override
    }): void {
      const matched_at = args.matchedAtUnix ?? Math.floor(Date.now() / 1000);

      upsertLinkStmt.run({
        battle_id: args.battleId,
        side: args.side,
        team_version_id: args.teamVersionId,
        match_confidence: args.confidence,
        match_method: args.method,
        matched_at,
        matched_by: args.matchedBy,
      });
    },

    listBackfillCandidateBattleIds(args: {
      formatKeyHint?: string | null;
      limit: number;
    }): Array<{ id: string }> {
      const limit = args.limit;
      const formatKey = args.formatKeyHint?.trim() || null;

      let rows: Array<{ id: string }> = [];
      if (formatKey) {
        rows = listCandidateBattleIdsByFormatStmt.all(formatKey, limit) as Array<{ id: string }>;
      }
      if (!rows.length) {
        rows = listCandidateBattleIdsAnyFormatStmt.all(limit) as Array<{ id: string }>;
      }
      return rows;
    },

    // Optional debug helpers (safe to delete if you don’t want them)
    getPreviewCountsBySide(battleId: string): CountRow[] {
      return previewCountsBySideStmt.all(battleId) as CountRow[];
    },

    getRevealedCountsBySide(battleId: string): CountRow[] {
      return revealedCountsBySideStmt.all(battleId) as CountRow[];
    },

    listBattles(args?: { limit?: number; offset?: number }) {
      const limit = Math.max(1, Math.min(500, args?.limit ?? 200));
      const offset = Math.max(0, args?.offset ?? 0);

      return listBattlesStmt.all({ limit, offset }) as BattleListRow[];
    },

    getBattleDetails(battleId: string): BattleDetails | null {
      const battle = getBattleRowStmt.get(battleId) as BattleDetails["battle"] | undefined;
      if (!battle) return null;

      const sides = listBattleSidesStmt.all(battleId) as BattleSideRow[];
      const preview = listBattlePreviewStmt.all(battleId) as BattlePreviewRow[];
      const revealed = listBattleRevealedStmt.all(battleId) as BattleRevealedRow[];

      const userSide =
        (sides.find((s) => s.is_user === 1)?.side as Side | undefined) ?? null;

      const userLink = (readUserSideLinkStmt.get(battleId) as
        | { team_version_id: string | null; match_confidence: number | null; match_method: string | null; matched_by: "auto" | "user" | null }
        | undefined) ?? null;

      const events = listBattleEventsStmt.all(battleId) as BattleEventRow[];

      // Fallback for legacy rows: infer winner_side from winner_name + player names.
      if (battle.winner_side == null && battle.winner_name) {
        const p1 = sides.find((s) => s.side === "p1")?.player_name ?? null;
        const p2 = sides.find((s) => s.side === "p2")?.player_name ?? null;

        const w = normalizeShowdownName(battle.winner_name);
        const p1n = p1 ? normalizeShowdownName(p1) : null;
        const p2n = p2 ? normalizeShowdownName(p2) : null;

        if (w && p1n && w === p1n) battle.winner_side = "p1";
        else if (w && p2n && w === p2n) battle.winner_side = "p2";
      }

      return {
        battle,
        sides,
        preview,
        revealed,
        events,
        userSide,
        userLink: userLink
          ? {
              team_version_id: userLink.team_version_id,
              match_confidence: userLink.match_confidence,
              match_method: userLink.match_method,
              matched_by: userLink.matched_by,
            }
          : null,
      };
    },
  };
}

export type BattleRepo = ReturnType<typeof battleRepo>;