import type { Slot } from "./types";
import { SLOTS } from "./teams";

// F25 one-tap placement: the single open slot this candidate can play, or null when none or several
// fit (then the player chooses the slot, the two-step flow).
export function onlyOpenSlot(c: { eligible: readonly Slot[] }, roster: Record<Slot, unknown>): Slot | null {
  const fits = SLOTS.filter((s) => !roster[s] && c.eligible.includes(s));
  return fits.length === 1 ? fits[0] : null;
}
