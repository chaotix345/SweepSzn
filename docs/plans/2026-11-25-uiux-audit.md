# SweepSzn UI/UX audit, 2026-11-25 (Gemini 4 Neon)

Input for workstream W7 in `docs/specs/2026-11-25-app-upgrades-design.md`.

The audit ran on a local dev server with no env vars, at 390×844 and 1440×900, plus a source review. Line numbers refer to `main` @ 4b4f3a8. W1 splits `Game.tsx` and trims `ResultCard.tsx`, so re-locate each finding before fixing it.

Several findings may already be fixed by W1 (marked "W1?"). Check each one against current `main` first.

## Top 5

1. **Mobile `/play` draft overflows sideways and buries the first player.**
   - At 390px, `scrollWidth` is 396 against `clientWidth` 375, because the grid columns lack `min-w-0` (Game.tsx:687,790; browser.tsx:151).
   - The first candidate sits at y≈828: header, Shell, reels, an open scoring `<details>` (208px), usage bar, re-spins, MiniRoster, a 3-row toolbar, Era Pulse and a count line all come first.
   - The Round-1 Pick'Em modal interrupts first-timers (PickemOverlay.tsx:16-41, z-30 under the z-40 header). Its copy implies you draft all 5 from one team.
   - Pre-spin there are two identical orange Spin buttons.
   - The idle reels show a fake "ATL / 60's" (Game.tsx:98), and Round 2 still shows Round 1's team.
2. **The mobile ResultCard Share button is squeezed to 40px** (ResultCard.tsx:289-299,392-404). X and Bsky pills plus a 2-line "Build Another" eat the row, and 7 share/invite/challenge buttons pile up. (W1?/W6)
3. **`cn()` has no tailwind-merge** (lib/cn.ts). The `inline-flex` in Button.tsx overrides `hidden sm:inline-flex` (SiteHeader.tsx:58-62), so a second orange "Build your five" CTA shows in every mobile header.
4. **Home page:**
   - LandingSection.tsx:79 hardcodes "−13.2 usage overload", while the live ResultPreview shows −6.9.
   - There's a 169px gap in the desktop hero between subtitle and CTA.
   - ResultPreview doesn't name the 5 players.
5. **Dead ends:**
   - No `app/not-found.tsx` or `app/error.tsx`. The default 404 is black on #0a0a0a (about 1.5:1 contrast) with no way back.
   - Signed-out `/dex` says "Sign in (by playing)" with no sign-in button (DexBoard.tsx:50). DexStrip promises "every player you field is saved" and fires a 401 when signed out.
   - The `/stats` daily streak reads 0 after a Daily, because `recordDailyDone` only runs on a board submit (Leaderboard.tsx:129).
   - `/stats` and `/dex` aren't in the header or footer.

## Findings

| ID | Where | Sev | Problem → fix | Effort |
|---|---|---|---|---|
| F01 | Game.tsx:687,790; browser.tsx:151 | High | Horizontal overflow at 390px → add `min-w-0` to the grid columns and the candidate row flex | S |
| F02 | ResultCard.tsx:289-299,392-404 | High | Share squeezed to 40px; 7 share buttons → stack Share + Build Another (`grid-cols-1 sm:grid-cols-2`), move X/Bsky into the secondary row, `min-h-11`, fold Invite + Challenge into one secondary action (W1?/W6) | S |
| F03 | Game.tsx:98,695-775 | High | First-run bloat; duplicate Spin; fake idle reels; "Full breakdown →" `<a>` wipes the draft → one Spin (or auto-spin R1), neutral idle reels, scoring tip collapsed to one line, open breakdown in a new tab | M |
| F04 | PickemOverlay.tsx:16-41; Game.tsx:557 | High | Pick'Em ambushes first-timers; misleading copy; z-30 → suppress until ≥1 completed game (or make it inline and non-blocking); copy "a top-tier five starting with this spin"; z-50; 44px close | S |
| F05 | lib/cn.ts; ui/Button.tsx:15; SiteHeader.tsx:58-62 | High | Duplicate mobile header CTA → use tailwind-merge in `cn()` (or a wrapper span); on `/`, demote the header CTA so only one orange primary shows | S |
| F06 | app/not-found.tsx, app/error.tsx missing | High | Invisible default 404 → Arena-styled not-found (Anton "404", "Airball", orange "Draft your five →", Home) and an error.tsx with Retry | S |
| F07 | LandingSection.tsx:19-47,79; ResultPreview.tsx:22-71 | High | −13.2 vs −6.9; hero gap; no player names → compute the copy value from the engine; single hero stack on desktop; 5-player chip row | S |
| F08 | ResultCard.tsx:53-54 | High | SaveCardImage checks `typeof window` at render, causing a hydration mismatch on SSR'd share pages → `useSyncExternalStore`, the same pattern as ShareButton's `canNative` | S |
| F09 | DexBoard.tsx:50; DexStrip.tsx:12,34-39 | High | Signed-out Dex dead end → a local-first Dex from `listResults()` (merged with the server Dex when signed in), OR gate DexStrip on session plus a real sign-in button; `px-3 text-center` | M |
| F10 | Shell.tsx:21-41; Game.tsx:151,632 | Med | Mobile header pills wrap; round pill 5 still pulses on the result → `whitespace-nowrap`, narrower pills, `min-h-11`, all pills solid when the result shows | S |
| F11 | Leaderboard.tsx:129; SiteHeader/SiteFooter | Med | Streak 0 after a Daily; `/stats` and `/teams` unreachable from nav → `recordDailyDone` on Daily completion (W1's D1 auto-submit may cover it; verify); add Stats and Teams to the nav | S |
| F12 | ResultCard.tsx:277-283 | Med | Team totals row misaligned → `text-center text-[11px]` like StatRow | S |
| F13 | ResultCard.tsx:230,238,284; ExploreZone.tsx:46 | Med | Shared permalinks say "Your starting five" and show DexStrip → branch the copy on `shared`; hide DexStrip | S |
| F14 | browser.tsx:48-50,103 | Med | Spending a Hint doesn't sort by fit → `setSort("fit")` in the Hints click | S |
| F15 | ModeSelect.tsx:58-59,97 | Med | "New here?" shows to returning players; "View today's result" opens the cold `/r/` page → hide the intro when history exists; route to their Daily result and standing (W1?/W3) | S |
| F16 | globals.css:5-8 | Med | No `color-scheme: dark` (white scrollbars and selects on Windows); background #0a0a0a vs DESIGN's #0A0A0B → fix both | S |
| F17 | app/template.tsx; globals.css:45-49 | Med | The page-fade wraps the sticky header, so it blinks and jumps 6px on every navigation → fade only `<main>` | S |
| F18 | court.tsx:43 | Med | Desktop sticky Court `lg:top-4` slides under the 57px header → `lg:top-20` | S |
| F19 | ResultCard.tsx:216,257,265,548,571,641; StatsBoard.tsx:113; ModeSelect.tsx:89; Game.tsx:729,814; browser.tsx:93,104,115,207 | Med | `text-zinc-600` on zinc-900/950 is 2.2–2.6:1; many targets under 44px → readable text to zinc-400; `min-h-11`/`min-w-11` on mobile targets | M |
| F20 | CompareLineup.tsx:110-116; r/[lineup]/page.tsx:45; compare page:74; rank page:35 | Med | Compare modal has no focus trap, restore or backdrop close; share pages lack `<h1>` and a skip link; `/rank` lacks ShareHeader → fix all | S |
| F21 | teams/page.tsx:23; teams/[team]/page.tsx:76-116 | Med | `/teams` is 7.9k px with no sort or filter; the team record sits below the cards on mobile → By wins / A–Z sort plus a filter; record above the grid | S |
| F22 | compare/[id1]/[id2]/page.tsx:39,50-65 | Med | No winner/margin header, no links to each `/r/`, radar colors instead of grade colors, no OG image → add all | M |
| F23 | browser.tsx:86-87,143,165-168 | Med | The ✳ era badge is hover-only; missing space "SF· 00's"; Prime renders 201 buttons; Prime copy says "career peak" → inline legend, spacing fix, window or "Show more" above 50, copy "best season with that franchise" | S |
| F24 | Leaderboard.tsx:197,251,279,359; ResultCard.tsx:216 | Med | Weekly/All-time tabs are blank when auth is off; internal links are raw `<a>` → hide the tabs or show a fallback; use `<Link>` | S |
| F25 | Game.tsx:484-519,806-831 | Med | Single-eligible-slot players still need a second tap (15–18 taps per draft) → one-tap place when exactly one open eligible slot | M |
| F26 | leaderboards/page.tsx:18; rank page:46,49; ComparePanel.tsx:68-71; TodaysBest.tsx:47 | Low | "82-0" and "#1" not gold; rank stats not tabular-nums; ComparePanel "Pick" no-ops silently; TodaysBest ragged on mobile → fix | S |
| F27 | how-it-works/page.tsx; EngineReceipts.tsx:128 | Low | 9.7k px page with no jump links; TopList titles are divs → jump-pill strip; `<h3>` | S |
| F28 | Shell.tsx:20; Game.tsx:794; browser.tsx:85-88,219 | Low | Desktop Shell `max-w-4xl` squeezes Browser to 464px; duplicate team/era pills; a "tap" prompt on desktop → `max-w-5xl`, drop the duplicates, pointer-neutral prompt | S |
| F29 | ResultCard.tsx:136-150 | Low | Delight: no count-up into the record slam, no haptics on S/A+ → 320ms count-up (respect reduced motion) and `navigator.vibrate` on elite reveals | S |

## Not checked

- Redis or auth-backed states (populated boards, signed-in menus, push, `/c/` responder): source review only.
- Physical iOS and Android quirks (safe areas, keyboard viewport jumps).
- Production bundle sizes and Lighthouse scores: dev server only.
