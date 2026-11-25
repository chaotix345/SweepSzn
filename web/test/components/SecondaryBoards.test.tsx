// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import React from "react";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) =>
    React.createElement("a", { href, className }, children),
}));

import SecondaryBoards from "@/components/SecondaryBoards";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const ok = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }));
const FH = { date: "d", total: 2, top: [{ rank: 1, name: "Hunter", wins: 61, losses: 21, net: 6, lineup: "a,b,c,d,e", predicted: "x" }] };
const EMPTY = { date: "d", total: 0, top: [] };

// W1: on /leaderboards the Daily stays primary; each secondary daily board appears only when it has entries.
describe("SecondaryBoards", () => {
  it("renders only the boards that have entries today, read through the public GETs", async () => {
    const fetchMock = vi.fn((url: string) =>
      url.startsWith("/api/factorhunt/leaderboard?") ? ok(FH)
        : url.startsWith("/api/blueprint/leaderboard?") ? ok({ ...EMPTY, bp: "all" })
        : Promise.resolve(new Response("{}", { status: 503 })));
    vi.stubGlobal("fetch", fetchMock);
    render(<SecondaryBoards />);
    expect(await screen.findByText("Hunter")).toBeTruthy();
    expect(screen.getAllByText(/Factor Hunt/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Blueprint/)).toBeNull();
    expect(screen.queryByText(/Surgeon/)).toBeNull();
    expect(fetchMock.mock.calls.some(([u]) => String(u).includes("bp=all"))).toBe(true); // combined Blueprint view only
    // rows never link a lineup
    expect([...document.querySelectorAll("a")].some((a) => a.getAttribute("href")?.startsWith("/r/"))).toBe(false);
  });

  it("renders nothing at all when every secondary board is empty or unconfigured", async () => {
    const fetchMock = vi.fn(() => ok(EMPTY));
    vi.stubGlobal("fetch", fetchMock);
    const { container } = render(<SecondaryBoards />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    await new Promise((r) => setTimeout(r, 0));
    expect(container.textContent).toBe("");
  });
});
