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

  it("D2: a row without a lineup (live Daily, viewer hasn't submitted) renders with no /r/ or compare link", async () => {
    const { container, root } = await renderWith({ date: "2026-6-15", total: 2, top: [{ rank: 1, name: "P1", wins: 70, losses: 12, net: 5 }, { rank: 2, name: "P2", wins: 60, losses: 22, net: 2 }] });
    expect(container.textContent).toContain("P1");
    const hrefs = [...container.querySelectorAll("a")].map((a) => a.getAttribute("href") ?? "");
    expect(hrefs.some((h) => h.startsWith("/r/") || h.startsWith("/compare/"))).toBe(false);
    act(() => root.unmount());
  });

  it("offers no compare before you've posted (pre-commit)", async () => {
    const { container, root } = await renderWith({ date: "2026-6-15", total: 1, top: [row(1, THEIRS)] });
    expect([...container.querySelectorAll("a")].some((a) => a.getAttribute("href")?.startsWith("/compare/"))).toBe(false);
    act(() => root.unmount());
  });
});

// D1: a finished Daily posts itself through /api/daily/submit — once, on the result screen only — and the
// streak is credited by that submit. Without Redis (503) the board quietly hides.
describe("Leaderboard D1 auto-submit", () => {
  const TRACE = (["PG", "SG", "SF", "PF", "C"] as const).map((slot, i) => ({ slot, pickedId: `p${i}`, respins: [] }));
  const VIEW = { date: "2026-6-15", total: 1, top: [{ rank: 1, name: "Anonymous", wins: 60, losses: 22, net: 4, lineup: "p0,p1,p2,p3,p4", me: true }], you: { rank: 1, name: "Anonymous", wins: 60, losses: 22, net: 4, lineup: "p0,p1,p2,p3,p4", me: true } };
  const json = (body: unknown, status = 200) => Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
  function mount(el: React.ReactElement, submitStatus = 200) {
    const fetchMock = vi.fn((url: string) =>
      url === "/api/daily/submit" ? json(submitStatus === 200 ? VIEW : { error: "x" }, submitStatus)
        : url === "/api/daily/leaderboard" ? json({ date: "2026-6-15", total: 0, top: [] })
        : new Promise<Response>(() => {}));
    vi.stubGlobal("fetch", fetchMock);
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    return { fetchMock, container, root, calls: (u: string) => fetchMock.mock.calls.filter(([url]) => url === u) };
  }
  const settle = () => act(async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0)); });
  afterEach(() => { try { localStorage.clear(); } catch { /* none */ } });

  it("submits a finished Daily once, shows the board, and credits the streak", async () => {
    vi.useFakeTimers({ now: Date.parse("2026-06-15T12:00:00Z"), toFake: ["Date"] });
    const m = mount(<Leaderboard date="2026-6-15" trace={TRACE} />);
    await act(async () => { m.root.render(<Leaderboard date="2026-6-15" trace={TRACE} />); });
    await settle();
    expect(m.calls("/api/daily/submit")).toHaveLength(1);
    const body = JSON.parse(String((m.calls("/api/daily/submit")[0] as unknown as [string, RequestInit])[1].body));
    expect(body).toMatchObject({ date: "2026-6-15", trace: TRACE });
    expect(m.calls("/api/daily/leaderboard")).toHaveLength(0); // the submit response is the view
    expect(m.container.textContent).toContain("1-day streak");
    expect(m.container.querySelector("input")).toBeNull(); // no manual submit form any more
    act(() => m.root.unmount());
  });

  it("submits exactly once under StrictMode's double effect run", async () => {
    vi.useFakeTimers({ now: Date.parse("2026-06-15T12:00:00Z"), toFake: ["Date"] });
    const m = mount(<Leaderboard date="2026-6-15" trace={TRACE} />);
    await act(async () => { m.root.render(<React.StrictMode><Leaderboard date="2026-6-15" trace={TRACE} /></React.StrictMode>); });
    await settle();
    expect(m.calls("/api/daily/submit")).toHaveLength(1);
    expect(m.container.textContent).toContain("Anonymous");
    act(() => m.root.unmount());
  });

  it("a restored result screen (same trace, remount) reads the board instead of re-posting", async () => {
    vi.useFakeTimers({ now: Date.parse("2026-06-15T12:00:00Z"), toFake: ["Date"] });
    const first = mount(<Leaderboard date="2026-6-15" trace={TRACE} />);
    await act(async () => { first.root.render(<Leaderboard date="2026-6-15" trace={TRACE} />); });
    await settle();
    expect(first.calls("/api/daily/submit")).toHaveLength(1);
    act(() => first.root.unmount());

    const again = mount(<Leaderboard date="2026-6-15" trace={TRACE} />);
    await act(async () => { again.root.render(<Leaderboard date="2026-6-15" trace={TRACE} />); });
    await settle();
    expect(again.calls("/api/daily/submit")).toHaveLength(0);
    expect(again.calls("/api/daily/leaderboard")).toHaveLength(1);
    act(() => again.root.unmount());
  });

  it("a different trace on the same day still auto-submits (keep-best decides)", async () => {
    vi.useFakeTimers({ now: Date.parse("2026-06-15T12:00:00Z"), toFake: ["Date"] });
    const first = mount(<Leaderboard date="2026-6-15" trace={TRACE} />);
    await act(async () => { first.root.render(<Leaderboard date="2026-6-15" trace={TRACE} />); });
    await settle();
    act(() => first.root.unmount());
    const other = TRACE.map((s, i) => (i === 0 ? { ...s, pickedId: "q0" } : s));
    const again = mount(<Leaderboard date="2026-6-15" trace={other} />);
    await act(async () => { again.root.render(<Leaderboard date="2026-6-15" trace={other} />); });
    await settle();
    expect(again.calls("/api/daily/submit")).toHaveLength(1);
    act(() => again.root.unmount());
  });

  it("never submits a read-only board", async () => {
    vi.useFakeTimers({ now: Date.parse("2026-06-15T12:00:00Z"), toFake: ["Date"] });
    const m = mount(<Leaderboard date="2026-6-15" trace={TRACE} readOnly />);
    await act(async () => { m.root.render(<Leaderboard date="2026-6-15" trace={TRACE} readOnly />); });
    await settle();
    expect(m.calls("/api/daily/submit")).toHaveLength(0);
    expect(m.calls("/api/daily/leaderboard")).toHaveLength(1);
    act(() => m.root.unmount());
  });

  it("never submits a game whose Daily rolled over at UTC midnight", async () => {
    vi.useFakeTimers({ now: Date.parse("2026-06-16T00:00:05Z"), toFake: ["Date"] });
    const m = mount(<Leaderboard date="2026-6-15" trace={TRACE} />);
    await act(async () => { m.root.render(<Leaderboard date="2026-6-15" trace={TRACE} />); });
    await settle();
    expect(m.calls("/api/daily/submit")).toHaveLength(0);
    expect(m.container.textContent).toMatch(/just reset/);
    act(() => m.root.unmount());
  });

  it("without Redis (503) hides the board quietly and credits no streak", async () => {
    vi.useFakeTimers({ now: Date.parse("2026-06-15T12:00:00Z"), toFake: ["Date"] });
    const m = mount(<Leaderboard date="2026-6-15" trace={TRACE} />, 503);
    await act(async () => { m.root.render(<Leaderboard date="2026-6-15" trace={TRACE} />); });
    await settle();
    expect(m.container.textContent).toMatch(/warming up/i);
    expect(m.container.textContent).not.toContain("streak");
    act(() => m.root.unmount());
  });
});
