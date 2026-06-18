import { describe, it, expect } from "vitest";
import { cardImageUrl, encodeLineup, decodeShare, extractLineupSegment } from "@/lib/share";

describe("cardImageUrl — the attachable OG card PNG for a share path", () => {
  it("appends /opengraph-image to a result (/r/) share path", () => {
    expect(cardImageUrl("/r/abc,def")).toBe("/r/abc,def/opengraph-image");
  });
  it("works for a Pick'Em (/pe/) share path", () => {
    expect(cardImageUrl("/pe/xyz")).toBe("/pe/xyz/opengraph-image");
  });
  it("does not double the slash when the path already ends in one", () => {
    expect(cardImageUrl("/r/abc/")).toBe("/r/abc/opengraph-image");
  });
  it("derives from a real encoded lineup path round-trip", () => {
    const seg = encodeLineup(["a", "b", "c", "d", "e"]);
    const path = `/r/${seg}`;
    expect(decodeShare(seg).ids).toHaveLength(5);
    expect(cardImageUrl(path)).toBe(`${path}/opengraph-image`);
  });
});

describe("extractLineupSegment — pull a lineup segment out of a pasted friend link", () => {
  it("extracts the segment from a full /r/ share URL", () => {
    expect(extractLineupSegment("https://sweepszn.com/r/a,b,c,d,e")).toBe("a,b,c,d,e");
  });
  it("keeps the flag prefixes on the segment", () => {
    expect(extractLineupSegment("https://sweepszn.com/r/h~a,b,c,d,e")).toBe("h~a,b,c,d,e");
  });
  it("drops a trailing query string / hash", () => {
    expect(extractLineupSegment("https://sweepszn.com/r/a,b,c,d,e?utm=x")).toBe("a,b,c,d,e");
    expect(extractLineupSegment("/r/a,b,c,d,e#top")).toBe("a,b,c,d,e");
  });
  it("accepts a bare segment (no URL wrapper)", () => {
    expect(extractLineupSegment("  a,b,c,d,e  ")).toBe("a,b,c,d,e");
  });
  it("returns null for empty input", () => {
    expect(extractLineupSegment("")).toBeNull();
    expect(extractLineupSegment("   ")).toBeNull();
  });
});
