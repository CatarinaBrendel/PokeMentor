// battles/services/BattleLinkService.ts
import type BetterSqlite3 from "better-sqlite3";
import type { TeamsRepo } from "../../teams/repo/teamsRepo";
import type { BattleRepo } from "../repo/battleRepo";
import { tryLinkBattleToTeamVersion } from "../matchers/tryLinkBattleToTeamVersion";
import { selectBattleSpeciesForUser } from "../selectors/battleSpeciesSelectors";

export type BattleLinkServiceDeps = {
  battleRepo: BattleRepo;
  teamsRepo: TeamsRepo;
};

// Public API type you can import elsewhere
export type BattleLinkServiceApi = ReturnType<typeof BattleLinkService>;

export function BattleLinkService(db: BetterSqlite3.Database, deps: BattleLinkServiceDeps) {
  const { battleRepo, teamsRepo } = deps;

  /**
   * Links a single battle (user side) against the *latest version* of all teams.
   * - Safe to call repeatedly (idempotent if your repo upserts / ignores unchanged).
   * - Will not override if a link exists with matched_by='user' (if you enforce that in repo).
   */
  function autoLinkBattleForUserSide(args: {
    battleId: string;
    formatKeyHint?: string | null;
    limitTeams?: number;
    debug?: boolean;
  }): {
    linked: boolean;
    teamVersionId: string | null;
    confidence: number | null;
    method: string | null;
  } {
    const { battleId, debug } = args;

    const NOT_LINKED = {
      linked: false,
      teamVersionId: null,
      confidence: null,
      method: null,
    } as const;

    // 1) Need user side for both selection and persistence.
    const userSide = battleRepo.getUserSide(battleId);
    if (!userSide) return NOT_LINKED;

    // 2) Optional guard: if we have no user species, skip work.
    const speciesList = selectBattleSpeciesForUser(db, battleId);
    if (speciesList.species.length === 0) return NOT_LINKED;

    // 3) Candidate team versions (latest versions is usually best).
    // Ensure teamsRepo.listLatestTeamVersions exists and returns objects with `team_version_id`.
    const candidates = teamsRepo.listLatestTeamVersions({
      formatKeyHint: args.formatKeyHint ?? null,
      limit: args.limitTeams ?? 200,
    });

    let best: { teamVersionId: string; confidence: number; method: string } | null = null;

    for (const tv of candidates) {
      const r = tryLinkBattleToTeamVersion(
        db,
        { teamsRepo },
        { battleId, teamVersionId: tv.team_version_id }
      );

      if (!r.linked) continue;

      if (!best || r.confidence > best.confidence) {
        best = {
          teamVersionId: tv.team_version_id,
          confidence: r.confidence,
          method: r.method,
        };
      }
    }

    if (!best) return NOT_LINKED;

    // 4) Persist link (idempotent upsert)
    battleRepo.upsertLink({
      battleId,
      side: userSide,
      teamVersionId: best.teamVersionId,
      confidence: best.confidence,
      method: best.method,
      matchedBy: "auto",
    });

    if (debug) {
      console.log("[battle link] linked", { battleId, ...best, userSide });
    }

    return {
      linked: true,
      teamVersionId: best.teamVersionId,
      confidence: best.confidence,
      method: best.method,
    };
  }

  /**
   * When a team version is imported, scan recent battles and link those that match.
   * You already have this as backfillLinksForTeamVersion — you can call that here instead,
   * but keeping this method here is useful as a public service API.
   */
  function backfillForTeamVersion(args: { teamVersionId: string; formatKeyHint?: string | null; limit?: number }) {
    // Prefer using your existing backfillLinksForTeamVersion module.
    // If you want, we can wire it in here directly.
    throw new Error("backfillForTeamVersion not implemented: call teams/linking/backfillLinksForTeamVersion.ts directly.");
  }

  return {
    autoLinkBattleForUserSide,
    backfillForTeamVersion,
  };
}