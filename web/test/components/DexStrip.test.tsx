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

afterEach(() => { vi.unstubAllGlobals(); });

describe("DexStrip — post-reveal collection strip", () => {
  it("shows the collected-player count and a deep link to the Dex when signed in", async () => {
    mockFetch(async () => ({
      ok: true, status: 200,
      json: async () => ({ players: new Array(12).fill({ id: "x" }), total: 8, badges: [] }),
    }));
    const { container } = render(<DexStrip />);
    await waitFor(() => expect(container.textContent).toMatch(/\b12\b/));
    const link = container.querySelector('a[href="/dex"]');
    expect(link).toBeTruthy();
    expect(container.textContent).toMatch(/Dex/i);
  });

  it("prompts the signed-out user to start a Dex (still links to /dex)", async () => {
    mockFetch(async () => ({ ok: false, status: 401, json: async () => ({ error: "auth_required" }) }));
    const { container } = render(<DexStrip />);
    await waitFor(() => expect(container.querySelector('a[href="/dex"]')).toBeTruthy());
    expect(container.textContent).toMatch(/Dex/i);
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
