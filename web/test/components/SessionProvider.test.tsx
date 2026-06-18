// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor, act } from "@testing-library/react";
import React from "react";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

// Auth must read as enabled for the One Tap branch to be reachable at all.
vi.mock("@/lib/authClient", () => ({ AUTH_ENABLED: true }));
// Stand-in for the real GSI component so we can detect when it MOUNTS (i.e. when GSI is loaded and the
// sign-in button is rendered). The whole point of the change: it must not mount on arrival.
vi.mock("@/components/GoogleOneTap", () => ({ default: () => React.createElement("div", null, "ONE_TAP_MOUNTED") }));
vi.mock("@/lib/streak", () => ({ getHistory: () => [], getUid: () => "anon" }));
vi.mock("@/lib/resultHistory", () => ({ listResults: () => [] }));
vi.mock("@/lib/account", () => ({ syncToAccount: vi.fn(async () => {}) }));

import SessionProvider, { useSessionContext } from "@/components/SessionProvider";

function SignInTrigger() {
  const { promptSignIn } = useSessionContext();
  return React.createElement("button", { onClick: promptSignIn }, "open-signin");
}

beforeEach(() => {
  // /api/auth/me → signed out
  global.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ user: null }) })) as unknown as typeof fetch;
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("SessionProvider — Google One Tap is deferred to user intent (anon-first funnel, DESIGN.md §12)", () => {
  it("does NOT mount GoogleOneTap for an anonymous visitor on arrival, only after they open sign-in", async () => {
    await act(async () => {
      render(React.createElement(SessionProvider, null, React.createElement(SignInTrigger)));
    });
    // session has resolved to signed-out; the sign-in trigger is present
    await waitFor(() => expect(screen.getByText("open-signin")).toBeTruthy());
    // GSI must not be loaded/mounted before the user signals intent — no unsolicited prompt on landing
    expect(screen.queryByText("ONE_TAP_MOUNTED")).toBeNull();
    // user explicitly opens sign-in → the GSI button mounts
    await act(async () => { fireEvent.click(screen.getByText("open-signin")); });
    expect(screen.getByText("ONE_TAP_MOUNTED")).toBeTruthy();
  });
});
