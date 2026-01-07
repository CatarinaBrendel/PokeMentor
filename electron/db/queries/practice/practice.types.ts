export type PracticeTabKey = "mine" | "recommended";
export type PracticeScenarioSource = "battle_review" | "team_drill" | "curated";
export type PracticeScenarioStatus = "draft" | "active" | "archived";
export type PracticeOutcomeRating = "better" | "neutral" | "worse" | "unknown";

export type PracticeSideSnapshot = {
  label: string;
  active: {
    species_name: string;
    hp_percent: number | null;
    item_name: string | null;
    ability_name: string | null;
    moves: Array<{ move_name: string; disabled?: boolean; hint?: string }>;
  } | null;
  bench: Array<{ species_name: string; hp_percent: number | null }>;
};

export type PracticeScenarioDetailsDto = {
  id: string;
  title: string;
  description: string | null;
  source: string;
  status: string;
  format_id: string | null;
  team_name: string | null;
  battle_id: string | null;
  turn_number: number | null;
  tags: string[];

  user_side: PracticeSideSnapshot;
  opponent_side: PracticeSideSnapshot;
};

export type PracticeDecisionSnapshot = {
  turn_number: number;

  user_side: {
    side: "p1" | "p2";
    active: Array<{ position: "p1a"|"p1b"|"p2a"|"p2b"; species_name: string; hp_percent: number | null }>;
    bench: Array<{ species_name: string; hp_percent: number | null; fainted?: boolean }>;
    legal_moves: Array<{ position: "p1a"|"p1b"|"p2a"|"p2b"; moves: Array<{ move_name: string }> }>;
    legal_switches: Array<{ position: "p1a"|"p1b"|"p2a"|"p2b"; switches: Array<{ species_name: string }> }>;
  };

  opponent_side: {
    side: "p1" | "p2";
    active: Array<{ position: "p1a"|"p1b"|"p2a"|"p2b"; species_name: string; hp_percent: number | null }>;
    bench: Array<{ species_name: string; hp_percent: number | null; fainted?: boolean }>;
  };
};