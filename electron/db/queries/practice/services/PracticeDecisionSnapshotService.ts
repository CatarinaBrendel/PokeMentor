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

  // Approximation for MVP: revealed moves + preview bench. (@pkmn/sim can refine later.)
  legal_moves: Array<{ position: PracticePosition; moves: Array<{ move_name: string }> }>;
  legal_switches: Array<{ position: PracticePosition; switches: Array<{ species_name: string }> }>;
};

const ALL_POSITIONS = ["p1", "p1a", "p1b", "p2", "p2a", "p2b"] as const;
type ParsedPosition = typeof ALL_POSITIONS[number];

function isParsedPosition(x: string): x is ParsedPosition {
  return (ALL_POSITIONS as readonly string[]).includes(x);
}

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

function positionAliases(pos: PracticePosition): readonly ParsedPosition[] {
  // Doubles typical: p1a/p1b/p2a/p2b
  // Singles common: p1/p2
  if (pos === "p1a") return ["p1a", "p1"];
  if (pos === "p2a") return ["p2a", "p2"];
  // For "b" slots, there is no good singles alias; keep only itself.
  return [pos];
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

  function parseSwitchLikeLine(
    raw_line: string
  ): { position: string; species_name: string; hp_text: string | null } | null {
    // Expected (Showdown):
    // |switch|p1a: Dragonite|Dragonite, M|84/100
    // |drag|p2a: Gholdengo|Gholdengo|100/100
    // |replace|p1a: Zoroark|Zoroark|100/100
    // Some stores may preserve an extra leading "|" ("||switch|..."). Be tolerant.

    const line = String(raw_line ?? "").trim();
    if (!line.includes("|switch|") && !line.includes("|drag|") && !line.includes("|replace|")) return null;

    // Normalize leading pipes: "||switch|" -> "|switch|"
    const normalized = line.replace(/^\|+/, "|");

    // Split and drop any leading empty segments caused by starting '|'
    const parts = normalized.split("|").filter((p, idx) => !(idx === 0 && p === ""));
    // After filtering, expected shapes include:
    // ["switch", "p1a: Garchomp", "Garchomp, L50, M", "100/100"]
    // ["drag",   "p2a: X",        "X",             "100/100"]

    const kind = parts[0];
    if (kind !== "switch" && kind !== "drag" && kind !== "replace") return null;

    const actor = (parts[1] ?? "").trim();
    // actor like: "p1a: Garchomp" (or "p1: Dragonite" in singles)
    const m = actor.match(/^(p[12](?:a|b)?):\s*(.+)$/);
    if (!m) return null;

    const position = m[1];

    // Prefer the post-colon name (often species in your data),
    // but if that is empty, fall back to the next token.
    const species_name = (m[2] ?? "").trim() || (parts[2] ?? "").trim();
    if (!species_name) return null;

    // HP text is typically the last token and looks like "84/100" or "0 fnt".
    // In some cases there may be extra details tokens; taking the last is most robust.
    const last = (parts.length > 0 ? parts[parts.length - 1] : "").trim();
    const hp_text = last && (last.includes("/") || last.includes("fnt")) ? last : null;

    return { position, species_name, hp_text };
  }

  function getLatestSwitchAtOrBefore(battleId: string, pos: PracticePosition, eventIndex: number) {
    // IMPORTANT: the current ingest pipeline does not populate `battle_switches`.
    // Derive current actives directly from `battle_events.raw_line`.

    const aliases = positionAliases(pos);

    // Pull recent switch/drag/replace lines up to the cutoff index.
    // We scan in JS so we can support multiple aliases per slot (p1 vs p1a etc.).
    const rows = db
      .prepare(
        `
        SELECT event_index, raw_line
        FROM battle_events
        WHERE battle_id = ?
          AND event_index <= ?
          AND raw_line IS NOT NULL
          AND (
            raw_line LIKE '|switch|%'
            OR raw_line LIKE '||switch|%'
            OR raw_line LIKE '|drag|%'
            OR raw_line LIKE '||drag|%'
            OR raw_line LIKE '|replace|%'
            OR raw_line LIKE '||replace|%'
          )
        ORDER BY event_index DESC
        LIMIT 2000
        `
      )
      .all(battleId, eventIndex) as Array<{ event_index: number; raw_line: string }>;

    for (const r of rows) {
      const parsed = parseSwitchLikeLine(r.raw_line);
      if (!parsed) continue;

      // Match any alias to this slot (e.g. p1a matches p1 too)
      if (!isParsedPosition(parsed.position)) continue;
if (!aliases.includes(parsed.position)) continue;

      // Helpful when diagnosing empty actives.
      // Comment out later once confirmed.
      // eslint-disable-next-line no-console
      console.log("[snapshot] matched switch", {
        battleId,
        cutoff: eventIndex,
        wanted: pos,
        aliases,
        event_index: r.event_index,
        position: parsed.position,
        species_name: parsed.species_name,
        hp_text: parsed.hp_text,
      });

      return {
        position: pos,
        species_name: parsed.species_name,
        hp_text: parsed.hp_text,
      };
    }

    return null;
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

    if (user_active.length === 0 || opp_active.length === 0) {
      console.log("[snapshot] empty actives", {
        battleId: args.battleId,
        turn: args.turnNumber,
        userSide: args.userSide,
        turnStartIdx,
        idx,
        user_active_len: user_active.length,
        opp_active_len: opp_active.length,
      });
    }

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