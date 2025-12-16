import * as React from "react";
import type { TeamDetails, TeamSlotWithSetRow } from "./teams.types"; // adjust path if needed
import TeamSpriteStrip from "../../pokemon/ui/TeamSpriteStrip";

type Props = {
  data: TeamDetails;
  onClose: () => void;
  onSetActive?: (teamId: string) => void | Promise<void>;
};

type ExportSlot = {
  slot_index: number;
  nickname: string | null;
  species_name: string;
  item_name: string | null;
  ability_name: string | null;
  level: number | null;
  gender: string | null;
  shiny: number;
  tera_type: string | null;
  happiness: number | null;
  nature: string | null;
  ev_hp: number | null; ev_atk: number | null; ev_def: number | null;
  ev_spa: number | null; ev_spd: number | null; ev_spe: number | null;
  iv_hp: number | null; iv_atk: number | null; iv_def: number | null;
  iv_spa: number | null; iv_spd: number | null; iv_spe: number | null;
  moves: string[];
};

function formatEvLine(s: ExportSlot) {
  const parts: string[] = [];
  if (s.ev_hp) parts.push(`${s.ev_hp} HP`);
  if (s.ev_atk) parts.push(`${s.ev_atk} Atk`);
  if (s.ev_def) parts.push(`${s.ev_def} Def`);
  if (s.ev_spa) parts.push(`${s.ev_spa} SpA`);
  if (s.ev_spd) parts.push(`${s.ev_spd} SpD`);
  if (s.ev_spe) parts.push(`${s.ev_spe} Spe`);
  return parts.length ? `EVs: ${parts.join(" / ")}` : null;
}

function formatIvLine(s: ExportSlot) {
  // Showdown usually omits IV line if all 31; your DB has nullable IVs.
  // If you store explicit 31s, you can omit. For now: include only when any IV is not null and not 31.
  const entries: Array<[string, number]> = [];
  const push = (label: string, v: number | null) => {
    if (typeof v === "number" && v !== 31) entries.push([label, v]);
  };
  push("HP", s.iv_hp);
  push("Atk", s.iv_atk);
  push("Def", s.iv_def);
  push("SpA", s.iv_spa);
  push("SpD", s.iv_spd);
  push("Spe", s.iv_spe);

  if (entries.length === 0) return null;
  return `IVs: ${entries.map(([k, v]) => `${v} ${k}`).join(" / ")}`;
}

function formatHeaderLine(s: ExportSlot) {
  const namePart = s.nickname ? `${s.nickname} (${s.species_name})` : s.species_name;
  const genderPart = s.gender === "M" || s.gender === "F" ? ` (${s.gender})` : "";
  const itemPart = s.item_name ? ` @ ${s.item_name}` : "";
  return `${namePart}${genderPart}${itemPart}`.trim();
}

function toShowdownSetText(s: ExportSlot) {
  const lines: string[] = [];
  lines.push(formatHeaderLine(s));

  if (s.ability_name) lines.push(`Ability: ${s.ability_name}`);
  if (typeof s.level === "number") lines.push(`Level: ${s.level}`);
  if (s.shiny) lines.push(`Shiny: Yes`);
  if (s.happiness != null) lines.push(`Happiness: ${s.happiness}`);
  if (s.tera_type) lines.push(`Tera Type: ${s.tera_type}`);

  const evLine = formatEvLine(s);
  if (evLine) lines.push(evLine);

  if (s.nature) lines.push(`${s.nature} Nature`);

  const ivLine = formatIvLine(s);
  if (ivLine) lines.push(ivLine);

  for (const m of (s.moves ?? []).slice(0, 4)) {
    if (m && m.trim()) lines.push(`- ${m.trim()}`);
  }

  return lines.join("\n");
}

function exportTeamAsPokepasteText(teamName: string, slots: ExportSlot[]) {
  const header = teamName?.trim() ? `${teamName.trim()}\n\n` : "";
  const body = slots
    .slice()
    .sort((a, b) => a.slot_index - b.slot_index)
    .map(toShowdownSetText)
    .join("\n\n");
  return header + body + "\n";
}

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

type EvSpread = Pick<
  TeamSlotWithSetRow,
  "ev_hp" | "ev_atk" | "ev_def" | "ev_spa" | "ev_spd" | "ev_spe"
>;

function evEntries(ev: EvSpread) {
  const entries: Array<[string, number]> = [];
  const push = (k: string, v: number | null) => {
    if (typeof v === "number" && v > 0) entries.push([k, v]);
  };
  push("HP", ev.ev_hp);
  push("Atk", ev.ev_atk);
  push("Def", ev.ev_def);
  push("SpA", ev.ev_spa);
  push("SpD", ev.ev_spd);
  push("Spe", ev.ev_spe);
  return entries;
}

function PokemonSlotCard({
  s,
  expanded,
  onToggle,
}: {
  s: TeamSlotWithSetRow;
  expanded: boolean;
  onToggle: () => void;
}) {
  const evs = evEntries(s);

  // Moves are not in TeamSlotWithSetRow yet; keep placeholder for now.
  // When you add move fields later, replace this with actual values.
  const moves = s.moves ?? [];

  const headerId = `slot-${s.slot_index}-header`;
  const bodyId = `slot-${s.slot_index}-body`;

  return (
    <div className="rounded-2xl bg-white ring-1 ring-black/5 shadow-sm overflow-hidden">
      {/* Clickable header */}
      <button
        type="button"
        className={cx(
          "w-full text-left p-4",
          "hover:bg-dust-50 focus:outline-none focus:ring-2 focus:ring-fern-500/40"
        )}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        aria-expanded={expanded}
        aria-controls={bodyId}
        id={headerId}
      >
        <div className="flex items-start justify-between gap-3">
        {/* Left: sprite + text */}
        <div className="flex min-w-0 items-start gap-3">
          <div className="shrink-0 pt-0.5">
            <TeamSpriteStrip
              mons={[{ species: s.species_name }]}
              size="md"
              className="!mt-0"
            />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <div className="text-[11px] font-medium text-dust-500">
                Slot {s.slot_index}
              </div>
              <div className="h-1 w-1 rounded-full bg-black/20" />
              <div className="text-[11px] text-dust-500 truncate">
                {s.species_name}
              </div>
            </div>

            <div className="mt-1 font-semibold leading-tight truncate">
              {s.nickname ?? s.species_name}
            </div>
          </div>
        </div>

        {/* Right: tera + chevron */}
        <div className="flex items-center gap-2 shrink-0">
          {s.tera_type ? (
            <span className="rounded-full bg-dust-100 px-2 py-1 text-[11px] text-dust-700">
              Tera {s.tera_type}
            </span>
          ) : null}

          <span
            className={cx(
              "inline-flex items-center justify-center",
              "h-7 w-7 rounded-lg ring-1 ring-black/5",
              "text-dust-700 bg-dust-50"
            )}
            aria-hidden="true"
            title={expanded ? "Collapse" : "Expand"}
          >
            {expanded ? "▾" : "▸"}
          </span>
        </div>
      </div>

        {/* Meta strip (always visible) */}
        <div className="mt-2 text-xs text-dust-600 space-y-1">
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            <span>
              <span className="text-dust-500">Item:</span> {s.item_name ?? "—"}
            </span>
            <span>
              <span className="text-dust-500">Ability:</span>{" "}
              {s.ability_name ?? "—"}
            </span>
          </div>

          <div className="flex flex-wrap gap-x-3 gap-y-1">
            {s.nature ? (
              <span>
                <span className="text-dust-500">Nature:</span> {s.nature}
              </span>
            ) : null}

            {typeof s.level === "number" ? (
              <span>
                <span className="text-dust-500">Lvl:</span> {s.level}
              </span>
            ) : null}

            {s.gender ? (
              <span>
                <span className="text-dust-500">Gender:</span> {s.gender}
              </span>
            ) : null}

            {!!s.shiny ? (
              <span className="rounded bg-dust-100 px-1.5 py-0.5 text-[11px] text-dust-700">
                Shiny
              </span>
            ) : null}
          </div>
        </div>
      </button>

      {/* Expandable body */}
      <div
        id={bodyId}
        role="region"
        aria-labelledby={headerId}
        className={cx("px-4 pb-4", expanded ? "block" : "hidden")}
      >
        {/* EVs */}
        <div className="mt-3">
          <div className="text-[11px] font-medium text-dust-700">EVs</div>
          {evs.length === 0 ? (
            <div className="mt-1 text-xs text-dust-500">No EVs recorded.</div>
          ) : (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {evs.map(([k, v]) => (
                <span
                  key={k}
                  className="rounded-full bg-sage-50 px-2 py-1 text-[11px] text-sage-700 ring-1 ring-black/5"
                >
                  {k} {v}
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Moves (placeholder) */}
        <div className="mt-3">
          <div className="text-[11px] font-medium text-dust-700">Moves</div>
          {moves.length === 0 ? (
            <div className="mt-1 text-xs text-dust-500">No moves available yet.</div>
          ) : (
            <ul className="mt-1 grid grid-cols-2 gap-1.5 text-xs text-dust-700">
              {moves.slice(0, 4).map((m, idx) => (
                <li
                  key={`${m}-${idx}`}
                  className="rounded-lg bg-dust-50 px-2 py-1 ring-1 ring-black/5 truncate"
                  title={m}
                >
                  {m}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export default function TeamDetailsPanel({ data, onClose, onSetActive }: Props) {
  const { team, latestVersion, slots } = data;
  const teamMons = React.useMemo(
    () => slots.map((s) => ({ species: s.species_name })),
    [slots]
  );

  // Track expanded state by pokemon_set_id (more stable than slot_index if you ever reorder)
  const [expandedById, setExpandedById] = React.useState<Record<string, boolean>>(
    () => {
      const initial: Record<string, boolean> = {};
      for (const s of slots) initial[s.pokemon_set_id] = true;
      return initial;
    }
  );

  // Sync when switching teams / slots list changes
  React.useEffect(() => {
    setExpandedById((prev) => {
      const next: Record<string, boolean> = {};
      for (const s of slots) next[s.pokemon_set_id] = prev[s.pokemon_set_id] ?? true;
      return next;
    });
  }, [slots]);

  const expandAll = () =>
    setExpandedById(() => {
      const next: Record<string, boolean> = {};
      for (const s of slots) next[s.pokemon_set_id] = true;
      return next;
    });

  const collapseAll = () =>
    setExpandedById(() => {
      const next: Record<string, boolean> = {};
      for (const s of slots) next[s.pokemon_set_id] = false;
      return next;
    });

  const [copied, setCopied] = React.useState(false);

  async function onExport() {
    const text = exportTeamAsPokepasteText(team.name ?? "Untitled team", slots);
    await navigator.clipboard.writeText(text);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <div
      className="fixed right-0 top-0 h-full w-[420px] bg-dust-50 ring-1 ring-black/10"
      role="dialog"
      aria-label="Team details"
    >
      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-dust-50/95 backdrop-blur ring-1 ring-black/5 p-6 pb-3">
        <div className="flex justify-between items-start gap-3">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold truncate">
              {team.name ?? "Untitled team"}
            </h2>

            <div className="mt-1 text-sm text-dust-600">
              <span className="font-medium text-dust-700">Format:</span>{" "}
              {team.format_ps ?? "—"}
            </div>

            {latestVersion ? (
              <div className="mt-1 text-xs text-dust-500">
                Version v{latestVersion.version_num} · Imported{" "}
                {new Date(latestVersion.created_at).toLocaleDateString()}
              </div>
            ) : null}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onSetActive?.(team.id)}
              disabled={!onSetActive || !!team.is_active}
              className={cx(
                "rounded-lg px-3 py-1.5 text-sm font-semibold ring-1 ring-black/10",
                !onSetActive && "opacity-50 cursor-not-allowed",
                team.is_active
                  ? "bg-fern-100 text-fern-800 cursor-default"
                  : "bg-white text-dust-800 hover:bg-dust-200"
              )}
              title={team.is_active ? "This is already the active team" : "Set this team as active"}
            >
              {team.is_active ? "Active team" : "Set active"}
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close team details"
              className={cx(
                "cursor-pointer rounded-lg px-2 py-1",
                "text-dust-600 hover:bg-dust-200 hover:text-dust-900",
                "focus:outline-none focus:ring-2 focus:ring-fern-500/40"
              )}
              title="Close"
            >
              ✕
            </button>
          </div>  
        </div>

        {/* Panel controls */}
        <div className="mt-4 flex items-center gap-2">
          <button
            type="button"
            onClick={expandAll}
            className="rounded-lg bg-white px-2 py-1 text-xs text-dust-700 ring-1 ring-black/5 hover:bg-dust-50"
          >
            Expand all
          </button>

          <button
            type="button"
            onClick={collapseAll}
            className="rounded-lg bg-white px-2 py-1 text-xs text-dust-700 ring-1 ring-black/5 hover:bg-dust-50"
          >
            Collapse all
          </button>

          <div className="w-px h-5 bg-black/10 mx-1" />

          <button
            type="button"
            onClick={onExport}
            className="rounded-lg bg-white px-2 py-1 text-xs text-dust-700 ring-1 ring-black/5 hover:bg-dust-50"
            title="Copy Pokepaste/Showdown format to clipboard"
          >
            {copied ? "Copied" : "Export"}
          </button>
        </div>

        <div className="mt-4 h-px bg-black/10" />
      </div>

      {/* Scroll body */}
      <div className="p-6 pt-4 overflow-auto h-[calc(100%-160px)]">
        <div className="space-y-3">
          {slots.map((s) => (
            <PokemonSlotCard
              key={s.pokemon_set_id}
              s={s}
              expanded={!!expandedById[s.pokemon_set_id]}
              onToggle={() =>
                setExpandedById((prev) => ({
                  ...prev,
                  [s.pokemon_set_id]: !prev[s.pokemon_set_id],
                }))
              }
            />
          ))}
        </div>
      </div>
    </div>
  );
}