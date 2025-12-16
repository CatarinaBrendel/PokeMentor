// src/features/teams/teams.types.ts

export type TeamSummary = {
  id: string;
  name: string | null;
  format_ps: string | null;
  updated_at: string;
  latest_version_num: number | null;
};

export type ImportTeamArgs = {
  url: string;
  name?: string;
  format_ps?: string;
};

export type ImportTeamResult = {
  team_id: string;
  version_id: string;
  version_num: number;
  slots_inserted: number;
};

export type DeleteTeamResult = { ok: true}

// Header info from teams table
export type TeamHeaderRow = {
  id: string;
  name: string | null;
  format_ps: string | null;
  created_at: string;
  updated_at: string;
};

// Latest version info from team_versions
export type TeamVersionRow = {
  id: string;
  team_id: string;
  version_num: number;

  source_type: string;        // 'pokepaste'
  source_url: string | null;
  source_hash: string;
  source_text: string;

  source_title: string | null;
  source_author: string | null;
  source_format: string | null;

  notes: string | null;
  created_at: string;
};

// The pokemon_set payload you want to show in UI
export type TeamSlotWithSetRow = {
  slot_index: number;
  pokemon_set_id: string;

  nickname: string | null;
  species_name: string;
  item_name: string | null;
  ability_name: string | null;

  level: number | null;
  gender: string | null;
  shiny: number;
  tera_type: string | null;
  happiness: number | null;
  nature: string | null;

  ev_hp: number | null; ev_atk: number | null; ev_def: number | null;
  ev_spa: number | null; ev_spd: number | null; ev_spe: number | null;

  iv_hp: number | null; iv_atk: number | null; iv_def: number | null;
  iv_spa: number | null; iv_spd: number | null; iv_spe: number | null;

  moves: string[];
};

// The payload returned by db:teams:getDetails
export type TeamDetails = {
  team: TeamHeaderRow
  latestVersion: TeamVersionRow | null;   // null if no versions exist
  slots: TeamSlotWithSetRow[];            // empty if no version
};