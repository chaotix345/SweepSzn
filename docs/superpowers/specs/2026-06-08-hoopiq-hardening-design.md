# HoopIQ Hardening — Design

**Date:** 2026-06-08
**Scope:** S, frontend-only (no backend). Roadmap item #3.
**Branch:** `feat/hoopiq-hardening`

## Problem

HoopIQ mode is meant to be a "draft by memory / ball-knowledge" test: stats are
hidden in the candidate browser (`hideStats = mode === "hoopiq"`, `Game.tsx:440`).
But the TEAM + ERA reels and the candidate-browser header still show the franchise
and decade for the current spin. "1990s Bulls" effectively tells you Jordan/Pippen,
so the memory test is only half-enforced — you can shortcut by reading the label
instead of recognizing the players.

The fix: in **HoopIQ mode only**, hide/obfuscate the spun team + era everywhere it
is shown *during the draft*. Classic, Daily, and Challenge are unchanged. The
franchise/decade is revealed at the end (the result card) as the payoff.

## What actually leaks (audit-confirmed)

A 3-agent adversarial audit (find / refute / verify) confirmed the visible-UI leak
surfaces that a HoopIQ player sees **during** the draft:

1. `Game.tsx:229` — TEAM reel: `value={reel.team}` (abbrev) + `sub={teamName(...)}` (full name).
2. `Game.tsx:230` — ERA reel: `value={reel.era}` (decade).
3. `Game.tsx:467` — Browser header team chip: `{spin.team}` text **+ `teamColors(spin.team)` background color**.
4. `Game.tsx:468` — Browser header era chip: `{eraLabel(spin.decade)}`.
5. `Game.tsx:410-418` — Court tiles: already-placed players keep their `teamColors(p.team)`
   franchise color across subsequent rounds. Not a *current-answer* leak (they are the
   player's own committed picks, and uncorrelated random spins give no future advantage),
   but it pre-spoils the end-of-game reveal. Neutralized for a clean reveal arc.

## Approach (chosen)

**Masked reels that keep the slot-machine feel** (vs. hiding the reels entirely or a
reveal-after-pick flow). The reels still spin and flicker through random RNG values
(which carry no information), then land on `???` / `hidden` instead of the real
team/era. This preserves the signature mechanic while removing the answer crutch.

### Reel masking rule

The reel value must be hidden when settled, **and** the locked dimension must be
hidden during a re-spin (otherwise "Re-spin Team" reveals the still-shown era while
the team flickers). The only safe-to-show state is an *unlocked* reel that is
*currently spinning* (pure RNG flicker):

```
masked = mode === "hoopiq" && !(spinning && !locked)
```

| state | TEAM reel | ERA reel |
|---|---|---|
| full spin, spinning | flicker (RNG) | flicker (RNG) |
| settled | `???` | `???` |
| Re-spin Team (era locked) | flicker | `???` (locked, hidden) |
| Re-spin Era (team locked) | `???` (locked, hidden) | flicker |

### Browser header

Replace the team chip (incl. its franchise color) + era chip with a single neutral
`🧠 Mystery roster` pill (with a `title` explaining it) when `hideStats`.

### Court

Add a `maskColors` prop; in HoopIQ, placed-player tiles use a neutral palette
(zinc) instead of `teamColors(p.team)`. Initials + slot label are kept so the roster
stays readable.

### Reels hint

A small persistent line under the reels in HoopIQ ("🧠 Team & era hidden — draft by
recognizing the players") so the masking reads as intentional, not broken.

## Already handled (no code)

- **End-of-game reveal:** `ResultCard.tsx:88` already renders `{p.team} · {eraLabel(p.decade)}`
  per player. Players are franchise-era variants, and the spin → evaluate path
  guarantees `p.team === spin.team` and `p.decade === spin.decade` (verified by tracing
  `selectSpin` → `draftIndex` key → `toCandidate` → `getPlayersByIds`). So the payoff
  reveal exists for free.
- **Multi-variant players (LeBron Cavs/Heat/Lakers):** you can never stack two variants
  of the same person. `selectSpin` (`data.ts:176-178`) fans `exclude` out to all
  variants sharing a `person_id`; `evaluate/route.ts:11` and `dailyVerify.ts:58` are
  independent backstops. So hiding team/era introduces no "which LeBron / two LeBrons"
  problem. Within a spin the other teammates' names remain a legitimate deduction path
  (Wade + Bosh ⇒ Heat LeBron) — that is the intended skill, not a leak.

## Out of scope (documented limitation)

The `/api/spin` JSON response, the candidate `id` (encodes `name_team_decade_year`),
and React component keys all still expose team/era to anyone who opens browser
DevTools. Fully closing this requires **backend opaque-ids** (or per-spin token
mapping), which is out of the frontend-only scope. It is low-severity because HoopIQ
is **non-competitive**: random per-session seed, solo, no leaderboard and no
server-side verification — a DevTools peek only cheats the peeker. The modes where
integrity matters (Daily, Challenge) are server-verified and unaffected by this
change. Left as a known limitation; revisit only if HoopIQ ever becomes competitive.

## Testing

- `npx tsc --noEmit`, `npm run lint`, `npm run build` green.
- Manual/visual (local dev): HoopIQ reels show `???`/hidden on settle, flicker while
  spinning, locked dimension hidden during each re-spin; browser header shows the
  neutral pill; court tiles are neutral; result card reveals team+era.
- Regression: Classic / Daily / Challenge reels, header, and court look identical to
  before (team abbrev, era, franchise colors all present).

## Risk

Pure presentational, HoopIQ-gated conditionals. No engine, API, data, or
trace/verification changes. Daily/Challenge submission paths untouched.
