import type { ImportTeamArgs, ImportTeamPreview, DeleteTeamResult, TeamDetails, TeamListRow, ActiveTeamActivity } from "../model/teams.types";

export const TeamsApi = {
  importPokepaste: (args: ImportTeamArgs) =>
    window.api.teams.importPokepaste(args),
  previewPokepaste: (args: ImportTeamArgs) =>
    window.api.teams.previewPokepaste(args) as Promise<ImportTeamPreview>,
  getEvRecipes: (teamVersionId: string) =>
    window.api.teams.getEvRecipes(teamVersionId),
  saveEvRecipe: (args: { team_version_id: string; pokemon_set_id: string; source: "local" | "ai"; recipe_json: string }) =>
    window.api.teams.saveEvRecipe(args),

  listTeams: () =>
    window.api.teams.listTeams(),

  deleteTeam: (teamId: string): Promise<DeleteTeamResult> =>
    window.api.teams.deleteTeam(teamId),

  getDetails: (teamId: string) =>
    window.api.teams.getDetails(teamId) as Promise<TeamDetails>,

  setTeamActive: (teamId: string): Promise<{ ok: true }> =>
    window.api.teams.setTeamActive(teamId),

  getActiveSummary: (): Promise<TeamListRow | null> =>
    window.api.teams.getActiveSummary(),

  getActiveActivity: () => window.api.teams.getActiveActivity() as Promise<ActiveTeamActivity>,

};
