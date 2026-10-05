import { describe, it, expect, vi, beforeEach } from "vitest";
import { enableRedisEnv, freshFake, ctx, authEnv, req, readJson, exhaustRateLimit } from "@/test/routeHarness";
import type { JWTVerifyGetKey } from "jose";

vi.mock("@upstash/redis", async () => (await import("@/test/routeHarness")).upstashRedisMockModule());
vi.mock("next/headers", async () => (await import("@/test/routeHarness")).nextHeadersMockModule());
vi.mock("next/server", async (orig) => (await import("@/test/routeHarness")).nextServerMockModule(await orig()));
// Google's remote JWKS is swapped for a local test key set (filled in below) so the happy path can
// run hermetically; every other jose export (session/nonce JWTs) stays real.
const google = vi.hoisted(() => ({ jwks: null as null | JWTVerifyGetKey }));
vi.mock("jose", async (orig) => ({
  ...(await orig<typeof import("jose")>()),
  createRemoteJWKSet: () => (...a: Parameters<JWTVerifyGetKey>) => google.jwks!(...a),
}));

// google/route.ts imports redis at module eval — enableRedisEnv() must run before dynamic import.
enableRedisEnv();
authEnv();

const { POST } = await import("@/app/api/auth/google/route");

import { NONCE_COOKIE, SESSION_COOKIE, signNonce, verifySession, authedUid } from "@/lib/auth";
import { generateKeyPair, exportJWK, createLocalJWKSet, SignJWT } from "jose";

const googleKey = await generateKeyPair("RS256");
google.jwks = createLocalJWKSet({ keys: [{ ...(await exportJWK(googleKey.publicKey)), kid: "test", alg: "RS256" }] });

// A full successful sign-in: fresh nonce cookie + a Google-signed id_token carrying it.
async function signInWith(claims: Record<string, unknown>, extra: Record<string, unknown> = {}) {
  authEnv();
  const nonce = `nonce-${Math.random().toString(36).slice(2)}`;
  ctx.cookies.set(NONCE_COOKIE, await signNonce(nonce));
  const credential = await new SignJWT({ nonce, ...claims })
    .setProtectedHeader({ alg: "RS256", kid: "test" })
    .setIssuer("https://accounts.google.com")
    .setAudience(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!)
    .setSubject("123")
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(googleKey.privateKey);
  const res = await readJson(await post({ credential, ...extra }));
  const tok = ctx.cookies.get(SESSION_COOKIE);
  return { ...res, session: tok ? await verifySession(tok) : null };
}

const goodHeaders = { "content-type": "application/json", "x-requested-with": "fetch" };

const post = (body: unknown, headers?: Record<string, string>) =>
  POST(req("/api/auth/google", { method: "POST", body, headers: { ...goodHeaders, ...headers } }));

beforeEach(() => { freshFake(); });

describe("POST /api/auth/google", () => {
  describe("auth-disabled branch", () => {
    it("503 when AUTH_SECRET is absent", async () => {
      delete process.env.AUTH_SECRET;
      delete process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
      const { status, body } = await readJson(await post({ credential: "tok" }));
      expect(status).toBe(503);
      expect(body).toMatchObject({ error: "auth not configured" });
      // restore for subsequent tests
      authEnv();
    });

    it("503 when AUTH_SECRET is too short", async () => {
      process.env.AUTH_SECRET = "tooshort";
      const { status, body } = await readJson(await post({ credential: "tok" }));
      expect(status).toBe(503);
      expect(body).toMatchObject({ error: "auth not configured" });
      authEnv();
    });
  });

  describe("CSRF / content-type guards", () => {
    it("415 when content-type is not application/json", async () => {
      authEnv();
      const { status, body } = await readJson(
        await POST(req("/api/auth/google", { method: "POST", rawBody: "", headers: { "content-type": "text/plain", "x-requested-with": "fetch" } })),
      );
      expect(status).toBe(415);
      expect(body).toMatchObject({ error: "bad content-type" });
    });

    it("403 when x-requested-with is missing", async () => {
      authEnv();
      const { status, body } = await readJson(
        await POST(req("/api/auth/google", { method: "POST", body: { credential: "tok" }, headers: { "content-type": "application/json" } })),
      );
      expect(status).toBe(403);
      expect(body).toMatchObject({ error: "forbidden" });
    });

    it("403 when x-requested-with is not 'fetch'", async () => {
      authEnv();
      const { status, body } = await readJson(
        await POST(req("/api/auth/google", { method: "POST", body: { credential: "tok" }, headers: { "content-type": "application/json", "x-requested-with": "xhr" } })),
      );
      expect(status).toBe(403);
      expect(body).toMatchObject({ error: "forbidden" });
    });
  });

  describe("credential validation (CSRF passes)", () => {
    it("400 when credential is missing from body", async () => {
      authEnv();
      const { status, body } = await readJson(await post({}));
      expect(status).toBe(400);
      expect(body).toMatchObject({ error: "missing credential" });
    });

    it("400 when credential is not a string (number)", async () => {
      authEnv();
      const { status, body } = await readJson(await post({ credential: 42 }));
      expect(status).toBe(400);
      expect(body).toMatchObject({ error: "missing credential" });
    });

    it("400 when body is not valid JSON", async () => {
      authEnv();
      const { status, body } = await readJson(
        await POST(req("/api/auth/google", { method: "POST", rawBody: "not json", headers: goodHeaders })),
      );
      // req.json().catch(() => ({})) means bad json gives {} -> credential missing
      expect(status).toBe(400);
      expect(body).toMatchObject({ error: "missing credential" });
    });
  });

  describe("nonce checks (credential is a string, CSRF passes)", () => {
    it("400 when no nonce cookie is set", async () => {
      authEnv();
      // No nonce cookie in jar
      const { status, body } = await readJson(await post({ credential: "sometoken" }));
      expect(status).toBe(400);
      expect(body).toMatchObject({ error: "missing nonce" });
    });

    it("400 when nonce cookie is an invalid/tampered JWT", async () => {
      authEnv();
      ctx.cookies.set(NONCE_COOKIE, "not.a.valid.jwt");
      const { status, body } = await readJson(await post({ credential: "sometoken" }));
      expect(status).toBe(400);
      expect(body).toMatchObject({ error: "missing nonce" });
    });

    it("400 when nonce cookie is a valid JWT but signed with wrong secret", async () => {
      // Sign with a different secret
      process.env.AUTH_SECRET = "other-secret-0123456789abcdef-0123456789abcdef";
      const wrongSecretToken = await signNonce("some-nonce-value");
      // Now restore the real secret the route will use
      authEnv();
      ctx.cookies.set(NONCE_COOKIE, wrongSecretToken);
      const { status, body } = await readJson(await post({ credential: "sometoken" }));
      expect(status).toBe(400);
      expect(body).toMatchObject({ error: "missing nonce" });
    });

    it("401 (invalid token from JWKS) when nonce cookie is valid but credential is a dummy string", async () => {
      // With a valid nonce cookie in jar, the route proceeds to jwtVerify against Google's JWKS.
      // A dummy credential string will fail JWKS verification → 401 "invalid token".
      // This test also validates the happy-path nonce check is wired correctly (doesn't 400 on nonce).
      authEnv();
      const nonceTok = await signNonce("test-nonce-value");
      ctx.cookies.set(NONCE_COOKIE, nonceTok);
      const { status, body } = await readJson(await post({ credential: "dummy.credential.value" }));
      // JWKS fetch will fail (or verification fails) → 401
      expect(status).toBe(401);
      expect(body).toMatchObject({ error: "invalid token" });
    });

    it("429 once the per-IP bucket is exhausted (bounds JWKS-verify work per IP)", async () => {
      authEnv();
      exhaustRateLimit("rl:google:9.9.9.9", 10);
      const { status, body } = await readJson(
        await POST(req("/api/auth/google", { method: "POST", body: { credential: "tok" }, headers: goodHeaders, ip: "9.9.9.9" })),
      );
      expect(status).toBe(429);
      expect(body).toMatchObject({ error: "too many requests" });
    });
  });
});

describe("POST /api/auth/google — happy path (local test JWKS)", () => {
  it("signs in and binds a genuine anonymous uid as the session's anon", async () => {
    const { status, session } = await signInWith({ name: "Charlie" }, { anonUid: "3b241101-e2bb-4255-8caf-4136c566a962" });
    expect(status).toBe(200);
    expect(session?.uid).toBe(authedUid("123"));
    expect(session?.anon).toBe("3b241101-e2bb-4255-8caf-4136c566a962");
  });

  // M1: the anon binding drives claim cleanup (removeEntry(date, session.anon)) and push migration —
  // a g-namespace uid must never be bound, or sign-in could delete/steal another account's rows.
  it("never binds a Google-namespace uid as the session's anon", async () => {
    const { status, session } = await signInWith({ name: "Charlie" }, { anonUid: authedUid("x") });
    expect(status).toBe(200);
    expect(session?.anon).toBeUndefined();
  });
});

// L11: the Google display name is user-controlled too — it must go through the same cleanName()
// trust boundary as every typed name (no bidi overrides / zero-width chars on boards or OG cards).
describe("POST /api/auth/google — display name sanitization", () => {
  it("strips bidi-override characters from the Google name", async () => {
    const { status, body, session } = await signInWith({ name: "a‮b" });
    expect(status).toBe(200);
    expect(session?.name).toBe("ab");
    expect((body.user as { name: string }).name).toBe("ab");
  });

  it("falls back to Player when the Google name is empty after cleaning", async () => {
    const { session } = await signInWith({ name: "​‮" });
    expect(session?.name).toBe("Player");
  });
});
