import { KEEP_BEST_LUA, KEEP_BEST_ROW_LUA, TRIM_BOARD_LUA } from "@/lib/score";
import { PICKEM_VOTE_LUA } from "@/lib/pickem";

// In-memory stand-in for @upstash/redis covering the command surface this codebase uses.
// Mirrors the real client's JSON auto-(de)serialization: strings are stored raw, everything
// else JSON round-trips — so a stored numeric string reads back as a number, the same
// asymmetry the routes already defend against with Number(...).
// eval() implements the EXACT semantics of the two known Lua scripts, keyed by script string
// (live behavior verified against real Upstash by scripts/lua_e2e.ts); unknown scripts throw.

const ser = (v: unknown): string => (typeof v === "string" ? v : JSON.stringify(v));
const de = (v: string | null | undefined): unknown => {
  if (v == null) return null;
  try { return JSON.parse(v); } catch { return v; }
};
const deepDe = (v: unknown): unknown => (Array.isArray(v) ? v.map(deepDe) : typeof v === "string" ? de(v) : v);

// Redis range semantics: inclusive stop, negative indices from the end.
function range<T>(arr: T[], start: number, stop: number): T[] {
  const len = arr.length;
  const a = start < 0 ? Math.max(len + start, 0) : start;
  const b = stop < 0 ? len + stop : Math.min(stop, len - 1);
  if (a > b || a >= len) return [];
  return arr.slice(a, b + 1);
}

export type RedisFake = ReturnType<typeof createRedisFake>;

export function createRedisFake() {
  const strings = new Map<string, string>();
  const hashes = new Map<string, Map<string, string>>();
  const zsets = new Map<string, Map<string, number>>();
  const lists = new Map<string, string[]>();
  const sets = new Map<string, Set<string>>();
  const ttls = new Map<string, number>();
  const calls: string[] = [];
  // HTTP round-trip counter: every top-level command is one trip; a pipeline (any op count) and an
  // eval are one trip each. Lets tests assert a route's Redis trip budget, not just its op list.
  let trips = 0;

  const log = (...parts: unknown[]) => { calls.push(parts.map(String).join(" ")); trips++; };
  const hash = (k: string) => { let h = hashes.get(k); if (!h) { h = new Map(); hashes.set(k, h); } return h; };
  const zset = (k: string) => { let z = zsets.get(k); if (!z) { z = new Map(); zsets.set(k, z); } return z; };
  const list = (k: string) => { let l = lists.get(k); if (!l) { l = []; lists.set(k, l); } return l; };
  const set = (k: string) => { let s = sets.get(k); if (!s) { s = new Set(); sets.set(k, s); } return s; };
  const hasKey = (k: string) =>
    strings.has(k) || !!hashes.get(k)?.size || !!zsets.get(k)?.size || !!lists.get(k)?.length || !!sets.get(k)?.size;

  // Ascending by score, ties ascending by member (real sorted-set ordering).
  const zsorted = (k: string): [string, number][] =>
    [...(zsets.get(k) ?? new Map<string, number>())].sort((x, y) => x[1] - y[1] || (x[0] < y[0] ? -1 : 1));

  // Raw (un-deserialized) internals, used by the Lua ports the way redis.call sees data.
  const rawIncr = (k: string): number => {
    const n = Number(strings.get(k) ?? "0") + 1;
    strings.set(k, String(n));
    return n;
  };
  const rawExpire = (k: string, sec: number): number => {
    if (!hasKey(k)) return 0;
    ttls.set(k, sec);
    return 1;
  };
  const rawZincrby = (k: string, by: number, member: string): number => {
    const z = zset(k);
    const n = (z.get(member) ?? 0) + by;
    z.set(member, n);
    return n;
  };

  // KEEP_BEST_LUA (lib/score.ts): atomic daily keep-best + win-delta propagation to weekly/all-time.
  function keepBest(keys: string[], args: (string | number)[]): number[] {
    const [dailyZ, weekZ, allZ] = keys;
    const uid = String(args[0]);
    const newScore = Number(args[1]);
    const newWins = Number(args[2]);
    const prev = zsets.get(dailyZ)?.get(uid) ?? null;
    if (prev != null && prev >= newScore) return [0, 0, 0, 0];
    const prevWins = prev != null ? Math.floor(prev / 1000) : 0;
    const delta = newWins - prevWins;
    zset(dailyZ).set(uid, newScore);
    rawExpire(dailyZ, Number(args[3]));
    let ww: number;
    let aw: number;
    if (delta !== 0) {
      ww = rawZincrby(weekZ, delta, uid);
      aw = rawZincrby(allZ, delta, uid);
    } else {
      ww = zsets.get(weekZ)?.get(uid) ?? 0;
      aw = zsets.get(allZ)?.get(uid) ?? 0;
    }
    rawExpire(weekZ, Number(args[4]));
    return [1, delta, Math.floor(ww), Math.floor(aw)];
  }

  // KEEP_BEST_ROW_LUA (lib/score.ts): atomic per-board keep-best — compare, score, meta row,
  // and TTLs move together so the zset score and the meta hash can never diverge.
  function keepBestRow(keys: string[], args: (string | number)[]): number {
    const [zK, hK] = keys;
    const uid = String(args[0]);
    const sortScore = Number(args[1]);
    const prev = zsets.get(zK)?.get(uid) ?? null;
    if (prev != null && prev >= sortScore) return 0;
    zset(zK).set(uid, sortScore);
    hash(hK).set(uid, String(args[2]));
    rawExpire(zK, Number(args[3]));
    rawExpire(hK, Number(args[3]));
    return 1;
  }

  // TRIM_BOARD_LUA (lib/score.ts): cap a board pair to the top N, evicting the lowest scorers
  // from the zset AND the meta hash together.
  function trimBoard(keys: string[], args: (string | number)[]): number {
    const [zK, hK] = keys;
    const cap = Number(args[0]);
    const sorted = zsorted(zK); // ascending — lowest scores first
    if (sorted.length <= cap) return 0;
    const doomed = sorted.slice(0, sorted.length - cap).map(([m]) => m);
    for (const m of doomed) { zsets.get(zK)?.delete(m); hashes.get(hK)?.delete(m); }
    return doomed.length;
  }

  // PICKEM_VOTE_LUA (lib/pickem.ts): claim voter slot, bump matching counter, read back both counts.
  function pickemVote(keys: string[], args: (string | number)[]): (string | number)[] {
    const [voterK, yK, nK] = keys;
    const vote = String(args[0]);
    const ttl = Number(args[1]);
    let stored = strings.get(voterK) ?? null;
    let claimed = 0;
    if (stored == null) {
      strings.set(voterK, vote);
      ttls.set(voterK, ttl);
      const ckey = vote === "y" ? yK : nK;
      rawIncr(ckey);
      rawExpire(ckey, ttl);
      stored = vote;
      claimed = 1;
    }
    const y = strings.get(yK) ?? "0";
    const n = strings.get(nK) ?? "0";
    return [claimed, stored, y, n];
  }

  const fake = {
    strings, hashes, zsets, lists, sets, ttls, calls,
    get trips() { return trips; },

    get: async (k: string) => { log("get", k); return de(strings.get(k) ?? null); },
    set: async (k: string, v: unknown, opts?: { nx?: boolean; ex?: number }) => {
      log("set", k, ser(v), JSON.stringify(opts ?? {}));
      if (opts?.nx && strings.has(k)) return null;
      strings.set(k, ser(v));
      if (opts?.ex != null) ttls.set(k, opts.ex);
      return "OK";
    },
    mget: async (...ks: string[]) => { log("mget", ...ks); return ks.map((k) => de(strings.get(k) ?? null)); },
    incr: async (k: string) => { log("incr", k); return rawIncr(k); },
    del: async (...ks: string[]) => {
      log("del", ...ks);
      let n = 0;
      for (const k of ks) {
        if (hasKey(k)) n++;
        strings.delete(k); hashes.delete(k); zsets.delete(k); lists.delete(k); sets.delete(k); ttls.delete(k);
      }
      return n;
    },
    exists: async (...ks: string[]) => { log("exists", ...ks); return ks.filter(hasKey).length; },
    expire: async (k: string, sec: number, opt?: string) => {
      if (opt) log("expire", k, sec, opt); else log("expire", k, sec);
      // NX: only set a TTL when the key has none (real EXPIRE NX semantics)
      if (opt && opt.toLowerCase() === "nx" && ttls.has(k)) return 0;
      return rawExpire(k, sec);
    },

    zadd: async (k: string, ...entries: { score: number; member: string }[]) => {
      log("zadd", k, ...entries.map((e) => `${e.score}:${e.member}`));
      const z = zset(k);
      let added = 0;
      for (const e of entries) { if (!z.has(ser(e.member))) added++; z.set(ser(e.member), e.score); }
      return added;
    },
    zscore: async (k: string, member: string) => { log("zscore", k, member); return zsets.get(k)?.get(member) ?? null; },
    zincrby: async (k: string, by: number, member: string) => { log("zincrby", k, by, member); return rawZincrby(k, by, member); },
    zcard: async (k: string) => { log("zcard", k); return zsets.get(k)?.size ?? 0; },
    zrem: async (k: string, ...members: string[]) => {
      log("zrem", k, ...members);
      const z = zsets.get(k);
      return members.filter((m) => z?.delete(m)).length;
    },
    zrank: async (k: string, member: string) => {
      log("zrank", k, member);
      const i = zsorted(k).findIndex(([m]) => m === member);
      return i === -1 ? null : i;
    },
    zrevrank: async (k: string, member: string) => {
      log("zrevrank", k, member);
      const sorted = zsorted(k);
      const i = sorted.findIndex(([m]) => m === member);
      return i === -1 ? null : sorted.length - 1 - i;
    },
    zrange: async (k: string, start: number, stop: number, opts?: { rev?: boolean; withScores?: boolean }) => {
      log("zrange", k, start, stop, JSON.stringify(opts ?? {}));
      const sorted = zsorted(k);
      if (opts?.rev) sorted.reverse();
      const out: unknown[] = [];
      for (const [m, s] of range(sorted, start, stop)) {
        out.push(de(m));
        if (opts?.withScores) out.push(s);
      }
      return out;
    },

    hset: async (k: string, obj: Record<string, unknown>) => {
      log("hset", k, ...Object.keys(obj));
      const h = hash(k);
      let added = 0;
      for (const [f, v] of Object.entries(obj)) { if (!h.has(f)) added++; h.set(f, ser(v)); }
      return added;
    },
    hget: async (k: string, f: string) => { log("hget", k, f); return de(hashes.get(k)?.get(f) ?? null); },
    hsetnx: async (k: string, f: string, v: unknown) => {
      log("hsetnx", k, f);
      const h = hash(k);
      if (h.has(f)) return 0;
      h.set(f, ser(v));
      return 1;
    },
    hmget: async (k: string, ...fields: string[]) => {
      log("hmget", k, ...fields);
      const h = hashes.get(k);
      // Real client: null when EVERY field misses, else a record holding ALL requested
      // fields with null for the missing ones (verified against deserialize5 in v1.38).
      if (fields.every((f) => h?.get(f) == null)) return null;
      return Object.fromEntries(fields.map((f) => [f, de(h?.get(f) ?? null)]));
    },
    hgetall: async (k: string) => {
      log("hgetall", k);
      const h = hashes.get(k);
      if (!h?.size) return null;
      return Object.fromEntries([...h].map(([f, v]) => [f, de(v)]));
    },
    hexists: async (k: string, f: string) => { log("hexists", k, f); return hashes.get(k)?.has(f) ? 1 : 0; },
    hlen: async (k: string) => { log("hlen", k); return hashes.get(k)?.size ?? 0; },
    hdel: async (k: string, ...fields: string[]) => {
      log("hdel", k, ...fields);
      const h = hashes.get(k);
      return fields.filter((f) => h?.delete(f)).length;
    },
    hincrby: async (k: string, f: string, by: number) => {
      log("hincrby", k, f, by);
      const h = hash(k);
      const n = Number(h.get(f) ?? "0") + by;
      h.set(f, String(n));
      return n;
    },

    lpush: async (k: string, ...vs: unknown[]) => {
      log("lpush", k, ...vs.map(ser));
      const l = list(k);
      for (const v of vs) l.unshift(ser(v));
      return l.length;
    },
    lrange: async (k: string, start: number, stop: number) => {
      log("lrange", k, start, stop);
      return range(lists.get(k) ?? [], start, stop).map(de);
    },
    ltrim: async (k: string, start: number, stop: number) => {
      log("ltrim", k, start, stop);
      lists.set(k, range(lists.get(k) ?? [], start, stop));
      return "OK";
    },

    sadd: async (k: string, ...members: unknown[]) => {
      log("sadd", k, ...members.map(ser));
      const s = set(k);
      let added = 0;
      for (const m of members) { const v = ser(m); if (!s.has(v)) { s.add(v); added++; } }
      return added;
    },
    smembers: async (k: string) => { log("smembers", k); return [...(sets.get(k) ?? [])].map(de); },
    sismember: async (k: string, member: unknown) => { log("sismember", k, ser(member)); return sets.get(k)?.has(ser(member)) ? 1 : 0; },
    scard: async (k: string) => { log("scard", k); return sets.get(k)?.size ?? 0; },

    ping: async () => { log("ping"); return "PONG"; },
    zremrangebyrank: async (k: string, start: number, stop: number) => {
      log("zremrangebyrank", k, start, stop);
      const z = zsets.get(k);
      if (!z) return 0;
      // ZSET is score-ordered ascending; remove the members in the [start,stop] rank range.
      const victims = range(zsorted(k), start, stop).map(([m]) => m);
      for (const m of victims) z.delete(m);
      return victims.length;
    },

    eval: async (script: string, keys: string[], args: (string | number)[]) => {
      log("eval", keys.join(","), args.join(","));
      if (script === KEEP_BEST_LUA) return deepDe(keepBest(keys, args));
      if (script === PICKEM_VOTE_LUA) return deepDe(pickemVote(keys, args));
      if (script === KEEP_BEST_ROW_LUA) return keepBestRow(keys, args);
      if (script === TRIM_BOARD_LUA) return trimBoard(keys, args);
      throw new Error("redisFake.eval: unknown script — add its semantics here before using it in tests");
    },

    pipeline: () => {
      const ops: Array<() => Promise<unknown>> = [];
      const p = {
        incr: (k: string) => { ops.push(() => fake.incr(k)); return p; },
        expire: (k: string, sec: number, opt?: string) => { ops.push(() => fake.expire(k, sec, opt)); return p; },
        lpush: (k: string, ...vs: unknown[]) => { ops.push(() => fake.lpush(k, ...vs)); return p; },
        ltrim: (k: string, start: number, stop: number) => { ops.push(() => fake.ltrim(k, start, stop)); return p; },
        hset: (k: string, obj: Record<string, unknown>) => { ops.push(() => fake.hset(k, obj)); return p; },
        hdel: (k: string, ...fields: string[]) => { ops.push(() => fake.hdel(k, ...fields)); return p; },
        hincrby: (k: string, f: string, by: number) => { ops.push(() => fake.hincrby(k, f, by)); return p; },
        zrem: (k: string, ...members: string[]) => { ops.push(() => fake.zrem(k, ...members)); return p; },
        sadd: (k: string, ...members: unknown[]) => { ops.push(() => fake.sadd(k, ...members)); return p; },
        // a pipeline is ONE round trip no matter how many ops it carries: the sub-ops above each
        // log (and bump trips); collapse their count back to a single trip on exec.
        exec: async () => {
          const before = trips;
          const out: unknown[] = [];
          for (const op of ops) out.push(await op());
          trips = before + 1;
          return out;
        },
      };
      return p;
    },
  };
  return fake;
}
