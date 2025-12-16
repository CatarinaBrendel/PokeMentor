import React, { useState } from "react";
import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";

export type TeamListRow = {
  id: string;
  name: string | null;
  format_ps: string | null;
  updated_at: string;
  latest_version_num: number | null;
  is_active: number | null;
};

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

type SortKey = "name" | "format" | "version" | "updated";
type SortDir = "asc" | "desc";

function DebouncedError({
  error,
  delayMs = 200,
}: {
  error?: string | null;
  delayMs?: number;
}) {
  const [visible, setVisible] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!error) {
      setVisible(null);
      return;
    }
    const t = window.setTimeout(() => setVisible(error), delayMs);
    return () => window.clearTimeout(t);
  }, [error, delayMs]);

  // Reserve space so the layout doesn't jump
  return (
    <div className="mt-4 min-h-[20px]">
      {visible ? <div className="text-sm text-red-700">{visible}</div> : null}
    </div>
  );
}

type Props = {
  rows: TeamListRow[];
  selectedId?: string | null;
  loading?: boolean;
  error?: string | null;
  onSelect?: (teamId: string) => void;
  onDelete?: (teamId: string) => void | Promise<void>;
};

function compareNullableText(a: string | null, b: string | null) {
  const aa = (a ?? "").toLowerCase();
  const bb = (b ?? "").toLowerCase();
  return aa.localeCompare(bb);
}

function compareNullableNumber(a: number | null, b: number | null) {
  const aa = a ?? -1;
  const bb = b ?? -1;
  return aa - bb;
}

function compareIsoDate(a: string, b: string) {
  // ISO strings compare lexicographically, but we’ll be explicit.
  const aa = Date.parse(a);
  const bb = Date.parse(b);
  return aa - bb;
}

function SortIcon({
  active,
  dir,
}: {
  active: boolean;
  dir: "asc" | "desc";
}) {
  if (!active) {
    return (
      <ArrowUpDown
        size={14}
        className="ml-1 text-dust-400"
        aria-hidden
      />
    );
  }

  return dir === "asc" ? (
    <ArrowUp
      size={14}
      className="ml-1 text-dust-700"
      aria-hidden
    />
  ) : (
    <ArrowDown
      size={14}
      className="ml-1 text-dust-700"
      aria-hidden
    />
  );
}

export default function TeamsView({
  rows,
  loading,
  error,
  selectedId,
  onSelect,
  onDelete,
}: Props) {
  
  type SortState = { key: SortKey; dir: SortDir };
  const [sort, setSort] = useState<SortState>({ key: "updated", dir: "desc" });

  function defaultDirFor(key: SortKey): SortDir {
    return key === "name" || key === "format" ? "asc" : "desc";
  }

  function toggleSort(nextKey: SortKey) {
    setSort((prev) => {
      if (prev.key !== nextKey) {
        return { key: nextKey, dir: defaultDirFor(nextKey) };
      }
      return { key: prev.key, dir: prev.dir === "asc" ? "desc" : "asc" };
    });
  }

  const sortedRows = React.useMemo(() => {
    const copy = rows.slice();

    copy.sort((a, b) => {
      // Optional: keep active team pinned to top before sorting within groups
      const aActive = !!a.is_active;
      const bActive = !!b.is_active;
      if (aActive !== bActive) return aActive ? -1 : 1;

      let cmp = 0;
      switch (sort.key) {
        case "name":
          cmp = compareNullableText(a.name, b.name);
          break;
        case "format":
          cmp = compareNullableText(a.format_ps, b.format_ps);
          break;
        case "version":
          cmp = compareNullableNumber(a.latest_version_num, b.latest_version_num);
          break;
        case "updated":
          cmp = compareIsoDate(a.updated_at, b.updated_at);
          break;
      }
      return sort.dir === "asc" ? cmp : -cmp;
    });

    return copy;
  }, [rows, sort.key, sort.dir]);

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
          {/* Header row */}
          <div className="grid grid-cols-12 gap-2 px-4 py-3 text-xs font-semibold text-dust-600 select-none">
            <button
              type="button"
              onClick={() => toggleSort("name")}
              className="col-span-5 inline-flex items-center text-left hover:text-dust-900"
              title="Sort by name"
            >
              Name
              <SortIcon active={sort.key === "name"} dir={sort.dir} />
            </button>

            <button
              type="button"
              onClick={() => toggleSort("format")}
              className="col-span-3 inline-flex items-center justify-center hover:text-dust-900"
              title="Sort by format"
            >
              Format
              <SortIcon active={sort.key === "format"} dir={sort.dir} />
            </button>

            <button
              type="button"
              onClick={() => toggleSort("version")}
              className="col-span-1 inline-flex items-center justify-center hover:text-dust-900"
              title="Sort by version"
            >
              Version
              <SortIcon active={sort.key === "version"} dir={sort.dir} />
            </button>

            <button
              type="button"
              onClick={() => toggleSort("updated")}
              className="col-span-2 inline-flex items-center justify-center hover:text-dust-900"
              title="Sort by updated date"
            >
              Updated
              <SortIcon active={sort.key === "updated"} dir={sort.dir} />
            </button>

            <div className="col-span-1 text-right">{/* actions */}</div>
          </div>

          {/* Body */}
          <div className="divide-y divide-black/10">
            {sortedRows.map((r) => {
              const isActive = !!r.is_active;

              return (
                <div
                  key={r.id}
                  onClick={() => onSelect?.(r.id)}
                  className={cx(
                    "grid grid-cols-12 gap-2 px-4 py-3 text-sm items-center",
                    "cursor-pointer transition-colors",
                    r.id === selectedId ? "bg-fern-500/10" : "hover:bg-dust-100/70"
                  )}
                >
                  <div className="col-span-5 font-medium text-dust-900 flex items-center gap-2 min-w-0">
                    {isActive && (
                      <span
                        className="shrink-0 inline-flex items-center rounded-full bg-fern-100 px-2 py-0.5 text-xs font-semibold text-fern-700"
                        title="Active team"
                      >
                        Active
                      </span>
                    )}
                    <span className="truncate">{r.name ?? "Untitled team"}</span>
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
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
