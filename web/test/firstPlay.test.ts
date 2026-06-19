// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/ev", () => ({ ev: vi.fn() }));

import { markFirstPlay } from "@/lib/firstPlay";
import { ev } from "@/lib/ev";

const evMock = vi.mocked(ev);

beforeEach(() => {
  evMock.mockClear();
  localStorage.clear();
});

describe("markFirstPlay", () => {
  it("forwards source and ref on the first_play beacon", () => {
    markFirstPlay("uid-abc12345", "x_launch", "rabc123def45");
    expect(evMock).toHaveBeenCalledWith("first_play", { uid: "uid-abc12345", source: "x_launch", ref: "rabc123def45" });
  });

  it("omits source/ref keys when they are absent", () => {
    markFirstPlay("uid-abc12345");
    expect(evMock).toHaveBeenCalledWith("first_play", { uid: "uid-abc12345" });
  });

  it("fires once per device, then no-ops", () => {
    markFirstPlay("uid-abc12345", undefined, "rabc123def45");
    markFirstPlay("uid-abc12345", undefined, "rabc123def45");
    expect(evMock).toHaveBeenCalledTimes(1);
  });
});
