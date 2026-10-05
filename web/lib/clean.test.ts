import { describe, it, expect } from "vitest";
import { cleanName } from "./clean";

// Right-to-left override and other bidi/zero-width code points built from char codes
// (not literal glyphs) so the source stays plain ASCII — mirrors clean.ts convention.
const RLO = String.fromCharCode(0x202e);   // right-to-left override
const ZW = String.fromCharCode(0x200b);    // zero-width space
const BOM = String.fromCharCode(0xfeff);   // BOM / ZWNBSP
const BELL = String.fromCharCode(0x07);    // C0 control
const ISO = String.fromCharCode(0x2066);   // directional isolate

describe("cleanName", () => {
  it("trims surrounding whitespace", () => {
    expect(cleanName("  Charlie  ")).toBe("Charlie");
  });

  it("caps at 24 chars", () => {
    expect(cleanName("x".repeat(40))).toBe("x".repeat(24));
  });

  it("strips RTL override", () => {
    expect(cleanName("Bob" + RLO + "evil")).toBe("Bobevil");
  });

  it("strips zero-width space", () => {
    expect(cleanName("zero" + ZW + "width")).toBe("zerowidth");
  });

  it("strips C0 control chars", () => {
    expect(cleanName("ctrl" + BELL + "bell")).toBe("ctrlbell");
  });

  it("strips BOM/ZWNBSP", () => {
    expect(cleanName(BOM + "LeBron")).toBe("LeBron");
  });

  it("strips directional isolates", () => {
    expect(cleanName("a" + ISO + "b")).toBe("ab");
  });

  it("strips invisible operators / word joiner (U+2060-2064), ALM, and MVS", () => {
    for (const cp of [0x2060, 0x2061, 0x2062, 0x2063, 0x2064, 0x061c, 0x180e]) {
      expect(cleanName("a" + String.fromCharCode(cp) + "b")).toBe("ab");
    }
  });

  it("strips Hangul fillers (blank-looking names collapse to empty)", () => {
    for (const cp of [0x3164, 0x115f, 0x1160, 0xffa0]) {
      expect(cleanName(String.fromCharCode(cp).repeat(3))).toBe("");
    }
  });

  it("caps by code point, never splitting a surrogate pair", () => {
    const E = String.fromCodePoint(0x1f3c0); // basketball (astral, 2 UTF-16 units)
    const out = cleanName("x" + E.repeat(30));
    expect(out).toBe("x" + E.repeat(23));
    expect(out.isWellFormed()).toBe(true);
  });

  it("leaves normal names intact", () => {
    expect(cleanName("normal name")).toBe("normal name");
  });

  it("keeps accented letters (only control/bidi stripped)", () => {
    expect(cleanName("Dončić")).toBe("Dončić");
  });

  it("non-string -> empty", () => {
    expect(cleanName(123 as unknown)).toBe("");
  });

  it("null -> empty", () => {
    expect(cleanName(null)).toBe("");
  });
});
