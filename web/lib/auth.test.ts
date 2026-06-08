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

  // session round-trips (incl. the anon binding) and rejects tampering
  const tok = await signSession({ uid: u1, name: "Charlie", picture: "https://x/y.png", anon: "anon-abcd1234" });
  const s = await verifySession(tok);
  assert(!!s && s.uid === u1 && s.name === "Charlie" && s.picture === "https://x/y.png", "session round-trips");
  assert(s?.anon === "anon-abcd1234", "session carries the anon binding");
  assert((await verifySession(tok.slice(0, -2) + "xy")) === null, "tampered session rejected");
  assert((await verifySession("not.a.jwt")) === null, "garbage session rejected");

  // nonce round-trips
  const nt = await signNonce("abc-123");
  assert((await verifyNonce(nt)) === "abc-123", "nonce round-trips");
  assert((await verifyNonce("bad")) === null, "bad nonce rejected");

  // isAuthEnabled truth table (requires both vars AND a >=32-char secret)
  const longSecret = "x".repeat(32);
  process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = "client-id"; process.env.AUTH_SECRET = longSecret;
  assert(isAuthEnabled() === true, "isAuthEnabled true when both env set + secret long enough");
  process.env.AUTH_SECRET = "short";
  assert(isAuthEnabled() === false, "isAuthEnabled false when secret too short");
  process.env.AUTH_SECRET = longSecret; delete process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
  assert(isAuthEnabled() === false, "isAuthEnabled false without client id");
  process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = "client-id"; delete process.env.AUTH_SECRET;
  assert(isAuthEnabled() === false, "isAuthEnabled false without secret");

  console.log(fail ? `\n${fail} ASSERTION(S) FAILED` : "\nALL AUTH CHECKS PASSED");
  process.exit(fail ? 1 : 0);
})();
