// teams/ingest/canonicalize.ts
// teams/ingest/canonicalize.ts
import type { ParsedSet } from "./parseShowdownExport";

function norm(s: string | null | undefined) {
  return (s ?? "").trim();
}

function normMoves(moves: string[]) {
  return moves
    .map((m) => m.trim())
    .filter(Boolean)
    .slice(0, 4)
    .map((m) => m.toLowerCase()) // optional; see note below
    .join("|");
}

function normNum(n: number | null | undefined) {
  return n == null ? "" : String(n);
}

export function canonicalizeSet(s: ParsedSet) {
  // Important: stable ordering + stable defaults.
  // Important: do NOT include fields you don't parse yet (e.g. ability if absent), but do include them if present.
  return [
    `species=${norm(s.species_name)}`,
    `nickname=${norm(s.nickname)}`,
    `item=${norm(s.item_name)}`,
    `ability=${norm(s.ability_name)}`,
    `level=${normNum(s.level)}`,
    `gender=${norm(s.gender)}`,
    `shiny=${s.shiny ?? 0}`,
    `tera=${norm(s.tera_type)}`,
    `happiness=${normNum(s.happiness)}`,
    `nature=${norm(s.nature)}`,
    `ev=${[s.ev_hp, s.ev_atk, s.ev_def, s.ev_spa, s.ev_spd, s.ev_spe].map(normNum).join(",")}`,
    `iv=${[s.iv_hp, s.iv_atk, s.iv_def, s.iv_spa, s.iv_spd, s.iv_spe].map(normNum).join(",")}`,
    `moves=${normMoves(s.moves ?? [])}`,
  ].join("\n");
}

export function canonicalizeSourceText(raw: string) {
  return raw
    .replace(/\r\n/g, "\n")
    .trim()
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n");
}