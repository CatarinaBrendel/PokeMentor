/**
 * Normalizes a Pokémon Showdown username into a comparable identifier.
 * Roughly equivalent to Showdown's `toID` logic.
 */
export function normalizeShowdownName(name: string | null | undefined): string {
  if (!name) return "";

  // Strip common auth / rank prefixes
  const trimmed = name.trim().replace(/^[@☆★+%~*&]+/, "");

  // Canonical ID: lowercase, alphanumeric only
  const id = trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "");

  // Fallback for edge cases (e.g. unicode-only names)
  return id || trimmed.toLowerCase().replace(/\s+/g, "");
}