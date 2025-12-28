import * as React from "react";
import Modal from "../../../shared/ui/Modal";
import type { TeamSlotWithSetRow } from "../model/teams.types";
import { AiApi } from "../../ai/api/ai.api";

type Props = {
  open: boolean;
  onClose: () => void;
  slots: TeamSlotWithSetRow[];
};

type RecipeItem = {
  name: string;
  count: number;
};

type StatRecipe = {
  stat: string;
  items: RecipeItem[];
};

type EvRecipe = {
  stats: StatRecipe[];
  assumptions: string[];
  notes?: string[];
  source: "local" | "ai";
};

type StatDef = {
  key: keyof Pick<
    TeamSlotWithSetRow,
    "ev_hp" | "ev_atk" | "ev_def" | "ev_spa" | "ev_spd" | "ev_spe"
  >;
  label: string;
  vitamin: string;
  feather: string;
};

const STAT_DEFS: StatDef[] = [
  { key: "ev_hp", label: "HP", vitamin: "HP Up", feather: "Health Feather" },
  { key: "ev_atk", label: "Atk", vitamin: "Protein", feather: "Muscle Feather" },
  { key: "ev_def", label: "Def", vitamin: "Iron", feather: "Resist Feather" },
  { key: "ev_spa", label: "SpA", vitamin: "Calcium", feather: "Genius Feather" },
  { key: "ev_spd", label: "SpD", vitamin: "Zinc", feather: "Clever Feather" },
  { key: "ev_spe", label: "Spe", vitamin: "Carbos", feather: "Swift Feather" },
];

function toast(message: string, type: "success" | "error") {
  window.__toast?.(message, type);
}

function toTargetLine(slot: TeamSlotWithSetRow) {
  const parts: string[] = [];
  STAT_DEFS.forEach((stat) => {
    const value = slot[stat.key];
    if (typeof value === "number" && value > 0) {
      parts.push(`${value} ${stat.label}`);
    }
  });
  return parts.length ? parts.join(" / ") : "No EVs recorded.";
}

function buildLocalRecipe(slot: TeamSlotWithSetRow): EvRecipe {
  const stats: StatRecipe[] = [];

  STAT_DEFS.forEach((stat) => {
    const value = slot[stat.key] ?? 0;
    if (!value) return;

    const vitamins = Math.floor(value / 10);
    const feathers = value - vitamins * 10;
    const items: RecipeItem[] = [];

    if (vitamins > 0) items.push({ name: stat.vitamin, count: vitamins });
    if (feathers > 0) items.push({ name: stat.feather, count: feathers });

    stats.push({ stat: stat.label, items });
  });

  return {
    stats,
    assumptions: [
      "Assumes fresh Pokemon (0 EVs).",
      "Vitamins provide 10 EV each.",
      "Feathers are used for +1 EV precision.",
    ],
    source: "local",
  };
}

function recipeToText(recipe: EvRecipe, slot: TeamSlotWithSetRow) {
  const header = `${slot.species_name}${slot.nature ? ` — ${slot.nature} Nature` : ""}`;
  const target = `Target EVs: ${toTargetLine(slot)}`;
  const lines = [header, target, ""];

  recipe.stats.forEach((stat) => {
    lines.push(`${stat.stat}`);
    stat.items.forEach((item) => lines.push(`- ${item.count}x ${item.name}`));
    lines.push("");
  });

  if (recipe.assumptions.length) {
    lines.push("Assumptions:");
    recipe.assumptions.forEach((assumption) => lines.push(`- ${assumption}`));
  }

  return lines.join("\n").trim();
}

export default function EvTrainingModal({ open, onClose, slots }: Props) {
  const [selectedId, setSelectedId] = React.useState<string>(
    slots[0]?.pokemon_set_id ?? ""
  );
  const [recipe, setRecipe] = React.useState<EvRecipe | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [showMath, setShowMath] = React.useState(false);

  const selectedSlot = React.useMemo(
    () => slots.find((slot) => slot.pokemon_set_id === selectedId) ?? slots[0],
    [slots, selectedId]
  );

  React.useEffect(() => {
    if (!open) return;
    if (!selectedSlot) return;
    setRecipe(buildLocalRecipe(selectedSlot));
    setShowMath(false);
  }, [open, selectedSlot]);

  async function onAskAi() {
    if (!selectedSlot) return;
    setLoading(true);
    try {
      const aiRecipe = await AiApi.getEvTrainingRecipe({
        species_name: selectedSlot.species_name,
        nature: selectedSlot.nature,
        evs: {
          hp: selectedSlot.ev_hp ?? 0,
          atk: selectedSlot.ev_atk ?? 0,
          def: selectedSlot.ev_def ?? 0,
          spa: selectedSlot.ev_spa ?? 0,
          spd: selectedSlot.ev_spd ?? 0,
          spe: selectedSlot.ev_spe ?? 0,
        },
      });
      setRecipe({ ...aiRecipe, source: "ai" });
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to fetch AI recipe.", "error");
    } finally {
      setLoading(false);
    }
  }

  async function onCopyRecipe() {
    if (!recipe || !selectedSlot) return;
    await navigator.clipboard.writeText(recipeToText(recipe, selectedSlot));
    toast("Recipe copied to clipboard.", "success");
  }

  if (!selectedSlot) return null;

  return (
    <Modal open={open} onClose={onClose} maxWidthClassName="max-w-3xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm font-semibold text-dust-500">EV Training Recipe</div>
          <div className="mt-2 text-2xl font-semibold text-dust-900">
            {selectedSlot.species_name}
            {selectedSlot.nature ? ` — ${selectedSlot.nature} Nature` : ""}
          </div>
          <div className="mt-2 text-sm text-dust-600">
            Target EVs: {toTargetLine(selectedSlot)}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="rounded-full bg-sage-100 px-3 py-1 text-xs font-semibold text-sage-700 ring-1 ring-black/5">
            {recipe?.source === "ai" ? "AI-assisted" : "Smart recipe"}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="grid h-8 w-8 place-items-center rounded-full text-dust-500 hover:bg-dust-100/80 hover:text-dust-700 focus:outline-none focus:ring-2 focus:ring-fern-500/40"
          >
            <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
              <path
                d="M6 6l8 8M14 6l-8 8"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      </div>

      <div className="mt-5">
        <label className="text-xs font-medium text-dust-600" htmlFor="ev-recipe-slot">
          Pokemon
        </label>
        <div className="relative mt-2">
          <select
            id="ev-recipe-slot"
            value={selectedId}
            onChange={(e) => setSelectedId(e.target.value)}
            className="h-10 w-full appearance-none rounded-2xl bg-white/70 pl-3 pr-10 text-sm ring-1 ring-black/10 focus:outline-none focus:ring-2 focus:ring-fern-500/40"
          >
            {slots.map((slot) => (
              <option key={slot.pokemon_set_id} value={slot.pokemon_set_id}>
                {slot.slot_index}. {slot.nickname ?? slot.species_name}
              </option>
            ))}
          </select>
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-dust-500">
            <svg viewBox="0 0 20 20" fill="none" className="h-4 w-4">
              <path
                d="M6 8l4 4 4-4"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </span>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_240px]">
        <div className="rounded-3xl bg-white/70 p-4 ring-1 ring-black/10">
          {recipe?.stats.length ? (
            <div className="space-y-4">
              {recipe.stats.map((stat) => (
                <div key={stat.stat}>
                  <div className="text-sm font-semibold text-dust-800">{stat.stat}</div>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-dust-700">
                    {stat.items.map((item) => (
                      <li key={`${stat.stat}-${item.name}`}>
                        {item.count}x {item.name}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-sm text-dust-500">No EV recipe available.</div>
          )}
        </div>

        <div className="rounded-3xl bg-sage-50 p-4 ring-1 ring-black/5">
          <div className="text-sm font-semibold text-sage-800">Assumptions</div>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-sage-700">
            {(recipe?.assumptions ?? []).map((assumption) => (
              <li key={assumption}>{assumption}</li>
            ))}
          </ul>
        </div>
      </div>

      {recipe?.notes?.length ? (
        <div className="mt-4 rounded-2xl bg-dust-100 px-4 py-3 text-sm text-dust-700">
          {recipe.notes.join(" ")}
        </div>
      ) : null}

      {showMath ? (
        <div className="mt-4 rounded-2xl bg-dust-100 px-4 py-3 text-sm text-dust-700">
          Each vitamin grants +10 EV. Feathers add +1 EV for fine tuning. The mix above targets
          the exact EV spread shown.
        </div>
      ) : null}

      <div className="mt-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-4 text-sm text-dust-600">
          <button type="button" onClick={onCopyRecipe} className="hover:text-dust-900">
            Copy recipe
          </button>
          <button
            type="button"
            onClick={() => setShowMath((prev) => !prev)}
            className="hover:text-dust-900"
          >
            {showMath ? "Hide math" : "Explain math"}
          </button>
        </div>

        <button
          type="button"
          onClick={onAskAi}
          disabled={loading}
          className="rounded-2xl bg-fern-700 px-4 py-2 text-sm font-semibold text-dust-50 ring-1 ring-black/10 hover:bg-fern-500 disabled:cursor-not-allowed disabled:bg-black/10 disabled:text-black/40"
        >
          {loading ? "Asking AI…" : "Ask AI to adjust"}
        </button>
      </div>
    </Modal>
  );
}
