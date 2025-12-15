// electron/db/queries/teams.ts
import type { TeamInput, TeamRow } from "../../../shared/ipc";
import { getDb } from "../index";
import crypto from "node:crypto";

function uuid() {
  return crypto.randomUUID();
}

export function listTeams(): TeamRow[] {
  const db = getDb();

  return db
    .prepare(
      `
      SELECT id, name, format_ps, created_at, updated_at
      FROM teams
      ORDER BY updated_at DESC
      `
    )
    .all() as TeamRow[];
}

export function insertTeam(team: TeamInput): string {
  const db = getDb();

  const id = uuid();
  const now = new Date().toISOString();

  db.prepare(
    `
    INSERT INTO teams (id, name, format_ps, created_at, updated_at)
    VALUES (@id, @name, @format_ps, @created_at, @updated_at)
    `
  ).run({
    id,
    name: team.name ?? null,
    format_ps: team.formatPs ?? null,
    created_at: now,
    updated_at: now,
  });

  // Optional (but recommended): also store an initial team_version
  // If you already created team_versions in migrations, uncomment this:
  //
  // const sourceHash = crypto
  //   .createHash("sha256")
  //   .update(team.sourceText, "utf8")
  //   .digest("hex");
  //
  // db.prepare(
  //   `
  //   INSERT INTO team_versions (
  //     id, team_id, version_num, source_type, source_url, source_hash, source_text, notes, created_at
  //   )
  //   VALUES (@id, @team_id, 1, 'pokepaste', @source_url, @source_hash, @source_text, @notes, @created_at)
  //   `
  // ).run({
  //   id: uuid(),
  //   team_id: id,
  //   source_url: team.sourceUrl,
  //   source_hash: sourceHash,
  //   source_text: team.sourceText,
  //   notes: team.notes ?? null,
  //   created_at: now,
  // });

  return id;
}