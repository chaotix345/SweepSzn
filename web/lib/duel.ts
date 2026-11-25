// Draft Duel: pure, client-safe helpers shared by the game UI, the server routes and the /duel/ share
// page. The bot's choice logic lives server-side only (lib/duelBot.ts) — DESIGN.md §12.

import { LINEUP_SEP, safeDecode } from "./share";

export type Persona = "bro" | "oldhead" | "analyst";
export type DuelSide = "you" | "bot";
export type DuelOutcome = "w" | "l" | "t";

export interface PersonaInfo { key: Persona; code: string; name: string; level: "Easy" | "Medium" | "Hard"; blurb: string }

export const PERSONAS: PersonaInfo[] = [
  { key: "bro", code: "b", name: "Box-Score Bro", level: "Easy", blurb: "Takes the biggest box score on the board. Never looks at defense or usage." },
  { key: "oldhead", code: "o", name: "Old Head", level: "Medium", blurb: "Trusts pre-1990 legends, big men, rim protection and rings." },
  { key: "analyst", code: "a", name: "The Analyst", level: "Hard", blurb: "Takes whoever adds the most net rating to his five. Never plans ahead." },
];
export const DEFAULT_PERSONA: Persona = "oldhead";

export function personaInfo(p: Persona): PersonaInfo {
  return PERSONAS.find((x) => x.key === p)!;
}

export function isPersona(x: unknown): x is Persona {
  return typeof x === "string" && PERSONAS.some((p) => p.key === x);
}

// Snake order over 5 rounds: R1 you→bot, R2 bot→you, R3 you→bot, R4 bot→you, R5 you→bot.
export const DUEL_TURNS: DuelSide[] = ["you", "bot", "bot", "you", "you", "bot", "bot", "you", "you", "bot"];
export const turnRound = (turn: number) => turn >> 1;

const SEED_RE = /^duel-[a-z0-9]{1,24}$/;
export const isDuelSeed = (s: unknown): boolean => typeof s === "string" && SEED_RE.test(s);

export function newDuelSeed(): string {
  return `duel-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

export function outcomeFromWinner(w: "a" | "b" | "tie"): DuelOutcome {
  return w === "a" ? "w" : w === "b" ? "l" : "t";
}

// Permalink segment: "d<persona code>~<your five>.<bot five>", both in slot order (PG,SG,SF,PF,C).
// Player ids are [a-z0-9_], so "~", "." and "," stay unambiguous and path-safe.
const CARD_RE = /^d([a-z])~([a-z0-9_,]+)\.([a-z0-9_,]+)$/;

export function encodeDuelCard(persona: Persona, youIds: string[], botIds: string[]): string {
  return `d${personaInfo(persona).code}~${youIds.join(LINEUP_SEP)}.${botIds.join(LINEUP_SEP)}`;
}

export function decodeDuelCard(card: string): { persona: Persona; youIds: string[]; botIds: string[] } | null {
  const m = CARD_RE.exec(safeDecode(card));
  if (!m) return null;
  const persona = PERSONAS.find((p) => p.code === m[1])?.key;
  const split = (s: string) => s.split(LINEUP_SEP).filter(Boolean);
  const youIds = split(m[2]), botIds = split(m[3]);
  if (!persona || youIds.length !== 5 || botIds.length !== 5) return null;
  return { persona, youIds, botIds };
}
