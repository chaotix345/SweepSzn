import { describe, it, expect } from "vitest";
import { parseModeParam, DEEP_LINK_MODES } from "@/lib/modeParam";

describe("parseModeParam", () => {
  it("returns each deep-linkable mode unchanged", () => {
    for (const m of ["daily", "classic", "hoopiq", "factorhunt", "prime", "blueprint", "surgeon"]) {
      expect(parseModeParam(m)).toBe(m);
    }
  });

  it("rejects challenge — it needs a ?c=<id>, not a bare ?mode=", () => {
    expect(parseModeParam("challenge")).toBeNull();
  });

  it("rejects null / undefined / missing param (returns null, never undefined)", () => {
    expect(parseModeParam(null)).toBeNull();
    expect(parseModeParam(undefined)).toBeNull();
  });

  it("rejects the empty string", () => {
    expect(parseModeParam("")).toBeNull();
  });

  it("rejects unknown values", () => {
    expect(parseModeParam("xyz")).toBeNull();
    expect(parseModeParam("modeselect")).toBeNull();
  });

  it("is case-sensitive (mode keys are lowercase)", () => {
    expect(parseModeParam("Daily")).toBeNull();
    expect(parseModeParam("DAILY")).toBeNull();
    expect(parseModeParam("Classic")).toBeNull();
  });

  it("does not trim — surrounding whitespace is invalid", () => {
    expect(parseModeParam(" daily ")).toBeNull();
    expect(parseModeParam("daily ")).toBeNull();
  });

  it("DEEP_LINK_MODES is exactly the 7 non-challenge modes", () => {
    expect([...DEEP_LINK_MODES].sort()).toEqual(
      ["blueprint", "classic", "daily", "factorhunt", "hoopiq", "prime", "surgeon"].sort(),
    );
    expect(DEEP_LINK_MODES).not.toContain("challenge");
  });
});
