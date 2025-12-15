import crypto from "node:crypto";
import { randomUUID } from "node:crypto";
import { getDb } from "../index";

type ImportArgs = {
  url: string;
  name?: string;
  format_ps?: string;
};

type StatBlock = {
  hp: number | null;
  atk: number | null;
  def: number | null;
  spa: number | null;
  spd: number | null;
  spe: number | null;
};

type ParsedSet = {
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

  moves: string[]; // keep for hashing/canonicalization now (you’ll add moves table later)
};

function sha256(s: string) {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}

function normalizePokepasteUrl(url: string) {
  // Accept:
  // https://pokepast.es/<id>
  // https://pokepast.es/<id>/raw
  // https://pokepast.es/<id>/raw/<anything>
  const m = url.trim().match(/^https?:\/\/pokepast\.es\/([a-zA-Z0-9]+)(?:\/.*)?$/);
  if (!m) throw new Error("Invalid Pokepaste URL.");
  const id = m[1];
  return {
    id,
    viewUrl: `https://pokepast.es/${id}`,
    rawUrl: `https://pokepast.es/${id}/raw`,
  };
}

async function fetchText(url: string) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch Pokepaste (${res.status})`);
  }
  return res.text();
}

function parseEvIvLine(line: string): Partial<Record<keyof StatBlock, number>> {
  // "EVs: 4 HP / 252 Atk / 252 Spe"
  // "IVs: 0 Atk / 30 Spe"
  const out: Record<string, number> = {};
  const parts = line.split(":")[1]?.split("/").map(p => p.trim()) ?? [];
  for (const p of parts) {
    const mm = p.match(/^(\d+)\s+(HP|Atk|Def|SpA|SpD|Spe)$/i);
    if (!mm) continue;
    const val = Number(mm[1]);
    const stat = mm[2].toLowerCase();
    out[stat] = val;
  }
  return out;
}

function emptyStats(): StatBlock {
  return {
    hp: null, atk: null, def: null, spa: null, spd: null, spe: null,
  } as const;
}

function parseShowdownExport(text: string): ParsedSet[] {
  const blocks = text
    .replace(/\r\n/g, "\n")
    .split(/\n\s*\n/g)
    .map(b => b.trim())
    .filter(Boolean);

  const sets: ParsedSet[] = [];

  for (const block of blocks) {
    const lines = block.split("\n").map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;

    // First line examples:
    // "Gholdengo @ Leftovers"
    // "Bobby (Garchomp) @ Choice Scarf"
    // "Incineroar (M) @ Sitrus Berry"
    const first = lines[0];

    // Extract item
    const [left, itemPart] = first.split(" @ ");
    const item_name = itemPart ? itemPart.trim() : null;

    // Extract gender if present: "(M)" or "(F)" near end
    let gender: "M" | "F" | null = null;
    let left2 = left.trim();
    const genderMatch = left2.match(/\((M|F)\)\s*$/);
    if (genderMatch) {
      gender = genderMatch[1] as "M" | "F";
      left2 = left2.replace(/\((M|F)\)\s*$/, "").trim();
    }

    // Nickname/species:
    // "Nickname (Species)" or "Species"
    let nickname: string | null = null;
    let species_name = left2;

    const nm = left2.match(/^(.+)\s+\((.+)\)$/);
    if (nm) {
      nickname = nm[1].trim();
      species_name = nm[2].trim();
    }

    let ability_name: string | null = null;
    let level: number | null = null;
    let shiny: 0 | 1 = 0;
    let tera_type: string | null = null;
    let happiness: number | null = null;
    let nature: string | null = null;

    let ev = { ...emptyStats() };
    let iv = { ...emptyStats() };
    const moves: string[] = [];

    for (const line of lines.slice(1)) {
      if (line.startsWith("Ability:")) {
        ability_name = line.slice("Ability:".length).trim() || null;
      } else if (line.startsWith("Level:")) {
        const n = Number(line.slice("Level:".length).trim());
        level = Number.isFinite(n) ? n : null;
      } else if (line === "Shiny: Yes") {
        shiny = 1;
      } else if (line.startsWith("Happiness:")) {
        const n = Number(line.slice("Happiness:".length).trim());
        happiness = Number.isFinite(n) ? n : null;
      } else if (line.startsWith("Tera Type:")) {
        tera_type = line.slice("Tera Type:".length).trim() || null;
      } else if (line.startsWith("EVs:")) {
        const m = parseEvIvLine(line);
        ev = {
          hp: m.hp ?? ev.hp,
          atk: m.atk ?? ev.atk,
          def: m.def ?? ev.def,
          spa: m.spa ?? ev.spa,
          spd: m.spd ?? ev.spd,
          spe: m.spe ?? ev.spe,
        };
      } else if (line.startsWith("IVs:")) {
        const m = parseEvIvLine(line);
        iv = {
          hp: m.hp ?? iv.hp,
          atk: m.atk ?? iv.atk,
          def: m.def ?? iv.def,
          spa: m.spa ?? iv.spa,
          spd: m.spd ?? iv.spd,
          spe: m.spe ?? iv.spe,
        };
      } else if (line.endsWith(" Nature")) {
        nature = line.replace(" Nature", "").trim() || null;
      } else if (line.startsWith("- ")) {
        moves.push(line.slice(2).trim());
      }
    }

    sets.push({
      nickname,
      species_name,
      item_name,
      ability_name,
      level,
      gender,
      shiny,
      tera_type,
      happiness,
      nature,

      ev_hp: ev.hp, ev_atk: ev.atk, ev_def: ev.def,
      ev_spa: ev.spa, ev_spd: ev.spd, ev_spe: ev.spe,

      iv_hp: iv.hp, iv_atk: iv.atk, iv_def: iv.def,
      iv_spa: iv.spa, iv_spd: iv.spd, iv_spe: iv.spe,

      moves,
    });
  }

  return sets;
}

function canonicalizeSet(s: ParsedSet) {
  // stable text for hashing/dedupe
  return [
    `species=${s.species_name}`,
    `nickname=${s.nickname ?? ""}`,
    `item=${s.item_name ?? ""}`,
    `ability=${s.ability_name ?? ""}`,
    `level=${s.level ?? ""}`,
    `gender=${s.gender ?? ""}`,
    `shiny=${s.shiny}`,
    `tera=${s.tera_type ?? ""}`,
    `happiness=${s.happiness ?? ""}`,
    `nature=${s.nature ?? ""}`,
    `ev=${[s.ev_hp,s.ev_atk,s.ev_def,s.ev_spa,s.ev_spd,s.ev_spe].map(v=>v ?? "").join(",")}`,
    `iv=${[s.iv_hp,s.iv_atk,s.iv_def,s.iv_spa,s.iv_spd,s.iv_spe].map(v=>v ?? "").join(",")}`,
    `moves=${s.moves.join("|")}`,
  ].join("\n");
}

export async function importTeamFromPokepaste(args: ImportArgs) {
  const { rawUrl, viewUrl } = normalizePokepasteUrl(args.url);
  const source_text = await fetchText(rawUrl);

  const parsed = parseShowdownExport(source_text);
  if (parsed.length === 0) {
    throw new Error("No Pokémon sets found in Pokepaste.");
  }

  const now = new Date().toISOString();
  const source_hash = sha256(source_text.trim());

  const db = getDb();

  const insert = db.transaction(() => {
    const team_id = randomUUID();

    db.prepare(`
      INSERT INTO teams (id, name, format_ps, created_at, updated_at)
      VALUES (@id, @name, @format_ps, @created_at, @updated_at)
    `).run({
      id: team_id,
      name: args.name ?? null,
      format_ps: args.format_ps ?? null,
      created_at: now,
      updated_at: now,
    });

    const version_num = 1;

    const team_version_id = randomUUID();
    db.prepare(`
      INSERT INTO team_versions (
        id, team_id, version_num, source_type, source_url, source_hash, source_text, notes, created_at
      )
      VALUES (
        @id, @team_id, @version_num, 'pokepaste', @source_url, @source_hash, @source_text, NULL, @created_at
      )
    `).run({
      id: team_version_id,
      team_id,
      version_num,
      source_url: viewUrl,
      source_hash,
      source_text,
      created_at: now,
    });

    const selectSet = db.prepare<{ set_hash: string }, { id: string }>(`
      SELECT id FROM pokemon_sets WHERE set_hash = @set_hash LIMIT 1
    `);

    const insertSet = db.prepare(`
      INSERT INTO pokemon_sets (
        id, nickname, species_name, species_id,
        item_name, item_id,
        ability_name, ability_id,
        level, gender, shiny, tera_type, happiness,
        nature,
        ev_hp, ev_atk, ev_def, ev_spa, ev_spd, ev_spe,
        iv_hp, iv_atk, iv_def, iv_spa, iv_spd, iv_spe,
        set_hash, created_at
      ) VALUES (
        @id, @nickname, @species_name, NULL,
        @item_name, NULL,
        @ability_name, NULL,
        @level, @gender, @shiny, @tera_type, @happiness,
        @nature,
        @ev_hp, @ev_atk, @ev_def, @ev_spa, @ev_spd, @ev_spe,
        @iv_hp, @iv_atk, @iv_def, @iv_spa, @iv_spd, @iv_spe,
        @set_hash, @created_at
      )
    `);

    const insertSlot = db.prepare(`
      INSERT INTO team_slots (team_version_id, slot_index, pokemon_set_id)
      VALUES (@team_version_id, @slot_index, @pokemon_set_id)
    `);

    let slotIndex = 1;
    for (const s of parsed.slice(0, 6)) {
      const set_hash = sha256(canonicalizeSet(s));
      const existing = selectSet.get({ set_hash });

      const pokemon_set_id = existing?.id ?? randomUUID();

      if (!existing) {
        insertSet.run({
          id: pokemon_set_id,
          nickname: s.nickname,
          species_name: s.species_name,
          item_name: s.item_name,
          ability_name: s.ability_name,
          level: s.level,
          gender: s.gender,
          shiny: s.shiny,
          tera_type: s.tera_type,
          happiness: s.happiness,
          nature: s.nature,
          ev_hp: s.ev_hp, ev_atk: s.ev_atk, ev_def: s.ev_def, ev_spa: s.ev_spa, ev_spd: s.ev_spd, ev_spe: s.ev_spe,
          iv_hp: s.iv_hp, iv_atk: s.iv_atk, iv_def: s.iv_def, iv_spa: s.iv_spa, iv_spd: s.iv_spd, iv_spe: s.iv_spe,
          set_hash,
          created_at: now,
        });
      }

      insertSlot.run({
        team_version_id,
        slot_index: slotIndex,
        pokemon_set_id,
      });

      slotIndex += 1;
    }

    return {
      team_id,
      team_version_id,
      version_num,
      slots_inserted: Math.min(parsed.length, 6),
      source_url: viewUrl,
    };
  });

  return insert();
}