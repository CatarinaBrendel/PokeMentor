import { getDb } from "../../index";
import { BattleListRow, BattleDetailsDto } from "./battles.types";

export type BattleRow = {
  id: string;
  played_at: string;
  format: string | null;
  result: string | null;
};

export type ListBattlesArgs = {
  limit?: number;
  offset?: number;
};

export type InsertBattleArgs = {
  id: string;
  played_at: string; // ISO string
  format?: string;
  result?: string;
  raw_log?: string;
};

export function insertBattle(args: InsertBattleArgs) {
  const db = getDb();

  const stmt = db.prepare(`
    INSERT INTO battles (id, played_at, format, result, raw_log)
    VALUES (@id, @played_at, @format, @result, @raw_log)
    ON CONFLICT(id) DO UPDATE SET
      played_at=excluded.played_at,
      format=excluded.format,
      result=excluded.result,
      raw_log=excluded.raw_log
  `);

  stmt.run({
    id: args.id,
    played_at: args.played_at,
    format: args.format ?? null,
    result: args.result ?? null,
    raw_log: args.raw_log ?? null,
  });
}

export function listBattles(args: ListBattlesArgs = {}): BattleListRow[] {
  const db = getDb();
  const limit = Math.min(Math.max(args.limit ?? 200, 1), 1000);
  const offset = Math.max(args.offset ?? 0, 0);

  const stmt = db.prepare(`
    WITH sides AS (
      SELECT
        battle_id,
        MAX(CASE WHEN is_user = 1 THEN side END)        AS user_side,
        MAX(CASE WHEN is_user = 1 THEN player_name END) AS user_name,
        MAX(CASE WHEN side = 'p1' THEN player_name END) AS p1_name,
        MAX(CASE WHEN side = 'p2' THEN player_name END) AS p2_name
      FROM battle_sides
      GROUP BY battle_id
    )
    SELECT
      b.id,
      b.played_at,
      b.format_id,
      b.format_name,
      b.is_rated,
      b.winner_side,

      s.user_side,
      s.user_name,
      s.p1_name,
      s.p2_name,

      CASE
        WHEN s.user_side = 'p1' THEN s.p2_name
        WHEN s.user_side = 'p2' THEN s.p1_name
        -- fallback if user_side missing: prefer p2 if p1 exists, else p1
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
    ORDER BY COALESCE(b.played_at, b.upload_time, b.created_at) DESC
    LIMIT ? OFFSET ?;
  `);

  return stmt.all(limit, offset) as BattleListRow[];
}

export function getBattleDetails(battleId: string): BattleDetailsDto {
  const db = getDb();

  const battle = db.prepare(`
    SELECT id, replay_url, replay_id, format_id, format_name, played_at, is_rated, winner_side
    FROM battles
    WHERE id = ?
  `).get(battleId) as BattleDetailsDto["battle"];

  const sides = db.prepare(`
    SELECT side, is_user, player_name, avatar, rating
    FROM battle_sides
    WHERE battle_id = ?
    ORDER BY side ASC
  `).all(battleId) as BattleDetailsDto["sides"];

  const preview = db.prepare(`
    SELECT side, slot_index, species_name
    FROM battle_preview_pokemon
    WHERE battle_id = ?
    ORDER BY side ASC, slot_index ASC
  `).all(battleId) as BattleDetailsDto["preview"];

  const revealedRaw = db.prepare(`
    SELECT side, species_name, nickname, item_name, ability_name, tera_type, moves_json
    FROM battle_revealed_sets
    WHERE battle_id = ?
    ORDER BY side ASC, species_name ASC
  `).all(battleId) as Array<
    Omit<BattleDetailsDto["revealed"][number], "moves"> & { moves_json: string }
  >;

  const revealed = revealedRaw.map((r) => ({
    side: r.side,
    species_name: r.species_name,
    nickname: r.nickname,
    item_name: r.item_name,
    ability_name: r.ability_name,
    tera_type: r.tera_type,
    moves: safeJsonArray(r.moves_json),
  }));

  return { battle, sides, preview, revealed };
}

function safeJsonArray(s: string): string[] {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}