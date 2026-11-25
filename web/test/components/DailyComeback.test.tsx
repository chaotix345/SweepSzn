// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, act, cleanup } from "@testing-library/react";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) =>
    React.createElement("a", { href, className }, children),
}));

import DailyComeback from "@/components/DailyComeback";
import { saveArchiveRun } from "@/lib/archiveHistory";

const NOW = Date.parse("2026-11-26T20:00:00Z"); // 4h to the next Daily
const YDAY = "2026-11-25";
const respond = (status: number, body: unknown) => vi.fn(async (...args: unknown[]) => { void args; return new Response(JSON.stringify(body), { status }); });
const settle = async () => { await act(async () => {}); await act(async () => {}); };

beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(NOW); localStorage.clear(); });
afterEach(() => { cleanup(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("DailyComeback (W3)", () => {
  it("shows the next-Daily countdown, tomorrow's hook, the streak and the archive link", async () => {
    vi.stubGlobal("fetch", respond(403, {}));
    render(<DailyComeback streak={4} />);
    await settle();
    expect(screen.getByTestId("next-daily").textContent).toBe("04:00:00");
    expect(screen.getByText("Tomorrow: see today's perfect five.")).toBeTruthy();
    expect(screen.getByLabelText("4-day streak").textContent).toContain("4");
    expect(screen.getByText(/Replay past Dailies/).closest("a")?.getAttribute("href")).toBe("/archive");
  });

  it("hides the streak at zero", async () => {
    vi.stubGlobal("fetch", respond(403, {}));
    render(<DailyComeback streak={0} />);
    await settle();
    expect(screen.queryByLabelText(/day streak/)).toBeNull();
  });

  it("asks for yesterday's revealed five with the uid in the body and shows the gap when yesterday was played", async () => {
    localStorage.setItem("82-0:daily:history", JSON.stringify([YDAY]));
    const f = respond(200, { date: YDAY, ceiling: { wins: 74, losses: 8, lineup: [] }, you: { wins: 63, gap: 11 } });
    vi.stubGlobal("fetch", f);
    render(<DailyComeback streak={2} />);
    await settle();
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/daily/ceiling");
    expect(JSON.parse(String(init.body))).toMatchObject({ date: YDAY });
    expect(JSON.parse(String(init.body)).uid).toBeTruthy();
    const link = screen.getByText(/Yesterday's perfect five went/).closest("a")!;
    expect(link.getAttribute("href")).toBe(`/archive?d=${YDAY}`);
    expect(link.textContent).toContain("74-8");
    expect(link.textContent).toContain("you were 11 off");
  });

  it("uses a local replay of yesterday when the board has no row", async () => {
    saveArchiveRun(YDAY, { wins: 74, losses: 8, grade: "A+", encoded: "x" });
    vi.stubGlobal("fetch", respond(200, { date: YDAY, ceiling: { wins: 74, losses: 8, lineup: [] } }));
    render(<DailyComeback streak={1} />);
    await settle();
    expect(screen.getByText(/Yesterday's perfect five went/).closest("a")!.textContent).toContain("you matched it");
  });

  it("leaves yesterday out when the player didn't play it, or the reveal fails", async () => {
    vi.stubGlobal("fetch", respond(200, { date: YDAY, ceiling: { wins: 74, losses: 8, lineup: [] } }));
    render(<DailyComeback streak={1} />);
    await settle();
    expect(screen.queryByText(/Yesterday's perfect five/)).toBeNull();
    cleanup();
    localStorage.setItem("82-0:daily:history", JSON.stringify([YDAY]));
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    render(<DailyComeback streak={1} />);
    await settle();
    expect(screen.queryByText(/Yesterday's perfect five/)).toBeNull();
    expect(screen.getByText("Tomorrow: see today's perfect five.")).toBeTruthy();
  });
});
