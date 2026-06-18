import type { Mode } from "@/components/game/types";

// Which post-game results show the "save your results" sign-in nudge: every mode EXCEPT daily, whose
// Leaderboard already prompts sign-in with a richer claim-your-rank + weekly/all-time flow. Extends
// coverage to the previously-naked factorhunt/blueprint/surgeon/challenge results — the non-Daily
// share-link arrivals who otherwise finish with no reason to make an account. §12-safe: the nudge is
// post-commit and descriptive (SignInSaveNudge), never a hint or a gate.
export function showsSaveNudge(mode: Mode): boolean {
  return mode !== "daily";
}
