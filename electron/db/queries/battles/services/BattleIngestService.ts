// battles/services/BattleIngestService.ts
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

export function battleIngestService(db: BetterSqlite3.Database, deps: BattleIngestDeps) {
  const { battleRepo, battleLinkService } = deps;

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

    for (const replayId of replayIds) {
      const replayUrl = replayUrlFromId(replayId);
      const replayJsonUrl = replayJsonUrlFromId(replayId);

      try {
        // IMPORTANT: see note below about fetchReplayJson argument
        const json = await fetchReplayJson(replayJsonUrl);

        const { battleId } = ingestReplayJson(db, replayUrl, replayJsonUrl, json);

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