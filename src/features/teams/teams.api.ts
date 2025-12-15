export type ImportTeamArgs = { url: string; name?: string; format_ps?: string };
export type ImportTeamResult = {
  team_id: string;
  team_version_id: string;
  version_num: number;
  slots_inserted: number;
  source_url: string;
};

export const TeamsApi = {
  importPokepaste: (args: ImportTeamArgs) =>
    window.api.teams.importPokepaste(args) as Promise<ImportTeamResult>,
};