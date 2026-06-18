# Next-session kickoff prompt (paste into a fresh session)

Pick up SweepSzn pre-launch work with full autonomy to ship. The funnel is MEASURED, the whole loop
has had a full live QA pass, the top-of-funnel got its CRO sweep (PR #74), and the **mode-select wall**
— the last friction before the north-star `first_play` — is now bypassable. Last session shipped
**PR #75** (main `084ca83`) — LIVE on sweepszn.com, canary green, every changed surface verified live
(curl SSR on every permalink + a real `/browse` dogfood on both 390x844 mobile and 1280x800 desktop):

- **Deep-link past the mode-select wall.** `/play?mode=daily` (and `?mode=<any non-challenge mode>`)
  drops a cold first-timer straight into a guided first spin, skipping the 8-option "Pick your mode"
  wall. New tested `lib/parseModeParam` (the 7 deep-linkable modes; `challenge` excluded — needs
  `?c=<id>`). `Game.tsx`'s mount effect consumes `?mode=` (mirrors the `?c=` plumbing) and strips it
  **plus** any coexisting restore params so a refresh can't resurrect a stale `?r=`/`?sg=` result.
- **`Shell` "← Modes" escape hatch** on every in-game screen → `setMode(null)`. Quiet zinc (not orange).
  Keeps mode discovery + the returning-user history (`ModeSelect` → `ResultsHistory`, replay-last-mode,
  daily-already-played redirect) one tap away from a deep-linked game — the most-complete answer to the
  friction-vs-agency tradeoff.
- **Acquisition + Daily-promising CTAs → `/play?mode=daily`:** landing hero + final, `ShareHeader`
  default (covers `/r/`, `/pe/`, `/compare/`, `/dex/s/`), `ResultCard` shared-view, `Leaderboard` ×3,
  `/leaderboards` Daily CTA, `/rank`, `/about`, `/how-it-works`, `/dex/s` standalone, `/c` expired
  fallback. **Per-mode** deep-links (the generalized parser's payoff): `/leaderboards` board tiles →
  `?mode=factorhunt|blueprint|surgeon`; **Surgeon shares** (`/sg/` header + in-card "Fix your own five")
  → `?mode=surgeon` so the "Fix" copy matches the destination.
- **Deliberately kept `/play`** (mode-neutral): site chrome (header/footer nav), the mode-agnostic
  streak-saver push, DexBoard. Footer CTA copy harmonized to "Draft your five →".

Suite 1530 → **1547** green. Plan + vetting record: `docs/plans/2026-06-20-deeplink-mode.md`. A 5-dim
adversarial review Workflow (20 agents, per-finding verify) caught a real miss (a `Leaderboard` edit had
silently failed) and confirmed 7/15 findings, all fixed. The X launch is ~June 23. The bar remains
**CONVERT + POLISH on a measured, QA'd funnel** — not new measurement.

FIRST, orient by reading (in this order):
1. MEMORY.md — especially `deeplink-mode-2026-06-20` (what PR #75 shipped + the file-not-read Edit
   gotcha), `topfunnel-cro-2026-06-19`, `most-complete-principle` (the standing rule), `funnel-
   measurement-2026-06-18` (how to READ the funnel on launch day), `ingame-suite-2026-06-18` (the §12
   integrity rule), and the X-account-launch-state entries.
2. `web/DESIGN.md` ("Arena") and root `DESIGN.md` §12 (the trust model) before any UI.
3. `docs/plans/2026-06-20-deeplink-mode.md` (last session's scope, the acquisition-vs-navigation rule,
   the rejected/deferred items).

CHECK THE LAUNCH-DAY REALITY FIRST. If the launch has started (or any real traffic exists), sign in as
an ADMIN_UID and pull `GET https://sweepszn.com/api/funnel?days=1` (or open `/admin`) and READ the
funnel — `rates.firstPlay` is the north star (the deep-link should have moved it; the wall is no longer
the bottleneck). Watch `share_view` (loop closing) + `compare_friend` (viral). The Vercel Web Analytics
dashboard is the parallel client funnel. **Let the actual numbers steer scope — where the loop leaks IS
the work.** (Pre-launch there's still no data: the daily board is empty; `visit`/`first_play` count from
the PR #71 deploy.)

ANALYZE, THEN SCOPE (your call — don't just take this list). Strongest candidates:

  • **SIGN-IN CONVERSION AT THE RIGHT MOMENT** (the #2 from last session, now the top candidate).
    Sign-in is intent-only (PR #73 anon-first). The open question: is the POST-game nudge strong enough
    for a share-link arrival who plays a non-Daily mode? `SignInSaveNudge` shows on Classic/HoopIQ/Prime;
    Leaderboard prompts on Daily. Consider a clearer "save your record / claim your rank" moment on the
    ResultCard (post-commit, §12-safe — descriptive "this is YOUR result, sign in to keep it", never a
    prescriptive hint), and measure signin rate off the funnel. TDD any new gating into `lib/`.

  • **`utm_source` ACQUISITION ATTRIBUTION (high value AT launch).** The deep-link + share CTAs now
    convert, but we can't yet see WHICH channel/post a `first_play` came from. Add `utm_source`/`utm_*`
    capture (read on landing, persist to the `ev()` funnel so `/admin` + `/api/funnel` can split
    first_play by source). This tells you which X posts actually work on launch day. Note: the
    deep-link mount effect already strips `mode/r/m/own/d/sg` — fold utm handling in cleanly (don't let
    a utm param block the `?mode=` deep-link; they should coexist). The PR #75 plan flagged a
    coexisting-param test idiom you can reuse.

  • **SLOT-PICK CROWD REVEAL is logged but still UNWIRED beyond the between-picks note.** `/api/crowd`
    + `CROWD_MIN=20` (lib/socialStore.ts) compute "X% took Player at SLOT here". Decide: surface it more
    prominently post-commit (§12-safe social proof) or keep documented as volume-gated-for-later. Only
    matters once launch traffic accrues.

  • **Per-page OG images for the marketing routes** (`/about`, `/how-it-works`, `/leaderboards`) —
    they share the generic card; a per-route OG lifts share CTR. Lower priority than conversion.

  • **Secondary / post-launch:** referral/retention loops; the "completes ≈ evaluate calls incl.
    What-If" funnel impurity (only if you start trusting completion rate precisely).

Re-scope freely if the live funnel or fresh analysis points elsewhere.

THE INTEGRITY PHILOSOPHY (non-negotiable — root `DESIGN.md` §12): DESCRIPTIVE (who/what a player is:
real stats, accolades, era/collection context; the public 79-3 / 82-0 / 1,170 facts) = safe anytime.
PRESCRIPTIVE / engine-internal (per-candidate marginal wins, fit deltas as a number, best-pick stars,
peak_score) = GATE behind the 2-hint economy or DEFER to POST-COMMIT. Gold = S/A+ elite tier only;
green/red = win/loss; orange is the ONLY CTA color (one per row); mode accents (violet/cyan/rose) for
mode chips/icons only.

THE MOST-COMPLETE PRINCIPLE (standing rule): always take the MOST COMPLETE route — no shortcuts, no
corners cut. Cover every surface/mode/case (QA all modes on BOTH viewports; audit EVERY permalink, not
a sample — that's how PR #75 caught the `/leaderboards` per-mode-tile opportunity AND the review caught
the `Leaderboard` ×3 miss). Run the full adversarial review, fix every actionable finding, complete the
entire ship loop. **GOTCHA from PR #75:** the Edit tool silently errors "file not read" if you haven't
`Read` the file in-session — a batch of edits can include a silent no-op. ALWAYS verify edits landed on
disk (grep the file) before trusting a batch, and never rely on a sub-agent's excerpt as a substitute
for Reading the file you're about to edit.

CONVENTIONS (must follow): CUSTOMIZED Next.js — read `node_modules/next/dist/docs/` before writing
Next code (App Router async params; file-convention routes/OG). TDD always (red→green→refactor).
Hermetic Vitest (`npx vitest run` from `web/`, full no-arg — config excludes `.claude` worktrees).
EVERY new API route needs a test in `test/routes/` AND a `ROUTE_TO_TEST` entry. Logic lives in tested
`lib/` functions; components/pages stay thin (node-env unit + jsdom component tests, `// @vitest-
environment jsdom`). Permalink pages are async RSC with no page-unit-test idiom — cover shared logic in
a tested component + `tsc` + `build` + live dogfood. For browser QA use the gstack `/browse` skill
(`$B` resolves to the dist binary; client-rendered behavior like the `?mode=` deep-link is invisible to
curl — use `/browse` + a `js` check). **Mint share permalinks WITHOUT a playthrough** for fast SSR
verification: `/r/<id1,…,id5>` (comma-joined real ids — the `ResultPreview` HERO_IDS five always
resolves: curry/jordan/lebron/giannis/jokić), `/pe/<y>.<n>.x.<ids>`, `/sg/<ids>.<outIdx>.<inId>`
(inId a real player NOT in the five, e.g. `david_robinson_sas_1990s_1994`), `/rank/<scope>.<rank>.
<total>.<wins>.<losses>.<net*10>.<b64url name>` (scope d/w/a; "Player"→`UGxheWVy`), `/dex/s/<count>.
<badges>~<ids>`, `/compare/<ids>/<ids>`. Player ids live in `web/public/data/players.json`. Plans/specs
go in `docs/plans/`.

FULL AUTONOMY (you have it — don't stop to ask, except genuine product tradeoffs): work on a feature
branch off main (NEVER commit to main). TDD each change → keep `tsc`, eslint, and the full vitest suite
green → commit (end messages with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`).
When the set is done: run a multi-dimension adversarial code-review Workflow (see PR #71/#72/#74/#75),
fix every actionable finding (VERIFY the flagged ones empirically before "fixing" — PR #75's claimed
`parseModeParam(undefined)` type bug was a false positive, disproved by the ternary returning `null`),
run `npm run build` (must pass), push, open a PR to main (body ends with the `🤖 Generated with Claude
Code` line), wait for CI green, merge with `--delete-branch`, then VERIFY the production deploy: poll
until the new code serves on sweepszn.com (a client marker like a CTA-copy or `/r/` SSR change; CDN
edges propagate over ~40s — poll for several consecutive clean reads), check `/api/health` (canary),
and dogfood the changed surfaces live (`/browse`, both viewports). Report the final live state.

NOTE: this kickoff + the deletion of `next-session-2026-06-20.md` are the handoff roll — bundle them
into your first PR (as PR #75 bundled the 06-19→06-20 roll).

WHEN EVERYTHING IS DONE AND VERIFIED DEPLOYED: write a prompt (for me to paste into the next fresh
session) that proposes and scopes the NEXT most-valuable work — grounded in the codebase, the memory,
and wherever the launch stands by then. Hand it off carrying this SAME philosophy: full autonomy, the
§12 integrity rule, the most-complete principle, TDD, the full ship→merge→verify-deploy loop — and tell
that session to likewise end by teeing up the one after it.

and u can do multiple things if you want! sky is the limit. remember the most complete option principle
