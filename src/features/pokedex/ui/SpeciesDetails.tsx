  import React from "react";
  import { getPokemonSpriteUrl } from "../../pokemon/getPokemonSpriteUrl";

  type Props = { speciesName?: string | null };

  type DexSpecies = {
    baseStats?: { hp?: number; atk?: number; def?: number; spa?: number; spd?: number; spe?: number };
    types?: string[];
    abilities?: Record<string, string> | string[];
    gen?: number;
    _raw?: unknown;
  };

  function mockStats(name: string) {
    let sum = 0;
    for (let i = 0; i < name.length; i++) sum += name.charCodeAt(i);
    const base = (sum % 50) + 50;
    return {
      hp: Math.round(base * 1.1),
      atk: Math.round(base * 1.05),
      def: Math.round(base * 0.95),
      spa: Math.round(base * 1.0),
      spd: Math.round(base * 0.9),
      spe: Math.round((base % 80) + 40),
    };
  }

  const TYPE_COLORS: Record<string, string> = {
    normal: '#A8A77A',
    fire: '#EE8130',
    water: '#6390F0',
    electric: '#F7D02C',
    grass: '#7AC74C',
    ice: '#96D9D6',
    fighting: '#C22E28',
    poison: '#A33EA1',
    ground: '#E2BF65',
    flying: '#A98FF3',
    psychic: '#F95587',
    bug: '#A6B91A',
    rock: '#B6A136',
    ghost: '#735797',
    dragon: '#6F35FC',
    dark: '#705746',
    steel: '#B7B7CE',
    fairy: '#D685AD',
  };

  function getTypeColor(typeName?: string) {
    if (!typeName) return '#000000';
    const key = String(typeName).toLowerCase();
    return TYPE_COLORS[key] ?? '#777777';
  }

  function normalizeTypeValue(v: unknown) {
    if (typeof v === 'string') return v;
    if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      return String(o.name ?? o.type ?? o['0'] ?? JSON.stringify(v));
    }
    return String(v ?? '');
  }

  export default function SpeciesDetails({ speciesName }: Props) {
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [species, setSpecies] = React.useState<DexSpecies | null>(null);
    const [gen] = React.useState<number>(9);

    type GenDex = { species?: { get?: (id: string) => unknown; [id: string]: unknown }; toID?: (s: string) => string };
    type DexModule = {
      toID?: (s: string) => string;
      Dex?: { forGen?: (g: number) => GenDex; species?: { get?: (id: string) => unknown; [id: string]: unknown } };
      species?: { get?: (id: string) => unknown; [id: string]: unknown };
      Species?: { get?: (id: string) => unknown; [id: string]: unknown };
      getSpecies?: (id: string) => unknown;
    };

    React.useEffect(() => {
      let cancelled = false;
      setError(null);
      setSpecies(null);

      if (!speciesName) return;

      setLoading(true);
      (async () => {
        try {
          const mod = await import("@pkmn/dex");
          const D = mod as unknown as DexModule;

          // Prefer a generation-specific Dex if available
          const dexCtor = D.Dex as DexModule['Dex'] | undefined;
          const dex = (() => {
            try {
              if (dexCtor && typeof dexCtor.forGen === 'function') return dexCtor.forGen(gen);
            } catch (_e) {
              // ignore
            }
            // fall back to top-level Dex object (may expose .species)
            return (D.Dex as unknown as GenDex) || (D as unknown as GenDex);
          })();

          const toID = D.toID ?? ((s: string) => String(s).toLowerCase());
          const id = typeof toID === "function" ? toID(speciesName ?? "") : String(speciesName).toLowerCase();

          let sp: unknown = null;
          try {
            if (dex && typeof dex.species?.get === "function") sp = dex.species.get!(id) ?? dex.species.get!(speciesName as string);
            if (!sp && dex && dex.species && (dex as unknown as Record<string, unknown>)[id]) sp = (dex as unknown as Record<string, unknown>)[id];
            // attempt other shapes
            if (!sp && D.Species && typeof D.Species.get === "function") sp = D.Species.get!(id) ?? D.Species.get!(speciesName as string);
            if (!sp && typeof D.getSpecies === "function") sp = D.getSpecies!(id) ?? D.getSpecies!(speciesName as string);
          } catch {
            sp = null;
          }

          if (!sp) {
            setError("Species not found in Dex");
            return;
          }

          const spObj = sp as Record<string, unknown>;
          const baseStatsVal = spObj['baseStats'] ?? (typeof spObj['baseStats'] === 'function' ? (spObj['baseStats'] as () => DexSpecies['baseStats'])() : undefined);
          const typesVal = spObj['types'] ?? spObj['type'] ?? (Array.isArray(spObj['t']) ? (spObj['t'] as string[]) : undefined);
          const abilitiesVal = spObj['abilities'] ?? spObj['ability'] ?? undefined;
          const genVal = spObj['gen'] ?? spObj['generation'] ?? undefined;

          const payload: DexSpecies = {
            baseStats: baseStatsVal as DexSpecies['baseStats'],
            types: typesVal as string[] | undefined,
            abilities: abilitiesVal as DexSpecies['abilities'],
            gen: typeof genVal === 'number' ? Number(genVal) : (genVal ? Number(genVal) : undefined),
            _raw: sp,
          };

          if (!cancelled) setSpecies(payload);
        } catch (e: unknown) {
          if (!cancelled) setError(e instanceof Error ? e.message : String(e));
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();

      return () => {
        cancelled = true;
      };
    }, [speciesName]);

    const fallback = mockStats(speciesName ?? "");
    const stats = (species as DexSpecies | null)?.baseStats ?? fallback;
    const raw = (species as unknown as { _raw?: unknown })?._raw;

    const displayTypes = React.useMemo(() => {
      // Prefer normalized `species.types` from payload
      if (species?.types && Array.isArray(species.types)) {
        return species.types.map((x) => normalizeTypeValue(x));
      }

      // Fallback to raw shapes in various possible Dex formats
      try {
        const rs = raw as Record<string, unknown> | undefined;
        if (!rs) return [] as string[];

        const rawCandidates = [rs['types'], rs['type'], rs['t'], rs['typeList'], rs['type_names']];
        let found: unknown = undefined;
        for (const c of rawCandidates) {
          if (c !== undefined) {
            found = c;
            break;
          }
        }
        if (found === undefined) return [];

        // Array of strings or objects
        if (Array.isArray(found)) {
          return (found as unknown[]).map((el) => normalizeTypeValue(el));
        }

        // Numeric-keyed object like {0: 'Fire', 1: 'Flying'} or {slot1: 'Fire'}
        if (found && typeof found === 'object') {
          const vals = Object.values(found as Record<string, unknown>);
          if (vals.length) return vals.map((v) => normalizeTypeValue(v));
        }

        // Slash-separated string e.g. "Fire/Flying"
        if (typeof found === 'string') {
          return String(found).split(/[\\/\\|]+/).map((s) => s.trim()).filter(Boolean);
        }
      } catch {
        // ignore
      }
      return [] as string[];
    }, [species, raw]);

    const resolveGenMoves = React.useCallback((rawSp: unknown, genNumber: number) => {
      if (!rawSp) return [] as string[];
      try {
        const rs = rawSp as Record<string, unknown>;
        if (rs.learnsets && typeof rs.learnsets === 'object') {
          const byGen = (rs.learnsets as Record<string, unknown>)[String(genNumber)];
          if (byGen && typeof byGen === 'object') return Object.keys(byGen as Record<string, unknown>);
        }
        if (rs.learnset && typeof (rs.learnset as Record<string, unknown>)[String(genNumber)] === 'object') return Object.keys((rs.learnset as Record<string, unknown>)[String(genNumber)] as Record<string, unknown>);
        if (rs.learnset && typeof rs.learnset === "object") return Object.keys(rs.learnset as Record<string, unknown>);
        const movesVal = (rs as Record<string, unknown>)['moves'];
        if (Array.isArray(movesVal)) return (movesVal as string[]).slice(0, 50);
        if (rs.learnsets && typeof rs.learnsets === "object") {
          const keys = new Set<string>();
          Object.values(rs.learnsets as Record<string, unknown>).forEach((g) => {
            if (g && typeof g === "object") Object.keys(g as Record<string, unknown>).forEach((m) => keys.add(m));
          });
          return Array.from(keys);
        }
        return [] as string[];
      } catch {
        return [] as string[];
      }
    }, []);

    const genMoves = React.useMemo(() => resolveGenMoves(raw, gen), [raw, gen, resolveGenMoves]);

    const resolveFormes = React.useCallback((rawSp: unknown) => {
      if (!rawSp) return [] as string[];
      const rs = rawSp as Record<string, unknown>;
      if (Array.isArray(rs.formes)) return rs.formes as string[];
      if (Array.isArray(rs.otherFormes)) return rs.otherFormes as string[];
      if (Array.isArray(rs.forme)) return rs.forme as string[];
      return [] as string[];
    }, []);

    const formes = React.useMemo(() => resolveFormes(raw), [raw, resolveFormes]);

    if (!speciesName) return <div className="text-sm text-black/50">Select a species to view details.</div>;

    const sprite = (getPokemonSpriteUrl(speciesName ?? "") as string) || undefined;

    return (
      <div className="max-w-md mx-auto">
        <div className="bg-white/5 rounded-lg p-6 shadow-sm">
          <div className="flex items-start gap-4">
            <img src={sprite} alt={speciesName ?? undefined} className="h-28 w-28 object-contain" />
            <div className="flex-1">
              <div className="flex items-center justify-between">
                <h3 className="text-2xl font-bold capitalize">
                  {speciesName} <span className="text-sm text-black/50">(mock)</span>
                </h3>
              </div>

              <div className="mt-2 flex items-center gap-2">
                {loading ? (
                  <div className="text-sm">Loading…</div>
                ) : displayTypes.length ? (
                  displayTypes.map((t: string) => (
                    <span
                      key={t}
                      className="text-xs px-3 py-1 rounded-full text-white"
                      style={{ backgroundColor: getTypeColor(t) }}
                    >
                      {t}
                    </span>
                  ))
                ) : (
                  <div className="text-sm text-black/50">No types available.</div>
                )}
              </div>

              {species?.gen ? <div className="text-xs text-black/50 mt-2">Introduced in gen {species.gen}</div> : null}
            </div>
          </div>

          <div className="mt-6">
            <h4 className="font-semibold">Base stats</h4>
            <div className="mt-3 space-y-3">
              {[
                ["HP", stats.hp],
                ["Attack", stats.atk],
                ["Defense", stats.def],
                ["Sp. Atk", stats.spa],
                ["Sp. Def", stats.spd],
                ["Speed", stats.spe],
              ].map(([label, val]) => {
                const v = Number(val ?? 0);
                const pct = Math.round((v / 255) * 100);
                return (
                  <div key={String(label)}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <div>{label}:</div>
                      <div className="font-medium">{v}</div>
                    </div>
                    <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full bg-green-500" style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-6">
            <h4 className="font-semibold">Abilities</h4>
            <div className="mt-2 text-sm">
              {loading && <div className="text-sm text-black/50">Loading abilities…</div>}
              {!loading && error && <div className="text-sm text-red-600">{error}</div>}

              {!loading && !error && species?.abilities ? (
                <ul className="list-disc list-inside">
                  {Array.isArray(species.abilities)
                    ? (species.abilities as string[]).map((a: string, i: number) => <li key={String(i)}>{String(a)}</li>)
                    : Object.entries(species.abilities).map(([k, v]) => (
                        <li key={k} className="capitalize">
                          {k === "H" ? "Hidden: " : k + ": "}
                          {String(v)}
                        </li>
                      ))}
                </ul>
              ) : null}

              {!loading && !error && !species?.abilities ? (
                <div className="text-sm text-black/50">No abilities available.</div>
              ) : null}
            </div>
          </div>

          {/* Generation selector removed per design request */}

          <div className="mt-6">
            <h4 className="font-semibold">Gen-specific moves</h4>
            <div className="mt-2 text-sm">
              {loading ? (
                <div className="text-sm text-black/50">Loading moves…</div>
              ) : genMoves.length ? (
                <ul className="list-disc list-inside grid grid-cols-2 gap-1">
                  {genMoves.slice(0, 20).map((m: string) => (
                    <li key={m} className="capitalize">
                      {m.replace(/-/g, " ")}
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-sm text-black/50">No move data available for gen {gen}.</div>
              )}
            </div>
          </div>

          {formes.length ? (
            <div className="mt-6">
              <h4 className="font-semibold">Formes</h4>
              <div className="mt-2 text-sm">
                {formes.map((f: string) => (
                  <div key={f} className="capitalize">
                    {f}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    );
  }
