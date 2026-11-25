import type { DraftCandidate, DraftStep, EraContext, LineupResult, Player, Slot } from "@/lib/types";
import type { BlueprintKey } from "@/lib/blueprint";
import type { SgResult } from "@/components/game/useSurgeon";
import type { Mode } from "@/components/game/types";
import { dayUTC } from "@/lib/day";

export type Roster = Record<Slot, DraftCandidate | null>;
export const EMPTY: Roster = { PG: null, SG: null, SF: null, PF: null, C: null };
export interface Spin { team: string; decade: string; candidates: DraftCandidate[]; era?: EraContext }
export type SpinOpts = { lockedTeam?: string; lockedDecade?: string; excludeTeam?: string; excludeDecade?: string; salt?: number };
export type GameResult = { result: LineupResult; players: Player[]; trace: DraftStep[]; usedHints: boolean };
// The full current result kept in localStorage for a same-session refresh (carries the draft trace
// plus, for Factor Hunt, the locked prediction so the verdict chip survives a refresh — and, for
// Blueprint, the committed objective so the execution strip and board submit survive one too).
// asOf is the game's pinned pool date; results saved before it was stored have none (lib/poolDate.ts).
export type LastResult = { mode: Mode; seed: string; asOf?: string; result?: GameResult; fh?: string | null; bp?: BlueprintKey | null; sg?: SgResult };

// Hints are a limited resource: this many assisted picks per game (Classic only), so the engine's
// fit grade can't be used to mindlessly auto-pick all five. Tune here (1 = strict, 3 = friendly).
export const HINT_BUDGET = 2;

export function todaySeed() {
  return dayUTC();
}

// A new game (or leaving one for the picker) owns the URL — drop any restore params so a later
// refresh won't resurrect an old screen.
export function stripRestoreParams() {
  try {
    const u = new URL(window.location.href);
    if (u.searchParams.has("r") || u.searchParams.has("m") || u.searchParams.has("own") || u.searchParams.has("d") || u.searchParams.has("sg")) {
      u.searchParams.delete("r"); u.searchParams.delete("m"); u.searchParams.delete("own"); u.searchParams.delete("d"); u.searchParams.delete("sg");
      window.history.replaceState(null, "", u.pathname + u.search + u.hash);
    }
  } catch { /* no history API */ }
}
