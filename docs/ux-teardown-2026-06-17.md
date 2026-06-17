# SweepSzn UX Teardown & Rebuild — 2026-06-17

Full UX teardown: 14 expert-critic dimensions over every surface (desktop + mobile),
adversarial verification, then synthesis. 149 verified findings. Live visual
ground-truth captured via the browse skill across the whole core loop.

**Verdict:** ~85% of the way to a polished launch product. Engine, reel physics, grade
system, OG share card, and the buzzer reveal are production-ready and **do-not-touch**.
The gap is concentrated in: (1) mobile CTA funnel, (2) select→place handoff, (3) a jargon
wall, plus DESIGN.md drift (mode-accent CTAs) and loading-state layout shifts.

Branch: `feat/ux-polish-sweep`. All changes respect the frozen constraints (gold scarcity,
mode-accent discipline, orange-only CTAs, green/red win-loss, 82-0 + reel-timing parity).

---

## Wave 0 — Reported bug: Pick'Em overlay stranded below the fold (mobile) ✅ DONE + VERIFIED

Root cause: `Shell` uses `.animate-rise-in`, whose `both` fill-mode leaves a lingering
identity-matrix `transform` at rest → establishes a containing block → every `fixed`
in-Shell overlay (Pick'Em, mobile position sheet, FH/Blueprint/Surgeon dialogs) anchors to
the tall Shell instead of the viewport. Pick'Em (`items-end`) dropped to ~y1200, below the
844 fold; the position sheet was only rescued by focus auto-scroll.

Fix: `globals.css` `.animate-rise-in` fill-mode `both` → `backwards` (entrance identical,
`to` == resting state → zero flash, no lingering transform). Fixes all 5 overlays at once.
Verified live: mobile Pick'Em now pins to viewport bottom (fully visible, no scroll);
desktop centers; position sheet pins without relying on auto-scroll.

## Wave 1 — Launch-safe mobile funnel + CTA hierarchy ✅ DONE + VERIFIED (safe)

- [x] `LandingSection.tsx` — mobile order: CTA + "No account needed" now above the proof card (was below ~480px card)
- [x] `LandingSection.tsx` — hero CTA copy "Build your five →" → "Find out →" (pairs with the h1)
- [x] `AuthControl.tsx` — "Sync"/"Sync your record" → "Sign in"; loading `null` → skeleton (no header reflow)
- [x] `SiteHeader.tsx` — hide the "Build your five" header CTA on `/play` (declutter, no mid-draft nav-away)
- [x] `app/r/[lineup]/page.tsx` — add "Build your own →" CTA in the shared-result header (above-the-fold)
- [ ] `Shell.tsx` + Game.tsx call sites — "← Modes" escape link (deferred: needs state-reset care)

## Wave 2 — Selection handoff, jargon reduction, loading skeleton ✅ DONE + VERIFIED (safe)

- [x] `browse.tsx` — sticky "Now tap a glowing position on the court →" banner when a player is selected (desktop)
- [x] `Game.tsx` — in-context "🎰 Spin · round N" button inside the "Spin for round N" waiting block
- [x] `ResultCard.tsx` — title tooltips on ORtg/DRtg/Net chips; "projected record" → "simulated record"
- [x] `controls.tsx` — "Usage budget / budget 110" → "Usage limit / limit 110"; "pts of offense" → "points of scoring"
- [x] `ModeSelect.tsx` (FH desc) / `BlueprintDialog.tsx` (formula) / `PickemOverlay.tsx` (question + context) — plain-English copy
- [x] `Leaderboard.tsx` — Net column header label + tooltip (kept net muted to preserve W–L primacy, not green/red)
- [x] `Game.tsx:574,507` + new `components/ResultSkeleton.tsx` — card-shaped skeleton (kills the simulate→reveal layout shifts); mode-aware label
- [~] Mobile placement-status a11y change SKIPPED — the mobile position sheet already has an `aria-live` announcement (`Game.tsx:705`); adding another would double-announce.

## Wave 3 — Design-system correctness + a11y foundations ✅ DONE + VERIFIED (safe)

- [x] FhDialog/BlueprintDialog/SurgeonDialog — mode-accent CTA fills (violet/cyan/rose) → orange (verified: Blueprint CTA = rgb(255,106,0)); identity chips/radios keep their accent
- [x] Collapse duplicated `gradeText` in ResultsHistory/ChallengeOwner/BpLeaderboard → thin alias of `lib/grades` `gradeColor` (single source of truth, behavior-identical)
- [x] `browse.tsx` — emerald-* → green-* (win-color consistency)
- [x] `RankShareButton.tsx` — drop `&hashtags=NBA,82and0` from X intent (on-voice policy)
- [x] site/play layouts — skip-to-content link + `id="main-content"`; `ResultCard` hero wrapped in `aria-live="polite"`
- [x] `controls.tsx` SkipBtn `rounded-full` → `rounded-xl`; SurgeonDialog name input `aria-label`
- [~] Broad emoji `aria-hidden` sweep DEFERRED (low impact, many sites) — fold into a later a11y pass.

## Wave 4 — Mobile ergonomics + advanced-mode gaps ✅ DONE (low risk)

- [x] Touch targets: browse filter (All/G/F/C) + Hints → `min-h-9`; AuthControl sign-in `min-h-11` + avatar `h-11`; FiveStrip tokens `h-10` + larger text
- [x] `browse.tsx` list `max-h-[min(420px,50dvh)]` + `overscroll-contain` (no nested-scroll trap on short screens)
- [x] No-slot guard: players with no open eligible slot are no longer selectable into a dead "tap a glowing position" state (`aria-disabled` + `cursor-not-allowed` + tooltip)
- [x] FactorHunt fetching state: `fhFetching` drives a "Building your question…" disabled label (was a dead button during the choices fetch); mode-aware simulate copy shipped in Wave 2
- [x] `SaveCardImage` exported + added to `SurgeonResult` (parity with the main reveal's shareable card)
- [~] Mobile share-hierarchy reorder SKIPPED — the share row is already strong (Share + X + Bluesky quick-links + mobile bottom-sheet). PushPrompt streak-framing → Wave 6.

## Wave 5 — Mode picker returning-user experience (low risk)

- [ ] "Play {last mode} again →" fast path; Daily "already played → view result" detection
- [ ] tighter mobile vertical rhythm; ResultsHistory lazy-init (no flash); easy→hard mode order
- [ ] leaderboards page: per-mode board cards

## Wave 6 — Auth nudges, notifications, remaining a11y (low risk)

- [ ] One Tap dismissal memory; SessionProvider popover close + heading
- [ ] SignInSaveNudge copy/contrast; extend nudge to all non-daily modes
- [ ] hide NotificationBell for first-timers with no notifications
- [ ] zinc-500 → zinc-400 for informational text; header focus-trap includes buttons

## Also flagged (separate from waves)

- Desktop in-game layout imbalance: reels centered-narrow while browser+court hug center-right,
  leaving a large dead left margin (~25% on 1440px). Worth a dedicated desktop-layout pass.
- Player tokens on court use per-source-team colors (incl. green) which can read as win-semantics;
  review in the design-system pass.
