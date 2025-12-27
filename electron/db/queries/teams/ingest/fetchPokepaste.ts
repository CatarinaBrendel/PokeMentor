// teams/ingest/fetchPokepaste.ts
//
// Fetches Pokepaste content (raw team text + view HTML) with basic safety/normalization.
// - Network only (no DB)
// - No parsing of Showdown sets (that lives elsewhere)
// - No parsing of HTML meta (use parsePokepasteMetaFromHtml)
//
// Expected usage:
//   const { viewUrl, rawUrl } = normalizePokepasteUrl(inputUrl);
//   const { rawText, viewHtml } = await fetchPokepaste({ viewUrl, rawUrl });

export type NormalizedPokepasteUrl = {
  id: string;
  viewUrl: string;
  rawUrl: string;
};

export function normalizePokepasteUrl(url: string): NormalizedPokepasteUrl {
  // Accept:
  // - https://pokepast.es/<id>
  // - https://pokepast.es/<id>/raw
  // - https://pokepast.es/<id>/raw/<anything>
  const m = (url ?? "").trim().match(/^https?:\/\/pokepast\.es\/([a-zA-Z0-9]+)(?:\/.*)?$/);
  if (!m) throw new Error("Invalid Pokepaste URL.");

  const id = m[1];
  return {
    id,
    viewUrl: `https://pokepast.es/${id}`,
    rawUrl: `https://pokepast.es/${id}/raw`,
  };
}

async function fetchText(url: string, timeoutMs = 10_000): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "User-Agent": "PokeMentor/1.0",
        "Accept": "text/html, text/plain;q=0.9, */*;q=0.8",
        "Cache-Control": "no-cache",
      },
    });

    if (!res.ok) {
      throw new Error(`Fetch failed (${res.status}) for ${url}`);
    }
    return await res.text();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(`Failed to fetch ${url}: ${msg}`);
  } finally {
    clearTimeout(t);
  }
}

export type FetchPokepasteArgs = {
  /** Normalized view URL, e.g. https://pokepast.es/<id> */
  viewUrl: string;
  /** Normalized raw URL, e.g. https://pokepast.es/<id>/raw */
  rawUrl: string;
  /** Optional override */
  timeoutMs?: number;
};

export type FetchPokepasteResult = {
  viewUrl: string;
  rawUrl: string;
  rawText: string;
  viewHtml: string;
};

export async function fetchPokepaste(args: FetchPokepasteArgs): Promise<FetchPokepasteResult> {
  const timeoutMs = args.timeoutMs ?? 10_000;

  // Fetch in parallel (simple + fast)
  const [rawText, viewHtml] = await Promise.all([
    fetchText(args.rawUrl, timeoutMs),
    fetchText(args.viewUrl, timeoutMs),
  ]);

  return {
    viewUrl: args.viewUrl,
    rawUrl: args.rawUrl,
    rawText,
    viewHtml,
  };
}