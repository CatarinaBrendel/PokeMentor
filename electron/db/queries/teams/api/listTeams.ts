// teams/services/listTeams.ts
//
// Read-only service for listing teams.
// - No business logic
// - No DB knowledge beyond the repo

import { getDb } from "../../../index";
import { teamsRepo } from "../repo/teamsRepo";
import type { TeamListRow } from "../teams.types";

export function listTeams(): TeamListRow[] {
  const db = getDb();
  const repo = teamsRepo(db);

  return repo.listTeams();
}