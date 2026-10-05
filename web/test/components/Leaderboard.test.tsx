// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { act } from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot, createRoot } from "react-dom/client";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) =>
    React.createElement("a", { href, className }, children),
}));

import Leaderboard from "@/components/Leaderboard";

const CLOCK = /\d{2}:\d{2}:\d{2}/;

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); document.body.innerHTML = ""; });

// M12: the "next in hh:mm:ss" countdown is time-dependent, so the server HTML and the client's first
// render disagreed by however many seconds elapsed → a hydration text mismatch that makes React throw
// away the server HTML and client-render the whole root. The server (and hydration) render must show
// a stable placeholder; the live clock appears only after mount.
describe("Leaderboard countdown hydration", () => {
  it("server-renders a stable placeholder, never a live clock", () => {
    vi.useFakeTimers({ now: Date.parse("2026-06-15T12:00:00Z"), toFake: ["Date"] });
    const html = renderToString(<Leaderboard date="2026-6-15" trace={[]} readOnly />);
    expect(html).toContain("--:--:--");
    expect(html).not.toMatch(CLOCK);
  });

  it("hydrates without a recoverable mismatch when the client clock has moved on, then ticks", async () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {}))); // board fetch never settles
    vi.useFakeTimers({ now: Date.parse("2026-06-15T12:00:00Z"), toFake: ["Date"] });
    const html = renderToString(<Leaderboard date="2026-6-15" trace={[]} readOnly />);
    vi.setSystemTime(Date.parse("2026-06-15T12:00:03Z")); // the client hydrates 3s later
    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.appendChild(container);
    const errors: unknown[] = [];
    await act(async () => {
      hydrateRoot(container, <Leaderboard date="2026-6-15" trace={[]} readOnly />, { onRecoverableError: (e) => errors.push(e) });
    });
    expect(errors).toEqual([]);
    expect(container.textContent).toMatch(CLOCK); // after mount the live countdown takes over
  });
});

// L5: /leaderboards renders <Leaderboard readOnly /> with no date so the page can prerender statically;
// the board date must then be resolved on the client (today, UTC) — and still read via the POST body.
describe("Leaderboard without a date prop", () => {
  it("reads today's board, resolved client-side, through the uid-in-body POST", async () => {
    vi.useFakeTimers({ now: Date.parse("2026-06-15T12:00:00Z"), toFake: ["Date"] });
    const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(() => new Promise(() => {}));
    vi.stubGlobal("fetch", fetchMock);
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => { root.render(<Leaderboard trace={[]} readOnly />); });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/daily/leaderboard");
    expect(init?.method).toBe("POST");
    expect(JSON.parse(String(init?.body))).toMatchObject({ date: "2026-6-15" });
    act(() => root.unmount());
  });
});

// Feature: once you've posted today, every other row on the Daily board links a head-to-head of your
// five vs theirs (/compare/<yours>/<theirs>) — post-commit only, so it's §12-safe.
describe("Leaderboard 'vs you' compare links", () => {
  const MINE = "a1,a2,a3,a4,a5";
  const THEIRS = "h~b1,b2,b3,b4,b5";
  const row = (rank: number, lineup: string, me?: true) => ({ rank, name: `P${rank}`, wins: 70 - rank, losses: 12 + rank, net: 5, lineup, ...(me ? { me } : {}) });
  async function renderWith(view: object) {
    vi.stubGlobal("fetch", vi.fn((url: string) =>
      url === "/api/daily/leaderboard"
        ? Promise.resolve(new Response(JSON.stringify(view), { status: 200, headers: { "content-type": "application/json" } }))
        : new Promise(() => {})));
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => { root.render(<Leaderboard date="2026-6-15" trace={[]} readOnly />); });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    return { container, root };
  }

  it("links each other row to /compare/<yours>/<theirs> once you're on the board", async () => {
    const { container, root } = await renderWith({ date: "2026-6-15", total: 2, top: [row(1, THEIRS), row(2, MINE, true)], you: row(2, MINE, true) });
    const hrefs = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href"));
    expect(hrefs).toContain(`/compare/${MINE}/${THEIRS}`);
    expect(hrefs).not.toContain(`/compare/${MINE}/${MINE}`); // never against your own row
    expect(hrefs).toContain(`/r/${THEIRS}`); // the row itself still opens their result
    act(() => root.unmount());
  });

  it("offers no compare before you've posted (pre-commit)", async () => {
    const { container, root } = await renderWith({ date: "2026-6-15", total: 1, top: [row(1, THEIRS)] });
    expect([...container.querySelectorAll("a")].some((a) => a.getAttribute("href")?.startsWith("/compare/"))).toBe(false);
    act(() => root.unmount());
  });
});
