// Pure scoring helpers (no server-only import) so they're unit-testable. The redis module
// re-exports encScore/decodeWins; computeDelta mirrors the keep-best Lua's decision for tests.

// wins primary, net tiebreak. net+100 clamped to [0,999] so floor(score/1000) always decodes wins.
export const encScore = (wins: number, net: number) => wins * 1000 + Math.max(0, Math.min(999, net + 100));
export const decodeWins = (score: number) => Math.floor(score / 1000);

// Given the previous daily score (or null) and the new run, decide whether the daily best changed
// and how many WINS to add to the weekly/all-time totals. Must match KEEP_BEST_LUA exactly.
export function computeDelta(prevScore: number | null, newScore: number, newWins: number): { changed: boolean; delta: number } {
  if (prevScore != null && prevScore >= newScore) return { changed: false, delta: 0 };
  const prevWins = prevScore != null ? decodeWins(prevScore) : 0;
  return { changed: true, delta: newWins - prevWins };
}

// Atomic keep-best on the daily key + delta-propagation to weekly & all-time, in ONE server-side
// step. The naive read->compute-delta->ZINCRBY is not atomic: two concurrent submits for the same
// uid both read the same prev and each ZINCRBY, double-counting — and all-time has no TTL, so it
// never self-heals. KEYS: 1=daily Z, 2=weekly Z, 3=all-time Z. ARGV: 1=uid 2=newScore 3=newWins
// 4=dailyTTL 5=weeklyTTL. Returns {changed, delta, weeklyWins, alltimeWins}. (Pure string — lives
// here, not in the server-only store, so a dev harness can EVAL the exact script against real Redis.)
// Optional meta rows, written in the SAME step only when the daily best improved (as KEEP_BEST_ROW_LUA
// does) — a meta HSET in a later pipeline let a concurrent worse run land its row under the better
// score: KEYS 4=daily meta H 5=weekly meta H 6=all-time meta H; ARGV 6=daily row JSON, 7=agg row JSON
// up to and including `"wins":` (the script appends the current total + `}`). Daily meta takes the
// daily TTL, weekly meta the weekly TTL; all-time meta is persistent. Omit them for the 3-key shape.
export const KEEP_BEST_LUA = `
local prev = redis.call('ZSCORE', KEYS[1], ARGV[1])
local newScore = tonumber(ARGV[2])
local newWins = tonumber(ARGV[3])
if prev and tonumber(prev) >= newScore then return {0, 0, 0, 0} end
local prevWins = 0
if prev then prevWins = math.floor(tonumber(prev) / 1000) end
local delta = newWins - prevWins
redis.call('ZADD', KEYS[1], newScore, ARGV[1])
redis.call('EXPIRE', KEYS[1], tonumber(ARGV[4]))
local ww
local aw
if delta ~= 0 then
  ww = tonumber(redis.call('ZINCRBY', KEYS[2], delta, ARGV[1]))
  aw = tonumber(redis.call('ZINCRBY', KEYS[3], delta, ARGV[1]))
else
  local w = redis.call('ZSCORE', KEYS[2], ARGV[1])
  local a = redis.call('ZSCORE', KEYS[3], ARGV[1])
  ww = w and tonumber(w) or 0
  aw = a and tonumber(a) or 0
end
redis.call('EXPIRE', KEYS[2], tonumber(ARGV[5]))
if KEYS[4] then
  redis.call('HSET', KEYS[4], ARGV[1], ARGV[6])
  redis.call('EXPIRE', KEYS[4], tonumber(ARGV[4]))
  redis.call('HSET', KEYS[5], ARGV[1], ARGV[7] .. string.format('%d', math.floor(ww)) .. '}')
  redis.call('HSET', KEYS[6], ARGV[1], ARGV[7] .. string.format('%d', math.floor(aw)) .. '}')
  redis.call('EXPIRE', KEYS[5], tonumber(ARGV[5]))
end
return {1, delta, math.floor(ww), math.floor(aw)}
`;

// Atomic keep-best for one (zset, meta hash) board pair: compare, score write, meta write, and
// TTLs in ONE script so the sorted-set score and the meta row can never diverge (a non-atomic
// zscore -> zadd+hset lets a concurrent lower-scoring submit install its meta under the winner's
// score: wrong name, wrong lineup link). Shared by every plain keep-best board: anon daily,
// challenge, Factor Hunt, Blueprint (per-bp + combined), Surgeon. KEYS: 1=zset 2=meta hash.
// ARGV: 1=uid 2=sortScore 3=row JSON 4=ttl seconds. Returns 1 when written, 0 on no-improve.
// (Pure string — lives here, not in a server-only store, so the test fake keys eval() on this
// exact script and a dev harness can EVAL it against real Redis.)
export const KEEP_BEST_ROW_LUA = `
local prev = redis.call('ZSCORE', KEYS[1], ARGV[1])
if prev and tonumber(prev) >= tonumber(ARGV[2]) then return 0 end
redis.call('ZADD', KEYS[1], ARGV[2], ARGV[1])
redis.call('HSET', KEYS[2], ARGV[1], ARGV[3])
redis.call('EXPIRE', KEYS[1], ARGV[4])
redis.call('EXPIRE', KEYS[2], ARGV[4])
return 1
`;

// Cap a (zset, meta hash) board pair to the top ARGV[1] members, atomically removing the lowest
// scorers from BOTH structures (a zset-only trim would strand meta rows forever — the all-time
// board has no TTL, so orphans would accumulate unboundedly). O(1) ZCARD early-out makes calling
// this on every submit free until the cap is actually reached. Returns how many were evicted.
export const TRIM_BOARD_LUA = `
local n = redis.call('ZCARD', KEYS[1])
local cap = tonumber(ARGV[1])
if n <= cap then return 0 end
local doomed = redis.call('ZRANGE', KEYS[1], 0, n - cap - 1)
for i = 1, #doomed do
  redis.call('ZREM', KEYS[1], doomed[i])
  redis.call('HDEL', KEYS[2], doomed[i])
end
return #doomed
`;

// Owner-checked lock release (profileStore's results:lock): DEL only while the lock still holds
// this holder's token, so a holder that overran the TTL can't delete the NEXT holder's lock.
// KEYS: 1=lock. ARGV: 1=token. Returns 1 when released, 0 when the lock is gone or someone else's.
// (Pure string here for the same reason as the board scripts: the test fake keys eval() on it.)
export const RELEASE_LOCK_LUA = `
if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end
`;
