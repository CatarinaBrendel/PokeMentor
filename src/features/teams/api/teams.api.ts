import type { ImportTeamArgs, DeleteTeamResult, TeamDetails } from "../model/teams.types";

export const TeamsApi = {
  importPokepaste: (args: ImportTeamArgs) =>
    window.api.teams.importPokepaste(args),

  listTeams: () =>
    window.api.teams.listTeams(),

deleteTeam: (teamId: string): Promise<DeleteTeamResult> =>
    window.api.teams.deleteTeam(teamId),

getDetails: (teamId: string) =>
    window.api.teams.getDetails(teamId) as Promise<TeamDetails>,
};