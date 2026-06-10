import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { authedUid, signSession, verifySession, signNonce, verifyNonce, isAuthEnabled } from "./auth";

beforeAll(() => {
  process.env.AUTH_SECRET = "test_secret_0123456789abcdef0123456789abcdef";
});

describe("auth", () => {
  describe("authedUid", () => {
    // authedUid: deterministic, per-sub, regex-compatible, g + 31 hex
    it("authedUid deterministic for same sub", () => {
      const u1 = authedUid("1087"), u2 = authedUid("1087");
      expect(u1 === u2).toBe(true);
    });

    it("authedUid differs per sub", () => {
      const u1 = authedUid("1087"), u3 = authedUid("9999");
      expect(u1 !== u3).toBe(true);
    });

    it("authedUid matches the submit-route uid regex", () => {
      const u1 = authedUid("1087");
      expect(/^[a-z0-9-]{8,64}$/i.test(u1)).toBe(true);
    });

    it("authedUid is g + 31 hex", () => {
      const u1 = authedUid("1087");
      expect(u1.length === 32 && u1.startsWith("g") && /^g[a-f0-9]{31}$/.test(u1)).toBe(true);
    });
  });

  describe("session", () => {
    // session round-trips (incl. the anon binding) and rejects tampering
    it("session round-trips", async () => {
      const u1 = authedUid("1087");
      const tok = await signSession({ uid: u1, name: "Charlie", picture: "https://x/y.png", anon: "anon-abcd1234" });
      const s = await verifySession(tok);
      expect(!!s && s.uid === u1 && s.name === "Charlie" && s.picture === "https://x/y.png").toBe(true);
    });

    it("session carries the anon binding", async () => {
      const u1 = authedUid("1087");
      const tok = await signSession({ uid: u1, name: "Charlie", picture: "https://x/y.png", anon: "anon-abcd1234" });
      const s = await verifySession(tok);
      expect(s?.anon === "anon-abcd1234").toBe(true);
    });

    it("tampered session rejected", async () => {
      const u1 = authedUid("1087");
      const tok = await signSession({ uid: u1, name: "Charlie", picture: "https://x/y.png", anon: "anon-abcd1234" });
      expect((await verifySession(tok.slice(0, -2) + "xy")) === null).toBe(true);
    });

    it("garbage session rejected", async () => {
      expect((await verifySession("not.a.jwt")) === null).toBe(true);
    });
  });

  describe("nonce", () => {
    // nonce round-trips
    it("nonce round-trips", async () => {
      const nt = await signNonce("abc-123");
      expect((await verifyNonce(nt)) === "abc-123").toBe(true);
    });

    it("bad nonce rejected", async () => {
      expect((await verifyNonce("bad")) === null).toBe(true);
    });
  });

  describe("isAuthEnabled", () => {
    // isAuthEnabled truth table (requires both vars AND a >=32-char secret)
    const longSecret = "x".repeat(32);

    afterEach(() => {
      // restore defaults after each isAuthEnabled test
      process.env.AUTH_SECRET = "test_secret_0123456789abcdef0123456789abcdef";
      delete process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    });

    it("isAuthEnabled true when both env set + secret long enough", () => {
      process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = "client-id";
      process.env.AUTH_SECRET = longSecret;
      expect(isAuthEnabled() === true).toBe(true);
    });

    it("isAuthEnabled false when secret too short", () => {
      process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = "client-id";
      process.env.AUTH_SECRET = "short";
      expect(isAuthEnabled() === false).toBe(true);
    });

    it("isAuthEnabled false without client id", () => {
      process.env.AUTH_SECRET = longSecret;
      delete process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
      expect(isAuthEnabled() === false).toBe(true);
    });

    it("isAuthEnabled false without secret", () => {
      process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID = "client-id";
      delete process.env.AUTH_SECRET;
      expect(isAuthEnabled() === false).toBe(true);
    });
  });
});
