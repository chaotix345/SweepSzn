# 82-0 Async H2H / Challenge — Design Spec

**Date:** 2026-06-08 · **Branch:** `feat/h2h-challenge` · **Effort:** L, has backend (Upstash)

## Goal

Let a player **challenge a friend to beat their lineup via a shareable link**. The friend
plays asynchronously, then sees a head-to-head verdict ("You won 80-2 vs 78-4"). This is
roadmap item #2 (the next growth loop after viral-share + Daily leaderboard + landing).

The viral mechanic is **asymmetric recruitment**: a creator mints one link and broadcasts it
(group chat, social); each responder who plays is shown a "create your own" CTA, continuing
the loop.

## The core insight (why this is cheap to build)

The spin engine is seeded by an **arbitrary string** — `spin(seed, round, opts)` /
`spinPool(...)` take any seed; there is no date coupling inside them (`web/lib/data.ts`,
`web/app/api/spin/route.ts:6` defaults to `"classic"`). The Daily game is just *"everyone
shares the seed `daily-<date>`"*. Classic/HoopIQ already use random per-session seeds
(`${m}-${rand()}`, `Game.tsx:63`).

**So a challenge is a private Daily between friends sharing a custom seed `h2h-<id>`.** Both
the creator and every responder draft from the **identical sequence of team/era spins** — a
fair contest of judgment (who builds the better five from the same opportunities), not luck.
This lets us reuse, with minimal change:

- **Anti-cheat replay** `verifyDaily` → generalized to `verifyTrace(seed, trace, deps)`.
- **Upstash sorted-set + hash persistence** (`leaderboard.ts` pattern) → per-challenge board.
- **`/r/<lineup>` server reconstruction + dynamic OG card** → `/c/<id>` landing + challenge OG.
- **`LineupResult`** from the engine → a tiny `compareResults(a, b)`.
- **Client identity + trace recording** (`getUid`, `traceRef`) → add `"challenge"` to `Mode`.

## Product decisions (confirmed with the user)

1. **Reveal model — record only, lineup hidden until submit.** The responder sees the *bar*
   (e.g. "78-4 · A+") as the hook, drafts blind, then both fives reveal side-by-side with the
   verdict. Clean target, no copying, a real payoff moment. Enforced server-side: **public
   reads are redacted (no lineups); lineups are exposed only to someone who has themselves
   submitted.**
2. **Scope — creator + many responders + a mini challenge board.** One link anyone can play;
   everyone who attempts is ranked on a small per-challenge board, with "you vs the creator"
   as the headline verdict. Reuses the leaderboard read path. The creator's score is the
   stable bar; a responder who wants to set their own bar creates a **new** challenge.
3. **Entry points — ModeSelect card + result-screen CTA.** A "Challenge a Friend" card on the
   home mode picker, plus a "Challenge a friend to beat this" button on Classic/Daily result
   screens (which launches a fresh challenge game).

Additional defaults (not separately asked, chosen for clarity / scope):
- **Challenge plays do NOT count toward the daily streak** (keeps Daily fair/clean; no
  `recordDailyDone` call in the challenge flow).
- **Challenge id is client-minted** (`[a-z0-9]{8}`), creator = **first submitter** (write-once
  creator via Redis `set …{nx:true}`). A reused/guessed id just makes you a responder on that
  board — harmless. 36^8 ≈ 2.8e12 keyspace → negligible collision.
- **One challenge id = one creator/bar.** No king-of-the-hill re-share semantics in v1.

## Architecture

### New modules (small, focused, independently testable)

- **`web/lib/redis.ts`** *(new, server-only)* — extract the null-guarded Upstash singleton
  that `leaderboard.ts` currently inlines, so a second consumer doesn't duplicate it:
  - `redis` (the `Redis | null` singleton; env resolution `UPSTASH_REDIS_REST_URL ??
    KV_REST_API_URL`, same for token).
  - `isRedisEnabled(): boolean`.
  - `encScore(wins, net): number` = `wins * 1000 + (net + 100)` (the existing leaderboard
    score packing).
  - `readSortedRows(keyZ, keyH, start, stop): Promise<StoredRow[]>` — the `zrange(rev,
    withScores)` → `hmget` → merge-with-rank helper, parameterized by key (today it's inlined
    in `leaderboard.ts` as `readRows`).
  - `TTL = 60*60*24*31`.
  - `leaderboard.ts` is refactored to import these (behavior unchanged; the daily leaderboard
    must remain byte-identical).

- **`web/lib/challenge.ts`** *(new, pure — no server-only imports, unit-testable)*:
  - `newChallengeId(): string` → 8 chars of `[a-z0-9]`, comma-free (URL/seed safe), cannot
    collide with the `daily-…` seed format.
  - `challengeSeed(id: string): string` → `"h2h-" + id`.
  - `compareResults(a: LineupResult, b: LineupResult): { winner: "a" | "b" | "tie";
    winsMargin: number; netMargin: number }` — winner by `wins`, tiebreak `netRtg`, else tie.
  - Challenge wire types (`ChallengePublic`, `ChallengeStoredRow`, `ChallengeSubmitResponse`,
    `ChallengeVerdict`) — or co-located in `web/lib/types.ts` to match the existing
    `LeaderboardRow`/`LeaderboardView` convention. (Types live in `types.ts`; logic in
    `challenge.ts`.)

- **`web/lib/challengeStore.ts`** *(new, server-only)* — mirrors `leaderboard.ts`, keyed by
  challenge id instead of date:
  - Keys: `chal:<id>` (sorted set, ranking), `chal:<id>:meta` (hash, per-uid payload),
    `chal:<id>:info` (the creator bar). 31-day TTL refreshed on each write.
  - `isChallengeEnabled(): boolean` (= `isRedisEnabled()`).
  - `getChallengePublic(id): Promise<ChallengePublic | null>` — **redacted**: creator name +
    wins/losses/net + grade + total attempts + best-responder summary. **No lineups.**
  - `submitChallenge(id, row: ChallengeStoredRow, result: LineupResult):
    Promise<ChallengeSubmitResponse | null>` —
    1. read `chal:<id>:info`.
    2. if absent → caller is **creator**: write `info` (`set nx`), add to board, set TTL.
    3. if present → caller is **responder**: keep-best add to board, set TTL.
    4. build verdict via `compareResults(responderResult, creatorResult)` (responder only).
    5. return `{ role, creator: {name, result, lineup}, you: {result, lineup}, verdict?,
       board }` — board rows here **include** lineups (the caller has earned the reveal).

- **`web/lib/dailyVerify.ts`** *(refactor)* — extract the seed-agnostic core:
  - `verifyTrace(seed: string, trace: DraftStep[], deps: VerifyDeps): VerifyResult` — the
    current body, with `seed` injected instead of `"daily-" + date`.
  - `verifyDaily(date, trace, deps)` becomes a one-line wrapper:
    `verifyTrace("daily-" + date, trace, deps)`.
  - The existing `dailyVerify.test.ts` keeps passing unchanged (it calls `verifyDaily`).

### API

- **`POST /api/challenge/submit/route.ts`** *(new, Node runtime — mirrors `daily/submit`)*:
  - Body `{ id: string, uid: string, name?: string, trace: DraftStep[] }`.
  - `503` if `!isChallengeEnabled()`.
  - `400` on: bad `id` (`/^[a-z0-9]{6,16}$/`), bad `uid` (`/^[a-z0-9-]{8,64}$/i`), or
    `verifyTrace("h2h-" + id, trace, deps)` → `ok:false` (tampered/off-pool/etc).
  - Else `submitChallenge(...)` → `200` `ChallengeSubmitResponse`.
  - Same JSON-parse safety (`req.json().catch(() => ({}))`), `cleanName`, and module-scope
    `deps = { spinPool, getPlayer, evaluate }` as `daily/submit`.
  - No date/`todayUTC()` check — challenges are not time-bound.

- **No GET route.** The landing page is a server component that calls `getChallengePublic`
  directly; the responder gets the board (with reveal) in the submit response.

### Pages / OG

- **`web/app/c/[id]/page.tsx`** *(new, server component, `robots: { index: false }`)* —
  mirrors `/r/[lineup]/page.tsx` conventions (Next 16: `params` is a Promise — copy the
  existing pattern exactly):
  - `getChallengePublic(id)` (redacted). If `null` (disabled or not found) → friendly
    "this challenge expired or doesn't exist / challenges unavailable" state + "Build your
    own five" CTA.
  - Else render: "<creator> went **78-4** (A+). Same teams, your picks. Can you beat it?" +
    attempts count + **[Accept Challenge]** → `/?c=<id>#game`. **No lineup shown.**
  - `generateMetadata` → OG image (below) + noindex.

- **`web/app/c/[id]/opengraph-image.tsx`** *(new, `runtime="nodejs"`, 1200x630)* — uses a new
  `challengeOgElement(creatorName, { wins, losses, net, grade })` added to `web/lib/og.tsx`:
  big record + grade color + "Can you beat it?" CTA + wordmark. **No player tokens** (preserves
  the hidden-lineup reveal model). Satori-safe (every node `display:flex`, `ascii()` diacritic
  strip, reuses `GRADE_HEX`). Falls back to `brandOgElement` if info missing.

### Client (`web/components/Game.tsx`)

- `type Mode = "daily" | "classic" | "hoopiq" | "challenge"`.
- New state: `challengeId: string | null`, `challengeRole: "create" | "respond" | null`.
- `start("challenge")` (create): `challengeId = newChallengeId()`, seed `h2h-<id>`,
  `challengeRole = "create"`. Everything else (roster reset, traceRef) as today.
- A small `startChallengeRespond(id)`: sets mode `"challenge"`, `challengeId = id`, seed
  `h2h-<id>`, role `"respond"`, resets roster/trace.
- **On-mount effect** (hydration-safe, like the hints lazy-init): read
  `new URLSearchParams(location.search).get("c")`; if present → `startChallengeRespond(id)`
  and strip the param. So `/c/<id>`'s Accept button (`/?c=<id>#game`) auto-enters the game.
- ModeSelect: add a 4th card **"⚔️ Challenge a Friend"** → `start("challenge")`. Demote the
  `<h1>` at `Game.tsx:309` ("82-0" brand) to a styled `<div>` so `/` has a single `<h1>`
  (the landing's "Can you go 82-0?"). *(Folds in the optional cleanup from the brief.)*
- Result gate (`Game.tsx:170`): when `mode === "challenge"`, render **`<ChallengeResult>`**
  (passing `challengeId`, `challengeRole`, `result`, `players`, `trace`) instead of
  `<Leaderboard>`. `traceRef` recording is reused unchanged.
- Classic/Daily result screens: add a **"⚔️ Challenge a friend to beat this"** button →
  `start("challenge")` (fresh challenge game). (In `ResultCard` or alongside it.)

- **`web/components/ChallengeResult.tsx`** *(new, client — analogous to `Leaderboard.tsx`)*:
  - On mount, POST `/api/challenge/submit` with `{ id, uid: getUid(), name: getName(), trace }`.
    Handle `503` (challenges unavailable) and `400` (shouldn't happen for legit play) visibly
    — unlike the daily leaderboard, a challenge must surface failure (not silently hide).
  - **Creator view** (`role === "creator"`): "Challenge created — send this to a friend." +
    your `ResultCard` + a **copyable `/c/<id>` link** + share buttons (reuse share text
    helpers). 
  - **Responder view** (`role === "responder"`): a **"You vs <creator>"** side-by-side
    (both `ResultCard`s / compact), the **verdict** ("You win! / You lost / Tie") + margin,
    the **mini board** (rank list, your row highlighted, rows link to `/r/<lineup>`), and CTAs
    "⚔️ Create your own challenge" + "Share this challenge."
  - Name entry reuses the leaderboard pattern (`getUid`/`getName`/`setName`); resubmit on
    name change is keep-best so it's safe.

## Data flow

```
CREATE
  ModeSelect "Challenge" → start("challenge") mints id, seed h2h-<id>
  → draft 5 (traceRef records) → simulate() sets result
  → ChallengeResult mounts (role=create) → POST /api/challenge/submit {id, uid, name, trace}
     → verifyTrace("h2h-"+id, trace) ok → submitChallenge writes info(NX)+board → role:"creator"
  → show copyable /c/<id>

ACCEPT
  friend opens /c/<id> (server, redacted) → OG "beat 78-4" → [Accept] → /?c=<id>#game
  → Game on-mount reads ?c → startChallengeRespond(id), seed h2h-<id>
  → draft 5 from the SAME spins → simulate() → ChallengeResult (role=respond)
     → POST submit → verifyTrace ok → submitChallenge (responder, keep-best)
     → returns creator lineup + verdict + board (reveal)
  → "You vs <creator>" verdict + board + "create your own" CTA
```

## Anti-cheat & integrity

- Server never trusts client scores. `verifyTrace` replays `h2h-<id>` spins, verifies every
  pick was on-pool + slot-eligible + non-duplicate, enforces ≤1 team / ≤1 era respin, and
  **recomputes** wins via the engine. (Identical guarantees to the Daily leaderboard.)
- **Reveal enforcement:** `getChallengePublic` is redacted (no lineups); lineups are returned
  only inside the submit response, i.e. only to a uid that has itself submitted a verified
  trace. A non-player cannot read the creator's five via any public surface.
- Keep-best per uid (re-attempts only improve your row). Write-once creator (`set nx`) means a
  reused id can't hijack an existing challenge's bar.

## Error handling / edge cases

- **Upstash absent:** every store call returns `null`; submit route returns `503`;
  `ChallengeResult` shows "Challenges need server configuration" (no silent drop); `/c/<id>`
  shows the unavailable state. Build/tsc/unit tests pass without creds.
- **Challenge not found / expired:** `/c/<id>` shows expired/not-found + "build your own".
- **Creator opens own link:** sees the bar + board summary; Accepting replays as a responder
  row (harmless). `you`-row highlighting in the board covers self-identification.
- **Network hiccup on submit:** retry affordance (mirror the existing spin/submit retry copy).
- **Same person via different team stints:** person-id dedup in the replay already blocks it.

## Testing

- **Unit (`cd web && npx tsx <file>`):**
  - `lib/dailyVerify.test.ts` — must stay green after the `verifyTrace` extraction.
  - `lib/challenge.test.ts` *(new)* — `compareResults` (a>b, b>a, exact tie, wins-tie→netRtg
    tiebreak), `newChallengeId` (length/charset/uniqueness across many calls), `challengeSeed`.
  - A `verifyTrace` challenge-seed case (a legal `h2h-<id>` trace verifies; a tampered
    off-pool pick fails) — added to the verify test.
- `cd web && npx tsc --noEmit`, lint, `npm run build` all green.
- **Post-merge E2E on prod** (previews are 401-gated): create a challenge → copy `/c/<id>` →
  open in a fresh/incognito session → Accept → draft → confirm "You vs creator" verdict +
  board + reveal; submit a tampered trace → `400`; confirm `/c/<id>` OG card unfurls.

## Setup required from the user

Add to `web/.env.local` (create it) so the live flow can be tested locally:

```
UPSTASH_REDIS_REST_URL=...
UPSTASH_REDIS_REST_TOKEN=...
```

or `cd web && vercel env pull .env.local` against the `82-0` project. The feature
self-disables to `503` without them — only the live submit/board/OG-with-data flow needs them.

## Files

**New:** `web/lib/redis.ts`, `web/lib/challenge.ts`, `web/lib/challenge.test.ts`,
`web/lib/challengeStore.ts`, `web/app/api/challenge/submit/route.ts`,
`web/app/c/[id]/page.tsx`, `web/app/c/[id]/opengraph-image.tsx`,
`web/components/ChallengeResult.tsx`.

**Changed:** `web/lib/dailyVerify.ts` (extract `verifyTrace`), `web/lib/leaderboard.ts`
(import shared `redis.ts`), `web/lib/types.ts` (challenge types), `web/lib/og.tsx`
(`challengeOgElement`), `web/components/Game.tsx` (`"challenge"` mode + `?c=` handoff +
ModeSelect card + result CTA + single-`<h1>` cleanup), possibly `web/components/ResultCard.tsx`
(the "challenge a friend" CTA + `mode==="challenge"` share text).

## Out of scope (v1)

Real auth / persistent identity (anonymous uid as today); king-of-the-hill re-share semantics;
direct 1v1 invites tied to accounts; notifications when a friend responds; expiry tuning beyond
the 31-day TTL.
```
