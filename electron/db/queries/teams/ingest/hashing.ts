// teams/ingest/hashing.ts
import crypto from "node:crypto";
import type { ParsedSet } from "./parseShowdownExport";
import { canonicalizeSourceText } from "./canonicalize";

type StatKey = "hp" | "atk" | "def" | "spa" | "spd" | "spe";

function sha256(s: string) {
  return crypto.createHash("sha256").update(s, "utf8").digest("hex");
}

export function sourceHashFromText(raw: string) {
  return sha256(canonicalizeSourceText(raw));
}

function canonStats(label: string, xs: Partial<Record<StatKey, number | null | undefined>>) {
  const order: StatKey[] = ["hp", "atk", "def", "spa", "spd", "spe"];
  const parts = order
    .filter((k) => xs[k] != null)
    .map((k) => `${xs[k]} ${k}`);
  return `${label}:${parts.join(",")}`;
}

function evMapFromSet(s: ParsedSet): Partial<Record<StatKey, number | null>> {
  return {
    hp: s.ev_hp,
    atk: s.ev_atk,
    def: s.ev_def,
    spa: s.ev_spa,
    spd: s.ev_spd,
    spe: s.ev_spe,
  };
}

function ivMapFromSet(s: ParsedSet): Partial<Record<StatKey, number | null>> {
  return {
    hp: s.iv_hp,
    atk: s.iv_atk,
    def: s.iv_def,
    spa: s.iv_spa,
    spd: s.iv_spd,
    spe: s.iv_spe,
  };
}

function norm(s: string | null | undefined) {
  return (s ?? "").trim();
}

function normNum(n: number | null | undefined) {
  return n == null ? "" : String(n);
}

export function setHash(s: ParsedSet) {
  const moves = (s.moves ?? [])
    .map((m) => m.trim())
    .filter(Boolean)
    .slice(0, 4)
    .join("|");

  const blob = [
    `species=${norm(s.species_name)}`,
    `nick=${norm(s.nickname)}`,
    `item=${norm(s.item_name)}`,
    `ability=${norm(s.ability_name)}`,
    `level=${normNum(s.level)}`,
    `gender=${norm(s.gender)}`,
    `shiny=${s.shiny ?? 0}`,
    `tera=${norm(s.tera_type)}`,
    `happy=${normNum(s.happiness)}`,
    `nature=${norm(s.nature)}`,
    canonStats("ev", evMapFromSet(s)),
    canonStats("iv", ivMapFromSet(s)),
    `moves=${moves}`,
  ].join("\n");

  return sha256(blob);
}