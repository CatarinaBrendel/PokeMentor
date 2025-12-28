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

export async function getEvTrainingRecipe({
  apiKey,
  model,
  request,
}: {
  apiKey: string;
  model: string;
  request: EvTrainingRequest;
}): Promise<EvTrainingRecipe> {
  const response = await fetch("https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
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
            "Assumptions: fresh Pokemon (0 EVs), vitamins give +10 EV each, feathers give +1 EV each, no PokeRus or Power Items.",
            "Provide the most efficient mix of vitamins and feathers for each stat.",
          ].join("\n"),
        },
      ],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Grok request failed: ${response.status} ${text}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Grok response was empty.");
  }

  let parsed: EvTrainingRecipe;
  try {
    parsed = JSON.parse(content) as EvTrainingRecipe;
  } catch (e) {
    throw new Error("Failed to parse Grok response as JSON.");
  }

  if (!Array.isArray(parsed.stats) || !Array.isArray(parsed.assumptions)) {
    throw new Error("Grok response schema invalid.");
  }

  return parsed;
}
