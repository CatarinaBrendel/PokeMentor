type KpiCardProps = {
  title: string;
  value: string;
  sub?: string;
  accent?: "neutral" | "positive" | "warning";
};

export function KpiCard({
  title,
  value,
  sub,
  accent = "neutral",
}: KpiCardProps) {
  return (
    <div
      className="
        flex flex-col items-center justify-center
        rounded-3xl bg-dust-100
        px-2 py-6
        shadow-sm ring-1 ring-black/5
        text-center
      "
    >
      <div className="text-sm font-medium text-dust-600">
        {title}
      </div>

      <div
        className={`
          mt-3 text-4xl font-semibold
          ${accent === "positive" ? "text-sage-700" : ""}
          ${accent === "warning" ? "text-fern-700" : ""}
        `}
      >
        {value}
      </div>

      {sub && (
        <div className="mt-2 text-sm text-dust-500">
          {sub}
        </div>
      )}
    </div>
  );
}