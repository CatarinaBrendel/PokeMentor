import * as React from "react";
import { SettingsApi } from "../api/settings.api";

function toast(message: string, type: "success" | "error") {
  window.__toast?.(message, type);
}

export function GrokApiCard() {
  const [apiKey, setApiKey] = React.useState("");
  const [model, setModel] = React.useState("grok-2-latest");
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [reveal, setReveal] = React.useState(false);

  React.useEffect(() => {
    (async () => {
      try {
        const s = await SettingsApi.get();
        setApiKey(s.grok_api_key ?? "");
        setModel(s.grok_model ?? "grok-2-latest");
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
      const next = await SettingsApi.update({
        grok_api_key: apiKey,
        grok_model: model,
      });
      setApiKey(next.grok_api_key ?? "");
      setModel(next.grok_model ?? "grok-2-latest");
      toast("Saved Grok API settings.", "success");
      window.dispatchEvent(new Event("pm:settings-changed"));
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-3xl bg-white/70 p-5 ring-1 ring-black/10">
      <div className="text-sm font-semibold text-black/80">Grok AI</div>
      <div className="mt-1 text-sm text-black/55">
        Provide an API key to enable AI-assisted EV training recipes.
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
        <div>
          <label className="text-xs font-medium text-black/60" htmlFor="grok-api-key">
            API key
          </label>
          <div className="mt-2 flex items-center gap-2">
            <input
              id="grok-api-key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              disabled={loading || saving}
              type={reveal ? "text" : "password"}
              placeholder="xai-..."
              className="h-10 w-full rounded-2xl bg-white/70 px-4 text-sm ring-1 ring-black/10 placeholder:text-black/30 focus:outline-none focus:ring-2 focus:ring-black/15"
            />
            <button
              type="button"
              onClick={() => setReveal((prev) => !prev)}
              className="h-10 rounded-2xl px-3 text-xs font-semibold text-black/60 ring-1 ring-black/10 hover:bg-black/5"
            >
              {reveal ? "Hide" : "Show"}
            </button>
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-black/60" htmlFor="grok-model">
            Model
          </label>
          <input
            id="grok-model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            disabled={loading || saving}
            placeholder="grok-2-latest"
            className="mt-2 h-10 w-full rounded-2xl bg-white/70 px-4 text-sm ring-1 ring-black/10 placeholder:text-black/30 focus:outline-none focus:ring-2 focus:ring-black/15"
          />
        </div>
      </div>

      <div className="mt-4 flex justify-end">
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
