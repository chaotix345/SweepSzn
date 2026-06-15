# Account Sync — "Sign in and everything follows you" — Design

**Date:** 2026-06-15
**Branch:** `feat/account-sync-auth`
**Status:** Approved (owner granted full autonomy after clarifying-question round)

## Goal

Let a player "sign into their account" with the Google One Tap we already have, so that **all stats and games save to the account and sync across every device**, and **the weekly / all-time leaderboards are only accessible when signed in**. Cleaner identity, transferable progress.

## Critical context (what already exists)

The Google auth core is **already built and live**, not dormant:

- `components/GoogleOneTap.tsx` — GSI One Tap + fallback button, nonce flow, posts credential to `/api/auth/google`.
- `app/api/auth/google/route.ts` — verifies the Google ID token via JWKS (`jose`), derives a stable per-account uid `authedUid(sub) = "g"+sha256("google:"+sub)[..31]`, mints an HS256 session JWT into the `82-0_sess` httpOnly cookie (30-day TTL). Binds the caller's `anonUid` into the session for claim-cleanup.
- `lib/auth.ts` / `lib/authServer.ts` — `signSession`/`verifySession`, `getSession()`, `setSessionCookie()`. Self-disabling when `NEXT_PUBLIC_GOOGLE_CLIENT_ID` / `AUTH_SECRET` absent.
- Every **submit** route (`daily`, `blueprint`, `factorhunt`, `surgeon`, `challenge`) already calls `getSession()` and writes leaderboard rows under `session.uid` when signed in; `submitScoreAuthed()` credits weekly + all-time.

**The two real gaps:**
1. **Scope** — sign-in only surfaces *inside the Daily leaderboard panel* (`components/Leaderboard.tsx`). No header UI, no shared session context (every `useSession()` call re-fetches `/api/auth/me`), and the FH/Blueprint/Surgeon boards + `NotificationBell` only ever pass the anon uid.
2. **Per-account persistence of client-only state** — **streak**, **result history**, and **display name** live only in `localStorage` (`lib/streak.ts`, `lib/resultHistory.ts`) and never reach the server, so they cannot sync across devices.

## Decisions (from owner)

1. **Play access:** Free to play signed-out (local storage). On sign-in, local progress syncs up. Weekly/all-time boards require sign-in to **view and appear**. Daily board stays public (anon can still post to it).
2. **Local data on first sign-in:** Claim this device's local streak + result history into the account (union/take-max merge, lightly trusted — display-only data).
3. **Share links stay public:** `/c/<id>` challenge spectator board and `/r/<result>` share pages remain accessible without sign-in (preserve the PR #41 viral loop). Only the competitive weekly/all-time boards are gated.
4. **Board name:** Editable handle stored server-side (`profile:{uid}`), defaulting to the Google profile name; user can change it and it syncs across devices.
5. **(Default) Identity:** Full replacement — once signed in, every board and the notification bell use the authed uid (not the anon uid).

## New Redis schema (additive; existing `lb:*` unchanged)

```
profile:{uid}   HASH  { name: string, picture: string, createdAt: number }
                      No TTL. Written on first sign-in (idempotent hset) and on name update.
                      Authoritative display name across devices.

streak:{uid}    ZSET  member = non-padded UTC day-key "YYYY-M-D" (the form BOTH lib/day.ts:dayUTC and
                      lib/streak.ts:utcKey already emit — they are identical, so the daily-submit write
                      and the localStorage backfill union with no conversion), score = completion ms.
                      No TTL. Written TRUSTED on every authed Daily submit (zadd the submit's `date`).
                      Backfilled (union) by sync. Consecutive run computed server-side with the same
                      dayUTC formatter. Sync defensively re-canonicalizes any incoming date through the
                      dayUTC formula so a stray zero-padded value can't create a duplicate member.

results:{uid}   LIST  JSON ResultEntry (newest-first), LTRIM cap 200. No TTL.
                      Written by the client (signed-in) via /api/profile/sync after each finished game,
                      and backfilled on first sign-in. Display-only; same trust level as today's localStorage.
```

`ResultEntry` shape is reused verbatim from `lib/resultHistory.ts`: `{ encoded, mode, wins, losses, grade, ts, challengeId? }`.

## New / changed API routes

Each new route gets a matching `test/routes/*.test.ts` and a `ROUTE_TO_TEST` entry (enforced by `routeCoverage.meta.test.ts`).

| Route | Method | Auth | Behavior |
|---|---|---|---|
| `/api/profile` | GET | session → else 401 | Returns `{ name, picture, streak, results }`. Reads `profile:{uid}`, computes consecutive streak from `streak:{uid}`, reads `results:{uid}` (newest-first). |
| `/api/profile/name` | POST | session → else 401 | Body `{ name }`. `cleanName()`, `hset profile:{uid} name`, **re-mint session JWT** with the new name (`signSession`+`setSessionCookie`) so the cookie stays in sync without re-login. Returns `{ name }`. CSRF-guarded (`x-requested-with: fetch`), rate-limited. |
| `/api/profile/sync` | POST | session → else 401 | Body `{ history?: string[], results?: ResultEntry[] }`. Idempotent **union** merge: re-canonicalize each history date through the dayUTC formula, then `zadd` into `streak:{uid}`; dedupe results by `mode:encoded`, `lpush`+`ltrim` into `results:{uid}` (cap 200). Used for first-sign-in migration **and** ongoing single-entry pushes. Validates/bounds input (max 400 dates, max 50 results/call). Returns `{ streak, results: count }`. |
| `/api/auth/google` | POST | — | **Add:** on success, `hset profile:{uid}` (name/picture; set `createdAt` once via `hsetnx`-style guard); migrate push subscriptions from `push:{session.anon}` → `push:{uid}`. |
| `/api/daily/submit` | POST | — | **Add (authed path only):** `zadd streak:{uid}` with today's UTC date. (Trusted — submit is verified by `verifyDaily`.) |
| `/api/board/weekly` | GET | **session → else 401** | Add `getSession()` gate; on 401 return `{ error: "auth_required" }`. Change cache header to `private, no-store` (auth-gated, uncacheable by the CDN). |
| `/api/board/alltime` | GET | **session → else 401** | Same gate + cache change. |

`daily/leaderboard`, `factorhunt/leaderboard`, `blueprint/leaderboard`, `surgeon/leaderboard`, `challenge/[id]/board`, and the `/r/*` pages **stay public**.

## Client changes

- **`components/SessionProvider.tsx` (new):** React context exposing `{ user, loading, refresh, signOut }`, one `/api/auth/me` fetch on mount. Mounted in root `app/layout.tsx` so both `(site)` and `play` trees share one session. Also mounts the app-wide One Tap prompt (via `GoogleOneTap` in a headless mode) so sign-in can happen anywhere, and exposes a `promptSignIn()` for the header button.
- **`lib/useSession.ts`:** re-point to `useContext(SessionContext)` (same return shape — `Leaderboard.tsx` keeps working unchanged). Add `refresh` after name update.
- **`components/SiteHeader.tsx`:** signed-in → small avatar/name with a menu (edit handle → `/api/profile/name`, sign out); signed-out (and auth enabled) → "Sign in" button that triggers `promptSignIn()`.
- **`components/Leaderboard.tsx`:** Weekly/All-time tabs when signed-out render a "Sign in to see the weekly & all-time boards" CTA instead of fetching (the GET now 401s). Signed-in streak comes from `/api/profile` (server-authoritative, cross-device) instead of `getStreak()`. On sign-in, call `/api/profile/sync` with local `history` + `results` to migrate.
- **`components/FhLeaderboard.tsx`, `BpLeaderboard.tsx`, `SgLeaderboard.tsx`, `NotificationBell.tsx`:** use `user?.uid ?? getUid()` from context (submit routes already accept authed uids server-side).
- **Result history sync:** at the `saveResult()` call sites (`components/Game.tsx` and the challenge/result components), when signed in, also POST the new entry to `/api/profile/sync`. On load for a signed-in user, hydrate result history by merging `/api/profile` results into the local list.

## Migration & merge safety

- **Streak:** server streak is the union of completed UTC dates. Trusted writes come from verified daily submits; the one-time sign-in backfill adds the old device's local dates. Union → two devices never clobber; worst case a user inflates their own cosmetic streak number (acceptable, same as today's purely-local streak).
- **Results:** display-only, deduped by `mode:encoded`, cap 200. Lightly trusted, same as the existing localStorage log.
- **Leaderboard rows:** already deterministic-uid + atomic keep-best (`KEEP_BEST_LUA`), so two devices auto-merge with no new code.
- **Push:** anon `push:{anon}` subscriptions copied to `push:{uid}` on sign-in so challenge notifications keep working.
- **Orphaned anon rows on other devices:** out of scope (no retroactive cross-device anon claim) — accepted per the one-shot claim decision.

## Testing

- New route tests: `profile` (GET 401 signed-out, returns merged state signed-in), `profileName` (401, cleanName, JWT re-mint), `profileSync` (union/dedupe/caps/bounds).
- Update `dailySubmit.test.ts` (streak zadd on authed path), `boardWeekly.test.ts` + `boardAlltime.test.ts` (401 signed-out, 200 signed-in), `authGoogle.test.ts` (profile hset + push migration).
- Extend `test/redisFake.ts` if list ops (`lpush`/`ltrim`/`lrange`) or `hsetnx` aren't already supported.
- Add `ROUTE_TO_TEST` entries for the 3 new routes.
- Full `npm test` green (currently ~1176 tests) before PR.

## Out of scope (YAGNI)

- Email/password or non-Google providers.
- Retroactive cross-device anonymous claim (sweep all anon uids a user ever had).
- Server-side anti-cheat on streak/results beyond input bounds (display-only data).
- Account deletion / data export UI (can follow later).
- Silent session refresh beyond the existing 30-day TTL (re-auth via One Tap is one tap).

## Rollout

Build + tests green → PR to `main` → CI green. **Production merge/deploy of auth-gating on the live site is held for an explicit owner go** (gating can lock out flows; verify on preview first).
