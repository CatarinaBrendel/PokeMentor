PRAGMA foreign_keys = ON;

-- Optional: canonical species/moves/items
CREATE TABLE IF NOT EXISTS species (
  id INTEGER PRIMARY KEY,
  ps_id TEXT UNIQUE,     -- e.g. "gyarados"
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS moves (
  id INTEGER PRIMARY KEY,
  ps_id TEXT UNIQUE,     -- e.g. "waterfall"
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY,
  ps_id TEXT UNIQUE,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS abilities (
  id INTEGER PRIMARY KEY,
  ps_id TEXT UNIQUE,
  name TEXT NOT NULL
);
