// Share-your-rank card encoding: a rank snapshot becomes one URL path segment for /rank/<card>.
// Isomorphic (btoa/atob exist in the browser AND Node 20) so the client encodes and the server
// (OG image + page) decodes. Fields are dot-delimited; the display name is base64url (no dots).

import { cleanName } from "./clean";

export type RankScope = "daily" | "week" | "alltime";
export interface RankCard {
  scope: RankScope;
  rank: number;
  total: number;
  name: string;
  wins: number;   // daily: that game's wins; week/alltime: cumulative wins
  losses: number; // daily only (0 for week/alltime)
  net: number;    // daily only (0 for week/alltime)
}

const MAX_TOTAL = 1_000_000_000;
const CODE: Record<RankScope, string> = { daily: "d", week: "w", alltime: "a" };
const SCOPE: Record<string, RankScope> = { d: "daily", w: "week", a: "alltime" };

const enc = (s: string) => btoa(encodeURIComponent(s)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const dec = (s: string) => { try { return decodeURIComponent(atob(s.replace(/-/g, "+").replace(/_/g, "/"))); } catch { return ""; } };

export function encodeRankCard(c: RankCard): string {
  // normalize net through the same 1-decimal path the board displays, so the card never disagrees
  const net10 = Math.round(parseFloat(c.net.toFixed(1)) * 10);
  return [CODE[c.scope], Math.round(c.rank), Math.round(c.total), Math.round(c.wins), Math.round(c.losses), net10, enc(c.name)].join(".");
}

export function decodeRankCard(seg: string): RankCard | null {
  const parts = seg.split("."); // Next already URL-decodes the route param; base64url has no dots
  if (parts.length !== 7) return null;
  const scope = SCOPE[parts[0]];
  if (!scope) return null;
  const [rank, total, wins, losses, net10] = parts.slice(1, 6).map(Number);
  // crafted URLs must not render nonsense: integer 1 <= rank <= total; a daily card is one 82-game
  // record with |net| < 100; week/alltime carry cumulative wins only (a week = at most 7 dailies)
  const int = (n: number, lo: number, hi: number) => Number.isInteger(n) && n >= lo && n <= hi;
  if (!int(total, 1, MAX_TOTAL) || !int(rank, 1, total)) return null;
  if (scope === "daily" ? !int(wins, 0, 82) || !int(losses, 0, 82) || !int(net10, -999, 999)
    : !int(wins, 0, scope === "week" ? 82 * 7 : MAX_TOTAL) || losses !== 0 || net10 !== 0) return null;
  return { scope, rank, total, wins, losses, net: net10 / 10, name: cleanName(dec(parts[6])) || "Player" };
}
