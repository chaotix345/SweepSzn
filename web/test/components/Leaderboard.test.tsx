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
