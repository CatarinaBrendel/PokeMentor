import React from "react";
import Sidebar from "./Sidebar";

export default function DashboardShell({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = React.useState(false);
  const [active, setActive] = React.useState<
    "dashboard" | "live" | "reviews" | "paths" | "practice" | "teams" | "pokedex" | "settings"
  >("dashboard");

  return (
    <div className="h-screen w-screen overflow-hidden bg-dust-50 text-dust-900">
      <div className="flex h-full min-w-0">
        <Sidebar
          active={active}
          collapsed={collapsed}
          onToggle={() => setCollapsed((v) => !v)}
          onSelect={(key) => setActive(key)}
        />

        <main className="flex-1 min-w-0 overflow-auto">{children}</main>
      </div>
    </div>
  );
}