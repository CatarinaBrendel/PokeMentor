PRAGMA foreign_keys = ON;

-- =====================================================================
-- Battles: raw ingestion + primary metadata
-- =====================================================================
CREATE TABLE IF NOT EXISTS battles (
  id TEXT PRIMARY KEY,                         -- uuid
  replay_id TEXT NOT NULL UNIQUE,              -- "gen9vgc2026regfbo3-2481099316"
  replay_url TEXT NOT NULL,                    -- https://replay.pokemonshowdown.com/<replay_id>
  replay_json_url TEXT NOT NULL,               -- replay_url || ".json"

  format_id TEXT,                              -- json.formatid
  format_name TEXT,                            -- json.format
  gen INTEGER,                                 -- from log: |gen|9
  game_type TEXT,                              -- from log: |gametype|doubles

  upload_time INTEGER,                         -- json.uploadtime
  played_at INTEGER,                           -- unix seconds; prefer first |t:| in log
  views INTEGER,                               -- json.views
  rating INTEGER,                              -- json.rating (often p2 rating shown in list)
  is_private INTEGER NOT NULL DEFAULT 0,        -- json.private (0/1)
  is_rated INTEGER NOT NULL DEFAULT 0,          -- presence of |rated| line => 1

  bestof_group_id TEXT,                        -- parsed from |uhtml|bestof| link if you want
  bestof_game_num INTEGER,                     -- "Game 2" -> 2 (optional)
  bestof_total INTEGER,                        -- "best-of-3" -> 3 (optional)

  winner_side TEXT CHECK (winner_side IN ('p1','p2')),
  winner_name TEXT,

  raw_json TEXT NOT NULL,                      -- full JSON payload (stringified)
  raw_log TEXT NOT NULL,                       -- json.log (showdown protocol)

  created_at INTEGER NOT NULL                  -- unix seconds when you stored it
);

CREATE INDEX IF NOT EXISTS idx_battles_formatid  ON battles(format_id);
CREATE INDEX IF NOT EXISTS idx_battles_playedat  ON battles(played_at);
CREATE INDEX IF NOT EXISTS idx_battles_upload    ON battles(upload_time);


-- =====================================================================
-- Sides/Players: one row per side (p1/p2)
-- =====================================================================
CREATE TABLE IF NOT EXISTS battle_sides (
  battle_id TEXT NOT NULL REFERENCES battles(id) ON DELETE CASCADE,
  side TEXT NOT NULL CHECK (side IN ('p1','p2')),
  is_user INTEGER NOT NULL DEFAULT 0,

  player_name TEXT NOT NULL,
  avatar TEXT,                                 -- from |player| line
  rating INTEGER,                               -- from |player| line if present

  PRIMARY KEY (battle_id, side)
);

CREATE INDEX IF NOT EXISTS idx_sides_battle ON battle_sides(battle_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_battle_sides_one_user
ON battle_sides(battle_id)
WHERE is_user = 1;

-- =====================================================================
-- Team preview roster: from |poke| lines (usually 6 per side)
-- =====================================================================
CREATE TABLE IF NOT EXISTS battle_preview_pokemon (
  battle_id TEXT NOT NULL REFERENCES battles(id) ON DELETE CASCADE,
  side TEXT NOT NULL CHECK (side IN ('p1','p2')),
  slot_index INTEGER NOT NULL,                  -- 1..6 in appearance order

  species_name TEXT NOT NULL,                   -- e.g. "Ninetales-Alola"
  level INTEGER,
  gender TEXT CHECK (gender IN ('M','F') OR gender IS NULL),
  shiny INTEGER NOT NULL DEFAULT 0,             -- usually unknown at preview; keep 0/1
  raw_text TEXT,                                -- original "|poke|..." payload for debugging

  PRIMARY KEY (battle_id, side, slot_index)
);

CREATE INDEX IF NOT EXISTS idx_preview_battle_side
ON battle_preview_pokemon(battle_id, side);


-- =====================================================================
-- Revealed sets: from |showteam| (items/abilities/moves/tera)
-- Use one row per species (Showdown showteam is per species).
-- =====================================================================
CREATE TABLE IF NOT EXISTS battle_revealed_sets (
  battle_id TEXT NOT NULL REFERENCES battles(id) ON DELETE CASCADE,
  side TEXT NOT NULL CHECK (side IN ('p1','p2')),
  species_name TEXT NOT NULL,

  nickname TEXT,
  item_name TEXT,
  ability_name TEXT,
  tera_type TEXT,
  level INTEGER,
  gender TEXT CHECK (gender IN ('M','F') OR gender IS NULL),
  shiny INTEGER NOT NULL DEFAULT 0,

  moves_json TEXT NOT NULL DEFAULT '[]',        -- JSON array string
  raw_fragment TEXT,                            -- the per-mon showteam fragment

  PRIMARY KEY (battle_id, side, species_name)
);

CREATE INDEX IF NOT EXISTS idx_revealed_sets_battle_side
ON battle_revealed_sets(battle_id, side);


-- =====================================================================
-- Canonical event stream: every protocol line in order.
-- This is your ground truth for turn-by-turn reconstruction + ML features.
-- =====================================================================
CREATE TABLE IF NOT EXISTS battle_events (
  battle_id TEXT NOT NULL REFERENCES battles(id) ON DELETE CASCADE,

  event_index INTEGER NOT NULL,                 -- 0..N sequential
  turn_num INTEGER,                             -- NULL for pre-game
  t_unix INTEGER,                               -- from |t:| when present

  -- parsed "shape"
  line_type TEXT NOT NULL,                      -- e.g. "move","switch","turn","win","-damage","-boost","poke","showteam", etc.
  raw_line TEXT NOT NULL,                       -- original line including leading "|"

  -- common extracted fields (nullable)
  actor_ref TEXT,                               -- e.g. "p1a", "p2b", "p1", "p2"
  actor_name TEXT,                              -- e.g. "Okidogi" from "p1a: Okidogi"
  target_ref TEXT,
  target_name TEXT,

  move_name TEXT,
  item_name TEXT,
  ability_name TEXT,
  condition_text TEXT,                          -- hp/status strings like "63/100", "0 fnt"
  value_text TEXT,                              -- generic catch-all
  value_num REAL,                               -- generic numeric
  flags_json TEXT NOT NULL DEFAULT '{}',         -- e.g. {"spread":["p1a","p1b"]}

  payload_json TEXT NOT NULL DEFAULT '{}'        -- normalized structured representation (you control)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_events_battle_order
ON battle_events(battle_id, event_index);

CREATE INDEX IF NOT EXISTS idx_events_battle_turn
ON battle_events(battle_id, turn_num, event_index);


-- =====================================================================
-- Pokémon instances: stable IDs per battle side/species (and optionally nickname).
-- You can create these from preview + showteam; later you can enrich with revealed info.
-- =====================================================================
CREATE TABLE IF NOT EXISTS battle_pokemon_instances (
  id TEXT PRIMARY KEY,                          -- uuid
  battle_id TEXT NOT NULL REFERENCES battles(id) ON DELETE CASCADE,
  side TEXT NOT NULL CHECK (side IN ('p1','p2')),

  species_name TEXT NOT NULL,
  nickname TEXT,
  gender TEXT CHECK (gender IN ('M','F') OR gender IS NULL),
  level INTEGER,

  item_known TEXT,
  ability_known TEXT,
  tera_type_known TEXT,
  shiny INTEGER NOT NULL DEFAULT 0,

  -- Link to your stored data if you match a set from your team DB
  matched_set_id TEXT                           -- REFERENCES pokemon_sets(id) if you have it
);

CREATE INDEX IF NOT EXISTS idx_instances_battle_side
ON battle_pokemon_instances(battle_id, side);

CREATE INDEX IF NOT EXISTS idx_instances_battle_species
ON battle_pokemon_instances(battle_id, side, species_name);


-- =====================================================================
-- Derived tables (optional but highly useful for UI + queries)
-- =====================================================================

-- Switch timeline: each |switch| as a row (plus start positions flagged).
CREATE TABLE IF NOT EXISTS battle_switches (
  id TEXT PRIMARY KEY,                          -- uuid
  battle_id TEXT NOT NULL REFERENCES battles(id) ON DELETE CASCADE,

  event_index INTEGER NOT NULL,                 -- ties to battle_events.event_index
  turn_num INTEGER,

  position TEXT NOT NULL CHECK (position IN ('p1a','p1b','p2a','p2b')),
  pokemon_instance_id TEXT NOT NULL REFERENCES battle_pokemon_instances(id) ON DELETE CASCADE,

  hp_text TEXT,                                 -- "63/100"
  status_text TEXT,                             -- "brn" etc.
  is_start INTEGER NOT NULL DEFAULT 0            -- from initial battle start switches
);

CREATE INDEX IF NOT EXISTS idx_switches_battle_order
ON battle_switches(battle_id, event_index);

CREATE INDEX IF NOT EXISTS idx_switches_battle_pos
ON battle_switches(battle_id, position, event_index);


-- Moves: each |move| line normalized.
CREATE TABLE IF NOT EXISTS battle_moves (
  id TEXT PRIMARY KEY,                          -- uuid
  battle_id TEXT NOT NULL REFERENCES battles(id) ON DELETE CASCADE,

  event_index INTEGER NOT NULL,
  turn_num INTEGER NOT NULL,

  actor_ref TEXT,                               -- p1a/p2b etc.
  pokemon_instance_id TEXT REFERENCES battle_pokemon_instances(id) ON DELETE SET NULL,

  move_name TEXT NOT NULL,
  target_ref TEXT,
  target_instance_id TEXT REFERENCES battle_pokemon_instances(id) ON DELETE SET NULL,

  result_json TEXT NOT NULL DEFAULT '{}'         -- outcome details (damage, status, crit, etc.)
);

CREATE INDEX IF NOT EXISTS idx_moves_battle_turn
ON battle_moves(battle_id, turn_num, event_index);


-- “Brought” (VGC): 4 mons actually used. Populate from teamsize/start/switches.
CREATE TABLE IF NOT EXISTS battle_brought_pokemon (
  battle_id TEXT NOT NULL REFERENCES battles(id) ON DELETE CASCADE,
  side TEXT NOT NULL CHECK (side IN ('p1','p2')),
  pokemon_instance_id TEXT NOT NULL REFERENCES battle_pokemon_instances(id) ON DELETE CASCADE,

  is_lead INTEGER NOT NULL DEFAULT 0,            -- inferred from first start positions
  fainted INTEGER NOT NULL DEFAULT 0,            -- inferred from |faint|

  PRIMARY KEY (battle_id, side, pokemon_instance_id)
);

CREATE INDEX IF NOT EXISTS idx_brought_battle_side
ON battle_brought_pokemon(battle_id, side);


-- Link battle side to one of your stored team versions (manual or auto)
CREATE TABLE IF NOT EXISTS battle_team_links (
  battle_id TEXT NOT NULL REFERENCES battles(id) ON DELETE CASCADE,
  side TEXT NOT NULL CHECK (side IN ('p1','p2')),

  team_version_id TEXT REFERENCES team_versions(id) ON DELETE SET NULL,
  match_confidence REAL,
  match_method TEXT,
  matched_at INTEGER,
  matched_by TEXT CHECK (matched_by IN ('auto','user')),

  PRIMARY KEY (battle_id, side)
);

CREATE INDEX IF NOT EXISTS idx_btl_battle       ON battle_team_links(battle_id);
CREATE INDEX IF NOT EXISTS idx_btl_team_version ON battle_team_links(team_version_id);


-- =====================================================================
-- AI Layer: versioned runs + suggestions + predictions + comments
-- =====================================================================
CREATE TABLE IF NOT EXISTS battle_analysis_runs (
  id TEXT PRIMARY KEY,                           -- uuid
  battle_id TEXT NOT NULL REFERENCES battles(id) ON DELETE CASCADE,

  model_name TEXT NOT NULL,                      -- "gpt-4.1", "local-llm-vX"
  model_version TEXT,
  prompt_version TEXT,

  created_at INTEGER NOT NULL,

  status TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok','error','partial')),
  error_text TEXT,

  summary_text TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',       -- global metrics/config/output
  input_hash TEXT,                               -- to dedupe runs
  input_json TEXT,                               -- exact structured input you gave to model (optional)
  parameters_json TEXT NOT NULL DEFAULT '{}'     -- temperature/top_p/etc (optional)
);

CREATE INDEX IF NOT EXISTS idx_analysis_battle_created
ON battle_analysis_runs(battle_id, created_at);


CREATE TABLE IF NOT EXISTS battle_turn_suggestions (
  id TEXT PRIMARY KEY,                           -- uuid
  analysis_run_id TEXT NOT NULL REFERENCES battle_analysis_runs(id) ON DELETE CASCADE,

  turn_num INTEGER NOT NULL,
  side TEXT CHECK (side IN ('p1','p2')),
  position TEXT CHECK (position IN ('p1a','p1b','p2a','p2b')),

  suggestion_type TEXT NOT NULL,                 -- 'move','switch','tera','protect','line'
  suggestion_text TEXT NOT NULL,
  confidence REAL,
  rationale_text TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_suggestions_run_turn
ON battle_turn_suggestions(analysis_run_id, turn_num);


CREATE TABLE IF NOT EXISTS battle_turn_predictions (
  id TEXT PRIMARY KEY,                           -- uuid
  analysis_run_id TEXT NOT NULL REFERENCES battle_analysis_runs(id) ON DELETE CASCADE,

  turn_num INTEGER NOT NULL,
  position TEXT CHECK (position IN ('p1a','p1b','p2a','p2b')),

  predicted_action_json TEXT NOT NULL,           -- {"type":"move","name":"Protect","target":"self"}
  confidence REAL,

  actual_action_json TEXT,                       -- fill after parsing
  was_correct INTEGER                            -- 0/1
);

CREATE INDEX IF NOT EXISTS idx_predictions_run_turn
ON battle_turn_predictions(analysis_run_id, turn_num);


-- Comments that can attach to a battle, a turn, a specific event, a pokemon, or a side.
CREATE TABLE IF NOT EXISTS battle_ai_comments (
  id TEXT PRIMARY KEY,                           -- uuid
  analysis_run_id TEXT NOT NULL REFERENCES battle_analysis_runs(id) ON DELETE CASCADE,

  scope TEXT NOT NULL CHECK (scope IN ('battle','turn','event','pokemon','side')),

  turn_num INTEGER,
  event_index INTEGER,                           -- ties to battle_events.event_index
  side TEXT CHECK (side IN ('p1','p2')),
  position TEXT CHECK (position IN ('p1a','p1b','p2a','p2b')),
  pokemon_instance_id TEXT REFERENCES battle_pokemon_instances(id) ON DELETE SET NULL,

  category TEXT,                                 -- 'mistake','good_play','risk','wincon', etc.
  severity INTEGER,                              -- 1..5
  confidence REAL,

  comment_text TEXT NOT NULL,
  payload_json TEXT NOT NULL DEFAULT '{}',

  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_comments_run
ON battle_ai_comments(analysis_run_id, created_at);

CREATE INDEX IF NOT EXISTS idx_ai_comments_scope
ON battle_ai_comments(scope, turn_num, event_index);


-- Store ranked action candidates (useful for “top-k” move prediction / probabilities).
CREATE TABLE IF NOT EXISTS battle_action_candidates (
  id TEXT PRIMARY KEY,                           -- uuid
  analysis_run_id TEXT NOT NULL REFERENCES battle_analysis_runs(id) ON DELETE CASCADE,

  turn_num INTEGER NOT NULL,
  position TEXT CHECK (position IN ('p1a','p1b','p2a','p2b')),

  rank INTEGER NOT NULL,                          -- 1..N
  action_json TEXT NOT NULL,                      -- {"type":"move","name":"X","target":"Y"}
  probability REAL,                               -- 0..1
  rationale_text TEXT,

  created_at INTEGER NOT NULL,

  UNIQUE (analysis_run_id, turn_num, position, rank)
);

CREATE INDEX IF NOT EXISTS idx_candidates_run_turn
ON battle_action_candidates(analysis_run_id, turn_num);


-- Evaluation metrics for a run (when you score predictions later).
CREATE TABLE IF NOT EXISTS battle_analysis_eval (
  id TEXT PRIMARY KEY,                           -- uuid
  analysis_run_id TEXT NOT NULL REFERENCES battle_analysis_runs(id) ON DELETE CASCADE,

  metric TEXT NOT NULL,                           -- 'top1_accuracy','brier','logloss', etc.
  value REAL NOT NULL,
  details_json TEXT NOT NULL DEFAULT '{}',

  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_eval_run
ON battle_analysis_eval(analysis_run_id, created_at);

-- =====================================================================
-- App Settings
-- =====================================================================

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Helpful index not really needed because PK already indexed.