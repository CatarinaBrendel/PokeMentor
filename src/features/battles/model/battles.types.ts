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

export type BattleListRow = {
  id: string;
  played_at: number | null;
  team_id: string | null;

  format_id: string | null;
  format_name: string | null;
  is_rated: 0 | 1;
  winner_side: "p1" | "p2" | null;

  user_side: "p1" | "p2" | null;
  opponent_name: string | null;
  result: "win" | "loss" | null;

  brought_json: string | null;

  user_brought_json: string | null;
  user_brought_seen: number | null;
  user_brought_expected: number | null;
  
  opponent_brought_seen: number | null;
  opponent_brought_expected: number | null;
};

export type BattleListItem = {
  id: string;
  playedAtUnix: number | null;
  playedAt: string;
  team_id: string | null;

  result: "win" | "loss" | "unknown";
  opponentName: string;
  format_ps: string | null;
  rated: boolean;

  userSide: "p1" | "p2" | null;

  brought: Array<{ species_name: string; is_lead: boolean }>;

  broughtUserSeen: number | null;
  broughtUserExpected: number | null;
  broughtOpponentSeen: number | null;
  broughtOpponentExpected: number | null;
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

    team_label?: string | null;
    team_version_label?: string | null;
    match_confidence?: number | null;
    match_method?: string | null;
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
  events: Array<{
    event_index: number;
    turn_num: number | null;
    line_type: string;
    raw_line: string;
  }>;
};