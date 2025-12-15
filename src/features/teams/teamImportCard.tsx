import { useState } from "react";
import { TeamsApi } from "./teams.api";

export default function TeamImportCard() {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [format, setFormat] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

    function getErrorMessage(err: unknown): string {
    if (err instanceof Error) return err.message;
    if (typeof err === "string") return err;
    return "Import failed.";
    }

  async function onImport() {
    setBusy(true);
    setStatus(null);
    try {
      const res = await TeamsApi.importPokepaste({
        url,
        name: name || undefined,
        format_ps: format || undefined,
      });
      setStatus(`Imported team v${res.version_num} (${res.slots_inserted} slots).`);
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

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <input
            className="rounded-2xl bg-dust-50 text-dust-900 placeholder:text-dust-400  px-4 py-3 text-sm ring-1 ring-black/10 focus:outline-none focus:ring-2 focus:ring-fern-500/30"
            placeholder="Team name (optional)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            className="rounded-2xl bg-dust-50 text-dust-900 placeholder:text-dust-400  px-4 py-3 text-sm ring-1 ring-black/10 focus:outline-none focus:ring-2 focus:ring-fern-500/30"
            placeholder="format_ps (optional) e.g. gen9vgc2026regf"
            value={format}
            onChange={(e) => setFormat(e.target.value)}
          />
        </div>

        <button
          type="button"
          disabled={busy || !url.trim()}
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