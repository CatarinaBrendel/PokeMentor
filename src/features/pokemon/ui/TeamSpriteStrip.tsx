import { getPokemonSpriteUrl } from "../getPokemonSpriteUrl"; // adjust path if needed

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export type TeamSpriteStripItem = {
  species: string;
};

type Props = {
  mons?: TeamSpriteStripItem[] | null;
  max?: number;                 // default 6
  size?: "sm" | "md" | "lg";    // controls icon size
  className?: string;
  showUnknownHint?: boolean;    // default true
};

export default function TeamSpriteStrip({
  mons,
  max = 6,
  size = "sm",
  className,
  showUnknownHint = true,
}: Props) {
  const list = (mons ?? []).slice(0, max);

  const dim =
    size === "sm" ? "h-8 w-8 rounded-2xl" :
    size === "md" ? "h-10 w-10 rounded-2xl" :
    "h-12 w-12 rounded-3xl";

  if (!list.length) return null;

  return (
    <div className={cx("flex items-center gap-2", className)}>
      {list.map((p, idx) => {
        const species = p.species?.trim() || "Unknown";
        const url = getPokemonSpriteUrl(species) || "/sprites/pokemon/0.png";
        const isFallback = url.endsWith("/0.png");

        // Always show the name. Add the hint if desired.
        const title =
          isFallback && showUnknownHint
            ? `${species} — Unknown Pokémon (not parsed yet)`
            : species;

        return (
          <img
            key={`${species}-${idx}`}
            src={url}
            alt={species}          // always keep the name
            title={title}          // always includes the name
            className={cx(
              dim,
              "bg-white/70 ring-1 ring-black/10",
              isFallback && "opacity-50 grayscale"
            )}
            loading="lazy"
            decoding="async"
            onError={(e) => {
              const img = e.currentTarget as HTMLImageElement;
              if (!img.src.endsWith("/0.png")) img.src = "/sprites/pokemon/0.png";
            }}
          />
        );
      })}
    </div>
  );
}