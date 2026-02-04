import React from "react";
import { SPECIES_TO_DEX_ID } from "../../features/pokemon/speciesIndex";
import SpeciesGrid from "../../features/pokedex/ui/SpeciesGrid";
import SpeciesDetails from "../../features/pokedex/ui/SpeciesDetails";

export default function PokedexPage() {
  const allSpecies = React.useMemo(() => Object.keys(SPECIES_TO_DEX_ID).sort(), []);
  const [selected, setSelected] = React.useState<string | null>(null);

  // UI state
  const [search, setSearch] = React.useState("");
  const [generation, setGeneration] = React.useState<number | "all">("all");
  const [order, setOrder] = React.useState<"a-z" | "z-a">("a-z");
  const [view, setView] = React.useState<"grid" | "list">("grid");
  const [page, setPage] = React.useState<number>(1);
  const pageSize = 48;
  const [speciesGenMap, setSpeciesGenMap] = React.useState<Record<string, number> | null>(null);
  const [loadingGenMap, setLoadingGenMap] = React.useState(false);

  // filter + sort
  const filtered = React.useMemo(() => {
    let list = allSpecies.slice();
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((s) => s.toLowerCase().includes(q));
    }

    // generation filtering: when a gen is selected, and we have a gen map, filter by it.
    if (generation !== "all") {
      if (speciesGenMap) {
        list = list.filter((s) => speciesGenMap[s] === generation);
      } else {
        // if map not loaded yet, leave list intact so the UI remains responsive
      }
    }

    if (order === "a-z") list.sort((a, b) => a.localeCompare(b));
    else list.sort((a, b) => b.localeCompare(a));

    return list;
  }, [allSpecies, search, generation, order, speciesGenMap]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const shown = React.useMemo(() => filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize), [filtered, currentPage]);

  React.useEffect(() => setPage(1), [search, generation, order]);

  // Build a species -> gen lookup map once (lazy, async). Keeps UI responsive.
  React.useEffect(() => {
    let cancelled = false;
    async function buildMap() {
      setLoadingGenMap(true);
      try {
        const mod = await import("@pkmn/dex");
        const D = mod as unknown as Record<string, unknown>;
        const map: Record<string, number> = {};

        // If Dex.forGen exists, build per-generation dex handles to lookup species reliably.
        const dexForGen: Array<any | null> = [];
        if (D.Dex && typeof (D.Dex as any).forGen === 'function') {
          for (let g = 1; g <= 9; g++) {
            try {
              dexForGen.push((D.Dex as any).forGen(g));
            } catch {
              dexForGen.push(null);
            }
          }
        }

        // Iterate known species list to avoid loading everything from the module
        for (const name of allSpecies) {
          try {
            const id = typeof D.toID === 'function' ? (D.toID as any)(name) : String(name).toLowerCase();

            // Try per-gen dex lookups first to find earliest gen where species exists
            let foundGen: number | undefined = undefined;
            if (dexForGen.length) {
              for (let g = 1; g <= dexForGen.length; g++) {
                const d = dexForGen[g - 1];
                if (!d) continue;
                try {
                  const sp = typeof d.species?.get === 'function' ? d.species.get(id) ?? d.species.get(name) : d.species?.[id];
                  if (!sp) continue;
                  const spObj = sp as Record<string, unknown>;
                  // skip nonstandard entries (Past/Future/CAP etc.)
                  if (spObj.isNonstandard) continue;
                  // prefer explicit gen metadata if present
                  const explicit = spObj.gen ?? spObj.generation ?? undefined;
                  if (explicit) {
                    foundGen = Number(explicit);
                  } else {
                    foundGen = g;
                  }
                  break;
                } catch {
                  // ignore per-gen lookup errors
                }
              }
            }

            // Fallback: try the module-level lookup and read explicit `gen`/`generation` property
            if (!foundGen) {
              let sp: unknown = null;
              if (typeof (D as any).species?.get === 'function') sp = (D as any).species.get(id) ?? (D as any).species.get(name);
              if (!sp && typeof (D as any).Species?.get === 'function') sp = (D as any).Species.get(id) ?? (D as any).Species.get(name);
              if (!sp && typeof (D as any).getSpecies === 'function') sp = (D as any).getSpecies(id) ?? (D as any).getSpecies(name);

              const spObj = sp as Record<string, unknown> | undefined;
              const g = spObj?.gen ?? spObj?.generation ?? undefined;
              if (g) foundGen = Number(g);
            }

            if (foundGen) map[name] = foundGen;
          } catch {
            // ignore per-species lookup errors
          }
        }
        if (!cancelled) {
          setSpeciesGenMap(map);
          try {
            // debug: log map size and example entry for troubleshooting generation filter
            // eslint-disable-next-line no-console
            console.log('[speciesGenMap] built, entries=', Object.keys(map).length, 'abomasnow->', map['abomasnow']);
          } catch {}
        }
      } catch {
        if (!cancelled) setSpeciesGenMap(null);
      } finally {
        if (!cancelled) setLoadingGenMap(false);
      }
    }

    buildMap();
    return () => {
      cancelled = true;
    };
  }, [allSpecies]);

  return (
    <div className="w-full h-full p-4">
      {/* Top centered search */}
      <div className="mb-4 flex justify-center">
        <div className="w-full max-w-[980px]">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search Pokémon"
            className="w-full bg-white/5 rounded-full px-4 py-3 text-sm placeholder:text-black/50 shadow-sm"
          />
        </div>
      </div>

      {/* Controls row */}
      <div className="mb-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <select value={generation} onChange={(e) => setGeneration(e.target.value === "all" ? "all" : Number(e.target.value))} className="rounded-full bg-white/5 px-3 py-1 text-sm">
            <option value="all">Generation: All</option>
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((g) => (
              <option key={g} value={g}>Gen {g}</option>
            ))}
          </select>
          {loadingGenMap ? <div className="ml-2 text-xs text-black/40">loading…</div> : null}
          <div className="hidden md:flex items-center gap-2 bg-white/5 rounded-full px-3 py-1 text-sm">
            <button onClick={() => setView("grid")} className={`rounded p-1 ${view === "grid" ? "bg-white/10" : "bg-transparent"}`}>Grid</button>
            <button onClick={() => setView("list")} className={`rounded p-1 ${view === "list" ? "bg-white/10" : "bg-transparent"}`}>List</button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <select value={order} onChange={(e) => setOrder(e.target.value as "a-z" | "z-a")} className="rounded-full bg-white/5 px-3 py-1 text-sm">
            <option value="a-z">Order: A-Z</option>
            <option value="z-a">Order: Z-A</option>
          </select>
          <div className="text-sm text-black/50">{filtered.length} results</div>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6 h-[calc(100vh-150px)]">
        <div className="col-span-7 flex flex-col gap-4 h-full max-h-[calc(100vh-150px)]">
          <div className="overflow-auto rounded-lg bg-white/5 p-4 flex-1">
            <SpeciesGrid species={shown} selected={selected} onSelect={(s) => setSelected((prev) => (prev === s ? null : s))} view={view} />
          </div>

          <div className="mt-0 flex items-center justify-center">
            <div className="bg-white rounded-full px-4 py-2 flex items-center gap-3 shadow-sm">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} className="rounded px-3 py-1">‹</button>
              <div className="hidden sm:flex items-center gap-2">
                {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
                  // show first pages or around current
                  const pageNum = i + 1;
                  const isActive = pageNum === currentPage;
                  return (
                    <button key={pageNum} onClick={() => setPage(pageNum)} className={`px-3 py-1 rounded ${isActive ? 'bg-green-500 text-white' : 'bg-transparent'}`}>
                      {pageNum}
                    </button>
                  );
                })}
                {totalPages > 7 ? <div className="px-2">…</div> : null}
              </div>
              <div className="px-3 py-1 text-sm">{currentPage} / {totalPages}</div>
              <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} className="rounded px-3 py-1">›</button>
            </div>
          </div>
        </div>

        <div className="col-span-5 overflow-auto rounded-lg bg-white p-6">
          <SpeciesDetails speciesName={selected} />
        </div>
      </div>
    </div>
  );
}
