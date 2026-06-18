import { describe, it, expect } from "vitest";
import { showsSaveNudge } from "./signinNudge";

describe("showsSaveNudge", () => {
  it("shows for every non-daily mode (incl. the previously-uncovered fh/blueprint/surgeon/challenge)", () => {
    for (const m of ["classic", "hoopiq", "prime", "factorhunt", "blueprint", "surgeon", "challenge"] as const) {
      expect(showsSaveNudge(m)).toBe(true);
    }
  });

  it("does NOT show for daily — its Leaderboard already prompts sign-in (claim-your-rank)", () => {
    expect(showsSaveNudge("daily")).toBe(false);
  });
});
