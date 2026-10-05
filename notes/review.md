# SweepSzn improvement pass — 2026-10-05

Branch `feat/improvement-pass` (worktree `.claude/worktrees/improvement-pass`, based on `origin/main` @ `c2d4598`).

## Progress

- [x] Phase 1 — read docs/config/CI/git log; baseline recorded; codebase map (below)
- [x] Phase 2a — parallel audit (5 areas) → deduped + verified issue list (below)
- [x] Owner sign-off (2026-10-05): full identity/auth bundle approved; Next 16.2.9→16.3.8 upgrade approved
- [x] H1 fixed — `next` 16.3.8 (commit `3295703`), all gates green
- [ ] Phase 2b — fixes in 4 parallel workstreams (identity, client, data, verify/pages), each TDD red→green
- [x] Phase 3a — feature brainstorm + shortlist (below)
- [ ] Phase 3b — build: #1 My Stats, #2 Franchise pages (in progress); #3 board "vs yours" compare (after fixes merge)
- [ ] Phase 4 — final gates, independent review, PR, CI, merge

## Baseline (Phase 1, before any change)

| Gate | Command (from `web/`) | Result |
|---|---|---|
| Typecheck | `npx tsc --noEmit` | pass (0 errors) |
| Lint | `npx eslint app components lib test scripts` | pass (0 problems) |
| Tests | `npm test` | 128 files, 1668 passed, 13 todo, 0 failed (~19s) |
| Build | `npm run build` | pass |
| `npm audit` | | 16 vulns (1 critical `next`, 12 high, 3 moderate) — all transitive except `next`, `vitest`, `eslint-config-next` |

CI (`.github/workflows/ci.yml`): `npm ci` → `tsc --noEmit` → `eslint app components lib test scripts` → `npm test` → `npm run build`, Node 22, on push to main + every PR.

## Codebase map

**What it is.** SweepSzn (sweepszn.com) — an NBA "draft an all-time five" game, a rebuild of 82-0.com with an
engine that models basketball (era-normalized z-scores, BPM, usage/interior penalties, Pythagorean wins fitted to
1,170 real team-seasons). Players spin a slot machine (team × era) per slot, draft five, and the engine projects
an 82-game record. 8 modes: Daily (shared seed, leaderboard), Classic, Prime, HoopIQ (stats hidden), Factor Hunt,
Blueprint, Surgeon, Challenge (friend link). Pick'Em, Dex collection, referrals, push notifications around it.

**Layout.**
- `data/` — offline Python pipeline (scrape Basketball-Reference → `build_dataset.py` → `calibrate.py`) producing
  committed `web/public/data/{players,coefficients}.json`. Not run in CI.
- `web/` — Next.js 16 App Router, React 19.2, Tailwind 4, Vitest 4. Deployed on Vercel (one cron:
  `/api/cron/streak-saver` 21:00 UTC).
  - `lib/engine.ts` — pure engine (lineup → ORtg/DRtg → wins). Pinned by `engine.golden.test.ts`.
  - `lib/data.ts` — the sole runtime reader of `public/data/*.json` (fs read), spin + §12 hint gating.
  - `lib/dailyVerify.ts`, `lib/trace.ts`, `lib/verifyDeps.ts` — server-side replay of a submitted draft trace;
    the only score that counts (DESIGN §12).
  - Mode logic: `lib/{challenge,blueprint,factorHunt,surgeon,prime,pickem}.ts`; boards in
    `lib/{leaderboard,aggBoard,blueprintBoard,factorHuntBoard,surgeonBoard,boardCache}.ts`.
  - Identity: anon bearer UUID in localStorage (`lib/streak.ts`); Google One Tap → HS256 session JWT cookie
    (`lib/auth*.ts`, `jose`); anon→Google merge via `/api/profile/sync`.
  - Persistence: Upstash Redis REST (`lib/redis.ts`); features self-disable (503 / hidden UI) without env vars.
  - Funnel/analytics: `lib/evServer.ts` (event counters, referral credit), `lib/metrics.ts` → `/admin`, `/api/funnel`.
  - Client: `components/Game.tsx` (draft state machine for all modes) + `components/game/*` hooks/panels;
    `ResultCard.tsx` (result, share, what-if lab, dex strip).
  - Share permalinks + OG cards (satori via `lib/og.tsx`): `/r`, `/pe`, `/sg`, `/rank`, `/c`, `/compare`, `/dex/s`.
  - 43 API routes under `app/api/**`, each with a test in `test/routes/` (enforced by `routeCoverage.meta.test.ts`).

**Data flow.** spin (`/api/spin`, gated hints) → client draft → `/api/evaluate` (result card) → per-mode
`/api/<mode>/submit` replays the trace server-side → Redis ZSETs (daily keep-best; weekly/all-time cumulative via
ZINCRBY) → board routes + `/leaderboards`.

**External services.** Upstash Redis, Google Identity (One Tap), Web Push (VAPID), Vercel (hosting, cron,
analytics).

**Risky areas.** Submit/replay routes (leaderboard integrity), §12 hint gating in `lib/data.ts`, auth/session +
anon→Google merge, Redis key growth (no TTL / uncapped sets), `next.config.ts` output-file tracing of
`players.json` (routes missing from the list load zero players in prod), large client components
(`Game.tsx` 829 LOC, `ResultCard.tsx` 662 LOC).

## Issues

Five parallel audit agents (security, engine/replay, client, pages/build, Redis/data) produced ~50 raw findings,
deduped to the list below. Every item marked **verified** was re-checked against the code by the orchestrator
(several were also reproduced by the agents with probes). Ranked by severity × likelihood. Status is updated as
work lands.

### High

| ID | Issue | Where | Status |
|---|---|---|---|
| H1 | `next@16.2.9` is in range of critical advisories incl. GHSA-vcvr-r3jv-pc5j (RCE in `next/og` ImageResponse — every share card here uses it) | `web/package.json` | verified |
| H2 | Public board APIs return every top-100 row's `uid` — the anon **bearer token** (and signed-in g-uids). Enables impersonation (H3), inbox reads, push hijack, row deletion | `lib/redis.ts:32-34`; daily/fh/bp/surgeon leaderboard routes | verified |
| H3 | Anon-uid branches accept Google-namespace `g…` uids with no cookie → submit/read inbox/hijack push as a signed-in user | daily/challenge/fh/bp/surgeon submit, notifications, push, referral, challenge results | verified |
| H4 | Spin race: "← Modes"/Restart during a spin lets the old seed's spin land in the new game → competitive submit rejected `off-pool pick` | `components/Game.tsx:225-238,313-350` | verified (agent repro) |

### Medium

| ID | Issue | Where | Status |
|---|---|---|---|
| M1 | Sign-in binds a client-chosen `anonUid` → signed-in attacker deletes that anon player's rows and moves their push subs | `app/api/auth/google/route.ts:59,68` | verified |
| M2 | Anon bearer uid sent in GET query strings (boards, notifications, pickem) → lands in CDN/server logs (violates DESIGN §12) | `Leaderboard.tsx:62`, `NotificationBell.tsx:37`, Fh/Bp/SgLeaderboard, `usePickem.ts:49` | verified |
| M3 | Challenge-response push spam: push fires even when the inbox dedup suppresses; dedup keyed on free-form display name | `challenge/submit/route.ts:85,97`; `notifyStore.ts:15,28` | verified |
| M4 | Push subscriptions silently expire 31 days after opt-in (TTL never refreshed; UI still says "on") | `pushStore.ts:54,79`; `usePush.ts` | verified |
| M5 | Streak-saver cron spends its 500 cap + once-per-day claims on players with no push sub; sequential sends | `cron/streak-saver/route.ts:53-70` | verified |
| M6 | `syncResults` lrange→del→lpush race duplicates/loses history; a failure between del and lpush wipes it | `profileStore.ts:156-169` | verified |
| M7 | Live projection meter shown to challenge responders on Classic-converted challenges (§12 fit leak) | `projection.ts:10`, `project/route.ts:22`, `Game.tsx:141` | verified |
| M8 | Factor Hunt prediction lock keyed on slot-ordered lineup → same five re-slotted bypasses it (×1.05 replay) | `factorhunt/submit/route.ts:60` | verified (agent probe) |
| M9 | Challenge creation accepts any `daily-*` seed incl. future dates (rehearse next week's Daily) | `challenge/submit/route.ts:28-30` | |
| M10 | `/pe` Pick'Em share page + OG card drop the Blueprint grade and Prime badge | `app/pe/[card]/page.tsx:23`, `opengraph-image.tsx:17,23` | verified |
| M11 | Share buttons' X/Bluesky hrefs differ server vs client; React 19 doesn't patch attrs on hydrate → permalink pages share a relative URL with no `?ref=` | `ResultCard.tsx:349-355,392,395` | |
| M12 | `/leaderboards` countdown text hydration mismatch → whole-root client re-render every visit | `Leaderboard.tsx:45,167` | |
| M13 | Surgeon results never mirrored to a signed-in account (other modes are) | `useSurgeon.ts:101` | |
| M14 | Custom display handle overwritten by the Google name on every sign-in | `profileStore.ts:128` | verified |
| M15 | Unauthenticated beacons write unbounded no-TTL keys: `slot_picks:*` (unvalidated personId rendered in crowd), `ref:fp:*`, `core_picks` | `socialStore.ts:28-40`, `evServer.ts:123-131` | |
| M16 | `decodeURIComponent` on an already-decoded param throws on `%25zz` → 500 on `/api/result` + 4 OG routes | `share.ts:25,53`, `pickem.ts:97`, `surgeon.ts:148` | verified |
| M17 | Dynamic OG images served `max-age=0` → every unfurl re-renders (cold start + 4 MB JSON parse) | all `opengraph-image.tsx` | |
| M18 | `/c/[id]` page + OG 500 on any Redis blip (no try/catch) | `challengeStore.ts:52-56` | |
| M19 | Blueprint is a shared-seed board but ships fit grades on every spin; "HINTS used" stamp is client-reported | `data.ts:253`, `Game.tsx:229`, `blueprint/submit:59` | owner decision |
| M20 | Sign-in popover focus trap omits the Google button (keyboard users can't reach it) | `SessionProvider.tsx:99` | |
| M21 | "Spin again" on the no-fit warning re-requests the identical deterministic spin | `Game.tsx:753` | |
| M22 | Authed daily meta HSET runs outside the keep-best Lua → meta can disagree with score under concurrency | `leaderboard.ts:60-76` | |

### Low

| ID | Issue | Where |
|---|---|---|
| L1 | `next.config.ts` tracing comment is wrong (tracer already bundles `public/data/*` for every reader; list is stale) | `next.config.ts:3-24` |
| L2 | `/r` etc. accept the same person in several eras | `sharedLineup.ts:24` |
| L3 | Share pages drop `og:site_name` (metadata shallow-merge) | 7 share pages |
| L4 | `/rank/[card]` accepts non-integer / out-of-range values and unbounded names | `rankShare.ts:34-36` |
| L5 | `/leaderboards` is `force-dynamic` only to pass a date | `leaderboards/page.tsx:14` |
| L6 | Sitemap omits `/dex` | `app/sitemap.ts` |
| L7 | Rate limits key on the full IPv6 address (a /64 = unlimited buckets) | `redis.ts:81-86` |
| L8 | `dex:<uid>` accepts unvalidated ids via profile sync | `profileStore.ts:172` |
| L9 | `getSession` ignores `isAuthEnabled` (too-short secret still verifies) | `auth.ts`, `authServer.ts` |
| L10 | `CRON_SECRET` compare not constant-time | `cron/streak-saver/route.ts:26` |
| L11 | Google display name bypasses `cleanName` | `auth/google/route.ts:56` |
| L12 | Legacy challenge with no stored seed lets the responder pick the seed | `challengeStore.ts:95` |
| L13 | Fit lock bypassable by brute-forcing `salt` (script-level) | `data.ts:205-225` |
| L14 | Projection "ceiling" is a greedy fill, not a true ceiling | `projection.ts:52-64` |
| L15 | `person_id` merges namesakes (Paxson, R. Williams, Dunleavy, G. Henderson Sr/Jr) | data pipeline |
| L16 | Dead code: `primeStats`, `poolStats`, `applySwapToTrace` re-export, unused `browser.tsx` exports | `data.ts:315-323` etc. |
| L17 | `getDraftablePool` re-filters/sorts 5.3k players per `/api/project` call | `data.ts:109-115` |
| L18 | `computeFits` builds >5-man lineups on crafted `exclude` | `data.ts` |
| L19 | `usePush` reports "granted" even when the server rejected the subscription | `usePush.ts:66-71` |
| L20 | "← Modes" from a result leaves `?r=&m=` in the URL (refresh restores old result) | `Game.tsx:595,605,637,655` |
| L21 | What-If Lab swap options race (slow earlier fetch wins) | `WhatIfLab.tsx:31-38` |
| L22 | Surgeon counter INCR/EXPIRE in two trips; push cap check non-atomic; admin metrics fan-out | `surgeonBoard.ts:42`, `pushStore.ts:52` |
| L23 | `/api/health` can't detect a data-load failure | `health/route.ts` |

Rejected false positives (checked by the agents, not acted on): zero-players-in-prod tracing (the tracer does
include the files — confirmed via `.nft.json`), JWT alg confusion / missing exp, empty-secret forgery, login CSRF,
push SSRF, Redis key injection, ISO-week boundaries, record sums ≠ 82, NaN propagation, keep-best double-credit on
re-submit, cron double-run, localStorage access unguarded, StrictMode double-submit, winBuckets reading daily board
(documented non-bug).

## Features

Grounded in what SweepSzn does (8 draft modes, explainable engine, share permalinks, boards) and a 2026-10-05
survey of the current 82-0.com (which now has a 1v1-vs-bot mode with a pick clock, a guest "My Stats" profile,
a lifetime-points podium board, a multi-game hub, and one SEO content page). Constraints applied: no new
persistent Redis data without owner sign-off, descriptive-only per DESIGN §12, no new dependencies.

| # | Idea | User value | Effort | Risk | Decision |
|---|---|---|---|---|---|
| 1 | **My Stats page** (`/stats`): games played, best record per mode, avg wins, grade distribution, current + best Daily streak, from local history (+ synced account history when signed in) | High — retention; 82-0 now ships a guest stats profile; today SweepSzn only lists raw results | S–M | Low (client-only, no new storage) | **Build** |
| 2 | **Franchise pages** (`/teams`, `/teams/[team]`): each franchise's legends by decade with real stat lines + accolades, and its all-time accolade five with the engine's verdict | High — distribution: only 5 indexable URLs today; "all-time <team> starting five" is a natural search query and the explainable engine is the moat | M | Low–Med (static at build; descriptive only) | **Build** |
| 3 | **"Vs. yours" compare from the Daily board**: once you've played today, each board row links to `/compare/<yours>/<theirs>` | Med — makes the board social; reuses the existing compare page | S | Low (post-commit only) | **Build** (after the board API fix lands) |
| 4 | Draft Duel vs a bot (82-0's 1v1: pick clock, opponent-pick reveal, split result) | High fun/virality | L | Med–High (new mode through `Game.tsx`, §12 review) | Cut — too big for this pass; top recommendation for next |
| 5 | Past-Daily archive (replay any previous Daily, unranked) | Med–High for players who miss days | M | Med (seed/mode plumbing in `Game.tsx`) | Cut — Game.tsx is being changed by H4/L20 fixes in this pass; next |
| 6 | Lifetime points board incl. guests (82-0 style) | Med | M | Med — new Redis data (needs sign-off) | Cut |
| 7 | Optional 20s shot-clock per pick | Med | S–M | Low–Med (`Game.tsx`) | Cut — next, alongside #4 |
| 8 | Wordle-style emoji record grid in share text | Med–Low (share text already rich) | S | Low | Cut — marginal over existing share copy |
| 9 | "All-time greats by position" content page (82-0's one SEO page) | Med (SEO) | S | Low | Folded into #2's index page |
| 10 | Franchise × decade long-tail pages (210 URLs) | Med (SEO) | S on top of #2 | Med (thin-content risk) | Cut — sections inside #2 instead |
| 11 | Referral milestone tiers (5/10/25 invites) | Low until referral volume exists | S–M | Low | Cut (handoff gates it on volume) |
| 12 | Calendar (.ics) daily reminder for users without push (iOS non-PWA) | Med–Low | S | Low | Cut — unproven value |
| 13 | Desktop keyboard shortcuts for the draft | Low–Med | S–M | Low (`Game.tsx`) | Cut |

## Recommended next steps

_(populated at the end)_
