<!-- Generated 2026-06-10 by a multi-agent brainstorm workflow (3 design lenses -> merge/rank). Decision-ready; modes are NOT built. -->

# SweepSzn New Game Modes — Decision-Ready Proposal

## TL;DR Table

| Mode | Complexity | Leverage | Verdict |
|---|---|---|---|
| **Pick'Em** | S | High | BUILD FIRST |
| **Factor Hunt** | S | High | Build second |
| **Prime Draft** | S | High | Build third |
| **Blueprint** | M | High | Build Q2 |
| **Surgeon** | M | High | Build Q2 |
| **Streak Trials** | M | Medium | Build Q3 |
| **Gauntlet** (merged) | M | Medium | Build Q3 |
| **Franchise Run / Dynasty** | M | Medium | Build Q4 |
| **Rivals** | L | High | Build Q4 |
| **Showdown (Bracket)** | L | Medium | Defer |

---

## Ranking Methodology

Score = (retention/viral loop value) × (1 / build cost) × (engine-moat fit)

Engine-moat fit is rated on whether the mode exposes what only a calibrated, explainable, factor-decomposing engine can deliver — something 38-0.app's opaque OVR model structurally cannot replicate.

---

## #1 — Pick'Em (Crowd vs. You)

**Hook:** Before each draft, the community locks a binary prediction — "will this team-era combo crack 60 wins?" — then after you draft, your result is stacked against the crowd's collective pick. Every share card now tells a social story.

**Rules:** After the reels settle but before drafting begins, a full-screen overlay shows the spun team+era and asks: "Will the best possible five from this roster win more than 60 games? Yes / No." The user votes (one tap, skippable), the vote is stored in Upstash as `pickems:<seed>:y` and `pickems:<seed>:n` via INCR. After results, the result card shows: "You went 67-15. The crowd said Yes (73%) — they were right." If your result contradicts the majority, share text reads: "I defied the crowd — 67-15 on the 1970s Knicks when 68% said they'd flop." Votes are one-per-uid (or IP hash fallback). No vote = skip, non-blocking. Works in Classic, Daily, and HoopIQ.

**Why it drives retention/virality:** Every share card now has a social narrative layer — "I beat the crowd" or "crowd was wrong" — which is a proven mechanic (Wordle hard mode, prediction markets). The result is interesting regardless of outcome. Pick'Em data also generates native SEO/social content ("The 1980s Celtics: 81% of players expected 60+ wins — here's what actually happened"). Zero friction: the vote is one tap and skippable, so it never blocks the core loop. Because the threshold is calibrated to produce crowd errors, "defying the crowd" becomes a frequent and shareable moment.

**Build complexity:** S

**Reuse vs. new:**
- Reuses: everything — spin, draft, evaluateLineup, result card, OG card pipeline, session/uid, Upstash INCR pattern (identical to existing `ev:*` analytics counters)
- New work: pre-draft vote overlay (~100 lines), two Upstash INCR calls per vote, one HGETALL on result render, a "crowd vs. you" bar on ResultCard, one new OG card variant with crowd split bar, one micro-route `/api/pickem` (~5-10 lines). Zero engine changes. Zero Redis schema changes.

**Risks:**
- Low stakes = engagement decay over time if the crowd is right too often. Fix: use a 60-win threshold (not 50) to increase crowd error rate and make "defying the crowd" more common.
- Vote manipulation via refresh. Fix: IP hash + rate limit; acceptable noise since it is not a scored mechanic.
- Overlay adds friction to the first 10 seconds of drafting. Fix: make it skippable with one "X" tap and remember the skip preference.

**Scoring rationale:** Highest leverage-per-line-of-code on the list. Requires zero engine changes, zero new routes of substance, and adds a persistent social layer to every existing mode. The crowd data compounds — the more plays, the more interesting the crowd splits become. Ships in a day or two.

---

## #2 — Factor Hunt

**Hook:** Hidden factors, visible lineup — guess which engine penalty is killing your record before the reveal. The mode makes the engine's "why" the game itself.

**Rules:** Standard seeded spin, full roster visible, draft five normally. Before the engine result is shown, a prediction step presents four choices: the three highest-magnitude real factor labels the engine computed (usage overload, no interior size, cramped floor, etc.) plus one decoy sampled from the full factor-label set. You lock a prediction, then the result card reveals your W-L, full factor breakdown, and whether you were right. Correct prediction earns a ×1.05 display-score multiplier (not actual simulated wins — cosmetic for leaderboard only). Daily Factor Hunt seed is shared; leaderboard ranks by (wins × bonus multiplier). If the lineup has no negative factors (dominant roster), the prediction flips to "predict the BEST factor."

**Why it drives retention/virality:** Adds a metacognitive layer — "do I actually understand the engine?" — that makes every draft feel like a two-part puzzle. The prediction moment before reveal creates genuine suspense even on familiar rosters. Share copy like "I predicted usage overload on the 2000s Lakers and nailed it — 71 wins + bonus" teaches engine vocabulary to new players organically. This mode IS the engine marketing, and it makes 38-0.app's opaque OVR model look embarrassing by contrast — they cannot ship this mode because they have no explainable breakdown to predict.

**Build complexity:** S

**Reuse vs. new:**
- Reuses: everything — spin, draft, evaluateLineup, factor breakdown display (already rendered in result card), OG card, session/uid, leaderboard
- New work: pre-reveal prediction UI between "lock lineup" and "see result" (simple radio-button step, ~80 lines), server-side decoy generator (~10 lines — sample from factor-label set, exclude top-3 real factors), bonus multiplier path in leaderboard submit. No new engine math. No new Redis keys beyond a per-seed bonus flag.

**Risks:**
- Always guessing "usage overload" could game the leaderboard since it appears frequently. Fix: ×1.05 multiplier is small enough that it does not meaningfully distort rankings; the entertainment value of being right matters more than the points.
- Dominant rosters with no negative factors break the mechanic. Fix: flip to "predict the BEST factor" — handle server-side before sending choices to client.
- Could feel like a quiz that slows down the flow. Fix: gate behind an optional "Factor Hunt mode" toggle; keep Classic unaffected.

**Scoring rationale:** Near-identical build cost to Pick'Em but deeper engine-moat fit. Ships the explainable engine as a competitive differentiator in a form players actually interact with. The one reason it ranks second is that Pick'Em works on every existing mode without a toggle, giving it broader reach on day one.

---

## #3 — Prime Draft

**Hook:** Skip the era reel — draft each franchise's all-time roster at peak ratings regardless of decade, enabling exotic cross-era combinations and directly closing the one confirmed feature gap over 38-0.app.

**Rules:** New mode toggle in ModeSelect ("Prime Draft"). The ERA reel is hidden/locked to a special "PRIME" value. Spin selects a franchise (team reel only), then surfaces the franchise's all-time player pool filtered to one entry per `person_id` — the variant with the highest offensive contribution (max of pts+ast+reb weighted by position, computable from existing `players.json` without engine recalibration). The player's displayed decade is their peak decade. Draft rules, position eligibility, hints, and result card are identical to Classic. Engine runs normally — it already handles franchise-era variants; feeding peak-decade variants is the same input shape. Seeds: `prime-<randomId>` for free play, `prime-daily-<date>` for an optional Prime Daily. OG card gets a "PRIME" badge (same hinted-flag pattern, new `p~` prefix in `encodeLineup`). Franchises with fewer than 8 distinct `person_id` entries are excluded from Prime mode.

**Why it drives retention/virality:** Unlocks lineups impossible in Classic (80s Magic + 00s Kobe on the same Lakers roster). These exotic combinations produce surprising results and strong opinions, which is the core share trigger. "Prime Daily" gives a second daily habit without constraint complexity. Directly closes the one confirmed live feature gap versus 38-0.app — their Prime Mode is confirmed live, SweepSzn has no equivalent. The per-`person_id` dedup logic already exists in `selectSpin` (the exclude-by-`person_id` rule) — inverting it to prefer the best variant is a small data transform.

**Build complexity:** S

**Reuse vs. new:**
- Reuses: team reel, existing `players.json` with `person_id`, engine (no changes), position eligibility, result card, OG card template, `encodeLineup`
- New work: peak-variant selection function (pure — group by `person_id`, pick max-scoring variant, ~20 lines), mode flag in `Game.tsx` (suppress era reel, pass prime pool to spin), "PRIME" badge in `og.tsx`, optional prime-daily seed in daily submit route. No Redis schema changes for free-play-only launch.

**Risks:**
- Thin franchises (OKC, Memphis, recent expansion teams) produce repetitive results. Fix: enforce minimum 8 distinct `person_id` entries before enabling Prime for that franchise.
- Era-calibrated engine may return slightly off results when mixing decades. Fix: label it explicitly as a "fantasy simulation, not historical simulation" — the engine is already at its accuracy ceiling anyway.

**Scoring rationale:** Closes a confirmed competitive gap, ships in minimal code, and produces inherently more shareable results than Classic (exotic cross-era combos = stronger opinions). The only reason it ranks third rather than first is that it requires a new mode toggle and data transform, while Pick'Em bolts onto every existing mode.

---

## #4 — Blueprint

**Hook:** You're the GM — commit to a tactical objective (Spacing Bomb, Defensive Fortress, Usage Discipline, Rim Dominance) before the spin, then draft to prove it. The engine grades your execution on that specific axis.

**Rules:** Before the reels spin, player commits to one of five blueprints: SPACING BOMB (maximize spacing factor), DEFENSIVE FORTRESS (maximize defScale × sumDef), USAGE DISCIPLINE (minimize overload penalty — total usage demand under 95), RIM DOMINANCE (maximize best-big rimScore × defScale), or BALANCED (highest net rating, no constraint — the normal game). Reels spin (seeded per day or free-spin). Player drafts five. Engine evaluates. Result card shows overall grade AND a separate Blueprint Grade based solely on the committed metric (e.g., SPACING BOMB: A+ if spacing factor > 2.5, B if > 1.5, etc.). Composite score = overall wins × blueprint-execution multiplier (1.0–1.3). Leaderboard is blueprint-stratified: SPACING BOMB players compete only against other SPACING BOMB players on the same daily seed. A combined leaderboard tab shows best blueprint-adjusted score across all strategies.

**Why it drives retention/virality:** Five distinct daily leaderboards mean five distinct communities chasing the same seed from different angles — massively extends replay value per seed without additional content. Power users run all five blueprints on the same seed in one session. "I went SPACING BOMB on the 90s Bulls and hit 74 wins" is a more specific, identity-rich share than just "74-8." Blueprint badge on share card creates a visual differentiator. All five blueprint metrics are already computed inside `lineupTerms` (spacing, sumDef×defScale, totalUsage, rim) — they just need surfacing. 38-0.app cannot replicate this mode because it has no factor decomposition.

**Build complexity:** M

**Reuse vs. new:**
- Reuses: all spin/draft/engine infra; blueprint metrics are already computed in `lineupTerms`
- New work: blueprint selection pre-spin modal (one extra state field in `Game.tsx`), composite score formula, five Upstash sorted sets per daily seed (blueprint-stratified keys like `lb:daily:<date>:spacing`), blueprint badge on result/share card, live usage-budget bar in USAGE DISCIPLINE draft, combined leaderboard tab

**Risks:**
- USAGE DISCIPLINE blueprint requires tracking a non-obvious stat during drafting. Fix: show a live usage-budget bar in that blueprint mode only.
- Stratified leaderboards split the daily social moment — if each board has only 20 players it feels empty. Fix: combined leaderboard tab showing blueprint-adjusted top scores; launch leaderboard only after user base grows enough to fill each tier.

**Scoring rationale:** High engine-moat fit (blueprints are literally the factor decomposition made interactive), strong replay-per-seed multiplier, but M complexity because of the stratified leaderboard infrastructure and new Game.tsx state. Build after the S-complexity modes are shipped.

---

## #5 — Surgeon

**Hook:** The engine diagnoses your lineup's single worst factor — you have one swap to fix it. Score is the delta, not raw wins.

**Rules:** Standard seeded spin, draft full five (all stats visible, no hints). Engine evaluates and surfaces the single highest-magnitude negative factor (usage overload, no interior size, cramped floor, no perimeter defender). A second pass fires — same era, same team — and deals exactly three replacement candidates targeted at the flagged weakness (selected by `playerFeatures`: shooters for spacing, bigs with rimScore ≥ 0.5 for interior, high-stl perimeter wings for perimeter defense). Player swaps exactly one player from their five with one of the three. Engine re-evaluates. Final score = delta (wins gained from swap minus a par-adjustment baseline of 0). Leaderboard ranks by delta — a surgical +8 on a mediocre roster beats a dominant +2 on an already-elite one.

**Why it drives retention/virality:** Daily Surgeon seed gives everyone the same broken lineup to fix, creating a shared puzzle with a clear "correct answer" that drives community debate. Share card shows BEFORE/AFTER factor breakdown side-by-side — the engine's "why" IS the shareable content, not just the score. Delta scoring rewards basketball knowledge over team luck. 38-0.app cannot build this mode: the "targeted candidates" require a factor-decomposition engine.

**Build complexity:** M

**Reuse vs. new:**
- Reuses: seeded spin infra, `evaluateLineup`, `playerFeatures` (already computes shooter/rim/perim flags), factor breakdown display, result card
- New work: server-side "target candidate" selector (~30 lines using existing `playerFeatures`), delta scoring path (subtract baseline eval from final eval), delta leaderboard key in Upstash (`surgeon-YYYY-MM-DD`), two-phase draft UI (initial five → swap step → re-evaluate)

**Risks:**
- "Three targeted candidates" feels rigged if players notice the server is steering them. Fix: label it "Replacement Pool" and show why each candidate was offered (their relevant stat).
- If the daily spin produces a near-perfect roster with no significant negative factor, the mode is degenerate. Fix: fallback to "smallest positive factor" or enforce a guaranteed second weakness in the daily seed selection.

**Scoring rationale:** Strong engine-moat fit and a genuinely novel scoring mechanic (delta, not raw wins), but requires a two-phase draft UI that adds real surface area to `Game.tsx`. Build alongside Blueprint in Q2.

---

## #6 — Streak Trials (Constrained Daily)

**Hook:** A second daily spin with a hard constraint baked in — every day a different rule (decade-locked, conference-locked, position-quota) that earns its own streak separate from the regular Daily.

**Rules:** Each UTC day a second deterministic seed (`trial-YYYY-MM-DD`) is generated alongside the regular daily seed. Constraint for that day is derived from the seed (seed mod 6 selects: 60s-only, 70s-only, 80s-only, West-only, East-only, or 3-guard-minimum). Ineligible players are greyed out in the roster browser using existing position-eligibility gating. Spin pool filtered to franchise-decade pairs with enough eligible players (reuses `spinPool()` with added predicate). Submit path identical to Daily (`verifyTrace` with trial seed, `lb:trial:<date>` sorted set, 31d TTL). Separate streak counter stored alongside daily streak in `streak.ts`. Push notification: "Today's Trial: 80s West only — your streak is 4, don't break it."

**Why it drives retention/virality:** Gives power users a second daily habit loop without cannibalizing the main Daily. The constraint is a natural share hook ("I went 71-11 with a 3-guard lineup"). The streak counter creates loss-aversion pressure distinct from the Daily streak. Notification copy is more evocative because the constraint is named. Weekly/all-time Trial ladder gives a separate status ladder for users who've plateaued on the regular boards.

**Build complexity:** M

**Reuse vs. new:**
- Reuses: deterministic seeded spins (`spinPool` with filter predicate), `verifyTrace`, Leaderboard component (new tab or new board key), `streak.ts` (extend with `trialStreak`), push notification infrastructure, daily submit API
- New work: constraint derivation function (pure, trivial), `spinPool` filter predicate, `trialStreak` field in `streak.ts`, `lb:trial:` Redis key namespace, constraint banner UI in `Game.tsx`

**Risks:**
- Some constraint+team combinations produce shallow rosters — must validate `spinPool` returns ≥1 valid spin under the constraint before locking the day's seed. Add a pool-size assert in seed derivation.
- Streak fatigue if constraints feel arbitrary. Fix: launch with easier constraints first (decade-only); gate hard constraints behind a "Hard mode" toggle.

**Scoring rationale:** Good retention leverage (second streak = second loss-aversion hook), but M complexity for a feature that is primarily additive rather than differentiated. Ranks below the engine-moat modes because the constraint mechanic is replicable by any clone.

---

## #7 — Gauntlet (MERGED: 3 lenses combined)

Three brainstorm lenses each proposed a "Gauntlet" variant. They are merged here into one recommendation.

**Merged hook:** Multiple sequential seeded spins in one session — your score is a function of all rounds (minimum wins, cumulative wins, or survival count depending on variant). One shared daily/weekly seed creates a common challenge; personal seeds possible for a weekly arc variant.

**Recommended implementation (lowest-cost, highest-leverage merge):**

Launch the ENGINE-FIRST "3-round minimum-wins" variant first, then layer in the RETENTION-FIRST "7-day weekly arc" as a follow-on.

**3-Round Daily Gauntlet:** Three sequential seeded spins (`gauntlet-YYYY-MM-DD`), shared globally. Draft each roster blind to the next round. Score = minimum wins across three rounds. Gauntlet streak increments if minimum ≥ 50. Leaderboard ranks by minimum-wins, tiebroken by sum-wins. Seeding guarantees one pre-1980, one 1980–1999, one 2000+ era round. Shareable "chain snapped on round 3" failure card.

**Why it drives retention/virality:** Minimum-wins scoring is far more volatile than daily single-round scoring — a bad spin wipes a long streak, creating daily check-in urgency. "I survived the 1960s Celtics but got destroyed by the 2000s Clippers" is a narrative share card. The round-3 collapse moment is the most shareable failure state in the game.

**Build complexity:** M

**Reuse vs. new:**
- Reuses: seeded spin, `evaluateLineup`, daily Upstash leaderboard, streak infra
- New work: multi-round draft session state (rounds 1–3 as a `DraftStep[][]` trace, submitted atomically), Gauntlet-specific seed key, minimum-wins score encoding, "round N of 3" progress indicator in draft UI. Multi-round `Game.tsx` state is shared with Franchise Run if both are built.

**Risks:**
- Three full drafts = 3× time commitment; mobile drop-off risk on round 2-3. Fix: progress save to localStorage (same pattern as PR #19 result persistence).
- Era-distribution bias if daily seed hits 1960s twice. Fix: enforce era bracket guarantee in seed derivation.
- Multi-round `Game.tsx` refactor risk. Fix: gate entirely on `mode === 'gauntlet'`, no changes to Classic/Daily/Challenge paths.

**Scoring rationale:** Strong retention mechanic and good narrative virality, but M complexity for a non-trivial `Game.tsx` state machine. Ranks below the S-complexity modes despite higher virality potential because build risk is real.

---

## #8 — Franchise Run (Dynasty Mode)

**Hook:** Draft the same franchise across every era — one game per decade, 6 rounds total — and generate a shareable dynasty card showing every era's result as a vertical timeline.

**Rules:** Player picks a franchise. Six canonical decades (1960s–2020s) are spun in sequence with ERA locked to the chosen franchise, team fixed. Each round is a full draft using existing spin/evaluate mechanics. After all 6 rounds, a Dynasty Card OG image is generated: vertical timeline showing each decade's record, grade, and net rating, plus cumulative total wins and franchise-era power ranking. The `/dynasty/<id>` permalink (backed by Redis hash to avoid 300-char URLs) encodes all 6 lineups. Two re-spins allowed per round but only the ERA re-spins, not the franchise. Save-and-resume via localStorage.

**Why it drives retention/virality:** The Dynasty Card is the highest-investment share in the product — 6 drafts worth of work = strong ownership = more likely to share. "What's your franchise?" is a natural NBA fan identity hook. Each franchise-era combination is a natural SEO content unit. The 6-round commitment creates the longest session time of any mode, which is a strong retention signal for power users.

**Build complexity:** M

**Reuse vs. new:**
- Reuses: all spin/evaluate/`verifyTrace` infrastructure (6 sequential standard rounds), OG card pipeline, session/uid
- New work: multi-round `Game.tsx` state (shared with Gauntlet above), franchise-picker UI, 6-lineup permalink via `/dynasty/<id>` Redis-backed route, Dynasty Card OG template (vertical multi-row layout)

**Risks:**
- 6-round session (~15 min) will crater completion rates vs. single-round modes. Fix: save-and-resume via localStorage.
- `/dynasty/<id>` stored-hash route adds a new Redis key type and a new page route. Not complex, but it is new surface area.

**Scoring rationale:** Highest share artifact quality of any mode, but the 6-round commitment is a retention double-edged sword — high investment share but high abandonment risk. Build after Gauntlet to reuse the multi-round state machine.

---

## #9 — Rivals (Persistent 1v1 Record)

**Hook:** Link up with one friend and maintain a running head-to-head series record across best-of-7 match sets, with a push notification the moment your rival submits.

**Rules:** Signed-in user adds a rival via invite link (generates `rivals:<uidA>:<uidB>` pair key in Redis). Once both accept, they share a persistent Series: current match (best-of-7), all-time record, win streaks. Each Match = 7 Challenges played in sequence: seeded `rivals-<pairKey>-<matchNum>-<gameNum>`. Existing Challenge flow handles each individual game. After a player submits, push notification fires to rival: "Alex went 68-14 on Game 3 — your move." After 7 games, Match winner (most game-wins) recorded; series resets for the next Match. `/rivals/<pairKey>` page (auth-gated) shows full history. Auto-generated rivalry card OG image when a Match closes ("You lead the series 3-1").

**Why it drives retention/virality:** Async push notification is the strongest re-engagement trigger available — personal, time-sensitive, low-friction. The persistent series record creates identity ("I'm 14-6 all time vs Marcus") that no other mode has. Most likely to generate word-of-mouth because it names a specific rival in share text. Drives sign-in conversion (requires Google auth, already shipped).

**Build complexity:** L

**Reuse vs. new:**
- Reuses: Challenge flow end-to-end, Google auth, push notifications, OG card pipeline
- New work: rival pair management (invite, accept, Redis pair key), series state machine in `rivalStore.ts`, `/rivals/<pairKey>` page (auth-gated, server component + polling), notification trigger on opponent submit, rivalry OG card template

**Risks:**
- Requires both players to be signed in — gates behind auth conversion funnel which is still early. Fix: invite link prompts sign-in on accept (same as current Challenge flow).
- Async timing: if one player goes silent, the other is stuck. Fix: 72h forfeit rule (auto-loss, series continues).
- Series state machine is new complexity. Fix: isolated in `rivalStore.ts`, no contamination of `challengeStore`.

**Scoring rationale:** Highest long-term retention potential of any mode (identity + personal push notifications + ongoing commitment), but L complexity and depends on auth conversion being more mature. The right move is to build this after the simpler modes have grown the signed-in user base.

---

## #10 — Showdown (Public Bracket)

**Hook:** A seeded 8-team single-elimination bracket where every slot is a public challenge link — each round advances only when someone accepts and plays.

**Rules:** Creator spins a bracket: 8 deterministic seeds (`bracket-<id>-r1m1` through `r3m1`) pre-generated from one root seed. Creator fills Slot 1. Challenge link reveals opponent's seed; they draft and submit. Higher wins advances; ties broken by Net Rating. Static bracket-viewer page (`/bracket/<id>`) shows the live tree with completed slots (five + record) and pending slots ("???" + "Play this slot" CTA). Up to 7 share moments per bracket. Unfilled opponent slots auto-fill with a bot/auto-seed after 24h to prevent dead brackets.

**Why it drives retention/virality:** Each bracket generates up to 7 share moments. The bracket-viewer URL is a passive spectator page anyone can watch without playing. "You've been challenged to Round 2" notification is a direct re-engagement trigger. Competitive pressure (someone just beat your score) is the strongest known same-session return-play driver.

**Build complexity:** L

**Reuse vs. new:**
- Reuses: challenge seed generation, `verifyTrace`, `ChallengeResult`, Upstash per-challenge stores, OG card pipeline, session/uid
- New work: bracket data model in Redis (tree of seeds + results), bracket-viewer page/route, bracket OG card layout, matchup resolution logic, round-gating (round 2 seeds unlock only after round 1 completes), bot/auto-seed fallback after 24h

**Risks:**
- 8-match bracket needs 7 human participants — if any slot goes cold, the bracket dies silently. The 24h bot fallback mitigates but may feel anti-climactic.
- Bracket state machine ("which slots are open, who can play them") is non-trivial even with reused engine/challenge infra.
- L complexity is the honest rating. Build only after the viral flywheel (Pick'Em, Factor Hunt, Prime Draft) is generating enough users to fill brackets reliably.

**Scoring rationale:** High viral potential per bracket created, but L complexity and cold-start problem (brackets die without a critical mass of active users to fill them). Defer until user base is larger.

---

## Build Sequence Recommendation

**Q1 (ship now, days not weeks):**
1. Pick'Em — bolts onto every existing mode, zero engine changes, adds a social layer to every share card
2. Factor Hunt — same build cost, deepens the engine-moat differentiator, makes the factor breakdown interactive
3. Prime Draft — closes the one confirmed 38-0.app feature gap, minimal new code

**Q2:**
4. Blueprint — five daily leaderboard communities, engine metrics already computed, M complexity
5. Surgeon — strongest engine-moat mode, delta scoring is a genuine innovation, M complexity

**Q3:**
6. Streak Trials — second daily streak habit, M complexity, additive but replicable
7. Gauntlet (3-round) — narrative virality, multi-round state machine

**Q4:**
8. Franchise Run — highest share artifact quality, build on Gauntlet's state machine
9. Rivals — highest long-term retention, build once auth funnel is more mature

**Defer:**
10. Showdown (Bracket) — highest cold-start dependency, build only after user base is large enough to fill brackets

---

## Final One-Paragraph Recommendation

**Build Pick'Em first.** It requires zero engine changes, zero new routes of substance, and zero new Redis schemas for a free-play launch — it is a vote overlay (~100 lines), two Upstash INCR calls, one HGETALL on result render, and a crowd-split bar on the result card. The payoff is that every single share card in the product — Daily, Classic, HoopIQ, Challenge — immediately gains a social narrative layer ("I defied the crowd / crowd was wrong") that makes sharing more compelling regardless of the player's skill level. The crowd data compounds: the more plays, the more interesting and accurate the crowd splits become, and they generate native social content ("81% of SweepSzn players predicted the 80s Celtics would crack 60 wins — here's what actually happened") that costs nothing to produce. Factor Hunt and Prime Draft ship directly after Pick'Em for the same near-zero cost, and together the three S-complexity modes close the competitive gap with 38-0.app, deepen the engine-moat differentiator that 38-0.app cannot replicate, and give the product three new share hooks before any M-complexity mode is needed.
