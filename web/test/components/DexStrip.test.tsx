// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import React from "react";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) =>
    React.createElement("a", { href, className }, children),
}));

import { DexStrip } from "@/components/game/DexStrip";

function mockFetch(impl: () => Promise<Partial<Response>>) {
  vi.stubGlobal("fetch", vi.fn(impl as unknown as typeof fetch));
}

afterEach(() => { vi.unstubAllGlobals(); localStorage.clear(); });

const dexPlayers = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `p${i}` }));

describe("DexStrip — post-reveal collection strip", () => {
  it("shows the collected-player count and a deep link to the Dex when signed in", async () => {
    mockFetch(async () => ({
      ok: true, status: 200,
      json: async () => ({ players: dexPlayers(12), total: 8, badges: [] }),
    }));
    const { container } = render(<DexStrip />);
    await waitFor(() => expect(container.textContent).toMatch(/\b12\b/));
    const link = container.querySelector('a[href="/dex"]');
    expect(link).toBeTruthy();
    expect(container.textContent).toMatch(/Dex/i);
  });

  it("says the five joined only when they're in this device's Dex", async () => {
    mockFetch(async () => ({
      ok: true, status: 200,
      json: async () => ({ players: dexPlayers(12), total: 8, badges: [] }),
    }));
    const { container } = render(<DexStrip lineupIds={["p3", "p4", "p7", "p1", "p9"]} />);
    await waitFor(() => expect(container.textContent).toMatch(/joined the Dex/));
    expect(container.textContent).toMatch(/\b12\b/);
  });

  it("on someone else's shared permalink it stays neutral and doesn't count their five", async () => {
    mockFetch(async () => ({
      ok: true, status: 200,
      json: async () => ({ players: dexPlayers(3), total: 1, badges: [], signedIn: false }),
    }));
    const { container } = render(<DexStrip lineupIds={["x1", "x2", "x3", "x4", "x5"]} />);
    await waitFor(() => expect(container.querySelector('a[href="/dex"]')).toBeTruthy());
    expect(container.textContent).not.toMatch(/joined/);
    expect(container.textContent).toMatch(/\b3\b/);
  });

  it("invites a brand-new visitor to start a Dex when they have none", async () => {
    mockFetch(async () => ({ ok: true, status: 200, json: async () => ({ players: [], total: 0, badges: [], signedIn: false }) }));
    const { container } = render(<DexStrip lineupIds={["x1", "x2", "x3", "x4", "x5"]} />);
    await waitFor(() => expect(container.textContent).toMatch(/Start your Drafted Dex/));
  });

  it("is local-first: posts this device's result history and shows the count signed out (no 401 path)", async () => {
    localStorage.setItem("82-0:results", JSON.stringify([{ encoded: "abc", mode: "classic", wins: 50, losses: 32, grade: "C", ts: 1 }]));
    const f = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ players: dexPlayers(5), total: 1, badges: ["first"], signedIn: false }) }));
    vi.stubGlobal("fetch", f);
    const { container } = render(<DexStrip lineupIds={["p0", "p1", "p2", "p3", "p4"]} />);
    await waitFor(() => expect(container.textContent).toMatch(/\b5\b/));
    expect(container.textContent).toMatch(/joined the Dex/);
    expect(container.querySelector('a[href="/dex"]')).toBeTruthy();
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/dex");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ results: [{ mode: "classic", encoded: "abc", grade: "C" }] });
  });

  it("renders nothing (no link) when the dex API rejects — keeps a Redis-dark card silent", async () => {
    mockFetch(async () => { throw new Error("network"); });
    const { container } = render(<DexStrip />);
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));
    expect(container.querySelector('a[href="/dex"]')).toBeNull();
    expect(container.textContent).toBe("");
  });
});
