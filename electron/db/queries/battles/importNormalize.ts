const BASE = "https://replay.pokemonshowdown.com";

export function normalizeReplayInput(line: string): { replayId: string; replayUrl: string; jsonUrl: string } {
  const raw = line.trim();
  if (!raw) throw new Error("Empty line");

  // Case 1: full URL
  if (raw.startsWith("http://") || raw.startsWith("https://")) {
    const u = new URL(raw);
    // Expect /<replay_id> or /<replay_id>.json
    const path = u.pathname.replace(/^\//, "");
    const replayId = path.replace(/\.json$/, "");
    if (!replayId) throw new Error("Could not extract replay id from URL");
    const replayUrl = `${BASE}/${replayId}`;
    return { replayId, replayUrl, jsonUrl: `${replayUrl}.json` };
  }

  // Case 2: replay id only
  // e.g. gen9vgc2026regfbo3-2481099316-wqlui...
  const replayId = raw.replace(/\.json$/, "");
  const replayUrl = `${BASE}/${replayId}`;
  return { replayId, replayUrl, jsonUrl: `${replayUrl}.json` };
}