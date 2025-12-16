import { getDb } from "../../../db/index";
import { teamsQueries } from "../teams/teams";
import type { TeamListRow, ActiveTeamActivity } from "../../queries/teams/teams.types";

export function listTeams(): TeamListRow[] {
  const db = getDb();
  return teamsQueries(db).listTeams();
}

export function setTeamActive(teamId: string): { ok: true } {
  const db = getDb();
  const q = teamsQueries(db);

  q.setActiveTeam(teamId);

  return { ok: true };
} 

export function getActiveTeamActivity(): ActiveTeamActivity {
  const db = getDb();
  return teamsQueries(db).getActiveTeamActivity();
}