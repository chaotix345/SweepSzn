# SweepSzn — Notifications / Re-engagement (v1) — Design

**Date:** 2026-06-10
**Branch:** `feat/notifications`
**Roadmap:** #6 (active re-engagement — "nothing brings players back on its own")
**Status:** self-approved under the session's autonomous-execution grant (user asleep, "never ask"; the
brainstorming interactive gate is overridden by that explicit instruction — see brainstorming skill's
own priority rule "user instructions override skill defaults"). Decisions + alternatives recorded below.

## Problem

The whole loop now exists (play → share OG card → friend plays/challenges → leaderboard → live
results dashboard, PR #19). The missing lever is **active re-engagement**: every return is
user-initiated. Close the loop PR #19 built — when a friend **responds** to a challenge (especially
when they **beat the creator's bar / take #1**), the **creator** gets pulled back: *"Sam beat your
72-10 — reclaim it,"* deep-linking to their live challenge dashboard.

## Scope (v1 — deliberately focused)

IN:
1. **Server notification store** in Upstash, keyed by uid (anon or session), written via `after()`
   inside `api/challenge/submit` when a **responder** submits. Self-disabling when Redis absent.
2. **In-app inbox** that ships live with zero external config: a bell + unread count in `SiteHeader`,
   a dropdown list, mark-as-read, deep links to the creator dashboard. New rate-limited, uid-validated
   GET/POST routes.
3. **Web Push**, end-to-end but **self-disabling** when VAPID env is absent (so build/deploy never
   breaks): `web-push` dep, VAPID keys (public from env, private in PR/report only), a subscription
   store + routes, a service worker + PWA manifest, and a tasteful permission prompt triggered **after
   a meaningful action** (creating a challenge) — never on page load. iOS handled gracefully.

DEFERRED (documented, fast-follow):
- **Daily-drop / streak-saver nudge.** Needs a *scheduled* trigger (Vercel cron iterating subscribers)
  — a different mechanism from the event-driven flagship. Keeping v1 focused per the brief ("don't
  sprawl"). The flagship + inbox + push is already a complete, shippable re-engagement loop.
- **Email** — we don't own a sending domain; out of scope for v1 (not even scaffolded, to avoid a
  half-built dependency). The push + inbox path is the v1.

## Architecture

### Identity (who gets notified / who can read)
- **Notify target** = the challenge creator's `info.uid` (write-once, already stored). Available on the
  responder branch of `submitChallenge` as `out.creator.uid`. Works for anon (localStorage uuid) and
  signed-in (`g…` hash) creators identically — mirrors how the dashboard is already gated.
- **Reader identity** = session-authoritative else validated query uid, **exactly** mirroring
  `api/challenge/[id]/results`. The known/accepted edge (create-anon-then-sign-in → can't read your own
  inbox) is identical to the dashboard's and is acceptable.

### Data model (Redis) — capped list + read-watermark
- `notif:<uid>` — Redis **LIST**, `LPUSH` newest-first, `LTRIM 0 NOTIF_CAP-1` (cap 50), `EXPIRE` TTL
  (31d, matches other keys; self-cleaning).
- `notif:<uid>:read` — string watermark = the `ts` of the newest notification the user has marked read.
- **unread** = count of items with `ts > watermark`. **mark-all-read** = set watermark to the newest
  `ts`. Idempotent, no drift, supports the per-item "new" dot (ts > watermark).

*Alternatives rejected:* per-item `read` boolean (Redis lists can't update an item by id without racy
`LSET`-by-index); a separate decrementing unread counter (drifts; loses per-item state). Watermark wins
on simplicity + correctness.

### Notification object (stored JSON)
```ts
interface Notif {
  id: string;            // `${challengeId}:${ts}:${opponent}` — deterministic, unique, testable (no RNG)
  type: "challenge_response";
  challengeId: string;
  opponent: string;      // responder display name (already cleanName'd at submit)
  outcome: "beaten" | "tied" | "held"; // from the CREATOR's POV
  tookLead: boolean;     // responder is now #1 on the board
  oppWins: number; oppLosses: number;  // responder's record
  yourWins: number; yourLosses: number;// creator's bar
  ts: number;
}
```
Deep-link target = `/play?own=<challengeId>` (the `ChallengeOwner` dashboard reads `?own=`).

### Enqueue point (the flagship event)
Inside `api/challenge/submit` POST, **responder branch only**, in `after()`:
- Only when the submission is a **new personal best** for that responder (`submitChallenge` returns a
  new `improved` flag; it already computes `prev == null || score > prev`). This prevents spam from a
  friend grinding worse retries; a genuine improvement (e.g. now beating you) is a legitimate ping.
  The list cap + 31d TTL + per-IP submit rate-limit bound any residual volume.
- Compute `outcome` from `compareResults(responder, creator)`; `tookLead` = responder's post-submit
  board rank is 1.
- Enqueue the in-app notif **and** attempt web push to `creator.uid` — both self-disabling, both
  error-swallowed (never break submit). `after()` already runs post-response.

### Routes (all `runtime="nodejs"`, per-IP `rateLimit`, uid-validated, self-disabling)
- `GET  /api/notifications?uid=` → `{ items: Notif[], unread: number }`
- `POST /api/notifications/read` (body `{uid}`) → sets watermark → `{ unread: 0 }`
- `POST /api/push/subscribe`   (body `{uid, subscription}`) → stores sub (shape-validated)
- `POST /api/push/unsubscribe` (body `{uid, endpoint}`) → prunes a sub (privacy hygiene / toggle-off)

### Web Push
- **`web-push`** dep. `isPushEnabled()` = `VAPID_PUBLIC_KEY` (or `NEXT_PUBLIC_VAPID_PUBLIC_KEY`) +
  `VAPID_PRIVATE_KEY` + `VAPID_SUBJECT` all present. Mirrors `isRedisEnabled`/`isAuthEnabled`.
- Subscription store `push:<uid>` = Redis **HASH** (field = sha256(endpoint), value = JSON sub), TTL
  refreshed. Multi-device. On send, iterate; on `404/410 Gone` delete that field (prune dead subs).
- Send path: lazy `import("web-push")` inside the guarded sender so it's only loaded when actually
  sending; sets VAPID details from env; `sendNotification` per sub; all try/caught.
- **Service worker** `public/sw.js` (root scope): `push` → `showNotification(title, {body, icon, data:{url}})`;
  `notificationclick` → focus an existing client on the url or `openWindow`.
- **Manifest** `app/manifest.ts` (Next 16 metadata route): name/short_name/start_url `/play`/display
  standalone/theme+bg `#0A0A0B` (arena base)/icons referencing existing `/icon.svg` (+ favicon).
- **Client opt-in** `usePush` hook + `PushPrompt` rendered **inside `ChallengeOwner`** (shown right
  after creating a challenge — the exact moment a creator wants "tell me when a friend responds").
  - Self-disables (renders nothing) unless `NEXT_PUBLIC_VAPID_PUBLIC_KEY` is set **and**
    `Notification`/`serviceWorker`/`PushManager` exist.
  - Permission requested **only on button click**, never on load. States: default → button "🔔 Notify
    me when a friend responds"; granted+subscribed → subtle "Alerts on"; denied → nothing (no nag).
  - **iOS**: Safari needs the PWA installed to Home Screen for push. Detect iOS + non-standalone →
    show an "Add to Home Screen to get alerts" hint instead of a button that would silently fail.

### Pure, TDD'd helpers (`lib/notify.ts`, no `server-only` → unit-testable like `score.ts`)
- `buildChallengeNotification(input): Notif` — deterministic id, no RNG.
- `unreadCount(items, watermark): number`.
- `notificationText(n): { title, body }` — shared by the inbox UI and the push payload.
- `validateSubscription(body): PushSub | null` — shape gate (https endpoint + keys.p256dh + keys.auth).

## Security / privacy posture (the review will hammer this)
- **No notification spoofing:** notifications are *only* written server-side inside the verified submit
  path (after a real `verifyTrace`). There is **no** public "create notification" endpoint. A client
  cannot inject into anyone's inbox.
- **No uid harvesting:** no endpoint returns *other* people's uids (the board already strips them); GET
  notifications requires you to already know the uid (your own session/localStorage). Payloads contain
  only a friend's display name + a W-L record + an unguessable challenge id — all already on / derivable
  from the public challenge board. Same threat model the existing results endpoint already accepts;
  stated explicitly.
- **Creator-gating rigor** identical to the results endpoint: session-authoritative identity, uid regex,
  per-IP rate-limit on every route.
- **Push subscribe** shape-validated; payloads carry only non-sensitive data; dead subs auto-pruned.

## Testing
- TDD the pure helpers (`lib/notify.test.ts`, hand-rolled assert pattern like `challenge.test.ts`).
- Extend `challenge.test.ts`/`challengeStore` for the new `improved` flag if it lands in a pure unit.
- Static gate: `tsc --noEmit`, `eslint app components lib`, `next build`, all `tsx lib/*.test.ts`.
- Adversarial multi-agent review (security/privacy focus) before merge; fix every finding.
- Self-QA every path verifiable without a 2nd device (inbox routes, self-disable, enqueue via a
  prod/preview E2E harness that creates a challenge + responds and asserts the creator's inbox).

## Out-of-scope / non-goals
Engine untouched. No storage/cookie key renames. No email. No daily-drop cron (fast-follow). No new
player data.
