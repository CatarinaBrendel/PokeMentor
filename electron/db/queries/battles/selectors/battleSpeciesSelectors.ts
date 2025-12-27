// selectors/battleSpeciesSelector.ts
//
// DB-facing selector that extracts the *best possible* species list
// for the USER SIDE of a battle, with clear precedence rules.
//
// Precedence (user-side only):
//  1) revealed (trusted only if >= minRevealedToTrust)
//  2) brought (battle_brought_pokemon -> battle_pokemon_instances)
//  3) preview  (battle_preview_pokemon)
//  4) none
//
// This file intentionally does NOT do matching/linking/confidence.
// It only answers: “what species did the user bring in this battle?”

import type BetterSqlite3 from "better-sqlite3";
import type { Side, SpeciesList } from "../matchers/speciesOverlap";

type SpeciesRow = { species_name: string };
type SideRow = { side: Side } | undefined;

function uniqClean(xs: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of xs) {
    const s = (raw ?? "").trim();
    if (!s) continue;
    const k = s.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(s);
  }
  return out;
}

function getUserSide(db: BetterSqlite3.Database, battleId: string): Side | null {
  const row = db
    .prepare(
      `
      SELECT side
      FROM battle_sides
      WHERE battle_id = ? AND is_user = 1
      LIMIT 1
    `
    )
    .get(battleId) as SideRow;

  return row?.side ?? null;
}

function getPreviewSpecies(db: BetterSqlite3.Database, battleId: string, side: Side): string[] {
  const rows = db
    .prepare(
      `
      SELECT species_name
      FROM battle_preview_pokemon
      WHERE battle_id = ? AND side = ?
      ORDER BY slot_index ASC
    `
    )
    .all(battleId, side) as SpeciesRow[];

  return uniqClean(rows.map((r) => r.species_name));
}

function getRevealedSpecies(db: BetterSqlite3.Database, battleId: string, side: Side): string[] {
  const rows = db
    .prepare(
      `
      SELECT DISTINCT species_name
      FROM battle_revealed_sets
      WHERE battle_id = ? AND side = ?
      ORDER BY species_name ASC
    `
    )
    .all(battleId, side) as SpeciesRow[];

  return uniqClean(rows.map((r) => r.species_name));
}

function getBroughtSpecies(db: BetterSqlite3.Database, battleId: string, side: Side): string[] {
  // Your schema stores pokemon_instance_id in battle_brought_pokemon
  // and the species_name lives on battle_pokemon_instances.
  const rows = db
    .prepare(
      `
      SELECT i.species_name
      FROM battle_brought_pokemon b
      JOIN battle_pokemon_instances i
        ON i.id = b.pokemon_instance_id
      WHERE b.battle_id = ? AND b.side = ?
      ORDER BY b.is_lead DESC, i.species_name ASC
    `
    )
    .all(battleId, side) as SpeciesRow[];

  return uniqClean(rows.map((r) => r.species_name));
}

/**
 * Public selector used by services.
 *
 * Guarantees:
 * - returns species for USER side only
 * - never throws for missing data
 * - always returns a SpeciesList with a source tag
 */
export function selectBattleSpeciesForUser(
  db: BetterSqlite3.Database,
  battleId: string,
  opts?: { minRevealedToTrust?: number }
): SpeciesList {
  const userSide = getUserSide(db, battleId);
  if (!userSide) return { species: [], source: "none" };

  const brought = getBroughtSpecies(db, battleId, userSide);
  if (brought.length > 0) {
    return { species: brought, source: "brought" };
  }

  const minRevealedToTrust = opts?.minRevealedToTrust ?? 4;

  const revealed = getRevealedSpecies(db, battleId, userSide);
  if (revealed.length >= minRevealedToTrust) {
    return { species: revealed, source: "revealed" };
  }

  const preview = getPreviewSpecies(db, battleId, userSide);
  if (preview.length > 0) {
    return { species: preview, source: "preview" };
  }

  return { species: [], source: "none" };
}