# SweepSzn — "Arena" Design System

This file owns the **visual / brand** system for the web app. (The root `DESIGN.md`
is a different doc — it covers the engine + game design. Do not conflate them.)

Read this before changing any UI.

## Brand

- **Name:** SweepSzn (one word, canonical). Wordmark: `Sweep` + `Szn`, with `Szn` in the action color.
- **Tagline:** "Can you go 82-0?" (primary hook). Brand line: "It's sweep season."
- The "82-0 / undefeated season" is the *concept and mechanic*, kept verbatim everywhere. Only the
  product *name* moved off "82-0".

## Memorable thing

**Chasing 82-0 feels epic — the record is a trophy, and gold is the perfect one.**
Every visual decision serves this.

## Aesthetic

Sports-broadcast / arena-scoreboard. Dark, dramatic, high-contrast. The drama comes from type scale +
contrast + one accent, not decoration. Not minimal (epic needs weight); not chaotic (the data stays legible).

## Color (Tailwind v4 tokens in `app/globals.css`)

| Token | Hex | Use |
|---|---|---|
| arena base | `#0A0A0B` | page background (`--background`, plus zinc-950 surfaces) |
| surface | `#16161A` | cards / raised surfaces (zinc-900 in practice) |
| `--color-orange-500` / `--color-action` | `#FF6A00` | brand + primary CTAs (the action orange; overrides Tailwind's default orange-500) |
| `--color-orange-400` | `#FF8A3A` | hover / lighter accent |
| `--color-gold` | `#FFC53D` | **reserved** for the elite tier — top grades (S, A+) and the perfect-season payoff. Used sparingly so it stays special. |
| `--color-gold-soft` | `#FFD66B` | gold gradient highlight |
| win | `#34D399` (green-400) | wins, positive factors, Net ≥ 0 |
| loss | `#F87171` (red-400) | losses, negative factors, Net < 0 |
| mode accents | violet-400 · cyan-400 · rose-400 | per-mode identity chips only (violet = Factor Hunt / Prime, cyan = Blueprint, rose = Surgeon). Never for grades, CTAs, or win/loss semantics. |

The orange scale is overridden once in `@theme`, so every existing `orange-*` utility retones uniformly.

## Typography (next/font in `app/layout.tsx`)

| Role | Font | Notes |
|---|---|---|
| Display — wordmark, hero, giant record numbers | **Anton** (`--font-display`, `font-display`) | single weight 400; scoreboard energy |
| UI / body | **Geist** (`--font-sans`) | default app font |
| Stat lines / tabular numbers | **Geist Mono** (`--font-mono`) | box-score correctness |

## Layout

Hybrid — strict grid for the game/stats (data-dense), poster for marketing (hero = the record as a trophy).

## Motion

Intentional. Save the drama for the **result reveal** ("buzzer moment" — record slams in + glow). Respect
`prefers-reduced-motion`. Reel physics unchanged.

## SAFE vs RISK

- **SAFE (category baseline, users expect):** dark UI · tabular mono stats · green/red win-loss.
- **RISK (the brand's face):** ① gold = the perfect-season reward you chase · ② full broadcast/poster
  display type · ③ the buzzer-moment result reveal as the shareable highlight.

## Grade colors (single source of truth to keep in sync)

`S` and `A+` → `text-gold`; `A` → green; `B` blue; `C` amber; `D` slate; `F` red. Mirrored in
`components/ResultCard.tsx`, `components/ResultPreview.tsx` (`GRADE_COLOR`) and `lib/og.tsx` (`GRADE_HEX`,
hex `#ffc53d` for S/A+). Keep these in sync (a future cleanup can extract them to one module).
