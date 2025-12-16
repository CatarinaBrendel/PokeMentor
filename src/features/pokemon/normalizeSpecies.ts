export function normalizeSpeciesName(input: string): string {
  return input
    .toLowerCase()
    .replace(/['’.]/g, "")     // remove apostrophes
    .replace(/♀/g, "-f")
    .replace(/♂/g, "-m")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}