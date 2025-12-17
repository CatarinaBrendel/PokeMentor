import React from "react";
import TeamSpriteStrip from "../../pokemon/ui/TeamSpriteStrip";
import type { BattleListItem, BattleDetailsDto } from "../model/battles.types";

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function TimelineRow({ label, text }: { label: string; text: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-16 shrink-0 text-xs font-semibold text-black/45">{label}</div>
      <div className="flex-1">{text}</div>
    </div>
  );
}

function userSideFromDto(dto: BattleDetailsDto | null | undefined): "p1" | "p2" | null {
  if (!dto) return null;
  const s = dto.sides.find((x) => x.is_user === 1);
  return s?.side ?? null;
}

function groupedPreview(dto: BattleDetailsDto | null | undefined) {
  const p1 = (dto?.preview ?? [])
    .filter((p) => p.side === "p1")
    .sort((a, b) => a.slot_index - b.slot_index);

  const p2 = (dto?.preview ?? [])
    .filter((p) => p.side === "p2")
    .sort((a, b) => a.slot_index - b.slot_index);

  return { p1, p2 };
}

function toStripMons(xs: Array<{ species_name: string }>) {
  return xs.map((x) => ({ species: x.species_name }));
}

function sideRow(dto: BattleDetailsDto | null | undefined, side: "p1" | "p2") {
  return dto?.sides.find((s) => s.side === side) ?? null;
}

function winnerLabel(dto: BattleDetailsDto | null | undefined, side: "p1" | "p2") {
  if (!dto?.battle.winner_side) return null;
  return dto.battle.winner_side === side ? "Winner" : null;
}

function fmtMeta(dto: BattleDetailsDto | null | undefined, side: "p1" | "p2") {
  const s = sideRow(dto, side);
  const bits: string[] = [];
  if (s?.rating != null) bits.push(`Rating ${s.rating}`);
  bits.push(side.toUpperCase());
  const w = winnerLabel(dto, side);
  if (w) bits.push(w);
  return bits.join(" · ");
}

export function BattleDetails({
  battle,
  details,
}: {
  battle: BattleListItem;
  details?: BattleDetailsDto | null;
}) {
  const userSide = userSideFromDto(details);
  const { p1, p2 } = groupedPreview(details);

  const yourSide: "p1" | "p2" | null = userSide;
  const oppSide: "p1" | "p2" | null = userSide ? (userSide === "p1" ? "p2" : "p1") : null;

  const yourPreview = yourSide === "p1" ? p1 : yourSide === "p2" ? p2 : [];
  const oppPreview = oppSide === "p1" ? p1 : oppSide === "p2" ? p2 : [];

  const yourMeta = yourSide ? fmtMeta(details, yourSide) : "";
  const oppMeta = oppSide ? fmtMeta(details, oppSide) : "";

  const replayUrl = details?.battle.replay_url ?? null;

  return (
    <div className="p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-2xl font-semibold tracking-tight text-black/80">
            {battle.result === "win" ? "Win" : "Loss"} vs {battle.opponentName}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-black/55">
            <span className="inline-flex items-center gap-2">
              <span
                className={cx(
                  "h-2 w-2 rounded-full",
                  battle.result === "win" ? "bg-green-600" : "bg-red-500"
                )}
              />
              {battle.format_ps ?? "—"}
            </span>
            <span className="text-black/30">·</span>
            <span>{battle.rated ? "Rated" : "Unrated"}</span>
            <span className="text-black/30">·</span>
            <span>Played: {battle.playedAt}</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            className="h-10 rounded-2xl bg-white/70 px-4 text-sm ring-1 ring-black/10 hover:bg-white/85 disabled:opacity-50"
            disabled={!replayUrl}
            onClick={() => {
              if (!replayUrl) return;
              window.__toast?.("Replay open is not wired yet.", "error");
            }}
          >
            Replay
          </button>
        </div>
      </div>

      {/* Team vs Opponent (same layout as before) */}
      <div className="mt-6 grid grid-cols-2 gap-4">
        <div className="rounded-3xl bg-white/70 p-4 ring-1 ring-black/10">
          <div className="text-sm font-semibold text-black/75">Your Team</div>
          <div className="mt-1 text-sm text-black/55">
            {battle.teamLabel ?? "Unlinked team"}
            {battle.teamVersionLabel ? ` · ${battle.teamVersionLabel}` : ""}
          </div>

          {/* small, non-clutter metadata */}
          {yourMeta ? <div className="mt-2 text-xs text-black/45">{yourMeta}</div> : null}

          <div className="mt-3">
            {yourPreview.length ? (
              <TeamSpriteStrip mons={toStripMons(yourPreview)} size="md" className="mt-3" />
            ) : (
              <div className="mt-3 text-xs text-black/45">No team preview available.</div>
            )}
          </div>

          {battle.matchConfidence != null ? (
            <div className="mt-3 text-xs text-black/45">
              Match: {battle.matchConfidence.toFixed(2)}
              {battle.matchMethod ? ` · ${battle.matchMethod}` : ""}
            </div>
          ) : (
            <div className="mt-3 text-xs text-black/45">
              Link this battle to a stored team to unlock coaching insights.
            </div>
          )}
        </div>

        <div className="rounded-3xl bg-white/70 p-4 ring-1 ring-black/10">
          <div className="text-sm font-semibold text-black/75">Opponent</div>
          <div className="mt-1 text-sm text-black/55">{battle.opponentName}</div>

          {oppMeta ? <div className="mt-2 text-xs text-black/45">{oppMeta}</div> : null}

          <div className="mt-3">
            {oppPreview.length ? (
              <TeamSpriteStrip mons={toStripMons(oppPreview)} size="md" className="mt-3" />
            ) : (
              <div className="mt-3 text-xs text-black/45">Opponent team preview not available.</div>
            )}
          </div>
        </div>
      </div>

      {/* Timeline (keep as-is for now) */}
      <div className="mt-6 rounded-3xl bg-white/70 p-4 ring-1 ring-black/10">
        <div className="text-sm font-semibold text-black/75">Timeline</div>
        <div className="mt-3 space-y-2 text-sm text-black/60">
          <TimelineRow label="Turn 1" text="Revealed leads (mock event)" />
          <TimelineRow label="Turn 3" text="First KO (mock event)" />
          <TimelineRow label="Turn 7" text="Victory condition reached (mock event)" />
        </div>
      </div>

      {/* AI Review (unchanged) */}
      <div className="mt-6 rounded-3xl bg-white/70 p-4 ring-1 ring-black/10">
        <div className="text-sm font-semibold text-black/75">AI Review (coming soon)</div>
        <div className="mt-2 text-sm text-black/55">
          Tactical insights, pattern detection, and coaching suggestions will appear here once enough data is available.
        </div>
      </div>
    </div>
  );
}

export function BattleDetailsPanel({
  battle,
  details,
  loading,
}: {
  battle: BattleListItem | null;
  details?: BattleDetailsDto | null;
  loading?: boolean;
}) {
  return (
    <div className="col-span-8 flex h-full min-h-0 flex-col rounded-3xl bg-white/50 ring-1 ring-black/5">
      <div className="min-h-0 flex-1 overflow-auto">
        {!battle ? (
          <div className="p-6 text-sm text-black/55">Select a battle to review.</div>
        ) : loading ? (
          <div className="p-6 text-sm text-black/55">Loading battle details…</div>
        ) : (
          <BattleDetails battle={battle} details={details} />
        )}
      </div>
    </div>
  );
}