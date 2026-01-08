PRAGMA foreign_keys = ON;

-- =====================================================================
-- Practice Scenarios: user-specific drills derived from battles/teams
-- =====================================================================

CREATE TABLE IF NOT EXISTS practice_scenarios (
  id TEXT PRIMARY KEY,                              -- uuid

  -- provenance
  source TEXT NOT NULL CHECK (
    source IN ('battle_review','team_drill','curated','manual')
  ),

  status TEXT NOT NULL DEFAULT 'active' CHECK (
    status IN ('active','draft','archived')
  ),

  -- user-facing fields
  title TEXT NOT NULL,
  subtitle TEXT,
  description TEXT,

  -- context (nullable depending on source)
  format_id TEXT,                                   -- e.g. "gen9ou"
  team_id TEXT REFERENCES teams(id) ON DELETE SET NULL,
  team_version_id TEXT REFERENCES team_versions(id) ON DELETE SET NULL,

  battle_id TEXT REFERENCES battles(id) ON DELETE SET NULL,
  turn_number INTEGER,                              -- decision turn for battle-derived scenarios
  user_side TEXT CHECK (user_side IN ('p1','p2') OR user_side IS NULL),  -- optional: inferred user side at creation time

  -- lightweight organization fields (JSON so we can iterate without extra tables)
  tags_json TEXT NOT NULL DEFAULT '[]',             -- JSON array string
  difficulty INTEGER,                               -- 1..5 (optional)

  -- denormalized “list view” stats (kept up to date by app logic)
  attempts_count INTEGER NOT NULL DEFAULT 0,
  last_practiced_at INTEGER,                        -- unix seconds
  best_rating TEXT CHECK (best_rating IN ('worse','neutral','better') OR best_rating IS NULL),

  -- optional cached simulator/request snapshot (to avoid replaying logs every open)
  -- you can store a minimized object with: active/bench, legal moves, volatiles, field, etc.
  snapshot_json TEXT NOT NULL DEFAULT '{}',
  snapshot_hash TEXT,                               -- optional: hash of inputs that produced snapshot
  snapshot_created_at INTEGER,                      -- unix seconds

  created_at INTEGER NOT NULL,                      -- unix seconds
  updated_at INTEGER NOT NULL                       -- unix seconds
);

-- Prevent accidental duplicate scenarios for the same battle+turn+source.
-- This directly fixes “double card” issues even if the renderer inserts twice.
CREATE UNIQUE INDEX IF NOT EXISTS ux_practice_scenarios_source_battle_turn
ON practice_scenarios(source, battle_id, turn_number)
WHERE battle_id IS NOT NULL AND turn_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_practice_scenarios_status
ON practice_scenarios(status);

CREATE INDEX IF NOT EXISTS idx_practice_scenarios_source
ON practice_scenarios(source);

CREATE INDEX IF NOT EXISTS idx_practice_scenarios_battle
ON practice_scenarios(battle_id, turn_number);

CREATE INDEX IF NOT EXISTS idx_practice_scenarios_teamver
ON practice_scenarios(team_version_id);

CREATE INDEX IF NOT EXISTS idx_practice_scenarios_last_practiced
ON practice_scenarios(last_practiced_at);


-- =====================================================================
-- Practice Attempts: one row per run of a scenario
-- =====================================================================

CREATE TABLE IF NOT EXISTS practice_attempts (
  id TEXT PRIMARY KEY,                              -- uuid
  scenario_id TEXT NOT NULL REFERENCES practice_scenarios(id) ON DELETE CASCADE,

  created_at INTEGER NOT NULL,                      -- unix seconds

  -- What the user chose: { kind: "move", moveName } or { kind: "switch", speciesName }
  selected_action_json TEXT NOT NULL DEFAULT '{}',

  -- What happened (sim delta / summary payload). Keep flexible.
  result_json TEXT NOT NULL DEFAULT '{}',

  -- Optional quick-summary fields for list/history UX
  rating TEXT CHECK (rating IN ('worse','neutral','better') OR rating IS NULL),
  summary TEXT,

  -- Optional performance tracking
  duration_ms INTEGER,
  sim_engine TEXT,                                  -- e.g. "@pkmn/sim"
  sim_version TEXT,                                 -- optional
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_practice_attempts_scenario_time
ON practice_attempts(scenario_id, created_at);


-- =====================================================================
-- (Optional future) You can add triggers later to keep attempts_count,
-- last_practiced_at, best_rating in sync automatically.
-- For now, update these fields from app code to keep things explicit.
-- =====================================================================