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

/** Winner inference: use stored winner_side when present; otherwise infer from |win| event + player names. */
function normalizeNameForCompare(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function inferWinnerSideFromEvents(dto: BattleDetailsDto | null | undefined): "p1" | "p2" | null {
  if (!dto) return null;
  if (dto.battle?.winner_side) return dto.battle.winner_side;

  const win = (dto.events ?? []).find((e) => e.line_type === "win");
  if (!win) return null;

  const parts = win.raw_line.split("|").filter(Boolean);
  const winnerName = (parts[1] ?? "").trim();
  if (!winnerName) return null;

  const p1 = dto.sides.find((s) => s.side === "p1")?.player_name ?? "";
  const p2 = dto.sides.find((s) => s.side === "p2")?.player_name ?? "";

  const w = normalizeNameForCompare(winnerName);
  const p1n = normalizeNameForCompare(p1);
  const p2n = normalizeNameForCompare(p2);

  if (w && p1n && w === p1n) return "p1";
  if (w && p2n && w === p2n) return "p2";
  return null;
}

function isWinner(dto: BattleDetailsDto | null | undefined, side: "p1" | "p2") {
  const ws = inferWinnerSideFromEvents(dto);
  return ws != null && ws === side;
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
  event_index: number;
};

function pickTimelineEvents(dto: BattleDetailsDto | null | undefined): TimelineEvent[] {
  const xs = dto?.events ?? [];

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
    .filter((e) => e.line_type !== "turn")
    .map((e) => {
      const turn = e.turn_num ?? null;
      const label = turn != null && turn !== lastTurn ? `Turn ${turn}` : "";
      if (turn != null) lastTurn = turn;
      return { label, text: prettyTimelineText(e), turnNumber: label ? turn : null };
    });
}

function toTimelineGroups(dto: BattleDetailsDto | null | undefined): Array<{ turn: number; rows: string[] }> {
  const xs = pickTimelineEvents(dto);

  const sorted = [...xs].sort((a, b) => {
    const ta = a.turn_num ?? 0;
    const tb = b.turn_num ?? 0;
    if (ta !== tb) return ta - tb;
    return (a.event_index ?? 0) - (b.event_index ?? 0);
  });

  const groups = new Map<number, string[]>();
  for (const e of sorted as TimelineEvent[]) {
    if (e.line_type === "turn") continue;
    const t = e.turn_num;
    if (t == null) continue;
    const arr = groups.get(t) ?? [];
    arr.push(prettyTimelineText(e));
    groups.set(t, arr);
  }

  return Array.from(groups.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([turn, rows]) => ({ turn, rows }));
}

function TimelineRow({
  label,
  text,
  onCreateTurnScenario,
}: {
  label: string;
  text: string;
  onCreateTurnScenario?: () => void;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-16 shrink-0">
        {label ? (
          <div className="flex flex-col gap-1">
            <div className="text-xs font-semibold text-black/45">{label}</div>
            <button
              className="h-6 rounded-xl bg-white/70 px-2 text-[11px] ring-1 ring-black/10 hover:bg-white/85 disabled:opacity-50"
              disabled={!onCreateTurnScenario}
              onClick={onCreateTurnScenario}
            >
              Create
            </button>
          </div>
        ) : (
          <div className="text-xs font-semibold text-black/45">&nbsp;</div>
        )}
      </div>

      <div className="flex-1">{text}</div>
    </div>
  );
}

function parsePipeLine(raw: string): string[] {
  const parts = raw.split("|");
  if (parts[0] === "") parts.shift();
  return parts;
}

function speciesFromDetails(details: string): string {
  // "Okidogi, L50, M" -> "Okidogi"
  return (details.split(",")[0] ?? "").trim();
}

function sideFromActor(actor: string): "p1" | "p2" | null {
  // "p1a: Okidogi" -> "p1"
  const s = actor.slice(0, 2);
  return s === "p1" || s === "p2" ? s : null;
}

function isDoublesFromEvents(dto: BattleDetailsDto | null | undefined): boolean {
  const xs = dto?.events ?? [];
  // Look at early switch/drag/replace lines for p1b/p2b
  for (const e of xs as Array<{ line_type: string; raw_line: string }>) {
    if (e.line_type === "turn") break; // once turns start, stop scanning “opening”
    if (e.line_type !== "switch" && e.line_type !== "drag" && e.line_type !== "replace") continue;

    const parts = parsePipeLine(e.raw_line);
    const actor = parts[1] ?? ""; // "p1a: Name"
    const pos = actor.slice(0, 3); // "p1a" / "p1b"
    if (pos === "p1b" || pos === "p2b") return true;
  }
  return false;
}

function leadSpeciesFromEvents(
  dto: BattleDetailsDto | null | undefined,
  side: "p1" | "p2",
  leadCount: number
): string[] {
  const xs = dto?.events ?? [];
  const seen = new Set<string>();
  const out: string[] = [];

  for (const e of xs as Array<{ line_type: string; raw_line: string }>) {
    // Leads are established before or right at the opening; stop at turn 1 to avoid “first switch later”
    if (e.line_type === "turn") break;
    if (e.line_type !== "switch" && e.line_type !== "drag" && e.line_type !== "replace") continue;

    const parts = parsePipeLine(e.raw_line);
    const actor = parts[1] ?? "";
    const details = parts[2] ?? "";
    const s = sideFromActor(actor);
    if (s !== side) continue;

    const species = speciesFromDetails(details);
    if (!species || seen.has(species)) continue;

    seen.add(species);
    out.push(species);
    if (out.length >= leadCount) break;
  }

  return out;
}

function orderedPreviewForSide(
  dto: BattleDetailsDto | null | undefined,
  side: "p1" | "p2"
): Array<{ species_name: string }> {
  // Base order = preview slot order
  const base = (dto?.preview ?? [])
    .filter((p) => p.side === side)
    .sort((a, b) => a.slot_index - b.slot_index)
    .map((p) => ({ species_name: p.species_name }));

  const doubles = isDoublesFromEvents(dto);
  const leadCount = doubles ? 2 : 1;
  const leads = leadSpeciesFromEvents(dto, side, leadCount);

  if (!leads.length) return base;

  const leadSet = new Set(leads);
  const rest = base.filter((p) => !leadSet.has(p.species_name));

  // Ensure leads are present even if preview is missing/incomplete
  const leadObjs = leads.map((s) => ({ species_name: s }));

  return [...leadObjs, ...rest];
}

export function BattleDetails({
  battle,
  details,
  onSelectBattleId,
  onCreatePracticeScenarioFromTurn,
}: {
  battle: BattleListItem;
  details?: BattleDetailsDto | null;
  onSelectBattleId?: (battleId: string) => void;
  onCreatePracticeScenarioFromTurn?: (args: { battleId: string; turnNumber: number }) => void;
}) {
  const userSide = userSideFromDto(details);
  const yourSide: "p1" | "p2" | null = userSide;
  const oppSide: "p1" | "p2" | null = userSide ? (userSide === "p1" ? "p2" : "p1") : null;

  const yourPreview = yourSide ? orderedPreviewForSide(details, yourSide) : [];
  const oppPreview = oppSide ? orderedPreviewForSide(details, oppSide) : [];

  const yourName = yourSide ? details?.sides.find((s) => s.side === yourSide)?.player_name ?? null : null;

  const oppName = oppSide ? details?.sides.find((s) => s.side === oppSide)?.player_name ?? null : null;

  const yourMeta = yourSide
    ? metaBits(details, yourSide)
    : { rating: null, side: "p1" as const, winner: false };
  const oppMeta = oppSide
    ? metaBits(details, oppSide)
    : { rating: null, side: "p2" as const, winner: false };

  const replayUrl = details?.battle.replay_url ?? null;
  const timelineRows = useMemo(() => toTimelineRows(details), [details]);
  const timelineGroups = useMemo(() => toTimelineGroups(details), [details]);
  const meta = details?.battle;

  // --- Set (Bo3) navigation (null-safe sorting + display fallbacks) ---
  const setInfo = details?.set ?? null;

  const orderedGames = useMemo(() => {
    const xs = setInfo?.games ?? [];
    return [...xs].sort((a, b) => {
      const ga = a.game_number ?? 1_000_000;
      const gb = b.game_number ?? 1_000_000;
      if (ga !== gb) return ga - gb;

      const ta = a.played_at ?? 0;
      const tb = b.played_at ?? 0;
      if (ta !== tb) return ta - tb;

      return a.battle_id.localeCompare(b.battle_id);
    });
  }, [setInfo]);

  const currentIdx = useMemo(() => {
    if (!setInfo) return -1;
    return orderedGames.findIndex((g) => g.battle_id === battle.id);
  }, [setInfo, orderedGames, battle.id]);

  const canNav = !!onSelectBattleId && setInfo && orderedGames.length >= 2;
  const prevBattleId = canNav && currentIdx > 0 ? orderedGames[currentIdx - 1].battle_id : null;
  const nextBattleId =
    canNav && currentIdx >= 0 && currentIdx < orderedGames.length - 1
      ? orderedGames[currentIdx + 1].battle_id
      : null;

  const displayGameNum = setInfo?.game_number ?? (currentIdx >= 0 ? currentIdx + 1 : null);
  const displayTotalGames = setInfo?.total_games ?? (orderedGames.length || null);

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

      {setInfo && orderedGames.length >= 2 ? (
        <div className="mt-6 rounded-3xl bg-white/70 p-4 ring-1 ring-black/10">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-black/75">Set</div>
              <div className="mt-1 text-sm text-black/55">
                Game {displayGameNum ?? "—"} of {displayTotalGames ?? "—"}
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                className="h-9 rounded-2xl bg-white/70 px-3 text-sm ring-1 ring-black/10 hover:bg-white/85 disabled:opacity-50"
                disabled={!prevBattleId}
                onClick={() => prevBattleId && onSelectBattleId?.(prevBattleId)}
              >
                Prev
              </button>
              <button
                className="h-9 rounded-2xl bg-white/70 px-3 text-sm ring-1 ring-black/10 hover:bg-white/85 disabled:opacity-50"
                disabled={!nextBattleId}
                onClick={() => nextBattleId && onSelectBattleId?.(nextBattleId)}
              >
                Next
              </button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            {orderedGames.map((g, idx) => {
              const active = g.battle_id === battle.id;
              const labelNum = g.game_number ?? idx + 1;
              return (
                <button
                  key={g.battle_id}
                  className={cx(
                    "h-8 rounded-2xl px-3 text-sm ring-1",
                    active
                      ? "bg-black/80 text-white ring-black/10"
                      : "bg-white/70 text-black/60 ring-black/10 hover:bg-white/85"
                  )}
                  onClick={() => onSelectBattleId?.(g.battle_id)}
                >
                  Game {labelNum}
                </button>
              );
            })}
          </div>
        </div>
      ) : null}

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

          {meta?.team_label ? (
            <>
              <div className="mt-2 text-sm text-black/55">
                {meta.team_label}
                {meta.team_version_label ? ` · ${meta.team_version_label}` : ""}
              </div>

              {meta.match_confidence != null ? (
                <div className="mt-3 text-xs text-black/45">
                  Match: {meta.match_confidence.toFixed(2)}
                  {meta.match_method ? ` · ${meta.match_method}` : ""}
                </div>
              ) : null}
            </>
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

      {/* Timeline */}
      <div className="mt-6 rounded-3xl bg-white/70 p-4 ring-1 ring-black/10 flex flex-col">
        <div className="text-sm font-semibold text-black/75 shrink-0">Timeline</div>

        <div className="mt-3 space-y-2 text-sm text-black/60 overflow-auto max-h-[120px] pr-2">
          {timelineRows.length ? (
            timelineRows.slice(0, 120).map((row, idx) => (
              <TimelineRow
                key={`${idx}-${row.label}`}
                label={row.label}
                text={row.text}
                // NEW:
                onCreateTurnScenario={
                  row.turnNumber != null && onCreatePracticeScenarioFromTurn
                    ? () => onCreatePracticeScenarioFromTurn({ battleId: battle.id, turnNumber: row.turnNumber })
                    : undefined
                }
              />
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
  onSelectBattleId,
  onCreatePracticeScenarioFromTurn,
}: {
  battle: BattleListItem | null;
  details?: BattleDetailsDto | null;
  loading?: boolean;
  onSelectBattleId?: (battleId: string) => void;
  onCreatePracticeScenarioFromTurn?: (args: { battleId: string; turnNumber: number }) => void;
}) {
  return (
    <div className="col-span-8 flex h-full min-h-0 flex-col rounded-3xl bg-white/50 ring-1 ring-black/5">
      <div className="min-h-0 flex-1 overflow-auto">
        {!battle ? (
          <div className="p-6 text-sm text-black/55">Select a battle to review.</div>
        ) : loading ? (
          <div className="p-6 text-sm text-black/55">Loading battle details…</div>
        ) : (
          <BattleDetails
            battle={battle}
            details={details}
            onSelectBattleId={onSelectBattleId}
            onCreatePracticeScenarioFromTurn={onCreatePracticeScenarioFromTurn}
          />
        )}
      </div>
    </div>
  );
}