# Next-session kickoff prompt (paste into a fresh session)

Pick up SweepSzn pre-launch/launch work with full autonomy to ship. The funnel is MEASURED **and now
attributable by channel**, the whole loop has had a full live QA pass, the top-of-funnel and the
mode-select wall are optimized, and the post-game sign-in moment now covers every mode. Last session
shipped **PR #76** (main `7b7341e`) — LIVE on sweepszn.com, canary green, verified behaviorally on BOTH
viewports via `/browse` (deep-link auto-start + `utm` persisted + `first_play` + `/play` visit beacon
all fire; a `/rank/` permalink emits its beacon; zero console errors):

- **`utm_source` acquisition attribution into the OWNED funnel.** New `lib/utm.ts`
  (`currentUtmSource`/`getUtmSource`/`captureUtm`, first-touch, sanitized lowercase ≤40-char labels) +
  `UtmCapture` mounted in the **root layout** (captures on every route). `source` threaded
  `ev()`→`parseEvBody`(its own block)→`bump()` (`ev:src:{first_play,visit}:<day>` hashes, **HLEN-capped
  `EV_SRC_CAP=500`**)→`getMetrics().sourceSplit`→**`/admin` "Acquisition by source" + `/api/funnel`**.
  `markFirstPlay(uid, source)` reads the URL directly (robust to effect ordering). **Visit beacons added
  to every entry surface**: `/play` (via `play/layout.tsx`) + `visit`+`share_view` on `/sg/ /compare/
  /dex/s/ /rank/`.
- **Sign-in nudge on every non-Daily result.** New tested `lib/signinNudge.showsSaveNudge(mode) =
  mode !== "daily"`; `Game` now renders `SignInSaveNudge` for Classic/HoopIQ/Prime **and the previously
  naked FactorHunt/Blueprint/Surgeon/Challenge** results. Daily keeps its richer Leaderboard
  claim-your-rank prompt. (Chose coverage-via-existing-component over an in-card ResultCard moment — more
  complete: Surgeon uses `SurgeonResult`, not `ResultCard`; lower-risk; one treatment.)

Suite 1547 → **1581** green. Plan + vetting: `docs/plans/2026-06-21-launch-attribution-signin.md`. A
5-dim adversarial review Workflow (**34 agents**, per-finding verify) caught a real HIGH bug — the
deep-link `first_play` lost its source because React fires the Game child effect before the root-layout
`UtmCapture` effect (localStorage empty); fixed by reading the URL directly, mirroring `Beacon.tsx`. The
X launch is **~June 23** — it may have STARTED by now. The bar remains **CONVERT + POLISH + now READ
THE ATTRIBUTED FUNNEL** — not new measurement.

FIRST, orient by reading (in this order):
1. MEMORY.md — especially `launch-attribution-signin-2026-06-21` (what PR #76 shipped + how to read
   `sourceSplit`), `funnel-measurement-2026-06-18` (how to READ the funnel), `most-complete-principle`
   (the standing rule), `deeplink-mode-2026-06-20` + `topfunnel-cro-2026-06-19` (the CRO lineage), the
   §12 rule in `ingame-suite-2026-06-18`, and the X-account-launch-state entries.
2. `web/DESIGN.md` ("Arena") and root `DESIGN.md` §12 (the trust model) before any UI.
3. `docs/plans/2026-06-21-launch-attribution-signin.md` (last session's scope + the deferred list).

CHECK THE LAUNCH-DAY REALITY FIRST (this is now the highest-leverage move). If the launch has started
(or any real traffic exists), sign in as an ADMIN_UID and pull `GET https://sweepszn.com/api/funnel?days=1`
(or open `/admin`) and READ the funnel. The NEW signal: **`sourceSplit.firstPlay` / `.visit`** split the
north star by channel — `conv = first-plays/visits` per `utm_source` tells you **which X post/link
actually converted**. Also watch `rates.firstPlay` (north star), `rates.capture` (signins/completes — did
the wider nudge lift sign-ins?), `share_view` + `compare_friend` (loop + viral). **Let the numbers steer:
where the loop leaks, and which channel underperforms, IS the work.** (Pre-launch there's still little
data: tag every launch link with `?utm_source=<channel>` so the attribution has something to split.)

ANALYZE, THEN SCOPE (your call — don't just take this list). Strongest candidates:

  • **PER-PAGE OG IMAGES for the marketing routes** (`/about`, `/how-it-works`, `/leaderboards`) — the
    long-deferred concrete build (deferred by PRs #74/#75/#76). They share the generic site card; a
    per-route `opengraph-image` lifts share CTR on exactly the links you're seeding on launch day. The
    infra exists: `/r/`, `/pe/`, `/sg/`, `/dex/s/`, `/rank/` already have `opengraph-image` routes (see
    `app/**/opengraph-image.tsx`) — mirror the pattern for the three `(site)` marketing routes. Cover
    EVERY marketing route, not a sample.

  • **PER-NUDGE INSTRUMENTATION (now that the nudge is everywhere).** PR #76 deferred per-nudge
    impression/tap stages. Add `claim_nudge_shown` / `claim_nudge_tap` `CLIENT_STAGES` (fired from
    `SignInSaveNudge`, mode-tagged) so you can measure the nudge's OWN funnel (shown→tap→signin) per
    mode, not just the global `rates.capture`. Cheap; high value once traffic exists. TDD into `lib/` +
    `evServer`/`metrics`/`/admin`. (Reuse the `source`-threading idiom from PR #76.)

  • **SLOT-PICK CROWD REVEAL** is logged but still UNWIRED beyond the between-picks note. `/api/crowd` +
    `CROWD_MIN=20` (lib/socialStore.ts) compute "X% took Player at SLOT". Decide: surface it more
    prominently post-commit (§12-safe social proof) once launch volume accrues, or keep documented.

  • **Secondary / post-launch:** referral/retention loops; a per-source conversion-rate alert on
    `/admin` (flag a channel whose `first_play/visit` is far below the rest); the "completes ≈ evaluate
    calls incl. What-If" funnel impurity (only if you start trusting completion rate precisely).

Re-scope freely if the live funnel or fresh analysis points elsewhere — the attributed funnel is the
new compass.

THE INTEGRITY PHILOSOPHY (non-negotiable — root `DESIGN.md` §12): DESCRIPTIVE (who/what a player is:
real stats, accolades, era/collection context; the public 79-3 / 82-0 / 1,170 facts; a `utm_source`
channel label) = safe anytime. PRESCRIPTIVE / engine-internal (per-candidate marginal wins, fit deltas
as a number, best-pick stars, peak_score) = GATE behind the 2-hint economy or DEFER to POST-COMMIT.
Gold = S/A+ elite tier only; green/red = win/loss; orange is the ONLY CTA color (one per row); mode
accents (violet/cyan/rose) for mode chips/icons only.

THE MOST-COMPLETE PRINCIPLE (standing rule): always take the MOST COMPLETE route — no shortcuts, no
corners cut. Cover every surface/mode/case (QA all modes on BOTH viewports; audit EVERY route, not a
sample — that's how PR #76 added visit beacons to ALL entry surfaces, and the review caught the missing
ones + the effect-ordering bug + the uncapped hash). Run the full adversarial review, **VERIFY each
flagged finding empirically before "fixing"** (PR #76's review correctly rejected 2 of 29 false
positives), fix every actionable one, complete the entire ship loop. **GOTCHA (reconfirmed every PR):**
the Edit tool silently errors "File has not been read yet" if you haven't `Read` the file in-session —
ALWAYS Read before Edit, and **grep the file on disk (or `git diff --stat`) to confirm a batch landed**
before trusting it.

CONVENTIONS (must follow): CUSTOMIZED Next.js — read `node_modules/next/dist/docs/` before writing Next
code (App Router async params; file-convention routes incl. **`opengraph-image`**). TDD always
(red→green→refactor). Hermetic Vitest (`npx vitest run` from `web/`, full no-arg — config excludes
`.claude` worktrees). EVERY new API route needs a test in `test/routes/` AND a `ROUTE_TO_TEST` entry.
Logic lives in tested `lib/` functions; components/pages stay thin (node-env unit + jsdom component
tests, `// @vitest-environment jsdom`). Permalink/marketing pages are async RSC with no page-unit-test
idiom — cover shared logic in a tested `lib`/component + `tsc` + `build` + live dogfood. For browser QA
use the gstack `/browse` skill (`$B` resolves to the dist binary; client-rendered behavior like the
`?mode=`/`utm` capture is invisible to curl — use `/browse` + a `js` check on `localStorage`). **Mint
share permalinks WITHOUT a playthrough** for fast SSR verification: `/r/<id1,…,id5>` (comma-joined real
ids — e.g. `michael_jordan_chi_1980s_1988,lebron_james_cle_2000s_2009,david_robinson_sas_1990s_1994,
wilt_chamberlain_sfw_1960s_1963,nikola_joki_den_2020s_2024`), `/rank/<scope>.<rank>.<total>.<wins>.
<losses>.<net*10>.<b64url name>` (e.g. `/rank/d.5.1000.79.3.130.UGxheWVy`; "Player"→`UGxheWVy`),
`/pe/<y>.<n>.x.<ids>`, `/sg/<ids>.<outIdx>.<inId>`, `/dex/s/<count>.<badges>~<ids>`, `/compare/<ids>/
<ids>`. **Player ids in `web/public/data/players.json` are `"id": "<name>_<team>_<decade>_<year>"`
(note the SPACE in the JSON key — grep `'"id": "'`).** Plans/specs go in `docs/plans/`.

FULL AUTONOMY (you have it — don't stop to ask, except genuine product tradeoffs): work on a feature
branch off main (NEVER commit to main). TDD each change → keep `tsc`, eslint, and the full vitest suite
green → commit (end messages with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`).
When the set is done: run a multi-dimension adversarial code-review Workflow (see PR #71/#74/#75/#76),
fix every actionable finding (VERIFY the flagged ones empirically before "fixing" — false positives are
common), run `npm run build` (must pass), push, open a PR to main (body ends with the `🤖 Generated with
Claude Code` line), wait for CI green, merge with `--delete-branch`, then VERIFY the production deploy:
poll until the new code serves on sweepszn.com (this PR has client markers — use `/browse` + a `js`/
localStorage check; the GitHub deployments API does NOT track Vercel prod here), check `/api/health`
(canary), and dogfood the changed surfaces live (`/browse`, both viewports). Report the final live state.

NOTE: this kickoff + the staged deletion of `next-session-2026-06-21.md` are the handoff roll — bundle
them into your first PR (as PR #76 bundled the 06-20→06-21 roll).

WHEN EVERYTHING IS DONE AND VERIFIED DEPLOYED: write a prompt (for me to paste into the next fresh
session) that proposes and scopes the NEXT most-valuable work — grounded in the codebase, the memory,
and wherever the launch stands by then (read the attributed funnel!). Hand it off carrying this SAME
philosophy: full autonomy, the §12 integrity rule, the most-complete principle, TDD, the full
ship→merge→verify-deploy loop — and tell that session to likewise end by teeing up the one after it.

and u can do multiple things if you want! sky is the limit. remember the most complete option principle
