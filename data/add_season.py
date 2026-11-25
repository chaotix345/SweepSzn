"""
Add one new season's cards to the committed draftable pool without touching any existing card
(W5, DESIGN.md §12). Replaces `build_dataset.py --write-pool` for season updates: that re-picks
every peak and would rename existing ids.

For each qualifying (player, franchise, 2020s) bucket in the new season:
  - no card yet                         -> new card, stamped `since: RELEASE`
  - beats the bucket's card (peak_score) -> new card with `since`; the old card stays in
                                            players.json unchanged except `until: RELEASE`
  - otherwise                           -> nothing
`since`/`until` hold a release key; web/lib/poolDate.ts maps it to the UTC date the release goes
live. Existing cards are never re-rated, re-smoothed or re-ordered; new cards are appended and
rated with the committed coefficients.json (no recalibration). Re-running is idempotent: cards
from an earlier run of the same release are dropped and rebuilt.

Needs data/raw for the new season and the MAX_GAP seasons before it (python data/scrape.py
2014 2026) and data/out/heights.json (python data/scrape_heights.py).

    python data/add_season.py
"""
import json
import os
import subprocess
import sys
from collections import defaultdict

from build_dataset import season_rows, season_index, pick_card, decade_of, slug
from fetch_rapm import normalize_name
from heights import load_heights
from rate_cards import rate_cards

PLAYERS = "web/public/data/players.json"
COEFF = "web/public/data/coefficients.json"
SEASON_YEAR = 2026
RELEASE = "2025-26"
HISTORY = 12  # seasons parsed before SEASON_YEAR: rating window (6) plus the smoothing tenure gate

CURRENT = set("ATL BOS BKN CHA CHI CLE DAL DEN DET GSW HOU IND LAC LAL MEM MIA MIL MIN NOP NYK OKC ORL "
              "PHI PHX POR SAC SAS TOR UTA WAS".split())
HIST = {"SEA": "OKC", "NJN": "BKN", "BRK": "BKN", "PHO": "PHX", "CHH": "CHA", "CHO": "CHA",
        "NOH": "NOP", "NOK": "NOP", "VAN": "MEM", "WSB": "WAS"}  # data/enrich_players.mjs's map, modern subset


def franchise(team):
    return team if team in CURRENT else HIST.get(team)


def strip_release(players, release):
    """Undo an earlier run of `release`: drop its cards, remove its `until` stamps."""
    out = []
    for p in players:
        if p.get("since") == release:
            continue
        if p.get("until") == release:
            p = {k: v for k, v in p.items() if k != "until"}
        out.append(p)
    return out


def plan_season(players, team_rows, year):
    """Pure. Returns (new raw cards with B-R team codes, {superseded card id: new card id}).

    `players` is the pool without this release; `team_rows` holds per-team season rows for `year` and
    earlier seasons (for smoothing). Only `year`'s rows can create cards."""
    decade = decade_of(year)
    live = {}
    person_by_name = {}
    for p in players:
        if "until" in p:
            continue
        live[(p["person_id"], p["team"], p["decade"])] = p
        person_by_name.setdefault(normalize_name(p["name"]), p["person_id"])
    season_idx, seasons_40g = season_index(team_rows)
    rows = defaultdict(list)
    for r in team_rows:
        if r["year"] == year:
            rows[(r["name"], r["team"])].append(r)
    new, superseded = [], {}
    for (name, team), seasons in sorted(rows.items()):
        fr = franchise(team)
        if fr is None:
            continue
        card = pick_card(name, team, decade, seasons, season_idx, seasons_40g)
        if card is None:
            continue
        # keep one person_id per real player even if B-R's spelling of the name moved
        card["person_id"] = person_by_name.get(normalize_name(name), card["person_id"])
        old = live.get((card["person_id"], fr, decade))
        if old is not None:
            if card["peak_score"] <= (old.get("peak_score") or 0):
                continue
            superseded[old["id"]] = card["id"]
        new.append(card)
    return new, superseded


def finish_cards(new, players, seasons, coeff, heights, enrich, release):
    """Eligibility + franchise (enrich), v4 ratings + height, person fame, then the `since` stamp."""
    fame = {}
    for p in players:
        fame[p["person_id"]] = max(fame.get(p["person_id"], 0.0), p.get("fame") or 0.0)
    cards = enrich(new)
    for c in cards:
        c["fame"] = fame.get(c["person_id"], 0.0)
    cards = rate_cards(cards, seasons, coeff, heights)
    for c in cards:
        c["since"] = release
    return cards


def apply_season(players, cards, superseded, release):
    """Existing cards keep their order and every byte except `until`; new cards are appended."""
    out = [dict(p, until=release) if p["id"] in superseded else p for p in players]
    ids = {p["id"] for p in out}
    clash = [c["id"] for c in cards if c["id"] in ids]
    assert not clash, f"new card ids collide with existing ids: {clash[:5]}"
    return out + cards


def node_enrich(cards):
    """Run data/enrich_players.mjs unchanged on just the new cards (82-0 meta by name, else the
    adjacency-from-pos fallback; B-R team code -> current franchise)."""
    tmp = "data/out/_new_cards.json"
    os.makedirs("data/out", exist_ok=True)
    json.dump(cards, open(tmp, "w", encoding="utf-8"))
    subprocess.run(["node", "data/enrich_players.mjs", tmp], check=True)
    out = json.load(open(tmp, encoding="utf-8"))
    assert len(out) == len(cards), "enrich collapsed new cards; buckets must be unique"
    order = {c["id"]: i for i, c in enumerate(cards)}
    return sorted(out, key=lambda c: order[c["id"]])


def main():
    sys.stdout.reconfigure(encoding="utf-8")
    raw = open(PLAYERS, encoding="utf-8").read()
    players = strip_release(json.loads(raw), RELEASE)
    coeff = json.load(open(COEFF, encoding="utf-8"))
    team_rows = []
    for y in range(SEASON_YEAR - HISTORY, SEASON_YEAR + 1):
        got = season_rows(y)
        if got is None:
            if y == SEASON_YEAR or y >= SEASON_YEAR - 6:
                sys.exit(f"missing data/raw for {y}: run python data/scrape.py {SEASON_YEAR - HISTORY} {SEASON_YEAR}")
            continue
        team_rows += got[2]
    new, superseded = plan_season(players, team_rows, SEASON_YEAR)
    cards = finish_cards(new, players, team_rows, coeff, load_heights(), node_enrich, RELEASE)
    out = apply_season(players, cards, superseded, RELEASE)
    open(PLAYERS, "w", encoding="utf-8").write(json.dumps(out))
    no_ht = [c["name"] for c in cards if c.get("ht") is None]
    print(f"{RELEASE}: {len(cards)} new cards ({len(cards) - len(superseded)} new buckets, "
          f"{len(superseded)} supersede an existing card); pool {len(players)} -> {len(out)}")
    if no_ht:
        print(f"no height for {len(no_ht)}: {', '.join(no_ht[:20])}")


if __name__ == "__main__":
    main()
