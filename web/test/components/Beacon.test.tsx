// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/lib/ev", () => ({ ev: vi.fn() }));
vi.mock("@/lib/streak", () => ({ getUid: () => "uid-test-1234" }));

import Beacon from "@/components/Beacon";
import { ev } from "@/lib/ev";

const evMock = vi.mocked(ev);

beforeEach(() => {
  evMock.mockClear();
  sessionStorage.clear();
  localStorage.clear();
  window.history.replaceState({}, "", "/"); // reset utm in the URL between tests
});
afterEach(() => cleanup());

describe("Beacon", () => {
  it("fires ev(name, { uid }) once on mount (mount-only, no dedupe)", () => {
    render(<Beacon name="share_view" />);
    expect(evMock).toHaveBeenCalledTimes(1);
    expect(evMock).toHaveBeenCalledWith("share_view", { uid: "uid-test-1234" });
  });

  it("renders nothing", () => {
    const { container } = render(<Beacon name="visit" />);
    expect(container.innerHTML).toBe("");
  });

  it("mount-only: each fresh page view fires again (loop entries are not deduped)", () => {
    render(<Beacon name="share_view" />);
    cleanup();
    render(<Beacon name="share_view" />);
    expect(evMock).toHaveBeenCalledTimes(2);
  });

  it("session dedupe: fires once, then not again on a later mount in the same session", () => {
    render(<Beacon name="visit" dedupe={{ scope: "session", key: "szn:ev:visit" }} />);
    cleanup();
    render(<Beacon name="visit" dedupe={{ scope: "session", key: "szn:ev:visit" }} />);
    expect(evMock).toHaveBeenCalledTimes(1);
  });

  it("session dedupe records the key so a fresh process (cleared mock) stays suppressed", () => {
    render(<Beacon name="visit" dedupe={{ scope: "session", key: "szn:ev:visit" }} />);
    expect(sessionStorage.getItem("szn:ev:visit")).toBe("1");
  });

  it("device dedupe: persists in localStorage and survives a later mount (once per device)", () => {
    render(<Beacon name="visit" dedupe={{ scope: "device", key: "szn:ev:visit" }} />);
    expect(localStorage.getItem("szn:ev:visit")).toBe("1");
    cleanup();
    render(<Beacon name="visit" dedupe={{ scope: "device", key: "szn:ev:visit" }} />);
    expect(evMock).toHaveBeenCalledTimes(1);
  });

  it("attributes the beacon to the URL utm_source when present (visit-by-source)", () => {
    window.history.replaceState({}, "", "/?utm_source=x_launch");
    render(<Beacon name="visit" />);
    expect(evMock).toHaveBeenCalledWith("visit", { uid: "uid-test-1234", source: "x_launch" });
  });

  it("falls back to the persisted first-touch source when the URL carries none", () => {
    localStorage.setItem("szn:utm:source", "organic");
    render(<Beacon name="visit" />);
    expect(evMock).toHaveBeenCalledWith("visit", { uid: "uid-test-1234", source: "organic" });
  });
});
