// Pick'Em: a one-tap crowd vote locked before drafting ("will the best possible five from this
// roster win MORE than 60 games?"), then settled by your actual record on the result card.
// Pure + isomorphic helpers (no server-only) so they're unit-testable with tsx; the /api/pickem
// route and the client both import from here. localStorage helpers are client-only but
// try/catch-guarded (streak.ts pattern), so importing this file server-side is harmless.

export const PICKEM_THRESHOLD = 60; // "more than 60 wins" — calibrated high so the crowd is often wrong

export type PickemVote = "y" | "n";
export interface PickemView { y: number; n: number; vote: PickemVote | null }

// Modes where the overlay runs. Challenge replays someone else's seed (no vote), and any other
// prefix is rejected so the API can't be used to mint arbitrary Redis keys.
const PICKEM_SEED_RE = /^(daily|classic|hoopiq)-[a-z0-9-]{1,40}$/;

export function pickemSeedOk(seed: unknown): seed is string {
  return typeof seed === "string" && PICKEM_SEED_RE.test(seed);
}

export function parseVote(v: unknown): PickemVote | null {
  return v === "y" || v === "n" ? v : null;
}

export interface PickemVerdict {
  hit: boolean;                 // the record settled the question as "yes" (wins > threshold)
  total: number;                // votes cast (the voter's own vote included)
  crowd: PickemVote | null;     // majority pick (null = no votes or a tie)
  pct: number;                  // the majority's share, 0-100 (0 when crowd is null)
  crowdRight: boolean | null;
  youRight: boolean | null;     // null when you skipped the vote
  defied: boolean;              // you voted against the majority AND you were right
  solo: boolean;                // your vote is the only one — self-prediction, not a crowd story
}

export function pickemVerdict(wins: number, v: PickemView): PickemVerdict {
  const total = Math.max(0, v.y) + Math.max(0, v.n);
  const hit = wins > PICKEM_THRESHOLD;
  const crowd: PickemVote | null = total === 0 || v.y === v.n ? null : v.y > v.n ? "y" : "n";
  const pct = crowd ? Math.round((100 * (crowd === "y" ? v.y : v.n)) / total) : 0;
  const crowdRight = crowd ? (crowd === "y") === hit : null;
  const youRight = v.vote ? (v.vote === "y") === hit : null;
  const solo = !!v.vote && total <= 1;
  const defied = !solo && !!v.vote && !!crowd && v.vote !== crowd && youRight === true;
  return { hit, total, crowd, pct, crowdRight, youRight, defied, solo };
}

// Share-text narrative — only the "I defied the crowd" moment changes the share copy (spec);
// every other outcome keeps the standard share line. Returns null when there's no defy story.
export function pickemShareLine(wins: number, losses: number, v: PickemView, subject?: string | null): string | null {
  const d = pickemVerdict(wins, v);
  if (!d.defied) return null;
  const where = subject ?? "today's spin";
  return d.hit
    ? `I defied the crowd — ${wins}-${losses} on ${where} when ${d.pct}% said they'd flop.`
    : `I called the flop — ${wins}-${losses} on ${where} when ${d.pct}% said 60+ wins was a lock.`;
}

// --- /pe/<card> share segment: "<y>.<n>.<v|x>.<lineupSegment>" ---
// The lineup segment is encodeLineup() output ([a-z0-9_,] plus an optional "h~" prefix — no
// dots), so dot-delimiting is collision-free, mirroring rankShare's card encoding.

const LINEUP_SEG_RE = /^(h~)?[a-z0-9_]+(,[a-z0-9_]+){4}$/;
const MAX_VOTES = 1_000_000_000;

export function encodePickemCard(lineup: string, v: PickemView): string {
  return [Math.round(v.y), Math.round(v.n), v.vote ?? "x", lineup].join(".");
}

export function decodePickemCard(seg: string): { lineup: string; view: PickemView } | null {
  // Next already URL-decodes the route param; guard a still-encoded segment anyway.
  const parts = decodeURIComponent(seg).split(".");
  if (parts.length !== 4) return null;
  const y = Number(parts[0]), n = Number(parts[1]);
  if (!Number.isInteger(y) || !Number.isInteger(n) || y < 0 || n < 0 || y > MAX_VOTES || n > MAX_VOTES) return null;
  const vote = parts[2] === "x" ? null : parseVote(parts[2]);
  if (parts[2] !== "x" && !vote) return null;
  if (!LINEUP_SEG_RE.test(parts[3])) return null;
  return { lineup: parts[3], view: { y, n, vote } };
}

// --- client-only persistence (localStorage, "82-0:" prefix like streak.ts) ---
// The skip preference is remembered: one X tap dismisses Pick'Em for good (spec risk fix).

const K_SKIP = "82-0:pickem:skip";
const kVote = (seed: string) => `82-0:pickem:v:${seed}`;

export function getPickemSkip(): boolean {
  try { return localStorage.getItem(K_SKIP) === "1"; } catch { return false; }
}
export function setPickemSkip(): void {
  try { localStorage.setItem(K_SKIP, "1"); } catch { /* no storage */ }
}
// Per-seed local vote so a Daily replay (same seed all day) never re-prompts and the result
// card can still show your pick even when the vote API is dark.
export function getLocalVote(seed: string): PickemVote | null {
  try { return parseVote(localStorage.getItem(kVote(seed))); } catch { return null; }
}
export function setLocalVote(seed: string, v: PickemVote): void {
  try { localStorage.setItem(kVote(seed), v); } catch { /* no storage */ }
}
