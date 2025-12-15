import React from "react";
import { KpiCard } from "./KpiCard";
import { PrimaryLeakCard, PrimaryLeakKpi } from "./PrimaryLeakCard";

type KpiCardsRowProps = {
  wins: number;
  losses: number;
  clutchPercent: number;
  primaryLeak: PrimaryLeakKpi;
};

export default function KpiCardsRow({
  wins,
  losses,
  clutchPercent,
  primaryLeak,
}: KpiCardsRowProps) {
  const total = wins + losses;
  const winRate = total > 0 ? Math.round((wins / total) * 100) : 0;

  return (
    <div className="grid grid-cols-1 gap-8 sm:grid-cols-4">
      <KpiCard
        title="Overall Record"
        value={`${wins} – ${losses}`}
        sub={`${total} games`}
      />

      <KpiCard
        title="Overall Winrate"
        value={`${winRate}%`}
        sub="All formats"
        accent="positive"
      />

      <KpiCard
        title="Clutch Factor"
        value={`${clutchPercent}%`}
        sub="Close games"
        accent="warning"
      />

      <PrimaryLeakCard
        label={primaryLeak.label}
        impactPercent={primaryLeak.impactPercent}
        onFix={primaryLeak.onFix}
      />
    </div>
  );
}