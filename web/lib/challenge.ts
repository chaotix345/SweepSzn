// Pure, client-safe challenge helpers (no server-only imports). Used by the client to mint a
// challenge id + seed, and by the API route to decide a head-to-head winner.

import { SLOTS } from "./teams";
import { decodeLineup, encodeLineup } from "./share";
import type { ChallengeMiniPlayer, ChallengeOwnerResponder, ChallengeOwnerView } from "./types";

const ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789"; // [a-z0-9], comma-free, no "daily-" collision

// 8 random chars (~2.8e12 keyspace). Uses crypto when available, falls back to Math.random.
export function newChallengeId(): string {
  let out = "";
  const cryptoObj = typeof globalThis !== "undefined" ? (globalThis.crypto as Crypto | undefined) : undefined;
  if (cryptoObj?.getRandomValues) {
    const buf = new Uint32Array(8);
    cryptoObj.getRandomValues(buf);
    for (let i = 0; i < 8; i++) out += ALPHABET[buf[i] % ALPHABET.length];
  } else {
    for (let i = 0; i < 8; i++) out += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return out;
}

export function challengeSeed(id: string): string {
  return `h2h-${id}`;
}

type Scoreish = { wins: number; netRtg: number };

// Winner = more wins; tiebreak = higher netRtg; else a true tie. Margins are (a - b).
export function compareResults(a: Scoreish, b: Scoreish): { winner: "a" | "b" | "tie"; winsMargin: number; netMargin: number } {
  const winsMargin = a.wins - b.wins;
  const netMargin = a.netRtg - b.netRtg;
  let winner: "a" | "b" | "tie" = "tie";
  if (a.wins !== b.wins) winner = a.wins > b.wins ? "a" : "b";
  else if (a.netRtg !== b.netRtg) winner = a.netRtg > b.netRtg ? "a" : "b";
  return { winner, winsMargin, netMargin };
}

// ---- Creator dashboard assembly (pure; the store injects the real player lookup) ----

type OwnerInfo = { uid: string; name: string; wins: number; losses: number; net: number; grade: string; lineup: string; hinted?: boolean };
type OwnerRow = { uid: string; name: string; wins: number; losses: number; net: number; lineup: string; rank: number };
type MiniLookup = (id: string) => { id: string; name: string; team: string; decade: string } | null;

// Resolve a stored lineup string into the (up to) five mini-players, slot-labelled by position. Stale
// ids that no longer resolve are dropped (mirrors the submit route), so a data refresh never 500s.
function resolveFive(lineup: string, getPlayer: MiniLookup): ChallengeMiniPlayer[] {
  return decodeLineup(lineup)
    .map((id, i) => { const p = getPlayer(id); return p ? { id: p.id, name: p.name, team: p.team, decade: p.decade, slot: SLOTS[i] } : null; })
    .filter((p): p is ChallengeMiniPlayer => !!p);
}

// Build the creator-facing dashboard: their bar + five, and every responder's five + verdict against
// that bar. `outcome` is the responder's result vs the creator (win = responder beat the creator).
export function buildOwnerView(id: string, info: OwnerInfo, rows: OwnerRow[], total: number, getPlayer: MiniLookup): ChallengeOwnerView {
  const responders: ChallengeOwnerResponder[] = rows
    .filter((r) => r.uid !== info.uid) // the creator occupies a board slot too — never list them as their own opponent
    .map((r) => {
      const cmp = compareResults({ wins: r.wins, netRtg: r.net }, { wins: info.wins, netRtg: info.net });
      return {
        rank: r.rank, name: r.name, wins: r.wins, losses: r.losses, net: r.net,
        outcome: cmp.winner === "a" ? "win" : cmp.winner === "b" ? "loss" : "tie",
        winsMargin: cmp.winsMargin, netMargin: Math.round(cmp.netMargin * 10) / 10,
        players: resolveFive(r.lineup, getPlayer),
        resultUrl: `/r/${encodeLineup(decodeLineup(r.lineup))}`, // responder hint flag isn't stored — link without the stamp
      };
    });
  return {
    id,
    creator: {
      name: info.name, wins: info.wins, losses: info.losses, net: info.net, grade: info.grade, hinted: !!info.hinted,
      rank: rows.find((r) => r.uid === info.uid)?.rank ?? null,
      players: resolveFive(info.lineup, getPlayer),
      resultUrl: `/r/${encodeLineup(decodeLineup(info.lineup), !!info.hinted)}`,
    },
    total,
    responders,
  };
}
