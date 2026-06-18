// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("./ev", () => ({ ev: vi.fn() }));

import { markFirstPlay } from "./firstPlay";
import { ev } from "./ev";

const evMock = vi.mocked(ev);

beforeEach(() => {
  evMock.mockClear();
  localStorage.clear();
  sessionStorage.clear();
});

describe("markFirstPlay", () => {
  it("emits first_play once with the uid on the first-ever call", () => {
    markFirstPlay("uid-abc");
    expect(evMock).toHaveBeenCalledTimes(1);
    expect(evMock).toHaveBeenCalledWith("first_play", { uid: "uid-abc" });
  });

  it("no-ops on subsequent calls (once per device, not per start)", () => {
    markFirstPlay("uid-abc");
    markFirstPlay("uid-abc");
    markFirstPlay("uid-abc");
    expect(evMock).toHaveBeenCalledTimes(1);
  });

  it("persists the gate in localStorage (survives session boundaries)", () => {
    markFirstPlay("uid-abc");
    expect(localStorage.getItem("szn:ev:fp")).toBe("1");
  });

  it("forwards a utm source to ev when provided (acquisition attribution)", () => {
    markFirstPlay("uid-abc", "x_launch");
    expect(evMock).toHaveBeenCalledWith("first_play", { uid: "uid-abc", source: "x_launch" });
  });

  it("omits the source key entirely when source is undefined (the ternary elides it, not source:undefined)", () => {
    markFirstPlay("uid-abc", undefined);
    expect(evMock).toHaveBeenCalledWith("first_play", expect.not.objectContaining({ source: expect.anything() }));
  });
});
