import { describe, it, expect } from "vitest";
import { refCodeFor, REF_RE } from "@/lib/referralCode";

// The referral code is an opaque PUBLIC proxy for a user — derived from the uid but never the uid
// itself (DESIGN.md §12 forbids shipping the anon bearer-token uid in URLs/logs). Deterministic so
// minting is idempotent; the reverse map (code → uid) is what gets stored server-side.
describe("refCodeFor", () => {
  it("produces a REF_RE-shaped opaque code", () => {
    const c = refCodeFor("some-anon-uuid-1234");
    expect(REF_RE.test(c)).toBe(true);
    expect(c).toMatch(/^r[0-9a-f]{11}$/);
  });

  it("is deterministic for the same uid (idempotent mint)", () => {
    expect(refCodeFor("abc")).toBe(refCodeFor("abc"));
  });

  it("differs for different uids", () => {
    expect(refCodeFor("abc")).not.toBe(refCodeFor("abd"));
  });

  it("never embeds or equals the uid (the bearer token must not leak)", () => {
    const uid = "49bdd51b-8e26-4380-892d-26a6ab0503b0";
    const code = refCodeFor(uid);
    expect(code).not.toBe(uid);
    expect(code.includes(uid)).toBe(false);
  });
});
