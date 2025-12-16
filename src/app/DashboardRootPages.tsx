import { useEffect, useState } from "react";
import { DashboardShell, NavKey } from "../layout/DashboardShell";
import KpiCardsRow from "../shared/ui/KpiCardsRow";
import FixLeakModal from "../features/coaching/ui/FixLeakModal";
import { TeamsPage } from "../pages/teams/TeamsPage";
import ActiveTeamCard from "../shared/ui/ActiveTreamCard";
import { TeamsApi } from "../features/teams/api/teams.api";
import type { TeamListRow } from "../features/teams/ui/TeamsView";
import { usePersistedState } from "../shared/hooks/usePersistedState";

function DashboardMain({ onGoTeams }: { onGoTeams: (teamid? : string) => void }) {
  const [activeLeak, setActiveLeak] = useState<string | null>(null);

  const [activeTeam, setActiveTeam] = useState<TeamListRow | null>(null);
  const [activeTeamLoading, setActiveTeamLoading] = useState(false);
  const [activeTeamError, setActiveTeamError] = useState<string | null>(null);

  const [, setSelectedTeamId] = usePersistedState<string | null>(
    "teams.selectedTeamId",
    null
  );
  const [, setTeamsTab] = usePersistedState<"import" | "list">("teams.tab", "import");

  useEffect(() => {
    let cancelled = false;
    setActiveTeamLoading(true);
    setActiveTeamError(null);

    TeamsApi.getActiveSummary()
      .then((t) => {
        if (cancelled) return;
        setActiveTeam(t);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setActiveTeamError(e instanceof Error ? e.message : "Failed to load active team.");
      })
      .finally(() => {
        if (cancelled) return;
        setActiveTeamLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function openTeams() {
    setTeamsTab("list");
    onGoTeams();
  }

  function openActiveTeam(teamId: string) {
    setSelectedTeamId(teamId);
    setTeamsTab("list");
    onGoTeams(teamId);
  }

  return (
    <>
      <div className="w-full p-8 space-y-6">
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

        <ActiveTeamCard
          team={activeTeam}
          loading={activeTeamLoading}
          error={activeTeamError}
          onOpenTeams={openTeams}
          onOpenTeam={openActiveTeam}
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
  const [page, setPage] = useState<NavKey>("dashboard");
  const [openTeamId, setOpenTeamId] = useState<string | null>(null);

  const pagesDef: Record<NavKey, React.ReactNode> = {
    dashboard: (
      <DashboardMain
        onGoTeams={(teamId?: string) => {
          if (teamId) setOpenTeamId(teamId);
          setPage("teams");
        }}
      />
    ),
    teams: <TeamsPage initialOpenTeamId={openTeamId} />,
    live: <div className="p-8">Live Coaching (todo)</div>,
    reviews: <div className="p-8">Battle Reviews (todo)</div>,
    paths: <div className="p-8">Learning Paths (todo)</div>,
    practice: <div className="p-8">Practice Scenarios (todo)</div>,
    pokedex: <div className="p-8">Pokedex (todo)</div>,
    settings: <div className="p-8">Settings (todo)</div>,
  };

  return (
    <DashboardShell
      activePage={page}
      onNavigate={(next) => {
        setPage(next);
        if (next !== "teams") setOpenTeamId(null); // clear one-shot intent when leaving Teams
      }}
      pages={pagesDef}
    />
  );
}