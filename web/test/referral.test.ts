// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { currentRefCode, getRefCode, captureRef, getOwnRefCode, setOwnRefCode } from "@/lib/referral";

const setUrl = (search: string) => window.history.replaceState(null, "", search ? `/?${search}` : "/");

beforeEach(() => {
  localStorage.clear();
  setUrl("");
});

// Mirrors lib/utm.ts: first-touch capture of an inbound referral code so a /?ref= landing → a clean
// /play navigation still attributes the eventual first_play. All values REF_RE-bounded before storage.
describe("lib/referral inbound capture", () => {
  it("currentRefCode reads a valid ?ref= from the URL", () => {
    setUrl("ref=rabc123def45");
    expect(currentRefCode()).toBe("rabc123def45");
  });

  it("currentRefCode rejects a malformed ref", () => {
    setUrl("ref=NOTACODE");
    expect(currentRefCode()).toBeNull();
    setUrl("ref=r123"); // too short
    expect(currentRefCode()).toBeNull();
  });

  it("captureRef first-touches the inbound code (first channel wins)", () => {
    setUrl("ref=raaaaaaaaaaa");
    captureRef();
    setUrl("ref=rbbbbbbbbbbb");
    captureRef();
    expect(getRefCode()).toBe("raaaaaaaaaaa");
  });

  it("captureRef ignores a junk ref so garbage never persists", () => {
    setUrl("ref=DROPTABLE");
    captureRef();
    expect(getRefCode()).toBeNull();
  });

  it("own-code cache round-trips and validates", () => {
    setOwnRefCode("rdeadbeef012");
    expect(getOwnRefCode()).toBe("rdeadbeef012");
    setOwnRefCode("bad"); // rejected — stays unchanged
    expect(getOwnRefCode()).toBe("rdeadbeef012");
  });
});
