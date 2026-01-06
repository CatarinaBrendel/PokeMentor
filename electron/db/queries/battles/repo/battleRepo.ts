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

  user_side: Side | null;
  user_player_name: string | null;
  opponent_name: string | null;

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

export type BattleSetSummary = {
  id: string;                 // set_id
  game_number: number | null;
  total_games: number | null;
  games: Array<{
    battle_id: string;
    replay_id: string | null;
    played_at: number | null;
    game_number: number | null;
  }>;
} | null;

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

export type UpsertBattleHeaderArgs = {
  id: string;
  replay_id: string;
  replay_url: string;
  replay_json_url: string;

  format_id: string | null;
  format_name: string | null;
  gen: number | null;
  game_type: string | null;

  upload_time: number | null;
  played_at: number | null;
  views: number | null;
  rating: number | null;
  is_private: number;
  is_rated: number;

  bestof_group_id: string | null;
  bestof_game_num: number | null;
  bestof_total: number | null;

  winner_side: Side | null;
  winner_name: string | null;

  raw_json: string;
  raw_log: string;

  created_at: number;
};

function otherSide(side: Side): Side {
  return side === "p1" ? "p2" : "p1";
}

function clampInt(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function normalizeFormatKey(format_id: unknown, format_name: unknown): string | null {
  const key = String(format_id ?? format_name ?? "").trim();
  return key.length ? key : null;
}

function uniqPreserveOrder(xs: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
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

function inferWinnerSideFromNames(args: {
  winnerName: string | null;
  p1Name: string | null;
  p2Name: string | null;
}): Side | null {
  const { winnerName, p1Name, p2Name } = args;
  if (!winnerName) return null;

  const w = normalizeShowdownName(winnerName);
  if (!w) return null;

  const p1n = p1Name ? normalizeShowdownName(p1Name) : "";
  const p2n = p2Name ? normalizeShowdownName(p2Name) : "";

  if (p1n && w === p1n) return "p1";
  if (p2n && w === p2n) return "p2";
  return null;
}

export function battleRepo(db: BetterSqlite3.Database) {
  // -----------------------------
  // Prepared statements (read)
  // -----------------------------
  const stmt = {
    getUserSide: db.prepare(`
      SELECT side
      FROM battle_sides
      WHERE battle_id = ? AND is_user = 1
      LIMIT 1
    `),

    getBattleMeta: db.prepare(`
      SELECT format_id, format_name, game_type
      FROM battles
      WHERE id = ?
      LIMIT 1
    `),

    getRevealedSpecies: db.prepare(`
      SELECT DISTINCT TRIM(species_name) AS species_name
      FROM battle_revealed_sets
      WHERE battle_id = ? AND side = ?
        AND TRIM(COALESCE(species_name,'')) <> ''
      ORDER BY species_name ASC
    `),

    getPreviewSpecies: db.prepare(`
      SELECT DISTINCT TRIM(species_name) AS species_name
      FROM battle_preview_pokemon
      WHERE battle_id = ? AND side = ?
        AND TRIM(COALESCE(species_name,'')) <> ''
      ORDER BY slot_index ASC
    `),

    readExistingLink: db.prepare(`
      SELECT team_version_id, match_confidence, matched_by
      FROM battle_team_links
      WHERE battle_id = ? AND side = ?
      LIMIT 1
    `),

    listCandidateBattleIdsByFormat: db.prepare(`
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

    listCandidateBattleIdsAnyFormat: db.prepare(`
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

    listBattleEvents: db.prepare(`
      SELECT event_index, turn_num, line_type, raw_line
      FROM battle_events
      WHERE battle_id = ?
      ORDER BY event_index ASC
    `),

    previewCountsBySide: db.prepare(`
      SELECT side, COUNT(*) AS c
      FROM battle_preview_pokemon
      WHERE battle_id = ?
      GROUP BY side
    `),

    revealedCountsBySide: db.prepare(`
      SELECT side, COUNT(*) AS c
      FROM battle_revealed_sets
      WHERE battle_id = ?
      GROUP BY side
    `),

    listBattles: db.prepare(`
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

    getBattleRow: db.prepare(`
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

    listBattleSides: db.prepare(`
      SELECT side, is_user, player_name, avatar, rating
      FROM battle_sides
      WHERE battle_id = ?
      ORDER BY side ASC
    `),

    listBattlePreview: db.prepare(`
      SELECT side, slot_index, species_name, level, gender, shiny, raw_text
      FROM battle_preview_pokemon
      WHERE battle_id = ?
      ORDER BY side ASC, slot_index ASC
    `),

    listBattleRevealed: db.prepare(`
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

    readUserSideLink: db.prepare(`
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

    getBattleIdByReplayId: db.prepare(`
      SELECT id
      FROM battles
      WHERE replay_id = ?
      LIMIT 1
    `),

    getBattleSetForBattle: db.prepare(`
      SELECT
        sg.set_id AS id,
        sg.game_number AS game_number,
        sg.total_games AS total_games
      FROM battle_set_games sg
      WHERE sg.battle_id = ?
      LIMIT 1
    `),

    listBattleSetGames: db.prepare(`
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
    `),
  } as const;

  // -----------------------------
  // Prepared statements (write)
  // -----------------------------
  const write = {
    upsertLink: db.prepare(`
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

    upsertBattleHeader: db.prepare(`
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

    deleteBattleEvents: db.prepare(`DELETE FROM battle_events WHERE battle_id = ?`),
    deleteBattleSides: db.prepare(`DELETE FROM battle_sides WHERE battle_id = ?`),
    deleteBattlePreview: db.prepare(`DELETE FROM battle_preview_pokemon WHERE battle_id = ?`),
    deleteBattleRevealed: db.prepare(`DELETE FROM battle_revealed_sets WHERE battle_id = ?`),
    deleteBattleSwitches: db.prepare(`DELETE FROM battle_switches WHERE battle_id = ?`),
    deleteBattleMoves: db.prepare(`DELETE FROM battle_moves WHERE battle_id = ?`),
    deleteBattleBrought: db.prepare(`DELETE FROM battle_brought_pokemon WHERE battle_id = ?`),
    deleteBattleInstances: db.prepare(`DELETE FROM battle_pokemon_instances WHERE battle_id = ?`),

    deleteBattleLinksAll: db.prepare(`DELETE FROM battle_team_links WHERE battle_id = ?`),
    deleteBattleLinksNonUser: db.prepare(`DELETE FROM battle_team_links WHERE battle_id = ? AND matched_by != 'user'`),

    deleteBattleAnalysisRuns: db.prepare(`DELETE FROM battle_analysis_runs WHERE battle_id = ?`),
  } as const;

  // -----------------------------
  // Public repo API
  // -----------------------------
  return {
    // ---- Existing reads ----
    getUserSide(battleId: string): Side | null {
      const row = stmt.getUserSide.get(battleId) as { side: Side } | undefined;
      return row?.side ?? null;
    },

    getBattleMeta(battleId: string): BattleMeta | null {
      const row = stmt.getBattleMeta.get(battleId) as
        | { format_id: string | null; format_name: string | null; game_type: string | null }
        | undefined;

      if (!row) return null;

      const formatKey = normalizeFormatKey(row.format_id, row.format_name);
      if (!formatKey) return null;

      return { formatKey, gameType: row.game_type ?? null };
    },

    getRevealedSpecies(battleId: string, side: Side): string[] {
      const rows = stmt.getRevealedSpecies.all(battleId, side) as Array<{ species_name: string }>;
      return uniqPreserveOrder(rows.map((r) => (r.species_name ?? "").trim()).filter(Boolean));
    },

    getPreviewSpecies(battleId: string, side: Side): string[] {
      const rows = stmt.getPreviewSpecies.all(battleId, side) as Array<{ species_name: string }>;
      return uniqPreserveOrder(rows.map((r) => (r.species_name ?? "").trim()).filter(Boolean));
    },

    readExistingLink(battleId: string, side: Side): ExistingLinkRow {
      const row = stmt.readExistingLink.get(battleId, side) as
        | { team_version_id: string | null; match_confidence: number | null; matched_by: "auto" | "user" | null }
        | undefined;

      return row ?? null;
    },

    // ---- Writes ----
    upsertLink(args: {
      battleId: string;
      side: Side;
      teamVersionId: string;
      confidence: number;
      method: string;
      matchedBy: "auto" | "user";
      matchedAtUnix?: number;
    }): void {
      const matched_at = args.matchedAtUnix ?? Math.floor(Date.now() / 1000);

      write.upsertLink.run({
        battle_id: args.battleId,
        side: args.side,
        team_version_id: args.teamVersionId,
        match_confidence: args.confidence,
        match_method: args.method,
        matched_at,
        matched_by: args.matchedBy,
      });
    },

    // ---- Backfill helpers ----
    listBackfillCandidateBattleIds(args: { formatKeyHint?: string | null; limit: number }): Array<{ id: string }> {
      const limit = clampInt(args.limit, 1, 1000);
      const formatKey = args.formatKeyHint?.trim() || null;

      let rows: Array<{ id: string }> = [];
      if (formatKey) {
        rows = stmt.listCandidateBattleIdsByFormat.all(formatKey, limit) as Array<{ id: string }>;
      }
      if (!rows.length) {
        rows = stmt.listCandidateBattleIdsAnyFormat.all(limit) as Array<{ id: string }>;
      }
      return rows;
    },

    // ---- Optional diagnostics ----
    getPreviewCountsBySide(battleId: string): CountRow[] {
      return stmt.previewCountsBySide.all(battleId) as CountRow[];
    },

    getRevealedCountsBySide(battleId: string): CountRow[] {
      return stmt.revealedCountsBySide.all(battleId) as CountRow[];
    },

    // ---- List / details ----
    listBattles(args?: { limit?: number; offset?: number }) {
      const limit = clampInt(args?.limit ?? 200, 1, 500);
      const offset = clampInt(args?.offset ?? 0, 0, 1_000_000);

      return stmt.listBattles.all({ limit, offset }) as BattleListRow[];
    },

    getBattleDetails(battleId: string): BattleDetails | null {
      const battleRow = stmt.getBattleRow.get(battleId) as BattleDetails["battle"] | undefined;
      if (!battleRow) return null;

      const sides = stmt.listBattleSides.all(battleId) as BattleSideRow[];
      const preview = stmt.listBattlePreview.all(battleId) as BattlePreviewRow[];
      const revealed = stmt.listBattleRevealed.all(battleId) as BattleRevealedRow[];
      const events = stmt.listBattleEvents.all(battleId) as BattleEventRow[];

      const userSide = (sides.find((s) => s.is_user === 1)?.side as Side | undefined) ?? null;

      const userLink = (stmt.readUserSideLink.get(battleId) as
        | { team_version_id: string | null; match_confidence: number | null; match_method: string | null; matched_by: "auto" | "user" | null }
        | undefined) ?? null;

      // Winner pill bug hardening: infer winner_side if missing.
      const p1Name = sides.find((s) => s.side === "p1")?.player_name ?? null;
      const p2Name = sides.find((s) => s.side === "p2")?.player_name ?? null;
      const inferredWinnerSide =
        battleRow.winner_side ?? inferWinnerSideFromNames({ winnerName: battleRow.winner_name, p1Name, p2Name });

      const battle: BattleDetails["battle"] = inferredWinnerSide
        ? { ...battleRow, winner_side: inferredWinnerSide }
        : battleRow;

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

    getBattleSetSummary(battleId: string): BattleSetSummary {
      const setRow = stmt.getBattleSetForBattle.get(battleId) as
        | { id: string; game_number: number | null; total_games: number | null }
        | undefined;

      if (!setRow) return null;

      const games = stmt.listBattleSetGames.all(setRow.id) as Array<{
        battle_id: string;
        replay_id: string | null;
        played_at: number | null;
        game_number: number | null;
      }>;

      return {
        id: setRow.id,
        game_number: setRow.game_number ?? null,
        total_games: setRow.total_games ?? null,
        games,
      };
    },
    
    // ---- Ingestion idempotency helpers ----
    getBattleIdByReplayId(replayId: string): string | null {
      const row = stmt.getBattleIdByReplayId.get(replayId) as { id: string } | undefined;
      return row?.id ?? null;
    },

    upsertBattleHeader(row: UpsertBattleHeaderArgs): void {
      write.upsertBattleHeader.run(row);
    },

    clearBattleDerivedRows(
      battleId: string,
      opts: { preserveUserLinks: boolean; clearAi: boolean } = { preserveUserLinks: true, clearAi: true }
    ): void {
      // Clear in an order that is easy to reason about.
      write.deleteBattleEvents.run(battleId);
      write.deleteBattleSides.run(battleId);
      write.deleteBattlePreview.run(battleId);
      write.deleteBattleRevealed.run(battleId);

      write.deleteBattleSwitches.run(battleId);
      write.deleteBattleMoves.run(battleId);
      write.deleteBattleBrought.run(battleId);

      // Instances last (others may reference them; FK cascades also help).
      write.deleteBattleInstances.run(battleId);

      if (opts.preserveUserLinks) write.deleteBattleLinksNonUser.run(battleId);
      else write.deleteBattleLinksAll.run(battleId);

      if (opts.clearAi) write.deleteBattleAnalysisRuns.run(battleId);
    },
  };
}

export type BattleRepo = ReturnType<typeof battleRepo>;