import { encScore, decodeWins, computeDelta } from "./score";

let fail = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("FAIL:", m); fail++; } else console.log("ok:", m); };

// encScore / decodeWins round-trip: wins always recoverable across the realistic net range
for (const wins of [0, 41, 60, 78, 82]) {
  for (const net of [-30.4, -100, 0, 8.3, 23.4, 50, 200]) {
    assert(decodeWins(encScore(wins, net)) === wins, `decodeWins(encScore(${wins}, ${net})) === ${wins}`);
  }
}
// wins dominate; net breaks ties
assert(encScore(70, 5) > encScore(69, 99), "more wins always outscores fewer (despite net)");
assert(encScore(70, 8.4) > encScore(70, 8.1), "equal wins -> higher net wins");

// computeDelta: the keep-best + win-delta decision
const s = encScore; // brevity
assert(JSON.stringify(computeDelta(null, s(50, 5), 50)) === JSON.stringify({ changed: true, delta: 50 }), "first submit -> credit all wins");
assert(JSON.stringify(computeDelta(s(50, 5), s(55, 5), 55)) === JSON.stringify({ changed: true, delta: 5 }), "improvement -> credit only the win delta");
assert(JSON.stringify(computeDelta(s(55, 5), s(55, 5), 55)) === JSON.stringify({ changed: false, delta: 0 }), "re-submit same -> no-op");
assert(JSON.stringify(computeDelta(s(55, 5), s(52, 9), 52)) === JSON.stringify({ changed: false, delta: 0 }), "worse score -> no-op");
assert(JSON.stringify(computeDelta(s(55, 5.0), s(55, 9.0), 55)) === JSON.stringify({ changed: true, delta: 0 }), "net-only improvement -> daily changes, 0 win delta");

// Multi-day accumulation walk-through: day1 70 then 75; day2 (fresh key) 60.
// weekly/all-time = sum of credited deltas: 70 + 5 + 60 = 135.
let weekly = 0;
weekly += computeDelta(null, s(70, 4), 70).delta;        // day1 first: +70
weekly += computeDelta(s(70, 4), s(75, 6), 75).delta;    // day1 improve: +5
weekly += computeDelta(s(75, 6), s(72, 9), 72).delta;    // day1 worse: +0
weekly += computeDelta(null, s(60, 2), 60).delta;        // day2 fresh key: +60
assert(weekly === 135, "weekly sum across a multi-day walk-through is correct (135)");

console.log(fail ? `\n${fail} SCORE ASSERTION(S) FAILED` : "\nALL SCORE CHECKS PASSED");
process.exit(fail ? 1 : 0);
