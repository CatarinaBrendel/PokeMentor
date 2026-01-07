import type { Database as SqliteDatabase } from "better-sqlite3";

export type PracticePosition = "p1a" | "p1b" | "p2a" | "p2b";
export type PracticeSide = "p1" | "p2";

export type PracticeDecisionSnapshot = {
  turn_number: number;
  user_side: PracticeSide;
  opponent_side: PracticeSide;

  user_active: Array<{ position: PracticePosition; species_name: string; hp_percent: number | null }>;
  opp_active: Array<{ position: PracticePosition; species_name: string; hp_percent: number | null }>;

  user_bench: Array<{ species_name: string; hp_percent: number | null }>;
  opp_bench: Array<{ species_name: string; hp_percent: number | null }>;

  // “Legal” here is approximation (revealed moves + non-fainted bench); later @pkmn/sim will refine it.
  legal_moves: Array<{ position: PracticePosition; moves: Array<{ move_name: string }> }>;
  legal_switches: Array<{ position: PracticePosition; switches: Array<{ species_name: string }> }>;
};

function hpTextToPercent(hp_text: string | null | undefined): number | null {
  if (!hp_text) return null;
  // examples: "84/100", "0 fnt"
  if (hp_text.includes("fnt")) return 0;
  const m = hp_text.match(/(\d+)\s*\/\s*(\d+)/);
  if (!m) return null;
  const cur = Number(m[1]);
  const max = Number(m[2]);
  if (!Number.isFinite(cur) || !Number.isFinite(max) || max <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((cur / max) * 100)));
}

function positionsForSide(side: PracticeSide): PracticePosition[] {
  return side === "p1" ? ["p1a", "p1b"] : ["p2a", "p2b"];
}

export function PracticeDecisionSnapshotService(db: SqliteDatabase) {
  function getTurnStartEventIndex(battleId: string, turnNumber: number): number | null {
    const row = db
      .prepare(
        `
        SELECT event_index AS idx
        FROM battle_events
        WHERE battle_id = ?
          AND line_type = 'turn'
          AND turn_num = ?
        ORDER BY event_index ASC
        LIMIT 1
        `
      )
      .get(battleId, turnNumber) as { idx: number } | undefined;

    return row?.idx ?? null;
  }

  function getLatestSwitchAtOrBefore(battleId: string, pos: PracticePosition, eventIndex: number) {
    const row = db
      .prepare(
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
      )
      .get(battleId, pos, eventIndex) as
      | { position: PracticePosition; species_name: string; hp_text: string | null }
      | undefined;

    return row ?? null;
  }

  function listPreviewRoster(battleId: string, side: PracticeSide): string[] {
    const rows = db
      .prepare(
        `
        SELECT species_name
        FROM battle_preview_pokemon
        WHERE battle_id = ?
          AND side = ?
        ORDER BY slot_index ASC
        `
      )
      .all(battleId, side) as Array<{ species_name: string }>;

    return rows.map((r) => r.species_name);
  }

  function getRevealedMovesMap(battleId: string, side: PracticeSide): Map<string, string[]> {
    const rows = db
      .prepare(
        `
        SELECT species_name, moves_json
        FROM battle_revealed_sets
        WHERE battle_id = ?
          AND side = ?
        `
      )
      .all(battleId, side) as Array<{ species_name: string; moves_json: string }>;

    const map = new Map<string, string[]>();
    for (const r of rows) {
      try {
        const arr = JSON.parse(r.moves_json);
        if (Array.isArray(arr)) {
          map.set(
            r.species_name,
            arr.filter((x) => typeof x === "string") as string[]
          );
        }
      } catch {
        // ignore bad json
      }
    }
    return map;
  }

  /**
   * Build snapshot at the *start* of decision turn N (right after |turn|N).
   * If the |turn| row is missing, we fall back to “latest known”.
   */
  function buildDecisionSnapshot(args: {
    battleId: string;
    turnNumber: number;
    userSide: PracticeSide;
  }): PracticeDecisionSnapshot {
    const turnStartIdx = getTurnStartEventIndex(args.battleId, args.turnNumber);
    // If missing, use a very large index so we get “latest” switches.
    const idx = turnStartIdx ?? 9_999_999_999;

    const oppSide: PracticeSide = args.userSide === "p1" ? "p2" : "p1";

    const userPositions = positionsForSide(args.userSide);
    const oppPositions = positionsForSide(oppSide);

    const userActiveRaw = userPositions
      .map((p) => getLatestSwitchAtOrBefore(args.battleId, p, idx))
      .filter(Boolean) as Array<{ position: PracticePosition; species_name: string; hp_text: string | null }>;

    const oppActiveRaw = oppPositions
      .map((p) => getLatestSwitchAtOrBefore(args.battleId, p, idx))
      .filter(Boolean) as Array<{ position: PracticePosition; species_name: string; hp_text: string | null }>;

    const user_active = userActiveRaw.map((r) => ({
      position: r.position,
      species_name: r.species_name,
      hp_percent: hpTextToPercent(r.hp_text),
    }));

    const opp_active = oppActiveRaw.map((r) => ({
      position: r.position,
      species_name: r.species_name,
      hp_percent: hpTextToPercent(r.hp_text),
    }));

    const userRoster = listPreviewRoster(args.battleId, args.userSide);
    const oppRoster = listPreviewRoster(args.battleId, oppSide);

    const userActiveSpecies = new Set(user_active.map((x) => x.species_name));
    const oppActiveSpecies = new Set(opp_active.map((x) => x.species_name));

    const user_bench = userRoster
      .filter((s) => !userActiveSpecies.has(s))
      .map((s) => ({ species_name: s, hp_percent: null }));

    const opp_bench = oppRoster
      .filter((s) => !oppActiveSpecies.has(s))
      .map((s) => ({ species_name: s, hp_percent: null }));

    const movesMap = getRevealedMovesMap(args.battleId, args.userSide);

    const legal_moves = user_active.map((a) => ({
      position: a.position,
      moves: (movesMap.get(a.species_name) ?? []).map((m) => ({ move_name: m })),
    }));

    // In doubles: switches are per-position (slot). Approx: bench roster.
    const legal_switches = userPositions.map((pos) => ({
      position: pos,
      switches: user_bench.map((b) => ({ species_name: b.species_name })),
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
      legal_switches,
    };
  }

  return { buildDecisionSnapshot };
}