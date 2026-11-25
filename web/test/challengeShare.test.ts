import { describe, it, expect, vi } from "vitest";
import { canShareAsChallenge, createShareChallenge, type ChallengeDraft } from "@/lib/challengeShare";
import { isFitLockableSeed } from "@/lib/challenge";
import type { DraftStep } from "@/lib/types";

const TRACE: DraftStep[] = ["PG", "SG", "SF", "PF", "C"].map((slot, i) => ({ slot: slot as DraftStep["slot"], pickedId: `p${i}`, respins: [] }));
const DRAFT: ChallengeDraft = { seed: "classic-123", asOf: "2026-11-26", trace: TRACE, usedHints: true };
const WHO = { uid: "anon-user-001", name: "Sam" };

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("canShareAsChallenge — Classic and Prime free-play only (D6)", () => {
  it("accepts finished Classic and Prime free-play drafts", () => {
    expect(canShareAsChallenge("classic-123", TRACE)).toBe(true);
    expect(canShareAsChallenge("prime-123", TRACE)).toBe(true);
  });

  it("rejects every other seed, and a restored result with no trace", () => {
    for (const s of ["daily-2026-11-26", "hoopiq-1", "fh-2026-11-26", "bp-2026-11-26", "surgeon-2026-11-26", "prime-daily-2026-11-26", "h2h-abc12345"]) {
      expect(canShareAsChallenge(s, TRACE)).toBe(false);
    }
    expect(canShareAsChallenge("classic-123", [])).toBe(false);
  });

  it("matches the seeds the server fit-locks (same prefixes, incl. \"classic-\")", () => {
    for (const s of ["classic-123", "prime-123", "classicx", "classic", "prime-daily-2026-11-26", "daily-2026-11-26", "h2h-abc12345"]) {
      expect(canShareAsChallenge(s, TRACE)).toBe(isFitLockableSeed(s));
    }
    expect(isFitLockableSeed("classicx")).toBe(false);
  });
});

describe("createShareChallenge", () => {
  it("submits the finished draft as the creator and returns the new challenge id", async () => {
    let sent: Record<string, unknown> = {};
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      sent = JSON.parse(String(init?.body));
      return json(200, { role: "creator", id: sent.id });
    }) as unknown as typeof fetch;
    const id = await createShareChallenge(DRAFT, WHO, { fetchImpl });
    expect(id).toMatch(/^[a-z0-9]{8}$/);
    expect(sent).toMatchObject({ id, uid: WHO.uid, name: "Sam", seed: "classic-123", asOf: "2026-11-26", usedHints: true });
    expect(sent.trace).toEqual(TRACE);
    expect(vi.mocked(fetchImpl).mock.calls[0][0]).toBe("/api/challenge/submit");
  });

  it("returns null when challenges are not configured (503) so the share falls back to /r/", async () => {
    const fetchImpl = (async () => json(503, { error: "challenges not configured" })) as unknown as typeof fetch;
    expect(await createShareChallenge(DRAFT, WHO, { fetchImpl })).toBeNull();
  });

  it("returns null on a network error or an unexpected role", async () => {
    expect(await createShareChallenge(DRAFT, WHO, { fetchImpl: (async () => { throw new TypeError("offline"); }) as unknown as typeof fetch })).toBeNull();
    expect(await createShareChallenge(DRAFT, WHO, { fetchImpl: (async () => json(200, { role: "responder", id: "x" })) as unknown as typeof fetch })).toBeNull();
  });

  it("gives up after the timeout", async () => {
    const fetchImpl = ((_u: RequestInfo | URL, init?: RequestInit) =>
      new Promise((_, reject) => init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError"))))) as unknown as typeof fetch;
    expect(await createShareChallenge(DRAFT, WHO, { fetchImpl, timeoutMs: 10 })).toBeNull();
  });
});
