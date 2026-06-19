// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, within, fireEvent } from "@testing-library/react";
import React from "react";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({
  user: null as { uid: string; name: string } | null,
  promptSignIn: vi.fn(),
  authEnabled: true,
  ev: vi.fn(),
}));
vi.mock("@/lib/ev", () => ({ ev: h.ev }));
vi.mock("@/lib/authClient", () => ({ get AUTH_ENABLED() { return h.authEnabled; } }));
vi.mock("@/components/SessionProvider", () => ({
  useSessionContext: () => ({ user: h.user, promptSignIn: h.promptSignIn }),
}));

import SignInSaveNudge from "@/components/SignInSaveNudge";

beforeEach(() => {
  h.user = null;
  h.authEnabled = true;
  h.promptSignIn.mockClear();
  h.ev.mockClear();
});

describe("SignInSaveNudge", () => {
  it("prompts a signed-out player to sign in and save across devices", () => {
    const { container } = render(<SignInSaveNudge mode="classic" />);
    expect(within(container).getByRole("button", { name: /save with google/i })).toBeTruthy();
    expect(container.textContent).toMatch(/keep your results and streak/i);
  });

  it("renders nothing once the player is signed in", () => {
    h.user = { uid: "g1", name: "Charlie" };
    const { container } = render(<SignInSaveNudge mode="classic" />);
    expect(container.innerHTML).toBe("");
  });

  it("fires claim_nudge_shown (mode-tagged) on mount for a signed-out player", () => {
    render(<SignInSaveNudge mode="surgeon" />);
    expect(h.ev).toHaveBeenCalledWith("claim_nudge_shown", { mode: "surgeon" });
  });

  it("fires claim_nudge_tap (mode-tagged) and prompts sign-in when the CTA is clicked", () => {
    const { container } = render(<SignInSaveNudge mode="hoopiq" />);
    fireEvent.click(within(container).getByRole("button", { name: /save with google/i }));
    expect(h.ev).toHaveBeenCalledWith("claim_nudge_tap", { mode: "hoopiq" });
    expect(h.promptSignIn).toHaveBeenCalledTimes(1);
  });

  it("fires no analytics when the player is already signed in (nudge not shown)", () => {
    h.user = { uid: "g1", name: "Charlie" };
    render(<SignInSaveNudge mode="classic" />);
    expect(h.ev).not.toHaveBeenCalled();
  });

  it("fires no analytics and renders nothing when auth is disabled", () => {
    h.authEnabled = false;
    const { container } = render(<SignInSaveNudge mode="classic" />);
    expect(container.innerHTML).toBe("");
    expect(h.ev).not.toHaveBeenCalled();
  });

  it("fires claim_nudge_shown at most once per mount even if the player signs out after signing in", () => {
    h.user = null;
    const { rerender } = render(<SignInSaveNudge mode="classic" />); // shown → fires once
    h.user = { uid: "g1", name: "Charlie" };
    rerender(<SignInSaveNudge mode="classic" />);                    // signed in → hidden, no fire
    h.user = null;
    rerender(<SignInSaveNudge mode="classic" />);                    // signed out again → latch suppresses re-fire
    expect(h.ev).toHaveBeenCalledTimes(1);
    expect(h.ev).toHaveBeenCalledWith("claim_nudge_shown", { mode: "classic" });
  });
});
