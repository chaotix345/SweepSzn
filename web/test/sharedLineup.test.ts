import { describe, it, expect } from "vitest";
import { resolveSharedLineup } from "@/lib/sharedLineup";
import { encodeLineup } from "@/lib/share";

const FIVE = [
  "michael_jordan_chi_1980s_1988",
  "lebron_james_cle_2000s_2009",
  "david_robinson_sas_1990s_1994",
  "nikola_joki_den_2020s_2024",
  "kevin_garnett_min_2000s_2004",
];

describe("resolveSharedLineup — decode + evaluate a shared lineup segment", () => {
  it("resolves a valid 5-player segment into players + result", () => {
    const out = resolveSharedLineup(encodeLineup(FIVE))!;
    expect(out).not.toBeNull();
    expect(out.players).toHaveLength(5);
    expect(out.players.map((p) => p.id)).toEqual(FIVE);
    expect(typeof out.result.wins).toBe("number");
    expect(typeof out.result.ortg).toBe("number");
    expect(out.hinted).toBe(false);
    expect(out.prime).toBe(false);
    expect(out.blueprint).toBeNull();
  });

  it("carries the hint stamp", () => {
    const out = resolveSharedLineup(encodeLineup(FIVE, true))!;
    expect(out.hinted).toBe(true);
  });

  it("rejects a segment without exactly 5 distinct ids", () => {
    expect(resolveSharedLineup(encodeLineup(FIVE.slice(0, 4)))).toBeNull();
    expect(resolveSharedLineup(encodeLineup([FIVE[0], FIVE[0], FIVE[1], FIVE[2], FIVE[3]]))).toBeNull();
  });

  it("rejects a segment with an unknown player id", () => {
    expect(resolveSharedLineup(encodeLineup([...FIVE.slice(0, 4), "nobody_unknown_xyz_0000"]))).toBeNull();
  });
});
