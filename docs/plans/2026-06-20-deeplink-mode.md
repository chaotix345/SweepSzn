# Deep-link past the mode-select wall — 2026-06-20

The #1 deferred lever from PR #74. PR #74 optimized the landing + share CTAs, but every one still
pointed at `/play` — the 8-option "Pick your mode" wall. `first_play` fires on **mode-pick**
(`Game.start()`), so the wall is the last friction before the north-star event. This sweep wires a
`?mode=` deep-link so a cold first-timer drops straight into a guided first spin, and keeps the wall
(discovery + the returning-user history view) reachable from anywhere in-game.

## The product tradeoff (resolved)

Friction vs. agency/discovery. Per the handoff: live funnel → let `rates.firstPlay` decide; still
pre-launch (no data: `visit`/`first_play` only count post-PR#71, the Daily board is empty) → reason
it through and ship the **most-complete version: deep-link + escape hatch.** We are pre-launch, so:
ship both. The auto-start makes `first_play` fire on guided-spin entry — legitimate, because every
deep-linking CTA is itself an intentional "Draft your five →" click; we're removing a redundant
second click, not fabricating intent.

## Constraints

- **DESIGN.md (Arena):** orange = the only CTA color; the escape hatch is a quiet zinc text link, not
  a competing orange CTA. Mode accents (violet/cyan/rose) on chips/icons only.
- **DESIGN.md §12:** the `?mode=` param carries only a public mode name — no per-seed prescriptive
  leakage. Server-replay scoring unchanged.
- Anon-first; engine facts frozen (79-3 draftable, 1,170 seasons).

## Ship list

1. **`lib/modeParam.ts`** (new, tested) — `parseModeParam(raw: string | null): Mode | null`. Accepts
   the 7 deep-linkable modes (`daily, classic, hoopiq, factorhunt, prime, blueprint, surgeon`);
   rejects `challenge` (needs `?c=<id>`), unknown, empty, wrong-case. One source of truth so the Game
   wiring and the CTAs can't drift on what's valid.
2. **`Game.tsx` mount effect** — after the restore-param branches fall through, read `?mode=`, validate
   via `parseModeParam`, `start(mode)`, strip the param (mirror the `?c=` plumbing). Lower priority
   than every restore/challenge param (those are mutually exclusive with `?mode=` in practice).
3. **`Shell.tsx` escape hatch** — new optional `onModeSelect` prop renders a quiet "← Modes" link in
   the header. Wired on every in-game Shell (draft, loading, result, surgeon) with `() => setMode(null)`
   so the picker (discovery + ResultsHistory + replay-last-mode) is always one tap away. Mirrors the
   existing "← All modes" idiom (the challenge-owner branch).
4. **Deep-link the acquisition + Daily-promising CTAs → `/play?mode=daily`:**
   - `LandingSection` hero + final CTA
   - `ShareHeader` default `ctaHref` (covers `/r/`, `/pe/`, `/sg/`, `/compare/`, `/dex/s/` in one place)
   - `ResultCard` shared-view "Build your own five →"
   - `SurgeonResult` shared-view "Fix your own five →"
   - `Leaderboard` ×3 ("Play today's daily", "Play the Daily", "Play now")
   - `/leaderboards` final "Play today's Daily →"
   - `/rank/[card]` "Build your five →"
   - `/about` + `/how-it-works` bottom CTAs
   - `/dex/s/[card]` standalone "Start your own Dex →"
   - `/c/[id]` expired-challenge fallback "Build your five →"
5. **`/leaderboards` board tiles → per-mode deep-link** (`?mode=factorhunt|blueprint|surgeon`) — the
   generalized parser's payoff: a tile that says "Factor Hunt board" now plays Factor Hunt.
6. **`SiteFooter` CTA copy** harmonize "Build your five →" → "Draft your five →" (the deferred PR #74
   nit). Href stays `/play` (see below).

## Keep `/play` (the wall) — deliberate, not a corner cut

- **Persistent site chrome** (`SiteHeader` nav/CTA/mobile, `SiteFooter` CTA + nav): chrome is on every
  page (incl. `/play`, `/dex`), so it must be mode-neutral — a returning user clicking "Play" wants
  the picker.
- **Streak-saver push** (`cron/streak-saver`): targets anyone who played ANY daily-seeded board
  (Daily/FH/Surgeon/Blueprint) yesterday but not today — mode-agnostic by design, so `/play` (pick
  which board to resume) is correct.
- **`DexBoard` "Play a round →"**: a returning-collection surface; the picker gives agency.
- **`ModeSelect`** is the wall; **`/play?c=<id>`** (challenge accept) already deep-links.

Returning-Daily edge: the deep-link `start("daily")` bypasses ModeSelect's "already played today →
view result" redirect. Accepted — the target is cold first-timers (no daily yet); keep-best is
server-side; the "← Modes" hatch reaches the smart picker. Not worth replicating that branch in the
mount effect.

## TDD / verification

- `lib/modeParam.test.ts` (node): every valid mode → itself; `challenge`/null/""/unknown/wrong-case → null.
- `Game.ux.test.tsx` (jsdom): `?mode=daily` starts the game (no picker, SPIN shown, `markFirstPlay`
  fired, param stripped); `?mode=challenge` falls through to the picker; bare `/play` shows the picker.
- `Shell` test: `onModeSelect` renders the "← Modes" control and fires the callback; absent → no control.
- Update `ShareHeader.test.tsx` (default href now `/play?mode=daily`) + `LandingSection.test.tsx` (both
  CTAs → `/play?mode=daily`). Add a `ResultCard` shared-view href test.
- Gate: `tsc --noEmit` + eslint + full `vitest run` → multi-dim adversarial review Workflow (verify
  each finding empirically) → `npm run build` → PR → CI → merge → verify prod deploy + `/api/health`
  → dogfood every changed surface on both viewports.

## Deferred (next session)

Sign-in conversion moment (post-game §12-safe "claim your rank"); slot-pick crowd reveal; per-page OG
for marketing routes; `utm_source` attribution. Kept out to keep this PR coherent and the review clean.
