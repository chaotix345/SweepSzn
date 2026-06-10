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
