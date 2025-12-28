type EvTrainingRequest = {
  species_name: string;
  nature: string | null;
  evs: { hp: number; atk: number; def: number; spa: number; spd: number; spe: number };
};

type EvTrainingRecipe = {
  stats: Array<{
    stat: string;
    items: Array<{ name: string; count: number }>;
  }>;
  assumptions: string[];
  notes?: string[];
};

const STAT_LABELS = [
  { key: "hp", label: "HP" },
  { key: "atk", label: "Atk" },
  { key: "def", label: "Def" },
  { key: "spa", label: "SpA" },
  { key: "spd", label: "SpD" },
  { key: "spe", label: "Spe" },
] as const;

function targetLine(evs: EvTrainingRequest["evs"]) {
  const parts: string[] = [];
  STAT_LABELS.forEach(({ key, label }) => {
    const value = evs[key];
    if (value > 0) parts.push(`${value} ${label}`);
  });
  return parts.length ? parts.join(" / ") : "No EVs recorded.";
}

function normalizeItems(raw: unknown): Array<{ name: string; count: number }> {
  if (!Array.isArray(raw)) return [];

  const parsed = raw
    .map((item) => {
      if (typeof item === "string") {
        const m = item.match(/^\s*(\d+)\s*x?\s*(.+?)\s*$/i);
        if (!m) return null;
        return { count: Number(m[1]), name: m[2].trim() };
      }

      if (item && typeof item === "object") {
        const obj = item as { name?: unknown; item?: unknown; label?: unknown; count?: unknown; qty?: unknown; quantity?: unknown };
        const name = [obj.name, obj.item, obj.label].find((v) => typeof v === "string") as string | undefined;
        const countRaw = [obj.count, obj.qty, obj.quantity].find((v) => typeof v === "number" || typeof v === "string");
        const count = typeof countRaw === "number" ? countRaw : typeof countRaw === "string" ? Number(countRaw) : NaN;
        if (!name || !Number.isFinite(count)) return null;
        return { name: name.trim(), count: Math.trunc(count) };
      }

      return null;
    })
    .filter(Boolean) as Array<{ name: string; count: number }>;

  return parsed.filter((item) => item.name && item.count > 0);
}

function normalizeRecipe(raw: EvTrainingRecipe): EvTrainingRecipe {
  const stats = Array.isArray(raw.stats)
    ? raw.stats
        .map((stat) => {
          const label = typeof stat?.stat === "string" ? stat.stat.trim() : "";
          const items = normalizeItems(stat?.items);
          return label ? { stat: label, items } : null;
        })
        .filter(Boolean)
    : [];

  const assumptions = Array.isArray(raw.assumptions)
    ? raw.assumptions.filter((s) => typeof s === "string" && s.trim()).map((s) => s.trim())
    : [];

  const notes = Array.isArray(raw.notes)
    ? raw.notes.filter((s) => typeof s === "string" && s.trim()).map((s) => s.trim())
    : undefined;

  return { stats, assumptions, notes };
}

export async function getEvTrainingRecipe({
  apiKey,
  model,
  request,
}: {
  apiKey: string;
  model: string;
  request: EvTrainingRequest;
}): Promise<EvTrainingRecipe> {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://pokementor.local",
      "X-Title": "PokeMentor",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
      max_tokens: 2000,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content:
            "You are a Pokemon EV training assistant. Return JSON only with keys: stats (array of {stat, items}), assumptions (array of strings), notes (optional array). Use stat labels HP, Atk, Def, SpA, SpD, Spe. Items must only be vitamins (HP Up, Protein, Iron, Calcium, Zinc, Carbos) and feathers (Health Feather, Muscle Feather, Resist Feather, Genius Feather, Clever Feather, Swift Feather). Counts are whole numbers.",
        },
        {
          role: "user",
          content: [
            `Pokemon: ${request.species_name}`,
            request.nature ? `Nature: ${request.nature}` : "Nature: unknown",
            `Target EVs: ${targetLine(request.evs)}`,
            "Assumptions: fresh Pokemon (0 EVs), vitamins give +10 EV each, feathers give +1 EV each.",
            "Provide the most efficient mix of vitamins and feathers for each stat.",
          ].join("\n"),
        },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`OpenRouter request failed: ${response.status} ${text}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("OpenRouter response was empty.");
  }

  let parsed: EvTrainingRecipe;
  try {
    parsed = JSON.parse(content) as EvTrainingRecipe;
  } catch (e) {
    const fenced = content.match(/```json\s*([\s\S]*?)\s*```/i);
    const block = fenced?.[1] ?? content;
    const start = block.indexOf("{");
    const end = block.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      try {
        parsed = JSON.parse(block.slice(start, end + 1)) as EvTrainingRecipe;
      } catch (inner) {
        throw new Error("Failed to parse OpenRouter response as JSON.");
      }
    } else {
      throw new Error("Failed to parse OpenRouter response as JSON.");
    }
  }

  if (!Array.isArray(parsed.stats) || !Array.isArray(parsed.assumptions)) {
    throw new Error("OpenRouter response schema invalid.");
  }

  return normalizeRecipe(parsed);
}
