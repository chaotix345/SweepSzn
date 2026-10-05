# SweepSzn improvement pass — 2026-10-05

Branch `feat/improvement-pass` (worktree `.claude/worktrees/improvement-pass`, based on `origin/main` @ `c2d4598`).

## Progress

- [x] Phase 1 — read docs/config/CI/git log; baseline recorded; codebase map (below)
- [x] Phase 2a — parallel audit (5 areas) → deduped + verified issue list (below)
- [x] Owner sign-off (2026-10-05): full identity/auth bundle approved; Next 16.2.9→16.3.8 upgrade approved
- [x] H1 fixed — `next` 16.3.8 (commit `3295703`), all gates green
- [x] Phase 2b — fixes in 4 parallel workstreams (identity, client, data, verify/pages), each TDD red→green; all merged
- [x] Phase 3a — feature brainstorm + shortlist (below)
- [x] Phase 3b — #1 My Stats (`/stats`), #2 Franchise pages (`/teams` + 30 static team pages), #3 "vs you" board compare — all merged
- [x] Integration gates — tsc, eslint, 140 files / 1980 tests, `next build`, local `next start` smoke test of new/changed routes
- [x] Phase 4a — independent final review (correctness + security): no blockers; actionable findings fixed (9 commits)
- [ ] Phase 4b — PR → CI → merge → production deploy check

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

### Resolution

Every fix landed with a regression test that was run red (failing on the old code for the stated reason) before
the fix and green after; the red→green evidence is in each workstream's commit series.

| Status | IDs |
|---|---|
| **Fixed** | H1, H2, H3, H4 · M2–M18, M20, M22 · L1–L12, L16–L23 |
| **Fixed (client-only, minimal)** | M21 — the no-fit warning now offers an unused team/era re-spin, else Restart (changing `selectSpin`/the verifier would alter Daily determinism, so it was out of scope). It also removed a worse bug: the old "Spin again" after a re-spin returned the unsalted base spin, so a pick from it failed verification as off-pool. |
| **Fixed (partial)** | M1 — a Google-namespace uid can no longer be bound as a session's `anon`. Full proof-of-possession for anon-uid binding is deferred; H2 + M2 removed the vectors for discovering someone else's anon uid. |
| **Also fixed (found during the pass)** | `/api/ev` beacon accepted g-uids (completes H3); `ModeSelect` `location.assign` lint regression introduced by the Next 16.3 lint rules; `/api/slot-pick` added to the `public/data` tracing list after M15 made it a data reader |
| **Deferred** | see below |

**Deferred (low severity or needs an owner decision), with reasons:**

| ID | Why deferred |
|---|---|
| M19 | Blueprint ships fit grades on its shared daily seed, and its "HINTS used" stamp is client-reported. `lib/projection.ts` documents this as intentional, and changing it removes user-facing functionality. **Owner decision:** keep it, gate fit behind a server-recorded hint endpoint, or treat `bp-` like Daily. |
| L13 | Fit lock bypassable by brute-forcing `salt` (~45 scripted calls). Script-level, which DESIGN §12 accepts; it can't be closed while seeds are client-chosen. |
| L14 | Projection "ceiling" is a greedy fill; up to 2 wins below a coordinate-ascent ceiling. A fix changes numbers players see mid-draft. Relabel ("projected best") or add 1–2 ascent passes in a follow-up. |
| L15 | `person_id` merges namesakes (Paxson, R. Williams, Dunleavy, G. Henderson Sr/Jr). Needs a data-pipeline rebuild (`_sr`/`_jr` ids); the dataset is frozen for 82-0 parity (DESIGN §12). |
| — | Referral-credit farming via fresh random uids on the unauthenticated `first_play` beacon. Credits are cosmetic and private; a real fix credits only on a verified submit (product change). |
| — | `npm audit`: 5 remaining highs are dev-only lint tooling (`eslint-config-next` → `fast-glob` → `micromatch` → `braces`); the only offered fix is a downgrade to v14. Not shipped to the runtime. |
| — | M20 caveat: once focus is inside Google's cross-origin sign-in iframe, Tab can't be trapped back (keydown never reaches the page); a sentinel element would fix it. |
| — | Data: accolades show Jordan as 13× All-Star (the real count is 14); `/teams/was` all-time five projects 32-50 (the engine's honest verdict, but a weak page). Both are data/content follow-ups. |

### Final independent review (Phase 4)

Two independent opus reviewers covered the full diff vs `main`: correctness/integration and security. Verdicts:
**APPROVE with nits** and **PASS WITH NOTES**, with no blockers. Both confirmed:
- every changed signature and endpoint shape is consumed correctly across the merged workstreams;
- no response, URL, or log line exposes another player's uid;
- every anonymous-uid path rejects g-uids;
- the Lua scripts match the test fake;
- `npm audit --omit=dev` is clean.

| Finding | Disposition |
|---|---|
| FH/Surgeon replay locks reopen on deploy day (new sorted-id key misses today's slot-order locks) | Fixed: legacy-key fallback |
| Signed-in Surgeon results drop 2 players from the Dex (`decodeLineup` on a surgeon card) | Fixed |
| `/api/slot-pick` parses players.json before responding | Fixed: validation moved into `after()` |
| `/teams/[team]` 5-card grid cramped at tablet widths | Fixed |
| `syncResults` lock: unowned release, ~60 retries, 500 on contention | Fixed: token + compare-and-delete, fewer retries, 409 |
| Pre-deploy session cookies can carry a g-uid as `anon` (renewed via `/api/profile/name`) | Fixed: `verifySession` applies `isAnonUid` |
| `ref:credits:*` / `ref:referrers` unbounded | Fixed: TTL / cap |
| `/c/[id]` OG caches the fallback card after a Redis blip | Fixed: `no-store` on the fallback |
| `cleanName` misses some invisible/filler chars; truncation can split an emoji | Fixed |
| uids harvested from the board API **before** this deploy remain valid bearer tokens | **Accepted risk.** Pre-launch/low traffic; rotating anon uids is a large identity change (owner decision) |
| A responder can exhaust a creator's 5/hour challenge-push cap (inbox items still land) | **Accepted.** A bounded mute replaces unbounded spam |
| IPv6: hex-form IPv4-mapped addresses share one bucket; shared /64 = shared limits | **Accepted.** Vercel's `x-real-ip` doesn't send that form; same exposure as IPv4 NAT |
| Public boards show today's top lineups before you play (pre-existing on `main`) | **Owner decision (DESIGN §12).** Daily spins are deterministic, so copying #1 needs no devtools. The challenge board already strips lineups for this reason. |

### Test coverage delta

| | Baseline | After |
|---|---|---|
| Test files | 128 | 140 (+12) |
| Tests passing | 1668 | 1980 (+312) |
| New guard tests | — | `test/nextConfig.test.ts` (every runtime `public/data` reader is force-traced), `test/uidInUrl.meta.test.ts` (no `uid=` query strings in client code), board "no uids on the wire" tests for all six board routes |

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
| 3 | **"Vs. yours" compare from the Daily board**: once you've played today, each board row links to `/compare/<yours>/<theirs>` | Med — makes the board social; reuses the existing compare page | S | Low (post-commit only) | **Built** |
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

**What shipped:**
- **My Stats** (`/stats`, noindex): games played, best record per mode (linked), average wins, grade distribution,
  current and best Daily streak, last-7-days count. Uses local history plus the signed-in account's synced history
  (same dedupe as "Your results"). Linked from the "Your results" header on the mode picker. Pure `lib/stats.ts`
  (22 tests) + `StatsBoard` (7 component tests).
- **Franchise pages** (`/teams` + `/teams/<abbr>` ×30, statically generated, per-team OG cards, in the sitemap, footer
  link). Each page shows the franchise's all-time five: slot-legal, one person per slot, chosen by the existing
  accolade-based "Top" order with full-time starters (30+ mpg) first. It also shows the engine's verdict on that five
  (linking to its `/r/` breakdown), legends by decade with real stat lines and accolades, and a CTA to `/play`.
  Descriptive only per DESIGN §12. `lib/franchise.ts` has 88 tests, plus 5 page/sitemap tests.
- **"Vs you" compare** on the Daily board: after you've posted, each other row links to `/compare/<yours>/<theirs>`
  (tracked as `board_compare`).

## Recommended next steps

1. **Run `scripts/lua_e2e.ts` against a non-production Upstash** to cover the new `KEEP_BEST_LUA` meta mode on
   Upstash's own Lua runtime. It already passed on a local Redis 7.0 during this pass.
2. **Two §12 owner decisions:**
   - **M19:** Blueprint fit on a shared seed. Keep it, gate it behind a server-recorded hint, or make Blueprint blind
     like Daily.
   - **Board lineups before you play:** whether today's board lineups should be hidden (or names-only) until you've
     posted. The challenge board already does this; Daily, FH, BP and Surgeon don't.
3. **Draft Duel vs bot** (feature #4): the strongest fun/virality gap vs 82-0.com today. Pair it with the optional
   shot clock (#7).
4. **Past-Daily archive** (#5): unranked replay of missed Dailies. The H4/L20 lifecycle fixes in `Game.tsx` make
   this safer to build now.
5. **Watch the new funnel signals:** `board_compare` clicks, `/teams/*` organic landings (Search Console), and `/stats`
   visits (Vercel Analytics). Check whether the referral loop and nudges convert now that sharing is fixed (M11: X and
   Bluesky shares from permalink pages used to drop the absolute URL and the `?ref=`).
6. **Data follow-ups:** namesake `person_id`s (L15), the Jordan All-Star count, and the projection-ceiling relabel (L14).
7. **Clean up stale branches/worktrees:** ~25 merged remote branches and 2 old `.claude/worktrees` remain from earlier
   sessions.
