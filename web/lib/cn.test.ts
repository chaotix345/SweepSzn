import { describe, it, expect } from "vitest";
import { cn } from "./cn";

describe("cn", () => {
  it("drops falsy parts", () => {
    expect(cn("a", false, null, undefined, "b")).toBe("a b");
  });

  it("lets a later display utility override an earlier one (hidden beats the base inline-flex)", () => {
    expect(cn("inline-flex items-center", "hidden sm:inline-flex")).toBe("items-center hidden sm:inline-flex");
  });

  it("keeps the Arena theme tokens distinct from size/weight utilities", () => {
    expect(cn("text-sm", "text-gold")).toBe("text-sm text-gold");
    expect(cn("font-black", "font-display")).toBe("font-black font-display");
    expect(cn("bg-orange-500", "bg-action")).toBe("bg-action");
  });
});
