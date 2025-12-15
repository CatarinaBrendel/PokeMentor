// shared/ipc.ts
export type TeamInput = {
  name?: string;
  formatPs?: string;     // e.g. "gen9vgc2026regf"
  sourceUrl: string;     // pokepaste URL
  sourceText: string;    // raw paste text
  notes?: string;
};

export type TeamInsertResult = { ok: true; id: string };

export type TeamRow = {
  id: string;
  name: string | null;
  format_ps: string | null;
  created_at: string;
  updated_at: string;
};