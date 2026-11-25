import copy
import hashlib
import json
import os
from collections import Counter

from add_season import plan_season, finish_cards, apply_season, strip_release, RELEASE

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
# sha256 of web/public/data/players.json before the 2025-26 release (commit 80a4a1a)
PRE_RELEASE_SHA256 = "b6032e073a637cbbcb29a5424863b738eccbeadeec32d18f6baa1c8c740e0704"

COEFF = {
    "zCap": 3.3,
    "offModel": {"intercept": 0.0, "pts": 1.0, "ast": 0.0, "ts": 0.0},
    "defModelEst": {"intercept": 0.0, "dws": 10.0},
    "defEstCap": 5.5, "dwsShrinkK": 40, "leagueDwsMean": 0.02,
    "cardModel": {"decay": 0.7, "prior_k": 0.0, "prior_off": [0.0, 0.0], "prior_def": [0.0, 0.0],
                  "off_w": {"obpm": 1.0}, "def_w": {"dbpm": 1.0}},
}


def row(name, team, year, vorp, g=70, mp=32.0, obpm=1.0, dbpm=0.5, age=25):
    return {"name": name, "year": year, "decade": f"{((year - 1) // 10) * 10}s", "tier": "complete", "team": team,
            "pos": "SF", "age": age, "g": g, "mp": mp, "pts": 20.0, "obpm": obpm, "dbpm": dbpm, "bpm": obpm + dbpm,
            "vorp": vorp, "usg": 22.0, "dws": 3.0, "z": {"pts": 1.0}}


def card(cid, name, person, team, year, peak, **extra):
    c = {"name": name, "year": year, "decade": "2020s", "team": team, "pos": "SF", "z": {"pts": 1.0},
         "person_id": person, "id": cid, "peak_score": peak, "eligible": ["SF"], "fame": 4.5,
         "off_rating": 1.0, "def_rating": 0.5, "ht": 80}
    c.update(extra)
    return c


def pool():
    return [card("a_guy_pho_2020s_2024", "A Guy", "a_guy", "PHX", 2024, 3.0),
            card("b_guy_bos_2020s_2022", "B Guy", "b_guy", "BOS", 2022, 5.0),
            card("c_guy_mia_2020s_2021", "C Guy", "c_guy", "MIA", 2021, 1.0)]


def seasons():
    return [row("A Guy", "PHO", 2025, 2.0), row("A Guy", "PHO", 2026, 4.0),     # beats 3.0 -> supersede
            row("B Guy", "BOS", 2026, 4.9),                                      # below 5.0 -> nothing
            row("C Guy", "BRK", 2026, 0.5),                                      # new franchise -> new card
            row("D Rookie", "CHO", 2026, 0.2, age=20),                           # new person -> new card
            row("E Bench", "LAL", 2026, 3.0, mp=12.0),                           # not a rotation player
            row("F Short", "LAL", 2026, 3.0, g=10)]                              # too few games


def test_plan_supersedes_only_when_the_new_season_beats_the_bucket():
    new, superseded = plan_season(pool(), seasons(), 2026)
    assert superseded == {"a_guy_pho_2020s_2024": "a_guy_pho_2020s_2026"}
    assert sorted(c["id"] for c in new) == ["a_guy_pho_2020s_2026", "c_guy_brk_2020s_2026", "d_rookie_cho_2020s_2026"]
    assert all(c["year"] == 2026 and c["decade"] == "2020s" for c in new)


def test_plan_ignores_cards_already_superseded_and_keeps_person_ids_across_spellings():
    players = pool() + [card("a_guy_pho_2020s_2020", "A Guy", "a_guy", "PHX", 2020, 9.0, until="older")]
    assert plan_season(players, seasons(), 2026)[1] == {"a_guy_pho_2020s_2024": "a_guy_pho_2020s_2026"}
    accented = [dict(r, name="C Gúy") if r["name"] == "C Guy" else r for r in seasons()]
    c = next(c for c in plan_season(pool(), accented, 2026)[0] if c["team"] == "BRK")
    assert c["person_id"] == "c_guy"


def enrich(cards):
    fr = {"PHO": "PHX", "BRK": "BKN", "CHO": "CHA"}
    return [dict(c, team=fr.get(c["team"], c["team"]), eligible=["SF", "PF"]) for c in cards]


def test_existing_cards_are_untouched_except_until_and_new_cards_append():
    players = pool()
    before = [json.dumps(p) for p in players]
    new, superseded = plan_season(players, seasons(), 2026)
    cards = finish_cards(new, players, seasons(), COEFF, None, enrich, RELEASE)
    out = apply_season(players, cards, superseded, RELEASE)
    assert [json.dumps(p) for p in players] == before  # inputs not mutated
    assert len(out) == len(players) + 3
    for b, a in zip(players, out):
        assert {k: v for k, v in a.items() if k != "until"} == b
        assert json.dumps({k: v for k, v in a.items() if k != "until"}) == json.dumps(b)
        assert ("until" in a) == (b["id"] in superseded)
    assert out[0]["until"] == RELEASE
    for c in out[len(players):]:
        assert c["since"] == RELEASE and c["team"] in ("PHX", "BKN", "CHA") and c["eligible"] == ["SF", "PF"]
        assert isinstance(c["off_rating"], float) and isinstance(c["def_rating"], float)
    fame = {c["person_id"]: c["fame"] for c in out[len(players):]}
    assert fame == {"a_guy": 4.5, "c_guy": 4.5, "d_rookie": 0.0}


def test_rerun_is_idempotent():
    players = pool()
    new, superseded = plan_season(players, seasons(), 2026)
    out = apply_season(players, finish_cards(new, players, seasons(), COEFF, None, enrich, RELEASE), superseded, RELEASE)
    again = strip_release(copy.deepcopy(out), RELEASE)
    assert again == players
    new2, sup2 = plan_season(again, seasons(), 2026)
    assert sup2 == superseded and [c["id"] for c in new2] == [c["id"] for c in new]


def test_apply_refuses_an_id_collision():
    players = pool()
    clash = [dict(players[1], since=RELEASE)]
    try:
        apply_season(players, clash, {}, RELEASE)
    except AssertionError:
        return
    raise AssertionError("expected a collision assert")


def committed():
    raw = open(os.path.join(ROOT, "web", "public", "data", "players.json"), encoding="utf-8").read()
    return json.loads(raw), raw


def test_committed_pool_keeps_every_pre_release_card_byte_identical():
    players, raw = committed()
    assert json.dumps(players) == raw  # json.dumps default separators, like rate_cards.py
    old = [{k: v for k, v in p.items() if k != "until"} for p in players if "since" not in p]
    assert hashlib.sha256(json.dumps(old).encode("utf-8")).hexdigest() == PRE_RELEASE_SHA256
    # new cards only ever come after the old ones, so old-pool iteration order is unchanged
    first_new = next((i for i, p in enumerate(players) if "since" in p), len(players))
    assert all("since" in p for p in players[first_new:])


def test_committed_release_cards_are_consistent():
    players, _ = committed()
    ids = Counter(p["id"] for p in players)
    assert max(ids.values()) == 1
    new = [p for p in players if p.get("since") == RELEASE]
    assert new, "the 2025-26 release has no cards"
    live = {(p["person_id"], p["team"], p["decade"]) for p in players if "until" not in p}
    assert len(live) == sum(1 for p in players if "until" not in p)  # one live card per bucket
    by_bucket = {(p["person_id"], p["team"], p["decade"]): p for p in new}
    for p in new:
        assert p["year"] == 2026 and p["decade"] == "2020s" and p["eligible"] and p["off_rating"] is not None
    for p in players:
        if "until" in p:
            assert p["until"] == RELEASE and "since" not in p
            succ = by_bucket[(p["person_id"], p["team"], p["decade"])]
            assert succ["peak_score"] > p["peak_score"]
