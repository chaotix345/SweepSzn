import { describe, it, expect } from "vitest";
import { cardImageUrl, encodeLineup, decodeShare, extractLineupSegment, encodeDexShare, decodeDexShare } from "@/lib/share";

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

describe("dex share card — encode/decode the 'Share your Dex' payload", () => {
  it("round-trips top ids + the collection/badge counts", () => {
    const seg = encodeDexShare(["jordan_chi_1988", "lebron_cle_2009"], 47, 6);
    expect(decodeDexShare(seg)).toEqual({ ids: ["jordan_chi_1988", "lebron_cle_2009"], count: 47, badges: 6 });
  });
  it("caps the id list so the URL stays bounded", () => {
    const many = Array.from({ length: 20 }, (_, i) => `p${i}`);
    expect(decodeDexShare(encodeDexShare(many, 100, 10))!.ids.length).toBe(12);
  });
  it("returns null for a malformed card", () => {
    expect(decodeDexShare("garbage")).toBeNull();
    expect(decodeDexShare("47.6~")).toBeNull();
    expect(decodeDexShare("")).toBeNull();
  });
});
