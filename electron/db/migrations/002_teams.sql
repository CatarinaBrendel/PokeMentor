CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,                 -- uuid
  name TEXT,                           -- user-friendly name
  format_ps TEXT,                      -- e.g. "gen9vgc2026regf" (optional)
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_teams_is_active ON teams(is_active);

-- One paste/import becomes one "version"
CREATE TABLE IF NOT EXISTS team_versions (
  id TEXT PRIMARY KEY,                 -- uuid
  team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  version_num INTEGER NOT NULL,        -- 1..n
  source_type TEXT NOT NULL,           -- 'pokepaste'
  source_url TEXT,                     -- pokepast.es link
  source_hash TEXT NOT NULL,           -- hash(canonical export text)
  source_text TEXT NOT NULL,           -- the full paste text (for re-parse)
  source_author TEXT,
  source_title TEXT,
  source_format TEXT,
  notes TEXT,
  created_at TEXT NOT NULL,
  UNIQUE(team_id, version_num),
  UNIQUE(team_id, source_hash)
);

-- A set is the Pokémon configuration as it appears in paste:
-- species, item, ability, EVs, IVs, nature, tera, moves...
CREATE TABLE IF NOT EXISTS pokemon_sets (
  id TEXT PRIMARY KEY,                 -- uuid
  nickname TEXT,                       -- optional
  species_name TEXT NOT NULL,          -- store as text now; can backfill species_id later
  species_id INTEGER REFERENCES species(id),

  item_name TEXT,
  item_id INTEGER REFERENCES items(id),

  ability_name TEXT,
  ability_id INTEGER REFERENCES abilities(id),

  level INTEGER,
  gender TEXT,                         -- 'M','F',NULL
  shiny INTEGER,                       -- 0/1
  tera_type TEXT,                      -- Gen9
  happiness INTEGER,

  nature TEXT,                         -- e.g. "Adamant"

  ev_hp INTEGER, ev_atk INTEGER, ev_def INTEGER, ev_spa INTEGER, ev_spd INTEGER, ev_spe INTEGER,
  iv_hp INTEGER, iv_atk INTEGER, iv_def INTEGER, iv_spa INTEGER, iv_spd INTEGER, iv_spe INTEGER,

  -- Helpful to dedupe identical sets across versions/teams if you want:
  set_hash TEXT,                       -- hash(canonical set)
  created_at TEXT NOT NULL
);

-- A version has up to 6 slots (order matters, especially for VGC leads/mindset)
CREATE TABLE IF NOT EXISTS team_slots (
  team_version_id TEXT NOT NULL REFERENCES team_versions(id) ON DELETE CASCADE,
  slot_index INTEGER NOT NULL CHECK(slot_index BETWEEN 1 AND 6),
  pokemon_set_id TEXT NOT NULL REFERENCES pokemon_sets(id),
  PRIMARY KEY (team_version_id, slot_index)
);

CREATE INDEX IF NOT EXISTS idx_team_versions_team ON team_versions(team_id);
CREATE INDEX IF NOT EXISTS idx_team_slots_set ON team_slots(pokemon_set_id);
CREATE INDEX IF NOT EXISTS idx_set_hash ON pokemon_sets(set_hash);

-- Stores Moves in a different table (scalable)
CREATE TABLE IF NOT EXISTS moves (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  UNIQUE(name COLLATE NOCASE)
);

CREATE TABLE IF NOT EXISTS pokemon_set_moves (
  pokemon_set_id TEXT NOT NULL REFERENCES pokemon_sets(id) ON DELETE CASCADE,
  move_slot INTEGER NOT NULL CHECK(move_slot BETWEEN 1 AND 4),
  move_id INTEGER NOT NULL REFERENCES moves(id),
  PRIMARY KEY (pokemon_set_id, move_slot)
);

CREATE INDEX IF NOT EXISTS idx_moves_name_nocase ON moves(name COLLATE NOCASE);
CREATE INDEX IF NOT EXISTS idx_psm_set ON pokemon_set_moves(pokemon_set_id);
CREATE INDEX IF NOT EXISTS idx_psm_move ON pokemon_set_moves(move_id);