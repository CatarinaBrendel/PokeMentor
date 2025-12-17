import * as React from "react";

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export default function Segmented<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: Array<{ value: T; label: string }>;
}) {
  return (
    <div className="flex items-center rounded-2xl bg-white/70 p-1 ring-1 ring-black/10">
      {options.map((o) => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            "h-8 rounded-xl px-3 text-sm",
            value === o.value ? "bg-black/10 text-black" : "text-black/55 hover:text-black/75"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}