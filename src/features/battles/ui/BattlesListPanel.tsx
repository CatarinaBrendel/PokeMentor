// src/features/battles/ui/BattlesListPanel.tsx
import React, { useState } from "react";
import type { BattleListItem } from "../model/battles.types";
import { ChevronDown } from "lucide-react";
import TeamSpriteStrip from "../../pokemon/ui/TeamSpriteStrip";
import type { TeamSpriteStripItem } from "../../pokemon/ui/TeamSpriteStrip";

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function toStripMonsFromBrought(
  xs: Array<{ species_name: string }>
): TeamSpriteStripItem[] {
  return xs.map((x) => ({ species: x.species_name }));
}

function ResultDot({ result }: { result: BattleListItem["result"] }) {
  return (
    <span
      className={cx(
        "h-2.5 w-2.5 rounded-full",
        result === "win" && "bg-green-600",
        result === "loss" && "bg-red-500",
        result === "unknown" && "bg-black/25"
      )}
    />
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-black/5 px-2 py-0.5 text-[11px] text-black/55">
      {children}
    </span>
  );
}

export default function BattlesListPanel({
  items = [],
  selectedId,
  loading,
  error,
  onSelect,
}: {
  items?: BattleListItem[];
  selectedId?: string | null;
  loading?: boolean;
  error?: string | null;
  onSelect?: (id: string) => void;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="flex h-full min-h-0 flex-col rounded-3xl bg-white/50 ring-1 ring-black/5">
      <div className="flex items-center justify-between gap-2 p-4">
        <div className="text-sm font-semibold text-black/75">All formats</div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-3 pb-3">
        {loading ? (
          <div className="px-2 py-3 text-sm text-black/55">Loading battles…</div>
        ) : error ? (
          <div className="px-2 py-3 text-sm text-red-600">{error}</div>
        ) : items.length === 0 ? (
          <div className="px-2 py-3 text-sm text-black/55">No battles found.</div>
        ) : (
          <div className="space-y-2">
            {items.map((b) => {
              const active = selectedId === b.id;
              const expanded = expandedId === b.id;

              const hasUserCounts = b.broughtUserSeen != null || b.broughtUserExpected != null;
              const hasOppCounts = b.broughtOpponentSeen != null || b.broughtOpponentExpected != null;
              const hasCounts = hasUserCounts || hasOppCounts;

              const canExpand = (b.brought?.length ?? 0) > 0;

              const title =
                b.result === "win"
                  ? `Win vs ${b.opponentName}`
                  : b.result === "loss"
                  ? `Loss vs ${b.opponentName}`
                  : `Battle vs ${b.opponentName}`;

              return (
                <div
                  key={b.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onSelect?.(b.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") onSelect?.(b.id);
                  }}
                  className={cx(
                    "relative w-full cursor-pointer rounded-3xl ring-1 transition outline-none",
                    active ? "bg-white/85 ring-black/15" : "bg-white/70 ring-black/10 hover:bg-white/80",
                    "focus:ring-2 focus:ring-black/20"
                  )}
                  aria-label={`Select battle ${title}`}
                >
                  {/* Content sits above the overlay */}
                  <div className="relative z-10 p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <ResultDot result={b.result} />
                          <div className="truncate text-sm font-semibold text-black/75">{title}</div>
                        </div>

                        <div className="mt-1 truncate text-sm text-black/55">{b.format_ps ?? "—"}</div>

                        {/* Compact brought counters (always visible if present) */}
                      </div>

                      <div className="flex shrink-0 items-start gap-2">
                        <div className="flex flex-col items-end gap-1">
                          {b.rated ? <Pill>Rated</Pill> : <Pill>Unrated</Pill>}
                          <div className="text-xs text-black/45">{b.playedAt}</div>
                        </div>

                        {/* Toggle button sits above overlay and stops propagation */}
                        <button
                          type="button"
                          disabled={!canExpand}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!canExpand) return;
                            setExpandedId((cur) => (cur === b.id ? null : b.id));
                          }}
                          className={cx(
                            "ml-1 inline-flex h-8 w-8 items-center justify-center rounded-2xl ring-1 transition",
                            "relative z-20",
                            canExpand
                              ? "bg-white/60 ring-black/10 hover:bg-white/80"
                              : "bg-black/5 ring-black/5 opacity-60"
                          )}
                          aria-label={expanded ? "Hide brought" : "Show brought"}
                        >
                          <ChevronDown
                            size={16}
                            className={cx(
                              "text-black/60 transition-transform duration-200",
                              expanded && "rotate-180"
                            )}
                          />
                        </button>
                      </div>
                    </div>
          
                    {expanded && (
                      <div className="mt-3 rounded-2xl bg-black/5 p-3">
                        {b.brought.length === 0 ? (
                          <div className="text-sm text-black/55 text-center">No data yet.</div>
                        ) : (
                          <TeamSpriteStrip
                            mons={toStripMonsFromBrought(b.brought)}
                            size="md"
                          />
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}