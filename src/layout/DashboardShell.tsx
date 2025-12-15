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

export function DashboardShell({ pages }: Props) {
  const [collapsed, setCollapsed] = usePersistedState<boolean>(
    "pm.sidebar.collapsed",
    false
  );

  const [active, setActiveRaw] = usePersistedState<NavKey>(
    "pm.sidebar.active",
    "dashboard"
  );

  // Guard against stale values if NavKey changes later
  const activeSafe: NavKey = isNavKey(active) ? active : "dashboard";
  const setActive = (k: NavKey) => setActiveRaw(k);

  return (
    <div className="h-screen w-screen overflow-hidden bg-dust-50 text-dust-900">
      <div className="flex h-full min-w-0">
        <Sidebar
          active={activeSafe}
          collapsed={collapsed}
          onToggle={() => setCollapsed((v) => !v)}
          onSelect={setActive}
        />
        <main className="flex-1 min-w-0 overflow-auto">{pages[activeSafe]}</main>
      </div>
    </div>
  );
}