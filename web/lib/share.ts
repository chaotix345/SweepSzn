// Lineup share encoding: the 5 drafted player ids, in slot order (PG,SG,SF,PF,C),
// become a single URL path segment. The engine result is deterministic from these
// ids, so /r/<encoded> reconstructs the exact result (and OG card) for a recipient.
// Player ids are [a-z0-9_], so a comma separator stays URL-path-safe.

export const LINEUP_SEP = ",";
// Leading flag prefixes ride inside the /r/ path segment (player ids are [a-z0-9_], so "x~" can't
// collide) so the dynamic OG card can show the stamps too: "h~" = drafted with Hints, "p~" = a
// Prime Draft five (all-eras peak variants — OG gets the PRIME badge), "b<code>~" = a Blueprint
// five with its one-letter blueprint code (lib/blueprint.ts owns the code↔key map — OG gets the
// blueprint badge + execution grade). Order-independent on decode.
// NOTE: every parser that consumes lineup segments must accept new prefixes — that's decodeShare
// here AND pickem.ts's LINEUP_SEG_RE (a missed p~ there was a real review finding).
const HINT_PREFIX = "h~";
const PRIME_PREFIX = "p~";
const BP_PREFIX_RE = /^b([a-z])~/;

export function encodeLineup(ids: string[], usedHints = false, prime = false, bp: string | null = null): string {
  return (bp ? `b${bp}~` : "") + (prime ? PRIME_PREFIX : "") + (usedHints ? HINT_PREFIX : "") + ids.join(LINEUP_SEP);
}

// Decode a /r/ segment into the 5 ids plus its flag stamps (`bp` = the one-letter blueprint code).
export function decodeShare(segment: string): { ids: string[]; hinted: boolean; prime: boolean; bp: string | null } {
  // Next already URL-decodes the route param; guard against a still-encoded comma anyway.
  let s = decodeURIComponent(segment);
  let hinted = false, prime = false, bp: string | null = null;
  for (;;) {
    if (!hinted && s.startsWith(HINT_PREFIX)) { hinted = true; s = s.slice(HINT_PREFIX.length); continue; }
    if (!prime && s.startsWith(PRIME_PREFIX)) { prime = true; s = s.slice(PRIME_PREFIX.length); continue; }
    if (!bp) {
      const m = BP_PREFIX_RE.exec(s);
      if (m) { bp = m[1]; s = s.slice(m[0].length); continue; }
    }
    break;
  }
  return { ids: s.split(LINEUP_SEP).map((x) => x.trim()).filter(Boolean), hinted, prime, bp };
}

export function decodeLineup(segment: string): string[] {
  return decodeShare(segment).ids;
}
