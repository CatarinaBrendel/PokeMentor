import { getDb } from "../../index";
import { teamsQueries } from "./teams";
import type { TeamDetails, TeamListRow } from "./teams.types";

export function getTeamDetails(teamId: string): TeamDetails {
  const db = getDb();
  const q = teamsQueries(db);

  // teamsQueries should expose getTeamDetails(teamId)
  return q.getTeamDetails(teamId);
}

export function getActiveTeamSummary(): TeamListRow | null {
  const db = getDb();
  return teamsQueries(db).getActiveTeamSummary();
}