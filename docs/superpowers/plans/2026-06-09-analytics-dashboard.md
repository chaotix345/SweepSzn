# Analytics / Insights Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an admin-gated `/admin` dashboard that answers "is the viral loop working?" — a conversion funnel (play → complete → share → sign-in → return) plus retention — from owned Upstash counters, without touching the engine, gameplay, leaderboard, or auth behavior.

**Architecture:** A thin owned event-counter layer in Redis (`ev:*` keys). Server-observable stages (complete, sign-in, submit) are counted inside the existing API routes via Next 16's `after()` (post-response, zero added latency). The two client-only stages (play, share) are captured by a tiny `/api/ev` beacon. A pure `lib/metrics.ts` reads the counters and derives the funnel + retention; a server-component `app/admin/page.tsx` renders it. Existing Vercel `track()` calls are left untouched.

**Tech Stack:** Next.js 16.2.7 (App Router, `after`, native `Response`, async `params`/`searchParams`, `MetadataRoute.Robots`), `@upstash/redis ^1.38.0`, the shipped HS256 session (`getSession`), TypeScript, hand-rolled `npx tsx` tests (no framework).

**Reference spec:** `docs/superpowers/specs/2026-06-09-analytics-dashboard-design.md`

**Hard invariant (every task must preserve it):** an `ev:*` write must NEVER break gameplay/auth/submit. Server-route bumps run inside `after(...)`; `bump()` and `ev()` swallow all errors internally. A Redis outage must degrade only the dashboard.

**House conventions (from CLAUDE.md / memory):**
- Work is on branch `feat/analytics-dashboard` (already created off main). Never commit to main.
- Keep `web/scripts/*` OUT of commits — always `git add` explicit paths, never `-A`.
- Tests are run with `npx tsx lib/<file>.test.ts` from inside `web/`. There is no `test`/`typecheck` npm script; build is `npm run build`, lint is `npm run lint` (i.e. `eslint`).
- Use MultiEdit when changing the same file more than once (never two Edits on one file).
- New date helper lives in `lib/day.ts`; do NOT refactor the existing per-route `todayUTC` one-liners.

---

## File structure

**New files**
- `web/lib/day.ts` — pure UTC date-key helpers (`dayUTC`, `recentDays`). Shared by ev + metrics + admin. No `server-only`.
- `web/lib/day.test.ts` — tests for the date helpers.
- `web/lib/ev.ts` — client beacon `ev(name, props)` (sendBeacon + fetch-keepalive fallback). Browser-only util.
- `web/lib/ev.test.ts` — test the beacon (stub `navigator.sendBeacon`).
- `web/lib/evServer.ts` — `parseEvBody` (pure validation) + `bump(redis, stage, opts)` (write helper, DI'd redis, internal try/catch) + `EV_TTL` + types. No `server-only` (so tsx tests can import it).
- `web/lib/evServer.test.ts` — tests for `parseEvBody` + `bump`.
- `web/lib/metrics.ts` — pure helpers (`pct`, `intersectCount`, `bucketWins`, `sparkline`) + `getMetrics(redis, opts)`. No `server-only`.
- `web/lib/metrics.test.ts` — tests for the pure helpers + `getMetrics` against a fake redis.
- `web/app/api/ev/route.ts` — the beacon endpoint (Node runtime, always 204).
- `web/app/admin/page.tsx` — server component: admin gate + render.

**Modified files**
- `web/app/api/evaluate/route.ts` — `after(() => bump(redis, "complete"))`.
- `web/app/api/auth/google/route.ts` — `after(() => bump(redis, "signin", { uid: user.uid }))`.
- `web/app/api/daily/submit/route.ts` — `after(() => bump(redis, "submit", { uid }))`.
- `web/app/api/challenge/submit/route.ts` — `after(() => bump(redis, "submit", { uid }))`.
- `web/components/Game.tsx` — `ev("play", { uid: getUid(), mode: m })` beside `track("mode_start")`.
- `web/components/ResultCard.tsx` — `ev("share", { uid: getUid() })` beside each of 3 `track("share")` calls.
- `web/components/ChallengeResult.tsx` — `ev("share", { uid })` beside the `challenge_copy` track.
- `web/components/RankShareButton.tsx` — `ev("share", { uid: getUid() })` beside each of 3 `track("share_rank")` calls.
- `web/app/robots.ts` — add `disallow: "/admin"`.

---

## Task 1: Pure date-key helpers (`lib/day.ts`)

**Files:**
- Create: `web/lib/day.ts`
- Test: `web/lib/day.test.ts`

- [ ] **Step 1: Write the failing test**

Create `web/lib/day.test.ts`:

```ts
import { dayUTC, recentDays } from "./day";

let fail = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("FAIL:", m); fail++; } else console.log("ok:", m); };

// dayUTC formats UTC as YYYY-M-D with NO zero padding (matches existing lb:<date> keys)
assert(dayUTC(new Date("2026-06-09T12:00:00Z")) === "2026-6-9", "single-digit month/day not padded");
assert(dayUTC(new Date("2026-12-31T23:59:59Z")) === "2026-12-31", "double-digit month/day");
assert(dayUTC(new Date("2026-01-01T00:00:00Z")) === "2026-1-1", "Jan 1");

// recentDays returns n day-strings, newest first, stepping back 1 UTC day each
const r = recentDays(3, new Date("2026-06-09T12:00:00Z"));
assert(r.length === 3, "recentDays returns n entries");
assert(r[0] === "2026-6-9" && r[1] === "2026-6-8" && r[2] === "2026-6-7", "recentDays steps back UTC days, newest first");
// crosses a month boundary correctly
const r2 = recentDays(2, new Date("2026-03-01T06:00:00Z"));
assert(r2[0] === "2026-3-1" && r2[1] === "2026-2-28", "recentDays crosses month boundary");

console.log(fail ? `\n${fail} ASSERTION(S) FAILED` : "\nALL DAY CHECKS PASSED");
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx tsx lib/day.test.ts`
Expected: FAIL — cannot find module `./day`.

- [ ] **Step 3: Write minimal implementation**

Create `web/lib/day.ts`:

```ts
// Pure UTC date-key helpers. Format matches the existing lb:<date> keys: `YYYY-M-D`, no zero-padding, UTC.
// (The existing per-route `todayUTC` one-liners are intentionally left as-is; new code uses these.)

export const dayUTC = (d: Date = new Date()): string =>
  `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`;

// Newest-first list of n day-keys ending at `now` (inclusive), stepping back one UTC day each.
export const recentDays = (n: number, now: Date = new Date()): string[] =>
  Array.from({ length: n }, (_, i) => dayUTC(new Date(now.getTime() - i * 86_400_000)));
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx tsx lib/day.test.ts`
Expected: `ALL DAY CHECKS PASSED`, exit 0.

- [ ] **Step 5: Commit**

```bash
git add web/lib/day.ts web/lib/day.test.ts
git commit -m "feat(analytics): pure UTC date-key helpers (lib/day)"
```

---

## Task 2: Client beacon (`lib/ev.ts`)

**Files:**
- Create: `web/lib/ev.ts`
- Test: `web/lib/ev.test.ts`

- [ ] **Step 1: Write the failing test**

Create `web/lib/ev.test.ts` (Node 18+ has global `Blob`; we stub `navigator`):

```ts
import { ev } from "./ev";

let fail = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("FAIL:", m); fail++; } else console.log("ok:", m); };

(async () => {
  // sendBeacon path
  let beacon: { url: string; body: string } | null = null;
  (globalThis as unknown as { navigator: unknown }).navigator = {
    sendBeacon: (url: string, blob: Blob) => { blob.text().then(t => { beacon = { url, body: t }; }); return true; },
  };
  ev("play", { uid: "abcdefgh", mode: "daily" });
  await new Promise(r => setTimeout(r, 10));
  assert(beacon !== null, "sendBeacon was called");
  assert(beacon!.url === "/api/ev", "posts to /api/ev");
  const parsed = JSON.parse(beacon!.body);
  assert(parsed.ev === "play" && parsed.uid === "abcdefgh" && parsed.mode === "daily", "payload carries ev+uid+mode");

  // fetch fallback when sendBeacon is unavailable
  let fetched: { url: string; body: string } | null = null;
  (globalThis as unknown as { navigator: unknown }).navigator = {};
  (globalThis as unknown as { fetch: unknown }).fetch = (url: string, init: { body: string }) => { fetched = { url, body: init.body }; return Promise.resolve({} as Response); };
  ev("share", { uid: "abcdefgh" });
  assert(fetched !== null && fetched!.url === "/api/ev", "falls back to fetch when no sendBeacon");
  assert(fetched !== null && JSON.parse(fetched!.body).ev === "share", "fetch fallback carries ev");

  // never throws even if everything is broken
  (globalThis as unknown as { navigator: unknown }).navigator = { sendBeacon: () => { throw new Error("boom"); } };
  let threw = false;
  try { ev("play", {}); } catch { threw = true; }
  assert(!threw, "ev never throws into the UI");

  console.log(fail ? `\n${fail} ASSERTION(S) FAILED` : "\nALL EV CHECKS PASSED");
  process.exit(fail ? 1 : 0);
})();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx tsx lib/ev.test.ts`
Expected: FAIL — cannot find module `./ev`.

- [ ] **Step 3: Write minimal implementation**

Create `web/lib/ev.ts`:

```ts
// Client-only analytics beacon. Fire-and-forget; must NEVER throw into the UI.
// Runs alongside the existing Vercel track() calls (we keep both — see spec §2).
export type EvName = "play" | "share";

export function ev(name: EvName, props: { uid?: string; mode?: string } = {}): void {
  try {
    const payload = JSON.stringify({ ev: name, ...props });
    const nav = typeof navigator !== "undefined" ? navigator : undefined;
    if (nav && typeof nav.sendBeacon === "function") {
      nav.sendBeacon("/api/ev", new Blob([payload], { type: "application/json" }));
      return;
    }
    void fetch("/api/ev", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: payload,
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* analytics must never throw into the UI */
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx tsx lib/ev.test.ts`
Expected: `ALL EV CHECKS PASSED`, exit 0.

- [ ] **Step 5: Commit**

```bash
git add web/lib/ev.ts web/lib/ev.test.ts
git commit -m "feat(analytics): client beacon ev() (sendBeacon + fetch fallback)"
```

---

## Task 3: Server counter helper (`lib/evServer.ts`)

**Files:**
- Create: `web/lib/evServer.ts`
- Test: `web/lib/evServer.test.ts`

`EvStage` = the five funnel stages. `parseEvBody` accepts ONLY the two beacon stages (`play`, `share`) and validates `uid`/`mode`. `bump` performs the writes for any stage, guards null redis, and swallows all errors.

- [ ] **Step 1: Write the failing test**

Create `web/lib/evServer.test.ts`:

```ts
import { parseEvBody, bump, EV_TTL } from "./evServer";
import type { Redis } from "@upstash/redis";

let fail = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("FAIL:", m); fail++; } else console.log("ok:", m); };

function fakeRedis() {
  const calls: string[] = [];
  const store: Record<string, number> = {};
  const sets: Record<string, Set<string>> = {};
  const hashes: Record<string, Record<string, number>> = {};
  const r = {
    calls, store, sets, hashes,
    incr: async (k: string) => { calls.push(`incr ${k}`); return (store[k] = (store[k] ?? 0) + 1); },
    sadd: async (k: string, ...m: string[]) => { calls.push(`sadd ${k} ${m.join(",")}`); (sets[k] ??= new Set()); m.forEach(x => sets[k].add(x)); return m.length; },
    hincrby: async (k: string, f: string, n: number) => { calls.push(`hincrby ${k} ${f} ${n}`); (hashes[k] ??= {}); return (hashes[k][f] = (hashes[k][f] ?? 0) + n); },
    expire: async (k: string, s: number) => { calls.push(`expire ${k} ${s}`); return 1; },
  };
  return r;
}

// --- parseEvBody ---
assert(JSON.stringify(parseEvBody({ ev: "play", uid: "abcdefgh", mode: "daily" })) === JSON.stringify({ ev: "play", uid: "abcdefgh", mode: "daily" }), "valid play parsed");
assert(JSON.stringify(parseEvBody({ ev: "share", uid: "abcdefgh" })) === JSON.stringify({ ev: "share", uid: "abcdefgh" }), "valid share parsed (no mode)");
assert(parseEvBody({ ev: "complete" }) === null, "non-beacon stage rejected");
assert(parseEvBody({ ev: "nope" }) === null, "unknown ev rejected");
assert(parseEvBody("garbage") === null, "non-object rejected");
assert(parseEvBody({ ev: "play", uid: "bad uid!" })?.uid === undefined, "malformed uid stripped");
assert(parseEvBody({ ev: "play", uid: "abcdefgh", mode: "nope" })?.mode === undefined, "bad mode stripped");
assert(parseEvBody({ ev: "share", uid: "abcdefgh", mode: "daily" })?.mode === undefined, "mode ignored for share");

(async () => {
  // --- bump: play with uid + mode ---
  const r = fakeRedis();
  await bump(r as unknown as Redis, "play", { uid: "abcdefgh", mode: "daily", day: "2026-6-9" });
  assert(r.store["ev:play:2026-6-9"] === 1, "play counter incremented");
  assert(r.hashes["ev:mode:2026-6-9"]?.daily === 1, "mode hash incremented");
  assert(r.sets["ev:active:2026-6-9"]?.has("abcdefgh") === true, "uid added to active set");
  assert(r.hashes["ev:totals"]?.play === 1, "totals.play incremented");
  assert(r.calls.includes(`expire ev:play:2026-6-9 ${EV_TTL}`), "play key expired with EV_TTL");
  assert(r.calls.includes(`expire ev:active:2026-6-9 ${EV_TTL}`), "active set expired with EV_TTL");
  assert(!r.calls.some(c => c.startsWith("expire ev:totals")), "ev:totals is never expired (persistent)");

  // --- bump: complete (server stage, no uid/mode) ---
  const r2 = fakeRedis();
  await bump(r2 as unknown as Redis, "complete", { day: "2026-6-9" });
  assert(r2.store["ev:complete:2026-6-9"] === 1, "complete counter incremented");
  assert(r2.hashes["ev:totals"]?.complete === 1, "totals.complete incremented");
  assert(r2.sets["ev:active:2026-6-9"] === undefined, "complete does NOT touch active set");
  assert(r2.hashes["ev:mode:2026-6-9"] === undefined, "complete does NOT touch mode hash");

  // --- bump: submit with uid, no mode ---
  const r3 = fakeRedis();
  await bump(r3 as unknown as Redis, "submit", { uid: "abcdefgh", day: "2026-6-9" });
  assert(r3.store["ev:submit:2026-6-9"] === 1, "submit counter incremented");
  assert(r3.sets["ev:active:2026-6-9"]?.has("abcdefgh") === true, "submit adds uid to active set");
  assert(r3.hashes["ev:mode:2026-6-9"] === undefined, "submit does NOT touch mode hash");

  // --- bump: null redis no-ops ---
  await bump(null, "play", { uid: "abcdefgh", day: "2026-6-9" });
  assert(true, "null redis no-ops without throwing");

  // --- bump: throwing redis is swallowed ---
  const thrower = { incr: async () => { throw new Error("boom"); }, sadd: async () => { throw new Error(); }, hincrby: async () => { throw new Error(); }, expire: async () => { throw new Error(); } };
  let threw = false;
  try { await bump(thrower as unknown as Redis, "complete", { day: "2026-6-9" }); } catch { threw = true; }
  assert(!threw, "throwing redis is swallowed — bump never throws");

  console.log(fail ? `\n${fail} ASSERTION(S) FAILED` : "\nALL EVSERVER CHECKS PASSED");
  process.exit(fail ? 1 : 0);
})();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx tsx lib/evServer.test.ts`
Expected: FAIL — cannot find module `./evServer`.

- [ ] **Step 3: Write minimal implementation**

Create `web/lib/evServer.ts`:

```ts
import type { Redis } from "@upstash/redis";
import { dayUTC } from "./day";

// Owned funnel-counter writer. Five stages; play/share also arrive via the /api/ev beacon.
// All writes are best-effort: this module must NEVER throw or block a user-facing route.
export type EvStage = "play" | "complete" | "share" | "signin" | "submit";

export const EV_TTL = 60 * 60 * 24 * 45; // ~45 days, enough for a 14-day window + retention look-back

const UID_RE = /^[a-z0-9-]{8,64}$/i;
const MODES = new Set(["daily", "classic", "hoopiq", "challenge"]);
const BEACON_STAGES = new Set<EvStage>(["play", "share"]);

export interface BeaconBody { ev: "play" | "share"; uid?: string; mode?: string }

// Validate an untrusted beacon payload. Returns null for anything not a valid play/share beacon.
export function parseEvBody(body: unknown): BeaconBody | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (b.ev !== "play" && b.ev !== "share") return null;
  const out: BeaconBody = { ev: b.ev };
  if (typeof b.uid === "string" && UID_RE.test(b.uid)) out.uid = b.uid;
  if (b.ev === "play" && typeof b.mode === "string" && MODES.has(b.mode)) out.mode = b.mode;
  return out;
}

// Increment counters for one stage. `day` defaults to today (UTC). Best-effort, error-swallowing.
export async function bump(
  redis: Redis | null,
  stage: EvStage,
  opts: { uid?: string; mode?: string; day?: string } = {},
): Promise<void> {
  if (!redis) return;
  const day = opts.day ?? dayUTC();
  try {
    const counterKey = `ev:${stage}:${day}`;
    await redis.incr(counterKey);
    await redis.expire(counterKey, EV_TTL);
    await redis.hincrby("ev:totals", stage, 1); // persistent: never expired

    if (stage === "play" && opts.mode && MODES.has(opts.mode)) {
      const modeKey = `ev:mode:${day}`;
      await redis.hincrby(modeKey, opts.mode, 1);
      await redis.expire(modeKey, EV_TTL);
    }
    // play/share/signin/submit carry a uid → contribute to the day's distinct-active set.
    if (opts.uid && stage !== "complete") {
      const activeKey = `ev:active:${day}`;
      await redis.sadd(activeKey, opts.uid);
      await redis.expire(activeKey, EV_TTL);
    }
  } catch {
    /* analytics must never break the calling route */
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx tsx lib/evServer.test.ts`
Expected: `ALL EVSERVER CHECKS PASSED`, exit 0.

- [ ] **Step 5: Commit**

```bash
git add web/lib/evServer.ts web/lib/evServer.test.ts
git commit -m "feat(analytics): server counter helper bump() + parseEvBody"
```

---

## Task 4: Beacon endpoint (`app/api/ev/route.ts`)

**Files:**
- Create: `web/app/api/ev/route.ts`

No unit test (importing the route pulls `server-only` via `@/lib/redis`; the logic it adds — `parseEvBody` + `bump` — is already unit-tested in Task 3). Verified end-to-end in Task 11.

- [ ] **Step 1: Write the route**

Create `web/app/api/ev/route.ts`:

```ts
import { redis } from "@/lib/redis";
import { bump, parseEvBody } from "@/lib/evServer";

export const runtime = "nodejs";

// Fire-and-forget analytics beacon for the two client-only funnel stages (play, share).
// Always returns 204 and never leaks data or errors — invalid/garbage bodies are ignored.
export async function POST(req: Request) {
  const parsed = parseEvBody(await req.json().catch(() => null));
  if (parsed) await bump(redis, parsed.ev, { uid: parsed.uid, mode: parsed.mode });
  return new Response(null, { status: 204 });
}
```

- [ ] **Step 2: Verify it compiles / lints**

Run: `cd web && npx eslint app/api/ev/route.ts`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web/app/api/ev/route.ts
git commit -m "feat(analytics): /api/ev beacon endpoint (play/share)"
```

---

## Task 5: Wire server-route bumps via `after()`

Add a post-response `after(() => bump(...))` to each route's SUCCESS path. `after` from `next/server` runs after the response is flushed (zero added latency) and even runs if the handler later errors; `bump` is internally error-swallowing. No new behavior on any route.

**Files:**
- Modify: `web/app/api/evaluate/route.ts`
- Modify: `web/app/api/auth/google/route.ts`
- Modify: `web/app/api/daily/submit/route.ts`
- Modify: `web/app/api/challenge/submit/route.ts`

- [ ] **Step 1: evaluate — count `complete`**

In `web/app/api/evaluate/route.ts`, add imports at the top (beside the existing imports):

```ts
import { after } from "next/server";
import { redis } from "@/lib/redis";
import { bump } from "@/lib/evServer";
```

Then change the success path. Find:

```ts
  const result = evaluateLineup(players, getCoefficients());
  return NextResponse.json({ result, players });
```

Replace with:

```ts
  const result = evaluateLineup(players, getCoefficients());
  after(() => bump(redis, "complete"));
  return NextResponse.json({ result, players });
```

- [ ] **Step 2: auth/google — count `signin`**

In `web/app/api/auth/google/route.ts`, add the same three imports (`after`, `redis`, `bump`). Find the success path:

```ts
  await setSessionCookie(await signSession(user));
  c.delete(NONCE_COOKIE);
  return NextResponse.json({ user: { uid: user.uid, name: user.name, picture: user.picture } });
```

Replace with:

```ts
  await setSessionCookie(await signSession(user));
  c.delete(NONCE_COOKIE);
  after(() => bump(redis, "signin", { uid: user.uid }));
  return NextResponse.json({ user: { uid: user.uid, name: user.name, picture: user.picture } });
```

- [ ] **Step 3: daily/submit — count `submit`**

In `web/app/api/daily/submit/route.ts`, add the three imports. Find:

```ts
  const view = session
    ? await submitScoreAuthed(date, row, v.result)
    : await submitScore(date, row, v.result);
  return NextResponse.json(view);
```

Replace with:

```ts
  const view = session
    ? await submitScoreAuthed(date, row, v.result)
    : await submitScore(date, row, v.result);
  after(() => bump(redis, "submit", { uid }));
  return NextResponse.json(view);
```

(`uid` is the local `let` already resolved to `session.uid` or the validated `body.uid` on this path.)

- [ ] **Step 4: challenge/submit — count `submit` once, before the role fork**

In `web/app/api/challenge/submit/route.ts`, add the three imports. The handler has a `submitChallenge` call producing `out`, an `if (!out) return …` guard, then a creator/responder fork that each returns. Insert the bump immediately AFTER the `if (!out)` guard and BEFORE the role fork, so it counts once for both success branches. Find (the guard line — context):

```ts
  if (!out) return NextResponse.json({ error: "challenge not found" }, { status: 404 });
```

Add directly below it:

```ts
  after(() => bump(redis, "submit", { uid }));
```

(If the exact 404 message/line differs, the anchor is: the first line after `out` is confirmed truthy and before `if (out.role === "creator")`. `uid` is the regex-validated client uid in scope.)

- [ ] **Step 5: Lint the four routes**

Run: `cd web && npx eslint app/api/evaluate/route.ts app/api/auth/google/route.ts app/api/daily/submit/route.ts app/api/challenge/submit/route.ts`
Expected: no errors. (If `redis` is reported unused in any file because the import already existed, remove the duplicate import.)

- [ ] **Step 6: Commit**

```bash
git add web/app/api/evaluate/route.ts web/app/api/auth/google/route.ts web/app/api/daily/submit/route.ts web/app/api/challenge/submit/route.ts
git commit -m "feat(analytics): count complete/signin/submit via after() in API routes"
```

---

## Task 6: Client beacon call sites

Add an `ev(...)` call beside each existing Vercel `track(...)` call. Leave every `track(...)` exactly as-is. Use MultiEdit for ResultCard and RankShareButton (3 edits + 1 import each).

**Files:**
- Modify: `web/components/Game.tsx`
- Modify: `web/components/ResultCard.tsx`
- Modify: `web/components/ChallengeResult.tsx`
- Modify: `web/components/RankShareButton.tsx`

- [ ] **Step 1: Game.tsx — play beacon**

Add imports beside `import { track } from "@vercel/analytics";`:

```ts
import { ev } from "@/lib/ev";
import { getUid } from "@/lib/streak";
```

Find:

```ts
    track("mode_start", { mode: m });
```

Replace with:

```ts
    track("mode_start", { mode: m });
    ev("play", { uid: getUid(), mode: m });
```

- [ ] **Step 2: ResultCard.tsx — share beacon (MultiEdit: 1 import + 3 calls)**

Add imports beside `import { track } from "@vercel/analytics";`:

```ts
import { ev } from "@/lib/ev";
import { getUid } from "@/lib/streak";
```

Then, at each of the three `track("share", …)` sites, add `ev("share", { uid: getUid() });` immediately after the `track` call:

- copy handler: `… track("share", { target: "copy" }); ev("share", { uid: getUid() }); …`
- native handler: `… track("share", { target: "native" }); ev("share", { uid: getUid() }); …`
- social link onClick: change `onClick={() => track("share", { target: name })}` to `onClick={() => { track("share", { target: name }); ev("share", { uid: getUid() }); }}`

- [ ] **Step 3: ChallengeResult.tsx — share beacon**

`getUid` is already imported here (`import { getUid, getName, setName as persistName } from "@/lib/streak";`) and a `uid` state variable is in scope. Add the ev import beside the track import:

```ts
import { ev } from "@/lib/ev";
```

Find the `challenge_copy` site:

```ts
      setCopied(true); track("share", { target: "challenge_copy" }); setTimeout(() => setCopied(false), 1500);
```

Replace with:

```ts
      setCopied(true); track("share", { target: "challenge_copy" }); ev("share", { uid }); setTimeout(() => setCopied(false), 1500);
```

- [ ] **Step 4: RankShareButton.tsx — share beacon (MultiEdit: 1 import + 3 calls)**

Add imports beside `import { track } from "@vercel/analytics";`:

```ts
import { ev } from "@/lib/ev";
import { getUid } from "@/lib/streak";
```

At each of the three `track("share_rank", …)` sites add `ev("share", { uid: getUid() });` right after the track call (copy handler, native handler, and the social link onClick — wrap the onClick body in a block as in Step 2). Note: the beacon stage stays `"share"` (rank shares are part of the same share funnel stage; the per-target detail remains in Vercel).

- [ ] **Step 5: Lint the four components**

Run: `cd web && npx eslint components/Game.tsx components/ResultCard.tsx components/ChallengeResult.tsx components/RankShareButton.tsx`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add web/components/Game.tsx web/components/ResultCard.tsx web/components/ChallengeResult.tsx web/components/RankShareButton.tsx
git commit -m "feat(analytics): fire play/share beacons beside existing track() calls"
```

---

## Task 7: Metrics derivation (`lib/metrics.ts`)

**Files:**
- Create: `web/lib/metrics.ts`
- Test: `web/lib/metrics.test.ts`

Pure helpers + `getMetrics(redis, { days, now })`. Retention uses `smembers` + JS set-intersection (exact; avoids any `SINTERCARD` availability question). Per-day reads are batched with `Promise.all`.

- [ ] **Step 1: Write the failing test**

Create `web/lib/metrics.test.ts`:

```ts
import { getMetrics, pct, intersectCount, bucketWins, sparkline } from "./metrics";
import type { Redis } from "@upstash/redis";

let fail = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("FAIL:", m); fail++; } else console.log("ok:", m); };

// --- pure helpers ---
assert(pct(0, 0) === 0, "pct guards divide-by-zero → 0 (not NaN)");
assert(pct(1, 4) === 0.25, "pct basic");
assert(intersectCount(["a", "b", "c"], ["b", "c", "d"]) === 2, "intersectCount counts shared members");
assert(intersectCount([], ["a"]) === 0, "intersectCount empty");
const buckets = bucketWins([82, 75, 65, 50, 80]);
assert(buckets.find(b => b.label === "78-82")!.count === 2, "bucketWins 78-82");
assert(buckets.find(b => b.label === "<60")!.count === 1, "bucketWins <60");
assert(sparkline([]) === "", "sparkline empty");
assert(sparkline([0, 10]).length === 2 && sparkline([0, 10])[1] === "█", "sparkline maps max to full block");

// --- getMetrics against a fake redis ---
// 3-day window ending 2026-06-09 → days asc: 2026-6-7, 2026-6-8, 2026-6-9
const now = new Date("2026-06-09T12:00:00Z");
const counters: Record<string, number> = {
  "ev:play:2026-6-7": 100, "ev:play:2026-6-8": 120, "ev:play:2026-6-9": 80,
  "ev:complete:2026-6-7": 60, "ev:complete:2026-6-8": 90, "ev:complete:2026-6-9": 50,
  "ev:share:2026-6-7": 12, "ev:share:2026-6-8": 18, "ev:share:2026-6-9": 10,
  "ev:signin:2026-6-7": 6, "ev:signin:2026-6-8": 9, "ev:signin:2026-6-9": 5,
  "ev:submit:2026-6-7": 30, "ev:submit:2026-6-8": 40, "ev:submit:2026-6-9": 20,
};
const sets: Record<string, string[]> = {
  "ev:active:2026-6-7": ["u1", "u2", "u3", "u4"],
  "ev:active:2026-6-8": ["u2", "u3", "u5"],   // 2 of day7's 4 returned
  "ev:active:2026-6-9": ["u3", "u6"],         // 1 of day8's 3 returned
};
const hashes: Record<string, Record<string, number>> = {
  "ev:mode:2026-6-7": { daily: 50, classic: 30, hoopiq: 15, challenge: 5 },
  "ev:mode:2026-6-8": { daily: 70, classic: 40, hoopiq: 8, challenge: 2 },
  "ev:mode:2026-6-9": { daily: 50, classic: 20, hoopiq: 8, challenge: 2 },
  "ev:totals": { play: 300, complete: 200, share: 40, signin: 20, submit: 90 },
};
const zsets: Record<string, (string | number)[]> = {
  // lb:<today> withScores interleaved [member, score, …]; score = encScore(wins, net)
  "lb:2026-6-9": ["u3", 80 * 1000 + 110, "u6", 65 * 1000 + 105],
};
const zcards: Record<string, number> = { "lb:2026-6-7": 28, "lb:2026-6-8": 40, "lb:2026-6-9": 20, "lb:week:2026-W24": 96, "lb:alltime": 1234 };

const fake = {
  mget: async (...keys: string[]) => keys.map(k => counters[k] ?? null),
  smembers: async (k: string) => sets[k] ?? [],
  hgetall: async (k: string) => hashes[k] ?? null,
  zcard: async (k: string) => zcards[k] ?? 0,
  zrange: async (k: string) => zsets[k] ?? [],
} as unknown as Redis;

(async () => {
  const m = await getMetrics(fake, { days: 3, now });
  assert(m.days.length === 3 && m.days[0] === "2026-6-7" && m.days[2] === "2026-6-9", "days ascending");
  assert(m.funnel.plays === 300 && m.funnel.completes === 200 && m.funnel.shares === 40, "funnel sums over window");
  assert(m.funnel.signins === 20 && m.funnel.submits === 90, "signin/submit sums");
  assert(Math.abs(m.rates.completion - 200 / 300) < 1e-9, "completion rate = completes/plays");
  assert(Math.abs(m.rates.shareRate - 40 / 200) < 1e-9, "share rate = shares/completes");
  assert(Math.abs(m.rates.capture - 20 / 200) < 1e-9, "capture rate = signins/completes");
  assert(JSON.stringify(m.dauByDay) === JSON.stringify([4, 3, 2]), "DAU per day = active-set sizes");
  // D1 retention: base = |day7| + |day8| = 4 + 3 = 7; returners = |7∩8| + |8∩9| = 2 + 1 = 3
  assert(Math.abs(m.d1 - 3 / 7) < 1e-9, "D1 retention = Σ(intersections)/Σ(bases) over consecutive days");
  assert(m.d7 === null, "d7 null for window < 8 days");
  assert(m.modeSplit.daily === 170 && m.modeSplit.challenge === 9, "mode split summed across window");
  assert(JSON.stringify(m.boardByDay) === JSON.stringify([28, 40, 20]), "board ZCARD per day");
  assert(m.boards.daily === 20 && m.boards.weekly === 96 && m.boards.alltime === 1234, "board snapshot");
  assert(m.winBuckets.find(b => b.label === "78-82")!.count === 1, "today win bucket 78-82 (u3=80)");
  assert(m.winBuckets.find(b => b.label === "60-69")!.count === 1, "today win bucket 60-69 (u6=65)");
  assert(m.totals.play === 300 && m.totals.submit === 90, "all-time totals from ev:totals");

  // null redis → safe empty
  const empty = await getMetrics(null, { days: 3, now });
  assert(empty.funnel.plays === 0 && empty.d1 === 0 && empty.days.length === 3, "null redis → zeroed metrics, no throw");

  console.log(fail ? `\n${fail} ASSERTION(S) FAILED` : "\nALL METRICS CHECKS PASSED");
  process.exit(fail ? 1 : 0);
})();
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd web && npx tsx lib/metrics.test.ts`
Expected: FAIL — cannot find module `./metrics`.

- [ ] **Step 3: Write minimal implementation**

Create `web/lib/metrics.ts`:

```ts
import type { Redis } from "@upstash/redis";
import { decodeWins } from "./score";
import { isoWeek } from "./isoweek";
import { recentDays } from "./day";

export interface Metrics {
  days: string[];                              // ascending date-keys
  funnel: { plays: number; completes: number; shares: number; signins: number; submits: number };
  rates: { completion: number; shareRate: number; capture: number }; // 0..1
  dauByDay: number[];                          // distinct active uids per day (ascending)
  d1: number;                                  // next-day return rate, 0..1
  d7: number | null;                           // 7-day return rate, null if window < 8
  modeSplit: Record<string, number>;           // mode → play count over the window
  boardByDay: number[];                        // ZCARD lb:<day> (ascending)
  boards: { daily: number; weekly: number; alltime: number };
  winBuckets: { label: string; count: number }[]; // today's leaderboard win distribution
  totals: Record<string, number>;              // all-time ev:totals
}

const num = (v: unknown): number => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
export const pct = (a: number, b: number): number => (b > 0 ? a / b : 0);
export const intersectCount = (a: string[], b: string[]): number => {
  const s = new Set(a); let c = 0; for (const x of b) if (s.has(x)) c++; return c;
};

const WIN_BUCKETS = [
  { label: "78-82", min: 78, max: 82 },
  { label: "70-77", min: 70, max: 77 },
  { label: "60-69", min: 60, max: 69 },
  { label: "<60", min: 0, max: 59 },
];
export const bucketWins = (wins: number[]): { label: string; count: number }[] =>
  WIN_BUCKETS.map(b => ({ label: b.label, count: wins.filter(w => w >= b.min && w <= b.max).length }));

const SPARK = "▁▂▃▄▅▆▇█";
export const sparkline = (vals: number[]): string => {
  if (!vals.length) return "";
  const max = Math.max(...vals, 1);
  return vals.map(v => SPARK[Math.min(SPARK.length - 1, Math.floor((v / max) * (SPARK.length - 1)))]).join("");
};

const STAGES = ["play", "complete", "share", "signin", "submit"] as const;

export async function getMetrics(redis: Redis | null, opts: { days?: number; now?: Date } = {}): Promise<Metrics> {
  const n = opts.days ?? 14;
  const days = recentDays(n, opts.now).slice().reverse(); // ascending: oldest … today
  const today = days[days.length - 1];

  if (!redis) {
    return {
      days,
      funnel: { plays: 0, completes: 0, shares: 0, signins: 0, submits: 0 },
      rates: { completion: 0, shareRate: 0, capture: 0 },
      dauByDay: days.map(() => 0), d1: 0, d7: null, modeSplit: {},
      boardByDay: days.map(() => 0), boards: { daily: 0, weekly: 0, alltime: 0 },
      winBuckets: bucketWins([]), totals: {},
    };
  }

  const [counts, modeHashes, activeSets, boardCards, todayZ, totalsHash, weekCard, allCard] = await Promise.all([
    Promise.all(STAGES.map(s => redis.mget<(string | number | null)[]>(...days.map(d => `ev:${s}:${d}`)))),
    Promise.all(days.map(d => redis.hgetall<Record<string, string | number>>(`ev:mode:${d}`))),
    Promise.all(days.map(d => redis.smembers(`ev:active:${d}`))),
    Promise.all(days.map(d => redis.zcard(`lb:${d}`))),
    redis.zrange<(string | number)[]>(`lb:${today}`, 0, -1, { withScores: true }),
    redis.hgetall<Record<string, string | number>>("ev:totals"),
    redis.zcard(`lb:week:${isoWeek(today)}`),
    redis.zcard("lb:alltime"),
  ]);

  const sumDays = (arr: (string | number | null)[]) => arr.reduce<number>((a, v) => a + num(v), 0);
  const funnel = {
    plays: sumDays(counts[0]), completes: sumDays(counts[1]), shares: sumDays(counts[2]),
    signins: sumDays(counts[3]), submits: sumDays(counts[4]),
  };
  const rates = {
    completion: pct(funnel.completes, funnel.plays),
    shareRate: pct(funnel.shares, funnel.completes),
    capture: pct(funnel.signins, funnel.completes),
  };

  const active = activeSets as string[][];
  const dauByDay = active.map(s => s.length);
  let baseSum = 0, retSum = 0, base7 = 0, ret7 = 0;
  for (let i = 0; i + 1 < active.length; i++) { baseSum += active[i].length; retSum += intersectCount(active[i], active[i + 1]); }
  for (let i = 0; i + 7 < active.length; i++) { base7 += active[i].length; ret7 += intersectCount(active[i], active[i + 7]); }
  const d1 = pct(retSum, baseSum);
  const d7 = days.length >= 8 ? pct(ret7, base7) : null;

  const modeSplit: Record<string, number> = {};
  for (const h of modeHashes) if (h) for (const [k, v] of Object.entries(h)) modeSplit[k] = (modeSplit[k] ?? 0) + num(v);

  const wins: number[] = [];
  for (let i = 1; i < todayZ.length; i += 2) wins.push(decodeWins(num(todayZ[i])));

  const boardByDay = (boardCards as number[]).map(num);
  return {
    days, funnel, rates, dauByDay, d1, d7, modeSplit, boardByDay,
    boards: { daily: boardByDay[boardByDay.length - 1] ?? 0, weekly: num(weekCard), alltime: num(allCard) },
    winBuckets: bucketWins(wins),
    totals: Object.fromEntries(Object.entries(totalsHash ?? {}).map(([k, v]) => [k, num(v)])),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd web && npx tsx lib/metrics.test.ts`
Expected: `ALL METRICS CHECKS PASSED`, exit 0.

- [ ] **Step 5: Commit**

```bash
git add web/lib/metrics.ts web/lib/metrics.test.ts
git commit -m "feat(analytics): metrics.ts — funnel + exact-set retention derivation"
```

---

## Task 8: Admin page + robots disallow

**Files:**
- Create: `web/app/admin/page.tsx`
- Modify: `web/app/robots.ts`

Server component. Gate on `getSession().uid ∈ ADMIN_UIDS` → `notFound()` (404, no existence leak). `noindex` via `metadata` export. Self-disables if Redis is off. Near-zero client JS — static HTML with Tailwind utility classes + unicode sparklines.

- [ ] **Step 1: Add the admin disallow to robots.ts**

In `web/app/robots.ts`, find:

```ts
    rules: { userAgent: "*", allow: "/" },
```

Replace with:

```ts
    rules: { userAgent: "*", allow: "/", disallow: "/admin" },
```

- [ ] **Step 2: Write the admin page**

Create `web/app/admin/page.tsx`:

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { redis, isRedisEnabled } from "@/lib/redis";
import { getSession } from "@/lib/authServer";
import { getMetrics, sparkline, type Metrics } from "@/lib/metrics";

export const metadata: Metadata = { title: "82-0 · admin", robots: { index: false } };

const ADMIN_UIDS = (process.env.ADMIN_UIDS ?? "").split(",").map(s => s.trim()).filter(Boolean);
const fmtPct = (x: number) => `${(x * 100).toFixed(1)}%`;

function Bar({ label, value, max }: { label: string; value: number; max: number }) {
  const w = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="w-24 shrink-0 text-zinc-400">{label}</span>
      <span className="h-3 rounded bg-emerald-500" style={{ width: `${w}%`, minWidth: value > 0 ? 2 : 0 }} />
      <span className="tabular-nums text-zinc-300">{value}</span>
    </div>
  );
}

function Funnel({ m }: { m: Metrics }) {
  const rows = [
    { label: "Plays", value: m.funnel.plays, rate: "" },
    { label: "Completed", value: m.funnel.completes, rate: fmtPct(m.rates.completion) + " of plays" },
    { label: "Shared", value: m.funnel.shares, rate: fmtPct(m.rates.shareRate) + " of completes" },
    { label: "Signed in", value: m.funnel.signins, rate: fmtPct(m.rates.capture) + " of completes" },
  ];
  const max = Math.max(m.funnel.plays, 1);
  return (
    <section className="space-y-2">
      <h2 className="text-lg font-semibold">Funnel · last {m.days.length}d</h2>
      {rows.map(r => (
        <div key={r.label} className="flex items-center gap-3">
          <div className="grow"><Bar label={r.label} value={r.value} max={max} /></div>
          <span className="w-40 shrink-0 text-right text-xs text-zinc-500">{r.rate}</span>
        </div>
      ))}
    </section>
  );
}

export default async function AdminPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const session = await getSession();
  if (!session || !ADMIN_UIDS.includes(session.uid)) notFound();

  if (!isRedisEnabled()) {
    return <main className="mx-auto max-w-2xl p-8 text-zinc-300">Metrics offline — Redis is not configured.</main>;
  }

  const { days } = await searchParams;
  const n = Math.min(60, Math.max(2, Number(days) || 14));
  const m = await getMetrics(redis, { days: n });

  const modeMax = Math.max(...Object.values(m.modeSplit), 1);
  const winMax = Math.max(...m.winBuckets.map(b => b.count), 1);

  return (
    <main className="mx-auto max-w-2xl space-y-8 p-6 text-zinc-100">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">82-0 metrics</h1>
        <span className="text-xs text-zinc-500">window: {m.days[0]} → {m.days[m.days.length - 1]}</span>
      </header>

      <Funnel m={m} />

      <section className="space-y-1">
        <h2 className="text-lg font-semibold">Retention</h2>
        <p className="text-sm text-zinc-300">Next-day return (D1): <span className="font-semibold text-emerald-400">{fmtPct(m.d1)}</span>{m.d7 !== null && <> · 7-day (D7): <span className="font-semibold text-emerald-400">{fmtPct(m.d7)}</span></>}</p>
        <p className="font-mono text-xl leading-none text-emerald-400" title="DAU per day">{sparkline(m.dauByDay)}</p>
        <p className="text-xs text-zinc-500">DAU {m.dauByDay[0]} → {m.dauByDay[m.dauByDay.length - 1]} (max {Math.max(...m.dauByDay, 0)})</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Mode split (plays)</h2>
        {["daily", "classic", "hoopiq", "challenge"].map(k => <Bar key={k} label={k} value={m.modeSplit[k] ?? 0} max={modeMax} />)}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold">Leaderboard</h2>
        <p className="text-sm text-zinc-300">Daily <b>{m.boards.daily}</b> · Weekly <b>{m.boards.weekly}</b> · All-time <b>{m.boards.alltime}</b></p>
        <p className="font-mono text-xl leading-none text-sky-400" title="Daily board size per day">{sparkline(m.boardByDay)}</p>
        <h3 className="pt-2 text-sm font-semibold text-zinc-400">Today&apos;s win distribution</h3>
        {m.winBuckets.map(b => <Bar key={b.label} label={b.label} value={b.count} max={winMax} />)}
      </section>

      <section className="text-xs text-zinc-500">
        All-time events — {["play", "complete", "share", "signin", "submit"].map(k => `${k}: ${m.totals[k] ?? 0}`).join(" · ")}
      </section>
    </main>
  );
}
```

- [ ] **Step 3: Lint + typecheck the new page and robots**

Run: `cd web && npx eslint app/admin/page.tsx app/robots.ts`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add web/app/admin/page.tsx web/app/robots.ts
git commit -m "feat(analytics): admin dashboard page + /admin robots disallow"
```

---

## Task 9: Full build + lint + all tests green

**Files:** none (verification only).

- [ ] **Step 1: Run every new unit test**

Run:
```bash
cd web && npx tsx lib/day.test.ts && npx tsx lib/ev.test.ts && npx tsx lib/evServer.test.ts && npx tsx lib/metrics.test.ts
```
Expected: every file prints `ALL … PASSED` and exits 0.

- [ ] **Step 2: Re-run the pre-existing suites that touch shared code (no regressions)**

Run:
```bash
cd web && npx tsx lib/score.test.ts && npx tsx lib/isoweek.test.ts && npx tsx lib/dailyVerify.test.ts && npx tsx lib/auth.test.ts
```
Expected: all pass (these are unmodified; this confirms imports/types still resolve).

- [ ] **Step 3: Lint the whole project**

Run: `cd web && npm run lint`
Expected: no errors. (Pre-existing `@typescript-eslint/no-explicit-any` warnings live only in untracked `scripts/*` — those are not committed and not linted here.)

- [ ] **Step 4: Production build**

Run: `cd web && npm run build`
Expected: build succeeds; `/admin` and `/api/ev` appear in the route manifest (`/admin` as a dynamic route, `/api/ev` as a Node function). No type errors.

- [ ] **Step 5: Commit (only if Steps 1–4 required any fixes)**

```bash
git add -- web/lib web/app web/components
git commit -m "fix(analytics): resolve build/lint findings"
```
(If nothing changed, skip. Never `git add -A` — keep `web/scripts/*` untracked.)

---

## Task 10: Untracked prod E2E smoke script (NOT committed)

**Files:**
- Create: `web/scripts/analytics_e2e.ts` (untracked — never `git add` it)

A throwaway harness to smoke the beacon + admin render on prod. Primary verification is still the manual flow in Task 11; this is an optional headless check. It mints an admin session locally (needs the prod `AUTH_SECRET`, supplied by the user — remind them to rotate after) and confirms `/admin` renders without 404 and reflects beacon traffic.

- [ ] **Step 1: Write the script**

Create `web/scripts/analytics_e2e.ts`:

```ts
// Untracked dev harness. Smoke-tests /api/ev + /admin on a deployment.
// Usage: AUTH_SECRET=<prod secret> ADMIN_UID=<a uid in ADMIN_UIDS> npx tsx scripts/analytics_e2e.ts https://82-0-pink.vercel.app
// NOTE: this adds a few real "play"/"share" counts to today's metrics (self-expire in 45d). It is real test traffic, not isolated.
import { signSession } from "../lib/auth";

const BASE = process.argv[2] ?? "http://localhost:3000";
const ADMIN_UID = process.env.ADMIN_UID;
let fail = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("FAIL:", m); fail++; } else console.log("ok:", m); };

async function main() {
  // 1. beacon accepts valid + ignores garbage, always 204
  const uid = "e2e-" + Math.random().toString(36).slice(2).padEnd(8, "0");
  for (const body of [{ ev: "play", uid, mode: "daily" }, { ev: "share", uid }, { ev: "nonsense" }, "garbage"]) {
    const r = await fetch(`${BASE}/api/ev`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    assert(r.status === 204, `POST /api/ev (${JSON.stringify(body).slice(0, 24)}) → 204`);
  }

  // 2. /admin is gated: no cookie → not 200 (404)
  const anon = await fetch(`${BASE}/admin`, { redirect: "manual" });
  assert(anon.status === 404, "/admin without session → 404");

  // 3. /admin with an admin session → 200 and contains the dashboard heading
  if (process.env.AUTH_SECRET && ADMIN_UID) {
    const tok = await signSession({ uid: ADMIN_UID, name: "e2e" });
    const ok = await fetch(`${BASE}/admin`, { headers: { cookie: `82-0_sess=${tok}` } });
    const html = await ok.text();
    assert(ok.status === 200, "/admin with admin session → 200");
    assert(html.includes("82-0 metrics"), "/admin renders the dashboard");
  } else {
    console.log("skip: set AUTH_SECRET + ADMIN_UID to test the authed /admin render");
  }

  console.log(fail ? `\n${fail} FAILED` : "\nALL ANALYTICS E2E CHECKS PASSED");
  process.exit(fail ? 1 : 0);
}
main();
```

- [ ] **Step 2: (Optional) run against prod after deploy**

Run (only after the PR is merged + deployed, with creds the user pastes):
```bash
cd web && AUTH_SECRET=<prod AUTH_SECRET> ADMIN_UID=<your g-uid> npx tsx scripts/analytics_e2e.ts https://82-0-pink.vercel.app
```
Expected: `ALL ANALYTICS E2E CHECKS PASSED`. Remind the user to rotate `AUTH_SECRET`/Upstash token after any chat paste.

- [ ] **Step 3: Confirm it is NOT staged**

Run: `cd .. && git status --porcelain web/scripts/analytics_e2e.ts`
Expected: shows `??` (untracked). Never add it.

---

## Task 11: PR, merge, env, prod verification

**Files:** none (process).

- [ ] **Step 1: Push the branch and open the PR**

```bash
git push -u origin feat/analytics-dashboard
gh pr create --base main --title "feat: analytics insights dashboard (viral-loop funnel + retention)" --body "<summary: owned ev:* counters + /api/ev beacon + /admin funnel/retention; engine/gameplay/leaderboard/auth untouched; ADMIN_UIDS env required>"
```
Confirm `git diff --stat origin/main...HEAD` lists ONLY the intended files (no `web/scripts/*`).

- [ ] **Step 2: Code review**

Run the project's review flow (`/code-review` or the multi-agent review used on PRs #9–#11). Address findings, re-run Task 9 verification, push.

- [ ] **Step 3: Set the `ADMIN_UIDS` env in Vercel (Production)**

The admin uid = your signed-in `uid`. Get it on prod: sign in, then open `https://82-0-pink.vercel.app/api/auth/me` → copy `uid` (a 32-char `g…` string). Add `ADMIN_UIDS=<that uid>` to the Vercel project (Production scope). Enter it bracket-free (per the env-file gotcha — the phone wraps URLs/values in `<>`; this value has none, but double-check no stray brackets). Comma-separate if adding more admins.

- [ ] **Step 4: Merge**

Merge the PR to main (squash/merge per repo convention). Main auto-deploys to prod (~6s + build).

- [ ] **Step 5: Verify on PROD (authoritative — Vercel previews are 401-gated)**

1. Load `https://82-0-pink.vercel.app/admin` while NOT signed in → expect 404.
2. Sign in (Google One Tap), then play a game to completion, share the result, and submit to the daily board.
3. Load `/admin` → confirm: the funnel shows your play/complete/share/signin moved for today; the daily board count incremented; retention/DAU sparkline renders. (Numbers are small but non-zero.)
4. Confirm `https://82-0-pink.vercel.app/robots.txt` includes `Disallow: /admin`.
5. Sanity: normal gameplay, auth, and leaderboard submit all still work (the bumps are post-response and must not have changed any behavior).

- [ ] **Step 6: Update memory**

Append a "Shipped (PR #N …)" entry to `820-product-state.md` (mark roadmap #5 done) noting: the `ev:*` key schema, `after()`-based counting, the `/admin` gate via `ADMIN_UIDS`, and the manual prod-verify result.

---

## Self-review (completed by plan author)

**Spec coverage:** §1 goal → Tasks 7–8 (funnel + retention lead the page). §2 locked decisions: Upstash+owned counters → Tasks 3/7; hybrid instrumentation → Tasks 4–6; Vercel track kept → Task 6 (added beside, never removed); Google-sub allowlist → Task 8; exact-set retention → Task 7 (smembers+JS, the spec's stated fallback); self-disable → Task 8 Step 2 + getMetrics null-guard. §3 instrumentation points → Task 5 (verified call sites). §5 key schema → Task 3 (`bump`) — all keys (`ev:play|complete|share|signin|submit:<date>`, `ev:mode:<date>`, `ev:active:<date>`, `ev:totals`) covered with EV_TTL/no-TTL. §6 derived metrics → Task 7. §7 surfaces → all tasks; robots disallow → Task 8. §8 access/privacy → Task 8 (notFound, aggregates only) + Task 4 (204, no data). §9 testing → Tasks 1–3,7,9,10. §10 non-goals respected (no charts lib, no drill-down, no cohort beyond D1/D7, track() untouched). §11 risks → `after()` (no latency) + internal try/catch (Task 3) + beacon-inflation accepted.

**Placeholder scan:** none — every code/test step contains full source; the only `<…>` are in the PR body and env value (genuine user-supplied runtime values), explicitly flagged.

**Type consistency:** `bump(redis, stage, opts)`, `parseEvBody`, `EV_TTL`, `BeaconBody`, `EvStage` consistent across Tasks 3/4. `getMetrics(redis, {days,now})`, `Metrics`, `pct`, `intersectCount`, `bucketWins`, `sparkline` consistent across Tasks 7/8. `ev(name, props)` / `EvName` consistent across Tasks 2/6. `dayUTC`/`recentDays` consistent across Tasks 1/3/7. Stage `"share"` used uniformly for both share and share_rank beacons (Task 6) and matches `parseEvBody`'s allowlist (Task 3).
