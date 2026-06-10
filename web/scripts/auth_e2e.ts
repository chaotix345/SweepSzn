// Tracked env-gated harness. Verifies the auth route wiring end-to-end over HTTP.
// Usage: BASE=http://localhost:3000 AUTH_SECRET=<server's secret> npx tsx scripts/auth_e2e.ts
// Requires: BASE pointing at a running server (skips cleanly when absent) and AUTH_SECRET matching
// that server's secret (fails loudly when absent — minted cookies would just 401 otherwise).
import { signSession, authedUid, SESSION_COOKIE } from "../lib/auth";

const BASE: string = process.env.BASE ?? "";
if (!BASE) { console.log("skipped: BASE is not set"); process.exit(0); }
if (!process.env.AUTH_SECRET) { console.error("FAIL: AUTH_SECRET must be set to the target server's secret"); process.exit(1); }
let fail = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("FAIL:", m); fail++; } else console.log("ok:", m); };

(async () => {
  // 1. nonce (POST + CSRF headers — the route now rejects bare GET / cross-site requests)
  const n = await fetch(`${BASE}/api/auth/nonce`, { method: "POST", headers: { "content-type": "application/json", "x-requested-with": "fetch" }, body: "{}" });
  const nj = await n.json().catch(() => ({}));
  assert(n.status === 200 && typeof nj.nonce === "string", "POST /api/auth/nonce -> 200 + nonce");
  assert(/82-0_nonce=/.test(n.headers.get("set-cookie") || ""), "nonce route sets the nonce cookie");

  // 2. me without cookie
  const m0 = await fetch(`${BASE}/api/auth/me`);
  const m0j = await m0.json();
  assert(m0.status === 200 && m0j.user === null, "GET /api/auth/me (no cookie) -> user null");

  // 3. me with a minted session cookie (no Google needed — our own HS256)
  const uid = authedUid("devtest-" + Date.now());
  const sess = await signSession({ uid, name: "DevTester" });
  const m1 = await fetch(`${BASE}/api/auth/me`, { headers: { cookie: `${SESSION_COOKIE}=${sess}` } });
  const m1j = await m1.json();
  assert(m1.status === 200 && m1j.user?.uid === uid && m1j.user?.name === "DevTester", "GET /api/auth/me (minted cookie) -> the user");

  // 4. CSRF hardening on /api/auth/google
  const g415 = await fetch(`${BASE}/api/auth/google`, { method: "POST", body: "x" }); // text/plain
  assert(g415.status === 415, "POST /api/auth/google without JSON content-type -> 415");
  const g403 = await fetch(`${BASE}/api/auth/google`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  assert(g403.status === 403, "POST /api/auth/google without x-requested-with -> 403");
  const g400 = await fetch(`${BASE}/api/auth/google`, { method: "POST", headers: { "content-type": "application/json", "x-requested-with": "fetch" }, body: "{}" });
  assert(g400.status === 400, "POST /api/auth/google with no credential -> 400");

  // 5. signout
  const so = await fetch(`${BASE}/api/auth/signout`, { method: "POST" });
  assert(so.status === 200, "POST /api/auth/signout -> 200");

  console.log(fail ? `\n${fail} AUTH E2E ASSERTION(S) FAILED` : "\nALL AUTH E2E CHECKS PASSED");
  process.exit(fail ? 1 : 0);
})();
