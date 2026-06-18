import type { Mode } from "@/components/game/types";

// The modes a bare `/play?mode=<m>` deep-link may start. `challenge` is excluded on purpose: it
// can't start from a mode name alone — it needs a `?c=<id>` so respond mode can replay the
// creator's seed (see Game.tsx). One source of truth so the Game wiring and the CTAs can't drift.
export const DEEP_LINK_MODES = ["daily", "classic", "hoopiq", "factorhunt", "prime", "blueprint", "surgeon"] as const;

const VALID = new Set<string>(DEEP_LINK_MODES);

// Strict, case-sensitive parse of the `?mode=` query value. Returns the Mode or null (unknown,
// empty, wrong-case, padded, or `challenge`) so the caller falls through to the mode picker.
export function parseModeParam(raw: string | null | undefined): Mode | null {
  return raw && VALID.has(raw) ? (raw as Mode) : null;
}
