import React from "react";

export type TeamsTab = "import" | "list";

type Props = {
  active: TeamsTab;
  onChange: (tab: TeamsTab) => void;
};

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export default function TeamsNavbar({ active, onChange }: Props) {
  const tabs: Array<{ key: TeamsTab; label: string }> = [
    { key: "import", label: "Import" },
    { key: "list", label: "All Teams" },
  ];

  return (
    <div className="flex items-center justify-between gap-4">
      <h1 className="text-2xl font-semibold text-dust-900">Teams</h1>

      <div className="rounded-2xl bg-dust-100 p-1 ring-1 ring-black/5">
        <div className="flex gap-1">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => onChange(t.key)}
              className={cx(
                "rounded-2xl px-4 py-2 text-sm font-medium transition",
                active === t.key
                  ? "bg-dust-50 text-dust-900 ring-1 ring-black/10"
                  : "text-dust-600 hover:bg-black/5"
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}