# 82-0.com gameplay spec (reverse-engineered, June 2026)

Authoritative reference for building UX parity. Sourced from (a) playing the live site headless
(screenshots in `research/shots/`), (b) the How-to-Play modal, and (c) reading the site's JS
bundles + `players_flat.json` (Firebase). We keep OUR engine; this only governs gameplay/UX.

## Modes
- **Classic** — full player stats visible during the draft. Candidates sorted by PPG by default.
- **HoopIQ** — stats hidden during draft ("draft by memory"); candidates sorted alphabetically.
- (Team Draft = dev-only, behind `testMode`. No daily/seeded mode, no fixed seed. Account-based leaderboard only.)

## The draft loop (5 rounds, one per slot)
1. **SPIN** the two reels — a gold **TEAM** reel and a purple **ERA** reel. Spin picks a
   **uniformly random (team, decade) pair from all populated combos** (combos with ≥1 player).
   Not uniform over teams×decades — empty combos excluded. No seeding. ~2s slot-machine animation,
   then a 1s flash, then the candidate list appears. Reels idle-display "ATL / 60's".
2. **ERAs drafted:** `1960s, 1970s, 1980s, 1990s, 2000s, 2010s, 2020s` (labelled 60's…20's).
   1940s/50s players are NOT draftable.
3. **Candidates** = the FULL roster of that team+decade (e.g. "72 players available"), minus
   players already drafted. A scrollable list of cards. Each card: name, **eligible positions**
   (e.g. `PF · SF · SG`), `TEAM · decade`, and 5 stats (PPG / RPG / APG / SPG / BPG).
   Controls above the list: **Search…** box, a **sort** dropdown (PPG default; RPG/APG/A–Z),
   and position-group filters **All / G / F / C**.
4. **PICK then PLACE** (two-step, player-first): tap a player to select → then choose a position.
   - Desktop: a **basketball half-court** shows the 5 slots at real positions (PG top of key,
     SG/SF wings, PF/C in the paint). Selecting a player **lights up only that player's eligible,
     empty slots in orange**; you click one to place. (Court slots are also drag-and-drop.)
   - Mobile: tapping a player opens a **"{Player} — Choose Position"** bottom sheet with all 5
     position buttons. Ineligible → labelled **"N/A"** + disabled; already-filled → **"Filled"** +
     disabled; eligible+empty → solid/active. The roster is a bottom tray of 5 circular tokens.
   - Rule: **`canPlayerPlayPosition(player, pos) === player.positions.includes(pos)`**.
   - Placed token shows initials + position (e.g. "VC / SF"), team-colored, with a stats tooltip.
5. **SKIP** — two one-time-per-game skips: **"Re-spin Team"** (keep the decade, roll a new team)
   and **"Re-spin Era"** (keep the team, roll a new decade). Each usable once; then disabled.
   The kept reel shows **"LOCKED"**. SPIN itself is unlimited but you must pick one player per round
   (you cannot decline all candidates). Restart button resets everything.
6. **SWAP** — placed players can be swapped between slots (drag-drop or tap-tap), gated by
   **`canSwapPositions(roster, a, b)`**: allowed iff each occupant can play the other's slot
   (empty slots count as OK).
7. After 5 slots filled → **Result**.

## Result card (82-0's)
- "CLASSIC MODE" badge, "PROJECTED RECORD", huge **W–L** (e.g. 58–24).
- Grade letter + label + team OVR: e.g. **B CONTENDER · 81.6 pts**.
  Grades (by wins): S≥80 PERFECT (purple), A+≥72 HISTORIC (green), A≥62 DYNASTY (green),
  B≥57 CONTENDER (blue), C≥50 PLAYOFF (amber), D≥40 LOTTERY (slate), F TANKING (red).
- Per-player rows: team-colored badge (initials+pos), name, `TEAM · decade`, 5 stats.
- Team totals row (summed PPG/RPG/APG/SPG/BPG).
- **Share** (renders a 720×900 canvas image; X/Facebook/Bluesky/WhatsApp/Telegram/Reddit) + **Build Another**.
- NOTE: 82-0 shows ONLY stats — no "why". This is exactly where we differentiate (ORtg/DRtg/Net + factor breakdown).

## 82-0's engine (for reference only — we do NOT use it)
`teamOvr = round1( 100·(ΣPPG/133.4·.46 + ΣRPG/39.7·.25 + ΣAPG/29.3·.18 + adjSPG/6.1·.07 + adjBPG/3.2·.04) )`,
`wins = round(82·min(teamOvr/110,1)^1.15)`. adjSPG/BPG = mean of players-with-stat ×5 (old-era fill).
Purely additive box-score sum, no era adjustment, no fit. (Confirms our `82-0-original-engine` memo.)

## Data: multi-position eligibility
82-0's `players_flat.json` (10,932 player-decade rows) carries a **`positions` array** per player
(e.g. Vince Carter `["PF","SF","SG"]`), distinct from a single `pos`. It is player-specific and
data-driven (not a function of `pos`). Distribution: 1 pos (5,329), 2 (5,036), 3 (491), 4 (31), 5 (5).
Their `baseSlug = name.toLowerCase().replace(/['.]/g,'').replace(/[^a-z0-9]+/g,'_').trim('_')`
(reproduced exactly: 0/10,932 mismatch). Joining their `positions` onto OUR pool by baseSlug
(union across a player's decades) covers **93.3% (2,130/2,282)**; the 152 misses are almost all
1940s players (absent from 82-0) — those get an adjacency fallback from their primary `pos`.

## Our differentiators to keep/expand
- Our calibrated engine (ORtg/DRtg/NetRtg → Pythagorean wins) instead of the box-score sum.
- The **"why this record"** breakdown: factors (star O/D, usage overload, spacing, rim/perimeter D),
  per-player role/impact, and confidence notes for estimated pre-1974 defense. EXPAND this.
