// src/pages/DashboardRootPage.tsx
import { useState } from "react";
import { DashboardShell } from "../layout/DashboardShell";
import KpiCardsRow from "../ui/KpiCardsRow";
import FixLeakModal from "../features/coaching/FixLeakModal";
import { TeamsPage } from "./TeamsPage";

function DashboardMain() {
  const [activeLeak, setActiveLeak] = useState<string | null>(null);

  return (
    <>
      <div className="w-full p-8">
        <KpiCardsRow
          wins={18}
          losses={11}
          clutchPercent={42}
          primaryLeak={{
            label: "Over-switching",
            impactPercent: 14,
            onFix: () => setActiveLeak("Over-switching"),
          }}
        />
      </div>

      <FixLeakModal
        open={activeLeak !== null}
        leak={activeLeak ?? ""}
        onClose={() => setActiveLeak(null)}
        onStartDrill={() => setActiveLeak(null)}
      />
    </>
  );
}

export default function DashboardRootPage() {
  return (
    <DashboardShell
      pages={{
        dashboard: <DashboardMain />,
        teams: <TeamsPage />,
        live: <div className="p-8">Live Coaching (todo)</div>,
        reviews: <div className="p-8">Battle Reviews (todo)</div>,
        paths: <div className="p-8">Learning Paths (todo)</div>,
        practice: <div className="p-8">Practice Scenarios (todo)</div>,
        pokedex: <div className="p-8">Pokedex (todo)</div>,
        settings: <div className="p-8">Settings (todo)</div>,
      }}
    />
  );
}