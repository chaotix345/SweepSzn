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

  // An IPv6 client controls its whole /64: bucketing on the full address let it rotate the interface
  // id for a fresh rate-limit bucket per request. `::` compression must be expanded before truncating.
  it("buckets IPv6 on the /64 prefix (expanding :: compression first)", () => {
    const v6 = (ip: string) => ipOf(reqWith({ "x-real-ip": ip }));
    expect(v6("2001:db8::1")).toBe(v6("2001:db8::2"));
    expect(v6("2001:db8::1")).toBe(v6("2001:0db8:0000:0000:ffff:ffff:ffff:ffff"));
    expect(v6("2001:db8:0:1::1")).not.toBe(v6("2001:db8:0:2::1")); // a different /64 is a different bucket
    expect(v6("2001:db8:aa:bb:cc::1")).toBe(v6("2001:DB8:AA:BB::"));
    expect(v6("::1")).toBe(v6("::2"));
  });

  it("leaves IPv4 (and IPv4-mapped IPv6) per-address", () => {
    expect(ipOf(reqWith({ "x-real-ip": "1.2.3.4" }))).toBe("1.2.3.4");
    expect(ipOf(reqWith({ "x-real-ip": "::ffff:1.2.3.4" }))).toBe("1.2.3.4");
    expect(ipOf(reqWith({ "x-real-ip": "::ffff:1.2.3.4" }))).not.toBe(ipOf(reqWith({ "x-real-ip": "::ffff:1.2.3.5" })));
  });
});
