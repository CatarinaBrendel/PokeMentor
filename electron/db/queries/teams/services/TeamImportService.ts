// teams/services/TeamImportService.ts
import { randomUUID } from "node:crypto";
import type BetterSqlite3 from "better-sqlite3";

import type { TeamsRepo } from "../repo/teamsRepo";
import { postCommitTeamVersionLinking } from "../linking/teamLinking";
import type { BattleRepo } from "../../battles/repo/battleRepo";

import { parseShowdownExport, type ParsedSet } from "../ingest/parseShowdownExport";
import { canonicalizeSourceText } from "../ingest/canonicalize";
import { sourceHashFromText, setHash } from "../ingest/hashing";

type PokepasteMeta = {
  title: string | null;
  author: string | null;
  format: string | null;
};

type RecipeItem = {
  name: string;
  count: number;
};

type StatRecipe = {
  stat: string;
  items: RecipeItem[];
};

type EvRecipe = {
  stats: StatRecipe[];
  assumptions: string[];
  notes?: string[];
  source: "local" | "ai";
};

type StatDef = {
  key: keyof Pick<
    ParsedSet,
    "ev_hp" | "ev_atk" | "ev_def" | "ev_spa" | "ev_spd" | "ev_spe"
  >;
  label: string;
  vitamin: string;
  feather: string;
};

const STAT_DEFS: StatDef[] = [
  { key: "ev_hp", label: "HP", vitamin: "HP Up", feather: "Health Feather" },
  { key: "ev_atk", label: "Atk", vitamin: "Protein", feather: "Muscle Feather" },
  { key: "ev_def", label: "Def", vitamin: "Iron", feather: "Resist Feather" },
  { key: "ev_spa", label: "SpA", vitamin: "Calcium", feather: "Genius Feather" },
  { key: "ev_spd", label: "SpD", vitamin: "Zinc", feather: "Clever Feather" },
  { key: "ev_spe", label: "Spe", vitamin: "Carbos", feather: "Swift Feather" },
];

export type ImportArgs = { 
  url?: string; 
  paste_text?: string;
  name?: string; 
  format_ps?: string };

export type ImportTeamResult = {
  team_id: string;
  version_id: string;
  version_num: number;
  slots_inserted: number;
  linking?: { scanned: number; linked: number };
};

export type ImportPreviewResult = {
  source_url: string | null;
  raw_text: string;
  meta: PokepasteMeta;
  warnings: string[];
  sets: ParsedSet[];
};

function mapSetToDb(s: ParsedSet) {
  return {
    nickname: s.nickname ?? null,
    species_name: s.species_name,
    item_name: s.item_name ?? null,
    ability_name: s.ability_name ?? null,
    level: s.level ?? null,
    gender: s.gender ?? null,
    shiny: (s.shiny ?? 0) as 0 | 1,
    tera_type: s.tera_type ?? null,
    happiness: s.happiness ?? null,
    nature: s.nature ?? null,

    ev_hp: s.ev_hp ?? null,
    ev_atk: s.ev_atk ?? null,
    ev_def: s.ev_def ?? null,
    ev_spa: s.ev_spa ?? null,
    ev_spd: s.ev_spd ?? null,
    ev_spe: s.ev_spe ?? null,

    iv_hp: s.iv_hp ?? null,
    iv_atk: s.iv_atk ?? null,
    iv_def: s.iv_def ?? null,
    iv_spa: s.iv_spa ?? null,
    iv_spd: s.iv_spd ?? null,
    iv_spe: s.iv_spe ?? null,
  };
}

function buildLocalRecipeFromSet(set: ParsedSet): EvRecipe {
  const stats: StatRecipe[] = [];

  STAT_DEFS.forEach((stat) => {
    const value = set[stat.key] ?? 0;
    if (!value) return;

    const vitamins = Math.floor(value / 10);
    const feathers = value - vitamins * 10;
    const items: RecipeItem[] = [];

    if (vitamins > 0) items.push({ name: stat.vitamin, count: vitamins });
    if (feathers > 0) items.push({ name: stat.feather, count: feathers });

    stats.push({ stat: stat.label, items });
  });

  return {
    stats,
    assumptions: [
      "Assumes fresh Pokemon (0 EVs).",
      "Vitamins provide 10 EV each.",
      "Feathers are used for +1 EV precision.",
    ],
    source: "local",
  };
}

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

function normalizePokepasteUrl(url?: string | null) {
  const u = url?.trim();
  if (!u) return null;

  const m = u.match(/^https?:\/\/pokepast\.es\/([a-zA-Z0-9]+)(?:\/.*)?$/);
  if (!m) throw new Error("Invalid Pokepaste URL.");
  const id = m[1];
  return { id, viewUrl: `https://pokepast.es/${id}`, rawUrl: `https://pokepast.es/${id}/raw` };
}

async function fetchText(url: string, timeoutMs = 10_000): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "User-Agent": "PokeMentor/1.0",
        Accept: "text/html, text/plain;q=0.9, */*;q=0.8",
      },
    });

    if (!res.ok) throw new Error(`Fetch failed (${res.status}) for ${url}`);
    return await res.text();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Failed to fetch ${url}: ${msg}`);
  } finally {
    clearTimeout(t);
  }
}

export function teamImportService(
  db: BetterSqlite3.Database, 
  deps: { teamsRepo: TeamsRepo, battleRepo: BattleRepo }) {
  const repo = deps.teamsRepo;

  return {
    async importFromPokepaste(args: ImportArgs): Promise<ImportTeamResult> {
      const paste = (args.paste_text ?? "").trim();
      const norm = normalizePokepasteUrl(args.url);

      if (!paste && !norm) {
        throw new Error("Provide either a Pokepaste URL or pasted Showdown export text.");
      }

      let rawText: string;
      let meta: PokepasteMeta = { title: null, author: null, format: null };
      let source_url: string | null = null;

      if (paste) {
        // Paste mode: no URL fetch, no HTML meta
        rawText = paste;
        source_url = norm?.viewUrl ?? null;
      } else {
        // URL mode
        const { viewUrl, rawUrl } = norm!;
        source_url = viewUrl;

        const [fetchedRaw, viewHtml] = await Promise.all([fetchText(rawUrl), fetchText(viewUrl)]);
        rawText = fetchedRaw;
        meta = parsePokepasteMetaFromHtml(viewHtml);
      }

      const canonicalSource = canonicalizeSourceText(rawText);
      const source_hash = sourceHashFromText(canonicalSource);
      const nowIso = new Date().toISOString();

      const parsed = parseShowdownExport(canonicalSource);
      const parsedSets = parsed.sets;
      
      if (parsed.warnings.length) {
        console.log("[team import] parse warnings", parsed.warnings);
      }

      const finalName = args.name?.trim() || meta.title?.trim() || "Imported Team";
      const finalFormat = args.format_ps?.trim() || meta.format?.trim() || null;
      const result = db.transaction(() => {
        const team_id = randomUUID();
        const version_id = randomUUID();
        const version_num = 1;

        repo.insertTeam({ id: team_id, name: finalName, format_ps: finalFormat, now: nowIso });

        repo.insertTeamVersion({
          id: version_id,
          team_id,
          version_num,
          source_url,
          source_hash,
          source_text: rawText,
          source_title: meta.title,
          source_author: meta.author,
          source_format: meta.format,
          now: nowIso,
        });

        let slotIndex = 1;

        for (const s of parsedSets.slice(0, 6)) {
          const set_hash = setHash(s);
          const existingId = repo.findPokemonSetIdByHash(set_hash);
          const pokemon_set_id = existingId ?? randomUUID();

          if (!existingId) {
            repo.insertPokemonSet({
            id: pokemon_set_id,
            ...mapSetToDb(s),
            set_hash,
            now: nowIso,
          });

            for (let i = 0; i < Math.min(s.moves.length, 4); i++) {
              const moveName = s.moves[i]?.trim();
              if (!moveName) continue;
              const move_id = repo.getOrCreateMoveId(moveName);
              repo.insertPokemonSetMove({ pokemon_set_id, move_slot: i + 1, move_id });
            }
          }

          repo.insertTeamSlot({ team_version_id: version_id, slot_index: slotIndex, pokemon_set_id });
          const localRecipe = buildLocalRecipeFromSet(s);
          repo.upsertTeamEvRecipe({
            team_version_id: version_id,
            pokemon_set_id,
            source: "local",
            recipe_json: JSON.stringify(localRecipe),
            now: nowIso,
          });
          slotIndex += 1;
        }

        return { team_id, version_id, version_num, slots_inserted: Math.min(parsedSets.length, 6) };
      })();

      const linking = postCommitTeamVersionLinking(db, 
        {teamsRepo: deps.teamsRepo,
          battleRepo: deps.battleRepo
        },
        {
        teamVersionId: result.version_id,
        formatKeyHint: finalFormat,
        limit: 500,
        debug: true,
      });

      return { ...result, linking };
    },

    async previewFromPokepaste(args: ImportArgs): Promise<ImportPreviewResult> {
      const paste = (args.paste_text ?? "").trim();
      const norm = normalizePokepasteUrl(args.url);

      if (!paste && !norm) {
        throw new Error("Provide either a Pokepaste URL or pasted Showdown export text.");
      }

      let rawText: string;
      let meta: PokepasteMeta = { title: null, author: null, format: null };
      let source_url: string | null = null;

      if (paste) {
        rawText = paste;
        source_url = norm?.viewUrl ?? null;
      } else {
        const { viewUrl, rawUrl } = norm!;
        source_url = viewUrl;

        const [fetchedRaw, viewHtml] = await Promise.all([fetchText(rawUrl), fetchText(viewUrl)]);
        rawText = fetchedRaw;
        meta = parsePokepasteMetaFromHtml(viewHtml);
      }

      const canonicalSource = canonicalizeSourceText(rawText);
      const parsed = parseShowdownExport(canonicalSource);

      if (parsed.warnings.length) {
        console.log("[team import preview] parse warnings", parsed.warnings);
      }

      return {
        source_url,
        raw_text: canonicalSource,
        meta,
        warnings: parsed.warnings,
        sets: parsed.sets,
      };
    },
  };
}

export type TeamImportServiceApi = ReturnType<typeof teamImportService>;
