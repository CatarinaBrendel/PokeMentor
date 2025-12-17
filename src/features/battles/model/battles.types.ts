/** Minimal sprite strip item used by UI components. */
export type SpeciesRef = {
  species: string;
};

/** Active team display in the filter bar/header. */
export type ActiveTeamSummary = {
  name: string;
  formatLabel?: string;
  versionLabel?: string;
};

/** Payload you’ll paste in the modal (placeholder now, DB later). */
export type ImportReplaysPayload = {
  text: string; // multiline: URLs and/or IDs
};

/** A battle side / player row (SQLite “battle_sides”). */
export type BattleSideRow = {
  battle_id: string;
  side: "p1" | "p2";
  player_name: string;
  avatar: string | null;
  rating: number | null;
};

/**
 * Helper: your UI wants "win/loss" + opponentName, but DB stores winner_side.
 * Once you have “local player side” or “your account name”, you can map reliably.
 */
export type BattlePerspective = {
  mySide?: "p1" | "p2";
  myPlayerName?: string;
};

export type ImportReplaysArgs = {
  text: string; // multiline input (URLs or replay IDs)
};

export type ImportReplaysRowResult =
  | { input: string; ok: true; replayId: string; battleId: string }
  | { input: string; ok: false; error: string };

export type ImportReplaysResult = {
  okCount: number;
  failCount: number;
  rows: ImportReplaysRowResult[];
};

export type BattleDbRow = {
  id: string;
  played_at: number | null;
  format_id: string | null;
  format_name: string | null;
  is_rated: 0 | 1;
  winner_side: "p1" | "p2" | null;
  p1_name: string | null;
  p2_name: string | null;
};

export type BattleListItem = {
  id: string;
  playedAt: string; // formatted string for UI
  result: "win" | "loss";
  opponentName: string | null;
  format_ps?: string | null;
  rated?: boolean;
  teamLabel?: string | null;
  teamVersionLabel?: string | null;
  matchConfidence?: number | null;
  matchMethod?: string | null;
  brought?: Array<{ species: string; iconText?: string }>;
};

export type BattleListRow = {
  id: string;
  played_at: number | null; // unix seconds
  format_id: string | null;
  format_name: string | null;
  is_rated: 0 | 1;
  winner_side: "p1" | "p2" | null;

  // convenience for UI
  p1_name: string | null;
  p2_name: string | null;
  opponent_name: string | null; // computed for “your side” later, can be null for now
  result: "win" | "loss" | null;
};

export type BattleDetailsDto = {
  battle: {
    id: string;
    replay_url: string;
    replay_id: string;
    format_id: string | null;
    format_name: string | null;
    played_at: number | null;
    is_rated: 0 | 1;
    winner_side: "p1" | "p2" | null;
  };
  sides: Array<{
    side: "p1" | "p2";
    is_user: 0 | 1;
    player_name: string;
    avatar: string | null;
    rating: number | null;
  }>;
  preview: Array<{
    side: "p1" | "p2";
    slot_index: number;
    species_name: string;
  }>;
  revealed: Array<{
    side: "p1" | "p2";
    species_name: string;
    nickname: string | null;
    item_name: string | null;
    ability_name: string | null;
    tera_type: string | null;
    moves: string[]; // parsed from moves_json
  }>;
};

export function battleListRowToItem(row: BattleListRow): BattleListItem {
  const playedAt =
    row.played_at != null ? new Date(row.played_at * 1000).toLocaleDateString() : "—";

  const opponentName = row.opponent_name?.trim() || "Unknown";

  const result: "win" | "loss" = row.result === "win" ? "win" : "loss";

  return {
    id: row.id,
    playedAt,
    result,
    opponentName,
    format_ps: row.format_id ?? row.format_name ?? null,
    rated: row.is_rated === 1,
    teamLabel: null,
    teamVersionLabel: null,
    matchConfidence: null,
    matchMethod: null,
    brought: [],
  };
}