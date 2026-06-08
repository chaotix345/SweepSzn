# 82-0 Landing / Positioning Section — Design Spec

**Date:** 2026-06-08 · **Branch:** `feat/landing-positioning` · **Effort:** S, no backend

## Goal

A server-rendered landing/positioning section **above** the game on `/`, to convert the
(mostly cold, mostly mobile) inbound that the viral share loop + Daily leaderboard now
generate. Today the whole homepage is a `"use client"` component (`Game.tsx`), so crawlers
see **zero** static copy — this section is both the conversion win and the SEO win.

Positioning angle (chosen via a 3-direction design panel + 3-lens judging + synthesis): the
**"Can you go 82-0?" challenge** as the spine, with the **naive-vs-engine contrast** grafted
in right after the hero as the trust anchor, then how-it-works, engine credibility, modes,
final CTA, and a crawlable stats rail.

**Positioning constraint:** our app is *also* named "82-0" (rebuild of 82-0.com, same name).
So **no on-page named-competitor block** — the contrast is framed against the *category*
("most all-time lineup builders just add up box-score averages") and carried by the empirical
proof, not by naming 82-0.com.

## Hero example (verified against the real engine)

"Show, don't tell": a **server-rendered** example result for a marquee, instantly-recognizable
balanced two-way five. Verified live via `evaluateLineup` + fitted `coefficients.json`:

- **Lineup (slot order PG/SG/SF/PF/C):** Stephen Curry (GSW 2010s) · Michael Jordan (CHI 1990s)
  · LeBron James (MIA 2010s, shown at SF) · Giannis Antetokounmpo (MIL 2020s) · Nikola Jokić (DEN 2020s)
- **Player IDs:** `stephen_curry_gsw_2010s_2016`, `michael_jordan_chi_1990s_1991`,
  `lebron_james_mia_2010s_2013`, `giannis_antetokounmpo_mil_2020s_2022`, `nikola_joki_den_2020s_2024`
- **Output:** **78-4**, grade **A+ "HISTORIC"**, ORtg 119.9 / DRtg 96.5 / Net **+23.4**
- **Factors:** Star offense **+27.9**, Star defense **+11.1**, Spacing **+0.8** (helping);
  Usage overload (160% demand) **−13.2** (hurting)

The record is rendered **live from the engine at request time** (not hardcoded), so it
self-corrects if `coefficients.json` is ever recalibrated. The `−13.2` usage-overload ding —
on a *GOAT* five — is the whole thesis in one number: a box-score adder would never catch that.

> Real engine role labels for this five are `Lead creator / Combo guard / Secondary creator /
> Interior defender / Rim protector`. Out of game context these read reductively for the GOATs,
> so we do **not** print per-player role chips on the landing — role labels are mentioned only
> as a generic feature.

## Sections (top → bottom)

1. **Hero** — wordmark `82-0`, h1 "Can you go 82-0?", subhead, one primary CTA
   ("Build your five →" → `#game`), and the `ResultPreview` card (record + ORtg/DRtg/Net strip +
   "Why this record" two-column helping/hurting breakdown + orange annotation "No other version
   explains why your five wins or loses.").
2. **Contrast** — "Most all-time lineup builders just add up box-score averages. That gets it
   backwards." Two clearly-labeled cards: *Box-score sum* rewards five ball-dominant stat-stuffers
   (**74-8**, red); *82-0 engine* rewards a balanced two-way five (**78-4**, green). One line:
   one ball can't feed five — our engine knows, a box-score adder doesn't. (74-8 is the naive-sum
   strawman from the brief/original-engine reverse-engineering, **not** our engine's output; the
   78-4 IS our live engine output for the hero five.)
3. **How it works** — 3 steps: spin the reels · draft your five (position-eligible) · get graded
   (W-L + grade + plain-English "Why this record").
4. **The engine (credibility)** — "An engine that plays real basketball" + 5 bullets (finite
   possessions / era normalization / defense at true weight / floor spacing / lineup fit) + the
   proof line. Carries the basketball-literate skeptics and the SEO keyword density.
5. **Modes** — Daily (orange dot) / Classic / HoopIQ (violet dot), 3 compact cards.
6. **Final CTA** — "Spin the reels. Draft your five. Go for 82-0." + button (→ `#game`) +
   micro-copy ("No account needed. Runs in your browser. Daily resets every 24 hours.").
7. **Stats rail** — crawlable: `24,687 player-seasons · 1,170 NBA team-seasons · 6.07-win RMSE ·
   Pythagorean k = 14.0`.

(The synthesizer's standalone "Why breakdown" section is dropped — its factor columns duplicate
the hero `ResultPreview`; the unique role-label idea is folded into the engine/SEO copy.)

## Files

- **NEW `web/components/ResultPreview.tsx`** — server component (no `"use client"`). Computes the
  hero result via `getPlayersByIds` + `getCoefficients` + `evaluateLineup` + `factorViews`; renders
  record + metrics + why-columns + annotation. Imports only pure/server-safe modules (never
  `ResultCard.tsx`, which is a client island).
- **NEW `web/components/LandingSection.tsx`** — server component, sections 1–7, imports
  `ResultPreview` and `next/link`.
- **NEW `web/lib/site.ts`** — single source of truth for `baseUrl` (extracted from the inline
  logic in `layout.tsx`); reused by layout, robots, sitemap, JSON-LD.
- **NEW `web/app/robots.ts`** — allow all, point to sitemap.
- **NEW `web/app/sitemap.ts`** — homepage only (`/r/[lineup]` stays noindex).
- **EDIT `web/app/page.tsx`** — render `<LandingSection/>` above `<Game/>`; wrap game in
  `<div id="game">`; add SEO body `<section>` below the game; inject homepage-scoped
  `WebApplication` JSON-LD (`<script type="application/ld+json">`, `<`→`<` escaped).
- **EDIT `web/app/layout.tsx`** — new `title` ("82-0 — Can you build an undefeated all-time NBA
  five?") + `description`; add `alternates: { canonical: "/" }`; import `baseUrl` from `lib/site`.
- **NOT TOUCHED:** `Game.tsx`, `ResultCard.tsx`, `lib/engine.ts` (engine at its accuracy ceiling),
  and `/r/[lineup]` noindex.

## Constraints honored

- Server components only → static, crawlable HTML; no new client JS.
- Mobile-first: single column on mobile, 2–3 col at `sm+`; `px-5 sm:px-8`; 44px tap targets;
  `flex-wrap`/`flex-col` to avoid horizontal overflow.
- Brand system exact: `bg-zinc-950`, cards `bg-zinc-900 border-zinc-800 rounded-2xl`, brand
  `orange-500`, secondary `violet-400`, Geist, `font-black` headlines, grade colors per `og.tsx`.
- Every factual claim defensible (numbers from `DESIGN.md` / verified engine output).

## Verification plan

`tsc` + `lint` + `next build` green; view-source shows the landing copy + 78-4 in static HTML
(crawlable); mobile + desktop screenshots from local `next dev`; JSON-LD parses; `/r/[lineup]`
still noindex. Then commit → PR → merge → verify on prod (`82-0-pink.vercel.app`; previews are 401).
