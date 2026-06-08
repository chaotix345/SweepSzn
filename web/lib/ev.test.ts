import { ev } from "./ev";

let fail = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("FAIL:", m); fail++; } else console.log("ok:", m); };

(async () => {
  // sendBeacon path
  let beacon: { url: string; body: string } | null = null;
  (globalThis as unknown as { navigator: unknown }).navigator = {
    sendBeacon: (url: string, blob: Blob) => { blob.text().then(t => { beacon = { url, body: t }; }); return true; },
  };
  ev("play", { uid: "abcdefgh", mode: "daily" });
  await new Promise(r => setTimeout(r, 10));
  assert(beacon !== null, "sendBeacon was called");
  assert(beacon!.url === "/api/ev", "posts to /api/ev");
  const parsed = JSON.parse(beacon!.body);
  assert(parsed.ev === "play" && parsed.uid === "abcdefgh" && parsed.mode === "daily", "payload carries ev+uid+mode");

  // fetch fallback when sendBeacon is unavailable. Use a holder object so TS doesn't narrow the
  // externally-assigned capture to `never` after the null-check.
  const holder: { fetched: { url: string; body: string } | null } = { fetched: null };
  (globalThis as unknown as { navigator: unknown }).navigator = {};
  (globalThis as unknown as { fetch: unknown }).fetch = (url: string, init: { body: string }) => { holder.fetched = { url, body: init.body }; return Promise.resolve({} as Response); };
  ev("share", { uid: "abcdefgh" });
  assert(holder.fetched !== null && holder.fetched.url === "/api/ev", "falls back to fetch when no sendBeacon");
  assert(holder.fetched !== null && JSON.parse(holder.fetched.body).ev === "share", "fetch fallback carries ev");

  // never throws even if everything is broken
  (globalThis as unknown as { navigator: unknown }).navigator = { sendBeacon: () => { throw new Error("boom"); } };
  let threw = false;
  try { ev("play", {}); } catch { threw = true; }
  assert(!threw, "ev never throws into the UI");

  console.log(fail ? `\n${fail} ASSERTION(S) FAILED` : "\nALL EV CHECKS PASSED");
  process.exit(fail ? 1 : 0);
})();
