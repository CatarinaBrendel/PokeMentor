// linking/teamLinking.ts
//
// Cross-domain “orchestration” for when a TEAM VERSION is created/updated.
// This is deliberately small: it calls lower-level linkers/backfills.
// It does NOT contain SQL (that lives in repos) and does NOT parse logs.

import type BetterSqlite3 from "better-sqlite3";
import { backfillLinksForTeamVersion } from "./backfillLinksForTeamVersion";
import type { TeamsRepo } from "../repo/teamsRepo";
import type { BattleRepo } from "../../battles/repo/battleRepo"; // adjust if needed

export type PostCommitTeamVersionLinkingArgs = {
  teamVersionId: string;
  formatKeyHint?: string | null;
  limit?: number;

  /**
   * Optional: if true, prints a single summary line.
   * Keep detailed per-battle logging inside backfillLinksForTeamVersion.
   */
  debug?: boolean;
};

export type PostCommitTeamVersionLinkingResult = {
  scanned: number;
  linked: number;
};

/**
 * Call this AFTER the DB transaction that created the team version has committed.
 * (So the version + slots are visible to any subsequent SELECTs during linking.)
 */
export function postCommitTeamVersionLinking(
  db: BetterSqlite3.Database,
  deps: { teamsRepo: TeamsRepo; battleRepo: BattleRepo },
  args: PostCommitTeamVersionLinkingArgs
): PostCommitTeamVersionLinkingResult {
  const res = backfillLinksForTeamVersion(db, deps, {
    teamVersionId: args.teamVersionId,
    formatKeyHint: args.formatKeyHint ?? null,
    limit: args.limit ?? 500,
  });

  if (args.debug) {
    console.log("[team linking] post-commit", {
      teamVersionId: args.teamVersionId,
      formatKeyHint: args.formatKeyHint ?? null,
      ...res,
    });
  }

  return res;
}