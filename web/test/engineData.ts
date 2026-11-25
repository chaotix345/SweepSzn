import fs from "node:fs";
import path from "node:path";
import { DEFAULT_COEFFICIENTS } from "../lib/engine";
import type { Player, Coefficients } from "../lib/types";

const DATA_DIR = path.join(process.cwd(), "public", "data");
export const PLAYERS: Player[] = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "players.json"), "utf-8"));
const coeffRaw = JSON.parse(fs.readFileSync(path.join(DATA_DIR, "coefficients.json"), "utf-8"));
export const META: Record<string, unknown> = coeffRaw._meta ?? {};
const coeffClean = Object.fromEntries(Object.entries(coeffRaw).filter(([k]) => k !== "_meta")) as Partial<Coefficients>;
export const COEFF: Coefficients = { ...DEFAULT_COEFFICIENTS, ...coeffClean };
export const BY_ID = new Map(PLAYERS.map((p) => [p.id, p]));
