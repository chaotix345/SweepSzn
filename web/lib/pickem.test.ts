import {
  PICKEM_THRESHOLD, pickemSeedOk, parseVote, pickemVerdict, pickemShareLine,
  encodePickemCard, decodePickemCard,
} from "./pickem";

let fail = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("FAIL:", m); fail++; } else console.log("ok:", m); };

// --- seed gate (vote API must not mint arbitrary Redis keys) ---
assert(pickemSeedOk("daily-2026-6-10"), "daily seed accepted");
assert(pickemSeedOk("classic-123456789"), "classic seed accepted");
assert(pickemSeedOk("hoopiq-42"), "hoopiq seed accepted");
assert(!pickemSeedOk("h2h-abc123"), "challenge seed rejected");
assert(!pickemSeedOk("prime-123"), "unknown prefix rejected");
assert(!pickemSeedOk("daily-"), "empty suffix rejected");
assert(!pickemSeedOk("DAILY-2026-6-10"), "uppercase rejected (seeds are lowercase)");
assert(!pickemSeedOk(`classic-${"9".repeat(41)}`), "over-long suffix rejected");
assert(!pickemSeedOk("daily-2026_6_10"), "bad charset rejected");
assert(!pickemSeedOk(42), "non-string rejected");

// --- vote parsing ---
assert(parseVote("y") === "y" && parseVote("n") === "n", "y/n parse");
assert(parseVote("Y") === null && parseVote("yes") === null && parseVote(1) === null && parseVote(null) === null, "junk votes rejected");

// --- verdict: threshold boundary ("more than 60") ---
assert(PICKEM_THRESHOLD === 60, "threshold is 60 (calibrated for crowd error)");
assert(!pickemVerdict(60, { y: 5, n: 1, vote: null }).hit, "exactly 60 wins does NOT crack 60");
assert(pickemVerdict(61, { y: 5, n: 1, vote: null }).hit, "61 wins cracks 60");

// --- verdict: crowd math ---
{
  const v = pickemVerdict(67, { y: 73, n: 27, vote: null });
  assert(v.crowd === "y" && v.pct === 73, "majority yes at 73%");
  assert(v.crowdRight === true, "crowd right when yes-majority and 67 wins");
  assert(v.youRight === null, "no vote -> youRight null");
}
{
  const v = pickemVerdict(45, { y: 68, n: 32, vote: "n" });
  assert(v.crowdRight === false, "crowd wrong when yes-majority but 45 wins");
  assert(v.youRight === true && v.defied, "voting no against a yes-majority and flopping = defied");
}
{
  const v = pickemVerdict(67, { y: 32, n: 68, vote: "y" });
  assert(v.defied && v.pct === 68, "yes vote against a no-majority that hit = defied at 68%");
}
{
  const v = pickemVerdict(67, { y: 70, n: 30, vote: "y" });
  assert(!v.defied && v.youRight === true, "voting WITH the majority is never defied");
}
{
  const v = pickemVerdict(67, { y: 30, n: 70, vote: "y" });
  assert(v.defied === true, "defied requires being right");
  const w = pickemVerdict(45, { y: 30, n: 70, vote: "y" });
  assert(w.defied === false && w.youRight === false, "wrong against the majority is not defied");
}
assert(pickemVerdict(67, { y: 0, n: 0, vote: null }).crowd === null, "no votes -> no crowd");
assert(pickemVerdict(67, { y: 4, n: 4, vote: "y" }).crowd === null, "tie -> no crowd");
assert(pickemVerdict(67, { y: 4, n: 4, vote: "y" }).crowdRight === null, "tie -> crowdRight null");
{
  const v = pickemVerdict(67, { y: 1, n: 0, vote: "y" });
  assert(v.solo && !v.defied, "your own vote alone is a self-prediction (solo), never defied");
}
assert(!pickemVerdict(67, { y: 50, n: 50, vote: null }).solo, "solo requires a vote");
assert(pickemVerdict(67, { y: -3, n: 2, vote: null }).total === 2, "negative counts clamped");

// --- share line: only the defy story rewrites share text ---
{
  const line = pickemShareLine(67, 15, { y: 32, n: 68, vote: "y" }, "the 1970s Knicks");
  assert(line === "I defied the crowd — 67-15 on the 1970s Knicks when 68% said they'd flop.", `defied-hit share line (got: ${line})`);
}
{
  const line = pickemShareLine(45, 37, { y: 68, n: 32, vote: "n" }, "the 2000s Lakers");
  assert(line === "I called the flop — 45-37 on the 2000s Lakers when 68% said 60+ wins was a lock.", `defied-miss share line (got: ${line})`);
}
assert(pickemShareLine(67, 15, { y: 32, n: 68, vote: "y" }, null) === "I defied the crowd — 67-15 on today's spin when 68% said they'd flop.", "null subject falls back");
assert(pickemShareLine(67, 15, { y: 70, n: 30, vote: "y" }, "x") === null, "with-the-crowd -> standard share text");
assert(pickemShareLine(67, 15, { y: 0, n: 0, vote: "y" }, "x") === null, "solo vote -> standard share text");
assert(pickemShareLine(67, 15, { y: 30, n: 70, vote: null }, "x") === null, "no vote -> standard share text");

// --- /pe/<card> encode/decode round-trip ---
const LU = "a1,b2,c3,d4,e5";
{
  const enc = encodePickemCard(LU, { y: 73, n: 27, vote: "y" });
  assert(enc === `73.27.y.${LU}`, "card encoding shape");
  const dec = decodePickemCard(enc);
  assert(!!dec && dec.lineup === LU && dec.view.y === 73 && dec.view.n === 27 && dec.view.vote === "y", "round-trip");
}
{
  const dec = decodePickemCard(encodePickemCard(`h~${LU}`, { y: 0, n: 0, vote: null }));
  assert(!!dec && dec.lineup === `h~${LU}` && dec.view.vote === null, "hinted lineup + skipped vote round-trip");
}
assert(decodePickemCard(encodeURIComponent(`1.2.n.${LU}`)) !== null, "still-URL-encoded segment tolerated");
assert(decodePickemCard(`1.2.n.${LU}.extra`) === null, "wrong part count rejected");
assert(decodePickemCard(`1.2.z.${LU}`) === null, "bad vote flag rejected");
assert(decodePickemCard(`-1.2.y.${LU}`) === null, "negative count rejected");
assert(decodePickemCard(`1.5.2.y.${LU}`) === null, "non-integer count rejected (extra dot also breaks shape)");
assert(decodePickemCard(`${"9".repeat(12)}.2.y.${LU}`) === null, "absurd count rejected");
assert(decodePickemCard("1.2.y.a1,b2,c3,d4") === null, "4-player lineup rejected");
assert(decodePickemCard("1.2.y.a1;b2,c3,d4,e5") === null, "bad lineup charset rejected");
assert(decodePickemCard("") === null, "empty segment rejected");

console.log(fail ? `\n${fail} PICKEM ASSERTION(S) FAILED` : "\nALL PICKEM CHECKS PASSED");
process.exit(fail ? 1 : 0);
