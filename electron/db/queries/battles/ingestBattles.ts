import crypto from "node:crypto";
import type BetterSqlite3 from "better-sqlite3";
import type { ShowdownReplayJson } from "./fetchReplayJson";
import { deriveBroughtFromEvents } from "./deriveBroughtFromEvents";

type Side = "p1" | "p2";

function uuid(): string {
  return crypto.randomUUID();
}

function nowUnix(): number {
  return Math.floor(Date.now() / 1000);
}

function getSetting(db: BetterSqlite3.Database, key: string): string | null {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

function normalizeShowdownName(name: string): string {
  return name.trim().replace(/^☆+/, "").replace(/\s+/g, "").toLowerCase();
}

function parseLogLines(rawLog: string): string[] {
  return rawLog
    .split("\n")
    .map((s) => s.trimEnd())
    .filter((s) => s.length > 0);
}

function parsePipeLine(line: string): string[] {
  const parts = line.split("|");
  if (parts[0] === "") parts.shift();
  return parts;
}

function toFiniteNumber(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

function firstTUnix(lines: string[]): number | null {
  for (const l of lines) {
    const parts = parsePipeLine(l);
    if (parts[0] === "t:" && parts[1]) return toFiniteNumber(parts[1]);
  }
  return null;
}

function hasRatedLine(lines: string[]): boolean {
  return lines.some((l) => l === "|rated|" || l.startsWith("|rated|"));
}

function extractGenAndGameType(lines: string[]): { gen: number | null; gameType: string | null } {
  let gen: number | null = null;
  let gameType: string | null = null;

  for (const l of lines) {
    const p = parsePipeLine(l);
    if (p[0] === "gen") gen = toFiniteNumber(p[1]);
    if (p[0] === "gametype") gameType = p[1] ?? null;
    if (gen != null && gameType != null) break;
  }
  return { gen, gameType };
}

function findWinner(lines: string[]): { winnerName: string | null; winnerSide: Side | null } {
  let winnerName: string | null = null;

  for (const l of lines) {
    const parts = parsePipeLine(l);
    if (parts[0] === "win" && parts[1]) winnerName = parts[1];
  }
  if (!winnerName) return { winnerName: null, winnerSide: null };

  let p1: string | null = null;
  let p2: string | null = null;

  for (const l of lines) {
    const parts = parsePipeLine(l);
    if (parts[0] === "player") {
      const side = parts[1];
      const name = parts[2];
      if (side === "p1") p1 = name ?? null;
      if (side === "p2") p2 = name ?? null;
    }
  }

  const winnerSide: Side | null =
    winnerName === p1 ? "p1" : winnerName === p2 ? "p2" : null;

  return { winnerName, winnerSide };
}

function parsePreviewMon(rawText: string): { species: string; level: number | null; gender: "M" | "F" | null } {
  // Example: "Okidogi, L50, M"
  const bits = rawText.split(",").map((s) => s.trim()).filter(Boolean);
  const species = (bits[0] ?? "").trim();

  const levelToken = bits.find((b) => /^L\d+$/i.test(b));
  const level = levelToken ? toFiniteNumber(levelToken.slice(1)) : null;

  const gender: "M" | "F" | null = bits.includes("M") ? "M" : bits.includes("F") ? "F" : null;

  return { species, level, gender };
}

function parseShowteamEntries(blob: string): string[] {
  // packed list separated by "]"
  return blob.split("]").map((x) => x.trim()).filter(Boolean);
}

function parseShowteamEntry(entry: string): {
  species: string;
  nickname: string | null;
  item: string | null;
  ability: string | null;
  moves: string[];
  gender: "M" | "F" | null;
  level: number | null;
  tera: string | null;
} {
  const fields = entry.split("|");

  const species = (fields[0] ?? "").trim();
  const nickname = fields[1] ? fields[1] : null;

  const item = fields[3] ? fields[3] : null;
  const ability = fields[4] ? fields[4] : null;

  const movesCsv = fields[5] ?? "";
  const moves = movesCsv.split(",").map((m) => m.trim()).filter(Boolean);

  const genderRaw = fields[8];
  const gender: "M" | "F" | null = genderRaw === "M" || genderRaw === "F" ? genderRaw : null;

  const level = fields[11] ? toFiniteNumber(fields[11]) : null;

  const tail = fields[12] ?? "";
  const tera = tail.includes(",") ? tail.split(",").pop()?.trim() ?? null : null;

  return { species, nickname, item, ability, moves, gender, level, tera };
}

function makeIsUserFn(db: BetterSqlite3.Database): (playerName: string) => 0 | 1 {
  const showdownUsername = getSetting(db, "showdown_username");
  const showdownUsernameNorm = showdownUsername ? normalizeShowdownName(showdownUsername) : null;

  return (playerName: string): 0 | 1 => {
    if (!showdownUsernameNorm) return 0;
    return normalizeShowdownName(playerName) === showdownUsernameNorm ? 1 : 0;
  };
}

function prepareStatements(db: BetterSqlite3.Database) {
  return {
    insertBattle: db.prepare(`
      INSERT INTO battles (
        id, replay_id, replay_url, replay_json_url,
        format_id, format_name, gen, game_type,
        upload_time, played_at, views, rating, is_private, is_rated,
        winner_side, winner_name,
        raw_json, raw_log,
        created_at
      ) VALUES (
        @id, @replay_id, @replay_url, @replay_json_url,
        @format_id, @format_name, @gen, @game_type,
        @upload_time, @played_at, @views, @rating, @is_private, @is_rated,
        @winner_side, @winner_name,
        @raw_json, @raw_log,
        @created_at
      );
    `),

    insertSide: db.prepare(`
      INSERT INTO battle_sides (battle_id, side, is_user, player_name, avatar, rating)
      VALUES (@battle_id, @side, @is_user, @player_name, @avatar, @rating);
    `),

    insertPreview: db.prepare(`
      INSERT INTO battle_preview_pokemon (battle_id, side, slot_index, species_name, level, gender, shiny, raw_text)
      VALUES (@battle_id, @side, @slot_index, @species_name, @level, @gender, @shiny, @raw_text);
    `),

    insertRevealed: db.prepare(`
      INSERT INTO battle_revealed_sets (
        battle_id, side, species_name, nickname, item_name, ability_name, tera_type, level, gender, shiny, moves_json, raw_fragment
      ) VALUES (
        @battle_id, @side, @species_name, @nickname, @item_name, @ability_name, @tera_type, @level, @gender, @shiny, @moves_json, @raw_fragment
      );
    `),

    insertEvent: db.prepare(`
      INSERT INTO battle_events (
        battle_id, event_index, turn_num, t_unix,
        line_type, raw_line,
        actor_ref, actor_name, target_ref, target_name,
        move_name, item_name, ability_name,
        condition_text, value_text, value_num,
        flags_json, payload_json
      ) VALUES (
        @battle_id, @event_index, @turn_num, @t_unix,
        @line_type, @raw_line,
        @actor_ref, @actor_name, @target_ref, @target_name,
        @move_name, @item_name, @ability_name,
        @condition_text, @value_text, @value_num,
        @flags_json, @payload_json
      );
    `),
  };
}

export function ingestReplayJson(
  db: BetterSqlite3.Database,
  replayUrl: string,
  replayJsonUrl: string,
  json: ShowdownReplayJson
): { battleId: string } {
  const now = nowUnix();
  const battleId = uuid();
  const lines = parseLogLines(json.log ?? "");

  const playedAt = firstTUnix(lines) ?? (json.uploadtime ?? now);
  const isRated = hasRatedLine(lines) ? 1 : 0;
  const { winnerName, winnerSide } = findWinner(lines);
  const { gen, gameType } = extractGenAndGameType(lines);

  const isUser = makeIsUserFn(db);
  const stmts = prepareStatements(db);

  // counters / state while iterating the protocol stream
  let eventIndex = 0;
  let currentTurn: number | null = null;
  let currentT: number | null = null;
  const previewSlotCounter: Record<Side, number> = { p1: 0, p2: 0 };

  db.transaction(() => {
    // 1) battles row
    stmts.insertBattle.run({
      id: battleId,
      replay_id: json.id,
      replay_url: replayUrl,
      replay_json_url: replayJsonUrl,

      format_id: json.formatid ?? null,
      format_name: json.format ?? null,
      gen,
      game_type: gameType,

      upload_time: json.uploadtime ?? null,
      played_at: playedAt ?? null,
      views: json.views ?? null,
      rating: json.rating ?? null,
      is_private: json.private ? 1 : 0,
      is_rated: isRated,

      winner_side: winnerSide,
      winner_name: winnerName,

      raw_json: JSON.stringify(json),
      raw_log: json.log ?? "",
      created_at: now,
    });

    // 2) walk the log and persist derived tables
    for (const raw of lines) {
      const parts = parsePipeLine(raw);
      const type = parts[0] ?? "unknown";

      // temporal context
      if (type === "t:") currentT = toFiniteNumber(parts[1]);
      if (type === "turn") currentTurn = toFiniteNumber(parts[1]);

      // structured inserts
      if (type === "player") {
        const side = parts[1] as Side;
        const name = parts[2] ?? "";
        const avatar = parts[3] ?? null;
        const rating = toFiniteNumber(parts[4]);

        if ((side === "p1" || side === "p2") && name) {
          stmts.insertSide.run({
            battle_id: battleId,
            side,
            is_user: isUser(name),
            player_name: name,
            avatar,
            rating,
          });
        }
      }

      if (type === "poke") {
        const side = parts[1] as Side;
        const rawText = parts[2] ?? "";

        if (side === "p1" || side === "p2") {
          previewSlotCounter[side] += 1;
          const slotIndex = previewSlotCounter[side];

          const { species, level, gender } = parsePreviewMon(rawText);

          if (species) {
            stmts.insertPreview.run({
              battle_id: battleId,
              side,
              slot_index: slotIndex,
              species_name: species,
              level,
              gender,
              shiny: 0,
              raw_text: rawText,
            });
          }
        }
      }

      if (type === "showteam") {
        const side = parts[1] as Side;
        const blob = parts[2] ?? "";

        if (side === "p1" || side === "p2") {
          for (const entry of parseShowteamEntries(blob)) {
            const parsed = parseShowteamEntry(entry);
            if (!parsed.species) continue;

            stmts.insertRevealed.run({
              battle_id: battleId,
              side,
              species_name: parsed.species,
              nickname: parsed.nickname,
              item_name: parsed.item,
              ability_name: parsed.ability,
              tera_type: parsed.tera,
              level: parsed.level,
              gender: parsed.gender,
              shiny: 0,
              moves_json: JSON.stringify(parsed.moves),
              raw_fragment: entry,
            });
          }
        }
      }

      // Always store raw line as an event (minimal structure for now)
      stmts.insertEvent.run({
        battle_id: battleId,
        event_index: eventIndex++,
        turn_num: currentTurn,
        t_unix: currentT,

        line_type: type,
        raw_line: raw,

        actor_ref: null,
        actor_name: null,
        target_ref: null,
        target_name: null,

        move_name: type === "move" ? (parts[2] ?? null) : null,
        item_name: null,
        ability_name: null,

        condition_text: null,
        value_text: null,
        value_num: null,

        flags_json: "{}",
        payload_json: "{}",
      });
    }
  })();

  deriveBroughtFromEvents(db, battleId);

  return { battleId };
}