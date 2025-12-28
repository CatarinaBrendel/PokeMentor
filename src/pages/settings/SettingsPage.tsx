import { ShowdownUsernameCard } from "../../features/settings/ui/ShowdownUsernameCard";
import { GrokApiCard } from "../../features/settings/ui/GrokApiCard";

export function SettingsPage() {
  return (
    <div className="w-full p-8 space-y-6">
      <div>
        <div className="text-3xl font-semibold tracking-tight">Settings</div>
        <div className="mt-2 text-sm text-black/50">
          Configure identity, integrations, and AI.
        </div>
      </div>

      <ShowdownUsernameCard />
      <GrokApiCard />
    </div>
  );
}
