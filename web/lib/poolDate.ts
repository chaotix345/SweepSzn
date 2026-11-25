// Pool-by-date (DESIGN.md §12). players.json tags a card with a release key: `since` (it joins the
// draftable pool on the release date) or `until` (it leaves the draftable pool then, but keeps
// resolving by id everywhere). A seed replays against the pool of its own date, so a Daily or a
// challenge drafted before a release still verifies after it. Pure + client-safe.

// The ONE place a release's go-live date is set: 00:00 UTC on this day (YYYY-MM-DD).
export const SEASON_2026_SINCE = "2026-11-27";

export const POOL_RELEASES: Readonly<Record<string, string>> = { "2025-26": SEASON_2026_SINCE };

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const pad = (n: number) => String(n).padStart(2, "0");

export const isoDay = (d: Date = new Date()): string =>
  `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

// A valid calendar day in YYYY-MM-DD form (rejects 2026-02-30 and the like).
export function isIsoDay(s: unknown): s is string {
  if (typeof s !== "string" || !ISO.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  return isoDay(new Date(Date.UTC(y, m - 1, d))) === s;
}

const dayBefore = (iso: string): string => {
  const [y, m, d] = iso.split("-").map(Number);
  return isoDay(new Date(Date.UTC(y, m - 1, d) - 86_400_000));
};

// The pool date for stored challenges that predate pool dating: the last day before the 2025-26 release.
export const LEGACY_AS_OF = dayBefore(SEASON_2026_SINCE);

// The pool date of a saved result that predates storing one: the legacy pool if it was saved before
// the release, else today.
export function legacyResultAsOf(ts: number | undefined, now: Date = new Date()): string {
  return ts !== undefined && ts < Date.parse(`${SEASON_2026_SINCE}T00:00:00Z`) ? LEGACY_AS_OF : isoDay(now);
}

// A card's `since`/`until` release key → its date. Unknown keys return null.
export function releaseDate(key: string): string | null {
  return POOL_RELEASES[key] ?? null;
}

// Date-seeded modes (Daily, Factor Hunt, Blueprint, Surgeon) carry their day: "daily-2026-6-9".
const SEED_DAY = /^(?:daily|fh|bp|surgeon)-(\d{4})-(\d{1,2})-(\d{1,2})$/;
export function seedDay(seed: string): string | null {
  const m = SEED_DAY.exec(seed);
  if (!m) return null;
  const iso = `${m[1]}-${pad(+m[2])}-${pad(+m[3])}`;
  return isIsoDay(iso) ? iso : null;
}

// The pool date a spin or replay uses. A dated seed always uses its own day. Otherwise a caller's
// pinned day (a game's start day, or a challenge's stored creation day) is honoured if it is a real
// day no later than today; anything else means today.
export function resolveAsOf(seed: string, pinned?: unknown, now: Date = new Date()): string {
  const fromSeed = seedDay(seed);
  if (fromSeed) return fromSeed;
  const today = isoDay(now);
  return isIsoDay(pinned) && pinned <= today ? pinned : today;
}
