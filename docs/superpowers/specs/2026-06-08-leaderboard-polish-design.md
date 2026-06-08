# Leaderboard Polish — Design Spec

Date: 2026-06-08
Status: approved direction, pending spec review
Roadmap item: #4 (leaderboard polish)

## 1. Goal & context

Today the leaderboard is **Daily-only** and identity is **anonymous** — a token-resettable
`uid` + free-text name (`web/lib/streak.ts`). Scores themselves are already un-fakeable
(server-side draft-trace replay in `web/lib/dailyVerify.ts`), so the gap is **identity** and
**board depth**:

- **(a) Real auth** so a rank belongs to a person (matters most for the permanent all-time board).
- **(b) Weekly + all-time boards**, not just per-day.
- **(c) Share-your-rank**, a shareable rank card mirroring the PR #4 share infra.

The funnel is frictionless anonymous play and must stay that way — auth is **optional and
additive**, never a wall in front of the game.

## 2. Locked decisions

| Decision | Choice |
|---|---|
| Auth model | **Optional** Google sign-in. Anon play preserved. Daily accepts anon; Weekly/All-time are sign-in-only ("appear" requires auth; "view" is public). Sign-in prompted at the result ("claim your rank"). |
| Auth library | **Google Identity Services (One Tap) + `jose`** — inline prompt, public client_id only (no client secret), verify Google ID token server-side, issue our own HS256 session cookie. (Auth.js v5 considered; rejected for redirect friction + client-secret + beta.) |
| Board metrics | **Wins-based ladder.** Daily = best single result today (unchanged). Weekly = Σ daily-best wins across the ISO week. All-time = cumulative career wins. |
| Identity key | `g` + first 31 hex of `sha256("google:" + sub)` → 32-char `[a-z0-9]`, satisfies the existing `/^[a-z0-9-]{8,64}$/i` uid regex. |
| Provisioning | Full: Charlie creates a Google OAuth Client ID + sets `NEXT_PUBLIC_GOOGLE_CLIENT_ID` and `AUTH_SECRET` in Vercel + local. Auth **self-disables** when either env is absent. |
| PR decomposition | 3 sequenced PRs: **#9 auth+claim → #10 weekly/all-time → #11 share-rank.** |

## 3. Verified platform facts (Next.js 16.2.7)

Confirmed from the vendored docs (`web/node_modules/next/dist/docs/…`) and npm, not memory:

- `cookies()` from `next/headers` is **async** — `const c = await cookies()`. Cookies may be
  **set only in route handlers / server actions**, not during server-component render. Reading is
  allowed anywhere. `request.cookies.get()` on `NextRequest` is synchronous.
- Route handler `params` is a `Promise` — `const { x } = await params`.
- `middleware.ts` is **deprecated → renamed `proxy.ts`** (`export function proxy`, Node runtime
  default). **We do not need it** — boards are public to read; the submit route verifies the
  session inline (the docs themselves warn proxy auth alone is insufficient; verify in the handler).
- `next-auth@5.0.0-beta.31` peerDeps include `next: "^16.0.0"` (so Auth.js *would* work) — but we
  chose One Tap.
- `jose@6.2.3` is Web-Crypto based, works in Node + Edge; one dependency covers both Google ID-token
  verification (remote JWKS) and our HS256 session/nonce cookies.

## 4. Architecture overview

```
Browser                          Server (Next 16 route handlers, Node runtime)        Upstash Redis
───────                          ────────────────────────────────────────────        ─────────────
GIS One Tap  ──credential JWT──▶ /api/auth/google                                       (unchanged for
(public client_id + nonce)        verify w/ jose JWKS (aud, iss[], exp, nonce)           daily/challenge)
                                  derive uid = g<sha256(google:sub)[:31]>
                                  set HS256 session cookie (AUTH_SECRET)
useSession() ◀──{uid,name,pic}── /api/auth/me  (reads + verifies session cookie)
                                  /api/auth/signout (clears cookie)
                                  /api/auth/nonce (signed 5-min nonce cookie)

Result card  ──trace + session─▶ /api/daily/submit (auth-aware)                          lb:<date> (+meta)
"claim rank"                      session? → uid/name from session, propagate            lb:week:<isoweek> (+meta)
                                  to weekly/all-time via atomic Lua; cleanup anon row     lb:alltime (+meta)
Board tabs   ◀──views──────────  /api/daily/leaderboard, /api/board/weekly, /board/alltime
Share rank   ──▶ /rank/<...> (noindex page + next/og image)                              (none — snapshot in URL)
```

All new server modules follow the existing **self-disabling** convention (`isRedisEnabled()`,
new `isAuthEnabled()`): absent env → 503 / hidden UI, app keeps working.

---

## 5. PR #9 — Auth foundation + claim

### 5.1 Dependency

`npm install jose` (pin in `web/package.json`). No other new deps. (Adversarial review blocker:
jose was assumed but not installed.)

### 5.2 `web/lib/auth.ts` (server-only)

```ts
export function isAuthEnabled(): boolean {
  return !!(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID && process.env.AUTH_SECRET);
}
```

- **Identity:** `authedUid(sub) = "g" + sha256("google:" + sub).hex.slice(0,31)` (Node `crypto`).
  32 chars, `[a-z0-9]`, opaque, provider-namespaced for future providers. Satisfies the submit
  route's uid regex.
- **Session cookie** (`82-0:sess`, httpOnly): `jose.SignJWT({ uid, name, picture })` HS256, key =
  `new TextEncoder().encode(AUTH_SECRET)`, `setIssuedAt().setExpirationTime("30d")`. Flags:
  `httpOnly: true, sameSite: "lax", path: "/", secure: process.env.NODE_ENV === "production",
  maxAge: 60*60*24*30`. (Review fix: `secure` env-gated so the cookie is sent on `http://localhost`.)
- `getSession(): Promise<{uid,name,picture}|null>` — reads `82-0:sess` via `await cookies()`,
  `jwtVerify` against AUTH_SECRET; returns null on missing/invalid/expired. Used by route handlers
  and server components.
- **Nonce** (`82-0:nonce`, httpOnly, 5-min): `SignJWT({ nonce })` HS256. Self-contained — **no Redis
  dependency** (review blocker: nonce had nowhere to live when Redis off; AUTH_SECRET is required for
  auth anyway, so signing the nonce with it is coherent).

### 5.3 Routes (all `runtime = "nodejs"`, all 503 when `!isAuthEnabled()`)

- `GET /api/auth/nonce` → generate `crypto.randomUUID()`, set signed `82-0:nonce` cookie, return
  `{ nonce }`.
- `POST /api/auth/google`:
  1. **CSRF hardening** (review fix): reject unless `Content-Type: application/json` (415) **and**
     header `X-Requested-With: fetch` present (403). Body = `{ credential }`.
  2. Verify Google ID token with jose:
     ```ts
     const JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));
     const { payload } = await jwtVerify(credential, JWKS, {
       audience: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
       issuer: ["accounts.google.com", "https://accounts.google.com"], // review fix: array form
     });
     ```
  3. Read `82-0:nonce` cookie, verify it, assert `payload.nonce === nonce` (replay protection).
  4. `uid = authedUid(payload.sub)`; `name = payload.name`; `picture = payload.picture`.
  5. Set session cookie; clear nonce cookie; return `{ uid, name, picture }`.
- `GET /api/auth/me` → `getSession()` or `{ user: null }`.
- `POST /api/auth/signout` → delete session cookie.

A module-level singleton holds the `createRemoteJWKSet` result so warm invocations reuse the JWKS
cache (cold start re-fetches ~100ms — acceptable).

### 5.4 Client

- `web/components/GoogleOneTap.tsx` (`"use client"`): if `isAuthEnabled` (via
  `NEXT_PUBLIC_GOOGLE_CLIENT_ID` presence) and not signed in — fetch a nonce, load
  `https://accounts.google.com/gsi/client`, `google.accounts.id.initialize({ client_id, callback,
  nonce })`, render One Tap **and** a "Sign in with Google" button fallback (Safari / One-Tap
  suppression). Callback POSTs `{ credential }` (with `X-Requested-With: fetch`) to
  `/api/auth/google`, then refreshes session state and fires the claim (5.6).
- `web/lib/session.ts` (`"use client"`): `useSession()` hook (GET `/api/auth/me`, cached in a tiny
  context/state) → `{ user, loading, signOut }`.

### 5.5 Daily submit becomes auth-aware (`web/app/api/daily/submit/route.ts`)

- If `getSession()` returns a user: **ignore client `uid`**, use `session.uid`; `name =
  cleanName(body.name) || session.name`. This makes signed-in daily ranks un-fakeable identity.
- Else: current anon behavior (client `uid` + name), unchanged. Daily still open to anon.
- Optional `body.anonUid` (the caller's own localStorage uid): if a session exists and
  `anonUid !== session.uid`, `zrem` the anon row from `lb:<date>` + `hdel` its meta after writing
  the authed row — removes the duplicate so the user doesn't appear twice. The anon uid is an
  unguessable UUID, so passing it functions as a bearer credential for *its own* row (no theft
  vector: an attacker doesn't know other users' anon uids).
- **Weekly/all-time propagation is added in PR #10** (this PR keeps daily-only writes).

### 5.6 Claim at result

In `web/components/Leaderboard.tsx`: render `<GoogleOneTap>` when not signed in with copy
"**Sign in to claim your rank** — and join the weekly & all-time boards." On successful sign-in (or
if already signed in), auto-call the existing submit with the in-memory `trace` + `anonUid =
getUid()`; the server writes under the authed identity and cleans up the anon row. Anon users can
still type a name + Submit to post to Daily only. Signed-in users see their Google name pre-filled
(editable — some won't want their real name on a board).

### 5.7 Setup (Charlie)

Google Cloud Console: OAuth consent screen (External, scopes openid/email/profile, add
`charlie.wh345@gmail.com` as test user) → Credentials → OAuth client ID (Web app):
- Authorized JS origins: `https://82-0-pink.vercel.app`, `http://localhost`, `http://localhost:3000`
- Authorized redirect URIs: none (One Tap uses a JS callback).
Env (Vercel Prod+Preview+Dev, and local `web/.env.local`):
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID=…apps.googleusercontent.com` (public)
- `AUTH_SECRET=<32-byte hex>` (generated; private)

### 5.8 Tests (PR #9)

Pure, `npx tsx` (matches `dailyVerify.test.ts` / `challenge.test.ts`):
- `auth.test.ts`: `authedUid` determinism + format (regex match, 32 chars); session sign→verify
  round-trip; tampered/expired session → null; nonce sign→verify; `isAuthEnabled` truth table.
Integration: dev can mint a valid session cookie locally (we hold AUTH_SECRET) to exercise the
auth-aware submit without Google.

---

## 6. PR #10 — Weekly + all-time boards

### 6.1 ISO week (UTC) — `web/lib/isoweek.ts` (pure)

```ts
export function isoWeek(dateStr: string): string {     // dateStr = UTC "YYYY-M-D"
  const [y, m, d] = dateStr.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d, 12);                 // UTC noon avoids DST edges
  const dow = new Date(t).getUTCDay();                 // 0=Sun..6=Sat
  const isoDay = dow || 7;                             // Mon=1..Sun=7  (review fix)
  const thu = new Date(t + (4 - isoDay) * 86400000);   // same-week Thursday (can go backward)
  const year = thu.getUTCFullYear();
  const jan4 = Date.UTC(year, 0, 4, 12);
  const jan4Iso = (new Date(jan4).getUTCDay() || 7);
  const week1Mon = jan4 - (jan4Iso - 1) * 86400000;
  const week = Math.floor((thu.getTime() - week1Mon) / (7 * 86400000)) + 1;
  return `${year}-W${String(week).padStart(2, "0")}`;
}
```

The adversarial review proved the original `dayOfWeek <= 4 ? 4-dow : 11-dow` form routed
**Fri/Sat/Sun** into the *next* week's key (4/18 ISO boundary cases failed, incl. year boundaries).
The `isoDay = dow || 7; 4 - isoDay` form is correct for all 7 days.

**Tests** (`isoweek.test.ts`): the 18 boundary cases incl. Fri Jun 12 2026 → `2026-W24`,
Sun Dec 28 2025 → `2025-W52`, Sun Jan 3 2021 → `2020-W53`, Sun Jan 4 2026 → `2026-W01`.

### 6.2 Key schema & types

```
lb:week:<isoweek>        ZSET  member=uid score=Σ daily-best wins this week
lb:week:<isoweek>:meta   HASH  uid → AggRow
lb:alltime               ZSET  member=uid score=career Σ daily-best wins   (no TTL)
lb:alltime:meta          HASH  uid → AggRow
```

```ts
// types.ts
export interface AggRow { uid: string; name: string; wins: number }       // no losses/net/lineup
export interface AggLeaderboardRow extends AggRow { rank: number }
export interface AggBoardView { scope: "week" | "alltime"; key: string; total: number;
                                top: AggLeaderboardRow[]; you?: AggLeaderboardRow }
```

Aggregate boards rank by **cumulative wins** (a single number), not a W-L record — so `AggRow`
deliberately omits `losses`/`net`/`lineup` (review fix: don't reuse `StoredRow`/`LeaderboardRow`,
whose `losses`/`net` would be `undefined`). A dedicated agg row renderer shows `rank · name · N wins`.

### 6.3 Atomic submit — `web/lib/leaderboard.ts` Lua via `redis.eval`

The keep-best + delta propagation runs as **one atomic Lua script** (review blocker:
read→delta→ZINCRBY is not atomic; concurrent same-uid submits double-count, and all-time has no TTL
so the corruption is permanent). Upstash supports `EVAL`.

```lua
-- KEYS: 1=daily Z, 2=weekly Z, 3=alltime Z
-- ARGV: 1=uid 2=newScore(encScore) 3=newWins 4=dailyTTL 5=weeklyTTL
-- returns {changed, delta, weeklyWins, alltimeWins}
local prev = redis.call('ZSCORE', KEYS[1], ARGV[1])
local newScore, newWins = tonumber(ARGV[2]), tonumber(ARGV[3])
if prev and tonumber(prev) >= newScore then return {0, 0, 0, 0} end
local prevWins = prev and math.floor(tonumber(prev) / 1000) or 0
local delta = newWins - prevWins
redis.call('ZADD', KEYS[1], newScore, ARGV[1]); redis.call('EXPIRE', KEYS[1], tonumber(ARGV[4]))
local ww, aw
if delta ~= 0 then
  ww = tonumber(redis.call('ZINCRBY', KEYS[2], delta, ARGV[1]))
  aw = tonumber(redis.call('ZINCRBY', KEYS[3], delta, ARGV[1]))
else
  ww = tonumber(redis.call('ZSCORE', KEYS[2], ARGV[1]) or '0')
  aw = tonumber(redis.call('ZSCORE', KEYS[3], ARGV[1]) or '0')
end
redis.call('EXPIRE', KEYS[2], tonumber(ARGV[5]))
return {1, delta, math.floor(ww), math.floor(aw)}
```

TS wrapper `submitScoreAuthed(date, uid, name, result, dailyRow)`:
1. `score = encScore(result.wins, result.netRtg)`.
2. `[changed, delta, ww, aw] = await redis.eval(LUA, [keyZ(date), keyWeekZ(w), keyAlltimeZ()],
   [uid, score, result.wins, TTL, TTL_WEEK])`.
3. If `changed`: `hset` daily meta (`StoredRow` incl. lineup) + `expire`.
4. If `delta !== 0`: `hset` weekly+alltime meta `{uid,name,wins: ww/aw}` + `expire` weekly (alltime
   meta: no expire). Meta is display-only; the ZSET score is authoritative for ranking (a transient
   1-delta stale name/number self-heals next submit — benign).

`encScore` gets a defensive clamp: `wins*1000 + clamp(net+100, 0, 899)` so `floor(score/1000)`
decodes wins exactly even for pathological net (review minor). Pure helper `computeDelta(prev, new,
wins)` mirrors the Lua and is unit-tested.

Anon submits keep the existing `submitScore` (daily-only) — anon never touches weekly/all-time
(correct: only authed users appear there).

### 6.4 Claim aggregate crediting

Claim is just **re-submit under session** (§5.6): the auth-aware submit calls `submitScoreAuthed`,
whose Lua delta correctly handles "authed uid already has / doesn't have a daily entry today" in one
atomic path. This **dissolves** the review's "migration else-branch over-credit" bug — there is no
separate hand-rolled migration delta; the same atomic primitive is the only writer.

### 6.5 Read paths

- Generalize `readSortedRows` in `redis.ts` to be generic over the meta type:
  `readSortedRows<T>(keyZ, keyH, start, stop): Promise<(T & {rank})[]>`. Daily/challenge pass
  `StoredRow`; agg boards pass `AggRow`.
- `web/lib/aggBoard.ts`: `getAggBoard(scope, uid?)` → `AggBoardView` (zcard + readSortedRows<AggRow>
  + your-row lookup), self-disabling.
- Routes: `GET /api/board/weekly` (current isoweek, or `?week=`), `GET /api/board/alltime`. Both
  accept `?uid=` for the your-row highlight.

### 6.6 UI (`web/components/Leaderboard.tsx`)

Add tabs **Daily | Weekly | All-time**. Daily tab = existing board. Weekly/All-time tabs lazy-fetch
their view and render the agg row (`rank · name · N wins`, your-row highlighted). When
`!isAuthEnabled` or no signed-in users yet, the agg tabs show an empty-state ("Sign in and play to
start your all-time climb"). Weekly shows the ISO-week label + a note that it's signed-in only.

### 6.7 TTLs (`redis.ts`)

```ts
export const TTL = 60*60*24*31;        // existing — daily + challenge (unchanged)
export const TTL_WEEK = 60*60*24*35;   // ~5 weeks of weekly history
// lb:alltime / :meta — NO expire (persistent)
```

### 6.8 Tests (PR #10)

- `isoweek.test.ts` (18 boundary cases).
- `computeDelta` unit tests: re-submit same/worse = no-op; improvement = delta; net-only improvement
  (same wins, better net) → daily changes, delta 0; multi-day accumulation; first-ever submit.
- Integration (dev harness, untracked, like `h2h_e2e.ts`): mint a dev session cookie, drive
  submit→weekly/all-time against Upstash with throwaway `gtest…` uids, assert sums + idempotency,
  then clean up the test keys.

---

## 7. PR #11 — Share-your-rank

Direct mirror of PR #4 share infra.

- `web/lib/og.tsx`: add `rankOgElement({ name, scope, rank, total, wins, losses, net })` — same
  shell/Wordmark/`ascii()` style; headline e.g. "**#3** on today's 82-0 Daily" / "**#12** this week"
  / "**#48** all-time", record or cumulative wins as the hero number, "Can you beat it?" CTA.
- `web/app/rank/[card]/opengraph-image.tsx` (Node runtime, `next/og`) + `page.tsx` (noindex,
  read-only card + "Build your five" CTA). The card is a **share-time snapshot** encoded in the URL
  (`scope.rank.total.wins.losses.net.name`, name URL-encoded). No DB lookup — rank is volatile;
  spoofing a rank only fabricates a brag image with a CTA back to the game (low stakes, same as the
  `/r/` permalink model). `robots` does not disallow `/rank` so unfurlers fetch the image.
- "Share your rank" button in `Leaderboard.tsx` (reuse the `ResultCard` `ShareButton` pattern:
  native share → clipboard/socials fallback, `track("share_rank", { scope })`). Builds the `/rank/…`
  URL from the user's current `you` row in the active tab.

### 7.1 Tests (PR #11)

- Encode/decode round-trip for the rank-card URL params.
- Manual/visual: OG image renders on prod (`/rank/<sample>` → `opengraph-image`), unfurl check.

---

## 8. Verification plan

- **Self-disable first:** all auth + agg code 503s / hides UI until envs present, so each PR merges
  green with zero prod risk before credentials exist.
- **Dev-minted session:** because the session cookie is *our* HS256 token, we fully E2E the
  auth-aware submit + weekly/all-time + claim locally/against prod by minting a session with
  AUTH_SECRET — **no Google needed** for everything downstream of sign-in.
- **Live Google handshake:** once Charlie sets the env vars, verify One Tap sign-in on prod
  (`82-0-pink.vercel.app`): prompt appears → session set (`/api/auth/me`) → submit ranks under the
  Google identity → weekly/all-time populate → share-rank card unfurls.
- Vercel **previews are 401-gated** — verify on **prod** after each merge (per project convention).
- Regression: anon Daily play + submit, H2H challenge, `/r/` share all unchanged.

## 9. Out of scope / future

- Additional providers (Apple, etc.) — uid scheme already namespaced (`google:`).
- Avatars on boards, "days played" enrichment, points-ladder metric, friends/following.
- All-time pruning job (only if Upstash size ever matters).
- HoopIQ network-leak backend opaque-ids (separate roadmap item).
- Engine — untouched (at calibration ceiling).

## 10. File-by-file change map

**PR #9 (auth+claim):**
- `web/package.json` — add `jose`.
- `web/lib/auth.ts` (new) — isAuthEnabled, authedUid, session/nonce sign+verify, getSession.
- `web/lib/session.ts` (new, client) — useSession hook.
- `web/components/GoogleOneTap.tsx` (new, client) — One Tap + button + claim trigger.
- `web/app/api/auth/{nonce,google,me,signout}/route.ts` (new).
- `web/app/api/daily/submit/route.ts` — auth-aware (session uid/name, anon-row cleanup).
- `web/components/Leaderboard.tsx` — claim-at-result UI, signed-in name handling.
- `web/lib/auth.test.ts` (new).
- `web/.env.local` (local only, gitignored) — the two envs.

**PR #10 (weekly/all-time):**
- `web/lib/isoweek.ts` (+`.test.ts`) (new).
- `web/lib/redis.ts` — `TTL_WEEK`, `decodeWins`, generic `readSortedRows<T>`.
- `web/lib/leaderboard.ts` — Lua `submitScoreAuthed`, `computeDelta`, clamp in `encScore`.
- `web/lib/aggBoard.ts` (+ `computeDelta` test) (new).
- `web/app/api/board/{weekly,alltime}/route.ts` (new).
- `web/app/api/daily/submit/route.ts` — call `submitScoreAuthed` for authed users.
- `web/components/Leaderboard.tsx` — tabs + agg renderer.
- `web/lib/types.ts` — AggRow/AggLeaderboardRow/AggBoardView.

**PR #11 (share-rank):**
- `web/lib/og.tsx` — `rankOgElement`.
- `web/app/rank/[card]/{opengraph-image.tsx,page.tsx}` (new).
- `web/lib/rankShare.ts` (+ test) (new) — encode/decode card params.
- `web/components/Leaderboard.tsx` — "Share your rank" button.
