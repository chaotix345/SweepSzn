# Top-of-funnel CRO sweep — 2026-06-19

Convert the **visitor → first_play** leg (the untouched half of the north star; PR #70 already
optimized first_play → share). Launch ~Jun 23. No live funnel data yet (`visit`/`first_play` only
started counting at the PR #71 deploy), so scope is reasoned from code + CRO principles, validated
by a 6-lens teardown Workflow, then vetted against the most-complete principle.

## The conversion target (sharpened)

`first_play` fires in `Game.start()` (Game.tsx:311) when a visitor **picks a mode** — *before* the
first spin. So three surfaces decide the leg:

1. **Landing** (`LandingSection.tsx`) — does "Find out →" get clicked instead of a bounce?
2. **Mode-select wall** (`ModeSelect.tsx`) — does a mode-pick happen, or do 8 options paralyze?
3. **Share-arrival** (`/r/`, `/pe/`, `/sg/`, `/compare/`, `/dex/s/`, `/rank/`, `/c/`) — cold X
   visitors often land here first (they get a `visit` beacon too); the "play your own" CTA closes
   the viral loop.

## Constraints (every change respects these)

- **DESIGN.md (Arena):** orange = the only CTA color; gold reserved for elite tier (S/A+,
  perfect-season payoff); green=win / red=loss; mode accents on chips/icons only. Save the buzzer
  animation for the earned reveal.
- **DESIGN.md §12:** descriptive facts (engine honesty, the public 79-3 draftable ceiling) are
  safe; no per-seed prescriptive leakage.
- Anon-first; engine facts frozen (79-3 draftable, 80-2 slot-illegal, 1,170 seasons, ~5.6 RMSE).

## Ship list (vetted)

1. **`ShareHeader` component** (new, `components/ShareHeader.tsx`) — wordmark + tagline + a `md`
   (44px) orange `ButtonLink` CTA. Apply to `/r/`, `/pe/`, `/sg/`, `/compare/`, `/dex/s/`.
   - Closes the **`/pe/` AND `/sg/` missing-CTA gaps** (the teardown caught only `/pe/`; the
     full audit caught `/sg/` too).
   - Promotes `/r/` + `/compare/` from `sm` to `md`, with contextual copy.
   - One source of truth → kills the drift that left `/pe/` + `/sg/` CTA-less in the first place.
   - Per-page CTA copy: `/r/` "Can you beat this? →" · `/pe/` "Beat the crowd →" · `/sg/`
     "Build your five →" · `/compare/` "Build your own →" · `/dex/s/` "Start your own Dex →".
2. **`/rank/`** — normalize the hand-rolled orange `<Link>` to the `ButtonLink` primitive
   (consistency + the 44px min-height guarantee).
3. **ResultCard shared-view CTA inversion** (ResultCard.tsx:285-287) — when `shared`,
   "Build your own five →" becomes the **primary orange** and Share goes secondary outlined. On a
   cold permalink the dominant audience is new viewers; their conversion is the priority. Non-shared
   (in-game) unchanged — the sharer's Share stays primary.
4. **LandingSection** — hero subhead leads with the **engine differentiator** ("finds every hole in
   your lineup") + the 1,170-season credibility ("simulates all 82 games"); hero **and** final CTA
   both "Draft your five →" (action-specific + verb-consistent; the handoff invited this lever);
   remove `reveal` from the hero `ResultPreview` (DESIGN.md: save the buzzer animation for the earned
   reveal — ambient gold ring/glow stays); fix the stale mobile-order comment to match the verified
   `headline → CTA → card` order. (79-3 lives in the `TodaysBest` strip directly below, so the
   subhead is spent on the differentiator, not a duplicate stat — see Review fixes.)
5. **ResultPreview** — tagline "No other version explains why…" (unsupported comparative) →
   "Live engine output — the same model that grades your draft." (ties proof to product; answers
   the skeptic's "is this real?").
6. **ModeSelect** — subhead "Can you go undefeated?" → "The best ever found is 79-3 — can you top
   it?" (concrete competitive target for cold `/play` arrivals).

## Rejected (with reasons)

- **Swap mobile order (card before CTA).** The handoff states the current `headline→CTA→card`
  order is *verified*; reversing it on spec-only grounds is the false-positive trap (cf. PR #72).
  Kept order; fixed the stale comment that wrongly described the un-verified order.
- **Remove emoji from ModeSelect (★, 🗂️).** Grep of both DESIGN docs shows **no emoji ban** — the
  claim "DESIGN.md explicitly names emoji spam" is unsupported. Emoji are a consistent functional
  idiom app-wide (🎰 SPIN, ⚔️ Accept, ↻ re-spin). Not a violation; skipped.
- Stats-strip relocation, factor truncation, intro-banner removal, box-shadow token refactor,
  gradient removal — low leverage / debatable / would remove proof. Deferred or skipped per the
  teardown's own `skip` list.

## Deferred — the #1 next lever (genuine product tradeoff)

**Deep-link past the mode-select wall** — hero + share CTAs → `/play?mode=daily` (Game doesn't read
`?mode=` yet; only `?c=` for challenges). Eliminates 8-option paralysis for cold first-timers and
Daily is the correct social-parallel for X arrivals — but costs mode-discovery agency and bypasses
the returning-user history view. The featured "★ start here" Daily tile already provides a strong
default. **Hold until the live funnel shows first_play is still low**, then pull it. This is the
single highest-leverage open decision and belongs to a data-informed call, not a blind pre-launch one.

## Review fixes (6-dim adversarial Workflow)

Verdict: ship-after-fixes. Applied: final CTA verb-consistency (both "Draft your five →");
restore hero subhead differentiator (79-3 was redundant with `TodaysBest` directly below);
`/sg/` header CTA → contextual "Fix your five →"; `ShareHeader` `mb-5` (match the pages it
replaced); symmetric "Build Another is not orange" guard test. **Rejected the lone blocker as a
false positive** — it claimed `/sg/`'s `ShareButton` defaults to orange creating a dual-orange row;
verified at `ResultCard.tsx:376` that `ShareButton` with no `primary` prop renders *outlined*, so
`/sg/` already has exactly one orange CTA per row. (Same empirical-disproof discipline as PR #72.)
Also rejected: `/dex/s/` dual-orange (pre-existing + one-per-row holds), redundant explicit
`variant="primary"` (kept for intent clarity), tagline restore (kept the truthful non-absolute copy).

## TDD / verification

- jsdom component tests: `ShareHeader` (renders CTA → `/play`, label, `md`), ResultCard shared CTA
  hierarchy, LandingSection copy (mock children), `ResultPreview` tagline + reveal toggle, ModeSelect
  subhead. No new API routes → no `ROUTE_TO_TEST` changes.
- Permalink page wiring (async RSC, no page-unit-test idiom in repo) covered by `tsc` + `build` +
  live dogfooding of every changed permalink on both viewports.
- Gate: `tsc --noEmit` + eslint + full `vitest run` → adversarial review Workflow (verify each
  finding empirically) → `npm run build` → PR → CI → merge → verify prod deploy + `/api/health` →
  dogfood live.
