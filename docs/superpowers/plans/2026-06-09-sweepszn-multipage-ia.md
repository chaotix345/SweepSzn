# SweepSzn Multi-Page IA (PR2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline). Steps use `- [ ]`.

**Goal:** Restructure the single page into a real multi-page site — shared header + footer, `/play` for the game, plus `/how-it-works`, `/leaderboards`, `/about` — with CSS page transitions and correct per-page SEO, without breaking the share loop, the H2H `?c=` accept flow, Daily, or auth/analytics.

**Architecture (verified against Next 16 docs):** Keep ONE root `app/layout.tsx` (html/body/fonts/Analytics). Add a root `app/template.tsx` for a CSS fade transition (remounts per navigation — Server Component, zero client cost). A `(site)` route group with a NESTED layout (SiteHeader + SiteFooter) holds `/`, `/how-it-works`, `/leaderboards`, `/about`. `/play` gets its own NESTED layout (SiteHeader only, no footer). Nested layouts (not multiple root layouts) → client-side nav between all of them, no full reloads. The share permalinks (`/r`,`/c`,`/rank`) and `/admin` stay on the root layout with their existing bespoke chrome (lowest risk, no double wordmark).

**Tech:** Next 16 App Router, React 19, Tailwind v4. Reuse `LandingSection`, `ResultPreview`, `Game`, `Leaderboard`. Recon map: the `?c=` flow reads raw `window.location.search` on mount (path-agnostic) — works unchanged at `/play`; only the `/c/[id]` Accept link needs repointing.

**Spec:** `docs/superpowers/specs/2026-06-09-sweepszn-rebrand-ia-design.md` §5–6.

---

### Task 1: Shared chrome — SiteHeader + SiteFooter

**Files:** Create `web/components/SiteHeader.tsx`, `web/components/SiteFooter.tsx`.

- [ ] **SiteHeader** (`"use client"` — uses `usePathname` for active state + a `useState` mobile toggle). Slim sticky bar: `SweepSzn` wordmark (`font-display`, Link→`/`) on the left; nav links (Play→`/play`, Leaderboards→`/leaderboards`, How it works→`/how-it-works`, About→`/about`) with active styling via `usePathname`; a primary "Build your five" button → `/play`. Mobile: collapse the text links into a disclosure menu (button toggles a dropdown); keep the wordmark + the Play button always visible. Sticky `top-0 z-40`, arena bg with a subtle bottom border + backdrop blur.
- [ ] **SiteFooter** (server component). Wordmark + "Can you go 82-0? · It's sweep season." + nav link columns (Play / Leaderboards / How it works / About) + the crawlable stats rail (24,687 player-seasons · 1,170 NBA team-seasons · 6.07 win RMSE) reused from the old home footer + "Free. Runs in your browser." Internal links use `next/link`.
- [ ] Verify: `npx tsc --noEmit` (used once both exist + are imported by a layout in Task 3).

---

### Task 2: Page transition template

**Files:** Create `web/app/template.tsx`; add a keyframe to `web/app/globals.css`.

- [ ] `app/template.tsx` (Server Component): `export default function Template({children}){ return <div className="page-fade">{children}</div> }`.
- [ ] In `globals.css` add:
```css
@keyframes pageFade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
.page-fade { animation: pageFade 240ms ease-out; }
@media (prefers-reduced-motion: reduce) { .page-fade { animation: none; } }
```

---

### Task 3: Route group `(site)` + move home; `/play`

**Files:** Create `web/app/(site)/layout.tsx`, move `web/app/page.tsx` → `web/app/(site)/page.tsx`; create `web/app/play/layout.tsx`, `web/app/play/page.tsx`. Edit `web/components/Game.tsx` (drop the redundant in-Shell wordmark).

- [ ] **`(site)/layout.tsx`** (server): `<div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100"><SiteHeader/><main className="flex-1">{children}</main><SiteFooter/></div>`.
- [ ] **Move home:** `git mv web/app/page.tsx "web/app/(site)/page.tsx"`. Then edit the moved file: remove the `import Game` line and the `<div id="game"><Game/></div>`; remove the now-duplicated inline `<footer>` stats (moved to SiteFooter) and the outer `<main className="min-h-screen bg-zinc-950 text-zinc-100">` wrapper (the layout provides bg + main) — return a fragment with the JSON-LD `<script>`, `<LandingSection/>`, and the `<section>` SEO_COPY. Keep `export const metadata = { alternates: { canonical: "/" } }`. `poolStats()` is no longer needed here if the footer owns the stats — remove its import if unused.
- [ ] **`play/layout.tsx`** (server): `<div className="flex min-h-screen flex-col bg-zinc-950 text-zinc-100"><SiteHeader/><main className="flex-1">{children}</main></div>` (header, no footer). Add `export const metadata = { title: "Play SweepSzn — draft your all-time five", alternates: { canonical: "/play" } }`.
- [ ] **`play/page.tsx`** (`import Game from "@/components/Game"; export default function Play(){ return <Game/> }`). Game reads `?c=` from `window.location` itself; no searchParams plumbing.
- [ ] **Game.tsx Shell de-dupe:** remove the in-Shell-header wordmark `<div className="font-display text-2xl tracking-tight">Sweep…</div>` (line ~337) so the sticky SiteHeader isn't duplicated; keep the mode badge + `Round n/5` + Restart. Leave the big ModeSelect hero wordmark (line ~359) — it's the `/play` page hero.
- [ ] Verify: `npx tsc --noEmit` (route conflict check: ensure NO leftover `app/page.tsx`).

---

### Task 4: `/how-it-works`

**Files:** Create `web/app/(site)/how-it-works/page.tsx`.

- [ ] Server component. Lift the "How to play" 3-step + "What the engine actually models" 5-bullet + the naive-vs-engine contrast content (currently inside `LandingSection`) into this page as the canonical, keyword-dense, indexable explainer. Reuse `<ResultPreview/>` for a live example. Add `export const metadata = { title: "How SweepSzn works — the engine, explained", description: "...", alternates: { canonical: "/how-it-works" } }` + a `BreadcrumbList` JSON-LD. (LandingSection on `/` keeps a shorter teaser + a "How it works →" link to this page.)

---

### Task 5: `/leaderboards` (extract Leaderboard read-only)

**Files:** Create `web/app/(site)/leaderboards/page.tsx`. Possibly minor `web/components/Leaderboard.tsx` edit.

- [ ] Render `<Leaderboard date={<today UTC YYYY-M-D>} trace={[]} />` in read-only mode (no submit — `trace` empty means nothing to submit; if `Leaderboard` shows a submit form unconditionally, gate it on `trace.length>0`). Tabs Daily/Weekly/All-time still work (they fetch via the existing `/api/daily/leaderboard`, `/api/board/*`). Rows already link to `/r/<lineup>`. Add a "Play today's Daily →" CTA to `/play`. Compute today's date the same way the app does (UTC). `export const metadata = { title: "SweepSzn leaderboards — Daily, Weekly, All-time", alternates: { canonical: "/leaderboards" } }`.
- [ ] Confirm `Leaderboard` is import-safe in a server page (it's `"use client"`; a server page can render a client component). If it needs a `date` only, fine.

---

### Task 6: `/about` + FAQ

**Files:** Create `web/app/(site)/about/page.tsx`.

- [ ] Server component: what SweepSzn is, the honest-engine angle, free/no-account, the 82-0 concept. A FAQ section (is it free? how accurate? what data? can you really go 82-0? is this 82-0.com?) with `FAQPage` JSON-LD. `export const metadata = { title: "About SweepSzn", description: "...", alternates: { canonical: "/about" } }`.

---

### Task 7: Repoint share/permalink CTAs to `/play`

**Files:** `web/app/c/[id]/page.tsx`, `web/app/rank/[card]/page.tsx`, `web/components/LandingSection.tsx`, `web/components/ResultCard.tsx`.

- [ ] `app/c/[id]/page.tsx:50` — `href={\`/?c=${info.id}#game\`}` → `href={\`/play?c=${info.id}\`}` (THE CRITICAL H2H link).
- [ ] `app/c/[id]/page.tsx:64` — `href="/#game"` → `href="/play"`.
- [ ] `app/rank/[card]/page.tsx:44` — `href="/#game"` → `href="/play"`.
- [ ] `components/LandingSection.tsx` — both hero CTAs `href="#game"` → `href="/play"` (lines ~25 + ~125). (LandingSection no longer sits above an in-page game, so the anchor must become the route.)
- [ ] `components/ResultCard.tsx:114` — shared-result "Build your own five" `href="/"` → `href="/play"`.
- [ ] Leave the permalink wordmark `<Link href="/">` links pointing at `/` (correct — logo → home).

---

### Task 8: SEO — sitemap

**Files:** `web/app/sitemap.ts`.

- [ ] List all 5 indexable routes: `/`, `/play`, `/how-it-works`, `/leaderboards`, `/about` (each with lastModified, sensible changeFrequency/priority; home priority 1). Update the stale "single-page app" comment. robots.ts unchanged (still allow-all + disallow `/admin`; permalinks keep their own `noindex`).

---

### Task 9: Verify

- [ ] `npx tsc --noEmit` clean; `npm run lint` (only the known untracked `web/scripts/*` errors); `npm run build` succeeds (all 5 routes + `/play` + permalinks compile); 11 `lib/*.test.ts` pass.
- [ ] Route-conflict guard: `find web/app -name page.tsx` shows exactly one `/` source (`(site)/page.tsx`), no `app/page.tsx`.
- [ ] Boot `next start` on a free port; with Playwright over http verify: home renders with header+footer and CTAs → `/play`; `/play` renders the game (ModeSelect) with header, no footer, no double wordmark; `/play?c=test123` enters challenge respond mode (ModeSelect skipped); `/how-it-works`, `/leaderboards`, `/about` render; nav active states work; a permalink (`/r/...`) still renders with its own chrome + `noindex`; `sitemap.xml` lists 5 URLs. Screenshot the key pages for the user.
- [ ] Commit in logical chunks (chrome, restructure, pages, CTAs+SEO). Adversarial review of the diff (completeness / H2H-flow correctness / SEO / no-regression), fix confirmed findings. Push, PR, merge, verify on prod.

## Risks
- **H2H `?c=` (highest):** path-agnostic in Game.tsx; only `c/[id]/page.tsx:50` repoints. Verify the accept→respond flow end to end at `/play?c=`.
- **Route conflict:** must delete `app/page.tsx` when moving to `(site)/page.tsx` (Next errors on two `/`).
- **Leaderboard submit:** read-only page passes `trace={[]}`; ensure no accidental submit / no crash with empty trace.
- **Daily date:** compute UTC date identically to the app so `/leaderboards` shows today's board.
