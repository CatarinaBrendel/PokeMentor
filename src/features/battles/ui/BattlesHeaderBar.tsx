type Stats = {
  total: number;
  winrate: number;
  lastPlayed: string;
};

type Props = {
  stats: Stats;
  query: string;
  onQueryChange: (v: string) => void;
};

function HeaderStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-right">
      <div className="text-xs text-black/40">{label}</div>
      <div className="text-sm font-semibold text-black/70">{value}</div>
    </div>
  );
}

export default function BattlesHeaderBar({ stats, query, onQueryChange }: Props) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-6">
      <div>
        <div className="text-3xl font-semibold tracking-tight">Battle Reviews</div>
        <div className="mt-2 text-sm text-black/50">
          Review battles, link teams, and extract insights for coaching.
        </div>
      </div>

      <div className="flex items-center gap-5 rounded-3xl bg-white/40 px-4 py-3 ring-1 ring-black/5">
        <HeaderStat label="Battles" value={`${stats.total}`} />
        <HeaderStat label="Win rate" value={`${stats.winrate}%`} />
        <HeaderStat label="Last played" value={`${stats.lastPlayed}`} />

        <div className="relative">
          <input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search opponent, format, team…"
            className="h-10 w-72 rounded-2xl bg-white/70 px-4 text-sm ring-1 ring-black/10 placeholder:text-black/30 focus:outline-none focus:ring-2 focus:ring-black/15"
          />
        </div>
      </div>
    </div>
  );
}