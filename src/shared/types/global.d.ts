import { DeleteTeamResult } from "../features/model/teams.types";
import { TeamListRow } from "../features/teams/TeamsView";

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
    __toast?: (message: string, type: "success" | "error") => void,
    api: {
      teams: {
        importPokepaste: (args: ImportTeamArgs) => Promise<ImportTeamResult>;
        listTeams: () => Promise<TeamListRow[]>;
        deleteTeam: (teamId: string) => Promise<DeleteTeamResult>;
        getDetails: (teamId: string) => Promise<TeamDetails>;
        setTeamActive: (teamId: string) => Promise <{ok: true}>
        getActiveSummary: () => Promise<TeamListRow | null>;
        getActiveActivity: () => Promise<ActiveTeamActivity>;
      };
    };
  }
}