import type { Database as SqliteDatabase } from "better-sqlite3";
import type { PracticePosition } from "../../practice.types";

export function PracticeDecisionSnapshotService(db: SqliteDatabase) {
  /**
   * Get the latest switch event for a given battle/position at or before the given event index.
   */
  function getLatestSwitchAtOrBefore(battleId: string, pos: PracticePosition, eventIndex: number) {
    // Preferred path: use normalized `battle_switches` + `battle_pokemon_instances` if populated.
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

    if (row) return row;

    // Fallback path: some ingests may not populate `battle_switches` yet.
    // Parse the raw `|switch|...` line from `battle_events`.
    const ev = db
      .prepare(
        `
        SELECT raw_line
        FROM battle_events
        WHERE battle_id = ?
          AND event_index <= ?
          AND raw_line LIKE ?
        ORDER BY event_index DESC
        LIMIT 1
        `
      )
      .get(battleId, eventIndex, `|switch|${pos}:%`) as { raw_line: string } | undefined;

    if (!ev?.raw_line) return null;

    // Example raw_line: "|switch|p1a: Garchomp|Garchomp, L50, M|100/100"
    // Split is stable enough for MVP.
    const parts = ev.raw_line.split("|");
    // parts: ["", "switch", "p1a: Garchomp", "Garchomp, L50, M", "100/100"]
    const details = parts[3] ?? "";
    const hp_text = (parts[4] ?? null) as string | null;

    // Species is before the first comma.
    const species_name = details.split(",")[0]?.trim() ?? "";
    if (!species_name) return null;

    return { position: pos, species_name, hp_text };
  }

  function getTurnStartEventIndex(battleId: string, turnNumber: number): number | null {
    const row = db
      .prepare(
        `
        SELECT event_index AS idx
        FROM battle_events
        WHERE battle_id = ?
          AND line_type = 'turn_start'
          AND turn_num = ?
        ORDER BY event_index ASC
        LIMIT 1
        `
      )
      .get(battleId, turnNumber) as { idx: number } | undefined;

    // Fallback if `line_type/turn_num` are not populated by the ingest yet.
    if (!row) {
      const r2 = db
        .prepare(
          `
          SELECT event_index AS idx
          FROM battle_events
          WHERE battle_id = ?
            AND raw_line = ?
          ORDER BY event_index ASC
          LIMIT 1
          `
        )
        .get(battleId, `|turn|${turnNumber}`) as { idx: number } | undefined;

      return r2?.idx ?? null;
    }

    return row?.idx ?? null;
  }

  function buildDecisionSnapshot(args: {
    battleId: string;
    turnNumber: number;
    userSide: "p1" | "p2";
  }) {
    const turnStartIdx = getTurnStartEventIndex(args.battleId, args.turnNumber);
    const idx = turnStartIdx ?? 9_999_999_999;
    console.log("[PracticeDecisionSnapshot]", { battleId: args.battleId, turnNumber: args.turnNumber, turnStartIdx, idx });

    // Further implementation omitted for brevity...
    // This function would build and return the snapshot object.
    return {};
  }

  return {
    getLatestSwitchAtOrBefore,
    getTurnStartEventIndex,
    buildDecisionSnapshot,
  };
}