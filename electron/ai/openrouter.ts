type EvTrainingRequest = {
  species_name: string;
  nature: string | null;
  evs: { hp: number; atk: number; def: number; spa: number; spd: number; spe: number };
};

export type EvTrainingRecipe = {
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
      const value = (evs as unknown as Record<string, number>)[key] ?? 0;
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
            const items = normalizeItems((stat as unknown as Record<string, unknown>)?.items);
            return label ? { stat: label, items } : null;
          })
          .filter((s): s is { stat: string; items: Array<{ name: string; count: number }> } => Boolean(s))
      : [];

    const assumptions = Array.isArray(raw.assumptions)
      ? raw.assumptions.filter((s) => typeof s === "string" && s.trim()).map((s) => s.trim())
      : [];

    const notes = Array.isArray(raw.notes)
      ? raw.notes.filter((s) => typeof s === "string" && s.trim()).map((s) => s.trim())
      : undefined;

    return { stats, assumptions, notes };
  }

  // Try to extract EV numbers from free-form assistant reasoning text.
  function parseEvsFromText(text: string): { hp: number; atk: number; def: number; spa: number; spd: number; spe: number } | null {
    if (!text || typeof text !== "string") return null;
    const evs: Record<string, number> = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };

    // Pattern 1: explicit 'Target EVs are 252 Atk, 4 SpD, and 252 Spe' style
    const targetMatch = text.match(/Target EVs are\s*([^.\n]+)/i);
    if (targetMatch && targetMatch[1]) {
      const parts = targetMatch[1].split(/[,;]|\band\b/i).map((p) => p.trim()).filter(Boolean);
      for (const p of parts) {
        const m = p.match(/(\d{1,3})\s*(HP|Atk|Def|SpA|SpD|Spe)/i);
        if (m) {
          const n = Number(m[1]);
          const key = m[2].toLowerCase();
          if (!Number.isNaN(n) && key in evs) evs[key] = n;
        }
      }
    }

    // Pattern 2: generic 'Atk: 252 EVs' or 'Atk 252' occurrences
    const generic = text.matchAll(/(HP|Atk|Def|SpA|SpD|Spe)[:\s-]*?(\d{1,3})/gi);
    for (const m of generic) {
      const keyRaw = m[1];
      const n = Number(m[2]);
      const key = keyRaw.toLowerCase();
      if (!Number.isNaN(n) && key in evs) evs[key] = n;
    }

    // Pattern 3: number before stat like '252 Atk'
    const before = text.matchAll(/(\d{1,3})\s*(HP|Atk|Def|SpA|SpD|Spe)/gi);
    for (const m of before) {
      const n = Number(m[1]);
      const keyRaw = m[2];
      const key = keyRaw.toLowerCase();
      if (!Number.isNaN(n) && key in evs) evs[key] = n;
    }

    const anyNonZero = Object.values(evs).some((v) => v > 0);
    return anyNonZero ? { hp: evs.hp, atk: evs.atk, def: evs.def, spa: evs.spa, spd: evs.spd, spe: evs.spe } : null;
  }

  function buildRecipeFromEvs(evs: { hp: number; atk: number; def: number; spa: number; spd: number; spe: number }): EvTrainingRecipe {
    const statMap: Record<string, { vitamin: string; feather: string }> = {
      hp: { vitamin: "HP Up", feather: "Health Feather" },
      atk: { vitamin: "Protein", feather: "Muscle Feather" },
      def: { vitamin: "Iron", feather: "Resist Feather" },
      spa: { vitamin: "Calcium", feather: "Genius Feather" },
      spd: { vitamin: "Zinc", feather: "Clever Feather" },
      spe: { vitamin: "Carbos", feather: "Swift Feather" },
    };

    const stats: EvTrainingRecipe["stats"] = [];
    for (const s of STAT_LABELS) {
      const key = s.key;
      const val = (evs as unknown as Record<string, number>)[key] ?? 0;
      const vitamins = Math.floor(val / 10);
      const feathers = val - vitamins * 10;
      const items: Array<{ name: string; count: number }> = [];
      if (vitamins > 0) items.push({ name: statMap[key].vitamin, count: vitamins });
      if (feathers > 0) items.push({ name: statMap[key].feather, count: feathers });
      stats.push({ stat: s.label, items });
    }

    const assumptions = [
      "Assumes fresh Pokemon (0 EVs).",
      "Vitamins provide 10 EV each.",
      "Feathers provide +1 EV each.",
    ];
    const notes = ["This recipe was inferred from the assistant reasoning text (StepFun)."];
    return { stats, assumptions, notes };
  }

  export async function getEvTrainingRecipe({ apiKey, model, request }: { apiKey: string; model: string; request: EvTrainingRequest; }): Promise<EvTrainingRecipe> {
    console.info(`[ai] Sending OpenRouter request for ${request.species_name} (model=${model})`);
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

    let dataAny: unknown = null;
    try {
      dataAny = await response.json();
      try {
        const excerpt = JSON.stringify(dataAny).slice(0, 1000);
        console.info(`[ai] OpenRouter response received for ${request.species_name}: ${excerpt}`);
      } catch (_) {
        console.info(`[ai] OpenRouter response received for ${request.species_name} (response not stringifiable)`);
      }
    } catch (e) {
      console.warn("[ai] OpenRouter returned non-json response; using local fallback recipe");
      return computeLocalRecipe(request);
    }

    const extractContentFromChoice = (c: unknown): string | null => {
      if (!c || typeof c !== "object") return null;
      const obj = c as Record<string, unknown>;
      const msg = obj["message"] as Record<string, unknown> | undefined;
      const content = msg?.["content"] as string | undefined;
      if (typeof content === "string") return content;
      const text = obj["text"] as string | undefined;
      if (typeof text === "string") return text;
      const reasoning = (msg?.["reasoning"] as string | undefined) ?? (obj["reasoning"] as string | undefined);
      if (typeof reasoning === "string") return reasoning;
      return null;
    };

    let content: string | null = null;
    const data = dataAny as { choices?: unknown[] } | undefined;
    if (data && Array.isArray(data.choices) && data.choices.length > 0) {
      const first = data.choices[0];
      content = extractContentFromChoice(first);
      if (!content) {
        content = (data.choices.map((c) => extractContentFromChoice(c) ?? "").filter((s) => !!s) as string[]).join("\n");
        if (!content) content = null;
      }
    }

    if (!content) {
      const first = data?.choices?.[0] as Record<string, unknown> | undefined;
      const reasoning = first
        ? (((first["message"] as Record<string, unknown> | undefined)?.["reasoning"] as string | undefined) ?? (first["reasoning"] as string | undefined) ?? null)
        : null;
      if (typeof reasoning === "string" && reasoning.trim()) {
        const evsParsed = parseEvsFromText(reasoning);
        if (evsParsed) {
          try {
            console.info(`[ai] Parsed EVs from reasoning for ${request.species_name}: ${JSON.stringify(evsParsed)}`);
          } catch (_) {
            /* ignore stringify errors */
          }
          return buildRecipeFromEvs(evsParsed);
        }

        try {
          const followupResp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${apiKey}`,
              "Content-Type": "application/json",
              "HTTP-Referer": "https://pokementor.local",
              "X-Title": "PokeMentor",
            },
            body: JSON.stringify({
              model,
              temperature: 0.0,
              max_tokens: 2000,
              messages: [
                { role: "system", content: "You are a JSON-only formatter. Return ONLY valid JSON and nothing else. Wrap the JSON between the markers <<<JSON>>> and <<<END>>>. The JSON should be a single object with keys: stats (array of {stat, items}), assumptions (array of strings), notes (optional array)." },
                { role: "user", content: `Assistant reasoning:\n${reasoning}\n\nReturn ONLY the JSON between <<<JSON>>> and <<<END>>>.` },
              ],
            }),
          });

            if (followupResp.ok) {
            const fdata = await followupResp.json();
            const fchoices = fdata?.choices ?? [];
            const ffirst = fchoices[0];
            const fcontent = extractContentFromChoice(ffirst);
            if (typeof fcontent === "string" && fcontent.trim()) {
              content = fcontent.trim();
              try {
                console.info(`[ai] Follow-up returned content for ${request.species_name} (follow-up)`);
              } catch (_) {
                void 0;
              }
            }
          }
        } catch (err) {
          // ignore follow-up errors and fall back
        }
      }
    }

    if (!content) {
      try {
        const excerpt = JSON.stringify(dataAny).slice(0, 2000);
        console.warn(`[ai] OpenRouter response empty; using local fallback recipe — response excerpt: ${excerpt}`);
      } catch (_) {
        console.warn("[ai] OpenRouter response empty; using local fallback recipe (response could not be stringified)");
      }
      return computeLocalRecipe(request);
    }

    let parsed: EvTrainingRecipe | null = null;
    try {
      const markerMatch = content.match(/<<<JSON>>>([\s\S]*?)<<<END>>>/i);
      const toParse = markerMatch ? markerMatch[1] : content;
      parsed = JSON.parse(toParse) as EvTrainingRecipe;
    } catch (e) {
      const fenced = content.match(/```json\s*([\s\S]*?)\s*```/i);
      const block = fenced?.[1] ?? content;
      const startFence = block.indexOf("{");
      const endFence = block.lastIndexOf("}");
      if (startFence !== -1 && endFence !== -1 && endFence > startFence) {
        const candidate = block.slice(startFence, endFence + 1);
        try {
          parsed = JSON.parse(candidate) as EvTrainingRecipe;
        } catch (_) {
          const s = content.indexOf("{");
          const e = content.lastIndexOf("}");
          if (s !== -1 && e !== -1 && e > s) {
            try {
              parsed = JSON.parse(content.slice(s, e + 1)) as EvTrainingRecipe;
            } catch (__ ) {
              parsed = null;
            }
          }
        }
      } else {
        const s = content.indexOf("{");
        const e = content.lastIndexOf("}");
        if (s !== -1 && e !== -1 && e > s) {
          try {
            parsed = JSON.parse(content.slice(s, e + 1)) as EvTrainingRecipe;
          } catch (_)
          {
            parsed = null;
          }
        }
      }
    }

    if (!parsed || !Array.isArray(parsed.stats) || !Array.isArray(parsed.assumptions)) {
      console.warn("[ai] OpenRouter returned invalid or unparseable schema; using local fallback recipe");
      return computeLocalRecipe(request);
    }

    const normalized = normalizeRecipe(parsed);
    try {
      console.info(`[ai] Parsed recipe from AI for ${request.species_name}: ${JSON.stringify(normalized)}`);
    } catch (_) {
      // ignore stringify errors
    }
    return normalized;
  }


    function computeLocalRecipe(request: EvTrainingRequest): EvTrainingRecipe {
      const statMap: Record<string, { vitamin: string; feather: string }> = {
        hp: { vitamin: "HP Up", feather: "Health Feather" },
        atk: { vitamin: "Protein", feather: "Muscle Feather" },
        def: { vitamin: "Iron", feather: "Resist Feather" },
        spa: { vitamin: "Calcium", feather: "Genius Feather" },
        spd: { vitamin: "Zinc", feather: "Clever Feather" },
        spe: { vitamin: "Carbos", feather: "Swift Feather" },
      };

      const stats: EvTrainingRecipe["stats"] = [];

      for (const s of STAT_LABELS) {
        const key = s.key;
        const ev = (request.evs as unknown as Record<string, number>)[key] ?? 0;
        const vitamins = Math.floor(ev / 10);
        const feathers = ev - vitamins * 10;
        const items: Array<{ name: string; count: number }> = [];
        if (vitamins > 0) items.push({ name: statMap[key].vitamin, count: vitamins });
        if (feathers > 0) items.push({ name: statMap[key].feather, count: feathers });
        stats.push({ stat: s.label, items });
      }

      const assumptions = [
        "Assumes fresh Pokemon (0 EVs).",
        "Vitamins provide 10 EV each.",
        "Feathers provide +1 EV each.",
      ];

      const notes = ["This recipe was generated locally as a fallback when the AI did not return structured JSON."];

      return { stats, assumptions, notes };
    }
