import { describe, it, expect } from "vitest";
import { ipOf } from "@/lib/redis";

const reqWith = (headers: Record<string, string>) => new Request("https://x.test", { headers });

describe("ipOf", () => {
  it("prefers x-real-ip (Vercel-set, not client-spoofable) over x-forwarded-for", () => {
    // A client can prepend a forged entry to x-forwarded-for; x-real-ip is set by Vercel's edge.
    expect(ipOf(reqWith({ "x-real-ip": "9.9.9.9", "x-forwarded-for": "1.1.1.1, 2.2.2.2" }))).toBe("9.9.9.9");
  });

  it("falls back to the leftmost x-forwarded-for when x-real-ip is absent", () => {
    expect(ipOf(reqWith({ "x-forwarded-for": "1.1.1.1, 2.2.2.2" }))).toBe("1.1.1.1");
  });

  it("falls back to 'anon' when no ip headers are present", () => {
    expect(ipOf(reqWith({}))).toBe("anon");
  });
});
