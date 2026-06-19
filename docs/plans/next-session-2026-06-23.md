# Next-session kickoff prompt (paste into a fresh session)

Pick up SweepSzn launch/post-launch work with full autonomy to ship. The funnel is MEASURED, **attributable
by channel (utm_source)**, **and now the post-game sign-in nudge has its OWN per-mode funnel** — plus every
marketing route finally has its own share card. Last session shipped **PR #77** (main `4d998cc`) — LIVE on
sweepszn.com, canary green, verified on prod (all 4 marketing OG images render `200 image/png` with per-page
`og:title`; the og:image hashes match the built commit; `claim_nudge_shown` confirmed present in the live
`/play` bundle):

- **Per-page marketing OG cards + metadata.** The 4 static marketing routes (`/about`, `/how-it-works`,
  `/leaderboards`, `/dex`) had been serving the GENERIC root OG card AND the generic `og:title`/`og:description`
  (each page set only `metadata.title`, so Next inherited the root layout's `openGraph` verbatim — a child
  `openGraph`/`twitter` REPLACES the parent's whole object). New tested **`lib/marketingMeta.ts`** (one source of
  truth per route: title/description/`ogTitle` + OG card config + a `marketingMetadata(route)` helper that
  re-specifies `openGraph` siteName/type and `twitter` card/site/creator so the shallow-replace doesn't drop
  them) + **`marketingOgElement`** in `lib/og.tsx` + 4 co-located `opengraph-image.tsx` routes. Each page now
  spreads `marketingMetadata(route)` and emits a distinct card + share text.
- **Sign-in nudge instrumentation.** New mode-tagged client stages **`claim_nudge_shown` / `claim_nudge_tap`**
  end-to-end: `evServer` (added to `CLIENT_STAGES`; new `MODE_STAGES` gate; per-mode `ev:nudge:<stage>:<day>`
  hash; deliberately excluded from `ev:active`), `metrics` (`engagement.claimNudgeShown/Tap` + `nudgeSplit{shown,
  tap}`), `/admin` ("Sign-in nudge by mode" shown→tap rate), `/api/funnel` returns it automatically.
  `SignInSaveNudge` fires the beacons (hook called unconditionally, guarded by `show`, **`useRef` latch** so the
  impression fires at most once per mount — a review-caught double-fire on sign-out); `Game` passes `mode` at both
  call sites.

Suite 1581 → **1621** green. Plan + vetting: `docs/plans/2026-06-21-launch-attribution-signin.md` (last session's
theme) and the PR #77 description. A 5-dim adversarial review Workflow (**10 agents**, per-finding empirical
verify) returned **0 false positives**; both confirmed findings were fixed (the impression double-fire + `/dex`
`alternates.canonical` parity). The X launch is **~June 23** — it may be live NOW. The bar remains **READ THE
ATTRIBUTED + NUDGE FUNNEL, CONVERT, POLISH** — not new measurement.

FIRST, orient by reading (in this order):
1. MEMORY.md — especially `launch-og-nudge-2026-06-19` (what PR #77 shipped + how to read `nudgeSplit`),
   `launch-attribution-signin-2026-06-21` (utm `sourceSplit`), `funnel-measurement-2026-06-18` (how to READ the
   funnel), `most-complete-principle` (the standing rule), and the X-account-launch-state entries.
2. `web/DESIGN.md` ("Arena") and root `DESIGN.md` §12 (the trust model) before any UI.
3. The PR #77 description on GitHub (last session's scope + the deferred list below).

CHECK THE LAUNCH-DAY REALITY FIRST (highest-leverage move). If the launch has started (or any real traffic
exists), sign in as an ADMIN_UID and pull `GET https://sweepszn.com/api/funnel?days=1` (or open `/admin`) and READ
the funnel. The signals, richest-first:
  - **`sourceSplit.firstPlay` / `.visit`** — conv = first-plays/visits per `utm_source`: which X post/link
    actually converted. (Tag every launch link `?utm_source=<channel>` so there's something to split.)
  - **`nudgeSplit.shown` / `.tap`** (NEW) — per-mode tap rate of the post-game sign-in nudge. A high shown / low
    tap mode = the nudge copy or placement isn't earning the account; a low shown = few non-Daily finishers.
  - `rates.firstPlay` (north star), `rates.capture` (signins/completes — did the nudge lift sign-ins?),
    `share_view` + `compare_friend` (loop + viral).
  **Let the numbers steer: where the loop leaks, and which channel/mode underperforms, IS the work.**

ANALYZE, THEN SCOPE (your call — don't just take this list). Strongest candidates:

  • **PER-SOURCE / PER-NUDGE CONVERSION ALERTS on `/admin`** — now that both `sourceSplit` and `nudgeSplit`
    exist, surface a flag when a channel's `first_play/visit` (or a mode's nudge tap-rate) is far below the rest
    of the window. Cheap (builds directly on PR #76/#77 data), high-value once traffic exists — turns the raw
    splits into an at-a-glance "this is leaking" signal. TDD into `lib/metrics` (a pure outlier helper) + `/admin`.

  • **REFERRAL / INVITE LOOP** — the biggest un-built growth lever. `compare_friend` and the H2H Challenge already
    exist but there's no first-class "invite a friend, both get credited" attribution. Design a §12-safe referral
    (descriptive: a share/invite code in the URL → attributed `first_play` like `utm_source`, reusing the PR #76
    source-threading idiom). Post-launch retention/virality compounder. Brainstorm scope before building.

  • **`@SweepSeason` handle consolidation** (deferred NIT from PR #77's review) — the literal is hardcoded in
    `app/layout.tsx` + ~8 permalink route metadata blocks + `lib/marketingMeta.ts` (`X_HANDLE`). Export one
    `X_HANDLE`/`TWITTER_HANDLE` from `lib/site.ts` (next to `SITE_NAME`) and use it everywhere — most-complete
    cleanup so a handle change is one edit. Small, all-or-nothing (don't half-do it).

  • **SLOT-PICK CROWD REVEAL** is ALREADY wired (the between-picks `crowdNote`, `/api/crowd` + `CROWD_MIN=20`,
    §12-safe, volume-gated) — confirmed in PR #77's mapping, NOT unwired as older notes said. Only open work is to
    surface it MORE prominently post-commit once launch volume crosses the gate — decide once data exists.

  • **Secondary:** the "completes ≈ evaluate calls incl. What-If" funnel impurity (only if you start trusting
    completion rate precisely); per-page OG for any other shared surface if one emerges.

Re-scope freely if the live funnel or fresh analysis points elsewhere — the attributed + nudge funnel is the
compass.

THE INTEGRITY PHILOSOPHY (non-negotiable — root `DESIGN.md` §12): DESCRIPTIVE (who/what a player is: real stats,
accolades, era/collection context; the public 79-3 / 82-0 / 1,170 facts; a `utm_source` or referral channel
label; marketing copy) = safe anytime. PRESCRIPTIVE / engine-internal (per-candidate marginal wins, fit deltas as
a number, best-pick stars, peak_score) = GATE behind the 2-hint economy or DEFER to POST-COMMIT. Gold = S/A+ elite
tier only; green/red = win/loss; orange is the ONLY CTA color (one per row); mode accents (violet/cyan/rose) for
mode chips/icons only.

THE MOST-COMPLETE PRINCIPLE (standing rule): always take the MOST COMPLETE route — no shortcuts, no corners cut.
Cover every surface/mode/case (QA all modes on BOTH viewports; audit EVERY route, not a sample — that's how PR #77
gave ALL 4 inheriting marketing routes their own card+metadata, and the review caught the impression double-fire +
the `/dex` canonical gap). Run the full adversarial review, **VERIFY each flagged finding empirically before
"fixing"** (PR #77's review had 0 false positives but PR #76's correctly rejected 2 — always verify), fix every
actionable one, complete the entire ship loop. **GOTCHA (reconfirmed every PR):** the Edit tool silently errors
"File has not been read yet" if you haven't `Read` the file in-session — ALWAYS Read before Edit, and **grep the
file on disk (or `git diff --stat`) to confirm a batch landed**.

CONVENTIONS (must follow): CUSTOMIZED Next.js — read `node_modules/next/dist/docs/` before writing Next code (App
Router async params; file-convention routes incl. **`opengraph-image`**; **metadata is shallow-merged PER KEY — a
child `openGraph`/`twitter` REPLACES the parent's whole object**, so re-carry siteName/type/card/site/creator —
see `lib/marketingMeta.ts`). TDD always (red→green→refactor). Hermetic Vitest (`npx vitest run` from `web/`, full
no-arg — config excludes `.claude` worktrees). EVERY new API route needs a test in `test/routes/` AND a
`ROUTE_TO_TEST` entry (`test/routes/routeCoverage.meta.test.ts`); **`opengraph-image`/`page`/`sitemap`/`robots`
are NOT api routes and need NO entry** — cover their shared logic in a tested `lib/` (e.g. `lib/marketingMeta`,
`lib/og`). Logic lives in tested `lib/` functions; components/pages stay thin. For OG cards: `lib/og.tsx` is
satori (flexbox + hex only, NO Tailwind, NO italic, strip diacritics via the module's `ascii()`); 1200×630,
`runtime "nodejs"`; **static OG routes prerender at build, so a satori layout error fails `npm run build`** — and
you can render-check live with `next start` + curl the og:image extracted from the page HTML. For browser QA use
the gstack `/browse` skill (client behavior like beacons/`localStorage` is invisible to curl). **Mint share
permalinks WITHOUT a playthrough** for fast SSR verification: `/r/<id1,…,id5>` (comma-joined real ids — e.g.
`michael_jordan_chi_1980s_1988,lebron_james_cle_2000s_2009,david_robinson_sas_1990s_1994,
wilt_chamberlain_sfw_1960s_1963,nikola_joki_den_2020s_2024`), `/rank/<scope>.<rank>.<total>.<wins>.<losses>.
<net*10>.<b64url name>` (e.g. `/rank/d.5.1000.79.3.130.UGxheWVy`), `/pe/<y>.<n>.x.<ids>`, `/sg/<ids>.<outIdx>.
<inId>`, `/dex/s/<count>.<badges>~<ids>`, `/compare/<ids>/<ids>`. **Player ids in `web/public/data/players.json`
are `"id": "<name>_<team>_<decade>_<year>"` (note the SPACE in the JSON key — grep `'"id": "'`).** Plans/specs go
in `docs/plans/`.

FULL AUTONOMY (you have it — don't stop to ask, except genuine product tradeoffs): work on a feature branch off
main (NEVER commit to main). TDD each change → keep `tsc`, eslint, and the full vitest suite green → commit (end
messages with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`). When the set is done: run a
multi-dimension adversarial code-review Workflow (see PR #71/#74/#75/#76/#77), fix every actionable finding
(VERIFY the flagged ones empirically first — false positives are common), run `npm run build` (must pass), push,
open a PR to main (body ends with the `🤖 Generated with Claude Code` line), wait for CI green, merge with
`--delete-branch`, then VERIFY the production deploy: poll until the new code serves on sweepszn.com (use a
server-rendered marker like a curl-able `og:title`, and `/browse` + a `js`/localStorage check for client-only
behavior; the GitHub deployments API does NOT track Vercel prod here), check `/api/health` (canary), and dogfood
the changed surfaces live (`/browse`, both viewports). Report the final live state.

NOTE: this kickoff + the staged deletion of `next-session-2026-06-22.md` are the handoff roll — bundle them into
your first PR (as PR #77 bundled the 06-21→06-22 roll).

WHEN EVERYTHING IS DONE AND VERIFIED DEPLOYED: write a prompt (for me to paste into the next fresh session) that
proposes and scopes the NEXT most-valuable work — grounded in the codebase, the memory, and wherever the launch
stands by then (read the attributed + nudge funnel!). Hand it off carrying this SAME philosophy: full autonomy,
the §12 integrity rule, the most-complete principle, TDD, the full ship→merge→verify-deploy loop — and tell that
session to likewise end by teeing up the one after it.

and u can do multiple things if you want! sky is the limit. remember the most complete option principle
