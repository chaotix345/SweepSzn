// Lineup share encoding: the 5 drafted player ids, in slot order (PG,SG,SF,PF,C),
// become a single URL path segment. The engine result is deterministic from these
// ids, so /r/<encoded> reconstructs the exact result (and OG card) for a recipient.
// Player ids are [a-z0-9_], so a comma separator stays URL-path-safe.

export const LINEUP_SEP = ",";

export function encodeLineup(ids: string[]): string {
  return ids.join(LINEUP_SEP);
}

export function decodeLineup(segment: string): string[] {
  // Next already URL-decodes the route param; guard against a still-encoded comma anyway.
  return decodeURIComponent(segment).split(LINEUP_SEP).map((s) => s.trim()).filter(Boolean);
}
