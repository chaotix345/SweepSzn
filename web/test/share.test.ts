import { describe, it, expect } from "vitest";
import { cardImageUrl, encodeLineup, decodeShare } from "@/lib/share";

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
