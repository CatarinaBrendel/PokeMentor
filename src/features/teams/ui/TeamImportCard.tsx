import { useState } from "react";
import { TeamsApi } from "../api/teams.api";
import type { ImportPreviewSet, ImportTeamPreview } from "../model/teams.types";

type TeamImportCardProps = {
  onImported?: () => void;
};

export default function TeamImportCard({ onImported }: TeamImportCardProps) {
  const [url, setUrl] = useState("");
  const [paste, setPaste] = useState("");
  const [name, setName] = useState("");
  const [format, setFormat] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [preview, setPreview] = useState<ImportTeamPreview | null>(null);
  const [previewText, setPreviewText] = useState("");
  const [busy, setBusy] = useState(false);

  function getErrorMessage(err: unknown): string {
    if (err instanceof Error) return err.message;
    if (typeof err === "string") return err;
    return "Import failed.";
  }

  const hasUrl = url.trim().length > 0;
  const hasPaste = paste.trim().length > 0;
  const canPreview = hasUrl || hasPaste;

  function formatEvLine(s: ImportPreviewSet) {
    const parts: string[] = [];
    if (s.ev_hp) parts.push(`${s.ev_hp} HP`);
    if (s.ev_atk) parts.push(`${s.ev_atk} Atk`);
    if (s.ev_def) parts.push(`${s.ev_def} Def`);
    if (s.ev_spa) parts.push(`${s.ev_spa} SpA`);
    if (s.ev_spd) parts.push(`${s.ev_spd} SpD`);
    if (s.ev_spe) parts.push(`${s.ev_spe} Spe`);
    return parts.length ? `EVs: ${parts.join(" / ")}` : null;
  }

  function formatIvLine(s: ImportPreviewSet) {
    const entries: Array<[string, number]> = [];
    const push = (label: string, v: number | null) => {
      if (typeof v === "number" && v !== 31) entries.push([label, v]);
    };
    push("HP", s.iv_hp);
    push("Atk", s.iv_atk);
    push("Def", s.iv_def);
    push("SpA", s.iv_spa);
    push("SpD", s.iv_spd);
    push("Spe", s.iv_spe);

    if (entries.length === 0) return null;
    return `IVs: ${entries.map(([k, v]) => `${v} ${k}`).join(" / ")}`;
  }

  function formatHeaderLine(s: ImportPreviewSet) {
    const namePart = s.nickname ? `${s.nickname} (${s.species_name})` : s.species_name;
    const genderPart = s.gender === "M" || s.gender === "F" ? ` (${s.gender})` : "";
    const itemPart = s.item_name ? ` @ ${s.item_name}` : "";
    return `${namePart}${genderPart}${itemPart}`.trim();
  }

  function toShowdownSetText(s: ImportPreviewSet) {
    const lines: string[] = [];
    lines.push(formatHeaderLine(s));

    if (s.ability_name) lines.push(`Ability: ${s.ability_name}`);
    if (typeof s.level === "number") lines.push(`Level: ${s.level}`);
    if (s.shiny) lines.push(`Shiny: Yes`);
    if (s.happiness != null) lines.push(`Happiness: ${s.happiness}`);
    if (s.tera_type) lines.push(`Tera Type: ${s.tera_type}`);

    const evLine = formatEvLine(s);
    if (evLine) lines.push(evLine);

    if (s.nature) lines.push(`${s.nature} Nature`);

    const ivLine = formatIvLine(s);
    if (ivLine) lines.push(ivLine);

    for (const m of (s.moves ?? []).slice(0, 4)) {
      if (m && m.trim()) lines.push(`- ${m.trim()}`);
    }

    return lines.join("\n");
  }

  function buildPreviewText(sets: ImportPreviewSet[]) {
    return sets.map(toShowdownSetText).join("\n\n").trim() + "\n";
  }

  async function onPreview() {
    setBusy(true);
    setStatus(null);
    setPreviewError(null);

    try {
      const res = await TeamsApi.previewPokepaste({
        url: hasPaste ? undefined : url.trim() || undefined,
        paste_text: hasPaste ? paste : undefined,
      });
      setPreview(res);
      setPreviewText(buildPreviewText(res.sets));
      if (!name.trim() && res.meta.title?.trim()) {
        setName(res.meta.title.trim());
      }
      if (!format.trim() && res.meta.format?.trim()) {
        setFormat(res.meta.format.trim());
      }
    } catch (err: unknown) {
      setPreviewError(getErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function onImport() {
    setBusy(true);
    setStatus(null);

    try {
      if (!preview) throw new Error("Preview the import before saving.");
      const res = await TeamsApi.importPokepaste({
        url: preview.source_url ?? undefined,
        paste_text: previewText.trim() || undefined,
        name: name.trim() ? name : undefined,
        format_ps: format.trim() ? format : preview.meta.format?.trim() || undefined,
      });

      setStatus(`Imported team v${res.version_num} (${res.slots_inserted} slots).`);
      setUrl("");
      setPaste("");
      setName("");
      setFormat("");
      setPreview(null);
      setPreviewText("");
      setPreviewError(null);
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
        {!preview ? (
          <>
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
          </>
        ) : (
          <div className="rounded-2xl bg-white/70 p-4 ring-1 ring-black/10">
            <div className="text-sm font-semibold text-dust-700">Preview</div>
            <div className="mt-1 text-xs text-dust-500">
              Edit the text below to fix names, abilities, or EVs before importing.
            </div>
            {(preview.meta.title || preview.meta.author || preview.meta.format) ? (
              <div className="mt-2 text-xs text-dust-500">
                {preview.meta.title ? `Title: ${preview.meta.title}` : null}
                {preview.meta.author ? ` · By ${preview.meta.author}` : null}
                {preview.meta.format ? ` · Format: ${preview.meta.format}` : null}
              </div>
            ) : null}
            {preview.warnings.length ? (
              <div className="mt-3 rounded-2xl bg-amber-50 p-3 text-xs text-amber-900 ring-1 ring-amber-200">
                {preview.warnings.map((warning) => (
                  <div key={warning}>{warning}</div>
                ))}
              </div>
            ) : null}
            <textarea
              className="mt-3 min-h-[320px] max-h-[420px] w-full resize-y rounded-2xl bg-white/80 text-dust-900 placeholder:text-dust-400 px-4 py-3 text-sm ring-1 ring-black/10 focus:outline-none focus:ring-2 focus:ring-fern-500/30"
              value={previewText}
              onChange={(e) => setPreviewText(e.target.value)}
            />
          </div>
        )}

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

        <div className="flex flex-wrap items-center justify-end gap-2">
          {!preview ? (
            <button
              type="button"
              disabled={busy || !canPreview}
              onClick={onPreview}
              className="rounded-2xl bg-fern-700 px-4 py-3 text-sm font-semibold text-dust-50 hover:opacity-95 disabled:opacity-50"
            >
              {busy ? "Preparing…" : "Preview"}
            </button>
          ) : (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setPreview(null);
                  setPreviewText("");
                  setPreviewError(null);
                }}
                className="rounded-2xl bg-dust-200 px-4 py-3 text-sm font-semibold text-dust-700 hover:bg-dust-300/70 disabled:opacity-50"
              >
                Back
              </button>
              <button
                type="button"
                disabled={busy || !previewText.trim()}
                onClick={onImport}
                className="rounded-2xl bg-fern-700 px-4 py-3 text-sm font-semibold text-dust-50 hover:opacity-95 disabled:opacity-50"
              >
                {busy ? "Importing…" : "Import"}
              </button>
            </>
          )}
        </div>

        {previewError ? <div className="text-sm text-red-600">{previewError}</div> : null}
        {status ? <div className="text-sm text-dust-600">{status}</div> : null}
      </div>
    </div>
  );
}
