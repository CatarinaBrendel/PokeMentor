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
  const [listError, setListError] = React.useState<string | null>(null);
  const [detailsError, setDetailsError] = React.useState<string | null>(null);

  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [details, setDetails] = useState<TeamDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  const listReqId = React.useRef(0);
  const detailsReqId = React.useRef(0);

  useEffect(() => {
    if (!selectedTeamId) return;

    const reqId = ++detailsReqId.current;

    setDetailsLoading(true);
    setDetails(null);
    setDetailsError(null);

    TeamsApi.getDetails(selectedTeamId)
      .then((d) => {
        if (reqId !== detailsReqId.current) return;
        setDetails(d);
      })
      .catch((e: unknown) => {
        if (reqId !== detailsReqId.current) return;
        setDetailsError(e instanceof Error ? e.message : "Failed to load team details.");
      })
      .finally(() => {
        if (reqId !== detailsReqId.current) return;
        setDetailsLoading(false);
      });
  }, [selectedTeamId]);

  const loadTeams = React.useCallback(async () => {
    const reqId = ++listReqId.current;

    setLoading(true);

    try {
      const data = await TeamsApi.listTeams();
      if (reqId === listReqId.current) {
        setRows(data);
        setListError(null);
      }
    } catch (e: unknown) {
      if (reqId === listReqId.current) {
        setListError(e instanceof Error ? e.message : "Failed to load teams.");
      }
    } finally {
      if (reqId === listReqId.current) {
        setLoading(false);
      }
    }
  }, []);

  async function onDeleteTeam(teamId: string) {
    const ok = window.confirm("Delete this team? This cannot be undone.");
    if (!ok) return;

    if (selectedTeamId === teamId) {
      setSelectedTeamId(null);
      setDetails(null);
    }

    try {
      await TeamsApi.deleteTeam(teamId);
      await loadTeams();
    } catch (e: unknown) {
      setListError(e instanceof Error ? e.message : "Failed to delete team.");
    }
  }

  const handleSetActiveTeam = React.useCallback(
    async (teamId: string) => {
      await TeamsApi.setTeamActive(teamId);

      // refresh list through the guarded loader
      await loadTeams();

      // refresh details (guarded)
      const reqId = ++detailsReqId.current;
      setDetailsLoading(true);
      setDetailsError(null);
      try {
        const nextDetails = await TeamsApi.getDetails(teamId);
        if (reqId !== detailsReqId.current) return;
        setDetails(nextDetails);
      } catch (e: unknown) {
        if (reqId !== detailsReqId.current) return;
        setDetailsError(e instanceof Error ? e.message : "Failed to load team details.");
      } finally {
        if (reqId !== detailsReqId.current) {
          setDetailsLoading(false);
        }
      }
    },
    [loadTeams]
  );  

  useEffect(() => {
    if (tab === "list") void loadTeams();

    if (tab !== "list") {
      setSelectedTeamId(null);
      setDetails(null);
    }
  }, [tab, loadTeams]);

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
            error={detailsLoading ? null : listError}
            selectedId={selectedTeamId}
            onSelect={setSelectedTeamId}
            onDelete={onDeleteTeam}
          />

          {selectedTeamId ? (
            detailsLoading ? (
              <div className="text-sm text-dust-50">Loading team details…</div>
            ) : details ? (
              <TeamDetailsPanel
                data={details}
                onClose={() => {
                  setSelectedTeamId(null);
                  setDetailsError(null);
                }}
                onSetActive={handleSetActiveTeam}
              />
            ) : detailsError ? (
              <div className="text-sm text-red-700">{detailsError}</div>
            ) : null
          ) : null}
        </>
      )}
    </div>
  );
}