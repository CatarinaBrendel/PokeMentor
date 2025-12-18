export type ImportReplaysPayload = { text: string };

export type ImportReplaysResultRow =
  | { input: string; ok: true; replayId: string; battleId: string }
  | { input: string; ok: false; error: string };

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
  events: Array<{
    event_index: number;
    turn_num: number | null;
    line_type: string;
    raw_line: string;
  }>;

};

export type ImportReplaysResult = {
  okCount: number;
  failCount: number;
  rows: ImportReplaysResultRow[];
};

export type BattleListRow = {
  id: string;
  played_at: number | null;          // (or string, depending on what you store)
  format_id: string | null;
  format_name: string | null;
  rated: 0 | 1;
  winner_side: "p1" | "p2" | null;

  user_side: "p1" | "p2" | null;
  user_name: string | null;

  opponentName: string | null;
  result: "win" | "loss" | null;
};
