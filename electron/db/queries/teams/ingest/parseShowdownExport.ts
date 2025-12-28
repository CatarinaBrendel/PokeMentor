// teams/ingest/parseShowdownExport.ts
//
// Single canonical parser for:
// - Pokepaste raw text
// - User-pasted “exportable” text
//
// Goals:
// - English-only keys (Ability:, Level:, EVs:, IVs:, Tera Type:, Happiness:, Shiny: Yes/No)
// - Moves accepted as "- Move" or bare lines (for pasted formats)
// - Spreads accept multiple stat spellings (SpA, Sp. Atk, SpAtk, etc.)
// - Returns warnings for UI/debugging

export type StatKey = "hp" | "atk" | "def" | "spa" | "spd" | "spe";

export type ParsedSet = {
  nickname: string | null;
  species_name: string;

  item_name: string | null;
  ability_name: string | null;

  level: number | null;
  gender: "M" | "F" | null;
  shiny: 0 | 1;

  tera_type: string | null;
  happiness: number | null;
  nature: string | null;

  ev_hp: number | null; ev_atk: number | null; ev_def: number | null;
  ev_spa: number | null; ev_spd: number | null; ev_spe: number | null;

  iv_hp: number | null; iv_atk: number | null; iv_def: number | null;
  iv_spa: number | null; iv_spd: number | null; iv_spe: number | null;

  moves: string[]; // up to 4
};

export type ParsedPaste = {
  sets: ParsedSet[];
  warnings: string[];
};

const STAT_MAP: Record<string, StatKey> = {
  hp: "hp",
  atk: "atk",
  def: "def",
  spa: "spa",
  spatk: "spa",
  spdef: "spd",
  spd: "spd",
  spe: "spe",
  speed: "spe",
};

const SUPPORTED_KEYS = new Set(["ability", "level", "evs", "ivs", "tera type", "happiness", "shiny"]);

function toFiniteInt(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function parseSpread(value: string) {
  const out: Partial<Record<StatKey, number>> = {};
  const parts = value.split("/").map((x) => x.trim()).filter(Boolean);

  for (const p of parts) {
    const m = p.match(/^(\d+)\s+(.+)$/);
    if (!m) continue;

    const n = toFiniteInt(m[1]);
    if (n == null) continue;

    const statRaw = m[2].trim();
    const keyToken = statRaw
      .toLowerCase()
      .replace(/\./g, "")
      .replace(/\s+/g, "");
    const key = STAT_MAP[keyToken];

    if (!key) continue;
    out[key] = n;
  }

  return out;
}

function parseHeader(line: string): {
  nickname: string | null;
  species_name: string;
  item_name: string | null;
  gender: "M" | "F" | null;
} | null {
  const [leftRaw, itemPart] = line.split(" @ ");
  const item_name = itemPart ? itemPart.trim() : null;

  let left = (leftRaw ?? "").trim();
  if (!left) return null;

  // gender suffix "(M)" or "(F)" at end of left segment
  let gender: "M" | "F" | null = null;
  const gm = left.match(/\((M|F)\)\s*$/);
  if (gm) {
    gender = gm[1] as "M" | "F";
    left = left.replace(/\((M|F)\)\s*$/, "").trim();
  }

  // nickname/species form: "Nick (Species)" or "Species"
  let nickname: string | null = null;
  let species_name = left;

  const nm = left.match(/^(.+)\s+\((.+)\)$/);
  if (nm) {
    nickname = nm[1].trim();
    species_name = nm[2].trim();
  }

  if (!species_name) return null;

  return { nickname, species_name, item_name, gender };
}

function statsFromSpread(sp: Partial<Record<StatKey, number>>): {
  hp: number | null; atk: number | null; def: number | null; spa: number | null; spd: number | null; spe: number | null;
} {
  return {
    hp: sp.hp ?? null,
    atk: sp.atk ?? null,
    def: sp.def ?? null,
    spa: sp.spa ?? null,
    spd: sp.spd ?? null,
    spe: sp.spe ?? null,
  };
}

export function parseShowdownExport(raw: string): ParsedPaste {
  const warnings: string[] = [];
  const text = (raw ?? "").replace(/\r\n/g, "\n").trim();

  if (!text) return { sets: [], warnings: ["Empty paste."] };

  const blocks = text.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  const sets: ParsedSet[] = [];

  for (const [bi, block] of blocks.entries()) {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) continue;

    const header = parseHeader(lines[0]);
    if (!header) {
      warnings.push(`Block ${bi + 1}: invalid header line.`);
      continue;
    }

    let ability_name: string | null = null;
    let level: number | null = null;
    let shiny: 0 | 1 = 0;
    let tera_type: string | null = null;
    let happiness: number | null = null;
    let nature: string | null = null;

    let evs: Partial<Record<StatKey, number>> = {};
    let ivs: Partial<Record<StatKey, number>> = {};
    const moves: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];

      // Nature: "Adamant Nature"
      const nat = line.match(/^(.+)\s+Nature$/i);
      if (nat) {
        nature = nat[1].trim() || null;
        continue;
      }

      // Key: Value
      const kv = line.match(/^([^:]+):\s*(.+)$/);
      if (kv) {
        const key = kv[1].replace(/^\uFEFF/, "").trim().toLowerCase();
        const val = kv[2].trim();

        // Enforce English-only keys. If you prefer “best-effort” parsing, remove this guard.
        if (!SUPPORTED_KEYS.has(key)) {
          warnings.push(`Block ${bi + 1}: unsupported key "${kv[1].trim()}" (English-only).`);
          continue;
        }

        if (key === "ability") { ability_name = val || null; continue; }
        if (key === "level") { level = toFiniteInt(val); continue; }
        if (key === "evs") { evs = parseSpread(val); continue; }
        if (key === "ivs") { ivs = parseSpread(val); continue; }
        if (key === "tera type") { tera_type = val || null; continue; }
        if (key === "happiness") { happiness = toFiniteInt(val); continue; }
        if (key === "shiny") { shiny = /yes|true|1/i.test(val) ? 1 : 0; continue; }

        continue;
      }

      // Moves:
      // - "- Move"
      // - "Move" (bare line)
      // Heuristic: treat as move if we still need moves and it doesn't look like a key/value line.
      if (moves.length < 4) {
        const mv = line.replace(/^-+\s*/, "").trim();
        if (mv && !mv.includes(":")) {
          moves.push(mv);
          continue;
        }
      }
    }

    if (moves.length === 0) {
      warnings.push(`Block ${bi + 1}: no moves detected.`);
    }

    if (moves.length > 4) {
      warnings.push(`Block ${bi + 1}: ${moves.length} moves found; keeping first 4.`);
    }

    const ev = statsFromSpread(evs);
    const iv = statsFromSpread(ivs);

    sets.push({
      nickname: header.nickname,
      species_name: header.species_name,
      item_name: header.item_name,
      ability_name,
      level,
      gender: header.gender,
      shiny,
      tera_type,
      happiness,
      nature,

      ev_hp: ev.hp, ev_atk: ev.atk, ev_def: ev.def,
      ev_spa: ev.spa, ev_spd: ev.spd, ev_spe: ev.spe,

      iv_hp: iv.hp, iv_atk: iv.atk, iv_def: iv.def,
      iv_spa: iv.spa, iv_spd: iv.spd, iv_spe: iv.spe,

      moves: moves.slice(0, 4),
    });
  }

  if (sets.length === 0) warnings.push("No Pokémon blocks found in paste.");
  if (sets.length > 6) warnings.push(`Paste contains ${sets.length} Pokémon; only first 6 will be imported.`);

  return { sets, warnings };
}
