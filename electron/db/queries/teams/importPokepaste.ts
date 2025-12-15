import crypto from "node:crypto";
import { randomUUID } from "node:crypto";
import { getDb } from "../../../db/index";
import { teamsQueries } from "../teams/teams";

export type ImportArgs = { url: string; name?: string; format_ps?: string };

export type ImportTeamResult = {
  team_id: string;
  version_id: string;
  version_num: number;
  slots_inserted: number;
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

  moves: string[];
};

type PokepasteMeta = {
  title: string | null;
  author: string | null;
  format: string | null;
};

function decodeHtml(s: string) {
  return s
    .replace("&nbsp;", " ")
    .replace("&amp;", "&")
    .replace("&lt;", "<")
    .replace("&gt;", ">")
    .replace("&quot;", "\"")
    .replace("&#39;", "'");
}

function stripTags(s: string) {
  return decodeHtml(s.replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();
}

function parsePokepasteMetaFromHtml(html: string): PokepasteMeta {
  const asideMatch = html.match(/<aside\b[^>]*>([\s\S]*?)<\/aside>/i);
  const aside = asideMatch?.[1] ?? html;

  const title = (() => {
    const m = aside.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
    return m ? stripTags(m[1]) : null;
  })();

  const author = (() => {
    const m = aside.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/i);
    if (!m) return null;
    const t = stripTags(m[1]);
    return t.replace(/^by\s+/i, "").trim() || null;
  })();

  const format = (() => {
    const m = aside.match(/<p\b[^>]*>\s*Format:\s*([^<]+)\s*<\/p>/i);
    return m ? stripTags(m[1]) : null;
  })();

  return { title, author, format };
}

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

async function fetchText(url: string, timeoutMs = 10_000): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        // Helps avoid occasional “smart” responses
        "User-Agent": "PokeMentor/1.0",
        "Accept": "text/html, text/plain;q=0.9, */*;q=0.8",
      },
    });

    if (!res.ok) {
      throw new Error(`Fetch failed (${res.status}) for ${url}`);
    }
    return await res.text();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Failed to fetch ${url}: ${msg}`);
  } finally {
    clearTimeout(t);
  }
}

function emptyStats(): StatBlock {
  return { hp: null, atk: null, def: null, spa: null, spd: null, spe: null };
}

function parseEvIvLine(line: string): Partial<Record<keyof StatBlock, number>> {
  // "EVs: 4 HP / 252 Atk / 252 Spe"
  const out: Partial<Record<keyof StatBlock, number>> = {};
  const parts = line.split(":")[1]?.split("/").map(p => p.trim()) ?? [];
  for (const p of parts) {
    const mm = p.match(/^(\d+)\s+(HP|Atk|Def|SpA|SpD|Spe)$/i);
    if (!mm) continue;
    const val = Number(mm[1]);
    const statToken = mm[2].toLowerCase();
    const stat =
      statToken === "hp" ? "hp"
      : statToken === "atk" ? "atk"
      : statToken === "def" ? "def"
      : statToken === "spa" ? "spa"
      : statToken === "spd" ? "spd"
      : "spe";
    out[stat] = val;
  }
  return out;
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

    const first = lines[0];

    const [left, itemPart] = first.split(" @ ");
    const item_name = itemPart ? itemPart.trim() : null;

    let gender: "M" | "F" | null = null;
    let left2 = left.trim();
    const genderMatch = left2.match(/\((M|F)\)\s*$/);
    if (genderMatch) {
      gender = genderMatch[1] as "M" | "F";
      left2 = left2.replace(/\((M|F)\)\s*$/, "").trim();
    }

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

    let ev = emptyStats();
    let iv = emptyStats();
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
        ev = { ...ev, ...m };
      } else if (line.startsWith("IVs:")) {
        const m = parseEvIvLine(line);
        iv = { ...iv, ...m };
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
    `ev=${[s.ev_hp, s.ev_atk, s.ev_def, s.ev_spa, s.ev_spd, s.ev_spe].map(v => v ?? "").join(",")}`,
    `iv=${[s.iv_hp, s.iv_atk, s.iv_def, s.iv_spa, s.iv_spd, s.iv_spe].map(v => v ?? "").join(",")}`,
    `moves=${s.moves.join("|")}`,
  ].join("\n");
}

export async function importTeamFromPokepaste(args: ImportArgs): Promise<ImportTeamResult> {
  const { viewUrl, rawUrl } = normalizePokepasteUrl(args.url);

  // Fetch in parallel (faster, still simple)
  const [rawText, viewHtml] = await Promise.all([
    fetchText(rawUrl),
    fetchText(viewUrl),
  ]);

  const meta = parsePokepasteMetaFromHtml(viewHtml);

  const parsedSets = parseShowdownExport(rawText);
  if (parsedSets.length === 0) throw new Error("No Pokémon sets found in Pokepaste.");

  const now = new Date().toISOString();
  const source_hash = sha256(rawText.trim());

  const finalName = args.name?.trim() || meta.title?.trim() || "Imported Team";
  const finalFormat = args.format_ps?.trim() || meta.format?.trim() || null;

  const db = getDb();
  const q = teamsQueries(db);

  return db.transaction(() => {
    const team_id = randomUUID();
    const version_id = randomUUID();
    const version_num = 1;

    q.insertTeam({ id: team_id, name: finalName, format_ps: finalFormat, now });

    q.insertTeamVersion({
      id: version_id,
      team_id,
      version_num,
      source_url: viewUrl,
      source_hash,
      source_text: rawText,
      source_title: meta.title,
      source_author: meta.author,
      source_format: meta.format,
      now,
    });

    let slotIndex = 1;

    for (const s of parsedSets.slice(0, 6)) {
      const set_hash = sha256(canonicalizeSet(s));
      const existingId = q.findPokemonSetIdByHash(set_hash);
      const pokemon_set_id = existingId ?? randomUUID();

      if (!existingId) {
        q.insertPokemonSet({
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
          ev_hp: s.ev_hp, ev_atk: s.ev_atk, ev_def: s.ev_def,
          ev_spa: s.ev_spa, ev_spd: s.ev_spd, ev_spe: s.ev_spe,
          iv_hp: s.iv_hp, iv_atk: s.iv_atk, iv_def: s.iv_def,
          iv_spa: s.iv_spa, iv_spd: s.iv_spd, iv_spe: s.iv_spe,
          set_hash,
          now,
        });
      }

      q.insertTeamSlot({ team_version_id: version_id, slot_index: slotIndex, pokemon_set_id });
      slotIndex += 1;
    }

    return {
      team_id,
      version_id,
      version_num,
      slots_inserted: Math.min(parsedSets.length, 6),
    };
  })();
}