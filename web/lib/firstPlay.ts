import { ev } from "./ev";
import { once } from "./once";

// Emit the once-ever-per-device `first_play` funnel signal (the new-player numerator for
// visitor → first-play). Fires alongside `ev("play")` on the very first draft a device ever starts,
// then no-ops — so first plays are counted distinctly from replays. Idempotent and side-effect-safe.
// `source` (first-touch utm channel) and `ref` (inbound referral code) ride only this genuine first
// play, attributing the new player to the channel/friend that brought them.
export function markFirstPlay(uid: string, source?: string, ref?: string): void {
  if (!once("device", "szn:ev:fp")) return;
  const props: { uid: string; source?: string; ref?: string } = { uid };
  if (source) props.source = source;
  if (ref) props.ref = ref;
  ev("first_play", props);
}
