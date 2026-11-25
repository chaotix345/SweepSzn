// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup, waitFor, within } from "@testing-library/react";
import React from "react";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@vercel/analytics", () => ({ track: vi.fn() }));
vi.mock("@/lib/ev", () => ({ ev: vi.fn() }));
vi.mock("@/lib/streak", () => ({ getUid: () => "test-uid-duel" }));
vi.mock("@/lib/account", () => ({ pushResult: vi.fn() }));
const session = vi.hoisted(() => ({ user: null as { uid: string; name: string } | null }));
vi.mock("@/components/SessionProvider", () => ({ useSessionContext: () => ({ user: session.user }) }));
vi.mock("@/components/DuelResult", () => ({
  default: (p: { outcome: string; card: string; onRematch: () => void; onChangePersona: () => void }) =>
    React.createElement("div", { "data-testid": "duel-result" }, `outcome:${p.outcome} card:${p.card}`,
      React.createElement("button", { onClick: p.onRematch }, "Rematch"),
      React.createElement("button", { onClick: p.onChangePersona }, "Change opponent")),
}));

import { DuelGame } from "@/components/game/DuelGame";
import { pushResult } from "@/lib/account";

const SLOTS = ["PG", "SG", "SF", "PF", "C"];
type Call = { url: string; body: Record<string, unknown> };
let calls: Call[] = [];

// Fake server: each spin deals two candidates (a low and a high scorer, both eligible everywhere);
// the bot always takes a fresh "bot<turn>" player at its first open slot.
function fakeFetch() {
  return vi.fn(async (url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? "{}"));
    calls.push({ url, body });
    const json = (d: unknown) => ({ ok: true, json: async () => d }) as Response;
    if (url === "/api/spin") {
      const r = body.round as number;
      const cand = (id: string, pts: number) => ({ id, name: `Player ${id}`, year: 1990, decade: "1990s", team: "CHI", pos: "SF", eligible: SLOTS, pts, trb: 5, ast: 5 });
      return json({ team: "CHI", decade: "1990s", candidates: [cand(`lo${r}`, 8), cand(`hi${r}`, 30)] });
    }
    if (url === "/api/duel/bot-pick") {
      const n = (body.picks as unknown[]).length;
      const turns = [1, 2, 5, 6, 9].filter((t) => t < [1, 3, 4, 7, 8][n] || (n === 5 && t === 9));
      const bot = turns.map((t, i) => ({ turn: t, round: t >> 1, slot: SLOTS[i], team: "LAL", decade: "1980s", fallback: false,
        player: { id: `bot${t}`, name: `Bot Pick ${t}`, year: 1985, decade: "1980s", team: "LAL", pos: "C", eligible: SLOTS } }));
      return json({ bot, next: n >= 5 ? null : [0, 3, 4, 7, 8][n] });
    }
    if (url === "/api/duel/result") {
      const res = { wins: 60, losses: 22, grade: "A", netRtg: 5, ortg: 115, drtg: 110, label: "Contender" };
      return json({ persona: body.persona, outcome: "w", card: "do~a,b,c,d,e.f,g,h,i,j", you: { players: [], result: res }, bot: { players: [], result: { ...res, wins: 50, losses: 32 } } });
    }
    return { ok: false, json: async () => ({}) } as Response;
  });
}

beforeEach(() => {
  calls = [];
  session.user = null;
  vi.stubGlobal("fetch", fakeFetch());
  // reduced motion: the reel/bot beats resolve instantly, so the test doesn't wait on cosmetic delays
  vi.stubGlobal("matchMedia", (q: string) => ({ matches: q.includes("reduce"), media: q, addEventListener() {}, removeEventListener() {} }));
  window.matchMedia = globalThis.matchMedia as typeof window.matchMedia;
  window.requestAnimationFrame = (cb: FrameRequestCallback) => { cb(0); return 0; };
  window.scrollTo = () => {};
});
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); vi.useRealTimers(); });

const pickIn = async (name: RegExp) => {
  fireEvent.click(await screen.findByRole("button", { name }));
  const sheet = await screen.findByRole("dialog", { name: /choose a position/i });
  const open = within(sheet).getAllByRole("button").find((b) => SLOTS.includes(b.textContent ?? "") && !(b as HTMLButtonElement).disabled)!;
  fireEvent.click(open);
};

describe("DuelGame — setup", () => {
  it("defaults to Old Head, explains snake order, and remembers the chosen persona and clock", async () => {
    render(<DuelGame onModeSelect={() => {}} />);
    expect(screen.getByRole("radio", { name: /old head/i }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByText(/snake order/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: /the analyst/i }));
    expect(localStorage.getItem("szn_duel_persona")).toBe("analyst");
    fireEvent.click(screen.getByRole("checkbox"));
    expect(localStorage.getItem("szn_duel_clock")).toBe("1");
    cleanup();
    render(<DuelGame onModeSelect={() => {}} />);
    await waitFor(() => expect(screen.getByRole("radio", { name: /the analyst/i }).getAttribute("aria-checked")).toBe("true"));
    expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(true);
  });

  it("survives storage that throws (private mode)", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("denied"); });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("denied"); });
    render(<DuelGame onModeSelect={() => {}} />);
    fireEvent.click(screen.getByRole("radio", { name: /box-score bro/i }));
    expect(screen.getByRole("radio", { name: /box-score bro/i }).getAttribute("aria-checked")).toBe("true");
    vi.restoreAllMocks();
  });
});

describe("DuelGame — draft", () => {
  it("plays a full duel: spins with every taken id excluded, never asks for fit, scores, saves the W-L", async () => {
    render(<DuelGame onModeSelect={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /duel old head/i }));
    for (let r = 0; r < 5; r++) await pickIn(new RegExp(`Select Player lo${[0, 1, 2, 3, 4][r]}`));
    expect(await screen.findByTestId("duel-result")).toBeTruthy();

    const spins = calls.filter((c) => c.url === "/api/spin");
    expect(spins.map((c) => c.body.round)).toEqual([0, 1, 2, 3, 4]);
    expect(spins.every((c) => String(c.body.seed).startsWith("duel-") && c.body.fit === undefined)).toBe(true);
    expect(spins[1].body.exclude).toEqual(["lo0", "bot1", "bot2"]); // R2: bot picked first from the shared spin
    expect(spins[3].body.exclude).toHaveLength(7); // R4: 3 of yours + 4 of the bot's
    expect(spins[4].body.exclude).toHaveLength(8); // R5: you pick first, 8 already gone
    const bots = calls.filter((c) => c.url === "/api/duel/bot-pick");
    expect(bots.at(-1)!.body.picks).toHaveLength(5);
    expect(bots.every((c) => c.body.persona === "oldhead")).toBe(true);

    const saved = JSON.parse(localStorage.getItem("82-0:results")!)[0];
    expect(saved).toMatchObject({ mode: "duel", outcome: "w", wins: 60, encoded: "do~a,b,c,d,e.f,g,h,i,j" });
    expect(pushResult).not.toHaveBeenCalled(); // signed out: local only
  });

  it("shows the bot's picks as they happen", async () => {
    render(<DuelGame onModeSelect={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /duel old head/i }));
    await pickIn(/Select Player lo0/);
    await screen.findByRole("button", { name: /Select Player lo1/ });
    expect(screen.getAllByText(/Bot Pick 1/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Bot Pick 2/).length).toBeGreaterThan(0);
  });

  it("pick clock: on timeout auto-picks the top scorer who fits an open slot", async () => {
    localStorage.setItem("szn_duel_clock", "1");
    render(<DuelGame onModeSelect={() => {}} />);
    await waitFor(() => expect((screen.getByRole("checkbox") as HTMLInputElement).checked).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: /duel old head/i }));
    await screen.findByRole("button", { name: /Select Player hi0/ });
    expect(screen.getByRole("timer")).toBeTruthy();
    vi.useFakeTimers();
    await act(async () => { vi.advanceTimersByTime(21_000); });
    vi.useRealTimers();
    await waitFor(() => expect(calls.some((c) => c.url === "/api/duel/bot-pick")).toBe(true));
    const first = calls.find((c) => c.url === "/api/duel/bot-pick")!;
    expect((first.body.picks as { id: string }[])[0].id).toBe("hi0");
  });

  it("no pick clock unless turned on", async () => {
    render(<DuelGame onModeSelect={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /duel old head/i }));
    await screen.findByRole("button", { name: /Select Player hi0/ });
    expect(screen.queryByRole("timer")).toBeNull();
  });
});
