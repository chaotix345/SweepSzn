import type { LineupResult } from "./types";
import {
  FH_BONUS, FH_FACTOR_LABELS, canonicalFactor, fhSeedOk, buildFhChoices,
  encFhScore, decodeFhDisplay,
} from "./factorHunt";

let fail = 0;
const assert = (c: boolean, m: string) => { if (!c) { console.error("FAIL:", m); fail++; } else console.log("ok:", m); };

type F = LineupResult["factors"];
const f = (label: string, value: number, kind: "good" | "bad" = value >= 0 ? "good" : "bad") => ({ label, value, kind });

// --- canonicalization ---
assert(canonicalFactor("Usage overload (156% demand)") === "Usage overload", "parenthetical stripped");
assert(canonicalFactor("Spacing (2.0 shooters)") === "Spacing", "spacing detail stripped");
assert(canonicalFactor("Star offense") === "Star offense", "plain label unchanged");

// --- seed gate ---
assert(fhSeedOk("fh-2026-6-10"), "fh daily seed accepted");
assert(!fhSeedOk("fh-2026-06"), "truncated date rejected");
assert(!fhSeedOk("daily-2026-6-10"), "daily seed rejected");
assert(!fhSeedOk("fh-2026-6-10x"), "trailing junk rejected");

// --- worst mode: flawed lineup ---
const FLAWED: F = [
  f("Star offense", 17.2), f("Usage overload (156% demand)", -12.4),
  f("Star defense", 4.5), f("Spacing (1.0 shooters)", -1.8), f("No perimeter defender", -0.8),
];
{
  const c = buildFhChoices(FLAWED, "fh-2026-6-10")!;
  assert(c.ask === "worst", "negatives present -> ask worst");
  assert(c.answer === "Usage overload", "answer = highest-magnitude negative");
  assert(c.choices.length === 4, "exactly 4 choices");
  assert(c.choices.includes("Usage overload") && c.choices.includes("Spacing") && c.choices.includes("No perimeter defender"), "top-3 real negatives included");
  const decoy = c.choices.find((x) => !["Usage overload", "Spacing", "No perimeter defender"].includes(x))!;
  assert(!FLAWED.map((x) => canonicalFactor(x.label)).includes(decoy), "decoy absent from the lineup's real factors");
  assert((FH_FACTOR_LABELS as readonly string[]).includes(decoy), "decoy from the canonical pool");
}

// --- determinism: same factors + seed -> identical choices; different seed -> (eventually) different order ---
{
  const a = buildFhChoices(FLAWED, "fh-2026-6-10")!;
  const b = buildFhChoices(FLAWED, "fh-2026-6-10")!;
  assert(JSON.stringify(a) === JSON.stringify(b), "deterministic for same seed");
  let differs = false;
  for (let d = 1; d <= 9; d++) {
    const o = buildFhChoices(FLAWED, `fh-2026-6-${10 + d}`)!;
    if (JSON.stringify(o.choices) !== JSON.stringify(a.choices)) { differs = true; break; }
  }
  assert(differs, "different seeds shuffle differently");
}

// --- best-mode flip: dominant roster, no negatives ---
const CLEAN: F = [f("Star offense", 18.1), f("Star defense", 6.2), f("Spacing (3.1 shooters)", 2.4)];
{
  const c = buildFhChoices(CLEAN, "fh-2026-6-10")!;
  assert(c.ask === "best", "no negatives -> flip to best");
  assert(c.answer === "Star offense", "answer = biggest positive");
  assert(c.choices.length === 4, "still 4 choices");
  for (const real of ["Star offense", "Star defense", "Spacing"]) assert(c.choices.includes(real), `real positive ${real} included`);
}

// --- padding: only 1 negative -> decoys fill to 4 ---
{
  const c = buildFhChoices([f("Star offense", 15), f("Star defense", 3), f("Usage overload (120% demand)", -5)], "fh-2026-6-10")!;
  assert(c.ask === "worst" && c.answer === "Usage overload", "single negative is the answer");
  assert(c.choices.length === 4 && new Set(c.choices).size === 4, "padded to 4 unique choices");
}

// --- guards ---
assert(buildFhChoices([], "fh-2026-6-10") === null, "no factors -> null (caller falls back)");
{
  // negative Star defense (kind 'good' but value < 0) counts as a negative factor
  const c = buildFhChoices([f("Star offense", 12), f("Star defense", -2.5, "good"), f("Spacing (2.2 shooters)", 0.5)], "fh-2026-6-10")!;
  assert(c.ask === "worst" && c.answer === "Star defense", "sign decides negativity, not the kind tag");
}

// --- scoring: bonus path ---
assert(FH_BONUS === 1.05, "bonus is x1.05 (cosmetic)");
assert(decodeFhDisplay(encFhScore(70, 5, true)) === 73.5, "70 wins + bonus -> 73.5 display");
assert(decodeFhDisplay(encFhScore(70, 5, false)) === 70, "no bonus -> raw wins");
assert(encFhScore(70, 5, true) > encFhScore(70, 5, false), "bonus outranks same-wins no-bonus");
assert(encFhScore(70, 5, true) > encFhScore(73, 9, false), "70x1.05=73.5 outranks raw 73");
assert(encFhScore(74, -20, false) > encFhScore(70, 50, true), "raw 74 outranks 73.5 despite net");
assert(encFhScore(70, 8.4, false) > encFhScore(70, 8.1, false), "net breaks ties");
assert(decodeFhDisplay(encFhScore(82, 200, true)) === 86.1, "82x1.05 = 86.1 (clamped net can't bleed into wins)");
assert(decodeFhDisplay(encFhScore(0, -100, false)) === 0, "floor case decodes");

console.log(fail ? `\n${fail} FACTORHUNT ASSERTION(S) FAILED` : "\nALL FACTORHUNT CHECKS PASSED");
process.exit(fail ? 1 : 0);
