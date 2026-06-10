import type { DraftStep, Slot } from "./types";

// Keep the trace's slots in lockstep with a court move/swap. The trace records each pick's slot
// at PLACEMENT time; when the player at `aSlot` is moved to `bSlot` (and any occupant of `bSlot`
// back to `aSlot`), the affected entries must be re-stamped with the final slots — otherwise a
// later pick into the vacated slot makes the replay see the same slot twice ("slot reused") and
// every submit (Daily board, challenge respond) is rejected. Eligibility holds because the swap
// UI only offers slots both players are eligible for — the same rule the replay re-checks.
export function applySwapToTrace(
  trace: DraftStep[], aId: string | null | undefined, bId: string | null | undefined, aSlot: Slot, bSlot: Slot,
): void {
  for (const step of trace) {
    if (aId && step.pickedId === aId) step.slot = bSlot;
    else if (bId && step.pickedId === bId) step.slot = aSlot;
  }
}
