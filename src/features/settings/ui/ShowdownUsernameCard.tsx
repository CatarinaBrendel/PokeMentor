import * as React from "react";
import { SettingsApi } from "../api/settings.api";

function toast(message: string, type: "success" | "error") {
  window.__toast?.(message, type);
}

export function ShowdownUsernameCard() {
  const [value, setValue] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    (async () => {
        try {
        if (!window.api?.settings) {
            throw new Error("Settings API not available. Check preload exposeInMainWorld('api').");
        }
        const s = await SettingsApi.get();
        setValue(s.showdown_username ?? "");
        } catch (e) {
        toast(e instanceof Error ? e.message : String(e), "error");
        } finally {
        setLoading(false);
        }
    })();
    }, []);

  async function onSave() {
    setSaving(true);
    try {
      const next = await SettingsApi.update({ showdown_username: value });
      setValue(next.showdown_username ?? "");
      toast("Saved Pokémon Showdown username.", "success");
      window.dispatchEvent(new Event("pm:settings-changed"));
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-3xl bg-white/70 p-5 ring-1 ring-black/10">
        <div className="text-sm font-semibold text-black/80">Pokémon Showdown</div>
        <div className="mt-1 text-sm text-black/55">
            Used to identify which side is “you” in imported replays.
        </div>

        <div className="mt-4 flex items-center gap-3">
        <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            disabled={loading || saving}
            placeholder="e.g. PtScan"
            className="h-10 w-72 rounded-2xl bg-white/70 px-4 text-sm ring-1 ring-black/10 placeholder:text-black/30 focus:outline-none focus:ring-2 focus:ring-black/15"
        />
        <button
            type="button"
            onClick={onSave}
            disabled={loading || saving}
            className="h-10 rounded-2xl bg-pine-700 px-4 text-sm font-semibold text-sage-50 ring-1 ring-black/10 hover:bg-pine-500 disabled:cursor-not-allowed disabled:bg-black/10 disabled:text-black/40"
        >
            {saving ? "Saving…" : "Save"}
        </button>
        </div>
    </div>
    );
}