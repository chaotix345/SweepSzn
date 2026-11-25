// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import React from "react";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) =>
    React.createElement("a", { href, className }, children),
}));
vi.mock("@/components/SessionProvider", () => ({ useSessionContext: () => ({ user: null }) }));
vi.mock("@vercel/analytics", () => ({ track: vi.fn() }));

import BpLeaderboard from "@/components/BpLeaderboard";
import { dayUTC } from "@/lib/day";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const ok = (body: unknown) => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }));
const row = { rank: 1, name: "Planner", wins: 60, losses: 22, net: 5, lineup: "a,b,c,d,e", bp: "spacing", score: 63, grade: "A", mult: 1.05 };
const TRACE = (["PG", "SG", "SF", "PF", "C"] as const).map((slot, i) => ({ slot, pickedId: `p${i}`, respins: [] }));

// W1: Blueprint keeps only its combined board; the five per-objective sub-tabs are gone (API unchanged).
describe("BpLeaderboard — combined view only", () => {
  it("shows no objective tabs and always reads the combined (bp=all) board, including after a submit", async () => {
    const reads: unknown[] = [];
    vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => {
      if (url === "/api/blueprint/leaderboard") { reads.push(JSON.parse(String(init?.body)).bp); return ok({ date: dayUTC(), bp: "all", total: 1, top: [row] }); }
      if (url === "/api/blueprint/submit") return ok({ date: dayUTC(), bp: "spacing", total: 1, top: [{ ...row, me: true }], you: { ...row, me: true } });
      return new Promise(() => {});
    }));
    render(<BpLeaderboard date={dayUTC()} trace={TRACE} blueprint="spacing" />);
    expect(await screen.findByText("Planner")).toBeTruthy();
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryAllByRole("tab")).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: /submit/i }));
    await waitFor(() => expect(reads.length).toBe(2));
    expect(reads).toEqual(["all", "all"]);
  });
});
