import React, { useMemo } from "react";
import TeamSpriteStrip from "../../pokemon/ui/TeamSpriteStrip";
import type { BattleListItem, BattleDetailsDto } from "../model/battles.types";

function cx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
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

function MetaBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-xl bg-black/5 px-2 py-0.5 text-[11px] text-black/55">
      {children}
    </span>
  );
}

function sideLabel(side: "p1" | "p2") {
  return side.toUpperCase();
}

function isWinner(dto: BattleDetailsDto | null | undefined, side: "p1" | "p2") {
  return dto?.battle.winner_side != null && dto.battle.winner_side === side;
}

function metaBits(dto: BattleDetailsDto | null | undefined, side: "p1" | "p2") {
  const s = dto?.sides.find((x) => x.side === side) ?? null;
  return {
    rating: s?.rating ?? null,
    side,
    winner: isWinner(dto, side),
  };
}

function SideCardHeader({
  title,
  name,
  meta,
}: {
  title: string;
  name: string | null | undefined;
  meta: { rating: number | null; side: "p1" | "p2"; winner: boolean };
}) {
  // Requirement: show "Opponent" if null/empty
  const displayName = (name ?? "").trim() || title;

  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="text-sm font-semibold text-black/75">{title}</div>
        <div className="mt-1 truncate text-sm text-black/55">{displayName}</div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
        {meta.winner ? <MetaBadge>Winner</MetaBadge> : null}
        <MetaBadge>{sideLabel(meta.side)}</MetaBadge>
        {meta.rating != null ? <MetaBadge>Rating {meta.rating}</MetaBadge> : null}
      </div>
    </div>
  );
}

type TimelineEvent = {
  line_type: string;
  raw_line: string;
  turn_num?: number | null;
  event_index?: number | null;
};

function pickTimelineEvents(dto: BattleDetailsDto | null | undefined): TimelineEvent[] {
  const xs = (dto as any)?.events ?? [];

  // Only main, turn-relevant events (no gametype/player/gen/etc.)
  const keep = new Set(["turn", "switch", "drag", "move", "faint", "win"]);
  return (xs as TimelineEvent[]).filter((e) => keep.has(e.line_type));
}

function prettyTimelineText(e: TimelineEvent): string {
  const parts = e.raw_line.split("|").filter(Boolean);
  const t = parts[0];

  if (t === "turn") return `Turn ${parts[1] ?? "?"}`;

  if (t === "switch" || t === "drag") {
    // |switch|p1a: Name|Species, L50, M|100/100
    const who = (parts[1] ?? "").split(":")[0]; // p1a
    const nick = ((parts[1] ?? "").split(":")[1] ?? "").trim();
    const species = (parts[2] ?? "").split(",")[0].trim();
    return `${who.toUpperCase()} switched to ${nick || species} (${species})`;
  }

  if (t === "move") {
    // |move|p1a: Foo|Protect|p1a: Foo
    const actor = ((parts[1] ?? "").split(":")[1] ?? parts[1] ?? "").trim();
    const move = (parts[2] ?? "").trim();
    const target = ((parts[3] ?? "").split(":")[1] ?? "").trim();
    return target ? `${actor} used ${move} → ${target}` : `${actor} used ${move}`;
  }

  if (t === "faint") {
    const who = ((parts[1] ?? "").split(":")[1] ?? parts[1] ?? "").trim();
    return `${who} fainted`;
  }

  if (t === "win") return `Winner: ${parts[1] ?? "Unknown"}`;

  return e.raw_line;
}

function toTimelineRows(dto: BattleDetailsDto | null | undefined) {
  const xs = pickTimelineEvents(dto);

  const sorted = [...xs].sort((a, b) => {
    const ta = a.turn_num ?? 0;
    const tb = b.turn_num ?? 0;
    if (ta !== tb) return ta - tb;
    return (a.event_index ?? 0) - (b.event_index ?? 0);
  });

  let lastTurn: number | null = null;

  return sorted
    .filter((e) => e.line_type !== "turn") // don’t show raw |turn| line; we label turns in the left column
    .map((e) => {
      const turn = e.turn_num ?? null;
      const label = turn != null && turn !== lastTurn ? `Turn ${turn}` : "";
      if (turn != null) lastTurn = turn;
      return { label, text: prettyTimelineText(e) };
    });
}

function TimelineRow({ label, text }: { label: string; text: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-16 shrink-0 text-xs font-semibold text-black/45">
        {label || ""}
      </div>
      <div className="flex-1">{text}</div>
    </div>
  );
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

  const yourName =
    yourSide ? details?.sides.find((s) => s.side === yourSide)?.player_name ?? null : null;

  const oppName =
    oppSide ? details?.sides.find((s) => s.side === oppSide)?.player_name ?? null : null;

  const yourMeta = yourSide ? metaBits(details, yourSide) : { rating: null, side: "p1" as const, winner: false };
  const oppMeta = oppSide ? metaBits(details, oppSide) : { rating: null, side: "p2" as const, winner: false };

  const replayUrl = details?.battle.replay_url ?? null;
  const timelineRows = useMemo(() => toTimelineRows(details), [details]);

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

      {/* Team vs Opponent */}
      <div className="mt-6 grid grid-cols-2 gap-4">
        <div className="rounded-3xl bg-white/70 p-4 ring-1 ring-black/10">
          <SideCardHeader title="Your Team" name={yourName} meta={yourMeta} />

          <div className="mt-3">
            {yourPreview.length ? (
              <TeamSpriteStrip mons={toStripMons(yourPreview)} size="md" className="mt-3" />
            ) : (
              <div className="mt-3 text-xs text-black/45">No team preview available.</div>
            )}
          </div>

          <div className="mt-2 text-sm text-black/55">
            {battle.teamLabel ?? "Unlinked team"}
            {battle.teamVersionLabel ? ` · ${battle.teamVersionLabel}` : ""}
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
          <SideCardHeader title="Opponent" name={oppName} meta={oppMeta} />

          <div className="mt-3">
            {oppPreview.length ? (
              <TeamSpriteStrip mons={toStripMons(oppPreview)} size="md" className="mt-3" />
            ) : (
              <div className="mt-3 text-xs text-black/45">Opponent team preview not available.</div>
            )}
          </div>
        </div>
      </div>

      {/* Timeline (fixed height + inner scroll) */}
      <div className="mt-6 rounded-3xl bg-white/70 p-4 ring-1 ring-black/10 flex flex-col">
        <div className="text-sm font-semibold text-black/75 shrink-0">Timeline</div>

        <div className="mt-3 space-y-2 text-sm text-black/60 overflow-auto max-h-[120px] pr-2">
          {timelineRows.length ? (
            timelineRows.slice(0, 120).map((row, idx) => (
              <TimelineRow key={`${idx}-${row.label}`} label={row.label} text={row.text} />
            ))
          ) : (
            <div className="text-xs text-black/45">No timeline events available.</div>
          )}
        </div>
      </div>

      {/* AI Review */}
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