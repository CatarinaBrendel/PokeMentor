import { getDb } from "../../index";
import type { BattleListRow, BattleDetailsDto } from "./battles.types";
import type BetterSqlite3 from "better-sqlite3";

export type ListBattlesArgs = {
  limit?: number;
  offset?: number;
};

type EventRow = {
  battle_id: string;
  event_index: number;
  line_type: string;
  raw_line: string;
};

type Derived = {
  p1_expected: number | null;
  p2_expected: number | null;
  p1_seen: Array<{ species_name: string; is_lead: boolean }>;
  p2_seen: Array<{ species_name: string; is_lead: boolean }>;
};

function getSetting(db: BetterSqlite3.Database, key: string): string | null {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

function normalizeShowdownName(name: string): string {
  return name.trim().replace(/^☆+/, "").replace(/\s+/g, "").toLowerCase();
}

function parsePipeLine(raw: string): string[] {
  const parts = raw.split("|");
  if (parts[0] === "") parts.shift();
  return parts;
}

function speciesFromDetails(details: string): string {
  return (details.split(",")[0] ?? "").trim();
}

function sideFromActor(actor: string): "p1" | "p2" | null {
  const s = actor.slice(0, 2);
  return s === "p1" || s === "p2" ? s : null;
}

function deriveForBattle(events: EventRow[], gameType: string | null): Derived {
  let p1_expected: number | null = null;
  let p2_expected: number | null = null;

  const p1SeenOrder: string[] = [];
  const p2SeenOrder: string[] = [];
  const p1SeenSet = new Set<string>();
  const p2SeenSet = new Set<string>();

  for (const e of events) {
    const parts = parsePipeLine(e.raw_line);
    const t = parts[0] ?? "";

    if (t === "teamsize") {
      const side = parts[1] as "p1" | "p2" | undefined;
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
    p2_seen: p2SeenOrder.map((s, idx) => ({ species_name: s, is_lead: idx < leadCount })),
  };
}

const MAX_IDS_PER_CHUNK = 900;

export function listBattles(args: ListBattlesArgs = {}): BattleListRow[] {
  const db = getDb();
  const limit = Math.min(Math.max(args.limit ?? 200, 1), 1000);
  const offset = Math.max(args.offset ?? 0, 0);

  const showdownUsername = getSetting(db, "showdown_username");
  const showdownUsernameNorm = showdownUsername ? normalizeShowdownName(showdownUsername) : null;

  const baseStmt = db.prepare(`
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

  const base = baseStmt.all(limit, offset) as Array<
    BattleListRow & { game_type?: string | null }
  >;

  if (base.length === 0) return [];

  // Fetch relevant events grouped by battle_id
  const byBattle = new Map<string, EventRow[]>();

  for (let i = 0; i < base.length; i += MAX_IDS_PER_CHUNK) {
    const chunk = base.slice(i, i + MAX_IDS_PER_CHUNK);
    const ids = chunk.map((r) => r.id);
    const placeholders = ids.map(() => "?").join(",");

    const evStmt = db.prepare(`
      SELECT battle_id, event_index, line_type, raw_line
      FROM battle_events
      WHERE battle_id IN (${placeholders})
        AND line_type IN ('teamsize','switch','drag','replace')
      ORDER BY battle_id ASC, event_index ASC;
    `);

    const evRows = evStmt.all(...ids) as EventRow[];
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
      const userSeen =
        userSide === "p1" ? d.p1_seen :
        userSide === "p2" ? d.p2_seen :
        [];

      const user_brought_json =
        userSide && userSeen.length > 0 ? JSON.stringify(userSeen) : null;

      const user_brought_seen = userSide ? (userSeen.length || null) : null;

      const user_brought_expected =
        userSide === "p1" ? d.p1_expected :
        userSide === "p2" ? d.p2_expected :
        null;

      // Always return a row (never fall off the end of the callback)
      return {
        ...row,
        user_brought_json,
        user_brought_seen,
        user_brought_expected,

        // optional: keep these if your UI still displays Opp counts
        // opponent_brought_seen: null,
        // opponent_brought_expected: null,
      } as BattleListRow;
    });
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

  const events = db.prepare(`
    SELECT event_index, turn_num, line_type, raw_line
    FROM battle_events
    WHERE battle_id = ?
    ORDER BY event_index ASC
  `).all(battleId) as BattleDetailsDto["events"];

  const revealed = revealedRaw.map((r) => ({
    side: r.side,
    species_name: r.species_name,
    nickname: r.nickname,
    item_name: r.item_name,
    ability_name: r.ability_name,
    tera_type: r.tera_type,
    moves: safeJsonArray(r.moves_json),
  }));

  return { battle, sides, preview, revealed, events };
}

function safeJsonArray(s: string): string[] {
  try {
    const v = JSON.parse(s);
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}