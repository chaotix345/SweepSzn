import { describe, it, expect } from "vitest";
import { GRADE_COLOR, GRADE_HEX, gradeColor, gradeHex, isEliteGrade } from "@/lib/grades";

const GRADES = ["S", "A+", "A", "B", "C", "D", "F"];

describe("grades", () => {
  it("maps the elite tier (S / A+) to gold in both class and hex form", () => {
    expect(GRADE_COLOR.S).toBe("text-gold");
    expect(GRADE_COLOR["A+"]).toBe("text-gold");
    expect(GRADE_HEX.S).toBe("#ffc53d");
    expect(GRADE_HEX["A+"]).toBe("#ffc53d");
  });

  it("covers every grade in both maps", () => {
    for (const g of GRADES) {
      expect(GRADE_COLOR[g]).toBeTruthy();
      expect(GRADE_HEX[g]).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("falls back to neutral for unknown grades", () => {
    expect(gradeColor("Z")).toBe("text-zinc-300");
    expect(gradeHex("Z")).toBe("#e4e4e7");
  });

  it("flags only S and A+ as elite", () => {
    expect(isEliteGrade("S")).toBe(true);
    expect(isEliteGrade("A+")).toBe(true);
    expect(isEliteGrade("A")).toBe(false);
    expect(isEliteGrade("F")).toBe(false);
  });
});
