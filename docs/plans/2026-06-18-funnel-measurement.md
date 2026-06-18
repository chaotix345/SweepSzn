# Launch Funnel Measurement — 2026-06-18

Make the north star **visitor → first-play → share** measurable server-side and readable on
launch day (~Jun 23). The existing `/admin` + `lib/metrics.ts` funnel already covers
`play→complete→share→signin→submit`, DAU, D1/D7, mode-split. This pass closes the gaps it can't see.

## Gaps closed

1. **`visit`** — no top-of-funnel signal today, so visitor→first-play is uncomputable. The literal
   north-star denominator does not exist.
2. **`first_play`** — `ev("play")` fires on every start; first-time players are indistinguishable
   from replays. Add a once-per-device first-play signal.
3. **Engagement → Redis** — the 4 PR-#70 events (`explore_open/whatif_open/compare_open/compare_friend`)
   are Vercel-`track()`-only, invisible to the server funnel. `compare_friend` is the viral mechanic.
4. **`share_view`** (judgment add) — no signal that shared `/r/`·`/pe/` links bring people back. For a
   share-loop launch that is *the* number.

## Integrity / security boundary

- Client may send only: `visit, first_play, play, share, share_view, explore_open, whatif_open,
  compare_open, compare_friend`. `complete/signin/submit` stay **server-authoritative** (bumped in
  routes) so the client can't inflate them — `parseEvBody` rejects them.
- Analytics never throws into the UI; `bump()` stays best-effort; routes self-disable without Redis.
- §12 unaffected — these are usage counters, not seed-relative engine hints.

## Taxonomy

- `EvName` (client, `lib/ev.ts`) = the 9 client-sendable stages above.
- `EvStage` (server, `lib/evServer.ts`) = `EvName` ∪ `{complete, signin, submit}`.
- `bump()` active-set membership becomes an explicit allow-list `{play, share, signin, submit}` so the
  new stages don't inflate DAU (visit/share_view shouldn't; first_play/engagement uids are already
  active via `play`).
- Dedupe: `visit` once/session, `first_play` once/device, `share_view` once/page-view. Logic in a
  testable `lib/once.ts`.

## Read path

- `lib/metrics.ts` `Metrics` gains `funnel.visits`, `funnel.firstPlays`, `engagement.{shareViews,
  exploreOpen,whatifOpen,compareOpen,compareFriend}`, and `rates.firstPlay = firstPlays/visits`
  (the north star). `getMetrics` refactored to index counters by stage name (drop positional `counts[i]`).
- `/admin` surfaces Visitors + First-play rate + an Engagement section.
- New **`/api/funnel`** GET (admin-session gated, 404 otherwise — mirrors `/admin`) returns
  `getMetrics` as JSON for curl/programmatic launch-day reads. Test in `test/routes/funnel.test.ts`
  + `ROUTE_TO_TEST` entry.

## Wiring

- `<VisitBeacon/>` mounted on the home page → `ev("visit")` once/session.
- `first_play` gate in `Game.tsx start()` → `ev("first_play")` once/device, beside `ev("play")`.
- `<ShareViewBeacon/>` on `/r/[lineup]` + `/pe/[card]` → `ev("share_view")` once/view.
- Dual-fire `ev()` next to the 4 engagement `track()` calls (ResultCard ExploreZone onOpen,
  WhatIfLab, CompareLineup ×2).

## TDD order

1. `lib/once.ts` (jsdom) — session/device dedupe.
2. `lib/evServer.ts` — `parseEvBody` widening, `bump` active-set allow-list.
3. `lib/metrics.ts` — stage-indexed counters, new funnel/engagement/rate fields.
4. `lib/ev.ts` — widen `EvName` (type).
5. `app/api/funnel/route.ts` + test + ROUTE_TO_TEST.
6. Components (jsdom): VisitBeacon, ShareViewBeacon, first_play wiring, engagement dual-fire.
7. tsc + eslint + full vitest green → adversarial review workflow → fix → build → PR → merge → verify live.
</content>
