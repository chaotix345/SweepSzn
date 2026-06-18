# Next-session kickoff prompt (paste into a fresh session)

Pick up SweepSzn pre-launch work with full autonomy to ship. The funnel is MEASURED, the whole loop
has had a full live QA pass, and the **visitor → first_play** top-of-funnel just got its first
dedicated CRO sweep. Last session shipped **PR #74** (main `464680d`) — LIVE on sweepszn.com, canary
green, every changed surface dogfooded live on prod (curl SSR + a real `/browse` pass, mobile):

- **`ShareHeader`** (new shared component) on `/r/`, `/pe/`, `/sg/`, `/compare/`, `/dex/s/` — a
  wordmark + a 44px **orange** play CTA at the top of every multi-section share permalink. This
  **closed the `/pe/` AND `/sg/` gaps** (a cold X arrival there had NO above-the-fold play path) and
  unified the rest so the gap can't silently come back. `/rank/` normalized to the `ButtonLink`
  primitive. Per-page contextual copy ("Can you beat this? →", "Beat the crowd →", "Fix your five →").
- **ResultCard shared-view CTA inversion** — on a shared permalink the cold viewer's **"Build your own
  five →" is now the primary orange** and Share drops to secondary (their conversion > the sharer's
  re-share). In-game unchanged (Share stays the sharer's primary).
- **Landing** — hero subhead leads with the engine differentiator ("finds every hole in your lineup")
  + 1,170-season credibility; hero + final CTA both **"Draft your five →"** (was vague "Find out →");
  hero example card no longer plays the buzzer reveal (DESIGN.md: the reveal is earned in-game).
  79-3 lives in the `TodaysBest` strip right below, so the subhead is spent on the differentiator.
- **ResultPreview** tagline → "Live engine output — the same model that grades your draft."
- **ModeSelect** subhead → "The best ever found is 79-3 — can you top it?" (cold `/play` arrivals).

Suite 1515 → **1530** green. Plan + vetting record: `docs/plans/2026-06-19-topfunnel-cro.md`. The X
launch is ~June 23. The bar remains **CONVERT + POLISH on a measured, QA'd funnel** — not new
measurement.

FIRST, orient by reading (in this order):
1. MEMORY.md — especially `topfunnel-cro-2026-06-19` (what PR #74 shipped), `most-complete-principle`
   (the standing rule: most complete route, no corners cut), `funnel-measurement-2026-06-18` (how to
   READ the funnel on launch day), `prelaunch-qa-polish-2026-06-18` (the app is in great shape),
   `ingame-suite-2026-06-18` (the §12 integrity rule), and the X-account-launch-state entries.
2. `web/DESIGN.md` (the "Arena" visual system) and root `DESIGN.md` §12 (the trust model) before any UI.
3. `docs/plans/2026-06-19-topfunnel-cro.md` (last session's scope + the rejected/deferred items).

CHECK THE LAUNCH-DAY REALITY FIRST. If the launch has started (or any real traffic exists), sign in
as an ADMIN_UID and pull `GET https://sweepszn.com/api/funnel?days=1` (or open `/admin`) and READ the
funnel — `rates.firstPlay` is the north star; watch `share_view` (loop closing) + `compare_friend`
(viral). The Vercel Web Analytics dashboard is the parallel client funnel. **Let the actual numbers
steer scope — where the loop leaks IS the work.** (Pre-launch there's still no data: `visit`/
`first_play` only count from the PR #71 deploy, and the daily leaderboard is empty.)

ANALYZE, THEN SCOPE (your call — don't just take this list). Strongest candidates:

  • **DEEP-LINK PAST THE MODE-SELECT WALL — the #1 deferred lever (now the top candidate).** PR #74
    optimized the landing + share CTAs but they all still point to `/play` (the 8-option "Pick your
    mode" wall). `first_play` fires on mode-pick, so the wall is the last friction before the
    north-star event. Wire `/play?mode=daily` (Game currently reads only `?c=` for challenges — add
    `?mode=` handling in `Game.tsx start()`/the mount effect; mirror the challenge param plumbing) and
    point the hero + share CTAs there for cold first-timers, so they drop straight into a guided first
    spin instead of choosing among 8 modes. KEEP `/play` (full ModeSelect) reachable (e.g. a "Change
    mode" affordance) so discovery + the returning-user history view aren't lost. This is a GENUINE
    PRODUCT TRADEOFF (friction vs agency/discovery) — if the live funnel is up, let `rates.firstPlay`
    decide; if still pre-launch, reason it through and ship the most-complete version (deep-link +
    escape hatch). TDD the `?mode=` parsing into a tested `lib/` fn; every new behavior gets a test.

  • **SIGN-IN CONVERSION AT THE RIGHT MOMENT** (follow-on to PR #73's anon-first deferral). Sign-in is
    now intent-only. The open question: is the POST-game nudge strong enough for a share-link arrival
    who plays a non-Daily mode? `SignInSaveNudge` shows on Classic/HoopIQ/Prime; Leaderboard prompts
    on Daily. Consider a clearer "save your record / claim your rank" moment on the ResultCard
    (post-commit, §12-safe) and measure signin rate off the funnel. Lower priority than the mode wall.

  • **SLOT-PICK CROWD REVEAL is logged but still UNWIRED beyond the between-picks note.** `/api/crowd`
    + `CROWD_MIN=20` (lib/socialStore.ts) compute "X% took Player at SLOT here" (Game.tsx `place()`
    setCrowdNote, shown in the spin-prompt empty-state between picks). Decide: surface it more
    prominently post-commit (§12-safe social proof) or document as volume-gated-for-later. Only
    matters once launch traffic accrues.

  • **Secondary / post-launch:** referral/retention loops; per-page OG for the marketing routes;
    `utm_source` acquisition attribution; the "completes ≈ evaluate calls incl. What-If" funnel
    impurity (only matters if you start trusting completion rate precisely). Also a tiny consistency
    nit deferred from PR #74: the global `SiteFooter` CTA still says "Build your own →" while the
    landing standardized on "Draft your five →" — harmonize if you touch the footer.

Re-scope freely if the live funnel or fresh analysis points elsewhere.

THE INTEGRITY PHILOSOPHY (non-negotiable — root `DESIGN.md` §12): DESCRIPTIVE (who/what a player is:
real stats, accolades, era/collection context; the public 79-3 / 82-0 / 1,170 facts) = safe anytime.
PRESCRIPTIVE / engine-internal (per-candidate marginal wins, fit deltas as a number, best-pick stars,
peak_score) = GATE behind the 2-hint economy or DEFER to POST-COMMIT. Gold = S/A+ elite tier only;
green/red = win/loss; orange is the ONLY CTA color (one per row); mode accents (violet/cyan/rose) for
mode chips/icons only.

THE MOST-COMPLETE PRINCIPLE (standing rule): always take the MOST COMPLETE route — no shortcuts, no
corners cut. Cover every surface/mode/case (QA all modes on BOTH viewports; audit EVERY permalink, not
a sample — that's how PR #74 caught the `/sg/` gap the teardown missed), run the full adversarial
review, fix every actionable finding, complete the entire ship loop. When tempted to sample or defer,
don't — finish it, or surface the tradeoff explicitly for the user to decide.

CONVENTIONS (must follow): CUSTOMIZED Next.js — read `node_modules/next/dist/docs/` before writing
Next code (App Router async params; file-convention routes/OG). TDD always (red→green→refactor).
Hermetic Vitest (`npx vitest run`, full no-arg — config excludes `.claude` worktrees). EVERY new API
route needs a test in `test/routes/` AND a `ROUTE_TO_TEST` entry. Logic lives in tested `lib/`
functions; components/pages stay thin (node-env unit + jsdom component tests, `// @vitest-environment
jsdom`). Permalink pages are async RSC with no page-unit-test idiom — cover shared logic in a tested
component (like `ShareHeader`) + `tsc` + `build` + live dogfood. For browser QA use the gstack
`/browse` skill; SPIN needs a JS `.click()`, desktop court-slot placement beats the mobile bottom-sheet
for scripted drafts. **Tip from PR #74:** you can mint valid share permalinks WITHOUT a full
playthrough — `/r/<id1,id2,id3,id4,id5>` (comma-joined real player ids; the ResultPreview HERO_IDS
five works), `/pe/<y>.<n>.x.<ids>`, `/sg/<ids>.<outIdx>.<inId>`, `/rank/<scopeCode>.<rank>.<total>.
<wins>.<losses>.<net*10>.<base64url(name)>` — great for fast SSR verification. Plans/specs go in
`docs/plans/`.

FULL AUTONOMY (you have it — don't stop to ask, except genuine product tradeoffs like the deep-link
decision above): work on a feature branch off main (NEVER commit to main). TDD each change → keep
`tsc`, eslint, and the full vitest suite green → commit (end messages with
`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`). When the set is done: run a
multi-dimension adversarial code-review Workflow (see PR #71/#72/#74), fix every actionable finding
(VERIFY the flagged ones empirically before "fixing" — PR #74's lone "blocker" was a false positive,
disproved by reading `ResultCard.tsx:376` where `ShareButton` defaults to outlined, not orange), run
`npm run build` (must pass), push, open a PR to main (body ends with the
`🤖 Generated with Claude Code` line), wait for CI green, merge with `--delete-branch`, then VERIFY the
production deploy: poll until the new code serves on sweepszn.com (a client marker like a CTA-copy
change or an `/r/` SSR change is a good signal — note CDN edges propagate over ~40s, so poll for
several consecutive clean reads), check `/api/health` (canary), and dogfood the changed surfaces live
(`/browse`). Report the final live state.

WHEN EVERYTHING IS DONE AND VERIFIED DEPLOYED: write a prompt (for me to paste into the next fresh
session) that proposes and scopes the NEXT most-valuable work — grounded in the codebase, the memory,
and wherever the launch stands by then. Hand it off carrying this SAME philosophy: full autonomy, the
§12 integrity rule, the most-complete principle, TDD, the full ship→merge→verify-deploy loop — and
tell that session to likewise end by teeing up the one after it.

and u can do multiple things if you want! sky is the limit. remember the most complete option principle
