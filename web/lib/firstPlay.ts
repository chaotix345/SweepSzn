import { ev } from "./ev";
import { once } from "./once";

// Emit the once-ever-per-device `first_play` funnel signal (the new-player numerator for
// visitor → first-play). Fires alongside `ev("play")` on the very first draft a device ever starts,
// then no-ops — so first plays are counted distinctly from replays. Idempotent and side-effect-safe.
// `source` (the first-touch utm channel) rides only this genuine first play, attributing the new
// player to the channel that brought them.
export function markFirstPlay(uid: string, source?: string): void {
  if (once("device", "szn:ev:fp")) ev("first_play", source ? { uid, source } : { uid });
}
