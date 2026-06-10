> **HISTORICAL (frozen 2026-06):** decision-record only — conventions here may be superseded. Current: tests are Vitest via `npm test`; see `web/AGENTS.md`.

# SweepSzn Brand Foundation (PR1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline) to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebrand the app from "82-0" to "SweepSzn" with the "Arena" visual system (action-orange punch, perfect-season gold, Anton display type), without any route changes, engine changes, or user churn.

**Architecture:** Tailwind v4 CSS `@theme` tokens in `web/app/globals.css`; Anton added via `next/font/google` in `web/app/layout.tsx` (mirrors the existing Geist setup). The NAME "82-0" is replaced only where it's the brand (titles, OG, share text, wordmark, JSON-LD); the "82-0" *score/concept* and all cookie/localStorage keys are left verbatim. Gold is applied by remapping the top grade colors.

**Tech Stack:** Next.js 16.2.7 (App Router), React 19, Tailwind v4, next/font, next/og (satori).

**Spec:** `docs/superpowers/specs/2026-06-09-sweepszn-rebrand-ia-design.md` (§3 design system, §4 blast radius).

**Landmine:** Next 16 APIs differ from training — the next/font + metadata patterns used here are copied from the existing `layout.tsx`, which is the ground truth for this version. Do not invent new APIs.

---

### Task 1: Brand tokens + Anton font foundation

**Files:**
- Modify: `web/lib/site.ts` (SITE_NAME)
- Modify: `web/app/globals.css` (@theme tokens)
- Modify: `web/app/layout.tsx` (Anton font + title)

- [ ] **Step 1: Central name.** `web/lib/site.ts:9` — change `export const SITE_NAME = "82-0";` to `export const SITE_NAME = "SweepSzn";`. (Leave `baseUrl` untouched — domain stays 82-0-pink.vercel.app.)

- [ ] **Step 2: Tokens.** `web/app/globals.css` — add `--font-display: var(--font-anton);` inside the existing `@theme inline { … }` block (next to `--font-mono`). Then add a new block after it:

```css
@theme {
  /* SweepSzn "Arena" brand. Punch the action orange (was #f97316) + add the
     perfect-season gold (reserved for the elite/A+ tier). Overriding the orange
     scale here retones every existing orange-* utility uniformly. */
  --color-orange-400: #ff8a3a;
  --color-orange-500: #ff6a00;
  --color-action: #ff6a00;
  --color-gold: #ffc53d;
  --color-gold-soft: #ffd66b;
}
```

- [ ] **Step 3: Anton font.** `web/app/layout.tsx` — add `Anton` to the `next/font/google` import (line 2) and instantiate it (Anton is single-weight, so `weight` is required):

```tsx
import { Geist, Geist_Mono, Anton } from "next/font/google";
// …after geistMono…
const anton = Anton({ weight: "400", subsets: ["latin"], variable: "--font-anton" });
```
Add `${anton.variable}` to the `<html>` className (line 36): `className={`${geistSans.variable} ${geistMono.variable} ${anton.variable} h-full antialiased`}`.

- [ ] **Step 4: Title.** `web/app/layout.tsx:17` — `const title = "SweepSzn — Can you build an undefeated all-time NBA five?";`

- [ ] **Step 5: Verify build wiring.** Run: `cd web && npx tsc --noEmit` → expect no errors. (Full build runs in Task 7.)

- [ ] **Step 6: Commit.**
```bash
git add web/lib/site.ts web/app/globals.css web/app/layout.tsx
git commit -m "feat(brand): SweepSzn name + Arena tokens + Anton display font"
```

---

### Task 2: Rebrand the dynamic OG cards (`web/lib/og.tsx`)

**Files:** Modify `web/lib/og.tsx`

- [ ] **Step 1: OG alt.** Line 11 — `export const OG_ALT = "SweepSzn — build an all-time NBA starting five";`

- [ ] **Step 2: Gold for top grades.** In `GRADE_HEX` (line 13-15), change the top tier to gold: `S: "#ffc53d", "A+": "#ffc53d",` (leave `A: "#4ade80"` green and the rest unchanged).

- [ ] **Step 3: Wordmark → SweepSzn.** Replace the `Wordmark` component (lines 20-27) body so it renders the new wordmark in bold sans (satori has no Anton; bold sans is fine here):

```tsx
function Wordmark({ size = 40 }: { size?: number }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", fontSize: size, fontWeight: 900, letterSpacing: -1 }}>
      <span style={{ color: "#fafafa" }}>Sweep</span>
      <span style={{ color: "#ff6a00" }}>Szn</span>
    </div>
  );
}
```

- [ ] **Step 4: Accent hex.** Replace the three remaining `#f97316` accent literals (footer CTA in `resultOgElement` line 85, `challengeOgElement` line 133, `rankOgElement` lines 157 + 165) with `#ff6a00`. (Use a careful per-occurrence replace; there are 4 `#f97316` total — the Wordmark one is already gone via Step 3.)

- [ ] **Step 5: Verify.** Run: `cd web && npx tsc --noEmit` → no errors.

- [ ] **Step 6: Commit.**
```bash
git add web/lib/og.tsx
git commit -m "feat(brand): SweepSzn wordmark + gold elite tier on OG cards"
```

---

### Task 3: Rebrand result card + rank share text

**Files:** Modify `web/components/ResultCard.tsx`, `web/components/RankShareButton.tsx`

- [ ] **Step 1: Gold top grades in ResultCard.** `ResultCard.tsx` `GRADE_COLOR` (lines 12-15): change `S` and `A+` to gold. Add a token-based class — since Tailwind has `text-gold` now (from `--color-gold`): `S: "text-gold", "A+": "text-gold",` (leave `A: "text-green-400"`).

- [ ] **Step 2: Share text.** `ResultCard.tsx:126` — change `… (${result.label}) on 82-0 — Net …` to `… (${result.label}) on SweepSzn — Net …`.

- [ ] **Step 3: Native share title.** `ResultCard.tsx:134` — `.share?.({ title: "SweepSzn", text, url })`.

- [ ] **Step 4: Rank share text.** `RankShareButton.tsx:31` — `… (${metric}) at SweepSzn. Can you rank higher?`. Line 40 — `.share?.({ title: "SweepSzn", text, url })`.

- [ ] **Step 5: Verify.** `cd web && npx tsc --noEmit` → no errors.

- [ ] **Step 6: Commit.**
```bash
git add web/components/ResultCard.tsx web/components/RankShareButton.tsx
git commit -m "feat(brand): SweepSzn share text + gold elite grade in result card"
```

---

### Task 4: Rebrand page titles + JSON-LD + SEO copy

**Files:** Modify `web/app/page.tsx`, `web/app/r/[lineup]/page.tsx`, `web/app/c/[id]/page.tsx`, `web/app/rank/[card]/page.tsx`, `web/app/rank/[card]/opengraph-image.tsx`, `web/app/admin/page.tsx`

- [ ] **Step 1: Home SEO copy + JSON-LD.** `web/app/page.tsx` — in `SEO_COPY`, change the two NAME sentences only: line 16 `"82-0 is a browser-based…"` → `"SweepSzn is a browser-based…"`; line 20 `"…box-score averages, 82-0 models…"` → `"…box-score averages, SweepSzn models…"`. **Leave line 30 `"…goes 82-0, undefeated…"` (that's the score/concept).** Change `jsonLd.name` (line 36) `"82-0"` → `"SweepSzn"`.

- [ ] **Step 2: Result permalink title.** `web/app/r/[lineup]/page.tsx` — line 24 `"82-0 — all-time NBA lineup"` → `"SweepSzn — all-time NBA lineup"`; line 28 ``… · 82-0`` → ``… · SweepSzn``.

- [ ] **Step 3: Challenge title.** `web/app/c/[id]/page.tsx` — line 13 `"82-0 — head-to-head challenge"` → `"SweepSzn — head-to-head challenge"`; line 14 ``Beat … — 82-0 challenge`` → ``Beat … — SweepSzn challenge``.

- [ ] **Step 4: Rank title + OG fallback.** `web/app/rank/[card]/page.tsx` — line 15 `"82-0 leaderboard"` → `"SweepSzn leaderboard"`; line 16 ``… · 82-0`` → ``… · SweepSzn``. `web/app/rank/[card]/opengraph-image.tsx` line 13 `"Climb the 82-0 leaderboard."` → `"Climb the SweepSzn leaderboard."`.

- [ ] **Step 5: Admin title.** `web/app/admin/page.tsx` — line 7 `"82-0 · admin"` → `"SweepSzn · admin"`; line 64 `<h1>82-0 metrics</h1>` → `<h1>SweepSzn metrics</h1>`.

- [ ] **Step 6: Verify.** `cd web && npx tsc --noEmit` → no errors.

- [ ] **Step 7: Commit.**
```bash
git add web/app/page.tsx "web/app/r/[lineup]/page.tsx" "web/app/c/[id]/page.tsx" "web/app/rank/[card]/page.tsx" "web/app/rank/[card]/opengraph-image.tsx" web/app/admin/page.tsx
git commit -m "feat(brand): rebrand page titles, JSON-LD and SEO copy to SweepSzn"
```

---

### Task 5: Landing wordmark + engine label + Anton/gold application

**Files:** Modify `web/components/LandingSection.tsx`; read + (if needed) `web/components/ResultPreview.tsx`

- [ ] **Step 1: Hero wordmark.** `LandingSection.tsx` lines 14-16 — replace the `82-0` brand mark with the SweepSzn wordmark in the display face:

```tsx
<div className="font-display text-3xl tracking-tight sm:text-4xl">
  Sweep<span className="text-orange-500">Szn</span>
</div>
```

- [ ] **Step 2: Keep the hook.** Leave line 18 `Can you go 82-0?` and line 123 `Go for 82-0.` verbatim (score/concept). Optionally add `font-display` to the h1 (line 17) for scoreboard energy — apply `className="… font-display"`; keep the existing size classes.

- [ ] **Step 3: Engine label.** Line 57 — `82-0 engine` → `SweepSzn engine`.

- [ ] **Step 4: ResultPreview consistency.** Read `web/components/ResultPreview.tsx`. If it color-codes the example A+ result with a green grade class, switch the A+/S grade to `text-gold` to match the new elite tier (so the hero example shows the gold payoff). If it shares `GRADE_COLOR` from ResultCard, it inherits the change — no edit needed. Leave the LandingSection naive-vs-engine contrast card (green/red pedagogy) as-is.

- [ ] **Step 5: Verify.** `cd web && npx tsc --noEmit` → no errors.

- [ ] **Step 6: Commit.**
```bash
git add web/components/LandingSection.tsx web/components/ResultPreview.tsx
git commit -m "feat(brand): SweepSzn hero wordmark + Anton headline + gold preview"
```

---

### Task 6: Favicon / app icon

**Files:** Create `web/app/icon.svg`

- [ ] **Step 1: Add an SVG app icon.** Next 16 auto-generates favicons from `app/icon.svg`. Create a simple SweepSzn mark on the arena base (an Anton-style bold "S" cut by an orange sweep). Keep it legible at 16px:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="14" fill="#0a0a0b"/>
  <text x="32" y="46" font-family="Arial Black, Arial, sans-serif" font-weight="900"
        font-size="44" text-anchor="middle" fill="#fafafa">S</text>
  <rect x="10" y="50" width="44" height="5" rx="2.5" fill="#ff6a00"/>
</svg>
```

- [ ] **Step 2: Verify it's picked up.** It's validated by the build in Task 7 (Next fails the build on a malformed icon route). 

- [ ] **Step 3: Commit.**
```bash
git add web/app/icon.svg
git commit -m "feat(brand): SweepSzn app icon"
```

---

### Task 7: web/DESIGN.md + AGENTS pointer + full verification

**Files:** Create `web/DESIGN.md`; Modify `web/AGENTS.md`

- [ ] **Step 1: Write `web/DESIGN.md`** — the Arena design system (copy the system from spec §3: aesthetic, the 6 color tokens with hex, the 3-font stack with roles, layout, motion, wordmark, the SAFE/RISK notes). State that the root `DESIGN.md` is the engine doc and this file owns the visual system.

- [ ] **Step 2: Pointer.** Append to `web/AGENTS.md`: a line — "Visual/brand decisions: read `web/DESIGN.md` (the SweepSzn 'Arena' design system) before changing UI."

- [ ] **Step 3: Typecheck + lint.** Run:
```bash
cd web && npx tsc --noEmit && npm run lint
```
Expected: clean (ignore any pre-existing `web/scripts/*` lint errors — those files are untracked and never staged).

- [ ] **Step 4: Unit tests still green.** Run the existing pure-lib tests:
```bash
cd web && for t in lib/*.test.ts; do npx tsx "$t"; done
```
Expected: all pass (the rebrand touches no logic).

- [ ] **Step 5: Production build.** Run:
```bash
cd web && npm run build
```
Expected: build succeeds; the icon + OG image routes compile.

- [ ] **Step 6: Brand grep gate.** Confirm no brand-NAME "82-0" remains in app/components/lib (only the score/concept + internal keys + comments should remain):
```bash
cd web && grep -rn "82-0" app components lib --include='*.ts' --include='*.tsx' | grep -v -E "Can you go 82-0|go 82-0|goes 82-0|Go for 82-0|82-0_sess|82-0_nonce|82-0:uid|82-0:name|82-0:hints|82-0:daily|82-0 parity|82-0's|82-0\.com|matches 82-0|82-0 grade"
```
Review the output: every remaining hit must be a score/concept, an internal key, or a competitor-parity comment. No brand-name title/OG/share string should appear.

- [ ] **Step 7: Commit.**
```bash
git add web/DESIGN.md web/AGENTS.md
git commit -m "docs(brand): web/DESIGN.md Arena design system + AGENTS pointer"
```

---

## Self-review notes
- **Spec coverage:** §4A rename table → Tasks 1-5; §3 tokens/font → Tasks 1,2,3,5; web/DESIGN.md → Task 7; favicon/OG → Tasks 2,6. §4B concept-keep + §4C internal-keep are explicitly preserved (Task 4 Step 1, Task 5 Step 2, grep gate Task 7 Step 6). All covered.
- **No churn:** cookie/localStorage keys (`lib/auth.ts`, `lib/streak.ts`, `Game.tsx`) are not in any task's file list. Verified.
- **web/scripts/ excluded:** every `git add` lists explicit paths; no `-A`.
- **Verification:** tsc + lint + build + unit tests + grep gate in Task 7. Visual/prod verification happens after merge (previews are 401-gated).
