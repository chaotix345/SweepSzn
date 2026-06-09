import { cleanName } from "./clean";

let fail = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("FAIL:", m); fail++; } else console.log("ok:", m); };

const RLO = String.fromCharCode(0x202e);   // right-to-left override
const ZW = String.fromCharCode(0x200b);    // zero-width space
const BOM = String.fromCharCode(0xfeff);   // BOM / ZWNBSP
const BELL = String.fromCharCode(0x07);    // C0 control
const ISO = String.fromCharCode(0x2066);   // directional isolate

assert(cleanName("  Charlie  ") === "Charlie", "trims surrounding whitespace");
assert(cleanName("x".repeat(40)) === "x".repeat(24), "caps at 24 chars");
assert(cleanName("Bob" + RLO + "evil") === "Bobevil", "strips RTL override");
assert(cleanName("zero" + ZW + "width") === "zerowidth", "strips zero-width space");
assert(cleanName("ctrl" + BELL + "bell") === "ctrlbell", "strips C0 control chars");
assert(cleanName(BOM + "LeBron") === "LeBron", "strips BOM/ZWNBSP");
assert(cleanName("a" + ISO + "b") === "ab", "strips directional isolates");
assert(cleanName("normal name") === "normal name", "leaves normal names intact");
assert(cleanName("Dončić") === "Dončić", "keeps accented letters (only control/bidi stripped)");
assert(cleanName(123 as unknown) === "", "non-string -> empty");
assert(cleanName(null) === "", "null -> empty");

console.log(fail ? `\n${fail} ASSERTION(S) FAILED` : "\nALL CLEAN CHECKS PASSED");
process.exit(fail ? 1 : 0);
