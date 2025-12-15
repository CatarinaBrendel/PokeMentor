// electron/db/queries/teams/deleteTeam.ts
import { getDb } from "../../index";
import { teamsQueries } from "./teams";

export function deleteTeam(teamId: string) {
  const db = getDb();
  const q = teamsQueries(db);
  q.deleteTeam(teamId);
  return { ok: true };
}