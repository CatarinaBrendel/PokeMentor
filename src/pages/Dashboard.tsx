import {useState} from "react";
import DashboardShell from "../layout/DashboardShell";
import KpiCardsRow from "../ui/KpiCardsRow";
import FixLeakModal from "../features/coaching/FixLeakModal";

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
            onFix: () => setActiveLeak("Over-switching")
          }}
          />
      </div>

      {activeLeak && (
        <FixLeakModal
        open={activeLeak !== null}
        leak={activeLeak ?? ""}
        onClose={() => setActiveLeak(null)}
        onStartDrill={() => setActiveLeak(null)}
        />
      )}
    </>
  );
}

export default function Dashboard() {
  return (
    <DashboardShell>
      <DashboardMain />
    </DashboardShell>
  );
}