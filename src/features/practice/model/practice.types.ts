// src/features/practice/model/practice.types.ts

export type PracticeTabKey = "mine" | "recommended";
export type PracticeScenarioSource = "battle_review" | "team_drill" | "curated";
export type PracticeScenarioStatus = "draft" | "active" | "archived";
export type PracticeOutcomeRating = "better" | "neutral" | "worse" | "unknown";
export type PracticeScenarioTag =
  | "lead"
  | "midgame"
  | "endgame"
  | "positioning"
  | "risk"
  | "damage"
  | "resource"
  | "speed_control";

export type PracticeScenarioRow = {
  id: string;
  source: PracticeScenarioSource;
  status: PracticeScenarioStatus;
  title: string;
  subtitle: string | null;

  format_id: string | null;
  team_id: string | null;
  team_version_id: string | null;

  battle_id: string | null;
  turn_number: number | null;

  tags_json: string;
  difficulty: number | null;

  attempts_count: number;
  last_practiced_at: number | null;
  best_rating: PracticeOutcomeRating | null;
};

export type CreatePracticeScenarioFromBattleTurnArgs = {
  battle_id: string;
  turn_number: number;
};

/**
 * Lightweight list item used for the left panel list.
 * Keep this small; details are loaded separately.
 */
export type PracticeScenarioListItem = {
  id: string;

  title: string;
  subtitle?: string | null;

  source: PracticeScenarioSource;
  status: PracticeScenarioStatus;

  // For display + future filtering
  format_id?: string | null; // e.g. "gen9ou", "gen9vgc2025regg"
  team_name?: string | null;

  // Battle-derived scenarios
  battle_id?: string | null;
  turn_number?: number | null;

  // Recommended/curated scenarios
  difficulty?: 1 | 2 | 3 | 4 | 5 | null;

  tags?: PracticeScenarioTag[];

  // Progress signals for the UI header stats
  attempts_count?: number;
  last_practiced_at?: string | null; // ISO string
  best_rating?: PracticeOutcomeRating | null;
};

/**
 * Details shown in the right panel.
 * For MVP, this is still mostly UI fields; later it will contain sim inputs.
 */
export type PracticeScenarioDetails = {
  id: string;

  title: string;
  description?: string | null;

  source: PracticeScenarioSource;
  status: PracticeScenarioStatus;

  format_id?: string | null;
  team_name?: string | null;

  battle_id?: string | null;
  turn_number?: number | null;

  tags?: PracticeScenarioTag[];

  // Optional: used for the “state” presentation in the mockup
  user_side?: PracticeSideSummary | null;
  opponent_side?: PracticeSideSummary | null;

  // Attempts are shown at bottom of details
  attempts?: PracticeAttemptSummary[];
};

export type PracticeSideSummary = {
  label: string; // "PtScan" / "Opponent"
  rating?: number | null; // ladder rating at time (optional)

  active?: PracticeActiveMonSummary | null;
  bench?: PracticeBenchMonSummary[];

  // For VGC (doubles) you may later need 2 actives; keep MVP simple.
};

export type PracticeActiveMonSummary = {
  species_name: string; // "Dragonite"
  nickname?: string | null;

  level?: number | null;

  hp_percent?: number | null; // 0..100 for UI
  status?: string | null; // "brn", "par", etc. (display-only for now)

  item_name?: string | null;
  ability_name?: string | null;

  // For the action buttons in the mockup
  moves?: Array<{
    move_name: string;
    disabled?: boolean;
    hint?: string | null; // e.g. "low roll", "KO chance", etc.
  }>;
};

export type PracticeBenchMonSummary = {
  species_name: string;
  hp_percent?: number | null;
  status?: string | null;
};

export type PracticeAttemptSummary = {
  id: string;

  created_at: string; // ISO
  rating: PracticeOutcomeRating;

  // Freeform, short summary text for the list
  summary?: string | null;

  // Optional numerical deltas for future UI
  ko_for?: number | null;
  ko_against?: number | null;
  hp_delta_percent?: number | null;
};

export type PracticeHeaderStats = {
  scenariosTotal: number;
  successRate: number; // 0..100 (computed)
  lastPracticed: string; // formatted date string for the header
};

export type SelectedAction =
  | { kind: "move"; moveName: string }
  | { kind: "switch"; speciesName: string };

export type PracticeAttemptRow = {
  id: string;
  scenario_id: string;
  created_at: number; // unix seconds
  selected_action_json: string;
  result_json: string;
  rating: PracticeOutcomeRating | null;
  summary: string | null;
  duration_ms: number | null;
  sim_engine: string | null;
  sim_version: string | null;
  notes: string | null;
};

export type SnapshotPosition = "p1a" | "p1b" | "p2a" | "p2b";
export type SnapshotSide = "p1" | "p2";

export type BackendSnapshot = {
  turn_number: number;
  user_side: SnapshotSide;
  opponent_side: SnapshotSide;

  user_active: Array<{
    position: SnapshotPosition;
    species_name: string;
    hp_percent: number | null;
  }>;

  opp_active: Array<{
    position: SnapshotPosition;
    species_name: string;
    hp_percent: number | null;
  }>;

  user_bench: Array<{
    species_name: string;
    hp_percent: number | null;
  }>;

  opp_bench: Array<{
    species_name: string;
    hp_percent: number | null;
  }>;

  legal_moves: Array<{
    position: SnapshotPosition;
    moves: Array<{
      move_name: string;
    }>;
  }>;

  legal_switches: Array<{
    position: SnapshotPosition;
    switches: Array<{
      species_name: string;
    }>;
  }>;
};

export type PracticeDetailsDto = {
  id: string;
  source: PracticeScenarioSource;
  status: PracticeScenarioStatus;
  title: string;
  subtitle: string | null;
  description: string | null;

  format_id: string | null;
  team_id: string | null;
  team_version_id: string | null;

  battle_id: string | null;
  turn_number: number | null;
  user_side: "p1" | "p2" | null;

  tags_json: string;
  difficulty: number | null;

  attempts: Array<{
    id: string;
    created_at: string;
    rating: PracticeOutcomeRating;
    summary: string | null;
  }>;

  snapshot: BackendSnapshot;
};