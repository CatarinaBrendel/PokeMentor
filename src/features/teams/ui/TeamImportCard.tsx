import { useState } from "react";
import { TeamsApi } from "../api/teams.api";

type TeamImportCardProps = {
  onImported?: () => void;
};

export default function TeamImportCard({ onImported }: TeamImportCardProps) {
  const [url, setUrl] = useState("");
  const [paste, setPaste] = useState("");
  const [name, setName] = useState("");
  const [format, setFormat] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function getErrorMessage(err: unknown): string {
    if (err instanceof Error) return err.message;
    if (typeof err === "string") return err;
    return "Import failed.";
  }

  const hasUrl = url.trim().length > 0;
  const hasPaste = paste.trim().length > 0;
  const canImport = hasUrl || hasPaste;

  async function onImport() {
    setBusy(true);
    setStatus(null);

    try {
      const res = await TeamsApi.importPokepaste({
        url: hasPaste ? undefined : url.trim() || undefined,
        paste_text: hasPaste ? paste : undefined,
        name: name.trim() ? name : undefined,
        format_ps: format.trim() ? format : undefined,
      });

      setStatus(`Imported team v${res.version_num} (${res.slots_inserted} slots).`);
      setUrl("");
      setPaste("");
      setName("");
      setFormat("");
      onImported?.();
    } catch (err: unknown) {
      setStatus(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-3xl bg-dust-100 p-6 ring-1 ring-black/5">
      <div className="text-lg font-semibold text-dust-900">Import Team (Pokepaste)</div>

      <div className="mt-4 grid gap-3">
        <input
          className="rounded-2xl bg-dust-50 text-dust-900 placeholder:text-dust-400 px-4 py-3 text-sm ring-1 ring-black/10 focus:outline-none focus:ring-2 focus:ring-fern-500/30"
          placeholder="https://pokepast.es/37be82841138274a"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />

        <textarea
          className="min-h-[320px] max-h-[420px] resize-y rounded-2xl bg-dust-50 text-dust-900 placeholder:text-dust-400 px-4 py-3 text-sm ring-1 ring-black/10 focus:outline-none focus:ring-2 focus:ring-fern-500/30"
          placeholder={"Or paste Showdown export here…\n\nExample:\nTinkaton @ Rocky Helmet\nAbility: Mold Breaker\nLevel: 50\nEVs: 252 HP / 44 Atk / 180 Def / 28 SpD / 4 Spe\nImpish Nature\n- Reflect\n- Light Screen\n- Play Rough\n- Brick Break"}
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
        />

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input
            className="rounded-2xl bg-dust-50 text-dust-900 placeholder:text-dust-400 px-4 py-3 text-sm ring-1 ring-black/10 focus:outline-none focus:ring-2 focus:ring-fern-500/30"
            placeholder="Team name (optional)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="rounded-2xl bg-dust-50 text-dust-900 placeholder:text-dust-400 px-4 py-3 text-sm ring-1 ring-black/10 focus:outline-none focus:ring-2 focus:ring-fern-500/30"
            placeholder="format_ps (optional) e.g. gen9vgc2026regf"
            value={format}
            onChange={(e) => setFormat(e.target.value)}
          />
        </div>

        <button
          type="button"
          disabled={busy || !canImport}
          onClick={onImport}
          className="rounded-2xl bg-fern-700 px-4 py-3 text-sm font-semibold text-dust-50 hover:opacity-95 disabled:opacity-50"
        >
          {busy ? "Importing…" : "Import"}
        </button>

        {status ? <div className="text-sm text-dust-600">{status}</div> : null}
      </div>
    </div>
  );
}