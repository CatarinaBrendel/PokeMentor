import type { Database as SqliteDatabase } from "better-sqlite3";
import { PracticeScenarioRow } from "../repo/practiceScenariosRepo";
import { PracticeScenarioStatus, PracticeScenarioSource, PracticeOutcomeRating } from "../practice.types.ts";

type Side = "p1" | "p2";
type Position = "p1a" | "p1b" | "p2a" | "p2b";

type PracticeScenarioDetails = {
  id: string;
  title: string;
  description: string | null;
  source: PracticeScenarioSource;
  status: PracticeScenarioStatus;
  format_id: string | null;
  team_name: string | null;
  battle_id: string | null;
  turn_number: number | null;
  tags: string[];
  attempts: Array<{
    id: string;
    created_at: string;
    rating: PracticeOutcomeRating | null;
    summary: string | null;
  }>;
  snapshot: {
    game_type: "singles" | "doubles";
    user_side: Side | null;

    // actives at the *start* of decision turn
    actives: Record<Position, { species_name: string; hp_percent: number | null } | null>;

    // bench (preview roster minus actives)
    bench: {
      p1: Array<{ species_name: string; hp_percent: number | null }>;
      p2: Array<{ species_name: string; hp_percent: number | null }>;
    };

    // per position
    legal_moves: Record<Position, Array<{ move_name: string; disabled?: boolean; hint?: string }>>;
    legal_switches: Record<Position, Array<{ species_name: string }>>;
  };
};

function parseJsonArray<T = unknown>(s: string | null | undefined, fallback: T[] = []): T[] {
  if (!s) return fallback;
  try {
    const x: unknown = JSON.parse(s);
    return Array.isArray(x) ? (x as T[]) : fallback;
  } catch {
    return fallback;
  }
}

function inferGameType(rawLog: string): "singles" | "doubles" {
  // your logs include: |gametype|doubles
  return rawLog.includes("|gametype|doubles") ? "doubles" : "singles";
}

function parseActivesAtTurn(rawLog: string, decisionTurn: number): Record<Position, string | null> {
  const actives: Record<Position, string | null> = { p1a: null, p1b: null, p2a: null, p2b: null };

  const lines = rawLog.split("\n");
  for (const line of lines) {
    if (!line.startsWith("|")) continue;

    // Stop at the start of the decision turn
    if (line.startsWith("|turn|")) {
      const n = Number(line.split("|")[2]);
      if (Number.isFinite(n) && n === decisionTurn) break;
    }

    // Update actives from switches before the decision turn begins
    // Example:
    // |switch|p1a: Garchomp|Garchomp, L50, M|100/100
    if (line.startsWith("|switch|") || line.startsWith("|drag|")) {
      const parts = line.split("|"); // ["", "switch", "p1a: Garchomp", "Garchomp, L50, M", "100/100"]
      const who = parts[2] ?? "";
      const details = parts[3] ?? "";

      const pos = who.split(":")[0]?.trim() as Position;
      if (pos !== "p1a" && pos !== "p1b" && pos !== "p2a" && pos !== "p2b") continue;

      const species = details.split(",")[0]?.trim();
      if (species) actives[pos] = species;
    }
  }

  return actives;
}

export function practiceDetailsService(db: SqliteDatabase) {
  function getDetails(id: string): PracticeScenarioDetails | null {
    const scn = db
      .prepare(`SELECT * FROM practice_scenarios WHERE id = ?`)
      .get(id) as PracticeScenarioRow | undefined;

    if (!scn) return null;

    const tags = parseJsonArray<string>(scn.tags_json, []);

    // minimal attempts (optional; you can expand later)
    type PracticeRating = "worse" | "neutral" | "better" | null;
    const attemptsRows = db
      .prepare(
        `
        SELECT id, created_at, rating, summary
        FROM practice_attempts
        WHERE scenario_id = ?
        ORDER BY created_at DESC
        LIMIT 50
        `
      )
      .all(id) as Array<{
        id: string;
        created_at: number;
        rating: PracticeRating;
        summary: string | null;
      }>;

    const attempts = attemptsRows.map((a) => ({
      id: a.id,
      created_at: new Date(a.created_at * 1000).toISOString(),
      rating: a.rating ?? null,
      summary: a.summary ?? null,
    }));

    // If not battle-backed, still return a stable snapshot shape so UI never crashes.
    if (!scn.battle_id || !scn.turn_number) {
      return {
        id: scn.id,
        title: scn.title,
        description: scn.description ?? scn.subtitle ?? null,
        source: scn.source,
        status: scn.status,
        format_id: scn.format_id ?? null,
        team_name: null,
        battle_id: scn.battle_id ?? null,
        turn_number: scn.turn_number ?? null,
        tags,
        attempts,
        snapshot: {
          game_type: "singles",
          user_side: scn.user_side ?? null,
          actives: { p1a: null, p1b: null, p2a: null, p2b: null },
          bench: { p1: [], p2: [] },
          legal_moves: { p1a: [], p1b: [], p2a: [], p2b: [] },
          legal_switches: { p1a: [], p1b: [], p2a: [], p2b: [] },
        },
      };
    }

    const battleRow = db
      .prepare(`SELECT raw_log FROM battles WHERE id = ?`)
      .get(scn.battle_id) as { raw_log: string } | undefined;

    const rawLog = battleRow?.raw_log ?? "";
    const gameType = inferGameType(rawLog);

    const activeSpeciesByPos = parseActivesAtTurn(rawLog, scn.turn_number);
    const actives: PracticeScenarioDetails["snapshot"]["actives"] = {
      p1a: activeSpeciesByPos.p1a ? { species_name: activeSpeciesByPos.p1a, hp_percent: null } : null,
      p1b: activeSpeciesByPos.p1b ? { species_name: activeSpeciesByPos.p1b, hp_percent: null } : null,
      p2a: activeSpeciesByPos.p2a ? { species_name: activeSpeciesByPos.p2a, hp_percent: null } : null,
      p2b: activeSpeciesByPos.p2b ? { species_name: activeSpeciesByPos.p2b, hp_percent: null } : null,
    };

    // preview roster
    const preview = db
      .prepare(
        `
        SELECT side, slot_index, species_name
        FROM battle_preview_pokemon
        WHERE battle_id = ?
        ORDER BY side, slot_index
        `
      )
      .all(scn.battle_id) as Array<{ side: Side; slot_index: number; species_name: string }>;

    const rosterBySide: Record<Side, string[]> = { p1: [], p2: [] };
    for (const r of preview) rosterBySide[r.side].push(r.species_name);

    const activeSet = new Set<string>(
      Object.values(activeSpeciesByPos).filter((x): x is string => Boolean(x))
    );

    const bench = {
      p1: rosterBySide.p1.filter((s) => !activeSet.has(s)).map((s) => ({ species_name: s, hp_percent: null })),
      p2: rosterBySide.p2.filter((s) => !activeSet.has(s)).map((s) => ({ species_name: s, hp_percent: null })),
    };

    // revealed moves (if open team sheets / showteam ingestion exists)
    const battleId = scn.battle_id; // string | null
    function revealedMoves(side: Side, species: string | null): Array<{ move_name: string }> {
      if (!species) return [];
      const row = db
        .prepare(
          `
          SELECT moves_json
          FROM battle_revealed_sets
          WHERE battle_id = ? AND side = ? AND species_name = ?
          `
        )
        .get(battleId, side, species) as { moves_json: string } | undefined;

      const moves = parseJsonArray<string>(row?.moves_json, []);
      return moves.map((m) => ({ move_name: m }));
    }

    const legal_moves = {
      p1a: revealedMoves("p1", activeSpeciesByPos.p1a),
      p1b: revealedMoves("p1", activeSpeciesByPos.p1b),
      p2a: revealedMoves("p2", activeSpeciesByPos.p2a),
      p2b: revealedMoves("p2", activeSpeciesByPos.p2b),
    };

    // legal switches = bench roster (per position, per side)
    const legal_switches = {
      p1a: bench.p1.map((b) => ({ species_name: b.species_name })),
      p1b: bench.p1.map((b) => ({ species_name: b.species_name })),
      p2a: bench.p2.map((b) => ({ species_name: b.species_name })),
      p2b: bench.p2.map((b) => ({ species_name: b.species_name })),
    };

    // If singles, you can ignore b-positions in UI; still keep them present for type stability.
    if (gameType === "singles") {
      actives.p1b = null;
      actives.p2b = null;
      legal_moves.p1b = [];
      legal_moves.p2b = [];
      legal_switches.p1b = [];
      legal_switches.p2b = [];
    }

    return {
      id: scn.id,
      title: scn.title,
      description: scn.description ?? scn.subtitle ?? null,
      source: scn.source,
      status: scn.status,
      format_id: scn.format_id ?? null,
      team_name: null,
      battle_id: scn.battle_id,
      turn_number: scn.turn_number,
      tags,
      attempts,
      snapshot: {
        game_type: gameType,
        user_side: (scn.user_side as Side | null) ?? null,
        actives,
        bench,
        legal_moves,
        legal_switches,
      },
    };
  }

  return { getDetails };
}