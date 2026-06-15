// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import React from "react";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) =>
    React.createElement("a", { href, className }, children),
}));
vi.mock("@/components/SessionProvider", () => ({ useSessionContext: () => ({ user: null }) }));
vi.mock("@/lib/account", () => ({ fetchProfile: vi.fn(async () => null) }));
vi.mock("@/lib/resultHistory", () => ({ listResults: () => [] }));

import { ModeSelect } from "@/components/game/ModeSelect";

afterEach(() => { cleanup(); localStorage.clear(); });

describe("ModeSelect", () => {
  it("features Daily as the recommended start and renders all eight modes", () => {
    render(<ModeSelect onPick={() => {}} onOpenChallenge={() => {}} />);
    expect(screen.getByText(/start here/i)).toBeTruthy();
    for (const name of ["Daily", "Classic", "HoopIQ", "Factor Hunt", "Prime Draft", "Blueprint", "Surgeon", "Challenge a Friend"]) {
      expect(screen.getByText(name)).toBeTruthy();
    }
  });

  it("calls onPick with the right mode id when a card is clicked", () => {
    const onPick = vi.fn();
    render(<ModeSelect onPick={onPick} onOpenChallenge={() => {}} />);
    fireEvent.click(screen.getByLabelText(/Play Daily mode/i));
    expect(onPick).toHaveBeenCalledWith("daily");
    fireEvent.click(screen.getByLabelText("Play Surgeon mode"));
    expect(onPick).toHaveBeenCalledWith("surgeon");
    fireEvent.click(screen.getByLabelText("Challenge a friend"));
    expect(onPick).toHaveBeenCalledWith("challenge");
  });

  it("shows first-run orientation when unseen and hides + remembers it on dismiss", () => {
    render(<ModeSelect onPick={() => {}} onOpenChallenge={() => {}} />);
    expect(screen.getByText(/New here/i)).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Dismiss"));
    expect(screen.queryByText(/New here/i)).toBeNull();
    expect(localStorage.getItem("sweepszn_seen_modes")).toBe("1");
  });
});
