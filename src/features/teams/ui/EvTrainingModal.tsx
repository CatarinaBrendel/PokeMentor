import * as React from "react";
import Modal from "../../../shared/ui/Modal";
import type { EvRecipeRow, TeamSlotWithSetRow } from "../model/teams.types";
import { AiApi } from "../../ai/api/ai.api";
import { TeamsApi } from "../api/teams.api";
import { SettingsApi } from "../../settings/api/settings.api";

type Props = {
  open: boolean;
  onClose: () => void;
  slots: TeamSlotWithSetRow[];
  teamVersionId?: string | null;
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

function summarizeItems(items: RecipeItem[]) {
  const vitamins: RecipeItem[] = [];
  const feathers: RecipeItem[] = [];

  items.forEach((item) => {
    if (item.count <= 0 || !item.name) return;
    if (/feather/i.test(item.name)) {
      feathers.push(item);
    } else {
      vitamins.push(item);
    }
  });

  return { vitamins, feathers };
}

function parseRecipeRow(row: EvRecipeRow): EvRecipe | null {
  try {
    const parsed = JSON.parse(row.recipe_json) as EvRecipe;
    if (!Array.isArray(parsed.stats) || !Array.isArray(parsed.assumptions)) return null;
    return { ...parsed, source: row.source };
  } catch {
    return null;
  }
}

function hasRecipeItems(recipe?: EvRecipe | null) {
  if (!recipe?.stats?.length) return false;
  return recipe.stats.some((stat) =>
    stat.items?.some((item) => item.count > 0 && item.name)
  );
}

export default function EvTrainingModal({ open, onClose, slots, teamVersionId }: Props) {
  const [selectedId, setSelectedId] = React.useState<string>(
    slots[0]?.pokemon_set_id ?? ""
  );
  const [recipe, setRecipe] = React.useState<EvRecipe | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [showMath, setShowMath] = React.useState(false);
  const [aiEnabled, setAiEnabled] = React.useState(true);
  const [storedRecipes, setStoredRecipes] = React.useState<
    Record<string, { local?: EvRecipe; ai?: EvRecipe }>
  >({});

  const selectedSlot = React.useMemo(
    () => slots.find((slot) => slot.pokemon_set_id === selectedId) ?? slots[0],
    [slots, selectedId]
  );

  React.useEffect(() => {
    if (!open) return;
    if (!selectedSlot) return;
    const stored = storedRecipes[selectedSlot.pokemon_set_id];
    const localFallback = buildLocalRecipe(selectedSlot);
    if (hasRecipeItems(stored?.ai)) {
      setRecipe(stored?.ai ?? localFallback);
      return;
    }
    if (hasRecipeItems(stored?.local)) {
      setRecipe(stored?.local ?? localFallback);
      return;
    }
    setRecipe(localFallback);
    setShowMath(false);
  }, [open, selectedSlot, storedRecipes]);

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;

    async function loadSettings() {
      try {
        const settings = await SettingsApi.get();
        const hasKey = Boolean(settings.openrouter_api_key?.trim());
        if (!cancelled) setAiEnabled(Boolean(settings.ai_enabled ?? true) && hasKey);
      } catch {
        if (!cancelled) setAiEnabled(false);
      }
    }

    loadSettings();

    const onChanged = () => loadSettings();
    window.addEventListener("pm:settings-changed", onChanged);
    return () => {
      cancelled = true;
      window.removeEventListener("pm:settings-changed", onChanged);
    };
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    if (!teamVersionId) return;
    let cancelled = false;

    TeamsApi.getEvRecipes(teamVersionId)
      .then((rows) => {
        if (cancelled) return;
        const next: Record<string, { local?: EvRecipe; ai?: EvRecipe }> = {};
        rows.forEach((row) => {
          const parsed = parseRecipeRow(row);
          if (!parsed) return;
          const existing = next[row.pokemon_set_id] ?? {};
          if (row.source === "ai") existing.ai = parsed;
          if (row.source === "local") existing.local = parsed;
          next[row.pokemon_set_id] = existing;
        });
        setStoredRecipes(next);
      })
      .catch(() => {
        if (!cancelled) setStoredRecipes({});
      });

    return () => {
      cancelled = true;
    };
  }, [open, teamVersionId]);

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
      const next = { ...aiRecipe, source: "ai" };
      setRecipe(next);
      if (teamVersionId) {
        await TeamsApi.saveEvRecipe({
          team_version_id: teamVersionId,
          pokemon_set_id: selectedSlot.pokemon_set_id,
          source: "ai",
          recipe_json: JSON.stringify(next),
        });
        setStoredRecipes((prev) => ({
          ...prev,
          [selectedSlot.pokemon_set_id]: {
            ...prev[selectedSlot.pokemon_set_id],
            ai: next,
          },
        }));
      }
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
  const explainText =
    recipe?.notes?.join(" ").trim() ||
    "Each vitamin grants +10 EV. Feathers add +1 EV for fine tuning. The mix above targets the exact EV spread shown.";
  const aiDisabled = !aiEnabled;

  return (
    <Modal open={open} onClose={onClose} maxWidthClassName="max-w-3xl">
      <div className="max-h-[80vh] overflow-y-auto pr-1">
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
                {recipe.stats
                  .map((stat) => {
                  const { vitamins, feathers } = summarizeItems(stat.items);
                  const allItems = [...vitamins, ...feathers];
                  if (!allItems.length) return null;
                  return (
                    <div key={stat.stat}>
                      <div className="text-sm font-semibold text-dust-800">{stat.stat}</div>
                      <div className="mt-2 space-y-2 text-sm text-dust-700">
                        <div className="rounded-2xl bg-white/70 px-3 py-2 ring-1 ring-black/5">
                          <div className="font-medium">
                            {allItems.map((item) => `${item.count}x ${item.name}`).join(", ")}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })
                  .filter(Boolean)}
                {recipe.stats.every((stat) => summarizeItems(stat.items).vitamins.length === 0 &&
                  summarizeItems(stat.items).feathers.length === 0) ? (
                  <div className="text-sm text-dust-500">No EV recipe available.</div>
                ) : null}
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

      {showMath ? (
        <div className="mt-4 rounded-2xl bg-dust-100 px-4 py-3 text-sm text-dust-700">
          {explainText}
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
          disabled={loading || aiDisabled}
          title={aiDisabled ? "No AI Activated" : undefined}
          className="rounded-2xl bg-fern-700 px-4 py-2 text-sm font-semibold text-dust-50 ring-1 ring-black/10 hover:bg-fern-500 disabled:cursor-not-allowed disabled:bg-black/10 disabled:text-black/40"
        >
          {loading ? "Asking AI…" : "Ask AI to adjust"}
        </button>
      </div>
      </div>
    </Modal>
  );
}
