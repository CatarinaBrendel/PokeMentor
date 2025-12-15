export {};

type ImportTeamArgs = {
  url: string;
  name?: string;
  format_ps?: string;
};

type ImportTeamResult = {
  team_id: string;
  team_version_id: string;
  version_num: number;
  slots_inserted: number;
};

declare global {
  interface Window {
    api: {
      teams: {
        importPokepaste: (args: ImportTeamArgs) => Promise<ImportTeamResult>;
        // add more endpoints here as you expose them
      };
    };
  }
}