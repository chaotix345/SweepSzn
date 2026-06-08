import type { DraftStep, Player, LineupResult, Slot } from "./types";
import { SLOTS, eligibleOf } from "./teams";

// Anti-cheat core: replay a submitted Daily draft against today's deterministic spins and
// recompute the score. Pure + dependency-injected (no server-only import) so it's unit-testable;
// the route handler injects the real data.ts/engine functions.

export interface SpinPoolOpts {
  exclude?: string[]; lockedTeam?: string | null; lockedDecade?: string | null;
  excludeTeam?: string | null; excludeDecade?: string | null; salt?: number;
}
export interface VerifyDeps {
  spinPool: (seed: string, round: number, opts: SpinPoolOpts) => { team: string; decade: string; ids: string[] };
  getPlayer: (id: string) => Player | undefined;
  evaluate: (players: Player[]) => LineupResult;
}

export type VerifyResult =
  | { ok: true; players: Player[]; result: LineupResult; lineup: string }
  | { ok: false; error: string };

export function verifyDaily(date: string, trace: DraftStep[], deps: VerifyDeps): VerifyResult {
  if (!Array.isArray(trace) || trace.length !== 5) return { ok: false, error: "trace must have 5 picks" };
  const seed = `daily-${date}`;
  const exclude: string[] = [];
  const usedSlots = new Set<string>();
  const picked: Player[] = []; // draft order
  let teamRespins = 0, eraRespins = 0, totalRespins = 0;

  for (let r = 0; r < 5; r++) {
    const step = trace[r];
    if (!step || typeof step.pickedId !== "string" || !(SLOTS as readonly string[]).includes(step.slot) || !Array.isArray(step.respins))
      return { ok: false, error: `bad step ${r}` };
    if (step.respins.length > 2) return { ok: false, error: `too many re-spins ${r}` }; // bound work (≤1 team + ≤1 era total)
    let cur = deps.spinPool(seed, r, { exclude });
    for (const rs of step.respins) {
      const salt = ++totalRespins; // global sequential salt — matches the client's saltRef
      if (rs === "team") { teamRespins++; cur = deps.spinPool(seed, r, { exclude, lockedDecade: cur.decade, excludeTeam: cur.team, salt }); }
      else if (rs === "era") { eraRespins++; cur = deps.spinPool(seed, r, { exclude, lockedTeam: cur.team, excludeDecade: cur.decade, salt }); }
      else return { ok: false, error: `bad respin ${r}` };
      if (teamRespins > 1 || eraRespins > 1) return { ok: false, error: "too many re-spins" };
    }
    if (!cur.ids.includes(step.pickedId)) return { ok: false, error: `off-pool pick ${r}` };
    const player = deps.getPlayer(step.pickedId);
    if (!player) return { ok: false, error: `unknown player ${r}` };
    if (!eligibleOf(player).includes(step.slot)) return { ok: false, error: `ineligible slot ${r}` };
    if (usedSlots.has(step.slot)) return { ok: false, error: `slot reused ${r}` };
    usedSlots.add(step.slot);
    exclude.push(step.pickedId);
    picked.push(player);
  }

  // reorder to slot order PG..C for the engine result + the /r/<lineup> link
  const bySlot = new Map<Slot, Player>(trace.map((s, i) => [s.slot, picked[i]]));
  const ordered = SLOTS.map((s) => bySlot.get(s)).filter((p): p is Player => !!p);
  if (ordered.length !== 5) return { ok: false, error: "missing slots" };
  const people = new Set(ordered.map((p) => p.person_id ?? p.id));
  if (people.size !== 5) return { ok: false, error: "duplicate player" };
  const result = deps.evaluate(ordered);
  return { ok: true, players: ordered, result, lineup: ordered.map((p) => p.id).join(",") };
}
