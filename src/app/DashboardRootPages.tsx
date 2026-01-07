import { useEffect, useState, type ReactNode } from "react";
import { DashboardShell, NavKey } from "../layout/DashboardShell";
import KpiCardsRow from "../shared/ui/KpiCardsRow";
import FixLeakModal from "../features/coaching/ui/FixLeakModal";
import { TeamsPage } from "../pages/teams/TeamsPage";
import { BattlesPage } from "../pages/battles/BattlesPage";
import ActiveTeamCard from "../shared/ui/ActiveTreamCard";
import { TeamsApi } from "../features/teams/api/teams.api";
import type { TeamListRow } from "../features/teams/ui/TeamsView";
import { usePersistedState } from "../shared/hooks/usePersistedState";
import { ActiveTeamActivity } from "../features/teams/model/teams.types";
import ActiveTeamActivityCard from "../shared/ui/ActiveTeamActivityCard";
import { SettingsPage } from "../pages/settings/SettingsPage";
import { SettingsApi } from "../features/settings/api/settings.api";
import { PracticeScenarioIntent } from "../pages/practice/PracticeScenariosPage";
import PracticeScenariosPage from "../pages/practice/PracticeScenariosPage";
import { DashboardApi } from "../features/dashboard/api/dashboard.api";
import type { DashboardKpis } from "../features/dashboard/model/dashboard.types";

function DashboardMain({ onGoTeams }: { onGoTeams: (teamid?: string) => void }) {
  const [activeLeak, setActiveLeak] = useState<string | null>(null);

  const [activeTeam, setActiveTeam] = useState<TeamListRow | null>(null);
  const [activeTeamLoading, setActiveTeamLoading] = useState(false);
  const [activeTeamError, setActiveTeamError] = useState<string | null>(null);

  const [activeActivity, setActiveActivity] = useState<ActiveTeamActivity | null>(null);

  const [, setSelectedTeamId] = usePersistedState<string | null>(
    "teams.selectedTeamId",
    null
  );
  const [, setTeamsTab] = usePersistedState<"import" | "list">("teams.tab", "import");

  const [kpis, setKpis] = useState<DashboardKpis | null>(null);
  const [kpisLoading, setKpisLoading] = useState(false);
  const [kpisError, setKpisError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setKpisLoading(true);
    setKpisError(null);

    DashboardApi.getKpis()
      .then((x) => {
        if (cancelled) return;
        setKpis(x);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setKpisError(e instanceof Error ? e.message : "Failed to load dashboard KPIs.");
      })
      .finally(() => {
        if (cancelled) return;
        setKpisLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setActiveTeamLoading(true);
    setActiveTeamError(null);

    TeamsApi.getActiveActivity()
      .then((a) => {
        if (cancelled) return;
        setActiveActivity(a);
        setActiveTeam(a.activeTeam);
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
          battlesTotal={kpis?.battles_total ?? 0}
          wins={kpis?.wins ?? 0}
          losses={kpis?.losses ?? 0}
          winratePercent={kpis?.winrate_percent ?? 0}
          teamsTotal={kpis?.teams_total ?? 0}
          teamVersionsTotal={kpis?.team_versions_total ?? 0}
        />

        {kpisLoading ? (
          <div className="text-sm text-black/50">Loading stats…</div>
        ) : null}

        {kpisError ? (
          <div className="text-sm text-red-600">{kpisError}</div>
        ) : null}

        <ActiveTeamCard
          team={activeTeam}
          loading={activeTeamLoading}
          error={activeTeamError}
          onOpenTeams={openTeams}
          onOpenTeam={openActiveTeam}
        />

        <ActiveTeamActivityCard
          activity={activeActivity}
          onOpenLastBattle={() => {
            window.__toast?.("Battle reviews are coming soon.", "success");
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
  const [page, setPage] = useState<NavKey>("dashboard");
  const [openTeamId, setOpenTeamId] = useState<string | null>(null);
  const [practiceIntent, setPracticeIntent] = useState<PracticeScenarioIntent | null>(null);

  const [showdownUsername, setShowdownUsername] = useState<string | null>(null);
  const [aiConnected, setAiConnected] = useState<boolean>(true);

  const pagesDef: Record<NavKey, ReactNode> = {
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
    reviews: <BattlesPage />,
    paths: <div className="p-8">Learning Paths (todo)</div>,
    practice: (
      <PracticeScenariosPage
        initialIntent={practiceIntent}
        onConsumedIntent={() => setPracticeIntent(null)}
      />
    ),
    pokedex: <div className="p-8">Pokedex (todo)</div>,
    settings: <SettingsPage />,
  };

  async function refreshSettings() {
    try {
      const s = await SettingsApi.get();
      setShowdownUsername(s.showdown_username ?? null);
      const hasKey = Boolean(s.openrouter_api_key && s.openrouter_api_key.trim());
      setAiConnected(Boolean(s.ai_enabled ?? true) && hasKey);
    } catch {
      setShowdownUsername(null);
      setAiConnected(false);
    }
  }

  useEffect(() => {
    refreshSettings();

    const onChanged = () => refreshSettings();
    window.addEventListener("pm:settings-changed", onChanged);
    return () => window.removeEventListener("pm:settings-changed", onChanged);
  }, []);

  // Global navigation intent: create a practice scenario from a battle turn.
  useEffect(() => {
    const onCreate = (ev: Event) => {
      const e = ev as CustomEvent<{ battleId: string; turnNumber: number }>;
      if (!e.detail?.battleId || !e.detail?.turnNumber) return;

      setPracticeIntent({ battleId: e.detail.battleId, turnNumber: e.detail.turnNumber });
      setPage("practice");
    };

    window.addEventListener("pm:create-practice-scenario", onCreate as EventListener);
    return () =>
      window.removeEventListener("pm:create-practice-scenario", onCreate as EventListener);
  }, []);

  return (
    <DashboardShell
      activePage={page}
      onNavigate={(next) => {
        setPage(next);

        // clear one-shot intent when leaving Teams
        if (next !== "teams") setOpenTeamId(null);

        // clear one-shot intent when leaving Practice
        if (next !== "practice") setPracticeIntent(null);
      }}
      pages={pagesDef}
      showdownUsername={showdownUsername}
      aiConnected={aiConnected}
      onOpenShowdownSettings={() => setPage("settings")}
    />
  );
}