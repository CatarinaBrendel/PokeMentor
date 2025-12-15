import React, { useState, useEffect } from "react";
import TeamImportCard from "../../features/teams/ui/TeamImportCard";
import TeamsNavbar, { TeamsTab } from "../../features/teams/ui/TeamsNavbar";
import TeamsView, { TeamListRow } from "../../features/teams/ui/TeamsView";
import { TeamsApi } from "../../features/teams/api/teams.api";
import { usePersistedState } from "../../shared/hooks/usePersistedState";
import type { TeamDetails } from "../../features/teams/model/teams.types";
import TeamDetailsPanel from "../../features/teams/ui/TeamDetailsPanel";

export function TeamsPage() {
  const [tab, setTab] = usePersistedState<TeamsTab>("teams.tab", "import");

  const [rows, setRows] = React.useState<TeamListRow[]>([]);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [details, setDetails] = useState<TeamDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  useEffect(() => {
    if (!selectedTeamId) return;

    setDetailsLoading(true);
    setDetails(null);

    TeamsApi.getDetails(selectedTeamId)
      .then(setDetails)
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Failed to load team details.");
      })
      .finally(() => setDetailsLoading(false));
  }, [selectedTeamId]);

  async function loadTeams() {
    setLoading(true);
    setError(null);
    try {
      const data = await TeamsApi.listTeams();
      setRows(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load teams.");
    } finally {
      setLoading(false);
    }
  }

  async function onDeleteTeam(teamId: string) {
    const ok = window.confirm("Delete this team? This cannot be undone.");
    if (!ok) return;

    // Clear details if we delete the selected team
    if (selectedTeamId === teamId) {
      setSelectedTeamId(null);
      setDetails(null);
    }

    setLoading(true);
    setError(null);

    try {
      await TeamsApi.deleteTeam(teamId);
      await loadTeams();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to delete team.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (tab === "list") void loadTeams();

    // optional: when switching tabs, clear selection/details
    if (tab !== "list") {
      setSelectedTeamId(null);
      setDetails(null);
    }
  }, [tab]);

  return (
    <div className="w-full p-8 space-y-6">
      <TeamsNavbar active={tab} onChange={setTab} />

      {tab === "import" ? (
        <TeamImportCard onImported={() => setTab("list")} />
      ) : (
        <>
          <TeamsView
            rows={rows}
            loading={loading}
            error={error}
            selectedId={selectedTeamId}
            onSelect={setSelectedTeamId}
            onDelete={onDeleteTeam}
          />

          {selectedTeamId ? (
            detailsLoading ? (
              <div className="text-sm text-dust-600">Loading team details…</div>
            ) : details ? (
              <TeamDetailsPanel
                data={details}
                onClose={() => {
                  setSelectedTeamId(null);
                  setDetails(null);
                }}
              />
            ) : (
              <div className="text-sm text-red-700">Failed to load team details.</div>
            )
          ) : null}
        </>
      )}
    </div>
  );
}