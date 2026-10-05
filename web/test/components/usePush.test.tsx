// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import React from "react";

(globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;

// usePush reads the VAPID key at module load — set it before the import below (restored in afterAll).
vi.hoisted(() => { vi.stubEnv("NEXT_PUBLIC_VAPID_PUBLIC_KEY", "BPTestKey_abcd"); });
vi.mock("@/lib/streak", () => ({ getUid: () => "test-uid-push" }));

import PushPrompt from "@/components/PushPrompt";

const SUB = { endpoint: "https://push.example/abc", keys: { p256dh: "p", auth: "a" } };
let existing: { toJSON: () => typeof SUB } | null;
let postStatus: number;
let pushPosts: unknown[];

function installPush(permission: NotificationPermission) {
  const sub = { toJSON: () => SUB };
  const reg = { pushManager: { getSubscription: vi.fn(async () => existing), subscribe: vi.fn(async () => sub) } };
  Object.defineProperty(navigator, "serviceWorker", {
    configurable: true,
    value: { register: vi.fn(async () => reg), ready: Promise.resolve(reg), getRegistration: vi.fn(async () => reg) },
  });
  vi.stubGlobal("PushManager", function PushManager() {});
  vi.stubGlobal("Notification", { permission, requestPermission: vi.fn(async () => "granted") });
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/push/subscribe") pushPosts.push(JSON.parse(String(init?.body)));
    return { ok: postStatus < 300, status: postStatus, json: async () => ({}) } as Response;
  }));
}

const flush = async () => { for (let i = 0; i < 5; i++) await act(async () => {}); };

beforeEach(() => {
  existing = null; postStatus = 200; pushPosts = [];
  try { localStorage.clear(); } catch { /* */ }
});
afterEach(() => {
  cleanup(); vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "serviceWorker");
});
afterAll(() => { vi.unstubAllEnvs(); });

describe("usePush — the opt-in only reads 'on' once the server stored it (L19)", () => {
  it("a failed subscribe store (503) leaves the opt-in CTA up instead of claiming reminders are on", async () => {
    installPush("default");
    postStatus = 503;
    render(<PushPrompt context="streak" />);
    await flush();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Remind me before my streak breaks/ })); });
    await flush();
    expect(pushPosts).toHaveLength(1);
    expect(screen.queryByText(/Streak reminders on/)).toBeNull();
    expect(screen.getByRole("button", { name: /Remind me before my streak breaks/ })).toBeTruthy();
  });

  it("a stored subscription flips the prompt to 'on' (control)", async () => {
    installPush("default");
    render(<PushPrompt context="streak" />);
    await flush();
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /Remind me before my streak breaks/ })); });
    await flush();
    expect(screen.getByText(/Streak reminders on/)).toBeTruthy();
  });
});

describe("usePush — an opted-in device keeps its subscription alive (M4 client half)", () => {
  it("already granted with a live subscription: silently re-POSTs it once, and not again the same day", async () => {
    installPush("granted");
    existing = { toJSON: () => SUB };
    render(<PushPrompt context="streak" />);
    await flush();
    expect(pushPosts).toEqual([{ uid: "test-uid-push", subscription: SUB }]);
    expect(screen.getByText(/Streak reminders on/)).toBeTruthy();
    cleanup();
    render(<PushPrompt context="streak" />);
    await flush();
    expect(pushPosts).toHaveLength(1);
  });

  it("granted but no subscription on this device: nothing to refresh", async () => {
    installPush("granted");
    render(<PushPrompt context="streak" />);
    await flush();
    expect(pushPosts).toHaveLength(0);
  });
});
