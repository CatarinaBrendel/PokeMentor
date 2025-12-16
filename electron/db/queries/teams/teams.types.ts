export type TeamListRow = {
  id: string;
  name: string | null;
  format_ps: string | null;
  updated_at: string;
  latest_version_num: number | null;
};

export type CreateTeamArgs = {
  id: string;
  name: string | null;
  format_ps: string | null;
  now: string;
};

export type CreateTeamVersionArgs = {
  id: string; // version_id
  team_id: string;
  version_num: number;
  source_url: string;
  source_hash: string;
  source_text: string;
  source_title: string | null;
  source_author: string | null;
  source_format: string | null;
  now: string;
};

export type CreatePokemonSetArgs = {
  id: string;
  nickname: string | null;
  species_name: string;
  item_name: string | null;
  ability_name: string | null;
  level: number | null;
  gender: "M" | "F" | null;
  shiny: 0 | 1;
  tera_type: string | null;
  happiness: number | null;
  nature: string | null;

  ev_hp: number | null; ev_atk: number | null; ev_def: number | null;
  ev_spa: number | null; ev_spd: number | null; ev_spe: number | null;

  iv_hp: number | null; iv_atk: number | null; iv_def: number | null;
  iv_spa: number | null; iv_spd: number | null; iv_spe: number | null;

  set_hash: string;
  now: string;
};

export type TeamHeaderRow = {
  id: string;
  name: string | null;
  format_ps: string | null;
  created_at: string;
  updated_at: string;
};

export type TeamVersionRow = {
  id: string;
  team_id: string;
  version_num: number;
  source_type: string;
  source_url: string | null;
  source_hash: string;
  source_title: string | null;
  source_author: string | null;
  source_format: string | null;
  created_at: string;
};

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

  moves: string[]; // NEW
};

export type TeamDetails = {
  team: TeamHeaderRow;
  latestVersion: TeamVersionRow | null;
  slots: TeamSlotWithSetRow[];
};



