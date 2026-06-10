export {}; // module scope so top-level consts don't collide with the sibling h2h_e2e.ts global script
// Prod E2E for the notifications/re-engagement feature. Builds two valid traces from prod's own
// /api/spin, creates a challenge (creator A), has a friend (responder B) beat it, then asserts A's
// notification inbox got the flagship "your challenge got taken" ping — plus mark-read, no double-fire
// on a non-improving resubmit, no cross-uid leak, and push self-disable.
// Usage: PROD_URL=https://… npx tsx scripts/notif_e2e.ts
// Requires: PROD_URL env var (or pass base URL as first CLI arg). Skips cleanly when absent.
const BASE: string = process.env.PROD_URL ?? process.argv[2] ?? "";
if (!BASE) { console.log("skipped: PROD_URL is not set"); process.exit(0); }

const SLOTS = ["PG", "SG", "SF", "PF", "C"] as const;
type Step = { slot: string; pickedId: string; respins: never[] };

async function spin(seed: string, round: number, exclude: string[]) {
  const r = await fetch(`${BASE}/api/spin`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ seed, round, exclude }),
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw HTTP response; shape validated by assertions below
  return r.json() as Promise<{ team: string; decade: string; candidates: any[] }>;
}

async function buildTrace(seed: string, prefer: "high" | "low"): Promise<Step[] | null> {
  const exclude: string[] = [];
  const used = new Set<string>();
  const people = new Set<string>();
  const trace: Step[] = [];
  for (let r = 0; r < 5; r++) {
    const { candidates } = await spin(seed, r, exclude);
    const cands = (candidates ?? [])
      .map((c) => ({ c, slots: (c.eligible ?? []).filter((s: string) => !used.has(s)) }))
      .filter((x) => x.slots.length > 0 && !people.has(x.c.person_id ?? x.c.id));
    if (!cands.length) return null;
    cands.sort((a, b) =>
      a.slots.length - b.slots.length ||
      (prefer === "high" ? (b.c.pts ?? 0) - (a.c.pts ?? 0) : (a.c.pts ?? 0) - (b.c.pts ?? 0)),
    );
    const pick = cands[0];
    trace.push({ slot: pick.slots[0], pickedId: pick.c.id, respins: [] });
    used.add(pick.slots[0]); people.add(pick.c.person_id ?? pick.c.id); exclude.push(pick.c.id);
  }
  return used.size === 5 ? trace : null;
}

const idChars = "abcdefghijklmnopqrstuvwxyz0123456789";
const randId = () => Array.from({ length: 8 }, () => idChars[Math.floor(Math.random() * idChars.length)]).join("");
const lineupOf = (t: Step[]) => SLOTS.map((s) => t.find((x) => x.slot === s)!.pickedId).join(",");

async function submit(body: unknown) {
  const r = await fetch(`${BASE}/api/challenge/submit`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw HTTP response; shape validated by assertions below
  let json: any = null; try { json = await r.json(); } catch {}
  return { status: r.status, json };
}
async function inbox(uid: string) {
  const r = await fetch(`${BASE}/api/notifications?uid=${encodeURIComponent(uid)}`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw HTTP response; shape validated by assertions below
  let json: any = null; try { json = await r.json(); } catch {}
  return { status: r.status, json };
}

let fail = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("FAIL:", m); fail++; } else console.log("ok:", m); };

(async () => {
  console.log(`base: ${BASE}`);
  const A = "notiftestcreator" + randId().slice(0, 4);
  const B = "notiftestfriend" + randId().slice(0, 4);
  const friendName = "Sam E2E";

  let id = "", creator: Step[] | null = null, responder: Step[] | null = null;
  for (let i = 0; i < 12 && !(creator && responder); i++) {
    const cand = randId(); const seed = `h2h-${cand}`;
    const lo = await buildTrace(seed, "low"); const hi = await buildTrace(seed, "high");
    if (lo && hi && lineupOf(lo) !== lineupOf(hi)) { id = cand; creator = lo; responder = hi; }
  }
  assert(!!(creator && responder), "built two distinct valid traces from /api/spin");
  if (!creator || !responder) { console.log(`\n${fail} FAILED`); process.exit(1); }
  console.log(`challenge id: ${id} | creator uid ${A} | friend uid ${B}`);

  // notifications must be live (Redis present on prod)
  const pre = await inbox(A);
  assert(pre.status === 200, `notifications endpoint live (got ${pre.status} — 503 means Redis/feature not configured)`);
  assert((pre.json?.items?.length ?? 0) === 0, "fresh creator uid starts with an empty inbox");

  // 1) creator creates the challenge
  const c = await submit({ id, uid: A, name: "E2E Creator", trace: creator });
  assert(c.status === 200 && c.json?.role === "creator", `creator submit (got ${c.status} ${c.json?.role})`);

  // 2) friend responds (and likely beats the low-pts creator) -> should enqueue a notification to A
  const rsp = await submit({ id, uid: B, name: friendName, trace: responder });
  assert(rsp.status === 200 && rsp.json?.role === "responder", `responder submit (got ${rsp.status} ${rsp.json?.role})`);
  console.log(`verdict (responder vs creator): ${rsp.json?.verdict?.outcome}`);

  // give after() a moment to flush the post-response write
  await new Promise((res) => setTimeout(res, 1500));

  // 3) the flagship: A's inbox has the ping
  const a1 = await inbox(A);
  const items = a1.json?.items ?? [];
  assert(items.length >= 1, `creator inbox has >=1 notification (got ${items.length})`);
  const n = items[0];
  assert(n?.type === "challenge_response", `notification type challenge_response (got ${n?.type})`);
  assert(n?.challengeId === id, `notification carries the challenge id (got ${n?.challengeId})`);
  assert(n?.opponent === friendName, `notification names the responder (got ${n?.opponent})`);
  assert(["beaten", "held", "tied"].includes(n?.outcome), `notification outcome valid (got ${n?.outcome})`);
  assert(typeof n?.oppWins === "number" && typeof n?.yourWins === "number", "notification carries both records");
  assert((a1.json?.unread ?? 0) >= 1, `unread count >=1 before reading (got ${a1.json?.unread})`);
  assert(!("uid" in (n ?? {})) && !("lineup" in (n ?? {})), "notification leaks no uid or lineup");
  console.log(`notification: "${n?.opponent} ${n?.outcome} ${n?.yourWins}-${n?.yourLosses}" (they went ${n?.oppWins}-${n?.oppLosses}, tookLead=${n?.tookLead})`);

  // 4) no double-fire: friend resubmits the SAME trace (not an improvement) -> no new notification
  const reN = items.length;
  const re = await submit({ id, uid: B, name: friendName, trace: responder });
  assert(re.status === 200, `friend resubmit ok (got ${re.status})`);
  await new Promise((res) => setTimeout(res, 1200));
  const a2 = await inbox(A);
  assert((a2.json?.items?.length ?? 0) === reN, `non-improving resubmit adds NO new notification (was ${reN}, now ${a2.json?.items?.length})`);

  // 5) mark read -> unread 0, items retained
  const mr = await fetch(`${BASE}/api/notifications/read`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ uid: A }) });
  assert(mr.status === 200, `mark-read 200 (got ${mr.status})`);
  await new Promise((res) => setTimeout(res, 500));
  const a3 = await inbox(A);
  assert((a3.json?.unread ?? -1) === 0, `unread is 0 after mark-read (got ${a3.json?.unread})`);
  assert((a3.json?.items?.length ?? 0) >= 1, "items are retained after mark-read");

  // 6) no cross-uid leak: a different uid sees nothing of A's
  const other = await inbox("notiftestother" + randId().slice(0, 4));
  assert((other.json?.items?.length ?? 0) === 0, "a different uid sees an empty inbox (no cross-leak)");

  // 7) validation + push self-disable
  const badUid = await inbox("x");
  assert(badUid.status === 400, `bad uid -> 400 (got ${badUid.status})`);
  const pushSub = await fetch(`${BASE}/api/push/subscribe`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ uid: A, subscription: { endpoint: "https://example.com/x", keys: { p256dh: "a", auth: "b" } } }) });
  assert([200, 503].includes(pushSub.status), `push subscribe is 503 (VAPID unset) or 200 (VAPID set) — got ${pushSub.status}`);
  console.log(`push subscribe -> ${pushSub.status} (${pushSub.status === 503 ? "self-disabled; set VAPID env to enable" : "VAPID configured + live"})`);

  console.log(fail ? `\n${fail} ASSERTION(S) FAILED` : "\nALL NOTIFICATION PROD E2E CHECKS PASSED");
  console.log(`(test rows live under chal:${id} + notif:${A} on prod Upstash; 31-day TTL, unguessable ids)`);
  process.exit(fail ? 1 : 0);
})();
