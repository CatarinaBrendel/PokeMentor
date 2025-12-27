// teams/ingest/parsePokepasteMeta.ts
//
// Extracts lightweight metadata (title/author/format) from a Pokepaste HTML page.
// - No network
// - No DB
// - Pure string parsing
//
// Expected usage:
//   const meta = parsePokepasteMetaFromHtml(viewHtml);

export type PokepasteMeta = {
  title: string | null;
  author: string | null;
  format: string | null;
};

function decodeHtml(s: string) {
  // Keep intentionally minimal; expand if you encounter more entities.
  return s
    .replace("&nbsp;", " ")
    .replace("&amp;", "&")
    .replace("&lt;", "<")
    .replace("&gt;", ">")
    .replace("&quot;", '"')
    .replace("&#39;", "'");
}

function stripTags(s: string) {
  return decodeHtml(s.replace(/<[^>]*>/g, "")).replace(/\s+/g, " ").trim();
}

/**
 * Attempts to parse meta from the `<aside>...</aside>` block (where Pokepaste usually places it).
 * Falls back to searching the whole HTML if no aside is present.
 */
export function parsePokepasteMetaFromHtml(html: string): PokepasteMeta {
  const asideMatch = (html ?? "").match(/<aside\b[^>]*>([\s\S]*?)<\/aside>/i);
  const scope = asideMatch?.[1] ?? (html ?? "");

  const title = (() => {
    const m = scope.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
    return m ? stripTags(m[1]) : null;
  })();

  const author = (() => {
    const m = scope.match(/<h2\b[^>]*>([\s\S]*?)<\/h2>/i);
    if (!m) return null;
    const t = stripTags(m[1]);
    return t.replace(/^by\s+/i, "").trim() || null;
  })();

  const format = (() => {
    // Pokepaste often renders: <p>Format: VGC 2025 Reg ...</p>
    const m = scope.match(/<p\b[^>]*>\s*Format:\s*([^<]+)\s*<\/p>/i);
    return m ? stripTags(m[1]) : null;
  })();

  return { title, author, format };
}