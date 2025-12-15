export type TeamListRow = {
  id: string;
  name: string | null;
  format_ps: string | null;
  updated_at: string;
  latest_version_num: number | null;
};

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}


type Props = {
  rows: TeamListRow[];
  selectedId?: string | null;
  loading?: boolean;
  error?: string | null;
  onSelect?: (teamId: string) => void;
  onDelete?: (teamId: string) => void | Promise<void>;
};

export default function TeamsView({ rows, loading, error, selectedId, onSelect, onDelete }: Props) {
  
  return (
    <div className="rounded-3xl bg-dust-100 p-6 ring-1 ring-black/5">
      <div className="flex items-center justify-between">
        <div className="text-lg font-semibold text-dust-900">All Teams</div>
        <div className="text-sm text-dust-600">{rows.length} total</div>
      </div>

      {loading ? (
        <div className="mt-4 text-sm text-dust-600">Loading…</div>
      ) : error ? (
        <div className="mt-4 text-sm text-red-700">{error}</div>
      ) : rows.length === 0 ? (
        <div className="mt-4 text-sm text-dust-600">
          No teams imported yet. Use the Import tab to add one.
        </div>
      ) : (
        <div className="mt-4 overflow-hidden rounded-2xl bg-dust-50 ring-1 ring-black/10">
          <div className="grid grid-cols-12 gap-2 px-4 py-3 text-xs font-semibold text-dust-600">
            <div className="col-span-5">Name</div>
            <div className="col-span-3 text-center">Format</div>
            <div className="col-span-1 text-center">Version</div>
            <div className="col-span-2 text-center">Updated</div>
            <div className="col-span-1 text-right"> </div>
          </div>

          <div className="divide-y divide-black/10">
            {rows.map((r) => (
              <div
                key={r.id}
                onClick={() => onSelect?.(r.id)}
                className={cx(
                  "grid grid-cols-12 gap-2 px-4 py-3 text-sm items-center",
                  "cursor-pointer transition-colors",
                  r.id === selectedId
                    ? "bg-fern-500/10"
                    : "hover:bg-dust-100/70"
              )}>
                <div className="col-span-5 font-medium text-dust-900">
                  {r.name ?? "Untitled team"}
                </div>

                <div className={cx("col-span-3 text-center text-dust-700", !r.format_ps && "text-dust-500")}>
                  {r.format_ps ?? "—"}
                </div>

                <div className={cx("col-span-1 text-center text-dust-700", !r.latest_version_num && "text-dust-500")}>
                  {r.latest_version_num ?? "—"}
                </div>

                <div className="col-span-2 text-center text-dust-600">
                  {new Date(r.updated_at).toLocaleDateString()}
                </div>

                <div className="col-span-1 flex justify-end">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete?.(r.id);
                    }}
                    disabled={!onDelete}
                    className="rounded-xl px-3 py-2 text-xs font-semibold text-red-800 hover:bg-red-500/10 disabled:opacity-50 disabled:cursor-not-allowed"
                    title="Delete team"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}