import { getPokemonSpriteUrl } from "../../pokemon/getPokemonSpriteUrl";

type Props = {
  species: string[];
  selected?: string | null;
  onSelect?: (s: string) => void;
  view?: "grid" | "list";
};

export default function SpeciesGrid({ species, selected, onSelect, view = "grid" }: Props) {
  const colsClass = view === "grid" ? "grid-cols-6" : "grid-cols-1";

  return (
    <div className="">
      <div className={`grid ${colsClass} gap-3`}>
        {species.map((s) => {
          const sprite = getPokemonSpriteUrl(s);
          const isSelected = selected === s;

          return (
            <button
              key={s}
              onClick={() => onSelect?.(s)}
              className={`flex flex-col items-center gap-2 rounded-xl p-3 bg-white/5 border border-white/6 hover:bg-white/6 transition text-center ${
                isSelected ? "ring-2 ring-offset-2 ring-white/30" : ""
              }`}
              title={s}
            >
              <div className="h-16 w-16 flex items-center justify-center">
                <img src={sprite} alt={s} className="h-14 w-14 object-contain" />
              </div>
              <div className="text-xs truncate w-full mt-1">{s}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
