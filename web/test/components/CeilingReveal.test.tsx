// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, waitFor, cleanup } from "@testing-library/react";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) =>
    React.createElement("a", { href, className }, children),
}));
vi.mock("@/lib/streak", () => ({ getUid: () => "anon-uid-12345678" }));
vi.mock("@vercel/analytics", () => ({ track: vi.fn() }));
vi.mock("@/lib/ev", () => ({ ev: vi.fn() }));

import CeilingReveal from "@/components/CeilingReveal";
import SurgeonResult from "@/components/SurgeonResult";
import { useDailyCeiling } from "@/components/game/useDailyCeiling";
import type { LineupResult } from "@/lib/types";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const LINEUP = [
  { id: "a", name: "Magic Johnson", team: "LAL", decade: "1980s", slot: "PG" },
  { id: "b", name: "Michael Jordan", team: "CHI", decade: "1990s", slot: "SG" },
  { id: "c", name: "Larry Bird", team: "BOS", decade: "1980s", slot: "SF" },
  { id: "d", name: "Tim Duncan", team: "SAS", decade: "2000s", slot: "PF" },
  { id: "e", name: "Hakeem Olajuwon", team: "HOU", decade: "1990s", slot: "C" },
];
const PAST = { date: "2026-11-19", ceiling: { wins: 71, losses: 11, grade: "A", label: "Juggernaut", netRtg: 12, lineup: LINEUP, seg: "a,b,c,d,e" } };
const respond = (status: number, body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status }));

describe("CeilingReveal (past days)", () => {
  it("POSTs the date with the uid in the body (never the URL) and shows the revealed five", async () => {
    const fetchMock = respond(200, { ...PAST, you: { wins: 60, gap: 11 } });
    vi.stubGlobal("fetch", fetchMock);
    const { container } = render(<CeilingReveal date="2026-11-19" />);
    await waitFor(() => expect(container.textContent).toContain("71-11"));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/daily/ceiling");
    expect(JSON.parse(init.body as string)).toEqual({ date: "2026-11-19", uid: "anon-uid-12345678" });
    expect(container.textContent).toContain("Perfect five · Nov 19");
    expect(container.textContent).toContain("best five from that day's spins");
    expect(container.textContent).toContain("You went 60-22: 11 wins off it.");
    expect(container.querySelector('a[href="/r/a,b,c,d,e"]')).not.toBeNull();
    for (const p of LINEUP) expect(container.textContent).toContain(p.team);
  });

  it("falls back to a passed-in result when the board has expired", async () => {
    vi.stubGlobal("fetch", respond(200, PAST));
    const { container } = render(<CeilingReveal date="2026-11-19" yourWins={71} />);
    await waitFor(() => expect(container.textContent).toContain("You matched it."));
  });

  it("renders nothing when the server refuses (today / locked) or fails", async () => {
    for (const f of [respond(403, { error: "locked until the daily rolls over" }), vi.fn(async () => { throw new Error("offline"); })]) {
      vi.stubGlobal("fetch", f);
      const { container } = render(<CeilingReveal date="2026-11-20" />);
      await waitFor(() => expect(f).toHaveBeenCalled());
      expect(container.innerHTML).toBe("");
      cleanup();
    }
  });
});

function Probe({ date, verified }: { date: string | null; verified: boolean }) {
  const c = useDailyCeiling(date, verified);
  return <div data-testid="c">{c ? `${c.wins}-${c.losses}` : "none"}</div>;
}

describe("useDailyCeiling (today, §12)", () => {
  it("never asks before the board confirms a verified submission", async () => {
    const fetchMock = respond(200, { ceiling: { wins: 70, losses: 12 } });
    vi.stubGlobal("fetch", fetchMock);
    const { getByTestId } = render(<Probe date="2026-11-20" verified={false} />);
    await new Promise((r) => setTimeout(r, 10));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(getByTestId("c").textContent).toBe("none");
  });

  it("asks once verified, uid in the body, and returns only the record", async () => {
    const fetchMock = respond(200, { date: "2026-11-20", ceiling: { wins: 70, losses: 12 }, you: { wins: 60, gap: 10 } });
    vi.stubGlobal("fetch", fetchMock);
    const { getByTestId } = render(<Probe date="2026-11-20" verified />);
    await waitFor(() => expect(getByTestId("c").textContent).toBe("70-12"));
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/daily/ceiling");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string).uid).toBe("anon-uid-12345678");
  });

  it("hides quietly on 503 / 403", async () => {
    for (const status of [503, 403]) {
      const fetchMock = respond(status, { error: "x" });
      vi.stubGlobal("fetch", fetchMock);
      const { getByTestId } = render(<Probe date="2026-11-20" verified />);
      await waitFor(() => expect(fetchMock).toHaveBeenCalled());
      expect(getByTestId("c").textContent).toBe("none");
      cleanup();
    }
  });
});

describe("SurgeonResult carries the history line too", () => {
  const res = (wins: number): LineupResult => ({
    ortg: 115, drtg: 108, netRtg: 7, wins, losses: 82 - wins, winPct: wins / 82, grade: "A", label: "Contender",
    factors: [{ label: "Spacing", value: -2, kind: "bad" }], players: [], notes: [],
  });
  it("shows the post-swap percentile", () => {
    const players = LINEUP.map((p, i) => ({ id: p.id, name: p.name, team: p.team, decade: p.decade, year: 1990 + i, tier: "complete", pos: p.slot })) as never[];
    const { container } = render(
      <SurgeonResult before={res(50)} after={res(80)} beforePlayers={players} afterPlayers={players} outIdx={0}
        diagnosis={{ kind: "worst", label: "Spacing", canonical: "Spacing", value: -2 }} card="x" shared />,
    );
    expect(container.textContent).toContain("Better than every real team since 1985 after the swap");
  });
});
