// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import React from "react";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/lib/streak", () => ({ getUid: () => "uid-test-1234" }));
vi.mock("@vercel/analytics", () => ({ track: vi.fn() }));

import InviteFriend from "@/components/InviteFriend";

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState({}, "", "/");
  Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
});
afterEach(() => cleanup());

describe("InviteFriend", () => {
  it("mints a code, shows the CTA, and copies an invite link carrying ?ref=", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ code: "rabc123def45", credits: 0 }) })));
    const copied: string[] = [];
    const writeText = vi.fn((text: string) => { copied.push(text); return Promise.resolve(); });
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    render(<InviteFriend />);
    const btn = await screen.findByRole("button", { name: /invite a friend/i });
    fireEvent.click(btn);

    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(copied[0]).toContain("/?ref=rabc123def45");
    expect(localStorage.getItem("szn:ref:code")).toBe("rabc123def45");
  });

  it("shows the referral credit count once the user has referred someone", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ code: "rabc123def45", credits: 3 }) })));
    render(<InviteFriend />);
    expect(await screen.findByText(/3 drafted so far/i)).toBeTruthy();
  });

  it("renders nothing when the mint fails (no code to invite with)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, json: async () => ({}) })));
    const { container } = render(<InviteFriend />);
    await waitFor(() => expect((globalThis.fetch as ReturnType<typeof vi.fn>)).toHaveBeenCalled());
    expect(container.querySelector("button")).toBeNull();
  });
});
