// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, fireEvent, cleanup } from "@testing-library/react";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@vercel/analytics", () => ({ track: vi.fn() }));
vi.mock("@/lib/ev", () => ({ ev: vi.fn() }));
vi.mock("@/lib/streak", () => ({ getUid: () => "uid-x" }));

import { track } from "@vercel/analytics";
import { ev } from "@/lib/ev";
import { WhatIfLab } from "@/components/game/WhatIfLab";
import type { Player, Slot } from "@/lib/types";

function makePlayers(): Player[] {
  return ["PG", "SG", "SF", "PF", "C"].map((pos, i) => ({
    id: `p${i}`, name: `Player ${pos}`, year: 1990 + i, decade: "1990s", tier: "complete",
    team: "CHI", pos: pos as Player["pos"], z: { pts: 1, trb: 1, ast: 1, stl: 0.5, blk: 0.5, ts: 1 },
  }));
}
const SLOTS = ["PG", "SG", "SF", "PF", "C"] as Slot[];

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("WhatIfLab — post-game swap-and-rescore", () => {
  it("fires whatif_open to BOTH Vercel track and the server funnel beacon on open", () => {
    const { getByRole } = render(
      <WhatIfLab players={makePlayers()} slots={SLOTS} baseWins={55} baseLosses={27} baseGrade="B" />,
    );
    fireEvent.click(getByRole("button", { name: /open the what-if lab/i }));
    expect(track).toHaveBeenCalledWith("whatif_open", expect.objectContaining({ grade: "B", wins: 55 }));
    expect(ev).toHaveBeenCalledWith("whatif_open", { uid: "uid-x" });
  });
});
