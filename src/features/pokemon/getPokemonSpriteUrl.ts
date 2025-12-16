import { SPECIES_TO_DEX_ID } from "./speciesIndex";
import { normalizeSpeciesName } from "./normalizeSpecies";

export function getPokemonSpriteUrl(speciesName: string): string {
  const slug = normalizeSpeciesName(speciesName);
  const id = SPECIES_TO_DEX_ID[slug];
  return id ? `/sprites/pokemon/${id}.png` : "/sprites/pokemon/0.png";
}