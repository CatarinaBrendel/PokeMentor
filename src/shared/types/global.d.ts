import { BattleDetailsDto } from "../../features/battles/model/battles.types";
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
  version_id: string;
  version_num: number;
  slots_inserted: number;
};

type ImportReplaysArgs = { text: string };

type ImportReplaysResult = {
  okCount: number;
  failCount: number;
  rows: Array<
    | { input: string; ok: true; replayId: string; battleId: string }
    | { input: string; ok: false; error: string }
  >;
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
      battles: {
        importReplays: (args: ImportReplaysArgs) => Promise<ImportReplaysResult>;
        list: (args?: { limit?: number; offset?: number }) => Promise<any>;
        getDetails: (battleID: string) => Promise<BattleDetailsDto>
      };
      settings: {
        get: () => Promise<{ showdown_username: string | null }>;
        update: (args: { showdown_username?: string }) => Promise<{ showdown_username: string | null }>;
      };
    };
  }
}