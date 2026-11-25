// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import React from "react";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) =>
    React.createElement("a", { href, className }, children),
}));
const share = vi.hoisted(() => ({ props: null as null | { path: string; text: string } }));
vi.mock("@/components/ResultCard", () => ({
  ShareButton: (p: { path: string; text: string }) => { share.props = p; return React.createElement("button", null, "Share"); },
  SaveCardImage: () => null,
}));

import DuelResult, { duelShareText, duelVerdict } from "@/components/DuelResult";
import type { LineupResult, Player } from "@/lib/types";

const res = (wins: number, netRtg = 3): LineupResult => ({ wins, losses: 82 - wins, netRtg, ortg: 115, drtg: 112, grade: "B", label: "Playoff team", winPct: wins / 82, factors: [], players: [], notes: [] } as unknown as LineupResult);
const five = (tag: string): Player[] => ["PG", "SG", "SF", "PF", "C"].map((pos, i) => ({ id: `${tag}${i}`, name: `${tag} Name${i}`, year: 1990, decade: "1990s", tier: "complete", team: "CHI", pos } as Player));

afterEach(() => { cleanup(); share.props = null; });

describe("DuelResult", () => {
  it("verdict: win/loss by wins, tie on net rating, dead even", () => {
    expect(duelVerdict("w", "analyst", res(60), res(55))).toMatchObject({ head: "You beat The Analyst", sub: "by 5 wins" });
    expect(duelVerdict("w", "analyst", res(60), res(55), true).head).toBe("Player beat The Analyst");
    expect(duelVerdict("l", "bro", res(50, 1), res(50, 2.5)).sub).toBe("on net rating (-1.5)");
    expect(duelVerdict("t", "oldhead", res(50), res(50)).head).toBe("Dead even");
  });

  it("share text names the persona and both records in the existing voice", () => {
    expect(duelShareText("w", "oldhead", res(61), res(55))).toBe("I beat Old Head in a SweepSzn Draft Duel — my all-time five went 61-21 to 55-27. Think you can take the bot?");
    expect(duelShareText("l", "analyst", res(40), res(55))).toMatch(/^The Analyst beat me/);
  });

  it("in-game: both fives, persona, the /duel/ share path, rematch and change opponent", () => {
    const onRematch = vi.fn(), onChangePersona = vi.fn();
    render(<DuelResult persona="oldhead" outcome="w" you={{ players: five("Y"), result: res(61) }} bot={{ players: five("B"), result: res(55) }}
      card="do~y0,y1,y2,y3,y4.b0,b1,b2,b3,b4" onRematch={onRematch} onChangePersona={onChangePersona} />);
    expect(screen.getByText("You beat Old Head")).toBeTruthy();
    expect(screen.getByText("Y Name0")).toBeTruthy();
    expect(screen.getByText("B Name4")).toBeTruthy();
    expect(share.props!.path).toBe("/duel/do~y0,y1,y2,y3,y4.b0,b1,b2,b3,b4");
    fireEvent.click(screen.getByRole("button", { name: /rematch old head/i }));
    fireEvent.click(screen.getByRole("button", { name: /change opponent/i }));
    expect(onRematch).toHaveBeenCalled();
    expect(onChangePersona).toHaveBeenCalled();
  });

  it("shared permalink: an orange 'Duel the bot' CTA instead of rematch", () => {
    render(<DuelResult persona="bro" outcome="l" you={{ players: five("Y"), result: res(40) }} bot={{ players: five("B"), result: res(55) }} card="db~x" shared />);
    const cta = screen.getByRole("link", { name: /duel the bot/i });
    expect(cta.getAttribute("href")).toBe("/play?mode=duel");
    expect(cta.className).toContain("bg-orange-500");
    expect(screen.queryByRole("button", { name: /rematch/i })).toBeNull();
  });
});
