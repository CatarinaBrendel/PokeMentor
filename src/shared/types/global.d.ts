import { BattleDetailsDto } from "../../features/battles/model/battles.types";
import type {
  ActiveTeamActivity,
  DeleteTeamResult,
  TeamDetails,
} from "../../features/teams/model/teams.types";
import type { TeamListRow } from "../../features/teams/ui/TeamsView";

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

type EvTrainingRequest = {
  species_name: string;
  nature: string | null;
  evs: { hp: number; atk: number; def: number; spa: number; spd: number; spe: number };
};

type EvTrainingRecipe = {
  stats: Array<{
    stat: string;
    items: Array<{ name: string; count: number }>;
  }>;
  assumptions: string[];
  notes?: string[];
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
        get: () => Promise<{
          showdown_username: string | null;
          grok_api_key: string | null;
          grok_model: string | null;
        }>;
        update: (args: {
          showdown_username?: string;
          grok_api_key?: string;
          grok_model?: string;
        }) => Promise<{
          showdown_username: string | null;
          grok_api_key: string | null;
          grok_model: string | null;
        }>;
      };
      ai: {
        getEvTrainingRecipe: (args: EvTrainingRequest) => Promise<EvTrainingRecipe>;
      };
    };
  }
}
