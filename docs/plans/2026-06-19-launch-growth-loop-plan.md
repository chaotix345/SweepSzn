# Launch growth loop — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (inline, this session). Steps use checkbox (`- [ ]`) syntax. Full design detail lives in the sibling spec `2026-06-19-launch-growth-loop.md` — this plan is the ordered, TDD-structured execution.

**Goal:** Ship a §12-safe referral growth loop (attribution + credit + cosmetic badge), consolidate the `@SweepSeason` handle, add `/admin` conversion-outlier alerts, and switch the win-distribution chart to the weekly board — one PR.

**Architecture:** Reuse the PR #76 `utm_source` source-threading idiom: a referral code rides inbound URLs (`?ref=`), is first-touch captured client-side, sent on `first_play`, decoded server-side back to the referrer to credit them, and recorded for the dashboard. Cosmetic badges via the existing pure `computeBadges` + profile-sync notification pipeline. Pure logic in tested `lib/`; components/routes stay thin.

**Tech Stack:** Customized Next.js App Router, TypeScript, Upstash Redis (hermetic `test/redisFake.ts`), Vitest.

## Global Constraints

- TDD always (red→green→refactor). Hermetic Vitest: `npx vitest run` from `web/` (config excludes `.claude` worktrees).
- Every new API route needs `test/routes/<name>.test.ts` + a `ROUTE_TO_TEST` entry (`test/routes/routeCoverage.meta.test.ts`). `opengraph-image`/`page`/`sitemap`/`robots` need NO entry.
- `REF_RE = /^r[0-9a-f]{11}$/` — mirrored client (`lib/referral.ts`) + server (`lib/evServer.ts`). `EV_REF_CAP = 2000`.
- §12: referral code is an opaque public proxy; the bearer uid NEVER enters a URL/log; no engine advantage (hint-credit rejected). All `/api/ev` + `/api/referral` inputs regex-bounded + HLEN-capped.
- Next metadata is shallow-merged PER KEY — don't disturb the per-route `openGraph`/`twitter` re-carries when swapping the handle literal.
- GOTCHA: `Read` a file before `Edit`; after a batch, grep disk / `git diff --stat` to confirm it landed.
- Commit messages end with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

---

### Task 1: `@SweepSeason` handle consolidation

**Files:**
- Modify: `web/lib/site.ts` (add `X_HANDLE`, `X_URL`)
- Modify: `web/app/layout.tsx`, `web/app/r/[lineup]/page.tsx`, `web/app/pe/[card]/page.tsx`, `web/app/sg/[card]/page.tsx`, `web/app/compare/[id1]/[id2]/page.tsx`, `web/app/rank/[card]/page.tsx`, `web/app/dex/s/[card]/page.tsx`, `web/app/c/[id]/page.tsx`, `web/lib/marketingMeta.ts`, `web/components/ResultCard.tsx`, `web/components/RankShareButton.tsx`, `web/components/DexBoard.tsx`, `web/components/SiteFooter.tsx`, `web/app/(site)/page.tsx`
- Test: `web/test/lib/site.test.ts` (new)

**Produces:** `X_HANDLE = "@SweepSeason"`, `X_URL = "https://x.com/SweepSeason"` from `lib/site.ts`.

- [ ] Step 1: Write `test/lib/site.test.ts` asserting `X_HANDLE === "@SweepSeason"` and `X_URL === "https://x.com/SweepSeason"`. Run → fails (not exported).
- [ ] Step 2: Add both exports to `lib/site.ts`. Run test → pass.
- [ ] Step 3: Replace every hardcode (grep `SweepSeason` across `web/app web/lib web/components` first to confirm the set; the share-text builders use `via ${X_HANDLE}`, footer/sameAs use `X_URL`). Import from `@/lib/site`. Leave test files asserting the literal `"@SweepSeason"` untouched (const resolves to same string).
- [ ] Step 4: `npx vitest run` (full) → green; grep `"@SweepSeason"` in non-test source returns 0 hits. Commit.

---

### Task 2: winBuckets daily → weekly

**Files:**
- Modify: `web/lib/metrics.ts` (the `lb:${today}` win-distribution `zrange` → `lb:week:{isoWeek(today)}`; reuse the existing isoWeek helper used for `boards.weekly`)
- Modify: `web/app/admin/page.tsx` (relabel section "This week's win distribution")
- Test: `web/test/metrics.test.ts` (update the win-bucket test to seed the weekly key)

**Interfaces — Consumes:** existing `bucketWins`, `decodeWins`, weekly-key helper.

- [ ] Step 1: Update the win-bucket test in `metrics.test.ts` to seed `lb:week:<iso>` (not `lb:<today>`) and assert non-zero buckets. Run → fails (still reads daily).
- [ ] Step 2: Point the win-distribution `zrange` at the weekly key. Run → pass.
- [ ] Step 3: Relabel the `/admin` heading. Full vitest → green. Commit.

---

### Task 3: Conversion-outlier alerts (`flagLaggards` + `/admin`)

**Files:**
- Modify: `web/lib/metrics.ts` (export pure `flagLaggards`)
- Modify: `web/app/admin/page.tsx` (⚠️ markers on flagged source/nudge rows + summary line)
- Test: `web/test/metrics.test.ts`

**Interfaces — Produces:**
```ts
export function flagLaggards(
  entries: { key: string; num: number; den: number }[],
  opts?: { minDen?: number; ratio?: number }, // defaults minDen=5, ratio=0.5
): Set<string> // keys whose num/den < ratio * median(rate of entries with den>=minDen)
```

- [ ] Step 1: Tests: (a) flags a key far below median; (b) ignores keys with `den < minDen`; (c) empty / single-eligible → empty set; (d) all-equal rates → empty set. Run → fail.
- [ ] Step 2: Implement `flagLaggards` (median over eligible rates; flag eligible entries below `ratio*median`). Run → pass.
- [ ] Step 3: In `/admin`, build `flagLaggards` inputs from `sourceSplit` (num=firstPlay, den=visit per source) and `nudgeSplit` (num=tap, den=shown per mode); render ⚠️ on flagged rows + a summary count. Full vitest → green. Commit.

---

### Task 4: Referral code core (`lib/referral.ts` + `refCodeFor`)

**Files:**
- Create: `web/lib/referral.ts` (client capture, mirrors `lib/utm.ts`)
- Modify: `web/lib/referralCode.ts` (new tiny server util) OR co-locate `refCodeFor` — place server derivation in `web/lib/referralCode.ts` (server-safe, imports `sha256hex` from `lib/auth` or `lib/hash`)
- Test: `web/test/lib/referral.test.ts` (jsdom: capture/sanitize), `web/test/lib/referralCode.test.ts` (determinism + shape)

**Interfaces — Produces:**
```ts
// lib/referralCode.ts (server)
export const REF_RE = /^r[0-9a-f]{11}$/;
export function refCodeFor(uid: string): string; // "r" + sha256hex("ref:"+uid).slice(0,11)
// lib/referral.ts (client)
export function currentRefCode(): string | null;   // ?ref= in URL, REF_RE-sanitized
export function getRefCode(): string | null;        // szn:ref:in (inbound, first-touch)
export function captureRef(): void;                 // first-touch persist
export function getOwnRefCode(): string | null;     // szn:ref:code (this user's own code cache)
export function setOwnRefCode(code: string): void;
```

- [ ] Step 1: `referralCode.test.ts`: `refCodeFor("abc")` matches REF_RE, is deterministic, differs for different uids. Run → fail.
- [ ] Step 2: Implement `lib/referralCode.ts` (confirm the sha256hex import path — check `lib/auth.ts`). Run → pass.
- [ ] Step 3: `referral.test.ts` (jsdom): `captureRef` first-touch-wins; `currentRefCode` reads `?ref=`; REF_RE rejects junk; own-code cache round-trips. Run → fail.
- [ ] Step 4: Implement `lib/referral.ts`. Run → pass. Commit.

---

### Task 5: `POST /api/referral`

**Files:**
- Create: `web/app/api/referral/route.ts`
- Test: `web/test/routes/referral.test.ts`
- Modify: `web/test/routes/routeCoverage.meta.test.ts` (add `ROUTE_TO_TEST` entry)

**Interfaces — Consumes:** `refCodeFor`, `REF_RE`, `redis`, `rateLimit`, `getSession`, `UID_RE`.
**Produces:** `POST /api/referral {uid}` → `{ code, credits }`. `SET ref:code:<code> <uid>`; `credits = Number(GET ref:credits:<uid>)||0`.

- [ ] Step 1: Route tests on routeHarness/redisFake: valid uid → `{code,credits:0}` and `ref:code:<code>` mapped; idempotent (second call same code); credits reflects a pre-seeded `ref:credits:<uid>`; rate-limit returns 204/429 past cap; Redis-absent → code still derivable. Run → fail.
- [ ] Step 2: Implement the route (prefer `session.uid` when present, else body uid validated by `UID_RE`). Add `ROUTE_TO_TEST` entry. Run → pass. Commit.

---

### Task 6: Server attribution + credit (`evServer` + `/api/ev`)

**Files:**
- Modify: `web/lib/evServer.ts` (`parseEvBody` `ref`; `REF_STAGES`; `bump()` credit/decode/dedupe/self-ref/cap + badge sets; `EV_REF_CAP`)
- Modify: `web/app/api/ev/route.ts` (forward `parsed.ref` into `bump`)
- Test: `web/test/lib/evServer.test.ts` (or wherever bump is tested) + `web/test/routes/ev.test.ts`

**Interfaces — Consumes:** `REF_RE`, `redis`. **Produces:** on `first_play` + valid `ref`: `INCR ref:credits:<referrerUid>`, `HINCRBY ev:ref:first_play:<day> <ref>` (HLEN-cap `EV_REF_CAP`), `SADD ref:referrers <referrerUid>`, `SADD ref:referred <refereeUid>`, dedupe `SET ref:fp:<refereeUid> NX`.

- [ ] Step 1: bump tests (redisFake): valid ref → credit+sets+hash written; unknown code → no-op; self-referral (`ref:code:<ref>`==uid) → no-op; replay (second first_play same referee) → no extra credit; HLEN cap respected; non-first_play stage with ref → ignored. Run → fail.
- [ ] Step 2: Implement `parseEvBody` ref + `bump` branch + `/api/ev` forward. Run → pass.
- [ ] Step 3: `ev.test.ts`: POST first_play with `ref` credits the referrer end-to-end. Full vitest → green. Commit.

---

### Task 7: Referral badges (`dex` + `dexState`)

**Files:**
- Modify: `web/lib/dex.ts` (BadgeKeys `recruiter`/`invited`; `BADGES[]` entries; `computeBadges(players, results, flags?)`)
- Modify: `web/lib/dexState.ts` (`loadDexState` SISMEMBER `ref:referrers`/`ref:referred` → flags)
- Test: `web/test/lib/dex.test.ts`, `web/test/lib/dexState.test.ts` (or existing)

**Interfaces — Produces:** `computeBadges(players, results, flags?: {isReferrer?:boolean; isReferee?:boolean})`.

- [ ] Step 1: `dex.test.ts`: `recruiter` earned iff `flags.isReferrer`; `invited` iff `flags.isReferee`; absent otherwise; existing badge tests still pass with new optional arg. Run → fail.
- [ ] Step 2: Add keys + catalog entries + flag handling. Run → pass.
- [ ] Step 3: `dexState` test: seeds `ref:referrers`/`ref:referred` membership → flags flow into computeBadges. Run → pass. Full vitest → green. Commit.

---

### Task 8: Referral dashboard (`metrics.referralSplit` + `/admin`)

**Files:**
- Modify: `web/lib/metrics.ts` (`referralSplit: Record<string,number>` folded from `ev:ref:first_play:<day>`; add to `Metrics`)
- Modify: `web/app/admin/page.tsx` (Referrals section)
- Test: `web/test/metrics.test.ts`

- [ ] Step 1: metrics test: seed `ev:ref:first_play:<day>` hashes → `referralSplit` folds counts by code; total derivable. Run → fail.
- [ ] Step 2: Implement the fold (mirror `foldHashes`/`sourceSplit`); add to interface + `/api/funnel` (returns full Metrics, automatic). Render `/admin` "Referrals" section (top codes + total; empty-state copy). Full vitest → green. Commit.

---

### Task 9: Inbound capture wired into root layout

**Files:**
- Modify: the existing `UtmCapture` component (grep for it; likely `web/components/UtmCapture.tsx`) — call `captureRef()` alongside `captureUtm()`
- Test: `web/test/components/UtmCapture.test.tsx` (or add) — both capture fns invoked on mount

- [ ] Step 1: Test: mounting the capture component first-touches both `szn:utm:source` and `szn:ref:in` from a URL with `?utm_source=&?ref=`. Run → fail.
- [ ] Step 2: Add `captureRef()` to the effect. Run → pass. Commit.

---

### Task 10: Invite UI + share-link ref-append

**Files:**
- Create: `web/components/InviteFriend.tsx` (client; lazy-mints via `/api/referral`, copies `https://<host>/?ref=<code>`, shows credits)
- Modify: `web/components/Game.tsx` (render `<InviteFriend/>` near share controls on Surgeon + standard result branches)
- Modify: `web/components/ResultCard.tsx` (`ShareButton`: append `?ref=<getOwnRefCode()>` to the minted URL when a code is cached)
- Modify: `web/components/Game.tsx` also pass `markFirstPlay` unchanged (already forwards source) — ensure first_play also sends `ref`: update `lib/firstPlay.ts` to read `currentRefCode() ?? getRefCode()` and pass it; OR thread `ref` in `Game.start()`.
- Test: `web/test/components/InviteFriend.test.tsx`, `web/test/components/ResultCard.test.tsx` (ref-append present when code cached, absent otherwise), update `firstPlay`/Game test for ref forwarding.

**Interfaces — Consumes:** `lib/referral.ts`, `/api/referral`.

- [ ] Step 1: `firstPlay` test: `markFirstPlay` forwards `ref` when an inbound code is present (extend signature `markFirstPlay(uid, source?, ref?)` or read inside). Run → fail. Implement. Pass.
- [ ] Step 2: `InviteFriend.test.tsx`: renders CTA; on click mints (mock fetch) + writes clipboard with `?ref=`; shows credits when >0. Run → fail. Implement `InviteFriend`. Pass.
- [ ] Step 3: `ResultCard.test.tsx`: with `szn:ref:code` set, X-intent URL contains `?ref=`; without, unchanged. Run → fail. Implement append in `ShareButton`. Pass.
- [ ] Step 4: Wire `<InviteFriend/>` into both `Game.tsx` result branches. Full vitest → green. Commit.

---

### Task 11: Handoff roll + ship

- [ ] Step 1: `next-session-2026-06-22.md` deletion already staged on the branch; keep it. (The next kickoff prompt is written at session end, before the final commit, per the handoff convention.)
- [ ] Step 2: `tsc --noEmit` (or `npm run build` typecheck), `eslint`, full `npx vitest run` — all green.
- [ ] Step 3: Multi-dimension adversarial review Workflow; verify each finding empirically; fix actionable ones.
- [ ] Step 4: `npm run build` passes. Push, open PR to main, CI green, merge `--delete-branch`.
- [ ] Step 5: Verify prod deploy (curl a server-rendered marker; `/browse` for client behavior; `/api/health`); dogfood changed surfaces both viewports. Write the next-session kickoff.

---

## Self-review

- **Spec coverage:** §1.1–1.7 → Tasks 4,5,6,7,8,9,10; §2 → Task 1; §3 → Task 3; §4 → Task 2; handoff → Task 11. All covered.
- **Placeholders:** none — each task names exact files, interfaces, and test cases.
- **Type consistency:** `REF_RE`/`refCodeFor` defined Task 4, consumed Tasks 5,6; `flagLaggards` signature fixed Task 3; `computeBadges(..., flags?)` fixed Task 7 and consumed by `loadDexState`; `referralSplit` fixed Task 8.
- **Open verification during execution:** confirm `sha256hex` import path (Task 4), the isoWeek helper name (Task 2), the `UtmCapture` file path + the `markFirstPlay` call site (Tasks 9,10), and the `ROUTE_TO_TEST` shape (Task 5) — all by reading the files before editing.
