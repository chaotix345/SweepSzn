# Launch attribution + sign-in conversion moment — 2026-06-21

Two launch-critical levers from PR #75's deferred list, scoped together under one coherent theme:
**make launch-day conversion both stronger and measurable-by-channel.** The funnel is already
measured (PR #71), the loop is QA'd, the mode wall is bypassed (PR #75). Pre-launch (X launch ~Jun
23) there is no live data, so scope is reasoned, not number-steered.

The two lower candidates (per-page OG for marketing routes; slot-pick crowd reveal) are **deferred** —
OG is "lower priority than conversion" and crowd reveal "only matters once launch traffic accrues."
Kept out to keep this PR coherent and the review clean.

## Feature A — `utm_source` acquisition attribution (the launch-day "which post worked?" lever)

The deep-link + share CTAs now convert, but the Redis `ev()` funnel can't see WHICH channel/post a
`first_play` came from. (Vercel Web Analytics auto-captures utm in its own dashboard — this brings the
same signal into our owned funnel so `/admin` + `/api/funnel` can split by source.) Most-complete:
capture on **every** entry surface, split **both** `visit` and `first_play` by source (so we get
per-source *conversion rate*, not just raw counts), surface on `/admin` AND `/api/funnel`.

Acquisition flow it must handle: an X post links to `/?utm_source=x_launch`, or
`/play?mode=daily&utm_source=x_launch` (deep-link tweet), or `/r/<id>?utm_source=…` (reposted
permalink). utm is only ever in the URL on the **first landing** — our CTAs navigate to clean
`/play?mode=daily` — so it must be captured at first landing and persisted.

1. **`lib/utm.ts` (new, tested).**
   - `currentUtmSource(): string | null` — reads `window.location.search` `utm_source`, sanitizes
     (lowercase, `/^[a-z0-9_.-]{1,40}$/`, else null). Same-page read (for the visit beacon).
   - `captureUtm(): void` — first-touch: if `currentUtmSource()` present and nothing stored yet,
     persist to `localStorage["szn:utm:source"]`. Never overwrites (credits the first channel).
   - `getUtmSource(): string | null` — reads the stored first-touch source (for `first_play`, fired
     later on `/play` after navigation when the URL no longer carries utm).
2. **`components/UtmCapture.tsx` (new)** — tiny `"use client"` leaf, `useEffect(() => captureUtm())`,
   returns null. Mounted in **root `app/layout.tsx`** so it runs on every route (landing, `/play`,
   `/r/`, `/pe/`, …) — the most-complete capture point (Game.tsx alone would miss `/`-landings).
3. **`lib/ev.ts`** — `ev(name, { uid?, mode?, source? })`: thread optional `source` into the payload.
4. **`lib/evServer.ts`** — `BeaconBody.source?: string`; `parseEvBody` validates with
   `SRC_RE = /^[a-z0-9_.-]{1,40}$/` as a **separate unconditional block** (NOT folded into the
   `play`-only `mode` block — gotcha: that would strip source for `first_play`). `bump()` gains
   `source?` and, for `stage ∈ {first_play, visit}` with a source, writes
   `HINCRBY ev:src:<stage>:<day> <source> 1` + `EXPIRE` (mirrors the `ev:mode:<day>` hash pattern).
5. **`app/api/ev/route.ts`** — forward `parsed.source` into `bump(...)`.
6. **`lib/firstPlay.ts`** — `markFirstPlay(uid, source?)` → `ev("first_play", { uid, ...source })`
   (once-gate already runs before `ev`, so source rides only the genuine first-play). `Game.tsx:312`
   passes `getUtmSource() ?? undefined`.
7. **`components/Beacon.tsx`** — pass `source: currentUtmSource() ?? getUtmSource() ?? undefined` so
   `visit`/`share_view` carry the source. Reads the **URL first** (same-page, robust against the
   layout-vs-page effect-ordering: child effects fire before the ancestor `UtmCapture`), storage as
   fallback. `bump` only writes the src hash for visit (share_view source is ignored — harmless).
8. **`lib/metrics.ts`** — read `ev:src:first_play:<day>` + `ev:src:visit:<day>` hashes; aggregate
   like `modeSplit`; expose `sourceSplit: { firstPlay: Record<string,number>; visit: Record<string,number> }`.
9. **`app/admin/page.tsx`** — "First-play by source" + "Visits by source" sections (mirror Mode split).
   `/api/funnel` returns full metrics → `sourceSplit` appears automatically.

Security: `/api/ev` is unauthenticated → the strict server-side `SRC_RE` (lowercase-only, ≤40 chars)
is the defense against hash-field injection; client also lowercases so legit `X_Launch` → `x_launch`
(no `Twitter`/`twitter` dupes). §12 unaffected (a public channel label, not an engine hint; no uid in
URL/log).

## Feature B — extend the post-game sign-in moment to every non-Daily mode

Today only Classic/HoopIQ/Prime get a post-game sign-in nudge (`SignInSaveNudge`, rendered by Game
below the result); Daily prompts via the Leaderboard; **FactorHunt/Blueprint/Surgeon/Challenge get
nothing** — a share-link arrival who plays one of those finishes with no reason to make an account.
That coverage gap (not the copy) is the real leak the kickoff flagged.

**Approach decision (vs the kickoff's "moment on the ResultCard" suggestion):** keep ONE consistent
treatment — the existing, already-tested `SignInSaveNudge` — and extend it to every non-Daily mode,
rather than adding a second, differently-styled prompt inside ResultCard. This is *more* complete
(Surgeon uses `SurgeonResult`, not `ResultCard`, so an in-card moment couldn't reach it), lower-risk
(no change to the heavily-tested `ResultCard`), and avoids two competing prompts per result. The
nudge already self-disables when auth is off or the player is signed in.

1. **`lib/signinNudge.ts` (new, tested)** — `showsSaveNudge(mode): boolean` = `mode !== "daily"`. The
   gating lives in a tested predicate (per "TDD any new gating into lib/") so the mode coverage is
   explicit and regression-proof, not a buried JSX conditional.
2. **`components/Game.tsx`** — replace the `(classic|hoopiq|prime)` conditional in the main result
   branch with `{showsSaveNudge(mode) && <SignInSaveNudge />}` (now also covers FactorHunt / Blueprint
   / Challenge), and add `<SignInSaveNudge />` to the separate Surgeon result branch (`SurgeonResult`
   + `SgLeaderboard`). Daily stays excluded — its Leaderboard owns the richer claim-your-rank prompt.
3. **`components/ResultCard.tsx` + `SignInSaveNudge.tsx` — unchanged.** No new orange CTA, no §12
   surface touched; the nudge is post-commit + descriptive ("keep your results and streak across every
   device"), exactly as before.

Measurement: the `signin` funnel stage + `rates.capture` (signins/completes) already exist and will
register the lift. Per-nudge impression/tap instrumentation is **deferred** (optimization data, better
added once there's traffic to optimize against; would bloat this PR).

## TDD / verification

- `lib/utm.test.ts` (jsdom): currentUtmSource sanitization (valid/lowercased/rejected/missing);
  captureUtm first-touch (stores once, never overwrites); getUtmSource round-trip.
- `lib/evServer.test.ts` (+cases): parseEvBody source valid/invalid/uppercase-rejected;
  bump writes `ev:src:first_play:<day>` + `ev:src:visit:<day>`, and does NOT for other stages.
- `lib/firstPlay.test.ts` (+case): markFirstPlay(uid, source) forwards source.
- `lib/metrics.test.ts` / `test/routes/funnel.test.ts` (+case): seed `ev:src:*:<day>` → assert
  `sourceSplit.firstPlay` / `.visit` aggregation in metrics + JSON.
- `test/components/Game.ux.test.tsx` (+case): `/play?mode=daily&utm_source=x_launch` starts daily AND
  `window.location.search === "?utm_source=x_launch"` (utm survives the mode-strip) — the coexisting
  idiom from PR #75. Existing `markFirstPlay` assertions updated to the new `(uid, undefined)` arity.
- `lib/signinNudge.test.ts` (new): `showsSaveNudge` true for every non-daily mode, false for daily.
- `SignInSaveNudge.tsx` + its test + `ResultCard.tsx` are unchanged (coverage-via-existing-component).
- Gate: `tsc --noEmit` + eslint(0) + full `vitest run` → multi-dim adversarial review Workflow
  (verify each finding empirically) → `npm run build` → PR → CI → merge → verify prod deploy +
  `/api/health` → dogfood changed surfaces on both viewports (incl. a `/browse` JS check that a
  `?utm_source=` deep-link starts the game and persists the param).

## Deferred (next session)

Per-page OG for `/about` `/how-it-works` `/leaderboards`; slot-pick crowd reveal; per-nudge
impression/tap funnel stages; referral/retention loops.
