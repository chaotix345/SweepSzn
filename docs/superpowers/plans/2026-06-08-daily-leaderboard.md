# Daily Leaderboard + Streaks — Implementation Plan

> **For agentic workers:** execute task-by-task. Steps use checkbox (`- [ ]`) syntax. Spec: `docs/superpowers/specs/2026-06-08-daily-leaderboard-design.md`.

**Goal:** Make Daily mode a real daily competition — a verified, persisted leaderboard + client streaks, self-activating when Upstash Redis env vars are present.

**Architecture:** Two Node-runtime route handlers (`/api/daily/submit`, `/api/daily/leaderboard`) backed by Upstash Redis sorted sets. Submissions are verified by replaying the deterministic Daily draft (`spin()` replay) and recomputing the score from the 5 ids — the client number is never trusted. Client records a draft trace, shows the board + streak. Everything degrades gracefully (UI hidden, routes 503 "not configured") when Redis env is absent.

**Tech Stack:** Next.js 16 (App Router, Node runtime), `@upstash/redis`, TypeScript, `npx tsx` for the verifier unit test (matches repo convention).

**Conventions:** comment-light, minimal (user style). Tests = plain `.ts` script with a custom `assert` + `process.exit(fail?1:0)`, run via `npx tsx` (like `lib/engine.test.ts`).

---

## File structure

- Create `web/lib/leaderboard.ts` — Redis wrapper: `isLeaderboardEnabled()`, `submitScore()`, `getLeaderboard()`, score encoding. Graceful when unconfigured.
- Create `web/lib/dailyVerify.ts` — pure `verifyDaily(date, trace)` → `{ ok, players?, result?, lineup?, error? }`. The anti-cheat core.
- Create `web/lib/dailyVerify.test.ts` — `npx tsx` unit test for the verifier.
- Create `web/lib/streak.ts` — client localStorage streak/identity helpers (`getUid`, `getName/setName`, `recordDailyDone`, `getStreak`).
- Create `web/app/api/daily/submit/route.ts` — POST handler.
- Create `web/app/api/daily/leaderboard/route.ts` — GET handler.
- Create `web/components/Leaderboard.tsx` — board UI + submit/name + streak + UTC countdown (client).
- Modify `web/lib/data.ts` — add `spinPool(seed, round, opts)` (pool ids only, skips `computeFits`).
- Modify `web/lib/types.ts` — add `DraftStep`, `DailySubmission`, `LeaderboardRow`, `LeaderboardView`.
- Modify `web/components/Game.tsx` — record the draft trace; render `<Leaderboard>` on Daily result.
- Modify `web/package.json` — add `@upstash/redis`.

---

## Task 1: Install dependency + types

**Files:** Modify `web/package.json`, `web/lib/types.ts`

- [ ] **Step 1:** `cd web && npm install @upstash/redis --save`
- [ ] **Step 2:** Add to `web/lib/types.ts`:

```ts
export type DraftStep = { slot: Slot; pickedId: string; respins: ("team" | "era")[] };
export interface DailySubmission { date: string; uid: string; name: string; trace: DraftStep[] }
export interface LeaderboardRow { rank: number; uid: string; name: string; wins: number; losses: number; net: number; lineup: string }
export interface LeaderboardView { date: string; total: number; top: LeaderboardRow[]; you?: LeaderboardRow }
```

- [ ] **Step 3:** Commit: `git add -A && git commit -m "feat(leaderboard): add @upstash/redis + shared types"`

---

## Task 2: Pool-only spin helper (fast verification)

**Files:** Modify `web/lib/data.ts`

`spin()` computes draft fit per call (`computeFits`) — verification doesn't need it. Add a lean variant returning team/decade + candidate ids only, reusing the exact selection logic.

- [ ] **Step 1:** Refactor the (team, decade, available-pool) selection out of `spin()` into a private helper, then add:

```ts
export function spinPool(seed: string, round: number, opts: SpinOptions = {}): { team: string; decade: string; ids: string[] } {
  // identical (team, decade) selection as spin(), but return candidate ids only (no computeFits)
  // ...reuse the rng/locks/exclude logic; ids = pool.map(p => p.id)
}
```

Keep `spin()` behavior byte-identical (have it call the shared selection helper). Verify `npm run build` still green.

- [ ] **Step 2:** Commit: `git add -A && git commit -m "feat(leaderboard): add pool-only spinPool helper"`

---

## Task 3: Draft-trace replay verifier (TDD)

**Files:** Create `web/lib/dailyVerify.ts`, `web/lib/dailyVerify.test.ts`

Pure, deterministic, no Redis. Signature:

```ts
import type { DraftStep, Player, LineupResult } from "./types";
export type VerifyResult =
  | { ok: true; players: Player[]; result: LineupResult; lineup: string }   // players in slot order
  | { ok: false; error: string };
export function verifyDaily(date: string, trace: DraftStep[]): VerifyResult;
```

Algorithm (per spec): for each round (trace index = round) start from `spinPool(seed, r, {exclude})`; apply each `respin` in order with a global incrementing salt, locking decade (team respin) or team (era respin) off the running pool's `{team,decade}`; assert pick ∈ pool ids, slot ∈ `eligibleOf(player)`, slot unused, ≤1 team & ≤1 era respin total; push id to exclude. After 5: reorder to slot order PG..C, assert 5 unique `person_id`, `evaluateLineup` → result, `lineup = ids.join(",")`.

> Note: `spinPool` needs the running pool's `{team, decade}` for chained respins — capture them from each `spinPool` call.

- [ ] **Step 1: Write the failing test** `web/lib/dailyVerify.test.ts` (custom-assert style):

```ts
import { verifyDaily } from "./dailyVerify";
import { spinPool } from "./data";
import { eligibleOf } from "./teams";

// Build a legitimate trace by actually playing today's deterministic Daily, no respins.
const date = "2025-1-1";
const seed = `daily-${date}`;
const trace: { slot: any; pickedId: string; respins: any[] }[] = [];
const exclude: string[] = [];
const usedSlots = new Set<string>();
for (let r = 0; r < 5; r++) {
  const pool = spinPool(seed, r, { exclude });
  // pick the first candidate whose eligible slot is still open
  // (resolve player via a tiny lookup is unavailable here; the verifier owns eligibility,
  //  so for the test we pick the first id and the first open slot from its eligibility)
  // -> simplest: pick first id; choose an open slot from SLOTS not yet used that the player can play
  // Implement using a helper exported for tests, or inline minimal player lookup.
}

let fail = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("FAIL:", m); fail++; } else console.log("ok:", m); };

// happy path
const ok = verifyDaily(date, trace as any);
assert(ok.ok === true, "a legitimately-drafted lineup verifies");

// tamper: off-pool player (swap a pickedId for a star not in that pool)
const bad = structuredClone(trace);
(bad[0] as any).pickedId = "michael_jordan_chi_1990s_1991";
assert(verifyDaily(date, bad as any).ok === false, "off-pool pick is rejected");

// illegal slot / duplicate slot
const dupSlot = structuredClone(trace);
(dupSlot[1] as any).slot = (dupSlot[0] as any).slot;
assert(verifyDaily(date, dupSlot as any).ok === false, "duplicate slot is rejected");

// wrong length
assert(verifyDaily(date, trace.slice(0, 4) as any).ok === false, "trace must be length 5");

console.log(fail ? `\n${fail} FAILED` : "\nALL VERIFY CHECKS PASSED");
process.exit(fail ? 1 : 0);
```

> The test needs to construct a *valid* trace, which requires resolving ids→eligible slots. To avoid duplicating engine internals in the test, export a small `buildLegitTrace(date)` test-helper from `dailyVerify.ts` (it plays the deterministic Daily greedily: each round pick the top candidate with an open eligible slot). This both seeds the happy-path test and documents the legal-play shape.

- [ ] **Step 2:** Run `cd web && npx tsx lib/dailyVerify.test.ts` → expect FAIL (module not implemented).
- [ ] **Step 3:** Implement `web/lib/dailyVerify.ts` (verifier + `buildLegitTrace`). Resolve players via a server lookup (`getPlayersByIds`) for eligibility/person checks.
- [ ] **Step 4:** Run `npx tsx lib/dailyVerify.test.ts` → expect `ALL VERIFY CHECKS PASSED`.
- [ ] **Step 5:** Commit: `git add -A && git commit -m "feat(leaderboard): draft-trace replay verifier + tests"`

---

## Task 4: Redis store wrapper (graceful no-config)

**Files:** Create `web/lib/leaderboard.ts`

```ts
import "server-only";
import { Redis } from "@upstash/redis";
import type { LineupResult, LeaderboardRow, LeaderboardView } from "./types";

const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
const redis = url && token ? new Redis({ url, token }) : null;
export function isLeaderboardEnabled() { return !!redis; }

const TTL = 60 * 60 * 24 * 31;                       // ~31 days
const enc = (wins: number, net: number) => wins * 1000 + (net + 100);   // wins primary, net tiebreak

export async function submitScore(date: string, row: Omit<LeaderboardRow, "rank">, result: LineupResult): Promise<LeaderboardView | null> {
  if (!redis) return null;
  const z = `lb:${date}`, h = `lb:${date}:meta`;
  const score = enc(result.wins, result.netRtg);
  await redis.zadd(z, { gt: true }, { score, member: row.uid });   // keep-best
  await redis.hset(h, { [row.uid]: JSON.stringify(row) });
  await redis.expire(z, TTL); await redis.expire(h, TTL);
  return getLeaderboard(date, row.uid);
}

export async function getLeaderboard(date: string, uid?: string): Promise<LeaderboardView | null> {
  if (!redis) return null;
  const z = `lb:${date}`, h = `lb:${date}:meta`;
  const total = await redis.zcard(z);
  const top = await readRows(z, h, 0, 99);
  let you: LeaderboardRow | undefined;
  if (uid) {
    const rank = await redis.zrevrank(z, uid);
    if (rank != null) { const r = await readRow(h, uid, rank); if (r) you = r; }
  }
  return { date, total, top, you };
}
// readRows: zrevrange WITHSCORES → hmget meta → parse → attach rank (offset+i)
```

- [ ] **Step 1:** Implement the file (incl. `readRows`/`readRow` helpers, JSON parse guards).
- [ ] **Step 2:** `npm run build` green (no Redis needed at build).
- [ ] **Step 3:** Commit: `git add -A && git commit -m "feat(leaderboard): Upstash store wrapper with graceful no-config"`

---

## Task 5: API routes

**Files:** Create `web/app/api/daily/submit/route.ts`, `web/app/api/daily/leaderboard/route.ts`

`submit/route.ts` (Node runtime):
```ts
import { NextResponse } from "next/server";
import { isLeaderboardEnabled, submitScore } from "@/lib/leaderboard";
import { verifyDaily } from "@/lib/dailyVerify";

const todayUTC = () => { const d = new Date(); return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`; };
const cleanName = (s: unknown) => (typeof s === "string" ? s.replace(/[ -]/g, "").trim().slice(0, 24) : "") || "Anonymous";

export async function POST(req: Request) {
  if (!isLeaderboardEnabled()) return NextResponse.json({ error: "leaderboard not configured" }, { status: 503 });
  const body = await req.json().catch(() => ({}));
  const { date, uid, name, trace } = body ?? {};
  if (date !== todayUTC()) return NextResponse.json({ error: "stale date" }, { status: 400 });
  if (typeof uid !== "string" || !/^[a-z0-9-]{8,64}$/i.test(uid)) return NextResponse.json({ error: "bad uid" }, { status: 400 });
  const v = verifyDaily(date, trace);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });
  const row = { uid, name: cleanName(name), wins: v.result.wins, losses: v.result.losses, net: v.result.netRtg, lineup: v.lineup };
  const view = await submitScore(date, row, v.result);
  return NextResponse.json(view);
}
```

`leaderboard/route.ts`:
```ts
import { NextResponse } from "next/server";
import { isLeaderboardEnabled, getLeaderboard } from "@/lib/leaderboard";
export async function GET(req: Request) {
  if (!isLeaderboardEnabled()) return NextResponse.json({ error: "leaderboard not configured" }, { status: 503 });
  const u = new URL(req.url);
  const date = u.searchParams.get("date"); const uid = u.searchParams.get("uid") ?? undefined;
  if (!date) return NextResponse.json({ error: "date required" }, { status: 400 });
  return NextResponse.json(await getLeaderboard(date, uid));
}
```

- [ ] **Step 1:** Create both routes. `npm run build` green.
- [ ] **Step 2:** Commit: `git add -A && git commit -m "feat(leaderboard): submit + leaderboard API routes"`

---

## Task 6: Client streak + identity helpers

**Files:** Create `web/lib/streak.ts` (client; no "server-only")

```ts
const k = { uid: "82-0:uid", name: "82-0:name", hist: "82-0:daily:history" };
export function getUid(): string { /* read or create crypto.randomUUID(), persist */ }
export function getName(): string { try { return localStorage.getItem(k.name) ?? ""; } catch { return ""; } }
export function setName(n: string): void { /* persist */ }
export function recordDailyDone(date: string): void { /* push date if new */ }
export function getStreak(): number { /* consecutive UTC days up to today/yesterday from history */ }
export function msToNextUtcMidnight(): number { /* for countdown */ }
```

- [ ] **Step 1:** Implement (all `localStorage` access try/caught; SSR-safe guards).
- [ ] **Step 2:** Commit: `git add -A && git commit -m "feat(leaderboard): client streak + identity helpers"`

---

## Task 7: Trace recording in Game.tsx

**Files:** Modify `web/components/Game.tsx`

- [ ] **Step 1:** Add `traceRef = useRef<DraftStep[]>([])` and `roundRespinsRef = useRef<("team"|"era")[]>([])`. Reset both in `start()`. In `reSpinTeam`/`reSpinEra` push `"team"`/`"era"` to `roundRespinsRef`. In `place(slot)` push `{ slot, pickedId: selPlayer.id, respins: roundRespinsRef.current }` to `traceRef`, then clear `roundRespinsRef`. (Order = draft order = round index.)
- [ ] **Step 2:** Pass `trace={traceRef.current}` to the Daily result UI (Task 8). `npm run build` green.
- [ ] **Step 3:** Commit: `git add -A && git commit -m "feat(leaderboard): record Daily draft trace"`

---

## Task 8: Leaderboard UI + Daily submit flow

**Files:** Create `web/components/Leaderboard.tsx`; modify `web/components/Game.tsx`

`Leaderboard.tsx` (client) props: `{ date: string; trace: DraftStep[]; result: LineupResult; lineup: string }`.
- On mount: `getStreak()` + `recordDailyDone(date)`; fetch `GET /api/daily/leaderboard?date&uid`. If 503 → render nothing (feature off). Show streak chip + "next Daily in HH:MM:SS" countdown.
- Submit control: name input (prefill `getName()`), button → `POST /api/daily/submit` `{date, uid, name, trace}` → render returned board with `you` row highlighted. Persist name.
- Board rows: rank · name · `W–L` · net · link to `/r/<row.lineup>`.

Wire into `Game.tsx`: when `result` and `mode === "daily"`, render `<Leaderboard date={seed.replace("daily-","")} trace={traceRef.current} result={result.result} lineup={result.players.map(p=>p.id).join(",")} />` under the ResultCard.

- [ ] **Step 1:** Build component + wiring. `npm run build` + `npm run lint` green.
- [ ] **Step 2:** Commit: `git add -A && git commit -m "feat(leaderboard): board UI, submit flow, streak + countdown"`

---

## Task 9: Verify + PR

- [ ] **Step 1:** `cd web && npm run lint && npm run build && npx tsx lib/dailyVerify.test.ts` — all green.
- [ ] **Step 2:** Manual (no Redis): start prod server, confirm Daily result renders with no leaderboard (graceful), `/api/daily/leaderboard?date=...` → 503, app otherwise unaffected.
- [ ] **Step 3:** Push branch, open PR to main with body covering the design, the Upstash setup the owner must do, and the graceful-degradation guarantee.

---

## Self-review (against spec)

- Identity (uid+name) → Task 6. Store (Upstash) → Tasks 1,4. Ranking (wins→net) → `enc()` Task 4. Strict anti-cheat (replay) → Task 3. Streaks (client) → Tasks 6,8. Graceful degradation → `isLeaderboardEnabled` Tasks 4,5,8. `/r` row links → Task 8. TTL/keep-best → Task 4. ✓ all spec sections covered.
- No placeholders in shipped code (the test's `// ...` is resolved by `buildLegitTrace`). Types consistent (`DraftStep`, `LeaderboardRow/View` defined Task 1, used 3/4/5/8). `spinPool` defined Task 2, used Task 3.
