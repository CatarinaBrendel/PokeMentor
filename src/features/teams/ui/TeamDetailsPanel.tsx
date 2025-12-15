import type { TeamDetails } from "../model/teams.types";

type Props = {
  data: TeamDetails;
  onClose: () => void;
};

export default function TeamDetailsPanel({ data, onClose }: Props) {
  const { team, latestVersion, slots } = data;

  return (
    <div className="fixed right-0 top-0 h-full w-[420px]
                    bg-dust-50 ring-1 ring-black/10 p-6 overflow-auto">
      {/* Header */}
      <div className="flex justify-between items-center mb-2">
        <h2 className="text-lg font-semibold">
          {team.name ?? "Untitled team"}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close team details"
          className="
            cursor-pointer
            rounded-lg
            px-2 py-1
            text-dust-600
            hover:bg-dust-200
            hover:text-dust-900
            focus:outline-none
            focus:ring-2
            focus:ring-fern-500/40
          "
        >
          ✕
        </button>
      </div>

      {/* Team meta */}
      <div className="space-y-1 mb-4 text-sm text-dust-600">
        <div>
          <span className="font-medium text-dust-700">Format:</span>{" "}
          {team.format_ps ?? "—"}
        </div>

        {latestVersion && (
          <div className="text-xs text-dust-500">
            Version v{latestVersion.version_num} ·{" "}
            Imported {new Date(latestVersion.created_at).toLocaleDateString()}
          </div>
        )}
      </div>

      {/* Divider */}
      <div className="my-4 h-px bg-black/10" />

      {/* Pokémon slots */}
      <div className="space-y-3">
        {slots.map((s) => (
          <div
            key={s.slot_index}
            className="rounded-xl bg-white p-3 ring-1 ring-black/5"
          >
            <div className="font-medium">
              {s.nickname ?? s.species_name}
            </div>
            <div className="text-xs text-dust-600">
              {s.item_name ?? "No item"} · {s.ability_name ?? "No ability"}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}