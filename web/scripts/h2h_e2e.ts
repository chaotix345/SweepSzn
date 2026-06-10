// Prod E2E for the H2H/Challenge feature. Pure fetch — builds VALID draft traces from prod's own
// /api/spin (same deployment + data the server replays in verifyTrace), then drives the real
// /api/challenge/submit. Usage: PROD_URL=https://… npx tsx scripts/h2h_e2e.ts
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

// Greedy most-constrained-first; `prefer` breaks ties by pts so two callers build different fives.
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
    used.add(pick.slots[0]);
    people.add(pick.c.person_id ?? pick.c.id);
    exclude.push(pick.c.id);
  }
  return used.size === 5 ? trace : null;
}

const idChars = "abcdefghijklmnopqrstuvwxyz0123456789";
const randId = () => Array.from({ length: 8 }, () => idChars[Math.floor(Math.random() * idChars.length)]).join("");
const lineupOf = (t: Step[]) => SLOTS.map((s) => t.find((x) => x.slot === s)!.pickedId).join(",");

async function post(body: unknown) {
  const r = await fetch(`${BASE}/api/challenge/submit`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw HTTP response; shape validated by assertions below
  let json: any = null; try { json = await r.json(); } catch {}
  return { status: r.status, json };
}

let fail = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("FAIL:", m); fail++; } else console.log("ok:", m); };

(async () => {
  console.log(`base: ${BASE}`);
  let id = "", creator: Step[] | null = null, responder: Step[] | null = null;
  for (let i = 0; i < 10 && !(creator && responder); i++) {
    const cand = randId();
    const seed = `h2h-${cand}`;
    const lo = await buildTrace(seed, "low");
    const hi = await buildTrace(seed, "high");
    if (lo && hi && lineupOf(lo) !== lineupOf(hi)) { id = cand; creator = lo; responder = hi; }
  }
  assert(!!(creator && responder), "built two distinct valid traces from /api/spin");
  if (!creator || !responder) { console.log(`\n${fail} FAILED`); process.exit(1); }
  console.log(`challenge id: ${id}`);
  console.log(`creator  lineup: ${lineupOf(creator)}`);
  console.log(`responder lineup: ${lineupOf(responder)}`);

  // 1) creator submit
  const c = await post({ id, uid: "h2htestcreator1", name: "E2E Creator", trace: creator });
  assert(c.status === 200, `creator submit 200 (got ${c.status} ${JSON.stringify(c.json)})`);
  assert(c.json?.role === "creator", `creator role (got ${c.json?.role})`);
  assert(c.json?.board?.total === 1, `board total 1 after creator (got ${c.json?.board?.total})`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw HTTP response; shape validated by assertion
  assert((c.json?.board?.top ?? []).every((row: any) => !("lineup" in row)), "creator board rows carry no lineup");

  // 2) responder submit
  const rsp = await post({ id, uid: "h2htestrespond2", name: "E2E Responder", trace: responder });
  assert(rsp.status === 200, `responder submit 200 (got ${rsp.status} ${JSON.stringify(rsp.json)})`);
  assert(rsp.json?.role === "responder", `responder role (got ${rsp.json?.role})`);
  assert(["win", "loss", "tie"].includes(rsp.json?.verdict?.outcome), `verdict present (got ${JSON.stringify(rsp.json?.verdict)})`);
  assert(rsp.json?.creator?.players?.length === 5, `creator five revealed to responder (got ${rsp.json?.creator?.players?.length})`);
  assert(rsp.json?.board?.total === 2, `board total 2 after responder (got ${rsp.json?.board?.total})`);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw HTTP response; shape validated by assertion
  assert((rsp.json?.board?.top ?? []).every((row: any) => !("lineup" in row)), "responder board rows carry no lineup");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- raw HTTP response; shape validated by assertion
  console.log(`verdict: responder ${rsp.json?.verdict?.outcome} (winsMargin ${rsp.json?.verdict?.winsMargin}, netMargin ${rsp.json?.verdict?.netMargin}); creator five = ${rsp.json?.creator?.players?.map((p: any) => p.name).join(", ")}`);

  // 3) creator re-submit stays creator (idempotent — no self-vs-self 'Dead heat')
  const re = await post({ id, uid: "h2htestcreator1", name: "E2E Creator", trace: creator });
  assert(re.json?.role === "creator", `creator re-submit stays creator (got ${re.json?.role})`);

  // 4) tampered trace rejected
  const bad = JSON.parse(JSON.stringify(creator)); bad[0].pickedId = "not_a_real_player_xyz";
  const t = await post({ id, uid: "h2htesttamper3", name: "T", trace: bad });
  assert(t.status === 400, `tampered trace rejected 400 (got ${t.status} ${JSON.stringify(t.json)})`);

  // 5) validation
  assert((await post({ id: "!!", uid: "h2htestcreator1", trace: creator })).status === 400, "bad challenge id -> 400");
  assert((await post({ id, uid: "x", trace: creator })).status === 400, "bad uid -> 400");

  // 6) landing page (redacted) + OG card
  const page = await fetch(`${BASE}/c/${id}`);
  const html = await page.text();
  assert(page.status === 200, `landing 200 (got ${page.status})`);
  assert(html.includes("been challenged") || html.includes("Can you beat"), "landing shows challenge framing");
  assert(!creator.some((s) => html.includes(s.pickedId)), "landing HTML leaks no creator player ids (redacted)");
  const og = await fetch(`${BASE}/c/${id}/opengraph-image`);
  assert(og.status === 200 && (og.headers.get("content-type") ?? "").includes("image"), `OG image 200 image/* (got ${og.status} ${og.headers.get("content-type")})`);

  console.log(fail ? `\n${fail} ASSERTION(S) FAILED` : "\nALL H2H PROD E2E CHECKS PASSED");
  console.log(`(test rows live under chal:${id} on prod Upstash; 31-day TTL, unguessable id)`);
  process.exit(fail ? 1 : 0);
})();
