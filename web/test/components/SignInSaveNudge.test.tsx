// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, within } from "@testing-library/react";
import React from "react";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({ user: null as { uid: string; name: string } | null, promptSignIn: vi.fn() }));
vi.mock("@/lib/authClient", () => ({ AUTH_ENABLED: true }));
vi.mock("@/components/SessionProvider", () => ({
  useSessionContext: () => ({ user: h.user, promptSignIn: h.promptSignIn }),
}));

import SignInSaveNudge from "@/components/SignInSaveNudge";

describe("SignInSaveNudge", () => {
  it("prompts a signed-out player to sign in and save across devices", () => {
    h.user = null;
    const { container } = render(<SignInSaveNudge />);
    expect(within(container).getByRole("button", { name: /sign in with google/i })).toBeTruthy();
    expect(container.textContent).toMatch(/keep your streak and results/i);
  });

  it("renders nothing once the player is signed in", () => {
    h.user = { uid: "g1", name: "Charlie" };
    const { container } = render(<SignInSaveNudge />);
    expect(container.innerHTML).toBe("");
  });
});
