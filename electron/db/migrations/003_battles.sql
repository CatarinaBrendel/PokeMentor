CREATE TABLE IF NOT EXISTS battles (
  id TEXT PRIMARY KEY,                 -- uuid
  replay_id TEXT NOT NULL UNIQUE,      -- e.g. "gen9vgc2026regfbo3-2481099316-wqlu..."
  replay_url TEXT NOT NULL,            -- normalized base URL (no ?p2)
  replay_json_url TEXT NOT NULL,       -- replay_url + ".json"
  format_ps TEXT,                      -- from replay id/prefix if you want
  played_at TEXT,                      -- from replay json if available
  rated INTEGER,                       -- 0/1 if present
  p1_name TEXT,
  p2_name TEXT,
  winner_name TEXT,

  -- Store raw JSON to allow re-parsing later
  raw_json TEXT NOT NULL,

  -- Optional: if you also store the .log text later:
  raw_log TEXT,

  created_at TEXT NOT NULL
);

-- Attach the "known" team version used by the user (if we can match)
-- If your user can have multiple teams, you can store the chosen team here.
CREATE TABLE IF NOT EXISTS battle_team_links (
  battle_id TEXT NOT NULL REFERENCES battles(id) ON DELETE CASCADE,
  side TEXT NOT NULL CHECK(side IN ('p1','p2')),
  team_version_id TEXT REFERENCES team_versions(id),
  match_confidence REAL,               -- 0..1 if you do fuzzy matching
  match_method TEXT,                   -- 'exact-hash','species-only','manual'
  PRIMARY KEY (battle_id, side)
);

-- Players table per battle (useful for CSV and later coaching)
CREATE TABLE IF NOT EXISTS battle_players (
  id TEXT PRIMARY KEY,                 -- uuid
  battle_id TEXT NOT NULL REFERENCES battles(id) ON DELETE CASCADE,
  side TEXT NOT NULL CHECK(side IN ('p1','p2')),
  name TEXT NOT NULL,
  rating INTEGER,
  UNIQUE(battle_id, side)
);

-- The Pokémon shown/used by a player in this battle.
-- For VGC you can store "brought" 4 and maybe "leads" etc.
CREATE TABLE IF NOT EXISTS battle_player_pokemon (
  id TEXT PRIMARY KEY,                 -- uuid
  battle_player_id TEXT NOT NULL REFERENCES battle_players(id) ON DELETE CASCADE,

  slot_index INTEGER,                  -- 1..6 as shown in team preview if available
  species_name TEXT NOT NULL,
  item_name TEXT,
  ability_name TEXT,
  tera_type TEXT,
  level INTEGER,
  shiny INTEGER,

  -- If you can parse it:
  brought INTEGER,                     -- 0/1 (VGC)
  lead INTEGER,                        -- 0/1
  fainted INTEGER,                     -- 0/1

  -- Link to an existing pokemon_set if you match it
  matched_set_id TEXT REFERENCES pokemon_sets(id),

  UNIQUE(battle_player_id, slot_index, species_name)
);

CREATE INDEX IF NOT EXISTS idx_battle_players_battle ON battle_players(battle_id);
CREATE INDEX IF NOT EXISTS idx_bpp_player ON battle_player_pokemon(battle_player_id);