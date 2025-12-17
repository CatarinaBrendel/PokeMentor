// src/layout/DashboardShell.tsx
import React from "react";
import Sidebar from "./Sidebar";
import { usePersistedState } from "../shared/hooks/usePersistedState";

export type NavKey =
  | "dashboard"
  | "live"
  | "reviews"
  | "paths"
  | "practice"
  | "teams"
  | "pokedex"
  | "settings";

type Props = {
  pages: Record<NavKey, React.ReactNode>;
  activePage?: NavKey;
  onNavigate?: (page: NavKey) => void;
  showdownUsername?: string | null;
  onOpenShowdownSettings?: () => void;
};

function isNavKey(v: unknown): v is NavKey {
  return (
    v === "dashboard" ||
    v === "live" ||
    v === "reviews" ||
    v === "paths" ||
    v === "practice" ||
    v === "teams" ||
    v === "pokedex" ||
    v === "settings"
  );
}

export function DashboardShell({ pages, activePage, onNavigate, showdownUsername, onOpenShowdownSettings }: Props) {
  const [collapsed, setCollapsed] = usePersistedState<boolean>(
    "pm.sidebar.collapsed",
    false
  );

  const [activePersisted, setActivePersisted] = usePersistedState<NavKey>(
    "pm.sidebar.active",
    "dashboard"
  );

  const persistedSafe: NavKey = isNavKey(activePersisted) ? activePersisted : "dashboard";

  // If parent controls activePage, use it; otherwise use persisted.
  const activeSafe: NavKey = activePage ?? persistedSafe;

  function setActive(next: NavKey) {
    // Always keep persisted value in sync (useful even in controlled mode)
    setActivePersisted(next);
    onNavigate?.(next);
  }

  function openSettings() {
    if (onOpenShowdownSettings) {
      onOpenShowdownSettings();
      return;
    }
    setActive("settings"); // important: keeps persistence + parent navigation consistent
  }

  return (
    <div className="h-screen w-screen overflow-hidden bg-dust-50 text-dust-900">
      <div className="flex h-full min-w-0">
        <Sidebar
          active={activeSafe}
          collapsed={collapsed}
          onToggle={() => setCollapsed((v) => !v)}
          onSelect={setActive}
          showdownUsername={showdownUsername}
          onOpenSettings={openSettings}
        />
        <main className="flex-1 min-w-0 overflow-auto">{pages[activeSafe]}</main>
      </div>
    </div>
  );
}