import { describe, it, expect } from "vitest";
import { ev } from "./ev";

describe("ev", () => {
  it("sendBeacon was called", async () => {
    let beacon: { url: string; body: string } | null = null;
    (globalThis as unknown as { navigator: unknown }).navigator = {
      sendBeacon: (url: string, blob: Blob) => { blob.text().then(t => { beacon = { url, body: t }; }); return true; },
    };
    ev("play", { uid: "abcdefgh", mode: "daily" });
    await new Promise(r => setTimeout(r, 10));
    expect(beacon !== null).toBe(true);
  });

  it("posts to /api/ev", async () => {
    let beacon: { url: string; body: string } | null = null;
    (globalThis as unknown as { navigator: unknown }).navigator = {
      sendBeacon: (url: string, blob: Blob) => { blob.text().then(t => { beacon = { url, body: t }; }); return true; },
    };
    ev("play", { uid: "abcdefgh", mode: "daily" });
    await new Promise(r => setTimeout(r, 10));
    expect(beacon!.url === "/api/ev").toBe(true);
  });

  it("payload carries ev+uid+mode", async () => {
    let beacon: { url: string; body: string } | null = null;
    (globalThis as unknown as { navigator: unknown }).navigator = {
      sendBeacon: (url: string, blob: Blob) => { blob.text().then(t => { beacon = { url, body: t }; }); return true; },
    };
    ev("play", { uid: "abcdefgh", mode: "daily" });
    await new Promise(r => setTimeout(r, 10));
    const parsed = JSON.parse(beacon!.body);
    expect(parsed.ev === "play" && parsed.uid === "abcdefgh" && parsed.mode === "daily").toBe(true);
  });

  it("falls back to fetch when no sendBeacon", () => {
    // fetch fallback when sendBeacon is unavailable. Use a holder object so TS doesn't narrow the
    // externally-assigned capture to `never` after the null-check.
    const holder: { fetched: { url: string; body: string } | null } = { fetched: null };
    (globalThis as unknown as { navigator: unknown }).navigator = {};
    (globalThis as unknown as { fetch: unknown }).fetch = (url: string, init: { body: string }) => { holder.fetched = { url, body: init.body }; return Promise.resolve({} as Response); };
    ev("share", { uid: "abcdefgh" });
    expect(holder.fetched !== null && holder.fetched.url === "/api/ev").toBe(true);
  });

  it("fetch fallback carries ev", () => {
    const holder: { fetched: { url: string; body: string } | null } = { fetched: null };
    (globalThis as unknown as { navigator: unknown }).navigator = {};
    (globalThis as unknown as { fetch: unknown }).fetch = (url: string, init: { body: string }) => { holder.fetched = { url, body: init.body }; return Promise.resolve({} as Response); };
    ev("share", { uid: "abcdefgh" });
    expect(holder.fetched !== null && JSON.parse(holder.fetched.body).ev === "share").toBe(true);
  });

  it("ev never throws into the UI", () => {
    (globalThis as unknown as { navigator: unknown }).navigator = { sendBeacon: () => { throw new Error("boom"); } };
    let threw = false;
    try { ev("play", {}); } catch { threw = true; }
    expect(!threw).toBe(true);
  });
});
