import { getDb } from "../../index"; // adjust if your db entry differs
import { normalizeReplayInput } from "./importNormalize";
import { fetchReplayJson } from "./fetchReplayJson";
import { ingestReplayJson } from "./ingestBattles";

export async function importBattlesFromReplaysText(args: { text: string }) {
  const db = getDb();

  const inputs = Array.from(
    new Set(
      args.text
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean)
    )
  );
  const rows: Array<
    | { input: string; ok: true; replayId: string; battleId: string }
    | { input: string; ok: false; error: string }
  > = [];

  let okCount = 0;
  let failCount = 0;

  for (const input of inputs) {
    try {
      const { replayId, replayUrl, jsonUrl } = normalizeReplayInput(input);

      // already imported?
      const existing = db
        .prepare("SELECT id FROM battles WHERE replay_id = ?")
        .get(replayId) as { id: string } | undefined;

      if (existing?.id) {
        rows.push({ input, ok: true, replayId, battleId: existing.id });
        okCount += 1;
        continue;
      }

      const json = await fetchReplayJson(jsonUrl);

      const tx = db.transaction(() => {
        const { battleId } = ingestReplayJson(db, replayUrl, jsonUrl, json);
        return battleId;
      });

      const battleId = tx();

      rows.push({ input, ok: true, replayId, battleId });
      okCount += 1;
    } catch (e) {
      rows.push({ input, ok: false, error: e instanceof Error ? e.message : String(e) });
      failCount += 1;
    }
  }

  return { okCount, failCount, rows };
}