// teams/repo/teamVersions.repo.ts
import type BetterSqlite3 from "better-sqlite3";

export function teamVersionsRepo(db: BetterSqlite3.Database) {
  return {
    findByTeamAndSourceHash(teamId: string, sourceHash: string) {
      return db.prepare(`
        SELECT id, version_num
        FROM team_versions
        WHERE team_id = ? AND source_hash = ?
      `).get(teamId, sourceHash) as { id: string; version_num: number } | undefined;
    },

    nextVersionNum(teamId: string) {
      const row = db.prepare(`
        SELECT COALESCE(MAX(version_num), 0) AS maxv
        FROM team_versions
        WHERE team_id = ?
      `).get(teamId) as { maxv: number };
      return (row?.maxv ?? 0) + 1;
    },

    insertVersion(args: {
      id: string;
      team_id: string;
      version_num: number;
      source_type: string;
      source_url?: string | null;
      source_hash: string;
      source_text: string;
      source_author?: string | null;
      source_title?: string | null;
      source_format?: string | null;
      notes?: string | null;
      created_at: string;
    }) {
      db.prepare(`
        INSERT INTO team_versions (
          id, team_id, version_num,
          source_type, source_url, source_hash, source_text,
          source_author, source_title, source_format, notes,
          created_at
        ) VALUES (
          @id, @team_id, @version_num,
          @source_type, @source_url, @source_hash, @source_text,
          @source_author, @source_title, @source_format, @notes,
          @created_at
        )
      `).run(args);
    },
  };
}