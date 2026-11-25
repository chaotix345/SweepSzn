# SweepSzn app upgrades: design (2026-11-25)

Approved by the owner in chat on 2026-11-25 ("do it all"). The brainstorm was run with a Gemini 4 Neon owner stand-in (two rounds) and checked against production numbers.

## Why

Production numbers on 2026-11-25 (read-only: Vercel Analytics plus Redis `ev:*` counters):

- About 400 unique visitors since the June X launch. Monthly visitors went Jun 77 → Sep 109 → Oct 51 → Nov 25. Traffic is half mobile.
- People who start a game like it. 74% of plays complete (1,818 of 2,457 all-time), and October players averaged about 6 plays per session.
- Nobody comes back. In Oct–Nov, 21 of 25 players were active on a single day only, and 1 of 22 returned the next day.
- Most of the surface around the game goes unused:
  - Plays by mode (Oct–Nov): daily 63, classic 57, prime 14, surgeon 4, and blueprint, factorhunt and hoopiq 1 each.
  - Analysis tools, all-time: explore_open 9, whatif_open 1, compare_open 1.
  - The post-game sign-in nudge was shown 853 times and tapped about 0 times.
  - 80 submits all-time. The daily boards are empty.
- The only tagged referrer is chatgpt.com: 14 visits, 11 first plays.

Diagnosis: the core loop is good. The app around it is too wide, a solo player has nothing to measure against, and nothing pulls them back tomorrow.

## Goals

1. **Sharper core.** The first screen and the result screen are about the game, not about 8 modes and 6 tools.
2. **Something to beat with zero other players.** Every result is measured against real NBA history, and the Daily against its own best possible five.
3. **A reason to come back tomorrow.**
4. **A replayable solo opponent** (Draft Duel).
5. **Current players** in the pool (the 2025-26 season).
6. **Distribution that runs without the owner** (share framing, AI-search and SEO surfaces).
7. **General UI/UX upgrades** from a full-site review.

## Non-goals

- Engine v5 or more accuracy work. The v4 known gaps stay as `it.fails`.
- Monetization of any kind.
- Anything the owner must operate: X post kits, content calendars, manual daily steps.
- A weekly live-season scrape or "this season" projections page.
- Weekly recap push and `.ics` reminders.
- A native app, Postgres, or a runtime LLM.

## Anti-goals (a failure even if it works)

- Breaking `DESIGN.md` §12. This includes leaking per-candidate fit or marginal data before commit on any competitive or shared seed, and revealing a Daily's optimal five while that Daily is live.
- Breaking any existing permalink or id: `/r/`, `/pe/`, `/sg/`, `/c/`, `/rank/`, `/compare/`, `/dex/s/`, Dex card ids, `?mode=` deep links.
- Diluting the "Arena" system (`web/DESIGN.md`): gold is reserved for S/A+ and 82-0, and primary CTAs stay action orange.
- Gating anonymous first play behind sign-in, or bringing back unsolicited One Tap.
- Half-scoped work. Every surface ships on desktop and mobile, in every affected mode, with tests (the owner's "most complete" rule).

## Constraints

- Stack stays Next.js 16 (read `web/node_modules/next/dist/docs/` before writing Next code, per `web/AGENTS.md`), Vercel, Upstash Redis and committed static JSON. Infra budget is $0–20/mo.
- Every new API route gets a test in `web/test/routes/`. Tests are hermetic Vitest.
- CI gates, all from `web/`, all must pass: `npx tsc --noEmit`, `npx eslint app components lib test scripts`, `npm test`, `npm run build`. Also `python -m pytest data/tests -q` from the repo root.
- No browser dogfooding against production: client beacons write prod analytics. Dogfood on a local `npm run dev` with no Redis env.

---

## Workstreams

Each workstream is one branch and one reviewable unit. Sizes are rough.

### W1. Sharper core (M)

- **Mode picker** (`components/game/ModeSelect.tsx`, `app/(site)/page.tsx` copy "8 ways to play"):
  - Top level: Daily (featured hero), Classic, Prime, and the full-width Challenge-a-friend bar. Draft Duel joins after W4.
  - Surgeon, Blueprint, Factor Hunt and HoopIQ move into a collapsed "More modes" drawer. The drawer state is remembered per viewer in localStorage, wrapped in try/catch.
  - Every `?mode=` deep link and route keeps working.
- **Leaderboards page** (`app/(site)/leaderboards/page.tsx`):
  - The Daily board stays primary. It keeps the existing `EmptyBoard` ghost podium when empty.
  - Secondary mode boards appear only when they have entries.
  - Drop Blueprint's 5 objective sub-tabs (`BpLeaderboard.tsx`) and keep only its combined view. The API stays unchanged.
- **Daily anti-spoiler:**
  - While a Daily is live, board rows must not link to the lineup (`Leaderboard.tsx` `Row` → `/r/${lineup}`) unless the viewer has already submitted today's Daily. This mirrors how `challengeStore.ts` strips lineups.
  - Enforce it in the API response (omit `lineup` for viewers who haven't played), not only in the UI.
  - Past days are unaffected.
- **Result card diet** (`components/ResultCard.tsx`):
  - Above the fold: record, grade, the verdict line, Share and Play again.
  - Explore, What-If, Compare and the dossier collapse behind one "Dig deeper" disclosure. Keep the existing analytics beacons so usage stays measurable.
- **Sign-in nudge:**
  - Remove the post-game `SignInSaveNudge` from the result flow. Header sign-in stays.
  - Keep the `claim_nudge_*` stages valid in `evServer`/`metrics` so historical data still reads; they just stop firing.
- **Copy bug:** `ResultCard.tsx:553-559` says S (80+) is unreachable. Under engine v4, 80-2 is draftable (README, `DESIGN.md` §14). Fix the copy so it's truthful.
- **Refactor (do first in this branch, behaviour-neutral):** split `components/Game.tsx` (861 lines) into hooks and subcomponents so W2–W4 don't grow it. The existing tests must pass unchanged before any feature edits.

### W2. Measured against history (M)

- **Percentile vs real teams:**
  - Each result shows "Beats N% of real NBA teams since 1985", computed against the 1,170 team-seasons (1985–2025, all with `w`) in `web/public/data/team_lookup.json`.
  - Compare the lineup's projected wins to the real teams' actual wins. Ties count as half.
  - Show it on the ResultCard in every mode and on the `/r/` OG image (`lib/og.tsx`).
  - `team_lookup.json` currently has no runtime importer. Add it to `DATA_FILES` in `next.config.ts`, which `test/nextConfig.test.ts` checks, or derive a compact sorted wins array at build time. Builder's call.
- **Daily ceiling:**
  - Compute the best possible five for a Daily seed's base spins. The 5 base spins are pick-independent: every `TEAM|DECADE` bucket has 8 or more players, so 4 exclusions never empty a bucket.
  - Use an exact search (branch-and-bound or top-K per slot plus `slotAssign`, as in `scripts/search_best.ts`). Cache it per date, in memory plus Redis if available.
  - Re-spins: consider only the base spins. Label it "best five from today's spins".
- **§12 rule for the ceiling:**
  - After submitting today's Daily, the player sees the ceiling record and their gap ("You're 6 wins off today's perfect five").
  - The ceiling **lineup** stays hidden until the Daily rolls over (00:00 UTC). Only then is it revealed for past dates.
  - The ceiling is never sent before the viewer has a committed Daily result.
  - Server-side: a route returns the record only for a viewer who has submitted today, and the lineup only for past dates. Test both gates.

### W3. A reason to come back (M; needs W2's ceiling)

- **After finishing the Daily:**
  - A countdown to the next Daily.
  - The hook "Tomorrow: see today's perfect five", which links to yesterday's revealed best five, plus how the player did against it.
  - The streak displayed prominently. The streak system already exists.
- **Past-Daily archive:**
  - Play any previous Daily seed from launch to yesterday. It is unranked: no board, streak, weekly or all-time credit, and archive submits are rejected server-side for ranking.
  - Each archive day shows the revealed ceiling five and the player's result against it.
  - Entry points: a link under the Daily result and in the "More modes" drawer.
  - Daily boards expire after about 31 days, so the archive never depends on old boards.

### W4. Draft Duel vs bot (L; after W1's Game split)

- **Format:**
  - 5 rounds of shared spins in snake order (R1 you→bot, R2 bot→you, …, R5 you→bot).
  - Both sides fill 5 slots and the engine scores both fives. The higher record wins; tiebreak with `compareResults` (`lib/challenge.ts`).
  - An optional 20-second pick clock auto-picks on timeout. Default is off; the setting is remembered per viewer.
- **Bot personas, picked server-side:**
  - **Box-Score Bro** (easy): highest raw points and box stats. Ignores defense and usage.
  - **Old Head** (medium): leans pre-1990, bigs, rim protection and accolades.
  - **The Analyst** (hard): greedy by server-side marginal NetRtg on the current spin, using the same replacement-padded logic as `computeFits` (`lib/data.ts`). It never looks ahead to future spins.
- **§12:**
  - Bot logic runs only on the server (new `lib/duelBot.ts` plus an API route).
  - No per-candidate fit or rating deltas reach the client for Duel spins.
  - Duel results never feed Daily, weekly or all-time boards.
  - Keep a Duel W-L record per viewer, shown in `/stats`.
- **Spin system:** `app/api/spin/route.ts` slices `exclude` to 4. Duel needs up to 9 exclusions. `selectSpin` already supports any length. Add a guard and re-spin for the case where the second picker has no eligible candidate left.
- **Share:** a Duel matchup OG card (you vs bot persona, both records) and a permalink.
- Duel joins the top-level mode picker.

### W5. 2025-26 season players (M; data pipeline)

- Scrape 2025-26 (`year=2026`) plus heights, and rate the new cards with the existing `coefficients.json`. Do not recalibrate.
- **Never** run `build_dataset.py --write-pool` directly. It re-picks the peak per `(name, team, decade)` and would rename existing `..._2020s_2025` ids.
- Chosen approach: **upgrade with a legacy-id alias map** (facilitator's call; see "Calls made"):
  - Net-new `(person, team, 2020s)` buckets are appended.
  - When a same-team 2026 season beats the existing 2020s card, the fresh card is drafted, and the old id resolves through `id_aliases.json` everywhere ids are read: `/r/`, Dex, rank, compare, stored results, boards and challenge rows.
  - Existing cards' stats and ratings must not drift. Smoothing and rating windows touch only new cards.
- The 82-0 parity meta (`data/820_player_meta.json`) is frozen and won't cover new cards. Give new cards position eligibility from their B-R positions, using the same rules `enrich_players.mjs` applies.
- Re-verify the golden tests (80-2 theoretical max, `scripts/search_best.ts`). If the new pool changes the max, update the docs (README, about page) truthfully.
- Add the TS↔Python penalty parity test (an engine v4 follow-up in `notes/review.md`).

### W6. Hands-off distribution (M)

- **Share framing:**
  - Share text and the OG card read as a claim, e.g. "Engine says 58-24. Wrong? Beat this five →". The `/r/` OG image carries the W2 percentile line.
  - The one-tap "beat this" link opens the same spins.
  - Today's `/r/[lineup]` holds no seed. A "same spins" link must use a seed that is fit-locked, so no Classic-style hints apply (mirror `isFitLockedSeed`).
  - Daily shares link to `/play?mode=daily`.
- **Spoiler-free Daily share:** a Wordle-style emoji grid (slot grades or factor pips) with the record and no player names while that Daily is live.
- **AI search / SEO:**
  - `llms.txt`.
  - Schema.org structured data on the home, how-it-works, teams and rank pages, using existing pages and no fake reviews.
  - Text on `/how-it-works` and `/about` written so an AI answer can quote it ("best all-time NBA starting five", "can a team go 82-0").
  - A small set of famous-debate pages, e.g. `/vs/<slug>`: 10–20 curated matchups of real all-time fives, scored as exact 5-card lineups from `players.json`, clearly labelled as fantasy sims and not real-team calibration. Include them in the sitemap.
- No owner action required anywhere.

### W7. General UI/UX upgrades (M–L; from the Neon site review)

- A Gemini 4 Neon reviewer audits the whole site on a local dev server (no Redis env), at mobile 390px and desktop 1440px:
  - first-run clarity;
  - draft-flow friction;
  - result screen;
  - navigation;
  - typography and spacing consistency with `web/DESIGN.md`;
  - accessibility (contrast, focus, `aria`, touch targets);
  - loading and empty states;
  - performance feel.
- Its findings are ranked. Fixes that don't conflict with W1–W6 are implemented, and visual changes follow `web/DESIGN.md`.

---

## Sequencing

- **Wave 1 (parallel):**
  - W1 sharper core, which includes the Game.tsx split;
  - W5 season players (data only, plus the id-alias loader in `lib/data.ts`);
  - W6's AI-search/SEO part (new routes and metadata only);
  - the Neon UI/UX audit (read-only).
- **Wave 2:** W2 and W4 in parallel, both based on W1.
- **Wave 3:**
  - W3, on W2;
  - W6's share-framing part, on W2 because it needs the percentile;
  - W7 UI/UX fixes, last, on top of everything.
- **Integration:** branch `feat/brainstorm-app-upgrades`. Each workstream branch is reviewed, then merged in. One umbrella PR goes to `main` with per-workstream commits and a written verification record. Merging to `main` and deploying to production wait for the owner's go-ahead.

## Calls made (owner may override)

- Surgeon goes into "More modes" (4 plays in Oct–Nov), despite being a feature the stand-in was proud of.
- The sign-in nudge is removed rather than reworded.
- W5 uses upgrade-with-aliases rather than strict append-only.
- The Daily ceiling uses base spins only.
- Duel has 3 personas and no "perfect play" tier. The pick clock is off by default.
- New 2025-26 cards are draftable in all modes, Classic included. 82-0 parity is frozen, and `DESIGN.md` §12 says we owe it nothing.
- Integration is one umbrella PR rather than 7 stacked PRs.

## Left to the builder

Component structure, naming, copy wording (within the Arena voice), caching mechanics, search algorithm details, test layout, and how exactly "Dig deeper" collapses.
