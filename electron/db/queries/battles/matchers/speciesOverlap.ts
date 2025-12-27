// matchers/speciesOverlap.ts

export type Side = "p1" | "p2";

export type SpeciesSource = "revealed" | "brought" | "preview" | "none";

export type SpeciesList = { species: string[]; source: SpeciesSource };

export type MatchResult = {
  ok: boolean;
  overlap: number;
  confidence: number; // overlap / teamSize (usually 6)
};

export type MatchOptions = {
  minOverlap: number;

  // When comparing many teams, require the best overlap to beat 2nd-best by a margin.
  requireMargin?: boolean;
  marginMin?: number; // default 1
  secondBestOverlap?: number; // required when requireMargin=true
};

export function normSpecies(s: string): string {
  return s.trim().toLowerCase();
}

export function uniqSpecies(xs: string[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const x of xs) {
    const n = normSpecies(x);
    if (!n) continue;
    if (seen.has(n)) continue;
    seen.add(n);
    out.push(x.trim());
  }
  return out;
}

export function overlapCount(a: string[], b: string[]): number {
  const bs = new Set(b.map(normSpecies));
  let n = 0;
  for (const x of a.map(normSpecies)) if (bs.has(x)) n++;
  return n;
}

/**
 * Compute overlap-based match signal.
 *
 * - confidence is normalized by teamSpecies length (usually 6).
 * - minOverlap acts as a hard gate.
 * - margin gating is optional and intended for “pick best among many candidates”.
 */
export function computeOverlapMatch(args: {
  battleSpecies: string[];
  teamSpecies: string[];
  opts: MatchOptions;
}): MatchResult {
  const battleSpecies = uniqSpecies(args.battleSpecies);
  const teamSpecies = uniqSpecies(args.teamSpecies);
  const { minOverlap, requireMargin, marginMin = 1, secondBestOverlap = 0 } = args.opts;

  if (!battleSpecies.length || !teamSpecies.length) return { ok: false, overlap: 0, confidence: 0 };

  const ov = overlapCount(battleSpecies, teamSpecies);
  const confidence = teamSpecies.length ? ov / teamSpecies.length : 0;

  if (ov < minOverlap) return { ok: false, overlap: ov, confidence };

  if (requireMargin) {
    // Allow perfect match without margin (important if multiple teams share 6/6 in same format)
    const perfect = ov >= teamSpecies.length;
    if (!perfect && ov - secondBestOverlap < marginMin) {
      return { ok: false, overlap: ov, confidence };
    }
  }

  return { ok: true, overlap: ov, confidence };
}

/**
 * Convenience: default min-overlap rules by game type.
 * You can override these at call sites.
 */
export function minOverlapForGameType(gameType: string | null, override?: number): number {
  if (override != null) return override;
  const isDoubles = (gameType ?? "").toLowerCase() === "doubles";
  // Doubles often has 4 brought; but if you have 6 revealed from showteam, you’ll still hit 6/6.
  return isDoubles ? 5 : 6;
}

/**
 * Decide which battle species list is “best” to use.
 *
 * Inputs are passed in as raw lists so this file stays DB-agnostic.
 *
 * The `minRevealedToTrust` safety is the exact guard you added:
 * if revealed has only 1–3 mons, it’s likely not enough signal; prefer preview list then.
 */
export function bestBattleSpeciesFromLists(args: {
  revealedSpecies: string[];
  previewSpecies: string[];
  minRevealedToTrust?: number; // default 4
}): SpeciesList {
  const minRevealedToTrust = args.minRevealedToTrust ?? 4;

  const revealed = uniqSpecies(args.revealedSpecies);
  if (revealed.length >= minRevealedToTrust) return { species: revealed, source: "revealed" };

  const preview = uniqSpecies(args.previewSpecies);
  if (preview.length) return { species: preview, source: "preview" };

  return { species: [], source: "none" };
}