import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { lineupTerms } from "@/lib/engine";
import { PLAYERS, COEFF } from "./engineData";

// TS <-> Python lineup-penalty parity (engine v4 follow-up). The fixture holds real lineups with the
// penalties data/calib_lib.py computes (data/tests/test_penalty_parity.py keeps it honest on the
// Python side); calibrate.py's "fires only out of distribution" check is only meaningful if the engine
// charges exactly the same numbers.
const FIXTURE = path.join(process.cwd(), "..", "data", "tests", "fixtures", "penalty_parity.json");
interface Row { name: string; ids: string[]; overload: number; shortfall: number; rim: number; perim: number }
const rows: Row[] = JSON.parse(fs.readFileSync(FIXTURE, "utf-8"));
const byId = new Map(PLAYERS.map((p) => [p.id, p]));

describe("lineup penalties match calib_lib.py", () => {
  it("covers a real set of lineups", () => expect(rows.length).toBeGreaterThanOrEqual(15));
  it.each(rows.map((r) => [r.name, r] as const))("%s", (_name, r) => {
    const five = r.ids.map((id) => byId.get(id)!);
    expect(five.every(Boolean)).toBe(true);
    const t = lineupTerms(five, COEFF);
    expect(t.overloadPenalty).toBeCloseTo(r.overload, 6);
    expect(t.shortfallPenalty).toBeCloseTo(r.shortfall, 6);
    expect(t.rimAdj).toBeCloseTo(r.rim, 6);
    expect(t.perimAdj).toBeCloseTo(r.perim, 6);
  });
});
