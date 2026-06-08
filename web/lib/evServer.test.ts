import { parseEvBody, bump, EV_TTL, EV_ACTIVE_CAP } from "./evServer";
import type { Redis } from "@upstash/redis";

let fail = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("FAIL:", m); fail++; } else console.log("ok:", m); };

function fakeRedis() {
  const calls: string[] = [];
  const store: Record<string, number> = {};
  const sets: Record<string, Set<string>> = {};
  const hashes: Record<string, Record<string, number>> = {};
  const r = {
    calls, store, sets, hashes,
    incr: async (k: string) => { calls.push(`incr ${k}`); return (store[k] = (store[k] ?? 0) + 1); },
    sadd: async (k: string, ...m: string[]) => { calls.push(`sadd ${k} ${m.join(",")}`); (sets[k] ??= new Set()); m.forEach(x => sets[k].add(x)); return m.length; },
    hincrby: async (k: string, f: string, n: number) => { calls.push(`hincrby ${k} ${f} ${n}`); (hashes[k] ??= {}); return (hashes[k][f] = (hashes[k][f] ?? 0) + n); },
    expire: async (k: string, s: number) => { calls.push(`expire ${k} ${s}`); return 1; },
    scard: async (k: string) => sets[k]?.size ?? 0,
  };
  return r;
}

// --- parseEvBody ---
assert(JSON.stringify(parseEvBody({ ev: "play", uid: "abcdefgh", mode: "daily" })) === JSON.stringify({ ev: "play", uid: "abcdefgh", mode: "daily" }), "valid play parsed");
assert(JSON.stringify(parseEvBody({ ev: "share", uid: "abcdefgh" })) === JSON.stringify({ ev: "share", uid: "abcdefgh" }), "valid share parsed (no mode)");
assert(parseEvBody({ ev: "complete" }) === null, "non-beacon stage rejected");
assert(parseEvBody({ ev: "nope" }) === null, "unknown ev rejected");
assert(parseEvBody("garbage") === null, "non-object rejected");
assert(parseEvBody({ ev: "play", uid: "bad uid!" })?.uid === undefined, "malformed uid stripped");
assert(parseEvBody({ ev: "play", uid: "abcdefgh", mode: "nope" })?.mode === undefined, "bad mode stripped");
assert(parseEvBody({ ev: "share", uid: "abcdefgh", mode: "daily" })?.mode === undefined, "mode ignored for share");

(async () => {
  // --- bump: play with uid + mode ---
  const r = fakeRedis();
  await bump(r as unknown as Redis, "play", { uid: "abcdefgh", mode: "daily", day: "2026-6-9" });
  assert(r.store["ev:play:2026-6-9"] === 1, "play counter incremented");
  assert(r.hashes["ev:mode:2026-6-9"]?.daily === 1, "mode hash incremented");
  assert(r.sets["ev:active:2026-6-9"]?.has("abcdefgh") === true, "uid added to active set");
  assert(r.hashes["ev:totals"]?.play === 1, "totals.play incremented");
  assert(r.calls.includes(`expire ev:play:2026-6-9 ${EV_TTL}`), "play key expired with EV_TTL");
  assert(r.calls.includes(`expire ev:active:2026-6-9 ${EV_TTL}`), "active set expired with EV_TTL");
  assert(!r.calls.some(c => c.startsWith("expire ev:totals")), "ev:totals is never expired (persistent)");

  // --- bump: complete (server stage, no uid/mode) ---
  const r2 = fakeRedis();
  await bump(r2 as unknown as Redis, "complete", { day: "2026-6-9" });
  assert(r2.store["ev:complete:2026-6-9"] === 1, "complete counter incremented");
  assert(r2.hashes["ev:totals"]?.complete === 1, "totals.complete incremented");
  assert(r2.sets["ev:active:2026-6-9"] === undefined, "complete does NOT touch active set");
  assert(r2.hashes["ev:mode:2026-6-9"] === undefined, "complete does NOT touch mode hash");

  // --- bump: submit with uid, no mode ---
  const r3 = fakeRedis();
  await bump(r3 as unknown as Redis, "submit", { uid: "abcdefgh", day: "2026-6-9" });
  assert(r3.store["ev:submit:2026-6-9"] === 1, "submit counter incremented");
  assert(r3.sets["ev:active:2026-6-9"]?.has("abcdefgh") === true, "submit adds uid to active set");
  assert(r3.hashes["ev:mode:2026-6-9"] === undefined, "submit does NOT touch mode hash");

  // --- bump: null redis no-ops ---
  await bump(null, "play", { uid: "abcdefgh", day: "2026-6-9" });
  assert(true, "null redis no-ops without throwing");

  // --- bump: throwing redis is swallowed ---
  const thrower = { incr: async () => { throw new Error("boom"); }, sadd: async () => { throw new Error(); }, hincrby: async () => { throw new Error(); }, expire: async () => { throw new Error(); } };
  let threw = false;
  try { await bump(thrower as unknown as Redis, "complete", { day: "2026-6-9" }); } catch { threw = true; }
  assert(!threw, "throwing redis is swallowed — bump never throws");

  // --- bump: active-set cap skips sadd once the set is full (memory-exhaustion guard) ---
  const rCap = fakeRedis();
  rCap.scard = async () => EV_ACTIVE_CAP; // pretend today's active set is already at the cap
  await bump(rCap as unknown as Redis, "play", { uid: "abcdefgh", day: "2026-6-9" });
  assert(rCap.store["ev:play:2026-6-9"] === 1, "counter still increments at the active-set cap");
  assert(rCap.sets["ev:active:2026-6-9"] === undefined, "sadd skipped when active set is at the cap");

  console.log(fail ? `\n${fail} ASSERTION(S) FAILED` : "\nALL EVSERVER CHECKS PASSED");
  process.exit(fail ? 1 : 0);
})();
