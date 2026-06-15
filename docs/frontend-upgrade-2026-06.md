# Frontend "extra fabulous" upgrade — plan & tracker (2026-06-15)

Owner decisions (AskUserQuestion, 2026-06-15):
- **Lead with:** Landing + conversion funnel (deepest work there; full sweep across all pages).
- **Ambition:** Elevate the existing "Arena" design system — premium polish, motion, the buzzer
  moment — NOT a reinvention. Keep dark broadcast identity, action-orange CTAs, gold reserved for
  the 82-0 / S+A+ payoff, Anton display, green/red win-loss.
- **North star:** Visitor → first play. Mobile is the primary canvas.
- **Shipping:** Incremental feature-branch PRs, auto-merge on green CI (tsc + eslint + vitest + build).

Source of truth for findings: the 2026-06-15 audit workflow (7 reviewers, ~70 findings with
file:line / screenshot evidence). Baseline screenshots in `.audit/baseline/` (gitignored).

## Two audit findings overridden (kept own judgment)
- The floating **"N" badge** is the **Next.js dev-mode indicator** (dev-only, fixed bottom-left,
  lands mid-page in full-page screenshots) — NOT a Google One Tap bug. Verify, then skip.
- "Suppress sign-in on /play" conflicts with the **app-wide sign-in surface shipped in PR #43**.
  Reframe sign-in ("Sync your record") instead of removing it.

## PR sequence
1. **Foundations + chrome** `feat/frontend-foundations` — `components/ui/{Button,Card,icons}`,
   buzzer/motion keyframes + gradient tokens in globals.css, unified `lib/grades.ts`
   (DESIGN.md:67 asks for this), focus-ring radius fix, header premium polish (wordmark size,
   bottom glow, SVG icons, animated mobile menu + focus trap), footer (X link, copyright, CTA),
   sign-in reframe. Local: removed stray root `package-lock.json`.
2. **Landing** — scoreboard hero (2-col desktop, giant Anton h1 + record, stronger gold glow +
   scroll-reveal), live social-proof strip (today's best from existing `/api/daily/leaderboard`,
   SSR), SEO copy → stat tiles + `<details>`, `<Link>` prefetch, A+ badge gold fix, copy tighten,
   mobile proof-before-CTA, a11y (touch targets, headings).
3. **Play funnel** — featured "Daily / start here" card, mode hierarchy (grid-cols-4 / featured),
   SVG mode glyphs w/ per-mode accents, hover lift, difficulty chips, first-run orientation,
   aria-labels + focus rings, ResultsHistory separator/skeleton, footnote contrast.
4. **Result reveal + share loop** — count-up buzzer reveal + grade-colored glow (gold for S/A+),
   headline promotion, factor-column headers, Share→primary flip + grade-aware copy, Simulate
   Season green→orange, reel sizing, Shell progress stepper, a11y (grade ladder/role bars),
   mobile share bottom-sheet.
5. **Leaderboards** — podium top-3 (gold #1), skeleton/ghost empty state, ARIA tablist, win/red
   semantics, per-mode accent headers, countdown chip, rank-share highlight, dvh max-height.
6. **How-it-works + About** — scoreboard stat panel, FAQ accordion (top-2 open), ResultPreview on
   about, mode-accent gallery, CTA closers + gold 82-0, step-number opacity, max-width parity,
   CTA text contrast.

## Hard constraints
- Next.js 16 has breaking changes — check `node_modules/next/dist/docs/` before new APIs (AGENTS.md).
- Read `web/DESIGN.md` before any visual change. Gold stays scarce. No new emoji as core UI.
- Every new API route needs a `test/routes/` test; new components get `test/components/` tests.
- Keep CI green: `tsc --noEmit`, `eslint app components lib test scripts`, `npm test`, `npm run build`.
