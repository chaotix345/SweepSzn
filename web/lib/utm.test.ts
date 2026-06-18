// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { currentUtmSource, captureUtm, getUtmSource } from "./utm";

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState({}, "", "/");
});

describe("currentUtmSource", () => {
  it("reads utm_source from the URL, lowercased", () => {
    window.history.replaceState({}, "", "/?utm_source=X_Launch");
    expect(currentUtmSource()).toBe("x_launch");
  });

  it("returns null when no utm_source is present", () => {
    window.history.replaceState({}, "", "/play?mode=daily");
    expect(currentUtmSource()).toBe(null);
  });

  it("rejects a value with disallowed characters (spaces)", () => {
    window.history.replaceState({}, "", "/?utm_source=" + encodeURIComponent("email blast"));
    expect(currentUtmSource()).toBe(null);
  });

  it("rejects an over-long value (>40 chars)", () => {
    window.history.replaceState({}, "", "/?utm_source=" + "a".repeat(41));
    expect(currentUtmSource()).toBe(null);
  });

  it("accepts dots, dashes, underscores", () => {
    window.history.replaceState({}, "", "/?utm_source=x.com_post-12");
    expect(currentUtmSource()).toBe("x.com_post-12");
  });
});

describe("captureUtm + getUtmSource", () => {
  it("first-touch: persists the URL source so a later read returns it", () => {
    window.history.replaceState({}, "", "/?utm_source=reddit");
    captureUtm();
    expect(getUtmSource()).toBe("reddit");
  });

  it("never overwrites an already-stored source (first channel wins)", () => {
    window.history.replaceState({}, "", "/?utm_source=reddit");
    captureUtm();
    window.history.replaceState({}, "", "/?utm_source=newsletter");
    captureUtm();
    expect(getUtmSource()).toBe("reddit");
  });

  it("no-ops when the URL carries no utm_source", () => {
    window.history.replaceState({}, "", "/");
    captureUtm();
    expect(getUtmSource()).toBe(null);
  });

  it("getUtmSource returns null when nothing has been captured", () => {
    expect(getUtmSource()).toBe(null);
  });

  it("getUtmSource re-sanitizes on read: a tampered/invalid stored value returns null", () => {
    localStorage.setItem("szn:utm:source", "bad value!");
    expect(getUtmSource()).toBe(null);
  });

  it("first-touch is locked even by a corrupt stored value — a new valid URL source can't overwrite", () => {
    localStorage.setItem("szn:utm:source", "bad value!");
    window.history.replaceState({}, "", "/?utm_source=newsletter");
    captureUtm();
    expect(getUtmSource()).toBe(null); // the slot is occupied (raw guard); first channel still wins
  });

  it("currentUtmSource returns null for a present-but-empty ?utm_source=", () => {
    window.history.replaceState({}, "", "/?utm_source=");
    expect(currentUtmSource()).toBe(null);
  });
});
