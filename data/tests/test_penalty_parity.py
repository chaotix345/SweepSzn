"""
TS <-> Python lineup-penalty parity (engine v4 follow-up, notes/review.md).

calibrate.py proves the reasoned penalties stay ~0 on real teams with data/calib_lib.py's
lineup_penalties; the game charges them with web/lib/engine.ts lineupTerms. Both must agree, or the
"fires only out of distribution" guarantee would be about a different function than the one players
see. fixtures/penalty_parity.json holds real lineups and the Python values; this test checks Python
still produces them and web/test/penaltyParity.test.ts checks the engine produces the same numbers.

Regenerate after an intentional change:  python data/tests/test_penalty_parity.py --write
"""
import json
import os
import re
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from calib_lib import lineup_penalties  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
FIXTURE = os.path.join(os.path.dirname(__file__), "fixtures", "penalty_parity.json")
KEYS = ("overload", "shortfall", "rim", "perim")

# Extra fives beyond the stress panel: the best draftable five, all-time scorers (overload), five
# centers (no perimeter), five small guards (frontcourt floor, no size) and 2025-26 cards.
EXTRA = {
    "best draftable five": ["john_stockton_uta_1980s_1989", "lebron_james_cle_2000s_2009", "andrei_kirilenko_uta_2000s_2004",
                            "magic_johnson_lal_1980s_1990", "nikola_joki_den_2020s_2024"],
    "pre-1978 bigs (usage model)": ["wilt_chamberlain_sfw_1960s_1963", "elvin_hayes_wsb_1970s_1975",
                                    "dave_bing_wsb_1970s_1976", "calvin_murphy_hou_1970s_1974", "john_stockton_uta_1980s_1989"],
    "2025-26 cards": ["luka_don_i_lal_2020s_2026", "tyrese_maxey_phi_2020s_2026", "kawhi_leonard_lac_2020s_2026",
                      "cooper_flagg_dal_2020s_2026", "victor_wembanyama_sas_2020s_2026"],
}


def load():
    players = {p["id"]: p for p in json.load(open(os.path.join(ROOT, "web", "public", "data", "players.json"), encoding="utf-8"))}
    coeff = json.load(open(os.path.join(ROOT, "web", "public", "data", "coefficients.json"), encoding="utf-8"))
    return players, coeff


def stress_panel():
    src = open(os.path.join(ROOT, "web", "lib", "stressPanel.ts"), encoding="utf-8").read()
    return {f"stress: {key}": re.findall(r'"([a-z0-9_]+)"', ids)
            for key, ids in re.findall(r'key:\s*"([^"]+)".*?ids:\s*\[([^\]]*)\]', src, re.S)}


def extremes(players):
    pool = [p for p in players.values() if p["year"] >= 1985 and p.get("usg") is not None and p.get("ht") and "until" not in p]
    def top(pred, key):
        seen, out = set(), []
        for p in sorted(filter(pred, pool), key=key):
            if p["person_id"] not in seen:
                seen.add(p["person_id"]); out.append(p["id"])
            if len(out) == 5:
                return out
    return {"five highest-usage": top(lambda p: True, lambda p: (-p["usg"], p["id"])),
            "five centers": top(lambda p: p["pos"] == "C", lambda p: (-(p.get("blk") or 0), p["id"])),
            "five smallest guards": top(lambda p: p["pos"] in ("PG", "SG"), lambda p: (p["ht"], p["id"]))}


def compute(players, coeff, lineups):
    out = []
    for name, ids in lineups.items():
        pen = lineup_penalties([players[i] for i in ids], coeff)
        out.append({"name": name, "ids": ids, **{k: round(pen[k], 9) for k in KEYS}})
    return out


def build():
    players, coeff = load()
    lineups = {**stress_panel(), **EXTRA, **extremes(players)}
    return compute(players, coeff, lineups)


def test_fixture_covers_every_penalty():
    rows = json.load(open(FIXTURE, encoding="utf-8"))
    assert len(rows) >= 15
    for k in KEYS:
        assert any(r[k] > 0 for r in rows), f"no fixture lineup exercises {k}"
    assert any(all(r[k] == 0 for k in KEYS) for r in rows)


def test_python_penalties_match_the_shared_fixture():
    players, coeff = load()
    rows = json.load(open(FIXTURE, encoding="utf-8"))
    got = compute(players, coeff, {r["name"]: r["ids"] for r in rows})
    for want, have in zip(rows, got):
        for k in KEYS:
            assert abs(want[k] - have[k]) < 1e-6, (want["name"], k, want[k], have[k])


if __name__ == "__main__" and "--write" in sys.argv:
    os.makedirs(os.path.dirname(FIXTURE), exist_ok=True)
    rows = build()
    json.dump(rows, open(FIXTURE, "w", encoding="utf-8"), indent=1)
    print(f"wrote {len(rows)} lineups -> {FIXTURE}")
