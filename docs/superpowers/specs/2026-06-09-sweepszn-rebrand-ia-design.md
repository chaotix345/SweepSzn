# SweepSzn — Rebrand + Multi-Page IA — Design Spec

Date: 2026-06-09
Status: approved-direction (pending spec review)
Branches: PR1 `feat/sweepszn-brand`, PR2 `feat/sweepszn-ia` (off main after PR1 merges)

## 1. Goal

Two objectives, one initiative:

1. **Rebrand** away from "82-0" (the competitor 82-0.com's name, which our app currently shares) to our own ownable product name **SweepSzn**, plus a light brand identity (the "Arena" design system). The *concept* of going 82-0 / an undefeated season stays as the tagline and core mechanic; only the product NAME changes.
2. **Restructure** the single-page app into a real multi-page site with proper navigation, distinct pages, clean routes, transitions, and correct per-page SEO.

Do NOT touch the engine (`web/lib/engine.ts`, `coefficients.json`, data pipeline). Do NOT break what shipped: the share loop + dynamic OG cards (`/r/`, `/c/`, `/rank/`), Google auth, the analytics beacon (`/api/ev`) + gated `/admin`, leaderboards, H2H.

## 2. Brand decisions (locked)

- **Product name:** **SweepSzn** (canonical spelling for code; wordmark may render `Sweep` + `SZN` badge). `sweepszn.com` is available + collision-clean; it is a FUTURE purchase — the production domain stays `82-0-pink.vercel.app` for now, so `lib/site.ts` `baseUrl` is unchanged.
- **Tagline:** primary hook **"Can you go 82-0?"** (kept — proven, it's the mechanic, preserves the undefeated concept). Brand line: **"It's sweep season."**
- **Why concept-forward:** the name carries the perfect-season hook, distinct from "82-0" but evoking the same idea. "Sweep" = winning everything; pairs natively with the share-card / sports-Twitter format the game spreads through.

## 3. Brand identity — "Arena" design system

Memorable thing every decision serves: **chasing 82-0 feels epic — the record is a trophy, gold is the perfect one.**

- **Aesthetic:** sports-broadcast / arena-scoreboard. Dark, dramatic, high-contrast. Drama from type scale + contrast + one accent, not decoration.
- **Color tokens:**
  - Arena base `#0A0A0B` · surface `#16161A`
  - **Action orange `#FF6A00`** — brand / primary CTAs (evolves today's `orange-500`)
  - **Perfect gold `#FFC53D`** — reserved for the elite / 82-0 / A+ tier (the reward you chase); used sparingly so it stays special
  - Win `#34D399` · Loss `#F87171` (kept — already in result cards)
- **Type:** **Anton** (display: wordmark + giant record numbers, scoreboard energy) · **Geist** (UI/body — already in use, low blast radius) · **Geist Mono** (stat lines, tabular).
- **Layout:** hybrid — strict grid for game/stats (data-dense), poster for marketing (hero = record-as-trophy).
- **Motion:** intentional; drama saved for the result reveal ("buzzer moment" — record slams in + glow). Reduced-motion respected. Reel physics unchanged.
- **Wordmark:** `Sweep` (Anton) + `SZN` accent badge. Type-first for v1; a sweep/zero mark can come later.
- **SAFE choices (category baseline):** dark UI · tabular mono stats · green/red win-loss.
- **RISKS (the brand's face):** ① gold = perfect-season reward · ② full broadcast/poster display type · ③ buzzer-moment result reveal.

The system is captured as a committed source-of-truth file **`web/DESIGN.md`** (separate from the root `DESIGN.md`, which is the engine/game-design doc — do NOT overwrite it). `web/AGENTS.md` / CLAUDE.md gets a pointer: read `web/DESIGN.md` before UI changes.

## 4. Rename blast radius (precise)

Three buckets. Only bucket A changes in PR1.

### A. Brand-NAME occurrences → change `82-0` to `SweepSzn`
| File | What |
|---|---|
| `web/lib/site.ts` | `SITE_NAME = "82-0"` → `"SweepSzn"` (central; feeds OG siteName + many titles) |
| `web/app/layout.tsx` | root `title` string |
| `web/app/page.tsx` | `SEO_COPY` two NAME mentions (the "82-0 is a…" / "…82-0 models…" sentences); `jsonLd.name` |
| `web/app/admin/page.tsx` | `title` + `<h1>` ("82-0 metrics") |
| `web/app/c/[id]/page.tsx` | challenge titles ("82-0 — head-to-head challenge", "… — 82-0 challenge") |
| `web/app/r/[lineup]/page.tsx` | result titles ("82-0 — all-time NBA lineup", "… · 82-0") |
| `web/app/rank/[card]/page.tsx` + `opengraph-image.tsx` | "82-0 leaderboard", "… · 82-0", "Climb the 82-0 leaderboard." |
| `web/components/LandingSection.tsx` | the brand MARK ("82<span>-</span>0" above the h1) → SweepSzn wordmark; the "82-0 engine" label → "SweepSzn engine" |
| `web/components/RankShareButton.tsx` | share text "at 82-0" → "at SweepSzn"; native-share `title` |
| `web/components/ResultCard.tsx` | share text "on 82-0" → "on SweepSzn"; native-share `title` |
| `web/lib/og.tsx` | `OG_ALT` |

### B. CONCEPT / SCORE "82-0" → KEEP (it's the mechanic, not the name)
- `LandingSection.tsx` h1 **"Can you go 82-0?"**; "Spin the reels… Go for 82-0."
- `app/page.tsx` SEO_COPY "…goes 82-0, undefeated over a full season?"
- `app/opengraph-image.tsx` "…Can you go 82-0?"
- Contrast-card records (74-8, 78-4) — these are scores, not the name.

### C. INTERNAL — do NOT rename (would churn users or are competitor-parity notes)
- `lib/auth.ts` cookie names `82-0_sess`, `82-0_nonce` — renaming logs everyone out. KEEP.
- `lib/streak.ts` localStorage `82-0:uid` / `82-0:name` / `82-0:daily:history`; `Game.tsx` `82-0:hints` — renaming wipes streaks/uids/prefs. KEEP.
- Code comments referencing `82-0`/`82-0.com` for parity (`data.ts`, `engine.ts`, `explain.ts`, `teams.ts`, `types.ts`, `Game.tsx`) — these describe the COMPETITOR accurately. KEEP.

## 5. Information architecture

### Sitemap
```
/                home / landing (marketing)              indexable
/play            the game — modes, draft, result          indexable (the app)
/how-it-works    how to play + how the engine works        indexable (SEO + credibility)
/leaderboards    Daily / Weekly / All-time boards          indexable (return hook)
/about           about + FAQ (FAQPage schema)              indexable
— unchanged, still noindex —
/r/[lineup] · /c/[id] · /rank/[card]   share permalinks
/admin                                  analytics (gated)
```

### Chrome
- **SiteHeader** (slim, sticky): `SweepSzn` wordmark (→ `/`) · Play · Leaderboards · How it works · About · sign-in/streak entry · primary **Build your five** button. Collapses to a menu on mobile; Play button always visible.
- **SiteFooter** (marketing pages): wordmark + "Can you go 82-0? · It's sweep season." · nav links · credibility stats rail (24,687 player-seasons · 1,170 team-seasons · 6.07 RMSE) · "free, runs in your browser."
- `/play` uses minimal chrome (header only, no big footer) so the game stays focused.
- Implementation: a `(marketing)` route group (header + footer) and `/play` with header-only, OR a shared header in root layout + footer rendered per-page. Decide at plan time; verify Next 16 layout/route-group idiom against `web/node_modules/next/dist/docs`.

### Transitions
Subtle, fast, CSS / View-Transitions based (no heavy animation lib); reduced-motion respected. Result reveal keeps its buzzer moment. Verify the Next 16 idiom (`template.tsx` vs View Transitions API) against the docs before writing.

### Page content sourcing (from today's `LandingSection.tsx`)
- `/` (home): Hero (Can you go 82-0?) + naive-vs-engine contrast + final CTA + stats rail. CTAs → `/play`.
- `/how-it-works`: "How to play" 3 steps + "What the engine actually models" 5 bullets + the contrast + RMSE/calibration stats. This is the keyword-dense credibility page (currently buried mid-scroll on `/`).
- `/play`: `Game.tsx` (moves here, client boundary intact). In-app ModeSelect kept (Daily/Classic/HoopIQ/Challenge); optional `/play?mode=…` deep links. No per-mode sub-routes (YAGNI).
- `/leaderboards`: extract `Leaderboard.tsx` into a standalone page (Daily/Weekly/All-time tabs; board APIs already exist; rows still link `/r/<lineup>`).
- `/about`: about the project + FAQ (FAQPage JSON-LD).

## 6. SEO

- `sitemap.ts`: list the 5 indexable pages (was just `/`).
- `robots.ts`: unchanged — allow all, `disallow /admin`; `/r/ /c/ /rank/` stay crawlable for OG unfurlers but keep their own `noindex`.
- Per-page `canonical` + unique `title`/`description`/OG (canonical currently lives only in `page.tsx`; each new page gets its own; the noindex permalinks must NOT inherit an indexing canonical).
- JSON-LD: keep WebApplication on `/`; add BreadcrumbList on subpages; FAQPage on `/about`.
- Net: 1 → 5 crawlable pages; the engine/credibility content gets its own indexable URL.

## 7. Decomposition

### PR1 — Brand foundation (`feat/sweepszn-brand`)
1. Rename bucket A (table §4A). Keep buckets B + C verbatim.
2. Add Arena tokens (CSS custom properties in `globals.css` + Tailwind theme extension: `action`/`gold`/`win`/`loss`/`arena`); retheme the wordmark, hero, primary CTAs, and the "engine" accents. Full per-component migration of every `orange-500` is incremental (PR2 / design-review).
3. Add **Anton** via `next/font/google` in `layout.tsx`; apply to the wordmark + the big record numbers (ResultCard record, LandingSection hero mark). Geist + Geist Mono unchanged.
4. Optional in PR1: apply the gold "perfect-tier" treatment to A+/elite result cards (brand payoff). Otherwise PR2.
5. Write `web/DESIGN.md` (the Arena system). Add a pointer in `web/AGENTS.md`.
6. New favicon + default brand OG reflecting SweepSzn (simple is fine).
7. Commit this spec.

Keeps today's single-page structure. No route changes. No churn (cookie/localStorage keys unchanged → sign-in + streaks survive).

### PR2 — Multi-page restructure (`feat/sweepszn-ia`)
1. `SiteHeader` + `SiteFooter`; route-group / chrome strategy.
2. Move `Game` → `app/play/page.tsx`; trim `/` to landing-only; CTAs → `/play`.
3. Build `/how-it-works`, `/about` (FAQ + schema); extract `Leaderboard` → `/leaderboards`.
4. Page transitions.
5. Update `sitemap.ts`, per-page canonical/metadata, BreadcrumbList, FAQPage.
6. Repoint share-permalink "build your own" CTAs from `/#game` / `/` to `/play`; update the H2H accept redirect (`/c/[id]` "Accept" → currently `/?c=<id>#game`) to `/play?c=<id>` — verify the challenge-respond + Daily flows still work.

## 8. Constraints / landmines

- Engine, coefficients, data pipeline: untouched.
- Share loop + OG cards, auth, analytics (`/api/ev`, `/admin` gated by `ADMIN_UIDS`): functionally untouched; only titles/brand text rebrand. Keep permalink `noindex`.
- Cookie + localStorage keys: NOT renamed (churn). Documented in §4C.
- `web/scripts/*` stay OUT of PRs (explicit `git add` paths, never `-A`). Pre-existing lint errors in those files are ignored (untracked, never hit CI).
- Next.js 16.2.7: read `web/node_modules/next/dist/docs` before writing route segments / metadata / layouts / route groups / transitions (APIs differ from training).
- Production domain stays `82-0-pink.vercel.app`; `baseUrl` unchanged. `sweepszn.com` not purchased yet.
- Verify on PROD after merge (Vercel previews are 401-gated).

## 9. Testing / verification

- **PR1:** `tsc` + lint + build green; existing unit tests pass; visual check — wordmark/hero/result card rebranded, Anton loads, Arena accent applied; OG card renders on serverless; titles updated; sign-in + Daily streak still work (keys unchanged). Verify on prod: home renders, OG unfurl shows SweepSzn, `/admin` still gated, share/eval/leaderboard routes 200.
- **PR2:** `tsc`/lint/build; each of the 5 routes renders; header nav + mobile menu work; transitions smooth + reduced-motion honored; `sitemap.xml` lists 5 pages; robots correct; per-page canonical + `noindex` on permalinks; share-card CTAs → `/play`; H2H accept (`/play?c=`) + challenge respond + Daily flows work; leaderboards page renders all tabs. Verify on prod: crawl the 5 pages, confirm canonicals/noindex, run an end-to-end play + share.

## 10. Out of scope / deferred

- Buying `sweepszn.com` / changing the production domain (future).
- Per-mode sub-routes (`/play/daily`) — keep in-app ModeSelect.
- A logo mark beyond the type wordmark (type-first v1).
- Migrating every `orange-500` usage to tokens (incremental; a `/design-review` polish pass can follow PR2).
- Engine / gameplay changes of any kind.
