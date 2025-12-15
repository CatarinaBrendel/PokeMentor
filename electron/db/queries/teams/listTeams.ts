import { getDb } from "../../../db/index";
import { teamsQueries } from "../teams/teams";
import type { TeamListRow } from "../../queries/teams/teams.types";

export function listTeams(): TeamListRow[] {
  const db = getDb();
  return teamsQueries(db).listTeams();
}