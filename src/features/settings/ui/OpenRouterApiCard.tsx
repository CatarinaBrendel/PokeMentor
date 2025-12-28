import * as React from "react";
import { SettingsApi } from "../api/settings.api";

function toast(message: string, type: "success" | "error") {
  window.__toast?.(message, type);
}

export function OpenRouterApiCard() {
  const [apiKey, setApiKey] = React.useState("");
  const [model, setModel] = React.useState("openrouter/auto");
  const [aiEnabled, setAiEnabled] = React.useState(true);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [reveal, setReveal] = React.useState(false);

  React.useEffect(() => {
    (async () => {
      try {
        const s = await SettingsApi.get();
        setApiKey(s.openrouter_api_key ?? "");
        setModel(s.openrouter_model ?? "openrouter/auto");
        setAiEnabled(s.ai_enabled ?? true);
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
        openrouter_api_key: apiKey,
        openrouter_model: model,
        ai_enabled: aiEnabled,
      });
      setApiKey(next.openrouter_api_key ?? "");
      setModel(next.openrouter_model ?? "openrouter/auto");
      setAiEnabled(next.ai_enabled ?? true);
      toast("Saved OpenRouter API settings.", "success");
      window.dispatchEvent(new Event("pm:settings-changed"));
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-3xl bg-white/70 p-5 ring-1 ring-black/10">
      <div className="text-sm font-semibold text-black/80">OpenRouter</div>
      <div className="mt-1 text-sm text-black/55">
        Provide an API key to enable AI-assisted Information.
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,1fr)_220px]">
        <div>
          <label className="text-xs font-medium text-black/60" htmlFor="openrouter-api-key">
            API key
          </label>
          <div className="mt-2 flex items-center gap-2">
            <input
              id="openrouter-api-key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              disabled={loading || saving}
              type={reveal ? "text" : "password"}
              placeholder="sk-or-..."
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
          <label className="text-xs font-medium text-black/60" htmlFor="openrouter-model">
            Model
          </label>
          <input
            id="openrouter-model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            disabled={loading || saving}
            placeholder="openrouter/auto"
            className="mt-2 h-10 w-full rounded-2xl bg-white/70 px-4 text-sm ring-1 ring-black/10 placeholder:text-black/30 focus:outline-none focus:ring-2 focus:ring-black/15"
          />
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl bg-white/70 px-4 py-3 ring-1 ring-black/10">
        <div>
          <div className="text-sm font-semibold text-black/75">AI assistant</div>
          <div className="text-xs text-black/50">Enable or disable AI-assisted features.</div>
        </div>
        <button
          type="button"
          onClick={() => setAiEnabled((prev) => !prev)}
          disabled={loading || saving}
          className={[
            "relative h-8 w-14 rounded-full transition",
            aiEnabled ? "bg-fern-500/80" : "bg-black/10",
            loading || saving ? "opacity-60" : "hover:opacity-90",
          ].join(" ")}
          aria-pressed={aiEnabled}
        >
          <span
            className={[
              "absolute top-1 h-6 w-6 rounded-full bg-white shadow transition",
              aiEnabled ? "left-7" : "left-1",
            ].join(" ")}
          />
        </button>
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
