// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, within, act } from "@testing-library/react";
import React from "react";
import { renderToString } from "react-dom/server";
import { hydrateRoot } from "react-dom/client";

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
import ResultCard, { ShareButton, SaveCardImage } from "@/components/ResultCard";
import { headline } from "@/lib/explain";
import { historyRank } from "@/lib/historyPercentile";
import { track } from "@vercel/analytics";
import { ev } from "@/lib/ev";
import type { LineupResult, Player, Slot } from "@/lib/types";
import type { BlueprintView } from "@/lib/blueprint";

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

  it("shows 'Build your own five' link in shared mode, deep-linking the cold viewer into Daily", () => {
    const { container } = renderCard({ shared: true });
    // scoped to this render's container — the block has no afterEach(cleanup) (see note below)
    const link = within(container).getByRole("link", { name: /Build your own five/i });
    expect(link).toBeTruthy();
    // skip the mode-select wall — the cold permalink viewer's first play is the conversion that matters
    expect(link.getAttribute("href")).toBe("/play?mode=daily");
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
    expect(container.textContent).toMatch(/best draftable five projects 80-2/i);
  });

  // D10: under engine v4 the best draftable five is 80-2, so S is reachable — the ladder must not
  // call it theoretical or unreachable.
  it("one win short of S, the ladder names the real 80-2 ceiling instead of calling S unreachable", () => {
    const { container } = renderCard({ result: makeResult({ wins: 79, losses: 3, grade: "A+", label: "HISTORIC" }) });
    expect(container.textContent).toMatch(/1 win from S \(PERFECT\)/);
    expect(container.textContent).toMatch(/best draftable five goes 80-2/i);
    expect(container.textContent).not.toMatch(/theoretical|unreachable|no draftable five/i);
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
    // Player PG: off 3.5 × 0.8934 = +3.1 on the offense disclosure
    expect(container.textContent).toContain("+3.1");
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

  it("flags the lowest-value slot gradelessly — names the slot, not the player or a number (R5)", () => {
    // In the fixture SG has the lowest offScale*off + defScale*def, so it's the weakest slot.
    const { container } = renderCard();
    expect(container.textContent).toMatch(/lowest-value pick/i);
    expect(container.textContent).toMatch(/your SG/i);
    // it must NOT leak the player's name or a fit/value number for that slot
    expect(container.textContent).not.toMatch(/Player SG (added|was).*\d/i);
  });
});

describe("ResultCard — one-tap share CTAs", () => {
  it("renders inline X and Bluesky share links next to Share", () => {
    const { container } = renderCard();
    expect(container.querySelector('a[aria-label="Post to X"]')).toBeTruthy();
    expect(container.querySelector('a[aria-label="Post to Bluesky"]')).toBeTruthy();
  });

  it("the X link points at X and the Bluesky link points at Bluesky (guards the links[] order)", () => {
    const { container } = renderCard();
    const x = container.querySelector('a[aria-label="Post to X"]')?.getAttribute("href") ?? "";
    const bsky = container.querySelector('a[aria-label="Post to Bluesky"]')?.getAttribute("href") ?? "";
    expect(x).toContain("twitter.com/intent/tweet");
    expect(bsky).toContain("bsky.app/intent/compose");
    // each carries the encoded share URL back to the result permalink
    expect(decodeURIComponent(x)).toContain("/r/");
    expect(decodeURIComponent(bsky)).toContain("/r/");
  });

  // Voice discipline (X content plan): the account posts with NO hashtags, so a user-shared
  // result must not auto-append them to the tweet.
  it("the X intent href does NOT append hashtags", () => {
    const { container } = renderCard();
    const x = container.querySelector('a[aria-label="Post to X"]')?.getAttribute("href") ?? "";
    expect(x).not.toContain("hashtags=");
  });

  // Growth loop: every share must credit the @SweepSeason account so a cold viewer who sees a
  // shared result can find and follow the source — at launch this is the whole word-of-mouth loop.
  it("the X intent text credits the @SweepSeason account", () => {
    const { container } = renderCard();
    const x = container.querySelector('a[aria-label="Post to X"]')?.getAttribute("href") ?? "";
    expect(decodeURIComponent(x)).toContain("via @SweepSeason");
  });

  it("non-X shares (Bluesky) also credit @SweepSeason", () => {
    const { container } = renderCard();
    const bsky = container.querySelector('a[aria-label="Post to Bluesky"]')?.getAttribute("href") ?? "";
    expect(decodeURIComponent(bsky)).toContain("via @SweepSeason");
  });

  it("the pick'em defy-the-crowd share still credits @SweepSeason", () => {
    const { container } = renderCard({
      result: makeResult({ wins: 40, losses: 42 }),
      pickem: { y: 59, n: 41, vote: "n" },
    });
    const x = container.querySelector('a[aria-label="Post to X"]')?.getAttribute("href") ?? "";
    expect(decodeURIComponent(x)).toContain("via @SweepSeason");
  });
});

describe("ShareButton — attribution on the override & blueprint paths", () => {
  // Surgeon reuses ShareButton via a full `text` override — the credit must still be appended.
  it("the Surgeon override share (textOverride) still credits @SweepSeason", () => {
    const { container } = render(
      <ShareButton
        result={makeResult()}
        path="/sg/abc"
        names={["Player A", "Player B"]}
        text="One swap, +12 wins — 30-52 → 42-40 on today's SweepSzn Surgeon (diagnosis: Rim Protection Gap). Can you out-operate me?"
      />,
    );
    const x = container.querySelector('a[aria-label="Post to X"]')?.getAttribute("href") ?? "";
    expect(decodeURIComponent(x)).toContain("Can you out-operate me? via @SweepSeason");
  });

  it("the blueprint share credits @SweepSeason", () => {
    const blueprint: BlueprintView = {
      key: "spacing", label: "SPACING BOMB", metric: 12, metricLabel: "3PA",
      metricText: "12 3PA", grade: "A", mult: 1.2, score: 66,
    };
    const { container } = render(
      <ShareButton result={makeResult()} path="/r/x" names={["Player A", "Player B"]} blueprint={blueprint} />,
    );
    const x = container.querySelector('a[aria-label="Post to X"]')?.getAttribute("href") ?? "";
    expect(decodeURIComponent(x)).toContain("I went SPACING BOMB on SweepSzn");
    expect(decodeURIComponent(x)).toContain("via @SweepSeason");
  });
});

describe("ShareButton — every share doubles as a referral link", () => {
  afterEach(() => localStorage.removeItem("szn:ref:code"));

  it("appends the sharer's referral code to the share URL when one is cached", () => {
    localStorage.setItem("szn:ref:code", "rabc123def45");
    const { container } = render(<ShareButton result={makeResult()} path="/r/x" names={["A", "B"]} />);
    const x = container.querySelector('a[aria-label="Post to X"]')?.getAttribute("href") ?? "";
    expect(decodeURIComponent(x)).toContain("ref=rabc123def45");
  });

  it("leaves the share URL unchanged when no referral code is cached", () => {
    localStorage.removeItem("szn:ref:code");
    const { container } = render(<ShareButton result={makeResult()} path="/r/x" names={["A", "B"]} />);
    const x = container.querySelector('a[aria-label="Post to X"]')?.getAttribute("href") ?? "";
    expect(decodeURIComponent(x)).not.toContain("ref=");
  });
});

describe("ResultCard — shareable card image (screenshots are the product)", () => {
  it("renders a 'Save card image' button so the OG card can be attached, not just linked", () => {
    const { container } = renderCard();
    expect(container.querySelector('button[aria-label="Save card image"]')).toBeTruthy();
  });
});

// Result-card diet: the deep analytical tools (roster dossiers, Scouting, What-If, Compare) live in one
// collapsed "Dig deeper" zone BELOW the Share CTA. The zone is lazy-mounted.
function openExplore(container: HTMLElement) {
  fireEvent.click(within(container).getByRole("button", { name: /dig deeper/i }));
}

describe("ResultCard — scouting anchor (now inside the Explore zone, below Share)", () => {
  it("reveals the matched real team's actual ORtg/DRtg/Net once the Explore zone is opened (55-win result)", () => {
    const { container } = renderCard(); // wins=55 → 58-24 Spurs (ORtg 108.3, DRtg 101.6, Net +6.7)
    // collapsed + lazy: not present until the user opts in
    expect(container.textContent).not.toMatch(/Scouting report/i);
    openExplore(container);
    expect(container.textContent).toMatch(/Scouting report/i);
    expect(container.textContent).toContain("101.6"); // Spurs DRtg — appears only in the scouting block
    expect(container.textContent).toContain("+6.7");   // Spurs Net
  });

  it("omits the scouting report below the 42-win anchor floor even with the Explore zone open", () => {
    const { container } = renderCard({ result: makeResult({ wins: 30, losses: 52, grade: "D", label: "Lottery team" }) });
    openExplore(container);
    expect(container.textContent).not.toMatch(/Scouting report/i);
  });
});

describe("ResultCard — share-first sequencing (deep tools disclosed below Share)", () => {
  it("keeps the deep tools collapsed by default — What-If / Compare / Scouting are not mounted", () => {
    const { container } = renderCard();
    expect(container.textContent).not.toMatch(/Open the What-If Lab/i);
    expect(container.textContent).not.toMatch(/Compare lineup/i);
    expect(container.textContent).not.toMatch(/Scouting report/i);
    const toggle = within(container).getByRole("button", { name: /dig deeper/i });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });

  it("reveals the What-If Lab and Compare tools when the Explore zone is opened", () => {
    const { container } = renderCard();
    openExplore(container);
    expect(container.textContent).toMatch(/Open the What-If Lab/i);
    expect(container.textContent).toMatch(/Compare lineup/i);
  });

  it("places the primary Share affordance ABOVE the Explore zone (the growth loop is not buried)", () => {
    const { container } = renderCard();
    const share = container.querySelector('a[aria-label="Post to X"]')!;
    const explore = within(container).getByRole("button", { name: /dig deeper/i });
    // Node.DOCUMENT_POSITION_FOLLOWING (4) set => explore comes AFTER share in document order
    expect(share.compareDocumentPosition(explore) & 4).toBeTruthy();
  });

  it("fires an explore_open analytics event carrying the result grade when the zone opens", () => {
    const { container } = renderCard();
    openExplore(container);
    expect(track).toHaveBeenCalledWith("explore_open", expect.objectContaining({ grade: "A" }));
    // dual-fire to the server-side funnel beacon so /admin + /api/funnel see deep-tool engagement
    expect(ev).toHaveBeenCalledWith("explore_open", { uid: "test-uid" });
  });

  it("gates the What-If Lab out of the Explore zone in Prime (peak-era pools wouldn't match the spun era)", () => {
    const { container } = renderCard({ prime: true, mode: "Prime Draft" });
    openExplore(container);
    expect(container.textContent).not.toMatch(/Open the What-If Lab/i);
    expect(container.textContent).toMatch(/Compare lineup/i); // Compare is still offered in Prime
  });
});

describe("ResultCard — result-card diet (above the fold)", () => {
  it("orders record → grade → verdict → Share → Play again before any analysis", () => {
    const { container } = renderCard();
    const text = container.textContent ?? "";
    const at = (re: RegExp) => text.search(re);
    const record = at(/55–27/), verdict = text.indexOf(headline(makeResult()));
    const share = container.querySelector('a[aria-label="Post to X"]')!;
    const again = within(container).getByRole("button", { name: /build another/i });
    const why = within(container).getByText(/why this record/i);
    expect(record).toBeGreaterThanOrEqual(0);
    expect(verdict).toBeGreaterThan(record);
    expect(share.compareDocumentPosition(why) & 4).toBeTruthy();   // Share precedes the analysis
    expect(again.compareDocumentPosition(why) & 4).toBeTruthy();   // so does Play again
  });
});

describe("ResultCard — roster-row player dossier (descriptive, post-commit §12)", () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  it("keeps the dossier roster behind Dig deeper, with the five still named above the fold", () => {
    const { container } = renderCard();
    expect(container.querySelectorAll('button[aria-label$=" details"]').length).toBe(0);
    expect(container.textContent).toMatch(/Your starting five/);
  });

  it("exposes a player-details toggle on every starting-five row", () => {
    const { container } = renderCard();
    openExplore(container);
    const toggles = container.querySelectorAll('button[aria-label$=" details"]');
    expect(toggles.length).toBe(5);
  });

  it("clicking a row's toggle mounts that player's dossier (descriptive identity card)", () => {
    // never-resolving fetch holds the dossier in its loading state (and silences RarityBadge/DexStrip)
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    const { container } = renderCard();
    openExplore(container);
    const toggle = container.querySelector('button[aria-label="Show Player PG details"]') as HTMLButtonElement;
    expect(toggle).toBeTruthy();
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(toggle);
    expect(container.querySelector('button[aria-label="Hide Player PG details"]')).toBeTruthy();
    expect(container.textContent).toMatch(/Loading…/);
  });
});

describe("ResultCard — shared-permalink CTA hierarchy (cold-viewer conversion)", () => {
  // On a shared /r/·/pe/ permalink the dominant audience is cold viewers, not the sharer — so the
  // emphasized (primary orange) action must be "build your own", and Share drops to secondary.
  it("on a shared permalink, 'Build your own five' is the primary orange CTA and Share is secondary", () => {
    const { container } = renderCard({ shared: true });
    const build = within(container).getByRole("link", { name: /Build your own five/i });
    expect(build.className).toContain("bg-orange-500");
    const share = within(container).getByRole("button", { name: /^(Share|Copied!|Copy failed)$/ });
    expect(share.className).not.toContain("bg-orange-500");
    expect(share.className).toContain("border-zinc-700");
  });

  // In-game (non-shared) the sharer's growth action is Share — it must STAY the primary orange CTA.
  it("in-game (non-shared), Share stays the primary orange CTA and 'Build Another' is secondary", () => {
    const { container } = renderCard({ shared: false });
    const share = within(container).getByRole("button", { name: /^(Share|Copied!|Copy failed)$/ });
    expect(share.className).toContain("bg-orange-500");
    // the other half of the one-orange-per-row rule: Build Another must NOT be orange
    const buildAnother = within(container).getByRole("button", { name: /Build Another/i });
    expect(buildAnother.className).not.toContain("bg-orange-500");
  });
});

describe("ShareButton — the client share URL wins after hydration (SSR'd /r/, /pe/, /sg/ permalinks)", () => {
  afterEach(() => { localStorage.removeItem("szn:ref:code"); document.body.innerHTML = ""; });

  it("a hydrated X/Bluesky link carries the absolute URL + the sharer's ref, not the server's bare path", async () => {
    const el = <ShareButton result={makeResult()} path="/r/x" names={["A", "B"]} />;
    // the server render: no window (a real Node SSR pass)
    vi.stubGlobal("window", undefined);
    let html: string;
    try { html = renderToString(el); } finally { vi.unstubAllGlobals(); }
    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.appendChild(container);
    localStorage.setItem("szn:ref:code", "rabc123def45");
    let root: ReturnType<typeof hydrateRoot> | undefined;
    await act(async () => { root = hydrateRoot(container, el); });
    const abs = encodeURIComponent(`${window.location.origin}/r/x?ref=rabc123def45`);
    const x = container.querySelector('a[aria-label="Post to X"]')?.getAttribute("href") ?? "";
    const bsky = container.querySelector('a[aria-label="Post to Bluesky"]')?.getAttribute("href") ?? "";
    expect(x).toContain(`url=${abs}`);
    expect(bsky).toContain(abs);
    await act(async () => { root?.unmount(); });
  });
});

describe("ResultCard — accuracy receipts link", () => {
  it("links quietly to the public receipts", () => {
    renderCard();
    const a = screen.getByText("How accurate is this?").closest("a");
    expect(a?.getAttribute("href")).toBe("/how-it-works#receipts");
  });
});

describe("ResultCard — measured against history (W2, D7)", () => {
  it("shows one history line: the percentile vs real teams since 1985 beside the closest famous team", () => {
    const { container } = renderCard(); // wins=55
    const pct = historyRank(55).pct;
    expect(container.textContent).toContain(`Beats ${pct}% of real NBA teams since 1985 · comparable to the 58-24 Spurs (2012-13)`);
  });

  it("below the anchor bands the percentile still shows on its own", () => {
    const { container } = renderCard({ result: makeResult({ wins: 30, losses: 52, grade: "D", label: "Lottery team" }) });
    expect(container.textContent).toContain(`Beats ${historyRank(30).pct}% of real NBA teams since 1985.`);
  });

  it("never says 100%: beating every team says so", () => {
    const { container } = renderCard({ result: makeResult({ wins: 78, losses: 4, grade: "A+", label: "HISTORIC" }) });
    expect(container.textContent).toContain("Better than every real team since 1985");
    expect(container.textContent).not.toMatch(/100%/);
  });

  it("is on shared permalinks too", () => {
    const { container } = renderCard({ shared: true });
    expect(container.textContent).toMatch(/of real NBA teams since 1985/);
  });
});

describe("ResultCard — Daily ceiling gap (W2)", () => {
  const gap = (c: HTMLElement) => c.querySelector('[data-testid="ceiling-gap"]');

  it("is absent unless the server sent today's ceiling", () => {
    const { container } = renderCard();
    expect(gap(container)).toBeNull();
    expect(container.textContent).not.toMatch(/perfect five/i);
  });

  it("names the gap and the record", () => {
    const { container } = renderCard({ ceiling: { wins: 62, losses: 20 } }); // result 55
    expect(gap(container)!.textContent).toContain("You're 7 wins off today's perfect five (62-20)");
    const one = renderCard({ ceiling: { wins: 56, losses: 26 } });
    expect(gap(one.container)!.textContent).toContain("You're 1 win off today's perfect five (56-26)");
  });

  it("a match and a re-spin overshoot read as such", () => {
    expect(gap(renderCard({ ceiling: { wins: 55, losses: 27 } }).container)!.textContent).toContain("You matched today's perfect five (55-27)");
    expect(gap(renderCard({ ceiling: { wins: 52, losses: 30 } }).container)!.textContent).toContain("Your re-spins beat today's perfect five (52-30)");
  });

  it("sits above the fold, before Share", () => {
    const { container } = renderCard({ ceiling: { wins: 62, losses: 20 } });
    const share = container.querySelector('a[aria-label="Post to X"]')!;
    expect(gap(container)!.compareDocumentPosition(share) & 4).toBeTruthy();
  });
});

describe("SaveCardImage — hydrates cleanly where the browser can copy images", () => {
  afterEach(() => { vi.unstubAllGlobals(); document.body.innerHTML = ""; });

  it("server HTML has no Copy button; it appears after hydration without a mismatch", async () => {
    const el = <SaveCardImage path="/r/x" />;
    vi.stubGlobal("window", undefined);
    let html: string;
    try { html = renderToString(el); } finally { vi.unstubAllGlobals(); }
    expect(html).not.toContain("Copy");
    vi.stubGlobal("ClipboardItem", class {});
    Object.defineProperty(navigator, "clipboard", { value: { write: vi.fn(), writeText: vi.fn() }, configurable: true });
    const container = document.createElement("div");
    container.innerHTML = html;
    document.body.appendChild(container);
    const onRecoverableError = vi.fn();
    let root: ReturnType<typeof hydrateRoot> | undefined;
    await act(async () => { root = hydrateRoot(container, el, { onRecoverableError }); });
    expect(onRecoverableError).not.toHaveBeenCalled();
    expect(container.querySelector('button[aria-label="Copy card image to clipboard"]')).not.toBeNull();
    await act(async () => { root?.unmount(); });
  });
});

// W3: an archive replay is unranked and never feeds the Dex, so the card must not show (or fetch) the
// "every player you field is saved" strip; it renders the come-back / reveal slot under Share instead.
describe("ResultCard — W3 archive replay and the afterActions slot", () => {
  afterEach(() => vi.unstubAllGlobals());
  const dexCalls = (f: ReturnType<typeof vi.fn>) => f.mock.calls.filter(([u]) => String(u).startsWith("/api/dex")).length;

  it("skips the Dex strip for an archive replay, keeps it otherwise", async () => {
    for (const [modeKey, expected] of [["archive", 0], ["daily", 1]] as const) {
      const f = vi.fn(() => new Promise(() => {}));
      vi.stubGlobal("fetch", f);
      const { unmount } = render(<ResultCard result={makeResult()} players={makePlayers()} slots={SLOTS} mode="x" modeKey={modeKey} onReset={() => {}} />);
      await act(async () => {});
      expect(dexCalls(f)).toBe(expected);
      unmount();
    }
  });

  it("renders afterActions right under Share / Build Another", () => {
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    const { container } = render(<ResultCard result={makeResult()} players={makePlayers()} slots={SLOTS} mode="daily" modeKey="daily" onReset={() => {}}
      afterActions={<div data-testid="after">come back</div>} />);
    const text = container.textContent ?? "";
    const after = text.indexOf("come back");
    expect(after).toBeGreaterThan(text.indexOf("Build Another"));
    expect(after).toBeLessThan(text.indexOf("Beats"));
  });
});
