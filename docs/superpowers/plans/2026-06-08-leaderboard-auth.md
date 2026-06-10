> **HISTORICAL (frozen 2026-06):** decision-record only — conventions here may be superseded. Current: tests are Vitest via `npm test`; see `web/AGENTS.md`.

# Leaderboard Auth (PR #9) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add optional Google sign-in (One Tap) so a leaderboard rank can belong to a real person, with anonymous play fully preserved and the feature self-disabling until credentials exist.

**Architecture:** Browser gets a Google ID token via GIS One Tap (public client_id only, plus a server-issued nonce). A Node route handler verifies it with `jose` against Google's JWKS and issues our own HS256 session cookie. The Daily submit route becomes session-aware: signed-in users post under an un-fakeable identity (`g<sha256(google:sub)[:31]>`) and their prior anonymous row for the day is cleaned up; anonymous users are unchanged. Weekly/all-time boards come in PR #10.

**Tech Stack:** Next.js 16.2.7 (App Router, async `cookies()`, Node runtime), `jose` 6.x, Upstash Redis (existing), React 19.

---

## Pre-flight facts (verified, do not re-derive)

- `cookies()` from `next/headers` is **async**: `const c = await cookies()`. Set cookies only in route handlers / server actions.
- Route handlers default to Edge? No — set `export const runtime = "nodejs"` on every auth route (we use `node:crypto` + jose JWKS fetch).
- `jose`: `SignJWT`/`jwtVerify` (HS256, key = `new TextEncoder().encode(secret)`), `createRemoteJWKSet` + `jwtVerify` (Google, options `audience` + `issuer` as an **array**).
- Existing test harness: plain `npx tsx <file>.test.ts`, manual `assert` + `process.exit(fail?1:0)`. No test runner. Match `web/lib/dailyVerify.test.ts`.
- Existing uid regex (submit route): `/^[a-z0-9-]{8,64}$/i`. Our authed uid must satisfy it.
- Env: `NEXT_PUBLIC_GOOGLE_CLIENT_ID` (public), `AUTH_SECRET` (private). Both already provisioned by Charlie (Vercel + local `.env.local`).

## File structure

| File | Responsibility |
|---|---|
| `web/lib/auth.ts` (new) | Pure crypto + `isAuthEnabled`: uid derivation, session + nonce sign/verify, cookie-name constants. No `next/headers`, no `server-only` → unit-testable. |
| `web/lib/auth.test.ts` (new) | tsx unit tests for `auth.ts`. |
| `web/lib/authServer.ts` (new) | `server-only`. `getSession`/`setSessionCookie`/`clearSessionCookie` (uses `next/headers` + `auth.ts`). |
| `web/app/api/auth/nonce/route.ts` (new) | Issue a signed 5-min nonce cookie + return the nonce. |
| `web/app/api/auth/google/route.ts` (new) | Verify Google ID token (jose JWKS), check nonce, issue session cookie. CSRF-hardened. |
| `web/app/api/auth/me/route.ts` (new) | Return the current session user or null. |
| `web/app/api/auth/signout/route.ts` (new) | Clear the session cookie. |
| `web/lib/useSession.ts` (new) | `"use client"` hook: `{ user, loading, refresh, signOut }`. |
| `web/components/GoogleOneTap.tsx` (new) | `"use client"`. Loads GIS, inits with nonce, One Tap + button, POSTs credential. |
| `web/lib/leaderboard.ts` (modify) | Add `removeEntry(date, uid)` for anon-row claim cleanup. |
| `web/app/api/daily/submit/route.ts` (modify) | Session-aware identity + anon-row cleanup. |
| `web/components/Leaderboard.tsx` (modify) | Use session identity; show "claim your rank" One Tap; auto-claim on sign-in. |
| `web/package.json` (modify) | Add `jose`. |

---

### Task 1: Add the `jose` dependency

**Files:**
- Modify: `web/package.json`

- [ ] **Step 1: Install jose**

Run (from `web/`): `npm install jose`
Expected: `jose` appears under `dependencies` in `web/package.json`; `package-lock.json` updated; no peer-dep errors.

- [ ] **Step 2: Verify the install resolves**

Run (from `web/`): `node -e "import('jose').then(j=>console.log('jose ok', typeof j.SignJWT, typeof j.createRemoteJWKSet))"`
Expected: `jose ok function function`

- [ ] **Step 3: Commit**

```bash
git add web/package.json web/package-lock.json
git commit -m "build(auth): add jose for Google token verify + session cookies"
```

---

### Task 2: `auth.ts` core + unit tests (TDD)

**Files:**
- Create: `web/lib/auth.ts`
- Test: `web/lib/auth.test.ts`

- [ ] **Step 1: Write the failing test**

Create `web/lib/auth.test.ts`:

```ts
process.env.AUTH_SECRET = "test_secret_0123456789abcdef0123456789abcdef";
import { authedUid, signSession, verifySession, signNonce, verifyNonce, isAuthEnabled } from "./auth";

let fail = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("FAIL:", m); fail++; } else console.log("ok:", m); };

(async () => {
  // authedUid: deterministic, per-sub, regex-compatible, g + 31 hex
  const u1 = authedUid("1087"), u2 = authedUid("1087"), u3 = authedUid("9999");
  assert(u1 === u2, "authedUid deterministic for same sub");
  assert(u1 !== u3, "authedUid differs per sub");
  assert(/^[a-z0-9-]{8,64}$/i.test(u1), "authedUid matches the submit-route uid regex");
  assert(u1.length === 32 && u1.startsWith("g") && /^g[a-f0-9]{31}$/.test(u1), "authedUid is g + 31 hex");

  // session round-trips and rejects tampering
  const tok = await signSession({ uid: u1, name: "Charlie", picture: "https://x/y.png" });
  const s = await verifySession(tok);
  assert(!!s && s.uid === u1 && s.name === "Charlie" && s.picture === "https://x/y.png", "session round-trips");
  assert((await verifySession(tok.slice(0, -2) + "xy")) === null, "tampered session rejected");
  assert((await verifySession("not.a.jwt")) === null, "garbage session rejected");

  // nonce round-trips
  const nt = await signNonce("abc-123");
  assert((await verifyNonce(nt)) === "abc-123", "nonce round-trips");
  assert((await verifyNonce("bad")) === null, "bad nonce rejected");

  // isAuthEnabled truth table
  process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = "x"; process.env.AUTH_SECRET = "y";
  assert(isAuthEnabled() === true, "isAuthEnabled true when both env set");
  delete process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  assert(isAuthEnabled() === false, "isAuthEnabled false without client id");
  process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = "x"; delete process.env.AUTH_SECRET;
  assert(isAuthEnabled() === false, "isAuthEnabled false without secret");

  console.log(fail ? `\n${fail} ASSERTION(S) FAILED` : "\nALL AUTH CHECKS PASSED");
  process.exit(fail ? 1 : 0);
})();
```

- [ ] **Step 2: Run test to verify it fails**

Run (from `web/`): `npx tsx lib/auth.test.ts`
Expected: FAIL — cannot find module `./auth`.

- [ ] **Step 3: Write `web/lib/auth.ts`**

```ts
import { createHash } from "crypto";
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "82-0_sess";
export const NONCE_COOKIE = "82-0_nonce";
export const SESSION_TTL = 60 * 60 * 24 * 30; // 30 days, seconds
export const NONCE_TTL = 60 * 5;              // 5 minutes, seconds

export interface SessionUser { uid: string; name: string; picture?: string }

// Both env vars must be present for auth to operate (mirrors isRedisEnabled()).
export function isAuthEnabled(): boolean {
  return !!(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID && process.env.AUTH_SECRET);
}

// Read the key lazily so tests can set AUTH_SECRET before first use.
const key = () => new TextEncoder().encode(process.env.AUTH_SECRET ?? "");

// Stable, opaque, provider-namespaced. 32 chars of [a-z0-9] -> satisfies /^[a-z0-9-]{8,64}$/i.
export function authedUid(sub: string): string {
  return "g" + createHash("sha256").update("google:" + sub).digest("hex").slice(0, 31);
}

export async function signSession(user: SessionUser): Promise<string> {
  return new SignJWT({ name: user.name, picture: user.picture })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.uid)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL}s`)
    .sign(key());
}

export async function verifySession(token: string): Promise<SessionUser | null> {
  try {
    const { payload } = await jwtVerify(token, key());
    if (typeof payload.sub !== "string") return null;
    return {
      uid: payload.sub,
      name: typeof payload.name === "string" ? payload.name : "",
      picture: typeof payload.picture === "string" ? payload.picture : undefined,
    };
  } catch { return null; }
}

export async function signNonce(nonce: string): Promise<string> {
  return new SignJWT({ n: nonce })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${NONCE_TTL}s`)
    .sign(key());
}

export async function verifyNonce(token: string): Promise<string | null> {
  try { const { payload } = await jwtVerify(token, key()); return typeof payload.n === "string" ? payload.n : null; }
  catch { return null; }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run (from `web/`): `npx tsx lib/auth.test.ts`
Expected: `ALL AUTH CHECKS PASSED`, exit 0.

- [ ] **Step 5: Commit**

```bash
git add web/lib/auth.ts web/lib/auth.test.ts
git commit -m "feat(auth): identity, session + nonce crypto (jose HS256) with tests"
```

---

### Task 3: `authServer.ts` (session cookie I/O)

**Files:**
- Create: `web/lib/authServer.ts`

- [ ] **Step 1: Write `web/lib/authServer.ts`**

```ts
import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE, SESSION_TTL, verifySession, type SessionUser } from "./auth";

const secure = process.env.NODE_ENV === "production"; // env-gated so the cookie is sent on http://localhost

export async function getSession(): Promise<SessionUser | null> {
  const c = await cookies();
  const tok = c.get(SESSION_COOKIE)?.value;
  return tok ? verifySession(tok) : null;
}

export async function setSessionCookie(token: string): Promise<void> {
  const c = await cookies();
  c.set(SESSION_COOKIE, token, { httpOnly: true, secure, sameSite: "lax", path: "/", maxAge: SESSION_TTL });
}

export async function clearSessionCookie(): Promise<void> {
  const c = await cookies();
  c.delete(SESSION_COOKIE);
}
```

- [ ] **Step 2: Type-check compiles (verified later in Task 8 build).** No standalone test (uses request-scoped `next/headers`); exercised by the route tasks + the build.

- [ ] **Step 3: Commit**

```bash
git add web/lib/authServer.ts
git commit -m "feat(auth): server session cookie helpers (getSession/set/clear)"
```

---

### Task 4: Auth routes (nonce, google, me, signout)

**Files:**
- Create: `web/app/api/auth/nonce/route.ts`
- Create: `web/app/api/auth/google/route.ts`
- Create: `web/app/api/auth/me/route.ts`
- Create: `web/app/api/auth/signout/route.ts`

- [ ] **Step 1: `web/app/api/auth/nonce/route.ts`**

```ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "crypto";
import { isAuthEnabled, signNonce, NONCE_COOKIE, NONCE_TTL } from "@/lib/auth";

export const runtime = "nodejs";

export async function GET() {
  if (!isAuthEnabled()) return NextResponse.json({ error: "auth not configured" }, { status: 503 });
  const nonce = randomUUID();
  const c = await cookies();
  c.set(NONCE_COOKIE, await signNonce(nonce), {
    httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: NONCE_TTL,
  });
  return NextResponse.json({ nonce });
}
```

- [ ] **Step 2: `web/app/api/auth/google/route.ts`**

```ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { isAuthEnabled, authedUid, signSession, verifyNonce, NONCE_COOKIE } from "@/lib/auth";
import { setSessionCookie } from "@/lib/authServer";

export const runtime = "nodejs";

// Module-level singleton so warm invocations reuse the JWKS cache.
const JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

export async function POST(req: Request) {
  if (!isAuthEnabled()) return NextResponse.json({ error: "auth not configured" }, { status: 503 });

  // CSRF: a cross-site form POST can't set these. Reject anything that isn't our JSON fetch.
  if ((req.headers.get("content-type") ?? "").split(";")[0].trim() !== "application/json")
    return NextResponse.json({ error: "bad content-type" }, { status: 415 });
  if (req.headers.get("x-requested-with") !== "fetch")
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { credential } = (await req.json().catch(() => ({}))) ?? {};
  if (typeof credential !== "string") return NextResponse.json({ error: "missing credential" }, { status: 400 });

  const c = await cookies();
  const nonceTok = c.get(NONCE_COOKIE)?.value;
  const expectedNonce = nonceTok ? await verifyNonce(nonceTok) : null;
  if (!expectedNonce) return NextResponse.json({ error: "missing nonce" }, { status: 400 });

  let payload;
  try {
    ({ payload } = await jwtVerify(credential, JWKS, {
      audience: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
      issuer: ["accounts.google.com", "https://accounts.google.com"], // Google issues either form
    }));
  } catch {
    return NextResponse.json({ error: "invalid token" }, { status: 401 });
  }

  if (payload.nonce !== expectedNonce) return NextResponse.json({ error: "nonce mismatch" }, { status: 401 });
  if (typeof payload.sub !== "string") return NextResponse.json({ error: "no subject" }, { status: 401 });

  const user = {
    uid: authedUid(payload.sub),
    name: typeof payload.name === "string" ? payload.name.slice(0, 24) : "Player",
    picture: typeof payload.picture === "string" ? payload.picture : undefined,
  };
  await setSessionCookie(await signSession(user));
  c.delete(NONCE_COOKIE);
  return NextResponse.json({ user });
}
```

- [ ] **Step 3: `web/app/api/auth/me/route.ts`**

```ts
import { NextResponse } from "next/server";
import { getSession } from "@/lib/authServer";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ user: await getSession() });
}
```

- [ ] **Step 4: `web/app/api/auth/signout/route.ts`**

```ts
import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/authServer";

export const runtime = "nodejs";

export async function POST() {
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 5: Smoke-test the 503 self-disable path (no envs)**

Run (from `web/`, envs intentionally unset):
`AUTH_SECRET= NEXT_PUBLIC_GOOGLE_CLIENT_ID= npx next build` is overkill here — instead defer to Task 8. For now just confirm files compile by running `npx tsc --noEmit` (from `web/`).
Expected: no TypeScript errors for the new route files.

- [ ] **Step 6: Commit**

```bash
git add web/app/api/auth
git commit -m "feat(auth): nonce/google/me/signout routes (jose verify, CSRF-hardened, self-disabling)"
```

---

### Task 5: Client session hook + One Tap component

**Files:**
- Create: `web/lib/useSession.ts`
- Create: `web/components/GoogleOneTap.tsx`

- [ ] **Step 1: `web/lib/useSession.ts`**

```ts
"use client";
import { useCallback, useEffect, useState } from "react";

export interface SessionUser { uid: string; name: string; picture?: string }

export function useSession() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try { const r = await fetch("/api/auth/me"); const j = await r.json(); setUser(j?.user ?? null); }
    catch { setUser(null); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const signOut = useCallback(async () => {
    try { await fetch("/api/auth/signout", { method: "POST" }); } catch { /* ignore */ }
    setUser(null);
  }, []);

  return { user, loading, refresh, signOut };
}
```

- [ ] **Step 2: `web/components/GoogleOneTap.tsx`**

```tsx
"use client";
import { useCallback, useEffect, useRef } from "react";

const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

declare global {
  // GIS global; typed loosely on purpose (no official types installed).
  interface Window { google?: { accounts: { id: {
    initialize: (cfg: Record<string, unknown>) => void;
    prompt: () => void;
    renderButton: (el: HTMLElement, opts: Record<string, unknown>) => void;
  } } } }
}

let gisPromise: Promise<void> | null = null;
function loadGis(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.google?.accounts?.id) return Promise.resolve();
  if (gisPromise) return gisPromise;
  gisPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true; s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error("gis load failed"));
    document.head.appendChild(s);
  });
  return gisPromise;
}

export default function GoogleOneTap({ onSignIn }: { onSignIn: () => void }) {
  const btnRef = useRef<HTMLDivElement>(null);
  const busyRef = useRef(false);

  const handleCredential = useCallback(async (resp: { credential?: string }) => {
    if (!resp?.credential || busyRef.current) return;
    busyRef.current = true;
    try {
      const r = await fetch("/api/auth/google", {
        method: "POST",
        headers: { "content-type": "application/json", "x-requested-with": "fetch" },
        body: JSON.stringify({ credential: resp.credential }),
      });
      if (r.ok) onSignIn();
    } catch { /* ignore */ }
    finally { busyRef.current = false; }
  }, [onSignIn]);

  useEffect(() => {
    if (!CLIENT_ID) return;
    let cancelled = false;
    (async () => {
      let nonce = "";
      try { const r = await fetch("/api/auth/nonce"); if (r.ok) nonce = (await r.json()).nonce; } catch { /* ignore */ }
      if (cancelled || !nonce) return;
      try { await loadGis(); } catch { return; }
      if (cancelled || !window.google) return;
      window.google.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: handleCredential,
        nonce,
        use_fedcm_for_prompt: true,
      });
      window.google.accounts.id.prompt(); // inline One Tap
      if (btnRef.current) {
        window.google.accounts.id.renderButton(btnRef.current, {
          theme: "filled_black", size: "large", text: "signin_with", shape: "pill",
        }); // fallback button (Safari / One Tap suppression)
      }
    })();
    return () => { cancelled = true; };
  }, [handleCredential]);

  if (!CLIENT_ID) return null;
  return <div ref={btnRef} className="flex justify-center" />;
}
```

- [ ] **Step 3: Type-check**

Run (from `web/`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add web/lib/useSession.ts web/components/GoogleOneTap.tsx
git commit -m "feat(auth): client useSession hook + Google One Tap component"
```

---

### Task 6: Session-aware Daily submit + anon-row cleanup

**Files:**
- Modify: `web/lib/leaderboard.ts` (add `removeEntry`)
- Modify: `web/app/api/daily/submit/route.ts`

- [ ] **Step 1: Add `removeEntry` to `web/lib/leaderboard.ts`**

Append after `submitScore` (keeps key helpers in scope):

```ts
// Claim cleanup: drop a uid's row entirely (used when a signed-in user had posted anonymously today).
export async function removeEntry(date: string, uid: string): Promise<void> {
  if (!redis) return;
  await redis.zrem(keyZ(date), uid);
  await redis.hdel(keyH(date), uid);
}
```

- [ ] **Step 2: Rewrite `web/app/api/daily/submit/route.ts`**

```ts
import { NextResponse } from "next/server";
import { spinPool, getPlayersByIds, getCoefficients } from "@/lib/data";
import { evaluateLineup } from "@/lib/engine";
import { verifyDaily, type VerifyDeps } from "@/lib/dailyVerify";
import { isLeaderboardEnabled, submitScore, removeEntry } from "@/lib/leaderboard";
import { getSession } from "@/lib/authServer";

const todayUTC = () => { const d = new Date(); return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`; };
const UID_RE = /^[a-z0-9-]{8,64}$/i;
const cleanName = (s: unknown) => (typeof s === "string" ? s.trim().slice(0, 24) : "");

const deps: VerifyDeps = {
  spinPool,
  getPlayer: (id) => getPlayersByIds([id])[0],
  evaluate: (players) => evaluateLineup(players, getCoefficients()),
};

export async function POST(req: Request) {
  if (!isLeaderboardEnabled()) return NextResponse.json({ error: "leaderboard not configured" }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) ?? {};
  const { date, trace } = body;
  if (date !== todayUTC()) return NextResponse.json({ error: "stale date" }, { status: 400 });

  // Identity: a valid session is authoritative (un-fakeable); otherwise fall back to the anon uid.
  const session = await getSession();
  let uid: string, name: string;
  if (session) {
    uid = session.uid;
    name = cleanName(body.name) || session.name || "Player";
  } else {
    if (typeof body.uid !== "string" || !UID_RE.test(body.uid)) return NextResponse.json({ error: "bad uid" }, { status: 400 });
    uid = body.uid;
    name = cleanName(body.name) || "Anonymous";
  }

  const v = verifyDaily(date, trace, deps);
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const row = { uid, name, wins: v.result.wins, losses: v.result.losses, net: v.result.netRtg, lineup: v.lineup };
  const view = await submitScore(date, row, v.result);

  // Claim cleanup: signed-in user who posted anonymously earlier today -> remove the anon duplicate.
  // The anon uid is an unguessable client UUID, so passing it is proof of ownership of that row.
  if (session && typeof body.anonUid === "string" && UID_RE.test(body.anonUid) && body.anonUid !== uid) {
    await removeEntry(date, body.anonUid);
  }

  return NextResponse.json(view);
}
```

- [ ] **Step 3: Type-check**

Run (from `web/`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Re-run anti-cheat unit tests (unchanged behavior)**

Run (from `web/`): `npx tsx lib/dailyVerify.test.ts`
Expected: `ALL VERIFY CHECKS PASSED` (the verifier is untouched; this guards against accidental import breakage).

- [ ] **Step 5: Commit**

```bash
git add web/lib/leaderboard.ts web/app/api/daily/submit/route.ts
git commit -m "feat(auth): session-aware Daily submit + anon-row claim cleanup"
```

---

### Task 7: Claim-at-result in the Leaderboard component

**Files:**
- Modify: `web/components/Leaderboard.tsx`

Replace the whole file with this version (adds session identity, sign-in affordance, and auto-claim on sign-in; anon submit preserved):

- [ ] **Step 1: Write the new `web/components/Leaderboard.tsx`**

```tsx
"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { track } from "@vercel/analytics";
import type { DraftStep, LeaderboardView, LeaderboardRow } from "@/lib/types";
import { getUid, getName, setName as persistName, recordDailyDone, getStreak, msToNextUtcMidnight } from "@/lib/streak";
import { useSession } from "@/lib/useSession";
import GoogleOneTap from "@/components/GoogleOneTap";

const hhmmss = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
};

export default function Leaderboard({ date, trace }: { date: string; trace: DraftStep[] }) {
  const { user, refresh, signOut } = useSession();
  const [view, setView] = useState<LeaderboardView | null>(null);
  const [enabled, setEnabled] = useState(true);
  const [anonUid, setAnonUid] = useState("");
  const [name, setNameState] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [streak, setStreak] = useState(0);
  const [countdown, setCountdown] = useState(() => msToNextUtcMidnight());

  const effectiveUid = user?.uid ?? anonUid; // who "you" is on the board

  const loadBoard = useCallback(async (uid: string) => {
    try {
      const r = await fetch(`/api/daily/leaderboard?date=${encodeURIComponent(date)}&uid=${encodeURIComponent(uid)}`);
      if (r.status === 503) { setEnabled(false); return; }
      if (r.ok) { const v = await r.json(); setView(v); if (v?.you) setSubmitted(true); }
    } catch { /* offline — leave board hidden */ }
  }, [date]);

  useEffect(() => {
    const id = getUid();
    setAnonUid(id);
    setNameState(getName());
    recordDailyDone(date);
    setStreak(getStreak());
    loadBoard(user?.uid ?? id);
  }, [date, user?.uid, loadBoard]);

  useEffect(() => {
    const t = setInterval(() => setCountdown(msToNextUtcMidnight()), 1000);
    return () => clearInterval(t);
  }, []);

  const submit = useCallback(async () => {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/daily/submit", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ date, uid: anonUid, anonUid, name: name.trim(), trace }),
      });
      if (r.status === 503) { setEnabled(false); return; }
      const v = await r.json();
      if (!r.ok) { setErr(v?.error ?? "submit failed"); return; }
      if (name.trim()) persistName(name.trim());
      setView(v); setSubmitted(true);
      track("daily_submit", { rank: v?.you?.rank ?? 0, authed: !!user });
    } catch { setErr("network error"); } finally { setBusy(false); }
  }, [date, anonUid, name, trace, user]);

  // On sign-in: adopt the Google name (if the user hasn't typed one), refresh session, then auto-claim.
  const onSignIn = useCallback(async () => {
    await refresh();
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/daily/submit", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ date, anonUid, name: name.trim(), trace }),
      });
      const v = await r.json();
      if (r.ok) { setView(v); setSubmitted(true); track("daily_claim", { rank: v?.you?.rank ?? 0 }); }
    } catch { /* ignore */ } finally { setBusy(false); }
  }, [refresh, date, anonUid, name, trace]);

  return (
    <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-bold text-zinc-200">📅 Daily leaderboard</div>
        <div className="flex items-center gap-3 text-xs text-zinc-500">
          {streak > 0 && <span className="rounded bg-orange-500/15 px-2 py-0.5 font-semibold text-orange-300">🔥 {streak}-day streak</span>}
          <span>next in <span className="tabular-nums text-zinc-400">{hhmmss(countdown)}</span></span>
        </div>
      </div>

      {enabled ? (
        <>
          {!submitted && (
            <div className="mt-3 flex gap-2">
              <input value={name} onChange={(e) => setNameState(e.target.value)} maxLength={24} placeholder={user ? user.name : "Your name"}
                className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm outline-none focus:border-orange-500" />
              <button onClick={submit} disabled={busy}
                className="shrink-0 rounded-lg bg-orange-500 px-4 py-2 text-sm font-bold text-black hover:bg-orange-400 disabled:opacity-60">
                {busy ? "…" : "🏆 Submit"}
              </button>
            </div>
          )}

          {/* Identity row: claim prompt (anon) or signed-in badge */}
          {process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID && (
            user ? (
              <div className="mt-2 flex items-center justify-between text-xs text-zinc-500">
                <span>Signed in{user.name ? ` as ${user.name}` : ""} · ranks are yours to keep</span>
                <button onClick={signOut} className="text-zinc-400 underline hover:text-zinc-200">Sign out</button>
              </div>
            ) : (
              <div className="mt-3 rounded-xl border border-zinc-800 bg-zinc-950/50 p-3">
                <div className="mb-2 text-xs text-zinc-400">Sign in to claim your rank — and join the weekly & all-time boards.</div>
                <GoogleOneTap onSignIn={onSignIn} />
              </div>
            )
          )}

          {err && <div className="mt-2 text-xs text-red-400">{err}</div>}
          {view && <Board view={view} uid={effectiveUid} />}
        </>
      ) : (
        <div className="mt-2 text-xs text-zinc-600">Leaderboard opens soon — keep your streak going.</div>
      )}
    </div>
  );
}

function Board({ view, uid }: { view: LeaderboardView; uid: string }) {
  const rows = view.top;
  const youOutside = view.you && !rows.some((r) => r.uid === uid);
  if (!rows.length) return <div className="mt-3 text-xs text-zinc-500">Be the first to post a score today.</div>;
  return (
    <div className="mt-3">
      <div className="mb-1 flex items-center justify-between text-[11px] font-bold uppercase tracking-wide text-zinc-500">
        <span>Today&apos;s top {Math.min(rows.length, 100)}</span><span>{view.total} played</span>
      </div>
      <div className="max-h-72 space-y-1 overflow-y-auto">
        {rows.map((r) => <Row key={r.uid} r={r} me={r.uid === uid} />)}
        {youOutside && view.you && <Row r={view.you} me />}
      </div>
    </div>
  );
}

function Row({ r, me }: { r: LeaderboardRow; me?: boolean }) {
  return (
    <Link href={`/r/${r.lineup}`}
      className={`flex items-center gap-3 rounded-lg px-2.5 py-1.5 text-sm ${me ? "bg-orange-500/15 ring-1 ring-orange-500/40" : "bg-zinc-950/50 hover:bg-zinc-800/60"}`}>
      <span className="w-7 shrink-0 text-right text-xs font-bold tabular-nums text-zinc-500">{r.rank}</span>
      <span className="min-w-0 flex-1 truncate font-semibold text-zinc-200">{r.name}{me && <span className="ml-1 text-[10px] text-orange-300">you</span>}</span>
      <span className="shrink-0 tabular-nums font-bold text-zinc-100">{r.wins}-{r.losses}</span>
      <span className="w-12 shrink-0 text-right text-xs tabular-nums text-zinc-500">{r.net > 0 ? "+" : ""}{r.net.toFixed(1)}</span>
    </Link>
  );
}
```

- [ ] **Step 2: Type-check**

Run (from `web/`): `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add web/components/Leaderboard.tsx
git commit -m "feat(auth): claim-your-rank One Tap in the Daily leaderboard"
```

---

### Task 8: Full verification (build, lint, self-disable, dev-minted session E2E)

**Files:** none (verification only)

- [ ] **Step 1: Lint**

Run (from `web/`): `npm run lint`
Expected: no new errors. (Pre-existing warnings, if any, unchanged.)

- [ ] **Step 2: Type-check**

Run (from `web/`): `npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Production build**

Run (from `web/`): `npm run build`
Expected: build succeeds; the new `/api/auth/*` routes appear in the route list.

- [ ] **Step 4: Re-run all unit tests**

Run (from `web/`): `npx tsx lib/auth.test.ts && npx tsx lib/dailyVerify.test.ts && npx tsx lib/challenge.test.ts`
Expected: all three print their PASSED banner.

- [ ] **Step 5: Self-disable check (no envs)**

Temporarily run dev without auth envs and confirm graceful disable. From `web/`, in a shell with `NEXT_PUBLIC_GOOGLE_CLIENT_ID`/`AUTH_SECRET` unset:
`npm run dev`, then `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/auth/nonce` → expect `503`; the Daily board still loads and anon submit still works. Stop the server.

- [ ] **Step 6: Dev-minted-session E2E (no Google needed)**

With `.env.local` present (real `AUTH_SECRET`), write a throwaway dev script (do NOT commit — keep it untracked like `web/scripts/h2h_e2e.ts`) that:
1. imports `signSession` from `@/lib/auth`, mints a cookie for `{ uid: authedUid("devtest"), name: "DevTester" }`;
2. builds a valid daily trace by hitting the local `/api/spin` (mirror `web/scripts/h2h_e2e.ts`);
3. POSTs `/api/daily/submit` with the `82-0_sess` cookie set and an `anonUid`;
4. asserts the returned `view.you.uid === authedUid("devtest")` and the anon row is absent;
5. cleans up its test rows.
Run it against `npm run dev`. Expected: authed submit ranks under the Google-derived uid; anon dupe removed.

- [ ] **Step 7: Final commit (if Step 6 surfaced fixes)**

```bash
git add -A web/lib web/app web/components
git commit -m "test(auth): verify session-aware submit + self-disable"
```

(Never `git add` the untracked dev scripts — `web/scripts/*` stays out of the PR.)

---

## Self-review

- **Spec coverage:** auth dep (T1), identity+session+nonce (T2), session I/O (T3), routes incl. CSRF + issuer-array + 503 self-disable (T4), client One Tap + button fallback + nonce flow (T5), session-aware submit + anon cleanup/claim (T6, T7), env-gated `secure` (T3), build/lint/tests/dev-session E2E (T8). Weekly/all-time + share-rank are explicitly out of PR #9 (PRs #10/#11).
- **Placeholders:** none — every code step is complete and runnable.
- **Type consistency:** `SessionUser {uid,name,picture?}` consistent across `auth.ts`, `authServer.ts`, `useSession.ts`. Cookie names `82-0_sess`/`82-0_nonce` from `auth.ts` constants everywhere. `removeEntry(date,uid)` defined (T6) and called (T6). `authedUid` format asserted (T2) matches the submit-route `UID_RE` (T6). `onSignIn`/`handleCredential` signatures match between `GoogleOneTap` and `Leaderboard`.

## Manual prod verification (after merge, once Charlie's Vercel envs are live)

1. `82-0-pink.vercel.app` → play Daily → result shows "Sign in to claim your rank" + Google button.
2. Sign in with Google → One Tap/button → board row flips to your Google name; `/api/auth/me` returns the user.
3. Reload → still signed in (session cookie persists). Sign out works.
4. Anon path unaffected in a fresh incognito window (no Google envs needed to play + submit anonymously).
