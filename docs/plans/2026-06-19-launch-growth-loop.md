# Launch growth loop — design spec (2026-06-19)

Pre-launch funnel read (Jun 6–19, via `/api/funnel?days=14`): essentially no organic
traffic yet — 703 plays / 427 completes from owner + a handful of testers; `visits=10`
(broken/too-new denominator), `nudgeSplit={}` and `sourceSplit` only test traffic (both
shipped Jun 19, no traffic through them). The two genuinely weak *real* rates are **share
4.0%** (17/427) and **sign-in 2.1%** (9/427); completion 60.7% and d1/d7 28.7%/21.2% are
healthy. With no traffic to CRO against before the ~Jun 23 launch, the highest-leverage move
is the lever that makes launch traffic *compound* (referral) + making launch day *readable*.
The referral loop attacks both weak rates (a reason to invite → shares; a reason to sign in →
own your referral credit/badge).

One coherent PR, atomic commits per item, full ship→review→merge→verify-deploy loop.

---

## 1. Referral / invite loop (headline)

### 1.1 Code model (§12-safe)

A referral **code** is an opaque public proxy for a user, **never the bearer-token uid**
(root `DESIGN.md` §12 forbids shipping the anon uid in URLs/logs — anyone holding it *is*
that player).

- Derived deterministically server-side: `refCodeFor(uid) = "r" + sha256hex("ref:" + uid).slice(0, 11)`.
  Matches `REF_RE = /^r[0-9a-f]{11}$/` (12 chars; ~44 bits — collision-safe at our scale, and a
  collision merely mis-credits a cosmetic counter, never anything competitive).
- The hash is one-way, so on mint we persist the **reverse map** `ref:code:<code> → uid`
  (string, no TTL). Deterministic derivation means we do NOT need a `ref:uid→code` key —
  recompute the code from the uid whenever needed. Mint is idempotent.

### 1.2 Mint — `POST /api/referral`

- Body `{ uid }` (anon bearer uid — same uid-in-POST-body pattern as `/api/ev`, §12-OK).
  If a valid session exists, prefer `session.uid` for cross-device durability.
- Behavior: `code = refCodeFor(uid)`; `SET ref:code:<code> <uid>` (idempotent); read
  `credits = Number(GET ref:credits:<uid>) || 0`; return `{ code, credits }`.
- Rate-limited (`rl:ref:<ip>`, reuse `rateLimit`). Self-disables gracefully if Redis absent
  (returns `{ code: refCodeFor(uid), credits: 0 }` — code is still derivable, crediting is
  best-effort).
- Needs `test/routes/referral.test.ts` + a `ROUTE_TO_TEST` entry.

### 1.3 Inbound capture (client) — `lib/referral.ts`

Mirrors `lib/utm.ts` exactly:
- `KEY = "szn:ref:in"`, `REF_RE = /^r[0-9a-f]{11}$/` (mirrored server-side).
- `currentRefCode()` reads `?ref=` from the live URL (sanitized).
- `getRefCode()` reads first-touch persisted code.
- `captureRef()` first-touch-wins persist (only writes if slot empty).
- The user's OWN sharable code is cached separately at `szn:ref:code` (set by the invite UI
  after `/api/referral`), read by `getOwnRefCode()`.

Capture is added to the existing root-layout `UtmCapture` effect (it already runs on every
route): it calls `captureRef()` alongside `captureUtm()`.

### 1.4 Attribution + credit (server) — `lib/evServer.ts`

- `parseEvBody` parses `ref` (REF_RE) — only meaningful for `first_play` (a new `REF_STAGES`
  set, parallel to `SOURCE_STAGES`). Independent of the `source`/`mode` blocks.
- `bump()` on `stage === "first_play"` with a valid `ref`:
  1. `referrerUid = GET ref:code:<ref>`; if null → ignore (invalid/unknown code).
  2. Self-referral guard: if `referrerUid === opts.uid` → ignore.
  3. Referee once-ever dedupe: `SET ref:fp:<refereeUid> <ref> NX` — if it already existed,
     ignore (anti-replay; refereeUid is device-stable).
  4. Credit: `INCR ref:credits:<referrerUid>` (no TTL — all-time count).
  5. Dashboard: `HINCRBY ev:ref:first_play:<day> <ref> 1` + `EXPIRE`, **HLEN-capped at
     `EV_REF_CAP = 2000`** (per-referrer fields can be numerous; cap protects memory).
  6. Badges: `SADD ref:referrers <referrerUid>` + `SADD ref:referred <refereeUid>`.
- `ref` is forwarded from `/api/ev/route.ts` into `bump()` (alongside uid/mode/source).

### 1.5 Badge (cosmetic, §12-safe) — `lib/dex.ts` + `lib/dexState.ts`

- `lib/dex.ts`: add `BadgeKey` literals `"recruiter"` + `"invited"`; two `BADGES[]` entries
  (`recruiter` → "Talent Scout" / "Bring a friend to SweepSzn"; `invited` → "Drafted In" /
  "Arrive on a friend's invite"). `computeBadges(players, results, flags?)` gains
  `flags?: { isReferrer?: boolean; isReferee?: boolean }` → `if (flags?.isReferrer)
  earned.push("recruiter")`, same for `invited`. (Precedent: `sTier`, awarded from grades not
  collection.)
- `lib/dexState.ts` `loadDexState(uid)`: two `SISMEMBER`s (`ref:referrers`, `ref:referred`)
  → pass `flags` to `computeBadges`.
- No changes to `NotificationBell`, `lib/notify.ts`, `profileStore.ts`, `DexBoard.tsx`,
  `app/api/profile/sync/route.ts` — the existing badge-unlock notification + Dex display
  pipeline resolves any new `BadgeKey` via `BADGES.find(...)`. Notification fires on the next
  profile sync (signed-in); the Dex board shows the badge for any uid. (The badge therefore
  doubles as a sign-in incentive — on-strategy.)

### 1.6 Invite UI — `components/Game.tsx` result screen

- A first-class **"Invite a friend →"** affordance rendered near the existing share controls
  on every result (both the Surgeon branch and the standard `ResultCard` branch), modeled on
  the existing "⚔️ Challenge a friend" button (Game.tsx). On first open it lazy-mints the code
  (`POST /api/referral`, cache to `szn:ref:code`) and copies
  `https://sweepszn.com/?ref=<code>` (lands on home; `captureRef` first-touches it). Shows the
  referrer's `credits` ("N friends drafted so far") when > 0.
  - New small client component `components/InviteFriend.tsx` (keeps `Game.tsx` thin; logic in
    `lib/referral.ts`). Self-disables if minting fails (graceful).
- `ShareButton` (in `ResultCard.tsx`): when `getOwnRefCode()` returns a cached code, append
  `?ref=<code>` to the minted share URL so every share is also a referral. Canonical/OG are
  bare-path (query ignored) — no SEO impact. Guarded so a missing code leaves URLs unchanged.

### 1.7 Dashboard — `lib/metrics.ts` + `app/admin/page.tsx`

- `metrics.ts`: fold `ev:ref:first_play:<day>` → `referralSplit: Record<string, number>`
  (code → referred-first-plays), added to the `Metrics` interface and `/api/funnel` output.
- `/admin`: new "Referrals" section — total referred first-plays + the top codes by count
  (empty-state copy mirroring the "Acquisition by source" section).

---

## 2. `@SweepSeason` handle consolidation

- `lib/site.ts`: `export const X_HANDLE = "@SweepSeason";` and
  `export const X_URL = "https://x.com/SweepSeason";`.
- Replace every hardcode (all-or-nothing):
  - `app/layout.tsx` twitter site/creator.
  - 8 permalink route twitter blocks: `r`, `pe`, `sg`, `compare`, `rank`, `dex/s`, `c`,
    (and `marketingMeta.ts`'s file-private `X_HANDLE` → import the shared one).
  - 3 live share-text builders: `ResultCard.tsx` (`via @SweepSeason`), `RankShareButton.tsx`,
    `DexBoard.tsx`.
  - `SiteFooter.tsx` link href + aria-label + rendered text → `X_URL`/`X_HANDLE`.
  - `app/(site)/page.tsx` JSON-LD `sameAs` → `X_URL`.
- Existing tests assert the literal `"@SweepSeason"` — they stay green (the const resolves to
  the same string). Add one test pinning `X_HANDLE`/`X_URL` values in `lib/site.ts`.

---

## 3. Per-source / per-nudge outlier alerts (`/admin`)

- `lib/metrics.ts` pure helper `flagLaggards(rates: { key: string; num: number; den: number }[],
  opts?: { minDen?: number; ratio?: number })`: compute each entry's rate `num/den`; ignore
  entries below `minDen` (default 5) to avoid flagging tiny samples; flag any whose rate is
  below `ratio` × the median rate of the eligible entries (default `ratio = 0.5`). Returns the
  flagged keys.
- `/admin`: feed it `sourceSplit` (firstPlay/visit per source) and `nudgeSplit` (tap/shown per
  mode); render a ⚠️ marker on each flagged row + a one-line summary ("N channels/modes
  converting well below the rest").

---

## 4. winBuckets daily → weekly

- `metrics.ts`: the win-distribution `zrange` reads **`lb:week:{isoWeek(today)}`** instead of
  `lb:{today}` (same `encScore` keep-best encoding; accumulates within the week so it's not
  empty after the daily UTC reset). `boards.weekly` already proves the key is populated.
- `/admin`: relabel the section "This week's win distribution".
- Existing `metrics.test.ts` win-bucket test updated to seed the weekly key.

---

## Testing plan

- Pure helpers (unit): `refCodeFor` determinism + REF_RE shape; `lib/referral.ts`
  capture/sanitize (jsdom); `flagLaggards` (median/min-sample/ratio edge cases); weekly
  `bucketWins` source; `computeBadges` flags (recruiter/invited on/off).
- `lib/evServer.ts` `bump()` on redisFake: credit on valid ref, ignore unknown code, ignore
  self-referral, dedupe referee replay, HLEN cap, badge-set membership.
- `app/api/referral/route.ts`: mint idempotency, credits read, rate-limit, Redis-absent
  fallback → `test/routes/referral.test.ts` + `ROUTE_TO_TEST`.
- Components: `InviteFriend` (copies link, shows credits), `ShareButton` ref-append when code
  cached / unchanged when absent, handle const single-source.
- Full hermetic `npx vitest run` from `web/` stays green; `tsc` + eslint clean; `npm run build`
  passes (static OG routes prerender).

## §12 compliance

- Referral code is an opaque public proxy; the referrer uid is server-side only; the bearer
  uid never enters a URL/log. ✓
- Attribution + credit + cosmetic badge are all **descriptive** (who brought whom; a
  collection flair) — no per-candidate hint, no engine advantage. The hint-credit incentive
  option was explicitly **rejected** (it would let referrals buy advantage in the scarce
  2-hint economy). ✓
- All client inputs are regex-bounded (`REF_RE`) and Redis writes HLEN-capped
  (`EV_REF_CAP`); `/api/ev` and `/api/referral` stay unauthenticated but bounded. ✓

## Handoff roll

This PR also completes the session handoff roll: it bundles the staged deletion of
`docs/plans/next-session-2026-06-22.md` and (at session end) writes the next kickoff prompt,
mirroring how PR #77 bundled the 06-21→06-22 roll.
