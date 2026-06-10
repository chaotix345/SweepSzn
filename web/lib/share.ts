// Lineup share encoding: the 5 drafted player ids, in slot order (PG,SG,SF,PF,C),
// become a single URL path segment. The engine result is deterministic from these
// ids, so /r/<encoded> reconstructs the exact result (and OG card) for a recipient.
// Player ids are [a-z0-9_], so a comma separator stays URL-path-safe.

export const LINEUP_SEP = ",";
// Leading flag prefixes ride inside the /r/ path segment (player ids are [a-z0-9_], so "x~" can't
// collide) so the dynamic OG card can show the stamps too: "h~" = drafted with Hints, "p~" = a
// Prime Draft five (all-eras peak variants — OG gets the PRIME badge). Order-independent.
const HINT_PREFIX = "h~";
const PRIME_PREFIX = "p~";

export function encodeLineup(ids: string[], usedHints = false, prime = false): string {
  return (prime ? PRIME_PREFIX : "") + (usedHints ? HINT_PREFIX : "") + ids.join(LINEUP_SEP);
}

// Decode a /r/ segment into the 5 ids plus its flag stamps.
export function decodeShare(segment: string): { ids: string[]; hinted: boolean; prime: boolean } {
  // Next already URL-decodes the route param; guard against a still-encoded comma anyway.
  let s = decodeURIComponent(segment);
  let hinted = false, prime = false;
  for (;;) {
    if (!hinted && s.startsWith(HINT_PREFIX)) { hinted = true; s = s.slice(HINT_PREFIX.length); continue; }
    if (!prime && s.startsWith(PRIME_PREFIX)) { prime = true; s = s.slice(PRIME_PREFIX.length); continue; }
    break;
  }
  return { ids: s.split(LINEUP_SEP).map((x) => x.trim()).filter(Boolean), hinted, prime };
}

export function decodeLineup(segment: string): string[] {
  return decodeShare(segment).ids;
}
