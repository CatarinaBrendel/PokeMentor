import { type BattleListItem } from "../model/battles.types";
import BattlesRowCompact  from "./BattlesRowCompact";

type Props = {
  rows: BattleListItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;

  expandedIds: Record<string, boolean>;
  onToggleExpanded: (id: string) => void;

  headerTitle?: string;
};

export default function BattleListPanel({
  rows,
  selectedId,
  onSelect,
  expandedIds,
  onToggleExpanded,
  headerTitle = "All formats",
}: Props) {
  return (
    <div className="col-span-4 flex h-full min-h-0 flex-col rounded-3xl bg-white/50 ring-1 ring-black/5">
      <div className="flex items-center justify-between px-5 py-4">
        <div className="text-sm font-semibold text-black/80">{headerTitle}</div>
        <button className="text-sm text-black/50 hover:text-black/70">Filter</button>
      </div>

      <div className="min-h-0 flex-1 overflow-auto px-3 pb-3">
        {rows.length === 0 ? (
          <div className="rounded-3xl bg-white/70 p-6 text-sm text-black/55 ring-1 ring-black/10">
            No battles match your filters.
          </div>
        ) : (
          <div className="overflow-hidden rounded-3xl bg-white/40 ring-1 ring-black/10">
            {rows.map((b, idx) => (
              <BattlesRowCompact
                key={b.id}
                battle={b}
                selected={b.id === selectedId}
                onClick={() => onSelect(b.id)}
                divider={idx !== rows.length - 1}
                expanded={!!expandedIds[b.id]}
                onToggleExpanded={() => onToggleExpanded(b.id)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}