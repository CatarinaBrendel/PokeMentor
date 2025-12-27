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
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20_000);

  try {
    const res = await fetch(jsonUrl, { method: "GET", signal: ctrl.signal });
    if (!res.ok) throw new Error(`Fetch failed (${res.status}) for ${jsonUrl}`);

    const data = (await res.json()) as ShowdownReplayJson;
    if (!data?.id || !data?.log) throw new Error("Unexpected JSON payload (missing id/log)");
    return data;
  } finally {
    clearTimeout(t);
  }
}