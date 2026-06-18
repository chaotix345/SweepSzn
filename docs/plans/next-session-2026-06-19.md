# Next-session kickoff prompt (paste into a fresh session)

Pick up SweepSzn pre-launch work with full autonomy to ship. The funnel is MEASURED **and** the whole
loop has had its first honest live QA pass. Two PRs shipped last session (both LIVE, canary green):
**PR #72** (main `957f38e`) — a full pre-launch QA sweep (landing → mode select → in-game draft for ALL 8
modes → reveal → share → `/r/`·`/pe/`·`/sg/` permalinks + OG, mobile AND desktop) plus three fixes: a
mobile **post-placement scroll** fix (`lib/scroll.ts` — placing a pick collapsed the candidate browser,
clamping the scroll below the reels), the deferred **desktop in-game layout restructure** (reels+controls
into the grid's left column so the half-court is a right rail — dead space gone), and the mode-tile
**"Play →" CTA color** (now orange per DESIGN.md). **PR #73** (main `0894b04`) — **deferred Google One Tap
to user intent**: GSI no longer loads or prompts on the landing page (anon-first, §12); the sign-in
popover now mounts only on intent and is a proper a11y dialog (role/aria/focus/Escape). Suite at 1515. The
X launch is ~June 23. The bar is **CONVERT + POLISH on a measured, QA'd funnel** — not new measurement.

FIRST, orient by reading (in this order):
  1. MEMORY.md — especially `prelaunch-qa-polish-2026-06-18` (what PRs #72+#73 shipped + the app is in
     great shape), `most-complete-principle` (the user's standing rule: take the most complete route, no
     corners cut), `funnel-measurement-2026-06-18` (how
     to READ the funnel on launch day), `resultcard-share-first-2026-06-18` (the share-first card),
     `ingame-suite-2026-06-18` (the §12 integrity rule), and the X launch state entries.
  2. web/DESIGN.md (the "Arena" visual system) and root DESIGN.md §12 (the trust model) before any UI.
  3. docs/plans/2026-06-18-funnel-measurement.md (the measurement design + how to curl the funnel).

CHECK THE LAUNCH-DAY REALITY FIRST. If the launch has started (or any real traffic exists), sign in as an
ADMIN_UID and pull `GET https://sweepszn.com/api/funnel?days=1` (or open /admin) and READ the funnel
(`rates.firstPlay` is the north star; watch `share_view` + `compare_friend`). Let the actual numbers steer
scope — where the loop leaks IS the work. The Vercel Analytics dashboard is the parallel client funnel.

ANALYZE, THEN SCOPE (your call — don't just take this list). Strongest candidates:

  • VISITOR → FIRST-PLAY top-of-funnel CRO (now measurable; LIKELY #1 if not launched). PR #70 optimized
    first-play→share; the landing → first-spin leg is the other half — the LandingSection "Find out →"
    CTA, the scoreboard hero, the mobile order (headline→CTA→card, verified), time-to-first-spin, the
    `/play` mode-select first-impression. With `visit`/`first_play` live you can A/B-reason about it.
    TDD any logic into tested `lib/`; keep components thin. The single biggest measurable growth lever.

  • SIGN-IN CONVERSION AT THE RIGHT MOMENT (follow-on to PR #73, which deferred One Tap to intent).
    Now that sign-in is anon-first, the open question is whether the POST-game sign-in nudge is strong
    enough — `SignInSaveNudge` ("Save with Google →") shows on Classic/HoopIQ/Prime results, the
    Leaderboard prompts on Daily, but a share-link arrival who plays a non-Daily mode still has a thin
    reason to sign in. Consider: a clearer "save your record / claim your rank" moment on the result card
    (post-commit, §12-safe), and measure signin rate off the funnel. Lower priority than top-of-funnel.

  • SLOT-PICK CROWD REVEAL is logged but UNWIRED — no UI consumes `/api/crowd`, `CROWD_MIN=20`
    (lib/socialStore.ts). The post-commit crowd note ("X% took Player at SLOT here") is computed in
    Game.tsx `place()` (`setCrowdNote`) and rendered in the spin-prompt empty-state, BUT only shows
    between picks. Decide: surface it more prominently (post-commit, §12-safe) or document as
    volume-gated-for-later. Social proof is a retention lever once traffic exists.

  • Secondary / post-launch: referral/retention loops; per-page OG for the marketing routes; utm_source
    acquisition attribution; the "completes ≈ evaluate calls incl. What-If" funnel impurity (documented,
    only matters if you start trusting completion rate precisely).

Re-scope freely if the live funnel or fresh analysis points elsewhere.

THE INTEGRITY PHILOSOPHY (non-negotiable — root DESIGN.md §12): DESCRIPTIVE (who/what a player is: real
stats, accolades, era/collection context) = safe anytime. PRESCRIPTIVE / engine-internal (per-candidate
marginal wins, fit deltas as a number, best-pick stars, peak_score) = GATE behind the 2-hint economy or
DEFER to POST-COMMIT. Gold = S/A+ elite tier only; green/red = win/loss; orange is the ONLY CTA color;
mode accents (violet/cyan/rose) for mode chips only.

THE MOST-COMPLETE PRINCIPLE (the user's standing rule): always take the MOST COMPLETE route — no
shortcuts, no corners cut. Cover every surface/mode/case (QA all modes on BOTH viewports), run the full
adversarial review, fix every actionable finding, complete the entire ship loop. When tempted to sample
or defer, don't — finish it, or surface the tradeoff explicitly for the user to decide.

CONVENTIONS (must follow): CUSTOMIZED Next.js — read node_modules/next/dist/docs/ before writing Next
code (App Router async params; file-convention routes/OG). TDD always (red→green→refactor). Hermetic
Vitest (`npx vitest run`, full no-arg — config excludes .claude worktrees; if discovery balloons to ~218
files, rename web/node_modules/.vite). EVERY new API route needs a test in test/routes/ AND a
ROUTE_TO_TEST entry. Logic lives in tested lib/ functions; components/pages stay thin (node-env unit +
jsdom component tests, `// @vitest-environment jsdom`). For browser QA use the gstack `/browse` skill;
note the SPIN button needs a JS `.click()` (Playwright click misses the animated button) and desktop
court-slot placement is more reliable than the mobile bottom-sheet for scripted drafts. Plans/specs go in
docs/plans/.

FULL AUTONOMY (you have it — don't stop to ask, except genuine product tradeoffs like the One Tap
decision): Work on a feature branch off main (NEVER commit to main). TDD each change → keep tsc
(`npx tsc --noEmit`), eslint, and the full vitest suite green → commit (end messages with
`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`). When the set is done: run a
multi-dimension adversarial code-review Workflow (see PR #71/#72), fix every actionable finding (verify
the flagged ones empirically before "fixing" — PR #72's one finding was a false positive caught by a
main-vs-branch measurement), run `npm run build` (must pass), push, open a PR to main (body ends with the
🤖 Generated with Claude Code line), wait for CI green, merge with --delete-branch, then VERIFY the
production deploy: poll until the new code serves on sweepszn.com (a client marker like a CTA color or a
/r/ SSR change is a good signal), check /api/health (canary), and dogfood the changed surfaces live
(/browse). Report the final live state.

WHEN EVERYTHING IS DONE AND VERIFIED DEPLOYED: Write a prompt (for me to paste into the next fresh
session) that proposes and scopes the NEXT most-valuable work — grounded in the codebase, the memory, and
wherever the launch stands by then. Hand it off carrying this SAME philosophy: full autonomy, the §12
integrity rule, the most-complete principle, TDD, the full ship→merge→verify-deploy loop — and tell that
session to likewise end by teeing up the one after it.
