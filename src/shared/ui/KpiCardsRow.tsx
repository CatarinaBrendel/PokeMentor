import React from "react";
import { KpiCard } from "./KpiCard";

type KpiCardsRowProps = {
  battlesTotal: number;
  wins: number;
  losses: number;
  winratePercent: number;
  teamsTotal: number;
  teamVersionsTotal: number;
};

export default function KpiCardsRow({
  battlesTotal,
  wins,
  losses,
  winratePercent,
  teamsTotal,
  teamVersionsTotal,
}: KpiCardsRowProps) {

  const decided = wins + losses;
  return (
    <div className="grid grid-cols-1 gap-8 sm:grid-cols-4">
      <KpiCard
        title="Imported Battles"
        value={`${battlesTotal}`}
        sub="With identified user side"
      />

      <KpiCard
        title="Overall Record"
        value={`${wins} – ${losses}`}
        sub={decided > 0 ? `${decided} decided games` : "No decided games yet"}
      />

      <KpiCard
        title="Overall Winrate"
        value={decided > 0 ? `${winratePercent}%` : "—"}
        sub={decided > 0 ? "All formats" : "No decided games yet"}
        accent={decided > 0 ? "positive" : undefined}
      />

      <KpiCard
        title="Teams Imported"
        value={`${teamsTotal}`}
        sub={`${teamVersionsTotal} versions`}
      />
    </div>
  );
}