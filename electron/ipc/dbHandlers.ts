// electron/db/queries/practice/services/PracticeDecisionSnapshotService.ts
import { Database } from "better-sqlite3";
import { PracticePosition } from "../types";

export function PracticeDecisionSnapshotService(db: Database) {
  function getLatestSwitchFromBattleSwitches(
    battleId: string,
    pos: PracticePosition,
    eventIndex: number
  ) {
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

  function parseSwitchRawLine(raw: string): { species_name: string; hp_text: string | null } | null {
    // Typical stored raw_line: "|switch|p1a: Garchomp|Garchomp, L50, M|100/100"
    // Some rows may have leading junk; normalize from first '|'
    const i = raw.indexOf("|");
    const norm = i >= 0 ? raw.slice(i) : raw;

    const parts = norm.split("|");
    // parts: ["", "switch", "p1a: X", "Species, L50...", "100/100"]
    if (parts.length < 4) return null;
    if (parts[1] !== "switch") return null;

    const details = parts[3] ?? "";
    const species_name = details.split(",")[0]?.trim();
    if (!species_name) return null;

    const hp_text = (parts[4] ?? "").trim() || null;
    return { species_name, hp_text };
  }

  function getLatestSwitchFromBattleEvents(
    battleId: string,
    pos: PracticePosition,
    eventIndex: number
  ) {
    const row = db
      .prepare(
        `
        SELECT event_index, raw_line
        FROM battle_events
        WHERE battle_id = ?
          AND event_index <= ?
          AND raw_line LIKE '%|switch|'
          AND raw_line LIKE '%' || ? || '%'
        ORDER BY event_index DESC
        LIMIT 1
        `
      )
      .get(battleId, eventIndex, `${pos}: %`) as
      | { event_index: number; raw_line: string }
      | undefined;

    if (!row?.raw_line) return null;
    const parsed = parseSwitchRawLine(row.raw_line);
    if (!parsed) return null;

    return { position: pos, species_name: parsed.species_name, hp_text: parsed.hp_text } as {
      position: PracticePosition;
      species_name: string;
      hp_text: string | null;
    };
  }

  function getLatestSwitchAtOrBefore(
    battleId: string,
    pos: PracticePosition,
    eventIndex: number
  ) {
    // Preferred: structured ingest tables (battle_switches)
    const fromStructured = getLatestSwitchFromBattleSwitches(battleId, pos, eventIndex);
    if (fromStructured) return fromStructured;

    // Fallback: parse the raw battle_events log
    const fromEvents = getLatestSwitchFromBattleEvents(battleId, pos, eventIndex);
    return fromEvents;
  }

  function buildDecisionSnapshot(args: {
    battleId: string;
    turnNumber: number;
  }) {
    // ... other logic ...

    const turnStartIdx = null; // placeholder for actual computation
    const idx = turnStartIdx ?? 9_999_999_999;

    // Debug: confirm we can see initial switch lines through the fallback query
    // (Remove later once stable)
    // eslint-disable-next-line no-console
    // console.log("[snapshot debug idx]", { battleId: args.battleId, turn: args.turnNumber, idx });

    // ... rest of buildDecisionSnapshot implementation ...

    return {
      user_active: [],
      opp_active: [],
      legal_moves: [],
      legal_switches: [],
    };
  }

  return {
    getLatestSwitchAtOrBefore,
    buildDecisionSnapshot,
  };
}
