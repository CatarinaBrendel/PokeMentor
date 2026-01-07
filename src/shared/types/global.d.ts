import { BattleDetailsDto } from "../../features/battles/model/battles.types";
import type { BattleListItem } from "../../features/battles/model/battles.types";
import type {
  ActiveTeamActivity,
  DeleteTeamResult,
  ImportTeamPreview,
  TeamDetails,
} from "../../features/teams/model/teams.types";
import type { TeamListRow } from "../../features/teams/ui/TeamsView";
import type { DashboardKpis } from "../../features/dashboard/model/dashboard.types";
import type { PracticeScenarioRow, CreatePracticeScenarioFromBattleTurnArgs } from "../../features/practice/model/practice.api.types";
import type { PracticeScenarioDetails } from "../../features/practice/model/practice.types";

export {};

type ImportTeamArgs = {
  url?: string;
  name?: string;
  format_ps?: string;
  paste_text?: string;
};

type ImportTeamResult = {
  team_id: string;
  version_id: string;
  version_num: number;
  slots_inserted: number;
};

type EvRecipeRow = {
  team_version_id: string;
  pokemon_set_id: string;
  source: "local" | "ai";
  recipe_json: string;
  updated_at: string;
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

type PracticeScenarioRow = {
  id: string;
  source: "battle_review" | "team_drill" | "curated" | "manual";
  status: "active" | "draft" | "archived";

  title: string;
  subtitle: string | null;
  description?: string | null;

  format_id: string | null;
  team_id: string | null;
  team_version_id: string | null;

  battle_id: string | null;
  turn_number: number | null;
  user_side?: "p1" | "p2" | null;

  tags_json: string;
  difficulty: number | null;

  attempts_count: number;
  last_practiced_at: number | null;
  best_rating: "worse" | "neutral" | "better" | null;

  // optional fields may exist depending on your SELECT *
  snapshot_json?: string;
  snapshot_hash?: string | null;
  snapshot_created_at?: number | null;

  created_at?: number;
  updated_at?: number;
};

type CreatePracticeScenarioFromBattleTurnArgs = {
  battle_id: string;
  turn_number: number;
};

declare global {
  interface Window {
    __toast?: (message: string, type: "success" | "error") => void,
    api: {
      teams: {
        importPokepaste: (args: ImportTeamArgs) => Promise<ImportTeamResult>;
        previewPokepaste: (args: ImportTeamArgs) => Promise<ImportTeamPreview>;
        getEvRecipes: (teamVersionId: string) => Promise<EvRecipeRow[]>;
        saveEvRecipe: (args: {
          team_version_id: string;
          pokemon_set_id: string;
          source: "local" | "ai";
          recipe_json: string;
        }) => Promise<void>;
        listTeams: () => Promise<TeamListRow[]>;
        deleteTeam: (teamId: string) => Promise<DeleteTeamResult>;
        getDetails: (teamId: string) => Promise<TeamDetails>;
        setTeamActive: (teamId: string) => Promise <{ok: true}>
        getActiveSummary: () => Promise<TeamListRow | null>;
        getActiveActivity: () => Promise<ActiveTeamActivity>;
      };
      battles: {
        importReplays: (args: ImportReplaysArgs) => Promise<ImportReplaysResult>;
        list: (args?: { limit?: number; offset?: number }) => Promise<BattleListItem[]>;
        getDetails: (battleID: string) => Promise<BattleDetailsDto>
      };
      settings: {
        get: () => Promise<{
          showdown_username: string | null;
          openrouter_api_key: string | null;
          openrouter_model: string | null;
          ai_enabled: boolean;
        }>;
        update: (args: {
          showdown_username?: string;
          openrouter_api_key?: string;
          openrouter_model?: string;
          ai_enabled?: boolean;
        }) => Promise<{
          showdown_username: string | null;
          openrouter_api_key: string | null;
          openrouter_model: string | null;
          ai_enabled: boolean;
        }>;
      };
      ai: {
        getEvTrainingRecipe: (args: EvTrainingRequest) => Promise<EvTrainingRecipe>;
      };
      dashboard: {
        getKpis: () => Promise<DashboardKpis>;
      };
      practice: {
        listMyScenarios: () => Promise<PracticeScenarioRow[]>;
        createFromBattleTurn: (
          args: CreatePracticeScenarioFromBattleTurnArgs
        ) => Promise<PracticeScenarioRow>;
        getScenario: (id: string) => Promise<PracticeScenarioRow | null>;
        getDetails: (id: string) => Promise<PracticeScenarioDetails>
      };
    };
  }
}
