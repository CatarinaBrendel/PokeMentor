import type BetterSqlite3 from "better-sqlite3";
import crypto from "node:crypto";

type Side = "p1" | "p2";
type Position = "p1a" | "p1b" | "p2a" | "p2b";

function uuid(): string {
  return crypto.randomUUID();
}

function toFiniteNumber(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

/**
 * Parses raw_line for switch-like protocol lines.
 *
 * Examples:
 *  |switch|p1a: Okidogi|Okidogi, L50, M|100/100
 *  |drag|p2b: Incineroar|Incineroar, L50, M|100/100
 *  |replace|p1a: Amoonguss|Amoonguss, L50, F|100/100
 */
function parseSwitchLike(rawLine: string): { position: Position; side: Side; species: string } | null {
  // We rely on the standard showdown format: |TYPE|WHO|DETAILS|...
  if (!rawLine.startsWith("|")) return null;
  const parts = rawLine.split("|");
  // parts[0] = ""
  const lineType = parts[1];
  if (lineType !== "switch" && lineType !== "drag" && lineType !== "replace") return null;

  const who = parts[2] ?? "";      // "p1a: Okidogi"
  const details = parts[3] ?? "";  // "Okidogi, L50, M"

  const m = who.match(/^(p[12][ab]):/);
  if (!m) return null;

  const position = m[1] as Position;
  const side = position.slice(0, 2) as Side;

  const species = (details.split(",")[0] ?? "").trim();
  if (!species) return null;

  return { position, side, species };
}

export function deriveBroughtFromEvents(
  db: BetterSqlite3.Database,
  battleId: string
): { insertedInstances: number; insertedBrought: number } {
  // Read switch-like events; we use raw_line so we don't depend on richer parsing yet.
  const events = db.prepare(
    `
    SELECT event_index, turn_num, raw_line
    FROM battle_events
    WHERE battle_id = ?
      AND line_type IN ('switch','drag','replace')
    ORDER BY event_index ASC
    `
  ).all(battleId) as Array<{ event_index: number; turn_num: number | null; raw_line: string }>;

  if (events.length === 0) return { insertedInstances: 0, insertedBrought: 0 };

  // Collect brought species per side, and first appearance per position for lead marking.
  const broughtBySide: Record<Side, Set<string>> = { p1: new Set(), p2: new Set() };
  const firstByPos = new Map<Position, { species: string; turn_num: number | null; event_index: number }>();

  for (const e of events) {
    const parsed = parseSwitchLike(e.raw_line);
    if (!parsed) continue;

    broughtBySide[parsed.side].add(parsed.species);

    // First seen per position (best effort for leads)
    if (!firstByPos.has(parsed.position)) {
      firstByPos.set(parsed.position, { species: parsed.species, turn_num: e.turn_num, event_index: e.event_index });
    } else {
      // Prefer earlier (should already be earlier because we sort by event_index)
      // no-op
    }
  }

  // Decide lead set: first seen in each of the four positions.
  // We *prefer* those seen before/at turn 1; if a position is only seen later, still counts as "lead" fallback.
  const leadKey = new Set<string>(); // `${side}|${species}`
  for (const [pos, info] of firstByPos.entries()) {
    const side = pos.slice(0, 2) as Side;
    // If you want to be stricter: only count if turn_num is null or <= 1
    // For now: mark whatever first appears in that position.
    leadKey.add(`${side}|${info.species}`);
  }

  // Prepared statements
  const getInstance = db.prepare(`
    SELECT id
    FROM battle_pokemon_instances
    WHERE battle_id = ? AND side = ? AND species_name = ?
    LIMIT 1
  `);

  const insertInstance = db.prepare(`
    INSERT INTO battle_pokemon_instances (id, battle_id, side, species_name, shiny)
    VALUES (?, ?, ?, ?, 0)
  `);

  // Use INSERT OR IGNORE to be idempotent.
  const insertBrought = db.prepare(`
    INSERT OR IGNORE INTO battle_brought_pokemon (battle_id, side, pokemon_instance_id, is_lead, fainted)
    VALUES (?, ?, ?, ?, 0)
  `);

  // Optional: ensure leads are set even if the row already exists (safe idempotent upsert behavior).
  const updateLead = db.prepare(`
    UPDATE battle_brought_pokemon
    SET is_lead = CASE WHEN is_lead = 1 THEN 1 ELSE ? END
    WHERE battle_id = ? AND side = ? AND pokemon_instance_id = ?
  `);

  let insertedInstances = 0;
  let insertedBrought = 0;

  db.transaction(() => {
    for (const side of ["p1", "p2"] as const) {
      for (const species of broughtBySide[side]) {
        // Ensure instance exists
        let inst = getInstance.get(battleId, side, species) as { id: string } | undefined;
        if (!inst) {
          const id = uuid();
          insertInstance.run(id, battleId, side, species);
          insertedInstances += 1;
          inst = { id };
        }

        const isLead = leadKey.has(`${side}|${species}`) ? 1 : 0;

        const info = insertBrought.run(battleId, side, inst.id, isLead);
        if (typeof (info as any)?.changes === "number" && (info as any).changes > 0) {
          insertedBrought += (info as any).changes;
        } else {
          // Row existed; still ensure lead flag is correct (never unset lead)
          if (isLead) updateLead.run(1, battleId, side, inst.id);
        }
      }
    }
  })();

  return { insertedInstances, insertedBrought };
}