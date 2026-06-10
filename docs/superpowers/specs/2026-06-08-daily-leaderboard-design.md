> **HISTORICAL (frozen 2026-06):** decision-record only — conventions here may be superseded. Current: tests are Vitest via `npm test`; see `web/AGENTS.md`.

# Daily Leaderboard + Streaks — Design

- **Date:** 2026-06-08
- **Status:** Approved (design); pending implementation plan
- **Branch:** `feat/daily-leaderboard`
- **Depends on:** viral share loop (PR #4, shipped) — leaderboard rows link to `/r/<lineup>` share pages.

## Goal

Turn **Daily** mode into a real daily competition. Daily already gives every user the same deterministic per-day spins (shared UTC-date seed), so all Daily results are directly comparable: the contest is "who drafted the best team from today's identical pools." Add a persistent leaderboard + personal streaks so the share cards have a live destination and players have a reason to return every day.

## Decisions (locked with product owner)

| Decision | Choice |
|---|---|
| Identity | **Anonymous + display name** — random `uid` in localStorage (no login) + a user-typed display name. |
| Store | **Upstash Redis** via the Vercel Marketplace (`@upstash/redis`). |
| Ranking | **Wins, then Net rating tiebreak.** |
| Anti-cheat | **Strict** — server recomputes the score from IDs *and* verifies every pick was legal for today's spins (draft-trace replay). |
| Streaks | **Client-side only** (localStorage) for v1. |

## Non-goals (v1)

Real auth/accounts; all-time/weekly/friend boards; server-side streak sync; H2H/Challenge. Classic & HoopIQ use per-user random seeds, so they are intentionally **not** ranked. These are explicitly deferred, not forgotten.

## Architecture

All additive. **No changes to the engine or to Classic/HoopIQ.** New surface:

- `POST /api/daily/submit` — validates + verifies a Daily run, writes the score, returns the board.
- `GET  /api/daily/leaderboard?date=<YYYY-M-D>` — returns top N + (optionally) the caller's row.
- `@upstash/redis` client reading `UPSTASH_REDIS_REST_URL` / `UPSTASH_REDIS_REST_TOKEN` (injected by the Vercel Upstash integration).
- Client: `uid` + display name in localStorage; trace recording during the Daily draft; a submit affordance + leaderboard view + streak nudge in the result UI.

### Identity
- `82-0:uid` — a random UUID written once (anonymous). Identifies a participant for dedup + "your rank."
- `82-0:name` — the display name the user typed (remembered for next time). Unverified by design.

## Data model (Redis)

Date key = `d = YYYY-M-D` (UTC), matching `todaySeed()` in `Game.tsx`.

- `lb:<d>` — **ZSET**. member = `uid`, score = `wins * 1000 + (netRtg + 100)`.
  - `wins` ∈ [0,82]; `netRtg + 100` ∈ ~(50,150) ≪ 1000, so **wins dominates and net breaks ties**. Redis scores are doubles, so the 1-decimal net is preserved exactly enough.
  - `ZREVRANGE lb:<d> 0 N-1 WITHSCORES` → top N; `ZREVRANK lb:<d> <uid>` → caller's rank; `ZCARD` → total entries.
- `lb:<d>:meta` — **HASH**. field = `uid`, value = JSON `{ name, wins, losses, net, lineup }` where `lineup` = the 5 ids in slot order (PG..C) for the `/r/<lineup>` link.
- **TTL:** both keys `EXPIRE` ~30 days on each write (self-cleaning; no cron needed).
- **One entry per uid per day**, keep-best: on submit, only overwrite if the new score is higher (`ZSCORE` compare, or `ZADD GT`).

## API contracts

### `POST /api/daily/submit`
Request:
```ts
{
  date: string;               // YYYY-M-D (must equal server's current UTC date)
  uid: string;                // localStorage uuid
  name: string;               // display name (trimmed, length-capped, sanitized)
  trace: DraftStep[];         // exactly 5, in DRAFT ORDER (index = round)
}
type DraftStep = {
  slot: "PG"|"SG"|"SF"|"PF"|"C";
  pickedId: string;           // player id drafted that round
  respins: ("team"|"era")[];  // re-spins used that round, in order (0..2 entries)
};
```
Response (same shape as leaderboard GET, so the client renders the board immediately):
```ts
{ date, total, you: Row, top: Row[] }
type Row = { rank: number; uid: string; name: string; wins: number; losses: number; net: number; lineup: string };
```
Errors: `400` (bad shape / wrong date / verification failed), `200` with the board on success.

### `GET /api/daily/leaderboard?date=<d>&uid=<uid?>`
Returns `{ date, total, top: Row[], you?: Row }`. `uid` optional (to include the caller's row + rank even if outside top N).

## Anti-cheat: draft-trace replay

The result is **deterministic from the 5 player IDs**, and each round's pool is deterministic from `(seed, round, exclude, respin locks/salt)`. The client submits the draft trace; the server replays it through the real `spin()` and recomputes the score. Nothing client-claimed (wins/net) is trusted.

**Replay algorithm** (`POST /api/daily/submit`):
```
reject if date !== current UTC date            // no back/forward-dating
reject if trace.length !== 5
seed = `daily-${date}`
exclude = []; usedSlots = {}; totalRespins = 0; teamRespins = 0; eraRespins = 0
for round r in 0..4 (trace order):
  step = trace[r]
  current = spin(seed, r, { exclude })          // base spin (salt 0)
  for respin in step.respins:                   // chained re-spins on this round
    salt = ++totalRespins                        // global sequential salt (matches client saltRef)
    if respin == "team":
      teamRespins++
      current = spin(seed, r, { exclude, lockedDecade: current.decade, excludeTeam: current.team, salt })
    else:
      eraRespins++
      current = spin(seed, r, { exclude, lockedTeam: current.team, excludeDecade: current.decade, salt })
  assert teamRespins <= 1 and eraRespins <= 1    // one of each per game, max
  assert step.pickedId ∈ current.candidate ids
  player = byId(step.pickedId); assert player exists
  assert step.slot ∈ eligibleOf(player) and step.slot not in usedSlots
  usedSlots.add(step.slot); exclude.push(step.pickedId)
players = the 5, reordered to slot order PG,SG,SF,PF,C
assert 5 unique person_ids
result = evaluateLineup(players, getCoefficients())   // authoritative wins/net
lineup = players.map(p => p.id).join(",")             // for the /r link
ZADD GT lb:<date> score(result) uid ; HSET lb:<date>:meta uid {...} ; EXPIRE both
```

**Why this is exact:** `Game.tsx` already uses a global sequential re-spin salt (`saltRef.current`: 1 for the first re-spin, 2 for the second). The server's `++totalRespins` reproduces the same sequence as long as the trace preserves order — so **no salt change is needed; the client only needs to *record* the trace.**

**Performance:** `spin()` also computes draft "fit" (`computeFits`), which verification doesn't need. Add an internal pool-only helper (or a `skipFits` flag) so a submit replays in a few cheap `spin` calls.

## Client changes

1. **Trace recording (`Game.tsx`):** accumulate a `trace: DraftStep[]` as the user drafts — push `{ slot, pickedId, respins }` on each `place()`, tracking re-spins used in the current round. Reset on `start()`. (No salt logic change.)
2. **Result UI (Daily only):** after a Daily lineup resolves, ResultCard shows a "🏆 Submit to today's leaderboard" control → name prompt (prefilled from `82-0:name`) → `POST /api/daily/submit` → render the board with the caller's row highlighted + rank/percentile. Gate behind `mode === "daily"`.
3. **Leaderboard view:** top 100 rows; each row = rank · name · `W–L` · net · 5 player initials, linking to that lineup's `/r/<lineup>` share page. Caller's row pinned/highlighted.
4. **Streaks (localStorage):** `82-0:daily:history` = list of completed UTC dates (or `{lastDate, count}`); current streak = consecutive days. Show "🔥 N-day streak — play tomorrow to keep it" + a countdown to next UTC midnight on the Daily result.
5. **One-play-per-day nudge (soft):** record `82-0:daily:done:<d>` so a returning user sees their submitted result/board instead of a blank draft. (Not a hard lock — replays just can't beat their kept-best score server-side.)

## Validation & limits
- `name`: trim, cap length (~24 chars), strip control chars; render as text only (React-escaped; OG/image not involved here). Empty → fall back to "Anonymous".
- `date` must equal the server's current UTC date.
- `uid`: validate UUID shape; one kept-best entry per uid/day.
- Rate limiting: rely on keep-best + per-day dedup for v1; revisit if abuse appears.

## Testing
- Unit: replay verifier — happy path; tampered score (claims 82-0) rejected; off-pool player rejected; illegal slot rejected; >1 team or >1 era re-spin rejected; stale/future date rejected; chained re-spins on one round accepted.
- Unit: score encoding monotonicity (more wins always outranks; net breaks ties).
- Integration: submit → leaderboard round-trip against a Redis test double / Upstash.
- Manual: full Daily play → submit → board shows your row + rank; row links to `/r/<lineup>`; streak increments across days (mock date).

## What the product owner provisions
Create an **Upstash Redis** store via Vercel → Storage → Marketplace and connect it to the `82-0` project (auto-injects `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`). The code reads those env vars; locally, put them in `web/.env.local`.

## Risks / open items
- **Token reset gaming:** a user can clear `uid` to submit multiple identities. Acceptable for an anonymous v1 (kept-best per token still bounds spam); real auth is the later fix.
- **Name moderation:** unverified display names are a small abuse surface; length cap + text-only rendering for v1, add a blocklist/report later if needed.
- **Next 16 specifics:** `web/AGENTS.md` warns this Next differs from training — read `node_modules/next/dist/docs` for route-handler + runtime conventions (route handlers default to Node runtime, which we need for `@upstash/redis` + `lib/data` fs access).
