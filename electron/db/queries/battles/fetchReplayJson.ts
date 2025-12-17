export type ShowdownReplayJson = {
  id: string;
  format?: string;
  formatid?: string;
  players?: string[];
  log?: string;
  uploadtime?: number;
  views?: number;
  rating?: number;
  private?: number;
  password?: string;
};

export async function fetchReplayJson(jsonUrl: string): Promise<ShowdownReplayJson> {
  const res = await fetch(jsonUrl, { method: "GET" });
  if (!res.ok) throw new Error(`Fetch failed (${res.status})`);
  const data = (await res.json()) as ShowdownReplayJson;
  if (!data?.id || !data?.log) throw new Error("Unexpected JSON payload (missing id/log)");
  return data;
}