// Atomic keep-best for one bp board: compare, score write, meta write, and TTLs in ONE script so
// the sorted-set score and the meta row can never diverge (a non-atomic zadd{gt}+hset let a
// concurrent lower-scoring submit — e.g. a different blueprint racing onto the combined board —
// install its meta under the winner's score: wrong bp chip + wrong lineup link). KEYS: 1=zset
// 2=meta hash. ARGV: 1=uid 2=sortScore 3=row JSON 4=ttl seconds. Returns 1 when written.
// Import-free on purpose: the test Redis fake keys eval() on this exact string, and pulling it
// from blueprint.ts would drag the engine module into every route test's mock graph.
export const BP_KEEP_BEST_LUA = `
local prev = redis.call('ZSCORE', KEYS[1], ARGV[1])
if prev and tonumber(prev) >= tonumber(ARGV[2]) then return 0 end
redis.call('ZADD', KEYS[1], ARGV[2], ARGV[1])
redis.call('HSET', KEYS[2], ARGV[1], ARGV[3])
redis.call('EXPIRE', KEYS[1], ARGV[4])
redis.call('EXPIRE', KEYS[2], ARGV[4])
return 1
`;
