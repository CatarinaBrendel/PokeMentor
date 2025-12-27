// teams/services/getTeamDetails.ts
//
// Read-only service for fetching full team details (header + latest version + slots).
// - Thin orchestration layer
// - Delegates all DB work to teamsRepo
// - Safe place to add authorization / caching later if needed

import { getDb } from "../../../index";
import { teamsRepo } from "../repo/teamsRepo";
import type { TeamDetails } from "../teams.types";

export function getTeamDetails(teamId: string): TeamDetails {
  if (!teamId) {
    throw new Error("getTeamDetails: teamId is required");
  }

  const db = getDb();
  const repo = teamsRepo(db);

  return repo.getTeamDetails(teamId);
}