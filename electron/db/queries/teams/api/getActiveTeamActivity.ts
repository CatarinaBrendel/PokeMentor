// teams/services/getActiveTeamActivity.ts
//
// Read-only service returning activity stats for the currently active team.
// This is used by dashboards / KPIs and intentionally contains no SQL.
//
// Responsibilities:
// - Resolve DB
// - Delegate to teamsRepo
// - Provide a stable API boundary for UI usage

import { getDb } from "../../../index";
import { teamsRepo } from "../repo/teamsRepo";
import type { ActiveTeamActivity } from "../teams.types";

export function getActiveTeamActivity(): ActiveTeamActivity {
  const db = getDb();
  const repo = teamsRepo(db);

  return repo.getActiveTeamActivity();
}