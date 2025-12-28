import React from "react";
import {
  LayoutDashboard,
  Activity,
  ListChecks,
  GraduationCap,
  Swords,
  Users,
  BookOpen,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  User,
} from "lucide-react";

type NavKey =
  | "dashboard"
  | "live"
  | "reviews"
  | "paths"
  | "practice"
  | "teams"
  | "pokedex"
  | "settings";

type SidebarProps = {
  active?: NavKey;
  collapsed: boolean;
  onToggle: () => void;
  onSelect?: (key: NavKey) => void;

  showdownUsername?: string | null;
  aiConnected?: boolean;
  onOpenSettings?: () => void; // called when user clicks footer row/button
};

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

const NAV: Array<{ key: NavKey; label: string; Icon: React.ElementType }> = [
  { key: "dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { key: "live", label: "Live Coaching", Icon: Activity },
  { key: "reviews", label: "Battle Reviews", Icon: ListChecks },
  { key: "paths", label: "Learning Paths", Icon: GraduationCap },
  { key: "practice", label: "Practice Scenarios", Icon: Swords },
  { key: "teams", label: "Teams", Icon: Users },
  { key: "pokedex", label: "Pokedex", Icon: BookOpen },
  { key: "settings", label: "Settings", Icon: Settings },
];

export default function Sidebar({
  active = "dashboard",
  collapsed,
  onToggle,
  onSelect,
  showdownUsername,
  aiConnected = true,
  onOpenSettings,
}: SidebarProps) {
  const showDisconnected = !aiConnected;
  return (
    <aside
      className={cx(
        "h-full shrink-0 bg-[#3F5A3F] text-[#F3F1E7] border-r border-black/10",
        "transition-[width] duration-200 ease-out",
        collapsed ? "w-[84px]" : "w-[230px]"
      )}
    >
      <div className={cx("flex h-full flex-col py-6", collapsed ? "px-2" : "px-4")}>
        {/* Top status row */}
        <div className="flex items-center justify-between gap-2">
          <div
            className={cx("flex items-center gap-3 rounded-2xl px-2 py-2", collapsed && "justify-center")}
            title={showDisconnected ? "No AI Connected" : undefined}
          >
            <span className={cx("h-3 w-3 rounded-full", showDisconnected ? "bg-red-400" : "bg-[#7BE27B]")} />
            {!collapsed ? (
              <span className="text-sm opacity-90">
                {showDisconnected ? "Disconnected" : "Connected"}
              </span>
            ) : null}
          </div>

          <button
            onClick={onToggle}
            className={cx(
              "rounded-xl bg-white/10 p-2 hover:bg-white/15 transition",
              collapsed && "ml-auto"
            )}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={collapsed ? "Expand" : "Collapse"}
          >
            {collapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>

        {/* Nav */}
        <nav className="mt-6 space-y-2">
          {NAV.map(({ key, label, Icon }) => {
            const isActive = key === active;

            return (
              <button
                key={key}
                onClick={() => onSelect?.(key)}
                className={cx(
                  "w-full rounded-2xl px-3 py-3 text-left transition",
                  "hover:bg-white/10",
                  isActive && "bg-white/10",
                  collapsed && "flex items-center justify-center"
                )}
                title={collapsed ? label : undefined}
              >
                <div className={cx("flex items-center gap-3", collapsed && "justify-center")}>
                  <Icon size={18} className={cx(isActive ? "opacity-100" : "opacity-90")} />
                  {!collapsed ? <span className="text-[15px]">{label}</span> : null}
                </div>
              </button>
            );
          })}
        </nav>

        {/* Footer: Showdown identity */}
        <div className="mt-auto pt-4 space-y-3">
          {showdownUsername?.trim() ? (
            <button
              type="button"
              onClick={() => onOpenSettings?.()}
              className={cx(
                "w-full rounded-2xl px-3 py-2 transition",
                "hover:bg-white/10",
                collapsed ? "flex items-center justify-center" : "flex items-center gap-2"
              )}
              title="Open Settings"
            >
              <User size={16} className="opacity-80" />
              {!collapsed ? (
                <span className="truncate text-sm font-semibold opacity-90">
                  {showdownUsername}
                </span>
              ) : null}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onOpenSettings?.()}
              className={cx(
                "w-full rounded-2xl bg-white/10 px-3 py-2 text-sm font-semibold transition",
                "hover:bg-white/15",
                collapsed && "text-[11px] px-2"
              )}
              title="Set Pokémon Showdown username"
            >
              {collapsed ? "Set" : "Set Showdown username"}
            </button>
          )}
          <div className={cx("text-s opacity-70 text-center", collapsed && "text-center")}>
            {!collapsed ? "PokeMentor" : "PM"}
          </div>
        </div>
      </div>
    </aside>
  );
}
