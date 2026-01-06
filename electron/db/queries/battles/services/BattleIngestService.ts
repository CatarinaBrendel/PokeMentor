// battles/services/BattleIngestService.ts
import crypto from "node:crypto";
import type BetterSqlite3 from "better-sqlite3";
import type { BattleRepo } from "../repo/battleRepo";
import type { BattleLinkServiceApi } from "./BattleLinkService";

import { fetchReplayJson } from "../ingest/fetchReplayJson";
import { ingestReplayJson } from "../ingest/ingestReplayJson";

export type BattleIngestDeps = {
  battleRepo: BattleRepo;
  battleLinkService: BattleLinkServiceApi;
};

export type ImportFromReplaysTextResult = {
  okCount: number;
  failCount: number;
  rows: Array<
    | { input: string; ok: true; replayId: string; battleId: string }
    | { input: string; ok: false; error: string }
  >;
};

function extractReplayId(input: string): string | null {
  const s = input.trim();
  if (!s) return null;

  const m =
    s.match(/replay\.pokemonshowdown\.com\/([a-z0-9]+-\d+)(?:\.json)?/i) ??
    s.match(/^([a-z0-9]+-\d+)$/i);

  return m?.[1] ?? null;
}

function replayUrlFromId(id: string): string {
  return `https://replay.pokemonshowdown.com/${id}`;
}

function replayJsonUrlFromId(id: string): string {
  return `https://replay.pokemonshowdown.com/${id}.json`;
}

function nowUnix(): number {
  return Math.floor(Date.now() / 1000);
}

function uuid(): string {
  return crypto.randomUUID();
}

function computeBatchSetKey(battleIds: string[]): string {
  const sorted = [...battleIds].sort();
  const hash = crypto.createHash("sha1").update(sorted.join(",")).digest("hex");
  return `batch:${hash}`;
}

function prepareSetStatements(db: BetterSqlite3.Database) {
  return {
    // Create or touch a set. We update updated_at on conflict so repeated imports refresh it.
    upsertSetByKey: db.prepare(`
      INSERT INTO battle_sets (
        id, set_key,
        format_id, format_name,
        player1_name, player2_name,
        source,
        created_at, updated_at
      ) VALUES (
        @id, @set_key,
        @format_id, @format_name,
        @player1_name, @player2_name,
        @source,
        @created_at, @updated_at
      )
      ON CONFLICT(set_key) DO UPDATE SET
        format_id   = excluded.format_id,
        format_name = excluded.format_name,
        player1_name = COALESCE(excluded.player1_name, battle_sets.player1_name),
        player2_name = COALESCE(excluded.player2_name, battle_sets.player2_name),
        source      = battle_sets.source, -- don't overwrite "manual" with "import-batch"
        updated_at  = excluded.updated_at
    `),

    readSetIdByKey: db.prepare(`
      SELECT id
      FROM battle_sets
      WHERE set_key = ?
      LIMIT 1
    `),

    upsertSetGame: db.prepare(`
      INSERT INTO battle_set_games (set_id, battle_id, game_number, total_games)
      VALUES (@set_id, @battle_id, @game_number, @total_games)
      ON CONFLICT(set_id, battle_id) DO UPDATE SET
        game_number = excluded.game_number,
        total_games = excluded.total_games
    `),
  };
}

export function battleIngestService(db: BetterSqlite3.Database, deps: BattleIngestDeps) {
  const { battleRepo, battleLinkService } = deps;

  const setStmts = prepareSetStatements(db);

  function createOrUpdateBatchSet(args: {
    battleIdsInOrder: string[];
    // Use the first battle as a “representative” for format metadata if you want.
    formatId?: string | null;
    formatName?: string | null;
    // Optional: if you later want to store normalized players at set-level, you can pass them here.
    player1Name?: string | null;
    player2Name?: string | null;
  }): string {
    const now = nowUnix();
    const setKey = computeBatchSetKey(args.battleIdsInOrder);

    const existing = setStmts.readSetIdByKey.get(setKey) as { id: string } | undefined;
    const setId = existing?.id ?? uuid();

    setStmts.upsertSetByKey.run({
      id: setId,
      set_key: setKey,
      format_id: args.formatId ?? null,
      format_name: args.formatName ?? null,
      player1_name: args.player1Name ?? null,
      player2_name: args.player2Name ?? null,
      source: "import-batch",
      created_at: now,
      updated_at: now,
    });

    // Ensure we use the canonical set id in case of conflict.
    const row = setStmts.readSetIdByKey.get(setKey) as { id: string } | undefined;
    return row?.id ?? setId;
  }

  function attachBattlesToSet(args: { setId: string; battleIdsInOrder: string[] }): void {
    const total = args.battleIdsInOrder.length;

    for (let i = 0; i < args.battleIdsInOrder.length; i++) {
      setStmts.upsertSetGame.run({
        set_id: args.setId,
        battle_id: args.battleIdsInOrder[i],
        game_number: i + 1,
        total_games: total,
      });
    }
  }

  async function importFromReplaysText(text: string): Promise<ImportFromReplaysTextResult> {
    const inputs = text
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);

    const rows: ImportFromReplaysTextResult["rows"] = [];

    // de-dupe ids, preserve order
    const seen = new Set<string>();
    const replayIds: string[] = [];

    for (const raw of inputs) {
      const id = extractReplayId(raw);
      if (!id) {
        rows.push({ input: raw, ok: false, error: "Unrecognized replay URL / id." });
        continue;
      }
      const k = id.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      replayIds.push(id);
    }

    // Keep track of successfully imported battleIds in the same order as inputs.
    const importedBattleIds: string[] = [];
    let representativeMeta: { formatId: string | null; formatName: string | null } | null = null;

    for (const replayId of replayIds) {
      const replayUrl = replayUrlFromId(replayId);
      const replayJsonUrl = replayJsonUrlFromId(replayId);

      try {
        const json = await fetchReplayJson(replayJsonUrl);

        // NEW signature: pass battleRepo so ingestion is idempotent.
        const { battleId } = ingestReplayJson(db, battleRepo, replayUrl, replayJsonUrl, json);

        importedBattleIds.push(battleId);

        // Use the first imported battle as representative for set metadata.
        if (!representativeMeta) {
          representativeMeta = {
            formatId: json.formatid ?? null,
            formatName: json.format ?? null,
          };
        }

        const meta = battleRepo.getBattleMeta(battleId);
        battleLinkService.autoLinkBattleForUserSide({
          battleId,
          formatKeyHint: meta?.formatKey ?? null,
        });

        rows.push({ input: replayUrl, ok: true, replayId, battleId });
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        rows.push({ input: replayUrl, ok: false, error: msg });
      }
    }

    // If user imported 2–3+ replays at once, group them as a set.
    // Policy: group only successful imports; if fewer than 2 succeed, do nothing.
    if (importedBattleIds.length >= 2) {
      // Wrap set creation + linking in a transaction for consistency.
      db.transaction(() => {
        const setId = createOrUpdateBatchSet({
          battleIdsInOrder: importedBattleIds,
          formatId: representativeMeta?.formatId ?? null,
          formatName: representativeMeta?.formatName ?? null,
        });

        attachBattlesToSet({ setId, battleIdsInOrder: importedBattleIds });

        // Optional: mirror to battles.bestof_* columns for convenience.
        // If you want this, add a prepared statement in BattleRepo and do it there.
        // For now, relationship is authoritative via battle_set_games.
      })();
    }

    const okCount = rows.filter((r) => r.ok).length;
    const failCount = rows.length - okCount;
    return { okCount, failCount, rows };
  }

  function relinkBattle(battleId: string): { ok: true } {
    const meta = battleRepo.getBattleMeta(battleId);
    battleLinkService.autoLinkBattleForUserSide({
      battleId,
      formatKeyHint: meta?.formatKey ?? null,
    });
    return { ok: true };
  }

  return {
    importFromReplaysText,
    relinkBattle,
  };
}