// Lineup share encoding: the 5 drafted player ids, in slot order (PG,SG,SF,PF,C),
// become a single URL path segment. The engine result is deterministic from these
// ids, so /r/<encoded> reconstructs the exact result (and OG card) for a recipient.
// Player ids are [a-z0-9_], so a comma separator stays URL-path-safe.

export const LINEUP_SEP = ",";
// A leading "h~" marks a result that was drafted with Hints. It rides inside the /r/ path segment
// (player ids are [a-z0-9_], so "h~" can't collide) so the dynamic OG card can show the stamp too.
const HINT_PREFIX = "h~";

export function encodeLineup(ids: string[], usedHints = false): string {
  return (usedHints ? HINT_PREFIX : "") + ids.join(LINEUP_SEP);
}

// Decode a /r/ segment into the 5 ids plus whether it was hint-stamped.
export function decodeShare(segment: string): { ids: string[]; hinted: boolean } {
  // Next already URL-decodes the route param; guard against a still-encoded comma anyway.
  const s = decodeURIComponent(segment);
  const hinted = s.startsWith(HINT_PREFIX);
  const body = hinted ? s.slice(HINT_PREFIX.length) : s;
  return { ids: body.split(LINEUP_SEP).map((x) => x.trim()).filter(Boolean), hinted };
}

export function decodeLineup(segment: string): string[] {
  return decodeShare(segment).ids;
}
