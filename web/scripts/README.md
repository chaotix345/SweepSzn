# scripts/ — Manual E2E Harnesses + Ops Tools

The four e2e harnesses run against a live deployment (or local dev server) and are **not** part of `npm test` / Vitest. They are manually invoked, env-gated, and skip cleanly with exit 0 when the required env vars are absent. Ops/recovery tools are documented at the bottom.

---

## auth_e2e.ts

**What it verifies:**
- `POST /api/auth/nonce` returns 200 + a nonce and sets the nonce cookie
- `GET /api/auth/me` returns `user: null` when no session cookie is present
- `GET /api/auth/me` returns the correct user when a minted HS256 session cookie is passed
- CSRF hardening on `POST /api/auth/google` (415 without JSON content-type, 403 without `x-requested-with`, 400 with no credential)
- `POST /api/auth/signout` returns 200

**Required env vars:**
- `BASE` — URL of the running server to test (e.g. `http://localhost:3000` or a deployed URL)
- `AUTH_SECRET` — must equal the **target server's** secret (the harness mints session cookies with it). Fails loudly if `BASE` is set but `AUTH_SECRET` is not.
- Skips cleanly if `BASE` is absent: `skipped: BASE is not set`

**How to run:**
```
# local dev server must be running with full auth env configured
BASE=http://localhost:3000 AUTH_SECRET=<server's secret> npx tsx scripts/auth_e2e.ts

# or against a deployed URL
BASE=https://your-deployment.vercel.app AUTH_SECRET=<prod secret> npx tsx scripts/auth_e2e.ts
```

**Expected output:**
```
ok: POST /api/auth/nonce -> 200 + nonce
ok: nonce route sets the nonce cookie
ok: GET /api/auth/me (no cookie) -> user null
ok: GET /api/auth/me (minted cookie) -> the user
ok: POST /api/auth/google without JSON content-type -> 415
ok: POST /api/auth/google without x-requested-with -> 403
ok: POST /api/auth/google with no credential -> 400
ok: POST /api/auth/signout -> 200

ALL AUTH E2E CHECKS PASSED
```

**Notes:** No cleanup needed (stateless HTTP checks).

---

## h2h_e2e.ts

**What it verifies:**
- Builds two distinct valid draft traces from the live `/api/spin` endpoint
- Creator submit returns 200, correct role, board total 1, no lineup leak in board rows
- Responder submit returns 200, correct role, verdict (win/loss/tie), reveals creator's five, board total 2, no lineup leak
- Creator re-submit is idempotent (stays creator, no self-vs-self match)
- Tampered trace is rejected with 400
- Input validation: bad challenge id and bad uid both return 400
- Challenge landing page (`/c/<id>`) returns 200 with challenge framing and no leaked player IDs in HTML
- OG image (`/c/<id>/opengraph-image`) returns 200 with `image/*` content-type

**Required env vars:**
- `PROD_URL` — base URL of the deployment to test (e.g. `https://your-app.vercel.app`)
- Skips cleanly if absent: `skipped: PROD_URL is not set`

**How to run:**
```
PROD_URL=https://your-deployment.vercel.app npx tsx scripts/h2h_e2e.ts
```

**Expected output:**
```
base: https://your-deployment.vercel.app
ok: built two distinct valid traces from /api/spin
challenge id: <8-char id>
creator  lineup: <player ids>
responder lineup: <player ids>
ok: creator submit 200 ...
ok: creator role ...
...
verdict: responder win (winsMargin …, netMargin …); creator five = Player A, Player B, ...

ALL H2H PROD E2E CHECKS PASSED
(test rows live under chal:<id> on prod Upstash; 31-day TTL, unguessable id)
```

**Cleanup:** Test rows are written to prod Upstash under keys `chal:<id>` using random unguessable IDs with a 31-day TTL. No manual cleanup needed.

---

## lua_e2e.ts

**What it verifies:**
- The exact `KEEP_BEST_LUA` script (from `lib/score.ts`) running against real Upstash Redis
- First submit credits all wins to daily, weekly, and all-time leaderboards
- Score improvement credits only the delta wins to weekly/all-time
- Worse or equal score is a no-op (idempotent)
- Net-only improvement (same wins, higher net) updates the entry but contributes 0 win delta
- 8 parallel identical first-submits for a fresh UID credit the delta exactly once (concurrency safety)
- Multiple UIDs accumulate independently; all-time leaderboard ranks by wins correctly

**Required env vars:**
- `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` (or `KV_REST_API_URL` / `KV_REST_API_TOKEN`)
- Skips cleanly if absent: `skipped: UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN (or KV equivalents) not set`

**How to run:**
```
UPSTASH_REDIS_REST_URL=https://… UPSTASH_REDIS_REST_TOKEN=… npx tsx scripts/lua_e2e.ts
```

**Expected output:**
```
ok: first submit: changed, delta=70, weekly=70, alltime=70
ok: improve 70->75: delta=5, totals=75
ok: worse score: no-op
ok: re-submit equal: no-op
ok: alltime still 75 after no-ops (idempotent)
ok: net-only improve: changed, delta=0, alltime unchanged
ok: concurrent identical submits credit once (alltime u2 = 60, want 60)
ok: all-time ranks by wins (u3=82 first)

ALL LUA E2E CHECKS PASSED
cleaned up throwaway keys test:<random>
```

**Throwaway keys / cleanup:** All writes go to keys `lb:test:<random>:daily`, `lb:test:<random>:week`, and `lb:test:<random>:alltime`. The harness deletes them in a `finally` block regardless of pass/fail outcome.

---

## notif_e2e.ts

**What it verifies:**
- Notifications endpoint is live (`GET /api/notifications?uid=…` returns 200)
- Fresh UID starts with an empty inbox
- Creator submitting a challenge produces the correct role
- Responder submitting triggers a `challenge_response` notification in the creator's inbox with correct `type`, `challengeId`, `opponent`, `outcome`, `oppWins`, `yourWins`, and no leaked `uid` or `lineup` fields
- `unread` count is at least 1 before mark-read
- Non-improving resubmit from the friend does NOT fire a new notification (no double-fire)
- `POST /api/notifications/read` sets unread to 0 while retaining items
- A different UID sees an empty inbox (no cross-uid data leak)
- Input validation: bad UID returns 400
- Push subscribe endpoint returns 503 (VAPID unconfigured) or 200 (VAPID configured)

**Required env vars:**
- `PROD_URL` — base URL of the deployment to test (e.g. `https://your-app.vercel.app`)
- The deployment must have Upstash/Redis configured (notifications feature requires it)
- Skips cleanly if absent: `skipped: PROD_URL is not set`

**How to run:**
```
PROD_URL=https://your-deployment.vercel.app npx tsx scripts/notif_e2e.ts
```

**Expected output:**
```
base: https://your-deployment.vercel.app
ok: built two distinct valid traces from /api/spin
challenge id: <8-char id> | creator uid notiftestcreator… | friend uid notiftestfriend…
ok: notifications endpoint live ...
ok: fresh creator uid starts with an empty inbox
ok: creator submit ...
ok: responder submit ...
verdict (responder vs creator): win
ok: creator inbox has >=1 notification ...
ok: notification type challenge_response ...
...
notification: "Sam E2E beaten 0-1" (they went 3-0, tookLead=true)
ok: non-improving resubmit adds NO new notification ...
ok: mark-read 200 ...
ok: unread is 0 after mark-read ...
ok: items are retained after mark-read
ok: a different uid sees an empty inbox (no cross-leak)
ok: bad uid -> 400 ...
ok: push subscribe is 503 (VAPID unset) or 200 (VAPID set) ...
push subscribe -> 503 (self-disabled; set VAPID env to enable)

ALL NOTIFICATION PROD E2E CHECKS PASSED
(test rows live under chal:<id> + notif:<uid> on prod Upstash; 31-day TTL, unguessable ids)
```

**Cleanup:** Test rows are written under `chal:<id>` and `notif:<uid>` using random unguessable IDs with a 31-day TTL. No manual cleanup needed.

---

## General notes

- All four harnesses exit 0 on success or clean skip, and exit 1 on assertion failures.
- They are **not** wired into `npm test` and will not run in CI automatically.
- Each harness prints `ok:` for passing assertions and `FAIL:` for failures, then a summary line.
- Run with `npx tsx` (no compile step needed).

---

## Ops / recovery tools (env-gated, parameterized — never hardcode UIDs or secrets here)

### backfill.ts
Backfills a pre-feature daily-best into the weekly + all-time boards, matching `submitScoreAuthed`'s
writes. Idempotent (skips if an entry exists). Skips cleanly unless all vars are set:
```
UPSTASH_REDIS_REST_URL=… UPSTASH_REDIS_REST_TOKEN=… \
BF_UID=<uid> BF_NAME=<display name> BF_WINS=<int> BF_WEEK=2026-W24 npx tsx scripts/backfill.ts
```

### prod_check.ts
Read-only standing check: a user's daily/weekly/all-time scores + board cardinalities against
whatever DB the env creds point at. Skips cleanly unless all vars are set:
```
UPSTASH_REDIS_REST_URL=… UPSTASH_REDIS_REST_TOKEN=… \
PC_DAY=lb:2026-6-8 PC_WEEK=2026-W24 PC_UID=<uid> npx tsx scripts/prod_check.ts
```

### export-logo.mjs
Regenerates the brand PNG exports into `<repo>/logo/` (gitignored). `sharp` is not a project dep:
```
npm i --no-save sharp && node scripts/export-logo.mjs
```
