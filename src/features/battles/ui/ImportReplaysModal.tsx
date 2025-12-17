import * as React from "react";
import type { ImportReplaysResult } from "../model/battles.types";
import { BattlesApi } from "../api/batles.api";

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function toast(message: string, type: "success" | "error") {
  window.__toast?.(message, type);
}

export function ImportReplaysModal({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported?: (result: ImportReplaysResult) => void; // optional: let page refresh list later
}) {
  const [text, setText] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [result, setResult] = React.useState<ImportReplaysResult | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const canImport = !submitting && text.trim().length > 0;

    async function handleImport() {
    setSubmitting(true);
    setError(null);
    setResult(null);

    try {
      const res = await BattlesApi.importReplays({ text });

      setResult(res);
      onImported?.(res);

      if (res.okCount > 0) toast(`Imported ${res.okCount} replay(s).`, "success");
      if (res.failCount > 0) toast(`${res.failCount} replay(s) failed. See details.`, "error");

      if (res.failCount === 0) onClose(); // optional: close on full success
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      toast(`Import failed: ${msg}`, "error");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-label="Import battle replays"
      onMouseDown={(e) => {
        if (submitting) return;
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[2px]" />

      {/* Panel */}
      <div className="relative w-full max-w-[720px] rounded-3xl bg-white/90 p-6 ring-1 ring-black/10 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-lg font-semibold text-black/85">
              Import Pokémon Showdown replays
            </div>
            <div className="mt-1 text-sm text-black/55">
              Paste one replay URL or replay ID per line.
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="h-10 w-10 rounded-2xl bg-white/70 ring-1 ring-black/10 hover:bg-white/85"
            aria-label="Close"
            title="Close"
            disabled={submitting}
          >
            ✕
          </button>
        </div>

        <div className="mt-5">
          <label className="text-sm font-semibold text-black/70">
            Replay URLs or IDs
          </label>

          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={7}
            className="mt-3 w-full rounded-2xl bg-white/70 p-3 text-sm ring-1 ring-black/10 placeholder:text-black/30 focus:outline-none focus:ring-2 focus:ring-black/15"
            placeholder={
              "gen9vgc2026regfbo3-2481099316\nhttps://replay.pokemonshowdown.com/gen9vgc2026regfbo3-2481099316"
            }
            disabled={submitting}
          />

          {/* Errors */}
          {error ? (
            <div className="mt-3 rounded-2xl bg-red-50 p-3 text-sm text-red-900 ring-1 ring-red-200">
              {error}
            </div>
          ) : null}

          {/* Result summary + per-line output */}
          {result ? (
            <div className="mt-4 rounded-3xl bg-white/70 p-4 ring-1 ring-black/10">
              <div className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold text-black/75">
                  Import result
                </div>
                <div className="text-xs text-black/50">
                  OK: {result.okCount} · Failed: {result.failCount}
                </div>
              </div>

              <div className="mt-3 max-h-56 overflow-auto rounded-2xl bg-white/60 ring-1 ring-black/5">
                {result.rows.map((r, idx) => (
                  <div
                    key={idx}
                    className={cx(
                      "flex items-start justify-between gap-3 px-3 py-2 text-sm",
                      idx !== result.rows.length - 1 && "border-b border-black/5"
                    )}
                  >
                    <div className="min-w-0">
                      <div className="truncate text-black/70">{r.input}</div>
                      {r.ok ? (
                        <div className="mt-0.5 text-xs text-black/45">
                          replayId: {r.replayId} · battleId: {r.battleId}
                        </div>
                      ) : (
                        <div className="mt-0.5 text-xs text-red-800">
                          {r.error}
                        </div>
                      )}
                    </div>

                    <div
                      className={cx(
                        "shrink-0 rounded-xl px-2 py-1 text-[11px] ring-1",
                        r.ok
                          ? "bg-green-50 text-green-800 ring-green-200"
                          : "bg-red-50 text-red-800 ring-red-200"
                      )}
                    >
                      {r.ok ? "Imported" : "Failed"}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="mt-4 flex items-center justify-between">
            <div className="text-xs text-black/45">
              Tip: later we can add per-line validation before importing.
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="h-10 rounded-2xl bg-white/70 px-4 text-sm ring-1 ring-black/10 hover:bg-white/85"
                disabled={submitting}
              >
                Close
              </button>

              <button
                type="button"
                disabled={!canImport}
                onClick={handleImport}
                className={cx(
                  "h-10 rounded-2xl px-4 text-sm font-semibold ring-1 ring-black/10",
                  canImport
                    ? "bg-pine-700 hover:bg-pine-500 text-sage-50"
                    : "bg-black/5 text-black/35 cursor-not-allowed"
                )}
                title={canImport ? "Import replays" : "Paste at least one replay first"}
              >
                {submitting ? "Importing…" : "Import"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}