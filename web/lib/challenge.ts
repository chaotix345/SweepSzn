// Pure, client-safe challenge helpers (no server-only imports). Used by the client to mint a
// challenge id + seed, and by the API route to decide a head-to-head winner.

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
