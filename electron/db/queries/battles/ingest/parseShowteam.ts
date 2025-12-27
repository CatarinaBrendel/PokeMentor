// ingest/parseShowteam.ts
//
// Parses Pokémon Showdown protocol `|showteam|...` payloads into structured entries.
//
// Expected call site:
// - You already parsed a raw log line into pipe parts: ["showteam", "p1", "<blob>"]
// - Pass the blob (parts[2]) into `parseShowteamBlob(...)`
//
// Notes:
// - Showdown packs the team into a `]`-delimited list of entries.
// - Each entry is `|`-delimited; some fields may be missing depending on format.
// - We focus on what you persist into `battle_revealed_sets`:
//   species, nickname, item, ability, moves[], gender, level, tera
//
// This module does *not* touch the database.

export type Side = "p1" | "p2";

export type ShowteamEntry = {
  species: string;
  nickname: string | null;
  item: string | null;
  ability: string | null;
  moves: string[];
  gender: "M" | "F" | null;
  level: number | null;
  tera: string | null;
  raw: string; // raw entry fragment for debugging/audits
};

function toFiniteInt(v: unknown): number | null {
  const n =
    typeof v === "number"
      ? v
      : typeof v === "string"
        ? Number(v)
        : NaN;
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function cleanToken(s: unknown): string {
  return (typeof s === "string" ? s : "").trim();
}

function parseMovesCsv(csv: string): string[] {
  return csv
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
}

/**
 * Splits the packed blob into raw entry strings.
 * Showdown uses `]` as a delimiter. The last chunk may be empty.
 */
export function splitShowteamEntries(blob: string): string[] {
  return blob
    .split("]")
    .map((x) => x.trim())
    .filter(Boolean);
}

/**
 * Parse a single packed showteam entry into a structured object.
 *
 * IMPORTANT: Field positions come from Showdown's packed showteam format.
 * In your existing ingest, you were using:
 *  species = fields[0]
 *  nickname = fields[1]
 *  item = fields[3]
 *  ability = fields[4]
 *  moves = fields[5].split(",")
 *  gender = fields[8]
 *  level = fields[11]
 *  tera = last segment of fields[12] split by ','
 *
 * We keep that mapping here for consistency with your DB.
 */
export function parseShowteamEntry(entry: string): ShowteamEntry | null {
  const raw = entry;
  const fields = entry.split("|");

  const species = cleanToken(fields[0]);
  if (!species) return null;

  const nickname = cleanToken(fields[1]) || null;

  // NOTE: indexes based on your ingest implementation.
  // Some formats may omit fields; guard for undefined.
  const item = cleanToken(fields[3]) || null;
  const ability = cleanToken(fields[4]) || null;

  const movesCsv = cleanToken(fields[5]);
  const moves = movesCsv ? parseMovesCsv(movesCsv) : [];

  const genderRaw = cleanToken(fields[8]);
  const gender: "M" | "F" | null =
    genderRaw === "M" || genderRaw === "F" ? genderRaw : null;

  const level = fields[11] ? toFiniteInt(fields[11]) : null;

  // Tera is commonly encoded in a "tail" field like ",,,,,Dark"
  // Your ingest read it from fields[12] and took last comma token.
  const tail = cleanToken(fields[12]);
  const tera =
    tail && tail.includes(",") ? cleanToken(tail.split(",").pop()) || null : null;

  return {
    species,
    nickname,
    item,
    ability,
    moves,
    gender,
    level,
    tera,
    raw,
  };
}

/**
 * Parse the entire showteam blob into structured entries.
 * Skips empty / unparsable entries.
 */
export function parseShowteamBlob(blob: string): ShowteamEntry[] {
  const out: ShowteamEntry[] = [];
  for (const rawEntry of splitShowteamEntries(blob)) {
    const parsed = parseShowteamEntry(rawEntry);
    if (parsed) out.push(parsed);
  }
  return out;
}