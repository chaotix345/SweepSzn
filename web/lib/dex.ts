import type { TraitKey } from "./types";

// Drafted Dex: a persistent collection of every player a user has fielded, plus achievement badges.
// Everything here is DESCRIPTIVE — badge conditions read real box/identity fields and the round's
// final grade, never an engine/fit signal, and fire only post-commit (DESIGN.md §12 trust model).

export interface DexPlayer {
  id: string; personId: string; name: string; team: string; decade: string;
  pos: string; eligible: string[];
  pts: number | null; trb: number | null; ast: number | null; stl: number | null; blk: number | null;
  fame: number; traits: TraitKey[];
}

export type BadgeKey =
  | "first" | "scorer" | "glass" | "swat" | "general"
  | "eraTourist" | "fullCircle" | "allFranchise" | "sixties" | "sTier" | "tripleThreat" | "underdog";

export interface BadgeDef { key: BadgeKey; name: string; hint: string }

// hint is shown only AFTER a badge unlocks — a locked badge reveals its name (the category) but not
// the unlock formula, so discovery stays part of the fun (and it never reads as a "do X next" nudge).
export const BADGES: BadgeDef[] = [
  { key: "first",        name: "First Fieldsman", hint: "Draft your first player" },
  { key: "scorer",       name: "Bucket Getter",   hint: "Field a 30+ PPG scorer" },
  { key: "glass",        name: "Glass Ceiling",   hint: "Field a 15+ RPG rebounder" },
  { key: "swat",         name: "Rejection Notice", hint: "Field a 3+ BPG rim protector" },
  { key: "general",      name: "Floor General",   hint: "Field a 12+ APG playmaker" },
  { key: "eraTourist",   name: "Era Tourist",     hint: "Field players from 5 different decades" },
  { key: "fullCircle",   name: "Full Circle",     hint: "Field players from every draftable decade" },
  { key: "allFranchise", name: "Well Traveled",   hint: "Field players from 10 different franchises" },
  { key: "sixties",      name: "Old School",      hint: "Field a player from the 1960s" },
  { key: "sTier",        name: "Perfection",      hint: "Earn an S grade in any mode" },
  { key: "tripleThreat", name: "Triple Threat",   hint: "Field a player eligible at 3 positions" },
  { key: "underdog",     name: "Unsung Hero",     hint: "Field a player with no major accolades" },
];

const DRAFTABLE_DECADES = 7; // 1960s–2020s

// Pure: which badges this collection (+ the user's result grades) has earned.
export function computeBadges(players: DexPlayer[], results: { grade: string }[]): BadgeKey[] {
  const decades = new Set(players.map((p) => p.decade));
  const teams = new Set(players.map((p) => p.team));
  const has = (f: (p: DexPlayer) => boolean) => players.some(f);
  const earned: BadgeKey[] = [];
  if (players.length >= 1) earned.push("first");
  if (has((p) => (p.pts ?? 0) >= 30)) earned.push("scorer");
  if (has((p) => (p.trb ?? 0) >= 15)) earned.push("glass");
  if (has((p) => (p.blk ?? 0) >= 3)) earned.push("swat");
  if (has((p) => (p.ast ?? 0) >= 12)) earned.push("general");
  if (decades.size >= 5) earned.push("eraTourist");
  if (decades.size >= DRAFTABLE_DECADES) earned.push("fullCircle");
  if (teams.size >= 10) earned.push("allFranchise");
  if (has((p) => p.decade === "1960s")) earned.push("sixties");
  if (results.some((r) => r.grade === "S")) earned.push("sTier");
  if (has((p) => p.eligible.length >= 3)) earned.push("tripleThreat");
  if (has((p) => p.fame === 0 && p.pts != null)) earned.push("underdog"); // real record, just no accolades (not a data gap)
  return earned;
}
