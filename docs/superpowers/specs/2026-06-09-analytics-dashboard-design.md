# Analytics / Insights Dashboard — Design Spec

Date: 2026-06-09
Status: approved direction, pending spec review
Roadmap item: #5 (analytics / insights dashboard)

## 1. Goal & context

The viral growth loop is now fully built and live (share image → leaderboard → sign-in,
PRs #4–#11). The **one open question** is whether that loop actually *works*: of the people
who start a game, how many finish a lineup, how many share, how many sign in, and how many
come back. That is the decision this dashboard drives — **keep investing in the loop, or
change it.**

Events already fire to **Vercel Web Analytics** via `@vercel/analytics` `track()` (6 event
types across 12 call sites: `mode_start`, `lineup_complete`, `daily_submit`, `daily_claim`,
`challenge_submit`, `share` / `share_rank`). Vercel covers ad-hoc **event counts** for free.
It does **not** cover what we actually need, so this build adds only the net-new pieces:

- **Funnel + retention** — Vercel Web Analytics has no funnel and no cohort/retention view.
- **Upstash-side truth** — distinct players/day, board growth, sign-in conversion: this data
  lives in Redis, not in Vercel Analytics, and the two cannot be joined there.

We do **not** rebuild Vercel's event counter, and we do **not** touch the engine
(at its RMSE ceiling) or any shipped gameplay/leaderboard/auth behavior.

### Verified Vercel facts (why building is justified, not assumed)

Checked against Vercel docs + current pricing, not memory:

- Custom events are supported (`track()`), **but there is no funnel and no retention/cohort UI.**
- **Hobby plan: 50,000 events/month hard cap** — collection *pauses* when hit; extra events
  cannot be purchased on Hobby.
- The query engine / advanced metrics are gated behind the **Web Analytics Plus** add-on
  ($10/mo, **Pro only**).
- Raw events can be streamed out via **Analytics Drains** (export pipe, Pro-gated) — not a
  built-in dashboard.
- Vercel Analytics **cannot join** to our Upstash leaderboard data.

## 2. Locked decisions

| Decision | Choice |
|---|---|
| Primary question | **"Is the viral loop working?"** — funnel (play → complete → share → sign-in → return) + retention lead the page. |
| Data source | **Upstash + owned server-side counters.** Existing `lb:*` boards for free board metrics; a thin new `ev:*` counter layer for the funnel. No dependency on Vercel's analytics API. |
| Instrumentation | **Hybrid:** server-observable stages counted inside existing routes; client-only stages (**play**, **share**) captured by a tiny `/api/ev` beacon. |
| Vercel `track()` | **Kept as-is** (free ad-hoc browsing). Beacon is additive; the 12 existing `track()` calls are unchanged. |
| Admin access | **Google-sub allowlist.** Reuse the shipped HS256 session; `ADMIN_UIDS` env. Non-admins get `notFound()`. |
| Retention math | **Exact daily sets** (`SADD uid`), not HyperLogLog — volume is hundreds–low-thousands/day, so sets are exact and cheap. |
| Page | Server component `app/admin/page.tsx`, near-zero client JS, unicode/inline-SVG bars, `?days=` window (default 14). |
| Self-disable | If `isRedisEnabled()` is false, the page renders a friendly "metrics offline" notice (mirrors leaderboard 503 behavior). |

## 3. Verified instrumentation points (call sites confirmed in code, not memory)

Confirmed by reading the actual call sites — this determines where each counter fires and
guarantees no over-counting:

- **`/api/evaluate`** is hit **only** from `Game.tsx:150` (a live user completing a lineup).
  The landing `ResultPreview.tsx:27`, `/r/[lineup]/page.tsx:6`, and its `opengraph-image.tsx:3`
  all call `evaluateLineup()` **directly from `@/lib/engine`** — never the HTTP route. So a
  counter at `/api/evaluate` = exactly one **complete** per real completed lineup, with **zero**
  contamination from SSR/preview/share rendering. (This was the key correctness risk; it is clean.)
- **`/api/auth/google`** (`GoogleOneTap.tsx:43`) — one hit per **sign-in**.
- **`/api/daily/submit`** (`Leaderboard.tsx:80,99`) and **`/api/challenge/submit`**
  (`ChallengeResult.tsx:25`) — one hit per **submit**.
- **`/api/spin`** (`Game.tsx:114`) is called **multiple times per game** (one per reel spin),
  so it is **not** a clean "play" signal → **play** must come from the beacon.
- **play** (`mode_start`) and **share** / **share_rank** are **client-only** `track()` calls
  today (`Game.tsx:65`, `ResultCard.tsx:129/132/157`, `ChallengeResult.tsx:51`,
  `RankShareButton.tsx:35/38/59`) → the beacon captures these. Share is *the* viral metric, so
  it cannot be skipped — this is why a pure-server (beaconless) approach was rejected.

## 4. Architecture overview

```
Browser                                   Server (Next 16 route handlers, Node runtime)        Upstash Redis
───────                                    ────────────────────────────────────────────        ─────────────
mode_start ─ ev("play",{uid,mode}) ──────▶ POST /api/ev  (validate, fire-and-forget) ─────────▶ INCR ev:play:<d>
   (also track("mode_start"), unchanged)                                                         HINCRBY ev:mode:<d> <mode>
                                                                                                 SADD ev:active:<d> uid
share / share_rank ─ ev("share",{uid}) ──▶ POST /api/ev ──────────────────────────────────────▶ INCR ev:share:<d>
   (also track("share"…), unchanged)                                                             SADD ev:active:<d> uid

complete lineup ───── POST /api/evaluate ─▶ (existing engine eval) ── then fire-and-forget ────▶ INCR ev:complete:<d>
sign in ───────────── POST /api/auth/google ▶ (existing verify) ──── then fire-and-forget ─────▶ INCR ev:signin:<d>; SADD ev:active:<d> uid
submit score ──────── POST /api/{daily,challenge}/submit ▶ (existing) then fire-and-forget ────▶ INCR ev:submit:<d>; SADD ev:active:<d> uid

                                           every stage also ──────────────────────────────────▶ HINCRBY ev:totals <stage>  (no TTL)

admin (signed in) ─── GET /admin ─────────▶ app/admin/page.tsx (server component)
                                              getSession(); if uid ∉ ADMIN_UIDS → notFound()
                                              metrics.ts reads ev:* + lb:* for last N days
                                              renders static HTML (bars/sparklines, no client JS)
```

All `ev:*` writes are **fire-and-forget, wrapped in try/catch**, executed *after* the route's
real work has succeeded. **A Redis hiccup must never break gameplay, auth, or submit.** This is
the single most important runtime invariant in the build.

## 5. Redis key schema

All per-day keys use the **existing UTC date helper** that already builds `lb:<date>` (format
`YYYY-M-D`, not zero-padded) so `ev:*` and `lb:*` align by date. TTL 45 days (long enough for a
14-day window plus retention look-back and slack).

| Key | Type | Op | Written on | TTL |
|---|---|---|---|---|
| `ev:play:<date>` | string | `INCR` | play beacon | 45d |
| `ev:complete:<date>` | string | `INCR` | `/api/evaluate` success | 45d |
| `ev:share:<date>` | string | `INCR` | share beacon | 45d |
| `ev:signin:<date>` | string | `INCR` | `/api/auth/google` success | 45d |
| `ev:submit:<date>` | string | `INCR` | daily + challenge submit | 45d |
| `ev:mode:<date>` | hash | `HINCRBY <mode>` | play beacon | 45d |
| `ev:active:<date>` | set | `SADD <uid>` | play/share beacon + submit + sign-in | 45d |
| `ev:totals` | hash | `HINCRBY <stage>` | every stage | **none** |

Notes:
- Counters (`INCR`/`HINCRBY <mode>`) need **no uid** — they just count events.
- `ev:active:<date>` needs a uid; the **play beacon carries `uid`** (client already has the anon
  `uid` from `streak.ts`, or the `g…` uid when signed in), so the active-set covers everyone who
  started a game, plus signed-in/submitting users. A user who signs in mid-session may appear as
  two uids that day (anon + `g…`) — minor over-count of DAU, documented, accepted.
- `decodeWins(score)` from `lib/score.ts` lets board metrics (win distribution) be read straight
  off the sorted-set scores without touching the meta hashes.

## 6. Metrics derived (pure functions in `web/lib/metrics.ts`, dependency-injected redis)

`metrics.ts` is pure and testable with a fake redis (the `dailyVerify.ts` pattern). It exposes a
single `getMetrics(redis, { days })` that returns a plain object the page renders.

**Funnel (windowed sum over the N days):**
- plays, completes, shares, sign-ins (raw counts from `ev:*`)
- completion rate = completes / plays
- **share rate = shares / completes** (the headline viral number)
- capture rate = sign-ins / completes

**Retention (exact, from `ev:active:<date>` sets):**
- DAU per day = `SCARD ev:active:<date>` → sparkline
- **D1 return** for day *d* = `SINTERCARD(active:d, active:d+1) / SCARD(active:d)`
- D7 return = same with `active:d+7`
- *Adversarial note:* confirm Upstash supports `SINTERCARD` (Redis 7.0+). **Fallback:**
  `SINTERSTORE tmp active:d active:d+1; SCARD tmp; DEL tmp` (or inclusion–exclusion via
  `SCARD`/`SUNIONSTORE`). The plan must verify this against the live Upstash before relying on it.

**Engagement / board (free, from existing keys):**
- mode split from `ev:mode:<date>` (Daily / Classic / HoopIQ / Challenge)
- board growth: `ZCARD lb:<date>` trend, `ZCARD lb:week:<iso>`, `ZCARD lb:alltime`
- win distribution: bucket `decodeWins(score)` across today's `lb:<date>` ZSET
- all-time totals from `ev:totals`

## 7. New/changed surfaces

**New files:**
- `web/lib/ev.ts` — client `ev(name, props)`: `navigator.sendBeacon('/api/ev', JSON…)` with a
  `fetch(..., {keepalive:true})` fallback; swallow all errors (analytics must never throw into UI).
- `web/app/api/ev/route.ts` (Node) — `POST {ev, uid?, mode?}`: allowlist `ev ∈
  {play,share}`, `mode ∈ {daily,classic,hoopiq,challenge}`, `uid` against the existing
  `/^[a-z0-9-]{8,64}$/i` regex; fire the corresponding writes; return **204**. Accepts anon (no
  session required). No-ops to 204 when `isRedisEnabled()` is false.
- `web/lib/evServer.ts` — server-side helpers (`bumpComplete()`, `bumpSignin()`, `bumpSubmit()`,
  shared `bump(stage, {uid?, mode?})`) so the existing routes call one tested helper instead of
  inlining Redis ops. Each helper is try/catch fire-and-forget.
- `web/lib/metrics.ts` — pure `getMetrics(redis, {days})` (section 6).
- `web/app/admin/page.tsx` — server component; admin gate + render.
- `web/lib/metrics.test.ts` — pure unit tests (`npx tsx`).

**Changed files (additive, minimal):**
- `Game.tsx:65` — add `ev("play", {uid, mode})` beside the existing `track("mode_start")`.
- `ResultCard.tsx`, `ChallengeResult.tsx`, `RankShareButton.tsx` — add `ev("share", {uid})`
  beside each existing `share`/`share_rank` `track()` (the share beacon; a single `ev` call per
  share action, not per target — target detail stays in Vercel).
- `web/app/api/evaluate/route.ts` — `bumpComplete()` after a successful eval.
- `web/app/api/auth/google/route.ts` — `bumpSignin(uid)` after a successful verify.
- `web/app/api/daily/submit/route.ts`, `web/app/api/challenge/submit/route.ts` —
  `bumpSubmit(uid)` after a successful, verified submit.
- `web/app/robots.ts` — add `Disallow: /admin`.

**Env:** new `ADMIN_UIDS` (comma-separated `g…` uids) in Vercel. Bracket-proof entry per the
env-file gotchas; the admin uid is obtained from `/api/auth/me` while signed in. Page reuses the
shipped `getSession()` — no new auth code.

## 8. Access control & privacy

- `app/admin/page.tsx`: `const s = await getSession(); if (!s || !ADMIN_UIDS.includes(s.uid)) notFound();`
  → 404 for everyone else (no existence leak). `noindex` + `Disallow: /admin` in robots.
- The page shows **aggregates only** — no per-user PII beyond what already appears publicly on the
  leaderboard (display name, lineup). No emails, no Google profile data.
- `/api/ev` accepts anon and only ever writes counters/active-sets; it returns 204 and exposes no
  data. It is not an information-disclosure surface.

## 9. Testing

- **Unit (pure, no live Redis):**
  - `metrics.ts` — funnel %, retention (D1/D7 from fake sets), mode split, win-dist bucketing,
    division-by-zero guards (0 plays → 0%, not NaN).
  - `/api/ev` payload validation — reject bad `ev`, bad `mode`, malformed `uid`; accept valid.
  - `evServer.ts` helpers — assert correct keys/ops against a fake redis; assert a throwing redis
    is swallowed (never propagates).
  - Run via `npx tsx <file>.test.ts` (the established pattern).
- **Build/lint/typecheck** green before PR (CI does not distinguish new vs pre-existing failures).
- **Prod E2E (untracked dev script — kept OUT of the PR, like `h2h_e2e.ts`):** against throwaway
  `ev:test:*` keys → fire beacons + simulate stage bumps, mint an admin session with `signSession`
  (prod `AUTH_SECRET`), load `/admin`, assert the funnel/retention numbers reflect the seeded data;
  then `DEL` the test keys. Also verifies the live Upstash `SINTERCARD` support (section 6).
- **Verify on PROD after merge** (Vercel previews are 401-gated): sign in on prod, play a game,
  share, then load `/admin` and confirm the day's counters moved.

## 10. Non-goals (YAGNI)

- No charting library — unicode/inline-SVG bars only.
- No per-event drill-down or live visitor view — that is Vercel's job; we keep `track()` for it.
- No new-vs-returning cohort breakdown (deferred; D1/D7 retention is enough to answer the question).
- No real-time / auto-refresh.
- No admin login UI — env allowlist + existing session only.
- No removal or rerouting of the existing Vercel `track()` calls.
- No engine, gameplay, leaderboard, or auth behavior changes.

## 11. Rollout / risks

- **Runtime invariant (highest priority):** every `ev:*` write is fire-and-forget + try/catch,
  after the route's real work. Analytics degradation must never affect gameplay, auth, or submit.
- **Beacon inflation:** the `play`/`share` beacons are client-fired and therefore spammable. These
  are *internal* vanity/decision metrics, so light noise is acceptable and documented; server-side
  stages (complete/sign-in/submit) remain authoritative. A future per-uid-per-day share dedupe is
  possible but out of scope.
- **Build constraint:** Next.js 16.2.7 APIs differ from training — the implementation plan must
  read `web/node_modules/next/dist/docs/…` for route-handler / server-component / `cookies()` /
  `robots.ts` specifics before writing code (per `web/AGENTS.md`).
- **One new env var** (`ADMIN_UIDS`) to set in Vercel; the page self-disables gracefully if Redis
  or the env is absent.
