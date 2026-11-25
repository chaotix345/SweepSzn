import { listResults } from "./resultHistory";
import type { BadgeKey, DexPlayer } from "./dex";

export interface DexData { players: DexPlayer[]; total: number; badges: BadgeKey[]; signedIn: boolean }

// Local-first Drafted Dex: posts this device's localStorage result history to /api/dex, which resolves
// it into the collection (and unions the account's Dex when signed in). Works signed out, never 401s.
// Returns null on any failure so callers can stay silent.
export async function fetchDex(): Promise<DexData | null> {
  try {
    const results = listResults().map(({ mode, encoded, grade }) => ({ mode, encoded, grade }));
    const r = await fetch("/api/dex", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ results }),
    });
    if (!r.ok) return null;
    const d = await r.json();
    return d && Array.isArray(d.players) ? (d as DexData) : null;
  } catch {
    return null;
  }
}
