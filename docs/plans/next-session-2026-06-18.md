# Next-session kickoff prompt (paste into a fresh session)

Pick up SweepSzn pre-launch work with full autonomy to ship. The post-game ResultCard density
pass is COMPLETE and LIVE — PR #70 (main 3004229) restructured the card share-first: the deep
tools (Scouting / What-If Lab / Compare) now sit in a collapsed, lazy-mounted ExploreZone BELOW
the Share CTA so the growth loop isn't buried; the Prime gate bug (Game + /pe/) is fixed; and the
previously-silent engagement surfaces now emit analytics. Dogfooded live on mobile, canary green,
1471 tests. The X launch is ~June 23 (a few days out). The bar is still CONVERT + POLISH +
now MEASURE — not new features.

FIRST, orient by reading (in this order):
  1. MEMORY.md — especially `resultcard-share-first-2026-06-18` (what just shipped + the
     reconciliation/volume-gating findings), `ingame-suite-2026-06-18` + `ingame-deferred-suite-2026-06-18`
     (the in-game surfaces and the §12 integrity rule), `launch-readiness-2026-06-17` +
     `launch-prep-share-credit-2026-06-18` (where launch eng stands — "remaining = OWNER-TIME"),
     and the X launch state entries.
  2. web/DESIGN.md (the "Arena" visual system) and root DESIGN.md §12 (the trust model) before
     touching any UI.
  3. docs/ux-teardown-2026-06-17.md — note Waves 0–6 are ALL already in main; the
     `feat/ux-polish-sweep` branch is STALE (zero unique commits, safe to delete — a trivial cleanup).
Use subagents (Explore/general-purpose) for codebase exploration to protect context.

ANALYZE, THEN SCOPE (your call — don't just take this list). The launch is measurable-or-not on day
one, and a few real polish gaps remain. Strongest candidates, grounded in the code + the ~Jun 23 launch:

  • LAUNCH FUNNEL MEASUREMENT (likely #1 — you optimize what you measure). The north star is
    visitor → first-play → share, but there is NO real-time `first_play` signal: `ev()` (lib/ev.ts)
    accepts only `"play" | "share"` and `Game.tsx` fires `ev("play")` on EVERY start with no
    first-play gate (it's only post-hoc derivable from Redis by uid). Scope: add a clean, complete
    funnel taxonomy (visit → first_play → lineup_complete → share, plus the new explore_open /
    whatif_open / compare_open / compare_friend engagement events from PR #70), and a way to READ it
    on launch day (a tested `/api/funnel` summary route over the Redis `ev` keys, or confirm the
    Vercel dashboard + ev() keys already cover it). TDD-able, every new route needs a test in
    test/routes/ + a ROUTE_TO_TEST entry. Verify all stages fire live across modes + mobile.

  • FULL PRE-LAUNCH LIVE QA + DESIGN POLISH SWEEP across the WHOLE funnel (landing → mode select →
    in-game draft for each of the 6 modes → reveal → share → /r/ + /pe/ permalinks), mobile AND
    desktop, using /browse or /qa. Fix what's janky. This session only dogfooded the ResultCard;
    the rest of the funnel deserves a live pass before launch.

  • DEFERRED DESKTOP IN-GAME LAYOUT (flagged in docs/ux-teardown-2026-06-17.md "Deferred follow-ups"):
    on desktop the reels/controls float center-wide above the grid, so the top-right reads empty /
    sparse. The clean fix folds reels+controls into the grid's left column so the sticky court becomes
    a right rail — a ~110-line restructure of Game.tsx's most complex render, "too subtle-regression-
    prone to ship unsupervised." Do this WITH /design-review (or /plan-design-review) and the user
    awake. Mobile in-game is unaffected.

  • VISITOR → FIRST-PLAY (top-of-funnel CRO). PR #70 optimized first-play → share; the landing →
    first-spin leg (LandingSection, the "Find out →" CTA, time-to-first-spin) is the other half.

  • Secondary / post-launch: the slot-pick crowd reveal is logged but UNWIRED (no UI consumes
    /api/crowd, CROWD_MIN=20 in lib/socialStore.ts) — a "data now, reveal later" choice to either
    wire up or document; referral/retention loops; the desktop layout above.

Re-scope freely if fresh analysis or live analytics points elsewhere. North star: visitor →
first-play, and at launch, first-play → share.

THE INTEGRITY PHILOSOPHY (non-negotiable — root DESIGN.md §12; governs every surface):
DESCRIPTIVE (who/what a player is: real stats, accolades, era/collection context) = safe anytime.
PRESCRIPTIVE / engine-internal (per-candidate marginal wins, fit deltas as a number, best-pick stars,
peak_score) = GATE behind the 2-hint economy or DEFER to POST-COMMIT. Timing is the lever. Gold is
reserved for the S/A+ elite tier only; green/red = win/loss; orange is the ONLY CTA color; mode
accents (violet/cyan/rose) for mode chips only.

CONVENTIONS (must follow):
  • CUSTOMIZED Next.js — read the relevant guide in node_modules/next/dist/docs/ before writing Next
    code (App Router async params; file-convention routes/OG).
  • TDD always (red → green → refactor). Hermetic Vitest (`npx vitest run`, full no-arg run — the
    config excludes .claude worktrees; if discovery balloons to ~218 files, rename web/node_modules/.vite).
    EVERY new API route needs a test in test/routes/ AND a ROUTE_TO_TEST entry in
    routeCoverage.meta.test.ts. Logic lives in tested lib/ functions; components/pages stay thin
    (node-env unit tests + jsdom component tests via @testing-library, `// @vitest-environment jsdom`).
    Plans/specs go in docs/plans/ (docs/superpowers/ is frozen).

FULL AUTONOMY (you have it — don't stop to ask):
  Work on a feature branch off main (NEVER commit to main). TDD each change → keep tsc
  (`npx tsc --noEmit`), eslint, and the full vitest suite green → commit (end messages with
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`). When the set is done:
  run a code-reviewer (a multi-dimension adversarial Workflow is ideal — see PR #70), fix every
  actionable finding, run `npm run build` (must pass), push, open a PR to main (body ends with the
  🤖 Generated with Claude Code line), wait for CI green, merge with --delete-branch, then VERIFY
  the production deploy: poll until the new code serves on sweepszn.com (a /r/ SSR permalink is a
  great marker), check /api/health (canary), and dogfood the changed surfaces live (/browse).
  Report the final live state.

WHEN EVERYTHING IS DONE AND VERIFIED DEPLOYED:
  Write a prompt (for me to paste into the next fresh session) that proposes and scopes the NEXT
  most-valuable work for SweepSzn — grounded in the codebase, the memory, and wherever the ~Jun 23
  launch stands by then (launch-day funnel reality, retention, a data/feature gap, post-launch
  growth). Hand it off carrying this SAME philosophy: full autonomy, the §12 integrity rule, TDD,
  and the full ship→merge→verify-deploy loop — and tell that session to likewise end by teeing up
  the one after it.
