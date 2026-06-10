> **HISTORICAL (frozen 2026-06):** decision-record only — conventions here may be superseded. Current: tests are Vitest via `npm test`; see `web/AGENTS.md`.

<!-- Generated 2026-06-10 by a multi-agent research workflow (5 live-web analysts + adversarial fact-check + synthesis). Primary source: live Playwright observation of 38-0.app plus press/forum/X/App-Store triangulation. Confidence levels are labelled inline. -->

# 38-0.app — Competitor Research Doc for SweepSzn

**Prepared for:** SweepSzn / 82-0 founder
**Date:** June 10, 2026
**Sources:** Live Playwright observation of 38-0.app + pooled research across press, forum threads, X posts, App Store listings, and clone sites. Direct HTTP fetch blocked (403); live access confirmed via browser automation.

---

## TL;DR

- **38-0.app is a direct structural clone of 82-0/SweepSzn applied to English Premier League football.** The developer explicitly acknowledges this in every page footer: *"Inspired by and with thanks to 82-0.com."* Core loop is identical: spin club + era reels → draft players into slots → simulate a season → get a tier result.
- **The game setup is significantly more configurable than SweepSzn:** 7 formations, 3 difficulty tiers (with distinct reroll budgets), a Squad-First vs. Position-First draft mode toggle, a Career Seasons vs. Prime Mode player ratings toggle, and a custom era filter — all confirmed live before a single pick is made.
- **The simulation engine is opaque and appears to be a raw OVR-averaging model** with no explainable breakdown. Users who finish unexpectedly poorly get no "why." This is SweepSzn's single biggest product differentiator.
- **Re-engagement infrastructure is thin:** no confirmed streak system, no push notifications, no challenge-link async flow confirmed live, and the leaderboard is currently down. Its entire viral loop was organic screenshot sharing on X — 10M+ impressions claimed on the homepage itself.
- **Monetization is near-zero:** voluntary Buy Me a Coffee donations (AU$, 225 supporters). No subscription, no ads confirmed (though advertising tech cookies are present in the consent dialog — may indicate future intent). No viable monetization ceiling.

---

## 1. What Is 38-0.app and How Does It Play?

**38-0.app** is a free, browser-based English top-flight (Premier League era) all-time team draft-and-simulate game. The name references a perfect unbeaten 38-game league season — 38 wins, 0 draws, 0 losses — analogous to SweepSzn's 82-0.

**Scope:** 49 English top-flight clubs, 4,000+ player-seasons, covering every season from 1992/93 to 2025/26. *(Confirmed live: homepage header reads "49 Top-Flight Clubs · 4,000+ Player Seasons · 1992–2026.")*

**Core loop:**

1. **Configure:** Choose formation (7 options), difficulty (Easy/Normal/Hard), ratings visibility, draft mode, player ratings variant, and era filter.
2. **Spin:** A reel lands on a specific club-season simultaneously (e.g. Arsenal 2007/08). The full historical squad from that season is presented (~22 players observed for Arsenal 2007/08).
3. **Pick:** Select one player from the squad. A player card shows their OVR (single number), name, nationality, and eligible positions. The six underlying attributes (pace, shooting, passing, dribbling, defending, physical) are **not** shown on the card — only the OVR is visible.
4. **Assign:** Place the selected player into a formation slot. Position eligibility is strictly enforced: the UI displays "Available (N)" and "Unavailable" slots per player, with tooltips like "[Position] — [Player] can't play here." Multi-position eligibility varies by player (e.g. Robin van Persie: ST/LW/RW; Cesc Fàbregas: CM/CAM/CDM; William Gallas: CB/LB/RB).
5. **Repeat** for all 11 slots (GK + 10 outfield).
6. **Simulate:** The game instantly projects a 38-game English top-flight season and returns a tiered result.

**Goal:** Achieve the top tier — 38-0-0 (GOAT), the perfect unbeaten season.

---

## 2. Game Modes

All modes confirmed unless labeled [UNVERIFIED].

### 2a. Setup-Phase Configuration (Confirmed Live)

Before drafting, players configure six independent settings on the /game?new=true setup screen:

| Setting | Options | Notes |
|---|---|---|
| **Formation** | 4-3-3, 4-4-2, 4-2-3-1, 4-5-1, 3-4-3, 3-5-2, 5-4-1 | 7 options, chosen pre-draft |
| **Difficulty** | Easy (3 rerolls), Normal (1 reroll), Hard (0 rerolls + ratings hidden) | Formal named tiers with distinct buttons |
| **Show Ratings** | On / Off | Independent toggle — can hide ratings on Easy/Normal without Hard mode |
| **Draft Mode** | Squad First / Position First | Squad First: spin club, pick any player, assign position. Position First: pick a slot, then spin for a club. |
| **Player Ratings** | Career Seasons / Prime Mode | Career Seasons: player rated as they were that specific season. Prime Mode: every player at their career-best rating regardless of spun season. |
| **Era Filter** | All-time, 2000s+, 2010s+, Modern 2016+, custom dual-slider (1992/93–2025/26) | Narrows the player pool before spinning |

**Note on Hard Mode:** The "Hard — No rerolls · ratings hidden" button bundles two restrictions into one preset. The standalone "Show Ratings: Off" toggle achieves hidden ratings independently on easier difficulties.

**Note on Prime Mode:** This feature was undetected by all five research analysts and is live on the official setup screen. It fundamentally changes the draft game — players are no longer constrained by how good a player was *in the spun season*, they always get the peak version of whoever spins up. This is a meaningful design decision worth SweepSzn evaluating for its own roster.

### 2b. Core Modes

**Classic (Normal difficulty, ratings visible)**
The default mode. Six-stat OVR visible on each player card. One reroll available. Equivalent to SweepSzn's Classic mode.

**Football-IQ / Blind Mode (ratings hidden)**
Achieved by toggling "Show Ratings: Off" (any difficulty) or selecting Hard difficulty. Forces drafting on name recognition and football knowledge alone. Stats revealed only at the end. Direct analog to SweepSzn's HoopIQ mode.

**Hard Mode**
Zero rerolls + forced ratings-hidden bundled together as the "Hard" difficulty preset. Adds a self-imposed constraint layer. First identified by a FollowFollow forum user, now confirmed as a formal UI button.

**World Cup Mode** [UNVERIFIED for 38-0.app web]
Spin a real World Cup national squad and simulate a 7-game knockout tournament (going 7-0). Confirmed for the closely related iOS app "38-0-0" (Deniz Sancar) and the clone RoadTo38.com. **Was not visible on the /game?new=true setup screen in live observation.** May exist at a separate URL, may have been temporarily removed, or may only exist in the iOS sibling. Cannot confirm as a live web feature.

**Daily Challenge** [UNVERIFIED for 38-0.app web]
Seeded same spins for all users on a given day. Confirmed as a feature of RoadTo38.com (a separate competing clone). Referenced in the khelnow.com guide as a 38-0.app feature. **Was not visible as a mode selector on the live /game setup page.** The /leaderboard page is currently down ("Leaderboard Down — temporarily unavailable"). Cannot confirm this is live on 38-0.app specifically.

**1v1 Draft Mode** [UNVERIFIED for 38-0.app web]
Draft your XI against a friend; simulate the match. Described in press coverage as real-time or "beta." **Not visible on the live /game setup screen.** May exist at a separate route, but cannot confirm as a current live feature on 38-0.app.

### 2c. Leaderboard

A public leaderboard exists at https://38-0.app/leaderboard. As of this live check it is showing: *"Leaderboard Down — The leaderboard is temporarily unavailable. Check back soon."* The @38_0app X account has posted leaderboard screenshots (status/2062909499409629447), confirming it is normally live. Structure (daily/weekly/all-time tabs, streak tracking, scoring system) is unconfirmed — cannot read while the page is down.

---

## 3. Draft, Scoring, and Simulation Mechanics

### 3a. Draft Mechanics (Confirmed Live)

- **Rerolls** are tracked via a "Rerolls: 0/11" counter across the full run. The in-draft button reads "🔄 Reroll (1)" on Normal, confirming the per-game budget not per-round.
- **Position assignment** is strict — the UI enforces eligibility. Players have 1–4 eligible positions. The game does not allow placing a striker at goalkeeper.
- **Squad First vs. Position First** are true draft-mode forks that change the strategic sequence, not just a visual preference. Position First may be better for users who know which positions need upgrading; Squad First matches the SweepSzn feel.
- **Era filter** narrows the pool before spinning. Setting Modern 2016+ means you'll never draw a 1990s squad. This is a configuration option, not a separate mode — it persists across all 11 rounds.

### 3b. Player Data Model

Each player has six underlying attributes: pace, shooting, passing, dribbling, defending, physical. These are **custom-assigned, not licensed from FIFA/EA** — the footer legal disclaimer states the game is not affiliated with any league, club, or official ratings provider. These six attributes collapse to a single **OVR** number, which is the only rating shown per player card during the draft.

### 3c. Simulation Engine

The engine is a **raw OVR-aggregation model** — not calibrated against real historical team-seasons. Based on triangulation from a fan GitHub clone README (alexgorges004-wq/38-0-invincible), it:

1. Averages the squad's 11 OVR values.
2. Applies positional-fit weighting (players out of position are penalized).
3. Projects a 38-game season record against fixed thresholds (e.g. goals target 180, dribbles target 650).

A chemistry bonus system (up to +10% for same-club/league/nation stacking) is described in that fan clone README and in RoadTo38.com's feature list — **but is NOT confirmed for 38-0.app's own engine.** The official site makes no mention of chemistry.

**Key consequences:**

- Forum users (FollowFollow.com thread) report confusing outcomes: high-rated squads (OVR 86) finishing 4th; teams winning individual matches 11-0 but finishing mid-table. The engine has no opponent modeling and no era-strength calibration.
- There is **no explainable "why" breakdown** — no ORtg/DRtg equivalent, no named factors, no "your interior presence score was a 3/10" narrative. Users who get an unexpected result get nothing to reason about.
- The result screen tiers (per the related iOS app listing) are: Relegation Battle → Mid-Table → Europa → Champions League → Champions → Centurions → Invincibles → **GOAT (38-0-0)**. The top tier triggers a confetti animation. Whether the 38-0.app web result screen also shows W-D-L record, points tally, per-player simulated stats, or a letter grade is **unverified** — the result screen was not reached in the live session.

**Contrast with SweepSzn:** SweepSzn's engine is calibrated against real historical team-seasons (~6 win RMSE), includes era-strength adjustment, and returns a named factor breakdown (spacing, usage overload, interior presence, rim protection, ORtg/DRtg). A SweepSzn result is *explainable and debatable* — a 38-0.app result is an opaque number output.

---

## 4. Viral and Re-Engagement Mechanics

### 4a. Viral Reach

- The 38-0.app homepage explicitly states: *"more than 10 million impressions and over 1 million visits"* (live-confirmed). Press coverage (balls.ie) cites 15.5M X impressions in 3 days — likely referring to the original creator tweet's view count specifically.
- **The viral mechanism was entirely organic:** major football accounts on X and TikTok creators (e.g. @reddeviller: "YOU HAVE TO PLAY THIS NEW ADDICTIVE FOOTBALL GAME! 38-0.app is absolutely unreal!") shared gameplay screenshots and reactions. No engineered share cards, no dynamic OG images confirmed.
- The dominant editorial framing across all coverage: *"Football's version of Wordle"* (balls.ie headline). This was the main press hook and the mental model players use when recommending it.
- The game's X account (@38_0app) actively promotes updates and leaderboard posts, doubling as a dev log.

### 4b. Re-Engagement Infrastructure

This is the game's biggest structural weakness:

| Mechanic | 38-0.app | SweepSzn |
|---|---|---|
| Daily seeded mode | Unconfirmed (leaderboard down; not on setup screen) | Confirmed, live |
| Streak tracking | Unconfirmed (no UI observed) | Confirmed (daily streaks) |
| Leaderboard | Exists but currently down | Live, Upstash-backed |
| Push notifications | None found | Being shipped now |
| Email re-engagement | None found | N/A |
| Challenge/async link | Not confirmed live | Live (Challenge mode with creator dashboard) |
| Share card / OG image | Not confirmed; sharing is manual screenshots | Dynamic OG cards |
| Auth / persistent identity | No login, no accounts | Google auth |

**No notification layer exists** — no email capture, no web-push, no in-app notification. The only confirmed re-engagement channel is the @38_0app X account (users must follow it to hear about daily challenges or new features).

**No streak system confirmed.** Competitor RoadTo38.com has explicit streak tracking; 38-0.app does not show any streak UI in the live game flow.

**The sharing is manual screenshots, not an engineered artifact.** There is no evidence of a dynamically generated share card linking back to the game or enabling a friend to draft the same spins. The Challenge mode analog (SweepSzn's biggest re-engagement lever) is unconfirmed as a live feature on 38-0.app.

### 4c. Brand Fragmentation

At least four competing sites occupy the same namespace: **38-0.app** (the original), **38-0-0.com** (iOS developer's web presence), **38and0.com** (minimal splash), **38-0.org** (separate), **roadto38.com** (most feature-rich competing clone). This dilutes SEO, social searchability, and user recall. SweepSzn has no equivalent fragmentation problem.

---

## 5. Monetization

| Element | Detail |
|---|---|
| **Model** | Free-to-play, no paywalls, no premium modes |
| **Revenue** | Buy Me a Coffee donations only (buymeacoffee.com/38_0.app) |
| **Supporter tiers** | AU$1 / AU$14 / AU$35 / AU$71 (one-time or monthly) |
| **Supporter count** | 225 total (confirmed live) |
| **Ads** | No ads confirmed in the game — BUT the cookie consent dialog includes "advertising technologies" alongside analytics. This suggests ad infrastructure may be planned or partially present, contradicting the "no ads" characterization in press coverage. |
| **iOS app** | A separate iOS app ("38-0-0: Football Squad Draft", id6776756035, developer: Deniz Sancar, £6.99 to remove ads) is a related but distinct product. The web app developer and iOS app developer may or may not be the same person — different contact emails (hello@38-0.app vs deniz@sancarmedia.com). Relationship unconfirmed. |

**Assessment:** 38-0.app has essentially no monetization ceiling. It is a solo/indie hobby project. 225 Buy Me a Coffee supporters at an average of ~AU$14 represents maybe AU$3,000 total in lifetime support. There is no subscription, no in-app purchase, no ad revenue confirmed. This is both a competitive weakness (no funding for development velocity) and a data point: if 38-0.app gets any meaningful traffic, SweepSzn has room to convert on value they are giving away for free.

---

## 6. Onboarding and UX

### 6a. Strengths

**Zero friction entry.** No sign-up, no login, no app download. A first-time user lands on 38-0.app and immediately spins the wheel. The entire loop is gate-free. This is a real conversion advantage vs. SweepSzn's Google auth gate.

**High configurability pre-draft.** Six settings before the first pick (formation, difficulty, ratings, draft mode, player ratings variant, era filter) give players a sense of agency and customization without overwhelming the game itself. This is noticeably more than SweepSzn's current setup phase.

**Draft Mode fork (Squad First / Position First).** This is a genuine UX innovation not present in SweepSzn. Position First mode inverts the draft tension — instead of "I got this club, who do I pick?", it becomes "I need a CB, which club-era will give me one?" Different strategic texture.

**Prime Mode.** A confirmed live toggle that SweepSzn has no equivalent of. Removes the "I got a great club but in a weak season" frustration. Lowers skill floor while raising the OVR ceiling — useful for casual players.

**Multi-position eligibility is explicit.** The "Available / Unavailable" position display per player is clean and educational. Players learn player versatility as a natural byproduct of the game.

### 6b. Weaknesses

**No persistent identity.** No accounts means no saved history, no streaks, no leaderboard participation without replaying. Each session is anonymous and stateless.

**Leaderboard is currently down.** When the main social proof / competitive layer is unavailable, the re-engagement loop breaks entirely.

**Stability complaints.** FollowFollow forum users reported crashes: *"This one wouldn't work for me. Just keeps crashing when I click Start Draft"* and *"It worked at first for me, but now seems to have broken."* Consistent with a solo-dev project under viral load with no SLA.

**Result screen opacity.** The simulation produces a tier label with no explainable reasoning. Forum users express genuine confusion about outcomes. There is no coaching layer, no "your team struggled because..." narrative.

**Cookie consent includes advertising tech.** This suggests a messier privacy posture than a pure analytics-only implementation. Minor, but notable for a game that markets itself as clean and free.

---

## 7. What 38-0.app Does Better Than SweepSzn

These are genuine advantages, not hypotheticals:

1. **Zero-friction onboarding.** No auth gate. Play in 5 seconds from first visit. SweepSzn requires Google auth before daily play — 38-0.app has no equivalent barrier.

2. **Pre-draft configurability.** 6-axis setup (formation × difficulty × ratings visibility × draft mode × player ratings variant × era filter) gives players immediate agency. SweepSzn has one mode at a time with no pre-game configuration layer of this depth.

3. **Formation choice (7 options).** SweepSzn drafts into a fixed 5-position NBA lineup (PG/SG/SF/PF/C). 38-0.app lets you choose your tactical shape. This is both a strategic layer and a personalization hook.

4. **Position First draft mode.** Inverting the loop (pick slot → spin club) is a genuinely different draft tension that SweepSzn has not explored.

5. **Prime Mode toggle.** Every player at their career-best rating regardless of the spun season. Reduces the "bad draw" frustration and enables dream-team building alongside historical accuracy.

6. **Era filter (custom slider).** A dual-slider from 1992/93 to 2025/26 lets players self-narrow the pool to their personal sweet spot (e.g. Modern 2016+ only). SweepSzn has decade-era as part of the random spin, not a filter.

7. **Larger addressable market.** English Premier League football is a global product with significantly larger fan reach than NBA. The same game concept running on football's most internationally recognized league brand has more viral surface area.

8. **Explicit 82-0 acknowledgment.** The footer credit means football fans who discover 38-0.app are primed to search for 82-0/SweepSzn. This is passive referral traffic SweepSzn should be capturing with a landing page.

---

## 8. What 38-0.app Does Worse — Gaps SweepSzn Can Exploit

1. **No explainable simulation output.** This is the single biggest gap. 38-0.app returns a tier label; SweepSzn returns ORtg/DRtg + named factor breakdown (spacing, usage overload, interior presence, rim protection). SweepSzn results are *debatable* — you can argue "my interior presence was 3/10 because I had no true center." 38-0.app results are opaque. Forum users express frustration and confusion; there is nothing to reason about. This is also the mechanic that drives social debate ("how did you only get 61 wins with that team?").

2. **No era-strength calibration.** 38-0.app uses a fixed OVR threshold model with no opponent calibration. A "90 OVR" team in the 2003/04 era faces the same simulation math as a "90 OVR" team in 2020. SweepSzn's era-strength adjustment means a '96 Bulls roster actually competes at the right difficulty level. This makes SweepSzn results feel earned rather than arbitrary.

3. **No franchise-era player variants.** SweepSzn has e.g. LeBron Cavs, LeBron Heat, LeBron Lakers as distinct roster cards. 38-0.app's "Career Seasons" mode does this partially — a player spun in Arsenal 2007/08 is rated for that season — but there is no explicit player-variant framing as a feature identity.

4. **No persistent identity or streaks.** No auth = no user accounts = no streak tracking = no daily leaderboard participation with history. The daily-return mechanic that makes Wordle sticky requires identity. 38-0.app has no equivalent of SweepSzn's streak counter and streak-loss FOMO.

5. **No engineered share artifact.** All 38-0.app sharing is manual screenshots. SweepSzn has dynamic OG cards. The difference: a dynamic share card creates a link back into the game, enabling the challenge-link flow. Manual screenshots are dead ends — they generate impressions but not installs.

6. **No async challenge flow.** SweepSzn's Challenge mode (share a link → friend drafts the same seeded spins → live creator dashboard shows every responder's team + verdict) has no confirmed analog on 38-0.app. The 1v1 mode is unconfirmed as a live feature. Challenge mode is SweepSzn's most differentiated viral mechanic.

7. **No notification re-engagement layer.** No push, no email, no in-app. SweepSzn is shipping this now. First-mover on the notification layer in this space is meaningful — 38-0.app has no re-engagement beyond users voluntarily returning.

8. **No monetization path.** 225 Buy Me a Coffee supporters at AU$ amounts is not a business. No subscription, no premium modes, no cosmetics, no ad strategy. SweepSzn has room to build a monetizable product in this space that 38-0.app cannot match.

9. **Brand fragmentation.** Four competing domains (38-0.app, 38-0-0.com, 38and0.com, roadto38.com) split SEO and social recall. SweepSzn owns sweepszn.com cleanly.

10. **Leaderboard instability.** The leaderboard is currently down. For a game whose social hook is competitive comparison, downtime of the core competitive layer breaks the daily loop.

---

## 9. Confidence Level and Open Questions

### High-Confidence Findings (Confirmed Live on 38-0.app)

- 49 clubs, 4,000+ player seasons, 1992–2026
- 7 formation options (confirmed on /game?new=true)
- Three-tier difficulty system: Easy (3 rerolls), Normal (1 reroll), Hard (0 rerolls + ratings hidden)
- Squad First / Position First as a first-party draft mode toggle
- Prime Mode (career-best ratings) — live and undetected by all prior research
- Era filter with custom dual-slider — confirmed live
- Player cards show OVR only (not six individual stats) during draft
- Position eligibility strictly enforced, multi-position cards confirmed
- Footer credit: "Inspired by and with thanks to 82-0.com"
- Leaderboard at /leaderboard currently down with maintenance message
- Homepage virality claim: "10M+ impressions, 1M+ visits"
- Buy Me a Coffee: 225 supporters, AU$ pricing, no game monetization
- Cookie consent includes advertising technologies (potential future ad layer)
- No login, no accounts, no push notifications, no email capture confirmed

### Medium-Confidence Findings (Secondary Sources, Not Live-Confirmed)

- 8-tier result scale (Relegation Battle → GOAT 38-0-0) — sourced from iOS app "38-0-0" listing; likely but not confirmed for the web result screen
- Chemistry bonus system (up to +10% for club/league/nation stacking) — sourced from fan GitHub clone README; not mentioned on official site
- Simulation is OVR-averaging + positional-fit — conceptually supported by forum user reports; not documented publicly

### Unverified / Open Questions

| Question | Why It Matters |
|---|---|
| Does 38-0.app have a live daily seeded challenge (same spins for all users)? | Determines whether 38-0.app has the Wordle-daily mechanic that drives streaks |
| What exactly is shown on the 38-0.app web result screen (W-D-L? letter grade? tier name? per-player stats)? | Needed to fully compare result UX vs. SweepSzn |
| Is the 1v1 mode live on 38-0.app web, and is it async (share link) or real-time? | Determines whether it competes with SweepSzn's Challenge mode |
| Is World Cup Mode live on 38-0.app web, or only in the iOS sibling? | Content breadth comparison |
| Are 38-0.app and the iOS app "38-0-0" (Deniz Sancar) the same developer? | Development velocity and funding picture |
| Does the leaderboard track streaks? | Re-engagement mechanic comparison |
| Does the result screen have any "why" narrative or factor breakdown? | Core differentiator validation |
| Are advertising technologies in the cookie consent actually serving ads, or just tagged for future use? | Monetization and UX cleanliness |
| Does any dynamic share card / OG image exist at the result screen URL? | Viral mechanic assessment |

---

## Appendix: Key Source References

| Source | What It Confirmed |
|---|---|
| https://38-0.app/ (live via Playwright) | Homepage copy, virality figures, footer credit to 82-0.com, cookie consent |
| https://38-0.app/game?new=true (live) | All 6 setup settings, difficulty tiers, reroll counts, Prime Mode |
| https://38-0.app/leaderboard (live) | Leaderboard is currently down |
| https://x.com/38_0app/status/2062567830307180878 | "Inspired by 82-0.com, but for football" — dev statement |
| https://x.com/38_0app/status/2062909499409629447 | Leaderboard screenshot promoted by developer |
| https://x.com/38_0app/status/2063725741456736411 | Active dev shipping: era filters, 90s ratings pass, goalscoring rebalance |
| https://buymeacoffee.com/38_0.app | 225 supporters, AU$ pricing confirmed |
| https://apps.apple.com/gb/app/38-0-0-football-squad-draft/id6776756035 | 8-tier scale, cup competitions, developer: Deniz Sancar |
| https://khelnow.com/gaming/how-play-38-0-football-game-premier-league-team-builder-inspired-82-0-202606 | Modes overview, "inspired by 82-0" press framing |
| https://www.balls.ie/football/footballs-version-of-wordle-... | "Football's version of Wordle" framing, virality |
| https://www.followfollow.com/forum/threads/38-0-epl-squad-building-game.325800/ | User experience: crashes, high-OVR teams underperforming |
| https://roadto38.com/ | Competing clone with daily challenge, streak tracking, chemistry, formations |
| GitHub: alexgorges004-wq/38-0-invincible | Fan clone README — OVR-threshold engine description, chemistry system |
