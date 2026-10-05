// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, within, cleanup, waitFor } from "@testing-library/react";
import React from "react";
import type { ResultEntry } from "@/lib/resultHistory";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({
  user: null as { uid: string; name: string } | null,
  loading: false,
  fetchProfile: vi.fn(),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, className, ...rest }: { href: string; children: React.ReactNode; className?: string }) =>
    React.createElement("a", { href, className, ...rest }, children),
}));
vi.mock("@/components/SessionProvider", () => ({ useSessionContext: () => ({ user: h.user, loading: h.loading }) }));
vi.mock("@/lib/account", () => ({ fetchProfile: h.fetchProfile }));

import StatsBoard from "@/components/StatsBoard";

const DAY = 86_400_000;
const key = (t: number) => { const d = new Date(t); return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`; };
const seed = (results: ResultEntry[], dates: string[] = []) => {
  localStorage.setItem("82-0:results", JSON.stringify(results));
  localStorage.setItem("82-0:daily:history", JSON.stringify(dates));
};
const tile = (label: string) => screen.getByText(label).parentElement as HTMLElement;
const row = (mode: string) => screen.getByRole("rowheader", { name: mode }).closest("tr") as HTMLElement;

const now = Date.now();
const LOCAL: ResultEntry[] = [
  { encoded: "c1", mode: "classic", wins: 70, losses: 12, grade: "A", ts: now - DAY },
  { encoded: "c2", mode: "classic", wins: 55, losses: 27, grade: "C", ts: now - 2 * DAY },
  { encoded: "d1", mode: "daily", wins: 62, losses: 20, grade: "A", ts: now - 3 * DAY },
  { encoded: "s1", mode: "surgeon", wins: 75, losses: 7, grade: "A+", ts: now - 30 * DAY },
];

beforeEach(() => {
  h.user = null;
  h.loading = false;
  h.fetchProfile.mockReset();
  h.fetchProfile.mockResolvedValue(null);
});
afterEach(() => { cleanup(); localStorage.clear(); });

describe("StatsBoard", () => {
  it("shows a friendly empty state with a single orange Play CTA to /play when there are no games", async () => {
    render(<StatsBoard />);
    expect(await screen.findByRole("heading", { level: 1, name: /your stats/i })).toBeTruthy();
    expect(screen.getByText(/no games yet/i)).toBeTruthy();
    const cta = screen.getByRole("link", { name: /play/i });
    expect(cta.getAttribute("href")).toBe("/play");
    expect(cta.className).toContain("bg-orange-500");
    expect(screen.queryByRole("table")).toBeNull();
  });

  it("renders headline tiles from local history: games, best record, Daily streaks", async () => {
    seed(LOCAL, [key(now), key(now - DAY), key(now - 10 * DAY), key(now - 11 * DAY), key(now - 12 * DAY)]);
    render(<StatsBoard />);
    await screen.findByRole("table");
    expect(within(tile("Games played")).getByText("4")).toBeTruthy();
    const best = tile("Best record");
    expect(within(best).getByText("75-7")).toBeTruthy();
    expect(within(best).getByText("Surgeon")).toBeTruthy();
    expect(within(best).getByText("A+").className).toContain("text-gold"); // elite grade → gold
    expect(within(best).getByRole("link").getAttribute("href")).toBe("/sg/s1");
    expect(within(tile("Daily streak")).getByText("2")).toBeTruthy();
    expect(within(tile("Best Daily streak")).getByText("3")).toBeTruthy();
    expect(screen.getByText(/3 games in the last 7 days/i)).toBeTruthy();
  });

  it("lists every mode with played count, best W-L + grade (linked) and average wins", async () => {
    seed(LOCAL);
    render(<StatsBoard />);
    await screen.findByRole("table");
    const classic = row("Classic");
    expect(within(classic).getByText("2")).toBeTruthy();
    expect(within(classic).getByText("70-12")).toBeTruthy();
    expect(within(classic).getByText("A").className).toContain("text-green-400");
    expect(within(classic).getByRole("link").getAttribute("href")).toBe("/r/c1");
    expect(within(classic).getByText("62.5")).toBeTruthy();
    const unplayed = row("Factor Hunt");
    expect(within(unplayed).getByText("0")).toBeTruthy();
    expect(within(unplayed).queryByRole("link")).toBeNull();
    expect(screen.getAllByRole("row")).toHaveLength(1 + 8); // header + all eight modes
  });

  it("shows the grade distribution with text labels (not color alone)", async () => {
    seed(LOCAL);
    render(<StatsBoard />);
    const bar = await screen.findByRole("img", { name: /grade distribution/i });
    expect(bar.getAttribute("aria-label")).toMatch(/A\+ 1.*A 2.*C 1/);
    const legend = screen.getByRole("list", { name: /grade counts/i });
    expect(within(legend).getByText("A+")).toBeTruthy();
    expect(within(legend).getAllByRole("listitem")).toHaveLength(7);
  });

  it("does not call the account API when signed out", async () => {
    seed(LOCAL);
    render(<StatsBoard />);
    await screen.findByRole("table");
    expect(h.fetchProfile).not.toHaveBeenCalled();
  });

  it("signed in: unions the account's server history (deduped by mode:encoded) and lifts the Daily streak", async () => {
    h.user = { uid: "g1", name: "Charlie" };
    seed(LOCAL, [key(now)]);
    h.fetchProfile.mockResolvedValue({
      name: "Charlie", picture: "", streak: 5,
      results: [
        { encoded: "c1", mode: "classic", wins: 70, losses: 12, grade: "A", ts: now - DAY }, // already local
        { encoded: "p1", mode: "prime", wins: 80, losses: 2, grade: "S", ts: now - 40 * DAY }, // other device
      ],
    });
    render(<StatsBoard />);
    await waitFor(() => expect(within(tile("Best record")).getByText("80-2")).toBeTruthy());
    expect(h.fetchProfile).toHaveBeenCalledTimes(1);
    expect(within(tile("Games played")).getByText("5")).toBeTruthy();
    expect(within(tile("Best record")).getByText("Prime")).toBeTruthy();
    expect(within(row("Classic")).getByText("2")).toBeTruthy(); // the duplicate didn't double-count
    expect(within(tile("Daily streak")).getByText("5")).toBeTruthy();
  });

  it("signed in on a fresh device: waits for the account instead of flashing the empty state", async () => {
    h.user = { uid: "g1", name: "Charlie" };
    let resolve!: (v: unknown) => void;
    h.fetchProfile.mockReturnValue(new Promise((r) => { resolve = r; }));
    render(<StatsBoard />);
    expect(await screen.findByText(/loading your stats/i)).toBeTruthy();
    expect(screen.queryByText(/no games yet/i)).toBeNull();
    resolve({ name: "Charlie", picture: "", streak: 0, results: [{ encoded: "x", mode: "hoopiq", wins: 60, losses: 22, grade: "B", ts: now }] });
    expect(await screen.findByRole("table")).toBeTruthy();
    expect(within(tile("Games played")).getByText("1")).toBeTruthy();
  });
});
