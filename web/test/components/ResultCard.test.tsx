// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

// --- module mocks (must precede the component import) ---

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) =>
    React.createElement("a", { href, className }, children),
}));

vi.mock("@vercel/analytics", () => ({ track: vi.fn() }));
vi.mock("@/lib/ev", () => ({ ev: vi.fn() }));
vi.mock("@/lib/streak", () => ({ getUid: () => "test-uid" }));

// --- import the component under test AFTER mocks ---
import ResultCard from "@/components/ResultCard";
import type { LineupResult, Player, Slot } from "@/lib/types";

// --- fixtures ---

const SLOTS: Slot[] = ["PG", "SG", "SF", "PF", "C"];

function makeResult(overrides: Partial<LineupResult> = {}): LineupResult {
  return {
    ortg: 112.5,
    drtg: 108.3,
    netRtg: 4.2,
    wins: 55,
    losses: 27,
    winPct: 0.671,
    grade: "A",
    label: "Title contender",
    factors: [
      { label: "Star offense", value: 5.1, kind: "good" },
      { label: "Spacing", value: -2.3, kind: "bad" },
    ],
    players: [
      { id: "pg", name: "Player PG", off: 3.5, def: 0.8, usage: 28, shooter: true, rimProtector: false },
      { id: "sg", name: "Player SG", off: 2.0, def: 0.5, usage: 22, shooter: true, rimProtector: false },
      { id: "sf", name: "Player SF", off: 1.8, def: 1.2, usage: 20, shooter: false, rimProtector: false },
      { id: "pf", name: "Player PF", off: 1.0, def: 2.5, usage: 16, shooter: false, rimProtector: true },
      { id: "c",  name: "Player C",  off: 0.5, def: 3.0, usage: 14, shooter: false, rimProtector: true },
    ],
    notes: [],
    ...overrides,
  };
}

function makePlayers(): Player[] {
  return [
    { id: "pg", name: "Player PG", year: 1990, decade: "1990s", tier: "complete", team: "CHI", pos: "PG", pts: 28.0, trb: 5.0, ast: 5.0, stl: 1.5, blk: 0.5 },
    { id: "sg", name: "Player SG", year: 1985, decade: "1980s", tier: "complete", team: "LAL", pos: "SG", pts: 22.0, trb: 4.0, ast: 3.0, stl: 1.0, blk: 0.3 },
    { id: "sf", name: "Player SF", year: 1995, decade: "1990s", tier: "complete", team: "BOS", pos: "SF", pts: 18.0, trb: 6.0, ast: 2.0, stl: 1.0, blk: 0.5 },
    { id: "pf", name: "Player PF", year: 2000, decade: "2000s", tier: "complete", team: "SAS", pos: "PF", pts: 14.0, trb: 9.0, ast: 1.5, stl: 0.5, blk: 2.0 },
    { id: "c",  name: "Player C",  year: 1975, decade: "1970s", tier: "complete", team: "MIL", pos: "C",  pts: 10.0, trb: 11.0, ast: 1.0, stl: 0.3, blk: 3.5 },
  ];
}

function renderCard(props: Partial<React.ComponentProps<typeof ResultCard>> = {}) {
  return render(
    <ResultCard
      result={makeResult()}
      players={makePlayers()}
      slots={SLOTS}
      mode="Daily"
      onReset={() => {}}
      {...props}
    />,
  );
}

// --- tests ---

describe("ResultCard — grade/verdict render branches", () => {
  it("renders the W-L record as part of the hero section", () => {
    const { container } = renderCard();
    // The hero div contains "55–27" — check via the container text
    const hero = container.querySelector(".font-display.text-7xl");
    expect(hero).toBeTruthy();
    expect(hero!.textContent).toContain("55");
    expect(hero!.textContent).toContain("27");
  });

  it("renders the grade label text", () => {
    renderCard();
    const matches = screen.getAllByText("Title contender");
    expect(matches.length).toBeGreaterThan(0);
  });

  it("S / A+ grade renders grade span in gold text class", () => {
    const { container } = renderCard({ result: makeResult({ grade: "S", label: "Dynasty" }) });
    // The grade text span in the hero section
    const hero = container.querySelector(".text-lg.font-bold.tracking-wide");
    const gradeSpan = hero?.querySelector("span");
    expect(gradeSpan?.className).toContain("text-gold");
  });

  it("A grade renders grade span in green-400 text class", () => {
    const { container } = renderCard({ result: makeResult({ grade: "A", label: "Title contender" }) });
    const hero = container.querySelector(".text-lg.font-bold.tracking-wide");
    const gradeSpan = hero?.querySelector("span");
    expect(gradeSpan?.className).toContain("text-green-400");
  });

  it("B grade renders grade span in blue-400 text class", () => {
    const { container } = renderCard({ result: makeResult({ grade: "B", label: "Playoff team" }) });
    const hero = container.querySelector(".text-lg.font-bold.tracking-wide");
    const gradeSpan = hero?.querySelector("span");
    expect(gradeSpan?.className).toContain("text-blue-400");
  });

  it("C grade renders grade span in amber-400 text class", () => {
    const { container } = renderCard({ result: makeResult({ grade: "C", label: "Play-in bubble" }) });
    const hero = container.querySelector(".text-lg.font-bold.tracking-wide");
    const gradeSpan = hero?.querySelector("span");
    expect(gradeSpan?.className).toContain("text-amber-400");
  });

  it("D grade renders grade span in slate-400 text class", () => {
    const { container } = renderCard({ result: makeResult({ grade: "D", label: "Lottery team" }) });
    const hero = container.querySelector(".text-lg.font-bold.tracking-wide");
    const gradeSpan = hero?.querySelector("span");
    expect(gradeSpan?.className).toContain("text-slate-400");
  });

  it("F grade renders grade span in red-400 text class", () => {
    const { container } = renderCard({ result: makeResult({ grade: "F", label: "Winless" }) });
    const hero = container.querySelector(".text-lg.font-bold.tracking-wide");
    const gradeSpan = hero?.querySelector("span");
    expect(gradeSpan?.className).toContain("text-red-400");
  });

  it("does NOT show hints badge when usedHints is false/absent", () => {
    renderCard({ usedHints: false });
    expect(screen.queryByText(/Hints used/i)).toBeNull();
  });

  it("shows hints badge when usedHints is true", () => {
    renderCard({ usedHints: true });
    // The badge text is "💡 Hints used"
    const badge = screen.queryByText(/Hints used/i);
    expect(badge).toBeTruthy();
  });

  it("does NOT show PRIME badge when prime is absent", () => {
    renderCard({ prime: false });
    // "PRIME" is rendered as part of "⚡ PRIME" — check for the badge div
    const badge = screen.queryByTitle(/All-eras roster/i);
    expect(badge).toBeNull();
  });

  it("shows PRIME badge when prime is true", () => {
    const { container } = renderCard({ prime: true });
    // The PRIME badge has title="All-eras roster..."
    const badge = container.querySelector('[title="All-eras roster — every player at his statistical peak"]');
    expect(badge).toBeTruthy();
    expect(badge!.textContent).toContain("PRIME");
  });

  it("does NOT show factorHunt chip when factorHunt prop is absent", () => {
    renderCard();
    expect(screen.queryByText(/Called it/i)).toBeNull();
    expect(screen.queryByText(/You said.*it was/i)).toBeNull();
  });

  it("factorHunt correct branch: chip contains 'Called it' and the answer", () => {
    const { container } = renderCard({
      factorHunt: { prediction: "Star offense", answer: "Star offense", correct: true },
    });
    // The chip has title "Your pre-reveal prediction matched..."
    const chip = container.querySelector('[title="Your pre-reveal prediction matched the engine\'s verdict"]');
    expect(chip).toBeTruthy();
    expect(chip!.textContent).toContain("Called it");
    expect(chip!.textContent).toContain("Star offense");
  });

  it("factorHunt incorrect branch: chip shows 'You said ... it was ...'", () => {
    const { container } = renderCard({
      factorHunt: { prediction: "Spacing", answer: "Star offense", correct: false },
    });
    const chip = container.querySelector('[title="Your pre-reveal prediction missed"]');
    expect(chip).toBeTruthy();
    expect(chip!.textContent).toContain("You said Spacing");
    expect(chip!.textContent).toContain("it was Star offense");
  });

  it("renders notes when result has notes", () => {
    renderCard({
      result: makeResult({ notes: ["Missing rim protection — recommend a big"] }),
    });
    expect(screen.getByText("Missing rim protection — recommend a big")).toBeTruthy();
  });

  it("shows 'Build Another' reset button in non-shared mode", () => {
    renderCard({ shared: false });
    const btns = screen.getAllByRole("button", { name: /Build Another/i });
    expect(btns.length).toBeGreaterThan(0);
  });

  it("shows 'Build your own five' link in shared mode", () => {
    renderCard({ shared: true });
    const link = screen.getByRole("link", { name: /Build your own five/i });
    expect(link).toBeTruthy();
  });

  it("PickemStrip: solo vote 'yes' + hit shows 'you called it' verdict", () => {
    // wins=65 => hit (>60), vote=y (1 total) => solo=true, youRight=true
    renderCard({
      result: makeResult({ wins: 65, losses: 17 }),
      pickem: { y: 1, n: 0, vote: "y" },
    });
    // verdict text from PickemStrip
    const verdict = screen.getByText((content) => content.includes("you called it."));
    expect(verdict).toBeTruthy();
  });

  it("PickemStrip: user defied the crowd shows 'defied' in verdict", () => {
    // wins=40 (no hit, <=60), crowd=y (59 votes), user voted n => defied=true
    renderCard({
      result: makeResult({ wins: 40, losses: 42 }),
      pickem: { y: 59, n: 41, vote: "n" },
    });
    const verdict = screen.getByText((content) => content.includes("You defied the crowd."));
    expect(verdict).toBeTruthy();
  });

  it("PickemStrip: NOT rendered when pickem has no votes and no vote", () => {
    const { container } = renderCard({
      pickem: { y: 0, n: 0, vote: null },
    });
    // The PickemStrip renders a progress bar with role="img" aria-label="Crowd vote: ..."
    // only when v.total > 0. When hasPickem is false the entire strip is absent.
    const bar = container.querySelector('[role="img"][aria-label^="Crowd vote"]');
    expect(bar).toBeNull();
  });
});

// NOTE: this suite has no auto-cleanup between tests, so every assertion is scoped to the
// fresh render's container (document-global queries hit earlier tests' accumulated cards).
describe("ResultCard — context & explanation layer", () => {
  it("anchors the record to a famous real team for the win band", () => {
    const { container } = renderCard(); // wins=55 → 58-24 Spurs (2012-13)
    expect(container.textContent).toMatch(/Comparable to the 58-24 Spurs \(2012-13\)/i);
  });

  it("frames the record against the 41-win NBA average", () => {
    const { container } = renderCard(); // 55 - 41 = +14
    expect(container.textContent).toMatch(/\+14 wins above the 41-win NBA average/i);
  });

  it("uses singular 'win' at exactly one above the average", () => {
    const { container } = renderCard({ result: makeResult({ wins: 42, losses: 40, grade: "C", label: "Playoff team" }) });
    expect(container.textContent).toMatch(/\+1 win above the 41-win NBA average/i);
    expect(container.textContent).not.toMatch(/\+1 wins above/i);
  });

  it("below 42 wins: no anchor, framed below average instead", () => {
    const { container } = renderCard({ result: makeResult({ wins: 30, losses: 52, grade: "D", label: "Lottery team" }) });
    expect(container.textContent).not.toMatch(/Comparable to/i);
    expect(container.textContent).toMatch(/11 wins below the 41-win NBA average/i);
  });

  it("notes the verified draftable ceiling on elite results", () => {
    const { container } = renderCard({ result: makeResult({ wins: 74, losses: 8, grade: "A+", label: "HISTORIC" }) });
    expect(container.textContent).toMatch(/best draftable five projects 79-3/i);
  });

  it("at the draftable ceiling, the ladder says S is theoretical instead of taunting '1 win from S'", () => {
    const { container } = renderCard({ result: makeResult({ wins: 79, losses: 3, grade: "A+", label: "HISTORIC" }) });
    expect(container.textContent).toMatch(/S .*theoretical — no draftable five has reached it/i);
    expect(container.textContent).not.toMatch(/1 win from S/i);
  });

  it("renders the grade ladder with a next-grade hint when close", () => {
    const { container } = renderCard(); // wins=55: next boundary is B at 57 → "2 wins from B"
    expect(container.textContent).toMatch(/2 wins from B/i);
  });

  it("annotates priced factors with their exact win cost", () => {
    const { container } = renderCard({
      result: makeResult({
        factors: [
          { label: "Star offense", value: 5.1, kind: "good" },
          { label: "Usage overload (150% demand)", value: -8.8, kind: "bad", winsEst: -4 },
        ],
      }),
    });
    expect(container.textContent).toMatch(/~-4 wins/);
  });

  it("expands Star offense into per-player impact rows", () => {
    const { container } = renderCard();
    expect(container.textContent).toMatch(/Per-player impact/i);
    // Player PG: off 3.5 × 0.6178 = +2.2 on the offense disclosure
    expect(container.textContent).toContain("+2.2");
    // the not-a-career-grade caveat is present
    expect(container.textContent).toMatch(/not a career grade/i);
  });

  it("shows the leaderboard percentile pill for top-half daily ranks", () => {
    const { container } = renderCard({ lbRank: { rank: 7, total: 100 } });
    expect(container.textContent).toMatch(/Top 7% today/i);
  });

  it("falls back to plain rank for bottom-half results", () => {
    const { container } = renderCard({ lbRank: { rank: 80, total: 100 } });
    expect(container.textContent).toMatch(/#80 of 100 today/i);
  });

  it("hides the percentile pill on tiny boards", () => {
    const { container } = renderCard({ lbRank: { rank: 1, total: 5 } });
    expect(container.textContent).not.toMatch(/% today/i);
    expect(container.textContent).not.toMatch(/of 5 today/i);
  });
});
