import crypto from "node:crypto";
import type BetterSqlite3 from "better-sqlite3";
import type { ShowdownReplayJson } from "./fetchReplayJson";

function uuid() {
  return crypto.randomUUID();
}

function getSetting(db: BetterSqlite3.Database, key: string): string | null {
  const row = db.prepare("SELECT value FROM app_settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? null;
}

function normalizeShowdownName(name: string): string {
  // Showdown names are case-insensitive; also logs sometimes include "☆"
  return name
    .trim()
    .replace(/^☆+/, "")
    .replace(/\s+/g, "")
    .toLowerCase();
}

function parseLogLines(rawLog: string): string[] {
  // keep empty lines out; log uses \n
  return rawLog.split("\n").map((s) => s.trimEnd()).filter((s) => s.length > 0);
}

function parsePipeLine(line: string): string[] {
  // showdown protocol lines start with "|"
  // splitting yields first empty segment
  const parts = line.split("|");
  if (parts[0] === "") parts.shift();
  return parts;
}

function firstTUnix(lines: string[]): number | null {
  for (const l of lines) {
    const parts = parsePipeLine(l);
    if (parts[0] === "t:" && parts[1]) {
      const n = Number(parts[1]);
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

function hasRatedLine(lines: string[]): boolean {
  return lines.some((l) => l === "|rated|" || l.startsWith("|rated|"));
}

function findWinner(lines: string[]): { winnerName: string | null; winnerSide: "p1" | "p2" | null } {
  let winnerName: string | null = null;
  for (const l of lines) {
    const parts = parsePipeLine(l);
    if (parts[0] === "win" && parts[1]) winnerName = parts[1];
  }
  if (!winnerName) return { winnerName: null, winnerSide: null };

  // map to side using |player| lines
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
  const winnerSide = winnerName === p1 ? "p1" : winnerName === p2 ? "p2" : null;
  return { winnerName, winnerSide };
}

export function ingestReplayJson(
  db: BetterSqlite3.Database,
  replayUrl: string,
  replayJsonUrl: string,
  json: ShowdownReplayJson
): { battleId: string } {
  const now = Math.floor(Date.now() / 1000);
  const battleId = uuid();

  const lines = parseLogLines(json.log ?? "");
  const playedAt = firstTUnix(lines) ?? json.uploadtime ?? now;
  const isRated = hasRatedLine(lines) ? 1 : 0;
  const { winnerName, winnerSide } = findWinner(lines);

  const insertBattle = db.prepare(`
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
  `);

  const insertSide = db.prepare(`
    INSERT INTO battle_sides (battle_id, side, is_user, player_name, avatar, rating)
    VALUES (@battle_id, @side, @is_user, @player_name, @avatar, @rating);
  `);

  const insertPreview = db.prepare(`
    INSERT INTO battle_preview_pokemon (battle_id, side, slot_index, species_name, level, gender, shiny, raw_text)
    VALUES (@battle_id, @side, @slot_index, @species_name, @level, @gender, @shiny, @raw_text);
  `);

  const insertRevealed = db.prepare(`
    INSERT INTO battle_revealed_sets (
      battle_id, side, species_name, nickname, item_name, ability_name, tera_type, level, gender, shiny, moves_json, raw_fragment
    ) VALUES (
      @battle_id, @side, @species_name, @nickname, @item_name, @ability_name, @tera_type, @level, @gender, @shiny, @moves_json, @raw_fragment
    );
  `);

  const insertEvent = db.prepare(`
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
  `);

  // 1) battles row
  // We’ll fill gen/game_type by scanning lines quickly.
  let gen: number | null = null;
  let gameType: string | null = null;

  for (const l of lines) {
    const p = parsePipeLine(l);
    if (p[0] === "gen" && p[1]) gen = Number(p[1]);
    if (p[0] === "gametype" && p[1]) gameType = p[1];
  }

  insertBattle.run({
    id: battleId,
    replay_id: json.id,
    replay_url: replayUrl,
    replay_json_url: replayJsonUrl,

    format_id: json.formatid ?? null,
    format_name: json.format ?? null,
    gen: Number.isFinite(gen as number) ? gen : null,
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

  // 2) Parse lines into tables
  let eventIndex = 0;
  let currentTurn: number | null = null;
  let currentT: number | null = null;

  const previewSlotCounter: Record<"p1" | "p2", number> = { p1: 0, p2: 0 };
  const showdownUsername = getSetting(db, "showdown_username");
  const showdownUsernameNorm = showdownUsername
    ? normalizeShowdownName(showdownUsername)
    : null;

  function computeIsUser(playerName: string): 0 | 1 {
    if (!showdownUsernameNorm) return 0;
    return normalizeShowdownName(playerName) === showdownUsernameNorm ? 1 : 0;
}

  for (const l of lines) {
    const parts = parsePipeLine(l);
    const type = parts[0] ?? "unknown";

    if (type === "t:" && parts[1]) {
      const n = Number(parts[1]);
      if (Number.isFinite(n)) currentT = n;
    }

    if (type === "turn" && parts[1]) {
      const n = Number(parts[1]);
      if (Number.isFinite(n)) currentTurn = n;
    }

    if (type === "player") {
      const side = parts[1] as "p1" | "p2";
      const name = parts[2] ?? "";
      const avatar = parts[3] ?? null;
      const rating = parts[4] ? Number(parts[4]) : null;
      if ((side === "p1" || side === "p2") && name) {
        insertSide.run({
          battle_id: battleId,
          side,
          is_user: computeIsUser(name),
          player_name: name,
          avatar,
          rating: Number.isFinite(rating as number) ? rating : null,
        });
      }
    }

    if (type === "poke") {
      const side = parts[1] as "p1" | "p2";
      const rawText = parts[2] ?? "";
      if (side === "p1" || side === "p2") {
        previewSlotCounter[side] += 1;
        const slotIndex = previewSlotCounter[side];

        // Example: "Okidogi, L50, M"
        const bits = rawText.split(",").map((s) => s.trim());
        const species = (bits[0] ?? "").trim();
        const level = bits.find((b) => b.startsWith("L")) ? Number(bits.find((b) => b.startsWith("L"))?.slice(1)) : null;
        const gender = bits.includes("M") ? "M" : bits.includes("F") ? "F" : null;

        insertPreview.run({
          battle_id: battleId,
          side,
          slot_index: slotIndex,
          species_name: species,
          level: Number.isFinite(level as number) ? level : null,
          gender,
          shiny: 0,
          raw_text: rawText,
        });
      }
    }

    if (type === "showteam") {
      const side = parts[1] as "p1" | "p2";
      const blob = parts[2] ?? "";

      // Showteam is a packed list separated by "]"
      // Each entry looks like:
      // "Okidogi||AssaultVest|GuardDog|GunkShot,DrainPunch,...|||M|||50|,,,,,Dark"
      const entries = blob.split("]").map((x) => x.trim()).filter(Boolean);

      for (const entry of entries) {
        const fields = entry.split("|");
        const species = fields[0] ?? "";
        const nickname = fields[1] || null;
        const item = fields[3] || null;
        const ability = fields[4] || null;
        const movesCsv = fields[5] || "";
        const gender = fields[8] === "M" || fields[8] === "F" ? fields[8] : null;
        const level = fields[11] ? Number(fields[11]) : null;

        // Tera type is embedded later in the final chunk (often after commas)
        // In your sample: "...|,,,,,Dark" at the end of the entry
        const tail = fields[12] ?? "";
        const teraGuess = tail.includes(",") ? tail.split(",").pop()?.trim() : null;

        const moves = movesCsv
          .split(",")
          .map((m) => m.trim())
          .filter(Boolean);

        insertRevealed.run({
          battle_id: battleId,
          side,
          species_name: species,
          nickname,
          item_name: item,
          ability_name: ability,
          tera_type: teraGuess || null,
          level: Number.isFinite(level as number) ? level : null,
          gender,
          shiny: 0,
          moves_json: JSON.stringify(moves),
          raw_fragment: entry,
        });
      }
    }

    // Always store the raw line as an event (minimal structured fields for now)
    insertEvent.run({
      battle_id: battleId,
      event_index: eventIndex++,
      turn_num: currentTurn,
      t_unix: currentT,
      line_type: type,
      raw_line: l,
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

  return { battleId };
}