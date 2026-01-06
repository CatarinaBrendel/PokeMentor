// electron/db/queries/battles/matchers/tryLinkBattleToTeamVersion.ts
import type BetterSqlite3 from "better-sqlite3";
import { selectBattleSpeciesForUser } from "../selectors/battleSpeciesSelectors";
import type { SpeciesSource } from "./speciesOverlap";
import type { TeamsRepo } from "../../teams/repo/teamsRepo";

export type TryLinkResult = {
  linked: boolean;
  confidence: number;
  method: string;
  battleSource: SpeciesSource;
  teamSize: number;
  overlap: number;
};

type BattleSpeciesList = {
  species: string[];
  source: SpeciesSource;
};

function normalizeSpecies(name: string): string {
  // Keep simple + stable. If you later want to normalize forms, do it here.
  return name.trim().toLowerCase();
}

function overlapCount(a: string[], b: string[]): number {
  const bs = new Set(b.map(normalizeSpecies));
  let n = 0;
  for (const x of a) if (bs.has(normalizeSpecies(x))) n += 1;
  return n;
}

/**
 * Core primitive:
 * Try to link THIS battle (user side) to THIS teamVersionId.
 *
 * Decision rule:
 * - compute overlap / teamSize
 * - link if overlap >= minOverlap AND confidence >= minConfidence
 *
 * Defaults are conservative but practical for VGC:
 * - require at least 4 matches
 * - require at least 0.66 confidence (4/6)
 */
export function tryLinkBattleToTeamVersion(
  db: BetterSqlite3.Database,
  deps: { teamsRepo: TeamsRepo },
  args: {
    battleId: string;
    teamVersionId: string;
    battleSpecies?: BattleSpeciesList;
    minOverlap?: number;
    minConfidence?: number;
  }
): TryLinkResult {
  const teamRows = deps.teamsRepo.listTeamVersionSlotsSpecies(args.teamVersionId);
  const teamSpecies = teamRows.map((r) => r.species_name).filter(Boolean);
  const teamSize = teamSpecies.length;

  const battle = selectBattleSpeciesForUser(db, args.battleId, { minRevealedToTrust: 4 });
  const battleSpecies = battle.species;

  if (teamSize === 0 || battleSpecies.length === 0) {
    return {
      linked: false,
      confidence: 0,
      method: teamSize === 0 ? "team_empty" : "battle_species_empty",
      battleSource: battle.source,
      teamSize,
      overlap: 0,
    };
  }

  const overlap = overlapCount(battleSpecies, teamSpecies);
  const baseConfidence = overlap / teamSize;

  // Reasonable defaults for VGC:
  // - if using brought/revealed, 4/6 is typically enough
  // - if preview-only, be stricter
  const defaults =
    battle.source === "preview"
      ? { minOverlap: 5, minConfidence: 0.83 }
      : { minOverlap: 4, minConfidence: 0.66 };

  const minOverlap = args.minOverlap ?? defaults.minOverlap;
  const minConfidence = args.minConfidence ?? defaults.minConfidence;

  const method =
    battle.source === "brought"
      ? "team-link_brought_overlap"
      : battle.source === "revealed"
        ? "team-link_revealed_overlap"
        : battle.source === "preview"
          ? "team-link_preview_overlap"
          : "team-link_no_data";

  const linked = overlap >= minOverlap && baseConfidence >= minConfidence;

  return {
    linked,
    confidence: baseConfidence,
    method,
    battleSource: battle.source,
    teamSize,
    overlap,
  };
}