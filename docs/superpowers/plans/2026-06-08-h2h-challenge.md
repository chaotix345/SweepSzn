> **HISTORICAL (frozen 2026-06):** decision-record only — conventions here may be superseded. Current: tests are Vitest via `npm test`; see `web/AGENTS.md`.

# Async H2H / Challenge — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a player mint a shareable link that challenges friends to beat their lineup; friends play the *same seeded draft* asynchronously and see a head-to-head verdict + a per-challenge board.

**Architecture:** A challenge is a shared spin seed (`h2h-<id>`) + the creator's verified result stored in Upstash. Reuse the Daily game's deterministic spins, draft-trace replay anti-cheat, Upstash sorted-set+hash persistence, `/r/` permalink reconstruction, and the engine `LineupResult`. New pure logic (`compareResults`, id minting) is unit-tested; Redis/route/page/component layers are verified by `tsc` + `build` + post-merge prod E2E.

**Tech Stack:** Next.js 16.2.7 (App Router, Node runtime), TypeScript, `@upstash/redis`, `next/og` (satori), Tailwind, `@vercel/analytics`. Tests run as standalone `npx tsx` scripts with manual asserts (the repo's existing convention — no jest/vitest).

**Spec:** `docs/superpowers/specs/2026-06-08-h2h-challenge-design.md`

**Cross-cutting conventions (verified against the codebase):**
- Dynamic route params are a `Promise` in this Next version (`app/r/[lineup]/page.tsx:11`). Always `await params`.
- `opengraph-image.tsx` exports `runtime = "nodejs"`, `alt`, `size`, `contentType` and a default async `Image` (`app/r/[lineup]/opengraph-image.tsx`).
- Upstash via `@upstash/redis`; `set(key, val, { nx: true, ex })` returns `"OK"` when written, `null` when the key already existed. `@upstash/redis` auto-JSON-serializes object values and auto-parses on `get`/`hmget`.
- Player ids are `[a-z0-9_]` (comma-safe). Lineup string = 5 ids joined by `,` in slot order `["PG","SG","SF","PF","C"]` (`lib/teams.ts` `SLOTS`).
- `web/AGENTS.md`: before writing any *new* Next API surface, skim `web/node_modules/next/dist/docs/`. This plan mirrors existing files, so the surface is already proven — only consult docs if `tsc`/`build` complains.
- Run all commands from `web/` (e.g. `cd web && npx tsc --noEmit`).

---

## File Structure

**New files**
- `web/lib/redis.ts` — shared Upstash client singleton + helpers (extracted from `leaderboard.ts`).
- `web/lib/challenge.ts` — pure: `newChallengeId`, `challengeSeed`, `compareResults`.
- `web/lib/challenge.test.ts` — unit tests for `challenge.ts`.
- `web/lib/challengeStore.ts` — server-only Upstash I/O for challenges.
- `web/app/api/challenge/submit/route.ts` — verify + persist + verdict.
- `web/app/c/[id]/page.tsx` — challenge landing (server, noindex).
- `web/app/c/[id]/opengraph-image.tsx` — challenge OG card.
- `web/components/ChallengeResult.tsx` — client: creator "share" view + responder verdict view + board.

**Modified files**
- `web/lib/dailyVerify.ts` — extract seed-agnostic `verifyTrace`; `verifyDaily` delegates.
- `web/lib/dailyVerify.test.ts` — add a `verifyTrace` (arbitrary-seed) assertion.
- `web/lib/leaderboard.ts` — import shared `redis.ts` (behavior unchanged).
- `web/lib/types.ts` — challenge wire types.
- `web/lib/og.tsx` — `challengeOgElement`.
- `web/components/Game.tsx` — `"challenge"` mode, `?c=` handoff, ModeSelect card, result gate, result CTA, single-`<h1>` cleanup.

---

## Task 1: Shared Redis module + leaderboard refactor

**Files:**
- Create: `web/lib/redis.ts`
- Modify: `web/lib/leaderboard.ts`

- [ ] **Step 1: Create `web/lib/redis.ts`**

```ts
import "server-only";
import { Redis } from "@upstash/redis";
import type { LeaderboardRow } from "./types";

// Shared Upstash Redis client + helpers for all leaderboard-style features (Daily board,
// H2H challenge board). Self-disabling: if the env vars aren't present, `redis` is null,
// isRedisEnabled() is false, and helpers no-op so the app runs fine without Redis.

const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;

export const redis = url && token ? new Redis({ url, token }) : null;
export function isRedisEnabled(): boolean { return !!redis; }

export const TTL = 60 * 60 * 24 * 31;                         // ~31 days, self-cleaning
export const encScore = (wins: number, net: number) => wins * 1000 + (net + 100); // wins primary, net tiebreak

export type StoredRow = Omit<LeaderboardRow, "rank">;

// zrange(rev, withScores) -> hmget meta -> merge with 1-based rank. Generic over the
// sorted-set + hash key pair so any feature (lb:<date>, chal:<id>) can reuse it.
export async function readSortedRows(keyZ: string, keyH: string, start: number, stop: number): Promise<LeaderboardRow[]> {
  if (!redis) return [];
  const z = await redis.zrange<(string | number)[]>(keyZ, start, stop, { rev: true, withScores: true });
  const uids: string[] = [];
  for (let i = 0; i < z.length; i += 2) uids.push(String(z[i]));
  if (!uids.length) return [];
  const meta = (await redis.hmget<Record<string, StoredRow>>(keyH, ...uids)) ?? {};
  return uids
    .map((uid, i) => { const m = meta[uid]; return m ? { ...m, rank: start + i + 1 } : null; })
    .filter((x): x is LeaderboardRow => !!x);
}
```

- [ ] **Step 2: Refactor `web/lib/leaderboard.ts` to use the shared module**

Replace the entire file with:

```ts
import "server-only";
import { redis, isRedisEnabled, TTL, encScore, readSortedRows, type StoredRow } from "./redis";
import type { LineupResult, LeaderboardRow, LeaderboardView } from "./types";

// Daily leaderboard store (Upstash sorted sets). Self-disabling via the shared redis module.

const keyZ = (d: string) => `lb:${d}`;
const keyH = (d: string) => `lb:${d}:meta`;

export function isLeaderboardEnabled(): boolean { return isRedisEnabled(); }

export async function getLeaderboard(date: string, uid?: string): Promise<LeaderboardView | null> {
  if (!redis) return null;
  const total = await redis.zcard(keyZ(date));
  const top = await readSortedRows(keyZ(date), keyH(date), 0, 99);
  let you: LeaderboardRow | undefined;
  if (uid) {
    const rank = await redis.zrevrank(keyZ(date), uid);
    if (rank != null) {
      const inTop = top.find((r) => r.uid === uid);
      if (inTop) you = inTop;
      else {
        const meta = (await redis.hmget<Record<string, StoredRow>>(keyH(date), uid)) ?? {};
        const m = meta[uid];
        if (m) you = { ...m, rank: rank + 1 };
      }
    }
  }
  return { date, total, top, you };
}

export async function submitScore(date: string, row: StoredRow, result: LineupResult): Promise<LeaderboardView | null> {
  if (!redis) return null;
  const score = encScore(result.wins, result.netRtg);
  if (!Number.isFinite(score)) return getLeaderboard(date, row.uid);
  const prev = await redis.zscore(keyZ(date), row.uid);
  // keep-best: only overwrite score AND meta together when this run beats the stored one
  if (prev == null || score > Number(prev)) {
    await redis.zadd(keyZ(date), { score, member: row.uid });
    await redis.hset(keyH(date), { [row.uid]: row });
    await redis.expire(keyZ(date), TTL);
    await redis.expire(keyH(date), TTL);
  }
  return getLeaderboard(date, row.uid);
}
```

- [ ] **Step 3: Typecheck**

Run: `cd web && npx tsc --noEmit`
Expected: no errors (the daily `submit`/`leaderboard` routes still import `isLeaderboardEnabled`, `submitScore`, `getLeaderboard` — signatures unchanged).

- [ ] **Step 4: Confirm the daily anti-cheat test still passes (unaffected, sanity)**

Run: `cd web && npx tsx lib/dailyVerify.test.ts`
Expected: `ALL VERIFY CHECKS PASSED`

- [ ] **Step 5: Commit**

```bash
git add web/lib/redis.ts web/lib/leaderboard.ts
git commit -m "refactor: extract shared Upstash redis module from leaderboard"
```

---

## Task 2: Extract `verifyTrace` from `verifyDaily`

**Files:**
- Modify: `web/lib/dailyVerify.ts`
- Test: `web/lib/dailyVerify.test.ts`

- [ ] **Step 1: Add a failing assertion for `verifyTrace` in `dailyVerify.test.ts`**

Change the import line 1 to also import `verifyTrace`:

```ts
import { verifyDaily, verifyTrace, type VerifyDeps } from "./dailyVerify";
```

Append before the final `console.log(...)` summary (after line 67's `tooMany` block):

```ts
// verifyTrace: the seed-agnostic core works for any seed (e.g. an H2H challenge), not just daily
const chal = verifyTrace("h2h-abc123", legit, deps);
assert(chal.ok === true, "verifyTrace verifies a legit trace under an arbitrary (challenge) seed");
assert(chal.ok === true && chal.lineup === "p0pg,p1sg,p2sf,p3pf,p4c", "verifyTrace serializes in slot order");
const chalBad = clone(legit); chalBad[0].pickedId = "not_on_pool";
assert(verifyTrace("h2h-abc123", chalBad, deps).ok === false, "verifyTrace rejects an off-pool pick");
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd web && npx tsx lib/dailyVerify.test.ts`
Expected: FAIL — `verifyTrace` is not exported yet (TypeScript/runtime error: `verifyTrace is not a function`).

- [ ] **Step 3: Refactor `dailyVerify.ts` to expose `verifyTrace`**

Replace the `verifyDaily` function (lines 22-61) with the seed-agnostic core plus a thin daily wrapper. The body is identical except `seed` is now a parameter:

```ts
export function verifyTrace(seed: string, trace: DraftStep[], deps: VerifyDeps): VerifyResult {
  if (!Array.isArray(trace) || trace.length !== 5) return { ok: false, error: "trace must have 5 picks" };
  const exclude: string[] = [];
  const usedSlots = new Set<string>();
  const picked: Player[] = []; // draft order
  let teamRespins = 0, eraRespins = 0, totalRespins = 0;

  for (let r = 0; r < 5; r++) {
    const step = trace[r];
    if (!step || typeof step.pickedId !== "string" || !(SLOTS as readonly string[]).includes(step.slot) || !Array.isArray(step.respins))
      return { ok: false, error: `bad step ${r}` };
    if (step.respins.length > 2) return { ok: false, error: `too many re-spins ${r}` };
    let cur = deps.spinPool(seed, r, { exclude });
    for (const rs of step.respins) {
      const salt = ++totalRespins;
      if (rs === "team") { teamRespins++; cur = deps.spinPool(seed, r, { exclude, lockedDecade: cur.decade, excludeTeam: cur.team, salt }); }
      else if (rs === "era") { eraRespins++; cur = deps.spinPool(seed, r, { exclude, lockedTeam: cur.team, excludeDecade: cur.decade, salt }); }
      else return { ok: false, error: `bad respin ${r}` };
      if (teamRespins > 1 || eraRespins > 1) return { ok: false, error: "too many re-spins" };
    }
    if (!cur.ids.includes(step.pickedId)) return { ok: false, error: `off-pool pick ${r}` };
    const player = deps.getPlayer(step.pickedId);
    if (!player) return { ok: false, error: `unknown player ${r}` };
    if (!eligibleOf(player).includes(step.slot)) return { ok: false, error: `ineligible slot ${r}` };
    if (usedSlots.has(step.slot)) return { ok: false, error: `slot reused ${r}` };
    usedSlots.add(step.slot);
    exclude.push(step.pickedId);
    picked.push(player);
  }

  const bySlot = new Map<Slot, Player>(trace.map((s, i) => [s.slot, picked[i]]));
  const ordered = SLOTS.map((s) => bySlot.get(s)).filter((p): p is Player => !!p);
  if (ordered.length !== 5) return { ok: false, error: "missing slots" };
  const people = new Set(ordered.map((p) => p.person_id ?? p.id));
  if (people.size !== 5) return { ok: false, error: "duplicate player" };
  const result = deps.evaluate(ordered);
  return { ok: true, players: ordered, result, lineup: ordered.map((p) => p.id).join(",") };
}

export function verifyDaily(date: string, trace: DraftStep[], deps: VerifyDeps): VerifyResult {
  return verifyTrace(`daily-${date}`, trace, deps);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd web && npx tsx lib/dailyVerify.test.ts`
Expected: `ALL VERIFY CHECKS PASSED` (all original daily assertions plus the 3 new `verifyTrace` ones).

- [ ] **Step 5: Typecheck (daily/submit route still imports `verifyDaily`)**

Run: `cd web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add web/lib/dailyVerify.ts web/lib/dailyVerify.test.ts
git commit -m "refactor: extract seed-agnostic verifyTrace from verifyDaily"
```

---

## Task 3: Pure challenge logic (`lib/challenge.ts`) — TDD

**Files:**
- Create: `web/lib/challenge.ts`
- Test: `web/lib/challenge.test.ts`

- [ ] **Step 1: Write the failing test `web/lib/challenge.test.ts`**

```ts
import { newChallengeId, challengeSeed, compareResults } from "./challenge";

let fail = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("FAIL:", m); fail++; } else console.log("ok:", m); };

// newChallengeId: 8 chars, [a-z0-9], comma-free, won't collide with the daily seed format
const ids = Array.from({ length: 2000 }, () => newChallengeId());
assert(ids.every((id) => /^[a-z0-9]{8}$/.test(id)), "id is 8 chars of [a-z0-9]");
assert(ids.every((id) => !id.includes(",")), "id is comma-free");
assert(new Set(ids).size === ids.length, "ids are unique across 2000 mints");

// challengeSeed
assert(challengeSeed("abc12345") === "h2h-abc12345", "seed is h2h-<id>");
assert(!challengeSeed("abc12345").startsWith("daily-"), "challenge seed never collides with daily- seeds");

// compareResults: winner by wins, tiebreak netRtg, else tie
assert(compareResults({ wins: 80, netRtg: 10 }, { wins: 78, netRtg: 20 }).winner === "a", "more wins wins (a)");
assert(compareResults({ wins: 70, netRtg: 5 }, { wins: 75, netRtg: 1 }).winner === "b", "more wins wins (b)");
assert(compareResults({ wins: 70, netRtg: 8.4 }, { wins: 70, netRtg: 8.1 }).winner === "a", "wins tie -> higher netRtg wins (a)");
assert(compareResults({ wins: 70, netRtg: 8.1 }, { wins: 70, netRtg: 8.4 }).winner === "b", "wins tie -> higher netRtg wins (b)");
assert(compareResults({ wins: 70, netRtg: 8.0 }, { wins: 70, netRtg: 8.0 }).winner === "tie", "exact tie -> tie");
const m = compareResults({ wins: 80, netRtg: 12.5 }, { wins: 78, netRtg: 9.5 });
assert(m.winsMargin === 2 && Math.abs(m.netMargin - 3) < 1e-9, "margins are a minus b");

console.log(fail ? `\n${fail} ASSERTION(S) FAILED` : "\nALL CHALLENGE CHECKS PASSED");
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd web && npx tsx lib/challenge.test.ts`
Expected: FAIL — module/exports not found.

- [ ] **Step 3: Implement `web/lib/challenge.ts`**

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd web && npx tsx lib/challenge.test.ts`
Expected: `ALL CHALLENGE CHECKS PASSED`

- [ ] **Step 5: Commit**

```bash
git add web/lib/challenge.ts web/lib/challenge.test.ts
git commit -m "feat: pure challenge helpers (id, seed, compareResults) + tests"
```

---

## Task 4: Challenge wire types

**Files:**
- Modify: `web/lib/types.ts`

- [ ] **Step 1: Append challenge types after the leaderboard types (after line 87)**

```ts
// H2H Challenge: a shared draft seed (h2h-<id>) + the creator's verified result as the bar.
// The board reuses the leaderboard row/store shape; lineups are only ever sent to a uid that
// has itself submitted (public reads are redacted).
export interface ChallengeInfo { uid: string; name: string; wins: number; losses: number; net: number; grade: string; lineup: string }
export interface ChallengeMiniPlayer { id: string; name: string; team: string; decade: string; slot: Slot }
export interface ChallengeVerdict { outcome: "win" | "loss" | "tie"; winsMargin: number; netMargin: number }
export interface ChallengeBoard { total: number; top: LeaderboardRow[]; you?: LeaderboardRow }
export interface ChallengePublic { id: string; creatorName: string; wins: number; losses: number; net: number; grade: string; attempts: number }
export type ChallengeSubmitResponse =
  | { role: "creator"; id: string; board: ChallengeBoard }
  | {
      role: "responder"; id: string;
      creator: { name: string; wins: number; losses: number; net: number; grade: string; lineup: string; players: ChallengeMiniPlayer[] };
      verdict: ChallengeVerdict;
      board: ChallengeBoard;
    };
```

- [ ] **Step 2: Typecheck**

Run: `cd web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web/lib/types.ts
git commit -m "feat: challenge wire types"
```

---

## Task 5: Challenge store (`lib/challengeStore.ts`)

**Files:**
- Create: `web/lib/challengeStore.ts`

Redis I/O only (mirrors `leaderboard.ts`): claim creator (write-once), keep-best board add, board read, redacted public read. The route orchestrates verify/verdict/creator-five.

- [ ] **Step 1: Create `web/lib/challengeStore.ts`**

```ts
import "server-only";
import { redis, isRedisEnabled, TTL, encScore, readSortedRows, type StoredRow } from "./redis";
import type { ChallengeInfo, ChallengePublic, ChallengeBoard, LineupResult, LeaderboardRow } from "./types";

// Per-challenge persistence. Keys: chal:<id> (sorted set, ranking), chal:<id>:meta (hash,
// per-uid row payload), chal:<id>:info (the creator's bar, write-once). 31-day TTL refreshed
// on each write. Self-disabling via the shared redis module.

const keyZ = (id: string) => `chal:${id}`;
const keyH = (id: string) => `chal:${id}:meta`;
const keyInfo = (id: string) => `chal:${id}:info`;

export function isChallengeEnabled(): boolean { return isRedisEnabled(); }

async function board(id: string, uid?: string): Promise<ChallengeBoard> {
  if (!redis) return { total: 0, top: [] };
  const total = await redis.zcard(keyZ(id));
  const top = await readSortedRows(keyZ(id), keyH(id), 0, 99);
  let you: LeaderboardRow | undefined = top.find((r) => r.uid === uid);
  if (uid && !you) {
    const rank = await redis.zrevrank(keyZ(id), uid);
    if (rank != null) {
      const meta = (await redis.hmget<Record<string, StoredRow>>(keyH(id), uid)) ?? {};
      const m = meta[uid];
      if (m) you = { ...m, rank: rank + 1 };
    }
  }
  return { total, top, you };
}

// Redacted read for the public landing page — never exposes any lineup.
export async function getChallengePublic(id: string): Promise<ChallengePublic | null> {
  if (!redis) return null;
  const info = await redis.get<ChallengeInfo>(keyInfo(id));
  if (!info) return null;
  const attempts = await redis.zcard(keyZ(id));
  return { id, creatorName: info.name, wins: info.wins, losses: info.losses, net: info.net, grade: info.grade, attempts };
}

// Submit a verified attempt. The first submitter claims the creator slot (write-once via set-nx);
// everyone else is a responder. Always keep-best adds the row to the board. Returns the role, the
// authoritative creator info (incl lineup, for the reveal/verdict), and the fresh board.
export async function submitChallenge(
  id: string,
  row: StoredRow,
  result: LineupResult,
  grade: string,
): Promise<{ role: "creator" | "responder"; creator: ChallengeInfo; board: ChallengeBoard } | null> {
  if (!redis) return null;
  const info: ChallengeInfo = { uid: row.uid, name: row.name, wins: row.wins, losses: row.losses, net: row.net, grade, lineup: row.lineup };
  const claimed = await redis.set(keyInfo(id), info, { nx: true, ex: TTL });
  const role: "creator" | "responder" = claimed === "OK" ? "creator" : "responder";
  const creator = role === "creator" ? info : ((await redis.get<ChallengeInfo>(keyInfo(id))) ?? info);

  const score = encScore(result.wins, result.netRtg);
  if (Number.isFinite(score)) {
    const prev = await redis.zscore(keyZ(id), row.uid);
    if (prev == null || score > Number(prev)) {
      await redis.zadd(keyZ(id), { score, member: row.uid });
      await redis.hset(keyH(id), { [row.uid]: row });
    }
    await redis.expire(keyZ(id), TTL);
    await redis.expire(keyH(id), TTL);
    await redis.expire(keyInfo(id), TTL);
  }
  return { role, creator, board: await board(id, row.uid) };
}
```

- [ ] **Step 2: Typecheck**

Run: `cd web && npx tsc --noEmit`
Expected: no errors. (If the `set(..., { nx: true, ex: TTL })` options error against the installed `@upstash/redis` types, check the version's `SetCommandOptions` in `web/node_modules/@upstash/redis/`; the documented shape is `{ nx?: boolean; ex?: number }`. Fallback if needed: `await redis.set(keyInfo(id), info, { ex: TTL }) ` is wrong for write-once — instead use `const claimed = await redis.setnx(keyInfo(id), info); if (claimed) await redis.expire(keyInfo(id), TTL);` where `setnx` returns `1|0`.)

- [ ] **Step 3: Commit**

```bash
git add web/lib/challengeStore.ts
git commit -m "feat: challenge Upstash store (write-once creator, keep-best board)"
```

---

## Task 6: Challenge submit API route

**Files:**
- Create: `web/app/api/challenge/submit/route.ts`

- [ ] **Step 1: Create the route (mirrors `app/api/daily/submit/route.ts`)**

```ts
import { NextResponse } from "next/server";
import { spinPool, getPlayersByIds, getCoefficients } from "@/lib/data";
import { evaluateLineup } from "@/lib/engine";
import { verifyTrace, type VerifyDeps } from "@/lib/dailyVerify";
import { isChallengeEnabled, submitChallenge } from "@/lib/challengeStore";
import { challengeSeed, compareResults } from "@/lib/challenge";
import { decodeLineup } from "@/lib/share";
import { SLOTS } from "@/lib/teams";
import type { ChallengeMiniPlayer, ChallengeSubmitResponse } from "@/lib/types";

const cleanName = (s: unknown) => (typeof s === "string" ? s.trim().slice(0, 24) : "") || "Anonymous";

const deps: VerifyDeps = {
  spinPool,
  getPlayer: (id) => getPlayersByIds([id])[0],
  evaluate: (players) => evaluateLineup(players, getCoefficients()),
};

export async function POST(req: Request) {
  if (!isChallengeEnabled()) return NextResponse.json({ error: "challenges not configured" }, { status: 503 });
  const body = await req.json().catch(() => ({}));
  const { id, uid, name, trace } = body ?? {};
  if (typeof id !== "string" || !/^[a-z0-9]{6,16}$/.test(id)) return NextResponse.json({ error: "bad challenge id" }, { status: 400 });
  if (typeof uid !== "string" || !/^[a-z0-9-]{8,64}$/i.test(uid)) return NextResponse.json({ error: "bad uid" }, { status: 400 });

  const v = verifyTrace(challengeSeed(id), trace, deps);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const row = { uid, name: cleanName(name), wins: v.result.wins, losses: v.result.losses, net: v.result.netRtg, lineup: v.lineup };
  const out = await submitChallenge(id, row, v.result, v.result.grade);
  if (!out) return NextResponse.json({ error: "challenges not configured" }, { status: 503 });

  if (out.role === "creator") {
    const res: ChallengeSubmitResponse = { role: "creator", id, board: out.board };
    return NextResponse.json(res);
  }

  // responder: resolve the creator's five (revealed now that this uid has submitted) + verdict
  const cmp = compareResults(
    { wins: v.result.wins, netRtg: v.result.netRtg },
    { wins: out.creator.wins, netRtg: out.creator.net },
  );
  const players: ChallengeMiniPlayer[] = getPlayersByIds(decodeLineup(out.creator.lineup))
    .map((p, i) => ({ id: p.id, name: p.name, team: p.team, decade: p.decade, slot: SLOTS[i] }));
  const res: ChallengeSubmitResponse = {
    role: "responder", id,
    creator: { name: out.creator.name, wins: out.creator.wins, losses: out.creator.losses, net: out.creator.net, grade: out.creator.grade, lineup: out.creator.lineup, players },
    verdict: { outcome: cmp.winner === "a" ? "win" : cmp.winner === "b" ? "loss" : "tie", winsMargin: cmp.winsMargin, netMargin: Math.round(cmp.netMargin * 10) / 10 },
    board: out.board,
  };
  return NextResponse.json(res);
}
```

- [ ] **Step 2: Typecheck**

Run: `cd web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web/app/api/challenge/submit/route.ts
git commit -m "feat: POST /api/challenge/submit (verify + persist + verdict)"
```

---

## Task 7: Challenge OG card

**Files:**
- Modify: `web/lib/og.tsx`
- Create: `web/app/c/[id]/opengraph-image.tsx`

- [ ] **Step 1: Add `challengeOgElement` to `web/lib/og.tsx`**

Append after `brandOgElement` (after line 100). Reuses the file's `GRADE_HEX`, `Wordmark`, `shell`. No player tokens (preserves the hidden-lineup reveal model):

```tsx
export function challengeOgElement(creatorName: string, r: { wins: number; losses: number; net: number; grade: string }) {
  const grade = GRADE_HEX[r.grade] ?? "#e4e4e7";
  const net = `${r.net > 0 ? "+" : ""}${r.net.toFixed(1)}`;
  return (
    <div style={shell}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "baseline" }}>
          <Wordmark />
          <span style={{ marginLeft: 16, fontSize: 22, color: "#a1a1aa", fontWeight: 600 }}>head-to-head challenge</span>
        </div>
        <span style={{ display: "flex", fontSize: 22, color: "#71717a" }}>same draft · your picks</span>
      </div>

      <div style={{ display: "flex", flexDirection: "column", marginTop: "auto", marginBottom: "auto" }}>
        <span style={{ display: "flex", fontSize: 34, fontWeight: 700, color: "#e4e4e7" }}>{ascii(creatorName)} went</span>
        <div style={{ display: "flex", alignItems: "center", gap: 36, marginTop: 8 }}>
          <div style={{ display: "flex", alignItems: "baseline", fontSize: 150, fontWeight: 900, lineHeight: 1, color: grade }}>
            <span>{r.wins}</span><span style={{ color: "#3f3f46" }}>–</span><span>{r.losses}</span>
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            <span style={{ display: "flex", fontSize: 46, fontWeight: 800, color: grade }}>{r.grade}</span>
            <span style={{ display: "flex", marginTop: 8, fontSize: 26, color: "#a1a1aa" }}>Net {net}</span>
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ display: "flex", fontSize: 30, fontWeight: 700, color: "#fafafa" }}>Can you beat it?</span>
        <span style={{ display: "flex", fontSize: 22, fontWeight: 700, color: "#f97316" }}>Build your five →</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create `web/app/c/[id]/opengraph-image.tsx`**

```tsx
import { ImageResponse } from "next/og";
import { getChallengePublic } from "@/lib/challengeStore";
import { challengeOgElement, brandOgElement, OG_SIZE, OG_ALT } from "@/lib/og";

export const runtime = "nodejs";
export const alt = OG_ALT;
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const info = await getChallengePublic(id);
  if (!info) return new ImageResponse(brandOgElement("Beat a friend's all-time five."), { ...OG_SIZE });
  return new ImageResponse(
    challengeOgElement(info.creatorName, { wins: info.wins, losses: info.losses, net: info.net, grade: info.grade }),
    { ...OG_SIZE },
  );
}
```

- [ ] **Step 3: Typecheck**

Run: `cd web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add web/lib/og.tsx web/app/c/[id]/opengraph-image.tsx
git commit -m "feat: challenge OG card (record + grade, no lineup)"
```

---

## Task 8: Challenge landing page

**Files:**
- Create: `web/app/c/[id]/page.tsx`

Server component, noindex, redacted read. The Accept button hands off to the homepage game via `/?c=<id>#game`.

- [ ] **Step 1: Create `web/app/c/[id]/page.tsx`**

```tsx
import type { Metadata } from "next";
import { cache } from "react";
import Link from "next/link";
import { getChallengePublic } from "@/lib/challengeStore";

type Props = { params: Promise<{ id: string }> };

const load = cache((id: string) => getChallengePublic(id));

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const info = await load(id);
  if (!info) return { title: "82-0 — head-to-head challenge", robots: { index: false } };
  const title = `Beat ${info.creatorName}'s ${info.wins}-${info.losses} — 82-0 challenge`;
  const description = `${info.creatorName} went ${info.wins}-${info.losses} (${info.grade}). Same draft, your picks. Can you build a better all-time five?`;
  return {
    title, description,
    robots: { index: false },
    openGraph: { title, description, type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function ChallengePage({ params }: Props) {
  const { id } = await params;
  const info = await load(id);
  const net = info ? `${info.net > 0 ? "+" : ""}${info.net.toFixed(1)}` : "";
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-xl px-4 py-10">
        <Link href="/" className="flex items-baseline text-2xl font-black tracking-tight">
          <span>82</span><span className="text-orange-500">-0</span>
          <span className="ml-3 text-sm font-semibold text-zinc-500">head-to-head challenge</span>
        </Link>

        {info ? (
          <div className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-center">
            <div className="text-sm font-semibold uppercase tracking-widest text-zinc-500">You&apos;ve been challenged</div>
            <h1 className="mt-3 text-2xl font-black">
              Can you beat <span className="text-orange-400">{info.creatorName}</span>?
            </h1>
            <div className="mt-5 text-6xl font-black tabular-nums text-green-400">
              {info.wins}<span className="text-zinc-600">–</span>{info.losses}
            </div>
            <div className="mt-1 text-sm font-bold text-zinc-300">{info.grade} · Net {net}</div>
            <p className="mx-auto mt-4 max-w-sm text-sm text-zinc-400">
              You&apos;ll draft from the <strong className="text-zinc-200">same teams and eras</strong> — their five
              stays hidden until you submit yours. Pure judgment, no luck.
            </p>
            <Link href={`/?c=${info.id}#game`}
              className="mt-6 inline-block rounded-xl bg-orange-500 px-8 py-3 text-base font-black text-black hover:bg-orange-400">
              ⚔️ Accept Challenge
            </Link>
            {info.attempts > 1 && (
              <div className="mt-4 text-xs text-zinc-500">{info.attempts} {info.attempts === 1 ? "player has" : "players have"} taken this challenge</div>
            )}
          </div>
        ) : (
          <div className="mt-8 rounded-2xl border border-zinc-800 bg-zinc-900 p-6 text-center">
            <h1 className="text-xl font-black">This challenge isn&apos;t available</h1>
            <p className="mx-auto mt-3 max-w-sm text-sm text-zinc-400">
              It may have expired, or challenges aren&apos;t configured right now. Build your own all-time five instead.
            </p>
            <Link href="/#game" className="mt-6 inline-block rounded-xl bg-orange-500 px-8 py-3 text-base font-black text-black hover:bg-orange-400">
              Build your five →
            </Link>
          </div>
        )}
      </div>
      <footer className="pb-10 text-center text-xs text-zinc-600">engine calibrated to real NBA team-seasons</footer>
    </main>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web/app/c/[id]/page.tsx
git commit -m "feat: challenge landing page (redacted, noindex, accept handoff)"
```

---

## Task 9: ChallengeResult component

**Files:**
- Create: `web/components/ChallengeResult.tsx`

Rendered below `ResultCard` in the challenge result gate (so the player's own five is already shown by `ResultCard`). Creator → share link + board. Responder → verdict + creator five + board + "create your own".

- [ ] **Step 1: Create `web/components/ChallengeResult.tsx`**

```tsx
"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { track } from "@vercel/analytics";
import type { DraftStep, LineupResult, Player, ChallengeSubmitResponse, ChallengeMiniPlayer, LeaderboardRow } from "@/lib/types";
import { getUid, getName, setName as persistName } from "@/lib/streak";
import { SLOTS, teamColors, initials, eraLabel, displayName } from "@/lib/teams";

export default function ChallengeResult({ id, role, result, players, trace }: {
  id: string; role: "create" | "respond"; result: LineupResult; players: Player[]; trace: DraftStep[];
}) {
  const [resp, setResp] = useState<ChallengeSubmitResponse | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [uid, setUid] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const link = typeof window !== "undefined" ? new URL(`/c/${id}`, window.location.origin).toString() : `/c/${id}`;

  const submit = useCallback(async (nm: string) => {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/challenge/submit", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, uid: getUid(), name: nm.trim(), trace }),
      });
      if (r.status === 503) { setEnabled(false); return; }
      const v = await r.json();
      if (!r.ok) { setErr(v?.error ?? "submit failed"); return; }
      persistName(nm.trim());
      setResp(v as ChallengeSubmitResponse);
      track("challenge_submit", { role: (v as ChallengeSubmitResponse)?.role ?? role });
    } catch { setErr("network error"); } finally { setBusy(false); }
  }, [id, trace, role]);

  // auto-submit when we already know the player's name; otherwise prompt for it first
  useEffect(() => {
    setUid(getUid());
    const n = getName();
    setName(n);
    if (n.trim()) submit(n);
  }, [submit]);

  const copy = useCallback(async () => {
    try {
      await navigator.clipboard?.writeText(link);
      setCopied(true); track("share", { target: "challenge_copy" }); setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  }, [link]);

  if (!enabled) {
    return <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-4 text-sm text-zinc-400">Challenges need server configuration — your five is still scored above.</div>;
  }

  // name gate (only when we have no stored name and haven't submitted yet)
  if (!resp) {
    return (
      <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="text-sm font-bold text-zinc-200">⚔️ {role === "respond" ? "Reveal the matchup" : "Create your challenge"}</div>
        <div className="mt-3 flex gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={24} placeholder="Your name"
            className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-orange-500" />
          <button onClick={() => submit(name)} disabled={busy}
            className="shrink-0 rounded-lg bg-orange-500 px-4 py-2 text-sm font-bold text-black hover:bg-orange-400 disabled:opacity-60">
            {busy ? "…" : role === "respond" ? "🏆 Reveal" : "🔗 Create"}
          </button>
        </div>
        {err && <div className="mt-2 text-xs text-red-400">{err}</div>}
      </div>
    );
  }

  if (resp.role === "creator") {
    return (
      <div className="mt-4 rounded-2xl border border-orange-500/40 bg-zinc-900 p-5">
        <div className="text-center">
          <div className="text-sm font-black uppercase tracking-widest text-orange-400">Challenge created</div>
          <p className="mx-auto mt-2 max-w-sm text-sm text-zinc-400">
            Send this link. The first friend to beat your <b className="text-zinc-200">{result.wins}-{result.losses}</b> from the same draft wins.
          </p>
        </div>
        <div className="mt-4 flex gap-2">
          <input readOnly value={link} className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs text-zinc-300 outline-none" />
          <button onClick={copy} className="shrink-0 rounded-lg bg-orange-500 px-4 py-2 text-sm font-bold text-black hover:bg-orange-400">
            {copied ? "Copied!" : "Copy link"}
          </button>
        </div>
        <Board board={resp.board} uid={uid} />
      </div>
    );
  }

  // responder
  const v = resp.verdict;
  const tone = v.outcome === "win" ? "text-green-400" : v.outcome === "loss" ? "text-red-400" : "text-amber-400";
  const headline = v.outcome === "win" ? "You win! 🏆" : v.outcome === "loss" ? "You lost" : "Dead heat";
  const yourFive = players.map((p, i) => ({ id: p.id, name: p.name, team: p.team, decade: p.decade, slot: SLOTS[i] }));
  return (
    <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-5">
      <div className="text-center">
        <div className={`text-2xl font-black ${tone}`}>{headline}</div>
        <div className="mt-2 flex items-center justify-center gap-4 text-sm">
          <span className="font-bold text-zinc-100">You {result.wins}-{result.losses}</span>
          <span className="text-zinc-600">vs</span>
          <span className="font-bold text-zinc-300">{resp.creator.name} {resp.creator.wins}-{resp.creator.losses}</span>
        </div>
        <div className="mt-1 text-xs text-zinc-500">
          {v.outcome === "tie" ? "same record and net rating" : `by ${Math.abs(v.winsMargin)} win${Math.abs(v.winsMargin) === 1 ? "" : "s"} · Net ${v.netMargin > 0 ? "+" : ""}${v.netMargin.toFixed(1)}`}
        </div>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        <FiveStrip title="Your five" five={yourFive} />
        <FiveStrip title={`${resp.creator.name}'s five`} five={resp.creator.players} href={`/r/${resp.creator.lineup}`} />
      </div>

      <Board board={resp.board} uid={uid} />

      <div className="mt-4 flex gap-2">
        <button onClick={copy} className="flex-1 rounded-xl border border-zinc-700 py-2.5 text-sm font-semibold hover:border-zinc-500">
          {copied ? "Copied!" : "Share this challenge"}
        </button>
        <Link href={`/?c=`} onClick={(e) => { e.preventDefault(); window.location.href = "/#game"; }}
          className="flex-1 rounded-xl bg-orange-500 py-2.5 text-center text-sm font-bold text-black hover:bg-orange-400">
          ⚔️ Create your own
        </Link>
      </div>
    </div>
  );
}

function FiveStrip({ title, five, href }: { title: string; five: ChallengeMiniPlayer[]; href?: string }) {
  const body = (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
      <div className="mb-2 flex items-center justify-between text-[11px] font-bold uppercase tracking-wide text-zinc-500">
        <span>{title}</span>{href && <span className="text-orange-400/80">view →</span>}
      </div>
      <div className="flex justify-between gap-1">
        {five.map((p) => {
          const c = teamColors(p.team);
          return (
            <div key={p.id} className="flex min-w-0 flex-col items-center">
              <div className="flex h-9 w-9 flex-col items-center justify-center rounded-lg text-[10px] font-black leading-none"
                style={{ background: c.bg, color: c.text }}>
                <span>{initials(p.name)}</span><span className="mt-0.5 text-[7px] opacity-80">{p.slot}</span>
              </div>
              <span className="mt-1 w-full truncate text-center text-[9px] text-zinc-400">{displayName(p.name)}</span>
              <span className="text-[8px] text-zinc-600">{p.team} · {eraLabel(p.decade)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

function Board({ board, uid }: { board: { total: number; top: LeaderboardRow[]; you?: LeaderboardRow }; uid: string }) {
  const rows = board.top;
  if (!rows.length) return null;
  const youOutside = board.you && !rows.some((r) => r.uid === uid);
  return (
    <div className="mt-4">
      <div className="mb-1 flex items-center justify-between text-[11px] font-bold uppercase tracking-wide text-zinc-500">
        <span>Challenge board</span><span>{board.total} played</span>
      </div>
      <div className="max-h-56 space-y-1 overflow-y-auto">
        {rows.map((r) => <Row key={r.uid} r={r} me={r.uid === uid} />)}
        {youOutside && board.you && <Row r={board.you} me />}
      </div>
    </div>
  );
}

function Row({ r, me }: { r: LeaderboardRow; me?: boolean }) {
  return (
    <Link href={`/r/${r.lineup}`}
      className={`flex items-center gap-3 rounded-lg px-2.5 py-1.5 text-sm ${me ? "bg-orange-500/15 ring-1 ring-orange-500/40" : "bg-zinc-950/50 hover:bg-zinc-800/60"}`}>
      <span className="w-7 shrink-0 text-right text-xs font-bold tabular-nums text-zinc-500">{r.rank}</span>
      <span className="min-w-0 flex-1 truncate font-semibold text-zinc-200">{r.name}{me && <span className="ml-1 text-[10px] text-orange-300">you</span>}</span>
      <span className="shrink-0 tabular-nums font-bold text-zinc-100">{r.wins}-{r.losses}</span>
      <span className="w-12 shrink-0 text-right text-xs tabular-nums text-zinc-500">{r.net > 0 ? "+" : ""}{r.net.toFixed(1)}</span>
    </Link>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web/components/ChallengeResult.tsx
git commit -m "feat: ChallengeResult component (creator share + responder verdict + board)"
```

---

## Task 10: Wire challenge mode into Game.tsx

**Files:**
- Modify: `web/components/Game.tsx`

Use a single MultiEdit-style pass (multiple edits to one file). Steps below describe each edit; apply them together.

- [ ] **Step 1: Imports + Mode union**

Change line 7-9 region. After `import Leaderboard from "@/components/Leaderboard";` add:

```ts
import ChallengeResult from "@/components/ChallengeResult";
import { newChallengeId, challengeSeed } from "@/lib/challenge";
```

Change line 9:

```ts
type Mode = "daily" | "classic" | "hoopiq" | "challenge";
```

- [ ] **Step 2: Challenge state (after line 40, near `result` state)**

Add after the `result` state declaration (line 38):

```ts
  const [challengeId, setChallengeId] = useState<string | null>(null);
  const [challengeRole, setChallengeRole] = useState<"create" | "respond" | null>(null);
```

- [ ] **Step 3: Extend `start` to handle challenge seeds**

Replace the `start` callback (lines 60-68) with:

```ts
  const start = useCallback((m: Mode, challenge?: { id: string; role: "create" | "respond" }) => {
    track("mode_start", { mode: m });
    setMode(m);
    let cid: string | null = null;
    let crole: "create" | "respond" | null = null;
    let s: string;
    if (m === "challenge") {
      cid = challenge?.id ?? newChallengeId();
      crole = challenge?.role ?? "create";
      s = challengeSeed(cid);
    } else {
      s = m === "daily" ? `daily-${todaySeed()}` : `${m}-${rand()}`;
    }
    setChallengeId(cid); setChallengeRole(crole); setSeed(s);
    setRoster(EMPTY); setCurrent(null); setResult(null); setError(null);
    setSelPlayer(null); setSelSlot(null); setSkips({ team: false, era: false });
    setReel({ team: "ATL", era: "60's" }); setLockedReel(null); saltRef.current = 0;
    traceRef.current = []; roundRespinsRef.current = [];
  }, []);
```

- [ ] **Step 4: `?c=` deep-link handoff effect (add after the unmount cleanup effect, line 70)**

```ts
  // Deep link from a challenge landing page: /?c=<id> auto-enters challenge respond mode.
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const cid = params.get("c");
      if (cid && /^[a-z0-9]{6,16}$/.test(cid)) {
        start("challenge", { id: cid, role: "respond" });
        params.delete("c");
        const qs = params.toString();
        window.history.replaceState(null, "", window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash);
      }
    } catch { /* no query / no history API */ }
  }, [start]);
```

- [ ] **Step 5: Result gate — render ChallengeResult + the "challenge a friend" CTA**

Replace the `if (result) return (...)` block (lines 170-175) with:

```tsx
  if (result) return (
    <Shell roundNum={roundNum} mode={mode} onRestart={() => start(mode)} showRestart>
      <ResultCard result={result.result} players={result.players} slots={SLOTS} mode={mode} onReset={() => start(mode)} />
      {mode === "daily" && <Leaderboard date={seed.replace("daily-", "")} trace={result.trace} />}
      {mode === "challenge" && challengeId && challengeRole && (
        <ChallengeResult id={challengeId} role={challengeRole} result={result.result} players={result.players} trace={result.trace} />
      )}
      {mode !== "challenge" && (
        <button onClick={() => start("challenge")}
          className="mt-4 w-full rounded-xl border border-orange-500/50 bg-orange-500/10 py-3 text-sm font-bold text-orange-300 hover:bg-orange-500/20">
          ⚔️ Challenge a friend to beat this
        </button>
      )}
    </Shell>
  );
```

- [ ] **Step 6: ModeSelect — add the challenge card + demote the duplicate `<h1>`**

In `ModeSelect` (lines 301-325): change the `modes` array (lines 302-306) to add a 4th entry:

```ts
  const modes: { id: Mode; emoji: string; title: string; desc: string }[] = [
    { id: "daily", emoji: "📅", title: "Daily", desc: "Everyone gets the same spins today. Compare your record." },
    { id: "classic", emoji: "💯", title: "Classic", desc: "Full stats visible — draft on what you can see." },
    { id: "hoopiq", emoji: "🧠", title: "HoopIQ", desc: "Stats hidden — draft by memory, test your ball knowledge." },
    { id: "challenge", emoji: "⚔️", title: "Challenge a Friend", desc: "Build a five, send a link. They draft the same teams — beat your record." },
  ];
```

Change the grid (line 311) from `sm:grid-cols-3` to:

```tsx
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
```

Change the `<h1>` (line 309) to a `<div>` (the landing's "Can you go 82-0?" is the page's single `<h1>`):

```tsx
      <div className="text-5xl font-black tracking-tight">82<span className="text-orange-500">-</span>0</div>
```

- [ ] **Step 7: Typecheck + lint + build**

Run: `cd web && npx tsc --noEmit && npm run lint && npm run build`
Expected: all green. (Build does not require Upstash env vars — the store self-disables.)

- [ ] **Step 8: Commit**

```bash
git add web/components/Game.tsx
git commit -m "feat: challenge mode in Game (mode card, ?c handoff, result CTA, single h1)"
```

---

## Task 11: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run every unit test**

```bash
cd web && npx tsx lib/dailyVerify.test.ts && npx tsx lib/challenge.test.ts
```
Expected: `ALL VERIFY CHECKS PASSED` and `ALL CHALLENGE CHECKS PASSED`.

- [ ] **Step 2: Typecheck + lint + production build**

```bash
cd web && npx tsc --noEmit && npm run lint && npm run build
```
Expected: all green; build output lists the new routes `/api/challenge/submit`, `/c/[id]`.

- [ ] **Step 3: Local live E2E (only if `web/.env.local` has Upstash creds)**

```bash
cd web && npm run dev
```
Then, in a browser:
1. Home → "⚔️ Challenge a Friend" → draft 5 → enter a name → "Create" → confirm a `/c/<id>` link appears and copies.
2. Open the copied `/c/<id>` in a private window → confirm the redacted bar (record + grade, **no lineup**) + "Accept Challenge".
3. Accept → drafts the *same* team/era spins → finish → confirm the "You vs creator" verdict + both fives + board.
4. Confirm a returning attempt with a lower score does **not** lower your board row (keep-best).
5. `curl` a tampered trace to `/api/challenge/submit` → expect `400`. Without creds the same call returns `503`.

If creds are absent, skip Step 3 and rely on post-merge prod verification (prod already has the Upstash project wired).

- [ ] **Step 4: Final commit if any fixes were needed during verification**

```bash
git add -A
git commit -m "fix: address issues found during H2H verification"
```

---

## Self-Review (completed during planning)

**Spec coverage:**
- Reveal model (hidden until submit) → redacted `getChallengePublic` (Task 5) + OG with no tokens (Task 7) + reveal only in submit response (Task 6) + creator five shown to responder only (Task 9). ✓
- Scope (creator + responders + board) → sorted-set board + `Board` UI (Tasks 5, 9). ✓
- Entry points (ModeSelect card + result CTA) → Task 10 steps 5-6. ✓
- Shared seed fairness → `challengeSeed` + unchanged `/api/spin` (Tasks 3, 10). ✓
- Anti-cheat → `verifyTrace` reuse (Tasks 2, 6). ✓
- Persistence/keep-best/write-once creator → Task 5. ✓
- Permalink + OG → Tasks 7, 8. ✓
- Streak untouched → ChallengeResult never calls `recordDailyDone` (Task 9). ✓
- Single `<h1>` cleanup → Task 10 step 6. ✓
- Tests → Tasks 2, 3, 11. ✓

**Placeholder scan:** none (all code is concrete; the only fallbacks are explicitly-coded alternates in Task 5 step 2).

**Type consistency:** `ChallengeSubmitResponse`/`ChallengeMiniPlayer`/`ChallengeVerdict`/`ChallengeBoard`/`ChallengePublic`/`ChallengeInfo` (Task 4) are used identically in the store (Task 5), route (Task 6), and component (Task 9). `StoredRow`/`readSortedRows`/`encScore`/`TTL` (Task 1) are consumed by both `leaderboard.ts` and `challengeStore.ts`. `verifyTrace(seed, trace, deps)` (Task 2) is called by the route (Task 6). `start(m, challenge?)` (Task 10 step 3) matches the `?c=` effect and ModeSelect/CTA callers.
```
