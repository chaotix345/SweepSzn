// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor, cleanup, fireEvent } from "@testing-library/react";
import React from "react";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("next/link", () => ({
  default: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) =>
    React.createElement("a", { href, className }, children),
}));
vi.mock("@/lib/authClient", () => ({ AUTH_ENABLED: true }));
const promptSignIn = vi.fn();
let user: { uid: string; name: string } | null = null;
vi.mock("@/lib/useSession", () => ({ useSession: () => ({ user, loading: false, promptSignIn }) }));

import { DexBoard } from "@/components/DexBoard";

const player = (i: number) => ({
  id: `p${i}`, personId: `p${i}`, name: `Player ${i}`, team: "BOS", decade: "1980s", pos: "SF", eligible: ["SF"],
  pts: 20, trb: 5, ast: 4, stl: 1, blk: 0.5, fame: 1, traits: [],
});
const stub = (body: unknown) => {
  const f = vi.fn(async () => ({ ok: true, status: 200, json: async () => body }));
  vi.stubGlobal("fetch", f);
  return f;
};

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); promptSignIn.mockReset(); user = null; });

describe("DexBoard — local-first Drafted Dex", () => {
  it("shows the device's collection signed out, with a real sign-in button to sync", async () => {
    const f = stub({ players: [player(1), player(2)], total: 1, badges: ["first"], signedIn: false });
    render(<DexBoard />);
    await waitFor(() => expect(screen.getByText("Player 1")).toBeTruthy());
    expect((f.mock.calls[0] as unknown as [string, RequestInit])[1].method).toBe("POST");
    fireEvent.click(screen.getByRole("button", { name: "Sign in to sync" }));
    expect(promptSignIn).toHaveBeenCalledOnce();
  });

  it("drops the sync prompt once signed in", async () => {
    user = { uid: "u1", name: "U" };
    stub({ players: [player(1)], total: 1, badges: [], signedIn: true });
    render(<DexBoard />);
    await waitFor(() => expect(screen.getByText("Player 1")).toBeTruthy());
    expect(screen.queryByRole("button", { name: "Sign in to sync" })).toBeNull();
  });

  it("empty state links to play and still offers sign-in for players with a Dex elsewhere", async () => {
    stub({ players: [], total: 0, badges: [], signedIn: false });
    render(<DexBoard />);
    await waitFor(() => expect(screen.getByText(/haven't drafted anyone yet/)).toBeTruthy());
    expect(screen.getByRole("link", { name: "Play a round →" }).getAttribute("href")).toBe("/play");
    expect(screen.getByRole("button", { name: "Sign in to sync" })).toBeTruthy();
  });
});
