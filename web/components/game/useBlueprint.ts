import { useState, useRef, useCallback } from "react";
import { track } from "@vercel/analytics";
import type { BlueprintKey } from "@/lib/blueprint";

export function useBlueprint() {
  // Blueprint: the objective committed in the pre-spin modal (locks at confirm — gameplay psychology;
  // the server grades whatever the submit declares, see /api/blueprint/submit).
  const [blueprint, setBlueprint] = useState<BlueprintKey | null>(null);
  const [bpPick, setBpPick] = useState<BlueprintKey | null>(null);      // highlighted option (not yet committed)
  const bpRef = useRef<HTMLDivElement>(null);                           // commit dialog

  // Blueprint commitment handlers: confirm locks the objective for this game (client-side
  // psychology — the board's stratification is the real invariant); Escape backs out to the picker.
  const commitBlueprint = useCallback((k: BlueprintKey) => {
    setBlueprint(k); setBpPick(null);
    track("bp_commit", { blueprint: k });
  }, []);

  const reset = useCallback(() => {
    setBlueprint(null); setBpPick(null); // blueprint re-commits every game (the modal gates the first spin)
  }, []);

  return { blueprint, setBlueprint, bpPick, setBpPick, bpRef, commitBlueprint, reset };
}
