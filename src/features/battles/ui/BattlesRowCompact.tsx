import { ChevronDown } from "lucide-react";
import TeamSpriteStrip from "../../pokemon/ui/TeamSpriteStrip";

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export type BattleListItem = {
  id: string;
  playedAt: string;
  result: "win" | "loss";
  opponentName: string;
  format_ps?: string | null;
  rated?: boolean;
  teamLabel?: string | null;
  teamVersionLabel?: string | null;
  matchConfidence?: number | null;
  matchMethod?: string | null;
  brought?: Array<{ species: string; iconText?: string }>;
};

type Props = {
  battle: BattleListItem;
  selected: boolean;
  onClick: () => void;
  divider?: boolean;
  expanded: boolean;
  onToggleExpanded: () => void;
};

export default function BattleRowCompact({
  battle,
  selected,
  onClick,
  divider,
  expanded,
  onToggleExpanded,
}: Props) {
  const isWin = battle.result === "win";

  return (
    <button
      onClick={onClick}
      className={cx(
        "w-full px-4 py-3 text-left transition",
        "hover:bg-white/55",
        selected && "bg-white/70",
        divider && "border-b border-black/5"
      )}
    >
      <div className="flex items-start justify-between gap-4">
        {/* Left */}
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span
              className={cx("h-2.5 w-2.5 rounded-full", isWin ? "bg-green-600" : "bg-red-500")}
            />
            <div className="truncate text-sm font-semibold text-black/80">
              {isWin ? "Win" : "Loss"} <span className="text-black/35">vs</span>{" "}
              {battle.opponentName}
            </div>

            {battle.rated ? (
              <span className="ml-2 rounded-xl bg-black/5 px-2 py-0.5 text-[11px] text-black/55">
                Rated
              </span>
            ) : null}
          </div>

          <div className="mt-1 truncate text-xs text-black/55">
            {(battle.teamLabel ?? "Unlinked team") +
              (battle.teamVersionLabel ? ` · ${battle.teamVersionLabel}` : "")}
            {battle.matchConfidence != null ? (
              <span className="text-black/35">
                {" "}
                · Match: {battle.matchConfidence.toFixed(2)}
                {battle.matchMethod ? ` · ${battle.matchMethod}` : ""}
              </span>
            ) : null}
          </div>

          {expanded && (
            <TeamSpriteStrip
              mons={battle.brought ?? []}
              size="sm"
              className="mt-2 min-h-[2.25rem]"
            />
          )}
        </div>

        {/* Right */}
        <div className="flex shrink-0 flex-col items-end gap-2">
          <div className="text-xs text-black/45">{battle.playedAt}</div>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpanded();
            }}
            className={cx(
              "flex h-9 w-9 items-center justify-center rounded-2xl",
              "bg-white/60 ring-1 ring-black/10 hover:bg-white/80 transition"
            )}
            aria-label={expanded ? "Collapse team preview" : "Expand team preview"}
          >
            <ChevronDown
              className={cx(
                "h-4 w-4 text-black/55 transition-transform duration-200",
                expanded ? "rotate-180" : "rotate-0"
              )}
            />
          </button>
        </div>
      </div>
    </button>
  );
}