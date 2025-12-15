export type PrimaryLeakKpi = {
  label: string;
  impactPercent: number;
  onFix?: () => void;
};

export function PrimaryLeakCard({ label, impactPercent, onFix }: PrimaryLeakKpi) {
  return (
    <div
      className="
        group relative
        flex flex-col items-center justify-center
        rounded-3xl bg-dust-100
        px-6 py-8
        text-center
        shadow-sm ring-1 ring-black/5
        transition
        hover:ring-black/10
        focus-within:ring-black/10
      "
    >
      <div className="text-sm font-medium text-dust-600">Primary Leak</div>

      <div className="mt-3 text-2xl font-semibold text-fern-700">{label}</div>

      <div className="mt-2 text-sm text-dust-500">–{impactPercent}% win impact</div>

      {/* Hover / focus CTA */}
      <div
        className="
          pointer-events-none
          absolute inset-x-0 bottom-4
          flex justify-center
          opacity-0 translate-y-1
          transition
          group-hover:opacity-100 group-hover:translate-y-0
          group-focus-within:opacity-100 group-focus-within:translate-y-0
        "
      >
        <button
          type="button"
          onClick={onFix}
          className="
            pointer-events-auto
            rounded-2xl bg-fern-700 px-4 py-2
            text-sm font-semibold text-dust-50
            shadow-sm
            hover:opacity-95
            focus:outline-none focus:ring-2 focus:ring-fern-500/40
          "
        >
          Fix this
        </button>
      </div>
    </div>
  );
}