import { describe, it, expect } from "vitest";
import { onlyOpenSlot } from "./placement";
import type { Slot } from "./types";

const open = { PG: null, SG: null, SF: null, PF: null, C: null };
const cand = (eligible: Slot[]) => ({ eligible });

describe("onlyOpenSlot", () => {
  it("returns the slot when exactly one open slot fits", () => {
    expect(onlyOpenSlot(cand(["C"]), open)).toBe("C");
  });
  it("returns null when two or more open slots fit (two-step placement stays)", () => {
    expect(onlyOpenSlot(cand(["PF", "C"]), open)).toBeNull();
  });
  it("ignores filled slots", () => {
    expect(onlyOpenSlot(cand(["PF", "C"]), { ...open, C: { id: "x" } })).toBe("PF");
  });
  it("returns null when no open slot fits", () => {
    expect(onlyOpenSlot(cand(["C"]), { ...open, C: { id: "x" } })).toBeNull();
  });
});
