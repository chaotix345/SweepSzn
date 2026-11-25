import { useEffect } from "react";
import { encodeLineup } from "@/lib/share";
import { bpCode, type BlueprintKey } from "@/lib/blueprint";
import type { Mode } from "@/components/game/types";
import type { GameResult } from "@/components/game/gameState";
import type { SgResult } from "@/components/game/useSurgeon";

// Hold-your-place: while a finished result is on screen, mirror it into the URL (?r=&m=) so a refresh
// restores it. Challenge mode owns the URL via ?own=<id> (set by ChallengeOwner), so it's skipped here.
// Surgeon hold-your-place: mirror the /sg/ card so a same-session refresh restores the delta.
export function useHoldYourPlace(mode: Mode | null, seed: string, result: GameResult | null, blueprint: BlueprintKey | null, sgResult: SgResult | null) {
  useEffect(() => {
    if (mode !== "surgeon" || !sgResult) return;
    try {
      const u = new URL(window.location.href);
      u.searchParams.set("sg", sgResult.card); u.searchParams.set("m", "surgeon");
      u.searchParams.delete("r"); u.searchParams.delete("d"); u.searchParams.delete("c"); u.searchParams.delete("own");
      window.history.replaceState(null, "", u.pathname + u.search + u.hash);
    } catch { /* no history API */ }
  }, [mode, sgResult]);

  useEffect(() => {
    if (!result || !mode || mode === "challenge") return;
    try {
      const u = new URL(window.location.href);
      u.searchParams.set("r", encodeLineup(result.players.map((p) => p.id), result.usedHints, mode === "prime", mode === "blueprint" && blueprint ? bpCode(blueprint) : null));
      u.searchParams.set("m", mode);
      // daily/FH/blueprint boards are per-date — carry the date so a cold restore shows the right day's board, not today's
      if (mode === "daily") u.searchParams.set("d", seed.replace("daily-", ""));
      else if (mode === "factorhunt") u.searchParams.set("d", seed.replace("fh-", ""));
      else if (mode === "blueprint") u.searchParams.set("d", seed.replace("bp-", ""));
      else u.searchParams.delete("d");
      u.searchParams.delete("c"); u.searchParams.delete("own");
      window.history.replaceState(null, "", u.pathname + u.search + u.hash);
    } catch { /* no history API */ }
  }, [result, mode, seed, blueprint]);
}
