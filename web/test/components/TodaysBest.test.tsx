// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import React from "react";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) =>
    React.createElement("a", { href, className }, children),
}));

import TodaysBest from "@/components/TodaysBest";

afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("TodaysBest", () => {
  it("shows the credible static fallback before data arrives", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {}))); // never resolves
    render(<TodaysBest />);
    expect(screen.getByText(/Best draftable five ever found/i)).toBeTruthy();
    expect(screen.getByText("79–3")).toBeTruthy();
  });

  it("renders today's leader and player count once the board loads", async () => {
    const view = {
      date: "2026-6-15", total: 1240,
      top: [{ rank: 1, uid: "u1", name: "JordanGOAT", wins: 74, losses: 8, net: 12.3, lineup: "abc" }],
    };
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => view })));
    render(<TodaysBest />);
    const link = await screen.findByRole("link");
    expect(link.getAttribute("href")).toBe("/r/abc");
    expect(link.textContent).toContain("74");
    expect(link.textContent).toContain("JordanGOAT");
    expect(screen.getByText(/1,240 lineups today/i)).toBeTruthy();
  });

  it("stays on the fallback when the board is unconfigured (503)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) })));
    render(<TodaysBest />);
    await waitFor(() => expect(screen.getByText(/Best draftable five ever found/i)).toBeTruthy());
    expect(screen.queryByRole("link")).toBeNull();
  });
});
