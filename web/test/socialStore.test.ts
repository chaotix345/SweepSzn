import { describe, it, expect } from "vitest";
import { parseSlotPick, coreKeyOf, slotPickHashKey } from "@/lib/socialStore";

// Pure validation + key helpers for the silent crowd/rarity logging layer. The Redis writes
// themselves are exercised through the route tests (slot-pick + evaluate).
describe("parseSlotPick", () => {
  const ok = { mode: "classic", spinKey: "BOS|2010s", slot: "PG", personId: "isaiah_thomas" };
  it("accepts a well-formed beacon", () => {
    expect(parseSlotPick(ok)).toEqual(ok);
  });
  it("accepts a PRIME spin key", () => {
    expect(parseSlotPick({ ...ok, spinKey: "LAL|PRIME" })).not.toBeNull();
  });
  it("rejects an unknown mode", () => {
    expect(parseSlotPick({ ...ok, mode: "nope" })).toBeNull();
  });
  it("rejects a bad slot", () => {
    expect(parseSlotPick({ ...ok, slot: "XX" })).toBeNull();
  });
  it("rejects a malformed spin key", () => {
    expect(parseSlotPick({ ...ok, spinKey: "BOSTON 2010" })).toBeNull();
  });
  it("rejects a bad person id", () => {
    expect(parseSlotPick({ ...ok, personId: "Bad ID!" })).toBeNull();
  });
  it("rejects non-objects", () => {
    expect(parseSlotPick(null)).toBeNull();
    expect(parseSlotPick("x")).toBeNull();
  });
});

describe("coreKeyOf", () => {
  it("sorts person ids so slot order doesn't change the core's identity", () => {
    expect(coreKeyOf(["c", "a", "b"])).toBe("a,b,c");
    expect(coreKeyOf(["b", "c", "a"])).toBe(coreKeyOf(["a", "b", "c"]));
  });
});

describe("slotPickHashKey", () => {
  it("namespaces by mode, spin config, and slot", () => {
    expect(slotPickHashKey("classic", "BOS|2010s", "PG")).toBe("slot_picks:classic:BOS|2010s:PG");
  });
});
