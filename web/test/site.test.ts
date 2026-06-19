import { describe, it, expect } from "vitest";
import { X_HANDLE, X_URL, SITE_NAME } from "@/lib/site";

// Single source of truth for the brand's X handle/URL — consolidated so a handle change is one edit
// (previously hardcoded across the root layout, 8 permalink twitter blocks, 3 share-text builders,
// the footer, and the JSON-LD sameAs).
describe("site brand constants", () => {
  it("exposes the canonical X handle", () => {
    expect(X_HANDLE).toBe("@SweepSeason");
  });

  it("exposes the canonical X profile URL", () => {
    expect(X_URL).toBe("https://x.com/SweepSeason");
  });

  it("the handle is the @-prefixed form of the URL's path segment", () => {
    expect(X_HANDLE).toBe("@" + X_URL.split("/").pop());
  });

  it("keeps the existing site name", () => {
    expect(SITE_NAME).toBe("SweepSzn");
  });
});
