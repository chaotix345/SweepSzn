// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { once } from "./once";

describe("once", () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it("device scope: true the first time, false after", () => {
    expect(once("device", "k")).toBe(true);
    expect(once("device", "k")).toBe(false);
    expect(once("device", "k")).toBe(false);
  });

  it("session scope: true the first time, false after", () => {
    expect(once("session", "k")).toBe(true);
    expect(once("session", "k")).toBe(false);
  });

  it("device persists in localStorage, session in sessionStorage", () => {
    once("device", "d");
    once("session", "s");
    expect(localStorage.getItem("d")).toBe("1");
    expect(sessionStorage.getItem("s")).toBe("1");
    expect(localStorage.getItem("s")).toBe(null);
    expect(sessionStorage.getItem("d")).toBe(null);
  });

  it("device and session are independent stores for the same key", () => {
    expect(once("device", "k")).toBe(true);
    expect(once("session", "k")).toBe(true);
  });

  it("distinct keys do not collide", () => {
    expect(once("device", "a")).toBe(true);
    expect(once("device", "b")).toBe(true);
  });

  describe("storage blocked", () => {
    let orig: typeof Storage.prototype.getItem;
    beforeEach(() => {
      orig = Storage.prototype.getItem;
      Storage.prototype.getItem = () => {
        throw new Error("blocked");
      };
    });
    afterEach(() => {
      Storage.prototype.getItem = orig;
    });

    it("emits the signal rather than suppressing it (returns true)", () => {
      expect(once("device", "x")).toBe(true);
    });
  });

  describe("write blocked (quota / private mode — the real incognito path)", () => {
    let orig: typeof Storage.prototype.setItem;
    beforeEach(() => {
      orig = Storage.prototype.setItem;
      Storage.prototype.setItem = () => {
        throw new DOMException("QuotaExceededError");
      };
    });
    afterEach(() => {
      Storage.prototype.setItem = orig;
    });

    it("emits once per page-load via the in-memory fallback, NOT on every call", () => {
      // The persisted gate can never be written, so without the fallback this would fire forever
      // (collapsing first_play into a per-start signal). Use a unique key to avoid cross-test memo.
      expect(once("device", "quota-key-1")).toBe(true);
      expect(once("device", "quota-key-1")).toBe(false);
      expect(once("device", "quota-key-1")).toBe(false);
    });
  });
});
