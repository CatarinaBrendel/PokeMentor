// teams/services/setTeamActive.ts
//
// Thin service wrapper for setting the active team.
// - Orchestration only (no SQL here)
// - Uses TeamsRepo

import { getDb } from "../../../index";
import { teamsRepo } from "../repo/teamsRepo";

export function setTeamActive(teamId: string): { ok: true } {
  const db = getDb();
  const repo = teamsRepo(db);

  repo.setActiveTeam(teamId);

  return { ok: true };
}