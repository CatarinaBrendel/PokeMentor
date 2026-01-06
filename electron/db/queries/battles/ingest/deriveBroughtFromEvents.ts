// ingest/deriveBroughtFromEvents.ts
//
// Purpose
// -------
// Derive which Pokémon were actually *brought* (i.e., appeared on the field at least once)
// by scanning the battle protocol stream in `battle_events`.
//
// Why this exists even if you store preview/showteam
// --------------------------------------------------
// - `battle_preview_pokemon` = preview screen (what *could* be brought)
// - `battle_revealed_sets`   = showteam (what *was* brought) BUT only if Showdown emitted |showteam|
// - Events (switch/drag/replace) are the most robust fallback: if a mon ever hits the field,
//   we can reliably say it was brought.
//
// Assumed table (create once)
// ---------------------------
// CREATE TABLE IF NOT EXISTS battle_brought_pokemon (
//   battle_id TEXT NOT NULL,
//   side TEXT NOT NULL CHECK(side IN ('p1','p2')),
//   species_name TEXT NOT NULL,
//   first_seen_event_index INTEGER NOT NULL,
//   source TEXT NOT NULL, -- e.g. 'switch' | 'drag' | 'replace'
//   PRIMARY KEY (battle_id, side, species_name)
// );
//
// Notes about parsing
// -------------------
// Showdown lines of interest look like:
//
//   |switch|p1a: Amoonguss|Amoonguss, L50, F|100/100
//   |drag|p2a: Incineroar|Incineroar, L50, M|100/100
//   |replace|p1a: Flutter Mane|Flutter Mane, L50|100/100
//
// We parse:
// - side from actor ref: "p1a: ..." => "p1", "p2a: ..." => "p2"
// - species from details: first token before the first comma (trimmed)
//
// This module does not depend on any other ingest helpers.

import crypto from "node:crypto";
import type BetterSqlite3 from "better-sqlite3";

type Side = "p1" | "p2";

type BroughtRow = {
  battle_id: string;
  side: Side;
  species_name: string;
  first_seen_event_index: number;
};

function uuid(): string {
  return crypto.randomUUID();
}

function parsePipeLine(line: string): string[] {
  const parts = line.split("|");
  if (parts[0] === "") parts.shift();
  return parts;
}

function parseSideFromActorRef(actorRef: string): Side | null {
  const t = actorRef.trim().toLowerCase();
  if (t.startsWith("p1")) return "p1";
  if (t.startsWith("p2")) return "p2";
  return null;
}

function parseSpeciesFromDetails(details: string): string | null {
  // details example: "Amoonguss, L50, F"
  const s = (details ?? "").trim();
  if (!s) return null;

  const head = s.includes(",") ? s.split(",")[0] : s;
  const species = head.trim();
  return species || null;
}

function deriveFromEventLine(rawLine: string): { side: Side; species: string } | null {
  const parts = parsePipeLine(rawLine);
  const type = (parts[0] ?? "").trim();

  if (type !== "switch" && type !== "drag" && type !== "replace") return null;

  const actorRef = parts[1] ?? "";
  const details = parts[2] ?? "";

  const side = parseSideFromActorRef(actorRef);
  if (!side) return null;

  const species = parseSpeciesFromDetails(details);
  if (!species) return null;

  return { side, species };
}

/**
 * Derive brought mons from `battle_events` and upsert into `battle_brought_pokemon`.
 *
 * Behavior:
 * - Rebuild per-battle: deletes existing brought rows for this battle, then inserts fresh.
 * - Keeps the *first* event_index where each species appeared (per side).
 */
export function deriveBroughtFromEvents(
  db: BetterSqlite3.Database,
  battleId: string
): { p1: number; p2: number; total: number } {
  const selectEventsStmt = db.prepare(`
    SELECT event_index, raw_line
    FROM battle_events
    WHERE battle_id = ?
    ORDER BY event_index ASC
  `);

  const deleteExistingStmt = db.prepare(`
    DELETE FROM battle_brought_pokemon
    WHERE battle_id = ?
  `);

  const findInstanceStmt = db.prepare(`
    SELECT id
    FROM battle_pokemon_instances
    WHERE battle_id = ? AND side = ? AND LOWER(species_name) = LOWER(?)
    LIMIT 1
  `);

  const insertInstanceStmt = db.prepare(`
    INSERT INTO battle_pokemon_instances (
      id, battle_id, side, species_name
    ) VALUES (
      @id, @battle_id, @side, @species_name
    )
  `);

  const insertBroughtStmt = db.prepare(`
    INSERT INTO battle_brought_pokemon (
      battle_id, side, pokemon_instance_id, is_lead, fainted
    ) VALUES (
      @battle_id, @side, @pokemon_instance_id, @is_lead, @fainted
    )
    ON CONFLICT(battle_id, side, pokemon_instance_id) DO UPDATE SET
      is_lead = MAX(is_lead, excluded.is_lead),
      fainted = MAX(fainted, excluded.fainted)
  `);

  const events = selectEventsStmt.all(battleId) as Array<{ event_index: number; raw_line: string }>;

  // Track earliest sightings per side/species
  const firstSeen = new Map<string, BroughtRow>();
  for (const e of events) {
    const hit = deriveFromEventLine(e.raw_line);
    if (!hit) continue;

    const key = `${battleId}|${hit.side}|${hit.species.toLowerCase()}`;
    const existing = firstSeen.get(key);
    if (!existing || e.event_index < existing.first_seen_event_index) {
      firstSeen.set(key, {
        battle_id: battleId,
        side: hit.side,
        species_name: hit.species,
        first_seen_event_index: e.event_index,
      });
    }
  }

  const rows = Array.from(firstSeen.values());

  db.transaction(() => {
    deleteExistingStmt.run(battleId);

    const instanceCache = new Map<string, string>();

    for (const r of rows) {
      const key = `${r.side}|${r.species_name.toLowerCase()}`;
      let instanceId = instanceCache.get(key);

      if (!instanceId) {
        const found = findInstanceStmt.get(
          r.battle_id,
          r.side,
          r.species_name
        ) as { id: string } | undefined;

        if (found?.id) {
          instanceId = found.id;
        } else {
          instanceId = uuid();
          insertInstanceStmt.run({
            id: instanceId,
            battle_id: r.battle_id,
            side: r.side,
            species_name: r.species_name,
          });
        }

        instanceCache.set(key, instanceId);
      }

      insertBroughtStmt.run({
        battle_id: r.battle_id,
        side: r.side,
        pokemon_instance_id: instanceId,
        is_lead: 0,
        fainted: 0,
      });
    }
  })();

  let p1 = 0;
  let p2 = 0;
  for (const r of rows) {
    if (r.side === "p1") p1 += 1;
    else p2 += 1;
  }

  return { p1, p2, total: rows.length };
}
