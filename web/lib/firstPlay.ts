import { ev } from "./ev";
import { once } from "./once";

// Emit the once-ever-per-device `first_play` funnel signal (the new-player numerator for
// visitor → first-play). Fires alongside `ev("play")` on the very first draft a device ever starts,
// then no-ops — so first plays are counted distinctly from replays. Idempotent and side-effect-safe.
export function markFirstPlay(uid: string): void {
  if (once("device", "szn:ev:fp")) ev("first_play", { uid });
}
