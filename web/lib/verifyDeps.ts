import "server-only";
import { spinPool, getPlayersByIds, getCoefficients } from "@/lib/data";
import { evaluateLineup } from "@/lib/engine";
import type { VerifyDeps } from "@/lib/dailyVerify";

// Shared factory for the standard { spinPool, getPlayer, evaluate } wiring used by every submit
// route. The optional capture callback lets callers (surgeon/pool, surgeon/submit) intercept each
// round's final pool ids — pass undefined (or omit) for the plain three-field object.
export function engineDeps(capture?: (round: number, ids: string[]) => void): VerifyDeps {
  if (!capture) {
    return {
      spinPool,
      getPlayer: (id) => getPlayersByIds([id])[0],
      evaluate: (players) => evaluateLineup(players, getCoefficients()),
    };
  }
  return {
    spinPool: (seed, round, opts) => {
      const r = spinPool(seed, round, opts);
      capture(round, r.ids);
      return r;
    },
    getPlayer: (id) => getPlayersByIds([id])[0],
    evaluate: (players) => evaluateLineup(players, getCoefficients()),
  };
}
