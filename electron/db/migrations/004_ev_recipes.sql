CREATE TABLE IF NOT EXISTS team_ev_recipes (
  team_version_id TEXT NOT NULL REFERENCES team_versions(id) ON DELETE CASCADE,
  pokemon_set_id TEXT NOT NULL REFERENCES pokemon_sets(id),
  source TEXT NOT NULL, -- 'local' or 'ai'
  recipe_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (team_version_id, pokemon_set_id, source)
);

CREATE INDEX IF NOT EXISTS idx_team_ev_recipes_version
ON team_ev_recipes(team_version_id);
