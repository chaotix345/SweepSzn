import fs from "node:fs";
import path from "node:path";
import { DEFAULT_COEFFICIENTS, quickScore } from "../lib/engine";
import { mulberry32 } from "../lib/rng";
import type { Player, Coefficients } from "../lib/types";

const DATA_DIR = path.join(process.cwd(), "public", "data");
export const PLAYERS: Player[] = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "players.json"), "utf-8"));
const coeffRaw = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "coefficients.json"), "utf-8"));
export const META: Record<string, unknown> = coeffRaw._meta ?? {};
const coeffClean = Object.fromEntries(Object.entries(coeffRaw).filter(([k]) => k !== "_meta")) as Partial<Coefficients>;
export const COEFF: Coefficients = { ...DEFAULT_COEFFICIENTS, ...coeffClean };
export const BY_ID = new Map(PLAYERS.map((p) => [p.id, p]));

export function randomLineups(n = 2000, seed = 7, pool: Player[] = PLAYERS): Player[][] {
  const rnd = mulberry32(seed);
  const out: Player[][] = [];
  while (out.length < n) {
    const used = new Set<string>();
    const five: Player[] = [];
    while (five.length < 5) {
      const p = pool[Math.floor(rnd() * pool.length)];
      const person = p.person_id ?? p.id;
      if (used.has(person)) continue;
      used.add(person); five.push(p);
    }
    out.push(five);
  }
  return out;
}

export function spreadSD(pool: Player[] = PLAYERS, n = 2000, seed = 7): number {
  const w = randomLineups(n, seed, pool).map((l) => quickScore(l, COEFF).wins);
  const m = w.reduce((a, b) => a + b, 0) / w.length;
  return Math.sqrt(w.reduce((a, b) => a + (b - m) ** 2, 0) / w.length);
}

export const BY_PEAK = [...PLAYERS].sort((a, b) => (b.peak_score ?? 0) - (a.peak_score ?? 0));
